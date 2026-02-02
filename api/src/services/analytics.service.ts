import { query } from '../database/connection';

export class AnalyticsService {
  async getDashboardStats(userId: string) {
    const [leads, campaigns, messages] = await Promise.all([
      query('SELECT COUNT(*) FROM leads WHERE user_id = $1', [userId]),
      query('SELECT COUNT(*) FROM campaigns WHERE user_id = $1', [userId]),
      query('SELECT COUNT(*) FROM messages WHERE user_id = $1', [userId]),
    ]);

    return {
      leads: parseInt(leads.rows[0].count, 10) || 0,
      campaigns: parseInt(campaigns.rows[0].count, 10) || 0,
      messages: parseInt(messages.rows[0].count, 10) || 0,
    };
  }

  async getLeadsTimeline(userId: string) {
    const result = await query(
      'SELECT status, created_at FROM leads WHERE user_id = $1 ORDER BY created_at DESC LIMIT 500',
      [userId]
    );
    return result.rows;
  }

  async getMessagesTimeline(userId: string) {
    const result = await query(
      'SELECT status, created_at FROM messages WHERE user_id = $1 ORDER BY created_at DESC LIMIT 500',
      [userId]
    );
    return result.rows;
  }
}
