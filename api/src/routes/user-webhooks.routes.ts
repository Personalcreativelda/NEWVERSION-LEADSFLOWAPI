import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { userWebhooksService, WEBHOOK_EVENTS } from '../services/user-webhooks.service';

const router = Router();

// Listar eventos disponíveis
router.get('/events', authMiddleware, async (_req, res) => {
  try {
    // Agrupar eventos por categoria
    const eventsByCategory: Record<string, any[]> = {};

    for (const [key, value] of Object.entries(WEBHOOK_EVENTS)) {
      const category = value.category;
      if (!eventsByCategory[category]) {
        eventsByCategory[category] = [];
      }
      eventsByCategory[category].push({
        event: key,
        name: value.name,
        description: value.description,
      });
    }

    res.json({
      events: WEBHOOK_EVENTS,
      categories: eventsByCategory,
    });
  } catch (error: any) {
    console.error('[UserWebhooks] Error listing events:', error);
    res.status(500).json({ error: 'Erro ao listar eventos' });
  }
});

// Listar webhooks do usuário
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const webhooks = await userWebhooksService.findByUserId(userId);
    res.json(webhooks);
  } catch (error: any) {
    console.error('[UserWebhooks] Error listing webhooks:', error);
    res.status(500).json({ error: 'Erro ao listar webhooks' });
  }
});

// Obter webhook específico
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const webhook = await userWebhooksService.findById(req.params.id, userId);

    if (!webhook) {
      return res.status(404).json({ error: 'Webhook não encontrado' });
    }

    res.json(webhook);
  } catch (error: any) {
    console.error('[UserWebhooks] Error getting webhook:', error);
    res.status(500).json({ error: 'Erro ao buscar webhook' });
  }
});

// Criar webhook
router.post('/', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { name, url, events, headers, secret, channel_ids } = req.body;

    // Validações
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }

    if (!url || !url.trim()) {
      return res.status(400).json({ error: 'URL é obrigatória' });
    }

    // Validar URL
    try {
      new URL(url);
    } catch {
      return res.status(400).json({ error: 'URL inválida' });
    }

    if (!events || !Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'Selecione pelo menos um evento' });
    }

    // Validar eventos
    const validEvents = Object.keys(WEBHOOK_EVENTS);
    const invalidEvents = events.filter(e => !validEvents.includes(e));
    if (invalidEvents.length > 0) {
      return res.status(400).json({ error: `Eventos inválidos: ${invalidEvents.join(', ')}` });
    }

    const webhook = await userWebhooksService.create(userId, {
      name: name.trim(),
      url: url.trim(),
      events,
      headers,
      secret,
      channel_ids,
    });

    res.status(201).json(webhook);
  } catch (error: any) {
    console.error('[UserWebhooks] Error creating webhook:', error);
    res.status(500).json({ error: 'Erro ao criar webhook', details: error.message });
  }
});

// Atualizar webhook
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { name, url, events, headers, secret, channel_ids } = req.body;

    // Validar URL se fornecida
    if (url) {
      try {
        new URL(url);
      } catch {
        return res.status(400).json({ error: 'URL inválida' });
      }
    }

    // Validar eventos se fornecidos
    if (events) {
      const validEvents = Object.keys(WEBHOOK_EVENTS);
      const invalidEvents = events.filter((e: string) => !validEvents.includes(e));
      if (invalidEvents.length > 0) {
        return res.status(400).json({ error: `Eventos inválidos: ${invalidEvents.join(', ')}` });
      }
    }

    const webhook = await userWebhooksService.update(req.params.id, userId, {
      name,
      url,
      events,
      headers,
      secret,
      channel_ids,
    });

    if (!webhook) {
      return res.status(404).json({ error: 'Webhook não encontrado' });
    }

    res.json(webhook);
  } catch (error: any) {
    console.error('[UserWebhooks] Error updating webhook:', error);
    res.status(500).json({ error: 'Erro ao atualizar webhook' });
  }
});

// Ativar/desativar webhook
router.patch('/:id/toggle', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { is_active } = req.body;

    const webhook = await userWebhooksService.toggle(req.params.id, userId, is_active);

    if (!webhook) {
      return res.status(404).json({ error: 'Webhook não encontrado' });
    }

    res.json(webhook);
  } catch (error: any) {
    console.error('[UserWebhooks] Error toggling webhook:', error);
    res.status(500).json({ error: 'Erro ao alterar status do webhook' });
  }
});

// Testar webhook
router.post('/:id/test', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const result = await userWebhooksService.testWebhook(req.params.id, userId);
    res.json(result);
  } catch (error: any) {
    console.error('[UserWebhooks] Error testing webhook:', error);
    res.status(500).json({ error: 'Erro ao testar webhook' });
  }
});

// Obter logs do webhook
router.get('/:id/logs', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const limit = parseInt(req.query.limit as string) || 50;
    const logs = await userWebhooksService.getLogs(req.params.id, userId, limit);
    res.json(logs);
  } catch (error: any) {
    console.error('[UserWebhooks] Error getting logs:', error);
    res.status(500).json({ error: 'Erro ao buscar logs' });
  }
});

// Deletar webhook
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const deleted = await userWebhooksService.delete(req.params.id, userId);

    if (!deleted) {
      return res.status(404).json({ error: 'Webhook não encontrado' });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('[UserWebhooks] Error deleting webhook:', error);
    res.status(500).json({ error: 'Erro ao deletar webhook' });
  }
});

// Regenerar secret do webhook
router.post('/:id/regenerate-secret', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).user.id;

    // Gerar novo secret
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let secret = 'whsec_';
    for (let i = 0; i < 32; i++) {
      secret += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const webhook = await userWebhooksService.update(req.params.id, userId, { secret });

    if (!webhook) {
      return res.status(404).json({ error: 'Webhook não encontrado' });
    }

    res.json({ secret: webhook.secret });
  } catch (error: any) {
    console.error('[UserWebhooks] Error regenerating secret:', error);
    res.status(500).json({ error: 'Erro ao regenerar secret' });
  }
});

export default router;
