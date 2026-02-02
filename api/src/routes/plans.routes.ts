import { Router } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import { query } from '../database/connection';
import { plansService } from '../services/plans.service';
import { notificationsService } from '../services/notifications.service';

const router = Router();

// Get all available plans (public endpoint)
router.get('/', async (_req, res, next) => {
  try {
    const plans = await plansService.getAllPlans();
    res.json({ success: true, plans });
  } catch (error) {
    console.error('[Plans] Error fetching plans:', error);
    next(error);
  }
});

// Upgrade user plan (authenticated)
router.post('/upgrade', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { planId } = req.body;

    if (!planId) {
      return res.status(400).json({ error: 'Plan ID is required' });
    }

    // Validate plan exists in database
    const planExists = await plansService.validatePlanId(planId);
    if (!planExists) {
      return res.status(400).json({ error: 'Invalid plan ID' });
    }

    // Update user's plan in database
    const result = await query(
      `UPDATE users
       SET plan = $1, subscription_plan = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, email, name, avatar_url, plan, subscription_plan`,
      [planId, req.user.id]
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`[Plans] User ${user.email} upgraded to plan: ${planId}`);

    // Create notification
    await notificationsService.createNotification(
      req.user.id,
      'plan_upgraded',
      'Plano Atualizado',
      `Você atualizou seu plano para ${user.plan.toUpperCase()}`,
      'zap',
      { planId, planName: user.plan }
    );

    res.json({
      success: true,
      message: `Plano atualizado para ${planId}`,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar_url: user.avatar_url,
        plan: user.plan,
        subscription_plan: user.subscription_plan,
      }
    });
  } catch (error) {
    console.error('[Plans] Error upgrading plan:', error);
    next(error);
  }
});

export default router;
