/**
 * Zustand store for Inbox UI state.
 *
 * Persisted to localStorage so the user lands back on their last open
 * conversation, with their filters and unsent text intact, even after a
 * page refresh.  We keep only small serialisable primitives here — the
 * full conversation/message objects come from TanStack Query / IDB.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ConversationWithDetails } from '../types/inbox';

interface InboxState {
    // Active conversation ────────────────────────────────────────────────────
    activeConversationId: string | null;
    /**
     * Snapshot of the last selected conversation object.  Used to render
     * the chat panel immediately on refresh while the full list re-loads.
     */
    lastSelectedConversation: ConversationWithDetails | null;

    // Filters ────────────────────────────────────────────────────────────────
    searchQuery:   string;
    statusFilter:  string;  // 'all' | 'open' | 'resolved' | 'pending' …
    channelFilter: string;  // 'all' | 'whatsapp' | 'email' | 'telegram' …

    // Per-conversation unsent drafts ─────────────────────────────────────────
    /** conversationId → draft text not yet sent */
    draftMessages: Record<string, string>;

    // Actions ────────────────────────────────────────────────────────────────
    setActiveConversation:  (conv: ConversationWithDetails | null) => void;
    setSearchQuery:         (q: string) => void;
    setStatusFilter:        (s: string) => void;
    setChannelFilter:       (c: string) => void;
    setDraft:               (conversationId: string, text: string) => void;
    clearDraft:             (conversationId: string) => void;
    getDraft:               (conversationId: string) => string;
}

export const useInboxStore = create<InboxState>()(
    persist(
        (set, get) => ({
            activeConversationId:     null,
            lastSelectedConversation: null,
            searchQuery:              '',
            statusFilter:             'all',
            channelFilter:            'all',
            draftMessages:            {},

            setActiveConversation: (conv) =>
                set({
                    activeConversationId:     conv?.id ?? null,
                    lastSelectedConversation: conv,
                }),

            setSearchQuery:   (q) => set({ searchQuery:   q }),
            setStatusFilter:  (s) => set({ statusFilter:  s }),
            setChannelFilter: (c) => set({ channelFilter: c }),

            setDraft: (conversationId, text) =>
                set((s) => ({
                    draftMessages: { ...s.draftMessages, [conversationId]: text },
                })),

            clearDraft: (conversationId) =>
                set((s) => {
                    const { [conversationId]: _removed, ...rest } = s.draftMessages;
                    return { draftMessages: rest };
                }),

            getDraft: (conversationId) => get().draftMessages[conversationId] ?? '',
        }),
        {
            name: 'leadflow-inbox-ui',
            storage: createJSONStorage(() => localStorage),
            // Limit what is persisted — File objects, refs, etc. must never end up here
            partialize: (s) => ({
                activeConversationId:     s.activeConversationId,
                lastSelectedConversation: s.lastSelectedConversation,
                searchQuery:              s.searchQuery,
                statusFilter:             s.statusFilter,
                channelFilter:            s.channelFilter,
                draftMessages:            s.draftMessages,
            }),
        },
    ),
);
