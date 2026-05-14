/**
 * useInbox — integrates conversations (TanStack Query), messages (cache),
 * WebSocket, and persisted UI state (Zustand).
 *
 * What changed vs the previous version:
 *
 *  1. useConversations → useConversationsQuery
 *     Conversations are now cached in IndexedDB.  The list renders instantly
 *     on every navigation / page reload; the API is only hit when data is
 *     older than staleTime (60 s).
 *
 *  2. selectedConversation is driven by Zustand (inboxStore)
 *     The active conversation ID survives page refreshes.  On reload the last
 *     open chat is restored immediately from the persisted snapshot; the full
 *     conversation object is then derived from the (freshly fetched) list.
 *
 *  3. Draft messages persist across navigations and refreshes via inboxStore.
 */
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useConversationsQuery } from './queries/useConversationsQuery';
import { useMessages } from './useMessages';
import { useWebSocket } from './useWebSocket';
import { patchCachedMessage, patchCachedMessageStatus } from './useMessageCache';
import { useInboxStore } from '../stores/inboxStore';
import { conversationsApi } from '../services/api/inbox';
import type { ConversationWithDetails, MessageWithSender } from '../types/inbox';

interface UseInboxOptions {
    onlyWithHistory?: boolean;
    enablePolling?:   boolean;
}

export function useInbox(options: UseInboxOptions = {}) {
    const { onlyWithHistory = false, enablePolling = true } = options;

    // ── Zustand UI state ──────────────────────────────────────────────────────
    const activeConversationId      = useInboxStore((s) => s.activeConversationId);
    const lastSelectedConversation  = useInboxStore((s) => s.lastSelectedConversation);
    const setActiveConversation     = useInboxStore((s) => s.setActiveConversation);
    const getDraft                  = useInboxStore((s) => s.getDraft);
    const setDraft                  = useInboxStore((s) => s.setDraft);
    const clearDraft                = useInboxStore((s) => s.clearDraft);

    const refreshConversationsRef = useRef<() => void>(() => {});
    const refreshMessagesRef      = useRef<() => void>(() => {});
    const conversationsRef        = useRef<ConversationWithDetails[]>([]);

    // ── Conversations (TanStack Query — cache + IDB persistence) ─────────────
    const {
        conversations,
        loading:              conversationsLoading,
        error:                conversationsError,
        unreadCount,
        searchQuery,
        lastUpdate,
        refreshConversations,
        markAsRead:           markConversationAsRead,
        updateConversation,
        addNewMessage:        addNewMessageToList,
        search,
    } = useConversationsQuery(onlyWithHistory, { enablePolling });

    useEffect(() => {
        refreshConversationsRef.current = refreshConversations;
    }, [refreshConversations]);

    useEffect(() => {
        conversationsRef.current = conversations;
    }, [conversations]);

    // ── Derive selectedConversation ───────────────────────────────────────────
    // Priority: fresh data from list → persisted snapshot → null
    const selectedConversation = useMemo<ConversationWithDetails | null>(() => {
        if (!activeConversationId) return null;
        return (
            conversations.find((c) => c.id === activeConversationId) ??
            (lastSelectedConversation?.id === activeConversationId
                ? lastSelectedConversation
                : null)
        );
    }, [conversations, activeConversationId, lastSelectedConversation]);

    // ── Messages (existing hook — now backed by IDB-persisted cache) ──────────
    const {
        messages,
        loading:              messagesLoading,
        error:                messagesError,
        sending,
        messagesEndRef,
        scrollContainerRef,
        sendMessage,
        sendAudio,
        addMessage,
        addLocalMessage,
        updateLocalMessageProgress,
        failLocalMessage,
        updateMessageStatus,
        deleteMessage,
        refreshMessages,
        scrollToBottom,
    } = useMessages(selectedConversation?.id ?? null);

    useEffect(() => {
        refreshMessagesRef.current = refreshMessages;
    }, [refreshMessages]);

    // ── Notification sound ────────────────────────────────────────────────────
    const playNotificationSound = useCallback(() => {
        try {
            const Ctx = window.AudioContext || (window as any).webkitAudioContext;
            if (!Ctx) return;
            const ctx  = new Ctx() as AudioContext;
            const osc  = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.12);
            gain.gain.setValueAtTime(0.35, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.4);
            osc.onended = () => ctx.close().catch(() => {});
        } catch {
            // Non-critical
        }
    }, []);

    // ── WebSocket ──────────────────────────────────────────────────────────────
    const { isConnected: wsConnected, error: wsError, markAsRead: wsMarkAsRead, sendTyping: wsSendTyping } =
        useWebSocket({
            onNewMessage: useCallback(
                (data) => {
                    if (data.conversationId === selectedConversation?.id) {
                        addMessage(data.message);
                    } else {
                        patchCachedMessage(data.conversationId, data.message);
                    }
                    if (data.message.direction === 'in') {
                        const conv = conversationsRef.current.find((c) => c.id === data.conversationId);
                        const isGroup = conv && (
                            conv.metadata?.jid?.includes('@g.us') ||
                            (conv as any).is_group ||
                            conv.metadata?.is_group ||
                            conv.contact?.is_group
                        );
                        if (!isGroup) playNotificationSound();
                    }
                    addNewMessageToList(data.conversationId, data.message);
                },
                [selectedConversation?.id, addMessage, addNewMessageToList, playNotificationSound],
            ),

            onMessageStatusUpdate: useCallback(
                (data) => {
                    if (data.conversationId === selectedConversation?.id) {
                        updateMessageStatus(data.messageId, data.status);
                    } else {
                        patchCachedMessageStatus(data.conversationId, data.messageId, data.status);
                    }
                },
                [selectedConversation?.id, updateMessageStatus],
            ),

            onConversationUpdate: useCallback(
                (data) => updateConversation(data.conversationId, data.updates),
                [updateConversation],
            ),

            onUnreadCountUpdate: useCallback(() => {
                // unreadCount is derived from conversations list — no action needed
            }, []),

            onConversationRead: useCallback(
                (data) => {
                    if (data.conversationId !== selectedConversation?.id) {
                        updateConversation(data.conversationId, { unread_count: 0 });
                    }
                },
                [selectedConversation?.id, updateConversation],
            ),

            onReconnect: useCallback(() => {
                refreshConversationsRef.current();
                refreshMessagesRef.current();
            }, []),
        });

    // ── Select conversation ───────────────────────────────────────────────────
    const selectConversation = useCallback(
        async (conversation: ConversationWithDetails | null) => {
            if (!conversation) {
                setActiveConversation(null);
                return;
            }
            // Persist selection to Zustand immediately (survives refresh)
            const conv =
                conversation.unread_count > 0
                    ? { ...conversation, unread_count: 0 }
                    : conversation;
            setActiveConversation(conv);

            if (conversation.unread_count > 0) {
                // Optimistic cache update is handled by markAsRead inside the query hook
                await markConversationAsRead(conversation.id);
                wsMarkAsRead(conversation.id);
            }
        },
        [setActiveConversation, markConversationAsRead, wsMarkAsRead],
    );

    // ── Send message ──────────────────────────────────────────────────────────
    const handleSendMessage = useCallback(
        async (content: string, mediaUrl?: string, mediaType?: string, replaceTempId?: string) => {
            if (!selectedConversation) return;
            // Clear draft on send
            clearDraft(selectedConversation.id);
            try {
                await sendMessage(content, mediaUrl, mediaType, replaceTempId);
                window.dispatchEvent(new CustomEvent('leadflow:usage-changed'));
            } catch (error: any) {
                if (error?.response?.status === 429 || error?.response?.data?.upgrade || error?.message?.includes('Limite')) {
                    window.dispatchEvent(new CustomEvent('leadflow:show-upgrade'));
                }
                throw error;
            }
        },
        [selectedConversation, sendMessage, clearDraft],
    );

    const handleTyping = useCallback(
        (isTyping: boolean) => {
            if (selectedConversation) wsSendTyping(selectedConversation.id, isTyping);
        },
        [selectedConversation, wsSendTyping],
    );

    const handleForwardMessage = useCallback(
        async (message: MessageWithSender, targetConversationIds: string[]) => {
            const payload = {
                content:    message.content || '',
                media_url:  message.media_url,
                media_type: message.media_type,
            };
            await Promise.all(
                targetConversationIds.map((id) => conversationsApi.forwardMessage(id, payload)),
            );
        },
        [],
    );

    return {
        // Conversations
        conversations,
        selectedConversation,
        selectConversation,
        conversationsLoading,
        conversationsError,
        unreadCount,
        searchQuery,
        search,
        refreshConversations,
        lastUpdate,

        // Messages
        messages,
        messagesLoading,
        messagesError,
        sending,
        messagesEndRef,
        scrollContainerRef,
        sendMessage:              handleSendMessage,
        sendAudio,
        addLocalMessage,
        updateLocalMessageProgress,
        failLocalMessage,
        deleteMessage,
        forwardMessage:           handleForwardMessage,
        refreshMessages,
        scrollToBottom,

        // WebSocket
        wsConnected,
        wsError,
        handleTyping,

        // Draft helpers (exposed so MessageInput can persist unsent text)
        getDraft,
        setDraft,
        clearDraft,

        loading: conversationsLoading || messagesLoading,
        error:   conversationsError || messagesError || wsError,
    };
}
