// Reações, edições e mensagens apagadas do WhatsApp: mudam uma mensagem que já existe (não são
// balões novos) e o painel atualiza-a em tempo real.
import { query } from '../database/connection';
import { getWebSocketService } from './websocket.service';
import type { WhatsAppEvent } from '../utils/whatsapp-message';

export interface MessageReaction { emoji: string; from: 'me' | 'contact'; at: string }

export async function applyWhatsAppEvent(userId: string, event: WhatsAppEvent, fromMe: boolean) {
  if (event.kind === 'ignore') return null;
  const found = await query(
    'SELECT * FROM messages WHERE user_id = $1 AND external_id = $2 ORDER BY created_at DESC LIMIT 1',
    [userId, event.targetId],
  );
  const target = found.rows[0];
  if (!target) return null;
  const meta = target.metadata && typeof target.metadata === 'object' ? target.metadata : {};

  let updated: any = null;
  if (event.kind === 'reaction') {
    // Uma reação por lado; reação vazia = tirou a reação
    const side: MessageReaction['from'] = fromMe ? 'me' : 'contact';
    const reactions: MessageReaction[] = (Array.isArray(meta.reactions) ? meta.reactions : []).filter((r: any) => r?.from !== side);
    if (event.emoji) reactions.push({ emoji: event.emoji.slice(0, 16), from: side, at: new Date().toISOString() });
    updated = (await query(
      `UPDATE messages SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb WHERE id = $1 RETURNING *`,
      [target.id, JSON.stringify({ reactions })],
    )).rows[0];
  } else if (event.kind === 'revoke') {
    updated = (await query(
      `UPDATE messages SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"deleted": true}'::jsonb WHERE id = $1 RETURNING *`,
      [target.id],
    )).rows[0];
  } else if (event.kind === 'edit') {
    updated = (await query(
      `UPDATE messages SET content = $2,
              metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('edited', true, 'original_content', COALESCE(metadata->>'original_content', content))
        WHERE id = $1 RETURNING *`,
      [target.id, event.text],
    )).rows[0];
  }

  if (updated) {
    getWebSocketService()?.emitToUser(userId, 'message_updated', { conversationId: updated.conversation_id, message: updated });
  }
  return updated;
}
