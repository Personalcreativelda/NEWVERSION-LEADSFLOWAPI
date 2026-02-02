import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.middleware';
import { CampaignsService } from '../services/campaigns.service';
import { getStorageService } from '../services/storage.service';

const router = Router();
const campaignsService = new CampaignsService();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
});

router.use(authMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const campaigns = await campaignsService.findAll(user.id);
    res.json(campaigns);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const campaign = await campaignsService.findById(req.params.id, user.id);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.json(campaign);
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

    const campaign = await campaignsService.create(req.body, user.id);
    res.status(201).json(campaign);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const campaign = await campaignsService.update(req.params.id, req.body, user.id);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.json(campaign);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const deleted = await campaignsService.delete(req.params.id, user.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Upload media files for campaigns (images, videos, documents)
router.post('/upload-media', upload.single('file'), async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'File is required' });
    }

    const file = req.file;

    // Validate file type (images, videos, documents, audio)
    const allowedTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/mpeg',
      'video/quicktime',
      'video/x-msvideo',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'audio/mpeg',
      'audio/ogg',
      'audio/wav',
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return res.status(400).json({
        error: 'Tipo de arquivo não permitido',
        allowed: 'Imagens, vídeos, PDFs, documentos Office, áudio',
      });
    }

    console.log('[Campaigns] Uploading media for user:', user.id);
    console.log('[Campaigns] File:', {
      name: file.originalname,
      type: file.mimetype,
      size: file.size,
    });

    // Upload file to MinIO (or Base64) with user-specific folder
    const storage = getStorageService();
    const fileUrl = await storage.uploadFile(file, 'campaigns', user.id);

    console.log('[Campaigns] Media uploaded successfully:', fileUrl.substring(0, 100) + '...');

    res.json({
      success: true,
      url: fileUrl,
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    });
  } catch (error) {
    console.error('[Campaigns] Error uploading media:', error);
    next(error);
  }
});

// Add media URL to campaign
router.post('/:id/add-media', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { mediaUrl } = req.body;

    if (!mediaUrl) {
      return res.status(400).json({ error: 'mediaUrl is required' });
    }

    const { query } = require('../database/connection');

    // Add media URL to campaign's media_urls array
    const result = await query(
      `UPDATE campaigns
       SET media_urls = array_append(COALESCE(media_urls, ARRAY[]::text[]), $1),
           updated_at = NOW()
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [mediaUrl, req.params.id, user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    console.log('[Campaigns] Media URL added to campaign:', req.params.id);

    res.json({
      success: true,
      campaign: result.rows[0],
    });
  } catch (error) {
    console.error('[Campaigns] Error adding media to campaign:', error);
    next(error);
  }
});

// Remove media URL from campaign
router.delete('/:id/remove-media', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { mediaUrl } = req.body;

    if (!mediaUrl) {
      return res.status(400).json({ error: 'mediaUrl is required' });
    }

    const { query } = require('../database/connection');

    // Remove media URL from campaign's media_urls array
    const result = await query(
      `UPDATE campaigns
       SET media_urls = array_remove(media_urls, $1),
           updated_at = NOW()
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [mediaUrl, req.params.id, user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    console.log('[Campaigns] Media URL removed from campaign:', req.params.id);

    res.json({
      success: true,
      campaign: result.rows[0],
    });
  } catch (error) {
    console.error('[Campaigns] Error removing media from campaign:', error);
    next(error);
  }
});

// Get messages for a specific campaign
router.get('/:id/messages', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    const limit = req.query.limit ? Number(req.query.limit) : 100;
    const offset = req.query.offset ? Number(req.query.offset) : 0;

    // Verify campaign ownership
    const campaign = await campaignsService.findById(id, user.id);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const { query } = await import('../database/connection');

    // Get messages for this campaign
    const messagesResult = await query(
      `SELECT * FROM messages
       WHERE user_id = $1 AND campaign_id = $2
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [user.id, id, limit, offset]
    );

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total FROM messages
       WHERE user_id = $1 AND campaign_id = $2`,
      [user.id, id]
    );

    // Get statistics by status
    const statsResult = await query(
      `SELECT
         status,
         COUNT(*) as count
       FROM messages
       WHERE user_id = $1 AND campaign_id = $2
       GROUP BY status`,
      [user.id, id]
    );

    const stats: any = {
      total: parseInt(countResult.rows[0]?.total || '0'),
      byStatus: {}
    };

    statsResult.rows.forEach((row: any) => {
      stats.byStatus[row.status] = parseInt(row.count);
    });

    res.json({
      messages: messagesResult.rows,
      pagination: {
        limit,
        offset,
        total: stats.total
      },
      stats
    });
  } catch (error) {
    console.error('[Campaigns] Error fetching campaign messages:', error);
    next(error);
  }
});

// ✅ PATCH endpoint para atualizar status e estatísticas da campanha
router.patch('/:id/status', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    const { status, stats, metadata } = req.body;

    console.log(`[Campaigns] Atualizando status da campanha ${id}:`, { status, stats, metadata });

    // Validar status
    const validStatuses = ['draft', 'scheduled', 'active', 'completed', 'failed', 'paused'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: `Status inválido. Use: ${validStatuses.join(', ')}` });
    }

    // Buscar campanha atual
    const { query } = await import('../database/connection');
    const currentCampaign = await query(
      'SELECT * FROM campaigns WHERE id = $1 AND user_id = $2',
      [id, user.id]
    );

    if (currentCampaign.rows.length === 0) {
      return res.status(404).json({ error: 'Campanha não encontrada' });
    }

    const campaign = currentCampaign.rows[0];

    // Preparar campos para atualização
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (status) {
      updates.push(`status = $${paramCount}`);
      values.push(status);
      paramCount++;
    }

    if (stats) {
      // Mesclar estatísticas existentes com novas
      const currentStats = campaign.stats || { sent: 0, delivered: 0, read: 0, replied: 0, failed: 0 };
      const mergedStats = { ...currentStats, ...stats };

      updates.push(`stats = $${paramCount}`);
      values.push(JSON.stringify(mergedStats));
      paramCount++;
    }

    if (metadata) {
      // Mescular metadata existente
      const currentMetadata = campaign.metadata || {};
      const mergedMetadata = { ...currentMetadata, ...metadata };

      updates.push(`metadata = $${paramCount}`);
      values.push(JSON.stringify(mergedMetadata));
      paramCount++;
    }

    // Se marcar como completed, adicionar completed_at
    if (status === 'completed' && !campaign.completed_at) {
      updates.push(`completed_at = NOW()`);
    }

    // Se marcar como active, adicionar started_at (se não existir)
    if (status === 'active' && !campaign.started_at) {
      updates.push(`started_at = NOW()`);
    }

    // Sempre atualizar updated_at
    updates.push(`updated_at = NOW()`);

    // Adicionar WHERE clause
    values.push(id, user.id);
    const whereClause = `WHERE id = $${paramCount} AND user_id = $${paramCount + 1}`;

    const updateQuery = `
      UPDATE campaigns
      SET ${updates.join(', ')}
      ${whereClause}
      RETURNING *
    `;

    console.log('[Campaigns] Query de atualização:', updateQuery);
    console.log('[Campaigns] Valores:', values);

    const result = await query(updateQuery, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Campanha não encontrada' });
    }

    const updatedCampaign = result.rows[0];

    console.log(`[Campaigns] ✅ Campanha ${id} atualizada:`, {
      status: updatedCampaign.status,
      stats: updatedCampaign.stats,
      completed_at: updatedCampaign.completed_at
    });

    res.json({
      success: true,
      campaign: updatedCampaign
    });
  } catch (error) {
    console.error('[Campaigns] Erro ao atualizar status da campanha:', error);
    next(error);
  }
});

export default router;
