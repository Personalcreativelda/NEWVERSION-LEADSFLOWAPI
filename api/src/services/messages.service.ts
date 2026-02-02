import { query } from '../database/connection';

export class MessagesService {
  async findAll(userId: string, filters?: any) {
    let sql = 'SELECT * FROM messages WHERE user_id = $1';
    const params: any[] = [userId];
    let paramIndex = 2;

    if (filters?.lead_id) {
      sql += ` AND lead_id = $${paramIndex}`;
      params.push(filters.lead_id);
      paramIndex++;
    }

    if (filters?.campaign_id) {
      sql += ` AND campaign_id = $${paramIndex}`;
      params.push(filters.campaign_id);
      paramIndex++;
    }

    sql += ' ORDER BY created_at DESC';

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

  async create(data: any, userId: string) {
    const result = await query(
      `INSERT INTO messages (user_id, conversation_id, contact_id, lead_id, campaign_id, direction, channel, content, media_url, media_type, status, external_id, metadata, sent_at, delivered_at, read_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING *`,
      [
        userId,
        data.conversation_id || null,
        data.contact_id || null,
        data.lead_id || null,
        data.campaign_id || null,
        data.direction,
        data.channel,
        data.content,
        data.media_url,
        data.media_type,
        data.status || 'pending',
        data.external_id,
        data.metadata || {},
        data.sent_at || null,
        data.delivered_at || null,
        data.read_at || null,
      ]
    );
    return result.rows[0];
  }
}
