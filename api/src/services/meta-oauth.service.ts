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
  'pages_show_list',        // listar as páginas
  'pages_messaging',        // receber e responder no Messenger
  'pages_manage_metadata',  // subscrever os webhooks da página
  'business_management',    // páginas geridas pelo Business Manager
  'pages_read_engagement',  // obrigatória para as mensagens do Instagram com login do Facebook
  'instagram_basic',        // conta profissional do Instagram ligada à página
  'instagram_manage_messages', // receber e responder no Instagram Direct
];

/** META_OAUTH_SCOPES (separadas por vírgula) substitui a lista, ex.: só Messenger enquanto o Instagram não está aprovado */
/** Permissões só do Instagram através da página (não usadas quando há o login próprio do Instagram) */
const INSTAGRAM_VIA_PAGE_SCOPES = ['pages_read_engagement', 'instagram_basic', 'instagram_manage_messages'];

/**
 * Com o login próprio do Instagram configurado (META_INSTAGRAM_APP_ID/SECRET), o login do
 * Facebook serve só para o Messenger; o Instagram liga-se pelo seu próprio login.
 */
export function instagramViaFacebook(): boolean {
  return !(process.env.META_INSTAGRAM_APP_ID && process.env.META_INSTAGRAM_APP_SECRET);
}

function requestedScopes(): string[] {
  const custom = (process.env.META_OAUTH_SCOPES || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (custom.length) return custom;
  return instagramViaFacebook() ? META_SCOPES : META_SCOPES.filter((s) => !INSTAGRAM_VIA_PAGE_SCOPES.includes(s));
}

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
  const loginConfigId = (process.env.META_LOGIN_CONFIG_ID || '').trim().replace(/^["']+|["']+$/g, '');
  if (loginConfigId) params.set('config_id', loginConfigId);
  else params.set('scope', requestedScopes().join(','));
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
  try {
    return await fetchPages(userToken, instagramViaFacebook());
  } catch (err: any) {
    // Sem as permissões do Instagram (ex.: META_OAUTH_SCOPES só com Messenger) o campo da
    // conta do Instagram falha: listar só as páginas
    if (err?.metaCode === 10 || err?.metaCode === 200 || err?.metaCode === 100) return fetchPages(userToken, false);
    throw err;
  }
}

async function fetchPages(userToken: string, withInstagram: boolean): Promise<MetaPage[]> {
  const pages: MetaPage[] = [];
  let next: string | null = `${GRAPH}/me/accounts`;
  let params: Record<string, string> = {
    fields: withInstagram
      ? 'id,name,access_token,picture{url},instagram_business_account{id,username,profile_picture_url}'
      : 'id,name,access_token,picture{url}',
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

/**
 * Subscreve a app nos eventos de mensagens da página (Messenger e Instagram Direct).
 * Devolve o motivo da Meta quando falha, para o mostrar ao cliente.
 */
export async function subscribePage(pageId: string, pageToken: string, fields: string[]): Promise<{ ok: boolean; error?: string }> {
  try {
    const url = `${GRAPH}/${encodeURIComponent(pageId)}/subscribed_apps?${new URLSearchParams({ subscribed_fields: fields.join(','), access_token: pageToken })}`;
    const res = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(TIMEOUT_MS) });
    const data = await res.json().catch(() => ({}));
    if (data?.success) return { ok: true };
    console.warn('[MetaOAuth] subscribed_apps falhou:', pageId, JSON.stringify(data?.error || data));
    return { ok: false, error: data?.error?.message ? `A Meta recusou ativar as mensagens: ${data.error.message}` : undefined };
  } catch {
    return { ok: false, error: 'Não foi possível contactar a Meta para ativar as mensagens. Tente de novo.' };
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

/** Conta ligada pelo login do Instagram (sem página do Facebook) */
export interface InstagramLoginSessionAccount {
  id: string;
  username?: string;
  name?: string;
  picture?: string;
  access_token: string;
  token_expires_at?: string;
}

export interface OAuthSession {
  user_access_token?: string;
  pages: MetaPage[];
  instagram_login?: InstagramLoginSessionAccount[];
}

export async function saveSession(userId: string, userToken: string, pages: MetaPage[], instagramLogin?: InstagramLoginSessionAccount[]): Promise<string> {
  await query('DELETE FROM meta_oauth_sessions WHERE expires_at < NOW()');
  // Coluna "credentials": cifrada ao gravar e decifrada pelo query() ao ler
  const credentials = encryptCredentials({ user_access_token: userToken, pages, ...(instagramLogin ? { instagram_login: instagramLogin } : {}) });
  const result = await query(
    `INSERT INTO meta_oauth_sessions (user_id, credentials, expires_at)
     VALUES ($1, $2, NOW() + ($3 || ' minutes')::interval) RETURNING id`,
    [userId, JSON.stringify(credentials), String(SESSION_TTL_MINUTES)],
  );
  return result.rows[0].id;
}

/** Só o próprio utilizador lê a sua sessão (outro utilizador recebe null) */
export async function loadSession(sessionId: string, userId: string): Promise<OAuthSession | null> {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return null;
  const result = await query(
    'SELECT credentials FROM meta_oauth_sessions WHERE id = $1 AND user_id = $2 AND expires_at > NOW()',
    [sessionId, userId],
  );
  const creds = result.rows[0]?.credentials;
  return creds ? { user_access_token: creds.user_access_token, pages: creds.pages || [], instagram_login: creds.instagram_login || [] } : null;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await query('DELETE FROM meta_oauth_sessions WHERE id = $1', [sessionId]);
}
