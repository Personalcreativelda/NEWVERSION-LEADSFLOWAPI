import { QueryClient } from '@tanstack/react-query';

// staleTime: how long data is considered fresh (no background refetch)
// gcTime: how long unused cache entries are kept in memory (and IndexedDB)
export const STALE = {
    conversations:  0,               // always stale → refetchOnMount/Focus always fires
    messages:       30_000,          // 30 s  — updated via WebSocket in real-time
    campaigns:      5  * 60_000,     // 5 min — less dynamic
    stats:          5  * 60_000,     // 5 min
    leads:          2  * 60_000,     // 2 min
} as const;

export const GC = {
    conversations:  24 * 60 * 60_000,  // 24 h — survive page reload
    messages:       24 * 60 * 60_000,
    campaigns:      24 * 60 * 60_000,
    stats:               60 * 60_000,  // 1 h  — less critical
    leads:          2  * 60 * 60_000,
} as const;

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // Never refetch just because the window regained focus or the
            // component mounted — rely exclusively on staleTime.
            refetchOnWindowFocus: false,
            refetchOnMount: false,
            refetchOnReconnect: 'always', // but DO sync when network comes back
            retry: 2,
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15_000),
            staleTime: STALE.conversations,
            gcTime:    GC.conversations,
            networkMode: 'offlineFirst', // serve cache immediately, fetch in bg
        },
        mutations: {
            retry: 1,
        },
    },
});
