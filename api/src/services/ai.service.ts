// Serviço de IA - suporta OpenAI e Gemini
import { query } from '../database/connection';

export type AIProvider = 'openai' | 'gemini';

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

export class AIService {
    /**
     * Gera resposta usando o provedor de IA configurado
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
        }
        throw new Error(`Provedor de IA não suportado: ${provider}`);
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
     * Busca histórico de mensagens de uma conversa para contexto
     */
    async getConversationHistory(conversationId: string, limit: number = 10): Promise<AIMessage[]> {
        const result = await query(
            `SELECT direction, content FROM messages
             WHERE conversation_id = $1 AND content IS NOT NULL AND content != ''
             ORDER BY created_at DESC LIMIT $2`,
            [conversationId, limit]
        );

        // Reverter para ordem cronológica
        return result.rows.reverse().map((row: Record<string, any>) => ({
            role: row.direction === 'in' ? 'user' as const : 'assistant' as const,
            content: row.content
        }));
    }
}
