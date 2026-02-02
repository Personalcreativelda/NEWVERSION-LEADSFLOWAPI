// INBOX: Service para gerenciar assistentes virtuais de IA
import { query } from '../database/connection';

export interface AIAssistant {
    id: string;
    user_id: string;
    channel_id: string | null;
    name: string;
    mode: 'webhook' | 'llm';
    webhook_url?: string;
    webhook_headers?: any;
    llm_provider?: 'gemini' | 'openai' | 'anthropic';
    llm_api_key?: string;
    llm_model?: string;
    llm_system_prompt?: string;
    settings: any;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export class AIAssistantsService {
    /**
     * Lista todos os assistentes do usuário
     */
    async findAll(userId: string): Promise<AIAssistant[]> {
        const result = await query(
            `SELECT 
        a.*,
        c.name as channel_name,
        c.type as channel_type
       FROM ai_assistants a
       LEFT JOIN channels c ON a.channel_id = c.id
       WHERE a.user_id = $1 
       ORDER BY a.created_at DESC`,
            [userId]
        );
        return result.rows;
    }

    /**
     * Busca assistente por ID
     */
    async findById(id: string, userId: string): Promise<AIAssistant | null> {
        const result = await query(
            'SELECT * FROM ai_assistants WHERE id = $1 AND user_id = $2',
            [id, userId]
        );
        return result.rows[0] || null;
    }

    /**
     * Busca assistentes ativos para um canal
     */
    async findActiveByChannel(channelId: string, userId: string): Promise<AIAssistant[]> {
        const result = await query(
            `SELECT * FROM ai_assistants 
       WHERE user_id = $1 
       AND (channel_id = $2 OR channel_id IS NULL)
       AND is_active = true
       ORDER BY channel_id NULLS LAST`,
            [userId, channelId]
        );
        return result.rows;
    }

    /**
     * Cria novo assistente
     */
    async create(data: Partial<AIAssistant>, userId: string): Promise<AIAssistant> {
        const result = await query(
            `INSERT INTO ai_assistants (
        user_id, channel_id, name, mode, 
        webhook_url, webhook_headers,
        llm_provider, llm_api_key, llm_model, llm_system_prompt,
        settings, is_active
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
            [
                userId,
                data.channel_id || null,
                data.name,
                data.mode,
                data.webhook_url || null,
                JSON.stringify(data.webhook_headers || {}),
                data.llm_provider || null,
                data.llm_api_key || null, // TODO: Criptografar
                data.llm_model || null,
                data.llm_system_prompt || null,
                JSON.stringify(data.settings || { enabled: true, auto_respond: false }),
                data.is_active !== undefined ? data.is_active : true
            ]
        );
        return result.rows[0];
    }

    /**
     * Atualiza assistente
     */
    async update(id: string, data: Partial<AIAssistant>, userId: string): Promise<AIAssistant | null> {
        const fields: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (data.name !== undefined) {
            fields.push(`name = $${paramIndex++}`);
            values.push(data.name);
        }

        if (data.channel_id !== undefined) {
            fields.push(`channel_id = $${paramIndex++}`);
            values.push(data.channel_id);
        }

        if (data.mode !== undefined) {
            fields.push(`mode = $${paramIndex++}`);
            values.push(data.mode);
        }

        if (data.webhook_url !== undefined) {
            fields.push(`webhook_url = $${paramIndex++}`);
            values.push(data.webhook_url);
        }

        if (data.webhook_headers !== undefined) {
            fields.push(`webhook_headers = $${paramIndex++}`);
            values.push(JSON.stringify(data.webhook_headers));
        }

        if (data.llm_provider !== undefined) {
            fields.push(`llm_provider = $${paramIndex++}`);
            values.push(data.llm_provider);
        }

        if (data.llm_api_key !== undefined) {
            fields.push(`llm_api_key = $${paramIndex++}`);
            values.push(data.llm_api_key); // TODO: Criptografar
        }

        if (data.llm_model !== undefined) {
            fields.push(`llm_model = $${paramIndex++}`);
            values.push(data.llm_model);
        }

        if (data.llm_system_prompt !== undefined) {
            fields.push(`llm_system_prompt = $${paramIndex++}`);
            values.push(data.llm_system_prompt);
        }

        if (data.settings !== undefined) {
            fields.push(`settings = $${paramIndex++}`);
            values.push(JSON.stringify(data.settings));
        }

        if (data.is_active !== undefined) {
            fields.push(`is_active = $${paramIndex++}`);
            values.push(data.is_active);
        }

        if (fields.length === 0) {
            return this.findById(id, userId);
        }

        values.push(id, userId);
        const result = await query(
            `UPDATE ai_assistants SET ${fields.join(', ')} 
       WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
       RETURNING *`,
            values
        );

        return result.rows[0] || null;
    }

    /**
     * Remove assistente
     */
    async delete(id: string, userId: string): Promise<boolean> {
        const result = await query(
            'DELETE FROM ai_assistants WHERE id = $1 AND user_id = $2 RETURNING id',
            [id, userId]
        );
        return (result.rowCount ?? 0) > 0;
    }

    /**
     * Ativa/desativa assistente
     */
    async toggleActive(id: string, isActive: boolean, userId: string): Promise<void> {
        await query(
            'UPDATE ai_assistants SET is_active = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
            [isActive, id, userId]
        );
    }
}
