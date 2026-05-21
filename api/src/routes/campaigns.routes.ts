import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.middleware';
import { CampaignsService } from '../services/campaigns.service';
import { getStorageService, recordFileAttachment } from '../services/storage.service';
import pool, { query } from '../database/connection';
import { WhatsAppService } from '../services/whatsapp.service';
import { ConversationsService } from '../services/conversations.service';
import { ChannelsService } from '../services/channels.service';
import { getWebSocketService } from '../services/websocket.service';
import { notificationsService } from '../services/notifications.service';
import { checkMessageLimit } from '../middleware/plan-enforcement.middleware';

const router = Router();
const campaignsService = new CampaignsService();
const whatsappService = new WhatsAppService();
const conversationsService = new ConversationsService();
const channelsService = new ChannelsService();

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
// ✅ EXECUTAR CAMPANHA WHATSAPP (DIRETO DO DASHBOARD)
// ============================================
/**
 * Executa uma campanha WhatsApp diretamente do dashboard
 * Envia as mensagens e cria conversas no inbox automaticamente
 *
 * POST /api/campaigns/:id/execute
 */
router.post('/:id/execute', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;

    console.log(`[Campaigns Execute] 🚀 Iniciando execução da campanha ${id}`);

    // 1. Buscar campanha
    const campaignResult = await query(
      'SELECT * FROM campaigns WHERE id = $1 AND user_id = $2',
      [id, user.id]
    );

    if (campaignResult.rows.length === 0) {
      return res.status(404).json({ error: 'Campanha não encontrada' });
    }

    const campaign = campaignResult.rows[0];

    // Validar tipo de campanha
    if (campaign.type !== 'whatsapp') {
      return res.status(400).json({
        error: 'Este endpoint é apenas para campanhas WhatsApp',
        type: campaign.type
      });
    }

    // Validar status (não executar se já está ativa/completa)
    if (campaign.status === 'active') {
      return res.status(400).json({ error: 'Campanha já está em execução' });
    }

    if (campaign.status === 'completed') {
      return res.status(400).json({ error: 'Campanha já foi concluída' });
    }

    // 2. Buscar canal WhatsApp do usuário
    const settings = typeof campaign.settings === 'string'
      ? JSON.parse(campaign.settings)
      : campaign.settings || {};

    let channel: any = null;
    const channelId = settings.channelId;
    const channelType = settings.channelType || 'whatsapp';
    const instanceId = settings.instanceId || settings.instance_id || settings.instanceName;

    // Primeiro: tentar buscar por channelId salvo nas settings
    if (channelId) {
      const channelResult = await query(
        `SELECT * FROM channels WHERE id = $1 AND user_id = $2 LIMIT 1`,
        [channelId, user.id]
      );
      channel = channelResult.rows[0];
    }

    // Segundo: buscar pelo instanceId (Evolution API)
    if (!channel && instanceId) {
      const channelResult = await query(
        `SELECT * FROM channels
         WHERE user_id = $1
         AND type = 'whatsapp'
         AND (credentials->>'instance_id' = $2 OR credentials->>'instance_name' = $2)
         LIMIT 1`,
        [user.id, instanceId]
      );
      channel = channelResult.rows[0];
    }

    // Terceiro: buscar primeiro canal WhatsApp ou WhatsApp Cloud ativo
    if (!channel) {
      const channels = await channelsService.findByType('whatsapp', user.id);
      channel = channels.find(c => (c.status as string) === 'active' || (c.status as string) === 'connected');
    }
    if (!channel) {
      const cloudChannels = await channelsService.findByType('whatsapp_cloud', user.id);
      channel = cloudChannels.find(c => (c.status as string) === 'active' || (c.status as string) === 'connected' || (c.status as string) === 'pending');
    }

    if (!channel) {
      return res.status(400).json({
        error: 'Nenhum canal WhatsApp ativo encontrado. Conecte o WhatsApp primeiro.'
      });
    }

    const isWhatsAppCloud = channel.type === 'whatsapp_cloud';
    const whatsappInstanceId = isWhatsAppCloud
      ? channel.credentials?.phone_number_id
      : (channel.credentials?.instance_id || channel.credentials?.instance_name);

    if (!whatsappInstanceId) {
      return res.status(400).json({
        error: isWhatsAppCloud
          ? 'Canal WhatsApp Cloud não tem phone_number_id configurado'
          : 'Canal WhatsApp não tem instância configurada'
      });
    }

    console.log(`[Campaigns Execute] Canal ${channel.type}: ${channel.id}, ${isWhatsAppCloud ? 'PhoneNumberId' : 'Instance'}: ${whatsappInstanceId}`);

    // 3. Buscar leads destinatários
    let leads: any[] = [];

    if (settings.recipientMode === 'custom' ||
        (settings.recipientMode !== 'groups' && settings.customNumbers && typeof settings.customNumbers === 'string')) {
      // Modo custom: NÃO consultar o DB — criar leads sintéticos direto da lista
      // Isso garante que 6 números = 6 envios (sem deduplicação SQL)
      const rawPhones = ((settings.customNumbers || '') as string)
        .split(',')
        .map((p: string) => p.trim())
        .filter(Boolean);

      leads = rawPhones.map((phone, idx) => ({
        id: `custom-${idx}-${Date.now()}`,
        user_id: user.id,
        name: phone,
        phone: phone,
        whatsapp: phone,
        email: null,
        company: null,
        status: null,
      }));

      console.log(`[Campaigns Execute] 📲 Modo custom: ${leads.length} número(s) da lista`);

    } else if (settings.recipientMode === 'groups') {
      // ── Modo grupos: enviar no grupo OU no privado dos membros ─────────────
      const selectedGroupJids: string[] = settings.selectedGroupJids || [];
      if (selectedGroupJids.length === 0) {
        return res.status(400).json({ error: 'Nenhum grupo selecionado na campanha' });
      }

      if (settings.groupSendMode === 'private') {
        // Extrai participantes e cria leads sintéticos para envio individual
        const seenPhones = new Set<string>();
        let totalSkippedLid = 0;

        for (const groupJid of selectedGroupJids) {
          try {
            const participants = await whatsappService.getGroupParticipants(whatsappInstanceId, groupJid);
            console.log(`[Campaigns Execute] Grupo ${groupJid}: ${participants.length} participante(s) brutos`);

            for (const p of participants) {
              const rawId = String(p.id || p.jid || '');

              // Ignorar o próprio grupo
              if (rawId.endsWith('@g.us')) continue;

              // Tentar extrair telefone de todas as fontes disponíveis
              const candidates = [
                p.phoneNumber,
                p.phone,
                p.numero,
                p.number,
                p.participantAlt,       // campo extra da Evolution API em alguns eventos
                // Se o JID é @s.whatsapp.net, extrair dígitos do ID
                rawId.includes('@s.whatsapp.net') ? rawId.replace('@s.whatsapp.net', '') : null,
              ]
                .map((v: any) => (v ? String(v).replace('@s.whatsapp.net', '').replace(/\D/g, '') : ''))
                .filter((v: string) => v.length >= 7 && v.length <= 15);

              if (candidates.length === 0) {
                // @lid sem número resolvível — não tem como enviar no privado
                totalSkippedLid++;
                console.log(`[Campaigns Execute] ⚠️ Participante sem telefone resolvível: ${rawId}`);
                continue;
              }

              const finalPhone = candidates[0];
              if (seenPhones.has(finalPhone)) continue;
              seenPhones.add(finalPhone);

              leads.push({
                id: `gm-${finalPhone}`,
                user_id: user.id,
                name: p.name || p.pushName || p.notify || finalPhone,
                phone: finalPhone,
                whatsapp: finalPhone,
                email: null,
                company: null,
                status: null,
              });
            }
          } catch (err: any) {
            console.error(`[Campaigns Execute] Erro ao buscar participantes do grupo ${groupJid}:`, err.message);
          }
        }
        console.log(`[Campaigns Execute] 👥 Modo privado: ${leads.length} membro(s) com telefone | ${totalSkippedLid} @lid sem número`);

        if (leads.length === 0) {
          const lidMsg = totalSkippedLid > 0
            ? ` ${totalSkippedLid} participante(s) com ID de dispositivo vinculado (@lid) não têm número resolvível para envio privado.`
            : '';
          return res.status(400).json({
            error: `Não foi possível extrair participantes com número de telefone dos grupos selecionados.${lidMsg} Verifique se a instância WhatsApp está conectada e tente novamente.`
          });
        }
      } else {
        // Enviar diretamente nos grupos (group JID como destinatário)
        for (const groupJid of selectedGroupJids) {
          const groupResult = await query(
            `SELECT metadata FROM conversations WHERE remote_jid = $1 AND user_id = $2 LIMIT 1`,
            [groupJid, user.id]
          );
          const meta = groupResult.rows[0]?.metadata || {};
          leads.push({
            id: `group-${groupJid}`,
            user_id: user.id,
            name: meta.group_name || meta.contact_name || groupJid,
            phone: groupJid,
            whatsapp: groupJid,
            email: null,
            company: null,
            status: null,
          });
        }
        console.log(`[Campaigns Execute] 💬 Modo grupo direto: ${leads.length} grupo(s)`);
      }

    } else {
      let leadsQuery = 'SELECT * FROM leads WHERE user_id = $1';
      const queryParams: any[] = [user.id];
      let paramIndex = 2;

      if (settings.leadIds && Array.isArray(settings.leadIds) && settings.leadIds.length > 0) {
        leadsQuery += ` AND id = ANY($${paramIndex})`;
        queryParams.push(settings.leadIds);
        paramIndex++;
      } else {
        // Filtro por status/segmentos: SOMENTE quando recipientMode é 'segments'
        if (settings.recipientMode === 'segments') {
          const segments = settings.segments || settings.selectedStatuses;
          if (Array.isArray(segments) && segments.length > 0) {
            leadsQuery += ` AND status = ANY($${paramIndex})`;
            queryParams.push(segments);
            paramIndex++;
          }
        }
        // recipientMode === 'all' → sem filtro extra, busca todos os leads com telefone
      }

      leadsQuery += ` AND (phone IS NOT NULL OR whatsapp IS NOT NULL)`;
      leadsQuery += ` ORDER BY created_at DESC`;

      if (settings.limit && typeof settings.limit === 'number') {
        leadsQuery += ` LIMIT $${paramIndex}`;
        queryParams.push(settings.limit);
      }

      const leadsResult = await query(leadsQuery, queryParams);
      leads = leadsResult.rows;
    }

    if (leads.length === 0) {
      return res.status(400).json({
        error: 'Nenhum lead encontrado com os filtros especificados'
      });
    }

    console.log(`[Campaigns Execute] ${leads.length} leads encontrados para envio`);

    // ── Verifica limite de mensagens em massa ─────────────────────────────
    const massCheck = await checkMessageLimit(user.id, 'massMessages');
    if (!massCheck.allowed) {
      return res.status(403).json({
        error: 'plan_limit_exceeded',
        code: massCheck.code,
        message: massCheck.message,
        current: massCheck.current,
        limit: massCheck.limit,
      });
    }

    // 4. Atualizar status da campanha para 'active'
    await query(
      `UPDATE campaigns
       SET status = 'active',
           started_at = NOW(),
           stats = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify({ total: leads.length, sent: 0, delivered: 0, failed: 0 }), id]
    );

    // 5. Responder imediatamente e processar em background
    res.json({
      success: true,
      message: 'Campanha iniciada com sucesso',
      campaignId: id,
      totalLeads: leads.length,
      channel: {
        id: channel.id,
        name: channel.name,
        instanceId: whatsappInstanceId
      }
    });

    // 6. Processar envios em background (após responder ao cliente)
    setImmediate(async () => {
      try {
        await executeCampaignMessages(
          campaign,
          leads,
          channel,
          whatsappInstanceId,
          user.id
        );
      } catch (bgErr: any) {
        console.error(`[Campaigns Execute] ❌ Erro fatal no background da campanha ${campaign.id}:`, bgErr.message);
        // Marcar como failed para não ficar preso em 'active'
        await query(
          `UPDATE campaigns SET status = 'failed', stats = COALESCE(stats, '{}'::jsonb) || $1::jsonb, updated_at = NOW() WHERE id = $2`,
          [JSON.stringify({ fatalError: bgErr.message }), campaign.id]
        ).catch(() => {});
      }
    });

  } catch (error: any) {
    console.error('[Campaigns Execute] Erro:', error);
    next(error);
  }
});

/**
 * Função auxiliar para executar o envio das mensagens da campanha
 */
async function executeCampaignMessages(
  campaign: any,
  leads: any[],
  channel: any,
  instanceId: string,
  userId: string
) {
  const isWhatsAppCloud = channel.type === 'whatsapp_cloud';
  const cloudAccessToken = isWhatsAppCloud
    ? (channel.credentials?.access_token || channel.credentials?.token)
    : null;
  const cloudPhoneNumberId = isWhatsAppCloud ? instanceId : null;

  // Cloud API — template settings
  const campSettings = typeof campaign.settings === 'string'
    ? JSON.parse(campaign.settings)
    : campaign.settings || {};
  const useTemplate = isWhatsAppCloud && campSettings.useTemplate && campSettings.templateName;
  const templateName = campSettings.templateName || '';
  const templateLanguage = campSettings.templateLanguage || 'pt_BR';

  const stats = {
    total: leads.length,
    sent: 0,
    delivered: 0,
    read: 0,
    replied: 0,
    failed: 0,
    errors: [] as string[]
  };

  console.log(`[Campaigns Execute] 📤 Iniciando envio para ${leads.length} leads...`);
  if (isWhatsAppCloud) {
    console.log(`[Campaigns Execute] ☁️ Canal: API Oficial Meta | Template: ${useTemplate ? templateName : 'N/A (texto livre)'}`);
  }

  // Obter configurações de delay
  const settings = typeof campaign.settings === 'string'
    ? JSON.parse(campaign.settings)
    : campaign.settings || {};

  // ─── ANTI-BAN: configurações de ritmo de envio ──────────────────────────
  // Defaults seguros: 15–45s entre mensagens, pausa de 90s a cada 20 msgs
  // O utilizador pode customizar nas settings da campanha.
  const minDelay = Math.max(12000, ((settings.minDelaySeconds ?? 15)) * 1000);
  const maxDelay = Math.max(minDelay + 5000, ((settings.maxDelaySeconds ?? 45)) * 1000);

  // Tamanho do lote antes de fazer uma pausa mais longa (default: 20)
  const batchSize = Math.max(5, Math.min(50, settings.batchSize ?? 20));
  // Pausa entre lotes em MS (default: 90s–3min aleatório)
  const batchPauseMin = Math.max(30000, ((settings.batchPauseMinSeconds ?? 90)) * 1000);
  const batchPauseMax = Math.max(batchPauseMin + 30000, ((settings.batchPauseMaxSeconds ?? 180)) * 1000);

  // Limite diário de mensagens (default: 150; -1 = sem limite)
  const dailyLimit: number = settings.dailyLimit ?? 150;

  const getDelay = () =>
    Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

  const getBatchPause = () =>
    Math.floor(Math.random() * (batchPauseMax - batchPauseMin + 1)) + batchPauseMin;

  // Contador de erros consecutivos — pausa extra se o WA começa a rejeitar
  let consecutiveErrors = 0;
  // Mensagens enviadas com sucesso nesta execução
  let sessionSent = 0;

  console.log(`[Campaigns Execute] ⏱ Anti-ban config: delay ${minDelay/1000}–${maxDelay/1000}s | batch ${batchSize} msgs | batch pause ${batchPauseMin/1000}–${batchPauseMax/1000}s | daily limit ${dailyLimit === -1 ? '∞' : dailyLimit}`);

  for (let i = 0; i < leads.length; i++) {
    // ── Verificar se campanha foi pausada/cancelada externamente ──────────
    const statusCheck = await query('SELECT status FROM campaigns WHERE id = $1', [campaign.id]);
    const currentStatus = statusCheck.rows[0]?.status;
    if (currentStatus === 'paused' || currentStatus === 'cancelled') {
      console.log(`[Campaigns Execute] Campanha ${campaign.id} foi ${currentStatus} externamente — parando loop.`);
      // Salvar stats parciais antes de sair
      await query(
        `UPDATE campaigns SET stats = COALESCE(stats, '{}'::jsonb) || $1::jsonb, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(stats), campaign.id]
      ).catch(() => {});
      return;
    }

    // ── Parar se atingiu o limite diário ───────────────────────────────────
    if (dailyLimit !== -1 && sessionSent >= dailyLimit) {
      console.warn(`[Campaigns Execute] Limite diário de ${dailyLimit} mensagens atingido. Pausando campanha.`);
      stats.errors.push(`Limite diário de ${dailyLimit} mensagens atingido. Retome amanhã.`);
      await query(
        `UPDATE campaigns SET status = 'paused', stats = $1, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify({ ...stats, pausedReason: 'DAILY_LIMIT_REACHED' }), campaign.id]
      );
      return;
    }

    const lead = leads[i];

    // ── Verifica limite a cada 10 mensagens (e na primeira) para não bloquear o loop inteiro ──
    if (i === 0 || i % 10 === 0) {
      const midCheck = await checkMessageLimit(userId, 'massMessages');
      if (!midCheck.allowed) {
        console.warn(`[Campaigns Execute] Limite de mensagens em massa atingido a ${i}/${leads.length}. Parando campanha.`);
        stats.errors.push('Limite de mensagens em massa do plano atingido. Campanha pausada.');
        // Marcar campanha como pausada por limite
        await query(
          `UPDATE campaigns SET status = 'paused', stats = $1, updated_at = NOW() WHERE id = $2`,
          [JSON.stringify({ ...stats, pausedReason: 'MASS_MESSAGE_LIMIT_EXCEEDED' }), campaign.id]
        );
        return;
      }
    }

    try {
      // Obter telefone do lead
      const phone = lead.phone || lead.whatsapp || lead.telefone;

      if (!phone) {
        stats.failed++;
        stats.errors.push(`Lead ${lead.id}: sem telefone`);
        continue;
      }

      // Group JIDs (@g.us) são enviados como estão; números normais viram @s.whatsapp.net
      const phoneStr = String(phone);
      const isGroupJid = phoneStr.endsWith('@g.us');
      // @lid nunca deve chegar aqui (filtrados na extração), mas por segurança:
      const isLidJid   = phoneStr.endsWith('@lid');
      if (isLidJid) {
        stats.failed++;
        stats.errors.push(`Lead ${lead.id}: número @lid não resolvível, ignorado`);
        continue;
      }
      // Manter JID do grupo intacto; para números: remover não-dígitos
      const cleanPhone = isGroupJid ? phoneStr : phoneStr.replace(/[^0-9]/g, '');
      if (!isGroupJid && (cleanPhone.length < 7 || cleanPhone.length > 15)) {
        stats.failed++;
        stats.errors.push(`Lead ${lead.id}: número inválido (${cleanPhone})`);
        continue;
      }
      const remoteJid = isGroupJid ? phoneStr : `${cleanPhone}@s.whatsapp.net`;
      const contactName = lead.name || lead.nome || cleanPhone;

      // Personalizar mensagem (substituir variáveis)
      let messageContent = campaign.template || '';
      messageContent = messageContent
        .replace(/\{name\}/gi, contactName)
        .replace(/\{nome\}/gi, contactName)
        .replace(/\{phone\}/gi, phone)
        .replace(/\{telefone\}/gi, phone)
        .replace(/\{email\}/gi, lead.email || '')
        .replace(/\{company\}/gi, lead.company || lead.empresa || '')
        .replace(/\{empresa\}/gi, lead.company || lead.empresa || '');

      console.log(`[Campaigns Execute] [${i + 1}/${leads.length}] Enviando para ${cleanPhone}...`);

      // Enviar mensagem via WhatsApp
      let sendResult: any = null;
      let messageStatus = 'sent';

      try {
        if (isWhatsAppCloud && cloudPhoneNumberId && cloudAccessToken) {
          // ===== WhatsApp Cloud (Graph API) =====
          const cloudApiUrl = `https://graph.facebook.com/v21.0/${cloudPhoneNumberId}/messages`;
          const cloudHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${cloudAccessToken}`
          };

          if (useTemplate && templateName) {
            // ── Template Message (cold campaigns / outside 24h window) ────────
            const templatePayload: any = {
              messaging_product: 'whatsapp',
              to: cleanPhone,
              type: 'template',
              template: {
                name: templateName,
                language: { code: templateLanguage },
                components: messageContent ? [
                  {
                    type: 'body',
                    parameters: [{ type: 'text', text: messageContent }]
                  }
                ] : []
              }
            };

            const tplResponse = await fetch(cloudApiUrl, {
              method: 'POST',
              headers: cloudHeaders,
              body: JSON.stringify(templatePayload)
            });

            const tplResult = await tplResponse.json();
            if (!tplResponse.ok) {
              throw new Error(`WhatsApp Cloud API (template) error: ${tplResult?.error?.message || JSON.stringify(tplResult)}`);
            }
            sendResult = tplResult;
          } else {
            // ── Free-form text (warm contacts / 24h session window) ───────────
            const hasCloudText = messageContent.trim().length > 0;
            const hasCloudMedia = !!(campaign.media_urls && campaign.media_urls.length > 0);

            if (!hasCloudText && !hasCloudMedia) {
              throw new Error('Campanha sem conteúdo: defina uma mensagem ou adicione um ficheiro');
            }

            if (hasCloudText) {
              const textPayload = {
                messaging_product: 'whatsapp',
                to: cleanPhone,
                type: 'text',
                text: { body: messageContent }
              };

              const textResponse = await fetch(cloudApiUrl, {
                method: 'POST',
                headers: cloudHeaders,
                body: JSON.stringify(textPayload)
              });

              const textResult = await textResponse.json();
              if (!textResponse.ok) {
                throw new Error(`WhatsApp Cloud API error: ${textResult?.error?.message || JSON.stringify(textResult)}`);
              }
              sendResult = textResult;
            }
          }

          // Enviar mídia via Graph API se houver (only for free-form, templates carry their own media)
          if (!useTemplate && campaign.media_urls && campaign.media_urls.length > 0) {
            const hasCloudText = messageContent.trim().length > 0;
            const cloudMediaAttachments: {url: string, caption: string}[] = campSettings.mediaAttachments || [];
            for (const mediaUrl of campaign.media_urls) {
              try {
                const mediaType = mediaUrl.match(/\.(jpg|jpeg|png|gif|webp)/i) ? 'image' :
                                 mediaUrl.match(/\.(mp4|mpeg|mov|avi)/i) ? 'video' :
                                 mediaUrl.match(/\.(pdf|doc|docx|xls|xlsx)/i) ? 'document' :
                                 mediaUrl.match(/\.(mp3|ogg|wav)/i) ? 'audio' : 'document';

                const attMeta = cloudMediaAttachments.find((a: any) => a.url === mediaUrl);
                const cloudCaption = attMeta?.caption || (hasCloudText ? '' : messageContent);

                const mediaPayload: any = {
                  messaging_product: 'whatsapp',
                  to: cleanPhone,
                  type: mediaType,
                  [mediaType]: { link: mediaUrl, caption: cloudCaption }
                };

                const mediaResponse = await fetch(cloudApiUrl, {
                  method: 'POST',
                  headers: cloudHeaders,
                  body: JSON.stringify(mediaPayload)
                });
                if (!sendResult) {
                  const mediaResult = await mediaResponse.json();
                  if (mediaResponse.ok) sendResult = mediaResult;
                }
              } catch (mediaError: any) {
                console.warn(`[Campaigns Execute] Erro ao enviar mídia via Cloud: ${mediaError.message}`);
              }
            }
          }
        } else {
          // ===== WhatsApp Evolution API =====
          const hasEvoText = messageContent.trim().length > 0;
          const hasEvoMedia = !!(campaign.media_urls && campaign.media_urls.length > 0);

          if (!hasEvoText && !hasEvoMedia) {
            throw new Error('Campanha sem conteúdo: defina uma mensagem ou adicione um ficheiro');
          }

          if (hasEvoText) {
            sendResult = await whatsappService.sendMessage({
              instanceId: instanceId,
              number: cleanPhone, // full JID for groups/@lid, plain phone for individuals
              text: messageContent
            });
          }

          // Enviar mídia via Evolution API se houver
          if (hasEvoMedia) {
            const evoMediaAttachments: {url: string, caption: string}[] = settings.mediaAttachments || [];
            for (const mediaUrl of campaign.media_urls!) {
              try {
                const mediaType = mediaUrl.match(/\.(jpg|jpeg|png|gif|webp)/i) ? 'image' :
                                 mediaUrl.match(/\.(mp4|mpeg|mov|avi)/i) ? 'video' :
                                 mediaUrl.match(/\.(pdf|doc|docx|xls|xlsx)/i) ? 'document' :
                                 mediaUrl.match(/\.(mp3|ogg|wav)/i) ? 'audio' : 'document';

                const attMeta = evoMediaAttachments.find((a: any) => a.url === mediaUrl);
                const evoCaption = attMeta?.caption || (hasEvoText ? '' : messageContent);

                const mediaResult = await whatsappService.sendMedia({
                  instanceId: instanceId,
                  number: cleanPhone,
                  mediaUrl: mediaUrl,
                  mediaType: mediaType,
                  caption: evoCaption
                });
                if (!sendResult) sendResult = mediaResult;
              } catch (mediaError: any) {
                console.warn(`[Campaigns Execute] Erro ao enviar mídia: ${mediaError.message}`);
              }
            }
          }
        }

      stats.sent++;
      sessionSent++;
      consecutiveErrors = 0; // reset on success
      } catch (sendError: any) {
        console.error(`[Campaigns Execute] Erro ao enviar para ${cleanPhone}:`, sendError.message);
        stats.failed++;
        messageStatus = 'failed';
        stats.errors.push(`Lead ${lead.id} (${cleanPhone}): ${sendError.message}`);
      }

      // Criar conversa no inbox
      try {
        // Synthetic IDs (group-xxx, gm-xxx, custom-xxx) are not real lead UUIDs
        const isRealLeadId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lead.id || '');
        const conversation = await conversationsService.findOrCreate(
          userId,
          channel.id,
          remoteJid,
          isRealLeadId ? lead.id : undefined,
          {
            contact_name: contactName,
            phone: cleanPhone,
            campaign_id: campaign.id,
            campaign_name: campaign.name,
            source: 'campaign'
          }
        );

        // Salvar mensagem no inbox
        const msgChannel = isWhatsAppCloud ? 'whatsapp_cloud' : 'whatsapp';
        const messageResult = await query(
          `INSERT INTO messages (
            user_id, conversation_id, lead_id, campaign_id, direction, channel,
            content, media_url, media_type, status, external_id, metadata, sent_at
          )
           VALUES ($1, $2, $3, $4, 'out', $5, $6, $7, $8, $9, $10, $11, NOW())
           RETURNING *`,
          [
            userId,
            conversation.id,
            lead.id,
            campaign.id,
            msgChannel,
            messageContent,
            campaign.media_urls?.[0] || null,
            campaign.media_urls?.[0] ? 'image' : null,
            messageStatus,
            sendResult?.key?.id || sendResult?.messages?.[0]?.id || null,
            JSON.stringify({
              campaign_id: campaign.id,
              campaign_name: campaign.name,
              instance_id: instanceId,
              channel_type: msgChannel,
              phone: cleanPhone,
              lead_name: contactName,
              source: 'dashboard_campaign'
            })
          ]
        );

        const savedMessage = messageResult.rows[0];

        // Atualizar conversa
        await query(
          `UPDATE conversations
           SET last_message_at = NOW(),
               status = 'open',
               updated_at = NOW()
           WHERE id = $1`,
          [conversation.id]
        );

        // Emitir WebSocket para atualizar inbox em tempo real
        const wsService = getWebSocketService();
        if (wsService) {
          // Buscar conversa atualizada
          const updatedConvResult = await query(
            `SELECT c.*, ch.name as channel_name, l.name as lead_name, l.phone as lead_phone
             FROM conversations c
             LEFT JOIN channels ch ON c.channel_id = ch.id
             LEFT JOIN leads l ON c.lead_id = l.id
             WHERE c.id = $1`,
            [conversation.id]
          );

          wsService.emitNewMessage(userId, {
            conversationId: conversation.id,
            message: savedMessage,
            conversation: updatedConvResult.rows[0]
          });

          wsService.emitConversationUpdate(userId, {
            conversationId: conversation.id,
            conversation: updatedConvResult.rows[0]
          });
        }

        console.log(`[Campaigns Execute] ✅ Mensagem salva no inbox: ${savedMessage.id}`);
      } catch (inboxError: any) {
        console.error(`[Campaigns Execute] Erro ao salvar no inbox:`, inboxError.message);
      }

      // Atualizar estatísticas a cada mensagem para sincronização em tempo real
      await query(
        `UPDATE campaigns SET stats = $1, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(stats), campaign.id]
      );
      // Emitir WebSocket para o frontend atualizar o progresso imediatamente
      const wsServiceStats = getWebSocketService();
      if (wsServiceStats) {
        wsServiceStats.emitToUser(userId, 'campaign:stats', {
          campaignId: campaign.id,
          stats,
          progress: { sent: stats.sent, failed: stats.failed, total: leads.length }
        });
      }

      // ─── ANTI-BAN: delays e pausas entre lotes ──────────────────────────
      if (i < leads.length - 1) {
        // Pausa longa a cada N mensagens (final do lote)
        const isEndOfBatch = (i + 1) % batchSize === 0;
        if (isEndOfBatch) {
          const batchPause = getBatchPause();
          const batchNum = Math.floor((i + 1) / batchSize);
          console.log(`[Campaigns Execute] ⏸ Pausa entre lotes (${batchNum}) — aguardando ${Math.round(batchPause / 1000)}s...`);
          await query(
            `UPDATE campaigns SET stats = $1, updated_at = NOW() WHERE id = $2`,
            [JSON.stringify(stats), campaign.id]
          );
          await new Promise(resolve => setTimeout(resolve, batchPause));
        } else {
          // Delay normal entre mensagens
          await new Promise(resolve => setTimeout(resolve, getDelay()));
        }
      }

    } catch (error: any) {
      console.error(`[Campaigns Execute] Erro no lead ${lead.id}:`, error.message);
      stats.failed++;
      consecutiveErrors++;
      stats.errors.push(`Lead ${lead.id}: ${error.message}`);

      // ─── Backoff adaptativo: se o WA começar a rejeitar, pausar mais ───
      if (consecutiveErrors >= 3) {
        const backoffMs = Math.min(consecutiveErrors * 30000, 300000); // max 5 min
        console.warn(`[Campaigns Execute] ⚠️ ${consecutiveErrors} erros consecutivos — aguardando ${Math.round(backoffMs / 1000)}s antes de continuar...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }

      // Após 10 erros consecutivos, pausar a campanha (provável bloqueio)
      if (consecutiveErrors >= 10) {
        console.error(`[Campaigns Execute] 🚫 10 erros consecutivos — pausando campanha por protecção anti-ban`);
        stats.errors.push('Campanha pausada automaticamente: muitos erros consecutivos. Pode indicar bloqueio do WhatsApp.');
        await query(
          `UPDATE campaigns SET status = 'paused', stats = $1, updated_at = NOW() WHERE id = $2`,
          [JSON.stringify({ ...stats, pausedReason: 'TOO_MANY_ERRORS' }), campaign.id]
        );
        return;
      }
    }
  }

  // 7. Finalizar campanha
  const finalStatus = stats.failed === stats.total ? 'failed' : 'completed';

  await query(
    `UPDATE campaigns
     SET status = $1,
         stats = $2,
         completed_at = NOW(),
         updated_at = NOW()
     WHERE id = $3`,
    [finalStatus, JSON.stringify(stats), campaign.id]
  );

  console.log(`[Campaigns Execute] 🏁 Campanha ${campaign.name} finalizada:`, {
    status: finalStatus,
    stats
  });

  // Criar notificação no sino com resumo da campanha
  try {
    await notificationsService.createNotification(
      userId,
      'campaign_sent',
      `Campanha "${campaign.name}" finalizada`,
      `Enviadas: ${stats.sent}/${stats.total} • Falhas: ${stats.failed} • Leituras: ${stats.read || 0} • Respostas: ${stats.replied || 0}`,
      'megaphone',
      {
        campaignId: campaign.id,
        campaignName: campaign.name,
        status: finalStatus,
        stats,
      }
    );
  } catch (notificationError: any) {
    console.warn('[Campaigns Execute] Falha ao criar notificação da campanha:', notificationError.message);
  }

  // Emitir WebSocket para notificar conclusão
  const wsService = getWebSocketService();
  if (wsService) {
    wsService.emitConversationUpdate(userId, {
      type: 'campaign_completed',
      campaignId: campaign.id,
      campaignName: campaign.name,
      stats
    });
  }
}

export default router;
