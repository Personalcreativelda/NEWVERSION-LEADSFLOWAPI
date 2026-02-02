import { query } from '../database/connection';

export class InboxService {
  /**
   * INBOX: Get all conversations with latest message and lead details
   * Atualizado para usar a tabela conversations
   */
  async getConversations(userId: string, filters?: { search?: string; limit?: number; offset?: number }) {
    let sql = `
      SELECT 
        c.*,
        l.name as lead_name,
        l.email as lead_email,
        l.phone as lead_phone,
        l.whatsapp as lead_whatsapp,
        l.avatar_url as lead_avatar,
        l.status as lead_status,
        l.company as lead_company,
        ch.type as channel_type,
        ch.name as channel_name,
        ch.status as channel_status,
        (
          SELECT json_build_object(
            'id', m.id,
            'content', m.content,
            'direction', m.direction,
            'status', m.status,
            'created_at', m.created_at,
            'media_url', m.media_url,
            'media_type', m.media_type
          )
          FROM messages m
          WHERE m.conversation_id = c.id
          ORDER BY m.created_at DESC
          LIMIT 1
        ) as last_message
      FROM conversations c
      LEFT JOIN leads l ON c.lead_id = l.id
      LEFT JOIN channels ch ON c.channel_id = ch.id
      WHERE c.user_id = $1
    `;

    const params: any[] = [userId];
    let paramIndex = 2;

    if (filters?.search) {
      sql += ` AND (
        l.name ILIKE $${paramIndex} OR 
        l.phone ILIKE $${paramIndex} OR 
        l.email ILIKE $${paramIndex} OR
        c.metadata->>'contact_name' ILIKE $${paramIndex} OR
        c.remote_jid ILIKE $${paramIndex}
      )`;
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    sql += ' ORDER BY c.last_message_at DESC';

    if (filters?.limit) {
      sql += ` LIMIT $${paramIndex}`;
      params.push(filters.limit);
      paramIndex++;
    }

    if (filters?.offset) {
      sql += ` OFFSET $${paramIndex}`;
      params.push(filters.offset);
    }

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * INBOX: Get messages for a specific conversation
   * Suporta busca por conversation_id ou lead_id (backward compatibility)
   */
  async getConversationMessages(userId: string, conversationIdOrLeadId: string, filters?: { limit?: number; offset?: number }) {
    // Tentar primeiro por conversation_id, depois por lead_id
    let sql = `
      SELECT * FROM messages 
      WHERE user_id = $1 
      AND (conversation_id = $2 OR lead_id = $2)
    `;
    const params: any[] = [userId, conversationIdOrLeadId];
    let paramIndex = 3;

    sql += ' ORDER BY created_at ASC';

    if (filters?.limit) {
      sql += ` LIMIT $${paramIndex}`;
      params.push(filters.limit);
      paramIndex++;
    }

    if (filters?.offset) {
      sql += ` OFFSET $${paramIndex}`;
      params.push(filters.offset);
    }

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Mark messages as read for a conversation
   */
  async markAsRead(userId: string, leadId: string) {
    const result = await query(
      `UPDATE messages SET status = 'read', read_at = NOW() WHERE user_id = $1 AND lead_id = $2 AND direction = 'in' AND status != 'read' RETURNING id`,
      [userId, leadId]
    );
    return { updated: result.rowCount };
  }

  /**
   * INBOX: Get unread message count from conversations table
   */
  async getUnreadCount(userId: string) {
    const result = await query(
      `SELECT COALESCE(SUM(unread_count), 0) as count 
       FROM conversations 
       WHERE user_id = $1`,
      [userId]
    );
    return parseInt(result.rows[0].count, 10);
  }
}
