import { Router } from 'express';
import { query } from '../database/connection';
// INBOX: Importar services para webhook do Evolution
import { ChannelsService } from '../services/channels.service';
import { ConversationsService } from '../services/conversations.service';
import { LeadsService } from '../services/leads.service';
// INBOX: Importar WebSocket service para notificações em tempo real
import { getWebSocketService } from '../services/websocket.service';
// IA: Importar processador de assistentes
import { assistantProcessor } from '../services/assistant-processor.service';
// Webhooks: Importar dispatcher para enviar eventos para webhooks do usuário
import { webhookDispatcher } from '../services/webhook-dispatcher.service';

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

    // Disparar webhook para sistemas externos (n8n, Make, Zapier, etc.)
    webhookDispatcher.dispatchMessageReceived(channel.user_id, {
      channelId: channel.id,
      channelType: 'whatsapp',
      channelName: channel.name,
      conversationId: conversation.id,
      messageId: message.id,
      content: messageContent,
      contactName: contactName,
      contactPhone: phone,
      mediaType: mediaType || undefined,
      mediaUrl: mediaUrl || undefined,
      rawPayload: req.body,
    }).catch(err => console.error('[Evolution Webhook] Erro ao disparar webhook:', err.message));

    // Processar assistente de IA (assíncrono - não bloqueia a resposta)
    if (messageContent && messageContent.trim() && !messageContent.startsWith('[')) {
      assistantProcessor.processIncomingMessage({
        channelId: channel.id,
        channelType: channel.type || 'whatsapp',
        conversationId: conversation.id,
        userId: channel.user_id,
        contactPhone: phone || remoteJid,
        contactName: contactName,
        messageContent: messageContent,
        credentials: channel.credentials
      }).then(replied => {
        if (replied) console.log('[Evolution Webhook] Assistente IA respondeu automaticamente');
      }).catch(err => {
        console.error('[Evolution Webhook] Erro no assistente IA:', err.message);
      });
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

// ═══════════════════════════════════════════════════════════════════════════
// TELEGRAM WEBHOOKS
// ═══════════════════════════════════════════════════════════════════════════

// ✅ Verificação de saúde do webhook Telegram
router.get('/telegram', async (_req, res) => {
  console.log('[Telegram Webhook] GET request received - webhook is accessible');
  res.json({
    success: true,
    message: 'Telegram webhook endpoint is accessible',
    endpoint: '/api/webhooks/telegram',
    timestamp: new Date().toISOString()
  });
});

// ✅ Webhook para receber mensagens do Telegram
router.post('/telegram', async (req, res) => {
  try {
    console.log('[Telegram Webhook] ===== WEBHOOK RECEBIDO =====');
    console.log('[Telegram Webhook] Body:', JSON.stringify(req.body).substring(0, 2000));

    const update = req.body;

    // Telegram envia diferentes tipos de updates
    // Vamos processar apenas mensagens de texto por enquanto
    const message = update.message || update.edited_message;
    
    if (!message) {
      console.log('[Telegram Webhook] Update sem mensagem, ignorando');
      return res.json({ success: true, message: 'No message in update' });
    }

    // Ignorar mensagens de grupos/supergrupos
    if (message.chat.type !== 'private') {
      console.log('[Telegram Webhook] Ignorando mensagem de grupo:', message.chat.type);
      return res.json({ success: true, message: 'Group messages ignored' });
    }

    const chatId = message.chat.id.toString();
    const fromUser = message.from;
    const text = message.text || message.caption || '[Mídia]';
    const contactName = [fromUser.first_name, fromUser.last_name].filter(Boolean).join(' ') || fromUser.username || chatId;

    console.log('[Telegram Webhook] Chat ID:', chatId);
    console.log('[Telegram Webhook] From:', contactName);
    console.log('[Telegram Webhook] Text:', text.substring(0, 100));

    // Encontrar canal pelo bot_id no credentials
    // O bot_id é o ID do bot que recebeu a mensagem (disponível no webhook como update.message.chat.id do bot)
    // Mas como o Telegram não envia o bot_id diretamente, precisamos buscar de outra forma
    // Vamos buscar todos os canais Telegram ativos e verificar se algum corresponde
    
    // Primeiro, tentar encontrar por uma conversa existente
    let channelResult = await query(
      `SELECT DISTINCT c.* FROM channels c
       INNER JOIN conversations conv ON conv.channel_id = c.id
       WHERE c.type = 'telegram'
       AND c.status = 'active'
       AND conv.remote_jid = $1`,
      [chatId]
    );

    // Se não encontrou por conversa, buscar o primeiro canal Telegram ativo
    // (isso funciona quando há apenas um bot configurado)
    if (channelResult.rows.length === 0) {
      console.log('[Telegram Webhook] Nenhuma conversa existente, buscando canal Telegram ativo...');
      channelResult = await query(
        `SELECT * FROM channels 
         WHERE type = 'telegram' 
         AND status = 'active'
         ORDER BY created_at DESC
         LIMIT 1`
      );
    }

    if (channelResult.rows.length === 0) {
      console.warn('[Telegram Webhook] Nenhum canal Telegram ativo encontrado');
      return res.status(404).json({ error: 'No active Telegram channel found' });
    }

    const channel = channelResult.rows[0];
    console.log('[Telegram Webhook] Canal encontrado:', channel.id, 'User:', channel.user_id);

    // Buscar ou criar lead pelo chatId
    let lead = await query(
      `SELECT * FROM leads WHERE user_id = $1 AND telegram_id = $2`,
      [channel.user_id, chatId]
    );

    let leadId: string;

    if (lead.rows.length === 0) {
      // Criar lead automaticamente
      console.log('[Telegram Webhook] Criando novo lead:', contactName);
      const leadResult = await query(
        `INSERT INTO leads (user_id, name, telegram_id, source, status)
         VALUES ($1, $2, $3, 'telegram', 'new')
         RETURNING *`,
        [channel.user_id, contactName, chatId]
      );
      leadId = leadResult.rows[0].id;
    } else {
      leadId = lead.rows[0].id;
    }

    // Buscar ou criar conversa
    const conversation = await conversationsService.findOrCreate(
      channel.user_id,
      channel.id,
      chatId, // contact_identifier
      leadId,
      {
        contact_name: contactName,
        telegram_username: fromUser.username || null
      }
    );

    // Determinar tipo de mídia
    let mediaType = null;
    let mediaUrl = null;

    if (message.photo) {
      mediaType = 'image';
    } else if (message.video) {
      mediaType = 'video';
    } else if (message.audio || message.voice) {
      mediaType = 'audio';
    } else if (message.document) {
      mediaType = 'document';
    } else if (message.sticker) {
      mediaType = 'sticker';
    }

    // Salvar mensagem
    const messageResult = await query(
      `INSERT INTO messages (
        user_id, conversation_id, lead_id, direction, channel, 
        content, media_url, media_type, status, external_id, metadata
      )
       VALUES ($1, $2, $3, 'in', 'telegram', $4, $5, $6, 'delivered', $7, $8)
       RETURNING *`,
      [
        channel.user_id,
        conversation.id,
        leadId,
        text,
        mediaUrl,
        mediaType,
        message.message_id.toString(),
        JSON.stringify({
          chat_id: chatId,
          from: fromUser,
          date: message.date,
          update_id: update.update_id
        })
      ]
    );

    const savedMessage = messageResult.rows[0];
    console.log('[Telegram Webhook] Mensagem salva:', savedMessage.id);

    // Atualizar conversa
    await conversationsService.updateUnreadCount(conversation.id, 1);
    await query(
      `UPDATE conversations
       SET last_message_at = NOW(),
           status = CASE WHEN status = 'closed' THEN 'open' ELSE status END,
           updated_at = NOW()
       WHERE id = $1`,
      [conversation.id]
    );

    // Buscar conversa atualizada
    const updatedConversation = await query(
      `SELECT c.*,
              ch.name as channel_name,
              l.name as lead_name
       FROM conversations c
       LEFT JOIN channels ch ON c.channel_id = ch.id
       LEFT JOIN leads l ON c.lead_id = l.id
       WHERE c.id = $1`,
      [conversation.id]
    );

    // Emitir WebSocket
    const wsService = getWebSocketService();
    if (wsService) {
      console.log('[Telegram Webhook] Emitindo WebSocket para usuário:', channel.user_id);

      wsService.emitNewMessage(channel.user_id, {
        conversationId: conversation.id,
        message: savedMessage,
        conversation: updatedConversation.rows[0] || conversation
      });

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

      console.log('[Telegram Webhook] WebSocket emitido!');
    }

    // Disparar webhook para sistemas externos (n8n, Make, Zapier, etc.)
    webhookDispatcher.dispatchMessageReceived(channel.user_id, {
      channelId: channel.id,
      channelType: 'telegram',
      channelName: channel.name,
      conversationId: conversation.id,
      messageId: savedMessage.id,
      content: text || '[Mídia]',
      contactName: contactName,
      contactPhone: chatId,
      rawPayload: req.body,
    }).catch(err => console.error('[Telegram Webhook] Erro ao disparar webhook:', err.message));

    // Processar assistente de IA (assíncrono)
    if (text && text.trim()) {
      assistantProcessor.processIncomingMessage({
        channelId: channel.id,
        channelType: 'telegram',
        conversationId: conversation.id,
        userId: channel.user_id,
        contactPhone: chatId,
        contactName: contactName,
        messageContent: text,
        credentials: channel.credentials
      }).then(replied => {
        if (replied) console.log('[Telegram Webhook] Assistente IA respondeu');
      }).catch(err => {
        console.error('[Telegram Webhook] Erro no assistente IA:', err.message);
      });
    }

    // Telegram espera resposta 200 OK
    res.json({ success: true, message_id: savedMessage.id });
  } catch (error) {
    console.error('[Telegram Webhook] Erro:', error);
    // Sempre retornar 200 para o Telegram não reenviar
    res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// INSTAGRAM WEBHOOKS
// ═══════════════════════════════════════════════════════════════════════════

// ✅ Verificação de webhook do Instagram (GET para validação do Facebook)
router.get('/instagram', async (req, res) => {
  console.log('[Instagram Webhook] GET request - webhook verification');

  // Facebook envia um desafio para verificar o webhook
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Token de verificação (pode ser configurado no .env)
  const verifyToken = process.env.INSTAGRAM_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN || 'leadsflow_verify_token';

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[Instagram Webhook] Verificação bem-sucedida');
    return res.status(200).send(challenge);
  }

  // Se não é verificação, retornar info do endpoint
  res.json({
    success: true,
    message: 'Instagram webhook endpoint is accessible',
    endpoint: '/api/webhooks/instagram',
    timestamp: new Date().toISOString()
  });
});

// ✅ Webhook para receber mensagens do Instagram (Meta Graph API)
router.post('/instagram', async (req, res) => {
  try {
    console.log('[Instagram Webhook] ===== WEBHOOK RECEBIDO =====');
    console.log('[Instagram Webhook] Body:', JSON.stringify(req.body).substring(0, 2000));

    const body = req.body;

    // Instagram/Meta envia webhooks com estrutura específica
    // Formato: { object: 'instagram', entry: [...] }
    if (body.object !== 'instagram') {
      console.log('[Instagram Webhook] Objeto não é instagram:', body.object);
      return res.sendStatus(200);
    }

    // Processar cada entrada
    for (const entry of body.entry || []) {
      const instagramId = entry.id; // ID da conta Instagram Business

      console.log('[Instagram Webhook] Processing entry for Instagram ID:', instagramId);

      // Processar mensagens (messaging)
      for (const messagingEvent of entry.messaging || []) {
        const senderId = messagingEvent.sender?.id;
        const recipientId = messagingEvent.recipient?.id;
        const timestamp = messagingEvent.timestamp;
        const message = messagingEvent.message;

        // Ignorar se não tem mensagem ou se é echo (mensagem enviada por nós)
        if (!message || message.is_echo) {
          console.log('[Instagram Webhook] Ignorando: sem mensagem ou é echo');
          continue;
        }

        console.log('[Instagram Webhook] Mensagem de:', senderId);
        console.log('[Instagram Webhook] Para:', recipientId);
        console.log('[Instagram Webhook] Conteúdo:', message.text?.substring(0, 100));

        // Encontrar canal pelo instagram_id nas credentials
        const channelResult = await query(
          `SELECT * FROM channels
           WHERE type = 'instagram'
           AND status = 'active'
           AND (credentials->>'instagram_id' = $1 OR credentials->>'instagram_id' = $2)`,
          [recipientId, instagramId]
        );

        if (channelResult.rows.length === 0) {
          console.warn('[Instagram Webhook] Canal não encontrado para Instagram ID:', recipientId || instagramId);
          continue;
        }

        const channel = channelResult.rows[0];
        console.log('[Instagram Webhook] Canal encontrado:', channel.id, 'User:', channel.user_id);

        // Extrair conteúdo da mensagem
        let messageContent = message.text || '';
        let mediaType = null;
        let mediaUrl = null;

        // Verificar anexos (imagens, vídeos, etc.)
        if (message.attachments && message.attachments.length > 0) {
          const attachment = message.attachments[0];
          mediaUrl = attachment.payload?.url;

          switch (attachment.type) {
            case 'image':
              mediaType = 'image';
              if (!messageContent) messageContent = '[Imagem]';
              break;
            case 'video':
              mediaType = 'video';
              if (!messageContent) messageContent = '[Vídeo]';
              break;
            case 'audio':
              mediaType = 'audio';
              if (!messageContent) messageContent = '[Áudio]';
              break;
            case 'file':
              mediaType = 'document';
              if (!messageContent) messageContent = '[Arquivo]';
              break;
            default:
              if (!messageContent) messageContent = '[Mídia]';
          }
        }

        // Buscar informações do remetente via Graph API (opcional)
        let contactName = senderId;
        try {
          const credentials = channel.credentials;
          if (credentials?.access_token) {
            const userResponse = await fetch(
              `https://graph.facebook.com/v18.0/${senderId}?fields=username,name&access_token=${credentials.access_token}`
            );
            const userData = await userResponse.json();
            if (userData.username || userData.name) {
              contactName = userData.username || userData.name;
            }
          }
        } catch (e) {
          console.log('[Instagram Webhook] Não foi possível obter info do usuário:', e);
        }

        // Buscar ou criar lead pelo instagram_id
        let lead = await query(
          `SELECT * FROM leads WHERE user_id = $1 AND instagram_id = $2`,
          [channel.user_id, senderId]
        );

        let leadId: string;

        if (lead.rows.length === 0) {
          // Criar lead automaticamente
          console.log('[Instagram Webhook] Criando novo lead:', contactName);
          const leadResult = await query(
            `INSERT INTO leads (user_id, name, instagram_id, source, status)
             VALUES ($1, $2, $3, 'instagram', 'new')
             RETURNING *`,
            [channel.user_id, contactName, senderId]
          );
          leadId = leadResult.rows[0].id;
        } else {
          leadId = lead.rows[0].id;
        }

        // Buscar ou criar conversa
        const conversation = await conversationsService.findOrCreate(
          channel.user_id,
          channel.id,
          senderId, // Usando senderId como remote_jid para Instagram
          leadId,
          {
            contact_name: contactName,
            instagram_id: senderId
          }
        );

        // Salvar mensagem
        const messageResult = await query(
          `INSERT INTO messages (
            user_id, conversation_id, lead_id, direction, channel,
            content, media_url, media_type, status, external_id, metadata
          )
           VALUES ($1, $2, $3, 'in', 'instagram', $4, $5, $6, 'delivered', $7, $8)
           RETURNING *`,
          [
            channel.user_id,
            conversation.id,
            leadId,
            messageContent,
            mediaUrl,
            mediaType,
            message.mid || `ig_${timestamp}`,
            JSON.stringify({
              sender_id: senderId,
              recipient_id: recipientId,
              timestamp: timestamp,
              instagram_id: instagramId
            })
          ]
        );

        const savedMessage = messageResult.rows[0];
        console.log('[Instagram Webhook] Mensagem salva:', savedMessage.id);

        // Atualizar conversa
        await conversationsService.updateUnreadCount(conversation.id, 1);
        await query(
          `UPDATE conversations
           SET last_message_at = NOW(),
               status = CASE WHEN status = 'closed' THEN 'open' ELSE status END,
               updated_at = NOW()
           WHERE id = $1`,
          [conversation.id]
        );

        // Buscar conversa atualizada
        const updatedConversation = await query(
          `SELECT c.*,
                  ch.name as channel_name,
                  l.name as lead_name
           FROM conversations c
           LEFT JOIN channels ch ON c.channel_id = ch.id
           LEFT JOIN leads l ON c.lead_id = l.id
           WHERE c.id = $1`,
          [conversation.id]
        );

        // Emitir WebSocket
        const wsService = getWebSocketService();
        if (wsService) {
          console.log('[Instagram Webhook] Emitindo WebSocket para usuário:', channel.user_id);

          wsService.emitNewMessage(channel.user_id, {
            conversationId: conversation.id,
            message: savedMessage,
            conversation: updatedConversation.rows[0] || conversation
          });

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

          console.log('[Instagram Webhook] WebSocket emitido!');
        }

        // Disparar webhook para sistemas externos (n8n, Make, Zapier, etc.)
        webhookDispatcher.dispatchMessageReceived(channel.user_id, {
          channelId: channel.id,
          channelType: 'instagram',
          channelName: channel.name,
          conversationId: conversation.id,
          messageId: savedMessage.id,
          content: messageContent,
          contactName: contactName,
          contactPhone: senderId,
          rawPayload: entry,
        }).catch(err => console.error('[Instagram Webhook] Erro ao disparar webhook:', err.message));

        // Processar assistente de IA (assíncrono - não bloqueia a resposta)
        if (messageContent && messageContent.trim() && !messageContent.startsWith('[')) {
          assistantProcessor.processIncomingMessage({
            channelId: channel.id,
            channelType: 'instagram',
            conversationId: conversation.id,
            userId: channel.user_id,
            contactPhone: senderId,
            contactName: contactName,
            messageContent: messageContent,
            credentials: channel.credentials
          }).then(replied => {
            if (replied) console.log('[Instagram Webhook] Assistente IA respondeu automaticamente');
          }).catch(err => {
            console.error('[Instagram Webhook] Erro no assistente IA:', err.message);
          });
        }
      }

      // Processar mudanças (changes) - stories, mentions, etc.
      for (const change of entry.changes || []) {
        console.log('[Instagram Webhook] Change:', change.field, change.value);
        // Por enquanto, apenas logamos - pode ser expandido no futuro
      }
    }

    // Meta/Instagram espera resposta 200 OK
    res.sendStatus(200);
  } catch (error) {
    console.error('[Instagram Webhook] Erro:', error);
    // Sempre retornar 200 para o Meta não reenviar
    res.sendStatus(200);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// WHATSAPP CLOUD API WEBHOOKS (API Oficial da Meta)
// ═══════════════════════════════════════════════════════════════════════════

// ✅ Verificação de webhook do WhatsApp Cloud (GET para validação do Facebook)
router.get('/whatsapp-cloud/:channelId?', async (req, res) => {
  console.log('[WhatsApp Cloud Webhook] GET request - webhook verification');

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Se tem channelId, buscar verify_token específico do canal
  let expectedToken = process.env.WHATSAPP_VERIFY_TOKEN || 'leadflow_verify';

  if (req.params.channelId) {
    try {
      const channelResult = await query(
        `SELECT credentials FROM channels WHERE id = $1`,
        [req.params.channelId]
      );
      if (channelResult.rows[0]?.credentials?.verify_token) {
        expectedToken = channelResult.rows[0].credentials.verify_token;
      }
    } catch (e) {
      console.log('[WhatsApp Cloud Webhook] Could not fetch channel verify token');
    }
  }

  if (mode === 'subscribe' && token === expectedToken) {
    console.log('[WhatsApp Cloud Webhook] Verificação bem-sucedida');
    return res.status(200).send(challenge);
  }

  res.json({
    success: true,
    message: 'WhatsApp Cloud webhook endpoint is accessible',
    endpoint: '/api/webhooks/whatsapp-cloud',
    timestamp: new Date().toISOString()
  });
});

// ✅ Webhook para receber mensagens do WhatsApp Cloud API
router.post('/whatsapp-cloud/:channelId?', async (req, res) => {
  try {
    console.log('[WhatsApp Cloud Webhook] ===== WEBHOOK RECEBIDO =====');
    console.log('[WhatsApp Cloud Webhook] Body:', JSON.stringify(req.body).substring(0, 2000));

    const body = req.body;

    // WhatsApp Cloud envia webhooks com estrutura específica
    if (body.object !== 'whatsapp_business_account') {
      console.log('[WhatsApp Cloud Webhook] Objeto não é whatsapp_business_account:', body.object);
      return res.sendStatus(200);
    }

    // Processar cada entrada
    for (const entry of body.entry || []) {
      const wabaId = entry.id;

      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;

        const value = change.value;
        const phoneNumberId = value.metadata?.phone_number_id;
        const displayPhoneNumber = value.metadata?.display_phone_number;

        // Processar mensagens recebidas
        for (const message of value.messages || []) {
          const senderId = message.from; // Número do remetente
          const messageId = message.id;
          const timestamp = message.timestamp;
          const messageType = message.type;

          // Extrair conteúdo da mensagem
          let messageContent = '';
          let mediaType = null;
          let mediaUrl = null;

          switch (messageType) {
            case 'text':
              messageContent = message.text?.body || '';
              break;
            case 'image':
              mediaType = 'image';
              messageContent = message.image?.caption || '[Imagem]';
              break;
            case 'video':
              mediaType = 'video';
              messageContent = message.video?.caption || '[Vídeo]';
              break;
            case 'audio':
              mediaType = 'audio';
              messageContent = '[Áudio]';
              break;
            case 'document':
              mediaType = 'document';
              messageContent = message.document?.filename || '[Documento]';
              break;
            case 'sticker':
              mediaType = 'sticker';
              messageContent = '[Sticker]';
              break;
            case 'location':
              messageContent = `[Localização: ${message.location?.latitude}, ${message.location?.longitude}]`;
              break;
            case 'contacts':
              messageContent = '[Contato]';
              break;
            default:
              messageContent = `[${messageType}]`;
          }

          // Encontrar canal pelo phone_number_id
          let channelResult;
          if (req.params.channelId) {
            channelResult = await query(
              `SELECT * FROM channels WHERE id = $1 AND status = 'active'`,
              [req.params.channelId]
            );
          } else {
            channelResult = await query(
              `SELECT * FROM channels
               WHERE type = 'whatsapp_cloud'
               AND status = 'active'
               AND credentials->>'phone_number_id' = $1`,
              [phoneNumberId]
            );
          }

          if (channelResult.rows.length === 0) {
            console.warn('[WhatsApp Cloud Webhook] Canal não encontrado para phone_number_id:', phoneNumberId);
            continue;
          }

          const channel = channelResult.rows[0];
          console.log('[WhatsApp Cloud Webhook] Canal encontrado:', channel.id, 'User:', channel.user_id);

          // Obter nome do contato
          let contactName = senderId;
          const contacts = value.contacts || [];
          if (contacts.length > 0 && contacts[0].profile?.name) {
            contactName = contacts[0].profile.name;
          }

          // Buscar ou criar lead
          const phone = senderId.replace(/\D/g, '');
          let lead = await query(
            `SELECT * FROM leads WHERE user_id = $1 AND (phone = $2 OR whatsapp = $2)`,
            [channel.user_id, phone]
          );

          let leadId: string;

          if (lead.rows.length === 0) {
            console.log('[WhatsApp Cloud Webhook] Criando novo lead:', contactName);
            const leadResult = await query(
              `INSERT INTO leads (user_id, name, phone, whatsapp, source, status)
               VALUES ($1, $2, $3, $3, 'whatsapp_cloud', 'new')
               RETURNING *`,
              [channel.user_id, contactName, phone]
            );
            leadId = leadResult.rows[0].id;
          } else {
            leadId = lead.rows[0].id;
          }

          // Buscar ou criar conversa
          const remoteJid = `${senderId}@s.whatsapp.net`;
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
             VALUES ($1, $2, $3, 'in', 'whatsapp_cloud', $4, $5, $6, 'delivered', $7, $8)
             RETURNING *`,
            [
              channel.user_id,
              conversation.id,
              leadId,
              messageContent,
              mediaUrl,
              mediaType,
              messageId,
              JSON.stringify({
                phone_number_id: phoneNumberId,
                waba_id: wabaId,
                from: senderId,
                timestamp: timestamp,
                message_type: messageType
              })
            ]
          );

          const savedMessage = messageResult.rows[0];
          console.log('[WhatsApp Cloud Webhook] Mensagem salva:', savedMessage.id);

          // Atualizar conversa
          await conversationsService.updateUnreadCount(conversation.id, 1);
          await query(
            `UPDATE conversations
             SET last_message_at = NOW(),
                 status = CASE WHEN status = 'closed' THEN 'open' ELSE status END,
                 updated_at = NOW()
             WHERE id = $1`,
            [conversation.id]
          );

          // Emitir WebSocket
          const wsService = getWebSocketService();
          if (wsService) {
            const updatedConversation = await query(
              `SELECT c.*, ch.name as channel_name, l.name as lead_name
               FROM conversations c
               LEFT JOIN channels ch ON c.channel_id = ch.id
               LEFT JOIN leads l ON c.lead_id = l.id
               WHERE c.id = $1`,
              [conversation.id]
            );

            wsService.emitNewMessage(channel.user_id, {
              conversationId: conversation.id,
              message: savedMessage,
              conversation: updatedConversation.rows[0] || conversation
            });

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

            console.log('[WhatsApp Cloud Webhook] WebSocket emitido!');
          }

          // Disparar webhook para sistemas externos (n8n, Make, Zapier, etc.)
          webhookDispatcher.dispatchMessageReceived(channel.user_id, {
            channelId: channel.id,
            channelType: 'whatsapp_cloud',
            channelName: channel.name,
            conversationId: conversation.id,
            messageId: savedMessage.id,
            content: messageContent,
            contactName: contactName,
            contactPhone: phone || senderId,
            mediaType: mediaType || undefined,
            rawPayload: message,
          }).catch(err => console.error('[WhatsApp Cloud Webhook] Erro ao disparar webhook:', err.message));

          // Processar assistente de IA (assíncrono - não bloqueia a resposta)
          if (messageContent && messageContent.trim() && !messageContent.startsWith('[')) {
            assistantProcessor.processIncomingMessage({
              channelId: channel.id,
              channelType: 'whatsapp_cloud',
              conversationId: conversation.id,
              userId: channel.user_id,
              contactPhone: phone || senderId,
              contactName: contactName,
              messageContent: messageContent,
              credentials: channel.credentials
            }).then(replied => {
              if (replied) console.log('[WhatsApp Cloud Webhook] Assistente IA respondeu automaticamente');
            }).catch(err => {
              console.error('[WhatsApp Cloud Webhook] Erro no assistente IA:', err.message);
            });
          }
        }

        // Processar status de mensagem (delivered, read)
        for (const status of value.statuses || []) {
          console.log('[WhatsApp Cloud Webhook] Status update:', status.status, 'for message:', status.id);
          // Atualizar status da mensagem no banco se necessário
          if (status.status === 'delivered' || status.status === 'read') {
            await query(
              `UPDATE messages SET status = $1, updated_at = NOW() WHERE external_id = $2`,
              [status.status, status.id]
            );
          }
        }
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('[WhatsApp Cloud Webhook] Erro:', error);
    res.sendStatus(200);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// WEBSITE WIDGET WEBHOOKS (Chat embed para sites)
// ═══════════════════════════════════════════════════════════════════════════

// ✅ Receber mensagens do widget de chat do site
router.post('/website/:channelId', async (req, res) => {
  try {
    console.log('[Website Widget Webhook] ===== MENSAGEM RECEBIDA =====');
    console.log('[Website Widget Webhook] Body:', JSON.stringify(req.body).substring(0, 1000));

    const { channelId } = req.params;
    const { visitorId, visitorName, visitorEmail, message, pageUrl, userAgent } = req.body;

    if (!channelId || !message) {
      return res.status(400).json({ error: 'channelId and message are required' });
    }

    // Buscar canal
    const channelResult = await query(
      `SELECT * FROM channels WHERE id = $1 AND type = 'website' AND status = 'active'`,
      [channelId]
    );

    if (channelResult.rows.length === 0) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const channel = channelResult.rows[0];

    // Buscar ou criar lead pelo visitorId/email
    let lead = null;
    if (visitorEmail) {
      const leadResult = await query(
        `SELECT * FROM leads WHERE user_id = $1 AND email = $2`,
        [channel.user_id, visitorEmail]
      );
      lead = leadResult.rows[0];
    }

    if (!lead && visitorId) {
      const leadResult = await query(
        `SELECT * FROM leads WHERE user_id = $1 AND metadata->>'visitor_id' = $2`,
        [channel.user_id, visitorId]
      );
      lead = leadResult.rows[0];
    }

    let leadId: string;

    if (!lead) {
      // Criar novo lead
      const contactName = visitorName || visitorEmail || `Visitante ${visitorId?.substring(0, 8) || 'Anônimo'}`;
      const leadResult = await query(
        `INSERT INTO leads (user_id, name, email, source, status, metadata)
         VALUES ($1, $2, $3, 'website', 'new', $4)
         RETURNING *`,
        [
          channel.user_id,
          contactName,
          visitorEmail || null,
          JSON.stringify({ visitor_id: visitorId, page_url: pageUrl, user_agent: userAgent })
        ]
      );
      leadId = leadResult.rows[0].id;
    } else {
      leadId = lead.id;
    }

    // Buscar ou criar conversa
    const remoteJid = visitorId || visitorEmail || `web_${Date.now()}`;
    const conversation = await conversationsService.findOrCreate(
      channel.user_id,
      channel.id,
      remoteJid,
      leadId,
      {
        contact_name: visitorName || visitorEmail || 'Visitante',
        visitor_id: visitorId
      }
    );

    // Salvar mensagem
    const messageResult = await query(
      `INSERT INTO messages (
        user_id, conversation_id, lead_id, direction, channel,
        content, status, metadata
      )
       VALUES ($1, $2, $3, 'in', 'website', $4, 'delivered', $5)
       RETURNING *`,
      [
        channel.user_id,
        conversation.id,
        leadId,
        message,
        JSON.stringify({ page_url: pageUrl, user_agent: userAgent, visitor_id: visitorId })
      ]
    );

    const savedMessage = messageResult.rows[0];

    // Atualizar conversa
    await conversationsService.updateUnreadCount(conversation.id, 1);
    await query(
      `UPDATE conversations
       SET last_message_at = NOW(),
           status = CASE WHEN status = 'closed' THEN 'open' ELSE status END,
           updated_at = NOW()
       WHERE id = $1`,
      [conversation.id]
    );

    // Emitir WebSocket
    const wsService = getWebSocketService();
    if (wsService) {
      const updatedConversation = await query(
        `SELECT c.*, ch.name as channel_name, l.name as lead_name
         FROM conversations c
         LEFT JOIN channels ch ON c.channel_id = ch.id
         LEFT JOIN leads l ON c.lead_id = l.id
         WHERE c.id = $1`,
        [conversation.id]
      );

      wsService.emitNewMessage(channel.user_id, {
        conversationId: conversation.id,
        message: savedMessage,
        conversation: updatedConversation.rows[0] || conversation
      });
    }

    res.json({
      success: true,
      conversationId: conversation.id,
      messageId: savedMessage.id
    });
  } catch (error) {
    console.error('[Website Widget Webhook] Erro:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ✅ Obter mensagens de uma conversa do widget (para o visitante)
router.get('/website/:channelId/messages', async (req, res) => {
  try {
    const { channelId } = req.params;
    const { visitorId, conversationId } = req.query;

    if (!channelId || (!visitorId && !conversationId)) {
      return res.status(400).json({ error: 'channelId and visitorId or conversationId are required' });
    }

    let conversation;
    if (conversationId) {
      const result = await query(
        `SELECT c.* FROM conversations c
         JOIN channels ch ON c.channel_id = ch.id
         WHERE c.id = $1 AND ch.id = $2`,
        [conversationId, channelId]
      );
      conversation = result.rows[0];
    } else {
      const result = await query(
        `SELECT c.* FROM conversations c
         JOIN channels ch ON c.channel_id = ch.id
         WHERE ch.id = $1 AND c.remote_jid = $2`,
        [channelId, visitorId]
      );
      conversation = result.rows[0];
    }

    if (!conversation) {
      return res.json({ messages: [] });
    }

    const messagesResult = await query(
      `SELECT id, content, direction, created_at, media_url, media_type
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC
       LIMIT 100`,
      [conversation.id]
    );

    res.json({
      conversationId: conversation.id,
      messages: messagesResult.rows
    });
  } catch (error) {
    console.error('[Website Widget] Erro ao buscar mensagens:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// EMAIL WEBHOOKS
// ═══════════════════════════════════════════════════════════════════════════

// ✅ Receber emails via webhook (para integração com serviços de email)
router.post('/email/:channelId', async (req, res) => {
  try {
    console.log('[Email Webhook] ===== EMAIL RECEBIDO =====');
    console.log('[Email Webhook] Body:', JSON.stringify(req.body).substring(0, 1000));

    const { channelId } = req.params;
    const { from, to, subject, text, html, messageId, attachments } = req.body;

    if (!channelId || !from) {
      return res.status(400).json({ error: 'channelId and from are required' });
    }

    // Buscar canal
    const channelResult = await query(
      `SELECT * FROM channels WHERE id = $1 AND type = 'email' AND status = 'active'`,
      [channelId]
    );

    if (channelResult.rows.length === 0) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const channel = channelResult.rows[0];

    // Extrair email e nome do remetente
    const emailMatch = from.match(/<(.+)>/) || [null, from];
    const senderEmail = emailMatch[1] || from;
    const senderName = from.replace(/<.+>/, '').trim() || senderEmail;

    // Buscar ou criar lead pelo email
    let lead = await query(
      `SELECT * FROM leads WHERE user_id = $1 AND email = $2`,
      [channel.user_id, senderEmail]
    );

    let leadId: string;

    if (lead.rows.length === 0) {
      const leadResult = await query(
        `INSERT INTO leads (user_id, name, email, source, status)
         VALUES ($1, $2, $3, 'email', 'new')
         RETURNING *`,
        [channel.user_id, senderName, senderEmail]
      );
      leadId = leadResult.rows[0].id;
    } else {
      leadId = lead.rows[0].id;
    }

    // Buscar ou criar conversa
    const conversation = await conversationsService.findOrCreate(
      channel.user_id,
      channel.id,
      senderEmail,
      leadId,
      {
        contact_name: senderName,
        email: senderEmail
      }
    );

    // Preparar conteúdo da mensagem
    const content = text || html?.replace(/<[^>]*>/g, '') || '[Sem conteúdo]';
    const fullContent = subject ? `**${subject}**\n\n${content}` : content;

    // Salvar mensagem
    const messageResult = await query(
      `INSERT INTO messages (
        user_id, conversation_id, lead_id, direction, channel,
        content, status, external_id, metadata
      )
       VALUES ($1, $2, $3, 'in', 'email', $4, 'delivered', $5, $6)
       RETURNING *`,
      [
        channel.user_id,
        conversation.id,
        leadId,
        fullContent.substring(0, 10000),
        messageId || null,
        JSON.stringify({
          from: from,
          to: to,
          subject: subject,
          has_attachments: attachments?.length > 0 || false
        })
      ]
    );

    const savedMessage = messageResult.rows[0];

    // Atualizar conversa
    await conversationsService.updateUnreadCount(conversation.id, 1);
    await query(
      `UPDATE conversations
       SET last_message_at = NOW(),
           status = CASE WHEN status = 'closed' THEN 'open' ELSE status END,
           updated_at = NOW()
       WHERE id = $1`,
      [conversation.id]
    );

    // Emitir WebSocket
    const wsService = getWebSocketService();
    if (wsService) {
      const updatedConversation = await query(
        `SELECT c.*, ch.name as channel_name, l.name as lead_name
         FROM conversations c
         LEFT JOIN channels ch ON c.channel_id = ch.id
         LEFT JOIN leads l ON c.lead_id = l.id
         WHERE c.id = $1`,
        [conversation.id]
      );

      wsService.emitNewMessage(channel.user_id, {
        conversationId: conversation.id,
        message: savedMessage,
        conversation: updatedConversation.rows[0] || conversation
      });
    }

    res.json({ success: true, messageId: savedMessage.id });
  } catch (error) {
    console.error('[Email Webhook] Erro:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
