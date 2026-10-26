import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { query } from '../database/connection';

/**
 * API pública: tokens criados em Definições → Segurança (`lf_<32 hex>_<32 hex>`).
 *
 * Só abrem as rotas de PUBLIC_ROUTES (as que estão na documentação pública, /docs no
 * painel); o resto da API continua só para o painel (sessão JWT). Âmbito "read" = só GET,
 * "write" = os outros métodos.
 */

const UUID = '[0-9a-fA-F-]{36}';

/** Método + caminho (sem a query) que um token de API pode usar */
const PUBLIC_ROUTES: { method: string; path: RegExp }[] = [
  { method: 'GET', path: /^\/api\/leads\/?$/ },
  { method: 'POST', path: /^\/api\/leads\/?$/ },
  { method: 'GET', path: new RegExp(`^/api/leads/${UUID}$`) },
  { method: 'PUT', path: new RegExp(`^/api/leads/${UUID}$`) },
  { method: 'DELETE', path: new RegExp(`^/api/leads/${UUID}$`) },
  { method: 'POST', path: /^\/api\/whatsapp\/send\/?$/ },
];

export function isPublicApiRoute(method: string, originalUrl: string): boolean {
  const path = originalUrl.split('?')[0];
  return PUBLIC_ROUTES.some((route) => route.method === method.toUpperCase() && route.path.test(path));
}

export interface ApiTokenAuth {
  tokenId: string;
  userId: string;
  scopes: string[];
}

// O bcrypt custa ~60 ms: o resultado fica 60 s em memória (um token apagado deixa de
// funcionar no máximo um minuto depois)
const CACHE_MS = 60_000;
const cache = new Map<string, { auth: ApiTokenAuth | null; at: number }>();

export async function validateApiToken(token: string): Promise<ApiTokenAuth | null> {
  if (!/^lf_[0-9a-f]{32}_[0-9a-f]{32}$/.test(token)) return null;

  const key = crypto.createHash('sha256').update(token).digest('hex');
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.auth;

  // Guardado como "lf_" + 8 primeiros caracteres + "..." (ver security.routes)
  const prefix = `lf_${token.slice(3, 11)}...`;
  const { rows } = await query(
    `SELECT id, user_id, token_hash, scopes, expires_at FROM api_tokens WHERE token_prefix = $1`,
    [prefix],
  );

  let auth: ApiTokenAuth | null = null;
  for (const row of rows) {
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) continue;
    if (await bcrypt.compare(token, row.token_hash)) {
      auth = { tokenId: row.id, userId: row.user_id, scopes: row.scopes || ['read', 'write'] };
      break;
    }
  }

  cache.set(key, { auth, at: Date.now() });
  if (cache.size > 1000) cache.delete(cache.keys().next().value as string);

  if (auth) {
    void query('UPDATE api_tokens SET last_used_at = NOW() WHERE id = $1', [auth.tokenId]).catch(() => {});
  }
  return auth;
}

/** "read" chega para GET; os restantes métodos precisam de "write" */
export function scopeAllows(scopes: string[], method: string): boolean {
  return method.toUpperCase() === 'GET' ? scopes.includes('read') || scopes.includes('write') : scopes.includes('write');
}

/** Limite da API pública: pedidos por minuto por token (janela fixa de 60 s, em memória) */
export const API_RATE_LIMIT = 120;
const windows = new Map<string, { start: number; count: number }>();

/** Devolve quantos segundos esperar quando o limite foi passado; 0 = pode seguir */
export function takeRateLimit(tokenId: string): number {
  const now = Date.now();
  const current = windows.get(tokenId);
  if (!current || now - current.start >= 60_000) {
    windows.set(tokenId, { start: now, count: 1 });
    return 0;
  }
  current.count++;
  return current.count > API_RATE_LIMIT ? Math.ceil((current.start + 60_000 - now) / 1000) : 0;
}
