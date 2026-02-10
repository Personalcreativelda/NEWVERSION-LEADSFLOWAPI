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

// Interceptor para adicionar token de autenticação
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('leadflow_access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Eventos disponíveis
export interface WebhookEventInfo {
  name: string;
  description: string;
  category: string;
}

export interface WebhookEventsResponse {
  events: Record<string, WebhookEventInfo>;
  categories: Record<string, Array<{ event: string; name: string; description: string }>>;
}

// Webhook do usuário
export interface UserWebhook {
  id: string;
  user_id: string;
  name: string;
  url: string;
  events: string[];
  headers?: Record<string, string>;
  is_active: boolean;
  secret?: string;
  channel_ids?: string[];
  created_at: string;
  updated_at: string;
  last_triggered_at?: string;
  trigger_count: number;
  last_error?: string;
}

export interface CreateWebhookInput {
  name: string;
  url: string;
  events: string[];
  headers?: Record<string, string>;
  secret?: string;
  channel_ids?: string[];
}

export interface WebhookLog {
  id: string;
  webhook_id: string;
  event: string;
  payload: any;
  response_status?: number;
  response_body?: string;
  error?: string;
  created_at: string;
}

export interface TestWebhookResult {
  success: boolean;
  status?: number;
  error?: string;
}

export const userWebhooksApi = {
  // Listar eventos disponíveis
  async getEvents(): Promise<WebhookEventsResponse> {
    const { data } = await api.get('/user-webhooks/events');
    return data;
  },

  // Listar webhooks do usuário
  async getAll(): Promise<UserWebhook[]> {
    const { data } = await api.get('/user-webhooks');
    return data;
  },

  // Obter webhook específico
  async getById(id: string): Promise<UserWebhook> {
    const { data } = await api.get(`/user-webhooks/${id}`);
    return data;
  },

  // Criar webhook
  async create(input: CreateWebhookInput): Promise<UserWebhook> {
    const { data } = await api.post('/user-webhooks', input);
    return data;
  },

  // Atualizar webhook
  async update(id: string, input: Partial<CreateWebhookInput>): Promise<UserWebhook> {
    const { data } = await api.put(`/user-webhooks/${id}`, input);
    return data;
  },

  // Ativar/desativar webhook
  async toggle(id: string, isActive: boolean): Promise<UserWebhook> {
    const { data } = await api.patch(`/user-webhooks/${id}/toggle`, { is_active: isActive });
    return data;
  },

  // Testar webhook
  async test(id: string): Promise<TestWebhookResult> {
    const { data } = await api.post(`/user-webhooks/${id}/test`);
    return data;
  },

  // Obter logs do webhook
  async getLogs(id: string, limit?: number): Promise<WebhookLog[]> {
    const { data } = await api.get(`/user-webhooks/${id}/logs`, { params: { limit } });
    return data;
  },

  // Deletar webhook
  async delete(id: string): Promise<void> {
    await api.delete(`/user-webhooks/${id}`);
  },

  // Regenerar secret
  async regenerateSecret(id: string): Promise<{ secret: string }> {
    const { data } = await api.post(`/user-webhooks/${id}/regenerate-secret`);
    return data;
  },
};

export default userWebhooksApi;
