// INBOX: Hook principal que integra conversas, mensagens e WebSocket
import { useState, useCallback, useEffect, useRef } from 'react';
import { useConversations } from './useConversations';
import { useMessages } from './useMessages';
import { useWebSocket } from './useWebSocket';
import type { ConversationWithDetails } from '../types/inbox';

interface UseInboxOptions {
    onlyWithHistory?: boolean;
    enablePolling?: boolean;
}

export function useInbox(options: UseInboxOptions = {}) {
    const { onlyWithHistory = false, enablePolling = true } = options;
    const [selectedConversation, setSelectedConversation] = useState<ConversationWithDetails | null>(null);
    const refreshConversationsRef = useRef<() => void>(() => {});
    const refreshMessagesRef = useRef<() => void>(() => {});

    // Gera beep de notificação via Web Audio API (sem dependência de URL externa)
    const playNotificationSound = useCallback(() => {
        try {
            const AudioContextClass =
                window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioContextClass) return;
            const ctx = new AudioContextClass() as AudioContext;
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);
            // Beep curto: 880 Hz → 440 Hz em 120ms, fade out até 400ms
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(880, ctx.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.12);
            gainNode.gain.setValueAtTime(0.35, ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
            oscillator.start(ctx.currentTime);
            oscillator.stop(ctx.currentTime + 0.4);
            // Fechar contexto após uso para liberação de recursos
            oscillator.onended = () => ctx.close().catch(() => {});
        } catch (e) {
            console.warn('[useInbox] Não foi possível reproduzir som de notificação:', e);
        }
    }, []);

    const {
        conversations,
        loading: conversationsLoading,
        error: conversationsError,
        unreadCount,
        searchQuery,
        lastUpdate,
        refreshConversations,
        markAsRead: markConversationAsRead,
        updateConversation,
        addNewMessage: addNewMessageToList,
        search
    } = useConversations(onlyWithHistory, { enablePolling });

    // Manter referência atualizada para refreshConversations
    useEffect(() => {
        refreshConversationsRef.current = refreshConversations;
    }, [refreshConversations]);

    const {
        messages,
        loading: messagesLoading,
        error: messagesError,
        sending,
        messagesEndRef,
        sendMessage,
        sendAudio,
        addMessage,
        updateMessageStatus,
        refreshMessages,
        scrollToBottom
    } = useMessages(selectedConversation?.id || null);

    // Manter referência atualizada para refreshMessages (deve vir após useMessages)
    useEffect(() => {
        refreshMessagesRef.current = refreshMessages;
    }, [refreshMessages]);

    // WebSocket integration
    const {
        isConnected: wsConnected,
        error: wsError,
        markAsRead: wsMarkAsRead,
        sendTyping: wsSendTyping
    } = useWebSocket({
        onNewMessage: useCallback((data) => {
            console.log('[useInbox] Nova mensagem recebida:', data);

            // Adicionar mensagem à lista se for da conversa atual
            if (data.conversationId === selectedConversation?.id) {
                addMessage(data.message);
            }

            // Tocar som se for mensagem recebida (IN)
            if (data.message.direction === 'in') {
                playNotificationSound();
            }

            // Atualizar lista de conversas
            addNewMessageToList(data.conversationId, data.message);
        }, [selectedConversation?.id, addMessage, addNewMessageToList, playNotificationSound]),

        onMessageStatusUpdate: useCallback((data) => {
            console.log('[useInbox] Status da mensagem atualizado:', data);

            if (data.conversationId === selectedConversation?.id) {
                updateMessageStatus(data.messageId, data.status);
            }
        }, [selectedConversation?.id, updateMessageStatus]),

        onConversationUpdate: useCallback((data) => {
            console.log('[useInbox] Conversa atualizada:', data);
            updateConversation(data.conversationId, data.updates);
        }, [updateConversation]),

        onUnreadCountUpdate: useCallback((data) => {
            console.log('[useInbox] Contador de não lidas atualizado:', data);
            // O hook useConversations já gerencia isso internamente
        }, []),

        onConversationRead: useCallback((data) => {
            console.log('[useInbox] Conversa marcada como lida:', data);

            if (data.conversationId !== selectedConversation?.id) {
                updateConversation(data.conversationId, { unread_count: 0 });
            }
        }, [selectedConversation?.id, updateConversation]),

        // Callback quando WebSocket reconecta - atualizar conversas e mensagens da conversa atual
        onReconnect: useCallback(() => {
            console.log('[useInbox] WebSocket reconectado - atualizando conversas e mensagens');
            refreshConversationsRef.current();
            // Recarregar mensagens da conversa atual para recuperar mensagens perdidas durante desconexão
            refreshMessagesRef.current();
        }, [])
    });

    const selectConversation = useCallback(async (conversation: ConversationWithDetails | null) => {
        // Se null, limpar a conversa selecionada (ex: ao deletar)
        if (!conversation) {
            setSelectedConversation(null);
            return;
        }

        // Atualizar conversa selecionada imediatamente com unread_count zerado
        const updatedConversation = conversation.unread_count > 0 
            ? { ...conversation, unread_count: 0 }
            : conversation;
        
        setSelectedConversation(updatedConversation);

        // Marcar como lida no backend
        if (conversation.unread_count > 0) {
            await markConversationAsRead(conversation.id);
            wsMarkAsRead(conversation.id);
        }
    }, [markConversationAsRead, wsMarkAsRead]);

    const handleSendMessage = useCallback(async (content: string, mediaUrl?: string, mediaType?: string) => {
        if (!selectedConversation) return;

        try {
            await sendMessage(content, mediaUrl, mediaType);
            // Notify App-level usage counters to refresh after a message is sent
            window.dispatchEvent(new CustomEvent('message-sent'));
        } catch (error) {
            console.error('[useInbox] Erro ao enviar mensagem:', error);
            throw error;
        }
    }, [selectedConversation, sendMessage]);

    const handleTyping = useCallback((isTyping: boolean) => {
        if (selectedConversation) {
            wsSendTyping(selectedConversation.id, isTyping);
        }
    }, [selectedConversation, wsSendTyping]);

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
        sendMessage: handleSendMessage,
        sendAudio,
        refreshMessages,
        scrollToBottom,

        // WebSocket
        wsConnected,
        wsError,
        handleTyping,

        // Combined state
        loading: conversationsLoading || messagesLoading,
        error: conversationsError || messagesError || wsError
    };
}
