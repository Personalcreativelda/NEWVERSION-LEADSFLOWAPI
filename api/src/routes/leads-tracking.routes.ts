import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { leadTrackingService } from '../services/lead-tracking.service';

const router = Router();

router.use(authMiddleware);

/**
 * GET /api/leads-tracking/captured-today
 * Obter leads capturados hoje com filtros opcionais
 */
router.get('/captured-today', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const leads = await leadTrackingService.getLeadsCapturedToday(user.id, {
      channelSource: req.query.channelSource as string,
      status: req.query.status as string,
      limit: req.query.limit ? Number(req.query.limit) : 100,
      offset: req.query.offset ? Number(req.query.offset) : 0,
    });

    res.json({
      success: true,
      count: leads.length,
      data: leads
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/leads-tracking/stats/by-channel
 * Obter estatísticas de leads por canal nos últimos X dias
 */
router.get('/stats/by-channel', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const days = req.query.days ? Number(req.query.days) : 7;
    const stats = await leadTrackingService.getLeadsStatsByChannel(user.id, days);

    // Agrupar por canal
    const byChannel: Record<string, any> = {};
    stats.forEach((row: any) => {
      if (!byChannel[row.channel_source]) {
        byChannel[row.channel_source] = {
          channel: row.channel_source,
          total: 0,
          today: 0,
          byStatus: {},
          lastCaptured: null,
          avgHoursOld: 0
        };
      }

      byChannel[row.channel_source].total += row.count;
      byChannel[row.channel_source].today += row.today;
      byChannel[row.channel_source].byStatus[row.status] = row.count;
      byChannel[row.channel_source].lastCaptured = row.last_captured;
      byChannel[row.channel_source].avgHoursOld = Math.round(row.avg_hours_old);
    });

    res.json({
      success: true,
      period: `${days} days`,
      data: Object.values(byChannel)
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/leads-tracking/:leadId/history
 * Obter histórico de mudanças de status de um lead
 */
router.get('/:leadId/history', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const history = await leadTrackingService.getStatusHistory(user.id, req.params.leadId);

    res.json({
      success: true,
      count: history.length,
      data: history
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/leads-tracking/:leadId/interactions
 * Obter todas as interações de um lead
 */
router.get('/:leadId/interactions', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const interactions = await leadTrackingService.getLeadInteractions(user.id, req.params.leadId, {
      interactionType: req.query.type as string,
      limit: req.query.limit ? Number(req.query.limit) : 100,
      offset: req.query.offset ? Number(req.query.offset) : 0,
    });

    res.json({
      success: true,
      count: interactions.length,
      data: interactions
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/leads-tracking/:leadId/summary
 * Obter resumo completo de movimento de um lead
 */
router.get('/:leadId/summary', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const summary = await leadTrackingService.getLeadMovementSummary(user.id, req.params.leadId);
    
    if (!summary) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    next(error);
  }
});

export default router;
