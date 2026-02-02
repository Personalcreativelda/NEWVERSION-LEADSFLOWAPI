// INBOX: Hook para gerenciar conexão WebSocket
import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { WebSocketEvents } from '../types/inbox';

const WS_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:4000';

interface UseWebSocketOptions {
    onNewMessage?: (data: WebSocketEvents['new_message']) => void;
    onMessageStatusUpdate?: (data: WebSocketEvents['message_status_update']) => void;
    onConversationUpdate?: (data: WebSocketEvents['conversation_update']) => void;
    onUnreadCountUpdate?: (data: WebSocketEvents['unread_count_update']) => void;
    onConversationRead?: (data: WebSocketEvents['conversation_read']) => void;
    onUserTyping?: (data: WebSocketEvents['user_typing']) => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const socketRef = useRef<Socket | null>(null);

    const connect = useCallback(() => {
        const token = localStorage.getItem('token');

        if (!token) {
            setError('No authentication token found');
            return;
        }

        try {
            const socket = io(WS_URL, {
                auth: { token },
                transports: ['websocket', 'polling']
            });

            socket.on('connect', () => {
                console.log('[WebSocket] Connected');
                setIsConnected(true);
                setError(null);
            });

            socket.on('disconnect', () => {
                console.log('[WebSocket] Disconnected');
                setIsConnected(false);
            });

            socket.on('connect_error', (err) => {
                console.error('[WebSocket] Connection error:', err.message);
                setError(err.message);
                setIsConnected(false);
            });

            // Event listeners
            socket.on('connected', (data: WebSocketEvents['connected']) => {
                console.log('[WebSocket] Server confirmed connection:', data);
            });

            if (options.onNewMessage) {
                socket.on('new_message', options.onNewMessage);
            }

            if (options.onMessageStatusUpdate) {
                socket.on('message_status_update', options.onMessageStatusUpdate);
            }

            if (options.onConversationUpdate) {
                socket.on('conversation_update', options.onConversationUpdate);
            }

            if (options.onUnreadCountUpdate) {
                socket.on('unread_count_update', options.onUnreadCountUpdate);
            }

            if (options.onConversationRead) {
                socket.on('conversation_read', options.onConversationRead);
            }

            if (options.onUserTyping) {
                socket.on('user_typing', options.onUserTyping);
            }

            socketRef.current = socket;
        } catch (err) {
            console.error('[WebSocket] Failed to initialize:', err);
            setError('Failed to initialize WebSocket');
        }
    }, [options]);

    const disconnect = useCallback(() => {
        if (socketRef.current) {
            socketRef.current.disconnect();
            socketRef.current = null;
        }
    }, []);

    const markAsRead = useCallback((conversationId: string) => {
        if (socketRef.current?.connected) {
            socketRef.current.emit('mark_as_read', { conversationId });
        }
    }, []);

    const sendTyping = useCallback((conversationId: string, isTyping: boolean) => {
        if (socketRef.current?.connected) {
            socketRef.current.emit('typing', { conversationId, isTyping });
        }
    }, []);

    useEffect(() => {
        connect();
        return () => disconnect();
    }, [connect, disconnect]);

    return {
        isConnected,
        error,
        markAsRead,
        sendTyping,
        reconnect: connect
    };
}
