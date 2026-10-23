// Instagram com o login do próprio Instagram ("API do Instagram com login do Instagram"):
// a pessoa entra com a conta profissional do Instagram, sem precisar de página do Facebook.
// Configuração: META_INSTAGRAM_APP_ID e META_INSTAGRAM_APP_SECRET (caso de uso "API do
// Instagram" → ID e chave secreta do app do Instagram). Os webhooks vêm assinados com essa chave.
import { query } from '../database/connection';
import { apiBaseUrl } from './meta-oauth.service';
import { encryptCredentials } from '../utils/secret-box';

const IG_GRAPH = 'https://graph.instagram.com/v21.0';
const TIMEOUT_MS = 15_000;
export const INSTAGRAM_SCOPES = ['instagram_business_basic', 'instagram_business_manage_messages'];

export function isInstagramLoginConfigured(): boolean {
  return !!(process.env.META_INSTAGRAM_APP_ID && process.env.META_INSTAGRAM_APP_SECRET);
}

export function instagramRedirectUri(): string {
  return `${apiBaseUrl()}/api/oauth/instagram/callback`;
}

export function buildInstagramAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    force_reauth: 'true', // deixa escolher outra conta em vez de usar a que já tem sessão
    client_id: process.env.META_INSTAGRAM_APP_ID || '',
    redirect_uri: instagramRedirectUri(),
    response_type: 'code',
    scope: INSTAGRAM_SCOPES.join(','),
    state,
  });
  return `https://www.instagram.com/oauth/authorize?${params.toString()}`;
}

/** Erro com um código para o app mostrar a mensagem certa (ver MetaConnect.tsx) */
export class InstagramOAuthError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

/** Motivos conhecidos de o Instagram recusar a ligação */
function classify(message: string): string | null {
  if (/tester|developer role|insufficient.*role|app.*not.*(live|active)|não.*testador/i.test(message)) return 'ig_not_tester';
  if (/professional|business account|creator|account[_ ]type|personal account/i.test(message)) return 'ig_not_professional';
  return null;
}

async function json(res: Response): Promise<any> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error || data?.error_message) {
    throw new Error(data?.error_message || data?.error?.message || `Instagram respondeu ${res.status}`);
  }
  return data;
}

export interface InstagramLoginAccount {
  id: string; // ID da conta profissional (é o que chega nos webhooks: entry.id)
  username?: string;
  name?: string;
  picture?: string;
  access_token: string;
  token_expires_at?: string;
}

/** Código → token de longa duração (60 dias) + perfil da conta */
export async function exchangeInstagramCode(rawCode: string): Promise<InstagramLoginAccount> {
  // O Instagram acrescenta "#_" ao código no redirect
  const code = rawCode.replace(/#_$/, '');
  const body = new URLSearchParams({
    client_id: process.env.META_INSTAGRAM_APP_ID || '',
    client_secret: process.env.META_INSTAGRAM_APP_SECRET || '',
    grant_type: 'authorization_code',
    redirect_uri: instagramRedirectUri(),
    code,
  });
  let short: any;
  try {
    short = await json(await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }));
  } catch (err: any) {
    const message = err?.message || 'O Instagram recusou a autorização';
    throw new InstagramOAuthError(classify(message) || 'ig_exchange_failed', message);
  }
  const shortToken: string = short.access_token || short.data?.[0]?.access_token;
  const shortUserId: string = String(short.user_id || short.data?.[0]?.user_id || '');
  if (!shortToken) throw new Error('O Instagram não devolveu o token.');

  const long = await json(await fetch(`https://graph.instagram.com/access_token?${new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: process.env.META_INSTAGRAM_APP_SECRET || '',
    access_token: shortToken,
  })}`, { signal: AbortSignal.timeout(TIMEOUT_MS) }));
  const token: string = long.access_token || shortToken;
  const expiresAt = long.expires_in ? new Date(Date.now() + Number(long.expires_in) * 1000).toISOString() : undefined;

  // Perfil: alguns campos (ex.: name) falham em certas contas; tentar depois só o essencial
  const getMe = (fields: string) => fetch(`${IG_GRAPH}/me?${new URLSearchParams({ fields, access_token: token })}`, { signal: AbortSignal.timeout(TIMEOUT_MS) }).then(json);
  let me: any;
  try {
    me = await getMe('user_id,username,name,profile_picture_url,account_type');
  } catch {
    me = await getMe('user_id,username,account_type').catch(() => ({}));
  }
  if (me.account_type && !['BUSINESS', 'MEDIA_CREATOR'].includes(String(me.account_type))) {
    throw new InstagramOAuthError('ig_not_professional', 'Conta do Instagram pessoal');
  }
  const id = String(me.user_id || shortUserId || me.id || '');
  if (!id) throw new Error('O Instagram não devolveu a conta.');
  return { id, username: me.username, name: me.name, picture: me.profile_picture_url, access_token: token, token_expires_at: expiresAt };
}

/** Subscreve a conta nos webhooks de mensagens da app do Instagram */
export async function subscribeInstagramAccount(token: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${IG_GRAPH}/me/subscribed_apps?${new URLSearchParams({
      subscribed_fields: 'messages,messaging_postbacks,messaging_seen',
      access_token: token,
    })}`, { method: 'POST', signal: AbortSignal.timeout(TIMEOUT_MS) });
    const data = await res.json().catch(() => ({}));
    if (data?.success) return { ok: true };
    console.warn('[InstagramOAuth] subscribed_apps falhou:', JSON.stringify(data?.error || data));
    return { ok: false, error: data?.error?.message ? `O Instagram recusou ativar as mensagens: ${data.error.message}` : undefined };
  } catch {
    return { ok: false, error: 'Não foi possível contactar o Instagram para ativar as mensagens. Tente de novo.' };
  }
}

/**
 * Os tokens do login do Instagram duram 60 dias: renova os que expiram nos próximos 15 dias
 * (o Instagram só renova tokens com pelo menos 24 h). Corre uma vez por dia.
 */
export async function refreshExpiringInstagramTokens(): Promise<void> {
  const result = await query(
    `SELECT id, user_id, credentials FROM channels
     WHERE type = 'instagram' AND status != 'deleted'
       AND credentials->>'connected_via' = 'instagram_login'
       AND (credentials->>'token_expires_at')::timestamptz < NOW() + INTERVAL '15 days'`,
  );
  for (const row of result.rows) {
    const creds = row.credentials || {};
    try {
      const data = await json(await fetch(`https://graph.instagram.com/refresh_access_token?${new URLSearchParams({
        grant_type: 'ig_refresh_token',
        access_token: creds.access_token,
      })}`, { signal: AbortSignal.timeout(TIMEOUT_MS) }));
      const next = {
        ...creds,
        access_token: data.access_token || creds.access_token,
        token_expires_at: new Date(Date.now() + Number(data.expires_in || 5_184_000) * 1000).toISOString(),
      };
      await query('UPDATE channels SET credentials = $1, updated_at = NOW() WHERE id = $2', [JSON.stringify(encryptCredentials(next)), row.id]);
      console.log(`[InstagramOAuth] Token renovado para o canal ${row.id}`);
    } catch (err: any) {
      console.warn(`[InstagramOAuth] Não foi possível renovar o token do canal ${row.id}:`, err?.message);
    }
  }
}
