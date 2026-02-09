import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.middleware';
import { CampaignsService } from '../services/campaigns.service';
import { getStorageService } from '../services/storage.service';
import { WhatsAppService } from '../services/whatsapp.service';
import { ConversationsService } from '../services/conversations.service';
import { ChannelsService } from '../services/channels.service';
import { getWebSocketService } from '../services/websocket.service';
import { query } from '../database/connection';

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
    const instanceId = settings.instanceId || settings.instance_id || settings.instanceName;

    if (instanceId) {
      // Buscar pelo instanceId especificado na campanha
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

    if (!channel) {
      // Buscar primeiro canal WhatsApp ativo
      const channels = await channelsService.findByType('whatsapp', user.id);
      channel = channels.find(c => c.status === 'active');
    }

    if (!channel) {
      return res.status(400).json({
        error: 'Nenhum canal WhatsApp ativo encontrado. Conecte o WhatsApp primeiro.'
      });
    }

    const whatsappInstanceId = channel.credentials?.instance_id || channel.credentials?.instance_name;

    if (!whatsappInstanceId) {
      return res.status(400).json({
        error: 'Canal WhatsApp não tem instância configurada'
      });
    }

    console.log(`[Campaigns Execute] Canal WhatsApp: ${channel.id}, Instance: ${whatsappInstanceId}`);

    // 3. Buscar leads destinatários
    let leadsQuery = 'SELECT * FROM leads WHERE user_id = $1';
    const queryParams: any[] = [user.id];
    let paramIndex = 2;

    // Aplicar filtros baseados nas configurações da campanha
    if (settings.leadIds && Array.isArray(settings.leadIds) && settings.leadIds.length > 0) {
      // Lista personalizada de leads
      leadsQuery += ` AND id = ANY($${paramIndex})`;
      queryParams.push(settings.leadIds);
      paramIndex++;
    } else if (settings.segments && Array.isArray(settings.segments) && settings.segments.length > 0) {
      // Filtro por segmentos/status
      leadsQuery += ` AND status = ANY($${paramIndex})`;
      queryParams.push(settings.segments);
      paramIndex++;
    }

    // Apenas leads com telefone
    leadsQuery += ` AND (phone IS NOT NULL OR whatsapp IS NOT NULL OR telefone IS NOT NULL)`;
    leadsQuery += ` ORDER BY created_at DESC`;

    // Aplicar limite se especificado
    if (settings.limit && typeof settings.limit === 'number') {
      leadsQuery += ` LIMIT $${paramIndex}`;
      queryParams.push(settings.limit);
    }

    const leadsResult = await query(leadsQuery, queryParams);
    const leads = leadsResult.rows;

    if (leads.length === 0) {
      return res.status(400).json({
        error: 'Nenhum lead encontrado com os filtros especificados'
      });
    }

    console.log(`[Campaigns Execute] ${leads.length} leads encontrados para envio`);

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
      await executeCampaignMessages(
        campaign,
        leads,
        channel,
        whatsappInstanceId,
        user.id
      );
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
  const stats = {
    total: leads.length,
    sent: 0,
    delivered: 0,
    failed: 0,
    errors: [] as string[]
  };

  console.log(`[Campaigns Execute] 📤 Iniciando envio para ${leads.length} leads...`);

  // Obter configurações de delay
  const settings = typeof campaign.settings === 'string'
    ? JSON.parse(campaign.settings)
    : campaign.settings || {};

  const delayBetweenMessages = settings.delay || settings.delayBetweenMessages || 3000; // 3 segundos padrão

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];

    try {
      // Obter telefone do lead
      const phone = lead.phone || lead.whatsapp || lead.telefone;

      if (!phone) {
        stats.failed++;
        stats.errors.push(`Lead ${lead.id}: sem telefone`);
        continue;
      }

      const cleanPhone = phone.replace(/\D/g, '');
      const remoteJid = `${cleanPhone}@s.whatsapp.net`;
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
        // Enviar texto
        sendResult = await whatsappService.sendMessage({
          instanceId: instanceId,
          number: cleanPhone,
          text: messageContent
        });

        // Enviar mídia se houver
        if (campaign.media_urls && campaign.media_urls.length > 0) {
          for (const mediaUrl of campaign.media_urls) {
            try {
              // Detectar tipo de mídia
              const mediaType = mediaUrl.match(/\.(jpg|jpeg|png|gif|webp)/i) ? 'image' :
                               mediaUrl.match(/\.(mp4|mpeg|mov|avi)/i) ? 'video' :
                               mediaUrl.match(/\.(pdf|doc|docx|xls|xlsx)/i) ? 'document' :
                               mediaUrl.match(/\.(mp3|ogg|wav)/i) ? 'audio' : 'document';

              await whatsappService.sendMedia({
                instanceId: instanceId,
                number: cleanPhone,
                mediaUrl: mediaUrl,
                mediaType: mediaType,
                caption: ''
              });
            } catch (mediaError: any) {
              console.warn(`[Campaigns Execute] Erro ao enviar mídia: ${mediaError.message}`);
            }
          }
        }

        stats.sent++;
      } catch (sendError: any) {
        console.error(`[Campaigns Execute] Erro ao enviar para ${cleanPhone}:`, sendError.message);
        stats.failed++;
        messageStatus = 'failed';
        stats.errors.push(`Lead ${lead.id} (${cleanPhone}): ${sendError.message}`);
      }

      // Criar conversa no inbox
      try {
        const conversation = await conversationsService.findOrCreate(
          userId,
          channel.id,
          remoteJid,
          lead.id,
          {
            contact_name: contactName,
            phone: cleanPhone,
            campaign_id: campaign.id,
            campaign_name: campaign.name,
            source: 'campaign'
          }
        );

        // Salvar mensagem no inbox
        const messageResult = await query(
          `INSERT INTO messages (
            user_id, conversation_id, lead_id, campaign_id, direction, channel,
            content, media_url, media_type, status, external_id, metadata, sent_at
          )
           VALUES ($1, $2, $3, $4, 'out', 'whatsapp', $5, $6, $7, $8, $9, $10, NOW())
           RETURNING *`,
          [
            userId,
            conversation.id,
            lead.id,
            campaign.id,
            messageContent,
            campaign.media_urls?.[0] || null,
            campaign.media_urls?.[0] ? 'image' : null,
            messageStatus,
            sendResult?.key?.id || null,
            JSON.stringify({
              campaign_id: campaign.id,
              campaign_name: campaign.name,
              instance_id: instanceId,
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

      // Atualizar estatísticas da campanha periodicamente
      if (i % 5 === 0 || i === leads.length - 1) {
        await query(
          `UPDATE campaigns
           SET stats = $1,
               updated_at = NOW()
           WHERE id = $2`,
          [JSON.stringify(stats), campaign.id]
        );
      }

      // Delay entre mensagens (exceto na última)
      if (i < leads.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenMessages));
      }

    } catch (error: any) {
      console.error(`[Campaigns Execute] Erro no lead ${lead.id}:`, error.message);
      stats.failed++;
      stats.errors.push(`Lead ${lead.id}: ${error.message}`);
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
