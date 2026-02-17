import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { conversationTagsService } from '../services/conversation-tags.service';
import { query as dbQuery } from '../database/connection';

const router = Router();

router.use(authMiddleware);

/**
 * GET /api/inbox/conversation-tags
 * Obter todas as etiquetas do usuário
 */
router.get('/', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const tags = await conversationTagsService.getUserTags(user.id);

    res.json({
      success: true,
      count: tags.length,
      data: tags
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/inbox/conversation-tags/combined
 * Retorna todas as etiquetas combinadas: conversation_tags + etapas do funil + tags dos leads
 */
router.get('/combined', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 1. Conversation tags (criadas no inbox)
    const conversationTags = await conversationTagsService.getUserTags(user.id);

    // 2. Etapas do funil (statuses únicos dos leads com contagem)
    // Fetch raw status counts, then normalize in JS to avoid complex SQL
    const funnelResult = await dbQuery(
      `SELECT LOWER(TRIM(status)) as status, COUNT(*)::int as count
       FROM leads
       WHERE user_id = $1 AND status IS NOT NULL AND TRIM(status) != ''
       GROUP BY LOWER(TRIM(status))`,
      [user.id]
    );

    // Status normalization map (English → Portuguese, variants → canonical)
    const statusNormalize: Record<string, string> = {
      'new': 'novo',
      'novos': 'novo',
      'contacted': 'contatado',
      'contatados': 'contatado',
      'qualified': 'qualificado',
      'qualificados': 'qualificado',
      'qualificacao': 'qualificado',
      'negotiation': 'negociacao',
      'in_negotiation': 'negociacao',
      'converted': 'convertido',
      'convertidos': 'convertido',
      'ganho': 'convertido',
      'lost': 'perdido',
      'perdidos': 'perdido',
      'rejected': 'perdido',
      'discarded': 'perdido',
    };

    // Known valid funnel statuses
    const validStatuses = new Set(['novo', 'contatado', 'qualificado', 'negociacao', 'convertido', 'perdido']);

    // Group/merge counts by normalized status
    const statusCounts = new Map<string, number>();
    for (const row of funnelResult.rows) {
      let normalized = statusNormalize[row.status] || row.status;
      // Unknown/garbage statuses → 'novo'
      if (!validStatuses.has(normalized)) {
        normalized = 'novo';
      }
      statusCounts.set(normalized, (statusCounts.get(normalized) || 0) + row.count);
    }

    // Define display order
    const statusOrder: Record<string, number> = {
      novo: 1, contatado: 2, qualificado: 3, negociacao: 4, convertido: 5, perdido: 6,
    };

    const funnelStageColors: Record<string, string> = {
      novo: '#06B6D4',
      contatado: '#A855F7',
      qualificado: '#EAB308',
      negociacao: '#F97316',
      convertido: '#22C55E',
      perdido: '#EF4444',
    };

    const funnelStageLabels: Record<string, string> = {
      novo: 'Novos',
      contatado: 'Contatados',
      qualificado: 'Qualificados',
      negociacao: 'Negociação',
      convertido: 'Convertidos',
      perdido: 'Perdidos',
    };

    const funnelTags = Array.from(statusCounts.entries())
      .sort(([a], [b]) => (statusOrder[a] || 99) - (statusOrder[b] || 99))
      .map(([status, count]) => ({
        id: `funnel:${status}`,
        name: funnelStageLabels[status] || status,
        color: funnelStageColors[status] || '#6B7280',
        icon: null,
        type: 'funnel',
        count,
      }));

    // 3. Tags dos leads (array tags[] no lead)
    let leadTags: any[] = [];
    try {
      const leadTagsResult = await dbQuery(
        `SELECT DISTINCT unnest(tags) as tag_name
         FROM leads
         WHERE user_id = $1 AND tags IS NOT NULL AND array_length(tags, 1) > 0
         ORDER BY tag_name`,
        [user.id]
      );

      leadTags = leadTagsResult.rows.map((row: any) => ({
        id: `lead_tag:${row.tag_name}`,
        name: row.tag_name,
        color: '#3B82F6',
        icon: null,
        type: 'lead_tag',
      }));
      console.log(`[ConvTags] Combined - Found ${leadTags.length} lead_tags:`, leadTags.map(t => t.name));
    } catch (err) {
      // Se a coluna tags não existe, ignorar silenciosamente
      console.log('[ConvTags] Tags column not available:', (err as any)?.message);
    }

    console.log(`[ConvTags] Combined response - Conversation: ${conversationTags.length}, Funnel: ${funnelTags.length}, LeadTags: ${leadTags.length}`);
    res.json({
      success: true,
      data: {
        conversation_tags: conversationTags.map(t => ({ ...t, type: 'conversation' })),
        funnel_stages: funnelTags,
        lead_tags: leadTags,
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/inbox/conversation-tags/stats
 * Obter estatísticas de etiquetas (quantas conversas cada uma tem)
 */
router.get('/stats', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const stats = await conversationTagsService.getUserTagsStats(user.id);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/inbox/conversation-tags/:tagId/conversations
 * Obter conversas com uma etiqueta específica
 */
router.get('/:tagId/conversations', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const conversations = await conversationTagsService.getConversationsByTag(
      user.id,
      req.params.tagId,
      {
        limit: req.query.limit ? Number(req.query.limit) : 50,
        offset: req.query.offset ? Number(req.query.offset) : 0
      }
    );

    res.json({
      success: true,
      count: conversations.length,
      data: conversations
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/inbox/conversation-tags
 * Criar nova etiqueta personalizada
 */
router.post('/', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { name, color, icon, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Nome da etiqueta é obrigatório' });
    }

    const tag = await conversationTagsService.createTag(user.id, {
      name,
      color,
      icon,
      description
    });

    res.status(201).json({
      success: true,
      data: tag
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/inbox/conversation-tags/:tagId
 * Atualizar etiqueta
 */
router.put('/:tagId', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { name, color, icon, description } = req.body;

    const tag = await conversationTagsService.updateTag(user.id, req.params.tagId, {
      name,
      color,
      icon,
      description
    });

    res.json({
      success: true,
      data: tag
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/inbox/conversation-tags/reorder
 * Reordenar etiquetas
 */
router.put('/reorder', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { tagIds } = req.body;

    if (!Array.isArray(tagIds)) {
      return res.status(400).json({ error: 'tagIds deve ser um array' });
    }

    await conversationTagsService.reorderTags(user.id, tagIds);

    const tags = await conversationTagsService.getUserTags(user.id);

    res.json({
      success: true,
      data: tags
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/inbox/conversation-tags/:tagId
 * Deletar etiqueta
 */
router.delete('/:tagId', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log(`[ConvTagsAPI] DELETE /:tagId - TagId: ${req.params.tagId}, User: ${user.id}`);
    await conversationTagsService.deleteTag(user.id, req.params.tagId);
    console.log(`[ConvTagsAPI] ✅ Conversation tag ${req.params.tagId} deleted successfully`);

    res.json({
      success: true,
      message: 'Etiqueta deletada com sucesso'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/inbox/conversations/:conversationId/tags/:tagId
 * Adicionar etiqueta a uma conversa
 */
router.post('/assign/:conversationId/:tagId', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const assignment = await conversationTagsService.addTagToConversation(
      req.params.conversationId,
      req.params.tagId,
      user.id
    );

    res.status(201).json({
      success: true,
      data: assignment
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/inbox/conversations/:conversationId/tags/:tagId
 * Remover etiqueta de uma conversa
 */
router.delete('/assign/:conversationId/:tagId', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await conversationTagsService.removeTagFromConversation(
      req.params.conversationId,
      req.params.tagId
    );

    res.json({
      success: true,
      message: 'Etiqueta removida com sucesso'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/inbox/conversations/:conversationId/tags
 * Obter etiquetas de uma conversa
 */
router.get('/conversation/:conversationId', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const tags = await conversationTagsService.getConversationTags(
      req.params.conversationId
    );

    res.json({
      success: true,
      count: tags.length,
      data: tags
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/inbox/conversations/:conversationId/tags
 * Atualizar todas as etiquetas de uma conversa
 */
router.post('/conversation/:conversationId/set', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { tagIds } = req.body;

    if (!Array.isArray(tagIds)) {
      return res.status(400).json({ error: 'tagIds deve ser um array' });
    }

    const tags = await conversationTagsService.setConversationTags(
      req.params.conversationId,
      tagIds,
      user.id
    );

    res.json({
      success: true,
      data: tags
    });
  } catch (error) {
    next(error);
  }
});

export default router;
