import { query } from '../database/connection';
import { pushNotificationService } from './push-notification.service';

/**
 * Push no telemóvel quando um cliente escreve (WhatsApp, Instagram, Messenger, Telegram,
 * email, site). Chamado em websocket.service → emitNewMessage, por onde passam todas as
 * mensagens: só as recebidas (direction = 'in') e fora de grupos geram push.
 *
 * Não fica no histórico de notificações (o sino encheria com cada mensagem): vai direto
 * para os aparelhos. No máximo um push por conversa a cada WINDOW_MS, e a notificação usa
 * a conversa como tag (a nova substitui a anterior no telemóvel em vez de empilhar).
 */
const WINDOW_MS = 45_000;
const lastPushAt = new Map<string, number>();

const TYPE_LABEL: Record<string, string> = {
  image: 'Imagem',
  video: 'Vídeo',
  audio: 'Áudio',
  ptt: 'Áudio',
  voice: 'Áudio',
  document: 'Documento',
  file: 'Documento',
  sticker: 'Autocolante',
  location: 'Localização',
  contact: 'Contacto',
};

function preview(message: any): string {
  const text = String(message?.content ?? message?.text ?? '').replace(/\s+/g, ' ').trim();
  const type = String(message?.message_type ?? message?.type ?? 'text').toLowerCase();
  if (text && !/^\[(image|video|audio|document|sticker)\]$/i.test(text)) {
    return text.length > 140 ? `${text.slice(0, 139)}…` : text;
  }
  return TYPE_LABEL[type] || 'Nova mensagem';
}

function throttled(conversationId: string): boolean {
  const now = Date.now();
  const last = lastPushAt.get(conversationId);
  if (last && now - last < WINDOW_MS) return true;
  lastPushAt.set(conversationId, now);
  // Limpeza: o mapa não cresce para sempre
  if (lastPushAt.size > 5000) {
    for (const [key, at] of lastPushAt) if (now - at > WINDOW_MS) lastPushAt.delete(key);
  }
  return false;
}

export async function notifyInboundMessage(
  userId: string,
  data: { conversationId: string; message: any; conversation?: any },
): Promise<void> {
  const message = data.message || {};
  const direction = String(message.direction ?? '').toLowerCase();
  if (direction !== 'in' || message.from_me === true || message.fromMe === true) return;
  if (!userId || !data.conversationId || !pushNotificationService.isConfigured()) return;

  const res = await query(
    `SELECT c.id, c.remote_jid, COALESCE(c.is_group, false) AS is_group, c.metadata,
            l.name AS lead_name, l.phone AS lead_phone
       FROM conversations c
       LEFT JOIN leads l ON l.id = c.lead_id
      WHERE c.id = $1 AND c.user_id = $2
      LIMIT 1`,
    [data.conversationId, userId],
  );
  const conv = res.rows?.[0];
  if (!conv || conv.is_group || String(conv.remote_jid || '').includes('@g.us')) return;
  if (throttled(conv.id)) return;

  const meta = typeof conv.metadata === 'string' ? (() => { try { return JSON.parse(conv.metadata); } catch { return {}; } })() : (conv.metadata || {});
  const phone = String(conv.lead_phone || conv.remote_jid || '').split('@')[0];
  const contactName = String(conv.lead_name || meta.contact_name || meta.name || '').trim();
  const title = contactName && !/^\d{6,}$/.test(contactName) ? contactName : (/^\+?\d{6,}$/.test(phone) ? `+${phone.replace(/^\+/, '')}` : 'Nova mensagem');

  await pushNotificationService.sendDirect({
    userId,
    type: 'message_received',
    title,
    description: preview(message),
    category: 'messages',
    priority: 'high',
    actionUrl: `/dashboard/inbox?conversa=${conv.id}`,
    tag: `conv_${conv.id}`,
    data: { conversation_id: conv.id },
  });
}
