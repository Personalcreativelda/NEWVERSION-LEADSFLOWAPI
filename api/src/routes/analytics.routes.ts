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

export default router;
