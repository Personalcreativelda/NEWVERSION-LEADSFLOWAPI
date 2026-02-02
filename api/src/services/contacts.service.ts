import { query } from '../database/connection';

export class ContactsService {
  async findAll(userId: string, filters?: any) {
    let sql = 'SELECT * FROM contacts WHERE user_id = $1';
    const params: any[] = [userId];
    let paramIndex = 2;

    if (filters?.lead_id) {
      sql += ` AND lead_id = $${paramIndex}`;
      params.push(filters.lead_id);
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
    const result = await query('SELECT * FROM contacts WHERE id = $1 AND user_id = $2', [id, userId]);
    return result.rows[0] || null;
  }

  async findByPhone(phone: string, userId: string) {
    const result = await query('SELECT * FROM contacts WHERE phone = $1 AND user_id = $2', [phone, userId]);
    return result.rows[0] || null;
  }

  async create(data: any, userId: string) {
    const result = await query(
      `INSERT INTO contacts (user_id, lead_id, name, email, phone, whatsapp, company, position, address, city, country, notes, custom_fields)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        userId,
        data.lead_id || null,
        data.name,
        data.email,
        data.phone,
        data.whatsapp,
        data.company,
        data.position,
        data.address,
        data.city,
        data.country,
        data.notes,
        data.custom_fields || {},
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

    if (!fields.length) {
      return this.findById(id, userId);
    }

    values.push(id, userId);
    const result = await query(
      `UPDATE contacts SET ${fields.join(', ')} WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1} RETURNING *`,
      values
    );
    return result.rows[0];
  }

  async delete(id: string, userId: string) {
    const result = await query('DELETE FROM contacts WHERE id = $1 AND user_id = $2 RETURNING *', [id, userId]);
    return result.rows[0];
  }
}
