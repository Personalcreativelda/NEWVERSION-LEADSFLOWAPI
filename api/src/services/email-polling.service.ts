// INBOX: Serviço de polling IMAP para receber emails na caixa de entrada
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { query } from '../database/connection';
import { ConversationsService } from './conversations.service';
import { getWebSocketService } from './websocket.service';
import { getStorageService } from './storage.service';

const conversationsService = new ConversationsService();

interface EmailChannel {
  id: string;
  user_id: string;
  name: string;
  credentials: {
    email: string;
    password: string;
    provider: string;
    imap: {
      host: string;
      port: number;
      secure: boolean;
      auth: { user: string; pass: string };
    };
  };
}

class EmailPollingService {
  private intervalId: NodeJS.Timeout | null = null;
  private isPolling = false;
  private pollIntervalMs = 60000; // Poll every 60 seconds
  private lastUids: Map<string, number> = new Map(); // channelId -> lastUID

  start() {
    if (this.intervalId) return;

    console.log('[Email Polling] Starting email polling service...');

    // Initial poll after 10 seconds
    setTimeout(() => this.pollAllChannels(), 10000);

    // Then poll every interval
    this.intervalId = setInterval(() => this.pollAllChannels(), this.pollIntervalMs);
    console.log(`[Email Polling] Polling every ${this.pollIntervalMs / 1000}s`);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log('[Email Polling] Stopped');
  }

  private async pollAllChannels() {
    if (this.isPolling) {
      console.log('[Email Polling] Already polling, skipping...');
      return;
    }

    this.isPolling = true;

    try {
      // Find all active email channels with IMAP config
      const result = await query(
        `SELECT * FROM channels WHERE type = 'email' AND status = 'active'`
      );

      const channels: EmailChannel[] = result.rows.filter(
        (ch: any) => ch.credentials?.imap?.host && ch.credentials?.imap?.auth?.user
      );

      if (channels.length === 0) {
        return; // No email channels to poll
      }

      console.log(`[Email Polling] Polling ${channels.length} email channel(s)...`);

      for (const channel of channels) {
        try {
          await this.pollChannel(channel);
        } catch (err: any) {
          console.error(`[Email Polling] Error polling channel ${channel.id}:`, err.message);
        }
      }
    } catch (err: any) {
      console.error('[Email Polling] Error fetching channels:', err.message);
    } finally {
      this.isPolling = false;
    }
  }

  private async pollChannel(channel: EmailChannel) {
    const { imap } = channel.credentials;
    if (!imap?.host || !imap?.auth?.user || !imap?.auth?.pass) {
      return;
    }

    let client: ImapFlow | null = null;

    try {
      client = new ImapFlow({
        host: imap.host,
        port: imap.port || 993,
        secure: imap.secure !== false,
        auth: {
          user: imap.auth.user,
          pass: imap.auth.pass,
        },
        logger: false, // Quiet logging
        emitLogs: false,
      });

      await client.connect();

      // Open INBOX
      const lock = await client.getMailboxLock('INBOX');

      try {
        // Get the last known UID for this channel
        let lastUid = this.lastUids.get(channel.id) || 0;
        const isFirstSync = lastUid === 0;

        // If first time, check what we already have in DB
        if (lastUid === 0) {
          const lastMsg = await query(
            `SELECT metadata->>'imap_uid' as uid FROM messages
             WHERE conversation_id IN (SELECT id FROM conversations WHERE channel_id = $1)
             AND direction = 'in' AND metadata->>'imap_uid' IS NOT NULL
             ORDER BY created_at DESC LIMIT 1`,
            [channel.id]
          );
          if (lastMsg.rows.length > 0 && lastMsg.rows[0].uid) {
            lastUid = parseInt(lastMsg.rows[0].uid) || 0;
          }
        }

        let searchCriteria: string;
        let newCount = 0;
        const maxMessages = isFirstSync && lastUid === 0 ? 20 : 100;
        let processed = 0;

        if (lastUid > 0) {
          // Incremental sync: fetch only new messages after last known UID
          searchCriteria = `${lastUid + 1}:*`;
        } else {
          // First time sync: fetch only recent emails (last 30 days)
          // Use mailbox uidNext to calculate starting point for recent messages
          const mailboxStatus = client.mailbox;
          const uidNext = (mailboxStatus as any)?.uidNext || 0;

          if (uidNext > 0) {
            // Fetch only the last ~50 UIDs to find the 20 most recent
            const startUid = Math.max(1, uidNext - 50);
            searchCriteria = `${startUid}:*`;
            console.log(`[Email Polling] First sync for ${channel.name}: fetching UIDs ${startUid}:* (uidNext: ${uidNext})`);
          } else {
            // Fallback: use date-based search for last 30 days
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const dateStr = thirtyDaysAgo.toISOString().split('T')[0].replace(/-/g, '');
            searchCriteria = '1:*';
            console.log(`[Email Polling] First sync for ${channel.name}: fetching all (fallback)`);
          }
        }

        for await (const msg of client.fetch(searchCriteria, {
          envelope: true,
          source: true,
          uid: true
        })) {
          if (processed >= maxMessages) break;

          // Skip if we already have this UID
          if (msg.uid <= lastUid) continue;

          try {
            const parsed = await simpleParser(msg.source);

            const fromAddress = parsed.from?.value?.[0]?.address || '';
            const fromName = parsed.from?.value?.[0]?.name || fromAddress;
            const subject = parsed.subject || '(Sem assunto)';
            const textContent = parsed.text || (typeof parsed.html === 'string' ? parsed.html.replace(/<[^>]*>/g, '') : '') || '';
            const emailMessageId = parsed.messageId || `imap_${msg.uid}_${Date.now()}`;

            // Check if we already have this message
            const existing = await query(
              `SELECT id FROM messages WHERE external_id = $1 AND user_id = $2`,
              [emailMessageId, channel.user_id]
            );
            if (existing.rows.length > 0) {
              if (msg.uid > lastUid) lastUid = msg.uid;
              continue;
            }

            // Skip emails sent by us (from our own email)
            if (fromAddress.toLowerCase() === channel.credentials.email?.toLowerCase()) {
              if (msg.uid > lastUid) lastUid = msg.uid;
              continue;
            }

            // Find or create lead from email
            const phone = ''; // Emails don't have phone
            let leadResult = await query(
              `SELECT * FROM leads WHERE user_id = $1 AND email = $2`,
              [channel.user_id, fromAddress]
            );

            let leadId: string;
            if (leadResult.rows.length === 0) {
              const newLead = await query(
                `INSERT INTO leads (user_id, name, email, source, status)
                 VALUES ($1, $2, $3, 'email', 'new') RETURNING *`,
                [channel.user_id, fromName, fromAddress]
              );
              leadId = newLead.rows[0].id;
            } else {
              leadId = leadResult.rows[0].id;
            }

            // Find or create conversation
            const remoteJid = fromAddress; // Use email as remote_jid
            const conversation = await conversationsService.findOrCreate(
              channel.user_id,
              channel.id,
              remoteJid,
              leadId,
              { contact_name: fromName, phone: '' }
            );

            // Handle attachments
            let mediaUrl: string | null = null;
            let mediaType: string | null = null;

            if (parsed.attachments && parsed.attachments.length > 0) {
              const firstAttachment = parsed.attachments[0];
              try {
                const storageService = getStorageService();
                const filename = firstAttachment.filename || `email_attachment_${Date.now()}`;
                mediaUrl = await storageService.uploadBuffer(
                  firstAttachment.content,
                  filename,
                  firstAttachment.contentType || 'application/octet-stream',
                  'inbox-media',
                  channel.user_id
                );

                if (firstAttachment.contentType?.startsWith('image')) mediaType = 'image';
                else if (firstAttachment.contentType?.startsWith('audio')) mediaType = 'audio';
                else if (firstAttachment.contentType?.startsWith('video')) mediaType = 'video';
                else mediaType = 'document';
              } catch (attachErr: any) {
                console.warn('[Email Polling] Failed to upload attachment:', attachErr.message);
              }
            }

            // Build message content
            const content = subject
              ? `**${subject}**\n\n${textContent.substring(0, 2000)}`
              : textContent.substring(0, 2000);

            // Save message
            const savedMsg = await query(
              `INSERT INTO messages (
                user_id, conversation_id, lead_id, direction, channel,
                content, media_url, media_type, status, external_id, metadata
              ) VALUES ($1, $2, $3, 'in', 'email', $4, $5, $6, 'delivered', $7, $8)
              RETURNING *`,
              [
                channel.user_id,
                conversation.id,
                leadId,
                content,
                mediaUrl,
                mediaType,
                emailMessageId,
                JSON.stringify({
                  from: fromAddress,
                  from_name: fromName,
                  subject: subject,
                  imap_uid: msg.uid,
                  has_attachments: (parsed.attachments?.length || 0) > 0,
                  attachment_count: parsed.attachments?.length || 0,
                })
              ]
            );

            // Update conversation
            await conversationsService.updateUnreadCount(conversation.id, 1);
            await query(
              `UPDATE conversations SET last_message_at = NOW(),
               status = CASE WHEN status = 'closed' THEN 'open' ELSE status END,
               updated_at = NOW() WHERE id = $1`,
              [conversation.id]
            );

            // Emit WebSocket event
            const wsService = getWebSocketService();
            if (wsService) {
              wsService.emitNewMessage(channel.user_id, {
                conversationId: conversation.id,
                message: savedMsg.rows[0],
                conversation: conversation,
              });
            }

            newCount++;
            if (msg.uid > lastUid) lastUid = msg.uid;
          } catch (msgErr: any) {
            console.warn(`[Email Polling] Error processing message UID ${msg.uid}:`, msgErr.message);
            if (msg.uid > lastUid) lastUid = msg.uid;
          }

          processed++;
        }

        // Save last UID
        this.lastUids.set(channel.id, lastUid);

        if (newCount > 0) {
          console.log(`[Email Polling] Channel ${channel.name}: ${newCount} new email(s)`);
        }
      } finally {
        lock.release();
      }

      await client.logout();
    } catch (err: any) {
      console.error(`[Email Polling] IMAP error for ${channel.name}:`, err.message);
      // Don't throw - other channels should still be polled
    } finally {
      if (client) {
        try { client.close(); } catch (_) {}
      }
    }
  }
}

export const emailPollingService = new EmailPollingService();
