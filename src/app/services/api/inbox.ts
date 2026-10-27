// INBOX: API service para comunicação com backend do Inbox
import axios from 'axios';
import { withOfflineCache } from '../../lib/axiosOffline';
import { registerOutboxSender } from '../../lib/outbox';
import type {
    Channel,
    Conversation,
    ConversationWithDetails,
    Message,
    MessageWithSender,
    AIAssistant,
    TeamMember,
    InternalNote,
    ActivityLog,
    AssignmentHistory,
    RoutingRule,
} from '../../types/inbox';

export interface MarketplaceTemplate {
    id: string;
    name: string;
    description: string;
    category: string;
    icon: string;
    mode: 'llm' | 'webhook';
    llm_provider?: 'gemini' | 'openai' | 'anthropic';
    llm_model?: string;
    llm_system_prompt?: string;
    settings: {
        enabled: boolean;
        auto_respond: boolean;
        max_tokens?: number;
        temperature?: number;
        monthly_message_limit?: number;
    };
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const baseURL = API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`;

// Axios instance com configuração padrão
const api = withOfflineCache(axios.create({
    baseURL,
    headers: {
        'Content-Type': 'application/json',
    },
}));

// Interceptor para adicionar token
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('leadflow_access_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Erros da API em texto legível: err.message passa a ser a mensagem do backend
// (ex.: "O Telegram recusou este token…") em vez de "Request failed with status code 400"
api.interceptors.response.use(undefined, (error) => {
    const data = error?.response?.data;
    const message = typeof data?.error === 'string' ? data.error : typeof data?.message === 'string' ? data.message : null;
    if (message) {
        error.message = message;
        if (data && typeof data === 'object' && !data.message) data.message = message;
    }
    return Promise.reject(error);
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
    },

    /**
     * Vincula/edita a instância Evolution de um canal WhatsApp
     * (para casos em que a instância foi criada direto na Evolution)
     */
    async linkInstance(id: string, instanceId: string): Promise<Channel> {
        const { data } = await api.post<Channel>(`/channels/${id}/link-instance`, { instance_id: instanceId });
        return data;
    }
};

// ============================================
// CONVERSATIONS
// ============================================

// ============================================
// LIGAR FACEBOOK / INSTAGRAM PELO LOGIN DA META
// ============================================

export interface MetaOAuthPage {
    id: string;
    name: string;
    picture: string | null;
    connected: boolean;
    instagram: { id: string; username: string | null; picture: string | null; connected: boolean } | null;
}

/** Conta ligada pelo login do próprio Instagram */
export interface InstagramLoginAccount {
    id: string;
    username: string | null;
    picture: string | null;
    connected: boolean;
}

export interface MetaConnectResult {
    connected: { id: string; type: 'facebook' | 'instagram'; name: string }[];
    failed: { id: string; name: string; error: string }[];
}

export const metaOAuthApi = {
    /** URL do diálogo do Facebook. Erro 'meta_not_configured' (503) quando a app Meta ainda não está configurada. */
    async start(platform: 'web' | 'app'): Promise<string> {
        const { data } = await api.post<{ url: string }>('/oauth/meta/start', { platform });
        return data.url;
    },

    async getSession(sessionId: string): Promise<{ pages: MetaOAuthPage[]; instagram_accounts: InstagramLoginAccount[] }> {
        const { data } = await api.get<{ pages: MetaOAuthPage[]; instagram_accounts?: InstagramLoginAccount[] }>(`/oauth/meta/sessions/${sessionId}`);
        return { pages: data.pages || [], instagram_accounts: data.instagram_accounts || [] };
    },

    async connect(sessionId: string, selection: { pages: string[]; instagram: string[] }): Promise<MetaConnectResult> {
        const { data } = await api.post<MetaConnectResult>(`/oauth/meta/sessions/${sessionId}/connect`, selection);
        return data;
    },
};

export const instagramOAuthApi = {
    /** URL do login do Instagram. Erro 'ig_not_configured' (503) quando ainda não está configurado. */
    async start(platform: 'web' | 'app'): Promise<string> {
        const { data } = await api.post<{ url: string }>('/oauth/instagram/start', { platform });
        return data.url;
    },
};

export const whatsappSignupApi = {
    /** URL da página do Embedded Signup. Erro 'wa_not_configured' (503) quando ainda não está configurado. */
    async start(platform: 'web' | 'app'): Promise<string> {
        const { data } = await api.post<{ url: string }>('/oauth/whatsapp/start', { platform });
        return data.url;
    },
};

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
        params?: { limit?: number; before?: string }
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
        /** Id da bolha temporária: a API guarda-o e não envia duas vezes a mesma mensagem */
        client_id?: string;
        /** Reenvio da fila offline (a API verifica se a mensagem já tinha sido gravada) */
        queued?: boolean;
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
    async create(payload: { contactId?: string; leadId?: string; channelType?: string }): Promise<ConversationWithDetails> {
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
    },

    /**
     * Deleta uma conversa e todas as suas mensagens
     */
    async delete(conversationId: string): Promise<{ success: boolean }> {
        const { data } = await api.delete(`/inbox/conversations/${conversationId}`);
        return data;
    },

    /**
     * Limpa as mensagens de uma conversa sem apagar a conversa
     */
    async clearMessages(conversationId: string): Promise<{ success: boolean }> {
        const { data } = await api.delete(`/inbox/conversations/${conversationId}/messages`);
        return data;
    },

    /**
     * Deleta uma mensagem individual
     */
    async deleteMessage(conversationId: string, messageId: string): Promise<{ success: boolean; messageId: string }> {
        const { data } = await api.delete(`/inbox/conversations/${conversationId}/messages/${messageId}`);
        return data;
    },

    /**
     * Reencaminha uma mensagem para outra conversa
     */
    async forwardMessage(
        targetConversationId: string,
        payload: { content?: string; media_url?: string; media_type?: string }
    ): Promise<Message> {
        const { data } = await api.post<Message>(
            `/inbox/conversations/${targetConversationId}/send`,
            payload
        );
        return data;
    }
};

// Mensagens que ficaram na fila offline (lib/outbox.ts)
registerOutboxSender('message', (item) =>
    conversationsApi.sendMessage(item.conversationId, {
        content: item.content,
        media_url: item.mediaUrl,
        media_type: item.mediaType,
        client_id: item.id,
        queued: true,
    }));

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
    },

    /**
     * Lista templates do marketplace
     */
    async getMarketplaceTemplates(): Promise<MarketplaceTemplate[]> {
        const { data } = await api.get<MarketplaceTemplate[]>('/ai-assistants/marketplace');
        return data;
    },

    /**
     * Instala template do marketplace para o usuário
     */
    async installFromMarketplace(templateId: string): Promise<AIAssistant> {
        const { data } = await api.post<AIAssistant>(`/ai-assistants/marketplace/${templateId}/install`);
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
            { sticker_url: stickerUrl },
            { timeout: 60000 }
        );
        return data;
    },

    /** Figurinhas recebidas nas conversas (as mais recentes primeiro) */
    async getRecentStickers(): Promise<string[]> {
        const { data } = await api.get<{ stickers: string[] }>('/inbox/stickers/recent');
        return data?.stickers || [];
    }
};

// ============================================
// GROUPS (WhatsApp)
// ============================================

export interface GroupInfo {
    id: string;
    jid: string;
    subject: string;
    description: string;
    owner: string;
    creation?: number;
    participants_count: number;
    profile_picture: string | null;
    restrict?: boolean;
    announce?: boolean;
    _source?: string;
}

export interface GroupMember {
    jid: string;
    phone: string;
    name: string | null;
    role: 'admin' | 'superadmin' | 'member';
    profile_picture: string | null;
}

export const groupsApi = {
    /**
     * Lista todas as conversas de grupo
     */
    async getAll(): Promise<any[]> {
        const { data } = await api.get('/groups');
        return data;
    },

    /**
     * Sincroniza grupos do WhatsApp via Evolution API
     */
    async sync(channelId?: string): Promise<{ success: boolean; total_synced: number; total_new: number; groups: any[] }> {
        const { data } = await api.post('/groups/sync', channelId ? { channelId } : {});
        return data;
    },

    /**
     * Info detalhada de um grupo
     */
    async getInfo(conversationId: string): Promise<GroupInfo> {
        const { data } = await api.get<GroupInfo>(`/groups/${conversationId}/info`);
        return data;
    },

    /**
     * Lista membros de um grupo
     */
    async getMembers(conversationId: string): Promise<{ group_jid: string; total: number; members: GroupMember[] }> {
        const { data } = await api.get(`/groups/${conversationId}/members`);
        return data;
    },

    /**
     * Obtém link de convite do grupo
     */
    async getInviteLink(conversationId: string): Promise<{ invite_link: string }> {
        const { data } = await api.get(`/groups/${conversationId}/invite-link`);
        return data;
    },
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

// ============================================
// CONVERSATION TAGS
// ============================================

interface Tag {
    id: string;
    name: string;
    color?: string;
    icon?: string;
    order_index?: number;
    description?: string;
    conversation_count?: number;
}

export const conversationTagsApi = {
    /**
     * Lista todas as etiquetas do usuário
     */
    async getAllTags(): Promise<Tag[]> {
        try {
            const { data } = await api.get<{ success: boolean; count: number; data: Tag[] }>('/inbox/conversation-tags');
            return data.data || [];
        } catch (err) {
            console.error('Error fetching tags:', err);
            return [];
        }
    },

    /**
     * Lista todas as etiquetas combinadas: conversation_tags + funil + tags do lead
     */
    async getCombinedTags(): Promise<{
        conversation_tags: (Tag & { type: string })[];
        funnel_stages: { id: string; name: string; color: string; icon: string | null; type: string; count: number }[];
        lead_tags: { id: string; name: string; color: string; icon: string | null; type: string }[];
    }> {
        try {
            const { data } = await api.get<{ success: boolean; data: any }>('/inbox/conversation-tags/combined');
            return data.data || { conversation_tags: [], funnel_stages: [], lead_tags: [] };
        } catch (err) {
            console.error('Error fetching combined tags:', err);
            return { conversation_tags: [], funnel_stages: [], lead_tags: [] };
        }
    },

    /**
     * Obter estatísticas de uso de etiquetas
     */
    async getTagStats(): Promise<any> {
        try {
            const { data } = await api.get<{ success: boolean; data: any }>('/inbox/conversation-tags/stats');
            return data.data;
        } catch (err) {
            console.error('Error fetching tag stats:', err);
            return [];
        }
    },

    /**
     * Cria nova etiqueta
     */
    async createTag(tag: { name: string; color?: string; icon?: string; description?: string }): Promise<Tag> {
        const { data } = await api.post<{ success: boolean; data: Tag }>('/inbox/conversation-tags', tag);
        return data.data;
    },

    /**
     * Atualiza etiqueta
     */
    async updateTag(tagId: string, updates: Partial<Tag>): Promise<Tag> {
        const { data } = await api.put<{ success: boolean; data: Tag }>(`/inbox/conversation-tags/${tagId}`, updates);
        return data.data;
    },

    /**
     * Reordena etiquetas (drag-drop)
     */
    async reorderTags(tagIds: string[]): Promise<{ success: boolean }> {
        const { data } = await api.put<{ success: boolean }>('/inbox/conversation-tags/reorder', { tag_ids: tagIds });
        return data;
    },

    /**
     * Deleta etiqueta
     */
    async deleteTag(tagId: string): Promise<{ success: boolean }> {
        const { data } = await api.delete<{ success: boolean }>(`/inbox/conversation-tags/${tagId}`);
        return data;
    },

    /**
     * Obtém conversas com uma etiqueta específica
     */
    async getConversationsByTag(tagId: string): Promise<Conversation[]> {
        const { data } = await api.get<{ success: boolean; count: number; data: Conversation[] }>(`/inbox/conversation-tags/${tagId}/conversations`);
        return data.data || [];
    },

    /**
     * Obtém todas as etiquetas de uma conversa
     */
    async getConversationTags(conversationId: string): Promise<Tag[]> {
        const { data } = await api.get<{ success: boolean; data: Tag[] }>(`/inbox/conversation-tags/conversation/${conversationId}`);
        return data.data || [];
    },

    /**
     * Atribui etiqueta para conversa
     */
    async addTagToConversation(conversationId: string, tagId: string): Promise<{ success: boolean }> {
        const { data } = await api.post<{ success: boolean }>(`/inbox/conversation-tags/assign/${conversationId}/${tagId}`);
        return data;
    },

    /**
     * Remove etiqueta de uma conversa
     */
    async removeTagFromConversation(conversationId: string, tagId: string): Promise<{ success: boolean }> {
        const { data } = await api.delete<{ success: boolean }>(`/inbox/conversation-tags/assign/${conversationId}/${tagId}`);
        return data;
    },

    /**
     * Define todas as etiquetas de uma conversa (substitui as anteriores)
     */
    async setConversationTags(conversationId: string, tagIds: string[]): Promise<{ success: boolean }> {
        const { data } = await api.post<{ success: boolean }>(`/inbox/conversation-tags/conversation/${conversationId}/set`, { tag_ids: tagIds });
        return data;
    }
};

// ============================================
// TEAM INBOX API
// ============================================

export const teamApi = {
    // ── Members ──────────────────────────────────────────────
    async getMembers(): Promise<TeamMember[]> {
        const { data } = await api.get<TeamMember[]>('/team/members');
        return data;
    },
    async addMember(payload: { email: string; name: string; role?: string; team?: string }): Promise<TeamMember> {
        const { data } = await api.post<TeamMember>('/team/members', payload);
        return data;
    },
    async updateMember(id: string, updates: Partial<TeamMember>): Promise<TeamMember> {
        const { data } = await api.patch<TeamMember>(`/team/members/${id}`, updates);
        return data;
    },
    async removeMember(id: string): Promise<void> {
        await api.delete(`/team/members/${id}`);
    },

    // ── Assignment ────────────────────────────────────────────
    async assignConversation(conversationId: string, payload: {
        assignee_id?: string | null;
        assigned_team?: string | null;
        note?: string;
    }): Promise<void> {
        await api.post(`/team/conversations/${conversationId}/assign`, payload);
    },
    async setStatus(conversationId: string, payload: {
        status?: string;
        priority?: string;
    }): Promise<void> {
        await api.patch(`/team/conversations/${conversationId}/status`, payload);
    },
    async getAssignmentHistory(conversationId: string): Promise<AssignmentHistory[]> {
        const { data } = await api.get<AssignmentHistory[]>(`/team/conversations/${conversationId}/assignments`);
        return data;
    },

    // ── Internal Notes ────────────────────────────────────────
    async getNotes(conversationId: string): Promise<InternalNote[]> {
        const { data } = await api.get<InternalNote[]>(`/team/conversations/${conversationId}/notes`);
        return data;
    },
    async addNote(conversationId: string, content: string): Promise<InternalNote> {
        const { data } = await api.post<InternalNote>(`/team/conversations/${conversationId}/notes`, { content });
        return data;
    },
    async deleteNote(conversationId: string, noteId: string): Promise<void> {
        await api.delete(`/team/conversations/${conversationId}/notes/${noteId}`);
    },

    // ── Activity Logs ─────────────────────────────────────────
    async getActivity(conversationId: string): Promise<ActivityLog[]> {
        const { data } = await api.get<ActivityLog[]>(`/team/conversations/${conversationId}/activity`);
        return data;
    },

    // ── Routing Rules ─────────────────────────────────────────
    async getRules(): Promise<RoutingRule[]> {
        const { data } = await api.get<RoutingRule[]>('/team/routing-rules');
        return data;
    },
    async createRule(payload: Partial<RoutingRule>): Promise<RoutingRule> {
        const { data } = await api.post<RoutingRule>('/team/routing-rules', payload);
        return data;
    },
    async updateRule(id: string, updates: Partial<RoutingRule>): Promise<RoutingRule> {
        const { data } = await api.patch<RoutingRule>(`/team/routing-rules/${id}`, updates);
        return data;
    },
    async deleteRule(id: string): Promise<void> {
        await api.delete(`/team/routing-rules/${id}`);
    },
};

export default {
    channels: channelsApi,
    conversations: conversationsApi,
    aiAssistants: aiAssistantsApi,
    inbox: inboxApi,
    contacts: contactsApi,
    conversationTags: conversationTagsApi,
    team: teamApi,
};
