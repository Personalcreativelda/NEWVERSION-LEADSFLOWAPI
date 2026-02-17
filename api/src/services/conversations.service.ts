// INBOX: Service para gerenciar conversas
import { query } from '../database/connection';

export interface Conversation {
    id: string;
    user_id: string;
    lead_id: string | null;
    channel_id: string;
    remote_jid: string;
    status: 'open' | 'closed' | 'pending' | 'snoozed';
    assigned_to: string | null;
    last_message_at: string;
    unread_count: number;
    metadata: any;
    created_at: string;
    updated_at: string;
}

export class ConversationsService {
    /**
     * Busca ou cria uma conversa
     */
    async findOrCreate(
        userId: string,
        channelId: string,
        remoteJid: string,
        leadId?: string,
        metadata?: any
    ): Promise<Conversation> {
        // Validação: remoteJid deve ser válido
        // - WhatsApp: formato xxx@s.whatsapp.net ou xxx@g.us
        // - Telegram: ID numérico (ex: 123456789)
        // - Instagram: ID numérico (ex: 17841234567890)
        if (!remoteJid || remoteJid.trim() === '') {
            throw new Error('Invalid remote JID: identifier is required');
        }

        // Tentar encontrar conversa existente
        let result = await query(
            `SELECT * FROM conversations 
       WHERE user_id = $1 AND channel_id = $2 AND remote_jid = $3`,
            [userId, channelId, remoteJid]
        );

        if (result.rows.length > 0) {
            // Atualizar metadata se fornecida (contact_name, profile_picture, etc.)
            if (metadata && Object.keys(metadata).length > 0) {
                const existing = result.rows[0];
                const existingMeta = typeof existing.metadata === 'string'
                    ? JSON.parse(existing.metadata)
                    : (existing.metadata || {});

                // Merge metadata (novos valores sobrescrevem antigos, exceto se null)
                // Proteção: não sobrescrever contact_name real com ID numérico
                const merged: any = { ...existingMeta };
                for (const [key, value] of Object.entries(metadata)) {
                    if (value !== null && value !== undefined) {
                        // Se já existe um contact_name real, não sobrescrever com ID numérico
                        if (key === 'contact_name' && existingMeta.contact_name && typeof value === 'string') {
                            const isNewValueNumericId = /^\d{6,}$/.test(value);
                            const isExistingRealName = !/^\d{6,}$/.test(existingMeta.contact_name);
                            if (isNewValueNumericId && isExistingRealName) {
                                // Não sobrescrever nome real com ID numérico
                                continue;
                            }
                        }
                        merged[key] = value;
                    }
                }

                // Só atualiza se houve mudança
                if (JSON.stringify(merged) !== JSON.stringify(existingMeta)) {
                    await query(
                        `UPDATE conversations SET metadata = $1, updated_at = NOW() WHERE id = $2`,
                        [JSON.stringify(merged), existing.id]
                    );
                    existing.metadata = merged;
                }
            }
            return result.rows[0];
        }

        // Criar nova conversa
        result = await query(
            `INSERT INTO conversations (user_id, lead_id, channel_id, remote_jid, metadata)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
            [userId, leadId || null, channelId, remoteJid, JSON.stringify(metadata || {})]
        );

        return result.rows[0];
    }

    /**
     * Atualiza contador de não lidas
     */
    async updateUnreadCount(conversationId: string, increment: number): Promise<void> {
        await query(
            `UPDATE conversations 
       SET unread_count = GREATEST(0, unread_count + $1),
           updated_at = NOW()
       WHERE id = $2`,
            [increment, conversationId]
        );
    }

    /**
     * Marca conversa como lida
     */
    async markAsRead(conversationId: string, userId: string): Promise<void> {
        await query(
            `UPDATE conversations 
       SET unread_count = 0, updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
            [conversationId, userId]
        );
    }

    /**
     * Busca conversa por ID
     */
    async getById(conversationId: string): Promise<Conversation | null> {
        const result = await query(
            `SELECT * FROM conversations WHERE id = $1`,
            [conversationId]
        );
        return result.rows[0] || null;
    }

    /**
     * Atualiza status da conversa
     */
    async updateStatus(
        conversationId: string,
        status: Conversation['status'],
        userId: string
    ): Promise<void> {
        await query(
            `UPDATE conversations 
       SET status = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3`,
            [status, conversationId, userId]
        );
    }

    /**
     * Atualiza lead_id da conversa
     */
    async updateLead(conversationId: string, leadId: string, userId: string): Promise<void> {
        await query(
            `UPDATE conversations 
       SET lead_id = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3`,
            [leadId, conversationId, userId]
        );
    }
}
