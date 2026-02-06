// INBOX: Hook para gerenciar conexão WebSocket
import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { WebSocketEvents } from '../types/inbox';

// Build WebSocket URL from API URL or use default
const getWebSocketUrl = () => {
    const apiUrl = import.meta.env.VITE_API_URL;
    if (apiUrl) {
        // Remove /api suffix if present and ensure we have the base URL
        return apiUrl.replace(/\/api\/?$/, '');
    }
    return 'http://localhost:4000';
};

const WS_URL = getWebSocketUrl();

interface UseWebSocketOptions {
    onNewMessage?: (data: WebSocketEvents['new_message']) => void;
    onMessageStatusUpdate?: (data: WebSocketEvents['message_status_update']) => void;
    onConversationUpdate?: (data: WebSocketEvents['conversation_update']) => void;
    onUnreadCountUpdate?: (data: WebSocketEvents['unread_count_update']) => void;
    onConversationRead?: (data: WebSocketEvents['conversation_read']) => void;
    onUserTyping?: (data: WebSocketEvents['user_typing']) => void;
    onReconnect?: () => void; // Callback when reconnected
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const wasConnectedRef = useRef(false);
    const reconnectAttemptsRef = useRef(0);
    const connectingRef = useRef(false);

    const connect = useCallback(() => {
        // Prevent multiple simultaneous connection attempts
        if (connectingRef.current || socketRef.current?.connected) {
            console.log('[WebSocket] Already connecting or connected, skipping');
            return;
        }

        const token = localStorage.getItem('leadflow_access_token');

        if (!token) {
            console.warn('[WebSocket] No authentication token found');
            setError('No authentication token found');
            return;
        }

        connectingRef.current = true;
        console.log('[WebSocket] Connecting to:', WS_URL);

        try {
            // Disconnect existing socket if any
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }

            const socket = io(WS_URL, {
                auth: { token },
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionAttempts: 15,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 10000,
                timeout: 30000,
                forceNew: true
            });

            socket.on('connect', () => {
                console.log('[WebSocket] ✅ Connected successfully');
                setIsConnected(true);
                setError(null);
                connectingRef.current = false;

                // Se estava conectado antes e reconectou, chamar callback
                if (wasConnectedRef.current && reconnectAttemptsRef.current > 0) {
                    console.log('[WebSocket] Reconnected - triggering refresh');
                    options.onReconnect?.();
                }

                wasConnectedRef.current = true;
                reconnectAttemptsRef.current = 0;
            });

            socket.on('disconnect', (reason) => {
                console.log('[WebSocket] Disconnected:', reason);
                setIsConnected(false);
                connectingRef.current = false;
            });

            socket.on('reconnect_attempt', (attempt) => {
                console.log('[WebSocket] Reconnection attempt:', attempt);
                reconnectAttemptsRef.current = attempt;
            });

            socket.on('reconnect', (attempt) => {
                console.log('[WebSocket] Reconnected after', attempt, 'attempts');
            });

            socket.on('connect_error', (err) => {
                console.error('[WebSocket] Connection error:', err.message);
                // Don't set error state for transient connection errors
                // Only set error if this is not a reconnection attempt
                if (reconnectAttemptsRef.current === 0 && !wasConnectedRef.current) {
                    setError(err.message);
                }
                setIsConnected(false);
                connectingRef.current = false;
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
            connectingRef.current = false;
        }
    }, [options]);

    const disconnect = useCallback(() => {
        console.log('[WebSocket] Disconnecting...');
        connectingRef.current = false;
        if (socketRef.current) {
            socketRef.current.removeAllListeners();
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
