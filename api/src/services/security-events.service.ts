// Registo de segurança da conta: logins (com e sem sucesso), verificação em dois passos e
// palavras-passe. Serve para a administração ver tentativas de entrada numa conta.
import type { Request } from 'express';
import { query } from '../database/connection';

export type SecurityEventType =
  | 'login_success'
  | 'login_failure'
  | 'login_google'
  | 'two_factor_success'
  | 'two_factor_failure'
  | 'password_reset_request'
  | 'password_reset_done'
  | 'password_changed';

const FAILURE_TYPES: SecurityEventType[] = ['login_failure', 'two_factor_failure'];
const SUCCESS_TYPES: SecurityEventType[] = ['login_success', 'login_google', 'two_factor_success'];

const header = (req: Request, name: string) => {
  const v = req.headers[name];
  return (Array.isArray(v) ? v[0] : v) || '';
};

/** IP de quem fez o pedido: a API está atrás da Cloudflare e do proxy, o req.ip seria o do proxy */
export function clientIp(req: Request): string {
  const cf = header(req, 'cf-connecting-ip').trim();
  if (cf) return cf.slice(0, 64);
  const xff = header(req, 'x-forwarded-for').split(',')[0].trim();
  if (xff) return xff.slice(0, 64);
  return String(req.ip || req.socket?.remoteAddress || '').slice(0, 64);
}

/** País do pedido (código de 2 letras da Cloudflare; XX/T1 = desconhecido/Tor) */
export function clientCountry(req: Request): string | null {
  const c = header(req, 'cf-ipcountry').trim().toUpperCase();
  return /^[A-Z0-9]{2}$/.test(c) ? c : null;
}

/** Guarda o evento sem nunca atrasar nem partir o login */
export function recordSecurityEvent(req: Request, data: {
  type: SecurityEventType;
  userId?: string | null;
  email?: string | null;
  detail?: string | null;
}): void {
  const email = data.email ? String(data.email).trim().toLowerCase().slice(0, 255) : null;
  void (async () => {
    try {
      let userId = data.userId || null;
      if (!userId && email) {
        const u = await query('SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1', [email]);
        userId = u.rows[0]?.id || null;
      }
      await query(
        `INSERT INTO security_events (user_id, email, type, ip, country, user_agent, detail)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, email, data.type, clientIp(req) || null, clientCountry(req),
          header(req, 'user-agent').slice(0, 400) || null, data.detail ? String(data.detail).slice(0, 300) : null],
      );
    } catch (err: any) {
      console.warn('[Security] Não foi possível registar o evento:', err?.message);
    }
  })();
}

export interface SecurityAlert {
  level: 'high' | 'medium';
  message: string;
}

/** Resumo e alertas da conta para a administração */
export async function securityOverview(userId: string) {
  const events = await query(
    `SELECT type, ip, country, user_agent, detail, created_at
       FROM security_events
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 40`,
    [userId],
  );
  const stats = await query(
    `SELECT
        COUNT(*) FILTER (WHERE type = ANY($2::text[]) AND created_at > NOW() - INTERVAL '24 hours')::int AS failures_24h,
        COUNT(*) FILTER (WHERE type = ANY($2::text[]) AND created_at > NOW() - INTERVAL '7 days')::int AS failures_7d,
        COUNT(*) FILTER (WHERE type = ANY($3::text[]) AND created_at > NOW() - INTERVAL '30 days')::int AS logins_30d,
        COUNT(DISTINCT ip) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int AS ips_30d,
        COUNT(DISTINCT country) FILTER (WHERE created_at > NOW() - INTERVAL '30 days' AND country IS NOT NULL)::int AS countries_30d
       FROM security_events WHERE user_id = $1`,
    [userId, FAILURE_TYPES, SUCCESS_TYPES],
  );
  const s = stats.rows[0] || {};
  const rows = events.rows;

  // Países com login bem-sucedido antes das últimas 24 horas (para detetar um país novo)
  const known = await query(
    `SELECT DISTINCT country FROM security_events
      WHERE user_id = $1 AND type = ANY($2::text[]) AND country IS NOT NULL
        AND created_at < NOW() - INTERVAL '24 hours'`,
    [userId, SUCCESS_TYPES],
  );
  const knownCountries = new Set(known.rows.map((r: any) => r.country));
  const recentNewCountries = [...new Set(rows
    .filter((e: any) => SUCCESS_TYPES.includes(e.type) && e.country && Date.now() - new Date(e.created_at).getTime() < 86_400_000)
    .map((e: any) => e.country as string))]
    .filter((c) => knownCountries.size > 0 && !knownCountries.has(c));

  const alerts: SecurityAlert[] = [];
  const f24 = Number(s.failures_24h || 0);
  if (f24 >= 10) alerts.push({ level: 'high', message: `${f24} tentativas de entrada falhadas nas últimas 24 horas` });
  else if (f24 >= 5) alerts.push({ level: 'medium', message: `${f24} tentativas de entrada falhadas nas últimas 24 horas` });
  for (const c of recentNewCountries) alerts.push({ level: 'high', message: `Entrada a partir de um país novo: ${c}` });
  if (Number(s.ips_30d || 0) >= 8) alerts.push({ level: 'medium', message: `${s.ips_30d} endereços IP diferentes em 30 dias` });
  if (rows.some((e: any) => e.country === 'T1')) alerts.push({ level: 'medium', message: 'Acesso pela rede Tor' });

  const lastLogin = rows.find((e: any) => SUCCESS_TYPES.includes(e.type)) || null;
  return {
    stats: {
      failures_24h: f24,
      failures_7d: Number(s.failures_7d || 0),
      logins_30d: Number(s.logins_30d || 0),
      ips_30d: Number(s.ips_30d || 0),
      countries_30d: Number(s.countries_30d || 0),
    },
    last_login: lastLogin,
    alerts,
    events: rows,
  };
}
