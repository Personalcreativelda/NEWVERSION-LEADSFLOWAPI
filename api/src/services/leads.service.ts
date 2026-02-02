import { query } from '../database/connection';

export class LeadsService {
  private normalizePhone(phone?: string | null) {
    if (!phone) {
      return null;
    }

    if (typeof phone !== 'string') {
      phone = String(phone);
    }

    const trimmed = phone.trim();
    if (!trimmed) {
      return null;
    }

    const sanitized = trimmed.replace(/[\s\-()]/g, '');
    if (!sanitized) {
      return null;
    }

    if (sanitized.startsWith('+')) {
      return sanitized;
    }

    if (/^\d+$/.test(sanitized) && sanitized.length >= 11) {
      return `+${sanitized}`;
    }

    return sanitized;
  }

  private normalizeLeadInput(raw: any, defaultSource?: string) {
    const nameCandidates = [raw?.name, raw?.nome, raw?.fullName, raw?.full_name];
    const validName = nameCandidates.find((value) => typeof value === 'string' && value.trim().length > 0);
    const fallbackPhone = raw?.phone || raw?.telefone || raw?.whatsapp || raw?.numero || '';
    const name = validName ? (validName as string).trim() : (fallbackPhone ? `Lead ${fallbackPhone}` : 'Lead sem nome');

    const emailCandidate = raw?.email || raw?.mail || raw?.emailAddress;
    const email = typeof emailCandidate === 'string' && emailCandidate.trim() ? emailCandidate.trim().toLowerCase() : null;

    const phone = this.normalizePhone(raw?.phone || raw?.telefone || raw?.numero);
    const whatsapp = this.normalizePhone(raw?.whatsapp || raw?.whats || raw?.numero || raw?.telefone);

    const tags = Array.isArray(raw?.tags)
      ? raw.tags
      : Array.isArray(raw?.etiquetas)
        ? raw.etiquetas
        : [];

    const notes = raw?.notes || raw?.observacoes || raw?.observacao || raw?.comment || null;
    const customFields: Record<string, any> = { ...(raw?.custom_fields || raw?.customFields || raw?.extra || {}) };

    const mergeField = (key: string, value: any) => {
      if (value !== undefined && value !== null && value !== '') {
        customFields[key] = value;
      }
    };

    mergeField('interesse', raw?.interesse);
    mergeField('agente_atual', raw?.agente_atual || raw?.agent);
    mergeField('valor', raw?.valor);
    mergeField('data', raw?.data);

    return {
      name,
      email,
      phone,
      whatsapp,
      company: raw?.company || raw?.empresa || null,
      position: raw?.position || raw?.cargo || null,
      source: raw?.source || raw?.origem || defaultSource || 'import',
      status: raw?.status || raw?.situacao || 'new',
      tags,
      notes,
      custom_fields: customFields,
      avatarUrl: raw?.avatarUrl || raw?.avatar_url || null,
    };
  }

  private async findExistingLead(userId: string, email?: string | null, phone?: string | null, whatsapp?: string | null) {
    const clauses: string[] = [];
    const params: any[] = [userId];
    let paramIndex = 2;

    if (email) {
      clauses.push(`LOWER(email) = LOWER($${paramIndex})`);
      params.push(email);
      paramIndex++;
    }

    if (phone) {
      clauses.push(`phone = $${paramIndex}`);
      params.push(phone);
      paramIndex++;
    }

    if (whatsapp) {
      clauses.push(`whatsapp = $${paramIndex}`);
      params.push(whatsapp);
      paramIndex++;
    }

    if (clauses.length === 0) {
      return null;
    }

    const result = await query(
      `SELECT * FROM leads WHERE user_id = $1 AND (${clauses.join(' OR ')}) LIMIT 1`,
      params,
    );

    return result.rows[0] || null;
  }

  async findAll(userId: string, filters?: any) {
    let sql = 'SELECT * FROM leads WHERE user_id = $1';
    const params: any[] = [userId];
    let paramIndex = 2;

    if (filters?.status) {
      sql += ` AND status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }

    if (filters?.search) {
      sql += ` AND (name ILIKE $${paramIndex} OR email ILIKE $${paramIndex} OR phone ILIKE $${paramIndex})`;
      params.push(`%${filters.search}%`);
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

  async findById(id: string, userId: string) {
    const result = await query('SELECT * FROM leads WHERE id = $1 AND user_id = $2', [id, userId]);
    return result.rows[0] || null;
  }

  async findByPhone(phone: string, userId: string) {
    if (!phone) return null;
    
    // Normalize phone for comparison
    const normalizedPhone = this.normalizePhone(phone);
    const phoneDigits = phone.replace(/\D/g, '');
    
    // Try to find by phone or whatsapp, using various formats
    const result = await query(
      `SELECT * FROM leads 
       WHERE user_id = $1 
       AND (
         phone = $2 OR phone = $3 OR phone = $4 OR
         whatsapp = $2 OR whatsapp = $3 OR whatsapp = $4 OR
         REPLACE(REPLACE(phone, '+', ''), ' ', '') LIKE $5 OR
         REPLACE(REPLACE(whatsapp, '+', ''), ' ', '') LIKE $5
       )
       LIMIT 1`,
      [userId, normalizedPhone, phone, `+${phoneDigits}`, `%${phoneDigits}%`]
    );
    return result.rows[0] || null;
  }

  async create(data: any, userId: string) {
    const dealValue = data.deal_value !== undefined ? data.deal_value : (data.custom_fields?.valor || 0);
    const result = await query(
      `INSERT INTO leads (user_id, name, email, phone, whatsapp, company, position, source, status, tags, notes, custom_fields, deal_value, avatar_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        userId,
        data.name,
        data.email,
        data.phone,
        data.whatsapp,
        data.company,
        data.position,
        data.source,
        data.status || 'new',
        data.tags || [],
        data.notes,
        data.custom_fields || {},
        dealValue,
        data.avatarUrl || data.avatar_url || null, // Support both cases
      ]
    );
    return result.rows[0];
  }

  async update(id: string, data: any, userId: string) {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.keys(data).forEach((key) => {
      if (data[key] !== undefined && key !== 'id' && key !== 'user_id') {
        fields.push(`${key} = $${paramIndex}`);
        values.push(data[key]);
        paramIndex++;
      }
    });

    if (fields.length === 0) {
      return this.findById(id, userId);
    }

    values.push(id, userId);
    const result = await query(
      `UPDATE leads SET ${fields.join(', ')} WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1} RETURNING *`,
      values
    );
    return result.rows[0];
  }

  async delete(id: string, userId: string) {
    const result = await query('DELETE FROM leads WHERE id = $1 AND user_id = $2 RETURNING *', [id, userId]);
    return result.rows[0];
  }

  async count(userId: string, filters?: any) {
    let sql = 'SELECT COUNT(*) FROM leads WHERE user_id = $1';
    const params: any[] = [userId];

    if (filters?.status) {
      sql += ' AND status = $2';
      params.push(filters.status);
    }

    const result = await query(sql, params);
    return parseInt(result.rows[0].count, 10);
  }

  async importBulk(leads: any[], userId: string, options?: { source?: string }) {
    const summary = {
      success: true,
      total: leads.length,
      imported: 0,
      duplicatesSkipped: 0,
      skipped: 0,
    };

    for (const rawLead of leads) {
      const normalized = this.normalizeLeadInput(rawLead, options?.source);
      const uniqueIdentifier = normalized.email || normalized.phone || normalized.whatsapp;

      if (!uniqueIdentifier) {
        summary.skipped += 1;
        continue;
      }

      const existing = await this.findExistingLead(userId, normalized.email, normalized.phone, normalized.whatsapp);

      if (existing) {
        summary.duplicatesSkipped += 1;
        continue;
      }

      await this.create(normalized, userId);
      summary.imported += 1;
    }

    const remaining = await this.count(userId);

    return {
      ...summary,
      remaining,
    };
  }

  async removeDuplicates(userId: string) {
    const result = await query(
      `
        WITH ranked_leads AS (
          SELECT
            id,
            ROW_NUMBER() OVER (
              PARTITION BY user_id,
                COALESCE(NULLIF(LOWER(email), ''), NULLIF(phone, ''), NULLIF(whatsapp, ''))
              ORDER BY created_at ASC
            ) AS row_number
          FROM leads
          WHERE user_id = $1
            AND COALESCE(NULLIF(LOWER(email), ''), NULLIF(phone, ''), NULLIF(whatsapp, '')) IS NOT NULL
        ),
        deleted AS (
          DELETE FROM leads
          WHERE id IN (SELECT id FROM ranked_leads WHERE row_number > 1)
          RETURNING id
        )
        SELECT
          (SELECT COUNT(*) FROM deleted) AS removed,
          (SELECT COUNT(*) FROM leads WHERE user_id = $1) AS remaining;
      `,
      [userId],
    );

    const row = result.rows[0] || { removed: 0, remaining: 0 };

    return {
      removed: Number(row.removed || 0),
      remaining: Number(row.remaining || 0),
    };
  }

  async updateAvatarUrl(leadId: string, avatarUrl: string, userId: string) {
    const result = await query(
      'UPDATE leads SET avatar_url = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
      [avatarUrl, leadId, userId]
    );
    return result.rows[0] || null;
  }
}
