import { Router } from 'express';
import { query } from '../database/connection';
// INBOX: Importar services para webhook do Evolution
import { ChannelsService } from '../services/channels.service';
import { ConversationsService } from '../services/conversations.service';
import { LeadsService } from '../services/leads.service';

const router = Router();
const channelsService = new ChannelsService();
const conversationsService = new ConversationsService();
const leadsService = new LeadsService();

// ✅ Webhook para N8N cadastrar novos leads
router.post('/n8n/leads', async (req, res) => {
  try {
    console.log('[N8N Webhook] Recebendo novo lead:', req.body);

    const { nome, telefone, email, empresa, status, origem, observacoes, userId } = req.body;

    // Validar campos obrigatórios
    if (!nome || !userId) {
      return res.status(400).json({
        error: 'Nome e userId são obrigatórios',
        received: req.body
      });
    }

    // Inserir lead no banco de dados
    const result = await query(
      `INSERT INTO leads (user_id, nome, telefone, email, empresa, status, origem, observacoes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       RETURNING *`,
      [
        userId,
        nome,
        telefone || null,
        email || null,
        empresa || null,
        status || 'novo',
        origem || 'n8n',
        observacoes || null
      ]
    );

    const newLead = result.rows[0];
    console.log('[N8N Webhook] Lead criado com sucesso:', newLead.id);

    res.status(201).json({
      success: true,
      message: 'Lead cadastrado com sucesso',
      lead: newLead
    });
  } catch (error) {
    console.error('[N8N Webhook] Erro ao cadastrar lead:', error);
    res.status(500).json({
      error: 'Erro ao cadastrar lead',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

// ✅ Endpoint para N8N listar leads (GET)
router.get('/n8n/leads', async (req, res) => {
  try {
    const { userId, status, limit = '100' } = req.query;

    console.log('[N8N Webhook] Listando leads:', { userId, status, limit });

    if (!userId) {
      return res.status(400).json({ error: 'userId é obrigatório' });
    }

    let queryText = 'SELECT * FROM leads WHERE user_id = $1';
    const params: any[] = [userId];

    if (status) {
      queryText += ' AND status = $2';
      params.push(status);
    }

    queryText += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit as string));

    const result = await query(queryText, params);

    console.log('[N8N Webhook] Leads encontrados:', result.rows.length);

    res.json({
      success: true,
      count: result.rows.length,
      leads: result.rows
    });
  } catch (error) {
    console.error('[N8N Webhook] Erro ao listar leads:', error);
    res.status(500).json({
      error: 'Erro ao listar leads',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

// ✅ Webhook para N8N receber disparos de campanhas agendadas
router.post('/n8n/campaigns/trigger', async (req, res) => {
  try {
    console.log('[N8N Webhook] Recebendo disparo de campanha:', req.body);

    const { campaignId, userId } = req.body;

    if (!campaignId || !userId) {
      return res.status(400).json({ error: 'campaignId e userId são obrigatórios' });
    }

    // Buscar dados da campanha
    const result = await query(
      'SELECT * FROM campaigns WHERE id = $1 AND user_id = $2',
      [campaignId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Campanha não encontrada' });
    }

    const campaign = result.rows[0];

    res.json({
      success: true,
      message: 'Campanha recebida para processamento',
      campaign: {
        id: campaign.id,
        name: campaign.name,
        type: campaign.type,
        template: campaign.template,
        settings: campaign.settings,
        media_urls: campaign.media_urls
      }
    });
  } catch (error) {
    console.error('[N8N Webhook] Erro ao processar campanha:', error);
    res.status(500).json({
      error: 'Erro ao processar campanha',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

// ✅ Webhook para N8N atualizar status e estatísticas da campanha
router.post('/n8n/campaigns/complete', async (req, res) => {
  try {
    console.log('[N8N Webhook] Recebendo conclusão de campanha:', req.body);

    const { campaignId, userId, stats, status } = req.body;

    // Validar campos obrigatórios
    if (!campaignId || !userId) {
      return res.status(400).json({
        error: 'campaignId e userId são obrigatórios',
        received: req.body
      });
    }

    // Buscar campanha para validar
    const campaignResult = await query(
      'SELECT * FROM campaigns WHERE id = $1 AND user_id = $2',
      [campaignId, userId]
    );

    if (campaignResult.rows.length === 0) {
      return res.status(404).json({ error: 'Campanha não encontrada' });
    }

    const campaign = campaignResult.rows[0];

    // Preparar estatísticas (mesclar com existentes se houver)
    const currentStats = campaign.stats || { sent: 0, delivered: 0, read: 0, replied: 0, failed: 0 };
    const updatedStats = stats ? { ...currentStats, ...stats } : currentStats;

    // Determinar status final (se não for fornecido, usar 'completed')
    const finalStatus = status || 'completed';

    // Atualizar campanha
    const updateResult = await query(
      `UPDATE campaigns
       SET status = $1,
           stats = $2,
           completed_at = CASE
             WHEN $1 = 'completed' THEN NOW()
             ELSE completed_at
           END,
           updated_at = NOW()
       WHERE id = $3 AND user_id = $4
       RETURNING *`,
      [finalStatus, JSON.stringify(updatedStats), campaignId, userId]
    );

    const updatedCampaign = updateResult.rows[0];

    console.log(`[N8N Webhook] Campanha ${campaignId} atualizada para status: ${finalStatus}`);
    console.log(`[N8N Webhook] Estatísticas atualizadas:`, updatedStats);

    res.json({
      success: true,
      message: `Campanha atualizada para status: ${finalStatus}`,
      campaign: {
        id: updatedCampaign.id,
        name: updatedCampaign.name,
        status: updatedCampaign.status,
        stats: updatedCampaign.stats,
        completed_at: updatedCampaign.completed_at
      }
    });
  } catch (error) {
    console.error('[N8N Webhook] Erro ao atualizar campanha:', error);
    res.status(500).json({
      error: 'Erro ao atualizar campanha',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
});

// INBOX: ✅ Webhook para Evolution API receber mensagens do WhatsApp
router.post('/evolution/messages', async (req, res) => {
  try {
    console.log('[Evolution Webhook] ===== MENSAGEM RECEBIDA =====');
    console.log('[Evolution Webhook] Body:', JSON.stringify(req.body).substring(0, 1000));

    const { instance, data, event } = req.body;

    console.log('[Evolution Webhook] Instance:', instance);
    console.log('[Evolution Webhook] Event:', event);

    // Validar payload
    if (!instance || !data) {
      console.warn('[Evolution Webhook] Payload inválido, missing instance or data');
      return res.status(400).json({ error: 'Invalid payload' });
    }

    // Ignorar mensagens enviadas pelo próprio usuário (já salvamos no momento do envio)
    const isFromMe = data.key?.fromMe === true;
    if (isFromMe) {
      console.log('[Evolution Webhook] Ignorando mensagem enviada pelo próprio usuário');
      return res.json({ success: true, message: 'Outgoing message ignored (already saved on send)' });
    }

    // Encontrar canal pelo instance_id OU instance_name
    const channelResult = await query(
      `SELECT * FROM channels 
       WHERE type = 'whatsapp' 
       AND (credentials->>'instance_id' = $1 OR credentials->>'instance_name' = $1)`,
      [instance]
    );

    console.log('[Evolution Webhook] Canal encontrado:', channelResult.rows.length > 0);

    if (channelResult.rows.length === 0) {
      console.warn('[Evolution Webhook] Canal não encontrado para instance:', instance);
      return res.status(404).json({ error: 'Channel not found for this instance' });
    }

    const channel = channelResult.rows[0];
    console.log('[Evolution Webhook] Canal ID:', channel.id, 'User ID:', channel.user_id);
    
    const remoteJid = data.key?.remoteJid || data.remoteJid;

    // Ignorar mensagens de grupos
    if (remoteJid && remoteJid.includes('@g.us')) {
      console.log('[Evolution Webhook] Ignorando mensagem de grupo:', remoteJid);
      return res.json({ success: true, message: 'Group messages are ignored' });
    }

    // Extrair conteúdo da mensagem
    const messageContent = data.message?.conversation ||
      data.message?.extendedTextMessage?.text ||
      data.message?.imageMessage?.caption ||
      data.message?.videoMessage?.caption ||
      data.message?.documentMessage?.caption ||
      '[Mídia]';

    // Extrair mídia se houver
    let mediaUrl = null;
    let mediaType = null;

    if (data.message?.imageMessage) {
      mediaType = 'image';
    } else if (data.message?.videoMessage) {
      mediaType = 'video';
    } else if (data.message?.audioMessage) {
      mediaType = 'audio';
    } else if (data.message?.documentMessage) {
      mediaType = 'document';
    }

    // Extrair telefone do JID
    const phone = remoteJid.split('@')[0];
    const contactName = data.pushName || phone;

    // Buscar ou criar lead
    let lead = await query(
      `SELECT * FROM leads WHERE user_id = $1 AND (phone = $2 OR whatsapp = $2)`,
      [channel.user_id, phone]
    );

    let leadId: string;

    if (lead.rows.length === 0) {
      // Criar lead automaticamente
      console.log('[Evolution Webhook] Criando novo lead:', contactName, phone);
      const leadResult = await query(
        `INSERT INTO leads (user_id, name, phone, whatsapp, source, status)
         VALUES ($1, $2, $3, $3, 'whatsapp', 'new')
         RETURNING *`,
        [channel.user_id, contactName, phone]
      );
      leadId = leadResult.rows[0].id;
    } else {
      leadId = lead.rows[0].id;
    }

    // Buscar ou criar conversa
    const conversation = await conversationsService.findOrCreate(
      channel.user_id,
      channel.id,
      remoteJid,
      leadId,
      {
        contact_name: contactName,
        phone: phone
      }
    );

    // Salvar mensagem
    const messageResult = await query(
      `INSERT INTO messages (
        user_id, conversation_id, lead_id, direction, channel, 
        content, media_url, media_type, status, external_id, metadata
      )
       VALUES ($1, $2, $3, 'in', 'whatsapp', $4, $5, $6, 'delivered', $7, $8)
       RETURNING *`,
      [
        channel.user_id,
        conversation.id,
        leadId,
        messageContent,
        mediaUrl,
        mediaType,
        data.key?.id,
        JSON.stringify({
          from: data.key?.remoteJid,
          timestamp: data.messageTimestamp,
          pushName: data.pushName,
          fromMe: data.key?.fromMe || false
        })
      ]
    );

    const message = messageResult.rows[0];

    console.log('[Evolution Webhook] Mensagem salva com sucesso:', message.id);

    // TODO: Emitir evento WebSocket para atualização em tempo real
    // wsService.emitNewMessage(channel.user_id, { conversationId: conversation.id, message });

    res.json({ success: true, message_id: message.id });
  } catch (error) {
    console.error('[Evolution Webhook] Erro ao processar mensagem:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
