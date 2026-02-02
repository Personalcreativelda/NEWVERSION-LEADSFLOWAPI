import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { MessagesService } from '../services/messages.service';

const router = Router();
const messagesService = new MessagesService();

router.use(authMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const messages = await messagesService.findAll(user.id, {
      lead_id: req.query.lead_id,
      campaign_id: req.query.campaign_id,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
    });

    res.json(messages);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const message = await messagesService.create(req.body, user.id);
    res.status(201).json(message);
  } catch (error) {
    next(error);
  }
});

export default router;
