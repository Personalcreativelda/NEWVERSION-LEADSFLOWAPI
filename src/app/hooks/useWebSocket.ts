// INBOX: Hook para a ligação WebSocket
// Uma só ligação para o app inteiro (painel, inbox, tarefas, campanhas): cada componente
// regista os seus callbacks e recebe os eventos dessa ligação partilhada.
import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { WebSocketEvents } from '../types/inbox';
import { SERVER_BACK_EVENT } from '../lib/serverStatus';

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
const TOKEN_KEY = 'leadflow_access_token';

interface UseWebSocketOptions {
    onNewMessage?: (data: WebSocketEvents['new_message']) => void;
    onMessageStatusUpdate?: (data: WebSocketEvents['message_status_update']) => void;
    onConversationUpdate?: (data: WebSocketEvents['conversation_update']) => void;
    onUnreadCountUpdate?: (data: WebSocketEvents['unread_count_update']) => void;
    onConversationRead?: (data: WebSocketEvents['conversation_read']) => void;
    onUserTyping?: (data: WebSocketEvents['user_typing']) => void;
    onLeadFunnelUpdate?: (data: { leadId: string; leadName: string; previousStatus: string; newStatus: string; conversationId: string; triggeredBy: string; assistantName: string; timestamp: string }) => void;
    onAiTaskCreated?: (data: { task: any; timestamp: string }) => void;
    onNewConversation?: (data: { conversationId: string; conversation?: any; timestamp: string }) => void;
    onReconnect?: () => void; // Callback when reconnected
    onCampaignStats?: (data: { campaignId: string; stats: any; progress: { sent: number; failed: number; total: number } }) => void;
}

/** Evento do servidor → callback correspondente */
const EVENTS: Record<string, keyof UseWebSocketOptions> = {
    new_message: 'onNewMessage',
    new_conversation: 'onNewConversation',
    message_status_update: 'onMessageStatusUpdate',
    conversation_update: 'onConversationUpdate',
    unread_count_update: 'onUnreadCountUpdate',
    conversation_read: 'onConversationRead',
    user_typing: 'onUserTyping',
    lead_funnel_update: 'onLeadFunnelUpdate',
    ai_task_created: 'onAiTaskCreated',
    'campaign:stats': 'onCampaignStats',
};

type ConnState = { isConnected: boolean; error: string | null };

const subscribers = new Set<{ current: UseWebSocketOptions }>();
const stateListeners = new Set<(s: ConnState) => void>();
let state: ConnState = { isConnected: false, error: null };
let socket: Socket | null = null;
let wasConnected = false;
let closeTimer: ReturnType<typeof setTimeout> | null = null;

/** Para os pedidos de segurança (polling) abrandarem enquanto a ligação em tempo real funciona */
export const isSocketConnected = () => state.isConnected;

function setState(patch: Partial<ConnState>) {
    state = { ...state, ...patch };
    stateListeners.forEach((fn) => fn(state));
}

function dispatch(key: keyof UseWebSocketOptions, data?: unknown) {
    subscribers.forEach((ref) => {
        try {
            (ref.current[key] as ((d: unknown) => void) | undefined)?.(data);
        } catch (err) {
            console.error('[WebSocket] Erro no callback', key, err);
        }
    });
}

/** Volta a ligar se não estiver ligado (rede de volta, app em primeiro plano, servidor de volta) */
function wake() {
    if (subscribers.size === 0) return;
    if (!socket) openSocket();
    else if (!socket.connected) socket.connect();
}

function onVisibility() {
    if (document.visibilityState === 'visible') wake();
}

function openSocket() {
    if (socket || !localStorage.getItem(TOKEN_KEY)) {
        if (!socket) setState({ error: 'No authentication token found' });
        return;
    }

    socket = io(WS_URL, {
        // O token é lido a cada tentativa: depois de renovado a ligação usa o novo
        auth: (cb) => cb({ token: localStorage.getItem(TOKEN_KEY) }),
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
        timeout: 20000,
    });

    socket.on('connect', () => {
        setState({ isConnected: true, error: null });
        // Depois de uma queda, o que chegou entretanto vem pelo onReconnect
        if (wasConnected) dispatch('onReconnect');
        wasConnected = true;
    });

    socket.on('disconnect', (reason) => {
        setState({ isConnected: false });
        // Desligado pelo servidor (ex.: deploy): o cliente não volta sozinho
        if (reason === 'io server disconnect') setTimeout(() => socket?.connect(), 1000);
    });

    socket.on('connect_error', (err) => {
        setState({ isConnected: false, error: err.message });
        // Recusado pelo servidor (ex.: token expirado): tentar de novo com o token atual
        if (!socket?.active) setTimeout(() => wake(), 5000);
    });

    for (const [event, key] of Object.entries(EVENTS)) {
        socket.on(event, (data) => dispatch(key, data));
    }

    window.addEventListener('online', wake);
    window.addEventListener(SERVER_BACK_EVENT, wake);
    document.addEventListener('visibilitychange', onVisibility);
}

function closeSocket() {
    window.removeEventListener('online', wake);
    window.removeEventListener(SERVER_BACK_EVENT, wake);
    document.removeEventListener('visibilitychange', onVisibility);
    if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
        socket = null;
    }
    wasConnected = false;
    setState({ isConnected: false, error: null });
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
    // Keep callbacks in a ref so they're always current without causing reconnects
    const callbacksRef = useRef(options);
    useEffect(() => { callbacksRef.current = options; });

    const [conn, setConn] = useState<ConnState>(state);

    useEffect(() => {
        subscribers.add(callbacksRef);
        stateListeners.add(setConn);
        setConn(state);
        if (closeTimer) {
            clearTimeout(closeTimer);
            closeTimer = null;
        }
        openSocket();
        return () => {
            subscribers.delete(callbacksRef);
            stateListeners.delete(setConn);
            // Troca de página: não fechar logo, o próximo ecrã usa a mesma ligação
            if (subscribers.size === 0) {
                closeTimer = setTimeout(() => {
                    closeTimer = null;
                    if (subscribers.size === 0) closeSocket();
                }, 3000);
            }
        };
    }, []);

    const markAsRead = useCallback((conversationId: string) => {
        if (socket?.connected) socket.emit('mark_as_read', { conversationId });
    }, []);

    const sendTyping = useCallback((conversationId: string, isTyping: boolean) => {
        if (socket?.connected) socket.emit('typing', { conversationId, isTyping });
    }, []);

    const reconnect = useCallback(() => {
        if (socket) {
            socket.disconnect();
            socket.connect();
        } else {
            openSocket();
        }
    }, []);

    return {
        isConnected: conn.isConnected,
        error: conn.error,
        markAsRead,
        sendTyping,
        reconnect,
    };
}
