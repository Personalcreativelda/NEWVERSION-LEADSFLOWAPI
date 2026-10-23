/**
 * Fila de envio offline ("outbox"): mensagens, alterações de leads e notas feitas com o
 * servidor em baixo ficam guardadas no aparelho e são enviadas por ordem quando ele volta.
 *
 * Só entram aqui pedidos que não chegaram ao servidor (isServerDownError). Cada tipo tem o
 * seu "sender", registado pelo cliente da API respetivo (registerOutboxSender). O reenvio de
 * mensagens leva o id do cliente para a API não as enviar duas vezes.
 */
import { useSyncExternalStore } from 'react';
import { createStore, del, get, set } from 'idb-keyval';
import { toast } from 'sonner';
import { currentUserId } from './offlineCache';
import { SERVER_BACK_EVENT, isServerDownError } from './serverStatus';

interface OutboxBase {
  /** Também é o id temporário mostrado no ecrã (bolha "temp_…", nota "queued_…") */
  id: string;
  userId: string;
  createdAt: number;
}

export type OutboxItem =
  | (OutboxBase & { kind: 'message'; conversationId: string; content: string; mediaUrl?: string; mediaType?: string })
  | (OutboxBase & { kind: 'lead-update'; leadId: string; payload: Record<string, unknown> })
  | (OutboxBase & { kind: 'lead-note'; leadId: string; content: string });

type OutboxKind = OutboxItem['kind'];
type NewOutboxItem = OutboxItem extends infer T ? (T extends OutboxItem ? Omit<T, 'userId' | 'createdAt'> : never) : never;

/** Disparado com { item, result } quando um item é enviado */
export const OUTBOX_SENT_EVENT = 'leadsflow:outbox-sent';
/** Disparado com { item, error } quando a API recusa um item (não volta à fila) */
export const OUTBOX_FAILED_EVENT = 'leadsflow:outbox-failed';

const QUEUED_TOAST = 'Sem ligação ao servidor: fica na fila e é enviado quando a ligação voltar.';

const store = createStore('leadflow-outbox-db', 'items');
const KEY = 'queue';

let items: OutboxItem[] = [];
const ready: Promise<void> = get<OutboxItem[]>(KEY, store)
  .then((saved) => { items = Array.isArray(saved) ? saved : []; })
  .catch(() => {})
  .then(() => emit());

const listeners = new Set<() => void>();
const senders: Partial<Record<OutboxKind, (item: any) => Promise<unknown>>> = {};

function emit() {
  listeners.forEach((listener) => listener());
}

async function persist() {
  emit();
  try {
    await set(KEY, items, store);
  } catch {
    // IndexedDB indisponível: a fila fica só em memória até fechar o app
  }
}

export function registerOutboxSender<K extends OutboxKind>(
  kind: K,
  send: (item: Extract<OutboxItem, { kind: K }>) => Promise<unknown>,
) {
  senders[kind] = send;
}

/**
 * Põe um pedido na fila. Um item com o mesmo id substitui o anterior (várias alterações
 * ao mesmo lead viram uma só, com os dados mais recentes).
 */
export async function enqueueOutbox(item: NewOutboxItem): Promise<void> {
  await ready;
  const userId = currentUserId();
  if (!userId) throw new Error('Sessão sem utilizador: não é possível guardar na fila.');
  const full = { ...item, userId, createdAt: Date.now() } as OutboxItem;
  const index = items.findIndex((existing) => existing.id === item.id);
  items = index === -1 ? [...items, full] : items.map((existing, i) => (i === index ? full : existing));
  toast.info(QUEUED_TOAST);
  await persist();
}

function mine(): OutboxItem[] {
  const userId = currentUserId();
  return items.filter((item) => item.userId === userId);
}

export function queuedMessages(conversationId: string) {
  return mine().filter((item): item is Extract<OutboxItem, { kind: 'message' }> =>
    item.kind === 'message' && item.conversationId === conversationId);
}

export function queuedLeadUpdates(): Map<string, Record<string, unknown>> {
  const updates = new Map<string, Record<string, unknown>>();
  for (const item of mine()) if (item.kind === 'lead-update') updates.set(item.leadId, item.payload);
  return updates;
}

export function queuedLeadNotes(leadId: string) {
  return mine().filter((item): item is Extract<OutboxItem, { kind: 'lead-note' }> =>
    item.kind === 'lead-note' && item.leadId === leadId);
}

let flushing = false;

/** Envia a fila por ordem; para no primeiro pedido que volte a não chegar ao servidor */
export async function flushOutbox(): Promise<void> {
  if (flushing) return;
  flushing = true;
  let sent = 0;
  try {
    await ready;
    for (const item of mine()) {
      const send = senders[item.kind];
      if (!send) continue;
      try {
        const result = await send(item);
        items = items.filter((existing) => existing.id !== item.id);
        await persist();
        sent++;
        window.dispatchEvent(new CustomEvent(OUTBOX_SENT_EVENT, { detail: { item, result } }));
      } catch (error) {
        if (isServerDownError(error)) break; // continua em baixo: fica para a próxima
        items = items.filter((existing) => existing.id !== item.id);
        await persist();
        window.dispatchEvent(new CustomEvent(OUTBOX_FAILED_EVENT, { detail: { item, error } }));
        const reason = error instanceof Error ? error.message : String(error);
        toast.error(`Não foi possível enviar um pedido da fila: ${reason}`);
      }
    }
  } finally {
    flushing = false;
  }
  if (sent > 0) toast.success(sent === 1 ? '1 pedido da fila enviado.' : `${sent} pedidos da fila enviados.`);
}

export async function clearOutbox(): Promise<void> {
  items = [];
  emit();
  try {
    await del(KEY, store);
  } catch {
    // idem
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Quantos pedidos do utilizador atual estão à espera de envio */
export function useOutboxCount(): number {
  return useSyncExternalStore(subscribe, () => mine().length);
}

// O servidor voltou (ou a internet): envia o que ficou na fila
if (typeof window !== 'undefined') {
  window.addEventListener(SERVER_BACK_EVENT, () => void flushOutbox());
  window.addEventListener('online', () => void flushOutbox());
  void ready.then(() => { if (mine().length > 0) void flushOutbox(); });
}
