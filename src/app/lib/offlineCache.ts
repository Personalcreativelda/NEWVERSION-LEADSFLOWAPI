/**
 * Cópia offline das respostas da API (pedidos GET), guardada no IndexedDB do aparelho.
 *
 * Cada resposta boa fica guardada. Quando o servidor não responde (sem rede, 502/503/504,
 * tempo esgotado), os clientes da API devolvem a última cópia em vez de falhar, e o painel
 * avisa que está a mostrar dados guardados. As cópias são separadas por utilizador e
 * apagadas ao terminar a sessão.
 */
import { get, set, clear, createStore } from 'idb-keyval';
import { queryClient } from './queryClient';
import { idbPersister } from './idbPersister';
import { idbClearMessages } from './idbStore';

const store = createStore('leadflow-offline-db', 'responses');

// Cópias mais antigas do que isto já não são mostradas
const MAX_AGE_MS = 30 * 24 * 60 * 60_000;

// Respostas que não faz sentido guardar: sessão, ficheiros, versão do app, saúde da API
const SKIP = [/^\/api\/auth\//, /^\/api\/files\//, /^\/api\/version\//, /^\/api\/health/, /media-proxy/];

/** Tempo máximo de um GET antes de se considerar o servidor em baixo */
export const GET_TIMEOUT_MS = 20_000;

interface CachedResponse {
  data: unknown;
  savedAt: number;
}

export function currentUserId(): string | null {
  try {
    return JSON.parse(localStorage.getItem('leadflow_user') || 'null')?.id ?? null;
  } catch {
    return null;
  }
}

/** "/api/leads?offset=0" — o mesmo formato para fetch e axios, sem o domínio */
export function cachePath(url: string): string {
  const path = url.replace(/^https?:\/\/[^/]+/, '');
  if (path.startsWith('/api')) return path;
  return `/api${path.startsWith('/') ? '' : '/'}${path}`;
}

function cacheKey(url: string): string | null {
  const userId = currentUserId();
  const path = cachePath(url);
  if (!userId || SKIP.some((re) => re.test(path))) return null;
  return `${userId}|${path}`;
}

export async function saveCachedResponse(url: string, data: unknown): Promise<void> {
  const key = cacheKey(url);
  if (!key) return;
  try {
    await set(key, { data, savedAt: Date.now() } satisfies CachedResponse, store);
  } catch {
    // IndexedDB indisponível ou sem espaço: o app funciona na mesma, só sem cópia
  }
}

export async function loadCachedResponse(url: string): Promise<CachedResponse | undefined> {
  const key = cacheKey(url);
  if (!key) return undefined;
  try {
    const entry = await get<CachedResponse>(key, store);
    if (entry && Date.now() - entry.savedAt < MAX_AGE_MS) return entry;
  } catch {
    // idem
  }
  return undefined;
}

/**
 * Apaga tudo o que o utilizador deixou guardado no aparelho: estas cópias, o cache do
 * React Query (conversas) e o cache de mensagens. Chamado ao terminar a sessão.
 */
export async function clearOfflineCache(): Promise<void> {
  queryClient.clear();
  await Promise.allSettled([clear(store), idbPersister.removeClient(), idbClearMessages()]);
}
