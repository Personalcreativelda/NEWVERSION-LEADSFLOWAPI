/**
 * Drop-in replacement for useConversations that uses TanStack Query.
 *
 * Key improvements over the old polling hook:
 *  - Cache persisted to IndexedDB → list is instant on page load/refresh.
 *  - stale-while-revalidate: shows cached data immediately, fetches in bg.
 *  - Background refetch every 30 s only when no search query is active
 *    (WebSocket keeps data fresh for the active session anyway).
 *  - refetchOnMount: false — won't hit the API if data is still fresh.
 *  - WebSocket mutations (addNewMessage, updateConversation, markAsRead)
 *    update the cache optimistically via queryClient.setQueriesData so every
 *    component that calls this hook sees the change instantly.
 *  - Search results get their own cache entry per query string so they are
 *    also cached for 30 s (e.g. re-typing the same search is instant).
 *
 * The returned API surface is identical to the old useConversations so that
 * useInbox and any other callers need zero structural changes.
 */
import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { conversationsApi } from '../../services/api/inbox';
import type { ConversationWithDetails } from '../../types/inbox';
import { STALE, GC } from '../../lib/queryClient';

// ── Query key helpers ─────────────────────────────────────────────────────────

export const convQueryKey = (onlyWithHistory: boolean, search = '') =>
    ['conversations', { onlyWithHistory, q: search }] as const;

// ── Hook ──────────────────────────────────────────────────────────────────────

interface UseConversationsQueryOptions {
    enablePolling?: boolean;
}

export function useConversationsQuery(
    onlyWithHistory = false,
    { enablePolling = true }: UseConversationsQueryOptions = {},
) {
    const qc = useQueryClient();
    const [searchQuery, setSearchQuery] = useState('');

    // ── Data fetch ───────────────────────────────────────────────────────────

    const { data: conversations = [], isLoading: loading, error: queryError, dataUpdatedAt, isFetching } = useQuery({
        queryKey:     convQueryKey(onlyWithHistory, searchQuery),
        queryFn:      () =>
            conversationsApi.getAll({
                search:           searchQuery || undefined,
                limit:            100,
                only_with_history: onlyWithHistory,
            }) as Promise<ConversationWithDetails[]>,
        // staleTime 0: data is always stale → window focus and mount always trigger a background refetch.
        // This is the key fix: without this, the 60s staleTime was blocking refetchOnMount/Focus.
        staleTime:   0,
        gcTime:      GC.conversations,
        // Poll every 5 s when not searching (WebSocket keeps it instant; this is the safety net).
        refetchInterval:           enablePolling && !searchQuery ? 5_000 : false,
        // Refetch in background even when tab is hidden (so list is fresh when user switches back)
        refetchIntervalInBackground: true,
        // Always fetch fresh data when the component mounts (first open of inbox)
        refetchOnMount:           true,
        // Refetch immediately when the user comes back to the tab
        refetchOnWindowFocus:     true,
        // Keep the previous list visible while loading a new search query
        placeholderData:          (prev) => prev,
    });

    const error      = queryError ? (queryError as Error).message : null;
    const lastUpdate = useMemo(() => new Date(dataUpdatedAt), [dataUpdatedAt]);
    const isRefreshing = isFetching && !loading; // background refresh (not first load)
    const unreadCount = useMemo(
        () => conversations.reduce((n, c) => n + c.unread_count, 0),
        [conversations],
    );

    // ── Helpers that target all matching cache keys ───────────────────────────
    // This ensures both the base list and any active search view stay in sync.

    const mutateAll = useCallback(
        (updater: (prev: ConversationWithDetails[]) => ConversationWithDetails[]) => {
            qc.setQueriesData<ConversationWithDetails[]>(
                { queryKey: ['conversations'], exact: false },
                (prev) => (prev ? updater(prev) : prev),
            );
        },
        [qc],
    );

    // ── Public mutations ──────────────────────────────────────────────────────

    const refreshConversations = useCallback(() => {
        qc.invalidateQueries({ queryKey: ['conversations'], exact: false });
    }, [qc]);

    const markAsRead = useCallback(async (conversationId: string) => {
        // Optimistic update — reflects instantly in the UI
        mutateAll((prev) =>
            prev.map((c) =>
                c.id === conversationId ? { ...c, unread_count: 0 } : c,
            ),
        );
        try {
            await conversationsApi.markAsRead(conversationId);
        } catch (err) {
            console.error('[useConversationsQuery] markAsRead failed:', err);
            // On error, trigger a refresh so the UI stays consistent
            refreshConversations();
        }
    }, [mutateAll, refreshConversations]);

    const updateConversation = useCallback(
        (conversationId: string, updates: Partial<ConversationWithDetails>) => {
            mutateAll((prev) =>
                prev.map((c) =>
                    c.id === conversationId ? { ...c, ...updates } : c,
                ),
            );
        },
        [mutateAll],
    );

    const addNewMessage = useCallback(
        (conversationId: string, message: any) => {
            let needsRefresh = false;
            mutateAll((prev) => {
                const exists = prev.some((c) => c.id === conversationId);
                if (!exists) {
                    needsRefresh = true;
                    return prev;
                }
                const updated = prev.map((c) => {
                    if (c.id !== conversationId) return c;
                    return {
                        ...c,
                        last_message: {
                            id:         message.id,
                            content:    message.content,
                            direction:  message.direction,
                            status:     message.status,
                            created_at: message.created_at,
                            media_url:  message.media_url,
                            media_type: message.media_type,
                        },
                        last_message_at: message.created_at,
                        unread_count:
                            message.direction === 'in'
                                ? c.unread_count + 1
                                : c.unread_count,
                    };
                });
                return updated.sort(
                    (a, b) =>
                        new Date(b.last_message_at).getTime() -
                        new Date(a.last_message_at).getTime(),
                );
            });
            // Conversation didn't exist in cache — refresh immediately.
            // This is the fallback for when new_conversation WS event doesn't arrive.
            if (needsRefresh) refreshConversations();
        },
        [mutateAll, refreshConversations],
    );

    const search = useCallback((query: string) => {
        setSearchQuery(query);
    }, []);

    return {
        conversations,
        loading,
        isRefreshing,
        error,
        unreadCount,
        searchQuery,
        lastUpdate,
        refreshConversations,
        markAsRead,
        updateConversation,
        addNewMessage,
        search,
        // No-ops: TanStack Query manages the refetch lifecycle automatically
        startPolling: () => {},
        stopPolling:  () => {},
    };
}
