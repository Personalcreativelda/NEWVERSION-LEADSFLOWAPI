import { query } from '../database/connection';
import { emailService } from './email.service';
import { getAdminNotificationEmail } from '../templates/email.template';
import {
  categoryForNotificationType,
  pushNotificationService,
  type NotificationCategory,
  type NotificationPriority,
} from './push-notification.service';

/** Email para os avisos do administrador (mesmo texto da notificação do sino) */
export function adminNotificationEmail(title: string, description: string) {
  const appUrl = (process.env.FRONTEND_URL || 'https://app.leadsflowapi.com').replace(/\/$/, '');
  return {
    subject: `LeadsFlow: ${title}`,
    html: getAdminNotificationEmail(title, description),
    text: `${title}\n\n${description}\n\n${appUrl}`,
  };
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
  actionUrl?: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  pushStatus: string;
  pushSentAt?: string;
  pushSuccessCount: number;
  pushFailureCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationDeliveryOptions {
  actionUrl?: string;
  category?: NotificationCategory;
  priority?: NotificationPriority;
  sendPush?: boolean;
}

const NOTIFICATION_COLUMNS = `id, user_id, type, title, description, icon, is_read, metadata,
  action_url, category, priority, push_status, push_sent_at, push_success_count,
  push_failure_count, created_at, updated_at`;

function toIso(value: unknown): string | undefined {
  if (!value) return undefined;
  return typeof value === 'string' ? value : new Date(value as any).toISOString();
}

function mapNotification(row: any): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    description: row.description,
    icon: row.icon,
    isRead: row.is_read,
    metadata: row.metadata,
    actionUrl: row.action_url || undefined,
    category: row.category || categoryForNotificationType(row.type),
    priority: row.priority || 'normal',
    pushStatus: row.push_status || 'pending',
    pushSentAt: toIso(row.push_sent_at),
    pushSuccessCount: Number(row.push_success_count || 0),
    pushFailureCount: Number(row.push_failure_count || 0),
    createdAt: toIso(row.created_at)!,
    updatedAt: toIso(row.updated_at)!,
  };
}

async function dispatchPush(notification: Notification) {
  return pushNotificationService.sendStoredNotification({
    id: notification.id,
    userId: notification.userId,
    type: notification.type,
    title: notification.title,
    description: notification.description,
    actionUrl: notification.actionUrl,
    category: notification.category,
    priority: notification.priority,
  });
}

// Nomes das etapas do funil por omissão (as personalizadas já chegam com o nome)
const STAGE_LABELS: Record<string, string> = {
  novo: 'Novos', contatado: 'Contactados', contactado: 'Contactados', qualificado: 'Qualificados',
  negociacao: 'Negociação', em_negociacao: 'Negociação', convertido: 'Convertidos', perdido: 'Perdidos',
};
const stageLabel = (status: string) =>
  STAGE_LABELS[String(status).toLowerCase()] || String(status).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export type StageChangeSource = 'manual' | 'ai' | 'flow';

export const notificationsService = {
  /**
   * Lead mudou de etapa no funil. Movido pelo assistente de IA ou por um fluxo: push no
   * telemóvel (o utilizador não viu acontecer). Movido à mão: só fica no histórico (quem
   * moveu já sabe; o telemóvel não toca a cada lead arrastado).
   */
  async notifyLeadStageChange(
    userId: string,
    lead: { id: string; name?: string | null; email?: string | null },
    fromStatus: string | null | undefined,
    toStatus: string,
    source: StageChangeSource,
  ) {
    const leadName = lead.name || lead.email || 'Lead sem nome';
    const to = stageLabel(toStatus);
    const won = ['convertido', 'ganho', 'fechado'].includes(String(toStatus).toLowerCase());
    const by = source === 'ai' ? 'O assistente de IA moveu' : source === 'flow' ? 'Um fluxo moveu' : 'Moveu';
    return this.createNotification(
      userId,
      'lead_status_changed',
      won ? `Negócio fechado: ${leadName}` : `${leadName} → ${to}`,
      `${by} ${leadName} para ${to}`,
      'arrow-right',
      { leadId: lead.id, leadName, oldStatus: fromStatus || null, newStatus: toStatus, source },
      {
        actionUrl: '/dashboard/funnel',
        category: 'leads',
        priority: won ? 'high' : 'normal',
        sendPush: source !== 'manual',
      },
    ).catch((err) => console.warn('[Notifications] Aviso de etapa falhou:', err?.message || err));
  },

  async getNotifications(userId: string, limit = 20, offset = 0): Promise<Notification[]> {
    const result = await query(
      `SELECT ${NOTIFICATION_COLUMNS}
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    return result.rows.map(mapNotification);
  },

  async createNotification(
    userId: string,
    type: string,
    title: string,
    description?: string,
    icon?: string,
    metadata?: Record<string, any>,
    delivery: NotificationDeliveryOptions = {},
  ): Promise<Notification> {
    const actionUrl = delivery.actionUrl || metadata?.actionUrl || metadata?.action_url || null;
    const category = delivery.category || categoryForNotificationType(type);
    const priority = delivery.priority || (category === 'messages' || category === 'tasks' ? 'high' : 'normal');
    const result = await query(
      `INSERT INTO notifications
        (user_id, type, title, description, icon, metadata, action_url, category, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${NOTIFICATION_COLUMNS}`,
      [userId, type, title, description || null, icon || null, JSON.stringify(metadata || {}), actionUrl, category, priority]
    );

    const notification = mapNotification(result.rows[0]);
    if (delivery.sendPush !== false) {
      void dispatchPush(notification).catch((error) =>
        console.warn(`[Push] Falha ao enviar a notificação ${notification.id}:`, error?.message || error));
    }
    return notification;
  },

  async createAndSendNotification(
    userId: string,
    type: string,
    title: string,
    description?: string,
    icon?: string,
    metadata?: Record<string, any>,
    delivery: NotificationDeliveryOptions = {},
  ) {
    const notification = await this.createNotification(
      userId,
      type,
      title,
      description,
      icon,
      metadata,
      { ...delivery, sendPush: false },
    );
    const push = await dispatchPush(notification);
    return { notification, push };
  },

  async sendBatch(
    userIds: string[],
    payload: {
      type: string;
      title: string;
      description?: string;
      icon?: string;
      metadata?: Record<string, any>;
      delivery?: NotificationDeliveryOptions;
    },
  ) {
    const results: Array<{ userId: string; notificationId?: string; success: boolean; push?: any; error?: string }> = [];
    for (let start = 0; start < userIds.length; start += 10) {
      const chunk = userIds.slice(start, start + 10);
      const sent = await Promise.all(chunk.map(async (userId) => {
        try {
          const { notification, push } = await this.createAndSendNotification(
            userId,
            payload.type,
            payload.title,
            payload.description,
            payload.icon,
            payload.metadata,
            payload.delivery,
          );
          return { userId, notificationId: notification.id, success: true, push };
        } catch (error: any) {
          return { userId, success: false, error: String(error?.message || error) };
        }
      }));
      results.push(...sent);
    }
    return results;
  },

  async getTotalCount(userId: string): Promise<number> {
    const result = await query('SELECT COUNT(*) AS count FROM notifications WHERE user_id = $1', [userId]);
    return Number(result.rows[0]?.count || 0);
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

          await this.createNotification(admin.id, type, title, description, icon, metadata);

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
