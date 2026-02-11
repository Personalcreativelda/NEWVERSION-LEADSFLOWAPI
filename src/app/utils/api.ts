import { mockAuth } from './auth-mock';
import { getApiBaseUrl } from './api-client';
import type { Lead, LeadNote, ScheduledConversation, InboxConversation, Message } from '../types';

const API_BASE_URL = getApiBaseUrl();

if (!API_BASE_URL) {
  console.error('[API] Missing backend URL. Configure VITE_API_URL ou garanta que o dashboard esteja atrás do mesmo domínio do backend.');
}

const SESSION_EXPIRY_KEY = 'leadflow_session_expires_at';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export const startSessionExpiryTimer = () => {
  try {
    localStorage.setItem(SESSION_EXPIRY_KEY, String(Date.now() + SESSION_TTL_MS));
  } catch (error) {
    console.error('[Auth] Failed to persist session expiry:', error);
  }
};

export const clearSessionExpiry = () => {
  try {
    localStorage.removeItem(SESSION_EXPIRY_KEY);
  } catch (error) {
    console.error('[Auth] Failed to clear session expiry:', error);
  }
};

export const getSessionExpiryTimestamp = (): number | null => {
  try {
    const raw = localStorage.getItem(SESSION_EXPIRY_KEY);
    if (!raw) {
      return null;
    }
    const value = Number(raw);
    if (Number.isNaN(value)) {
      return null;
    }
    return value;
  } catch (error) {
    console.error('[Auth] Failed to read session expiry:', error);
    return null;
  }
};

export const isSessionExpired = (): boolean => {
  const expiry = getSessionExpiryTimestamp();
  if (!expiry) {
    return !!localStorage.getItem('leadflow_access_token');
  }
  return Date.now() > expiry;
};

// Check if token needs refresh (within 5 minutes of expiry)
const REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes before expiry
export const shouldRefreshToken = (): boolean => {
  const expiry = getSessionExpiryTimestamp();
  if (!expiry) {
    return false;
  }
  const timeUntilExpiry = expiry - Date.now();
  return timeUntilExpiry > 0 && timeUntilExpiry < REFRESH_THRESHOLD_MS;
};

const DEV_MODE = true;
const EMAIL_CONFIRMATION_ENABLED = (import.meta.env.VITE_ENABLE_EMAIL_CONFIRMATION ?? 'true') === 'true';

let networkErrorCount = 0;
const MAX_NETWORK_ERRORS = 2;
let isRefreshingToken = false;

// Ensure token is valid before making authenticated requests
async function ensureValidToken(): Promise<void> {
  if (!shouldRefreshToken() && !isSessionExpired()) {
    return;
  }

  if (isRefreshingToken) {
    // Wait for current refresh to complete
    let attempts = 0;
    while (isRefreshingToken && attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    return;
  }

  isRefreshingToken = true;
  try {
    const refreshToken = localStorage.getItem('leadflow_refresh_token');
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      throw new Error('Token refresh failed');
    }

    const data = await response.json();
    if (data?.session?.access_token) {
      localStorage.setItem('leadflow_access_token', data.session.access_token);
      if (data.session.refresh_token) {
        localStorage.setItem('leadflow_refresh_token', data.session.refresh_token);
      }
      startSessionExpiryTimer();
      console.log('[Auth] Token refreshed automatically');
    }
  } catch (error) {
    console.error('[Auth] Failed to refresh token:', error);
    clearSessionExpiry();
    localStorage.removeItem('leadflow_access_token');
    localStorage.removeItem('leadflow_refresh_token');
  } finally {
    isRefreshingToken = false;
  }
}
async function apiCall(
  endpoint: string,
  options: RequestInit = {},
  useAuth = false
): Promise<any> {
  if (!API_BASE_URL) {
    throw new Error('Backend indisponível. Configure VITE_API_URL ou deixe o backend acessível no mesmo domínio.');
  }

  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };

  const isFormDataBody =
    typeof FormData !== 'undefined' && options.body instanceof FormData;

  if (!isFormDataBody && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (useAuth) {
    // Ensure token is refreshed if needed before making request
    await ensureValidToken();

    if (isSessionExpired()) {
      console.warn('[API] Session expired - clearing credentials');
      clearSessionExpiry();
      localStorage.removeItem('leadflow_access_token');
      localStorage.removeItem('leadflow_refresh_token');
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    const token = localStorage.getItem('leadflow_access_token');

    if (!token) {
      console.error('[API] Auth required but no token found');

      if (DEV_MODE) {
        console.warn('[DEV MODE] No auth token - using mock data');
      } else {
        throw new Error('Você precisa estar logado para realizar esta ação. Por favor, faça login novamente.');
      }
    } else {
      headers['Authorization'] = `Bearer ${token}`;
      console.log(`[API] Using auth token (length: ${token.length})`);
    }
  }

  const apiEndpoint = endpoint.startsWith('/api') ? endpoint : `/api${endpoint}`;
  const resourceEndpoint = apiEndpoint.replace(/^\/api/, '') || '/';

  try {
    const methodType = options.method || 'GET';
    console.log(`[API] 📡 ${methodType} ${apiEndpoint}`);

    const response = await fetch(`${API_BASE_URL}${apiEndpoint}`, {
      ...options,
      headers,
    });

    console.log(`[API] ✅ ${methodType} ${apiEndpoint} - Status: ${response.status} ${response.statusText}`);

    if (response.status === 404 && resourceEndpoint === '/admin/notification-settings') {
      return getMockData(resourceEndpoint);
    }

    const contentTypeHeader = response.headers.get('content-type')?.toLowerCase() || '';
    const shouldReadBody = response.status !== 204;
    let data: any = null;

    if (shouldReadBody) {
      const rawBody = await response.text();
      const trimmedBody = rawBody.trim();
      const contentLooksJson = trimmedBody.startsWith('{') || trimmedBody.startsWith('[');
      const expectsJson = contentTypeHeader.includes('application/json') || contentTypeHeader.includes('application/problem+json') || (!contentTypeHeader && contentLooksJson);

      if (trimmedBody && expectsJson) {
        try {
          data = JSON.parse(trimmedBody);
        } catch (jsonError) {
          console.error(`[API] Failed to parse JSON response for ${apiEndpoint}:`, jsonError);
          console.error('[API] Response preview:', trimmedBody.slice(0, 200));
          throw new Error(`Invalid JSON response from server (${response.status}). Verifique se VITE_API_URL aponta para o backend Node.`);
        }
      } else if (trimmedBody && !expectsJson) {
        console.error(`[API] Unexpected non-JSON response for ${apiEndpoint}. Content-Type: ${contentTypeHeader || 'desconhecido'}`);
        console.error('[API] Response preview:', trimmedBody.slice(0, 200));
        throw new Error('Backend respondeu HTML/texto. Certifique-se de que o dashboard está apontando para o servidor Express (VITE_API_URL).');
      }
    }

    if (!response.ok) {
      const errorMessage = typeof data?.error === 'string' ? data.error : '';
      const errorDetails = typeof data?.details === 'string' ? data.details : '';

      const isLeadNotFound = response.status === 404 &&
        resourceEndpoint.startsWith('/leads/') &&
        (errorMessage.toLowerCase().includes('lead not found') ||
          errorMessage.toLowerCase().includes('not found'));

      if (!isLeadNotFound) {
        console.error(`[API] Error response for ${apiEndpoint}:`, data);
      }

      if (response.status === 401 && useAuth) {
        console.warn('[API] 401 Unauthorized - clearing credentials');
        localStorage.removeItem('leadflow_access_token');
        localStorage.removeItem('leadflow_refresh_token');
        clearSessionExpiry();
        throw new Error('Sessão expirada. Faça login novamente.');
      }

      throw new Error(errorMessage || errorDetails || `API error: ${response.status}`);
    }

    console.log(`[API] Success response for ${apiEndpoint}`);
    return data;
  } catch (error) {
    const isLeadNotFoundError = error instanceof Error &&
      error.message?.toLowerCase().includes('lead not found') &&
      resourceEndpoint.startsWith('/leads/');

    if (!isLeadNotFoundError) {
      console.error(`[API] API call error for ${apiEndpoint}:`, error);
    }

    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      if (networkErrorCount < MAX_NETWORK_ERRORS) {
        console.warn('[API] ⚠️  Backend offline - using mock data');
        console.warn(`  Endpoint: ${apiEndpoint}`);
        networkErrorCount++;

        if (networkErrorCount === MAX_NETWORK_ERRORS) {
          console.error('');
          console.error('═══════════════════════════════════════════════════════════════');
          console.error('🚨 BACKEND OFFLINE - App rodando em MOCK MODE');
          console.error('═══════════════════════════════════════════════════════════════');
          console.error('');
          console.error('⚠️  ATENÇÃO: Operações de DELETE, POST e PUT NÃO funcionarão!');
          console.error('');
          console.error('🔧 COMO RESOLVER:');
          console.error('');
          console.error('   1. Abra o terminal na pasta do projeto');
          console.error('   2. Execute: chmod +x deploy-backend.sh && ./deploy-backend.sh');
          console.error('   3. Aguarde o deploy completar');
          console.error('   4. Recarregue a página');
          console.error('');
          console.error('📖 Documentação completa: BACKEND_DEPLOY_QUICK.md');
          console.error('');
          console.error('═══════════════════════════════════════════════════════════════');
          console.error('');
          console.warn('[API] 📢 Further network errors will be silenced.');
        }
      }

      if (DEV_MODE && (options.method === 'GET' || !options.method)) {
        return getMockData(resourceEndpoint);
      }

      if (resourceEndpoint === '/admin/notification-settings' && options.method === 'POST') {
        return { success: true, settings: JSON.parse(options.body as string) };
      }

      if (options.method && options.method !== 'GET') {
        console.error(`[API] ❌ Cannot use mock data for ${options.method} request`);
        console.error(`[API] ❌ Backend is OFFLINE. Cannot perform ${options.method} operations.`);
        throw new Error('Backend indisponível. O servidor não está respondendo. Por favor, verifique a conexão ou tente novamente mais tarde.');
      }
    }

    if (error instanceof Error &&
      error.message.includes('Invalid JSON response from server (404)') &&
      resourceEndpoint === '/admin/notification-settings') {
      console.warn('[API] Notification settings endpoint not found, using mock data');

      if (options.method === 'POST') {
        return { success: true, settings: JSON.parse(options.body as string) };
      }

      return getMockData(resourceEndpoint);
    }

    throw error;
  }
}

// Mock data for development
function getMockData(endpoint: string): any {
  // Get mock session to return user-specific data
  const sessionJson = localStorage.getItem('leadflow_mock_session');
  const session = sessionJson ? JSON.parse(sessionJson) : null;

  if (endpoint === '/user/profile' || endpoint === '/users/profile') {
    if (session) {
      return {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        avatar_url: session.user.avatar_url, // ✅ Padronizado
        plan: 'free',
        subscription_plan: 'free',
        isTrial: false,
        limits: {
          leads: 100,
          messages: 50,
          massMessages: 5,
        },
        usage: {
          leads: 0,
          messages: 0,
          massMessages: 0,
        },
      };
    }

    return {
      id: 'mock-user-id',
      email: 'demo@leadsflow.com',
      name: 'Demo User',
      plan: 'free',
      subscription_plan: 'free',
      isTrial: false,
      limits: {
        leads: 100,
        messages: 50,
        massMessages: 5,
      },
      usage: {
        leads: 0,
        messages: 0,
        massMessages: 0,
      },
    };
  }

  if (endpoint === '/leads') {
    return [];
  }

  if (endpoint.startsWith('/webhooks/settings')) {
    return {
      success: true,
      webhookSettings: {
        metaPixelId: '',
      },
    };
  }

  if (endpoint === '/admin/notification-settings') {
    return {
      success: true,
      settings: {
        upgradeNotifications: true,
        newUserNotifications: false,
        paymentNotifications: true,
      },
    };
  }

  // ✅ Mock data for notifications
  if (endpoint === '/notifications') {
    return {
      success: true,
      notifications: [],
      count: 0,
      unreadCount: 0,
    };
  }

  if (endpoint.startsWith('/notifications/') && endpoint.includes('/read')) {
    return { success: true };
  }

  if (endpoint === '/notifications/mark-all-read') {
    return { success: true };
  }

  if (endpoint === '/notifications/clear-all') {
    return { success: true };
  }

  if (endpoint.startsWith('/notifications/') && endpoint.split('/').length === 3) {
    // DELETE individual notification
    return { success: true };
  }

  return { success: true, data: null };
}

// Export apiRequest wrapper for backward compatibility and easier usage
export const apiRequest = async (
  endpoint: string,
  method: string = 'GET',
  data?: any
): Promise<any> => {
  const options: RequestInit = {
    method,
  };

  if (data) {
    options.body = JSON.stringify(data);
  }

  // Determine if auth is needed (all requests except public endpoints need auth)
  const publicEndpoints = [
    '/plans',
    '/auth/signup',
    '/auth/signin',
    '/auth/register',
    '/auth/login',
    '/auth/logout',
  ];
  const needsAuth = !publicEndpoints.some(path => endpoint.startsWith(path));

  return apiCall(endpoint, options, needsAuth);
};

// ============================================
// AUTH API
// ============================================

export const authApi = {
  setupDemo: async () => {
    console.log('Setting up demo user...');
    const data = await apiCall('/auth/setup-demo', {
      method: 'POST',
    });
    console.log('Demo setup response:', data);
    return data;
  },

  setupAdmin: async () => {
    console.log('Setting up admin user...');
    const data = await apiCall('/auth/setup-admin', {
      method: 'POST',
    });
    console.log('Admin setup response:', data);
    return data;
  },

  signup: async (email: string, password: string, name: string, selectedPlan: string = 'starter') => {
    console.log('[Auth] Signup API call for:', email, 'with name:', name, 'selectedPlan:', selectedPlan);

    try {
      const metadata = { name, selectedPlan };
      const data = await apiCall('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, metadata }),
      });
      console.log('[Auth] Signup API response:', data);

      const user = data?.user;
      const session = data?.session;

      if (!user) {
        throw new Error('Resposta inválida do servidor de cadastro.');
      }

      if (session?.access_token) {
        localStorage.setItem('leadflow_access_token', session.access_token);
        if (session.refresh_token) {
          localStorage.setItem('leadflow_refresh_token', session.refresh_token);
        }
        startSessionExpiryTimer();

        return {
          success: true,
          requiresEmailConfirmation: false,
          user: {
            id: user.id,
            email: user.email,
          },
        };
      }

      const requiresConfirmation = Boolean(
        data?.requiresEmailConfirmation ?? (!session || EMAIL_CONFIRMATION_ENABLED)
      );

      if (requiresConfirmation) {
        console.log('[Auth] Signup successful - awaiting email confirmation before signin');
        return {
          success: true,
          requiresEmailConfirmation: true,
          user: {
            id: user.id,
            email: user.email,
          },
        };
      }

      console.log('[Auth] Signup successful, waiting 2 seconds before signin...');
      await new Promise((resolve) => setTimeout(resolve, 2000));

      console.log('[Auth] Attempting automatic signin...');
      return await authApi.signin(email, password);
    } catch (error: any) {
      console.error('[Auth] Signup error:', error);

      const errorMessage = error?.message || '';

      if (errorMessage.includes('Backend indisponível') || errorMessage.includes('Failed to fetch')) {
        console.warn('[Auth] 🔄 Backend offline - using Mock Auth for signup');
        const result = await mockAuth.signup(email, password, name);

        if (result.success) {
          return result;
        }

        throw new Error(result.error || 'Erro ao criar conta');
      }

      if (
        errorMessage.includes('already been registered') ||
        errorMessage.includes('User already registered') ||
        errorMessage.includes('já está cadastrado')
      ) {
        throw error;
      }

      console.warn('[Auth] 🔄 Trying Mock Auth for signup');
      const result = await mockAuth.signup(email, password, name);

      if (result.success) {
        return result;
      }

      throw new Error(result.error || 'Erro ao criar conta');
    }
  },

  signin: async (email: string, password: string) => {
    console.log('[Auth] Signin attempt for:', email);

    try {
      const data = await apiCall('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      const session = data?.session;
      const user = data?.user;

      if (!session?.access_token || !user?.id) {
        throw new Error('Resposta inválida do servidor de autenticação.');
      }

      localStorage.setItem('leadflow_access_token', session.access_token);
      if (session.refresh_token) {
        localStorage.setItem('leadflow_refresh_token', session.refresh_token);
      }
      startSessionExpiryTimer();

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
        },
      };
    } catch (error: any) {
      console.error('[Auth] Backend signin error:', error);

      const errorMessage = error?.message || '';

      if (
        errorMessage.includes('Backend indisponível') ||
        errorMessage.includes('Failed to fetch') ||
        errorMessage.includes('ECONNREFUSED')
      ) {
        console.warn('[Auth] 🔄 Backend offline - using Mock Auth');
        return handleMockSignin(email, password);
      }

      if (errorMessage.toLowerCase().includes('invalid login credentials')) {
        throw new Error('Email ou senha incorretos.');
      }

      throw error;
    }
  },

  signout: async () => {
    try {
      const refreshToken = localStorage.getItem('leadflow_refresh_token');

      try {
        await apiCall('/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
      } catch (backendError) {
        console.warn('[Auth] Logout API error (ignored):', backendError);
      }

      await mockAuth.signout();
      clearSessionExpiry();

      return { success: true };
    } catch (error: any) {
      console.error('[Auth] Signout error:', error);
      await mockAuth.signout();
      clearSessionExpiry();
      return { success: true };
    }
  },

  refreshSession: async () => {
    const refreshToken = localStorage.getItem('leadflow_refresh_token');

    try {
      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      const data = await apiCall('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      const session = data?.session;

      if (!session?.access_token) {
        throw new Error('Resposta inválida do servidor de sessão.');
      }

      localStorage.setItem('leadflow_access_token', session.access_token);
      if (session.refresh_token) {
        localStorage.setItem('leadflow_refresh_token', session.refresh_token);
      }

      startSessionExpiryTimer();

      return {
        success: true,
        session,
        user: data?.user,
      };
    } catch (error: any) {
      console.error('[Auth] Refresh session error:', error);

      const mockSession = await mockAuth.getSession();
      const session = mockSession?.data?.session;

      if (session) {
        console.warn('[Auth] Using mock session refresh fallback');
        startSessionExpiryTimer();
        return {
          success: true,
          session,
          user: session.user,
          fallback: 'mock',
        };
      }

      clearSessionExpiry();
      localStorage.removeItem('leadflow_access_token');
      localStorage.removeItem('leadflow_refresh_token');

      throw error;
    }
  },

  verifyEmail: async (email: string, code: string) => {
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      throw new Error('Informe o código de verificação.');
    }

    try {
      await apiCall('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ email, token: trimmedCode }),
      });
      return { success: true };
    } catch (error: any) {
      console.error('[Auth] Email verification error:', error);
      const result = await mockAuth.verifyEmail(email, trimmedCode);

      if (!result.success) {
        throw new Error(result.error || 'Não foi possível confirmar o email.');
      }

      return { success: true };
    }
  },

  resendConfirmation: async (email: string) => {
    try {
      await apiCall('/auth/resend-confirmation', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      return { success: true };
    } catch (error: any) {
      console.error('[Auth] Resend confirmation error:', error);
      const result = await mockAuth.resendConfirmation(email);

      if (!result.success) {
        throw new Error(result.error || 'Não foi possível reenviar o email.');
      }

      return { success: true };
    }
  },

  requestPasswordReset: async (email: string, redirectTo?: string) => {
    await apiCall('/auth/password/reset', {
      method: 'POST',
      body: JSON.stringify({ email, redirect_to: redirectTo }),
    });
    return { success: true };
  },

  completePasswordReset: async (email: string, token: string, password: string) => {
    await apiCall('/auth/password/complete', {
      method: 'POST',
      body: JSON.stringify({ email, token, password }),
    });
    return { success: true };
  },

  signInWithGoogle: async () => {
    console.log('[Auth] Initiating Google OAuth sign-in (Direct, without Supabase)...');

    try {
      // Redirect to backend Google OAuth endpoint
      // The backend will handle the OAuth flow and redirect back with tokens
      const apiUrl = API_BASE_URL || window.location.origin;
      const googleAuthUrl = `${apiUrl}/api/auth/google`;

      console.log('[Auth] Redirecting to Google OAuth via backend:', googleAuthUrl);

      // Redirect the browser to initiate OAuth flow
      window.location.href = googleAuthUrl;

      // This function won't return as the page is redirecting
      return { success: true, redirecting: true };
    } catch (error: any) {
      console.error('[Auth] Failed to initiate Google OAuth:', error);
      throw new Error(error.message || 'Erro ao conectar com Google.');
    }
  },
};

// ============================================
// USER API
// ============================================

export const userApi = {
  getProfile: async () => {
    return apiCall('/users/profile', {}, true);
  },

  updateProfile: async (name: string, avatar?: string) => {
    const body: any = { name };
    if (avatar) {
      body.avatar_url = avatar; // ✅ Padronizado para avatar_url
    }
    const updatedProfile = await apiCall('/users/profile', {
      method: 'PUT',
      body: JSON.stringify(body),
    }, true);
    return { success: true, user: updatedProfile };
  },

  uploadAvatar: async (file: File | Blob) => {
    const formData = new FormData();
    formData.append('avatar', file);

    const response = await apiCall('/users/avatar', {
      method: 'POST',
      body: formData,
    }, true);

    return response;
  },

  // ============================================
  // USER SETTINGS API (PERSISTENT CONFIGURATION)
  // ============================================

  getSettings: async () => {
    console.log('[UserSettings API] Fetching settings from backend...');
    const settings = await apiCall('/users/settings', {}, true);
    console.log('[UserSettings API] Settings loaded:', Object.keys(settings || {}));
    return settings;
  },

  saveSettings: async (settings: any) => {
    console.log('[UserSettings API] Saving settings to backend:', Object.keys(settings));
    const response = await apiCall('/users/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }, true);
    console.log('[UserSettings API] Settings saved successfully');
    return response;
  },

  saveSetting: async (key: string, value: any) => {
    console.log('[UserSettings API] Saving single setting:', key);
    const response = await apiCall(`/users/settings/${key}`, {
      method: 'PATCH',
      body: JSON.stringify({ value }),
    }, true);
    console.log('[UserSettings API] Setting saved successfully');
    return response;
  },
};

// ============================================
// PLANS API
// ============================================

export const plansApi = {
  getPlans: async () => {
    return apiCall('/plans', {});
  },

  upgrade: async (planId: string) => {
    return apiCall('/plans/upgrade', {
      method: 'POST',
      body: JSON.stringify({ planId }),
    }, true);
  },
};

// ============================================
// LEADS API
// ============================================

const toOptionalNumber = (value: any): number | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const cleanCustomFields = (fields: Record<string, any>) => {
  const cleaned: Record<string, any> = {};
  Object.entries(fields).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }
    cleaned[key] = value;
  });
  return cleaned;
};

const mapLeadToApiPayload = (leadData: any) => {
  const rawName = (leadData?.nome ?? leadData?.name ?? '').toString().trim();
  const fallbackNameSource = leadData?.telefone ?? leadData?.phone ?? leadData?.whatsapp ?? '';
  const derivedName = rawName || (fallbackNameSource ? `Lead ${fallbackNameSource}` : 'Lead sem nome');

  const phoneValue = leadData?.telefone ?? leadData?.phone ?? leadData?.whatsapp ?? null;
  const tagsValue = Array.isArray(leadData?.tags)
    ? leadData.tags
    : Array.isArray(leadData?.etiquetas)
      ? leadData.etiquetas
      : [];

  const customFields = cleanCustomFields({
    ...(leadData?.custom_fields || {}),
    interesse: leadData?.interesse ?? leadData?.custom_fields?.interesse,
    agente_atual: leadData?.agente_atual ?? leadData?.custom_fields?.agente_atual,
    valor: toOptionalNumber(leadData?.valor ?? leadData?.custom_fields?.valor),
    data: leadData?.data ?? leadData?.custom_fields?.data,
  });

  const dealValue = toOptionalNumber(leadData?.deal_value ?? leadData?.valor ?? leadData?.custom_fields?.valor);

  return {
    name: derivedName,
    email: leadData?.email ?? leadData?.mail ?? null,
    phone: phoneValue,
    whatsapp: leadData?.whatsapp ?? phoneValue,
    company: leadData?.empresa ?? leadData?.company ?? null,
    position: leadData?.cargo ?? leadData?.position ?? null,
    source: leadData?.origem ?? leadData?.source ?? 'unknown',
    status: leadData?.status ?? 'new',
    tags: tagsValue,
    notes: leadData?.observacao ?? leadData?.observacoes ?? leadData?.notes ?? null,
    custom_fields: customFields,
    deal_value: dealValue ?? 0,
    avatar_url: leadData?.avatar_url ?? leadData?.avatarUrl ?? null,
  };
};

// Normalizar status de inglês para português (canais criam com 'new', dashboard espera 'novo')
const normalizeStatus = (status: string | undefined): string => {
  if (!status) return 'novo';
  const statusMap: Record<string, string> = {
    'new': 'novo',
    'contacted': 'contatado',
    'qualified': 'qualificado',
    'negotiation': 'negociacao',
    'in_negotiation': 'negociacao',
    'in negotiation': 'negociacao',
    'converted': 'convertido',
    'lost': 'perdido',
    'rejected': 'perdido',
    'discarded': 'perdido',
    'waiting': 'qualificado',
    'closed': 'convertido',
  };
  const normalized = status.toLowerCase().trim();
  return statusMap[normalized] || status;
};

const mapLeadFromApi = (lead: any): Lead => {
  if (!lead) {
    return lead;
  }

  // Validate lead ID
  if (!lead.id || lead.id === '0' || lead.id === 0) {
    console.warn('[LeadsAPI] ⚠️ Lead with invalid ID detected:', lead);
    return null; // Filter out invalid leads
  }

  const custom = lead.custom_fields || {};

  return {
    id: lead.id,
    nome: lead.name || lead.nome || 'Lead sem nome',
    telefone: lead.phone || lead.whatsapp || lead.telefone || '',
    email: lead.email || '',
    interesse: custom.interesse ?? lead.interesse ?? '',
    origem: lead.source || lead.origem || '',
    status: normalizeStatus(lead.status),
    data: custom.data || lead.data || lead.created_at,
    agente_atual: custom.agente_atual ?? lead.agente_atual ?? '',
    observacoes: lead.notes || lead.observacoes || lead.observacao || '',
    marcado_email: lead.marcado_email ?? false,
    valor: lead.deal_value ?? custom.valor ?? lead.valor ?? 0,
    deal_value: lead.deal_value ?? custom.valor ?? lead.valor ?? 0,
    avatarUrl: lead.avatar_url ?? null,
    empresa: lead.company || lead.empresa || '',
    createdAt: lead.created_at,
    updatedAt: lead.updated_at,
    convertedAt: lead.converted_at,
  };
};

const mapLeadCollection = (collection: any[]): Lead[] => {
  return collection
    .map(mapLeadFromApi)
    .filter((lead): lead is Lead => lead !== null && lead !== undefined);
};

export const leadsApi = {
  getAll: async () => {
    console.log('[LeadsAPI] 🔄 Fetching leads via backend API (direct sync disabled)...');

    try {
      // Query backend with pagination to keep responses manageable
      let allLeads: Lead[] = [];
      let page = 0;
      const limit = 1000;
      let hasMore = true;

      while (hasMore && page < 20) {
        const offset = page * limit;
        console.log(`[LeadsAPI] 📄 Backend API page ${page + 1} (offset=${offset}, limit=${limit})...`);

        const pageLeads = await apiCall(`/leads?offset=${offset}&limit=${limit}`, {}, true);
        const leadsArray = Array.isArray(pageLeads) ? mapLeadCollection(pageLeads) : [];

        console.log(`[LeadsAPI] 📦 Backend page ${page + 1}: ${leadsArray.length} leads`);

        if (leadsArray.length === 0) {
          console.log('[LeadsAPI] ✅ No more pages from backend');
          hasMore = false;
        } else {
          if (allLeads.length > 0 && leadsArray.length > 0) {
            const firstNewId = leadsArray[0]?.id;
            const isDuplicate = allLeads.some((lead) => lead.id === firstNewId);

            if (isDuplicate) {
              console.log('[LeadsAPI] ⚠️ Backend pagination appears unsupported (duplicates detected). Using collected pages only.');
              return { success: true, leads: allLeads };
            }
          }

          allLeads = [...allLeads, ...leadsArray];

          if (leadsArray.length < limit) {
            console.log('[LeadsAPI] ✅ Last page reached');
            hasMore = false;
          } else {
            page++;
          }
        }
      }

      console.log(`[LeadsAPI] ✅ SUCCESS: ${allLeads.length} leads fetched via backend API`);
      return { success: true, leads: allLeads };
    } catch (error) {
      console.error('[LeadsAPI] ❌ Critical error fetching leads via backend:', error);

      try {
        console.log('[LeadsAPI] 🔄 Last resort: fetching without pagination...');
        const leads = await apiCall('/leads', {}, true);
        const leadsArray = Array.isArray(leads) ? mapLeadCollection(leads) : [];
        console.log(`[LeadsAPI] ✅ Fallback successful: ${leadsArray.length} leads`);
        return { success: true, leads: leadsArray };
      } catch (fallbackError) {
        console.error('[LeadsAPI] ❌ All fetch methods failed:', fallbackError);
        return { success: false, leads: [] };
      }
    }
  },

  create: async (leadData: any) => {
    const payload = mapLeadToApiPayload(leadData);
    const lead = await apiCall('/leads', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, true);
    return { success: true, lead: mapLeadFromApi(lead) };
  },

  update: async (leadId: string, leadData: any) => {
    const payload = mapLeadToApiPayload(leadData);
    const lead = await apiCall(`/leads/${leadId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }, true);
    return { success: true, lead: mapLeadFromApi(lead) };
  },

  delete: async (leadId: string) => {
    if (!leadId || leadId === '0' || leadId === 'undefined' || leadId === 'null') {
      throw new Error('ID do lead inválido. Não é possível deletar este lead.');
    }
    console.log(`[LeadsAPI] 🗑️ Deleting lead: ${leadId}`);
    const result = await apiCall(`/leads/${leadId}`, {
      method: 'DELETE',
    }, true);
    console.log(`[LeadsAPI] ✅ Lead deleted successfully: ${leadId}`);
    return { success: true };
  },

  getById: async (leadId: string) => {
    if (!leadId || leadId === '0' || leadId === 'undefined' || leadId === 'null') {
      throw new Error('ID do lead inválido.');
    }
    console.log(`[LeadsAPI] 🔄 Fetching lead by ID: ${leadId}`);
    const lead = await apiCall(`/leads/${leadId}`, {}, true);
    console.log(`[LeadsAPI] ✅ Lead fetched successfully: ${leadId}`);
    return mapLeadFromApi(lead);
  },

  importBulk: async (leads: any[], meta?: { source?: string }) => {
    if (!Array.isArray(leads) || leads.length === 0) {
      throw new Error('Nenhum lead fornecido para importação.');
    }

    const payload = leads.map(mapLeadToApiPayload);
    const body: Record<string, any> = { leads: payload };
    if (meta?.source) {
      body.source = meta.source;
    }

    return apiCall('/leads/import-bulk', {
      method: 'POST',
      body: JSON.stringify(body),
    }, true);
  },

  removeDuplicates: async () => {
    return apiCall('/leads/remove-duplicates', {
      method: 'POST',
    }, true);
  },

  uploadAvatar: async (leadId: string, file: File) => {
    const formData = new FormData();
    formData.append('avatar', file);

    const token = localStorage.getItem('leadflow_access_token');

    const response = await fetch(`${API_BASE_URL}/api/leads/${leadId}/avatar`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to upload avatar' }));
      throw new Error(error.error || 'Failed to upload avatar');
    }

    return response.json();
  },
};

// ============================================
// MESSAGES API
// ============================================

export const messagesApi = {
  send: async (leadId: string, message: string) => {
    return apiCall('/messages/send', {
      method: 'POST',
      body: JSON.stringify({ leadId, message }),
    }, true);
  },

  sendMass: async (leadIds: string[], message: string) => {
    return apiCall('/messages/mass-send', {
      method: 'POST',
      body: JSON.stringify({ leadIds, message }),
    }, true);
  },
};

// ============================================
// ACTIVITIES API
// ============================================

export const activitiesApi = {
  getAll: async (limit = 50) => {
    return apiCall(`/activities?limit=${limit}`, {}, true);
  },
};

export const integrationsApi = {
  syncN8N: async (webhookUrl: string) => {
    return apiCall('/integrations/n8n/sync', {
      method: 'POST',
      body: JSON.stringify({ webhookUrl }),
    }, true);
  },
};

// ============================================
// LEAD NOTES API
// ============================================

export const leadNotesApi = {
  getAll: async (leadId: string): Promise<LeadNote[]> => {
    return apiCall(`/lead-notes/${leadId}`, {}, true);
  },

  create: async (leadId: string, content: string): Promise<LeadNote> => {
    return apiCall(`/lead-notes/${leadId}`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }, true);
  },

  update: async (noteId: string, content: string): Promise<LeadNote> => {
    return apiCall(`/lead-notes/${noteId}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }, true);
  },

  delete: async (noteId: string): Promise<void> => {
    return apiCall(`/lead-notes/${noteId}`, {
      method: 'DELETE',
    }, true);
  },
};

// ============================================
// SCHEDULED CONVERSATIONS API
// ============================================

export const scheduledConversationsApi = {
  getAll: async (filters?: { lead_id?: string; status?: string }): Promise<ScheduledConversation[]> => {
    const params = new URLSearchParams();
    if (filters?.lead_id) params.set('lead_id', filters.lead_id);
    if (filters?.status) params.set('status', filters.status);
    const qs = params.toString();
    return apiCall(`/scheduled-conversations${qs ? `?${qs}` : ''}`, {}, true);
  },

  getUpcoming: async (limit = 10): Promise<ScheduledConversation[]> => {
    return apiCall(`/scheduled-conversations/upcoming?limit=${limit}`, {}, true);
  },

  create: async (data: { lead_id: string; title: string; description?: string; scheduled_at: string }): Promise<ScheduledConversation> => {
    return apiCall('/scheduled-conversations', {
      method: 'POST',
      body: JSON.stringify(data),
    }, true);
  },

  update: async (id: string, data: { title?: string; description?: string; scheduled_at?: string; status?: string }): Promise<ScheduledConversation> => {
    return apiCall(`/scheduled-conversations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }, true);
  },

  delete: async (id: string): Promise<void> => {
    return apiCall(`/scheduled-conversations/${id}`, {
      method: 'DELETE',
    }, true);
  },
};

// ============================================
// INBOX API
// ============================================

export interface InboxStatus {
  evolution_configured: boolean;
  instance_id: string;
  instance_status: string;
  connection_state: string | null;
  message: string;
}

export const inboxApi = {
  getStatus: async (): Promise<InboxStatus> => {
    return apiCall('/inbox/status', {}, true);
  },

  getConversations: async (filters?: { search?: string; limit?: number; offset?: number }): Promise<InboxConversation[]> => {
    const params = new URLSearchParams();
    if (filters?.search) params.set('search', filters.search);
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.offset) params.set('offset', String(filters.offset));
    const qs = params.toString();
    return apiCall(`/inbox/conversations${qs ? `?${qs}` : ''}`, {}, true);
  },

  getMessages: async (leadId: string, filters?: { limit?: number; offset?: number }): Promise<Message[]> => {
    const params = new URLSearchParams();
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.offset) params.set('offset', String(filters.offset));
    const qs = params.toString();
    return apiCall(`/inbox/conversations/${leadId}/messages${qs ? `?${qs}` : ''}`, {}, true);
  },

  markAsRead: async (leadId: string): Promise<{ updated: number }> => {
    return apiCall(`/inbox/conversations/${leadId}/read`, {
      method: 'POST',
    }, true);
  },

  sendMessage: async (leadId: string, content: string, channel = 'whatsapp'): Promise<any> => {
    return apiCall(`/inbox/conversations/${leadId}/send`, {
      method: 'POST',
      body: JSON.stringify({ content, channel }),
    }, true);
  },

  getUnreadCount: async (): Promise<{ count: number }> => {
    return apiCall('/inbox/unread-count', {}, true);
  },
};

// ============================================
// EMAIL CAMPAIGNS API
// ============================================

export const emailsApi = {
  getAll: async () => {
    return apiCall('/email-campaigns', {}, true);
  },

  getById: async (id: string) => {
    return apiCall(`/email-campaigns/${id}`, {}, true);
  },

  create: async (data: any) => {
    return apiCall('/email-campaigns', {
      method: 'POST',
      body: JSON.stringify(data)
    }, true);
  },

  update: async (id: string, data: any) => {
    return apiCall(`/email-campaigns/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }, true);
  },

  delete: async (id: string) => {
    return apiCall(`/email-campaigns/${id}`, {
      method: 'DELETE'
    }, true);
  },

  updateStats: async (id: string, stats: any) => {
    return apiCall(`/email-campaigns/${id}/stats`, {
      method: 'PATCH',
      body: JSON.stringify(stats)
    }, true);
  }
};
