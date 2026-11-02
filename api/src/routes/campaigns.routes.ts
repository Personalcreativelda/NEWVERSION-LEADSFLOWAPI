import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.middleware';
import { CampaignsService } from '../services/campaigns.service';
import { getStorageService, recordFileAttachment } from '../services/storage.service';
import pool, { query } from '../database/connection';
import { campaignEngine, CampaignError, generateVariations } from '../services/campaign-engine.service';

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
    const folderType = 'campaign-assets';
    const fileUrl = await storage.uploadFile(file, folderType, user.id);

    console.log('[Campaigns] Media uploaded successfully:', fileUrl.substring(0, 100) + '...');

    const bucketName = process.env.MINIO_BUCKET || 'leadflow-uploads';
    const storageKey = fileUrl.split(`/${bucketName}/`)[1] ?? fileUrl;
    await recordFileAttachment({
      pool, userId: user.id, publicUrl: fileUrl, storageKey, bucket: bucketName,
      fileName: file.originalname, mimeType: file.mimetype,
      sizeBytes: file.size, folderType,
    });

    // Derive media_type for compatibility with uploadService.ts
    let mediaType: string = 'document';
    if (file.mimetype.startsWith('image/')) mediaType = 'image';
    else if (file.mimetype.startsWith('video/')) mediaType = 'video';
    else if (file.mimetype.startsWith('audio/')) mediaType = 'audio';

    res.json({
      success: true,
      url: fileUrl,
      media_type: mediaType,
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    });
  } catch (error) {
    console.error('[Campaigns] Error uploading media:', error);
    next(error);
  }
});

// Request a presigned PUT URL so the browser can upload directly to MinIO
// (avoids routing large files through the nginx reverse proxy)
router.post('/presign-upload', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { filename, contentType, size } = req.body as {
      filename: string;
      contentType: string;
      size: number;
    };

    if (!filename || !contentType) {
      return res.status(400).json({ error: 'filename e contentType são obrigatórios' });
    }

    if (size && size > 100 * 1024 * 1024) {
      return res.status(400).json({ error: 'Arquivo muito grande (máx 100 MB)' });
    }

    const storage = getStorageService();

    if (!storage.getPresignedUploadUrl) {
      // MinIO not configured — fall back so the client knows to use direct upload
      return res.status(501).json({ error: 'Presigned uploads not available (MinIO not configured)' });
    }

    const result = await storage.getPresignedUploadUrl(filename, contentType, 'campaign-assets', user.id);

    console.log('[Campaigns] Presigned URL generated for:', filename, '→', result.key);

    // Record the attachment now (browser will PUT directly to MinIO; we won't see the response)
    const bucketName = process.env.MINIO_BUCKET || 'leadflow-uploads';
    await recordFileAttachment({
      pool, userId: user.id, publicUrl: result.publicUrl, storageKey: result.key, bucket: bucketName,
      fileName: filename, mimeType: contentType, sizeBytes: size ?? 0, folderType: 'campaign-assets',
    });

    return res.json({
      success: true,
      presignedUrl: result.presignedUrl,
      publicUrl: result.publicUrl,
      key: result.key,
    });
  } catch (error) {
    console.error('[Campaigns] Error generating presigned URL:', error);
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
    const currentCampaign = await query(
      'SELECT * FROM campaigns WHERE id = $1 AND user_id = $2',
      [id, user.id]
    );

    if (currentCampaign.rows.length === 0) {
      return res.status(404).json({ error: 'Campanha não encontrada' });
    }

    const campaign = currentCampaign.rows[0];

    // Campanhas do motor: as contagens vêm dos envios reais (versões antigas do painel mandavam
    // números estimados e marcavam como concluída a meio do envio)
    const managed = await query('SELECT 1 FROM campaign_recipients WHERE campaign_id = $1 LIMIT 1', [id]);
    if (managed.rows.length > 0) {
      if (status === 'active' && campaign.status === 'paused') {
        const result = await campaignEngine.startCampaign(id, user.id).catch((err: any) => err);
        if (result instanceof CampaignError) return res.status(result.status).json({ error: result.message });
        if (result instanceof Error) throw result;
      } else if (status === 'paused' && campaign.status === 'active') {
        await query(
          `UPDATE campaigns SET status = 'paused', next_send_at = NULL, updated_at = NOW(),
                  metadata = (COALESCE(metadata, '{}'::jsonb) - 'waiting' - 'resume_at') || '{"pausedReason":"USER"}'::jsonb
            WHERE id = $1`,
          [id]
        );
      }
      const fresh = await query('SELECT * FROM campaigns WHERE id = $1', [id]);
      return res.json({ success: true, campaign: fresh.rows[0] });
    }

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

// ============================================
// EXECUTAR / RETOMAR CAMPANHA WHATSAPP
// ============================================
/**
 * Monta a lista de destinatários (uma só vez) e entrega a campanha ao motor, que envia
 * uma mensagem de cada vez. Numa campanha pausada, retoma onde ficou.
 *
 * POST /api/campaigns/:id/execute
 */
router.post('/:id/execute', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const result = await campaignEngine.startCampaign(req.params.id, user.id);
    res.json({
      success: true,
      message: 'Campanha iniciada',
      campaignId: result.campaignId,
      totalLeads: result.queued,
      excluded: result.excluded,
      excludedByReason: result.excludedByReason,
      plan: result.plan,
      channel: { id: result.channel.id, name: result.channel.name },
    });
  } catch (error: any) {
    if (error instanceof CampaignError) {
      return res.status(error.status).json({ error: error.message, ...(error.details || {}) });
    }
    next(error);
  }
});

/**
 * A IA escreve versões diferentes da mensagem (mesmas variáveis e links); cada contacto recebe uma
 *
 * POST /api/campaigns/variations  { message, count? }
 */
router.post('/variations', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const message = String(req.body?.message || '').trim();
    if (!message) {
      return res.status(400).json({ error: 'Escreva a mensagem primeiro' });
    }
    if (message.length > 4096) {
      return res.status(400).json({ error: 'Mensagem demasiado longa' });
    }
    const result = await generateVariations(user.id, message, Number(req.body?.count) || 4);
    if (result.variations.length === 0) {
      return res.status(503).json({ error: 'Não foi possível gerar variações agora' });
    }
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * Volta a pôr na fila quem falhou (ex.: o WhatsApp estava desligado) e retoma a campanha,
 * com o mesmo ritmo, horário e limite diário.
 *
 * POST /api/campaigns/:id/retry-failed
 */
router.post('/:id/retry-failed', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const found = await query('SELECT id, status FROM campaigns WHERE id = $1 AND user_id = $2', [req.params.id, user.id]);
    const campaign = found.rows[0];
    if (!campaign) {
      return res.status(404).json({ error: 'Campanha não encontrada' });
    }
    const retried = await query(
      `UPDATE campaign_recipients SET status = 'pending', error = NULL
        WHERE campaign_id = $1 AND status = 'failed' RETURNING id`,
      [campaign.id]
    );
    if (retried.rows.length === 0) {
      return res.status(400).json({ error: 'Não há envios falhados nesta campanha' });
    }
    if (campaign.status === 'active') {
      await campaignEngine.syncStats(campaign.id);
    } else {
      await query(`UPDATE campaigns SET status = 'paused', completed_at = NULL WHERE id = $1`, [campaign.id]);
      await campaignEngine.startCampaign(campaign.id, user.id);
    }
    res.json({ success: true, retried: retried.rows.length });
  } catch (error: any) {
    if (error instanceof CampaignError) {
      return res.status(error.status).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * Destinatários da campanha com o estado de cada um (enviada, falhou, ficou de fora e porquê)
 *
 * GET /api/campaigns/:id/recipients
 */
router.get('/:id/recipients', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const owner = await query('SELECT id FROM campaigns WHERE id = $1 AND user_id = $2', [req.params.id, user.id]);
    if (owner.rows.length === 0) {
      return res.status(404).json({ error: 'Campanha não encontrada' });
    }
    const rows = await query(
      `SELECT id, lead_id, phone, name, status, skip_reason, error, sent_at, replied_at, opted_out_at
         FROM campaign_recipients WHERE campaign_id = $1 ORDER BY position LIMIT 5000`,
      [req.params.id]
    );
    res.json({ recipients: rows.rows, counts: await campaignEngine.counts(req.params.id) });
  } catch (error) {
    next(error);
  }
});

export default router;
