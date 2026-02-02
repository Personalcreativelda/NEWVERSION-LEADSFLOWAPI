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
          external_id: result?.key?.id || null,
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
