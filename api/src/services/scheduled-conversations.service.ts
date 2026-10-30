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

  async create(
    data: { lead_id?: string | null; title: string; description?: string; scheduled_at: string; conversation_id?: string | null; metadata?: Record<string, unknown> },
    userId: string,
  ) {
    const result = await query(
      `INSERT INTO scheduled_conversations (user_id, lead_id, title, description, scheduled_at, conversation_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [userId, data.lead_id || null, data.title, data.description || null, data.scheduled_at, data.conversation_id || null, JSON.stringify(data.metadata || {})]
    );
    const row = result.rows[0];
    return row ? this.findById(row.id, userId) : row;
  }

  async update(id: string, data: { title?: string; description?: string; scheduled_at?: string; status?: string; metadata?: Record<string, unknown> }, userId: string) {
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
      fields.push(`status = ${paramIndex}`);
      values.push(data.status);
      paramIndex++;
    }
    if (data.metadata && typeof data.metadata === 'object') {
      // Junta ao que já existe (não apaga a origem, o assistente, etc.)
      fields.push(`metadata = COALESCE(metadata, '{}'::jsonb) || ${paramIndex}::jsonb`);
      values.push(JSON.stringify(data.metadata));
      paramIndex++;
    }
    fields.push('updated_at = NOW()');

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
    // Quem já apaga no servidor não pode ver as tarefas voltar pela cópia antiga de outro aparelho
    await query(
      'UPDATE users SET legacy_tasks_imported_at = NOW() WHERE id = $1 AND legacy_tasks_imported_at IS NULL',
      [userId]
    ).catch(() => { /* a tarefa já foi apagada; a marca não pode fazer o pedido falhar */ });
    return result.rows[0];
  }

  /**
   * Tarefas antigas que só existiam no browser: entram uma única vez por conta (o primeiro
   * aparelho ganha). Tarefas de leads de outra conta (browser partilhado) ficam de fora.
   */
  async importLegacy(tasks: any[], userId: string): Promise<number> {
    const claim = await query(
      'UPDATE users SET legacy_tasks_imported_at = NOW() WHERE id = $1 AND legacy_tasks_imported_at IS NULL RETURNING id',
      [userId]
    );
    if (claim.rows.length === 0) return 0;

    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let imported = 0;
    for (const t of tasks.slice(0, 500)) {
      try {
        let leadId: string | null = null;
        if (t?.lead_id) {
          if (!UUID.test(String(t.lead_id))) continue;
          const lead = await query('SELECT id FROM leads WHERE id = $1 AND user_id = $2', [t.lead_id, userId]);
          if (lead.rows.length === 0) continue;
          leadId = lead.rows[0].id;
        }
        const when = new Date(t?.scheduled_at);
        await query(
          `INSERT INTO scheduled_conversations (user_id, lead_id, title, description, scheduled_at, status, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            userId,
            leadId,
            String(t?.title || 'Tarefa').slice(0, 255),
            t?.description ? String(t.description) : null,
            isNaN(when.getTime()) ? new Date() : when,
            ['completed', 'cancelled'].includes(t?.status) ? t.status : 'pending',
            JSON.stringify(t?.metadata && typeof t.metadata === 'object' ? t.metadata : {}),
          ]
        );
        imported++;
      } catch (err) {
        console.warn('[ScheduledConversations] Tarefa antiga não importada:', err);
      }
    }
    return imported;
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
