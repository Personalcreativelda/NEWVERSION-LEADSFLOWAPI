// API service para Assistentes do Marketplace
import axios from 'axios';
import { withOfflineCache } from '../../lib/axiosOffline';

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
        monthly_messages_used: number;
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

export interface KnowledgeFile {
    id: string;
    user_assistant_id: string;
    user_id: string;
    file_name: string;
    kind: 'rag' | 'client';
    mime_type: string | null;
    size_bytes: number;
    status: 'processing' | 'ready' | 'failed';
    char_count: number;
    error_message: string | null;
    preview?: string;
    created_at: string;
    updated_at: string;
}

export const MAX_KNOWLEDGE_FILES = 20; // limite de documentos por assistente

export interface AssistantVoice {
    voice_id: string;
    name: string;
    preview_url?: string;
    portuguese?: boolean;
    labels?: Record<string, string>;
}

export const assistantsApi = {
    /** Vozes disponíveis para as respostas em áudio (as em português primeiro) */
    async getVoices(): Promise<AssistantVoice[]> {
        const { data } = await api.get<{ voices: AssistantVoice[] }>('/assistants/elevenlabs-voices');
        return data.voices || [];
    },

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
    },

    /**
     * Lista documentos da base de conhecimento
     */
    async listKnowledgeFiles(userAssistantId: string, kind?: 'rag' | 'client'): Promise<KnowledgeFile[]> {
        const params = kind ? { kind } : undefined;
        const { data } = await api.get<KnowledgeFile[]>(`/assistants/${userAssistantId}/knowledge`, { params });
        return data;
    },

    /**
     * Faz upload de um documento para a base de conhecimento (PDF/Excel/CSV/TXT/DOCX, máx 5MB)
     */
    async uploadKnowledgeFile(
        userAssistantId: string,
        file: File,
        kind: 'rag' | 'client' = 'rag',
        onProgress?: (percent: number) => void
    ): Promise<KnowledgeFile> {
        const form = new FormData();
        form.append('file', file);
        form.append('kind', kind);
        const token = localStorage.getItem('leadflow_access_token');
        // Usa o axios "cru" (sem header Content-Type padrão) para o browser definir o boundary do multipart
        const { data } = await axios.post<KnowledgeFile>(
            `${baseURL}/assistants/${userAssistantId}/knowledge`,
            form,
            {
                headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                onUploadProgress: onProgress ? (e) => {
                    if (e.total) onProgress(Math.round((e.loaded / e.total) * 100));
                } : undefined,
            }
        );
        return data;
    },

    /**
     * Remove um documento da base de conhecimento
     */
    async deleteKnowledgeFile(userAssistantId: string, fileId: string): Promise<void> {
        await api.delete(`/assistants/${userAssistantId}/knowledge/${fileId}`);
    },

    /**
     * Busca o texto completo extraído de um documento (para preview no dashboard)
     */
    async getKnowledgeFileText(userAssistantId: string, fileId: string): Promise<string> {
        const { data } = await api.get<{ text: string }>(`/assistants/${userAssistantId}/knowledge/${fileId}/text`);
        return data.text;
    }
};
