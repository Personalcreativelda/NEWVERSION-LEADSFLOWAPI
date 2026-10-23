/**
 * Estado da ligação ao servidor (API), partilhado por todo o app.
 *
 * Os clientes da API chamam reportServerDown quando um pedido não chega ao servidor e
 * reportServerUp quando um pedido corre bem. Enquanto o servidor está em baixo, a rota
 * /api/health é consultada a cada 15 s; quando volta a responder é disparado o evento
 * SERVER_BACK_EVENT, que o painel usa para recarregar os dados.
 */
import { useSyncExternalStore } from 'react';
import { getApiBaseUrl } from '../utils/api-client';

export interface ServerStatus {
  down: boolean;
  /** Quando foi guardada a cópia mais antiga que está a ser mostrada (null = nenhuma) */
  staleSince: number | null;
}

export const SERVER_BACK_EVENT = 'leadsflow:server-back';
export const SERVER_DOWN_MESSAGE = 'Servidor indisponível. Tente de novo quando a ligação voltar.';

/** Respostas do proxy (Coolify) quando o contentor da API não responde */
export const SERVER_DOWN_STATUS = new Set([502, 503, 504]);

/**
 * 502/503/504 só contam como "servidor em baixo" quando não vêm da nossa API (a página de erro
 * do proxy não é JSON) ou quando a API diz que está sem base de dados (code SERVER_UNAVAILABLE).
 * Um 503 normal da API (ex.: "instância do WhatsApp não existe") é um erro como os outros.
 */
export function isServerDownResponse(status: number, contentType: string | null | undefined, body?: unknown): boolean {
  if (!SERVER_DOWN_STATUS.has(status)) return false;
  if (!contentType?.toLowerCase().includes('json')) return true;
  return (body as { code?: string } | null)?.code === 'SERVER_UNAVAILABLE';
}

/** O pedido não chegou ao servidor (sem rede, tempo esgotado, 502/503/504 do proxy) */
export class ServerDownError extends Error {
  constructor() {
    super(SERVER_DOWN_MESSAGE);
    this.name = 'ServerDownError';
  }
}

/** Erro de servidor inalcançável, venha de fetch (ServerDownError) ou de axios (withOfflineCache) */
export function isServerDownError(error: unknown): boolean {
  return error instanceof ServerDownError || (error as { isServerDown?: boolean } | null)?.isServerDown === true;
}

const POLL_MS = 15_000;

let status: ServerStatus = { down: false, staleSince: null };
const listeners = new Set<() => void>();
let pollTimer: ReturnType<typeof setInterval> | null = null;

function emit() {
  listeners.forEach((listener) => listener());
}

export function reportServerDown(cachedAt?: number) {
  const staleSince = cachedAt ? Math.min(status.staleSince ?? cachedAt, cachedAt) : status.staleSince;
  if (status.down && staleSince === status.staleSince) return;
  status = { down: true, staleSince };
  emit();
  startPolling();
}

export function reportServerUp() {
  if (!status.down) return;
  status = { down: false, staleSince: null };
  stopPolling();
  emit();
  window.dispatchEvent(new Event(SERVER_BACK_EVENT));
}

/** AbortSignal que dispara ao fim de `ms` (AbortSignal.timeout não existe em WebViews antigas) */
export function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(new DOMException('Tempo esgotado', 'TimeoutError')), ms);
  return controller.signal;
}

/** Pergunta já à API se está viva; devolve true se respondeu */
export async function checkServerNow(): Promise<boolean> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/health`, { cache: 'no-store', signal: timeoutSignal(5_000) });
    if (response.ok) {
      reportServerUp();
      return true;
    }
  } catch {
    // continua em baixo
  }
  return false;
}

const onOnline = () => {
  void checkServerNow();
};

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    if (navigator.onLine) void checkServerNow();
  }, POLL_MS);
  window.addEventListener('online', onOnline);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  window.removeEventListener('online', onOnline);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useServerStatus(): ServerStatus {
  return useSyncExternalStore(subscribe, () => status);
}
