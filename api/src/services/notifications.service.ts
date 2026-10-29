import { query } from '../database/connection';
import { emailService } from './email.service';

const escapeHtml = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Email simples para os avisos do administrador (mesmo texto da notificação do sino) */
export function adminNotificationEmail(title: string, description: string) {
  const appUrl = (process.env.FRONTEND_URL || 'https://app.leadsflowapi.com').replace(/\/$/, '');
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:12px;padding:28px">
<tr><td>
<p style="margin:0 0 6px;font-size:12px;color:#71717a">LeadsFlow · Admin</p>
<h1 style="margin:0 0 12px;font-size:20px;color:#18181b">${escapeHtml(title)}</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3f3f46">${escapeHtml(description)}</p>
<a href="${appUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px">Abrir o painel</a>
</td></tr></table>
<p style="margin:16px 0 0;font-size:11px;color:#a1a1aa">Pode desligar estes avisos em Admin → Definições.</p>
</td></tr></table></body></html>`;
  return { subject: `LeadsFlow: ${title}`, html, text: `${title}

${description}

${appUrl}` };
}

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

  async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    const result = await query(
      `UPDATE notifications
       SET is_read = true, updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [notificationId, userId]
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

  async deleteNotification(notificationId: string, userId: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM notifications
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [notificationId, userId]
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

  // ── Admin notification helper ──────────────────────────────────────────────
  // Sends an in-app notification to every admin whose settings allow this type,
  // and the same notice by email (to notificationEmail, or the admin's own email).
  // settingKey must match a key in admin_settings.settings (e.g. 'newUserNotifications').
  async sendAdminNotification(
    settingKey: 'newUserNotifications' | 'upgradeNotifications' | 'paymentNotifications' | 'expirationNotifications' | 'suspensionNotifications',
    type: string,
    title: string,
    description: string,
    icon: string,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    try {
      // Get all admins
      const admins = await query(`SELECT id, email FROM users WHERE role = 'admin'`);
      if (!admins.rows.length) return;

      for (const admin of admins.rows) {
        try {
          // Read this admin's notification settings
          let enabled = true; // default on if no settings saved yet
          let notificationEmail = '';
          try {
            const settingsResult = await query(
              `SELECT settings FROM admin_settings WHERE admin_id = $1 AND setting_key = 'notifications'`,
              [admin.id]
            );
            if (settingsResult.rows.length > 0) {
              const s = settingsResult.rows[0].settings;
              enabled = s[settingKey] !== false; // default true if key missing
              notificationEmail = typeof s.notificationEmail === 'string' ? s.notificationEmail.trim() : '';
            }
          } catch { /* admin_settings table may not exist yet */ }

          if (!enabled) continue;

          await query(
            `INSERT INTO notifications (user_id, type, title, description, icon, metadata)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [admin.id, type, title, description, icon, JSON.stringify(metadata)]
          );

          const to = notificationEmail || admin.email;
          if (to && emailService.configured) {
            const mail = adminNotificationEmail(title, description);
            await emailService.sendRaw({ to, ...mail }).catch((err) =>
              console.warn(`[Notifications] Admin email to ${to} failed:`, err?.message || err));
          }
        } catch (err) {
          console.warn(`[Notifications] Could not send admin notification to ${admin.id}:`, err);
        }
      }
    } catch (err) {
      console.warn('[Notifications] sendAdminNotification error:', err);
    }
  },
};
