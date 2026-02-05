// API service para Assistentes do Marketplace
import axios from 'axios';

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

// Types
export interface Assistant {
    id: string;
    name: string;
    slug: string;
    description: string;
    short_description: string;
    icon: string;
    color: string;
    category: string;
    features: string[];
    price_monthly: number;
    price_annual: number;
    is_free: boolean;
    is_active: boolean;
    is_featured: boolean;
    is_custom: boolean;
    created_by: string | null;
    default_config: Record<string, any>;
    required_channels: string[];
    created_at: string;
    updated_at: string;
}

export interface UserAssistant {
    id: string;
    user_id: string;
    assistant_id: string;
    is_active: boolean;
    is_configured: boolean;
    config: Record<string, any>;
    channel_id: string | null;
    channel_ids: string[];
    n8n_workflow_id: string | null;
    last_triggered_at: string | null;
    stats: {
        conversations: number;
        messages_sent: number;
        messages_received: number;
    };
    created_at: string;
    updated_at: string;
    assistant?: Assistant;
}

export interface AssistantLog {
    id: string;
    user_assistant_id: string;
    conversation_id: string;
    contact_phone: string;
    contact_name: string;
    message_in: string;
    message_out: string;
    tokens_used: number;
    response_time_ms: number;
    status: string;
    error_message: string | null;
    metadata: Record<string, any>;
    created_at: string;
}

export interface CreateAssistantInput {
    name: string;
    description?: string;
    short_description?: string;
    icon?: string;
    color?: string;
    category?: string;
    features?: string[];
    instructions?: string;
    greeting?: string;
}

export const assistantsApi = {
    /**
     * Lista assistentes disponíveis no marketplace
     */
    async getAvailable(): Promise<Assistant[]> {
        const { data } = await api.get<Assistant[]>('/assistants/available');
        return data;
    },

    /**
     * Busca assistente por slug
     */
    async getBySlug(slug: string): Promise<Assistant> {
        const { data } = await api.get<Assistant>(`/assistants/slug/${slug}`);
        return data;
    },

    /**
     * Lista assistentes conectados do usuário
     */
    async getUserAssistants(): Promise<UserAssistant[]> {
        const { data } = await api.get<UserAssistant[]>('/assistants');
        return data;
    },

    /**
     * Busca assistente conectado por ID
     */
    async getUserAssistantById(id: string): Promise<UserAssistant> {
        const { data } = await api.get<UserAssistant>(`/assistants/${id}`);
        return data;
    },

    /**
     * Cria um assistente personalizado
     */
    async create(input: CreateAssistantInput): Promise<Assistant> {
        const { data } = await api.post<Assistant>('/assistants/create', input);
        return data;
    },

    /**
     * Atualiza um assistente personalizado
     */
    async update(assistantId: string, input: Partial<CreateAssistantInput>): Promise<Assistant> {
        const { data } = await api.put<Assistant>(`/assistants/${assistantId}/edit`, input);
        return data;
    },

    /**
     * Deleta um assistente personalizado
     */
    async deleteAssistant(assistantId: string): Promise<void> {
        await api.delete(`/assistants/${assistantId}/delete`);
    },

    /**
     * Conecta um assistente com múltiplos canais
     */
    async connect(assistantId: string, channelIds?: string[]): Promise<UserAssistant> {
        const { data } = await api.post<UserAssistant>('/assistants/connect', {
            assistantId,
            channelIds
        });
        return data;
    },

    /**
     * Desconecta um assistente
     */
    async disconnect(userAssistantId: string): Promise<void> {
        await api.post(`/assistants/${userAssistantId}/disconnect`);
    },

    /**
     * Atualiza os canais conectados de um assistente
     */
    async updateChannels(userAssistantId: string, channelIds: string[]): Promise<UserAssistant> {
        const { data } = await api.put<UserAssistant>(`/assistants/${userAssistantId}/channels`, {
            channelIds
        });
        return data;
    },

    /**
     * Atualiza configuração do assistente
     */
    async configure(userAssistantId: string, config: Record<string, any>, channelIds?: string[]): Promise<UserAssistant> {
        const { data } = await api.put<UserAssistant>(`/assistants/${userAssistantId}/configure`, {
            config,
            channelIds
        });
        return data;
    },

    /**
     * Ativa/desativa assistente
     */
    async toggle(userAssistantId: string, isActive: boolean): Promise<void> {
        await api.post(`/assistants/${userAssistantId}/toggle`, { is_active: isActive });
    },

    /**
     * Busca logs do assistente
     */
    async getLogs(userAssistantId: string, limit?: number): Promise<AssistantLog[]> {
        const { data } = await api.get<AssistantLog[]>(`/assistants/${userAssistantId}/logs`, {
            params: { limit }
        });
        return data;
    }
};
