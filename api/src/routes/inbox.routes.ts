import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.middleware';
import { InboxService } from '../services/inbox.service';
import { MessagesService } from '../services/messages.service';
import { WhatsAppService } from '../services/whatsapp.service';
import { ChannelsService } from '../services/channels.service';
import { LeadsService } from '../services/leads.service';
import { ConversationsService } from '../services/conversations.service';
import { getStorageService } from '../services/storage.service';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB max file size
  },
  fileFilter: (_req, file, cb) => {
    // Allow images, videos, documents, and audio
    const allowedMimes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/webm', 'video/quicktime',
      'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm',
      'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain'
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`));
    }
  }
});
const inboxService = new InboxService();
const messagesService = new MessagesService();
const whatsappService = new WhatsAppService();
const channelsService = new ChannelsService();
const leadsService = new LeadsService();
const conversationsService = new ConversationsService();

// Helper function to generate instance name from user ID (legacy/fallback)
const getUserInstanceName = (userId: string): string => {
  return `leadflow_${userId.replace(/[^a-zA-Z0-9]/g, '_')}`;
};

// Get the active WhatsApp instance from saved channels
const getActiveWhatsAppInstance = async (userId: string): Promise<string | null> => {
  try {
    const channels = await channelsService.findByType('whatsapp', userId);
    const activeChannel = channels.find(ch => ch.status === 'active');
    if (activeChannel && activeChannel.credentials) {
      // Return instance_id or instance_name from credentials
      return activeChannel.credentials.instance_id || activeChannel.credentials.instance_name || null;
    }
    return null;
  } catch (error) {
    console.error('[Inbox] Error getting active WhatsApp instance:', error);
    return null;
  }
};

// Get the active WhatsApp channel object (with ID and credentials)
const getActiveWhatsAppChannel = async (userId: string): Promise<any | null> => {
  try {
    // Buscar tanto whatsapp quanto whatsapp_cloud
    const channels = await channelsService.findByType('whatsapp', userId);
    const cloudChannels = await channelsService.findByType('whatsapp_cloud', userId);
    const allChannels = [...channels, ...cloudChannels];
    const activeChannel = allChannels.find(ch => ch.status === 'active' || (ch.status as string) === 'connected');
    return activeChannel || (allChannels.length > 0 ? allChannels[0] : null);
  } catch (error) {
    console.error('[Inbox] Error getting active WhatsApp channel:', error);
    return null;
  }
};

// Helper to normalize phone number for WhatsApp JID
const normalizePhoneToJid = (phone: string): string => {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  return `${digits}@s.whatsapp.net`;
};

// Helper to extract phone from JID
const extractPhoneFromJid = (jid: string): string => {
  return jid.replace('@s.whatsapp.net', '').replace('@g.us', '').replace('@lid', '');
};

router.use(authMiddleware);

// Check Evolution API status for inbox
router.get('/status', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // First try to get instance from saved channels, fallback to legacy
    const savedInstance = await getActiveWhatsAppInstance(user.id);
    const instanceId = savedInstance || getUserInstanceName(user.id);
    console.log('[Inbox Status] Using instanceId:', instanceId, '(from saved channel:', !!savedInstance, ')');
    
    const isEvolutionReady = whatsappService.isReady();

    let instanceStatus = 'unknown';
    let connectionState = null;

    if (isEvolutionReady) {
      try {
        // Try to get the instance status from Evolution API
        const status = await whatsappService.getStatus(instanceId) as any;
        connectionState = status?.state || status?.instance?.state || status?.connectionState || 'unknown';
        instanceStatus = connectionState === 'open' ? 'connected' : connectionState;
      } catch (error: any) {
        console.log('[Inbox Status] Failed to get instance status:', error?.message);
        instanceStatus = 'not_found';
      }
    }

    res.json({
      evolution_configured: isEvolutionReady,
      instance_id: instanceId,
      instance_status: instanceStatus,
      connection_state: connectionState,
      message: !isEvolutionReady
        ? 'Evolution API não está configurado. Configure EVOLUTION_API_URL e EVOLUTION_API_KEY.'
        : instanceStatus === 'not_found'
          ? 'Instância do WhatsApp não encontrada. Conecte seu WhatsApp nas configurações de integrações.'
          : instanceStatus === 'open' || instanceStatus === 'connected'
            ? 'WhatsApp conectado e pronto para uso.'
            : 'WhatsApp desconectado. Reconecte nas configurações de integrações.',
    });
  } catch (error) {
    next(error);
  }
});

// Upload file for inbox messages (images, videos, documents, audio)
router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('[Inbox Upload] Uploading file:', req.file.originalname, 'type:', req.file.mimetype, 'size:', req.file.size);

    const storageService = getStorageService();
    const mediaUrl = await storageService.uploadFile(req.file, 'inbox-media', user.id);

    // Determine media type from mime type
    let mediaType = 'document';
    if (req.file.mimetype.startsWith('image/')) {
      mediaType = 'image';
    } else if (req.file.mimetype.startsWith('video/')) {
      mediaType = 'video';
    } else if (req.file.mimetype.startsWith('audio/')) {
      mediaType = 'audio';
    }

    console.log('[Inbox Upload] File uploaded successfully:', mediaUrl, 'type:', mediaType);

    res.json({
      success: true,
      url: mediaUrl,
      media_type: mediaType,
      original_name: req.file.originalname,
      mime_type: req.file.mimetype,
      size: req.file.size
    });
  } catch (error: any) {
    console.error('[Inbox Upload] Error:', error);
    next(error);
  }
});

// Helper to normalize phone for comparison (remove + and leading zeros)
const normalizePhoneForMatch = (phone: string | null | undefined): string => {
  if (!phone) return '';
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '');
  // Remove leading zeros
  return digits.replace(/^0+/, '');
};

// Get all conversations from database - only shows conversations with actual messages
router.get('/conversations', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { query: dbQuery } = require('../database/connection');
    const search = req.query.search as string | undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const offset = req.query.offset ? Number(req.query.offset) : 0;

    console.log('[Inbox] Fetching conversations for user:', user.id);

    // STEP 1: Get conversations from database that have messages
    // This is the correct approach - like Chatwoot, only show conversations with actual history
    let sql = `
      SELECT DISTINCT ON (c.id)
        c.*,
        l.name as lead_name,
        l.email as lead_email,
        l.phone as lead_phone,
        l.whatsapp as lead_whatsapp,
        l.avatar_url as lead_avatar,
        l.status as lead_status,
        l.company as lead_company,
        l.source as lead_source,
        ch.type as channel_type,
        ch.name as channel_name,
        ch.status as channel_status,
        (
          SELECT json_build_object(
            'id', m.id,
            'content', m.content,
            'direction', m.direction,
            'status', m.status,
            'created_at', m.created_at,
            'media_url', m.media_url,
            'media_type', m.media_type
          )
          FROM messages m
          WHERE m.conversation_id = c.id
          ORDER BY m.created_at DESC
          LIMIT 1
        ) as last_message,
        (
          SELECT COUNT(*)::int 
          FROM messages m 
          WHERE m.conversation_id = c.id
        ) as message_count
      FROM conversations c
      LEFT JOIN leads l ON c.lead_id = l.id
      LEFT JOIN channels ch ON c.channel_id = ch.id
      WHERE c.user_id = $1
    `;

    const params: any[] = [user.id];
    let paramIndex = 2;

    // Add search filter
    if (search) {
      sql += ` AND (
        l.name ILIKE $${paramIndex} OR 
        l.phone ILIKE $${paramIndex} OR 
        l.email ILIKE $${paramIndex} OR
        c.metadata->>'contact_name' ILIKE $${paramIndex} OR
        c.remote_jid ILIKE $${paramIndex}
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    sql += ` ORDER BY c.id, c.last_message_at DESC NULLS LAST`;
    sql += ` LIMIT $${paramIndex}`;
    params.push(limit);
    paramIndex++;

    if (offset > 0) {
      sql += ` OFFSET $${paramIndex}`;
      params.push(offset);
    }

    let dbConversations: any[] = [];
    try {
      const result = await dbQuery(sql, params);
      dbConversations = result.rows;
      console.log('[Inbox] Found', dbConversations.length, 'conversations in database');
    } catch (err: any) {
      console.error('[Inbox] Database query error:', err?.message);
      // If table doesn't exist, return empty array
      if (err?.code === '42P01') {
        console.log('[Inbox] Conversations table does not exist yet');
        return res.json([]);
      }
      throw err;
    }

    // Transform to frontend format
    const conversations = dbConversations.map((conv: any) => {
      const displayName = conv.lead_name || conv.metadata?.contact_name || conv.remote_jid?.split('@')[0] || 'Desconhecido';
      const phone = conv.lead_phone || conv.lead_whatsapp || conv.metadata?.phone || conv.remote_jid?.split('@')[0];
      const profilePic = conv.lead_avatar || conv.metadata?.profile_picture || null;
      
      return {
        // CORREÇÃO: Usar sempre o UUID real da conversa, não o remote_jid
        // O remote_jid é compartilhado entre conversas com o mesmo número, causando conflitos
        id: conv.id,
        user_id: conv.user_id,
        lead_id: conv.lead_id,
        channel_id: conv.channel_id,
        remote_jid: conv.remote_jid,
        status: conv.status || 'open',
        assigned_to: conv.assigned_to,
        last_message_at: conv.last_message_at || conv.updated_at,
        unread_count: conv.unread_count || 0,
        is_group: conv.is_group || false,
        message_count: conv.message_count || 0,
        metadata: {
          contact_name: displayName,
          phone: phone,
          profile_picture: profilePic,
          is_group: conv.is_group || false,
          jid: conv.remote_jid,
          lead_status: conv.lead_status,
        },
        created_at: conv.created_at,
        updated_at: conv.updated_at,
        contact: {
          id: conv.lead_id,
          name: displayName,
          phone: phone,
          avatar_url: profilePic,
          is_group: conv.is_group || false,
          status: conv.lead_status,
          email: conv.lead_email,
          company: conv.lead_company,
          source: conv.lead_source,
        },
        channel: {
          id: conv.channel_id,
          type: conv.channel_type || 'whatsapp',
          name: conv.channel_name || 'WhatsApp',
          status: conv.channel_status || 'active',
        },
        last_message: conv.last_message || {
          id: 'empty',
          content: 'Sem mensagens...',
          direction: 'in',
          status: 'delivered',
          created_at: conv.created_at,
        },
      };
    });

    // Sort by last_message_at descending
    conversations.sort((a: any, b: any) => {
      const dateA = new Date(a.last_message_at || 0).getTime();
      const dateB = new Date(b.last_message_at || 0).getTime();
      return dateB - dateA;
    });

    console.log(`[Inbox] Returning ${conversations.length} conversations with actual message history`);
    res.json(conversations);
  } catch (error) {
    next(error);
  }
});

// Create new conversation
router.post('/conversations/create', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { contactId, channelType } = req.body;
    const { query: dbQuery } = require('../database/connection');

    console.log('[Inbox] ========== CREATE CONVERSATION ==========');
    console.log('[Inbox] Request body:', JSON.stringify(req.body, null, 2));
    console.log('[Inbox] Creating conversation with contactId:', contactId, 'type:', typeof contactId);
    console.log('[Inbox] channelType:', channelType);
    console.log('[Inbox] user.id:', user.id);

    if (!contactId) {
      console.error('[Inbox] contactId is missing from request body');
      return res.status(400).json({ error: 'contactId is required' });
    }

    // Get contact details
    console.log('[Inbox] Searching for contact with id:', contactId, 'and user_id:', user.id);
    const contactResult = await dbQuery(
      'SELECT * FROM contacts WHERE id = $1 AND user_id = $2',
      [contactId, user.id]
    );
    console.log('[Inbox] Contact query result rows:', contactResult.rows.length);
    if (contactResult.rows.length > 0) {
      console.log('[Inbox] Found contact:', JSON.stringify(contactResult.rows[0], null, 2));
    }

    if (contactResult.rows.length === 0) {
      console.error('[Inbox] Contact NOT found for id:', contactId);
      // Try to find contact without user_id filter to debug
      const debugResult = await dbQuery('SELECT id, user_id FROM contacts WHERE id = $1', [contactId]);
      console.log('[Inbox] Debug - contact exists?:', debugResult.rows.length > 0);
      if (debugResult.rows.length > 0) {
        console.log('[Inbox] Debug - contact belongs to user:', debugResult.rows[0].user_id, 'but request from:', user.id);
      }
      return res.status(404).json({ error: 'Contact not found' });
    }

    const contact = contactResult.rows[0];
    
    // Validate if contact has WhatsApp number
    const whatsappNumber = contact.whatsapp || contact.phone;
    if (!whatsappNumber || whatsappNumber.trim() === '') {
      return res.status(400).json({ 
        error: 'Este contato não possui número de WhatsApp configurado. Por favor, adicione um número de WhatsApp ao contato primeiro.' 
      });
    }
    
    // Get or create channel
    let channel;
    const searchType = channelType || 'whatsapp';
    console.log('[Inbox] Searching for channel with type:', searchType, 'user_id:', user.id);
    let channelsResult = await dbQuery(
      `SELECT * FROM channels WHERE type = $1 AND user_id = $2 AND status IN ('active', 'connected') ORDER BY created_at DESC LIMIT 1`,
      [searchType, user.id]
    );

    // Se não encontrar e não especificou tipo, tentar whatsapp_cloud
    if (channelsResult.rows.length === 0 && !channelType) {
      channelsResult = await dbQuery(
        `SELECT * FROM channels WHERE type = 'whatsapp_cloud' AND user_id = $1 AND status IN ('active', 'connected') ORDER BY created_at DESC LIMIT 1`,
        [user.id]
      );
    }

    console.log('[Inbox] Channels found:', channelsResult.rows.length);

    if (channelsResult.rows.length > 0) {
      channel = channelsResult.rows[0];
      console.log('[Inbox] Using channel:', channel.id, channel.name, 'type:', channel.type);
    } else {
      // Log all channels for this user to debug
      const allChannelsResult = await dbQuery(
        'SELECT id, type, name, status FROM channels WHERE user_id = $1',
        [user.id]
      );
      console.log('[Inbox] All channels for user:', JSON.stringify(allChannelsResult.rows, null, 2));
      console.error('[Inbox] ERROR: No active channel found!');
      return res.status(400).json({ error: 'No active channel found. Please configure WhatsApp first.' });
    }

    // Create remote JID from phone/whatsapp
    const phone = whatsappNumber;
    if (!phone) {
      return res.status(400).json({ error: 'Contact has no phone number' });
    }

    const remoteJid = normalizePhoneToJid(phone);

    // Check if conversation already exists
    const existingConvResult = await dbQuery(
      'SELECT * FROM conversations WHERE remote_jid = $1 AND user_id = $2',
      [remoteJid, user.id]
    );

    if (existingConvResult.rows.length > 0) {
      // Return existing conversation
      const existingConv = existingConvResult.rows[0];
      return res.json({
        // CORREÇÃO: Usar sempre o UUID real da conversa
        id: existingConv.id,
        user_id: existingConv.user_id,
        lead_id: existingConv.lead_id,
        channel_id: existingConv.channel_id,
        remote_jid: existingConv.remote_jid,
        status: existingConv.status || 'open',
        contact: {
          id: contact.id,
          name: contact.name,
          phone: contact.phone,
          email: contact.email,
          avatar_url: null,
        },
        channel: {
          id: channel.id,
          type: channel.type,
          name: channel.name,
          status: channel.status,
        },
        last_message: null,
        unread_count: 0,
        created_at: existingConv.created_at,
      });
    }

    // Try to find associated lead by phone/whatsapp
    let leadId = contact.lead_id || null;
    if (!leadId) {
      const leadResult = await dbQuery(
        `SELECT id FROM leads 
         WHERE user_id = $1 
         AND (phone = $2 OR whatsapp = $2 OR phone = $3 OR whatsapp = $3)
         LIMIT 1`,
        [user.id, phone, normalizePhoneToJid(phone)]
      );
      if (leadResult.rows.length > 0) {
        leadId = leadResult.rows[0].id;
      }
    }

    // Create new conversation
    const newConvResult = await dbQuery(
      `INSERT INTO conversations (user_id, lead_id, channel_id, remote_jid, status, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        user.id,
        leadId,
        channel.id,
        remoteJid,
        'open',
        JSON.stringify({
          contact_id: contactId,
          contact_name: contact.name,
          phone: phone,
          jid: remoteJid,
          is_group: false
        })
      ]
    );

    const newConv = newConvResult.rows[0];

    res.status(201).json({
      // CORREÇÃO: Usar sempre o UUID real da conversa
      id: newConv.id,
      user_id: newConv.user_id,
      lead_id: newConv.lead_id,
      channel_id: newConv.channel_id,
      remote_jid: newConv.remote_jid,
      status: newConv.status,
      contact: {
        id: contact.id,
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
        avatar_url: null,
      },
      channel: {
        id: channel.id,
        type: channel.type,
        name: channel.name,
        status: channel.status,
      },
      last_message: null,
      unread_count: 0,
      created_at: newConv.created_at,
    });
  } catch (error) {
    console.error('[Inbox] Error creating conversation:', error);
    next(error);
  }
});

// Get messages for a specific conversation from Evolution API or Database
router.get('/conversations/:conversationIdOrJid/messages', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { conversationIdOrJid } = req.params;
    const { query: dbQuery } = require('../database/connection');
    
    // First try to get instance from saved channels, fallback to legacy
    const savedInstance = await getActiveWhatsAppInstance(user.id);
    const instanceId = savedInstance || getUserInstanceName(user.id);

    // Determine the type of ID we received
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conversationIdOrJid);
    const isJid = conversationIdOrJid.includes('@');
    const isPhone = /^\d+$/.test(conversationIdOrJid);
    
    let remoteJid: string | null = null;
    let conversationId: string | null = null;
    
    console.log('[Inbox Messages] Looking for:', conversationIdOrJid, { isUUID, isJid, isPhone });

    // If it's a JID or phone, use it directly for Evolution API
    if (isJid) {
      remoteJid = conversationIdOrJid;
      // Also try to find the conversation in database
      try {
        const convResult = await dbQuery(
          'SELECT id FROM conversations WHERE remote_jid = $1 AND user_id = $2 LIMIT 1',
          [remoteJid, user.id]
        );
        if (convResult.rows.length > 0) {
          conversationId = convResult.rows[0].id;
        }
      } catch (e) {
        console.warn('[Inbox] Could not find conversation by remote_jid:', e);
      }
    } else if (isPhone) {
      remoteJid = normalizePhoneToJid(conversationIdOrJid);
    } else if (isUUID) {
      conversationId = conversationIdOrJid;
      // Try to get remote_jid from conversation
      try {
        const convResult = await dbQuery(
          'SELECT remote_jid FROM conversations WHERE id = $1 AND user_id = $2 LIMIT 1',
          [conversationId, user.id]
        );
        if (convResult.rows.length > 0) {
          remoteJid = convResult.rows[0].remote_jid;
        }
      } catch (e) {
        console.warn('[Inbox] Could not find conversation by ID:', e);
      }
    }

    // STEP 1: Try to fetch messages from local database first
    let localMessages: any[] = [];
    if (conversationId || remoteJid) {
      try {
        let msgSql = `
          SELECT 
            m.*,
            l.name as sender_name,
            l.avatar_url as sender_avatar
          FROM messages m
          LEFT JOIN leads l ON m.lead_id = l.id
          WHERE m.user_id = $1
        `;
        const msgParams: any[] = [user.id];
        let paramIdx = 2;
        
        if (conversationId) {
          msgSql += ` AND m.conversation_id = $${paramIdx}`;
          msgParams.push(conversationId);
          paramIdx++;
        } else if (remoteJid) {
          // Try to match by remote_jid in metadata
          msgSql += ` AND (m.metadata->>'remote_jid' = $${paramIdx} OR m.metadata->>'remote_jid' LIKE $${paramIdx + 1})`;
          msgParams.push(remoteJid);
          msgParams.push(`%${extractPhoneFromJid(remoteJid)}%`);
          paramIdx += 2;
        }
        
        msgSql += ` ORDER BY m.created_at ASC LIMIT $${paramIdx}`;
        msgParams.push(req.query.limit ? Number(req.query.limit) : 100);
        
        const msgResult = await dbQuery(msgSql, msgParams);
        localMessages = msgResult.rows.map((msg: any) => ({
          id: msg.id,
          conversation_id: msg.conversation_id,
          direction: msg.direction,
          channel: msg.channel || 'whatsapp',
          content: msg.content,
          status: msg.status,
          created_at: msg.created_at,
          sent_at: msg.sent_at,
          delivered_at: msg.delivered_at,
          read_at: msg.read_at,
          media_url: msg.media_url,
          media_type: msg.media_type,
          metadata: msg.metadata,
          sender: msg.direction === 'out' ? {
            id: user.id,
            name: 'Você',
            avatar_url: null,
          } : {
            id: msg.lead_id,
            name: msg.sender_name || 'Contato',
            avatar_url: msg.sender_avatar,
          }
        }));
        console.log('[Inbox] Found', localMessages.length, 'messages in local database');
      } catch (dbErr) {
        console.warn('[Inbox] Database message fetch error:', dbErr);
      }
    }

    // If we have local messages, return them
    if (localMessages.length > 0) {
      return res.json(localMessages);
    }

    // STEP 2: If no local messages and we have a JID, try Evolution API
    if ((isJid || isPhone) && whatsappService.isReady() && remoteJid) {
      try {
        console.log('[Inbox] Fetching messages from Evolution API for:', remoteJid);

        const messagesResult = await whatsappService.fetchMessages(
          instanceId,
          remoteJid,
          req.query.limit ? Number(req.query.limit) : 100
        ) as any;

        // Handle different response formats from Evolution API
        const rawMessages = Array.isArray(messagesResult)
          ? messagesResult
          : messagesResult?.messages || [];

        // Transform Evolution API messages to our format
        const messages = rawMessages.map((msg: any) => {
          const messageContent =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption ||
            msg.message?.documentMessage?.caption ||
            (msg.message?.imageMessage ? '[Imagem]' : '') ||
            (msg.message?.videoMessage ? '[Vídeo]' : '') ||
            (msg.message?.audioMessage ? '[Áudio]' : '') ||
            (msg.message?.documentMessage ? '[Documento]' : '') ||
            (msg.message?.stickerMessage ? '[Sticker]' : '') ||
            (msg.message?.contactMessage ? '[Contato]' : '') ||
            (msg.message?.locationMessage ? '[Localização]' : '') ||
            '[Mensagem]';

          return {
            id: msg.key?.id || msg.id,
            direction: msg.key?.fromMe ? 'out' : 'in',
            channel: 'whatsapp',
            content: messageContent,
            status: msg.status || 'delivered',
            created_at: msg.messageTimestamp
              ? new Date(msg.messageTimestamp * 1000).toISOString()
              : new Date().toISOString(),
            media_url: msg.message?.imageMessage?.url ||
                      msg.message?.videoMessage?.url ||
                      msg.message?.audioMessage?.url ||
                      msg.message?.documentMessage?.url || null,
            media_type: msg.message?.imageMessage ? 'image' :
                       msg.message?.videoMessage ? 'video' :
                       msg.message?.audioMessage ? 'audio' :
                       msg.message?.documentMessage ? 'document' : null,
          };
        }).sort((a: any, b: any) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );

        console.log(`[Inbox] Returning ${messages.length} messages from Evolution API`);
        return res.json(messages);
      } catch (evolutionError) {
        console.warn('[Inbox] Evolution API message fetch failed:', evolutionError);
        // Return empty since we already checked local database
        return res.json([]);
      }
    }

    // No messages found anywhere
    console.log('[Inbox] No messages found for:', conversationIdOrJid);
    res.json([]);
  } catch (error) {
    next(error);
  }
});

// Mark conversation as read
router.post('/conversations/:leadId/read', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await inboxService.markAsRead(user.id, req.params.leadId);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

// Send a message in a conversation
router.post('/conversations/:conversationIdOrJid/send', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { content, channel, media_url, media_type } = req.body;
    const messageContent = content?.trim() || '';
    
    // Content is required only if no media is attached
    if (!messageContent && !media_url) {
      return res.status(400).json({ error: 'Content or media is required' });
    }

    const { conversationIdOrJid } = req.params;
    let messageChannel = channel || 'whatsapp';
    // First try to get instance from saved channels, fallback to legacy
    const savedInstance = await getActiveWhatsAppInstance(user.id);
    const instanceId = savedInstance || getUserInstanceName(user.id);

    const { query: dbQuery } = require('../database/connection');

    // Determine the type of ID we received
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conversationIdOrJid);
    const isJid = conversationIdOrJid.includes('@');
    const isPhone = /^\d+$/.test(conversationIdOrJid);

    let phone: string | null = null;
    let leadId: string | null = null;
    let remoteJid: string | null = null;
    let conversationId: string | null = null;
    let channelId: string | null = null;
    let channelCredentials: any = null;

    console.log('[Inbox Send] Processing:', conversationIdOrJid, { isUUID, isJid, isPhone });

    // If it's a JID, extract phone and use it directly
    if (isJid) {
      remoteJid = conversationIdOrJid;
      phone = extractPhoneFromJid(conversationIdOrJid);
      // Try to find associated conversation with channel info
      try {
        const convResult = await dbQuery(
          `SELECT c.id, c.lead_id, c.channel_id, ch.type as channel_type, ch.credentials as channel_credentials
           FROM conversations c LEFT JOIN channels ch ON c.channel_id = ch.id
           WHERE c.remote_jid = $1 AND c.user_id = $2 LIMIT 1`,
          [remoteJid, user.id]
        );
        if (convResult.rows.length > 0) {
          conversationId = convResult.rows[0].id;
          leadId = convResult.rows[0].lead_id;
          channelId = convResult.rows[0].channel_id;
          if (convResult.rows[0].channel_type) {
            messageChannel = convResult.rows[0].channel_type;
          }
          channelCredentials = convResult.rows[0].channel_credentials;
          // Safe-parse credentials
          if (channelCredentials && typeof channelCredentials === 'string') {
            try { channelCredentials = JSON.parse(channelCredentials); } catch (e) { /* ignore */ }
          }
        }
      } catch (e) {
        console.warn('[Inbox] Could not find conversation by remote_jid:', e);
      }
    } else if (isPhone) {
      phone = conversationIdOrJid;
      remoteJid = normalizePhoneToJid(phone);
    } else if (isUUID) {
      // Could be a conversation ID or a lead ID
      // Try conversation first - include channel type detection
      try {
        const convResult = await dbQuery(
          `SELECT c.*, l.phone as lead_phone, l.whatsapp as lead_whatsapp,
                  ch.type as channel_type, ch.credentials as channel_credentials
           FROM conversations c
           LEFT JOIN leads l ON c.lead_id = l.id
           LEFT JOIN channels ch ON c.channel_id = ch.id
           WHERE c.id = $1 AND c.user_id = $2 LIMIT 1`,
          [conversationIdOrJid, user.id]
        );
        if (convResult.rows.length > 0) {
          conversationId = convResult.rows[0].id;
          leadId = convResult.rows[0].lead_id;
          remoteJid = convResult.rows[0].remote_jid;
          channelId = convResult.rows[0].channel_id;
          phone = convResult.rows[0].lead_phone || convResult.rows[0].lead_whatsapp || extractPhoneFromJid(remoteJid || '');
          // Auto-detect channel type from conversation's channel
          if (convResult.rows[0].channel_type) {
            messageChannel = convResult.rows[0].channel_type;
          }
          channelCredentials = convResult.rows[0].channel_credentials;
          // Safe-parse credentials
          if (channelCredentials && typeof channelCredentials === 'string') {
            try { channelCredentials = JSON.parse(channelCredentials); } catch (e) { /* ignore */ }
          }
          console.log('[Inbox Send] Found conversation:', conversationId, 'channel_type:', messageChannel, 'lead:', leadId, 'phone:', phone, 'hasCredentials:', !!channelCredentials);
        }
      } catch (e) {
        console.warn('[Inbox] Error finding conversation by ID:', e);
      }

      // If not a conversation, try as lead ID
      if (!conversationId) {
        try {
          const leadResult = await dbQuery('SELECT * FROM leads WHERE id = $1 AND user_id = $2', [conversationIdOrJid, user.id]);
          const lead = leadResult.rows[0];
          if (lead) {
            phone = lead.whatsapp || lead.phone;
            leadId = lead.id;
            remoteJid = phone ? normalizePhoneToJid(phone) : null;
            console.log('[Inbox Send] Found lead:', leadId, 'phone:', phone);
          }
        } catch (e) {
          console.warn('[Inbox] Error finding lead by ID:', e);
        }
      }
    }

    // Try to find associated lead if we have a phone
    if (!leadId && phone) {
      const normalizedPhone = normalizePhoneForMatch(phone);
      if (normalizedPhone.length >= 8) {
        try {
          const leadResult = await dbQuery(
            `SELECT * FROM leads WHERE user_id = $1 AND (
              REPLACE(REPLACE(REPLACE(phone, '+', ''), '-', ''), ' ', '') LIKE $2
              OR REPLACE(REPLACE(REPLACE(whatsapp, '+', ''), '-', ''), ' ', '') LIKE $2
            ) LIMIT 1`,
            [user.id, `%${normalizedPhone}`]
          );
          if (leadResult.rows.length > 0) {
            leadId = leadResult.rows[0].id;
            console.log('[Inbox Send] Found lead for phone:', phone, '-> leadId:', leadId);
          }
        } catch (e) {
          console.warn('[Inbox] Error finding lead by phone:', e);
        }
      }
    }

    // If we still don't have channel credentials and have a channel_id, fetch them
    if (!channelCredentials && channelId) {
      try {
        const chResult = await dbQuery('SELECT credentials, type FROM channels WHERE id = $1', [channelId]);
        if (chResult.rows.length > 0) {
          channelCredentials = chResult.rows[0].credentials;
          if (!channel) messageChannel = chResult.rows[0].type;
        }
      } catch (e) {
        console.warn('[Inbox] Error fetching channel credentials:', e);
      }
    }

    // Safe-parse credentials se vier como string (proteção contra double-stringify)
    if (channelCredentials && typeof channelCredentials === 'string') {
      try {
        channelCredentials = JSON.parse(channelCredentials);
      } catch (e) {
        console.warn('[Inbox] Failed to parse channel credentials string:', e);
      }
    }

    // For @lid JIDs, we need to send using the remoteJid directly
    const isLidFormat = remoteJid?.endsWith('@lid');
    const isGroupFormat = remoteJid?.endsWith('@g.us');

    console.log('[Inbox Send] Channel type detected:', messageChannel, 'channelId:', channelId);

    // Send via the appropriate channel
    let externalResult: any = null;

    if (messageChannel === 'whatsapp' && (phone || remoteJid)) {
      // ===== WHATSAPP (Evolution API) SENDING =====
      if (!phone && !remoteJid) {
        return res.status(400).json({ error: 'No phone number available' });
      }
      try {
        console.log('[Inbox] Sending WhatsApp message via Evolution:', { instanceId, phone, remoteJid, isLidFormat, isGroupFormat });

        const numberToSend = isLidFormat || isGroupFormat ? remoteJid : phone;

        if (media_url && media_type) {
          externalResult = await whatsappService.sendMedia({
            instanceId,
            number: numberToSend!,
            mediaUrl: media_url,
            mediaType: media_type,
            caption: messageContent || undefined,
          });
        } else {
          externalResult = await whatsappService.sendMessage({
            instanceId,
            number: numberToSend!,
            text: messageContent,
          });
        }
      } catch (whatsappError) {
        console.error('[Inbox] WhatsApp send error:', whatsappError);
        return res.status(500).json({ error: 'Failed to send WhatsApp message' });
      }

    } else if (messageChannel === 'whatsapp_cloud' && (phone || remoteJid)) {
      // ===== WHATSAPP CLOUD (Graph API) SENDING =====
      const phoneNumberId = channelCredentials?.phone_number_id;
      const accessToken = channelCredentials?.access_token;

      if (!phoneNumberId || !accessToken) {
        console.error('[Inbox] WhatsApp Cloud channel missing credentials:', channelId);
        return res.status(500).json({ error: 'WhatsApp Cloud channel not properly configured (missing phone_number_id or access_token)' });
      }

      const recipientPhone = phone?.replace(/\D/g, '') || remoteJid?.replace('@s.whatsapp.net', '');
      if (!recipientPhone) {
        return res.status(400).json({ error: 'No phone number available for WhatsApp Cloud' });
      }

      try {
        console.log('[Inbox] Sending WhatsApp Cloud message via Graph API:', { phoneNumberId, recipientPhone });

        if (media_url && media_type) {
          // Send media via WhatsApp Cloud API
          let waMediaType = 'document';
          if (media_type === 'image' || media_type?.startsWith('image')) waMediaType = 'image';
          else if (media_type === 'video' || media_type?.startsWith('video')) waMediaType = 'video';
          else if (media_type === 'audio' || media_type?.startsWith('audio')) waMediaType = 'audio';

          const mediaPayload: any = {
            messaging_product: 'whatsapp',
            to: recipientPhone,
            type: waMediaType,
            [waMediaType]: {
              link: media_url,
              ...(messageContent && waMediaType !== 'audio' ? { caption: messageContent } : {})
            }
          };

          const mediaResponse = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify(mediaPayload)
          });

          const mediaResult = await mediaResponse.json();
          if (!mediaResponse.ok) {
            console.error('[Inbox] WhatsApp Cloud media send error:', mediaResult);
            return res.status(500).json({ error: 'Failed to send media via WhatsApp Cloud', details: mediaResult?.error?.message });
          }
          externalResult = mediaResult;
        } else {
          // Send text message via WhatsApp Cloud API
          const textPayload = {
            messaging_product: 'whatsapp',
            to: recipientPhone,
            type: 'text',
            text: { body: messageContent }
          };

          const textResponse = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify(textPayload)
          });

          const textResult = await textResponse.json();
          if (!textResponse.ok) {
            console.error('[Inbox] WhatsApp Cloud text send error:', textResult);
            return res.status(500).json({ error: 'Failed to send message via WhatsApp Cloud', details: textResult?.error?.message });
          }
          externalResult = textResult;
        }
        console.log('[Inbox] WhatsApp Cloud send result:', externalResult);
      } catch (whatsappCloudError) {
        console.error('[Inbox] WhatsApp Cloud send error:', whatsappCloudError);
        return res.status(500).json({ error: 'Failed to send WhatsApp Cloud message' });
      }

    } else if (messageChannel === 'instagram' || messageChannel === 'facebook') {
      // ===== INSTAGRAM / FACEBOOK SENDING via Graph API =====
      const recipientId = remoteJid; // Instagram/Facebook uses PSID or IGSID as remote_jid
      if (!recipientId) {
        return res.status(400).json({ error: 'No recipient ID available for Instagram/Facebook' });
      }

      // Preferir page_access_token (mais confiável para Instagram/Facebook)
      const accessToken = channelCredentials?.page_access_token || channelCredentials?.access_token;
      if (!accessToken) {
        console.error('[Inbox] No access token for Instagram/Facebook channel:', channelId);
        console.error('[Inbox] Credentials available:', Object.keys(channelCredentials || {}));
        return res.status(500).json({ error: 'Canal Instagram/Facebook sem token configurado. Reconecte o canal.' });
      }

      console.log('[Inbox] Using token type:', channelCredentials?.page_access_token ? 'page_access_token' : 'access_token');
      console.log('[Inbox] Credentials keys:', Object.keys(channelCredentials || {}));

      try {
        // Resolver page_id - necessário para System User tokens (EAF)
        let pageId = channelCredentials?.page_id;

        // Se page_id não existe nas credenciais, buscar dinamicamente via Graph API
        if (!pageId) {
          console.log('[Inbox] page_id não encontrado nas credenciais, buscando via Graph API...');
          try {
            const pagesResponse = await fetch(
              `https://graph.facebook.com/v21.0/me/accounts?fields=id,name&access_token=${accessToken}`
            );
            const pagesData = await pagesResponse.json();

            if (pagesData.data && pagesData.data.length > 0) {
              pageId = pagesData.data[0].id;
              console.log('[Inbox] page_id encontrado via /me/accounts:', pageId);

              // Salvar page_id nas credenciais para não precisar buscar novamente
              if (channelId) {
                const updatedCreds = { ...channelCredentials, page_id: pageId };
                await dbQuery(
                  'UPDATE channels SET credentials = $1 WHERE id = $2',
                  [JSON.stringify(updatedCreds), channelId]
                );
                console.log('[Inbox] page_id salvo nas credenciais do canal');
              }
            } else {
              // Tentar via /me?fields=business para System User tokens
              const bizResponse = await fetch(
                `https://graph.facebook.com/v21.0/me?fields=id,name,business&access_token=${accessToken}`
              );
              const bizData = await bizResponse.json();
              const businessId = bizData?.business?.id;

              if (businessId) {
                const bizPagesResponse = await fetch(
                  `https://graph.facebook.com/v21.0/${businessId}/owned_pages?fields=id,name&access_token=${accessToken}`
                );
                const bizPagesData = await bizPagesResponse.json();
                if (bizPagesData.data && bizPagesData.data.length > 0) {
                  pageId = bizPagesData.data[0].id;
                  console.log('[Inbox] page_id encontrado via business/owned_pages:', pageId);

                  // Salvar
                  if (channelId) {
                    const updatedCreds = { ...channelCredentials, page_id: pageId };
                    await dbQuery(
                      'UPDATE channels SET credentials = $1 WHERE id = $2',
                      [JSON.stringify(updatedCreds), channelId]
                    );
                  }
                }
              }
            }
          } catch (pageErr) {
            console.warn('[Inbox] Erro ao buscar page_id dinamicamente:', pageErr);
          }
        }

        // Construir URL da Graph API
        const graphApiUrl = pageId
          ? `https://graph.facebook.com/v21.0/${pageId}/messages`
          : 'https://graph.facebook.com/v21.0/me/messages';

        console.log('[Inbox] Graph API URL:', graphApiUrl, pageId ? `(page_id: ${pageId})` : '(fallback /me)');

        if (media_url && media_type) {
          // Send media via Graph API
          let attachmentType = 'file';
          if (media_type === 'image' || media_type?.startsWith('image')) attachmentType = 'image';
          else if (media_type === 'video' || media_type?.startsWith('video')) attachmentType = 'video';
          else if (media_type === 'audio' || media_type?.startsWith('audio')) attachmentType = 'audio';

          // Send media attachment
          const mediaPayload: any = {
            recipient: { id: recipientId },
            message: {
              attachment: {
                type: attachmentType,
                payload: { url: media_url, is_reusable: true }
              }
            }
          };

          console.log('[Inbox] Sending Instagram/Facebook media:', { recipientId, attachmentType, media_url });
          const mediaResponse = await fetch(`${graphApiUrl}?access_token=${accessToken}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mediaPayload)
          });
          const mediaResult = await mediaResponse.json();

          if (!mediaResponse.ok) {
            console.error('[Inbox] Instagram/Facebook media send error:', mediaResult);
            return res.status(500).json({ error: 'Failed to send media via Instagram/Facebook', details: mediaResult?.error?.message });
          }

          externalResult = mediaResult;

          // If there's also a text caption, send it as a separate text message
          if (messageContent) {
            const textPayload = {
              recipient: { id: recipientId },
              message: { text: messageContent }
            };
            await fetch(`${graphApiUrl}?access_token=${accessToken}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(textPayload)
            });
          }
        } else {
          // Send text only
          const textPayload = {
            recipient: { id: recipientId },
            message: { text: messageContent }
          };

          console.log('[Inbox] Sending Instagram/Facebook text:', { recipientId, text: messageContent.substring(0, 50) });
          const textResponse = await fetch(`${graphApiUrl}?access_token=${accessToken}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(textPayload)
          });
          const textResult = await textResponse.json();

          if (!textResponse.ok) {
            console.error('[Inbox] Instagram/Facebook text send error:', textResult);
            return res.status(500).json({ error: 'Failed to send message via Instagram/Facebook', details: textResult?.error?.message });
          }

          externalResult = textResult;
        }

        console.log('[Inbox] Instagram/Facebook message sent:', externalResult);
      } catch (igError: any) {
        console.error('[Inbox] Instagram/Facebook send error:', igError);
        return res.status(500).json({
          error: 'Erro ao enviar mensagem via Instagram/Facebook',
          details: igError?.message || String(igError)
        });
      }

    } else if (messageChannel === 'telegram') {
      // ===== TELEGRAM SENDING via Bot API =====
      const chatId = remoteJid; // Telegram uses chat_id as remote_jid
      if (!chatId) {
        return res.status(400).json({ error: 'No chat ID available for Telegram' });
      }

      const botToken = channelCredentials?.bot_token || channelCredentials?.token;
      if (!botToken) {
        console.error('[Inbox] No bot token for Telegram channel:', channelId);
        return res.status(500).json({ error: 'Telegram channel not properly configured (missing bot_token)' });
      }

      try {
        const telegramApiUrl = `https://api.telegram.org/bot${botToken}`;

        if (media_url && media_type) {
          // Send media via Telegram Bot API
          let method = 'sendDocument';
          let mediaField = 'document';

          if (media_type === 'image' || media_type?.startsWith('image')) {
            method = 'sendPhoto';
            mediaField = 'photo';
          } else if (media_type === 'video' || media_type?.startsWith('video')) {
            method = 'sendVideo';
            mediaField = 'video';
          } else if (media_type === 'audio' || media_type?.startsWith('audio')) {
            method = 'sendAudio';
            mediaField = 'audio';
          }

          const mediaPayload: any = {
            chat_id: chatId,
            [mediaField]: media_url,
          };
          if (messageContent) {
            mediaPayload.caption = messageContent;
          }

          console.log('[Inbox] Sending Telegram media:', { chatId, method, media_url });
          const mediaResponse = await fetch(`${telegramApiUrl}/${method}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mediaPayload)
          });
          const mediaResult = await mediaResponse.json();

          if (!mediaResult.ok) {
            console.error('[Inbox] Telegram media send error:', mediaResult);
            return res.status(500).json({ error: 'Failed to send media via Telegram', details: mediaResult?.description });
          }

          externalResult = mediaResult.result;
        } else {
          // Send text only
          const textPayload = {
            chat_id: chatId,
            text: messageContent,
          };

          console.log('[Inbox] Sending Telegram text:', { chatId, text: messageContent.substring(0, 50) });
          const textResponse = await fetch(`${telegramApiUrl}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(textPayload)
          });
          const textResult = await textResponse.json();

          if (!textResult.ok) {
            console.error('[Inbox] Telegram text send error:', textResult);
            return res.status(500).json({ error: 'Failed to send message via Telegram', details: textResult?.description });
          }

          externalResult = textResult.result;
        }

        console.log('[Inbox] Telegram message sent:', externalResult?.message_id);
      } catch (tgError) {
        console.error('[Inbox] Telegram send error:', tgError);
        return res.status(500).json({ error: 'Failed to send Telegram message' });
      }
    } else if (!messageChannel || messageChannel === 'whatsapp') {
      // Fallback: WhatsApp without phone/remoteJid
      if (!phone && !remoteJid) {
        return res.status(400).json({ error: 'No phone number available' });
      }
    }

    // ALWAYS store message in database (for history tracking)
    let message = null;
    const finalRemoteJid = remoteJid || normalizePhoneToJid(phone || '');

    try {
      // If we don't have a conversation yet, find or create one
      if (!conversationId) {
        const activeChannel = await getActiveWhatsAppChannel(user.id);
        if (activeChannel) {
          const conversation = await conversationsService.findOrCreate(
            user.id,
            activeChannel.id,
            finalRemoteJid,
            leadId || undefined,
            {
              contact_name: leadId ? 'Lead' : phone,
              phone: phone,
            }
          );
          conversationId = conversation.id;
          console.log('[Inbox] Conversation found/created:', conversationId);
        }
      }

      message = await messagesService.create({
        conversation_id: conversationId,
        lead_id: leadId,
        direction: 'out',
        channel: messageChannel,
        content: messageContent || (media_type ? `[${media_type}]` : ''),
        status: 'sent',
        sent_at: new Date().toISOString(),
        external_id: externalResult?.key?.id || externalResult?.messages?.[0]?.id || externalResult?.message_id || externalResult?.message_id?.toString() || null,
        media_url: media_url || null,
        media_type: media_type || null,
        metadata: {
          external_result: externalResult,
          remote_jid: finalRemoteJid,
          phone: phone,
          channel_type: messageChannel,
        },
      }, user.id);
      console.log('[Inbox] Message saved to database:', message.id, 'conversation:', conversationId);

      // Update lead's last_contact_at if we have a lead
      if (leadId) {
        await dbQuery('UPDATE leads SET last_contact_at = NOW() WHERE id = $1', [leadId]);
      }
    } catch (dbError) {
      console.warn('[Inbox] Failed to save message to database:', dbError);
    }

    // Return the message directly (not wrapped in success object) for frontend compatibility
    res.json(message || {
      id: externalResult?.key?.id || externalResult?.message_id || `msg_${Date.now()}`,
      direction: 'out',
      channel: messageChannel,
      content: messageContent || (media_type ? `[${media_type}]` : ''),
      status: 'sent',
      created_at: new Date().toISOString(),
      media_url: media_url || null,
      media_type: media_type || null,
    });
  } catch (error) {
    next(error);
  }
});

// ✅ Delete a conversation and its messages
router.delete('/conversations/:conversationId', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { query: dbQuery } = require('../database/connection');
    const { conversationId } = req.params;

    // Verificar se a conversa pertence ao usuário
    const conv = await dbQuery(
      'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
      [conversationId, user.id]
    );

    if (conv.rows.length === 0) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    // Deletar mensagens da conversa primeiro (FK constraint)
    await dbQuery(
      'DELETE FROM messages WHERE conversation_id = $1 AND user_id = $2',
      [conversationId, user.id]
    );

    // Deletar a conversa
    await dbQuery(
      'DELETE FROM conversations WHERE id = $1 AND user_id = $2',
      [conversationId, user.id]
    );

    console.log('[Inbox] Conversa deletada:', conversationId);
    res.json({ success: true, message: 'Conversa deletada com sucesso' });
  } catch (error) {
    console.error('[Inbox] Erro ao deletar conversa:', error);
    next(error);
  }
});

// Get unread count
router.get('/unread-count', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Usar apenas contagem do banco de dados local para consistência
    // A contagem do Evolution API pode estar dessincronizada com o app
    const count = await inboxService.getUnreadCount(user.id);
    res.json({ count });
  } catch (error) {
    next(error);
  }
});

// ✅ Send Audio (Voice Message) - supports WhatsApp, Instagram, Telegram
router.post('/conversations/:conversationIdOrJid/send-audio', upload.single('audio'), async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { conversationIdOrJid } = req.params;
    const { query: dbQuery } = require('../database/connection');

    console.log('[Inbox Audio] Processing audio for:', conversationIdOrJid);
    console.log('[Inbox Audio] File received:', req.file ? { name: req.file.originalname, size: req.file.size, type: req.file.mimetype } : 'No file');

    // Detect channel type from conversation
    const isJid = conversationIdOrJid.includes('@');
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conversationIdOrJid);
    let remoteJid = isJid ? conversationIdOrJid : null;
    let phone = '';
    let channelType = 'whatsapp';
    let channelCredentials: any = null;
    let conversationId: string | null = null;

    if (isJid) {
      phone = conversationIdOrJid.replace('@s.whatsapp.net', '').replace('@lid', '').replace('@g.us', '');
      // Try to find conversation with channel info
      try {
        const convResult = await dbQuery(
          `SELECT c.id, c.channel_id, ch.type as channel_type, ch.credentials as channel_credentials
           FROM conversations c LEFT JOIN channels ch ON c.channel_id = ch.id
           WHERE c.remote_jid = $1 AND c.user_id = $2 LIMIT 1`,
          [remoteJid, user.id]
        );
        if (convResult.rows.length > 0) {
          conversationId = convResult.rows[0].id;
          if (convResult.rows[0].channel_type) channelType = convResult.rows[0].channel_type;
          channelCredentials = convResult.rows[0].channel_credentials;
        }
      } catch (e) {
        console.warn('[Inbox Audio] Error finding conversation:', e);
      }
    } else if (isUUID) {
      // Get conversation details with channel type
      try {
        const convResult = await dbQuery(
          `SELECT c.*, ch.type as channel_type, ch.credentials as channel_credentials
           FROM conversations c LEFT JOIN channels ch ON c.channel_id = ch.id
           WHERE c.id = $1 AND c.user_id = $2 LIMIT 1`,
          [conversationIdOrJid, user.id]
        );
        if (convResult.rows.length > 0) {
          conversationId = convResult.rows[0].id;
          remoteJid = convResult.rows[0].remote_jid;
          phone = remoteJid?.replace('@s.whatsapp.net', '').replace('@lid', '').replace('@g.us', '') || '';
          if (convResult.rows[0].channel_type) channelType = convResult.rows[0].channel_type;
          channelCredentials = convResult.rows[0].channel_credentials;
        }
      } catch (e) {
        console.warn('[Inbox Audio] Error finding conversation:', e);
      }
    }

    if (!remoteJid && !phone) {
      return res.status(400).json({ error: 'Invalid conversation or phone number' });
    }

    // Safe-parse credentials se vier como string
    if (channelCredentials && typeof channelCredentials === 'string') {
      try { channelCredentials = JSON.parse(channelCredentials); } catch (e) { /* ignore */ }
    }

    console.log('[Inbox Audio] Channel type:', channelType);

    // Upload audio to MinIO first
    let audioUrl = '';
    if (req.file) {
      const storageService = getStorageService();
      audioUrl = await storageService.uploadBuffer(
        req.file.buffer,
        req.file.originalname || `audio_${Date.now()}.webm`,
        req.file.mimetype || 'audio/webm',
        `inbox-media`,
        user.id
      );
      console.log('[Inbox Audio] Uploaded to:', audioUrl);
    } else if (req.body.audio_base64) {
      const base64Data = req.body.audio_base64;
      const audioBuffer = Buffer.from(base64Data, 'base64');
      const storageService = getStorageService();
      audioUrl = await storageService.uploadBuffer(
        audioBuffer,
        `audio_${Date.now()}.webm`,
        'audio/webm',
        `inbox-media`,
        user.id
      );
      console.log('[Inbox Audio] Uploaded base64 to:', audioUrl);
    }

    if (!audioUrl && !req.body.audio_url) {
      return res.status(400).json({ error: 'Audio file or URL required' });
    }

    const finalAudioUrl = audioUrl || req.body.audio_url;
    let result: any = null;

    if (channelType === 'whatsapp') {
      // ===== WhatsApp audio (Evolution API) =====
      const savedInstance = await getActiveWhatsAppInstance(user.id);
      const instanceId = savedInstance || getUserInstanceName(user.id);
      if (!instanceId) {
        return res.status(400).json({ error: 'No WhatsApp instance configured' });
      }
      result = await whatsappService.sendAudio({
        instanceId,
        number: remoteJid?.includes('@lid') || remoteJid?.includes('@g.us') ? remoteJid! : phone,
        audioUrl: finalAudioUrl,
      });
      console.log('[Inbox Audio] WhatsApp result:', result);

    } else if (channelType === 'whatsapp_cloud') {
      // ===== WhatsApp Cloud audio (Graph API) =====
      const phoneNumberId = channelCredentials?.phone_number_id;
      const accessToken = channelCredentials?.access_token;
      if (!phoneNumberId || !accessToken) {
        return res.status(500).json({ error: 'WhatsApp Cloud channel not properly configured' });
      }
      const recipientPhone = (phone || remoteJid?.replace('@s.whatsapp.net', ''))?.replace(/\D/g, '');
      if (!recipientPhone) {
        return res.status(400).json({ error: 'No phone number available for WhatsApp Cloud audio' });
      }

      // Determinar mime type do áudio (preferir OGG que é suportado pelo WhatsApp Cloud)
      let audioMimeType = req.file?.mimetype || 'audio/ogg';
      // WhatsApp Cloud suporta: audio/aac, audio/mp4, audio/mpeg, audio/amr, audio/ogg
      // Se recebemos WebM, tentar enviar como OGG (opus codec é compatível)
      if (audioMimeType.includes('webm')) {
        audioMimeType = 'audio/ogg';
      }
      const audioExtension = audioMimeType.includes('ogg') ? 'ogg' : audioMimeType.includes('mp4') ? 'm4a' : audioMimeType.includes('mpeg') ? 'mp3' : 'ogg';

      // Estratégia: Upload para WhatsApp Media API primeiro, depois enviar com media_id
      // Isso resolve problemas de URL inacessível e formato de arquivo
      let audioPayload: any;

      if (req.file?.buffer) {
        try {
          // Upload direto para WhatsApp Media API
          const mediaFormData = new FormData();
          mediaFormData.append('messaging_product', 'whatsapp');
          mediaFormData.append('type', audioMimeType);
          const audioBytes = new Uint8Array(req.file.buffer);
          mediaFormData.append('file', new Blob([audioBytes], { type: audioMimeType }), `audio.${audioExtension}`);

          console.log('[Inbox Audio] Uploading to WhatsApp Media API...', { mime: audioMimeType, size: req.file.buffer.length });
          const uploadResponse = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/media`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}` },
            body: mediaFormData
          });
          const uploadResult = await uploadResponse.json();
          console.log('[Inbox Audio] Media upload result:', uploadResult);

          if (uploadResult.id) {
            // Enviar usando media_id (mais confiável)
            audioPayload = {
              messaging_product: 'whatsapp',
              to: recipientPhone,
              type: 'audio',
              audio: { id: uploadResult.id }
            };
            console.log('[Inbox Audio] Using media_id:', uploadResult.id);
          } else {
            console.warn('[Inbox Audio] Media upload failed, falling back to link:', uploadResult);
            // Fallback para link se upload falhar
            audioPayload = {
              messaging_product: 'whatsapp',
              to: recipientPhone,
              type: 'audio',
              audio: { link: finalAudioUrl }
            };
          }
        } catch (uploadErr: any) {
          console.warn('[Inbox Audio] Media upload error, falling back to link:', uploadErr.message);
          audioPayload = {
            messaging_product: 'whatsapp',
            to: recipientPhone,
            type: 'audio',
            audio: { link: finalAudioUrl }
          };
        }
      } else {
        // Sem buffer disponível, usar link direto
        audioPayload = {
          messaging_product: 'whatsapp',
          to: recipientPhone,
          type: 'audio',
          audio: { link: finalAudioUrl }
        };
      }

      const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(audioPayload)
      });
      result = await response.json();
      if (!response.ok) {
        console.error('[Inbox Audio] WhatsApp Cloud error:', result);
        return res.status(500).json({ error: 'Failed to send audio via WhatsApp Cloud', details: result?.error?.message });
      }
      console.log('[Inbox Audio] WhatsApp Cloud result:', result);

    } else if (channelType === 'instagram' || channelType === 'facebook') {
      // ===== Instagram/Facebook audio =====
      const recipientId = remoteJid;
      const accessToken = channelCredentials?.page_access_token || channelCredentials?.access_token;
      if (!accessToken || !recipientId) {
        return res.status(500).json({ error: 'Instagram/Facebook channel not properly configured' });
      }
      const pageId = channelCredentials?.page_id;
      const graphApiUrl = pageId
        ? `https://graph.facebook.com/v21.0/${pageId}/messages`
        : 'https://graph.facebook.com/v21.0/me/messages';
      const audioPayload = {
        recipient: { id: recipientId },
        message: {
          attachment: {
            type: 'audio',
            payload: { url: finalAudioUrl, is_reusable: true }
          }
        }
      };
      const response = await fetch(`${graphApiUrl}?access_token=${accessToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(audioPayload)
      });
      result = await response.json();
      if (!response.ok) {
        console.error('[Inbox Audio] Instagram/Facebook error:', result);
        return res.status(500).json({ error: 'Failed to send audio via Instagram/Facebook', details: result?.error?.message });
      }
      console.log('[Inbox Audio] Instagram/Facebook result:', result);

    } else if (channelType === 'telegram') {
      // ===== Telegram audio =====
      const chatId = remoteJid;
      const botToken = channelCredentials?.bot_token || channelCredentials?.token;
      if (!botToken || !chatId) {
        return res.status(500).json({ error: 'Telegram channel not properly configured' });
      }
      const telegramApiUrl = `https://api.telegram.org/bot${botToken}`;
      const audioPayload = { chat_id: chatId, audio: finalAudioUrl };
      const response = await fetch(`${telegramApiUrl}/sendAudio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(audioPayload)
      });
      const tgResult = await response.json();
      if (!tgResult.ok) {
        console.error('[Inbox Audio] Telegram error:', tgResult);
        return res.status(500).json({ error: 'Failed to send audio via Telegram', details: tgResult?.description });
      }
      result = tgResult.result;
      console.log('[Inbox Audio] Telegram result:', result);
    }

    // Save to database
    const messageConversationId = conversationId || (!isJid ? conversationIdOrJid : null);
    const externalId = (result as any)?.key?.id || (result as any)?.messages?.[0]?.id || (result as any)?.message_id?.toString() || (result as any)?.message?.id || null;

    const message = await messagesService.create({
      conversation_id: messageConversationId,
      direction: 'out',
      channel: channelType,
      content: 'Mensagem de voz',
      status: 'sent',
      sent_at: new Date().toISOString(),
      external_id: externalId,
      media_url: finalAudioUrl,
      media_type: 'audio',
      metadata: { external_result: result, remote_jid: remoteJid, channel_type: channelType },
    }, user.id);

    console.log('[Inbox Audio] Message saved:', message?.id);
    res.json(message);
  } catch (error) {
    console.error('[Inbox Audio] Error:', error);
    next(error);
  }
});

// ✅ Send Sticker
router.post('/conversations/:conversationIdOrJid/send-sticker', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { conversationIdOrJid } = req.params;
    const { sticker_url, sticker_base64 } = req.body;

    if (!sticker_url && !sticker_base64) {
      return res.status(400).json({ error: 'Sticker URL or base64 required' });
    }

    console.log('[Inbox Sticker] Processing for:', conversationIdOrJid);

    // Get the instance for this user
    const savedInstance = await getActiveWhatsAppInstance(user.id);
    const instanceId = savedInstance || getUserInstanceName(user.id);

    if (!instanceId) {
      return res.status(400).json({ error: 'No WhatsApp instance configured' });
    }

    // Detect if it's a JID or UUID
    const isJid = conversationIdOrJid.includes('@');
    let remoteJid = isJid ? conversationIdOrJid : null;
    let phone = '';

    if (isJid) {
      phone = conversationIdOrJid.replace('@s.whatsapp.net', '').replace('@lid', '').replace('@g.us', '');
    } else {
      const conversation = await conversationsService.getById(conversationIdOrJid);
      if (conversation) {
        remoteJid = conversation.remote_jid;
        phone = remoteJid?.replace('@s.whatsapp.net', '').replace('@lid', '').replace('@g.us', '') || '';
      }
    }

    if (!remoteJid && !phone) {
      return res.status(400).json({ error: 'Invalid conversation or phone number' });
    }

    // Send via Evolution API
    const result = await whatsappService.sendSticker({
      instanceId,
      number: remoteJid?.includes('@lid') || remoteJid?.includes('@g.us') ? remoteJid! : phone,
      stickerUrl: sticker_url,
      stickerBase64: sticker_base64,
    });

    // Extract external ID from result
    const externalId = (result as any)?.key?.id || (result as any)?.message?.id || null;

    // Save to database
    const message = await messagesService.create({
      conversation_id: isJid ? null : conversationIdOrJid,
      direction: 'out',
      channel: 'whatsapp',
      content: '🎨 Sticker',
      status: 'sent',
      sent_at: new Date().toISOString(),
      external_id: externalId,
      media_url: sticker_url || null,
      media_type: 'sticker',
      metadata: { whatsapp_result: result, remote_jid: remoteJid },
    }, user.id);

    console.log('[Inbox Sticker] Sent successfully');
    res.json(message);
  } catch (error) {
    console.error('[Inbox Sticker] Error:', error);
    next(error);
  }
});

// Proxy de mídia: serve ficheiros do MinIO/storage através da API
// Resolve problemas de CORS, Helmet CORP e URLs internas do MinIO
// NÃO usa authMiddleware porque <img> tags não enviam Authorization headers
router.get('/media-proxy', async (req, res) => {
  try {
    const url = req.query.url as string;
    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }

    // Validar que é uma URL HTTP válida (não permitir file://, etc.)
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return res.status(400).json({ error: 'Only HTTP/HTTPS URLs are supported' });
    }

    console.log('[Media Proxy] Fetching:', url.substring(0, 200));

    const response = await fetch(url);
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch media' });
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const contentLength = response.headers.get('content-length');

    // Headers para permitir cross-origin embedding (override Helmet CORP)
    res.setHeader('Content-Type', contentType);
    if (contentLength) res.setHeader('Content-Length', contentLength);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Stream the response
    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (error: any) {
    console.error('[Media Proxy] Error:', error.message);
    res.status(500).json({ error: 'Failed to proxy media' });
  }
});

export default router;
