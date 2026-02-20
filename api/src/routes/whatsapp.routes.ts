import { Router } from 'express';
import { WhatsAppService } from '../services/whatsapp.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { LeadsService } from '../services/leads.service';
import { ChannelsService } from '../services/channels.service';
import { ConversationsService } from '../services/conversations.service';
import { MessagesService } from '../services/messages.service';
import { query } from '../database/connection';

const router = Router();
const whatsappService = new WhatsAppService();
const leadsService = new LeadsService();
const channelsService = new ChannelsService();
const conversationsService = new ConversationsService();
const messagesService = new MessagesService();

// Helper function to normalize phone to JID
const normalizePhoneToJid = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  return `${digits}@s.whatsapp.net`;
};

// Helper function to generate instance name prefix from user ID
const getUserInstancePrefix = (userId: string): string => {
  return `leadflow_${userId.replace(/[^a-zA-Z0-9]/g, '_')}`;
};

// Helper function to check if an instance belongs to a user
const instanceBelongsToUser = (instanceName: string, userId: string): boolean => {
  const prefix = getUserInstancePrefix(userId);
  return instanceName === prefix || instanceName.startsWith(`${prefix}_`);
};

// Apply auth middleware to all routes except /config (debug endpoint)
router.use((req, res, next) => {
  if (req.path === '/config') {
    return next();
  }
  return authMiddleware(req, res, next);
});

// Send individual message
router.post('/send', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { phone, message, instanceId: requestedInstanceId, leadId, channelId } = req.body;

    if (!phone || !message) {
      return res.status(400).json({ error: 'Phone and message are required' });
    }

    // Get instance and channel to use
    let instanceId = requestedInstanceId;
    let activeChannel: any = null;
    
    if (!instanceId) {
      // Find first active WhatsApp channel for user
      const channels = await channelsService.findByType('whatsapp', user.id);
      activeChannel = channels.find(c => c.status === 'active');
      
      if (activeChannel && activeChannel.credentials?.instance_id) {
        instanceId = activeChannel.credentials.instance_id;
      } else {
        return res.status(400).json({ 
          error: 'No active WhatsApp instance found. Please connect WhatsApp first.' 
        });
      }
    } else {
      // Verify user owns this instance
      if (!instanceBelongsToUser(instanceId, user.id)) {
        return res.status(403).json({ error: 'Forbidden: You can only use your own instances' });
      }
      // Get channel by ID or find by instance
      if (channelId) {
        const channels = await channelsService.findByType('whatsapp', user.id);
        activeChannel = channels.find(c => c.id === channelId);
      } else {
        const channels = await channelsService.findByType('whatsapp', user.id);
        activeChannel = channels.find(c => 
          c.credentials?.instance_id === instanceId || c.credentials?.instance_name === instanceId
        );
      }
    }

    console.log(`[WhatsApp Routes] Sending message via instance: ${instanceId}`);

    // Send message through instance
    const result = await whatsappService.sendMessage({
      instanceId: instanceId,
      number: phone,
      text: message,
    });

    // Create conversation and save message to database for history
    if (activeChannel) {
      try {
        const remoteJid = normalizePhoneToJid(phone);
        
        // Find or create conversation
        const conversation = await conversationsService.findOrCreate(
          user.id,
          activeChannel.id,
          remoteJid,
          leadId || undefined,
          {
            contact_name: leadId ? 'Lead' : phone,
            phone: phone,
          }
        );

        // Save message
        await messagesService.create({
          conversation_id: conversation.id,
          lead_id: leadId || null,
          direction: 'out',
          channel: 'whatsapp',
          content: message.trim(),
          status: 'sent',
          sent_at: new Date().toISOString(),
          external_id: (result as any)?.key?.id || null,
          metadata: {
            whatsapp_result: result,
            remote_jid: remoteJid,
            phone: phone,
          },
        }, user.id);

        console.log(`[WhatsApp Routes] Message saved to conversation: ${conversation.id}`);
      } catch (dbError) {
        console.warn('[WhatsApp Routes] Failed to save message to database:', dbError);
        // Don't fail the request, the WhatsApp message was sent
      }
    }

    res.json({ success: true, result });
  } catch (error) {
    console.error('[WhatsApp Routes] Error sending message:', error);
    next(error);
  }
});

// Send mass messages
router.post('/send-mass', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { leadIds, message, instanceId: requestedInstanceId } = req.body;

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({ error: 'leadIds array is required' });
    }

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Get instance to use
    let instanceId = requestedInstanceId;
    
    if (!instanceId) {
      // Find first active WhatsApp channel for user
      const channels = await channelsService.findByType('whatsapp', user.id);
      const activeChannel = channels.find(c => c.status === 'active');
      
      if (activeChannel && activeChannel.credentials?.instance_id) {
        instanceId = activeChannel.credentials.instance_id;
      } else {
        return res.status(400).json({ 
          error: 'No active WhatsApp instance found. Please connect WhatsApp first.' 
        });
      }
    } else {
      // Verify user owns this instance
      if (!instanceBelongsToUser(instanceId, user.id)) {
        return res.status(403).json({ error: 'Forbidden: You can only use your own instances' });
      }
    }

    console.log(`[WhatsApp Routes] Sending mass messages via instance: ${instanceId}`);

    const summary = {
      total: leadIds.length,
      successful: 0,
      failed: 0,
      errors: [] as string[],
    };

    // Send messages to each lead
    for (const leadId of leadIds) {
      try {
        // Get lead data
        const lead = await leadsService.findById(leadId, user.id);

        if (!lead) {
          summary.failed++;
          summary.errors.push(`Lead ${leadId} not found`);
          continue;
        }

        // Get phone from lead (support both Portuguese and English field names)
        const phone = (lead as any).telefone || (lead as any).phone;

        if (!phone) {
          summary.failed++;
          summary.errors.push(`Lead ${leadId} has no phone number`);
          continue;
        }

        // Send message through user's specific instance
        await whatsappService.sendMessage({
          instanceId: instanceId,
          number: phone,
          text: message.trim(),
        });

        summary.successful++;

        // Add small delay between messages to avoid rate limiting
        if (leadIds.indexOf(leadId) < leadIds.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      } catch (error: any) {
        console.error(`[WhatsApp Routes] Error sending to lead ${leadId}:`, error);
        summary.failed++;
        summary.errors.push(`Lead ${leadId}: ${error.message || 'Unknown error'}`);
        // If the instance doesn't exist, abort the entire batch and mark channel as error
        const errMsg: string = error?.message || '';
        if (errMsg.includes('does not exist') || errMsg === 'Not Found') {
          console.error(`[WhatsApp Routes] Instance "${instanceId}" does not exist in Evolution API. Aborting mass send and marking remaining leads as failed.`);
          const remaining = leadIds.length - leadIds.indexOf(leadId) - 1;
          summary.failed += remaining;
          // Mark the active channel as error so it's no longer selected
          try {
            const channels = await channelsService.findByType('whatsapp', user.id);
            const ch = channels.find((c: any) => c.credentials?.instance_id === instanceId || c.credentials?.instance_name === instanceId);
            if (ch) {
              await query(`UPDATE channels SET status = 'error', updated_at = NOW() WHERE id = $1`, [ch.id]);
              console.warn(`[WhatsApp Routes] Marked channel ${ch.id} as error`);
            }
          } catch (dbErr) {
            console.error('[WhatsApp Routes] Failed to update channel status:', dbErr);
          }
          break;
        }
      }
    }

    console.log(`[WhatsApp Routes] Mass send complete:`, summary);

    res.json({
      success: true,
      summary: {
        total: summary.total,
        successful: summary.successful,
        failed: summary.failed,
      },
      errors: summary.errors.length > 0 ? summary.errors : undefined,
    });
  } catch (error) {
    console.error('[WhatsApp Routes] Error in mass send:', error);
    next(error);
  }
});

router.get('/status/:instanceId', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const requestedInstanceId = req.params.instanceId;

    // CRITICAL: Verify user owns this instance (supports multiple instances)
    if (!instanceBelongsToUser(requestedInstanceId, user.id)) {
      console.warn(`[WhatsApp Routes] ⚠️ User ${user.id} tried to access instance ${requestedInstanceId}`);
      return res.status(403).json({
        error: 'Forbidden: You can only check your own WhatsApp instances'
      });
    }

    console.log(`[WhatsApp Routes] Checking status for user ${user.id}, instance: ${requestedInstanceId}`);

    const result = await whatsappService.getStatus(requestedInstanceId) as any;
    console.log('[WhatsApp Routes] Raw status response:', JSON.stringify(result).substring(0, 500));

    // Normalize response - Evolution API can return different formats
    let state = 'close';
    let instance = null;
    let profileName = null;
    let profilePictureUrl = null;

    // Format 1: Direct response with state
    if (result.state) {
      state = result.state;
      instance = result.instance || result;
    }
    // Format 2: Response with instance object
    else if (result.instance) {
      state = result.instance.state || result.instance.status || 'close';
      instance = result.instance;
    }
    // Format 3: Response is the instance itself
    else {
      state = result.connectionStatus || result.status || 'close';
      instance = result;
    }

    // Extract profile info from various locations
    profileName = result.profileName || 
                  instance?.profileName || 
                  result.name ||
                  instance?.name ||
                  result.instance?.profileName;
    
    profilePictureUrl = result.profilePictureUrl || 
                        instance?.profilePictureUrl ||
                        result.instance?.profilePictureUrl;

    // Normalize state values (Evolution API may return different formats)
    if (state === 'connected' || state === 'CONNECTED') {
      state = 'open';
    } else if (state === 'disconnected' || state === 'DISCONNECTED') {
      state = 'close';
    }

    const isConnected = state === 'open';

    console.log('[WhatsApp Routes] Normalized state:', state, 'connected:', isConnected);

    // Return normalized response
    res.json({
      state: state,
      connected: isConnected,
      instance: instance,
      profileName: profileName,
      profilePictureUrl: profilePictureUrl,
    });
  } catch (error) {
    console.error('[WhatsApp Routes] Error getting status:', error);
    next(error);
  }
});

router.get('/qr/:instanceId', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const requestedInstanceId = req.params.instanceId;

    // CRITICAL: Verify user owns this instance (supports multiple instances)
    if (!instanceBelongsToUser(requestedInstanceId, user.id)) {
      console.warn(`[WhatsApp Routes] ⚠️ User ${user.id} tried to access QR for instance ${requestedInstanceId}`);
      return res.status(403).json({
        error: 'Forbidden: You can only get QR code for your own instances'
      });
    }

    console.log(`[WhatsApp Routes] Getting QR code for instance: ${requestedInstanceId}`);
    const result = await whatsappService.getQrCode(requestedInstanceId) as any;
    console.log('[WhatsApp Routes] QR response keys:', Object.keys(result || {}));
    
    // Normalize QR code response - Evolution API can return different formats
    let qrCode = null;
    
    // Try different possible locations of QR code
    if (result?.base64) {
      qrCode = result.base64;
    } else if (result?.code) {
      qrCode = result.code;
    } else if (result?.qrcode?.base64) {
      qrCode = result.qrcode.base64;
    } else if (result?.qrcode?.code) {
      qrCode = result.qrcode.code;
    } else if (result?.qrcode) {
      qrCode = result.qrcode;
    } else if (typeof result === 'string' && result.length > 100) {
      // Sometimes it returns just the base64 string
      qrCode = result;
    }

    if (qrCode) {
      console.log('[WhatsApp Routes] QR code found, length:', qrCode.length);
      res.json({ 
        base64: qrCode,
        code: qrCode 
      });
    } else {
      console.error('[WhatsApp Routes] No QR code found in response:', JSON.stringify(result).substring(0, 500));
      res.status(400).json({ 
        error: 'QR Code not available',
        details: 'The Evolution API did not return a QR code. The instance may already be connected or there was an error.',
        rawResponse: result
      });
    }
  } catch (error) {
    console.error('[WhatsApp Routes] Error getting QR:', error);
    next(error);
  }
});

router.post('/instance', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { instanceName } = req.body;

    if (!instanceName) {
      return res.status(400).json({ error: 'instanceName is required' });
    }

    // Validate instance belongs to user
    if (!instanceBelongsToUser(instanceName, user.id)) {
      console.warn(`[WhatsApp Routes] ⚠️ User ${user.id} tried to create instance ${instanceName}`);
      return res.status(403).json({
        error: 'Forbidden: Instance name must start with your user prefix'
      });
    }

    console.log('[WhatsApp Routes] Creating/getting instance:', instanceName);

    // First, check if instance already exists
    try {
      const statusResult = await whatsappService.getStatus(instanceName) as any;
      console.log('[WhatsApp Routes] Instance exists, status:', statusResult);

      // Instance exists, return it
      return res.json({
        instance: {
          instanceName: instanceName,
        },
        state: statusResult?.state || 'unknown',
        message: 'Instance already exists',
      });
    } catch (statusError: any) {
      // Instance doesn't exist or error checking - proceed to create
      console.log('[WhatsApp Routes] Instance may not exist, creating...', statusError.message);
    }

    // Create new instance
    const result = await whatsappService.createInstance(req.body);
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Routes] Error in /instance:', error);

    // If error says instance already exists, treat as success
    if (error.message && error.message.includes('already exists')) {
      return res.json({
        instance: {
          instanceName: req.body.instanceName,
        },
        message: 'Instance already exists',
      });
    }

    next(error);
  }
});

router.post('/disconnect/:instanceId', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const requestedInstanceId = req.params.instanceId;

    // CRITICAL: Verify user owns this instance (supports multiple instances)
    if (!instanceBelongsToUser(requestedInstanceId, user.id)) {
      console.warn(`[WhatsApp Routes] ⚠️ User ${user.id} tried to disconnect instance ${requestedInstanceId}`);
      return res.status(403).json({
        error: 'Forbidden: You can only disconnect your own instances'
      });
    }

    console.log(`[WhatsApp Routes] User ${user.id} disconnecting instance: ${requestedInstanceId}`);

    // STEP 1: Delete instance from Evolution API server (complete removal)
    const result = await whatsappService.deleteInstance(requestedInstanceId);

    // STEP 2: Delete channel from database
    try {
      const channel = await channelsService.findByInstanceId(requestedInstanceId, user.id);
      if (channel) {
        await channelsService.delete(channel.id, user.id);
        console.log('[WhatsApp Routes] ✅ Channel deleted from database');
      }
    } catch (e) {
      console.warn('[WhatsApp Routes] Error deleting channel:', e);
    }

    // STEP 3: Clean user settings (for backwards compatibility)
    const { query } = require('../database/connection');

    await query(
      `DELETE FROM settings
       WHERE user_id = $1
       AND key IN (
         'whatsapp_connected',
         'whatsapp_instance_name',
         'whatsapp_profile_name',
         'whatsapp_connected_at',
         'whatsapp_disconnected_at'
       )`,
      [user.id]
    );

    console.log('[WhatsApp Routes] ✅ Instance deleted from Evolution API');
    console.log('[WhatsApp Routes] ✅ WhatsApp data cleaned from database');

    res.json({
      success: true,
      message: 'WhatsApp disconnected and instance deleted permanently',
      result,
    });
  } catch (error) {
    console.error('[WhatsApp Routes] Error disconnecting:', error);
    next(error);
  }
});

router.get('/instances', async (_req, res, next) => {
  try {
    const result = await whatsappService.listInstances();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Configure webhook for an instance
router.post('/configure-webhook/:instanceId', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { instanceId } = req.params;

    // Validate instance belongs to user
    if (!instanceBelongsToUser(instanceId, user.id)) {
      return res.status(403).json({ error: 'Access denied: Instance does not belong to you' });
    }

    // Determine webhook URL
    const webhookUrl = process.env.WEBHOOK_URL || process.env.API_URL || process.env.SERVICE_URL_API;
    if (!webhookUrl || webhookUrl.includes('localhost')) {
      return res.status(400).json({
        error: 'WEBHOOK_URL not configured properly',
        message: 'A public WEBHOOK_URL is required for Evolution API webhooks. Configure WEBHOOK_URL in .env with your public API URL.',
        current: webhookUrl || 'NOT SET'
      });
    }

    const fullWebhookUrl = `${webhookUrl.replace(/\/$/, '')}/api/webhooks/evolution/messages`;

    console.log('[WhatsApp Routes] Configuring webhook for:', instanceId, 'URL:', fullWebhookUrl);

    const result = await whatsappService.configureWebhook(instanceId, fullWebhookUrl);

    res.json({
      success: true,
      message: 'Webhook configured successfully',
      webhookUrl: fullWebhookUrl,
      result
    });
  } catch (error: any) {
    console.error('[WhatsApp Routes] Error configuring webhook:', error);
    next(error);
  }
});

// ✅ Verificar webhook configurado na Evolution API
router.get('/webhook-status/:instanceId', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { instanceId } = req.params;

    // Validate instance belongs to user
    if (!instanceBelongsToUser(instanceId, user.id)) {
      return res.status(403).json({ error: 'Access denied: Instance does not belong to you' });
    }

    console.log('[WhatsApp Routes] Checking webhook status for:', instanceId);

    // Buscar configuração atual do webhook na Evolution API
    const webhookUrl = process.env.WEBHOOK_URL || process.env.API_URL || process.env.SERVICE_URL_API;
    const expectedUrl = webhookUrl ? `${webhookUrl.replace(/\/$/, '')}/api/webhooks/evolution/messages` : null;

    // Tentar buscar o webhook atual da Evolution API
    let currentWebhook = null;
    let webhookConfigured = false;

    try {
      // Evolution API endpoint para buscar webhook
      const evolutionUrl = process.env.EVOLUTION_API_URL;
      const apiKey = process.env.EVOLUTION_API_KEY;

      if (evolutionUrl && apiKey) {
        const response = await fetch(`${evolutionUrl}/webhook/find/${instanceId}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'apikey': apiKey,
          },
        });

        if (response.ok) {
          currentWebhook = await response.json();
          console.log('[WhatsApp Routes] Current webhook config:', JSON.stringify(currentWebhook));

          // Verificar se o webhook está configurado corretamente
          const webhookUrlFromApi = currentWebhook?.url || currentWebhook?.webhook?.url;
          webhookConfigured = webhookUrlFromApi && webhookUrlFromApi === expectedUrl;
        }
      }
    } catch (e: any) {
      console.warn('[WhatsApp Routes] Could not fetch current webhook:', e.message);
    }

    res.json({
      instanceId,
      expectedWebhookUrl: expectedUrl,
      currentWebhook: currentWebhook,
      webhookConfigured,
      diagnosis: {
        hasWebhookUrl: !!webhookUrl,
        webhookUrlValue: webhookUrl || 'NOT SET',
        isLocalhost: webhookUrl?.includes('localhost') || false,
        recommendation: !webhookUrl
          ? 'Configure WEBHOOK_URL no .env com a URL pública da sua API'
          : webhookUrl.includes('localhost')
          ? 'WEBHOOK_URL não pode ser localhost - use uma URL pública'
          : !webhookConfigured
          ? 'Webhook não está configurado na Evolution API - use POST /api/whatsapp/fix-webhook/:instanceId para corrigir'
          : 'Webhook configurado corretamente!'
      }
    });
  } catch (error: any) {
    console.error('[WhatsApp Routes] Error checking webhook status:', error);
    next(error);
  }
});

// ✅ Forçar reconfiguração do webhook na Evolution API
router.post('/fix-webhook/:instanceId', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { instanceId } = req.params;

    // Validate instance belongs to user
    if (!instanceBelongsToUser(instanceId, user.id)) {
      return res.status(403).json({ error: 'Access denied: Instance does not belong to you' });
    }

    console.log('[WhatsApp Routes] 🔧 Fixing webhook for:', instanceId);

    // Determine webhook URL
    const webhookUrl = process.env.WEBHOOK_URL || process.env.API_URL || process.env.SERVICE_URL_API;
    if (!webhookUrl) {
      return res.status(400).json({
        error: 'WEBHOOK_URL not configured',
        message: 'Configure WEBHOOK_URL no .env com a URL pública da sua API (ex: https://api.seudominio.com)',
      });
    }

    if (webhookUrl.includes('localhost')) {
      return res.status(400).json({
        error: 'WEBHOOK_URL cannot be localhost',
        message: 'A Evolution API precisa de uma URL pública para enviar webhooks. Configure uma URL acessível pela internet.',
        current: webhookUrl
      });
    }

    const fullWebhookUrl = `${webhookUrl.replace(/\/$/, '')}/api/webhooks/evolution/messages`;

    console.log('[WhatsApp Routes] Setting webhook URL:', fullWebhookUrl);

    // Configurar webhook na Evolution API com todos os eventos necessários
    const evolutionUrl = process.env.EVOLUTION_API_URL;
    const apiKey = process.env.EVOLUTION_API_KEY;

    if (!evolutionUrl || !apiKey) {
      return res.status(400).json({
        error: 'Evolution API not configured',
        message: 'Configure EVOLUTION_API_URL e EVOLUTION_API_KEY no .env',
      });
    }

    // Configurar webhook com TODOS os eventos de mensagem
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

    console.log('[WhatsApp Routes] Webhook config:', JSON.stringify(webhookConfig));

    const response = await fetch(`${evolutionUrl}/webhook/set/${instanceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
      },
      body: JSON.stringify(webhookConfig),
    });

    const result = await response.json();

    console.log('[WhatsApp Routes] Evolution API response:', JSON.stringify(result));

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Failed to configure webhook',
        details: result,
      });
    }

    res.json({
      success: true,
      message: '✅ Webhook configurado com sucesso!',
      webhookUrl: fullWebhookUrl,
      evolutionResponse: result,
      nextSteps: [
        '1. Envie uma mensagem de teste para o WhatsApp conectado',
        '2. Verifique os logs do servidor para ver se o webhook é chamado',
        '3. Procure por: [Evolution Webhook] ===== WEBHOOK RECEBIDO =====',
      ]
    });
  } catch (error: any) {
    console.error('[WhatsApp Routes] Error fixing webhook:', error);
    next(error);
  }
});

// ============================================
// ✅ VALIDAR NÚMEROS DE WHATSAPP
// ============================================

/**
 * Verifica se números de telefone têm WhatsApp
 * Use este endpoint ANTES de enviar campanhas/mensagens em massa
 * para evitar erros com números inválidos
 *
 * POST /api/whatsapp/validate-numbers
 * Body: { numbers: string[], instanceId?: string }
 *
 * Response: {
 *   results: [{ number, exists, jid?, name? }],
 *   valid: string[],    // Números que têm WhatsApp
 *   invalid: string[],  // Números que NÃO têm WhatsApp
 *   summary: { total, valid, invalid }
 * }
 */
router.post('/validate-numbers', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { numbers, instanceId: requestedInstanceId } = req.body;

    if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
      return res.status(400).json({
        error: 'numbers array is required',
        example: { numbers: ['+5511999999999', '5511888888888'] }
      });
    }

    // Limit to prevent abuse
    if (numbers.length > 1000) {
      return res.status(400).json({
        error: 'Maximum 1000 numbers per request',
        received: numbers.length
      });
    }

    // Get instance to use
    let instanceId = requestedInstanceId;

    if (!instanceId) {
      // Find first active WhatsApp channel for user
      const channels = await channelsService.findByType('whatsapp', user.id);
      const activeChannel = channels.find(c => c.status === 'active');

      if (activeChannel && activeChannel.credentials?.instance_id) {
        instanceId = activeChannel.credentials.instance_id;
      } else {
        return res.status(400).json({
          error: 'No active WhatsApp instance found. Please connect WhatsApp first or provide instanceId.'
        });
      }
    } else {
      // Verify user owns this instance
      if (!instanceBelongsToUser(instanceId, user.id)) {
        return res.status(403).json({ error: 'Forbidden: You can only use your own instances' });
      }
    }

    console.log(`[WhatsApp Routes] Validating ${numbers.length} numbers via instance: ${instanceId}`);

    // Check numbers on WhatsApp
    const result = await whatsappService.checkWhatsAppNumbers(instanceId, numbers);

    console.log(`[WhatsApp Routes] Validation complete: ${result.valid.length} valid, ${result.invalid.length} invalid`);

    res.json({
      ...result,
      summary: {
        total: numbers.length,
        valid: result.valid.length,
        invalid: result.invalid.length,
      },
      instanceId,
    });
  } catch (error) {
    console.error('[WhatsApp Routes] Error validating numbers:', error);
    next(error);
  }
});

/**
 * Validar números de leads específicos antes de enviar campanha
 *
 * POST /api/whatsapp/validate-leads
 * Body: { leadIds: string[], instanceId?: string }
 *
 * Response: {
 *   validLeads: [{ leadId, phone, exists, name? }],
 *   invalidLeads: [{ leadId, phone, exists, name? }],
 *   summary: { total, valid, invalid }
 * }
 */
router.post('/validate-leads', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { leadIds, instanceId: requestedInstanceId } = req.body;

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({
        error: 'leadIds array is required',
        example: { leadIds: ['uuid-1', 'uuid-2'] }
      });
    }

    // Limit to prevent abuse
    if (leadIds.length > 500) {
      return res.status(400).json({
        error: 'Maximum 500 leads per request',
        received: leadIds.length
      });
    }

    // Get instance to use
    let instanceId = requestedInstanceId;

    if (!instanceId) {
      const channels = await channelsService.findByType('whatsapp', user.id);
      const activeChannel = channels.find(c => c.status === 'active');

      if (activeChannel && activeChannel.credentials?.instance_id) {
        instanceId = activeChannel.credentials.instance_id;
      } else {
        return res.status(400).json({
          error: 'No active WhatsApp instance found. Please connect WhatsApp first.'
        });
      }
    } else {
      if (!instanceBelongsToUser(instanceId, user.id)) {
        return res.status(403).json({ error: 'Forbidden: You can only use your own instances' });
      }
    }

    console.log(`[WhatsApp Routes] Validating ${leadIds.length} leads via instance: ${instanceId}`);

    // Get all leads and their phone numbers
    const leadsWithPhones: Array<{ leadId: string; phone: string; name?: string }> = [];
    const leadsWithoutPhone: string[] = [];

    for (const leadId of leadIds) {
      try {
        const lead = await leadsService.findById(leadId, user.id);
        if (!lead) {
          leadsWithoutPhone.push(leadId);
          continue;
        }

        const phone = (lead as any).telefone || (lead as any).phone || (lead as any).whatsapp;
        if (!phone) {
          leadsWithoutPhone.push(leadId);
          continue;
        }

        leadsWithPhones.push({
          leadId,
          phone,
          name: (lead as any).name || (lead as any).nome,
        });
      } catch (e) {
        leadsWithoutPhone.push(leadId);
      }
    }

    if (leadsWithPhones.length === 0) {
      return res.json({
        validLeads: [],
        invalidLeads: leadsWithoutPhone.map(id => ({ leadId: id, phone: null, exists: false, reason: 'No phone number' })),
        summary: {
          total: leadIds.length,
          valid: 0,
          invalid: leadIds.length,
          noPhone: leadsWithoutPhone.length,
        },
      });
    }

    // Check numbers on WhatsApp
    const phoneNumbers = leadsWithPhones.map(l => l.phone);
    const validationResult = await whatsappService.checkWhatsAppNumbers(instanceId, phoneNumbers);

    // Map results back to leads
    const validLeads: Array<{ leadId: string; phone: string; exists: boolean; name?: string; jid?: string }> = [];
    const invalidLeads: Array<{ leadId: string; phone: string; exists: boolean; name?: string; reason?: string }> = [];

    for (const leadData of leadsWithPhones) {
      const cleanPhone = leadData.phone.replace(/\D/g, '');
      const validationEntry = validationResult.results.find(r =>
        r.number === cleanPhone || r.number === leadData.phone.replace(/\D/g, '')
      );

      if (validationEntry?.exists) {
        validLeads.push({
          leadId: leadData.leadId,
          phone: leadData.phone,
          exists: true,
          name: leadData.name,
          jid: validationEntry.jid,
        });
      } else {
        invalidLeads.push({
          leadId: leadData.leadId,
          phone: leadData.phone,
          exists: false,
          name: leadData.name,
          reason: 'Number not registered on WhatsApp',
        });
      }
    }

    // Add leads without phone to invalid list
    for (const leadId of leadsWithoutPhone) {
      invalidLeads.push({
        leadId,
        phone: '',
        exists: false,
        reason: 'Lead not found or no phone number',
      });
    }

    console.log(`[WhatsApp Routes] Lead validation complete: ${validLeads.length} valid, ${invalidLeads.length} invalid`);

    res.json({
      validLeads,
      invalidLeads,
      summary: {
        total: leadIds.length,
        valid: validLeads.length,
        invalid: invalidLeads.length,
        noPhone: leadsWithoutPhone.length,
      },
      instanceId,
    });
  } catch (error) {
    console.error('[WhatsApp Routes] Error validating leads:', error);
    next(error);
  }
});

// Debug endpoint to check environment variables
router.get('/config', async (_req, res) => {
  const webhookUrl = process.env.WEBHOOK_URL || process.env.API_URL || process.env.SERVICE_URL_API;
  res.json({
    hasEvolutionApiUrl: !!process.env.EVOLUTION_API_URL,
    hasEvolutionApiKey: !!process.env.EVOLUTION_API_KEY,
    evolutionApiUrlLength: process.env.EVOLUTION_API_URL?.length || 0,
    evolutionApiKeyLength: process.env.EVOLUTION_API_KEY?.length || 0,
    evolutionApiUrlPreview: process.env.EVOLUTION_API_URL ?
      `${process.env.EVOLUTION_API_URL.substring(0, 20)}...` : 'NOT SET',
    evolutionApiKeyPreview: process.env.EVOLUTION_API_KEY ?
      `${process.env.EVOLUTION_API_KEY.substring(0, 8)}...` : 'NOT SET',
    webhookUrl: webhookUrl || 'NOT SET',
    webhookEndpoint: webhookUrl ? `${webhookUrl.replace(/\/$/, '')}/api/webhooks/evolution/messages` : 'NOT CONFIGURED',
  });
});

export default router;
