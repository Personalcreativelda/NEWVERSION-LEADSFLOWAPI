// Processador de mensagens dos assistentes de IA
// Intercepta mensagens recebidas e responde automaticamente usando IA
import { query } from '../database/connection';
import { AIService, getAvailableProviders, type AIMessage, type AIProvider, type ProviderConfig } from './ai.service';
import { AssistantsService } from './assistants.service';
import { WhatsAppService } from './whatsapp.service';
import { getWebSocketService } from './websocket.service';
import { checkMessageLimit } from '../middleware/plan-enforcement.middleware';

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
    remoteJid?: string;       // JID completo do contato (ex: 5511999@s.whatsapp.net)
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

            // 2. Detectar provedores disponíveis (com fallback automático)
            const config = activeAssistant.config || {};
            const configuredProvider = config.ai_provider as AIProvider | undefined;
            const model = config.ai_model as string | undefined;

            // Constrói lista ordenada: provedor preferido do assistente → env AI_PROVIDER → restantes
            const availableProviders: ProviderConfig[] = getAvailableProviders(configuredProvider);

            if (availableProviders.length === 0) {
                console.warn(
                    '[AssistantProcessor] ❌ Nenhum provedor de IA configurado. ' +
                    'Defina GEMINI_API_KEY, OPENAI_API_KEY ou ANTHROPIC_API_KEY no .env'
                );
                return false;
            }

            console.log(
                `[AssistantProcessor] 🔑 Provedores disponíveis: ` +
                availableProviders.map(p => p.provider).join(' → ')
            );

            // 2b. Verificar limite do plano ANTES de chamar a IA (evita gastar tokens da API)
            const msgCheck = await checkMessageLimit(ctx.userId, 'messages');
            if (!msgCheck.allowed) {
                console.warn(`[AssistantProcessor] Limite de mensagens do plano atingido para user ${ctx.userId} (${msgCheck.current}/${msgCheck.limit}). Assistente bloqueado.`);
                return false;
            }

            // 2c. Verificar limite mensal de mensagens do assistente
            const isFreePlan = activeAssistant.user_plan === 'free';
            const monthlyLimit = (activeAssistant.is_custom && isFreePlan)
                ? 100
                : Number(config.monthly_message_limit) || 200;
            const startOfMonth = new Date();
            startOfMonth.setDate(1);
            startOfMonth.setHours(0, 0, 0, 0);
            const usageResult = await query(
                `SELECT COUNT(*) as count FROM assistant_logs
                 WHERE user_assistant_id = $1 AND status = 'success' AND created_at >= $2`,
                [activeAssistant.user_assistant_id, startOfMonth]
            );
            const usedThisMonth = parseInt(usageResult.rows[0]?.count || '0', 10);
            if (usedThisMonth >= monthlyLimit) {
                console.warn(`[AssistantProcessor] Limite mensal atingido para assistente ${activeAssistant.user_assistant_id}: ${usedThisMonth}/${monthlyLimit}`);
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

            // 5. Chamar IA (com fallback automático entre provedores)
            const startTime = Date.now();
            const aiResponse = await aiService.generateResponseWithFallback(messages, availableProviders, model);
            const responseTime = Date.now() - startTime;
            const provider = aiResponse.provider;

            if (!aiResponse.content) {
                console.warn('[AssistantProcessor] Resposta vazia da IA');
                return false;
            }

            console.log(`[AssistantProcessor] Resposta gerada em ${responseTime}ms (${aiResponse.tokensUsed} tokens)`);

            // 6. Enviar resposta pelo canal (capturar externalId para dedup no webhook)
            const externalMsgId = await this.sendReply(ctx, aiResponse.content);

            // 7. Salvar mensagem de resposta no banco (com external_id para evitar duplicata via webhook)
            await this.saveOutgoingMessage(ctx, aiResponse.content, externalMsgId);

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

            // 9. Atualizar memória de longo prazo do contato (assíncrono, não bloqueia)
            const memoryEnabled = config.memory_enabled !== false;
            if (memoryEnabled && ctx.contactPhone) {
                // Usar o mesmo provedor que respondeu (já foi o que funcionou)
                const memoryProviderKey = availableProviders.find(p => p.provider === provider)
                    ?? availableProviders[0];
                void aiService.updateContactMemory({
                    userAssistantId: activeAssistant.user_assistant_id,
                    contactPhone: ctx.contactPhone,
                    contactName: ctx.contactName,
                    messageIn: ctx.messageContent,
                    messageOut: aiResponse.content,
                    provider: memoryProviderKey.provider,
                    apiKey: memoryProviderKey.apiKey,
                    model: config.ai_model
                });
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
            console.log(`[AssistantProcessor] 🔍 Buscando assistente ativo para canal=${channelId}, userId=${userId}`);
            
            const result = await query(
                `SELECT ua.id as user_assistant_id, ua.config, ua.channel_ids, ua.assistant_id,
                        a.name as assistant_name, a.default_config, a.is_custom,
                        COALESCE(u.plan, 'free') as user_plan
                 FROM user_assistants ua
                 JOIN assistants a ON ua.assistant_id = a.id
                 JOIN users u ON u.id = ua.user_id
                 WHERE ua.user_id = $1
                   AND ua.is_active = true
                   AND ($2 = ANY(ua.channel_ids) OR ua.channel_id = $2)
                 LIMIT 1`,
                [userId, channelId]
            );
            
            if (result.rows[0]) {
                console.log(`[AssistantProcessor] ✅ Assistente encontrado: ${result.rows[0].assistant_name} (ID: ${result.rows[0].user_assistant_id})`);
                console.log(`[AssistantProcessor]   - channel_ids: ${JSON.stringify(result.rows[0].channel_ids)}`);
            } else {
                console.warn(`[AssistantProcessor] ⚠️ Nenhum assistente encontrado para canal=${channelId}`);
                
                // Debug: listar todos os assistentes do usuário
                const debugResult = await query(
                    `SELECT ua.id, ua.is_active, ua.channel_id, ua.channel_ids, a.name
                     FROM user_assistants ua
                     LEFT JOIN assistants a ON ua.assistant_id = a.id
                     WHERE ua.user_id = $1`,
                    [userId]
                );
                
                if (debugResult.rows.length > 0) {
                    console.log(`[AssistantProcessor] DEBUG: Usuário tem ${debugResult.rows.length} assistente(s):`);
                    debugResult.rows.forEach(row => {
                        console.log(`[AssistantProcessor]   - ${row.name} (ativo=${row.is_active}, channel_ids=${JSON.stringify(row.channel_ids)}, channel_id=${row.channel_id})`);
                    });
                } else {
                    console.log(`[AssistantProcessor] DEBUG: Usuário não tem nenhum assistente`);
                }
            }
            
            return result.rows[0] || null;
        } catch (error: any) {
            // Se tabelas não existem, retornar null silenciosamente
            if (error.code === '42P01' || error.code === '42703') {
                console.log('[AssistantProcessor] ℹ️ Tabelas de assistentes não existem ainda');
                return null;
            }
            console.error('[AssistantProcessor] ❌ Erro ao buscar assistente:', error.message);
            throw error;
        }
    }

    /**
     * Constrói array de mensagens para enviar à IA,
     * incorporando memória de curto e longo prazo
     */
    private async buildAIMessages(ctx: IncomingMessageContext, assistant: any): Promise<AIMessage[]> {
        const config = assistant.config || {};
        const defaultConfig = assistant.default_config || {};
        const instructions = config.instructions || defaultConfig.instructions || '';
        const memoryEnabled = config.memory_enabled !== false; // padrão: ativado

        // Buscar histórico da conversa.
        // A mensagem atual JÁ foi salva no banco antes do processor ser chamado,
        // portanto ela aparece como último item em `rawHistory`.
        // Usamos slice(0,-1) para removê-la e adicioná-la via ctx.messageContent no final.
        const rawHistory = await aiService.getConversationHistory(ctx.conversationId, 21);
        const history = rawHistory.slice(0, -1);

        console.log(`[AssistantProcessor] 📜 Histórico carregado: ${rawHistory.length} msgs totais, ${history.length} no contexto (conversa=${ctx.conversationId})`);

        // System prompt: 100% controlado pelas instruções do usuário.
        // Saudações, tom, comportamento inicial e final — tudo definido no prompt.
        let systemPrompt = instructions;
        if (!systemPrompt) {
            systemPrompt = `Você é ${assistant.assistant_name}, um assistente virtual inteligente. Responda de forma educada, profissional e útil.`;
        }

        systemPrompt += '\n\nResponda sempre no mesmo idioma do cliente. Mantenha respostas concisas e diretas.';

        // Injetar memória de longo prazo no system prompt
        if (memoryEnabled && ctx.contactPhone) {
            const memory = await aiService.getContactMemory(assistant.user_assistant_id, ctx.contactPhone);
            if (memory && (memory.summary || memory.last_topics?.length > 0)) {
                systemPrompt += '\n\n---\n[MEMÓRIA DO CONTATO]\n';

                if (memory.contact_name || ctx.contactName) {
                    systemPrompt += `Nome: ${memory.contact_name || ctx.contactName}\n`;
                }
                if (memory.total_conversations > 0) {
                    systemPrompt += `Conversas anteriores: ${memory.total_conversations}\n`;
                }
                if (memory.last_topics && memory.last_topics.length > 0) {
                    systemPrompt += `Assuntos recentes: ${memory.last_topics.slice(0, 5).join(', ')}\n`;
                }
                if (memory.summary) {
                    systemPrompt += `Perfil do cliente: ${memory.summary}\n`;
                }
                if (memory.last_contact_at) {
                    const lastContact = new Date(memory.last_contact_at);
                    const diff = Math.floor((Date.now() - lastContact.getTime()) / (1000 * 60 * 60 * 24));
                    if (diff > 0) {
                        systemPrompt += `Último contato: há ${diff} dia(s)\n`;
                    }
                }
                systemPrompt += 'Use essas informações para personalizar sua resposta, sem mencioná-las explicitamente a menos que seja relevante.\n---';

                console.log(`[AssistantProcessor] 🧠 Memória carregada para ${ctx.contactPhone} (${memory.total_conversations} conversas)`);
            }
        }

        const messages: AIMessage[] = [
            { role: 'system', content: systemPrompt }
        ];

        // history já foi buscado acima (antes do system prompt) — reutilizar

        // ── Janela de contexto cross-sessão ──────────────────────────────────────
        // Quando a conversa atual é nova (poucas mensagens), injetar o trecho final
        // da última sessão com este contato para manter continuidade natural.
        const contextWindowEnabled = config.context_window_enabled !== false; // padrão: ativo
        const contextWindowSize = Math.min(Math.max(Number(config.context_window_messages) || 10, 4), 30);

        if (contextWindowEnabled && ctx.remoteJid && history.length < 5) {
            try {
                const crossCtx = await aiService.getCrossConversationContext(
                    ctx.userId, ctx.remoteJid, ctx.conversationId, contextWindowSize
                );
                if (crossCtx.messages.length > 0) {
                    const dateStr = crossCtx.lastSessionDate
                        ? new Date(crossCtx.lastSessionDate).toLocaleDateString('pt-BR')
                        : 'sessão anterior';

                    let ctxBlock = `\n\n---\n[JANELA DE CONTEXTO — Retomando conversa de ${dateStr}]`;
                    ctxBlock += '\n(Trecho recente da última sessão com este contato — use para manter continuidade)\n';
                    for (const m of crossCtx.messages) {
                        const prefix = m.role === 'user' ? 'Contato' : 'Você';
                        ctxBlock += `${prefix}: ${m.content.substring(0, 300).replace(/\n/g, ' ')}\n`;
                    }
                    ctxBlock += '[Fim do contexto anterior — esta é uma nova sessão]\n---';

                    messages[0].content += ctxBlock;
                    console.log(`[AssistantProcessor] 🪟 Janela de contexto: ${crossCtx.messages.length} msgs de sessão anterior (${dateStr})`);
                }
            } catch (ctxErr: any) {
                console.warn('[AssistantProcessor] Falha ao carregar janela de contexto:', ctxErr.message);
            }
        }
        // ─────────────────────────────────────────────────────────────────────────

        messages.push(...history);

        // Adicionar mensagem atual (NÃO está em `history` pois fizemos slice(0,-1))
        messages.push({ role: 'user', content: ctx.messageContent });

        return messages;
    }

    /**
     * Envia resposta pelo canal correto
     * Retorna o external_id da mensagem enviada (para dedup no webhook Evolution)
     */
    private async sendReply(ctx: IncomingMessageContext, text: string): Promise<string | null> {
        let credentials = ctx.credentials || {};
        // Safe-parse se credentials vier como string
        if (typeof credentials === 'string') {
            try { credentials = JSON.parse(credentials); } catch (e) { credentials = {}; }
        }

        switch (ctx.channelType) {
            case 'whatsapp': {
                const instanceId = credentials.instance_id || credentials.instance_name;
                if (!instanceId || !ctx.contactPhone) {
                    throw new Error('Sem instanceId ou phone para enviar mensagem WhatsApp');
                }

                // Usar a mesma lógica que inbox.routes.ts:
                // - @lid JIDs: enviar sempre com o remoteJid completo (@lid ou @s.whatsapp.net resolvido)
                // - Outros: enviar com número limpo (dígitos), JID completo como fallback
                const isLidJid = ctx.remoteJid?.endsWith('@lid');
                const isGroupJid = ctx.remoteJid?.endsWith('@g.us');
                const primaryNumber = (isLidJid || isGroupJid) && ctx.remoteJid
                    ? ctx.remoteJid   // @lid ou grupo: usar JID completo
                    : ctx.contactPhone; // normal: usar dígitos limpos

                const numberFormats = [
                    primaryNumber,                                             // Formato primário correto
                    ctx.remoteJid || '',                                       // JID completo como fallback
                    ctx.contactPhone.includes('@') ? ctx.contactPhone : `${ctx.contactPhone}@s.whatsapp.net`,  // Último recurso
                ].filter((n, i, arr) => n && n.length > 0 && arr.indexOf(n) === i); // remover duplicados

                let lastError: any = null;
                let sent = false;
                let lastSentResult: any = null;

                for (const numberFormat of numberFormats) {
                    try {
                        console.log(`[AssistantProcessor] Tentando enviar para: ${numberFormat} (instance: ${instanceId})`);
                        lastSentResult = await whatsappService.sendMessage({
                            instanceId,
                            number: numberFormat,
                            text
                        });
                        console.log(`[AssistantProcessor] ✅ Mensagem enviada com sucesso para: ${numberFormat}`);
                        sent = true;
                        break;
                    } catch (err: any) {
                        console.warn(`[AssistantProcessor] ⚠️ Falha ao enviar para ${numberFormat}: ${err.message}`);
                        lastError = err;
                    }
                }

                if (!sent) {
                    throw lastError || new Error('Falha ao enviar mensagem WhatsApp em todos os formatos');
                }
                // Tentar extrair o ID da mensagem enviada (Evolution API retorna key.id)
                const sentResult = lastSentResult as any;
                return sentResult?.key?.id || sentResult?.id || null;
            }

            case 'whatsapp_cloud': {
                const phoneNumberId = credentials.phone_number_id;
                const accessToken = credentials.access_token;
                if (!phoneNumberId || !accessToken || !ctx.contactPhone) {
                    throw new Error('Sem credenciais para WhatsApp Cloud API');
                }
                await this.sendWhatsAppCloudMessage(phoneNumberId, accessToken, ctx.contactPhone, text);
                return null;
            }

            case 'telegram': {
                const botToken = credentials.bot_token;
                const chatId = ctx.contactPhone; // Telegram usa chat_id
                if (!botToken || !chatId) {
                    throw new Error('Sem credenciais para Telegram');
                }
                await this.sendTelegramMessage(botToken, chatId, text);
                return null;
            }

            case 'instagram': {
                const accessToken = credentials.access_token;
                const recipientId = ctx.contactPhone; // Instagram sender_id
                if (!accessToken || !recipientId) {
                    throw new Error('Sem credenciais para Instagram');
                }
                await this.sendInstagramMessage(accessToken, recipientId, text);
                return null;
            }

            case 'facebook': {
                const accessToken = credentials.page_access_token || credentials.access_token;
                const recipientId = ctx.contactPhone; // Facebook PSID
                if (!accessToken || !recipientId) {
                    throw new Error('Sem credenciais para Facebook Messenger');
                }
                await this.sendFacebookMessage(accessToken, recipientId, text);
                return null;
            }

            default:
                console.warn(`[AssistantProcessor] Canal ${ctx.channelType} não suportado para resposta automática`);
                return null;
        }
    }

    /**
     * Salva mensagem de saída no banco
     * externalId: ID da mensagem retornado pela Evolution API (para dedup no webhook)
     */
    private async saveOutgoingMessage(ctx: IncomingMessageContext, content: string, externalId?: string | null): Promise<void> {
        try {
            const result = await query(
                `INSERT INTO messages (user_id, conversation_id, direction, channel, content, status, external_id, metadata)
                 VALUES ($1, $2, 'out', $3, $4, 'sent', $5, $6)
                 RETURNING *`,
                [
                    ctx.userId,
                    ctx.conversationId,
                    ctx.channelType,
                    content,
                    externalId || null,
                    JSON.stringify({ source: 'ai_assistant', automated: true })
                ]
            );

            // Atualizar last_message_at da conversa
            await query(
                `UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`,
                [ctx.conversationId]
            );

            // Emitir WebSocket para atualização em tempo real no dashboard
            const savedMessage = result.rows[0];
            if (savedMessage) {
                try {
                    const wsService = getWebSocketService();
                    if (wsService) {
                        wsService.emitNewMessage(ctx.userId, {
                            conversationId: ctx.conversationId,
                            message: savedMessage,
                        });
                        console.log(`[AssistantProcessor] WebSocket emitido para mensagem da IA: ${savedMessage.id}`);
                    }
                } catch (wsErr: any) {
                    console.warn('[AssistantProcessor] Falha ao emitir WebSocket (não crítico):', wsErr.message);
                }
            }
        } catch (err: any) {
            console.error('[AssistantProcessor] Erro ao salvar mensagem:', err.message);
        }
    }

    /**
     * Envia mensagem via WhatsApp Cloud API
     */
    private async sendWhatsAppCloudMessage(phoneNumberId: string, accessToken: string, to: string, text: string): Promise<void> {
        const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
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
