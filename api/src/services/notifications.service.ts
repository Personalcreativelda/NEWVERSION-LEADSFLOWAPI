import { query } from '../database/connection';

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  description?: string;
  icon?: string;
  isRead: boolean;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export const notificationsService = {
  async getNotifications(userId: string, limit = 20, offset = 0): Promise<Notification[]> {
    const result = await query(
      `SELECT id, user_id, type, title, description, icon, is_read, metadata, created_at, updated_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    return result.rows.map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      type: row.type,
      title: row.title,
      description: row.description,
      icon: row.icon,
      isRead: row.is_read,
      metadata: row.metadata,
      createdAt: typeof row.created_at === 'string' ? row.created_at : new Date(row.created_at).toISOString(),
      updatedAt: typeof row.updated_at === 'string' ? row.updated_at : new Date(row.updated_at).toISOString(),
    }));
  },

  async createNotification(
    userId: string,
    type: string,
    title: string,
    description?: string,
    icon?: string,
    metadata?: Record<string, any>
  ): Promise<Notification> {
    const result = await query(
      `INSERT INTO notifications (user_id, type, title, description, icon, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, user_id, type, title, description, icon, is_read, metadata, created_at, updated_at`,
      [userId, type, title, description || null, icon || null, JSON.stringify(metadata || {})]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      title: row.title,
      description: row.description,
      icon: row.icon,
      isRead: row.is_read,
      metadata: row.metadata,
      createdAt: typeof row.created_at === 'string' ? row.created_at : new Date(row.created_at).toISOString(),
      updatedAt: typeof row.updated_at === 'string' ? row.updated_at : new Date(row.updated_at).toISOString(),
    };
  },

  async markAsRead(notificationId: string): Promise<boolean> {
    const result = await query(
      `UPDATE notifications
       SET is_read = true, updated_at = NOW()
       WHERE id = $1
       RETURNING id`,
      [notificationId]
    );

    return result.rows.length > 0;
  },

  async markAllAsRead(userId: string): Promise<number> {
    const result = await query(
      `UPDATE notifications
       SET is_read = true, updated_at = NOW()
       WHERE user_id = $1 AND is_read = false
       RETURNING id`,
      [userId]
    );

    return result.rows.length;
  },

  async deleteNotification(notificationId: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM notifications
       WHERE id = $1
       RETURNING id`,
      [notificationId]
    );

    return result.rows.length > 0;
  },

  async deleteAllNotifications(userId: string): Promise<number> {
    const result = await query(
      `DELETE FROM notifications
       WHERE user_id = $1
       RETURNING id`,
      [userId]
    );

    return result.rows.length;
  },

  async getUnreadCount(userId: string): Promise<number> {
    const result = await query(
      `SELECT COUNT(*) as count
       FROM notifications
       WHERE user_id = $1 AND is_read = false`,
      [userId]
    );

    return parseInt(result.rows[0].count);
  },
};
