/**
 * In-memory message cache for instant chat switching (WhatsApp-like UX).
 *
 * Architecture: two-layer cache
 *   L1 — module-level Map (in-memory, sub-millisecond reads)
 *   L2 — IndexedDB via idbStore (persists across page reloads)
 *
 * On first access for a conversation ID that is not in L1 but IS in L2,
 * the data is hydrated synchronously on the next call after the async
 * IDB read completes (useMessages calls getCachedMessages after awaiting
 * initMessageCacheFromIDB).
 *
 * Write-through: every setCachedMessages call also writes to IDB in the
 * background so L2 is always up-to-date.
 *
 * stale threshold for L1: 30 s — after that, background refresh fires even
 * if cache is populated (same as before).
 */
import type { MessageWithSender } from '../types/inbox';
import { idbSaveMessages, idbLoadMessages, idbLoadAllMessageKeys } from '../lib/idbStore';

interface CacheEntry {
    messages:   MessageWithSender[];
    fetchedAt:  number;
    scrollTop:  number | null;
}

const MAX_CACHED_CHATS = 50;
const CACHE_FRESH_MS   = 30_000;
// Keep IDB entries for up to 24 h — older entries are simply ignored
const IDB_MAX_AGE_MS   = 24 * 60 * 60_000;

const cache: Map<string, CacheEntry> = new Map();
const accessOrder: string[] = [];

function touchAccess(id: string) {
    const idx = accessOrder.indexOf(id);
    if (idx !== -1) accessOrder.splice(idx, 1);
    accessOrder.push(id);
    while (accessOrder.length > MAX_CACHED_CHATS) {
        const oldest = accessOrder.shift()!;
        cache.delete(oldest);
    }
}

// ── IDB hydration ──────────────────────────────────────────────────────────

let idbInitialised = false;
let idbInitPromise: Promise<void> | null = null;

/**
 * Load all persisted message entries from IDB into the in-memory cache.
 * Safe to call multiple times — runs only once.
 */
export async function initMessageCacheFromIDB(): Promise<void> {
    if (idbInitialised) return;
    if (idbInitPromise) return idbInitPromise;

    idbInitPromise = (async () => {
        try {
            const keys = await idbLoadAllMessageKeys();
            const now  = Date.now();
            await Promise.all(
                keys.map(async (convId) => {
                    const entry = await idbLoadMessages(convId);
                    if (!entry) return;
                    if (now - entry.savedAt > IDB_MAX_AGE_MS) return;
                    if (!cache.has(convId)) {
                        cache.set(convId, {
                            messages:  entry.messages as MessageWithSender[],
                            fetchedAt: entry.savedAt,
                            scrollTop: null,
                        });
                        touchAccess(convId);
                    }
                }),
            );
        } catch (e) {
            console.warn('[useMessageCache] IDB hydration failed:', e);
        } finally {
            idbInitialised = true;
        }
    })();
    return idbInitPromise;
}

// Start hydrating immediately when this module loads so data is ready
// before the first conversation is opened.
initMessageCacheFromIDB();

// ── Public API ────────────────────────────────────────────────────────────

export function getCachedMessages(conversationId: string): MessageWithSender[] | null {
    const entry = cache.get(conversationId);
    if (!entry) return null;
    touchAccess(conversationId);
    return entry.messages;
}

export function isCacheFresh(conversationId: string): boolean {
    const entry = cache.get(conversationId);
    if (!entry) return false;
    return Date.now() - entry.fetchedAt < CACHE_FRESH_MS;
}

export function setCachedMessages(conversationId: string, messages: MessageWithSender[]) {
    const existing = cache.get(conversationId);
    cache.set(conversationId, {
        messages,
        fetchedAt: Date.now(),
        scrollTop: existing?.scrollTop ?? null,
    });
    touchAccess(conversationId);

    // Write-through to IDB (non-blocking)
    idbSaveMessages(conversationId, messages).catch((e) =>
        console.warn('[useMessageCache] IDB write failed for', conversationId, e),
    );
}

/** Append or update a single message in a conversation's cache. */
export function patchCachedMessage(conversationId: string, message: MessageWithSender) {
    const entry = cache.get(conversationId);
    if (!entry) return;

    const idx = entry.messages.findIndex((m) => m.id === message.id);
    if (idx !== -1) {
        entry.messages[idx] = message;
    } else {
        // Dedup: replace a temp_ placeholder for outgoing messages
        if (message.direction === 'out') {
            const tempIdx = entry.messages.findIndex(
                (m) => m.id.startsWith('temp_') && m.direction === 'out' && m.status === 'pending',
            );
            if (tempIdx !== -1) {
                entry.messages[tempIdx] = { ...message, status: message.status || 'sent' };
                return;
            }
        }
        entry.messages.push(message);
    }

    // Write-through — keep IDB current
    idbSaveMessages(conversationId, entry.messages).catch(() => {});
}

/** Update a message's status in cache. */
export function patchCachedMessageStatus(
    conversationId: string,
    messageId:      string,
    status:         MessageWithSender['status'],
) {
    const entry = cache.get(conversationId);
    if (!entry) return;
    const msg = entry.messages.find((m) => m.id === messageId);
    if (msg) {
        msg.status = status;
        idbSaveMessages(conversationId, entry.messages).catch(() => {});
    }
}

// ── Scroll position ───────────────────────────────────────────────────────

export function saveScrollPosition(conversationId: string, scrollTop: number) {
    const entry = cache.get(conversationId);
    if (entry) entry.scrollTop = scrollTop;
}

export function getScrollPosition(conversationId: string): number | null {
    return cache.get(conversationId)?.scrollTop ?? null;
}

export function clearScrollPosition(conversationId: string) {
    const entry = cache.get(conversationId);
    if (entry) entry.scrollTop = null;
}
