import { Router } from 'express';
import { query } from '../database/connection';
// INBOX: Importar services para webhook do Evolution
import { ChannelsService } from '../services/channels.service';
import { ConversationsService } from '../services/conversations.service';
import { LeadsService } from '../services/leads.service';
import { WhatsAppService } from '../services/whatsapp.service';
// Lead Tracking: Importar serviço de rastreamento de leads
import { leadTrackingService } from '../services/lead-tracking.service';
// INBOX: Importar WebSocket service para notificações em tempo real
import { getWebSocketService } from '../services/websocket.service';
// IA: Importar processador de assistentes
import { assistantProcessor } from '../services/assistant-processor.service';
// Webhooks: Importar dispatcher para enviar eventos para webhooks do usuário
import { webhookDispatcher } from '../services/webhook-dispatcher.service';
// Storage: Importar para upload de mídia recebida
import { getStorageService } from '../services/storage.service';

const router = Router();
const channelsService = new ChannelsService();
const conversationsService = new ConversationsService();
const leadsService = new LeadsService();
const whatsappService = new WhatsAppService();

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
      `INSERT INTO leads (user_id, name, phone, email, company, status, source, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       RETURNING *`,
      [
        userId,
        nome,
        telefone || null,
        email || null,
        empresa || null,
        (status || 'novo').toLowerCase().trim() === 'new' ? 'novo' : (status || 'novo').toLowerCase().trim(),
        origem || 'n8n',
        observacoes || null
      ]
    );

    const newLead = result.rows[0];
    console.log('[N8N Webhook] Lead criado com sucesso:', newLead.id);

    // 🎯 Registrar captura de lead via N8N
    try {
      await leadTrackingService.recordLeadCapture(
        userId, newLead.id, null as any, origem || 'n8n',
        { contact_name: nome, phone: telefone, email: email, source: 'n8n' }
      );
      console.log('[N8N Webhook] ✅ Captura de lead registrada');
    } catch (trackErr) {
      console.error('[N8N Webhook] ⚠️ Erro ao registrar captura:', trackErr);
    }

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
    console.log('\n' + '='.repeat(80));
    console.log('[Evolution Webhook] ===== WEBHOOK RECEBIDO EM:', new Date().toISOString(), '=====');
    console.log('='.repeat(80));
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

    // Detectar se é mensagem enviada pelo próprio usuário (fromMe)
    // NÃO ignoramos mais automaticamente - verificamos se já existe no banco
    // Respostas feitas pelo celular vêm como fromMe=true mas não foram salvas pela dashboard
    const isFromMe = messageData.key?.fromMe === true || messageData.fromMe === true;
    const externalMsgId = messageData.key?.id || messageData.id || messageData.messageId;

    if (isFromMe && externalMsgId) {
      // Verificar se esta mensagem já foi salva pela dashboard (envio pelo sistema)
      const existingMsg = await query(
        `SELECT id FROM messages WHERE external_id = $1 LIMIT 1`,
        [externalMsgId]
      );
      if (existingMsg.rows.length > 0) {
        console.log('[Evolution Webhook] Mensagem fromMe já existe no banco (enviada pela dashboard), ignorando:', externalMsgId);
        return res.json({ success: true, message: 'Outgoing message already saved' });
      }
      console.log('[Evolution Webhook] Mensagem fromMe nova (enviada pelo celular), processando:', externalMsgId);
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

    // Desempacotar mensagens com caption wrapper do WhatsApp
    // Quando um documento/imagem/vídeo é enviado com legenda, o WhatsApp encapsula em *WithCaptionMessage
    if (msg?.documentWithCaptionMessage?.message?.documentMessage) {
      console.log('[Evolution Webhook] Desempacotando documentWithCaptionMessage');
      msg.documentMessage = msg.documentWithCaptionMessage.message.documentMessage;
    }
    if (msg?.imageWithCaptionMessage?.message?.imageMessage) {
      console.log('[Evolution Webhook] Desempacotando imageWithCaptionMessage');
      msg.imageMessage = msg.imageWithCaptionMessage.message.imageMessage;
    }
    if (msg?.videoWithCaptionMessage?.message?.videoMessage) {
      console.log('[Evolution Webhook] Desempacotando videoWithCaptionMessage');
      msg.videoMessage = msg.videoWithCaptionMessage.message.videoMessage;
    }

    const messageContent = msg?.conversation ||
      msg?.extendedTextMessage?.text ||
      msg?.imageMessage?.caption ||
      msg?.videoMessage?.caption ||
      msg?.documentMessage?.caption ||
      msg?.documentWithCaptionMessage?.message?.documentMessage?.caption ||
      msg?.text ||
      msg?.body ||
      msg?.content ||
      '[Mídia]';

    console.log('[Evolution Webhook] Conteúdo extraído:', messageContent.substring(0, 100));

    // Extrair mídia se houver
    let mediaUrl: string | null = null;
    let mediaType: string | null = null;
    let mediaBase64: string | null = null;
    let mediaMimetype: string | null = null;

    // Verificar diferentes locais onde a mídia pode estar no payload do Evolution API
    if (msg?.imageMessage) {
      mediaType = 'image';
      mediaMimetype = msg.imageMessage.mimetype || 'image/jpeg';
      mediaBase64 = msg.imageMessage.base64 || null;
      mediaUrl = msg.imageMessage.url || null;
    } else if (msg?.videoMessage) {
      mediaType = 'video';
      mediaMimetype = msg.videoMessage.mimetype || 'video/mp4';
      mediaBase64 = msg.videoMessage.base64 || null;
      mediaUrl = msg.videoMessage.url || null;
    } else if (msg?.audioMessage) {
      mediaType = 'audio';
      mediaMimetype = msg.audioMessage.mimetype || 'audio/ogg';
      mediaBase64 = msg.audioMessage.base64 || null;
      mediaUrl = msg.audioMessage.url || null;
    } else if (msg?.documentMessage) {
      mediaMimetype = msg.documentMessage.mimetype || 'application/octet-stream';
      // Arquivos enviados pela opção "Documento" do WhatsApp podem ser imagens, vídeos, etc.
      // Classificar pelo mimetype real em vez de sempre marcar como 'document'
      if (mediaMimetype.startsWith('image/')) {
        mediaType = 'image';
      } else if (mediaMimetype.startsWith('video/')) {
        mediaType = 'video';
      } else if (mediaMimetype.startsWith('audio/')) {
        mediaType = 'audio';
      } else {
        mediaType = 'document';
      }
      mediaBase64 = msg.documentMessage.base64 || null;
      mediaUrl = msg.documentMessage.url || null;
      console.log('[Evolution Webhook] documentMessage detectado - mimetype:', mediaMimetype, 'mediaType classificado:', mediaType, 'fileName:', msg.documentMessage.fileName || msg.documentMessage.title);
    } else if (msg?.stickerMessage) {
      mediaType = 'sticker';
      mediaMimetype = msg.stickerMessage.mimetype || 'image/webp';
      mediaBase64 = msg.stickerMessage.base64 || null;
      mediaUrl = msg.stickerMessage.url || null;
    }

    // Evolution API v2 pode colocar base64 em diversos locais dependendo da versão
    // Tentar todos os locais possíveis se não encontramos base64 ainda
    if (!mediaBase64 && mediaType) {
      mediaBase64 =
        msg?.base64 ||                          // msg.base64 (Evolution v2 coloca aqui com webhook_base64=true)
        messageData.media?.base64 ||            // messageData.media.base64
        messageData.base64 ||                   // messageData.base64
        messageData.base64Media ||              // messageData.base64Media
        body.base64 ||                          // body.base64
        body.data?.base64 ||                    // body.data.base64
        null;
      if (mediaBase64) {
        console.log('[Evolution Webhook] Base64 encontrado em fallback, tamanho:', mediaBase64.length);
      }
    }

    // Fallback URL: tentar vários locais
    if (!mediaUrl && mediaType) {
      mediaUrl =
        messageData.media?.url ||
        messageData.mediaUrl ||
        messageData.media_url ||
        null;
    }

    // Fallback: tentar extrair de messageData.media se não detectou tipo ainda
    if (!mediaBase64 && !mediaUrl && !mediaType && messageData.media) {
      mediaBase64 = messageData.media.base64 || null;
      mediaUrl = messageData.media.url || null;
      if (messageData.media.mimetype) {
        mediaMimetype = messageData.media.mimetype;
        if (messageData.media.mimetype.startsWith('image')) mediaType = 'image';
        else if (messageData.media.mimetype.startsWith('video')) mediaType = 'video';
        else if (messageData.media.mimetype.startsWith('audio')) mediaType = 'audio';
        else mediaType = 'document';
      }
    }

    // Detectar messageType do payload para garantir que não perdemos mídia
    const messageType = messageData.messageType || messageData.type;
    if (!mediaType && messageType) {
      const typeMap: Record<string, string> = {
        'imageMessage': 'image', 'videoMessage': 'video', 'audioMessage': 'audio',
        'documentMessage': 'document', 'stickerMessage': 'sticker'
      };
      if (typeMap[messageType]) {
        mediaType = typeMap[messageType];
        console.log('[Evolution Webhook] Tipo de mídia detectado via messageType:', mediaType);
      }
    }

    console.log('[Evolution Webhook] Mídia pré-upload:', {
      mediaType, hasBase64: !!mediaBase64, base64Len: mediaBase64?.length || 0, hasUrl: !!mediaUrl
    });

    // Se temos base64, fazer upload para MinIO para ter uma URL persistente
    if (mediaBase64 && mediaType) {
      try {
        const storageService = getStorageService();
        // Limpar prefixo data:...;base64, se presente
        const cleanBase64 = mediaBase64.replace(/^data:[^;]+;base64,/, '');
        const buffer = Buffer.from(cleanBase64, 'base64');

        // Gerar extensão baseada no mimetype
        const extMap: Record<string, string> = {
          'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
          'video/mp4': 'mp4', 'video/webm': 'webm',
          'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/webm': 'webm',
          'application/pdf': 'pdf',
        };
        const ext = extMap[mediaMimetype || ''] || (mediaType === 'image' ? 'jpg' : mediaType === 'audio' ? 'ogg' : 'bin');
        const filename = `whatsapp_${mediaType}_${Date.now()}.${ext}`;

        mediaUrl = await storageService.uploadBuffer(
          buffer,
          filename,
          mediaMimetype || 'application/octet-stream',
          'inbox-media',
          channel.user_id
        );
        console.log('[Evolution Webhook] Mídia uploaded para storage:', mediaUrl?.substring(0, 100));
      } catch (uploadErr) {
        console.error('[Evolution Webhook] Erro ao fazer upload da mídia:', uploadErr);
        // Fallback: guardar base64 completo como data URI (sem truncar)
        const cleanBase64 = mediaBase64.replace(/^data:[^;]+;base64,/, '');
        mediaUrl = `data:${mediaMimetype || 'application/octet-stream'};base64,${cleanBase64}`;
        console.log('[Evolution Webhook] Usando data URI como fallback, tamanho:', mediaUrl.length);
      }
    }

    // Se só temos directPath ou URL do CDN do WhatsApp (não acessível diretamente), limpar para tentar fallback
    if (mediaUrl && !mediaUrl.startsWith('data:')) {
      // URLs do CDN do WhatsApp (mmg.whatsapp.net, pps.whatsapp.net) são criptografadas e não funcionam diretamente
      // directPaths (/v/t62/...) também não são acessíveis
      const isWhatsAppCdnUrl = mediaUrl.includes('mmg.whatsapp.net') || mediaUrl.includes('pps.whatsapp.net') || mediaUrl.includes('.whatsapp.net/');
      const isDirectPath = !mediaUrl.startsWith('http');
      if (isDirectPath || isWhatsAppCdnUrl) {
        console.warn('[Evolution Webhook] URL de mídia não acessível (CDN/directPath):', mediaUrl?.substring(0, 100));
        mediaUrl = null;
      }
    }

    // Se não temos URL válida mas temos mediaType, tentar baixar da Evolution API
    if (!mediaUrl && mediaType) {
      const evolutionUrl = process.env.EVOLUTION_API_URL;
      const apiKey = process.env.EVOLUTION_API_KEY;
      const msgKey = messageData.key;
      if (evolutionUrl && apiKey && instance && msgKey) {
        try {
          console.log('[Evolution Webhook] Tentando baixar mídia via Evolution API...');
          const mediaResponse = await fetch(`${evolutionUrl}/chat/getBase64FromMediaMessage/${instance}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
            body: JSON.stringify({ message: { key: msgKey } })
          });
          if (mediaResponse.ok) {
            const mediaData = await mediaResponse.json();
            const fetchedBase64 = mediaData.base64 || mediaData.data?.base64;
            if (fetchedBase64) {
              console.log('[Evolution Webhook] Mídia baixada via API, tamanho:', fetchedBase64.length);
              const storageService = getStorageService();
              const cleanB64 = fetchedBase64.replace(/^data:[^;]+;base64,/, '');
              const buffer = Buffer.from(cleanB64, 'base64');
              const extMap2: Record<string, string> = {
                'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
                'video/mp4': 'mp4', 'video/webm': 'webm',
                'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/webm': 'webm',
                'application/pdf': 'pdf',
              };
              const ext = extMap2[mediaMimetype || ''] || (mediaType === 'image' ? 'jpg' : mediaType === 'audio' ? 'ogg' : mediaType === 'video' ? 'mp4' : 'bin');
              const filename = `whatsapp_${mediaType}_${Date.now()}.${ext}`;
              mediaUrl = await storageService.uploadBuffer(buffer, filename, mediaMimetype || 'application/octet-stream', 'inbox-media', channel.user_id);
              console.log('[Evolution Webhook] Mídia (via API) uploaded:', mediaUrl?.substring(0, 100));
            }
          }
        } catch (dlErr: any) {
          console.warn('[Evolution Webhook] Falha ao baixar mídia via Evolution API:', dlErr.message);
        }
      }

      // Último fallback: se ainda não temos URL, guardar referência para o documento
      // com informações do arquivo no metadata para exibição no frontend
      if (!mediaUrl && msg?.documentMessage) {
        const docFileName = msg.documentMessage.fileName || msg.documentMessage.title || 'arquivo';
        console.log('[Evolution Webhook] Mídia não disponível, salvando referência do documento:', docFileName);
      }
    }

    console.log('[Evolution Webhook] Mídia final:', { mediaType, hasUrl: !!mediaUrl });

    // Extrair telefone do JID
    const phone = remoteJid.split('@')[0];
    const contactName = messageData.pushName || messageData.senderName || messageData.notifyName || phone;

    console.log('[Evolution Webhook] Telefone:', phone, 'Nome:', contactName);

    // Buscar foto de perfil via Evolution API
    let waProfilePic: string | null = null;
    try {
      const instanceName = instance;
      if (instanceName) {
        waProfilePic = await whatsappService.fetchProfilePicture(instanceName, remoteJid);
        if (waProfilePic) {
          console.log('[Evolution Webhook] ✅ Foto de perfil encontrada');
        }
      }
    } catch (e) {
      console.log('[Evolution Webhook] Não foi possível obter foto de perfil:', e);
    }

    // Buscar ou criar lead
    let lead = await query(
      `SELECT * FROM leads WHERE user_id = $1 AND (phone = $2 OR whatsapp = $2)`,
      [channel.user_id, phone]
    );

    let leadId: string;
    let isNewLead = false;

    if (lead.rows.length === 0) {
      // Criar lead automaticamente
      console.log('[Evolution Webhook] Criando novo lead:', contactName, phone);
      const leadResult = await query(
        `INSERT INTO leads (user_id, name, phone, whatsapp, source, status, avatar_url)
         VALUES ($1, $2, $3, $3, 'whatsapp', 'novo', $4)
         RETURNING *`,
        [channel.user_id, contactName, phone, waProfilePic]
      );
      leadId = leadResult.rows[0].id;
      isNewLead = true;

      // 🎯 Registrar captura de lead
      try {
        await leadTrackingService.recordLeadCapture(
          channel.user_id,
          leadId,
          channel.id,
          'whatsapp',
          {
            contact_name: contactName,
            phone: phone,
            initial_message: messageContent.substring(0, 100)
          }
        );
        console.log('[Evolution Webhook] ✅ Captura de lead registrada');
      } catch (trackErr) {
        console.error('[Evolution Webhook] ⚠️ Erro ao registrar captura:', trackErr);
      }
    } else {
      leadId = lead.rows[0].id;
      // Atualizar avatar se mudou ou não existia
      if (waProfilePic && lead.rows[0].avatar_url !== waProfilePic) {
        await query(
          `UPDATE leads SET avatar_url = $1 WHERE id = $2`,
          [waProfilePic, leadId]
        );
      }
    }

    // Buscar ou criar conversa
    const conversation = await conversationsService.findOrCreate(
      channel.user_id,
      channel.id,
      remoteJid,
      leadId,
      {
        contact_name: contactName,
        phone: phone,
        profile_picture: waProfilePic
      }
    );

    console.log('[Evolution Webhook] 💬 Conversa processada:');
    console.log('[Evolution Webhook]   - ID:', conversation.id);
    console.log('[Evolution Webhook]   - Lead:', leadId);
    console.log('[Evolution Webhook]   - Nova:', isNewLead);

    // Determinar direção da mensagem: fromMe = 'out' (resposta pelo celular), caso contrário = 'in'
    const messageDirection = isFromMe ? 'out' : 'in';
    const messageStatus = isFromMe ? 'sent' : 'delivered';

    // Salvar mensagem
    const messageResult = await query(
      `INSERT INTO messages (
        user_id, conversation_id, lead_id, direction, channel,
        content, media_url, media_type, status, external_id, metadata
      )
       VALUES ($1, $2, $3, $4, 'whatsapp', $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        channel.user_id,
        conversation.id,
        leadId,
        messageDirection,
        messageContent,
        mediaUrl,
        mediaType,
        messageStatus,
        messageData.key?.id || messageData.id || messageData.messageId,
        JSON.stringify({
          from: messageData.key?.remoteJid || remoteJid,
          timestamp: messageData.messageTimestamp || messageData.timestamp || Date.now(),
          pushName: messageData.pushName || contactName,
          fromMe: isFromMe,
          source: isFromMe ? 'phone' : 'contact',
          fileName: msg?.documentMessage?.fileName || msg?.documentMessage?.title || undefined,
          mimetype: mediaMimetype || undefined,
          rawPayload: JSON.stringify(req.body).substring(0, 500)
        })
      ]
    );

    const message = messageResult.rows[0];

    console.log('[Evolution Webhook] ✅✅✅ MENSAGEM SALVA COM SUCESSO ✅✅✅');
    console.log('[Evolution Webhook] ID:', message.id);
    console.log('[Evolution Webhook] Conversa ID:', conversation.id);
    console.log('[Evolution Webhook] Direção:', messageDirection);
    console.log('[Evolution Webhook] Conteúdo:', messageContent.substring(0, 50));
    console.log('[Evolution Webhook] Status:', message.status);
    console.log('[Evolution Webhook] Lead ID:', leadId);
    console.log('[Evolution Webhook] Channel:', message.channel);
    console.log('='.repeat(80));

    // 💬 Registrar interação do lead
    try {
      await leadTrackingService.recordInteraction(
        channel.user_id,
        leadId,
        messageDirection === 'in' ? 'message_received' : 'message_sent',
        {
          conversationId: conversation.id,
          channelId: channel.id,
          direction: messageDirection,
          content: messageContent.substring(0, 200),
          details: {
            media_type: mediaType || null,
            has_media: !!mediaUrl,
            message_id: message.id,
            from: messageDirection === 'in' ? 'contact' : 'user'
          }
        }
      );
    } catch (trackErr) {
      console.error('[Evolution Webhook] ⚠️ Erro ao registrar interação:', trackErr);
    }

    // Atualizar last_message_at e unread_count (só incrementa se for mensagem recebida, não enviada)
    if (!isFromMe) {
      await conversationsService.updateUnreadCount(conversation.id, 1);
    }
    await query(
      `UPDATE conversations
       SET last_message_at = NOW(),
           status = CASE WHEN status = 'closed' THEN 'open' ELSE status END,
           updated_at = NOW()
       WHERE id = $1`,
      [conversation.id]
    );

    console.log('[Evolution Webhook] Conversa atualizada:', isFromMe ? 'sem incremento de unread (fromMe)' : 'unread_count incrementado');

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
      console.log('[Evolution Webhook] 📡 Emitindo WebSocket para usuário:', channel.user_id);

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

      console.log('[Evolution Webhook] ✅ WebSocket emitido com sucesso!');
      console.log('[Evolution Webhook]   - Evento: newMessage');
      console.log('[Evolution Webhook]   - Para usuário:', channel.user_id);
      console.log('[Evolution Webhook]   - Conversa:', conversation.id);
      console.log('[Evolution Webhook]   - Unread total:', totalUnread);
    } else {
      console.error('[Evolution Webhook] ❌ WebSocket service NÃO DISPONÍVEL - MENSAGENS NÃO CHEGAM NA DASHBOARD!');
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
router.post('/telegram/:botToken?', async (req, res) => {
  try {
    console.log('[Telegram Webhook] ===== WEBHOOK RECEBIDO =====');
    console.log('[Telegram Webhook] Body:', JSON.stringify(req.body).substring(0, 2000));

    const update = req.body;
    const botTokenParam = req.params.botToken;

    // Telegram envia diferentes tipos de updates
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
    if (botTokenParam) {
      console.log('[Telegram Webhook] Bot token from URL:', botTokenParam.substring(0, 10) + '...');
    }

    let channelResult;

    // 1. Se botToken na URL, buscar canal pelo bot_token nos credentials
    if (botTokenParam) {
      channelResult = await query(
        `SELECT * FROM channels
         WHERE type = 'telegram'
         AND status IN ('active', 'connected')
         AND credentials->>'bot_token' = $1`,
        [botTokenParam]
      );
      if (channelResult.rows.length > 0) {
        console.log('[Telegram Webhook] Canal encontrado pelo bot_token da URL:', channelResult.rows[0].id);
      }
    }

    // 2. Senão, tentar encontrar por conversa existente (com esse chatId)
    if (!channelResult || channelResult.rows.length === 0) {
      channelResult = await query(
        `SELECT DISTINCT c.* FROM channels c
         INNER JOIN conversations conv ON conv.channel_id = c.id
         WHERE c.type = 'telegram'
         AND c.status IN ('active', 'connected')
         AND conv.remote_jid = $1`,
        [chatId]
      );
      if (channelResult.rows.length > 0) {
        console.log('[Telegram Webhook] Canal encontrado por conversa existente:', channelResult.rows[0].id);
      }
    }

    // 3. Fallback: buscar qualquer canal Telegram ativo (só se houver apenas 1)
    if (channelResult.rows.length === 0) {
      console.log('[Telegram Webhook] Nenhuma conversa existente, buscando canal Telegram ativo...');
      channelResult = await query(
        `SELECT * FROM channels
         WHERE type = 'telegram'
         AND status IN ('active', 'connected')
         ORDER BY created_at DESC`
      );
      // Se houver múltiplos canais e nenhum match, logar aviso
      if (channelResult.rows.length > 1) {
        console.warn('[Telegram Webhook] Múltiplos canais Telegram ativos encontrados sem match de bot_token. Usando o mais recente. Canais:', channelResult.rows.map((r: any) => r.id));
      }
      // Usar apenas o primeiro (mais recente)
      if (channelResult.rows.length > 0) {
        channelResult.rows = [channelResult.rows[0]];
      }
    }

    if (channelResult.rows.length === 0) {
      console.warn('[Telegram Webhook] Nenhum canal Telegram ativo encontrado');
      return res.status(404).json({ error: 'No active Telegram channel found' });
    }

    const channel = channelResult.rows[0];
    // Safe-parse credentials
    if (channel.credentials && typeof channel.credentials === 'string') {
      try { channel.credentials = JSON.parse(channel.credentials); } catch (e) { /* ignore */ }
    }
    console.log('[Telegram Webhook] Canal encontrado:', channel.id, 'User:', channel.user_id);

    // Buscar foto de perfil do Telegram
    let tgProfilePic: string | null = null;
    try {
      const botToken = channel.credentials?.bot_token || channel.credentials?.token;
      if (botToken && fromUser.id) {
        const photosResponse = await fetch(
          `https://api.telegram.org/bot${botToken}/getUserProfilePhotos?user_id=${fromUser.id}&limit=1`
        );
        const photosData = await photosResponse.json();
        if (photosData.ok && photosData.result?.photos?.length > 0) {
          // Pegar a menor foto (última no array do primeiro photo set)
          const photoSizes = photosData.result.photos[0];
          const smallPhoto = photoSizes[photoSizes.length > 1 ? 1 : 0]; // Tamanho médio
          if (smallPhoto?.file_id) {
            const fileResponse = await fetch(
              `https://api.telegram.org/bot${botToken}/getFile?file_id=${smallPhoto.file_id}`
            );
            const fileData = await fileResponse.json();
            if (fileData.ok && fileData.result?.file_path) {
              tgProfilePic = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;
              console.log('[Telegram Webhook] ✅ Foto de perfil encontrada');
            }
          }
        }
      }
    } catch (e) {
      console.log('[Telegram Webhook] Não foi possível obter foto de perfil:', e);
    }

    // Buscar ou criar lead pelo chatId (com fallback se coluna telegram_id não existe)
    let leadId: string;
    try {
      let lead = await query(
        `SELECT * FROM leads WHERE user_id = $1 AND telegram_id = $2`,
        [channel.user_id, chatId]
      );

      if (lead.rows.length === 0) {
        console.log('[Telegram Webhook] Criando novo lead:', contactName);
        const leadResult = await query(
          `INSERT INTO leads (user_id, name, telegram_id, source, status, avatar_url)
           VALUES ($1, $2, $3, 'telegram', 'novo', $4)
           RETURNING *`,
          [channel.user_id, contactName, chatId, tgProfilePic]
        );
        leadId = leadResult.rows[0].id;

        // 🎯 Registrar captura de lead via Telegram
        try {
          await leadTrackingService.recordLeadCapture(
            channel.user_id, leadId, channel.id, 'telegram',
            { contact_name: contactName, chat_id: chatId, initial_message: 'Nova conversa Telegram' }
          );
          console.log('[Telegram Webhook] ✅ Captura de lead registrada');
        } catch (trackErr) {
          console.error('[Telegram Webhook] ⚠️ Erro ao registrar captura:', trackErr);
        }
      } else {
        leadId = lead.rows[0].id;
        // Atualizar nome e avatar
        if (lead.rows[0].name !== contactName || (tgProfilePic && lead.rows[0].avatar_url !== tgProfilePic)) {
          await query(
            `UPDATE leads SET name = $1, avatar_url = COALESCE($3, avatar_url) WHERE id = $2`,
            [contactName, leadId, tgProfilePic]
          );
        }
      }
    } catch (colErr: any) {
      console.warn('[Telegram Webhook] telegram_id column not available, using fallback');
      let lead = await query(
        `SELECT * FROM leads WHERE user_id = $1 AND name = $2 AND source = 'telegram' LIMIT 1`,
        [channel.user_id, contactName]
      );
      if (lead.rows.length === 0) {
        const leadResult = await query(
          `INSERT INTO leads (user_id, name, source, status, avatar_url)
           VALUES ($1, $2, 'telegram', 'novo', $3)
           RETURNING *`,
          [channel.user_id, contactName, tgProfilePic]
        );
        leadId = leadResult.rows[0].id;

        // 🎯 Registrar captura de lead via Telegram (fallback)
        try {
          await leadTrackingService.recordLeadCapture(
            channel.user_id, leadId, channel.id, 'telegram',
            { contact_name: contactName, initial_message: 'Nova conversa Telegram' }
          );
          console.log('[Telegram Webhook] ✅ Captura de lead registrada (fallback)');
        } catch (trackErr) {
          console.error('[Telegram Webhook] ⚠️ Erro ao registrar captura:', trackErr);
        }
      } else {
        leadId = lead.rows[0].id;
      }
    }

    // Buscar ou criar conversa
    const conversation = await conversationsService.findOrCreate(
      channel.user_id,
      channel.id,
      chatId, // contact_identifier
      leadId,
      {
        contact_name: contactName,
        telegram_username: fromUser.username || null,
        profile_picture: tgProfilePic
      }
    );

    // Determinar tipo de mídia e fazer download via Telegram Bot API
    let mediaType: string | null = null;
    let mediaUrl: string | null = null;
    let fileId: string | null = null;

    if (message.photo) {
      mediaType = 'image';
      // photo é um array de tamanhos, pegar o maior (último)
      fileId = message.photo[message.photo.length - 1]?.file_id;
    } else if (message.video) {
      mediaType = 'video';
      fileId = message.video.file_id;
    } else if (message.audio) {
      mediaType = 'audio';
      fileId = message.audio.file_id;
    } else if (message.voice) {
      mediaType = 'audio';
      fileId = message.voice.file_id;
    } else if (message.document) {
      mediaType = 'document';
      fileId = message.document.file_id;
    } else if (message.sticker) {
      mediaType = 'sticker';
      fileId = message.sticker.file_id;
    } else if (message.video_note) {
      mediaType = 'video';
      fileId = message.video_note.file_id;
    }

    // Se tem mídia, baixar via Telegram Bot API e fazer upload para storage
    if (fileId && mediaType) {
      const botToken = channel.credentials?.bot_token || channel.credentials?.token;
      if (botToken) {
        try {
          // 1. Obter file_path via getFile
          const fileResponse = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
          const fileData: any = await fileResponse.json();

          if (fileData.ok && fileData.result?.file_path) {
            // 2. Baixar o arquivo
            const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;
            const mediaResponse = await fetch(downloadUrl);

            if (mediaResponse.ok) {
              const buffer = Buffer.from(await mediaResponse.arrayBuffer());
              const contentType = mediaResponse.headers.get('content-type') || 'application/octet-stream';

              // 3. Determinar extensão
              const extParts = fileData.result.file_path.split('.');
              const ext = extParts.length > 1 ? extParts[extParts.length - 1] : (mediaType === 'image' ? 'jpg' : mediaType === 'audio' ? 'ogg' : 'bin');
              const filename = `telegram_${mediaType}_${Date.now()}.${ext}`;

              // 4. Upload para storage
              const storageService = getStorageService();
              mediaUrl = await storageService.uploadBuffer(buffer, filename, contentType, 'inbox-media', channel.user_id);
              console.log('[Telegram Webhook] Mídia uploaded:', mediaUrl?.substring(0, 100));
            }
          }
        } catch (mediaErr: any) {
          console.error('[Telegram Webhook] Erro ao baixar mídia:', mediaErr.message);
        }
      } else {
        console.warn('[Telegram Webhook] Sem bot_token para baixar mídia');
      }
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
// FACEBOOK MESSENGER WEBHOOKS
// ═══════════════════════════════════════════════════════════════════════════

// ✅ Verificação de webhook do Facebook Messenger (GET para validação da Meta)
router.get('/facebook', async (req, res) => {
  console.log('[Facebook Webhook] GET request - webhook verification');

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const verifyToken = process.env.FACEBOOK_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN || 'leadsflow_verify_token';

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[Facebook Webhook] Verificação bem-sucedida');
    return res.status(200).send(challenge);
  }

  res.json({
    success: true,
    message: 'Facebook Messenger webhook endpoint is accessible',
    endpoint: '/api/webhooks/facebook',
    timestamp: new Date().toISOString()
  });
});

// ✅ Diagnóstico do webhook do Facebook - retorna status dos canais e subscription
router.get('/facebook/debug', async (req, res) => {
  try {
    // Buscar todos os canais Facebook
    const channelsResult = await query(
      `SELECT id, name, status, credentials, created_at, updated_at
       FROM channels WHERE type = 'facebook' ORDER BY created_at DESC`
    );

    const channels = channelsResult.rows.map((ch: any) => {
      const creds = ch.credentials || {};
      return {
        id: ch.id,
        name: ch.name,
        status: ch.status,
        page_id: creds.page_id || 'N/A',
        page_name: creds.page_name || 'N/A',
        has_token: !!(creds.page_access_token || creds.access_token),
        created_at: ch.created_at,
        updated_at: ch.updated_at
      };
    });

    // Buscar conversas do Facebook
    const convsResult = await query(
      `SELECT c.id, c.remote_jid, c.status, c.channel_id, c.created_at,
              ch.type as channel_type, ch.name as channel_name
       FROM conversations c
       LEFT JOIN channels ch ON c.channel_id = ch.id
       WHERE ch.type = 'facebook'
       ORDER BY c.created_at DESC LIMIT 10`
    );

    // Buscar mensagens do Facebook
    const msgsResult = await query(
      `SELECT id, conversation_id, direction, channel, content, created_at
       FROM messages
       WHERE channel = 'facebook'
       ORDER BY created_at DESC LIMIT 10`
    );

    res.json({
      success: true,
      facebook_channels: channels,
      facebook_conversations: convsResult.rows,
      facebook_messages: msgsResult.rows,
      total_channels: channels.length,
      total_conversations: convsResult.rows.length,
      total_messages: msgsResult.rows.length,
      webhook_url: '/api/webhooks/facebook',
      verify_token: process.env.FACEBOOK_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN || 'leadsflow_verify_token'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ Endpoint de teste: simula uma mensagem do Facebook para verificar o fluxo
router.post('/facebook/test', async (req, res) => {
  try {
    // Buscar primeiro canal Facebook ativo
    const channelResult = await query(
      `SELECT * FROM channels WHERE type = 'facebook' AND status = 'active' ORDER BY created_at DESC LIMIT 1`
    );

    if (channelResult.rows.length === 0) {
      return res.status(404).json({ error: 'Nenhum canal Facebook ativo encontrado. Conecte o Facebook primeiro.' });
    }

    const channel = channelResult.rows[0];
    const pageId = channel.credentials?.page_id || 'test_page';
    const testSenderId = req.body.sender_id || 'test_user_' + Date.now();
    const testMessage = req.body.message || 'Mensagem de teste do Facebook Messenger';

    console.log('[Facebook Test] Simulando mensagem para canal:', channel.id);

    // Criar lead de teste (com fallback se coluna facebook_id não existe)
    let leadId: string;
    try {
      let lead = await query(
        `SELECT * FROM leads WHERE user_id = $1 AND facebook_id = $2`,
        [channel.user_id, testSenderId]
      );
      if (lead.rows.length === 0) {
        const leadResult = await query(
          `INSERT INTO leads (user_id, name, facebook_id, source, status)
           VALUES ($1, $2, $3, 'facebook', 'novo')
           RETURNING *`,
          [channel.user_id, 'Teste Facebook', testSenderId]
        );
        leadId = leadResult.rows[0].id;

        // 🎯 Registrar captura de lead via Facebook (teste)
        try {
          await leadTrackingService.recordLeadCapture(
            channel.user_id, leadId, channel.id, 'facebook',
            { contact_name: 'Teste Facebook', facebook_psid: testSenderId, test: true }
          );
        } catch (trackErr) {
          console.error('[Facebook Test] ⚠️ Erro ao registrar captura:', trackErr);
        }
      } else {
        leadId = lead.rows[0].id;
      }
    } catch (colErr: any) {
      // Fallback: coluna facebook_id pode não existir ainda
      console.log('[Facebook Test] facebook_id column not found, using fallback');
      const leadResult = await query(
        `INSERT INTO leads (user_id, name, source, status)
         VALUES ($1, $2, 'facebook', 'novo')
         RETURNING *`,
        [channel.user_id, 'Teste Facebook']
      );
      leadId = leadResult.rows[0].id;

      // 🎯 Registrar captura de lead via Facebook (teste fallback)
      try {
        await leadTrackingService.recordLeadCapture(
          channel.user_id, leadId, channel.id, 'facebook',
          { contact_name: 'Teste Facebook', test: true }
        );
      } catch (trackErr) {
        console.error('[Facebook Test] ⚠️ Erro ao registrar captura:', trackErr);
      }
    }

    // Criar conversa
    const conversation = await conversationsService.findOrCreate(
      channel.user_id,
      channel.id,
      testSenderId,
      leadId,
      { contact_name: 'Teste Facebook', facebook_psid: testSenderId }
    );

    // Salvar mensagem
    const messageResult = await query(
      `INSERT INTO messages (
        user_id, conversation_id, lead_id, direction, channel,
        content, status, external_id, metadata
      )
       VALUES ($1, $2, $3, 'in', 'facebook', $4, 'delivered', $5, $6)
       RETURNING *`,
      [
        channel.user_id,
        conversation.id,
        leadId,
        testMessage,
        `fb_test_${Date.now()}`,
        JSON.stringify({ test: true, sender_id: testSenderId, page_id: pageId })
      ]
    );

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
      const updatedConv = await query(
        `SELECT c.*, ch.name as channel_name, l.name as lead_name
         FROM conversations c
         LEFT JOIN channels ch ON c.channel_id = ch.id
         LEFT JOIN leads l ON c.lead_id = l.id
         WHERE c.id = $1`,
        [conversation.id]
      );

      wsService.emitNewMessage(channel.user_id, {
        conversationId: conversation.id,
        message: messageResult.rows[0],
        conversation: updatedConv.rows[0] || conversation
      });
    }

    res.json({
      success: true,
      message: 'Mensagem de teste criada com sucesso!',
      channel_id: channel.id,
      channel_name: channel.name,
      conversation_id: conversation.id,
      message_id: messageResult.rows[0].id,
      lead_id: leadId,
      instructions: 'Atualize a página da inbox para ver a mensagem de teste'
    });
  } catch (error: any) {
    console.error('[Facebook Test] Erro:', error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ Webhook para receber mensagens do Facebook Messenger
router.post('/facebook', async (req, res) => {
  try {
    console.log('[Facebook Webhook] ===== WEBHOOK RECEBIDO =====');
    console.log('[Facebook Webhook] Body:', JSON.stringify(req.body).substring(0, 2000));

    const body = req.body;

    // Facebook Messenger envia webhooks com object: 'page'
    if (body.object !== 'page') {
      console.log('[Facebook Webhook] Objeto não é page:', body.object);
      return res.sendStatus(200);
    }

    for (const entry of body.entry || []) {
      const pageId = entry.id;

      console.log('[Facebook Webhook] Processing entry for Page ID:', pageId);

      for (const messagingEvent of entry.messaging || []) {
        const senderId = messagingEvent.sender?.id;
        const recipientId = messagingEvent.recipient?.id;
        const timestamp = messagingEvent.timestamp;
        const message = messagingEvent.message;

        // Ignorar se não tem mensagem ou se é echo (mensagem enviada por nós)
        if (!message || message.is_echo) {
          console.log('[Facebook Webhook] Ignorando: sem mensagem ou é echo');
          continue;
        }

        console.log('[Facebook Webhook] Mensagem de:', senderId);
        console.log('[Facebook Webhook] Para:', recipientId);
        console.log('[Facebook Webhook] Conteúdo:', message.text?.substring(0, 100));

        // Encontrar canal pelo page_id nas credentials (tentar múltiplos campos)
        let channelResult = await query(
          `SELECT * FROM channels
           WHERE type = 'facebook'
           AND status = 'active'
           AND (credentials->>'page_id' = $1 OR credentials->>'page_id' = $2)`,
          [recipientId, pageId]
        );

        // Fallback: buscar qualquer canal Facebook ativo (caso page_id não bata)
        if (channelResult.rows.length === 0) {
          console.log('[Facebook Webhook] Canal não encontrado por page_id, tentando fallback...');
          channelResult = await query(
            `SELECT * FROM channels
             WHERE type = 'facebook'
             AND status = 'active'
             ORDER BY created_at DESC
             LIMIT 1`
          );
        }

        if (channelResult.rows.length === 0) {
          console.warn('[Facebook Webhook] Nenhum canal Facebook ativo encontrado. Page ID:', recipientId || pageId);
          continue;
        }

        const channel = channelResult.rows[0];
        console.log('[Facebook Webhook] Canal encontrado:', channel.id, 'User:', channel.user_id);

        // Extrair conteúdo da mensagem
        let messageContent = message.text || '';
        let mediaType: string | null = null;
        let mediaUrl: string | null = null;

        // Verificar anexos (imagens, vídeos, etc.)
        if (message.attachments && message.attachments.length > 0) {
          const attachment = message.attachments[0];
          mediaUrl = attachment.payload?.url || null;

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
            case 'location':
              if (!messageContent) {
                const coords = attachment.payload?.coordinates;
                messageContent = coords
                  ? `[Localização: ${coords.lat}, ${coords.long}]`
                  : '[Localização]';
              }
              break;
            default:
              if (!messageContent) messageContent = '[Mídia]';
          }
        }

        // Buscar nome e foto do remetente via Graph API
        let contactName = senderId;
        let fbProfilePic: string | null = null;
        try {
          const accessToken = channel.credentials?.page_access_token || channel.credentials?.access_token;
          if (accessToken) {
            const userResponse = await fetch(
              `https://graph.facebook.com/v21.0/${senderId}?fields=first_name,last_name,name,profile_pic&access_token=${accessToken}`
            );
            const userData: any = await userResponse.json();
            console.log('[Facebook Webhook] Graph API response for', senderId, ':', JSON.stringify(userData));
            if (userData.error) {
              console.warn('[Facebook Webhook] ⚠️ Graph API error:', userData.error.message, '| Type:', userData.error.type, '| Code:', userData.error.code);
            } else if (userData.name) {
              contactName = userData.name;
            } else if (userData.first_name) {
              contactName = [userData.first_name, userData.last_name].filter(Boolean).join(' ');
            }
            if (userData.profile_pic) {
              fbProfilePic = userData.profile_pic;
            }
          } else {
            console.warn('[Facebook Webhook] ⚠️ Sem access_token disponível para buscar perfil do usuário');
          }
        } catch (e) {
          console.log('[Facebook Webhook] Não foi possível obter info do usuário:', e);
        }

        // Se o contactName ainda é o ID numérico, usar nome amigável
        if (contactName === senderId) {
          contactName = `Visitante Facebook #${senderId.slice(-4)}`;
          console.log('[Facebook Webhook] ⚠️ Usando nome fallback:', contactName, '(Graph API não retornou nome)');
        }

        // Buscar ou criar lead pelo facebook_id (com fallback se coluna não existe)
        let leadId: string;
        try {
          let lead = await query(
            `SELECT * FROM leads WHERE user_id = $1 AND facebook_id = $2`,
            [channel.user_id, senderId]
          );

          if (lead.rows.length === 0) {
            console.log('[Facebook Webhook] Criando novo lead:', contactName);
            const leadResult = await query(
              `INSERT INTO leads (user_id, name, facebook_id, source, status, avatar_url)
               VALUES ($1, $2, $3, 'facebook', 'novo', $4)
               RETURNING *`,
              [channel.user_id, contactName, senderId, fbProfilePic]
            );
            leadId = leadResult.rows[0].id;

            // 🎯 Registrar captura de lead via Facebook
            try {
              await leadTrackingService.recordLeadCapture(
                channel.user_id, leadId, channel.id, 'facebook',
                { contact_name: contactName, facebook_psid: senderId }
              );
              console.log('[Facebook Webhook] ✅ Captura de lead registrada');
            } catch (trackErr) {
              console.error('[Facebook Webhook] ⚠️ Erro ao registrar captura:', trackErr);
            }
          } else {
            leadId = lead.rows[0].id;
            // Atualizar nome e avatar se mudaram
            if (lead.rows[0].name !== contactName || (fbProfilePic && lead.rows[0].avatar_url !== fbProfilePic)) {
              await query(
                `UPDATE leads SET name = COALESCE(NULLIF($1, $4), name), avatar_url = COALESCE($3, avatar_url) WHERE id = $2`,
                [contactName, leadId, fbProfilePic, senderId]
              );
            }
          }
        } catch (colErr: any) {
          console.warn('[Facebook Webhook] facebook_id column not available, using fallback');
          let lead = await query(
            `SELECT * FROM leads WHERE user_id = $1 AND name = $2 AND source = 'facebook' LIMIT 1`,
            [channel.user_id, contactName]
          );
          if (lead.rows.length === 0) {
            const leadResult = await query(
              `INSERT INTO leads (user_id, name, source, status, avatar_url)
               VALUES ($1, $2, 'facebook', 'novo', $3)
               RETURNING *`,
              [channel.user_id, contactName, fbProfilePic]
            );
            leadId = leadResult.rows[0].id;

            // 🎯 Registrar captura de lead via Facebook (fallback)
            try {
              await leadTrackingService.recordLeadCapture(
                channel.user_id, leadId, channel.id, 'facebook',
                { contact_name: contactName }
              );
              console.log('[Facebook Webhook] ✅ Captura de lead registrada (fallback)');
            } catch (trackErr) {
              console.error('[Facebook Webhook] ⚠️ Erro ao registrar captura:', trackErr);
            }
          } else {
            leadId = lead.rows[0].id;
          }
        }

        // Buscar ou criar conversa
        const conversation = await conversationsService.findOrCreate(
          channel.user_id,
          channel.id,
          senderId, // PSID como remote_jid
          leadId,
          {
            contact_name: contactName,
            facebook_psid: senderId,
            profile_picture: fbProfilePic
          }
        );

        // Salvar mensagem
        const messageResult = await query(
          `INSERT INTO messages (
            user_id, conversation_id, lead_id, direction, channel,
            content, media_url, media_type, status, external_id, metadata
          )
           VALUES ($1, $2, $3, 'in', 'facebook', $4, $5, $6, 'delivered', $7, $8)
           RETURNING *`,
          [
            channel.user_id,
            conversation.id,
            leadId,
            messageContent,
            mediaUrl,
            mediaType,
            message.mid || `fb_${timestamp}`,
            JSON.stringify({
              sender_id: senderId,
              recipient_id: recipientId,
              page_id: pageId,
              timestamp: timestamp
            })
          ]
        );

        const savedMessage = messageResult.rows[0];
        console.log('[Facebook Webhook] Mensagem salva:', savedMessage.id);

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
          console.log('[Facebook Webhook] Emitindo WebSocket para usuário:', channel.user_id);

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

          console.log('[Facebook Webhook] WebSocket emitido!');
        }

        // Disparar webhook para sistemas externos (n8n, Make, Zapier, etc.)
        webhookDispatcher.dispatchMessageReceived(channel.user_id, {
          channelId: channel.id,
          channelType: 'facebook',
          channelName: channel.name,
          conversationId: conversation.id,
          messageId: savedMessage.id,
          content: messageContent,
          contactName: contactName,
          contactPhone: senderId,
          rawPayload: entry,
        }).catch(err => console.error('[Facebook Webhook] Erro ao disparar webhook:', err.message));

        // Processar assistente de IA (assíncrono)
        if (messageContent && messageContent.trim() && !messageContent.startsWith('[')) {
          assistantProcessor.processIncomingMessage({
            channelId: channel.id,
            channelType: 'facebook',
            conversationId: conversation.id,
            userId: channel.user_id,
            contactPhone: senderId,
            contactName: contactName,
            messageContent: messageContent,
            credentials: channel.credentials
          }).then(replied => {
            if (replied) console.log('[Facebook Webhook] Assistente IA respondeu automaticamente');
          }).catch(err => {
            console.error('[Facebook Webhook] Erro no assistente IA:', err.message);
          });
        }
      }
    }

    // Meta espera resposta 200 OK
    res.sendStatus(200);
  } catch (error) {
    console.error('[Facebook Webhook] Erro:', error);
    // Sempre retornar 200 para o Meta não reenviar
    res.sendStatus(200);
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

// ✅ Diagnóstico do webhook do Instagram
router.get('/instagram/debug', async (req, res) => {
  try {
    const channelsResult = await query(
      `SELECT id, name, status, credentials, created_at FROM channels WHERE type = 'instagram' ORDER BY created_at DESC`
    );
    const channels = channelsResult.rows.map((ch: any) => ({
      id: ch.id,
      name: ch.name,
      status: ch.status,
      instagram_id: ch.credentials?.instagram_id || 'N/A',
      username: ch.credentials?.username || 'N/A',
      has_token: !!(ch.credentials?.access_token),
      token_type: ch.credentials?.token_type || 'N/A',
      created_at: ch.created_at
    }));

    const convsResult = await query(
      `SELECT c.id, c.remote_jid, c.status, c.channel_id, c.created_at,
              ch.type as channel_type FROM conversations c
       LEFT JOIN channels ch ON c.channel_id = ch.id
       WHERE ch.type = 'instagram' ORDER BY c.created_at DESC LIMIT 10`
    );

    const msgsResult = await query(
      `SELECT id, conversation_id, direction, channel, content, created_at
       FROM messages WHERE channel = 'instagram' ORDER BY created_at DESC LIMIT 10`
    );

    res.json({
      success: true,
      instagram_channels: channels,
      instagram_conversations: convsResult.rows,
      instagram_messages: msgsResult.rows,
      total_channels: channels.length,
      total_conversations: convsResult.rows.length,
      total_messages: msgsResult.rows.length,
      webhook_url: '/api/webhooks/instagram',
      verify_token: process.env.INSTAGRAM_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN || 'leadsflow_verify_token'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ Endpoint de teste: simula uma mensagem do Instagram
router.post('/instagram/test', async (req, res) => {
  try {
    const channelResult = await query(
      `SELECT * FROM channels WHERE type = 'instagram' AND status = 'active' ORDER BY created_at DESC LIMIT 1`
    );
    if (channelResult.rows.length === 0) {
      return res.status(404).json({ error: 'Nenhum canal Instagram ativo encontrado.' });
    }

    const channel = channelResult.rows[0];
    const testSenderId = req.body.sender_id || 'ig_test_user_' + Date.now();
    const testMessage = req.body.message || 'Mensagem de teste do Instagram';

    let leadId: string;
    try {
      let lead = await query(
        `SELECT * FROM leads WHERE user_id = $1 AND instagram_id = $2`,
        [channel.user_id, testSenderId]
      );
      if (lead.rows.length === 0) {
        const leadResult = await query(
          `INSERT INTO leads (user_id, name, instagram_id, source, status)
           VALUES ($1, $2, $3, 'instagram', 'novo') RETURNING *`,
          [channel.user_id, 'Teste Instagram', testSenderId]
        );
        leadId = leadResult.rows[0].id;

        // 🎯 Registrar captura de lead via Instagram (teste)
        try {
          await leadTrackingService.recordLeadCapture(
            channel.user_id, leadId, channel.id, 'instagram',
            { contact_name: 'Teste Instagram', instagram_id: testSenderId, test: true }
          );
        } catch (trackErr) {
          console.error('[Instagram Test] ⚠️ Erro ao registrar captura:', trackErr);
        }
      } else {
        leadId = lead.rows[0].id;
      }
    } catch {
      const leadResult = await query(
        `INSERT INTO leads (user_id, name, source, status)
         VALUES ($1, $2, 'instagram', 'novo') RETURNING *`,
        [channel.user_id, 'Teste Instagram']
      );
      leadId = leadResult.rows[0].id;

      // 🎯 Registrar captura de lead via Instagram (teste fallback)
      try {
        await leadTrackingService.recordLeadCapture(
          channel.user_id, leadId, channel.id, 'instagram',
          { contact_name: 'Teste Instagram', test: true }
        );
      } catch (trackErr) {
        console.error('[Instagram Test] ⚠️ Erro ao registrar captura:', trackErr);
      }
    }

    const conversation = await conversationsService.findOrCreate(
      channel.user_id, channel.id, testSenderId, leadId,
      { contact_name: 'Teste Instagram', instagram_id: testSenderId }
    );

    const messageResult = await query(
      `INSERT INTO messages (user_id, conversation_id, lead_id, direction, channel, content, status, external_id, metadata)
       VALUES ($1, $2, $3, 'in', 'instagram', $4, 'delivered', $5, $6) RETURNING *`,
      [channel.user_id, conversation.id, leadId, testMessage, `ig_test_${Date.now()}`,
       JSON.stringify({ test: true, sender_id: testSenderId })]
    );

    await conversationsService.updateUnreadCount(conversation.id, 1);
    await query(
      `UPDATE conversations SET last_message_at = NOW(), status = CASE WHEN status = 'closed' THEN 'open' ELSE status END, updated_at = NOW() WHERE id = $1`,
      [conversation.id]
    );

    const wsService = getWebSocketService();
    if (wsService) {
      const updatedConv = await query(
        `SELECT c.*, ch.name as channel_name, l.name as lead_name FROM conversations c
         LEFT JOIN channels ch ON c.channel_id = ch.id LEFT JOIN leads l ON c.lead_id = l.id WHERE c.id = $1`,
        [conversation.id]
      );
      wsService.emitNewMessage(channel.user_id, {
        conversationId: conversation.id,
        message: messageResult.rows[0],
        conversation: updatedConv.rows[0] || conversation
      });
    }

    res.json({
      success: true,
      message: 'Mensagem de teste Instagram criada!',
      channel_id: channel.id,
      conversation_id: conversation.id,
      message_id: messageResult.rows[0].id
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
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
        console.log('[Instagram Webhook] Para (recipient):', recipientId);
        console.log('[Instagram Webhook] Instagram ID da conta:', instagramId);
        console.log('[Instagram Webhook] Conteúdo:', message.text?.substring(0, 100));
        console.log('[Instagram Webhook] Anexos:', message.attachments?.length || 0);

        // Encontrar canal pelo instagram_id nas credentials
        // Primeiro tenta pelo recipient_id (ID da conta que recebe)
        let channelResult = await query(
          `SELECT * FROM channels
           WHERE type = 'instagram'
           AND status = 'active'
           AND credentials->>'instagram_id' = $1`,
          [recipientId]
        );

        // Se não encontrou, tenta pelo instagram_id do entry
        if (channelResult.rows.length === 0) {
          console.log('[Instagram Webhook] Canal não encontrado por recipient_id, tentando por entry.id...');
          channelResult = await query(
            `SELECT * FROM channels
             WHERE type = 'instagram'
             AND status = 'active'
             AND credentials->>'instagram_id' = $1`,
            [instagramId]
          );
        }

        // Fallback: buscar por page_id (se disponível no webhook)
        if (channelResult.rows.length === 0 && entry.id) {
          console.log('[Instagram Webhook] Tentando buscar por page_id...');
          channelResult = await query(
            `SELECT * FROM channels
             WHERE type = 'instagram'
             AND status = 'active'
             AND credentials->>'page_id' = $1`,
            [entry.id]
          );
        }

        if (channelResult.rows.length === 0) {
          console.error('[Instagram Webhook] ❌ Nenhum canal Instagram ativo encontrado!');
          console.error('[Instagram Webhook] Recipient ID:', recipientId);
          console.error('[Instagram Webhook] Entry Instagram ID:', instagramId);
          console.error('[Instagram Webhook] Entry ID:', entry.id);

          // Listar canais existentes para debug
          const allChannels = await query(
            `SELECT id, name, credentials->>'instagram_id' as ig_id, credentials->>'page_id' as page_id
             FROM channels WHERE type = 'instagram' AND status = 'active'`
          );
          console.error('[Instagram Webhook] Canais Instagram ativos:', JSON.stringify(allChannels.rows));
          continue;
        }

        const channel = channelResult.rows[0];
        console.log('[Instagram Webhook] ✅ Canal encontrado:', channel.id, 'User:', channel.user_id, 'Name:', channel.name);

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

        // Buscar informações do remetente via Graph API
        let contactName = senderId;
        let profilePic = null;
        try {
          const credentials = channel.credentials;
          // Preferir page_access_token para Instagram
          const accessToken = credentials?.page_access_token || credentials?.access_token;

          if (accessToken) {
            // Buscar perfil do remetente (IGSID - Instagram Scoped ID)
            const userResponse = await fetch(
              `https://graph.facebook.com/v21.0/${senderId}?fields=name,username,profile_pic&access_token=${accessToken}`
            );
            const userData = await userResponse.json();

            console.log('[Instagram Webhook] User info response:', JSON.stringify(userData));

            if (!userData.error) {
              contactName = userData.username || userData.name || senderId;
              profilePic = userData.profile_pic;
              console.log('[Instagram Webhook] ✅ Nome do contato:', contactName);
            } else {
              console.warn('[Instagram Webhook] ⚠️ Erro ao buscar info do usuário:', userData.error.message, '| Type:', userData.error.type, '| Code:', userData.error.code);
            }
          } else {
            console.warn('[Instagram Webhook] ⚠️ Sem access_token para buscar info do usuário');
          }
        } catch (e) {
          console.log('[Instagram Webhook] Não foi possível obter info do usuário:', e);
        }

        // Se o contactName ainda é o ID numérico, usar nome amigável
        if (contactName === senderId) {
          contactName = `Visitante Instagram #${senderId.slice(-4)}`;
          console.log('[Instagram Webhook] ⚠️ Usando nome fallback:', contactName, '(Graph API não retornou nome)');
        }

        // Buscar ou criar lead pelo instagram_id (com fallback se coluna não existe)
        let leadId: string;
        try {
          let lead = await query(
            `SELECT * FROM leads WHERE user_id = $1 AND instagram_id = $2`,
            [channel.user_id, senderId]
          );

          if (lead.rows.length === 0) {
            console.log('[Instagram Webhook] Criando novo lead:', contactName, 'avatar:', !!profilePic);
            const leadResult = await query(
              `INSERT INTO leads (user_id, name, instagram_id, source, status, avatar_url)
               VALUES ($1, $2, $3, 'instagram', 'novo', $4)
               RETURNING *`,
              [channel.user_id, contactName, senderId, profilePic]
            );
            leadId = leadResult.rows[0].id;

            // 🎯 Registrar captura de lead via Instagram
            try {
              await leadTrackingService.recordLeadCapture(
                channel.user_id, leadId, channel.id, 'instagram',
                { contact_name: contactName, instagram_id: senderId }
              );
              console.log('[Instagram Webhook] ✅ Captura de lead registrada');
            } catch (trackErr) {
              console.error('[Instagram Webhook] ⚠️ Erro ao registrar captura:', trackErr);
            }
          } else {
            leadId = lead.rows[0].id;
            // Atualizar nome e avatar do lead caso tenham mudado
            const nameChanged = contactName !== senderId && lead.rows[0].name !== contactName;
            const avatarChanged = profilePic && lead.rows[0].avatar_url !== profilePic;
            if (nameChanged || avatarChanged) {
              console.log('[Instagram Webhook] Atualizando lead:', {
                name: nameChanged ? `${lead.rows[0].name} -> ${contactName}` : 'sem mudança',
                avatar: avatarChanged ? 'atualizado' : 'sem mudança'
              });
              await query(
                `UPDATE leads SET
                  name = CASE WHEN $1 != $4 THEN $1 ELSE name END,
                  avatar_url = COALESCE($3, avatar_url)
                 WHERE id = $2`,
                [contactName, leadId, profilePic, senderId]
              );
            }
          }
        } catch (colErr: any) {
          console.warn('[Instagram Webhook] instagram_id column not available, using fallback');
          let lead = await query(
            `SELECT * FROM leads WHERE user_id = $1 AND name = $2 AND source = 'instagram' LIMIT 1`,
            [channel.user_id, contactName]
          );
          if (lead.rows.length === 0) {
            const leadResult = await query(
              `INSERT INTO leads (user_id, name, source, status)
               VALUES ($1, $2, 'instagram', 'novo')
               RETURNING *`,
              [channel.user_id, contactName]
            );
            leadId = leadResult.rows[0].id;

            // 🎯 Registrar captura de lead via Instagram (fallback)
            try {
              await leadTrackingService.recordLeadCapture(
                channel.user_id, leadId, channel.id, 'instagram',
                { contact_name: contactName }
              );
              console.log('[Instagram Webhook] ✅ Captura de lead registrada (fallback)');
            } catch (trackErr) {
              console.error('[Instagram Webhook] ⚠️ Erro ao registrar captura:', trackErr);
            }
          } else {
            leadId = lead.rows[0].id;
          }
        }

        // Buscar ou criar conversa
        const conversation = await conversationsService.findOrCreate(
          channel.user_id,
          channel.id,
          senderId, // Usando senderId como remote_jid para Instagram
          leadId,
          {
            contact_name: contactName,
            instagram_id: senderId,
            profile_picture: profilePic
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

// ✅ Debug endpoint para WhatsApp Cloud (DEVE ficar antes da rota com :channelId)
router.get('/whatsapp-cloud/debug', async (req, res) => {
  try {
    const channels = await query(
      `SELECT id, name, type, status,
              credentials->>'phone_number_id' as phone_number_id,
              credentials->>'waba_id' as waba_id,
              credentials->>'verify_token' as verify_token,
              created_at, updated_at
       FROM channels WHERE type = 'whatsapp_cloud'`
    );

    const conversations = await query(
      `SELECT c.id, c.remote_jid, c.status, c.unread_count, c.last_message_at,
              ch.name as channel_name, ch.status as channel_status
       FROM conversations c
       JOIN channels ch ON c.channel_id = ch.id
       WHERE ch.type = 'whatsapp_cloud'
       ORDER BY c.last_message_at DESC NULLS LAST
       LIMIT 20`
    );

    const messages = await query(
      `SELECT m.id, m.direction, m.channel, m.content, m.status, m.created_at, m.conversation_id
       FROM messages m
       WHERE m.channel = 'whatsapp_cloud'
       ORDER BY m.created_at DESC
       LIMIT 20`
    );

    res.json({
      channels: channels.rows,
      conversations: conversations.rows,
      recentMessages: messages.rows,
      webhookUrl: `/api/webhooks/whatsapp-cloud`,
      channelSpecificUrl: channels.rows.length > 0 ? `/api/webhooks/whatsapp-cloud/${channels.rows[0].id}` : null,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

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
      if (channelResult.rows[0]) {
        let creds = channelResult.rows[0].credentials;
        if (typeof creds === 'string') { try { creds = JSON.parse(creds); } catch (e) { /* ignore */ } }
        if (creds?.verify_token) {
          expectedToken = creds.verify_token;
        }
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

          let mediaId: string | null = null;
          let mediaMimetype: string | null = null;

          switch (messageType) {
            case 'text':
              messageContent = message.text?.body || '';
              break;
            case 'image':
              mediaType = 'image';
              mediaId = message.image?.id || null;
              mediaMimetype = message.image?.mime_type || 'image/jpeg';
              messageContent = message.image?.caption || '[Imagem]';
              break;
            case 'video':
              mediaType = 'video';
              mediaId = message.video?.id || null;
              mediaMimetype = message.video?.mime_type || 'video/mp4';
              messageContent = message.video?.caption || '[Vídeo]';
              break;
            case 'audio':
              mediaType = 'audio';
              mediaId = message.audio?.id || null;
              mediaMimetype = message.audio?.mime_type || 'audio/ogg';
              messageContent = '[Áudio]';
              break;
            case 'document':
              mediaType = 'document';
              mediaId = message.document?.id || null;
              mediaMimetype = message.document?.mime_type || 'application/octet-stream';
              messageContent = message.document?.filename || '[Documento]';
              break;
            case 'sticker':
              mediaType = 'sticker';
              mediaId = message.sticker?.id || null;
              mediaMimetype = message.sticker?.mime_type || 'image/webp';
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
            // Buscar por ID do canal (aceitar active ou connected)
            channelResult = await query(
              `SELECT * FROM channels WHERE id = $1 AND status IN ('active', 'connected')`,
              [req.params.channelId]
            );
          }

          if (!channelResult || channelResult.rows.length === 0) {
            // Buscar por phone_number_id nas credenciais
            channelResult = await query(
              `SELECT * FROM channels
               WHERE type = 'whatsapp_cloud'
               AND status IN ('active', 'connected')
               AND credentials->>'phone_number_id' = $1`,
              [phoneNumberId]
            );
          }

          // Fallback: buscar qualquer canal whatsapp_cloud ativo
          if (channelResult.rows.length === 0) {
            console.warn('[WhatsApp Cloud Webhook] Canal não encontrado por phone_number_id:', phoneNumberId, '- tentando fallback...');
            channelResult = await query(
              `SELECT * FROM channels
               WHERE type = 'whatsapp_cloud'
               AND status IN ('active', 'connected')
               ORDER BY updated_at DESC
               LIMIT 1`
            );
          }

          if (channelResult.rows.length === 0) {
            console.warn('[WhatsApp Cloud Webhook] Nenhum canal whatsapp_cloud encontrado! phone_number_id:', phoneNumberId);
            // Listar todos os canais para debug
            const allChannels = await query(`SELECT id, type, status, credentials->>'phone_number_id' as pnid FROM channels WHERE type = 'whatsapp_cloud'`);
            console.warn('[WhatsApp Cloud Webhook] Canais whatsapp_cloud existentes:', JSON.stringify(allChannels.rows));
            continue;
          }

          const channel = channelResult.rows[0];
          // Safe-parse credentials se vier como string
          if (channel.credentials && typeof channel.credentials === 'string') {
            try { channel.credentials = JSON.parse(channel.credentials); } catch (e) { /* ignore */ }
          }
          console.log('[WhatsApp Cloud Webhook] Canal encontrado:', channel.id, 'User:', channel.user_id, 'Status:', channel.status, 'HasCredentials:', !!channel.credentials?.access_token);

          // Baixar mídia via Graph API se tiver mediaId
          if (mediaId && mediaType) {
            const accessToken = channel.credentials?.access_token;
            if (accessToken) {
              try {
                console.log('[WhatsApp Cloud Webhook] Baixando mídia:', mediaId, mediaType);

                // Step 1: Get media URL from Meta Graph API
                const mediaInfoResponse = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
                  headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                const mediaInfo = await mediaInfoResponse.json();

                if (mediaInfo.url) {
                  // Step 2: Download the actual media file
                  const mediaDownloadResponse = await fetch(mediaInfo.url, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                  });

                  if (mediaDownloadResponse.ok) {
                    const arrayBuffer = await mediaDownloadResponse.arrayBuffer();
                    const buffer = Buffer.from(arrayBuffer);

                    // Step 3: Upload to MinIO storage
                    const storageService = getStorageService();
                    const extMap: Record<string, string> = {
                      'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
                      'video/mp4': 'mp4', 'video/3gpp': '3gp',
                      'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac',
                      'application/pdf': 'pdf',
                    };
                    const ext = extMap[mediaMimetype || ''] || (mediaType === 'image' ? 'jpg' : mediaType === 'audio' ? 'ogg' : 'bin');
                    const filename = `cloud_${mediaType}_${Date.now()}.${ext}`;

                    mediaUrl = await storageService.uploadBuffer(
                      buffer, filename,
                      mediaMimetype || 'application/octet-stream',
                      'inbox-media', channel.user_id
                    );
                    console.log('[WhatsApp Cloud Webhook] Mídia uploaded:', mediaUrl?.substring(0, 100));
                  } else {
                    console.warn('[WhatsApp Cloud Webhook] Falha ao baixar mídia:', mediaDownloadResponse.status);
                  }
                } else {
                  console.warn('[WhatsApp Cloud Webhook] Sem URL na resposta do media info:', mediaInfo);
                }
              } catch (mediaErr) {
                console.error('[WhatsApp Cloud Webhook] Erro ao baixar mídia:', mediaErr);
              }
            } else {
              console.warn('[WhatsApp Cloud Webhook] Sem access_token no canal para baixar mídia');
            }
          }

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
               VALUES ($1, $2, $3, $3, 'whatsapp_cloud', 'novo')
               RETURNING *`,
              [channel.user_id, contactName, phone]
            );
            leadId = leadResult.rows[0].id;

            // 🎯 Registrar captura de lead via WhatsApp Cloud
            try {
              await leadTrackingService.recordLeadCapture(
                channel.user_id, leadId, channel.id, 'whatsapp_cloud',
                { contact_name: contactName, phone: phone, initial_message: messageContent?.substring(0, 100) }
              );
              console.log('[WhatsApp Cloud Webhook] ✅ Captura de lead registrada');
            } catch (trackErr) {
              console.error('[WhatsApp Cloud Webhook] ⚠️ Erro ao registrar captura:', trackErr);
            }
          } else {
            leadId = lead.rows[0].id;
            // Atualizar nome se mudou
            if (contactName !== senderId && lead.rows[0].name !== contactName) {
              await query(
                `UPDATE leads SET name = $1 WHERE id = $2`,
                [contactName, leadId]
              );
            }
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
                message_type: messageType,
                media_id: mediaId || undefined
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
         VALUES ($1, $2, $3, 'website', 'novo', $4)
         RETURNING *`,
        [
          channel.user_id,
          contactName,
          visitorEmail || null,
          JSON.stringify({ visitor_id: visitorId, page_url: pageUrl, user_agent: userAgent })
        ]
      );
      leadId = leadResult.rows[0].id;

      // 🎯 Registrar captura de lead via Website
      try {
        await leadTrackingService.recordLeadCapture(
          channel.user_id, leadId, channel.id, 'website',
          { contact_name: contactName, email: visitorEmail, page_url: pageUrl }
        );
        console.log('[Website Widget Webhook] ✅ Captura de lead registrada');
      } catch (trackErr) {
        console.error('[Website Widget Webhook] ⚠️ Erro ao registrar captura:', trackErr);
      }
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
         VALUES ($1, $2, $3, 'email', 'novo')
         RETURNING *`,
        [channel.user_id, senderName, senderEmail]
      );
      leadId = leadResult.rows[0].id;

      // 🎯 Registrar captura de lead via Email
      try {
        await leadTrackingService.recordLeadCapture(
          channel.user_id, leadId, channel.id, 'email',
          { contact_name: senderName, email: senderEmail, subject: subject }
        );
        console.log('[Email Webhook] ✅ Captura de lead registrada');
      } catch (trackErr) {
        console.error('[Email Webhook] ⚠️ Erro ao registrar captura:', trackErr);
      }
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

// ============================================
// ✅ WEBHOOK N8N - VALIDAR NÚMEROS WHATSAPP
// ============================================
/**
 * Valida se números de telefone têm WhatsApp
 * USE ESTE ENDPOINT NO N8N antes de enviar mensagens
 *
 * POST /api/webhooks/n8n/validate-whatsapp
 * Body: {
 *   numbers: string[],       // Lista de números para validar
 *   instanceId: string       // ID da instância WhatsApp (obrigatório)
 * }
 *
 * Response: {
 *   results: [{ number, exists, jid?, name? }],
 *   valid: string[],
 *   invalid: string[],
 *   summary: { total, valid, invalid }
 * }
 */
router.post('/n8n/validate-whatsapp', async (req, res) => {
  try {
    console.log('[N8N Webhook] Validando números WhatsApp:', JSON.stringify(req.body).substring(0, 200));

    const { numbers, instanceId, instanceName } = req.body;

    // Aceitar instanceId ou instanceName
    const instance = instanceId || instanceName;

    if (!instance) {
      return res.status(400).json({
        error: 'instanceId ou instanceName é obrigatório',
        example: {
          numbers: ['+5511999999999'],
          instanceId: 'leadflow_xxx_instance'
        }
      });
    }

    if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
      return res.status(400).json({
        error: 'numbers array é obrigatório',
        example: {
          numbers: ['+5511999999999', '5511888888888'],
          instanceId: 'leadflow_xxx_instance'
        }
      });
    }

    // Limitar para evitar abusos
    if (numbers.length > 100) {
      return res.status(400).json({
        error: 'Máximo 100 números por request via webhook',
        received: numbers.length
      });
    }

    // Verificar se a instância existe no sistema
    const channelResult = await query(
      `SELECT id, user_id FROM channels
       WHERE (credentials->>'instance_id' = $1 OR credentials->>'instance_name' = $1)
       AND type = 'whatsapp'
       LIMIT 1`,
      [instance]
    );

    if (channelResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Instância WhatsApp não encontrada',
        instanceId: instance
      });
    }

    console.log(`[N8N Webhook] Validando ${numbers.length} números via instância: ${instance}`);

    // Validar números
    const result = await whatsappService.checkWhatsAppNumbers(instance, numbers);

    console.log(`[N8N Webhook] Validação completa: ${result.valid.length} válidos, ${result.invalid.length} inválidos`);

    res.json({
      ...result,
      summary: {
        total: numbers.length,
        valid: result.valid.length,
        invalid: result.invalid.length
      },
      instanceId: instance
    });
  } catch (error: any) {
    console.error('[N8N Webhook] Erro ao validar números:', error);
    res.status(500).json({
      error: 'Erro ao validar números',
      message: error.message
    });
  }
});

/**
 * Validar um único número (mais simples para workflows N8N)
 *
 * POST /api/webhooks/n8n/check-whatsapp
 * Body: {
 *   number: string,         // Número para validar
 *   instanceId: string      // ID da instância WhatsApp
 * }
 *
 * Response: {
 *   number: string,
 *   exists: boolean,
 *   jid?: string,
 *   name?: string
 * }
 */
router.post('/n8n/check-whatsapp', async (req, res) => {
  try {
    const { number, instanceId, instanceName } = req.body;
    const instance = instanceId || instanceName;

    if (!instance || !number) {
      return res.status(400).json({
        error: 'number e instanceId são obrigatórios',
        example: {
          number: '+5511999999999',
          instanceId: 'leadflow_xxx_instance'
        }
      });
    }

    // Verificar se instância existe
    const channelResult = await query(
      `SELECT id FROM channels
       WHERE (credentials->>'instance_id' = $1 OR credentials->>'instance_name' = $1)
       AND type = 'whatsapp'
       LIMIT 1`,
      [instance]
    );

    if (channelResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Instância WhatsApp não encontrada',
        instanceId: instance
      });
    }

    console.log(`[N8N Webhook] Verificando número ${number} via instância ${instance}`);

    // Validar número
    const result = await whatsappService.checkWhatsAppNumbers(instance, [number]);

    // Retornar resultado simplificado para um número
    const numberResult = result.results[0];

    res.json({
      number: numberResult?.number || number,
      exists: numberResult?.exists ?? true,
      jid: numberResult?.jid || null,
      name: numberResult?.name || null,
      hasWhatsApp: numberResult?.exists ?? true  // Alias mais legível
    });
  } catch (error: any) {
    console.error('[N8N Webhook] Erro ao verificar número:', error);
    res.status(500).json({
      error: 'Erro ao verificar número',
      message: error.message
    });
  }
});

// ============================================
// ✅ WEBHOOK N8N - REGISTRAR MENSAGEM DE CAMPANHA NO INBOX
// ============================================

/**
 * Registra uma mensagem de campanha no inbox
 * USE ESTE ENDPOINT NO N8N após enviar cada mensagem de campanha
 * Isso cria a conversa e mensagem para aparecer no inbox
 *
 * POST /api/webhooks/n8n/campaign-message
 * Body: {
 *   campaignId: string,      // ID da campanha
 *   campaignName?: string,   // Nome da campanha (opcional)
 *   userId: string,          // ID do usuário dono da campanha
 *   leadId?: string,         // ID do lead (opcional)
 *   phone: string,           // Número do destinatário
 *   leadName?: string,       // Nome do lead (opcional)
 *   message: string,         // Conteúdo da mensagem enviada
 *   instanceId: string,      // ID/nome da instância WhatsApp
 *   mediaUrl?: string,       // URL da mídia (se houver)
 *   mediaType?: string,      // Tipo da mídia (image, video, document)
 *   externalId?: string,     // ID da mensagem no WhatsApp (se disponível)
 *   status?: string          // Status: sent, delivered, failed (default: sent)
 * }
 *
 * Response: {
 *   success: true,
 *   conversationId: string,
 *   messageId: string
 * }
 */
router.post('/n8n/campaign-message', async (req, res) => {
  try {
    console.log('[N8N Campaign] ===== REGISTRANDO MENSAGEM DE CAMPANHA =====');
    console.log('[N8N Campaign] Body:', JSON.stringify(req.body).substring(0, 500));

    const {
      campaignId,
      campaignName,
      userId,
      leadId,
      phone,
      leadName,
      message,
      instanceId,
      instanceName,
      mediaUrl,
      mediaType,
      externalId,
      status = 'sent'
    } = req.body;

    const instance = instanceId || instanceName;

    // Validações obrigatórias
    if (!userId) {
      return res.status(400).json({
        error: 'userId é obrigatório',
        example: { userId: 'uuid-do-usuario', phone: '+5511999999999', message: 'Olá!', instanceId: 'leadflow_xxx' }
      });
    }

    if (!phone) {
      return res.status(400).json({
        error: 'phone é obrigatório',
        example: { userId: 'uuid', phone: '+5511999999999', message: 'Olá!', instanceId: 'leadflow_xxx' }
      });
    }

    if (!message) {
      return res.status(400).json({
        error: 'message é obrigatório',
        example: { userId: 'uuid', phone: '+5511999999999', message: 'Olá!', instanceId: 'leadflow_xxx' }
      });
    }

    if (!instance) {
      return res.status(400).json({
        error: 'instanceId ou instanceName é obrigatório',
        example: { userId: 'uuid', phone: '+5511999999999', message: 'Olá!', instanceId: 'leadflow_xxx' }
      });
    }

    // Buscar canal pelo instanceId
    const channelResult = await query(
      `SELECT * FROM channels
       WHERE (credentials->>'instance_id' = $1 OR credentials->>'instance_name' = $1)
       AND type = 'whatsapp'
       AND user_id = $2
       LIMIT 1`,
      [instance, userId]
    );

    if (channelResult.rows.length === 0) {
      // Tentar buscar qualquer canal WhatsApp do usuário
      const fallbackResult = await query(
        `SELECT * FROM channels WHERE user_id = $1 AND type = 'whatsapp' AND status = 'active' LIMIT 1`,
        [userId]
      );

      if (fallbackResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Canal WhatsApp não encontrado para este usuário',
          userId,
          instanceId: instance
        });
      }
    }

    const channel = channelResult.rows[0] || (await query(
      `SELECT * FROM channels WHERE user_id = $1 AND type = 'whatsapp' AND status = 'active' LIMIT 1`,
      [userId]
    )).rows[0];

    if (!channel) {
      return res.status(404).json({
        error: 'Nenhum canal WhatsApp ativo encontrado',
        userId
      });
    }

    console.log('[N8N Campaign] Canal encontrado:', channel.id);

    // Normalizar número de telefone
    const cleanPhone = phone.replace(/\D/g, '');
    const remoteJid = `${cleanPhone}@s.whatsapp.net`;

    // Buscar ou criar lead se não foi fornecido
    let finalLeadId = leadId;
    let contactName = leadName || cleanPhone;

    if (!finalLeadId) {
      // Buscar lead pelo telefone
      const leadResult = await query(
        `SELECT * FROM leads WHERE user_id = $1 AND (phone = $2 OR whatsapp = $2 OR telefone = $2)`,
        [userId, cleanPhone]
      );

      if (leadResult.rows.length > 0) {
        finalLeadId = leadResult.rows[0].id;
        contactName = leadResult.rows[0].name || leadResult.rows[0].nome || contactName;
      } else {
        // Criar novo lead automaticamente
        console.log('[N8N Campaign] Criando lead para:', cleanPhone);
        const newLeadResult = await query(
          `INSERT INTO leads (user_id, name, phone, whatsapp, source, status)
           VALUES ($1, $2, $3, $3, 'campaign', 'contatado')
           RETURNING *`,
          [userId, contactName, cleanPhone]
        );
        finalLeadId = newLeadResult.rows[0].id;

        // 🎯 Registrar captura de lead via Campanha
        try {
          await leadTrackingService.recordLeadCapture(
            userId, finalLeadId, channel.id, 'campaign',
            { contact_name: contactName, phone: cleanPhone, campaign_id: campaignId, campaign_name: campaignName }
          );
          console.log('[N8N Campaign] ✅ Captura de lead registrada');
        } catch (trackErr) {
          console.error('[N8N Campaign] ⚠️ Erro ao registrar captura:', trackErr);
        }
      }
    }

    console.log('[N8N Campaign] Lead ID:', finalLeadId);

    // Criar ou buscar conversa
    const conversation = await conversationsService.findOrCreate(
      userId,
      channel.id,
      remoteJid,
      finalLeadId,
      {
        contact_name: contactName,
        phone: cleanPhone,
        campaign_id: campaignId,
        campaign_name: campaignName,
        source: 'campaign'
      }
    );

    console.log('[N8N Campaign] Conversa ID:', conversation.id);

    // Criar mensagem
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
        finalLeadId,
        campaignId || null,
        message,
        mediaUrl || null,
        mediaType || null,
        status,
        externalId || null,
        JSON.stringify({
          campaign_id: campaignId,
          campaign_name: campaignName,
          instance_id: instance,
          phone: cleanPhone,
          remote_jid: remoteJid,
          source: 'n8n_campaign'
        })
      ]
    );

    const savedMessage = messageResult.rows[0];
    console.log('[N8N Campaign] Mensagem salva:', savedMessage.id);

    // Atualizar conversa - last_message_at e status
    await query(
      `UPDATE conversations
       SET last_message_at = NOW(),
           status = 'open',
           updated_at = NOW()
       WHERE id = $1`,
      [conversation.id]
    );

    // Buscar conversa atualizada para WebSocket
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

    // Emitir WebSocket para atualizar inbox em tempo real
    const wsService = getWebSocketService();
    if (wsService) {
      console.log('[N8N Campaign] Emitindo WebSocket para usuário:', userId);

      // Emitir nova mensagem
      wsService.emitNewMessage(userId, {
        conversationId: conversation.id,
        message: savedMessage,
        conversation: updatedConversation.rows[0] || conversation
      });

      // Emitir atualização de conversas
      wsService.emitConversationUpdate(userId, {
        conversationId: conversation.id,
        conversation: updatedConversation.rows[0] || conversation
      });

      console.log('[N8N Campaign] WebSocket emitido!');
    }

    // Se houver campaignId, atualizar estatísticas da campanha
    if (campaignId) {
      try {
        await query(
          `UPDATE campaigns
           SET stats = jsonb_set(
             COALESCE(stats, '{"sent":0}'::jsonb),
             '{sent}',
             (COALESCE((stats->>'sent')::int, 0) + 1)::text::jsonb
           ),
           updated_at = NOW()
           WHERE id = $1`,
          [campaignId]
        );
      } catch (e) {
        console.warn('[N8N Campaign] Erro ao atualizar stats da campanha:', e);
      }
    }

    console.log('[N8N Campaign] ✅ Mensagem de campanha registrada com sucesso!');

    res.json({
      success: true,
      conversationId: conversation.id,
      messageId: savedMessage.id,
      leadId: finalLeadId,
      channelId: channel.id
    });
  } catch (error: any) {
    console.error('[N8N Campaign] Erro ao registrar mensagem:', error);
    res.status(500).json({
      error: 'Erro ao registrar mensagem de campanha',
      message: error.message
    });
  }
});

/**
 * Registrar múltiplas mensagens de campanha de uma vez (batch)
 * Útil para registrar todas as mensagens no final do envio
 *
 * POST /api/webhooks/n8n/campaign-messages-batch
 * Body: {
 *   campaignId: string,
 *   campaignName?: string,
 *   userId: string,
 *   instanceId: string,
 *   messages: [
 *     { phone: string, leadId?: string, leadName?: string, message: string, status?: string }
 *   ]
 * }
 */
router.post('/n8n/campaign-messages-batch', async (req, res) => {
  try {
    console.log('[N8N Campaign Batch] ===== REGISTRANDO LOTE DE MENSAGENS =====');

    const {
      campaignId,
      campaignName,
      userId,
      instanceId,
      instanceName,
      messages
    } = req.body;

    const instance = instanceId || instanceName;

    if (!userId || !instance || !messages || !Array.isArray(messages)) {
      return res.status(400).json({
        error: 'userId, instanceId e messages[] são obrigatórios',
        example: {
          userId: 'uuid',
          instanceId: 'leadflow_xxx',
          campaignId: 'uuid-campanha',
          messages: [
            { phone: '+5511999999999', message: 'Olá!' }
          ]
        }
      });
    }

    // Buscar canal
    const channelResult = await query(
      `SELECT * FROM channels
       WHERE (credentials->>'instance_id' = $1 OR credentials->>'instance_name' = $1)
       AND type = 'whatsapp'
       AND user_id = $2
       LIMIT 1`,
      [instance, userId]
    );

    let channel = channelResult.rows[0];

    if (!channel) {
      const fallbackResult = await query(
        `SELECT * FROM channels WHERE user_id = $1 AND type = 'whatsapp' AND status = 'active' LIMIT 1`,
        [userId]
      );
      channel = fallbackResult.rows[0];
    }

    if (!channel) {
      return res.status(404).json({
        error: 'Canal WhatsApp não encontrado',
        userId
      });
    }

    console.log(`[N8N Campaign Batch] Processando ${messages.length} mensagens...`);

    const results: any[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (const msg of messages) {
      try {
        if (!msg.phone || !msg.message) {
          results.push({ phone: msg.phone, success: false, error: 'phone e message são obrigatórios' });
          errorCount++;
          continue;
        }

        const cleanPhone = msg.phone.replace(/\D/g, '');
        const remoteJid = `${cleanPhone}@s.whatsapp.net`;

        // Buscar ou criar lead
        let leadId = msg.leadId;
        let contactName = msg.leadName || cleanPhone;

        if (!leadId) {
          const leadResult = await query(
            `SELECT * FROM leads WHERE user_id = $1 AND (phone = $2 OR whatsapp = $2 OR telefone = $2)`,
            [userId, cleanPhone]
          );

          if (leadResult.rows.length > 0) {
            leadId = leadResult.rows[0].id;
            contactName = leadResult.rows[0].name || leadResult.rows[0].nome || contactName;
          } else {
            const newLeadResult = await query(
              `INSERT INTO leads (user_id, name, phone, whatsapp, source, status)
               VALUES ($1, $2, $3, $3, 'campaign', 'contatado')
               RETURNING *`,
              [userId, contactName, cleanPhone]
            );
            leadId = newLeadResult.rows[0].id;

            // 🎯 Registrar captura de lead via Campanha (batch)
            try {
              await leadTrackingService.recordLeadCapture(
                userId, leadId, channel.id, 'campaign',
                { contact_name: contactName, phone: cleanPhone, campaign_id: campaignId }
              );
            } catch (trackErr) {
              console.error('[N8N Campaign Batch] ⚠️ Erro ao registrar captura:', trackErr);
            }
          }
        }

        // Criar conversa
        const conversation = await conversationsService.findOrCreate(
          userId,
          channel.id,
          remoteJid,
          leadId,
          {
            contact_name: contactName,
            phone: cleanPhone,
            campaign_id: campaignId,
            source: 'campaign'
          }
        );

        // Criar mensagem
        const messageResult = await query(
          `INSERT INTO messages (
            user_id, conversation_id, lead_id, campaign_id, direction, channel,
            content, status, metadata, sent_at
          )
           VALUES ($1, $2, $3, $4, 'out', 'whatsapp', $5, $6, $7, NOW())
           RETURNING *`,
          [
            userId,
            conversation.id,
            leadId,
            campaignId || null,
            msg.message,
            msg.status || 'sent',
            JSON.stringify({
              campaign_id: campaignId,
              campaign_name: campaignName,
              instance_id: instance,
              phone: cleanPhone,
              source: 'n8n_campaign_batch'
            })
          ]
        );

        // Atualizar conversa
        await query(
          `UPDATE conversations SET last_message_at = NOW(), status = 'open', updated_at = NOW() WHERE id = $1`,
          [conversation.id]
        );

        results.push({
          phone: cleanPhone,
          success: true,
          conversationId: conversation.id,
          messageId: messageResult.rows[0].id,
          leadId
        });
        successCount++;
      } catch (e: any) {
        results.push({ phone: msg.phone, success: false, error: e.message });
        errorCount++;
      }
    }

    // Atualizar stats da campanha
    if (campaignId && successCount > 0) {
      try {
        await query(
          `UPDATE campaigns
           SET stats = jsonb_set(
             COALESCE(stats, '{"sent":0}'::jsonb),
             '{sent}',
             (COALESCE((stats->>'sent')::int, 0) + $1)::text::jsonb
           ),
           updated_at = NOW()
           WHERE id = $2`,
          [successCount, campaignId]
        );
      } catch (e) {
        console.warn('[N8N Campaign Batch] Erro ao atualizar stats:', e);
      }
    }

    // Emitir WebSocket para atualizar inbox
    const wsService = getWebSocketService();
    if (wsService) {
      wsService.emitConversationUpdate(userId, {
        type: 'batch_update',
        count: successCount
      });
    }

    console.log(`[N8N Campaign Batch] ✅ Concluído: ${successCount} sucesso, ${errorCount} erros`);

    res.json({
      success: true,
      summary: {
        total: messages.length,
        success: successCount,
        errors: errorCount
      },
      results
    });
  } catch (error: any) {
    console.error('[N8N Campaign Batch] Erro:', error);
    res.status(500).json({
      error: 'Erro ao processar lote de mensagens',
      message: error.message
    });
  }
});

// ✅ Webhook para Telegram Bot
router.post('/telegram/messages', async (req, res) => {
  try {
    console.log('[Telegram Webhook] Received message:', JSON.stringify(req.body).substring(0, 200));
    
    const update = req.body;
    
    // Verificar se é uma mensagem de texto
    if (!update.message || !update.message.text) {
      console.log('[Telegram Webhook] Skipping non-text message');
      return res.json({ ok: true });
    }

    const message = update.message;
    const chatId = message.chat?.id;
    const userId = message.from?.id;
    const firstName = message.from?.first_name || 'User';
    const lastName = message.from?.last_name || '';
    const contactName = `${firstName} ${lastName}`.trim();
    const messageText = message.text;

    if (!chatId || !userId) {
      console.warn('[Telegram Webhook] Missing chatId or userId');
      return res.json({ ok: true });
    }

    // Buscar canal Telegram ativo do usuário (precisamos de informação do usuário da app)
    // Para isso, você precisará passar o userId da aplicação via metadata ou token
    const internalUserId = req.body.internal_user_id || req.headers['x-internal-user-id'];
    
    if (!internalUserId) {
      console.warn('[Telegram Webhook] Missing internal_user_id');
      return res.json({ ok: true });
    }

    // Buscar canal Telegram
    const channelResult = await query(
      `SELECT * FROM channels WHERE type = 'telegram' AND user_id = $1`,
      [internalUserId]
    );

    if (channelResult.rows.length === 0) {
      console.warn('[Telegram Webhook] No Telegram channel found for user:', internalUserId);
      return res.json({ ok: true });
    }

    const channel = channelResult.rows[0];

    // Buscar ou criar lead
    let leadResult = await query(
      `SELECT * FROM leads WHERE user_id = $1 AND (name = $2 OR source = 'telegram')
       LIMIT 1`,
      [internalUserId, contactName]
    );

    let leadId: string;
    let isNewLead = false;

    if (leadResult.rows.length === 0) {
      // Criar novo lead
      const newLeadResult = await query(
        `INSERT INTO leads (user_id, name, source, status)
         VALUES ($1, $2, 'telegram', 'novo')
         RETURNING *`,
        [internalUserId, contactName]
      );
      leadId = newLeadResult.rows[0].id;
      isNewLead = true;

      // Registrar captura
      await leadTrackingService.recordLeadCapture(
        internalUserId,
        leadId,
        channel.id,
        'telegram',
        {
          contact_name: contactName,
          chat_id: chatId,
          initial_message: messageText.substring(0, 100)
        }
      ).catch(err => console.error('[Telegram] Error recording capture:', err));
    } else {
      leadId = leadResult.rows[0].id;
    }

    // Buscar ou criar conversa
    const remoteJid = `${chatId}@telegram`;
    const convResult = await conversationsService.findOrCreate(
      internalUserId,
      channel.id,
      remoteJid,
      leadId,
      {
        contact_name: contactName,
        chat_id: chatId,
        platform: 'telegram'
      }
    );

    // Salvar mensagem
    const msgResult = await query(
      `INSERT INTO messages (
        user_id, conversation_id, lead_id, direction, channel,
        content, status, external_id, metadata
      )
       VALUES ($1, $2, $3, 'in', 'telegram', $4, 'delivered', $5, $6)
       RETURNING *`,
      [
        internalUserId,
        convResult.id,
        leadId,
        messageText,
        `${chatId}_${message.message_id}`,
        JSON.stringify({
          chat_id: chatId,
          user_id: userId,
          message_id: message.message_id,
          timestamp: message.date,
          platform: 'telegram'
        })
      ]
    );

    // Registrar interação
    await leadTrackingService.recordInteraction(
      internalUserId,
      leadId,
      'message_received',
      {
        conversationId: convResult.id,
        channelId: channel.id,
        direction: 'in',
        content: messageText.substring(0, 200),
        details: {
          platform: 'telegram',
          chat_id: chatId,
          message_id: message.message_id
        }
      }
    ).catch(err => console.error('[Telegram] Error recording interaction:', err));

    // Atualizar conversa
    await query(
      `UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [convResult.id]
    );

    console.log('[Telegram Webhook] ✅ Message processed successfully');
    res.json({ ok: true });
  } catch (error: any) {
    console.error('[Telegram Webhook] Error:', error);
    res.json({ ok: true }); // Return ok to prevent retry
  }
});

// ✅ Webhook para Instagram Direct Messages
router.post('/instagram/messages', async (req, res) => {
  try {
    console.log('[Instagram Webhook] Received message:', JSON.stringify(req.body).substring(0, 200));

    const update = req.body;
    const internalUserId = update.internal_user_id || req.headers['x-internal-user-id'];

    if (!internalUserId) {
      console.warn('[Instagram Webhook] Missing internal_user_id');
      return res.json({ ok: true });
    }

    // Buscar canal Instagram
    const channelResult = await query(
      `SELECT * FROM channels WHERE type = 'instagram' AND user_id = $1`,
      [internalUserId]
    );

    if (channelResult.rows.length === 0) {
      console.warn('[Instagram Webhook] No Instagram channel found');
      return res.json({ ok: true });
    }

    const channel = channelResult.rows[0];

    // Extrair dados da mensagem (formato pode variar)
    const senderId = update.sender?.id || update.from_id;
    const senderName = update.sender?.name || update.from_name || 'Instagram User';
    const messageText = update.message?.text || update.text || '';
    const messageId = update.message?.id || update.id;

    if (!senderId || !messageText) {
      console.log('[Instagram Webhook] Skipping non-text message');
      return res.json({ ok: true });
    }

    // Buscar ou criar lead
    let leadResult = await query(
      `SELECT * FROM leads WHERE user_id = $1 AND (name ILIKE $2 OR source = 'instagram')
       LIMIT 1`,
      [internalUserId, `%${senderName}%`]
    );

    let leadId: string;

    if (leadResult.rows.length === 0) {
      const newLeadResult = await query(
        `INSERT INTO leads (user_id, name, source, status)
         VALUES ($1, $2, 'instagram', 'novo')
         RETURNING *`,
        [internalUserId, senderName]
      );
      leadId = newLeadResult.rows[0].id;

      // Registrar captura
      await leadTrackingService.recordLeadCapture(
        internalUserId,
        leadId,
        channel.id,
        'instagram',
        {
          contact_name: senderName,
          sender_id: senderId,
          initial_message: messageText.substring(0, 100)
        }
      ).catch(err => console.error('[Instagram] Error recording capture:', err));
    } else {
      leadId = leadResult.rows[0].id;
    }

    // Buscar ou criar conversa
    const remoteJid = `${senderId}@instagram`;
    const convResult = await conversationsService.findOrCreate(
      internalUserId,
      channel.id,
      remoteJid,
      leadId,
      {
        contact_name: senderName,
        sender_id: senderId,
        platform: 'instagram'
      }
    );

    // Salvar mensagem
    await query(
      `INSERT INTO messages (
        user_id, conversation_id, lead_id, direction, channel,
        content, status, external_id, metadata
      )
       VALUES ($1, $2, $3, 'in', 'instagram', $4, 'delivered', $5, $6)
       RETURNING *`,
      [
        internalUserId,
        convResult.id,
        leadId,
        messageText,
        messageId,
        JSON.stringify({
          sender_id: senderId,
          message_id: messageId,
          platform: 'instagram',
          received_at: new Date().toISOString()
        })
      ]
    );

    // Registrar interação
    await leadTrackingService.recordInteraction(
      internalUserId,
      leadId,
      'message_received',
      {
        conversationId: convResult.id,
        channelId: channel.id,
        direction: 'in',
        content: messageText.substring(0, 200),
        details: {
          platform: 'instagram',
          sender_id: senderId
        }
      }
    ).catch(err => console.error('[Instagram] Error recording interaction:', err));

    // Atualizar conversa
    await query(
      `UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [convResult.id]
    );

    console.log('[Instagram Webhook] ✅ Message processed successfully');
    res.json({ ok: true });
  } catch (error: any) {
    console.error('[Instagram Webhook] Error:', error);
    res.json({ ok: true });
  }
});

// ✅ Webhook para WhatsApp Cloud API
router.post('/whatsapp-cloud/messages', async (req, res) => {
  try {
    console.log('[WhatsApp Cloud Webhook] Received message');

    const update = req.body.entry?.[0]?.changes?.[0]?.value;
    
    if (!update?.messages || update.messages.length === 0) {
      console.log('[WhatsApp Cloud] No messages in webhook');
      return res.json({ received: true });
    }

    const message = update.messages[0];
    const contactInfo = update.contacts?.[0];
    const businessPhoneNumberId = update.metadata?.phone_number_id;
    const internalUserId = req.body.internal_user_id || req.headers['x-internal-user-id'];

    if (!internalUserId) {
      console.warn('[WhatsApp Cloud] Missing internal_user_id');
      return res.json({ received: true });
    }

    // Buscar canal WhatsApp Cloud
    const channelResult = await query(
      `SELECT * FROM channels WHERE type = 'whatsapp_cloud' AND user_id = $1`,
      [internalUserId]
    );

    if (channelResult.rows.length === 0) {
      console.warn('[WhatsApp Cloud] No channel found');
      return res.json({ received: true });
    }

    const channel = channelResult.rows[0];

    const senderPhone = message.from;
    const contactName = contactInfo?.profile?.name || senderPhone;
    const messageText = message.text?.body || message.image?.caption || message.document?.caption || '[Mídia]';

    // Buscar ou criar lead
    let leadResult = await query(
      `SELECT * FROM leads WHERE user_id = $1 AND (phone = $2 OR whatsapp = $2)`,
      [internalUserId, senderPhone]
    );

    let leadId: string;

    if (leadResult.rows.length === 0) {
      const newLeadResult = await query(
        `INSERT INTO leads (user_id, name, phone, whatsapp, source, status)
         VALUES ($1, $2, $3, $3, 'whatsapp_cloud', 'novo')
         RETURNING *`,
        [internalUserId, contactName, senderPhone]
      );
      leadId = newLeadResult.rows[0].id;

      // Registrar captura
      await leadTrackingService.recordLeadCapture(
        internalUserId,
        leadId,
        channel.id,
        'whatsapp_cloud',
        {
          contact_name: contactName,
          phone: senderPhone,
          initial_message: messageText.substring(0, 100)
        }
      ).catch(err => console.error('[WhatsApp Cloud] Error recording capture:', err));
    } else {
      leadId = leadResult.rows[0].id;
    }

    // Buscar ou criar conversa
    const remoteJid = `${senderPhone}@s.whatsapp.net`;
    const convResult = await conversationsService.findOrCreate(
      internalUserId,
      channel.id,
      remoteJid,
      leadId,
      {
        contact_name: contactName,
        phone: senderPhone,
        platform: 'whatsapp_cloud'
      }
    );

    // Salvar mensagem
    await query(
      `INSERT INTO messages (
        user_id, conversation_id, lead_id, direction, channel,
        content, status, external_id, metadata
      )
       VALUES ($1, $2, $3, 'in', 'whatsapp_cloud', $4, 'delivered', $5, $6)
       RETURNING *`,
      [
        internalUserId,
        convResult.id,
        leadId,
        messageText,
        message.id,
        JSON.stringify({
          phone: senderPhone,
          message_type: message.type,
          timestamp: message.timestamp,
          platform: 'whatsapp_cloud'
        })
      ]
    );

    // Registrar interação
    await leadTrackingService.recordInteraction(
      internalUserId,
      leadId,
      'message_received',
      {
        conversationId: convResult.id,
        channelId: channel.id,
        direction: 'in',
        content: messageText.substring(0, 200),
        details: {
          platform: 'whatsapp_cloud',
          phone: senderPhone,
          message_type: message.type
        }
      }
    ).catch(err => console.error('[WhatsApp Cloud] Error recording interaction:', err));

    // Atualizar conversa
    await query(
      `UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [convResult.id]
    );

    console.log('[WhatsApp Cloud] ✅ Message processed successfully');
    res.json({ received: true });
  } catch (error: any) {
    console.error('[WhatsApp Cloud Webhook] Error:', error);
    res.json({ received: true });
  }
});

// ============================================
// TWILIO SMS WEBHOOK
// ============================================
/**
 * POST /api/webhooks/twilio/sms
 * Webhook para receber mensagens SMS do Twilio
 * 
 * Twilio envia:
 * - MessageSid: ID único da mensagem
 * - From: Número do remetente (formato E.164)
 * - To: Seu número Twilio
 * - Body: Conteúdo da mensagem
 * - NumMedia: Número de arquivos de mídia (MMS)
 * - MediaUrl0, MediaUrl1, etc: URLs de mídia
 */
router.post('/twilio/sms', async (req, res) => {
  try {
    console.log('[Twilio SMS Webhook] ========== RECEIVED ==========');
    console.log('[Twilio SMS Webhook] Body:', JSON.stringify(req.body, null, 2));

    const {
      MessageSid,
      From,
      To,
      Body,
      NumMedia,
      MediaUrl0,
      MediaContentType0,
      AccountSid,
      MessagingServiceSid
    } = req.body;

    // Validar campos obrigatórios
    if (!MessageSid || !From || !Body) {
      console.error('[Twilio SMS] Missing required fields');
      return res.status(400).send('Missing required fields');
    }

    // Limpar número do remetente (remover +)
    const senderPhone = From.replace(/\D/g, '');
    const recipientPhone = To; // Manter formato completo (+55...)

    console.log('[Twilio SMS] From:', senderPhone, 'To:', recipientPhone);
    console.log('[Twilio SMS] Message:', Body);
    console.log('[Twilio SMS] Has media:', NumMedia > 0);

    // 1. Buscar canal Twilio do usuário pelo número nas credenciais
    const channelResult = await query(
      `SELECT c.*, c.user_id 
       FROM channels c
       WHERE c.type = 'twilio_sms' 
       AND c.status IN ('active', 'connected')
       AND c.credentials->>'phoneNumber' = $1
       LIMIT 1`,
      [recipientPhone]
    );

    if (channelResult.rows.length === 0) {
      console.error('[Twilio SMS] No active Twilio SMS channel found for phone:', recipientPhone);
      // Responder com TwiML vazio para evitar erro no Twilio
      return res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }

    const channel = channelResult.rows[0];
    const userId = channel.user_id;

    console.log('[Twilio SMS] Found channel:', channel.id, 'for user:', userId);

    // 2. Validar assinatura do webhook (segurança)
    const twilioSignature = req.headers['x-twilio-signature'];
    if (twilioSignature && channel.credentials?.authToken) {
      const { TwilioSMSService } = await import('../services/twilio-sms.service');
      try {
        const twilioService = new TwilioSMSService({
          accountSid: channel.credentials.accountSid,
          authToken: channel.credentials.authToken,
          phoneNumber: channel.credentials.phoneNumber
        });
        
        const url = `${process.env.WEBHOOK_URL || process.env.API_URL || 'https://yourdomain.com'}/api/webhooks/twilio/sms`;
        const isValid = twilioService.validateWebhookSignature(
          twilioSignature as string,
          url,
          req.body
        );
        
        if (!isValid) {
          console.error('[Twilio SMS] Invalid webhook signature');
          return res.status(403).send('Invalid signature');
        }
        console.log('[Twilio SMS] ✅ Webhook signature validated');
      } catch (err) {
        console.warn('[Twilio SMS] Error validating signature:', err);
        // Continuar mesmo com erro na validação (para não bloquear mensagens)
      }
    }

    // 3. Buscar ou criar lead
    let lead;
    const leadResult = await query(
      `SELECT * FROM leads 
       WHERE user_id = $1 
       AND (phone = $2 OR whatsapp = $2)
       LIMIT 1`,
      [userId, senderPhone]
    );

    if (leadResult.rows.length > 0) {
      lead = leadResult.rows[0];
      console.log('[Twilio SMS] Found existing lead:', lead.id);
    } else {
      // Criar novo lead
      const newLeadResult = await query(
        `INSERT INTO leads (user_id, name, phone, whatsapp, source, status)
         VALUES ($1, $2, $3, $3, 'sms', 'novo')
         RETURNING *`,
        [userId, `SMS ${senderPhone}`, senderPhone]
      );
      lead = newLeadResult.rows[0];
      console.log('[Twilio SMS] Created new lead:', lead.id);
    }

    // 4. Buscar ou criar conversa
    const remoteJid = `sms_${senderPhone}`;
    let conversation;

    const convSearchResult = await query(
      `SELECT * FROM conversations 
       WHERE user_id = $1 
       AND remote_jid = $2
       LIMIT 1`,
      [userId, remoteJid]
    );

    if (convSearchResult.rows.length > 0) {
      conversation = convSearchResult.rows[0];
      console.log('[Twilio SMS] Found existing conversation:', conversation.id);
    } else {
      // Criar nova conversa
      const newConvResult = await query(
        `INSERT INTO conversations (user_id, lead_id, channel_id, remote_jid, status, metadata)
         VALUES ($1, $2, $3, $4, 'open', $5)
         RETURNING *`,
        [
          userId,
          lead.id,
          channel.id,
          remoteJid,
          JSON.stringify({
            phone: senderPhone,
            platform: 'twilio_sms',
            channel_type: 'sms'
          })
        ]
      );
      conversation = newConvResult.rows[0];
      console.log('[Twilio SMS] Created new conversation:', conversation.id);
    }

    // 5. Processar mídia (se houver)
    let mediaUrl = null;
    let mediaType = null;

    if (NumMedia && parseInt(NumMedia) > 0 && MediaUrl0) {
      mediaUrl = MediaUrl0;
      mediaType = MediaContentType0 || 'image/jpeg';
      console.log('[Twilio SMS] Media detected:', mediaUrl, 'type:', mediaType);
    }

    // 6. Salvar mensagem no banco
    const messageResult = await query(
      `INSERT INTO messages (
        conversation_id, 
        external_id, 
        direction, 
        content, 
        media_url, 
        media_type,
        status,
        metadata,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING *`,
      [
        conversation.id,
        MessageSid,
        'in',
        Body || '',
        mediaUrl,
        mediaType,
        'delivered',
        JSON.stringify({
          from: From,
          to: To,
          platform: 'twilio_sms',
          twilioMessageSid: MessageSid
        })
      ]
    );

    const savedMessage = messageResult.rows[0];
    console.log('[Twilio SMS] Message saved:', savedMessage.id);

    // 7. Notificar via WebSocket
    const wsService = getWebSocketService();
    if (wsService) {
      wsService.emitNewMessage(userId, {
        conversationId: conversation.id,
        message: {
          id: savedMessage.id,
          conversation_id: conversation.id,
          external_id: MessageSid,
          direction: 'in',
          content: Body,
          media_url: mediaUrl,
          media_type: mediaType,
          status: 'delivered',
          created_at: savedMessage.created_at,
          sender: {
            id: lead.id,
            name: lead.name,
            phone: senderPhone,
            type: 'contact'
          }
        }
      });
    }

    // 8. Atualizar conversa
    await query(
      `UPDATE conversations 
       SET last_message_at = NOW(), 
           unread_count = unread_count + 1,
           updated_at = NOW() 
       WHERE id = $1`,
      [conversation.id]
    );

    // 9. Processar com IA (se configurado)
    try {
      await assistantProcessor.processIncomingMessage({
        channelId: channel.id,
        channelType: 'twilio_sms',
        conversationId: conversation.id,
        userId: channel.user_id,
        contactPhone: From,
        contactName: lead.name,
        messageContent: Body,
        credentials: channel.credentials
      });
    } catch (err) {
      console.error('[Twilio SMS] Error processing with AI:', err);
    }

    // 10. Registrar interação no tracking
    leadTrackingService.recordInteraction(
      lead.id,
      userId,
      'message_received',
      {
        conversationId: conversation.id,
        channelId: channel.id,
        direction: 'in',
        content: Body.substring(0, 200),
        details: {
          platform: 'twilio_sms',
          phone: senderPhone,
          message_type: 'sms',
          has_media: NumMedia > 0
        }
      }
    ).catch(err => console.error('[Twilio SMS] Error recording interaction:', err));

    console.log('[Twilio SMS] ✅ Message processed successfully');

    // Responder com TwiML vazio (200 OK)
    res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  } catch (error: any) {
    console.error('[Twilio SMS Webhook] Error:', error);
    // Sempre responder 200 OK para evitar retry do Twilio
    res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }
});

/**
 * POST /api/webhooks/twilio/status
 * Webhook para receber status de mensagens enviadas
 */
router.post('/twilio/status', async (req, res) => {
  try {
    console.log('[Twilio Status] Received:', JSON.stringify(req.body, null, 2));

    const { MessageSid, MessageStatus, ErrorCode, ErrorMessage } = req.body;

    if (!MessageSid) {
      return res.status(400).send('Missing MessageSid');
    }

    // Atualizar status da mensagem no banco
    const updateResult = await query(
      `UPDATE messages 
       SET status = $1, 
           metadata = jsonb_set(
             COALESCE(metadata, '{}'::jsonb),
             '{twilioStatus}',
             to_jsonb($2::text)
           ),
           updated_at = NOW()
       WHERE external_id = $3
       RETURNING *`,
      [MessageStatus || 'unknown', MessageStatus, MessageSid]
    );

    if (updateResult.rows.length > 0) {
      console.log('[Twilio Status] Updated message:', updateResult.rows[0].id, 'to status:', MessageStatus);

      // Notificar via WebSocket
      const message = updateResult.rows[0];
      const wsService = getWebSocketService();
      
      if (wsService) {
        // Buscar user_id da conversa
        const convResult = await query(
          `SELECT user_id FROM conversations WHERE id = $1`,
          [message.conversation_id]
        );

        if (convResult.rows.length > 0) {
          const userId = convResult.rows[0].user_id;
          wsService.emitMessageStatusUpdate(userId, {
            conversationId: message.conversation_id,
            messageId: message.id,
            status: MessageStatus
          });
        }
      }
    } else {
      console.log('[Twilio Status] Message not found:', MessageSid);
    }

    // Responder com TwiML vazio
    res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  } catch (error: any) {
    console.error('[Twilio Status] Error:', error);
    res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }
});

export default router;
