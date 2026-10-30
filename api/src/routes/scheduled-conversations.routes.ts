import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { ScheduledConversationsService } from '../services/scheduled-conversations.service';

const router = Router();
const scheduledService = new ScheduledConversationsService();

router.use(authMiddleware);

// Get all scheduled conversations (optionally filtered by lead)
router.get('/', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const conversations = await scheduledService.findAll(user.id, {
      lead_id: req.query.lead_id as string | undefined,
      status: req.query.status as string | undefined,
    });

    res.json(conversations);
  } catch (error) {
    next(error);
  }
});

// Get upcoming scheduled conversations
router.get('/upcoming', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const limit = req.query.limit ? Number(req.query.limit) : 10;
    const upcoming = await scheduledService.getUpcoming(user.id, limit);
    res.json(upcoming);
  } catch (error) {
    next(error);
  }
});

// Get a specific scheduled conversation
router.get('/:id', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const conversation = await scheduledService.findById(req.params.id, user.id);
    if (!conversation) {
      return res.status(404).json({ error: 'Scheduled conversation not found' });
    }

    res.json(conversation);
  } catch (error) {
    next(error);
  }
});

// Create a scheduled conversation
router.post('/', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { lead_id, title, description, scheduled_at, metadata } = req.body;

    if (!title || !scheduled_at) {
      return res.status(400).json({ error: 'title and scheduled_at are required' });
    }

    const conversation = await scheduledService.create(
      { lead_id: lead_id || null, title, description, scheduled_at, metadata: metadata && typeof metadata === 'object' ? metadata : undefined },
      user.id
    );
    res.status(201).json(conversation);
  } catch (error) {
    next(error);
  }
});

// Update a scheduled conversation
router.put('/:id', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { title, description, scheduled_at, status, metadata } = req.body || {};
    const conversation = await scheduledService.update(req.params.id, { title, description, scheduled_at, status, metadata }, user.id);
    if (!conversation) {
      return res.status(404).json({ error: 'Scheduled conversation not found' });
    }

    res.json(conversation);
  } catch (error) {
    next(error);
  }
});

// Delete a scheduled conversation
router.delete('/:id', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const deleted = await scheduledService.delete(req.params.id, user.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Scheduled conversation not found' });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
