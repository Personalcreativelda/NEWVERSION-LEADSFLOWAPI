// GROUPS: Rotas para gerenciamento de grupos WhatsApp existentes
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { WhatsAppService } from '../services/whatsapp.service';
import { ChannelsService } from '../services/channels.service';
import { ConversationsService } from '../services/conversations.service';
import { query } from '../database/connection';

const router = Router();
const whatsappService = new WhatsAppService();
const channelsService = new ChannelsService();
const conversationsService = new ConversationsService();

// Middleware de autenticação
router.use(requireAuth);

/**
 * GET /api/groups
 * Lista todas as conversas de grupo do usuário
 */
router.get('/', async (req, res) => {
  try {
    const userId = (req as any).userId;

    const result = await query(
      `SELECT c.*,
              ch.name as channel_name, ch.type as channel_type, ch.status as channel_status
       FROM conversations c
       LEFT JOIN channels ch ON c.channel_id = ch.id
       WHERE c.user_id = $1 
         AND (c.is_group = true OR c.remote_jid LIKE '%@g.us')
       ORDER BY c.last_message_at DESC NULLS LAST`,
      [userId]
    );

    const groups = result.rows.map((row: any) => ({
      ...row,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      channel: row.channel_name ? {
        id: row.channel_id,
        name: row.channel_name,
        type: row.channel_type,
        status: row.channel_status,
      } : null,
    }));

    res.json(groups);
  } catch (error: any) {
    console.error('[Groups] Error listing groups:', error);
    res.status(500).json({ error: 'Erro ao listar grupos' });
  }
});

/**
 * POST /api/groups/sync
 * Sincroniza grupos do WhatsApp via Evolution API → conversations
 */
router.post('/sync', async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { channelId } = req.body;

    // Buscar canais WhatsApp ativos
    let channels;
    if (channelId) {
      const ch = await channelsService.findById(channelId, userId);
      channels = ch ? [ch] : [];
    } else {
      channels = await channelsService.findByType(userId, 'whatsapp');
    }

    const activeChannels = channels.filter((ch: any) => ch.status === 'active');
    if (activeChannels.length === 0) {
      return res.status(400).json({ error: 'Nenhum canal WhatsApp ativo encontrado' });
    }

    let totalSynced = 0;
    let totalNew = 0;
    const syncedGroups: any[] = [];

    for (const channel of activeChannels) {
      const instanceId = channel.credentials?.instance_name || channel.credentials?.instance_id;
      if (!instanceId) continue;

      try {
        // Buscar todos os grupos da instância
        const groups = await whatsappService.fetchAllGroups(instanceId);
        console.log(`[Groups Sync] Found ${groups.length} groups for instance ${instanceId}`);

        for (const group of groups) {
          const groupJid = group.id || group.jid || group.chatId;
          if (!groupJid || !groupJid.includes('@g.us')) continue;

          const groupName = group.subject || group.name || group.groupName || 'Grupo sem nome';
          const groupDesc = group.desc || group.description || '';
          const groupOwner = group.owner || group.groupOwner || '';
          const participantsCount = group.participants?.length || group.size || group.participantsCount || 0;
          const creation = group.creation || group.createdAt || null;
          const groupPicture = group.profilePictureUrl || group.picture || group.imgUrl || null;

          // Criar/atualizar conversa para este grupo
          const metadata = {
            is_group: true,
            group_name: groupName,
            group_description: groupDesc,
            group_owner: groupOwner,
            group_picture: groupPicture,
            participants_count: participantsCount,
            creation_timestamp: creation,
            contact_name: groupName,
          };

          const existing = await query(
            `SELECT id FROM conversations WHERE user_id = $1 AND channel_id = $2 AND remote_jid = $3`,
            [userId, channel.id, groupJid]
          );

          if (existing.rows.length > 0) {
            // Atualizar metadata do grupo existente
            await query(
              `UPDATE conversations 
               SET metadata = metadata || $1::jsonb,
                   is_group = true,
                   updated_at = NOW()
               WHERE id = $2`,
              [JSON.stringify(metadata), existing.rows[0].id]
            );
            totalSynced++;
          } else {
            // Criar nova conversa para o grupo
            await query(
              `INSERT INTO conversations (user_id, channel_id, remote_jid, is_group, metadata, status)
               VALUES ($1, $2, $3, true, $4, 'open')`,
              [userId, channel.id, groupJid, JSON.stringify(metadata)]
            );
            totalNew++;
            totalSynced++;
          }

          syncedGroups.push({
            jid: groupJid,
            name: groupName,
            participants_count: participantsCount,
            channel_id: channel.id,
          });
        }
      } catch (err: any) {
        console.error(`[Groups Sync] Error syncing groups for channel ${channel.id}:`, err.message);
      }
    }

    res.json({
      success: true,
      total_synced: totalSynced,
      total_new: totalNew,
      groups: syncedGroups,
    });
  } catch (error: any) {
    console.error('[Groups] Error syncing groups:', error);
    res.status(500).json({ error: 'Erro ao sincronizar grupos' });
  }
});

/**
 * GET /api/groups/:id/info
 * Info detalhada de um grupo via Evolution API
 */
router.get('/:id/info', async (req, res) => {
  try {
    const userId = (req as any).userId;
    const conversationId = req.params.id;

    // Buscar conversa
    const convResult = await query(
      `SELECT c.*, ch.credentials
       FROM conversations c
       JOIN channels ch ON c.channel_id = ch.id
       WHERE c.id = $1 AND c.user_id = $2`,
      [conversationId, userId]
    );

    if (convResult.rows.length === 0) {
      return res.status(404).json({ error: 'Grupo não encontrado' });
    }

    const conversation = convResult.rows[0];
    const credentials = typeof conversation.credentials === 'string'
      ? JSON.parse(conversation.credentials)
      : conversation.credentials;
    const instanceId = credentials?.instance_name || credentials?.instance_id;
    const groupJid = conversation.remote_jid;

    if (!instanceId || !groupJid?.includes('@g.us')) {
      return res.status(400).json({ error: 'Conversa não é um grupo WhatsApp válido' });
    }

    // Buscar info atualizada via Evolution API
    try {
      const groupInfo = await whatsappService.getGroupInfo(instanceId, groupJid);
      const profilePicture = await whatsappService.getGroupProfilePicture(instanceId, groupJid);

      const info = {
        id: conversationId,
        jid: groupJid,
        subject: groupInfo.subject || groupInfo.name || '',
        description: groupInfo.desc || groupInfo.description || '',
        owner: groupInfo.owner || '',
        creation: groupInfo.creation || null,
        participants_count: groupInfo.participants?.length || groupInfo.size || 0,
        profile_picture: profilePicture || groupInfo.profilePictureUrl || null,
        restrict: groupInfo.restrict || false,
        announce: groupInfo.announce || false,
      };

      // Atualizar metadata localmente
      const metadata = {
        is_group: true,
        group_name: info.subject,
        group_description: info.description,
        group_owner: info.owner,
        group_picture: info.profile_picture,
        participants_count: info.participants_count,
        contact_name: info.subject,
      };

      await query(
        `UPDATE conversations 
         SET metadata = metadata || $1::jsonb, updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify(metadata), conversationId]
      );

      res.json(info);
    } catch (err: any) {
      // Fallback: retornar dados do metadata local
      const meta = typeof conversation.metadata === 'string'
        ? JSON.parse(conversation.metadata)
        : conversation.metadata;

      res.json({
        id: conversationId,
        jid: groupJid,
        subject: meta?.group_name || meta?.contact_name || '',
        description: meta?.group_description || '',
        owner: meta?.group_owner || '',
        participants_count: meta?.participants_count || 0,
        profile_picture: meta?.group_picture || null,
        _source: 'cache',
        _error: err.message,
      });
    }
  } catch (error: any) {
    console.error('[Groups] Error getting group info:', error);
    res.status(500).json({ error: 'Erro ao buscar informações do grupo' });
  }
});

/**
 * GET /api/groups/:id/members
 * Lista membros de um grupo
 */
router.get('/:id/members', async (req, res) => {
  try {
    const userId = (req as any).userId;
    const conversationId = req.params.id;

    // Buscar conversa
    const convResult = await query(
      `SELECT c.remote_jid, ch.credentials
       FROM conversations c
       JOIN channels ch ON c.channel_id = ch.id
       WHERE c.id = $1 AND c.user_id = $2`,
      [conversationId, userId]
    );

    if (convResult.rows.length === 0) {
      return res.status(404).json({ error: 'Grupo não encontrado' });
    }

    const conversation = convResult.rows[0];
    const credentials = typeof conversation.credentials === 'string'
      ? JSON.parse(conversation.credentials)
      : conversation.credentials;
    const instanceId = credentials?.instance_name || credentials?.instance_id;
    const groupJid = conversation.remote_jid;

    if (!instanceId || !groupJid?.includes('@g.us')) {
      return res.status(400).json({ error: 'Conversa não é um grupo WhatsApp válido' });
    }

    const participants = await whatsappService.getGroupParticipants(instanceId, groupJid);

    // Normalizar formato dos participantes
    const members = participants.map((p: any) => ({
      jid: p.id || p.jid || p.participant,
      phone: (p.id || p.jid || p.participant || '').replace('@s.whatsapp.net', '').replace('@lid', ''),
      name: p.name || p.pushName || p.notify || null,
      role: p.admin === 'admin' ? 'admin' : p.admin === 'superadmin' ? 'superadmin' : p.role || 'member',
      profile_picture: p.profilePictureUrl || p.imgUrl || null,
    }));

    res.json({
      group_jid: groupJid,
      conversation_id: conversationId,
      total: members.length,
      members,
    });
  } catch (error: any) {
    console.error('[Groups] Error getting group members:', error);
    res.status(500).json({ error: 'Erro ao listar membros do grupo' });
  }
});

/**
 * GET /api/groups/:id/invite-link
 * Obtém link de convite do grupo
 */
router.get('/:id/invite-link', async (req, res) => {
  try {
    const userId = (req as any).userId;
    const conversationId = req.params.id;

    const convResult = await query(
      `SELECT c.remote_jid, ch.credentials
       FROM conversations c
       JOIN channels ch ON c.channel_id = ch.id
       WHERE c.id = $1 AND c.user_id = $2`,
      [conversationId, userId]
    );

    if (convResult.rows.length === 0) {
      return res.status(404).json({ error: 'Grupo não encontrado' });
    }

    const conversation = convResult.rows[0];
    const credentials = typeof conversation.credentials === 'string'
      ? JSON.parse(conversation.credentials)
      : conversation.credentials;
    const instanceId = credentials?.instance_name || credentials?.instance_id;
    const groupJid = conversation.remote_jid;

    if (!instanceId || !groupJid?.includes('@g.us')) {
      return res.status(400).json({ error: 'Conversa não é um grupo WhatsApp válido' });
    }

    const inviteLink = await whatsappService.getGroupInviteLink(instanceId, groupJid);

    if (!inviteLink) {
      return res.status(400).json({ error: 'Não foi possível gerar o link de convite. Verifique se você é admin do grupo.' });
    }

    res.json({ invite_link: inviteLink });
  } catch (error: any) {
    console.error('[Groups] Error getting invite link:', error);
    res.status(500).json({ error: 'Erro ao obter link de convite' });
  }
});

export default router;
