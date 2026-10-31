import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { RemarketingService } from '../services/remarketing.service';
import { flowExecutionService } from '../services/flow-execution.service';
import { flowProblems } from '../services/flow-validation';

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

    const { name, description, status, trigger_type, trigger_label, steps, template_id, settings } = req.body;

    if (!name || !trigger_type || !trigger_label) {
      return res.status(400).json({ error: 'name, trigger_type and trigger_label are required' });
    }

    const flow = await svc.create(
      { name, description, status, trigger_type, trigger_label, steps: steps ?? [], template_id, settings },
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

    const flow = await svc.findById(req.params.id, userId);
    if (!flow) return res.status(404).json({ error: 'Flow not found' });

    // Um fluxo só fica ativo com tudo preenchido: nunca se envia uma mensagem vazia
    if (flow.status !== 'active') {
      const problems = flowProblems(flow);
      if (problems.length > 0) return res.status(422).json({ error: problems[0], problems });
    }

    const updated = await svc.toggleStatus(req.params.id, userId);
    if (!updated) return res.status(404).json({ error: 'Flow not found' });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/remarketing/:id/stats ───────────────────────────────────────────
router.get('/:id/stats', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const flow = await svc.findById(req.params.id, userId);
    if (!flow) return res.status(404).json({ error: 'Flow not found' });
    res.json(await svc.stats(req.params.id, userId));
  } catch (err) {
    next(err);
  }
});

// ── POST /api/remarketing/:id/enroll ─────────────────────────────────────────
// Adicionar leads ao fluxo à mão
router.post('/:id/enroll', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const flow = await svc.findById(req.params.id, userId);
    if (!flow) return res.status(404).json({ error: 'Flow not found' });
    if (flow.status !== 'active') return res.status(409).json({ error: 'Ative o fluxo antes de adicionar leads' });

    const leadIds = Array.isArray(req.body?.lead_ids)
      ? [...new Set(req.body.lead_ids.map(String))].filter((id: any) => /^[0-9a-f-]{36}$/i.test(id)) as string[]
      : [];
    if (leadIds.length === 0) return res.status(400).json({ error: 'lead_ids is required' });
    if (leadIds.length > 1000) return res.status(400).json({ error: 'No máximo 1000 leads de cada vez' });

    res.json(await flowExecutionService.enrollManually(flow, leadIds, userId));
  } catch (err) {
    next(err);
  }
});

// ── POST /api/remarketing/:id/test ───────────────────────────────────────────
// Corre o fluxo para um lead escolhido (esperas de segundos, a qualquer hora). Envia mesmo.
router.post('/:id/test', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const flow = await svc.findById(req.params.id, userId);
    if (!flow) return res.status(404).json({ error: 'Flow not found' });

    const problems = flowProblems(flow);
    if (problems.length > 0) return res.status(422).json({ error: problems[0], problems });

    const leadId = String(req.body?.lead_id || '');
    if (!/^[0-9a-f-]{36}$/i.test(leadId)) return res.status(400).json({ error: 'lead_id is required' });

    const ok = await flowExecutionService.startTest(flow, leadId, userId);
    if (!ok) return res.status(404).json({ error: 'Lead not found' });
    res.status(202).json({ success: true });
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
