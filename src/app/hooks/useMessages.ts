// INBOX: Hook para gerenciar mensagens de uma conversa
// — WhatsApp-like instant switching: serves cached messages immediately,
//   fetches fresh data in background, never shows loading spinner on switch.
import { useState, useEffect, useCallback, useRef } from 'react';
import { conversationsApi, inboxApi } from '../services/api/inbox';
import type { MessageWithSender } from '../types/inbox';
import {
    getCachedMessages,
    setCachedMessages,
    isCacheFresh,
    patchCachedMessage,
    patchCachedMessageStatus,
    saveScrollPosition,
    getScrollPosition,
    clearScrollPosition,
} from './useMessageCache';

// Helper para gerar ID temporário
const generateTempId = () => `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Intervalo de polling de mensagens (60 segundos) - fallback quando WebSocket falha
const MESSAGE_POLLING_INTERVAL = 60_000;

export function useMessages(conversationId: string | null) {
    // Initialise from cache instantly — no loading spinner on switch
    const [messages, setMessages] = useState<MessageWithSender[]>(
        () => (conversationId ? getCachedMessages(conversationId) : null) ?? []
    );
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sending, setSending] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
    /** Ref to the scroll container — set by ChatBackground / parent */
    const scrollContainerRef = useRef<HTMLElement | null>(null);
    /** Track the previous conversation so we can save its scroll position */
    const prevConversationIdRef = useRef<string | null>(null);

    // ── Fetch messages (background-friendly) ────────────────
    const fetchMessages = useCallback(async (opts?: { silent?: boolean }) => {
        if (!conversationId) {
            setMessages([]);
            return;
        }

        const silent = opts?.silent ?? false;

        try {
            if (!silent) setLoading(true);
            setError(null);
            const data = await conversationsApi.getMessages(conversationId, { limit: 100 });

            // Preserve any temp_ (optimistic) messages still in-flight
            setMessages(prev => {
                const tempMessages = prev.filter(m => m.id.startsWith('temp_'));
                const merged = [...data, ...tempMessages];
                // Write-through to cache
                setCachedMessages(conversationId, merged);
                return merged;
            });
        } catch (err: any) {
            console.error('[useMessages] Error fetching:', err);
            if (!silent) setError(err.message || 'Failed to load messages');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [conversationId]);

    // Envio otimista - mostra mensagem imediatamente
    const sendMessage = useCallback(async (content: string, mediaUrl?: string, mediaType?: string) => {
        // Permite envio de mídia sem texto
        if (!conversationId || (!content.trim() && !mediaUrl)) return;

        const tempId = generateTempId();
        
        // Criar mensagem otimista (temporária)
        const optimisticMessage: MessageWithSender = {
            id: tempId,
            user_id: '',
            conversation_id: conversationId,
            lead_id: null,
            contact_id: null,
            campaign_id: null,
            direction: 'out',
            channel: 'whatsapp',
            content: content.trim() || (mediaUrl ? '📎 Mídia' : ''),
            status: 'pending',
            sent_at: new Date().toISOString(),
            media_url: mediaUrl,
            media_type: mediaType as 'audio' | 'video' | 'image' | 'document' | undefined,
            metadata: {},
            created_at: new Date().toISOString(),
        };

        // Adicionar mensagem otimista imediatamente
        setMessages(prev => [...prev, optimisticMessage]);
        setTimeout(() => scrollToBottom(), 50);

        try {
            setSending(true);
            setError(null);

            const message = await conversationsApi.sendMessage(conversationId, {
                content: content.trim() || '',
                media_url: mediaUrl,
                media_type: mediaType
            });

            // Substituir mensagem temporária pela real + dedup
            // (WebSocket pode ter adicionado a mensagem real antes da resposta da API)
            setMessages(prev => {
                const replaced = prev.map(m => 
                    m.id === tempId ? { ...message, status: 'sent' as const } : m
                );
                // Remover duplicatas pelo ID real
                const seen = new Set<string>();
                return replaced.filter(m => {
                    if (seen.has(m.id)) return false;
                    seen.add(m.id);
                    return true;
                });
            });

        } catch (err: any) {
            console.error('[useMessages] Error sending:', err);
            // Marcar mensagem como falha
            setMessages(prev => prev.map(m => 
                m.id === tempId ? { ...m, status: 'failed' } : m
            ));
            setError(err.message || 'Failed to send message');
            throw err;
        } finally {
            setSending(false);
        }
    }, [conversationId]);

    // Envio de áudio otimista
    const sendAudio = useCallback(async (audioBlob: Blob) => {
        if (!conversationId) return;

        const tempId = generateTempId();
        
        // Criar mensagem otimista para áudio
        const optimisticMessage: MessageWithSender = {
            id: tempId,
            user_id: '',
            conversation_id: conversationId,
            lead_id: null,
            contact_id: null,
            campaign_id: null,
            direction: 'out',
            channel: 'whatsapp',
            content: '🎤 Mensagem de voz',
            status: 'pending',
            sent_at: new Date().toISOString(),
            media_type: 'audio',
            metadata: {},
            created_at: new Date().toISOString(),
        };

        // Adicionar mensagem otimista imediatamente
        setMessages(prev => [...prev, optimisticMessage]);
        setTimeout(() => scrollToBottom(), 50);

        try {
            setSending(true);
            const message = await inboxApi.sendAudio(conversationId, audioBlob);
            
            // Substituir mensagem temporária pela real + dedup
            setMessages(prev => {
                const replaced = prev.map(m => 
                    m.id === tempId ? { ...message, status: 'sent' as const } : m
                );
                const seen = new Set<string>();
                return replaced.filter(m => {
                    if (seen.has(m.id)) return false;
                    seen.add(m.id);
                    return true;
                });
            });
        } catch (err: any) {
            console.error('[useMessages] Error sending audio:', err);
            setMessages(prev => prev.map(m => 
                m.id === tempId ? { ...m, status: 'failed' } : m
            ));
            throw err;
        } finally {
            setSending(false);
        }
    }, [conversationId]);

    const addMessage = useCallback((message: MessageWithSender) => {
        // Write-through to cache for the conversation this message belongs to
        if (message.conversation_id) {
            patchCachedMessage(message.conversation_id, message);
        }

        setMessages(prev => {
            // Evitar duplicatas por ID
            if (prev.some(m => m.id === message.id)) {
                return prev;
            }
            // Para mensagens de saída (out) vindas do WebSocket:
            // Se existe uma mensagem temp_ pendente com mesmo conteúdo, substituir
            if (message.direction === 'out') {
                const tempIdx = prev.findIndex(m => 
                    m.id.startsWith('temp_') && 
                    m.direction === 'out' && 
                    m.status === 'pending'
                );
                if (tempIdx !== -1) {
                    const updated = [...prev];
                    updated[tempIdx] = { ...message, status: message.status || 'sent' };
                    return updated;
                }
            }
            return [...prev, message];
        });

        // Scroll para o final
        setTimeout(() => scrollToBottom(), 100);
    }, []);

    const updateMessageStatus = useCallback((messageId: string, status: MessageWithSender['status']) => {
        if (conversationId) patchCachedMessageStatus(conversationId, messageId, status);
        setMessages(prev =>
            prev.map(msg =>
                msg.id === messageId
                    ? { ...msg, status }
                    : msg
            )
        );
    }, [conversationId]);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    // ── Conversation switch: cache-first + background refresh ─────
    useEffect(() => {
        // 1. Save scroll position for the PREVIOUS conversation
        const prevId = prevConversationIdRef.current;
        if (prevId && scrollContainerRef.current) {
            saveScrollPosition(prevId, scrollContainerRef.current.scrollTop);
        }
        prevConversationIdRef.current = conversationId;

        if (!conversationId) {
            setMessages([]);
            return;
        }

        // 2. Serve cached messages instantly (no loading spinner)
        const cached = getCachedMessages(conversationId);
        if (cached && cached.length > 0) {
            setMessages(cached);
            // Restore scroll position after render
            requestAnimationFrame(() => {
                const savedScroll = getScrollPosition(conversationId);
                if (savedScroll != null && scrollContainerRef.current) {
                    scrollContainerRef.current.scrollTop = savedScroll;
                    clearScrollPosition(conversationId);
                }
            });
        }

        // 3. Background refresh — silent if we had cache, blocking if first load
        if (cached && cached.length > 0 && isCacheFresh(conversationId)) {
            // Cache is fresh — skip fetch entirely, just do a silent poll soon
            fetchMessages({ silent: true });
        } else if (cached && cached.length > 0) {
            // Have cache but stale — silent background refresh
            fetchMessages({ silent: true });
        } else {
            // No cache at all — first ever load, show spinner
            fetchMessages();
        }
    }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Polling de fallback: recarregar mensagens silenciosamente caso WebSocket tenha perdido eventos
    useEffect(() => {
        if (!conversationId) return;

        // Limpar polling anterior
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
        }

        pollingRef.current = setInterval(async () => {
            if (!conversationId) return;
            try {
                const data = await conversationsApi.getMessages(conversationId, { limit: 100 });
                setMessages(prev => {
                    // Só atualizar se há mensagens novas (evitar re-renders desnecessários)
                    const prevIds = new Set(prev.filter(m => !m.id.startsWith('temp_')).map(m => m.id));
                    const hasNew = data.some(m => !prevIds.has(m.id));
                    if (!hasNew) return prev;
                    // Preservar mensagens temporárias (em envio)
                    const tempMessages = prev.filter(m => m.id.startsWith('temp_'));
                    const merged = [...data, ...tempMessages];
                    // Write-through to cache
                    setCachedMessages(conversationId, merged);
                    return merged;
                });
            } catch {
                // Polling silencioso - não mostrar erro
            }
        }, MESSAGE_POLLING_INTERVAL);

        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
        };
    }, [conversationId]);

    // Auto-scroll only on first load (when messages go from 0 → N)
    const hadMessagesRef = useRef(false);
    useEffect(() => {
        if (messages.length > 0 && !hadMessagesRef.current) {
            hadMessagesRef.current = true;
            setTimeout(() => scrollToBottom(), 100);
        }
        if (messages.length === 0) {
            hadMessagesRef.current = false;
        }
    }, [messages.length, scrollToBottom]);

    return {
        messages,
        loading,
        error,
        sending,
        messagesEndRef,
        scrollContainerRef,
        sendMessage,
        sendAudio,
        addMessage,
        updateMessageStatus,
        refreshMessages: fetchMessages,
        scrollToBottom
    };
}
