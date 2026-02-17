const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

class ApiClient {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
  }

  clearToken() {
    this.token = null;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    // Auto-read token from localStorage (same key used by the rest of the app)
    const authToken = this.token || localStorage.getItem('leadflow_access_token');
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(authToken && { Authorization: `Bearer ${authToken}` }),
      ...options.headers,
    };

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody.message || 'API Error');
    }

    return response.json();
  }

  private buildQuery(params?: Record<string, string | number | boolean | null | undefined>): string {
    if (!params) {
      return '';
    }

    const query = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        query.append(key, String(value));
      }
    });

    const queryString = query.toString();
    return queryString ? `?${queryString}` : '';
  }

  auth = {
    login: (email: string, password: string) =>
      this.request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    register: (data: any) =>
      this.request('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    logout: () => this.request('/api/auth/logout', { method: 'POST' }),
    me: () => this.request('/api/auth/me'),
  };

  leads = {
    list: (params?: Record<string, string | number | boolean | null | undefined>) =>
      this.request(`/api/leads${this.buildQuery(params)}`),
    get: (id: string) => this.request(`/api/leads/${id}`),
    create: (data: any) =>
      this.request('/api/leads', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      this.request(`/api/leads/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => this.request(`/api/leads/${id}`, { method: 'DELETE' }),
    normalizeStatuses: () =>
      this.request('/api/leads/normalize-statuses', { method: 'POST' }),
    searchSimple: (q: string, limit = 20) =>
      this.request(`/api/leads/search-simple?q=${encodeURIComponent(q)}&limit=${limit}`),
    renameFunnelStage: (oldStatus: string, newStatus: string) =>
      this.request('/api/leads/funnel-stage/rename', {
        method: 'PUT', body: JSON.stringify({ oldStatus, newStatus })
      }),
    addLeadsToFunnelStage: (status: string, leadIds: string[]) =>
      this.request('/api/leads/funnel-stage/add-leads', {
        method: 'PUT', body: JSON.stringify({ status, leadIds })
      }),
    renameLeadTag: (oldTag: string, newTag: string) =>
      this.request('/api/leads/lead-tag/rename', {
        method: 'PUT', body: JSON.stringify({ oldTag, newTag })
      }),
    deleteLeadTag: (tagName: string) =>
      this.request(`/api/leads/lead-tag/${encodeURIComponent(tagName)}`, { method: 'DELETE' }),
    addLeadsToTag: (tag: string, leadIds: string[]) =>
      this.request('/api/leads/lead-tag/add-leads', {
        method: 'PUT', body: JSON.stringify({ tag, leadIds })
      }),
  };

  contacts = {
    list: (params?: Record<string, string | number | boolean | null | undefined>) =>
      this.request(`/api/contacts${this.buildQuery(params)}`),
    get: (id: string) => this.request(`/api/contacts/${id}`),
    create: (data: any) =>
      this.request('/api/contacts', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      this.request(`/api/contacts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => this.request(`/api/contacts/${id}`, { method: 'DELETE' }),
  };

  whatsapp = {
    sendMessage: (data: any) =>
      this.request('/api/whatsapp/send', { method: 'POST', body: JSON.stringify(data) }),
    getStatus: (instanceId: string) => this.request(`/api/whatsapp/status/${instanceId}`),
    getQrCode: (instanceId: string) => this.request(`/api/whatsapp/qr/${instanceId}`),
    createInstance: (data: any) =>
      this.request('/api/whatsapp/instance', { method: 'POST', body: JSON.stringify(data) }),
    listInstances: () => this.request('/api/whatsapp/instances'),
  };

  campaigns = {
    list: () => this.request('/api/campaigns'),
    get: (id: string) => this.request(`/api/campaigns/${id}`),
    create: (data: any) =>
      this.request('/api/campaigns', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      this.request(`/api/campaigns/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  };

  messages = {
    list: (params?: Record<string, string | number | boolean | null | undefined>) =>
      this.request(`/api/messages${this.buildQuery(params)}`),
    send: (data: any) =>
      this.request('/api/messages', { method: 'POST', body: JSON.stringify(data) }),
  };

  analytics = {
    dashboard: () => this.request('/api/analytics/dashboard'),
    leads: () => this.request('/api/analytics/leads'),
    messages: () => this.request('/api/analytics/messages'),
  };
}

export const api = new ApiClient();
export default api;
