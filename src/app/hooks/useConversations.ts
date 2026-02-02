// INBOX: Hook para gerenciar conversas
import { useState, useEffect, useCallback } from 'react';
import { conversationsApi } from '../services/api/inbox';
import type { ConversationWithDetails } from '../types/inbox';

export function useConversations(onlyWithHistory: boolean = false) {
    const [conversations, setConversations] = useState<ConversationWithDetails[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [unreadCount, setUnreadCount] = useState(0);

    const fetchConversations = useCallback(async (search?: string) => {
        try {
            setLoading(true);
            setError(null);
            const data = await conversationsApi.getAll({ 
                search, 
                limit: 100,
                only_with_history: onlyWithHistory 
            });
            setConversations(data);

            // Calcular total de não lidas
            const total = data.reduce((sum, conv) => sum + conv.unread_count, 0);
            setUnreadCount(total);
        } catch (err: any) {
            console.error('[useConversations] Error fetching:', err);
            setError(err.message || 'Failed to load conversations');
        } finally {
            setLoading(false);
        }
    }, [onlyWithHistory]);

    const refreshConversations = useCallback(() => {
        fetchConversations(searchQuery);
    }, [fetchConversations, searchQuery]);

    const markAsRead = useCallback(async (conversationId: string) => {
        try {
            await conversationsApi.markAsRead(conversationId);

            // Atualizar localmente
            setConversations(prev =>
                prev.map(conv =>
                    conv.id === conversationId
                        ? { ...conv, unread_count: 0 }
                        : conv
                )
            );

            // Atualizar contador total
            setUnreadCount(prev => {
                const conv = conversations.find(c => c.id === conversationId);
                return Math.max(0, prev - (conv?.unread_count || 0));
            });
        } catch (err: any) {
            console.error('[useConversations] Error marking as read:', err);
        }
    }, [conversations]);

    const updateConversation = useCallback((conversationId: string, updates: Partial<ConversationWithDetails>) => {
        setConversations(prev =>
            prev.map(conv =>
                conv.id === conversationId
                    ? { ...conv, ...updates }
                    : conv
            )
        );
    }, []);

    const addNewMessage = useCallback((conversationId: string, message: any) => {
        setConversations(prev => {
            const updated = prev.map(conv => {
                if (conv.id === conversationId) {
                    return {
                        ...conv,
                        last_message: {
                            id: message.id,
                            content: message.content,
                            direction: message.direction,
                            status: message.status,
                            created_at: message.created_at,
                            media_url: message.media_url,
                            media_type: message.media_type
                        },
                        last_message_at: message.created_at,
                        unread_count: message.direction === 'in' ? conv.unread_count + 1 : conv.unread_count
                    };
                }
                return conv;
            });

            // Reordenar por última mensagem
            return updated.sort((a, b) =>
                new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
            );
        });

        // Atualizar contador se for mensagem recebida
        if (message.direction === 'in') {
            setUnreadCount(prev => prev + 1);
        }
    }, []);

    const search = useCallback((query: string) => {
        setSearchQuery(query);
        fetchConversations(query);
    }, [fetchConversations]);

    useEffect(() => {
        fetchConversations();
    }, [fetchConversations]);

    return {
        conversations,
        loading,
        error,
        unreadCount,
        searchQuery,
        refreshConversations,
        markAsRead,
        updateConversation,
        addNewMessage,
        search
    };
}
