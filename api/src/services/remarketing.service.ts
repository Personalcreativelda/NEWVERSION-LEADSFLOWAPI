import { query } from '../database/connection';

export interface FlowStep {
  id: string;
  type: 'whatsapp' | 'email' | 'wait' | 'tag' | 'move_stage' | 'condition';
  label: string;
  config?: Record<string, unknown>;
}

export interface CreateFlowDto {
  name: string;
  description?: string;
  status?: 'active' | 'paused' | 'draft';
  trigger_type: 'funnel_stage' | 'tag' | 'inactivity' | 'purchase' | 'lead_score';
  trigger_label: string;
  steps: FlowStep[];
  template_id?: string;
}

export interface UpdateFlowDto {
  name?: string;
  description?: string;
  status?: 'active' | 'paused' | 'draft';
  trigger_type?: string;
  trigger_label?: string;
  steps?: FlowStep[];
  enrolled_leads?: number;
  conversions?: number;
}

export class RemarketingService {
  // ── List ────────────────────────────────────────────────────────────────────
  async findAll(userId: string) {
    const result = await query(
      `SELECT * FROM remarketing_flows
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId],
    );
    return result.rows;
  }

  // ── Get one ─────────────────────────────────────────────────────────────────
  async findById(id: string, userId: string) {
    const result = await query(
      `SELECT * FROM remarketing_flows WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return result.rows[0] || null;
  }

  // ── Create ──────────────────────────────────────────────────────────────────
  async create(data: CreateFlowDto, userId: string) {
    const steps = Array.isArray(data.steps) ? data.steps : [];
    const result = await query(
      `INSERT INTO remarketing_flows
         (user_id, name, description, status, trigger_type, trigger_label, steps, template_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
       RETURNING *`,
      [
        userId,
        data.name,
        data.description ?? '',
        data.status ?? 'draft',
        data.trigger_type,
        data.trigger_label,
        JSON.stringify(steps),
        data.template_id ?? null,
      ],
    );
    return result.rows[0];
  }

  // ── Update ──────────────────────────────────────────────────────────────────
  async update(id: string, data: UpdateFlowDto, userId: string) {
    const allowed = [
      'name', 'description', 'status',
      'trigger_type', 'trigger_label',
      'enrolled_leads', 'conversions',
    ] as const;

    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = $${i}`);
        values.push(data[key]);
        i++;
      }
    }

    // steps is JSONB — handle separately
    if (data.steps !== undefined) {
      fields.push(`steps = $${i}::jsonb`);
      values.push(JSON.stringify(data.steps));
      i++;
    }

    if (fields.length === 0) {
      return this.findById(id, userId);
    }

    values.push(id, userId);
    const result = await query(
      `UPDATE remarketing_flows
       SET ${fields.join(', ')}
       WHERE id = $${i} AND user_id = $${i + 1}
       RETURNING *`,
      values,
    );
    return result.rows[0] || null;
  }

  // ── Toggle status ────────────────────────────────────────────────────────────
  async toggleStatus(id: string, userId: string) {
    const flow = await this.findById(id, userId);
    if (!flow) return null;

    const next = flow.status === 'active' ? 'paused' : 'active';
    const result = await query(
      `UPDATE remarketing_flows SET status = $1 WHERE id = $2 AND user_id = $3 RETURNING *`,
      [next, id, userId],
    );
    return result.rows[0] || null;
  }

  // ── Duplicate ────────────────────────────────────────────────────────────────
  async duplicate(id: string, userId: string) {
    const flow = await this.findById(id, userId);
    if (!flow) return null;

    const result = await query(
      `INSERT INTO remarketing_flows
         (user_id, name, description, status, trigger_type, trigger_label, steps, template_id)
       VALUES ($1, $2, $3, 'draft', $4, $5, $6::jsonb, $7)
       RETURNING *`,
      [
        userId,
        `${flow.name} (Cópia)`,
        flow.description,
        flow.trigger_type,
        flow.trigger_label,
        JSON.stringify(flow.steps),
        flow.template_id ?? null,
      ],
    );
    return result.rows[0];
  }

  // ── Delete ───────────────────────────────────────────────────────────────────
  async delete(id: string, userId: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM remarketing_flows WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, userId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  // ── Analytics summary ────────────────────────────────────────────────────────
  async analytics(userId: string) {
    const result = await query(
      `SELECT
         COUNT(*)                                  AS total_flows,
         COUNT(*) FILTER (WHERE status = 'active') AS active_flows,
         SUM(enrolled_leads)                       AS total_enrolled,
         SUM(conversions)                          AS total_conversions,
         CASE WHEN SUM(enrolled_leads) > 0
           THEN ROUND(SUM(conversions)::numeric / SUM(enrolled_leads) * 100, 1)
           ELSE 0
         END AS conversion_rate
       FROM remarketing_flows
       WHERE user_id = $1`,
      [userId],
    );
    return result.rows[0];
  }
}
