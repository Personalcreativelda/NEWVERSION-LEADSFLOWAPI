import { query } from '../database/connection';

export class ScheduledConversationsService {
  async findAll(userId: string, filters?: { lead_id?: string; status?: string }) {
    let sql = 'SELECT sc.*, l.name as lead_name, l.phone as lead_phone, l.email as lead_email FROM scheduled_conversations sc LEFT JOIN leads l ON sc.lead_id = l.id WHERE sc.user_id = $1';
    const params: any[] = [userId];
    let paramIndex = 2;

    if (filters?.lead_id) {
      sql += ` AND sc.lead_id = $${paramIndex}`;
      params.push(filters.lead_id);
      paramIndex++;
    }

    if (filters?.status) {
      sql += ` AND sc.status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }

    sql += ' ORDER BY sc.scheduled_at ASC';

    const result = await query(sql, params);
    return result.rows;
  }

  async findById(id: string, userId: string) {
    const result = await query(
      'SELECT sc.*, l.name as lead_name, l.phone as lead_phone FROM scheduled_conversations sc LEFT JOIN leads l ON sc.lead_id = l.id WHERE sc.id = $1 AND sc.user_id = $2',
      [id, userId]
    );
    return result.rows[0] || null;
  }

  async create(data: { lead_id: string; title: string; description?: string; scheduled_at: string }, userId: string) {
    const result = await query(
      `INSERT INTO scheduled_conversations (user_id, lead_id, title, description, scheduled_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, data.lead_id, data.title, data.description || null, data.scheduled_at]
    );
    return result.rows[0];
  }

  async update(id: string, data: { title?: string; description?: string; scheduled_at?: string; status?: string }, userId: string) {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.title !== undefined) {
      fields.push(`title = $${paramIndex}`);
      values.push(data.title);
      paramIndex++;
    }
    if (data.description !== undefined) {
      fields.push(`description = $${paramIndex}`);
      values.push(data.description);
      paramIndex++;
    }
    if (data.scheduled_at !== undefined) {
      fields.push(`scheduled_at = $${paramIndex}`);
      values.push(data.scheduled_at);
      paramIndex++;
    }
    if (data.status !== undefined) {
      fields.push(`status = $${paramIndex}`);
      values.push(data.status);
      paramIndex++;
    }

    if (fields.length === 0) {
      return this.findById(id, userId);
    }

    values.push(id, userId);
    const result = await query(
      `UPDATE scheduled_conversations SET ${fields.join(', ')} WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1} RETURNING *`,
      values
    );
    return result.rows[0];
  }

  async delete(id: string, userId: string) {
    const result = await query(
      'DELETE FROM scheduled_conversations WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    );
    return result.rows[0];
  }

  async getUpcoming(userId: string, limit = 10) {
    const result = await query(
      `SELECT sc.*, l.name as lead_name, l.phone as lead_phone, l.email as lead_email
       FROM scheduled_conversations sc
       LEFT JOIN leads l ON sc.lead_id = l.id
       WHERE sc.user_id = $1 AND sc.status = 'pending' AND sc.scheduled_at >= NOW()
       ORDER BY sc.scheduled_at ASC
       LIMIT $2`,
      [userId, limit]
    );
    return result.rows;
  }
}
