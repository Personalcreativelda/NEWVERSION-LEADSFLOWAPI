// Serviço de IA - suporta OpenAI, Gemini e Anthropic
import { query } from '../database/connection';

export type AIProvider = 'openai' | 'gemini' | 'anthropic';

/** Par provedor → chave de API pronto para uso */
export interface ProviderConfig {
    provider: AIProvider;
    apiKey: string;
}

/**
 * Detecta os provedores de IA disponíveis lendo as variáveis de ambiente.
 * Retorna a lista ordenada pela prioridade:
 *   1. Provedor preferido (argumento > AI_PROVIDER do env > gemini)
 *   2. Demais provedores com chave configurada, na ordem padrão: gemini → openai → anthropic
 *
 * Qualquer chave ausente ou vazia é ignorada automaticamente.
 */
export function getAvailableProviders(preferredProvider?: AIProvider): ProviderConfig[] {
    const DEFAULT_ORDER: AIProvider[] = ['gemini', 'openai', 'anthropic'];
    const envPreferred = (process.env.AI_PROVIDER?.trim() || 'gemini') as AIProvider;
    const primary = preferredProvider || envPreferred;

    const keyMap: Record<AIProvider, string> = {
        gemini:    process.env.GEMINI_API_KEY?.trim()    || '',
        openai:    process.env.OPENAI_API_KEY?.trim()    || '',
        anthropic: process.env.ANTHROPIC_API_KEY?.trim() || '',
    };

    // Ordenar: primary primeiro, depois o resto na ordem padrão
    const ordered: AIProvider[] = [primary, ...DEFAULT_ORDER.filter(p => p !== primary)];

    const available = ordered
        .map(p  => ({ provider: p, apiKey: keyMap[p] }))
        .filter(p => p.apiKey !== '');

    return available;
}

export interface AIMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface AIResponse {
    content: string;
    tokensUsed: number;
    provider: AIProvider;
    model: string;
}

export interface ContactMemory {
    id?: string;
    user_assistant_id: string;
    contact_phone: string;
    contact_name?: string;
    summary?: string;
    preferences: Record<string, any>;
    last_topics: string[];
    total_conversations: number;
    first_contact_at?: string;
    last_contact_at?: string;
}

export class AIService {
    /**
     * Gera resposta usando o provedor de IA configurado.
     * Para uso simples com um único provedor já conhecido.
     */
    async generateResponse(
        messages: AIMessage[],
        provider: AIProvider,
        apiKey: string,
        model?: string
    ): Promise<AIResponse> {
        if (provider === 'openai') {
            return this.callOpenAI(messages, apiKey, model || 'gpt-4o-mini');
        } else if (provider === 'gemini') {
            return this.callGemini(messages, apiKey, model || 'gemini-2.0-flash');
        } else if (provider === 'anthropic') {
            return this.callAnthropic(messages, apiKey, model || 'claude-3-haiku-20240307');
        }
        throw new Error(`Provedor de IA não suportado: ${provider}`);
    }

    /**
     * Gera resposta tentando cada provedor disponível em ordem.
     * Se um provedor falhar (erro de API, timeout, quota, etc.),
     * tenta automaticamente o próximo na lista.
     * Lança erro apenas quando todos falharem.
     */
    async generateResponseWithFallback(
        messages: AIMessage[],
        providers: ProviderConfig[],
        model?: string
    ): Promise<AIResponse> {
        if (providers.length === 0) {
            throw new Error(
                'Nenhum provedor de IA configurado. ' +
                'Adicione GEMINI_API_KEY, OPENAI_API_KEY ou ANTHROPIC_API_KEY no .env'
            );
        }

        const errors: string[] = [];

        for (let i = 0; i < providers.length; i++) {
            const { provider, apiKey } = providers[i];
            try {
                if (i === 0) {
                    console.log(`[AIService] 🤖 Usando provedor: ${provider}`);
                } else {
                    console.log(`[AIService] 🔄 Fallback: tentando ${provider} (${i + 1}/${providers.length})`);
                }
                const result = await this.generateResponse(messages, provider, apiKey, model);
                if (i > 0) {
                    console.log(`[AIService] ✅ Fallback para ${provider} bem-sucedido`);
                }
                return result;
            } catch (err: any) {
                const msg = err?.message || String(err);
                console.warn(`[AIService] ⚠️ Provedor ${provider} falhou: ${msg}`);
                errors.push(`${provider}: ${msg}`);
            }
        }

        throw new Error(`Todos os provedores de IA falharam:\n${errors.join('\n')}`);
    }

    /**
     * Chama a API da Anthropic (Claude)
     */
    private async callAnthropic(messages: AIMessage[], apiKey: string, model: string): Promise<AIResponse> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        // Separar system prompt das mensagens de chat
        const systemContent = messages.find(m => m.role === 'system')?.content || '';
        const chatMessages = messages
            .filter(m => m.role !== 'system')
            .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

        try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({
                    model,
                    max_tokens: 1024,
                    ...(systemContent ? { system: systemContent } : {}),
                    messages: chatMessages,
                }),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData = await response.text();
                throw new Error(`Anthropic API error ${response.status}: ${errorData}`);
            }

            const data = await response.json();
            const text = data.content?.[0]?.text || '';
            const tokensUsed = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);

            return { content: text, tokensUsed, provider: 'anthropic', model };
        } catch (error: any) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Anthropic API timeout (30s)');
            }
            throw error;
        }
    }

    /**
     * Chama a API do OpenAI
     */
    private async callOpenAI(messages: AIMessage[], apiKey: string, model: string): Promise<AIResponse> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model,
                    messages,
                    max_tokens: 1024,
                    temperature: 0.7,
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData = await response.text();
                throw new Error(`OpenAI API error ${response.status}: ${errorData}`);
            }

            const data = await response.json();
            const choice = data.choices?.[0];

            return {
                content: choice?.message?.content || '',
                tokensUsed: data.usage?.total_tokens || 0,
                provider: 'openai',
                model
            };
        } catch (error: any) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('OpenAI API timeout (30s)');
            }
            throw error;
        }
    }

    /**
     * Chama a API do Google Gemini
     */
    private async callGemini(messages: AIMessage[], apiKey: string, model: string): Promise<AIResponse> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        // Converter formato OpenAI para Gemini
        const systemInstruction = messages.find(m => m.role === 'system')?.content || '';
        const contents = messages
            .filter(m => m.role !== 'system')
            .map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }]
            }));

        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents,
                    systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
                    generationConfig: {
                        maxOutputTokens: 1024,
                        temperature: 0.7,
                    }
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData = await response.text();
                throw new Error(`Gemini API error ${response.status}: ${errorData}`);
            }

            const data = await response.json();
            const candidate = data.candidates?.[0];
            const text = candidate?.content?.parts?.[0]?.text || '';
            const tokensUsed = (data.usageMetadata?.promptTokenCount || 0) +
                              (data.usageMetadata?.candidatesTokenCount || 0);

            return {
                content: text,
                tokensUsed,
                provider: 'gemini',
                model
            };
        } catch (error: any) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Gemini API timeout (30s)');
            }
            throw error;
        }
    }

    /**
     * Busca histórico de mensagens de uma conversa para contexto (curto prazo - 20 mensagens)
     */
    async getConversationHistory(conversationId: string, limit: number = 20): Promise<AIMessage[]> {
        const result = await query(
            `SELECT direction, content, metadata FROM messages
             WHERE conversation_id = $1 AND content IS NOT NULL AND content != ''
             ORDER BY created_at DESC LIMIT $2`,
            [conversationId, limit]
        );

        // Reverter para ordem cronológica
        return result.rows.reverse().map((row: Record<string, any>) => {
            const meta = (row.metadata || {}) as Record<string, any>;
            const source: string = meta.source || '';
            const fromMe: boolean = meta.fromMe === true || meta.fromMe === 'true';

            // Regra de mapeamento direction → role para a IA:
            //   direction='in'  → sempre do contato → role='user'
            //   direction='out' e source='ai_assistant' → resposta da IA → role='assistant'
            //   direction='out' e source='phone' (echo do device) → veio do contato no device → role='user'
            //   direction='out' e source='user' (enviado pela dashboard) → role='assistant'
            let role: 'user' | 'assistant';
            if (row.direction === 'in') {
                role = 'user';
            } else if (source === 'ai_assistant' || source === 'user') {
                role = 'assistant';
            } else if (source === 'phone' || fromMe === false) {
                // Echo de mensagem enviada pelo device fisico do contato (comum em @lid)
                role = 'user';
            } else {
                // Padrão seguro: se saiu do sistema, tratar como assistant
                role = 'assistant';
            }

            return { role, content: row.content as string };
        });
    }

    /**
     * Janela de contexto cross-sessão: busca as últimas N mensagens de conversas
     * anteriores do mesmo contato (remoteJid), excluindo a conversa atual.
     * Usado para manter continuidade entre sessões distintas.
     */
    async getCrossConversationContext(
        userId: string,
        remoteJid: string,
        currentConversationId: string,
        limit: number = 10
    ): Promise<{ messages: AIMessage[]; lastSessionDate: string | null }> {
        try {
            const result = await query(
                `SELECT m.direction, m.content, m.created_at
                 FROM messages m
                 JOIN conversations c ON m.conversation_id = c.id
                 WHERE c.user_id = $1
                   AND c.remote_jid = $2
                   AND c.id != $3
                   AND m.content IS NOT NULL
                   AND TRIM(m.content) != ''
                   AND TRIM(m.content) != '[Mídia]'
                 ORDER BY m.created_at DESC
                 LIMIT $4`,
                [userId, remoteJid, currentConversationId, limit]
            );

            if (result.rows.length === 0) {
                return { messages: [], lastSessionDate: null };
            }

            // Reverter para ordem cronológica
            const rows = (result.rows as Record<string, any>[]).reverse();
            const lastSessionDate: string | null = rows[rows.length - 1]?.created_at || null;

            const messages: AIMessage[] = rows.map((row) => ({
                role: row.direction === 'in' ? 'user' as const : 'assistant' as const,
                content: row.content as string,
            }));

            return { messages, lastSessionDate };
        } catch (err: any) {
            if (err.code === '42P01') return { messages: [], lastSessionDate: null };
            console.error('[AIService] Erro ao buscar contexto cross-sessão:', err.message);
            return { messages: [], lastSessionDate: null };
        }
    }

    /**
     * Busca memória de longo prazo de um contato para um assistente
     */
    async getContactMemory(userAssistantId: string, contactPhone: string): Promise<ContactMemory | null> {
        try {
            const result = await query(
                `SELECT * FROM assistant_contact_memory
                 WHERE user_assistant_id = $1 AND contact_phone = $2`,
                [userAssistantId, contactPhone]
            );
            return result.rows[0] || null;
        } catch (err: any) {
            if (err.code === '42P01') return null; // tabela ainda não existe
            console.error('[AIService] Erro ao buscar memória do contato:', err.message);
            return null;
        }
    }

    /**
     * Atualiza a memória de longo prazo do contato após uma interação
     * É chamado de forma assíncrona, não bloqueia a resposta ao cliente
     */
    async updateContactMemory(data: {
        userAssistantId: string;
        contactPhone: string;
        contactName?: string;
        messageIn: string;
        messageOut: string;
        provider: AIProvider;
        apiKey: string;
        model?: string;
    }): Promise<void> {
        try {
            // 1. Buscar memória atual
            const existing = await this.getContactMemory(data.userAssistantId, data.contactPhone);

            // 2. Extrair tópico da conversa atual via IA
            const topicPrompt: AIMessage[] = [
                {
                    role: 'system',
                    content: 'Você é um extrator de tópicos. Dado um par de mensagens, responda APENAS com o tema principal em 3-5 palavras em português. Nada mais.'
                },
                {
                    role: 'user',
                    content: `Cliente: "${data.messageIn}"\nAssistente: "${data.messageOut}"`
                }
            ];

            let newTopic = '';
            try {
                const topicResponse = await this.generateResponse(topicPrompt, data.provider, data.apiKey, data.model);
                newTopic = topicResponse.content.trim().substring(0, 60);
            } catch {
                newTopic = data.messageIn.substring(0, 40);
            }

            // 3. Atualizar tópicos recentes (manter até 10)
            const existingTopics: string[] = existing?.last_topics || [];
            const updatedTopics = [newTopic, ...existingTopics.filter(t => t !== newTopic)].slice(0, 10);

            const totalConversations = (existing?.total_conversations || 0) + 1;

            // 4. Atualizar resumo a cada 5 conversas ou na primeira
            let newSummary = existing?.summary || '';
            if (totalConversations === 1 || totalConversations % 5 === 0) {
                const summaryPrompt: AIMessage[] = [
                    {
                        role: 'system',
                        content: 'Você é um assistente que cria perfis de clientes. Dado o histórico, crie um resumo CONCISO (máximo 150 palavras) do perfil: interesses, preferências, histórico relevante. Responda em português.'
                    },
                    {
                        role: 'user',
                        content: `Resumo anterior: ${existing?.summary || 'Nenhum'}\n\nÚltimos tópicos: ${updatedTopics.join(', ')}\n\nÚltima interação:\nCliente: "${data.messageIn}"\nAssistente: "${data.messageOut}"`
                    }
                ];

                try {
                    const summaryResponse = await this.generateResponse(summaryPrompt, data.provider, data.apiKey, data.model);
                    newSummary = summaryResponse.content.trim();
                } catch {
                    // Manter resumo anterior se falhar
                }
            }

            // 5. Upsert na tabela de memória
            await query(
                `INSERT INTO assistant_contact_memory
                    (user_assistant_id, contact_phone, contact_name, summary, last_topics, total_conversations, last_contact_at)
                 VALUES ($1, $2, $3, $4, $5, $6, NOW())
                 ON CONFLICT (user_assistant_id, contact_phone)
                 DO UPDATE SET
                    contact_name = COALESCE($3, assistant_contact_memory.contact_name),
                    summary = $4,
                    last_topics = $5,
                    total_conversations = $6,
                    last_contact_at = NOW()`,
                [
                    data.userAssistantId,
                    data.contactPhone,
                    data.contactName || null,
                    newSummary,
                    updatedTopics,
                    totalConversations
                ]
            );

            console.log(`[AIService] ✅ Memória atualizada para contato ${data.contactPhone} (total: ${totalConversations} conv.)`);
        } catch (err: any) {
            if (err.code !== '42P01') {
                console.error('[AIService] Erro ao atualizar memória:', err.message);
            }
        }
    }

    /**
     * Transcreve um arquivo de áudio usando OpenAI Whisper
     */
    async transcribeAudio(audioUrl: string, apiKey: string): Promise<string> {
        try {
            console.log('[AIService] Baixando áudio para transcrição:', audioUrl);
            const audioResponse = await fetch(audioUrl);
            if (!audioResponse.ok) {
                throw new Error(`Falha ao baixar áudio: ${audioResponse.statusText}`);
            }

            const audioBlob = await audioResponse.blob();
            
            const formData = new FormData();
            formData.append('file', audioBlob, 'audio.ogg'); // Whisper requires a filename
            formData.append('model', 'whisper-1');
            formData.append('language', 'pt'); // Optimize for Portuguese

            console.log('[AIService] Enviando áudio para OpenAI Whisper...');
            const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                },
                body: formData as any
            });

            if (!whisperResponse.ok) {
                const errorData = await whisperResponse.text();
                throw new Error(`Erro na API Whisper: ${whisperResponse.status} - ${errorData}`);
            }

            const data = await whisperResponse.json();
            return data.text || '';
        } catch (error: any) {
            console.error('[AIService] Erro na transcrição:', error.message);
            throw new Error(`Falha na transcrição: ${error.message}`);
        }
    }

    // ==========================================
    // AUDIO GENERATION (ELEVENLABS)
    // ==========================================
    async generateElevenLabsAudio(text: string, voiceId: string, apiKey: string): Promise<Buffer> {
        try {
            console.log(`[AIService] Gerando áudio via ElevenLabs (Voice: ${voiceId})...`);
            
            const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
                method: 'POST',
                headers: {
                    'Accept': 'audio/mpeg',
                    'xi-api-key': apiKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: text,
                    model_id: "eleven_multilingual_v2",
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.75
                    }
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`ElevenLabs API Error: ${response.status} - ${errorText}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            return Buffer.from(arrayBuffer);
        } catch (error: any) {
            console.error('[AIService] Erro na geração de áudio ElevenLabs:', error.message);
            throw new Error(`Falha na geração de áudio: ${error.message}`);
        }
    }
}
