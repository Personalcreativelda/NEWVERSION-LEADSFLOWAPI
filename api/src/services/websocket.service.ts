// INBOX: WebSocket service para comunicação em tempo real
import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';

interface AuthenticatedSocket extends Socket {
    userId?: string;
}

export class WebSocketService {
    private io: Server;
    private connectedUsers: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds

    constructor(httpServer: HttpServer) {
        this.io = new Server(httpServer, {
            cors: {
                origin: process.env.CORS_ORIGINS?.split(',').map(o => o.trim()) || ['http://localhost:3200'],
                credentials: true,
                methods: ['GET', 'POST']
            },
            path: '/socket.io/',
            transports: ['websocket', 'polling']
        });

        this.setupAuthentication();
        this.setupEventHandlers();
    }

    /**
     * Configurar autenticação via JWT
     */
    private setupAuthentication() {
        this.io.use((socket: AuthenticatedSocket, next) => {
            const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

            if (!token) {
                console.log('[WebSocket] Conexão rejeitada: sem token');
                return next(new Error('Authentication error: No token provided'));
            }

            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
                socket.userId = decoded.userId || decoded.id;
                console.log(`[WebSocket] Token validado para usuário: ${socket.userId}`);
                next();
            } catch (error) {
                console.log('[WebSocket] Conexão rejeitada: token inválido');
                return next(new Error('Authentication error: Invalid token'));
            }
        });
    }

    /**
     * Configurar handlers de eventos
     */
    private setupEventHandlers() {
        this.io.on('connection', (socket: AuthenticatedSocket) => {
            const userId = socket.userId!;
            console.log(`[WebSocket] Usuário ${userId} conectado (socket: ${socket.id})`);

            // Adicionar socket ao mapa de usuários conectados
            if (!this.connectedUsers.has(userId)) {
                this.connectedUsers.set(userId, new Set());
            }
            this.connectedUsers.get(userId)!.add(socket.id);

            // Entrar na sala do usuário
            socket.join(`user:${userId}`);

            // Enviar confirmação de conexão
            socket.emit('connected', {
                message: 'Connected to Inbox WebSocket',
                userId,
                timestamp: new Date().toISOString()
            });

            // Handler para desconexão
            socket.on('disconnect', () => {
                console.log(`[WebSocket] Usuário ${userId} desconectado (socket: ${socket.id})`);

                const userSockets = this.connectedUsers.get(userId);
                if (userSockets) {
                    userSockets.delete(socket.id);
                    if (userSockets.size === 0) {
                        this.connectedUsers.delete(userId);
                    }
                }
            });

            // Handler para marcar mensagens como lidas
            socket.on('mark_as_read', (data: { conversationId: string }) => {
                console.log(`[WebSocket] Usuário ${userId} marcou conversa ${data.conversationId} como lida`);
                // Broadcast para outros dispositivos do mesmo usuário
                socket.to(`user:${userId}`).emit('conversation_read', {
                    conversationId: data.conversationId,
                    timestamp: new Date().toISOString()
                });
            });

            // Handler para typing indicator
            socket.on('typing', (data: { conversationId: string; isTyping: boolean }) => {
                socket.to(`user:${userId}`).emit('user_typing', {
                    conversationId: data.conversationId,
                    isTyping: data.isTyping,
                    timestamp: new Date().toISOString()
                });
            });
        });
    }

    /**
     * Emitir nova mensagem para usuário
     */
    emitNewMessage(userId: string, data: {
        conversationId: string;
        message: any;
        conversation?: any;
    }) {
        console.log(`[WebSocket] Emitindo nova mensagem para usuário ${userId}`);
        this.io.to(`user:${userId}`).emit('new_message', {
            ...data,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Emitir atualização de status de mensagem
     */
    emitMessageStatusUpdate(userId: string, data: {
        messageId: string;
        conversationId: string;
        status: 'sent' | 'delivered' | 'read' | 'failed';
    }) {
        console.log(`[WebSocket] Emitindo atualização de status para usuário ${userId}: ${data.status}`);
        this.io.to(`user:${userId}`).emit('message_status_update', {
            ...data,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Emitir atualização de conversa
     */
    emitConversationUpdate(userId: string, data: {
        conversationId: string;
        updates: any;
    }) {
        console.log(`[WebSocket] Emitindo atualização de conversa para usuário ${userId}`);
        this.io.to(`user:${userId}`).emit('conversation_update', {
            ...data,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Emitir contador de não lidas atualizado
     */
    emitUnreadCountUpdate(userId: string, data: {
        totalUnread: number;
        conversationId?: string;
        unreadCount?: number;
    }) {
        this.io.to(`user:${userId}`).emit('unread_count_update', {
            ...data,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Verificar se usuário está conectado
     */
    isUserConnected(userId: string): boolean {
        return this.connectedUsers.has(userId);
    }

    /**
     * Obter número de conexões ativas de um usuário
     */
    getUserConnectionCount(userId: string): number {
        return this.connectedUsers.get(userId)?.size || 0;
    }

    /**
     * Obter estatísticas gerais
     */
    getStats() {
        return {
            totalConnections: this.io.sockets.sockets.size,
            totalUsers: this.connectedUsers.size,
            users: Array.from(this.connectedUsers.entries()).map(([userId, sockets]) => ({
                userId,
                connections: sockets.size
            }))
        };
    }
}

// Singleton instance
let wsService: WebSocketService | null = null;

/**
 * Inicializar WebSocket service
 */
export function initializeWebSocket(httpServer: HttpServer): WebSocketService {
    if (!wsService) {
        wsService = new WebSocketService(httpServer);
        console.log('[WebSocket] ✅ Serviço inicializado');
    }
    return wsService;
}

/**
 * Obter instância do WebSocket service
 */
export function getWebSocketService(): WebSocketService | null {
    return wsService;
}
