// Serviço de IA - suporta OpenAI, Gemini e Anthropic
import { query } from '../database/connection';
import * as zlib from 'zlib';

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
             WHERE conversation_id = $1
               AND content IS NOT NULL
               AND content != ''
               AND TRIM(content) NOT IN ('[Mídia]', '[image]', '[audio]', '[video]', '[document]', '[sticker]')
               AND content NOT LIKE '[O usuário enviou%'
               AND content NOT LIKE '[The user sent%'
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
                 VALUES ($1, $2, $3, $4, $5::jsonb, $6, NOW())
                 ON CONFLICT (user_assistant_id, contact_phone)
                 DO UPDATE SET
                    contact_name = COALESCE($3, assistant_contact_memory.contact_name),
                    summary = $4,
                    last_topics = $5::jsonb,
                    total_conversations = $6,
                    last_contact_at = NOW()`,
                [
                    data.userAssistantId,
                    data.contactPhone,
                    data.contactName || null,
                    newSummary,
                    JSON.stringify(updatedTopics),
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
                    model_id: 'eleven_multilingual_v2',
                    // Human-like voice settings — optimised for natural conversational speech in Portuguese
                    voice_settings: {
                        stability: 0.40,          // lower = more expressive/varied tone (robotic at 1.0)
                        similarity_boost: 0.80,   // stay close to original voice character
                        style: 0.20,              // slight emotion/expressiveness
                        use_speaker_boost: true,  // improved clarity
                        speed: 0.93               // slightly slower than default — more natural cadence
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

    // ==========================================
    // IMAGE ANALYSIS (OpenAI Vision / Gemini Vision)
    // ==========================================

    /**
     * Analyzes an image and returns a textual description.
     * Tries OpenAI Vision (gpt-4o) first, then Gemini multimodal as fallback.
     * Always downloads the image so it works with authenticated MinIO URLs.
     */
    async analyzeImageWithVision(
        imageUrl: string,
        userText: string,
        providers: ProviderConfig[]
    ): Promise<string> {
        console.log(`[AIService] 🖼️ analyzeImageWithVision — url=${imageUrl.substring(0, 80)} userText="${userText.substring(0, 60)}"`);
        const prompt = userText
            ? `O usuário enviou uma imagem com o seguinte texto: "${userText}". Descreva a imagem em detalhes e responda ao usuário considerando o contexto da imagem e o que ele escreveu.`
            : 'Descreva esta imagem em detalhes. Inclua qualquer texto visível, objetos, pessoas, marcas, cores, contexto ou informação relevante que um assistente precisaria saber para responder ao cliente.';

        // Download once — used as base64 for Gemini; URL sent directly for OpenAI
        let imageBase64: string | null = null;
        let imageMimeType = 'image/jpeg';

        if (imageUrl.startsWith('data:')) {
            // data URI — extract base64 and mime type directly (no HTTP fetch needed)
            const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
                imageMimeType = match[1] || 'image/jpeg';
                imageBase64 = match[2];
            }
        } else {
            try {
                const imgRes = await fetch(imageUrl);
                if (imgRes.ok) {
                    imageMimeType = imgRes.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
                    imageBase64 = Buffer.from(await imgRes.arrayBuffer()).toString('base64');
                }
            } catch (e) {
                console.warn('[AIService] Could not download image for Vision:', e);
            }
        }

        // ── Try OpenAI gpt-4o ──────────────────────────────────────────────────
        const openAI = providers.find(p => p.provider === 'openai');
        if (openAI) {
            try {
                const imageContent = imageBase64
                    ? { type: 'image_url', image_url: { url: `data:${imageMimeType};base64,${imageBase64}`, detail: 'auto' } }
                    : { type: 'image_url', image_url: { url: imageUrl, detail: 'auto' } };

                const res = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${openAI.apiKey}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: 'gpt-4o',
                        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, imageContent] }],
                        max_tokens: 800
                    })
                });
                if (res.ok) {
                    const data = await res.json();
                    const text = data.choices?.[0]?.message?.content || '';
                    if (text.length > 10) {
                        console.log('[AIService] ✅ Image analyzed via OpenAI Vision');
                        return text;
                    }
                } else {
                    console.warn('[AIService] OpenAI Vision error:', await res.text());
                }
            } catch (e: any) {
                console.warn('[AIService] OpenAI Vision failed:', e.message);
            }
        }

        // ── Try Gemini multimodal ──────────────────────────────────────────────
        const gemini = providers.find(p => p.provider === 'gemini');
        if (gemini && imageBase64) {
            try {
                const res = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${gemini.apiKey}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ parts: [
                                { text: prompt },
                                { inline_data: { mime_type: imageMimeType, data: imageBase64 } }
                            ]}]
                        })
                    }
                );
                if (res.ok) {
                    const data = await res.json();
                    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                    if (text.length > 10) {
                        console.log('[AIService] ✅ Image analyzed via Gemini Vision');
                        return text;
                    }
                } else {
                    console.warn('[AIService] Gemini Vision error:', await res.text());
                }
            } catch (e: any) {
                console.warn('[AIService] Gemini Vision failed:', e.message);
            }
        }

        throw new Error('No vision-capable AI provider available or analysis failed');
    }

    // ==========================================
    // DOCUMENT TEXT EXTRACTION
    // ==========================================

    /**
     * Downloads a file and extracts readable text content.
     * - Text/CSV/JSON/Markdown: decoded as UTF-8
     * - PDF: decompresses flate streams + Gemini fallback (supports scanned PDFs)
     * - Handles both HTTP URLs and data: URIs
     * Returns empty string on failure so callers can degrade gracefully.
     */
    async extractDocumentText(
        fileUrl: string,
        mimeType?: string,
        geminiApiKey?: string,
        maxChars = 4000
    ): Promise<string> {
        let buffer: Buffer;
        let contentType: string;

        try {
            // Handle data: URIs directly (no fetch needed — decode base64 inline)
            if (fileUrl.startsWith('data:')) {
                const commaIdx = fileUrl.indexOf(',');
                const meta = fileUrl.substring(5, commaIdx); // e.g. "application/pdf;base64"
                const raw = fileUrl.substring(commaIdx + 1);
                contentType = mimeType || meta.split(';')[0] || 'application/octet-stream';
                buffer = meta.includes('base64')
                    ? Buffer.from(raw, 'base64')
                    : Buffer.from(decodeURIComponent(raw));
            } else {
                const res = await fetch(fileUrl);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                contentType = mimeType || res.headers.get('content-type') || 'application/octet-stream';
                buffer = Buffer.from(await res.arrayBuffer());
            }
        } catch (e: any) {
            console.warn('[AIService] Failed to download document:', e.message);
            return '';
        }

        const urlLower = fileUrl.startsWith('data:') ? '' : fileUrl.toLowerCase();

        // ── Plain text variants ────────────────────────────────────────────────
        const isText =
            contentType.includes('text/') ||
            contentType.includes('application/json') ||
            urlLower.endsWith('.txt') || urlLower.endsWith('.csv') ||
            urlLower.endsWith('.md')  || urlLower.endsWith('.json');

        if (isText) {
            return buffer.toString('utf-8').substring(0, maxChars);
        }

        // ── PDF ────────────────────────────────────────────────────────────────
        // 'document' is the generic type from Evolution API WhatsApp webhook — treat as PDF
        const isPdf = contentType.includes('pdf') || urlLower.endsWith('.pdf')
            || contentType === 'document' || mimeType === 'document';
        if (isPdf) {
            console.log(`[AIService] 📄 Processing PDF — size=${buffer.length} bytes, hasGeminiKey=${!!geminiApiKey}`);

            // ── Method 1: Decompress flate/deflate streams (handles modern PDFs) ──
            // Most PDFs from Word, LibreOffice, browsers use FlateDecode compression.
            const inflatedText = await this._extractPdfStreams(buffer);
            if (inflatedText.length > 100) {
                console.log(`[AIService] ✅ PDF extracted via zlib decompression: ${inflatedText.length} chars`);
                return inflatedText.substring(0, maxChars);
            }

            // ── Method 2: Uncompressed BT...ET text blocks (simple/legacy PDFs) ──
            const uncompressedText = this._extractPdfTextBlocks(buffer.toString('latin1'));
            if (uncompressedText.length > 100) {
                console.log(`[AIService] ✅ PDF extracted via uncompressed stream parser: ${uncompressedText.length} chars`);
                return uncompressedText.substring(0, maxChars);
            }

            // ── Method 3: Gemini native PDF understanding (supports scanned/image PDFs) ──
            if (geminiApiKey) {
                try {
                    const b64 = buffer.toString('base64');
                    const res = await fetch(
                        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                contents: [{ parts: [
                                    { text: 'Extraia e retorne TODO o texto deste documento, preservando a estrutura e parágrafos. Retorne apenas o texto extraído, sem comentários adicionais.' },
                                    { inline_data: { mime_type: 'application/pdf', data: b64 } }
                                ]}]
                            })
                        }
                    );
                    if (res.ok) {
                        const data = await res.json();
                        const extracted = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                        if (extracted.length > 50) {
                            console.log('[AIService] ✅ PDF extracted via Gemini:', extracted.length, 'chars');
                            return extracted.substring(0, maxChars);
                        }
                        console.warn('[AIService] Gemini returned short text for PDF:', extracted.length, 'chars');
                    } else {
                        const errText = await res.text().catch(() => '');
                        console.warn(`[AIService] Gemini PDF error (${res.status}):`, errText.substring(0, 200));
                    }
                } catch (e: any) {
                    console.warn('[AIService] Gemini PDF extraction failed:', e.message);
                }
            }

            // ── Method 4: Generic printable char scan (absolute last resort) ──
            const pdfStr = buffer.toString('latin1');
            const words: string[] = [];
            let current = '';
            for (let i = 0; i < pdfStr.length; i++) {
                const c = pdfStr.charCodeAt(i);
                if ((c >= 32 && c <= 126) || (c >= 160 && c <= 255)) {
                    current += pdfStr[i];
                } else {
                    if (current.length >= 4) words.push(current.trim());
                    current = '';
                }
            }
            if (current.length >= 4) words.push(current.trim());
            const joined = words.filter(w => /[a-zA-ZÀ-ÿ]{2,}/.test(w)).join(' ');
            if (joined.length > 100) {
                console.log('[AIService] ✅ PDF text extracted via char scan');
                return joined.substring(0, maxChars);
            }

            console.warn('[AIService] Could not extract meaningful text from PDF');
            return '';
        }

        // ── Other binary formats (DOCX, XLSX, etc.) ───────────────────────────
        const isDocx =
            contentType.includes('officedocument.wordprocessingml') ||
            urlLower.endsWith('.docx');
        if (isDocx) {
            const raw = buffer.toString('binary');
            const matches = raw.match(/<w:t[^>]*>([^<]+)<\/w:t>/g) || [];
            const text = matches
                .map(m => m.replace(/<[^>]+>/g, '').trim())
                .filter(Boolean)
                .join(' ');
            if (text.length > 50) {
                console.log('[AIService] ✅ DOCX text extracted');
                return text.substring(0, maxChars);
            }
        }

        return '';
    }

    /** Extracts text from BT...ET operator blocks in a PDF text string */
    private _extractPdfTextBlocks(pdfStr: string): string {
        const streamTexts: string[] = [];
        const btEtRegex = /BT\s+([\s\S]*?)\s+ET/g;
        let blockMatch;
        while ((blockMatch = btEtRegex.exec(pdfStr)) !== null) {
            const block = blockMatch[1];
            // Parenthesized strings: (text here)
            const parenRegex = /\(([^()\\\n]|\\[\s\S])*\)/g;
            let textMatch;
            while ((textMatch = parenRegex.exec(block)) !== null) {
                const raw = textMatch[0].slice(1, -1)
                    .replace(/\\n/g, ' ').replace(/\\r/g, ' ').replace(/\\t/g, ' ')
                    .replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\\/g, '\\')
                    .trim();
                if (raw.length > 0 && /[a-zA-ZÀ-ÿ0-9]/.test(raw)) {
                    streamTexts.push(raw);
                }
            }
            // Hex strings: <4865...> (UTF-16BE)
            const hexRegex = /<([0-9A-Fa-f]{4,})>/g;
            let hexMatch;
            while ((hexMatch = hexRegex.exec(block)) !== null) {
                const hex = hexMatch[1];
                if (hex.length % 4 === 0) {
                    try {
                        let decoded = '';
                        for (let i = 0; i < hex.length; i += 4) {
                            const code = parseInt(hex.substring(i, i + 4), 16);
                            if (code > 31 && code < 0xFFFE) decoded += String.fromCharCode(code);
                        }
                        if (decoded.length > 0 && /[a-zA-ZÀ-ÿ0-9]/.test(decoded)) {
                            streamTexts.push(decoded);
                        }
                    } catch { /* ignore */ }
                }
            }
        }
        return streamTexts.join(' ').replace(/\s{2,}/g, ' ').trim();
    }

    private _decodeAsciiHex(data: string): Buffer {
        const cleaned = data.replace(/[\s\r\n\t]/g, '');
        const endIdx = cleaned.indexOf('>');
        const hex = endIdx >= 0 ? cleaned.slice(0, endIdx) : cleaned;
        const bytes: number[] = [];
        for (let i = 0; i < hex.length; i += 2) {
            const a = hex[i];
            const b = hex[i + 1] || '0';
            if (!/[0-9A-Fa-f]/.test(a) || !/[0-9A-Fa-f]/.test(b)) break;
            bytes.push(parseInt(a + b, 16));
        }
        return Buffer.from(bytes);
    }

    private _decodeAscii85(data: string): Buffer {
        const cleaned = data.replace(/[\s\r\n\t]/g, '');
        const bytes: number[] = [];
        let tuple: number[] = [];

        for (let i = 0; i < cleaned.length; i++) {
            const ch = cleaned[i];
            if (ch === 'z') {
                tuple = [];
                bytes.push(0, 0, 0, 0);
                continue;
            }
            if (ch === '~') break;
            if (ch === '>') break;
            const code = ch.charCodeAt(0);
            if (code < 33 || code > 117) continue;
            tuple.push(code - 33);
            if (tuple.length === 5) {
                const value = tuple.reduce((acc, v) => acc * 85 + v, 0);
                bytes.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
                tuple = [];
            }
        }

        if (tuple.length > 0) {
            while (tuple.length < 5) tuple.push(84);
            const value = tuple.reduce((acc, v) => acc * 85 + v, 0);
            const outCount = tuple.length - 1;
            const decoded = [
                (value >>> 24) & 0xff,
                (value >>> 16) & 0xff,
                (value >>> 8) & 0xff,
                value & 0xff,
            ];
            bytes.push(...decoded.slice(0, outCount));
        }

        return Buffer.from(bytes);
    }

    /** Decompresses FlateDecode PDF streams and extracts text from them */
    private async _extractPdfStreams(buffer: Buffer): Promise<string> {
        const raw = buffer.toString('binary');
        const allTexts: string[] = [];
        const streamStartRegex = /stream\r?\n/g;
        const streamEndStr = 'endstream';

        let match;
        while ((match = streamStartRegex.exec(raw)) !== null) {
            const dataStart = match.index + match[0].length;
            const dictSnippet = raw.substring(Math.max(0, match.index - 500), match.index);
            const hasFlate = /FlateDecode|\/Fl\b/.test(dictSnippet);
            const hasAsciiHex = /ASCIIHexDecode|\/AHx\b/.test(dictSnippet);
            const hasAscii85 = /ASCII85Decode|\/A85\b/.test(dictSnippet);
            if (!hasFlate && !hasAsciiHex && !hasAscii85) continue;

            const dataEnd = raw.indexOf(streamEndStr, dataStart);
            if (dataEnd < 0 || dataEnd - dataStart > 5_000_000) continue;

            let streamData = Buffer.from(raw.substring(dataStart, dataEnd), 'binary');
            if (hasAsciiHex) {
                streamData = this._decodeAsciiHex(raw.substring(dataStart, dataEnd));
            } else if (hasAscii85) {
                streamData = this._decodeAscii85(raw.substring(dataStart, dataEnd));
            }

            if (streamData.length < 10) continue;

            try {
                let decompressed = streamData.toString('latin1');
                if (hasFlate) {
                    const inflated = await new Promise<Buffer>((resolve, reject) => {
                        zlib.inflate(streamData, (err, result) => {
                            if (err) {
                                zlib.inflateRaw(streamData, (err2, result2) => {
                                    if (err2) reject(err2);
                                    else resolve(result2);
                                });
                            } else {
                                resolve(result);
                            }
                        });
                    });
                    decompressed = inflated.toString('latin1');
                }

                if (!decompressed.includes('BT') || !decompressed.includes('ET')) continue;
                const text = this._extractPdfTextBlocks(decompressed);
                if (text.length > 10) allTexts.push(text);
            } catch {
                // Silently skip streams that fail to decode or decompress
            }
        }

        return allTexts.join('\n').replace(/\s{2,}/g, ' ').trim();
    }
}
