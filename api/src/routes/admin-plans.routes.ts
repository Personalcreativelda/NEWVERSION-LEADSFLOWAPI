import { Router } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import { plansService } from '../services/plans.service';
import { query } from '../database/connection';

const router = Router();

// Get all plans (admin only)
router.get('/', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user is admin
    const result = await query('SELECT role FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0 || result.rows[0].role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const plans = await plansService.getAllPlans();
    res.json({ success: true, plans });
  } catch (error) {
    console.error('[Admin Plans] Error fetching plans:', error);
    next(error);
  }
});

// Create plan (admin only)
router.post('/', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user is admin
    const result = await query('SELECT role FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0 || result.rows[0].role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id, name, description, priceMonthly, priceAnnual, features, limits } = req.body;

    if (!id || !name) {
      return res.status(400).json({ error: 'ID and name are required' });
    }

    const plan = await plansService.createPlan(
      id,
      name,
      description,
      priceMonthly || 0,
      priceAnnual || 0,
      features || [],
      limits || {}
    );

    console.log(`[Admin Plans] Created plan: ${id}`);

    res.json({ success: true, plan });
  } catch (error) {
    console.error('[Admin Plans] Error creating plan:', error);
    next(error);
  }
});

// Update plan (admin only)
router.put('/:id', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user is admin
    const result = await query('SELECT role FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0 || result.rows[0].role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    const updates = req.body;

    const plan = await plansService.updatePlan(id, {
      name: updates.name,
      description: updates.description,
      price_monthly: updates.priceMonthly,
      price_annual: updates.priceAnnual,
      features: updates.features,
      limits: updates.limits,
    });

    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    console.log(`[Admin Plans] Updated plan: ${id}`);

    res.json({ success: true, plan });
  } catch (error) {
    console.error('[Admin Plans] Error updating plan:', error);
    next(error);
  }
});

// Delete plan (admin only)
router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user is admin
    const result = await query('SELECT role FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0 || result.rows[0].role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;

    // Mark as inactive instead of deleting
    const result2 = await query(
      'UPDATE plans SET is_active = false WHERE id = $1 RETURNING id',
      [id]
    );

    if (result2.rows.length === 0) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    console.log(`[Admin Plans] Deactivated plan: ${id}`);

    res.json({ success: true, message: 'Plan deactivated' });
  } catch (error) {
    console.error('[Admin Plans] Error deleting plan:', error);
    next(error);
  }
});

export default router;
