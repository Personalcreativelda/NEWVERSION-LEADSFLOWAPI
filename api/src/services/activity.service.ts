import { query } from '../database/connection';

export interface Activity {
  id: string;
  user_id: string;
  lead_id?: string;
  contact_id?: string;
  type: string;
  description: string;
  metadata: any;
  created_at: Date;
  user_email?: string;
  user_name?: string;
}

export class ActivityService {
  /**
   * Log a new activity
   */
  async logActivity(data: {
    userId: string;
    type: string;
    description: string;
    leadId?: string;
    contactId?: string;
    metadata?: any;
  }) {
    try {
      console.log(`[ActivityService] Logging activity: ${data.type} for user ${data.userId}`);
      const result = await query(
        `INSERT INTO activities (user_id, type, description, lead_id, contact_id, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         RETURNING *`,
        [
          data.userId,
          data.type,
          data.description,
          data.leadId || null,
          data.contactId || null,
          JSON.stringify(data.metadata || {}),
        ]
      );
      return result.rows[0];
    } catch (error) {
      console.error('[ActivityService] Error logging activity:', error);
      // Don't throw, we don't want to break the main flow for a logging failure
      return null;
    }
  }

  /**
   * Get recent activities for all users (Admin only)
   */
  async getRecentActivities(limit = 100, offset = 0) {
    try {
      const result = await query(
        `SELECT a.*, u.email as user_email, u.name as user_name
         FROM activities a
         LEFT JOIN users u ON a.user_id = u.id
         ORDER BY a.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
      return result.rows;
    } catch (error) {
      console.error('[ActivityService] Error fetching recent activities:', error);
      throw error;
    }
  }

  /**
   * Get currently active users (active in the last X minutes)
   */
  async getActiveUsers(minutes = 15) {
    try {
      const result = await query(
        `SELECT 
          u.id, u.email, u.name, u.avatar_url, u.last_active_at, u.plan, u.role,
          (
            SELECT json_agg(act) 
            FROM (
              SELECT type, description, created_at 
              FROM activities 
              WHERE user_id = u.id 
              ORDER BY created_at DESC 
              LIMIT 5
            ) act
          ) as recent_activities
         FROM users u
         WHERE u.last_active_at >= NOW() - ($1 || ' minutes')::interval
         ORDER BY u.last_active_at DESC`,
        [minutes]
      );
      return result.rows;
    } catch (error) {
      console.error('[ActivityService] Error fetching active users:', error);
      throw error;
    }
  }

  /**
   * Update user's last active timestamp
   */
  async updateLastActive(userId: string) {
    try {
      await query(
        'UPDATE users SET last_active_at = NOW() WHERE id = $1',
        [userId]
      );
    } catch (error) {
      console.error('[ActivityService] Error updating last active:', error);
    }
  }
}

export const activityService = new ActivityService();
