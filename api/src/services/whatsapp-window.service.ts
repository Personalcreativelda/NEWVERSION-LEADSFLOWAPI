// Janela de atendimento de 24 horas do WhatsApp oficial (Cloud API).
// Abre (e volta a abrir por 24 h) a cada mensagem do cliente; modelos enviados pela empresa NÃO a abrem.
// Fora dela só se pode enviar um modelo aprovado. A janela é por contacto e por número empresarial:
// uma conversa = canal (número) + remote_jid (contacto), por isso conta só a conversa.
import { query } from '../database/connection';

export const SERVICE_WINDOW_MS = 24 * 3600 * 1000;

export const WINDOW_CLOSED_MESSAGE =
  'A janela de 24 horas do WhatsApp está fechada: o cliente não escreveu nas últimas 24 horas (ou nunca escreveu). ' +
  'O WhatsApp só deixa enviar um modelo de mensagem aprovado; a conversa volta a abrir quando o cliente responder.';

export interface ServiceWindow {
  /** A regra só se aplica ao WhatsApp oficial */
  applies: boolean;
  open: boolean;
  last_inbound_at: string | null;
  expires_at: string | null;
}

const NOT_APPLICABLE: ServiceWindow = { applies: false, open: true, last_inbound_at: null, expires_at: null };

function windowFrom(lastInbound: Date | null, now = Date.now()): ServiceWindow {
  if (!lastInbound) return { applies: true, open: false, last_inbound_at: null, expires_at: null };
  const expires = lastInbound.getTime() + SERVICE_WINDOW_MS;
  return {
    applies: true,
    open: expires > now,
    last_inbound_at: lastInbound.toISOString(),
    expires_at: new Date(expires).toISOString(),
  };
}

/** Janela de uma conversa (só WhatsApp oficial; os outros canais devolvem "sempre aberta") */
export async function conversationWindow(conversationId: string, ownerIds?: string[]): Promise<ServiceWindow & { channel_id?: string }> {
  const r = await query(
    `SELECT c.channel_id, ch.type,
            (SELECT MAX(m.created_at) FROM messages m WHERE m.conversation_id = c.id AND m.direction = 'in') AS last_in
       FROM conversations c LEFT JOIN channels ch ON ch.id = c.channel_id
      WHERE c.id = $1 ${ownerIds?.length ? 'AND c.user_id = ANY($2::uuid[])' : ''}`,
    ownerIds?.length ? [conversationId, ownerIds] : [conversationId],
  );
  const row = r.rows[0];
  if (!row) return { ...NOT_APPLICABLE, applies: false };
  if (row.type !== 'whatsapp_cloud') return { ...NOT_APPLICABLE, channel_id: row.channel_id };
  return { ...windowFrom(row.last_in ? new Date(row.last_in) : null), channel_id: row.channel_id };
}

/** Janela para um contacto num número (campanhas: ainda pode não haver conversa) */
export async function contactWindow(userId: string, channelId: string, phoneDigits: string): Promise<ServiceWindow> {
  const digits = String(phoneDigits || '').replace(/\D/g, '');
  if (!digits) return windowFrom(null);
  const r = await query(
    `SELECT MAX(m.created_at) AS last_in
       FROM conversations c JOIN messages m ON m.conversation_id = c.id AND m.direction = 'in'
      WHERE c.user_id = $1 AND c.channel_id = $2 AND c.remote_jid = $3`,
    [userId, channelId, `${digits}@s.whatsapp.net`],
  );
  const last = r.rows[0]?.last_in;
  return windowFrom(last ? new Date(last) : null);
}
