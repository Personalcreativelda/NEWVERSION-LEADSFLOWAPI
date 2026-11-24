// Comentário → mensagem privada (Instagram e Facebook), pela API oficial da Meta.
// Quem comenta uma publicação (com uma das palavras escolhidas, ou qualquer comentário) recebe
// uma mensagem privada ("private reply"), opcionalmente uma resposta pública no comentário, e
// entra como lead. Quando responde à mensagem, a conversa segue na caixa de entrada como as outras.
//
// Regras da Meta: uma única resposta privada por comentário, até 7 dias depois do comentário.
import { query } from '../database/connection';
import { isInstagramLoginToken, metaMessagesUrl } from '../utils/meta-send';
import { checkLeadLimit } from '../middleware/plan-enforcement.middleware';

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

  async handle(ev: CommentEvent): Promise<'sent' | 'failed' | 'skipped'> {
    const channel = await findChannel(ev);
    if (!channel) return 'skipped';

    const rules = await query(
      `SELECT * FROM comment_automations WHERE channel_id = $1 AND enabled ORDER BY created_at`,
      [channel.id],
    );
    const rule = rules.rows.find((a: any) => matchesAutomation(a, ev));
    if (!rule) return 'skipped';

    // A Meta reenvia eventos: o comentário só é tratado uma vez
    const claimed = await query(
      `INSERT INTO comment_replies (comment_id, automation_id, user_id, channel_id, platform, commenter_id, commenter_name, comment_text)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (comment_id) DO NOTHING RETURNING id`,
      [ev.commentId, rule.id, channel.user_id, channel.id, ev.platform, ev.fromId, ev.fromName || null, ev.text.slice(0, 2000)],
    );
    const replyId = claimed.rows[0]?.id;
    if (!replyId) return 'skipped';

    const creds = channel.credentials || {};
    const token: string = creds.access_token || creds.page_access_token || '';
    const pageId: string | null = creds.page_id || null;
    let error: string | null = null;

    try {
      if (!token) throw new Error('O canal não tem token de acesso. Ligue-o de novo.');
      // Mensagem privada: o mesmo endpoint das mensagens, com o comentário como destinatário
      await postJson(metaMessagesUrl(token, pageId), token, {
        recipient: { comment_id: ev.commentId },
        message: { text: renderCommentText(rule.dm_message, ev.fromName) },
      });
    } catch (err: any) {
      error = String(err?.message || 'Não foi possível enviar a mensagem privada').slice(0, 500);
    }

    // Resposta pública (opcional): só depois de a privada sair, para não prometer uma mensagem que não chegou
    if (!error && rule.public_reply) {
      const text = renderCommentText(rule.public_reply, ev.fromName);
      const url = ev.platform === 'facebook'
        ? `${FB_GRAPH}/${encodeURIComponent(ev.commentId)}/comments`
        : `${isInstagramLoginToken(token) ? IG_GRAPH : FB_GRAPH}/${encodeURIComponent(ev.commentId)}/replies`;
      await postJson(url, token, { message: text }).catch((err: any) => {
        console.warn('[CommentAutomation] Resposta pública falhou:', err?.message);
      });
    }

    const leadId = await upsertLead(channel.user_id, ev, rule.tag || null).catch((err: any) => {
      console.warn('[CommentAutomation] Lead não criado:', err?.message);
      return null;
    });

    await query(
      `UPDATE comment_replies SET status = $2, error = $3, lead_id = $4 WHERE id = $1`,
      [replyId, error ? 'failed' : 'sent', error, leadId],
    );
    return error ? 'failed' : 'sent';
  }
}

export const commentAutomationService = new CommentAutomationService();
