// Comentário → mensagem privada (Instagram e Facebook), pela API oficial da Meta.
// Quem comenta uma publicação (com uma das palavras escolhidas, ou qualquer comentário) recebe
// uma mensagem privada ("private reply"), opcionalmente uma resposta pública no comentário, e
// entra como lead. Quando responde à mensagem, a conversa segue na caixa de entrada como as outras.
//
// Regras da Meta: uma única resposta privada por comentário, até 7 dias depois do comentário.
import { query } from '../database/connection';
import { isInstagramLoginToken, metaMessagesUrl } from '../utils/meta-send';
import { checkLeadLimit } from '../middleware/plan-enforcement.middleware';
import { ConversationsService } from './conversations.service';
import { getWebSocketService } from './websocket.service';
import { subscribePage } from './meta-oauth.service';
import { commentsEnabled, facebookCommentFields, facebookCommentsEnabled } from '../utils/meta-comments';

const conversationsService = new ConversationsService();
// Os mesmos campos do Messenger que o login subscreve (a Meta substitui a lista inteira)
const MESSENGER_FIELDS = ['messages', 'messaging_postbacks', 'messaging_optins', 'message_deliveries', 'message_reads'];

const FB_GRAPH = 'https://graph.facebook.com/v21.0';
const IG_GRAPH = 'https://graph.instagram.com/v21.0';
const TIMEOUT_MS = 15_000;

export type CommentPlatform = 'instagram' | 'facebook';

export interface CommentEvent {
  platform: CommentPlatform;
  accountId: string;        // entry.id: página (Facebook) ou conta profissional (Instagram)
  commentId: string;
  text: string;
  fromId: string;
  fromName: string;
  postId: string | null;
}

/** Sem acentos, minúsculas e espaços simples (para comparar palavras-chave) */
export function normalizeText(t: string): string {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** A regra aplica-se a este comentário? Sem palavras = qualquer comentário; sem publicações = todas */
export function matchesAutomation(a: { keywords: string[]; post_ids: string[] }, ev: Pick<CommentEvent, 'text' | 'postId'>): boolean {
  const posts = (a.post_ids || []).filter(Boolean);
  if (posts.length && (!ev.postId || !posts.includes(ev.postId))) return false;
  const words = (a.keywords || []).map(normalizeText).filter(Boolean);
  if (!words.length) return true;
  const text = normalizeText(ev.text);
  return words.some((w) => text.includes(w));
}

/** {{nome}} → primeiro nome de quem comentou */
export function renderCommentText(template: string, name: string): string {
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  return String(template || '')
    .replace(/\{\{\s*(nome|name|primeiro_nome)\s*\}\}/gi, first)
    .replace(/[ \t]+([,.!?])/g, '$1')
    .trim();
}

/** Lê o evento "changes" de um webhook. Devolve null quando não é um comentário novo de outra pessoa. */
export function parseCommentChange(platform: CommentPlatform, accountId: string, change: any): CommentEvent | null {
  const v = change?.value || {};
  if (platform === 'instagram') {
    if (change?.field !== 'comments' || !v.id) return null;
    const fromId = String(v.from?.id || '');
    if (!fromId || fromId === String(accountId)) return null; // comentário da própria conta
    return {
      platform, accountId: String(accountId), commentId: String(v.id), text: String(v.text || ''),
      fromId, fromName: String(v.from?.username || ''), postId: v.media?.id ? String(v.media.id) : null,
    };
  }
  if (change?.field !== 'feed' || v.item !== 'comment' || v.verb !== 'add' || !v.comment_id) return null;
  const fromId = String(v.from?.id || '');
  if (!fromId || fromId === String(accountId)) return null; // comentário da própria página
  return {
    platform, accountId: String(accountId), commentId: String(v.comment_id), text: String(v.message || ''),
    fromId, fromName: String(v.from?.name || ''), postId: v.post_id ? String(v.post_id) : null,
  };
}

async function postJson(url: string, token: string, body: unknown) {
  const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) throw new Error(data?.error?.message || `Erro ${res.status} da Meta`);
  return data;
}

async function findChannel(ev: CommentEvent) {
  const r = ev.platform === 'instagram'
    ? await query(
        `SELECT * FROM channels WHERE type = 'instagram' AND status = 'active'
            AND (credentials->>'instagram_id' = $1 OR credentials->>'page_id' = $1) LIMIT 1`,
        [ev.accountId],
      )
    : await query(
        `SELECT * FROM channels WHERE type = 'facebook' AND status = 'active' AND credentials->>'page_id' = $1 LIMIT 1`,
        [ev.accountId],
      );
  return r.rows[0] || null;
}

/** Lead de quem comentou: reutiliza o que já existe para esta pessoa, senão cria (se o plano deixar) */
async function upsertLead(userId: string, ev: CommentEvent, tag: string | null): Promise<string | null> {
  // Sem saber quem comentou (a Meta pode não o enviar) não há lead a criar
  if (!ev.fromId) return null;
  const found = await query(
    `SELECT id, tags FROM leads WHERE user_id = $1 AND custom_fields->>'social_id' = $2 LIMIT 1`,
    [userId, ev.fromId],
  );
  const tags = [ev.platform === 'instagram' ? 'comentario-instagram' : 'comentario-facebook', ...(tag ? [tag] : [])];
  if (found.rows[0]) {
    await query(
      `UPDATE leads SET tags = (SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(tags, '{}') || $2::text[]))), updated_at = NOW()
        WHERE id = $1`,
      [found.rows[0].id, tags],
    );
    return found.rows[0].id;
  }
  const limit = await checkLeadLimit(userId);
  if (!limit.allowed) return null;
  const created = await query(
    `INSERT INTO leads (user_id, name, source, status, tags, notes, custom_fields)
     VALUES ($1, $2, $3, 'novo', $4, $5, $6) RETURNING id`,
    [
      userId,
      ev.fromName || (ev.platform === 'instagram' ? 'Instagram' : 'Facebook'),
      ev.platform === 'instagram' ? 'Comentário no Instagram' : 'Comentário no Facebook',
      tags,
      ev.text ? `Comentou: "${ev.text.slice(0, 500)}"` : null,
      JSON.stringify({
        social_id: ev.fromId,
        social_platform: ev.platform,
        ...(ev.platform === 'instagram' && ev.fromName ? { instagram: ev.fromName } : {}),
      }),
    ],
  );
  return created.rows[0]?.id || null;
}

/** Erro que a caixa de entrada mostra tal como está */
export class CommentReplyError extends Error {}

/** Conversa de um comentário: comment:<quem comentou> (ou o próprio comentário, se a Meta não disser quem foi) */
export const commentJid = (ev: Pick<CommentEvent, 'fromId' | 'commentId'>) => `comment:${ev.fromId || ev.commentId}`;
export const isCommentJid = (jid?: string | null) => String(jid || '').startsWith('comment:');

async function emitToInbox(userId: string, conversationId: string, message: any) {
  const ws = getWebSocketService();
  if (!ws) return;
  const conv = await query(
    `SELECT c.*, ch.name AS channel_name, l.name AS lead_name
       FROM conversations c LEFT JOIN channels ch ON c.channel_id = ch.id LEFT JOIN leads l ON c.lead_id = l.id
      WHERE c.id = $1`,
    [conversationId],
  );
  ws.emitNewMessage(userId, { conversationId, message, conversation: conv.rows[0] });
  const unread = await query('SELECT SUM(unread_count) AS total FROM conversations WHERE user_id = $1', [userId]);
  ws.emitUnreadCountUpdate(userId, { totalUnread: parseInt(unread.rows[0]?.total || '0', 10), conversationId });
}

export class CommentAutomationService {
  /** Trata um evento "changes" de um webhook da Meta. Nunca lança: os erros ficam no registo. */
  async handleChange(platform: CommentPlatform, accountId: string, change: any): Promise<void> {
    const ev = parseCommentChange(platform, accountId, change);
    if (!ev) return;
    try {
      await this.handle(ev);
    } catch (err: any) {
      console.error(`[CommentAutomation] ${platform} ${ev.commentId}:`, err?.message || err);
    }
  }

  private enabledFor(platform: CommentPlatform) {
    return platform === 'facebook' ? facebookCommentsEnabled() : commentsEnabled();
  }

  /**
   * Cada comentário entra na caixa de entrada (sem configuração). Se houver uma regra que se
   * aplique, sai também a mensagem privada automática.
   */
  async handle(ev: CommentEvent): Promise<'sent' | 'failed' | 'skipped'> {
    if (!this.enabledFor(ev.platform)) return 'skipped';
    const channel = await findChannel(ev);
    if (!channel) return 'skipped';

    const rules = await query(
      `SELECT * FROM comment_automations WHERE channel_id = $1 AND enabled ORDER BY created_at`,
      [channel.id],
    );
    const rule = rules.rows.find((a: any) => matchesAutomation(a, ev));

    const leadId = await upsertLead(channel.user_id, ev, rule?.tag || null).catch((err: any) => {
      console.warn('[CommentAutomation] Lead não criado:', err?.message);
      return null;
    });
    const conversationId = await this.recordInInbox(ev, channel, leadId).catch((err: any) => {
      console.error('[CommentAutomation] Comentário não gravado na caixa de entrada:', err?.message);
      return null;
    });
    if (!rule) return 'skipped';

    // A Meta reenvia eventos: o comentário só recebe uma resposta privada
    const claimed = await query(
      `INSERT INTO comment_replies (comment_id, automation_id, user_id, channel_id, platform, commenter_id, commenter_name, comment_text, lead_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (comment_id) DO NOTHING RETURNING id`,
      [ev.commentId, rule.id, channel.user_id, channel.id, ev.platform, ev.fromId || null, ev.fromName || null, ev.text.slice(0, 2000), leadId],
    );
    const replyId = claimed.rows[0]?.id;
    if (!replyId) return 'skipped';

    const creds = channel.credentials || {};
    const token: string = creds.page_access_token || creds.access_token || '';
    const pageId: string | null = creds.page_id || null;
    const text = renderCommentText(rule.dm_message, ev.fromName);
    let error: string | null = null;
    let externalId: string | null = null;

    try {
      if (!token) throw new Error('O canal não tem token de acesso. Ligue-o de novo.');
      const sent = await postJson(metaMessagesUrl(token, pageId), token, {
        recipient: { comment_id: ev.commentId },
        message: { text },
      });
      externalId = sent?.message_id || null;
    } catch (err: any) {
      error = String(err?.message || 'Não foi possível enviar a mensagem privada').slice(0, 500);
    }

    // Resposta pública: só com a permissão aprovada, e depois de a privada sair
    if (!error && rule.public_reply && commentsEnabled()) {
      const url = ev.platform === 'facebook'
        ? `${FB_GRAPH}/${encodeURIComponent(ev.commentId)}/comments`
        : `${isInstagramLoginToken(token) ? IG_GRAPH : FB_GRAPH}/${encodeURIComponent(ev.commentId)}/replies`;
      await postJson(url, token, { message: renderCommentText(rule.public_reply, ev.fromName) }).catch((err: any) => {
        console.warn('[CommentAutomation] Resposta pública falhou:', err?.message);
      });
    }

    // A resposta automática também aparece na conversa
    if (!error && conversationId) {
      const out = await query(
        `INSERT INTO messages (user_id, conversation_id, lead_id, direction, channel, content, status, external_id, metadata)
         VALUES ($1, $2, $3, 'out', $4, $5, 'sent', $6, $7) RETURNING *`,
        [channel.user_id, conversationId, leadId, ev.platform, text, externalId,
          JSON.stringify({ kind: 'comment_reply', comment_id: ev.commentId, automation_id: rule.id })],
      ).catch(() => null);
      if (out?.rows[0]) await emitToInbox(channel.user_id, conversationId, out.rows[0]).catch(() => {});
    }

    await query(`UPDATE comment_replies SET status = $2, error = $3 WHERE id = $1`, [replyId, error ? 'failed' : 'sent', error]);
    return error ? 'failed' : 'sent';
  }

  /** Grava o comentário na caixa de entrada (uma conversa por pessoa) e avisa o painel */
  async recordInInbox(ev: CommentEvent, channel: any, leadId: string | null): Promise<string> {
    const meta = { is_comment: true, last_comment_id: ev.commentId, post_id: ev.postId, comment_from_id: ev.fromId || null };
    const conv: any = await conversationsService.findOrCreate(
      channel.user_id, channel.id, commentJid(ev), leadId || undefined,
      { contact_name: ev.fromName || (ev.platform === 'facebook' ? 'Comentário no Facebook' : 'Comentário no Instagram'), ...meta },
    );

    // A Meta reenvia eventos: o mesmo comentário só entra uma vez
    const dup = await query('SELECT 1 FROM messages WHERE user_id = $1 AND external_id = $2 LIMIT 1', [channel.user_id, ev.commentId]);
    if (dup.rows.length) return conv.id;

    await query(
      `UPDATE conversations
          SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb, last_message_at = NOW(), updated_at = NOW(),
              status = CASE WHEN status IN ('closed', 'resolved') THEN 'open' ELSE status END
        WHERE id = $1`,
      [conv.id, JSON.stringify(meta)],
    );
    const saved = await query(
      `INSERT INTO messages (user_id, conversation_id, lead_id, direction, channel, content, status, external_id, metadata)
       VALUES ($1, $2, $3, 'in', $4, $5, 'delivered', $6, $7) RETURNING *`,
      [channel.user_id, conv.id, leadId, ev.platform, ev.text || '[comentário]', ev.commentId,
        JSON.stringify({ kind: 'comment', comment_id: ev.commentId, post_id: ev.postId, from_id: ev.fromId || null })],
    );
    await conversationsService.updateUnreadCount(conv.id, 1);
    await emitToInbox(channel.user_id, conv.id, saved.rows[0]).catch(() => {});
    return conv.id;
  }

  /**
   * Resposta escrita na caixa de entrada numa conversa de comentário: vai como mensagem privada ao
   * último comentário ainda sem resposta (a Meta só deixa uma por comentário, até 7 dias depois).
   * Quando a pessoa responde, a conversa continua por mensagem (Messenger).
   */
  async replyFromInbox(conversationId: string, credentials: any, text: string): Promise<{ message_id?: string }> {
    const r = await query(
      `SELECT m.metadata->>'comment_id' AS comment_id
         FROM messages m
        WHERE m.conversation_id = $1 AND m.direction = 'in' AND m.metadata->>'comment_id' IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM comment_replies cr WHERE cr.comment_id = m.metadata->>'comment_id')
        ORDER BY m.created_at DESC LIMIT 1`,
      [conversationId],
    );
    const commentId: string | undefined = r.rows[0]?.comment_id;
    if (!commentId) {
      throw new CommentReplyError('Já respondeu a este comentário. Quando a pessoa responder, a conversa continua por mensagem.');
    }
    const token: string = credentials?.page_access_token || credentials?.access_token || '';
    if (!token) throw new CommentReplyError('O canal não tem token de acesso. Ligue-o de novo.');

    let sent: any;
    try {
      sent = await postJson(metaMessagesUrl(token, credentials?.page_id || null), token, {
        recipient: { comment_id: commentId },
        message: { text },
      });
    } catch (err: any) {
      throw new CommentReplyError(`A Meta recusou a resposta: ${err?.message || 'erro desconhecido'}`);
    }
    await query(
      `INSERT INTO comment_replies (comment_id, user_id, channel_id, platform, status)
       SELECT $1, c.user_id, c.channel_id, ch.type, 'sent'
         FROM conversations c JOIN channels ch ON ch.id = c.channel_id WHERE c.id = $2
       ON CONFLICT (comment_id) DO NOTHING`,
      [commentId, conversationId],
    );
    return sent || {};
  }

  /** Páginas ligadas antes desta funcionalidade: subscreve também os comentários (uma vez por canal) */
  async subscribeExistingPages(): Promise<void> {
    if (!facebookCommentsEnabled()) return;
    const r = await query(
      `SELECT * FROM channels WHERE type = 'facebook' AND status = 'active'
          AND COALESCE(settings->>'comments_subscribed', '') = ''`,
    );
    for (const ch of r.rows) {
      const creds = ch.credentials || {};
      const token = creds.page_access_token || creds.access_token;
      if (!token || !creds.page_id) continue;
      const sub = await subscribePage(creds.page_id, token, [...MESSENGER_FIELDS, ...facebookCommentFields()]).catch(() => ({ ok: false }));
      if (sub.ok) {
        await query(
          `UPDATE channels SET settings = COALESCE(settings, '{}'::jsonb) || '{"comments_subscribed": true}'::jsonb WHERE id = $1`,
          [ch.id],
        );
      }
    }
  }
}

export const commentAutomationService = new CommentAutomationService();

