// INBOX: API service para comunicação com backend do Inbox
import axios from 'axios';
import type {
    Channel,
    Conversation,
    ConversationWithDetails,
    Message,
    MessageWithSender,
    AIAssistant,
    ApiResponse,
    PaginatedResponse
} from '../../types/inbox';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const baseURL = API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`;

// Axios instance com configuração padrão
const api = axios.create({
    baseURL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Interceptor para adicionar token
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('leadflow_access_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// ============================================
// CHANNELS
// ============================================

export const channelsApi = {
    /**
     * Lista todos os canais do usuário
     */
    async getAll(): Promise<Channel[]> {
        const { data } = await api.get<Channel[]>('/channels');
        return data;
    },

    /**
     * Busca canal por ID
     */
    async getById(id: string): Promise<Channel> {
        const { data } = await api.get<Channel>(`/channels/${id}`);
        return data;
    },

    /**
     * Cria novo canal
     */
    async create(channel: Partial<Channel>): Promise<Channel> {
        const { data } = await api.post<Channel>('/channels', channel);
        return data;
    },

    /**
     * Atualiza canal
     */
    async update(id: string, updates: Partial<Channel>): Promise<Channel> {
        const { data } = await api.put<Channel>(`/channels/${id}`, updates);
        return data;
    },

    /**
     * Remove canal
     */
    async delete(id: string): Promise<void> {
        await api.delete(`/channels/${id}`);
    },

    /**
     * Sincroniza status do canal com Evolution API
     */
    async sync(id: string): Promise<{ success: boolean; status: string; synced_at: string }> {
        const { data } = await api.post(`/channels/${id}/sync`);
        return data;
    }
};

// ============================================
// CONVERSATIONS
// ============================================

export const conversationsApi = {
    /**
     * Lista conversas com filtros
     */
    async getAll(params?: {
        search?: string;
        limit?: number;
        offset?: number;
        only_with_history?: boolean;
    }): Promise<ConversationWithDetails[]> {
        const { data } = await api.get<ConversationWithDetails[]>('/inbox/conversations', { params });
        return data;
    },

    /**
     * Busca mensagens de uma conversa
     */
    async getMessages(
        conversationId: string,
        params?: { limit?: number; offset?: number }
    ): Promise<MessageWithSender[]> {
        const { data } = await api.get<MessageWithSender[]>(
            `/inbox/conversations/${conversationId}/messages`,
            { params }
        );
        return data;
    },

    /**
     * Marca conversa como lida
     */
    async markAsRead(conversationId: string): Promise<{ updated: number }> {
        const { data } = await api.post(`/inbox/conversations/${conversationId}/read`);
        return data;
    },

    /**
     * Envia mensagem
     */
    async sendMessage(conversationId: string, payload: {
        content: string;
        media_url?: string;
        media_type?: string;
    }): Promise<Message> {
        const { data } = await api.post<Message>(
            `/inbox/conversations/${conversationId}/send`,
            payload
        );
        return data;
    },

    /**
     * Cria nova conversa para um contato
     */
    async create(payload: { contactId: string; channelType?: string }): Promise<ConversationWithDetails> {
        console.log('[API] Creating conversation with payload:', JSON.stringify(payload));
        try {
            const { data } = await api.post<ConversationWithDetails>('/inbox/conversations/create', payload);
            console.log('[API] Conversation created successfully:', data);
            return data;
        } catch (error: any) {
            console.error('[API] Error creating conversation:', error);
            console.error('[API] Error response:', error.response?.data);
            console.error('[API] Error status:', error.response?.status);
            throw error;
        }
    },

    /**
     * Obtém contador de não lidas
     */
    async getUnreadCount(): Promise<number> {
        const { data } = await api.get<{ count: number }>('/inbox/unread-count');
        return data.count;
    }
};

// ============================================
// AI ASSISTANTS
// ============================================

export const aiAssistantsApi = {
    /**
     * Lista todos os assistentes
     */
    async getAll(): Promise<AIAssistant[]> {
        const { data } = await api.get<AIAssistant[]>('/ai-assistants');
        return data;
    },

    /**
     * Busca assistente por ID
     */
    async getById(id: string): Promise<AIAssistant> {
        const { data } = await api.get<AIAssistant>(`/ai-assistants/${id}`);
        return data;
    },

    /**
     * Cria novo assistente
     */
    async create(assistant: Partial<AIAssistant>): Promise<AIAssistant> {
        const { data } = await api.post<AIAssistant>('/ai-assistants', assistant);
        return data;
    },

    /**
     * Atualiza assistente
     */
    async update(id: string, updates: Partial<AIAssistant>): Promise<AIAssistant> {
        const { data } = await api.put<AIAssistant>(`/ai-assistants/${id}`, updates);
        return data;
    },

    /**
     * Remove assistente
     */
    async delete(id: string): Promise<void> {
        await api.delete(`/ai-assistants/${id}`);
    },

    /**
     * Ativa/desativa assistente
     */
    async toggle(id: string, isActive: boolean): Promise<{ success: boolean; is_active: boolean }> {
        const { data } = await api.post(`/ai-assistants/${id}/toggle`, { is_active: isActive });
        return data;
    }
};

// ============================================
// INBOX STATUS & UPLOAD
// ============================================

export interface UploadResponse {
    success: boolean;
    url: string;
    media_type: 'image' | 'video' | 'audio' | 'document';
    original_name: string;
    mime_type: string;
    size: number;
}

export const inboxApi = {
    /**
     * Verifica status do Evolution API
     */
    async getStatus(): Promise<{ ready: boolean; message: string }> {
        const { data } = await api.get('/inbox/status');
        return data;
    },

    /**
     * Faz upload de arquivo para o inbox (imagens, vídeos, documentos, áudio)
     */
    async uploadFile(file: File): Promise<UploadResponse> {
        const formData = new FormData();
        formData.append('file', file);
        
        const { data } = await api.post<UploadResponse>('/inbox/upload', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
        return data;
    },

    /**
     * Envia mensagem de voz (áudio)
     */
    async sendAudio(conversationId: string, audioBlob: Blob): Promise<Message> {
        const formData = new FormData();
        // Use o tipo de mime do blob ou fallback para webm
        const mimeType = audioBlob.type || 'audio/webm';
        const extension = mimeType.includes('ogg') ? 'ogg' : 'webm';
        formData.append('audio', audioBlob, `voice_message.${extension}`);
        
        const { data } = await api.post<Message>(
            `/inbox/conversations/${conversationId}/send-audio`,
            formData,
            { 
                headers: { 'Content-Type': 'multipart/form-data' },
                timeout: 60000 // 60 segundos para upload de áudio
            }
        );
        return data;
    },

    /**
     * Envia sticker
     */
    async sendSticker(conversationId: string, stickerUrl: string): Promise<Message> {
        const { data } = await api.post<Message>(
            `/inbox/conversations/${conversationId}/send-sticker`,
            { sticker_url: stickerUrl }
        );
        return data;
    }
};

// ============================================
// CONTACTS
// ============================================

export const contactsApi = {
    /**
     * Cria ou encontra contato por telefone
     */
    async createOrFind(phone: string, name: string): Promise<any> {
        console.log('[API] Creating or finding contact with phone:', phone, 'name:', name);
        const { data } = await api.post('/contacts/create-or-find', { phone, name });
        console.log('[API] Contact raw response:', data);
        
        // Normalizar resposta para sempre ter 'id'
        const contact = {
            ...data,
            id: data.id || data.fid || data.ID || null
        };
        console.log('[API] Contact normalized:', contact);
        return contact;
    }
};

export default {
    channels: channelsApi,
    conversations: conversationsApi,
    aiAssistants: aiAssistantsApi,
    inbox: inboxApi,
    contacts: contactsApi
};
