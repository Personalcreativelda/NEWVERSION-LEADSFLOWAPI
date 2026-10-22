import { Router } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import { notificationsService } from '../services/notifications.service';

const router = Router();

// Get user notifications
router.get('/', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    const notifications = await notificationsService.getNotifications(req.user.id, limit, offset);

    res.json({
      success: true,
      notifications,
      limit,
      offset,
    });
  } catch (error) {
    console.error('[Notifications] Error fetching notifications:', error);
    next(error);
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
