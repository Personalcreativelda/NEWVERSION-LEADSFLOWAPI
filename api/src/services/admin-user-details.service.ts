// Tudo o que a administração vê de uma conta: plano e consumo, canais, assistentes (e quanto
// responderam), tokens de API, segurança (logins e alertas) e o que a pessoa anda a fazer.
// Nunca devolve segredos (palavra-passe, tokens, segredo da verificação em dois passos).
import { query } from '../database/connection';
import { checkLeadLimit, checkMessageLimit } from '../middleware/plan-enforcement.middleware';
import { securityOverview } from './security-events.service';

/** Uma consulta opcional (tabela que pode ainda não existir) não deita abaixo a página */
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}

const count = (rows: any[], key = 'n') => Number(rows[0]?.[key] || 0);

/** Número à vista de um canal, sem tocar nos segredos */
function channelNumber(credentials: any): string | null {
  const c = credentials && typeof credentials === 'object' ? credentials : {};
  return c.display_phone_number || c.phone_number || c.phone || c.number || c.wid?.split?.('@')?.[0] || null;
}

export async function adminUserDetails(userId: string, adminId: string) {
  const u = (await query('SELECT * FROM users WHERE id = $1', [userId])).rows[0];
  if (!u) return null;

  const user = {
    id: u.id,
    email: u.email,
    name: u.name,
    avatar_url: u.avatar_url,
    role: u.role,
    is_active: u.is_active,
    email_verified: !!u.email_verified,
    two_factor_enabled: !!u.two_factor_enabled,
    plan: u.plan || 'free',
    subscription_status: u.subscription_status || null,
    plan_activated_at: u.plan_activated_at || null,
    plan_expires_at: u.plan_expires_at || null,
    created_at: u.created_at,
    last_active_at: u.last_active_at || null,
    allow_whatsapp_qr: u.allow_whatsapp_qr === true,
  };

  const [leadLimit, msgLimit, massLimit] = await Promise.all([
    checkLeadLimit(userId),
    checkMessageLimit(userId, 'messages'),
    checkMessageLimit(userId, 'massMessages'),
  ]);

  const [campaigns, conversations, received30, aiReplies, channels, assistants, tokens, activities, presence, adminChannels] = await Promise.all([
    safe(() => query(
      `SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE status IN ('active', 'scheduled', 'paused'))::int AS active
         FROM campaigns WHERE user_id = $1`, [userId]).then((r) => r.rows[0]), { n: 0, active: 0 }),
    safe(() => query('SELECT COUNT(*)::int AS n FROM conversations WHERE user_id = $1', [userId]).then((r) => count(r.rows)), 0),
    safe(() => query(
      `SELECT COUNT(*)::int AS n FROM messages WHERE user_id = $1 AND direction = 'in' AND created_at > NOW() - INTERVAL '30 days'`,
      [userId]).then((r) => count(r.rows)), 0),
    safe(() => query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int AS last_30d
         FROM messages WHERE user_id = $1 AND direction = 'out' AND metadata->>'source' = 'ai_assistant'`,
      [userId]).then((r) => r.rows[0]), { total: 0, last_30d: 0 }),
    query(`SELECT id, name, type, status, credentials, created_at FROM channels WHERE user_id = $1 ORDER BY created_at DESC`, [userId])
      .then((r) => r.rows),
    safe(() => query(
      `SELECT ua.id, ua.is_active, ua.is_configured, ua.channel_id, ua.channel_ids, ua.last_triggered_at, ua.created_at,
              COALESCE(ua.config->>'name', a.name) AS name, a.is_custom,
              (SELECT COUNT(*) FROM assistant_logs l WHERE l.user_assistant_id = ua.id AND l.status = 'success')::int AS replies_total,
              (SELECT COUNT(*) FROM assistant_logs l WHERE l.user_assistant_id = ua.id AND l.status = 'success'
                  AND l.created_at > NOW() - INTERVAL '30 days')::int AS replies_30d,
              (SELECT COUNT(*) FROM assistant_logs l WHERE l.user_assistant_id = ua.id AND l.status <> 'success'
                  AND l.created_at > NOW() - INTERVAL '30 days')::int AS errors_30d,
              (SELECT MAX(l.created_at) FROM assistant_logs l WHERE l.user_assistant_id = ua.id AND l.status = 'success') AS last_reply_at
         FROM user_assistants ua JOIN assistants a ON a.id = ua.assistant_id
        WHERE ua.user_id = $1
        ORDER BY ua.is_active DESC, ua.created_at DESC`, [userId]).then((r) => r.rows), [] as any[]),
    safe(() => query(
      `SELECT COUNT(*) FILTER (WHERE expires_at IS NULL OR expires_at > NOW())::int AS active, MAX(last_used_at) AS last_used_at
         FROM api_tokens WHERE user_id = $1`, [userId]).then((r) => r.rows[0]), { active: 0, last_used_at: null }),
    safe(() => query(
      `SELECT type, description, metadata, created_at FROM activities
        WHERE user_id = $1 AND type <> 'presence' ORDER BY created_at DESC LIMIT 25`, [userId]).then((r) => r.rows), [] as any[]),
    safe(() => Promise.all([
      query(
        `SELECT COALESCE(metadata->>'feature', 'outro') AS feature, COUNT(*)::int AS n, MAX(created_at) AS last_at
           FROM activities WHERE user_id = $1 AND type = 'presence' AND created_at > NOW() - INTERVAL '7 days'
          GROUP BY 1 ORDER BY n DESC LIMIT 8`, [userId]),
      query(
        `SELECT description, metadata->>'path' AS path, metadata->>'method' AS method, metadata->>'ip' AS ip,
                metadata->>'country' AS country, created_at
           FROM activities WHERE user_id = $1 AND type = 'presence' ORDER BY created_at DESC LIMIT 15`, [userId]),
    ]).then(([f, r]) => ({ features: f.rows, recent: r.rows })), { features: [] as any[], recent: [] as any[] }),
    // Canais da administração para enviar mensagens a este utilizador
    query(
      `SELECT id, name, type, credentials FROM channels
        WHERE user_id = $1 AND type IN ('whatsapp', 'whatsapp_cloud') AND status IN ('active', 'connected')
        ORDER BY type = 'whatsapp_cloud' DESC, created_at DESC`, [adminId]).then((r) => r.rows),
  ]);

  const channelName = new Map(channels.map((c: any) => [c.id, c.name]));
  const visibleChannels = channels.filter((c: any) => c.status !== 'deleted');
  const security = await safe(() => securityOverview(userId), {
    stats: { failures_24h: 0, failures_7d: 0, logins_30d: 0, ips_30d: 0, countries_30d: 0 }, last_login: null, alerts: [], events: [],
  });

  return {
    user,
    usage: {
      leads: { used: leadLimit.current, limit: leadLimit.limit },
      messages: { used: msgLimit.current, limit: msgLimit.limit },
      mass_messages: { used: massLimit.current, limit: massLimit.limit },
      campaigns: { total: Number(campaigns.n || 0), active: Number(campaigns.active || 0) },
      conversations,
      received_30d: received30,
      ai_replies: { total: Number(aiReplies.total || 0), last_30d: Number(aiReplies.last_30d || 0) },
    },
    channels: visibleChannels.map((c: any) => ({
      id: c.id, name: c.name, type: c.type, status: c.status, created_at: c.created_at, number: channelNumber(c.credentials),
    })),
    deleted_channels: channels.length - visibleChannels.length,
    assistants: assistants.map((a: any) => {
      const ids: string[] = [...new Set([a.channel_id, ...(Array.isArray(a.channel_ids) ? a.channel_ids : [])].filter(Boolean))];
      return {
        id: a.id,
        name: a.name,
        is_custom: !!a.is_custom,
        is_active: !!a.is_active,
        is_configured: !!a.is_configured,
        channels: ids.map((id) => channelName.get(id)).filter(Boolean),
        replies_total: a.replies_total,
        replies_30d: a.replies_30d,
        errors_30d: a.errors_30d,
        last_reply_at: a.last_reply_at,
      };
    }),
    api_tokens: { active: Number(tokens.active || 0), last_used_at: tokens.last_used_at || null },
    security,
    activity: { recent: activities, features: presence.features, presence: presence.recent },
    send_from: adminChannels.map((c: any) => ({ id: c.id, name: c.name, type: c.type, number: channelNumber(c.credentials) })),
    contact_number: visibleChannels.map((c: any) => channelNumber(c.credentials)).find(Boolean) || null,
  };
}
