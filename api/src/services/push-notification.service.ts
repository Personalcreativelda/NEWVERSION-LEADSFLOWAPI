import { applicationDefault, cert, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app';
import { getMessaging, type BatchResponse, type MulticastMessage } from 'firebase-admin/messaging';
import { query } from '../database/connection';

export type NotificationCategory = 'messages' | 'leads' | 'campaigns' | 'tasks' | 'system';
export type NotificationPriority = 'normal' | 'high' | 'urgent';

export interface StoredPushNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  description?: string;
  actionUrl?: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  /** Notificações com a mesma tag substituem-se no telemóvel (ex.: uma por conversa) */
  tag?: string;
  /** Dados extra para o app (ex.: conversation_id) */
  data?: Record<string, string>;
}

/** Push sem linha no histórico (mensagens de clientes: o sino encheria com cada mensagem) */
export type DirectPushNotification = Omit<StoredPushNotification, 'id'>;

export interface NotificationPreferences {
  pushEnabled: boolean;
  messagesEnabled: boolean;
  leadsEnabled: boolean;
  campaignsEnabled: boolean;
  tasksEnabled: boolean;
  systemEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  timezone: string;
}

export interface DeviceRegistration {
  token: string;
  platform: 'android' | 'ios' | 'web';
  deviceId: string;
  deviceName?: string;
  appVersion?: string;
  locale?: string;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  pushEnabled: true,
  messagesEnabled: true,
  leadsEnabled: true,
  campaignsEnabled: true,
  tasksEnabled: true,
  systemEnabled: true,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  timezone: 'Africa/Maputo',
};

const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

let firebaseApp: App | null | undefined;
let missingConfigLogged = false;

function serviceAccountFromEnvironment(): ServiceAccount | null {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (inline) {
    const decoded = inline.startsWith('{') ? inline : Buffer.from(inline, 'base64').toString('utf8');
    return JSON.parse(decoded) as ServiceAccount;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
  if (projectId && clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey };
  }
  return null;
}

function getFirebaseApp(): App | null {
  if (firebaseApp !== undefined) return firebaseApp;

  try {
    const existing = getApps().find((app) => app.name === 'leadsflow-push');
    if (existing) {
      firebaseApp = existing;
      return firebaseApp;
    }

    const serviceAccount = serviceAccountFromEnvironment();
    if (serviceAccount) {
      firebaseApp = initializeApp({ credential: cert(serviceAccount) }, 'leadsflow-push');
      return firebaseApp;
    }

    if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
      firebaseApp = initializeApp({ credential: applicationDefault() }, 'leadsflow-push');
      return firebaseApp;
    }

    firebaseApp = null;
    if (!missingConfigLogged) {
      missingConfigLogged = true;
      console.warn('[Push] Firebase não configurado; o histórico continua ativo, mas não há envio FCM.');
    }
    return null;
  } catch (error: any) {
    firebaseApp = null;
    console.error('[Push] Não foi possível inicializar o Firebase Admin:', error?.message || error);
    return null;
  }
}

export function categoryForNotificationType(type: string): NotificationCategory {
  const value = type.toLowerCase();
  if (value.includes('message') || value.includes('reply') || value.includes('inbox') || value.includes('conversation')) return 'messages';
  if (value.includes('lead')) return 'leads';
  if (value.includes('campaign')) return 'campaigns';
  if (value.includes('task') || value.includes('reminder') || value.includes('appointment')) return 'tasks';
  return 'system';
}

function preferenceAllows(preferences: NotificationPreferences, category: NotificationCategory): boolean {
  if (!preferences.pushEnabled) return false;
  const flags: Record<NotificationCategory, boolean> = {
    messages: preferences.messagesEnabled,
    leads: preferences.leadsEnabled,
    campaigns: preferences.campaignsEnabled,
    tasks: preferences.tasksEnabled,
    system: preferences.systemEnabled,
  };
  return flags[category];
}

function minutes(value: string): number {
  const [hour = '0', minute = '0'] = value.split(':');
  return Number(hour) * 60 + Number(minute);
}

function isInsideQuietHours(preferences: NotificationPreferences): boolean {
  if (!preferences.quietHoursEnabled) return false;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: preferences.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());
    const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0);
    const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);
    const now = hour * 60 + minute;
    const start = minutes(preferences.quietHoursStart);
    const end = minutes(preferences.quietHoursEnd);
    if (start === end) return true;
    return start < end ? now >= start && now < end : now >= start || now < end;
  } catch {
    return false;
  }
}

function mapPreferences(row?: any): NotificationPreferences {
  if (!row) return { ...DEFAULT_PREFERENCES };
  return {
    pushEnabled: row.push_enabled,
    messagesEnabled: row.messages_enabled,
    leadsEnabled: row.leads_enabled,
    campaignsEnabled: row.campaigns_enabled,
    tasksEnabled: row.tasks_enabled,
    systemEnabled: row.system_enabled,
    quietHoursEnabled: row.quiet_hours_enabled,
    quietHoursStart: String(row.quiet_hours_start).slice(0, 5),
    quietHoursEnd: String(row.quiet_hours_end).slice(0, 5),
    timezone: row.timezone,
  };
}

async function setNotificationPushStatus(
  notificationId: string,
  status: string,
  successCount = 0,
  failureCount = 0,
): Promise<void> {
  await query(
    `UPDATE notifications
        SET push_status = $2,
            push_sent_at = CASE WHEN $3::integer + $4::integer > 0 THEN NOW() ELSE push_sent_at END,
            push_success_count = $3,
            push_failure_count = $4,
            updated_at = NOW()
      WHERE id = $1`,
    [notificationId, status, successCount, failureCount],
  );
}

async function recordTokenFailures(tokens: string[], response: BatchResponse): Promise<void> {
  const invalidTokens: string[] = [];
  const failuresByCode = new Map<string, string[]>();

  response.responses.forEach((item, index) => {
    if (item.success) return;
    const code = item.error?.code || 'messaging/unknown-error';
    const token = tokens[index];
    if (!token) return;
    if (INVALID_TOKEN_CODES.has(code)) invalidTokens.push(token);
    else failuresByCode.set(code, [...(failuresByCode.get(code) || []), token]);
  });

  if (invalidTokens.length > 0) {
    await query(
      `UPDATE push_device_tokens
          SET is_active = false, failure_count = failure_count + 1,
              last_error = 'Token FCM inválido', updated_at = NOW()
        WHERE token = ANY($1::text[])`,
      [invalidTokens],
    );
  }

  for (const [code, failedTokens] of failuresByCode) {
    await query(
      `UPDATE push_device_tokens
          SET failure_count = failure_count + 1, last_error = $2, updated_at = NOW()
        WHERE token = ANY($1::text[])`,
      [failedTokens, code.slice(0, 255)],
    );
  }
}

function channelFor(category: NotificationCategory): string {
  if (category === 'messages') return 'leadsflow_messages';
  if (category === 'tasks') return 'leadsflow_reminders';
  return 'leadsflow_general';
}

export const pushNotificationService = {
  isConfigured(): boolean {
    return getFirebaseApp() !== null;
  },

  async registerDevice(userId: string, registration: DeviceRegistration) {
    await query(
      `UPDATE push_device_tokens
          SET is_active = false, updated_at = NOW()
        WHERE user_id = $1 AND platform = $2 AND device_id = $3 AND token <> $4`,
      [userId, registration.platform, registration.deviceId, registration.token],
    );

    const result = await query(
      `INSERT INTO push_device_tokens
        (user_id, token, platform, device_id, device_name, app_version, locale, is_active, failure_count, last_error, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, 0, NULL, NOW())
       ON CONFLICT (token) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         platform = EXCLUDED.platform,
         device_id = EXCLUDED.device_id,
         device_name = EXCLUDED.device_name,
         app_version = EXCLUDED.app_version,
         locale = EXCLUDED.locale,
         is_active = true,
         failure_count = 0,
         last_error = NULL,
         last_seen_at = NOW(),
         updated_at = NOW()
       RETURNING id, platform, device_id, device_name, app_version, locale, last_seen_at`,
      [
        userId,
        registration.token,
        registration.platform,
        registration.deviceId,
        registration.deviceName || null,
        registration.appVersion || null,
        registration.locale || null,
      ],
    );
    return result.rows[0];
  },

  async unregisterDevice(userId: string, deviceId?: string, token?: string): Promise<number> {
    const result = await query(
      `UPDATE push_device_tokens
          SET is_active = false, updated_at = NOW()
        WHERE user_id = $1
          AND (($2::text IS NOT NULL AND device_id = $2) OR ($3::text IS NOT NULL AND token = $3))
        RETURNING id`,
      [userId, deviceId || null, token || null],
    );
    return result.rows.length;
  },

  async listDevices(userId: string) {
    const result = await query(
      `SELECT id, platform, device_id, device_name, app_version, locale, is_active, last_seen_at, created_at
         FROM push_device_tokens
        WHERE user_id = $1
        ORDER BY last_seen_at DESC`,
      [userId],
    );
    return result.rows.map((row: any) => ({
      id: row.id,
      platform: row.platform,
      deviceId: row.device_id,
      deviceName: row.device_name,
      appVersion: row.app_version,
      locale: row.locale,
      isActive: row.is_active,
      lastSeenAt: row.last_seen_at,
      createdAt: row.created_at,
    }));
  },

  async getPreferences(userId: string): Promise<NotificationPreferences> {
    const result = await query('SELECT * FROM notification_preferences WHERE user_id = $1', [userId]);
    return mapPreferences(result.rows[0]);
  },

  async updatePreferences(userId: string, preferences: NotificationPreferences): Promise<NotificationPreferences> {
    const result = await query(
      `INSERT INTO notification_preferences
        (user_id, push_enabled, messages_enabled, leads_enabled, campaigns_enabled, tasks_enabled,
         system_enabled, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, timezone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::time, $10::time, $11)
       ON CONFLICT (user_id) DO UPDATE SET
         push_enabled = EXCLUDED.push_enabled,
         messages_enabled = EXCLUDED.messages_enabled,
         leads_enabled = EXCLUDED.leads_enabled,
         campaigns_enabled = EXCLUDED.campaigns_enabled,
         tasks_enabled = EXCLUDED.tasks_enabled,
         system_enabled = EXCLUDED.system_enabled,
         quiet_hours_enabled = EXCLUDED.quiet_hours_enabled,
         quiet_hours_start = EXCLUDED.quiet_hours_start,
         quiet_hours_end = EXCLUDED.quiet_hours_end,
         timezone = EXCLUDED.timezone,
         updated_at = NOW()
       RETURNING *`,
      [
        userId,
        preferences.pushEnabled,
        preferences.messagesEnabled,
        preferences.leadsEnabled,
        preferences.campaignsEnabled,
        preferences.tasksEnabled,
        preferences.systemEnabled,
        preferences.quietHoursEnabled,
        preferences.quietHoursStart,
        preferences.quietHoursEnd,
        preferences.timezone,
      ],
    );
    return mapPreferences(result.rows[0]);
  },

  async sendStoredNotification(notification: StoredPushNotification) {
    return this.deliver(notification, true);
  },

  /** Envia para os aparelhos sem gravar no histórico (respeita preferências e horas de silêncio) */
  async sendDirect(notification: DirectPushNotification) {
    return this.deliver({ ...notification, id: '' }, false);
  },

  async deliver(notification: StoredPushNotification, persist: boolean) {
    const setStatus = (...args: Parameters<typeof setNotificationPushStatus>) =>
      persist ? setNotificationPushStatus(...args) : Promise.resolve();
    const app = getFirebaseApp();
    if (!app) {
      await setStatus(notification.id, 'not_configured');
      return { successCount: 0, failureCount: 0, status: 'not_configured' };
    }

    const [preferences, tokenResult] = await Promise.all([
      this.getPreferences(notification.userId),
      query(
        `SELECT token FROM push_device_tokens
          WHERE user_id = $1 AND is_active = true
          ORDER BY last_seen_at DESC`,
        [notification.userId],
      ),
    ]);

    if (!preferenceAllows(preferences, notification.category)) {
      await setStatus(notification.id, 'disabled');
      return { successCount: 0, failureCount: 0, status: 'disabled' };
    }
    if (notification.priority !== 'urgent' && isInsideQuietHours(preferences)) {
      await setStatus(notification.id, 'quiet_hours');
      return { successCount: 0, failureCount: 0, status: 'quiet_hours' };
    }

    const tokens = tokenResult.rows.map((row: any) => String(row.token));
    if (tokens.length === 0) {
      await setStatus(notification.id, 'no_devices');
      return { successCount: 0, failureCount: 0, status: 'no_devices' };
    }

    let successCount = 0;
    let failureCount = 0;
    const messaging = getMessaging(app);
    try {
      for (let start = 0; start < tokens.length; start += 500) {
        const chunk = tokens.slice(start, start + 500);
        const message: MulticastMessage = {
          tokens: chunk,
          notification: {
            title: notification.title,
            body: notification.description || notification.title,
          },
          data: {
            ...(notification.data || {}),
            notification_id: notification.id,
            type: notification.type,
            category: notification.category,
            action_url: notification.actionUrl || '/dashboard/notifications',
          },
          android: {
            priority: notification.priority === 'normal' ? 'normal' : 'high',
            ttl: 24 * 60 * 60 * 1000,
            collapseKey: notification.tag || `${notification.type}:${notification.userId}`,
            notification: {
              channelId: channelFor(notification.category),
              sound: 'default',
              tag: notification.tag || notification.type,
              visibility: 'private',
              defaultVibrateTimings: true,
              priority: notification.priority === 'normal' ? 'default' : 'high',
            },
          },
        };

        const response = await messaging.sendEachForMulticast(message);
        successCount += response.successCount;
        failureCount += response.failureCount;
        if (response.failureCount > 0) await recordTokenFailures(chunk, response);
      }
    } catch (error) {
      await setStatus(notification.id, 'failed', successCount, Math.max(failureCount, tokens.length - successCount));
      throw error;
    }

    const status = successCount > 0 ? 'sent' : 'failed';
    await setStatus(notification.id, status, successCount, failureCount);
    return { successCount, failureCount, status };
  },
};
