import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { RemarketingService } from '../services/remarketing.service';

const router = Router();
const svc = new RemarketingService();

router.use(authMiddleware);

// ── GET /api/remarketing ─────────────────────────────────────────────────────
// List all flows for the authenticated user
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const flows = await svc.findAll(userId);
    res.json(flows);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/remarketing/analytics ──────────────────────────────────────────
// Summary stats (total, active, enrolled, conversion rate)
router.get('/analytics', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const data = await svc.analytics(userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/remarketing/:id ─────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const flow = await svc.findById(req.params.id, userId);
    if (!flow) return res.status(404).json({ error: 'Flow not found' });

    res.json(flow);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/remarketing ────────────────────────────────────────────────────
// Create a new flow (from scratch or from template)
router.post('/', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { name, description, status, trigger_type, trigger_label, steps, template_id } = req.body;

    if (!name || !trigger_type || !trigger_label) {
      return res.status(400).json({ error: 'name, trigger_type and trigger_label are required' });
    }

    const flow = await svc.create(
      { name, description, status, trigger_type, trigger_label, steps: steps ?? [], template_id },
      userId,
    );
    res.status(201).json(flow);
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/remarketing/:id ─────────────────────────────────────────────────
// Update a flow (name, status, steps, etc.)
router.put('/:id', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const updated = await svc.update(req.params.id, req.body, userId);
    if (!updated) return res.status(404).json({ error: 'Flow not found' });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/remarketing/:id/toggle ───────────────────────────────────────
// Toggle between active ↔ paused
router.patch('/:id/toggle', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const updated = await svc.toggleStatus(req.params.id, userId);
    if (!updated) return res.status(404).json({ error: 'Flow not found' });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/remarketing/:id/duplicate ─────────────────────────────────────
// Duplicate a flow (creates copy as draft)
router.post('/:id/duplicate', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const copy = await svc.duplicate(req.params.id, userId);
    if (!copy) return res.status(404).json({ error: 'Flow not found' });

    res.status(201).json(copy);
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/remarketing/:id ──────────────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const deleted = await svc.delete(req.params.id, userId);
    if (!deleted) return res.status(404).json({ error: 'Flow not found' });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
