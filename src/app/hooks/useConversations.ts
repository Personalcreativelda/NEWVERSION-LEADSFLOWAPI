// INBOX: Hook para gerenciar conversas
import { useState, useEffect, useCallback, useRef } from 'react';
import { conversationsApi } from '../services/api/inbox';
import type { ConversationWithDetails } from '../types/inbox';

// Intervalo de polling em ms (30 segundos como fallback quando WS não funciona)
const POLLING_INTERVAL = 30000;

interface UseConversationsOptions {
    enablePolling?: boolean;
}

export function useConversations(onlyWithHistory: boolean = false, options: UseConversationsOptions = {}) {
    const { enablePolling = true } = options;
    const [conversations, setConversations] = useState<ConversationWithDetails[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [unreadCount, setUnreadCount] = useState(0);
    const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
    const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const fetchConversations = useCallback(async (search?: string, silent: boolean = false) => {
        try {
            if (!silent) {
                setLoading(true);
            }
            setError(null);
            const data = await conversationsApi.getAll({
                search,
                limit: 100,
                only_with_history: onlyWithHistory
            });
            setConversations(data);
            setLastUpdate(new Date());

            // Calcular total de não lidas
            const total = data.reduce((sum, conv) => sum + conv.unread_count, 0);
            setUnreadCount(total);
        } catch (err: any) {
            console.error('[useConversations] Error fetching:', err);
            if (!silent) {
                setError(err.message || 'Failed to load conversations');
            }
        } finally {
            if (!silent) {
                setLoading(false);
            }
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

    // Função para iniciar polling
    const startPolling = useCallback(() => {
        if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
        }

        pollingIntervalRef.current = setInterval(() => {
            console.log('[useConversations] Polling for updates...');
            fetchConversations(searchQuery, true); // silent: true para não mostrar loading
        }, POLLING_INTERVAL);
    }, [fetchConversations, searchQuery]);

    // Função para parar polling
    const stopPolling = useCallback(() => {
        if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
        }
    }, []);

    // Buscar conversas inicialmente
    useEffect(() => {
        fetchConversations();
    }, [fetchConversations]);

    // Iniciar polling se habilitado
    useEffect(() => {
        if (enablePolling) {
            startPolling();
        }

        return () => {
            stopPolling();
        };
    }, [enablePolling, startPolling, stopPolling]);

    // Limpar polling ao desmontar
    useEffect(() => {
        return () => {
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
            }
        };
    }, []);

    return {
        conversations,
        loading,
        error,
        unreadCount,
        searchQuery,
        lastUpdate,
        refreshConversations,
        markAsRead,
        updateConversation,
        addNewMessage,
        search,
        startPolling,
        stopPolling
    };
}
