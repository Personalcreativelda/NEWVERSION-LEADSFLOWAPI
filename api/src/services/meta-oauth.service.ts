// Ligar Facebook Messenger e Instagram pelo login oficial da Meta (OAuth), sem o cliente
// copiar tokens: o servidor troca o código pelo token, lista as páginas e contas
// profissionais e guarda tudo cifrado. Configuração: META_APP_ID, META_APP_SECRET e,
// opcionalmente, META_LOGIN_CONFIG_ID (Facebook Login for Business).
import crypto from 'crypto';
import { query } from '../database/connection';
import { encryptCredentials } from '../utils/secret-box';

export const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v21.0';
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const STATE_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MINUTES = 15;
const TIMEOUT_MS = 15_000;

/** Permissões pedidas (Messenger + Instagram Direct através da página) */
export const META_SCOPES = [
  'pages_show_list',
  'pages_messaging',
  'pages_manage_metadata',
  'pages_read_engagement',
  'business_management',
  'instagram_basic',
  'instagram_manage_messages',
];

export type OAuthPlatform = 'web' | 'app';

export function isMetaOAuthConfigured(): boolean {
  return !!(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

export function apiBaseUrl(): string {
  const base = process.env.API_PUBLIC_URL || process.env.API_URL || process.env.SERVICE_URL_API || process.env.WEBHOOK_URL || 'http://localhost:4000';
  return base.replace(/\/$/, '').replace(/\/api$/, '');
}

export function metaRedirectUri(): string {
  return `${apiBaseUrl()}/api/oauth/meta/callback`;
}

/** Para onde o browser volta depois do Facebook (painel web ou app Android) */
export function returnUrl(platform: OAuthPlatform, params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString();
  if (platform === 'app') return `com.leadsflowapi.app://oauth/meta?${qs}`;
  const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${appUrl}/dashboard/inbox/settings?${qs}`;
}

// ── state assinado (liga o retorno do Facebook ao utilizador que começou) ─────────────
function stateKey(): string {
  const key = process.env.JWT_SECRET || process.env.META_APP_SECRET;
  if (!key) throw new Error('JWT_SECRET em falta');
  return key;
}

export function createState(userId: string, platform: OAuthPlatform): string {
  const payload = Buffer.from(JSON.stringify({
    u: userId, p: platform, n: crypto.randomBytes(12).toString('hex'), e: Date.now() + STATE_TTL_MS,
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', stateKey()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function readState(state: string): { userId: string; platform: OAuthPlatform } | null {
  const [payload, sig] = String(state || '').split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', stateKey()).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.u || typeof data.e !== 'number' || data.e < Date.now()) return null;
    return { userId: String(data.u), platform: data.p === 'app' ? 'app' : 'web' };
  } catch {
    return null;
  }
}

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID || '',
    redirect_uri: metaRedirectUri(),
    state,
    response_type: 'code',
  });
  if (process.env.META_LOGIN_CONFIG_ID) params.set('config_id', process.env.META_LOGIN_CONFIG_ID);
  else params.set('scope', META_SCOPES.join(','));
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

// ── Graph API ─────────────────────────────────────────────────────────────────────────
async function graphGet(path: string, params: Record<string, string>): Promise<any> {
  const url = `${path.startsWith('http') ? path : GRAPH + path}?${new URLSearchParams(params).toString()}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    const err: any = new Error(data?.error?.message || `Meta respondeu ${res.status}`);
    err.metaCode = data?.error?.code;
    throw err;
  }
  return data;
}

/** Código → token de utilizador de longa duração (≈60 dias; os tokens de página derivados não expiram) */
export async function exchangeCodeForUserToken(code: string): Promise<string> {
  const short = await graphGet('/oauth/access_token', {
    client_id: process.env.META_APP_ID || '',
    client_secret: process.env.META_APP_SECRET || '',
    redirect_uri: metaRedirectUri(),
    code,
  });
  const long = await graphGet('/oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: process.env.META_APP_ID || '',
    client_secret: process.env.META_APP_SECRET || '',
    fb_exchange_token: short.access_token,
  });
  return long.access_token || short.access_token;
}

export interface MetaPage {
  id: string;
  name: string;
  picture?: string;
  access_token: string;
  instagram?: { id: string; username?: string; picture?: string } | null;
}

/** Páginas que o utilizador gere, com a conta profissional do Instagram ligada a cada uma */
export async function listPages(userToken: string): Promise<MetaPage[]> {
  const pages: MetaPage[] = [];
  let next: string | null = `${GRAPH}/me/accounts`;
  let params: Record<string, string> = {
    fields: 'id,name,access_token,picture{url},instagram_business_account{id,username,profile_picture_url}',
    limit: '100',
    access_token: userToken,
  };
  for (let i = 0; next && i < 10; i++) {
    const data: any = await graphGet(next, params);
    for (const p of data.data || []) {
      pages.push({
        id: String(p.id),
        name: p.name,
        picture: p.picture?.data?.url,
        access_token: p.access_token,
        instagram: p.instagram_business_account
          ? { id: String(p.instagram_business_account.id), username: p.instagram_business_account.username, picture: p.instagram_business_account.profile_picture_url }
          : null,
      });
    }
    // A Graph API devolve o URL seguinte completo (com os parâmetros)
    next = data.paging?.next || null;
    params = {};
  }
  return pages;
}

/** Subscreve a app nos eventos de mensagens da página (Messenger e Instagram Direct) */
export async function subscribePage(pageId: string, pageToken: string, fields: string[]): Promise<boolean> {
  try {
    const url = `${GRAPH}/${encodeURIComponent(pageId)}/subscribed_apps?${new URLSearchParams({ subscribed_fields: fields.join(','), access_token: pageToken })}`;
    const res = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(TIMEOUT_MS) });
    const data = await res.json().catch(() => ({}));
    return !!data?.success;
  } catch {
    return false;
  }
}

// ── Sessões temporárias (entre o retorno do Facebook e a escolha das páginas) ────────
export async function ensureSessionsTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS meta_oauth_sessions (
      id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id     UUID NOT NULL,
      credentials JSONB NOT NULL,
      created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      expires_at  TIMESTAMP WITH TIME ZONE NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_meta_oauth_sessions_user ON meta_oauth_sessions(user_id);
  `);
}

export async function saveSession(userId: string, userToken: string, pages: MetaPage[]): Promise<string> {
  await query('DELETE FROM meta_oauth_sessions WHERE expires_at < NOW()');
  // Coluna "credentials": cifrada ao gravar e decifrada pelo query() ao ler
  const credentials = encryptCredentials({ user_access_token: userToken, pages });
  const result = await query(
    `INSERT INTO meta_oauth_sessions (user_id, credentials, expires_at)
     VALUES ($1, $2, NOW() + ($3 || ' minutes')::interval) RETURNING id`,
    [userId, JSON.stringify(credentials), String(SESSION_TTL_MINUTES)],
  );
  return result.rows[0].id;
}

/** Só o próprio utilizador lê a sua sessão (outro utilizador recebe null) */
export async function loadSession(sessionId: string, userId: string): Promise<{ user_access_token: string; pages: MetaPage[] } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return null;
  const result = await query(
    'SELECT credentials FROM meta_oauth_sessions WHERE id = $1 AND user_id = $2 AND expires_at > NOW()',
    [sessionId, userId],
  );
  const creds = result.rows[0]?.credentials;
  return creds ? { user_access_token: creds.user_access_token, pages: creds.pages || [] } : null;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await query('DELETE FROM meta_oauth_sessions WHERE id = $1', [sessionId]);
}
