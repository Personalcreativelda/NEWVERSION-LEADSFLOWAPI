// Processador de mensagens dos assistentes de IA
// Intercepta mensagens recebidas e responde automaticamente usando IA
import { query } from '../database/connection';
import { AIService, getAvailableProviders, type AIMessage, type AIProvider, type ProviderConfig } from './ai.service';
import { AssistantsService } from './assistants.service';
import { WhatsAppService } from './whatsapp.service';
import { getWebSocketService } from './websocket.service';
import { checkMessageLimit } from '../middleware/plan-enforcement.middleware';
import { isValidPhoneNumber, isSamePhoneNumber, normalizePhoneNumber } from '../utils/phone.utils';

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
    mediaType?: string;       // Tipo de mídia recebida (ex: 'audio', 'image')
    mediaUrl?: string;        // URL da mídia (se armazenada no MinIO)
}

export class AssistantProcessorService {
    /**
     * Processa mensagem recebida - verifica se há assistente ativo e responde
     * Retorna true se o assistente respondeu, false se não há assistente ativo
     */
    async processIncomingMessage(ctx: IncomingMessageContext): Promise<boolean> {
        try {
            // 0. NORMALIZAR o contactPhone para garantir consistência
            if (ctx.contactPhone) {
                const normalizedPhone = normalizePhoneNumber(ctx.contactPhone);
                if (normalizedPhone) {
                    ctx.contactPhone = normalizedPhone;
                    console.log(`[AssistantProcessor] Phone normalizado: ${ctx.contactPhone}`);
                }
            }

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

            // 4. Se for áudio, transcrever primeiro
            if (ctx.mediaType === 'audio' && ctx.mediaUrl) {
                console.log(`[AssistantProcessor] 🎙️ Áudio recebido, iniciando transcrição...`);
                // Procurar por chave do OpenAI (necessária para Whisper)
                const openAIProvider = availableProviders.find(p => p.provider === 'openai');
                const openAIApiKey = openAIProvider?.apiKey || process.env.OPENAI_API_KEY;
                
                if (openAIApiKey) {
                    try {
                        const transcript = await aiService.transcribeAudio(ctx.mediaUrl, openAIApiKey);
                        if (transcript && transcript.trim()) {
                            console.log(`[AssistantProcessor] 📝 Áudio transcrito: "${transcript}"`);
                            ctx.messageContent = transcript;
                        } else {
                            console.warn('[AssistantProcessor] ⚠️ Transcrição retornou texto vazio.');
                        }
                    } catch (err: any) {
                        console.error('[AssistantProcessor] ❌ Erro ao transcrever áudio:', err.message);
                        // Se falhar a transcrição e não houver texto, aborta
                        if (!ctx.messageContent || ctx.messageContent.startsWith('[')) {
                            return false;
                        }
                    }
                } else {
                    console.warn('[AssistantProcessor] ⚠️ Sem chave da OpenAI para transcrever áudio (Whisper). Abortando.');
                    if (!ctx.messageContent || ctx.messageContent.startsWith('[')) {
                        return false; // Não consegue processar áudio sem transcrição
                    }
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

            // 5.5. Verificar se deve responder com áudio (ElevenLabs)
            // Regra: "eleve deve responder em audio quando o cliente manda audio"
            let audioBase64: string | undefined = undefined;
            const audioEnabled = config.audio_enabled === true;
            
            if (audioEnabled && ctx.mediaType === 'audio') {
                const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
                if (!elevenLabsApiKey) {
                    console.warn('[AssistantProcessor] ⚠️ Resposta em áudio habilitada, mas ELEVENLABS_API_KEY não encontrada. Fallback para texto.');
                } else {
                    try {
                        console.log(`[AssistantProcessor] 🎙️ Gerando Áudio Mágico (ElevenLabs) para a resposta...`);
                        const voiceId = config.audio_voice_id || 'EXAVITQu4vr4xnSDxMaL'; // Default: Sarah
                        const audioBuffer = await aiService.generateElevenLabsAudio(
                            aiResponse.content,
                            voiceId,
                            elevenLabsApiKey
                        );
                        audioBase64 = `data:audio/mp3;base64,${audioBuffer.toString('base64')}`;
                        console.log(`[AssistantProcessor] ✅ Áudio Mágico gerado com sucesso!`);
                    } catch (audioErr: any) {
                        console.error(`[AssistantProcessor] ❌ Erro ao gerar áudio ElevenLabs (Fallback para texto):`, audioErr.message);
                    }
                }
            }

            // 6. Enviar resposta pelo canal (capturar externalId para dedup no webhook)
            const externalMsgId = await this.sendReply(ctx, aiResponse.content, audioBase64);

            // 7. Salvar mensagem de resposta no banco (com external_id para evitar duplicata via webhook)
            await this.saveOutgoingMessage(ctx, aiResponse.content, externalMsgId, audioBase64 ? 'audio' : 'text');

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

            // 10. Movimentar funil de vendas automaticamente (assíncrono, não bloqueia)
            const funnelTrackingEnabled = config.funnel_tracking_enabled !== false;
            if (funnelTrackingEnabled) {
                void this.detectAndUpdateFunnelStage(ctx, aiResponse.content, activeAssistant, availableProviders, model);
            }

            // 11. Detectar agendamentos/reuniões e criar tarefa automaticamente (assíncrono)
            const schedulingEnabled = config.scheduling_enabled !== false; // ativo por padrão
            if (schedulingEnabled) {
                void this.detectAndCreateSchedulingTask(
                    ctx,
                    aiResponse.content,
                    activeAssistant,
                    availableProviders,
                    model
                );
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
    private async sendReply(ctx: IncomingMessageContext, text: string, audioBase64?: string): Promise<string | null> {
        // ✅ VALIDAÇÃO: Para WhatsApp, verificar se o contactPhone é válido (número de telefone).
        // Canais não-WhatsApp usam IDs de plataforma (PSID, chat_id, etc.) que não seguem
        // o formato de telefone — por isso a validação só se aplica ao WhatsApp.
        const isWhatsAppChannel = ctx.channelType === 'whatsapp' || ctx.channelType === 'whatsapp_cloud';
        if (isWhatsAppChannel && !isValidPhoneNumber(ctx.contactPhone)) {
            throw new Error(`❌ Número de contato inválido para resposta do assistente: ${ctx.contactPhone}`);
        }

        // ✅ VALIDAÇÃO: Verificar se não está respondendo para si mesmo (loop infinito)
        // (Apenas para WhatsApp onde o botPhone faz sentido)
        let credentials = ctx.credentials || {};
        // Safe-parse se credentials vier como string
        if (typeof credentials === 'string') {
            try { credentials = JSON.parse(credentials); } catch (e) { credentials = {}; }
        }

        const botPhone = credentials.phone || credentials.phone_number;
        if (botPhone && isSamePhoneNumber(ctx.contactPhone, botPhone)) {
            throw new Error(`🚫 Assistente tenta responder para seu próprio número (${ctx.contactPhone}) — REJEITADO para evitar loop infinito`);
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
                        
                        if (audioBase64) {
                            lastSentResult = await whatsappService.sendAudio({
                                instanceId,
                                number: numberFormat,
                                audioBase64
                            });
                            console.log(`[AssistantProcessor] ✅ Áudio Mágico enviado com sucesso para: ${numberFormat}`);
                        } else {
                            lastSentResult = await whatsappService.sendMessage({
                                instanceId,
                                number: numberFormat,
                                text
                            });
                            console.log(`[AssistantProcessor] ✅ Mensagem enviada com sucesso para: ${numberFormat}`);
                        }
                        
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
    private async saveOutgoingMessage(ctx: IncomingMessageContext, content: string, externalId?: string | null, mediaType?: string): Promise<void> {
        try {
            const result = await query(
                `INSERT INTO messages (user_id, conversation_id, direction, channel, content, status, external_id, metadata, media_type)
                 VALUES ($1, $2, 'out', $3, $4, 'sent', $5, $6, $7)
                 RETURNING *`,
                [
                    ctx.userId,
                    ctx.conversationId,
                    ctx.channelType,
                    content,
                    externalId || null,
                    JSON.stringify({ source: 'ai_assistant', automated: true }),
                    mediaType || null
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

    // ─────────────────────────────────────────────────────────────────────────
    // FUNIL DE VENDAS AUTOMÁTICO
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Ordem numérica dos estágios para comparar progressão
     */
    private readonly FUNNEL_ORDER: Record<string, number> = {
        novo: 0,
        contatado: 1,
        qualificado: 2,
        negociacao: 3,
        convertido: 4,
        perdido: -1,
    };

    /**
     * Detecção rule-based de novo estágio do funil com base na mensagem do usuário.
     * Retorna o novo status ou null se não há mudança.
     * Só avança o funil (ou move para 'perdido') — nunca retrocede.
     */
    private detectFunnelStageFromMessage(userMessage: string, currentStatus: string): string | null {
        // Normalizar: minúsculas + remover acentos
        const msg = userMessage
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');

        const currentOrder = this.FUNNEL_ORDER[currentStatus] ?? 0;

        // ── PERDIDO — maior prioridade (exceto se já convertido) ──────────────
        if (currentStatus !== 'convertido') {
            const lostSignals = [
                'nao quero', 'nao tenho interesse', 'sem interesse', 'nao me interessa',
                'cancela', 'cancele', 'desisto', 'desistir', 'nao vou mais', 'nao vou comprar',
                'por enquanto nao', 'nao e pra mim', 'nao e para mim',
                'obrigado mas nao', 'nao obrigado', 'nao preciso',
                'dispensado', 'nao da', 'nao vai dar', 'deixa pra la', 'esquece',
                'nao estou interessado', 'nao quero mais',
            ];
            if (lostSignals.some(s => msg.includes(s))) {
                console.log(`[FunnelAI] Sinal de PERDA detectado na mensagem`);
                return 'perdido';
            }
        }

        // ── CONVERTIDO ────────────────────────────────────────────────────────
        if (currentOrder < 4) {
            const convertedSignals = [
                'ja paguei', 'paguei', 'comprei', 'contratei', 'ja contratei',
                'fiz o pagamento', 'realizei o pagamento', 'ta feito', 'ta pago',
                'finalizei', 'fechei', 'assinei', 'assinado o contrato',
                'confirmei o pagamento', 'confirmado', 'efetuei o pagamento',
                'ja assine', 'ja assinei',
            ];
            if (convertedSignals.some(s => msg.includes(s))) {
                console.log(`[FunnelAI] Sinal de CONVERSÃO detectado na mensagem`);
                return 'convertido';
            }
        }

        // ── NEGOCIAÇÃO ────────────────────────────────────────────────────────
        if (currentOrder < 3) {
            const negSignals = [
                'quero contratar', 'vamos fechar', 'pode fechar', 'me manda proposta',
                'manda a proposta', 'quero a proposta', 'envia o contrato',
                'me manda o contrato', 'como faço para contratar', 'como faço pra contratar',
                'como pago', 'como faço para pagar', 'como faco pra pagar',
                'boleto', 'pix', 'cartao de credito', 'parcelado', 'parcelamento',
                'forma de pagamento', 'formas de pagamento', 'link de pagamento',
                'me manda o link', 'link pra pagar', 'vou fechar', 'quero fechar',
                'topei', 'aceito', 'concordo com o valor', 'ta bom o preco',
                'fechado', 'vamos fazer', 'quero assinar', 'vou assinar',
                'pode me mandar o contrato', 'pode enviar o contrato',
            ];
            if (negSignals.some(s => msg.includes(s))) {
                console.log(`[FunnelAI] Sinal de NEGOCIAÇÃO detectado na mensagem`);
                return 'negociacao';
            }
        }

        // ── QUALIFICADO ───────────────────────────────────────────────────────
        if (currentOrder < 2) {
            const qualSignals = [
                'quanto custa', 'qual o preco', 'qual o valor', 'quanto e',
                'me interessa', 'tenho interesse', 'gostaria de saber', 'gostaria de ver',
                'quero saber mais', 'pode me contar mais', 'me conta mais',
                'como funciona', 'pode me explicar', 'pode explicar',
                'quero agendar', 'agendar demonstracao', 'quero ver uma demo',
                'posso ver', 'quero ver', 'me fala mais', 'fala mais sobre',
                'preciso disso', 'e exatamente o que preciso', 'parece interessante',
                'me interessa muito', 'quero mais informacoes', 'mais informacoes',
                'pode me enviar mais', 'tem mais detalhes', 'quero detalhes',
                'qual o plano', 'quais os planos', 'tem plano', 'opcoes de plano',
            ];
            if (qualSignals.some(s => msg.includes(s))) {
                console.log(`[FunnelAI] Sinal de QUALIFICAÇÃO detectado na mensagem`);
                return 'qualificado';
            }
        }

        // ── CONTATADO — simples: se o lead era 'novo', agora está 'contatado' ─
        if (currentStatus === 'novo') {
            return 'contatado';
        }

        return null; // Sem mudança detectada
    }

    /**
     * Orquestra a detecção e atualização do funil de vendas.
     * Busca o lead associado à conversa, detecta o novo estágio,
     * atualiza o banco e emite evento WebSocket.
     */
    private async detectAndUpdateFunnelStage(
        ctx: IncomingMessageContext,
        aiReply: string,
        assistant: any,
        providers: ProviderConfig[],
        model?: string
    ): Promise<void> {
        try {
            // 1. Buscar lead associado à conversa
            const convResult = await query(
                `SELECT c.lead_id, l.status as current_status, l.name as lead_name
                 FROM conversations c
                 JOIN leads l ON l.id = c.lead_id
                 WHERE c.id = $1 AND c.user_id = $2
                 LIMIT 1`,
                [ctx.conversationId, ctx.userId]
            );

            if (!convResult.rows[0] || !convResult.rows[0].lead_id) {
                return; // Conversa sem lead vinculado
            }

            const { lead_id, current_status, lead_name } = convResult.rows[0];
            const safeStatus = current_status || 'novo';

            // Não mexer em leads já finalizados (a menos que detecte conversão)
            if (safeStatus === 'convertido' && ctx.messageContent.toLowerCase().indexOf('paguei') === -1) {
                return;
            }

            // 2. Detecção rule-based (primária — sempre roda)
            let detectedStatus = this.detectFunnelStageFromMessage(ctx.messageContent, safeStatus);

            // 3. Se não detectou mudança E o assistente tem AI funnel ativo, usar IA
            const config = assistant.config || {};
            const aiEnhancedFunnel = config.ai_funnel_detection !== false && providers.length > 0;

            if (!detectedStatus && aiEnhancedFunnel && safeStatus !== 'convertido') {
                detectedStatus = await this.classifyFunnelWithAI(
                    ctx.messageContent,
                    aiReply,
                    safeStatus,
                    providers,
                    model
                );
            }

            if (!detectedStatus || detectedStatus === safeStatus) {
                return; // Sem mudança
            }

            // 4. Validar progressão (nunca retroceder, exceto para 'perdido')
            const currentOrder = this.FUNNEL_ORDER[safeStatus] ?? 0;
            const newOrder = this.FUNNEL_ORDER[detectedStatus] ?? 0;

            if (detectedStatus !== 'perdido' && newOrder <= currentOrder) {
                console.log(`[FunnelAI] Estágio detectado (${detectedStatus}) não avança o funil (atual: ${safeStatus}), ignorando.`);
                return;
            }

            // 5. Atualizar lead no banco
            await query(
                `UPDATE leads SET status = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3`,
                [detectedStatus, lead_id, ctx.userId]
            );

            console.log(`[FunnelAI] ✅ Lead "${lead_name}" movido: ${safeStatus} → ${detectedStatus}`);

            // 6. Emitir WebSocket para atualização em tempo real no dashboard
            try {
                const wsService = getWebSocketService();
                if (wsService) {
                    (wsService as any).io?.to(`user:${ctx.userId}`).emit('lead_funnel_update', {
                        leadId: lead_id,
                        leadName: lead_name,
                        previousStatus: safeStatus,
                        newStatus: detectedStatus,
                        conversationId: ctx.conversationId,
                        triggeredBy: 'ai_assistant',
                        assistantName: assistant.assistant_name,
                        timestamp: new Date().toISOString(),
                    });
                }
            } catch (wsErr: any) {
                console.warn('[FunnelAI] Falha ao emitir WebSocket de funil:', wsErr.message);
            }

            // 7. Salvar log da ação do funil na conversa (como mensagem de sistema)
            const statusLabels: Record<string, string> = {
                contatado: 'Contatado',
                qualificado: 'Qualificado',
                negociacao: 'Em Negociação',
                convertido: 'Convertido',
                perdido: 'Perdido',
            };
            const newLabel = statusLabels[detectedStatus] || detectedStatus;
            const prevLabel = statusLabels[safeStatus] || safeStatus;

            await query(
                `INSERT INTO messages (user_id, conversation_id, direction, channel, content, status, metadata)
                 VALUES ($1, $2, 'out', $3, $4, 'sent', $5)`,
                [
                    ctx.userId,
                    ctx.conversationId,
                    ctx.channelType,
                    `🤖 Assistente moveu lead de "${prevLabel}" para "${newLabel}" com base na conversa.`,
                    JSON.stringify({ source: 'funnel_automation', is_system: true, previous_status: safeStatus, new_status: detectedStatus }),
                ]
            );

        } catch (err: any) {
            console.error('[FunnelAI] Erro ao processar funil:', err.message);
        }
    }

    /**
     * Classificação do estágio do funil usando IA (chamada leve, ~50 tokens).
     * Só é chamado quando a detecção por palavras-chave não encontra sinal claro.
     */
    private async classifyFunnelWithAI(
        userMessage: string,
        assistantReply: string,
        currentStatus: string,
        providers: ProviderConfig[],
        model?: string
    ): Promise<string | null> {
        try {
            const classificationMessages: AIMessage[] = [
                {
                    role: 'system',
                    content: `Você é um classificador de estágio de funil de vendas. Analise a última mensagem do cliente e classifique em qual estágio de funil ele está.

Estágios possíveis:
- contatado: cliente respondeu mas sem interesse claro ainda
- qualificado: cliente demonstrou interesse, perguntou preço, pediu mais informações
- negociacao: cliente quer fechar, pediu proposta/contrato/link de pagamento
- convertido: cliente confirmou que pagou/comprou/contratou
- perdido: cliente disse que não quer mais
- sem_mudanca: não há sinal claro de mudança de estágio

Estágio atual: ${currentStatus}
Responda APENAS com uma das palavras: contatado, qualificado, negociacao, convertido, perdido, sem_mudanca`,
                },
                {
                    role: 'user',
                    content: `Mensagem do cliente: "${userMessage.substring(0, 500)}"`,
                },
            ];

            const response = await aiService.generateResponseWithFallback(classificationMessages, providers, model);
            const result = response.content?.trim().toLowerCase().replace(/[^a-z_]/g, '');

            const validStages = ['contatado', 'qualificado', 'negociacao', 'convertido', 'perdido'];
            if (result && validStages.includes(result)) {
                console.log(`[FunnelAI] Classificação IA: ${currentStatus} → ${result}`);
                return result;
            }

            return null;
        } catch (err: any) {
            console.warn('[FunnelAI] Falha na classificação IA de funil:', err.message);
            return null;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // AGENDAMENTO AUTOMÁTICO DE REUNIÕES/TAREFAS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Detecta intenção de agendamento na conversa e cria tarefa automaticamente.
     * Emite evento WebSocket (ai_task_created) para o frontend criar a tarefa no TaskManager.
     */
    private async detectAndCreateSchedulingTask(
        ctx: IncomingMessageContext,
        aiReply: string,
        assistant: any,
        providers: ProviderConfig[],
        model?: string
    ): Promise<void> {
        try {
            // 1. Detecção rule-based rápida (evitar chamar IA desnecessariamente)
            const combinedText = `${ctx.messageContent} ${aiReply}`.toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

            const schedulingKeywords = [
                'agendar', 'agendamento', 'reuniao', 'marcar reuniao', 'marcar call',
                'agendar call', 'agendar reuniao', 'videoconferencia', 'video chamada',
                'meet', 'teams', 'zoom', 'chamada', 'horario disponivel', 'quando posso',
                'que dia', 'que hora', 'disponibilidade', 'consulta', 'visita', 'demonstracao',
                'demo', 'apresentacao', 'segunda', 'terca', 'quarta', 'quinta', 'sexta',
                'amanha', 'semana que vem', 'proximo', 'as 9', 'as 10', 'as 11', 'as 14',
                'as 15', 'as 16', 'as 17', 'confirmado para', 'marcado para', 'combinamos'
            ];

            const hasSchedulingIntent = schedulingKeywords.some(kw => combinedText.includes(kw));
            if (!hasSchedulingIntent) return;

            console.log('[AssistantProcessor] 📅 Intenção de agendamento detectada, extraindo detalhes...');

            if (providers.length === 0) return;

            // 2. Usar IA para extrair data/hora e contexto do agendamento
            const now = new Date();
            const todayStr = now.toISOString().split('T')[0];
            const extractionMessages = [
                {
                    role: 'system' as const,
                    content: `Você é um extrator de agendamentos. Analise a conversa e retorne um JSON válido com os campos:
- has_scheduling: boolean (true SOMENTE se há agendamento concreto ou confirmação de data/hora)
- task_title: string (título curto, ex: "Reunião com João Silva")
- task_description: string (descrição breve do que foi agendado)
- task_type: "meeting" | "call" | "follow-up" (tipo mais adequado)
- scheduled_date: string | null (data ISO 8601, use ${todayStr} como hoje para calcular datas relativas)
- priority: "low" | "medium" | "high" | "urgent"
- contact_name: string (nome do contato se mencionado)

Responda APENAS com o JSON, sem markdown ou texto adicional.`
                },
                {
                    role: 'user' as const,
                    content: `Cliente disse: "${ctx.messageContent.substring(0, 400)}"

Assistente respondeu: "${aiReply.substring(0, 400)}"

Contato: ${ctx.contactName || 'Desconhecido'}`,
                }
            ];

            const response = await aiService.generateResponseWithFallback(extractionMessages, providers, model);
            if (!response.content) return;

            // 3. Parsear resposta da IA
            let parsed: any;
            try {
                const clean = response.content.replace(/```json|```/g, '').trim();
                parsed = JSON.parse(clean);
            } catch {
                console.warn('[Scheduling] Resposta IA não é JSON válido:', response.content.substring(0, 100));
                return;
            }

            if (!parsed.has_scheduling) {
                console.log('[Scheduling] IA determinou que não há agendamento concreto.');
                return;
            }

            // 4. Buscar lead_id vinculado à conversa
            let leadId: string | null = null;
            let leadName = ctx.contactName || parsed.contact_name || 'Contato';
            try {
                const convResult = await query(
                    `SELECT c.lead_id, l.name FROM conversations c LEFT JOIN leads l ON l.id = c.lead_id WHERE c.id = $1 LIMIT 1`,
                    [ctx.conversationId]
                );
                if (convResult.rows[0]?.lead_id) {
                    leadId = convResult.rows[0].lead_id;
                    leadName = convResult.rows[0].name || leadName;
                }
            } catch { /* ignore */ }

            // 5. Calcular data da tarefa
            let dueDate: string;
            if (parsed.scheduled_date) {
                try {
                    const d = new Date(parsed.scheduled_date);
                    dueDate = isNaN(d.getTime()) ? new Date(Date.now() + 86400000).toISOString() : d.toISOString();
                } catch {
                    dueDate = new Date(Date.now() + 86400000).toISOString();
                }
            } else {
                dueDate = new Date(Date.now() + 86400000).toISOString(); // Amanhã como fallback
            }

            // 6. Montar objeto da tarefa (mesmo formato do TaskManager frontend)
            const task = {
                id: `task-ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                title: parsed.task_title || `Reunião com ${leadName}`,
                description: parsed.task_description || `Agendamento detectado automaticamente pelo assistente de IA`,
                leadId: leadId || undefined,
                leadName: leadName,
                type: parsed.task_type || 'meeting',
                priority: parsed.priority || 'medium',
                status: 'pending',
                dueDate,
                createdAt: new Date().toISOString(),
                notes: `Criada automaticamente pelo assistente "${assistant.assistant_name}" com base na conversa com ${leadName}.`,
                source: 'ai_assistant',
            };

            console.log(`[Scheduling] ✅ Tarefa criada: "${task.title}" para ${dueDate}`);

            // 7. Gravar no banco de dados (tabela scheduled_conversations para persistência)
            try {
                await query(
                    `INSERT INTO scheduled_conversations
                     (user_id, conversation_id, lead_id, scheduled_date, scheduling_description, status, metadata)
                     VALUES ($1, $2, $3, $4, $5, 'pending', $6)
                     ON CONFLICT DO NOTHING`,
                    [
                        ctx.userId,
                        ctx.conversationId,
                        leadId,
                        new Date(dueDate),
                        task.title,
                        JSON.stringify({ task, source: 'ai_assistant', assistant: assistant.assistant_name })
                    ]
                );
                console.log('[Scheduling] 💾 Agendamento salvo no banco scheduled_conversations');
            } catch (dbErr: any) {
                if (dbErr.code !== '42P01') { // Ignorar se tabela não existe
                    console.warn('[Scheduling] Erro ao salvar no banco:', dbErr.message);
                }
            }

            // 8. Emitir WebSocket para o frontend criar a tarefa no localStorage (TaskManager)
            try {
                const wsService = getWebSocketService();
                if (wsService) {
                    wsService.emitToUser(ctx.userId, 'ai_task_created', { task });
                    console.log(`[Scheduling] 📡 WebSocket emitido: ai_task_created → user ${ctx.userId}`);
                }
            } catch (wsErr: any) {
                console.warn('[Scheduling] Falha ao emitir WebSocket:', wsErr.message);
            }

        } catch (err: any) {
            console.warn('[Scheduling] Erro ao detectar agendamento (não crítico):', err.message);
        }
    }
}

// Singleton
export const assistantProcessor = new AssistantProcessorService();
