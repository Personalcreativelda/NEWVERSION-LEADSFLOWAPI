import { Router } from 'express';
import { query } from '../database/connection';
// INBOX: Importar services para webhook do Evolution
import { ChannelsService } from '../services/channels.service';
import { ConversationsService } from '../services/conversations.service';
import { LeadsService } from '../services/leads.service';
// INBOX: Importar WebSocket service para notificações em tempo real
import { getWebSocketService } from '../services/websocket.service';

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

// INBOX: ✅ Endpoint de debug para verificar se webhook está acessível
router.get('/evolution/messages', async (_req, res) => {
  console.log('[Evolution Webhook] GET request received - webhook is accessible');
  res.json({
    success: true,
    message: 'Evolution webhook endpoint is accessible',
    endpoint: '/api/webhooks/evolution/messages',
    method: 'POST',
    timestamp: new Date().toISOString()
  });
});

// ✅ ADMIN: Configurar webhook em TODAS as instâncias existentes
// Uso: POST /api/webhooks/evolution/setup-all?admin_key=PRIMEIROS_20_CHARS_DO_JWT_SECRET
router.post('/evolution/setup-all', async (req, res) => {
  try {
    // Verificar chave admin (use os primeiros 20 chars do JWT_SECRET como chave admin)
    const adminKey = req.query.admin_key || req.headers['x-admin-key'];
    const expectedKey = process.env.JWT_SECRET?.substring(0, 20);

    if (!adminKey || adminKey !== expectedKey) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Provide admin_key query parameter or x-admin-key header',
        hint: 'Use the first 20 characters of your JWT_SECRET'
      });
    }

    console.log('[Evolution Webhook Setup] 🔧 Starting webhook setup for ALL instances...');

    const webhookUrl = process.env.WEBHOOK_URL || process.env.API_URL || process.env.SERVICE_URL_API;
    if (!webhookUrl) {
      return res.status(400).json({
        error: 'WEBHOOK_URL not configured',
        message: 'Configure WEBHOOK_URL no .env'
      });
    }

    const fullWebhookUrl = `${webhookUrl.replace(/\/$/, '')}/api/webhooks/evolution/messages`;
    const evolutionUrl = process.env.EVOLUTION_API_URL;
    const apiKey = process.env.EVOLUTION_API_KEY;

    if (!evolutionUrl || !apiKey) {
      return res.status(400).json({
        error: 'Evolution API not configured',
        message: 'Configure EVOLUTION_API_URL e EVOLUTION_API_KEY no .env'
      });
    }

    // 1. Buscar TODAS as instâncias da Evolution API
    console.log('[Evolution Webhook Setup] Fetching all instances from Evolution API...');
    const instancesResponse = await fetch(`${evolutionUrl}/instance/fetchInstances`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
      },
    });

    if (!instancesResponse.ok) {
      const errorText = await instancesResponse.text();
      return res.status(500).json({
        error: 'Failed to fetch instances',
        details: errorText
      });
    }

    const instances = await instancesResponse.json();
    console.log('[Evolution Webhook Setup] Found instances:', Array.isArray(instances) ? instances.length : 1);

    // 2. Configurar webhook em cada instância
    const results: any[] = [];
    const instanceList = Array.isArray(instances) ? instances : [instances];

    for (const instance of instanceList) {
      const instanceName = instance.instance?.instanceName || instance.instanceName || instance.name;

      if (!instanceName) {
        console.warn('[Evolution Webhook Setup] Skipping instance without name:', JSON.stringify(instance).substring(0, 200));
        continue;
      }

      console.log('[Evolution Webhook Setup] Configuring webhook for:', instanceName);

      try {
        const webhookConfig = {
          url: fullWebhookUrl,
          webhook_by_events: false,
          webhook_base64: true,
          events: [
            'MESSAGES_UPSERT',
            'MESSAGES_UPDATE',
            'MESSAGES_DELETE',
            'SEND_MESSAGE',
            'CONNECTION_UPDATE',
            'QRCODE_UPDATED',
          ],
        };

        const configResponse = await fetch(`${evolutionUrl}/webhook/set/${instanceName}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': apiKey,
          },
          body: JSON.stringify(webhookConfig),
        });

        const configResult = await configResponse.json();

        results.push({
          instanceName,
          success: configResponse.ok,
          response: configResult
        });

        console.log(`[Evolution Webhook Setup] ${instanceName}: ${configResponse.ok ? '✅ OK' : '❌ FAILED'}`);
      } catch (e: any) {
        results.push({
          instanceName,
          success: false,
          error: e.message
        });
        console.error(`[Evolution Webhook Setup] ${instanceName}: ❌ ERROR:`, e.message);
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`[Evolution Webhook Setup] ✅ Complete: ${successful} success, ${failed} failed`);

    res.json({
      success: true,
      message: `Webhook configurado em ${successful} instâncias`,
      webhookUrl: fullWebhookUrl,
      summary: {
        total: results.length,
        successful,
        failed
      },
      results
    });
  } catch (error: any) {
    console.error('[Evolution Webhook Setup] Error:', error);
    res.status(500).json({
      error: 'Failed to setup webhooks',
      message: error.message
    });
  }
});

// INBOX: ✅ Webhook para Evolution API receber mensagens do WhatsApp
router.post('/evolution/messages', async (req, res) => {
  try {
    console.log('[Evolution Webhook] ===== WEBHOOK RECEBIDO =====');
    console.log('[Evolution Webhook] Headers:', JSON.stringify(req.headers).substring(0, 500));
    console.log('[Evolution Webhook] Body completo:', JSON.stringify(req.body).substring(0, 2000));

    // Evolution API pode enviar payload em diferentes formatos
    const body = req.body;

    // Extrair dados do payload - suporta múltiplos formatos
    let instance = body.instance || body.instanceName || body.sender?.instance;
    let event = body.event || body.type || 'MESSAGES_UPSERT';
    let data = body.data || body;

    // Se instance for um objeto, extrair o nome
    if (typeof instance === 'object' && instance !== null) {
      instance = instance.instanceName || instance.instance || instance.name;
    }

    console.log('[Evolution Webhook] Instance (parsed):', instance);
    console.log('[Evolution Webhook] Event (parsed):', event);
    console.log('[Evolution Webhook] Data keys:', data ? Object.keys(data) : 'null');

    // Verificar tipo de evento - só processar mensagens
    const messageEvents = ['MESSAGES_UPSERT', 'messages.upsert', 'message', 'MESSAGES_UPDATE'];
    if (event && !messageEvents.includes(event)) {
      console.log('[Evolution Webhook] Evento ignorado (não é mensagem):', event);
      return res.json({ success: true, message: `Event ${event} ignored` });
    }

    // Validar payload básico
    if (!instance) {
      console.warn('[Evolution Webhook] Payload inválido - sem instance');
      console.warn('[Evolution Webhook] Body recebido:', JSON.stringify(body).substring(0, 500));
      return res.status(400).json({ error: 'Invalid payload - missing instance' });
    }

    // Tentar extrair dados da mensagem de diferentes formatos
    // Formato 1: { data: { key: {...}, message: {...} } }
    // Formato 2: { key: {...}, message: {...} } (direto no body)
    // Formato 3: { data: [{ key: {...}, message: {...} }] } (array)
    let messageData = data;

    if (Array.isArray(data)) {
      // Se data é array, pegar o primeiro item
      messageData = data[0];
      console.log('[Evolution Webhook] Data era array, usando primeiro item');
    }

    // Se data tem um campo 'data' interno (duplo encapsulamento)
    if (messageData?.data && typeof messageData.data === 'object') {
      messageData = messageData.data;
    }

    // Verificar se temos dados de mensagem válidos
    if (!messageData || (!messageData.key && !messageData.message && !messageData.remoteJid)) {
      console.warn('[Evolution Webhook] Sem dados de mensagem válidos');
      console.warn('[Evolution Webhook] messageData:', JSON.stringify(messageData).substring(0, 500));
      return res.json({ success: true, message: 'No message data to process' });
    }

    // Ignorar mensagens enviadas pelo próprio usuário (já salvamos no momento do envio)
    const isFromMe = messageData.key?.fromMe === true || messageData.fromMe === true;
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
      // Listar canais existentes para debug
      const allChannels = await query(`SELECT id, credentials->>'instance_id' as inst_id, credentials->>'instance_name' as inst_name FROM channels WHERE type = 'whatsapp'`);
      console.warn('[Evolution Webhook] Canais existentes:', JSON.stringify(allChannels.rows));
      return res.status(404).json({ error: 'Channel not found for this instance', instance });
    }

    const channel = channelResult.rows[0];
    console.log('[Evolution Webhook] Canal ID:', channel.id, 'User ID:', channel.user_id);

    const remoteJid = messageData.key?.remoteJid || messageData.remoteJid;

    // Validar remoteJid
    if (!remoteJid) {
      console.warn('[Evolution Webhook] Sem remoteJid no payload');
      return res.json({ success: true, message: 'No remoteJid to process' });
    }

    // Ignorar mensagens de grupos
    if (remoteJid.includes('@g.us')) {
      console.log('[Evolution Webhook] Ignorando mensagem de grupo:', remoteJid);
      return res.json({ success: true, message: 'Group messages are ignored' });
    }

    // Extrair conteúdo da mensagem - suporta múltiplos formatos
    const msg = messageData.message || messageData;
    const messageContent = msg?.conversation ||
      msg?.extendedTextMessage?.text ||
      msg?.imageMessage?.caption ||
      msg?.videoMessage?.caption ||
      msg?.documentMessage?.caption ||
      msg?.text ||
      msg?.body ||
      msg?.content ||
      '[Mídia]';

    console.log('[Evolution Webhook] Conteúdo extraído:', messageContent.substring(0, 100));

    // Extrair mídia se houver
    let mediaUrl = null;
    let mediaType = null;

    if (msg?.imageMessage) {
      mediaType = 'image';
    } else if (msg?.videoMessage) {
      mediaType = 'video';
    } else if (msg?.audioMessage) {
      mediaType = 'audio';
    } else if (msg?.documentMessage) {
      mediaType = 'document';
    }

    // Extrair telefone do JID
    const phone = remoteJid.split('@')[0];
    const contactName = messageData.pushName || messageData.senderName || messageData.notifyName || phone;

    console.log('[Evolution Webhook] Telefone:', phone, 'Nome:', contactName);

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
        messageData.key?.id || messageData.id || messageData.messageId,
        JSON.stringify({
          from: messageData.key?.remoteJid || remoteJid,
          timestamp: messageData.messageTimestamp || messageData.timestamp || Date.now(),
          pushName: messageData.pushName || contactName,
          fromMe: messageData.key?.fromMe || false,
          rawPayload: JSON.stringify(req.body).substring(0, 500)
        })
      ]
    );

    const message = messageResult.rows[0];

    console.log('[Evolution Webhook] Mensagem salva com sucesso:', message.id);

    // Atualizar unread_count e last_message_at da conversa
    await conversationsService.updateUnreadCount(conversation.id, 1);
    await query(
      `UPDATE conversations
       SET last_message_at = NOW(),
           status = CASE WHEN status = 'closed' THEN 'open' ELSE status END,
           updated_at = NOW()
       WHERE id = $1`,
      [conversation.id]
    );

    console.log('[Evolution Webhook] Conversa atualizada: unread_count incrementado');

    // Buscar conversa atualizada para enviar via WebSocket
    const updatedConversation = await query(
      `SELECT c.*,
              ch.name as channel_name,
              l.name as lead_name,
              l.phone as lead_phone
       FROM conversations c
       LEFT JOIN channels ch ON c.channel_id = ch.id
       LEFT JOIN leads l ON c.lead_id = l.id
       WHERE c.id = $1`,
      [conversation.id]
    );

    // Emitir evento WebSocket para atualização em tempo real
    const wsService = getWebSocketService();
    if (wsService) {
      console.log('[Evolution Webhook] Emitindo WebSocket para usuário:', channel.user_id);

      // Emitir nova mensagem
      wsService.emitNewMessage(channel.user_id, {
        conversationId: conversation.id,
        message: message,
        conversation: updatedConversation.rows[0] || conversation
      });

      // Emitir atualização do contador de não lidas
      const totalUnreadResult = await query(
        `SELECT SUM(unread_count) as total FROM conversations WHERE user_id = $1`,
        [channel.user_id]
      );
      const totalUnread = parseInt(totalUnreadResult.rows[0]?.total || '0');

      wsService.emitUnreadCountUpdate(channel.user_id, {
        totalUnread,
        conversationId: conversation.id,
        unreadCount: (updatedConversation.rows[0]?.unread_count || 0) + 1
      });

      console.log('[Evolution Webhook] WebSocket emitido com sucesso!');
    } else {
      console.warn('[Evolution Webhook] WebSocket service não disponível');
    }

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
