import { Router } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';
import { requireAdmin, requireAuth } from '../middleware/auth.middleware';
import { notificationsService } from '../services/notifications.service';
import { pushNotificationService, type NotificationPreferences } from '../services/push-notification.service';
import { query } from '../database/connection';

const router = Router();

// Get user notifications
router.get('/', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const [notifications, total, unread] = await Promise.all([
      notificationsService.getNotifications(req.user.id, limit, offset),
      notificationsService.getTotalCount(req.user.id),
      notificationsService.getUnreadCount(req.user.id),
    ]);

    res.json({
      success: true,
      notifications,
      total,
      unread,
      limit,
      offset,
    });
  } catch (error) {
    console.error('[Notifications] Error fetching notifications:', error);
    next(error);
  }
});

// Registar ou renovar o token FCM deste dispositivo.
router.post('/devices/register', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const { token, platform = 'android', deviceId, deviceName, appVersion, locale } = req.body || {};
    if (typeof token !== 'string' || token.length < 20 || token.length > 4096) {
      return res.status(400).json({ error: 'Token FCM inválido' });
    }
    if (typeof deviceId !== 'string' || !deviceId.trim() || deviceId.length > 255) {
      return res.status(400).json({ error: 'Identificador do dispositivo inválido' });
    }
    if (!['android', 'ios', 'web'].includes(platform)) {
      return res.status(400).json({ error: 'Plataforma inválida' });
    }

    const device = await pushNotificationService.registerDevice(req.user.id, {
      token: token.trim(),
      platform,
      deviceId: deviceId.trim(),
      deviceName: typeof deviceName === 'string' ? deviceName.slice(0, 255) : undefined,
      appVersion: typeof appVersion === 'string' ? appVersion.slice(0, 50) : undefined,
      locale: typeof locale === 'string' ? locale.slice(0, 20) : undefined,
    });
    return res.status(201).json({ success: true, device });
  } catch (error) {
    return next(error);
  }
});

// No logout desativa apenas este aparelho; os restantes dispositivos continuam ligados.
router.post('/devices/unregister', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const deviceId = typeof req.body?.deviceId === 'string' ? req.body.deviceId.trim() : '';
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (!deviceId && !token) return res.status(400).json({ error: 'Indique o dispositivo' });
    const disabled = await pushNotificationService.unregisterDevice(req.user.id, deviceId, token);
    return res.json({ success: true, disabled });
  } catch (error) {
    return next(error);
  }
});

router.get('/devices', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const devices = await pushNotificationService.listDevices(req.user.id);
    return res.json({ success: true, devices });
  } catch (error) {
    return next(error);
  }
});

router.get('/preferences', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const preferences = await pushNotificationService.getPreferences(req.user.id);
    return res.json({ success: true, preferences, firebaseConfigured: pushNotificationService.isConfigured() });
  } catch (error) {
    return next(error);
  }
});

router.put('/preferences', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const current = await pushNotificationService.getPreferences(req.user.id);
    const body = req.body || {};
    const booleanKeys: Array<keyof NotificationPreferences> = [
      'pushEnabled', 'messagesEnabled', 'leadsEnabled', 'campaignsEnabled',
      'tasksEnabled', 'systemEnabled', 'quietHoursEnabled',
    ];
    const next = { ...current };
    for (const key of booleanKeys) {
      if (body[key] !== undefined) {
        if (typeof body[key] !== 'boolean') return res.status(400).json({ error: `Valor inválido em ${key}` });
        (next as any)[key] = body[key];
      }
    }

    const validTime = /^([01]\d|2[0-3]):[0-5]\d$/;
    for (const key of ['quietHoursStart', 'quietHoursEnd'] as const) {
      if (body[key] !== undefined) {
        if (typeof body[key] !== 'string' || !validTime.test(body[key])) {
          return res.status(400).json({ error: `Hora inválida em ${key}` });
        }
        next[key] = body[key];
      }
    }
    if (body.timezone !== undefined) {
      if (typeof body.timezone !== 'string' || body.timezone.length > 100) {
        return res.status(400).json({ error: 'Fuso horário inválido' });
      }
      try { new Intl.DateTimeFormat('pt', { timeZone: body.timezone }).format(); }
      catch { return res.status(400).json({ error: 'Fuso horário inválido' }); }
      next.timezone = body.timezone;
    }

    const preferences = await pushNotificationService.updatePreferences(req.user.id, next);
    return res.json({ success: true, preferences });
  } catch (error) {
    return next(error);
  }
});

// Envio administrativo individual ou em lote. Tokens de API pública nunca chegam aqui.
router.post('/send', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res, next) => {
  try {
    const body = req.body || {};
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    if (!title || title.length > 120) return res.status(400).json({ error: 'Título obrigatório (máximo de 120 caracteres)' });
    if (description.length > 500) return res.status(400).json({ error: 'Mensagem demasiado longa (máximo de 500 caracteres)' });

    const actionUrl = typeof body.actionUrl === 'string' ? body.actionUrl.trim() : '/dashboard/notifications';
    if (actionUrl !== '/' && actionUrl !== '/dashboard' && !actionUrl.startsWith('/dashboard/')) {
      return res.status(400).json({ error: 'O destino tem de ser uma página interna do painel' });
    }
    const category = body.category || 'system';
    if (!['messages', 'leads', 'campaigns', 'tasks', 'system'].includes(category)) {
      return res.status(400).json({ error: 'Categoria inválida' });
    }
    const priority = body.priority || 'normal';
    if (!['normal', 'high', 'urgent'].includes(priority)) {
      return res.status(400).json({ error: 'Prioridade inválida' });
    }

    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    let requestedIds: string[] = [];
    if (body.all === true) {
      const users = await query('SELECT id FROM users WHERE is_active = true ORDER BY id LIMIT 1001');
      if (users.rows.length > 1000) return res.status(413).json({ error: 'O lote excede 1000 utilizadores' });
      requestedIds = users.rows.map((row: any) => row.id);
    } else {
      requestedIds = [
        ...(typeof body.userId === 'string' ? [body.userId] : []),
        ...(Array.isArray(body.userIds) ? body.userIds : []),
      ].filter((id) => typeof id === 'string' && uuid.test(id));
      requestedIds = [...new Set(requestedIds)].slice(0, 1000);
    }
    if (requestedIds.length === 0) return res.status(400).json({ error: 'Indique pelo menos um utilizador' });

    const existing = await query(
      'SELECT id FROM users WHERE is_active = true AND id = ANY($1::uuid[])',
      [requestedIds],
    );
    const userIds = existing.rows.map((row: any) => row.id);
    if (userIds.length === 0) return res.status(404).json({ error: 'Nenhum utilizador ativo encontrado' });

    const metadata = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata) ? body.metadata : {};
    if (Buffer.byteLength(JSON.stringify(metadata), 'utf8') > 10_000) {
      return res.status(413).json({ error: 'Metadados demasiado grandes' });
    }

    const results = await notificationsService.sendBatch(userIds, {
      type: typeof body.type === 'string' ? body.type.slice(0, 50) : 'system_update',
      title,
      description: description || undefined,
      icon: typeof body.icon === 'string' ? body.icon.slice(0, 50) : 'bell',
      metadata,
      delivery: { actionUrl, category, priority },
    });
    const delivered = results.filter((item) => item.success).length;
    return res.json({ success: delivered > 0, requested: userIds.length, delivered, failed: results.length - delivered, results });
  } catch (error) {
    return next(error);
  }
});

// Get unread notification count
router.get('/unread/count', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const count = await notificationsService.getUnreadCount(req.user.id);

    res.json({ success: true, count });
  } catch (error) {
    console.error('[Notifications] Error fetching unread count:', error);
    next(error);
  }
});

// Mark all notifications as read (PUT /mark-all-read é o que o dashboard chama)
const markAllAsReadHandler = async (req: AuthenticatedRequest, res: any, next: any) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const count = await notificationsService.markAllAsRead(req.user.id);

    console.log(`[Notifications] Marked ${count} notifications as read for user ${req.user.id}`);

    res.json({
      success: true,
      message: 'All notifications marked as read',
      marked: count
    });
  } catch (error) {
    console.error('[Notifications] Error marking all notifications as read:', error);
    next(error);
  }
};
router.post('/mark-all/read', requireAuth, markAllAsReadHandler);
router.put('/mark-all-read', requireAuth, markAllAsReadHandler);

// Mark one notification as read (MUST come BEFORE /:id routes)
router.put('/:id/read', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const updated = await notificationsService.markAsRead(req.params.id, req.user.id);
    if (!updated) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[Notifications] Error marking notification as read:', error);
    next(error);
  }
});

// Clear all notifications (MUST come BEFORE /:id route)
router.delete('/clear-all', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const count = await notificationsService.deleteAllNotifications(req.user.id);

    console.log(`[Notifications] Deleted ${count} notifications for user ${req.user.id}`);

    res.json({
      success: true,
      message: 'All notifications cleared successfully',
      cleared: count
    });
  } catch (error) {
    console.error('[Notifications] Error clearing notifications:', error);
    next(error);
  }
});

// Delete notification (generic - must come AFTER /clear-all)
router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    const deleted = await notificationsService.deleteNotification(id, req.user.id);

    if (!deleted) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    console.log(`[Notifications] Deleted notification ${id}`);

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    console.error('[Notifications] Error deleting notification:', error);
    next(error);
  }
});

export default router;
