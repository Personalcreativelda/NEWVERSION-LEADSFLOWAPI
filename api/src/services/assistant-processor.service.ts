// Processador de mensagens dos assistentes de IA
// Intercepta mensagens recebidas e responde automaticamente usando IA
import { query } from '../database/connection';
import { AIService, type AIMessage, type AIProvider } from './ai.service';
import { AssistantsService } from './assistants.service';
import { WhatsAppService } from './whatsapp.service';

const aiService = new AIService();
const assistantsService = new AssistantsService();
const whatsappService = new WhatsAppService();

export interface IncomingMessageContext {
    channelId: string;
    channelType: string;
    conversationId: string;
    userId: string;           // dono do canal
    contactPhone?: string;
    contactName?: string;
    messageContent: string;
    credentials?: any;        // credenciais do canal (instance_id, etc.)
}

export class AssistantProcessorService {
    /**
     * Processa mensagem recebida - verifica se há assistente ativo e responde
     * Retorna true se o assistente respondeu, false se não há assistente ativo
     */
    async processIncomingMessage(ctx: IncomingMessageContext): Promise<boolean> {
        try {
            // 1. Verificar se há assistente ativo para este canal
            const activeAssistant = await this.findActiveAssistantForChannel(ctx.channelId, ctx.userId);
            if (!activeAssistant) {
                return false;
            }

            console.log(`[AssistantProcessor] Assistente "${activeAssistant.assistant_name}" ativo para canal ${ctx.channelId}`);

            // 2. Verificar configuração de IA (API key e provider)
            const config = activeAssistant.config || {};
            const provider = (config.ai_provider || process.env.AI_PROVIDER || 'openai') as AIProvider;
            const apiKey = config.ai_api_key ||
                          (provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.GEMINI_API_KEY) || '';
            const model = config.ai_model || undefined;

            if (!apiKey) {
                console.warn('[AssistantProcessor] Sem API key configurada para o assistente');
                return false;
            }

            // 3. Verificar horário de funcionamento (se configurado)
            if (config.business_hours_start && config.business_hours_end) {
                const now = new Date();
                const hours = now.getHours();
                const minutes = now.getMinutes();
                const currentTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                if (currentTime < config.business_hours_start || currentTime > config.business_hours_end) {
                    console.log('[AssistantProcessor] Fora do horário de funcionamento');
                    return false;
                }
            }

            // 4. Construir mensagens para IA
            const messages = await this.buildAIMessages(ctx, activeAssistant);

            // 5. Chamar IA
            const startTime = Date.now();
            const aiResponse = await aiService.generateResponse(messages, provider, apiKey, model);
            const responseTime = Date.now() - startTime;

            if (!aiResponse.content) {
                console.warn('[AssistantProcessor] Resposta vazia da IA');
                return false;
            }

            console.log(`[AssistantProcessor] Resposta gerada em ${responseTime}ms (${aiResponse.tokensUsed} tokens)`);

            // 6. Enviar resposta pelo canal
            await this.sendReply(ctx, aiResponse.content);

            // 7. Salvar mensagem de resposta no banco
            await this.saveOutgoingMessage(ctx, aiResponse.content);

            // 8. Registrar log do assistente
            try {
                await assistantsService.logConversation({
                    user_assistant_id: activeAssistant.user_assistant_id,
                    conversation_id: ctx.conversationId,
                    contact_phone: ctx.contactPhone || '',
                    contact_name: ctx.contactName || '',
                    message_in: ctx.messageContent,
                    message_out: aiResponse.content,
                    tokens_used: aiResponse.tokensUsed,
                    response_time_ms: responseTime,
                    status: 'success',
                    metadata: { provider: aiResponse.provider, model: aiResponse.model }
                });
            } catch (logErr: any) {
                console.error('[AssistantProcessor] Erro ao salvar log:', logErr.message);
            }

            return true;
        } catch (error: any) {
            console.error('[AssistantProcessor] Erro ao processar mensagem:', error.message);

            // Tentar registrar erro no log
            try {
                const activeAssistant = await this.findActiveAssistantForChannel(ctx.channelId, ctx.userId);
                if (activeAssistant) {
                    await assistantsService.logConversation({
                        user_assistant_id: activeAssistant.user_assistant_id,
                        conversation_id: ctx.conversationId,
                        contact_phone: ctx.contactPhone || '',
                        contact_name: ctx.contactName || '',
                        message_in: ctx.messageContent,
                        message_out: '',
                        tokens_used: 0,
                        response_time_ms: 0,
                        status: 'error',
                        error_message: error.message
                    });
                }
            } catch { /* ignore logging errors */ }

            return false;
        }
    }

    /**
     * Busca assistente ativo para um canal específico
     */
    private async findActiveAssistantForChannel(channelId: string, userId: string): Promise<any | null> {
        try {
            const result = await query(
                `SELECT ua.id as user_assistant_id, ua.config, ua.channel_ids, ua.assistant_id,
                        a.name as assistant_name, a.default_config
                 FROM user_assistants ua
                 JOIN assistants a ON ua.assistant_id = a.id
                 WHERE ua.user_id = $1
                   AND ua.is_active = true
                   AND ($2 = ANY(ua.channel_ids) OR ua.channel_id = $2)
                 LIMIT 1`,
                [userId, channelId]
            );
            return result.rows[0] || null;
        } catch (error: any) {
            // Se tabelas não existem, retornar null silenciosamente
            if (error.code === '42P01' || error.code === '42703') {
                return null;
            }
            throw error;
        }
    }

    /**
     * Constrói array de mensagens para enviar à IA
     */
    private async buildAIMessages(ctx: IncomingMessageContext, assistant: any): Promise<AIMessage[]> {
        const config = assistant.config || {};
        const defaultConfig = assistant.default_config || {};
        const instructions = config.instructions || defaultConfig.instructions || '';
        const greeting = config.greeting || defaultConfig.greeting || '';

        // System prompt
        let systemPrompt = instructions;
        if (!systemPrompt) {
            systemPrompt = `Você é ${assistant.assistant_name}, um assistente virtual inteligente. Responda de forma educada, profissional e útil.`;
        }
        if (greeting && !systemPrompt.includes(greeting)) {
            systemPrompt += `\n\nMensagem de boas-vindas: "${greeting}"`;
        }
        systemPrompt += '\n\nResponda sempre no mesmo idioma do cliente. Mantenha respostas concisas e diretas.';

        const messages: AIMessage[] = [
            { role: 'system', content: systemPrompt }
        ];

        // Buscar histórico da conversa para contexto
        const history = await aiService.getConversationHistory(ctx.conversationId, 8);
        messages.push(...history);

        // Mensagem atual
        messages.push({ role: 'user', content: ctx.messageContent });

        return messages;
    }

    /**
     * Envia resposta pelo canal correto
     */
    private async sendReply(ctx: IncomingMessageContext, text: string): Promise<void> {
        const credentials = ctx.credentials || {};

        switch (ctx.channelType) {
            case 'whatsapp': {
                const instanceId = credentials.instance_id || credentials.instance_name;
                if (!instanceId || !ctx.contactPhone) {
                    throw new Error('Sem instanceId ou phone para enviar mensagem WhatsApp');
                }
                await whatsappService.sendMessage({
                    instanceId,
                    number: ctx.contactPhone,
                    text
                });
                break;
            }

            case 'whatsapp_cloud': {
                const phoneNumberId = credentials.phone_number_id;
                const accessToken = credentials.access_token;
                if (!phoneNumberId || !accessToken || !ctx.contactPhone) {
                    throw new Error('Sem credenciais para WhatsApp Cloud API');
                }
                await this.sendWhatsAppCloudMessage(phoneNumberId, accessToken, ctx.contactPhone, text);
                break;
            }

            case 'telegram': {
                const botToken = credentials.bot_token;
                const chatId = ctx.contactPhone; // Telegram usa chat_id
                if (!botToken || !chatId) {
                    throw new Error('Sem credenciais para Telegram');
                }
                await this.sendTelegramMessage(botToken, chatId, text);
                break;
            }

            case 'instagram': {
                const accessToken = credentials.access_token;
                const recipientId = ctx.contactPhone; // Instagram sender_id
                if (!accessToken || !recipientId) {
                    throw new Error('Sem credenciais para Instagram');
                }
                await this.sendInstagramMessage(accessToken, recipientId, text);
                break;
            }

            case 'facebook': {
                const accessToken = credentials.page_access_token || credentials.access_token;
                const recipientId = ctx.contactPhone; // Facebook PSID
                if (!accessToken || !recipientId) {
                    throw new Error('Sem credenciais para Facebook Messenger');
                }
                await this.sendFacebookMessage(accessToken, recipientId, text);
                break;
            }

            default:
                console.warn(`[AssistantProcessor] Canal ${ctx.channelType} não suportado para resposta automática`);
        }
    }

    /**
     * Salva mensagem de saída no banco
     */
    private async saveOutgoingMessage(ctx: IncomingMessageContext, content: string): Promise<void> {
        try {
            await query(
                `INSERT INTO messages (user_id, conversation_id, direction, channel, content, status, metadata)
                 VALUES ($1, $2, 'out', $3, $4, 'sent', $5)`,
                [
                    ctx.userId,
                    ctx.conversationId,
                    ctx.channelType,
                    content,
                    JSON.stringify({ source: 'ai_assistant', automated: true })
                ]
            );

            // Atualizar last_message_at da conversa
            await query(
                `UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`,
                [ctx.conversationId]
            );
        } catch (err: any) {
            console.error('[AssistantProcessor] Erro ao salvar mensagem:', err.message);
        }
    }

    /**
     * Envia mensagem via WhatsApp Cloud API
     */
    private async sendWhatsAppCloudMessage(phoneNumberId: string, accessToken: string, to: string, text: string): Promise<void> {
        const response = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to,
                type: 'text',
                text: { body: text }
            })
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`WhatsApp Cloud API error: ${err}`);
        }
    }

    /**
     * Envia mensagem via Telegram Bot API
     */
    private async sendTelegramMessage(botToken: string, chatId: string, text: string): Promise<void> {
        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text })
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Telegram API error: ${err}`);
        }
    }

    /**
     * Envia mensagem via Instagram Graph API
     */
    private async sendInstagramMessage(accessToken: string, recipientId: string, text: string): Promise<void> {
        const response = await fetch(`https://graph.facebook.com/v18.0/me/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({
                recipient: { id: recipientId },
                message: { text }
            })
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Instagram API error: ${err}`);
        }
    }

    /**
     * Envia mensagem via Facebook Messenger Graph API
     */
    private async sendFacebookMessage(accessToken: string, recipientId: string, text: string): Promise<void> {
        const response = await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${encodeURIComponent(accessToken)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recipient: { id: recipientId },
                message: { text }
            })
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Facebook Messenger API error: ${err}`);
        }
        console.log(`[AssistantProcessor] Resposta enviada via Facebook Messenger para ${recipientId}`);
    }
}

// Singleton
export const assistantProcessor = new AssistantProcessorService();
