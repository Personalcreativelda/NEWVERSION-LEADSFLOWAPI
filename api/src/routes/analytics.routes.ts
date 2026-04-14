import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { AnalyticsService } from '../services/analytics.service';

const router = Router();
const analyticsService = new AnalyticsService();

router.use(authMiddleware);

router.get('/dashboard', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const stats = await analyticsService.getDashboardStats(user.id);
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

router.get('/leads', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const data = await analyticsService.getLeadsTimeline(user.id);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.get('/messages', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const data = await analyticsService.getMessagesTimeline(user.id);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Aggregate real campaign stats from the stats JSON column
router.get('/campaigns/engagement', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { query } = await import('../database/connection');

    const result = await query(
      `SELECT
         id, name, type, status, created_at, completed_at,
         COALESCE(stats::jsonb, '{}'::jsonb) AS stats
       FROM campaigns
       WHERE user_id = $1
         AND status IN ('completed', 'active', 'failed')
       ORDER BY created_at DESC`,
      [user.id]
    );

    // Aggregate totals across all campaigns
    let totalSent = 0;
    let totalDelivered = 0;
    let totalRead = 0;
    let totalReplied = 0;
    let totalFailed = 0;
    let totalTotal = 0;

    const perCampaign = result.rows.map((row: any) => {
      const stats = typeof row.stats === 'string' ? JSON.parse(row.stats) : row.stats || {};
      const sent = Number(stats.sent || 0);
      const delivered = Number(stats.delivered || 0);
      const read = Number(stats.read || 0);
      const replied = Number(stats.replied || 0);
      const failed = Number(stats.failed || 0);
      const total = Number(stats.total || sent + failed);

      totalSent += sent;
      totalDelivered += delivered;
      totalRead += read;
      totalReplied += replied;
      totalFailed += failed;
      totalTotal += total;

      // deliveryRate: use real delivery receipts if available, otherwise use sent/total (send success rate)
      const deliveryRate = delivered > 0
        ? Math.round((delivered / sent) * 100)
        : (total > 0 ? Math.round((sent / total) * 100) : 0);

      return {
        id: row.id,
        name: row.name,
        type: row.type,
        status: row.status,
        createdAt: row.created_at,
        completedAt: row.completed_at,
        stats: { total, sent, delivered, read, replied, failed },
        rates: {
          deliveryRate,
          openRate: sent > 0 ? Math.round((read / sent) * 100) : 0,
          replyRate: sent > 0 ? Math.round((replied / sent) * 100) : 0,
          failRate: total > 0 ? Math.round((failed / total) * 100) : 0,
        },
      };
    });

    // Global delivery rate: real delivery receipts if available, else sent/total fallback
    const globalDeliveryRate = totalDelivered > 0
      ? Math.round((totalDelivered / totalSent) * 100)
      : (totalTotal > 0 ? Math.round((totalSent / totalTotal) * 100) : 0);

    const totals = {
      total: totalTotal,
      sent: totalSent,
      delivered: totalDelivered,
      read: totalRead,
      replied: totalReplied,
      failed: totalFailed,
      deliveryRate: globalDeliveryRate,
      openRate: totalSent > 0 ? Math.round((totalRead / totalSent) * 100) : 0,
      replyRate: totalSent > 0 ? Math.round((totalReplied / totalSent) * 100) : 0,
    };

    res.json({ totals, campaigns: perCampaign });
  } catch (error) {
    next(error);
  }
});

export default router;
