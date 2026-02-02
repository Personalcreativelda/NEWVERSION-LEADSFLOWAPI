// INBOX: Hook para gerenciar mensagens de uma conversa
import { useState, useEffect, useCallback, useRef } from 'react';
import { conversationsApi, inboxApi } from '../services/api/inbox';
import type { MessageWithSender } from '../types/inbox';

// Helper para gerar ID temporário
const generateTempId = () => `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export function useMessages(conversationId: string | null) {
    const [messages, setMessages] = useState<MessageWithSender[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sending, setSending] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

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

            // Substituir mensagem temporária pela real
            setMessages(prev => prev.map(m => 
                m.id === tempId ? { ...message, status: 'sent' } : m
            ));

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
            
            // Substituir mensagem temporária pela real
            setMessages(prev => prev.map(m => 
                m.id === tempId ? { ...message, status: 'sent' } : m
            ));
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
            // Evitar duplicatas
            if (prev.some(m => m.id === message.id)) {
                return prev;
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
