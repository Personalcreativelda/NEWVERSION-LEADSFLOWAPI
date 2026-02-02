import { query } from '../database/connection';

export class LeadNotesService {
  async findAll(leadId: string, userId: string) {
    const result = await query(
      'SELECT * FROM lead_notes WHERE lead_id = $1 AND user_id = $2 ORDER BY created_at DESC',
      [leadId, userId]
    );
    return result.rows;
  }

  async create(data: { lead_id: string; content: string }, userId: string) {
    const result = await query(
      `INSERT INTO lead_notes (user_id, lead_id, content)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, data.lead_id, data.content]
    );
    return result.rows[0];
  }

  async update(id: string, content: string, userId: string) {
    const result = await query(
      'UPDATE lead_notes SET content = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
      [content, id, userId]
    );
    return result.rows[0];
  }

  async delete(id: string, userId: string) {
    const result = await query(
      'DELETE FROM lead_notes WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    );
    return result.rows[0];
  }
}
