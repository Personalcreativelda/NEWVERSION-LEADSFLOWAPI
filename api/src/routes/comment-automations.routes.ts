// /api/comment-automations — comentário → mensagem privada (Instagram e Facebook)
//   GET    /            regras + canais que as podem usar + se a Meta já aprovou (comments_enabled)
//   POST   /            criar regra
//   PUT    /:id         editar regra
//   DELETE /:id         apagar regra
//   GET    /replies     últimas respostas enviadas (ou falhadas)
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { query } from '../database/connection';
import { commentsEnabled, facebookCommentFields, facebookCommentsEnabled } from '../utils/meta-comments';
import { isInstagramLoginToken } from '../utils/meta-send';
import { subscribePage } from '../services/meta-oauth.service';
import { subscribeInstagramAccount } from '../services/instagram-oauth.service';

const router = Router();
router.use(requireAuth);

const MAX_TEXT = 1000;
// Os mesmos campos que o login da Meta subscreve (routes/meta-oauth.routes.ts)
const MESSENGER_FIELDS = ['messages', 'messaging_postbacks', 'messaging_optins', 'message_deliveries', 'message_reads'];

const cleanWords = (v: unknown): string[] =>
  (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [])
    .map((w) => String(w || '').trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((w) => w.slice(0, 60));

const cleanTag = (v: unknown): string | null => {
  const t = String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return t || null;
};

/** Valida o corpo do pedido; devolve a mensagem de erro ou os campos limpos */
function readBody(body: any): { error: string } | {
  name: string; enabled: boolean; keywords: string[]; post_ids: string[]; dm_message: string; public_reply: string | null; tag: string | null;
} {
  const dm = String(body?.dm_message || '').trim();
  if (!dm) return { error: 'Escreva a mensagem privada' };
  if (dm.length > MAX_TEXT) return { error: `A mensagem privada tem no máximo ${MAX_TEXT} caracteres` };
  const pub = String(body?.public_reply || '').trim();
  if (pub.length > MAX_TEXT) return { error: `A resposta pública tem no máximo ${MAX_TEXT} caracteres` };
  return {
    name: String(body?.name || '').trim().slice(0, 120),
    enabled: body?.enabled !== false,
    keywords: cleanWords(body?.keywords),
    post_ids: cleanWords(body?.post_ids),
    dm_message: dm,
    public_reply: pub || null,
    tag: cleanTag(body?.tag),
  };
}

async function ownChannel(userId: string, channelId: string) {
  const r = await query(
    `SELECT * FROM channels WHERE id = $1 AND user_id = $2 AND type IN ('instagram', 'facebook') LIMIT 1`,
    [channelId, userId],
  );
  return r.rows[0] || null;
}

/** Canais ligados antes desta funcionalidade: volta a subscrever, agora também com os comentários */
async function ensureCommentWebhook(channel: any): Promise<void> {
  const creds = channel.credentials || {};
  const token: string = creds.page_access_token || creds.access_token || '';
  if (!token) return;
  try {
    if (channel.type === 'instagram' && isInstagramLoginToken(token) && commentsEnabled()) {
      await subscribeInstagramAccount(token);
    } else if (channel.type === 'facebook' && creds.page_id && facebookCommentsEnabled()) {
      // A Meta substitui a lista inteira: os mesmos campos do Messenger de sempre + "feed"
      await subscribePage(creds.page_id, token, [...MESSENGER_FIELDS, ...facebookCommentFields()]);
    }
    // Instagram pelo login do Facebook: os comentários chegam pela subscrição "instagram" da app
  } catch (err: any) {
    console.warn('[CommentAutomations] Subscrição dos comentários falhou:', channel.id, err?.message);
  }
}

router.get('/', async (req: any, res, next) => {
  try {
    const userId = req.user.id;
    const [rules, channels] = await Promise.all([
      query(
        `SELECT a.*, c.name AS channel_name, c.type AS channel_type,
                (SELECT COUNT(*)::int FROM comment_replies r WHERE r.automation_id = a.id AND r.status = 'sent') AS sent
           FROM comment_automations a JOIN channels c ON c.id = a.channel_id
          WHERE a.user_id = $1 ORDER BY a.created_at DESC`,
        [userId],
      ),
      query(
        `SELECT id, name, type, status FROM channels
          WHERE user_id = $1 AND type IN ('instagram', 'facebook') ORDER BY created_at`,
        [userId],
      ),
    ]);
    res.json({
      success: true,
      facebook_enabled: facebookCommentsEnabled(),
      instagram_enabled: commentsEnabled(),
      public_replies: commentsEnabled(), // pages_manage_engagement ainda por aprovar
      automations: rules.rows,
      channels: channels.rows,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/replies', async (req: any, res, next) => {
  try {
    const r = await query(
      `SELECT r.id, r.platform, r.commenter_name, r.comment_text, r.status, r.error, r.lead_id, r.created_at,
              a.name AS automation_name
         FROM comment_replies r LEFT JOIN comment_automations a ON a.id = r.automation_id
        WHERE r.user_id = $1 ORDER BY r.created_at DESC LIMIT 50`,
      [req.user.id],
    );
    res.json({ success: true, replies: r.rows });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req: any, res, next) => {
  try {
    const userId = req.user.id;
    const channel = await ownChannel(userId, String(req.body?.channel_id || ''));
    if (!channel) return res.status(400).json({ error: 'Escolha um canal de Instagram ou Facebook' });
    const data = readBody(req.body);
    if ('error' in data) return res.status(400).json({ error: data.error });

    const r = await query(
      `INSERT INTO comment_automations (user_id, channel_id, name, enabled, keywords, post_ids, dm_message, public_reply, tag)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [userId, channel.id, data.name, data.enabled, data.keywords, data.post_ids, data.dm_message, data.public_reply, data.tag],
    );
    if (data.enabled) void ensureCommentWebhook(channel);
    res.status(201).json({ success: true, automation: r.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req: any, res, next) => {
  try {
    const userId = req.user.id;
    const current = (await query('SELECT * FROM comment_automations WHERE id = $1 AND user_id = $2', [req.params.id, userId])).rows[0];
    if (!current) return res.status(404).json({ error: 'Regra não encontrada' });
    const channel = await ownChannel(userId, String(req.body?.channel_id || current.channel_id));
    if (!channel) return res.status(400).json({ error: 'Escolha um canal de Instagram ou Facebook' });
    const data = readBody({ ...current, ...req.body });
    if ('error' in data) return res.status(400).json({ error: data.error });

    const r = await query(
      `UPDATE comment_automations
          SET channel_id = $3, name = $4, enabled = $5, keywords = $6, post_ids = $7, dm_message = $8,
              public_reply = $9, tag = $10, updated_at = NOW()
        WHERE id = $1 AND user_id = $2 RETURNING *`,
      [current.id, userId, channel.id, data.name, data.enabled, data.keywords, data.post_ids, data.dm_message, data.public_reply, data.tag],
    );
    if (data.enabled) void ensureCommentWebhook(channel);
    res.json({ success: true, automation: r.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req: any, res, next) => {
  try {
    const r = await query('DELETE FROM comment_automations WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.user.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Regra não encontrada' });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
