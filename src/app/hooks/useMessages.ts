// INBOX: Hook para gerenciar mensagens de uma conversa
import { useState, useEffect, useCallback, useRef } from 'react';
import { conversationsApi, inboxApi } from '../services/api/inbox';
import type { MessageWithSender } from '../types/inbox';

// Helper para gerar ID temporário
const generateTempId = () => `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Intervalo de polling de mensagens (60 segundos) - fallback quando WebSocket falha
const MESSAGE_POLLING_INTERVAL = 60_000;

export function useMessages(conversationId: string | null) {
    const [messages, setMessages] = useState<MessageWithSender[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sending, setSending] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchMessages = useCallback(async () => {
        if (!conversationId) {
            setMessages([]);
            return;
        }

        try {
            setLoading(true);
            setError(null);
            const data = await conversationsApi.getMessages(conversationId, { limit: 100 });
            setMessages(data);
        } catch (err: any) {
            console.error('[useMessages] Error fetching:', err);
            setError(err.message || 'Failed to load messages');
        } finally {
            setLoading(false);
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
        setMessages(prev =>
            prev.map(msg =>
                msg.id === messageId
                    ? { ...msg, status }
                    : msg
            )
        );
    }, []);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => {
        fetchMessages();
    }, [fetchMessages]);

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
                    return [...data, ...tempMessages];
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

    useEffect(() => {
        // Scroll inicial
        if (messages.length > 0) {
            setTimeout(() => scrollToBottom(), 100);
        }
    }, [messages.length, scrollToBottom]);

    return {
        messages,
        loading,
        error,
        sending,
        messagesEndRef,
        sendMessage,
        sendAudio,
        addMessage,
        updateMessageStatus,
        refreshMessages: fetchMessages,
        scrollToBottom
    };
}
