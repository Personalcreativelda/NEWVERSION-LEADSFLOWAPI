import { query } from '../database/connection';

export class CampaignsService {
  async findAll(userId: string) {
    const result = await query('SELECT * FROM campaigns WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    return result.rows;
  }

  async findById(id: string, userId: string) {
    const result = await query('SELECT * FROM campaigns WHERE id = $1 AND user_id = $2', [id, userId]);
    return result.rows[0] || null;
  }

  async create(data: any, userId: string) {
    console.log('[Campaigns Service] Creating campaign for user:', userId);
    console.log('[Campaigns Service] Data received:', JSON.stringify(data, null, 2));

    // Ensure JSON fields are properly formatted
    const template = typeof data.template === 'string' ? data.template : JSON.stringify(data.template || {});
    const settings = typeof data.settings === 'string' ? data.settings : JSON.stringify(data.settings || {});
    const stats = typeof data.stats === 'string' ? data.stats : JSON.stringify(data.stats || { sent: 0, delivered: 0, read: 0, replied: 0, failed: 0 });
    const mediaUrls = Array.isArray(data.media_urls) ? data.media_urls : [];

    const result = await query(
      `INSERT INTO campaigns (user_id, name, description, type, status, template, settings, scheduled_at, started_at, completed_at, stats, media_urls)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11::jsonb, $12)
       RETURNING *`,
      [
        userId,
        data.name || 'Nova Campanha',
        data.description || '',
        data.type || 'whatsapp',
        data.status || 'draft',
        template,
        settings,
        data.scheduled_at || null,
        data.started_at || null,
        data.completed_at || null,
        stats,
        mediaUrls,
      ]
    );

    console.log('[Campaigns Service] Campaign created successfully:', result.rows[0].id);
    return result.rows[0];
  }

  async update(id: string, data: any, userId: string) {
    console.log('[Campaigns Service] Updating campaign:', id);
    console.log('[Campaigns Service] Data received:', JSON.stringify(data, null, 2));

    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.keys(data).forEach((key) => {
      if (data[key] !== undefined && key !== 'id' && key !== 'user_id') {
        // Convert JSONB fields to JSON string if they're objects
        let value = data[key];

        if (key === 'settings' || key === 'stats') {
          value = typeof value === 'string' ? value : JSON.stringify(value);
          fields.push(`${key} = $${paramIndex}::jsonb`);
        } else {
          fields.push(`${key} = $${paramIndex}`);
        }

        values.push(value);
        paramIndex++;
      }
    });

    if (!fields.length) {
      return this.findById(id, userId);
    }

    // Add updated_at
    fields.push(`updated_at = NOW()`);

    values.push(id, userId);
    const result = await query(
      `UPDATE campaigns SET ${fields.join(', ')} WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1} RETURNING *`,
      values
    );

    console.log('[Campaigns Service] Campaign updated successfully:', result.rows[0]?.id);
    return result.rows[0];
  }

  async delete(id: string, userId: string) {
    const result = await query('DELETE FROM campaigns WHERE id = $1 AND user_id = $2 RETURNING *', [id, userId]);
    return result.rows[0];
  }
}
