// In-memory message cache for instant chat switching (WhatsApp-like UX).
// Lives as a module singleton — survives hook remounts but resets on page reload.
import type { MessageWithSender } from '../types/inbox';

interface CacheEntry {
    messages: MessageWithSender[];
    fetchedAt: number;        // epoch ms of last full fetch
    scrollTop: number | null; // scroll position to restore
}

const MAX_CACHED_CHATS = 50;
const CACHE_FRESH_MS = 30_000; // consider data fresh for 30s

const cache = new Map<string, CacheEntry>();

/** Order keys were last accessed — oldest first for eviction */
const accessOrder: string[] = [];

function touchAccess(conversationId: string) {
    const idx = accessOrder.indexOf(conversationId);
    if (idx !== -1) accessOrder.splice(idx, 1);
    accessOrder.push(conversationId);

    // Evict oldest when over limit
    while (accessOrder.length > MAX_CACHED_CHATS) {
        const oldest = accessOrder.shift()!;
        cache.delete(oldest);
    }
}

// ── Public API ────────────────────────────────────────────

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
}

/** Append or update a single message in a conversation's cache (from WS / optimistic). */
export function patchCachedMessage(conversationId: string, message: MessageWithSender) {
    const entry = cache.get(conversationId);
    if (!entry) return;

    const idx = entry.messages.findIndex(m => m.id === message.id);
    if (idx !== -1) {
        // Update existing (e.g. status change)
        entry.messages[idx] = message;
    } else {
        // Dedup: check for temp_ replacement
        if (message.direction === 'out') {
            const tempIdx = entry.messages.findIndex(
                m => m.id.startsWith('temp_') && m.direction === 'out' && m.status === 'pending'
            );
            if (tempIdx !== -1) {
                entry.messages[tempIdx] = { ...message, status: message.status || 'sent' };
                return;
            }
        }
        entry.messages.push(message);
    }
}

/** Update a message's status in cache. */
export function patchCachedMessageStatus(
    conversationId: string,
    messageId: string,
    status: MessageWithSender['status']
) {
    const entry = cache.get(conversationId);
    if (!entry) return;
    const msg = entry.messages.find(m => m.id === messageId);
    if (msg) msg.status = status;
}

// ── Scroll position ───────────────────────────────────────

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
