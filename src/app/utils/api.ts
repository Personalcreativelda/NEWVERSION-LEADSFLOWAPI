import { mockAuth } from './auth-mock';
import { getApiBaseUrl } from './api-client';
import { logger } from './logger';
import { GET_TIMEOUT_MS, clearOfflineCache, loadCachedResponse, saveCachedResponse } from '../lib/offlineCache';
import { ServerDownError, isServerDownError, isServerDownResponse, reportServerDown, reportServerUp, timeoutSignal } from '../lib/serverStatus';
import { clearOutbox, enqueueOutbox, queuedLeadNotes, queuedLeadUpdates, registerOutboxSender, type OutboxItem } from '../lib/outbox';
import { isNativeApp, openNativeOAuth, NATIVE_OAUTH_REDIRECT } from '../../native';
import { usableImageUrl } from './media-url';
import type { Lead, LeadNote, ScheduledConversation, InboxConversation, Message } from '../types';

const API_BASE_URL = getApiBaseUrl();

if (!API_BASE_URL) {
  logger.error('[API] Missing backend URL. Configure VITE_API_URL ou garanta que o dashboard esteja atrás do mesmo domínio do backend.');
}

const SESSION_EXPIRY_KEY = 'leadflow_session_expires_at';
// Janela de inatividade da sessão: igual à validade do refresh token no servidor
// (7 dias). Com 24h quem não abria o app de um dia para o outro tinha de entrar de novo.
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export const startSessionExpiryTimer = () => {
  try {
    localStorage.setItem(SESSION_EXPIRY_KEY, String(Date.now() + SESSION_TTL_MS));
  } catch {
    // storage unavailable — session will rely on the access token alone
  }
};

export const clearSessionExpiry = () => {
  try {
    localStorage.removeItem(SESSION_EXPIRY_KEY);
  } catch {
    // ignore
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
  } catch {
    return null;
  }
};

export const isSessionExpired = (): boolean => {
  const expiry = getSessionExpiryTimestamp();
  if (!expiry) {
    // No expiry recorded — if a token exists the session is still valid;
    // set a fresh 24 h timer so subsequent checks work correctly.
    if (localStorage.getItem('leadflow_access_token')) {
      startSessionExpiryTimer();
      return false;
    }
    return true; // no token at all
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

const DEV_MODE = import.meta.env.DEV;
const EMAIL_CONFIRMATION_ENABLED = (import.meta.env.VITE_ENABLE_EMAIL_CONFIRMATION ?? 'true') === 'true';

// Validade (exp) do access token JWT, em ms; null se não der para ler
const getAccessTokenExpiry = (): number | null => {
  try {
    const token = localStorage.getItem('leadflow_access_token');
    const payload = token?.split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
};

let refreshPromise: Promise<boolean> | null = null;

/**
 * Troca o refresh token por um access token novo. Pedidos em simultâneo partilham a
 * mesma troca — o servidor invalida o refresh token usado, por isso duas trocas em
 * paralelo faziam a segunda falhar e terminavam a sessão. Só apaga as credenciais
 * quando o servidor recusa o refresh token; sem rede mantém-nas para tentar depois.
 */
export function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = localStorage.getItem('leadflow_refresh_token');
    if (!refreshToken || !API_BASE_URL) return false;

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) {
          logger.warn('[Auth] Refresh token rejected - clearing credentials');
          clearSessionExpiry();
          localStorage.removeItem('leadflow_access_token');
          localStorage.removeItem('leadflow_refresh_token');
        }
        return false;
      }

      const data = await response.json();
      if (!data?.session?.access_token) return false;

      localStorage.setItem('leadflow_access_token', data.session.access_token);
      if (data.session.refresh_token) {
        localStorage.setItem('leadflow_refresh_token', data.session.refresh_token);
      }
      startSessionExpiryTimer();
      return true;
    } catch (error) {
      logger.warn('[Auth] Token refresh failed (network):', error);
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// Renova o access token antes de expirar (faltando menos de 5 minutos)
async function ensureValidToken(): Promise<void> {
  if (!localStorage.getItem('leadflow_access_token')) return;
  const expiry = getAccessTokenExpiry();
  if (expiry !== null && expiry - Date.now() > REFRESH_THRESHOLD_MS) return;
  await refreshAccessToken();
}

async function apiCall(
  endpoint: string,
  options: RequestInit = {},
  useAuth = false,
  isRetry = false
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
      logger.warn('[API] Session expired - clearing credentials');
      clearSessionExpiry();
      localStorage.removeItem('leadflow_access_token');
      localStorage.removeItem('leadflow_refresh_token');
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    const token = localStorage.getItem('leadflow_access_token');

    if (!token) {
      logger.error('[API] Auth required but no token found');

      if (DEV_MODE) {
        logger.warn('[DEV MODE] No auth token - using mock data');
      } else {
        throw new Error('Você precisa estar logado para realizar esta ação. Por favor, faça login novamente.');
      }
    } else {
      headers['Authorization'] = `Bearer ${token}`;
      // Do NOT log token or its length — treat auth headers as secrets
    }
  }

  const apiEndpoint = endpoint.startsWith('/api') ? endpoint : `/api${endpoint}`;
  const resourceEndpoint = apiEndpoint.replace(/^\/api/, '') || '/';

  const methodType = (options.method || 'GET').toUpperCase();
  const isGet = methodType === 'GET';

  try {
    logger.log(`[API] ${methodType} ${apiEndpoint}`);

    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}${apiEndpoint}`, {
        ...options,
        headers,
        signal: options.signal ?? (isGet ? timeoutSignal(GET_TIMEOUT_MS) : undefined),
      });
    } catch (fetchError) {
      // Cancelado pelo próprio ecrã: não é falha do servidor
      if (options.signal?.aborted) throw fetchError;
      throw new ServerDownError();
    }

    logger.log(`[API] ${methodType} ${apiEndpoint} - Status: ${response.status}`);

    // Página de erro do proxy (não JSON): o pedido não chegou à API
    if (isServerDownResponse(response.status, response.headers.get('content-type'))) {
      throw new ServerDownError();
    }

    if (response.status === 404 && (
      resourceEndpoint === '/admin/notification-settings' ||
      resourceEndpoint.startsWith('/webhooks/settings')
    )) {
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
          logger.error(`[API] Failed to parse JSON for ${apiEndpoint}:`, jsonError);
          throw new Error(`Invalid JSON response from server (${response.status}). Verifique se VITE_API_URL aponta para o backend Node.`);
        }
      } else if (trimmedBody && !expectsJson) {
        logger.error(`[API] Unexpected non-JSON response for ${apiEndpoint}. Content-Type: ${contentTypeHeader || 'unknown'}`);
        throw new Error('Backend respondeu HTML/texto. Certifique-se de que o dashboard está apontando para o servidor Express (VITE_API_URL).');
      }
    }

    // A API está viva mas sem base de dados (503 com code SERVER_UNAVAILABLE)
    if (isServerDownResponse(response.status, contentTypeHeader, data)) {
      throw new ServerDownError();
    }

    if (!response.ok) {
      const errorMessage = typeof data?.error === 'string' ? data.error : '';
      const errorDetails = typeof data?.details === 'string' ? data.details : '';

      const isLeadNotFound = response.status === 404 &&
        resourceEndpoint.startsWith('/leads/') &&
        (errorMessage.toLowerCase().includes('lead not found') ||
          errorMessage.toLowerCase().includes('not found'));

      if (!isLeadNotFound) {
        logger.error(`[API] Error response ${apiEndpoint}:`, data);
      }

      if (response.status === 401 && useAuth) {
        // Token expirado: renova com o refresh token e repete o pedido uma vez
        if (!isRetry && await refreshAccessToken()) {
          return apiCall(endpoint, options, useAuth, true);
        }
        logger.warn('[API] 401 Unauthorized - clearing credentials');
        localStorage.removeItem('leadflow_access_token');
        localStorage.removeItem('leadflow_refresh_token');
        clearSessionExpiry();
        throw new Error('Sessão expirada. Faça login novamente.');
      }

      // Plan enforcement: plan expired, payment overdue, or any limit exceeded
      const ENFORCEMENT_CODES = [
        'PLAN_EXPIRED',
        'PAYMENT_OVERDUE',
        'LEAD_LIMIT_EXCEEDED',
        'MESSAGE_LIMIT_EXCEEDED',
        'MASS_MESSAGE_LIMIT_EXCEEDED',
      ];
      if (response.status === 403 && data?.code && ENFORCEMENT_CODES.includes(data.code)) {
        window.dispatchEvent(
          new CustomEvent('plan-enforcement-blocked', {
            detail: { code: data.code, message: data.message },
          })
        );
        const err: any = new Error(data.message || 'Plano bloqueado');
        err.isPlanEnforcement = true;
        err.code = data.code;
        throw err;
      }

      throw new Error(errorMessage || errorDetails || `API error: ${response.status}`);
    }

    logger.log(`[API] OK ${apiEndpoint}`);
    reportServerUp();
    if (isGet) {
      void saveCachedResponse(apiEndpoint, data);
    }
    // Slide the inactivity window on every successful authenticated call
    if (useAuth) {
      startSessionExpiryTimer();
    }
    return data;
  } catch (error) {
    // Servidor inalcançável: um GET devolve a última cópia guardada no aparelho
    if (error instanceof ServerDownError) {
      if (isGet) {
        const cached = await loadCachedResponse(apiEndpoint);
        if (cached) {
          logger.warn(`[API] Servidor indisponível — a usar cópia guardada de ${apiEndpoint}`);
          reportServerDown(cached.savedAt);
          return cached.data;
        }
      }
      reportServerDown();
      throw error;
    }

    const isLeadNotFoundError = error instanceof Error &&
      error.message?.toLowerCase().includes('lead not found') &&
      resourceEndpoint.startsWith('/leads/');

    if (!isLeadNotFoundError) {
      logger.error(`[API] Error ${apiEndpoint}:`, error);
    }

    if (error instanceof Error &&
      error.message.includes('Invalid JSON response from server (404)') &&
      resourceEndpoint === '/admin/notification-settings') {
      logger.warn('[API] Notification settings endpoint not found, using mock data');

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
          messages: 100,
          massMessages: 50,
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
        messages: 100,
        massMessages: 50,
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
    const data = await apiCall('/auth/setup-demo', { method: 'POST' });
    return data;
  },

  setupAdmin: async () => {
    const data = await apiCall('/auth/setup-admin', { method: 'POST' });
    return data;
  },

  signup: async (email: string, password: string, name: string, selectedPlan: string = 'starter') => {
    try {
      const metadata = { name, selectedPlan };
      const data = await apiCall('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, metadata }),
      });

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
        logger.log('[Auth] Signup successful - awaiting email confirmation');
        return {
          success: true,
          requiresEmailConfirmation: true,
          user: {
            id: user.id,
            email: user.email,
          },
        };
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
      return await authApi.signin(email, password);
    } catch (error: any) {
      logger.error('[Auth] Signup error:', error);
      throw error;
    }
  },

  signin: async (email: string, password: string) => {

    try {
      const data = await apiCall('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      // 2FA required — return temp token for second step
      if (data?.requires_2fa) {
        return { requires_2fa: true as const, temp_token: data.temp_token as string };
      }

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
        success: true as const,
        user: {
          id: user.id,
          email: user.email,
        },
      };
    } catch (error: any) {
      const errorMessage = error?.message || '';

      if (errorMessage.toLowerCase().includes('invalid login credentials')) {
        throw new Error('Email ou senha incorretos.');
      }

      throw error;
    }
  },

  verify2FALogin: async (tempToken: string, code: string) => {
    const data = await apiCall('/auth/login/2fa', {
      method: 'POST',
      body: JSON.stringify({ temp_token: tempToken, code }),
    });

    const session = data?.session;
    const user = data?.user;

    if (!session?.access_token || !user?.id) {
      throw new Error('Resposta inválida do servidor.');
    }

    localStorage.setItem('leadflow_access_token', session.access_token);
    if (session.refresh_token) {
      localStorage.setItem('leadflow_refresh_token', session.refresh_token);
    }
    startSessionExpiryTimer();

    return { success: true as const, user: { id: user.id, email: user.email } };
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
        logger.warn('[Auth] Logout API error (ignored):', backendError);
      }

      await mockAuth.signout();
      clearSessionExpiry();

      return { success: true };
    } catch (error: any) {
      logger.error('[Auth] Signout error:', error);
      await mockAuth.signout();
      clearSessionExpiry();
      return { success: true };
    } finally {
      // As cópias offline, a fila e os dados da inbox são do utilizador que sai: não podem ficar no aparelho
      await Promise.all([
        clearOfflineCache(),
        clearOutbox(),
        import('../lib/userScope').then((m) => m.forgetDataOwner()).catch(() => {}),
      ]);
    }
  },

  verifyEmail: async (email: string, code: string) => {
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      throw new Error('Informe o código de verificação.');
    }

    await apiCall('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ email, token: trimmedCode }),
    });
    return { success: true };
  },

  resendConfirmation: async (email: string) => {
    await apiCall('/auth/resend-confirmation', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    return { success: true };
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

      // Pede à API o endereço do Google e abre-o diretamente: a barra do browser mostra
      // logo accounts.google.com, nunca o endereço da API. Se a API ainda não suportar
      // (?format=json), usa o redirecionamento antigo.
      const directGoogleUrl = async (redirect?: string) => {
        try {
          const params = new URLSearchParams({ format: 'json' });
          if (redirect) params.set('redirect', redirect);
          const res = await fetch(`${googleAuthUrl}?${params}`, { cache: 'no-store' });
          const data = res.ok ? await res.json() : null;
          return typeof data?.url === 'string' && data.url.startsWith('https://accounts.google.com/') ? data.url : null;
        } catch {
          return null;
        }
      };

      // App Android: login numa Custom Tab, a API devolve-nos por deep link.
      if (isNativeApp()) {
        const url = await directGoogleUrl(NATIVE_OAUTH_REDIRECT);
        return await openNativeOAuth(
          url || `${googleAuthUrl}?redirect=${encodeURIComponent(NATIVE_OAUTH_REDIRECT)}`
        );
      }

      // Redirect the browser to initiate OAuth flow
      window.location.href = (await directGoogleUrl()) || googleAuthUrl;

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

  changePassword: async (currentPassword: string, newPassword: string) => {
    return apiCall('/users/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }, true);
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

  createStripeCheckoutSession: async (planId: string, billingCycle: 'monthly' | 'annual') => {
    return apiCall('/plans/stripe/checkout-session', {
      method: 'POST',
      body: JSON.stringify({ planId, billingCycle }),
    }, true);
  },

  getPaymentHistory: async () => {
    return apiCall('/plans/payment-history', {}, true);
  },

  cancelPlan: async () => {
    return apiCall('/plans/cancel', { method: 'POST' }, true);
  },

  syncActiveSubscription: async (planHint?: string) => {
    return apiCall('/plans/sync-active-subscription', {
      method: 'POST',
      body: planHint ? JSON.stringify({ planHint }) : undefined,
    }, true);
  },

  createPortalSession: async () => {
    return apiCall('/plans/portal-session', { method: 'POST' }, true);
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
    origem: lead.channel_source || lead.source || lead.origem || '',
    status: normalizeStatus(lead.status),
    data: custom.data || lead.data || lead.created_at,
    agente_atual: custom.agente_atual ?? lead.agente_atual ?? '',
    observacoes: lead.notes || lead.observacoes || lead.observacao || '',
    marcado_email: lead.marcado_email ?? false,
    valor: lead.deal_value ?? custom.valor ?? lead.valor ?? 0,
    deal_value: lead.deal_value ?? custom.valor ?? lead.valor ?? 0,
    avatarUrl: usableImageUrl(lead.avatar_url),
    empresa: lead.company || lead.empresa || '',
    createdAt: lead.created_at,
    capturedAt: lead.captured_at || lead.created_at,
    channelSource: lead.channel_source || lead.source || '',
    updatedAt: lead.updated_at,
    convertedAt: lead.converted_at,
    lead_score: lead.lead_score ?? lead.engagement_score ?? null,
  };
};

const mapLeadCollection = (collection: any[]): Lead[] => {
  return collection
    .map(mapLeadFromApi)
    .filter((lead): lead is Lead => lead !== null && lead !== undefined);
};

/** Aplica aos leads da API (ou da cópia guardada) as alterações que ainda estão na fila offline */
const withQueuedLeadUpdates = (rawLeads: any[]): any[] => {
  const updates = queuedLeadUpdates();
  if (updates.size === 0) return rawLeads;
  return rawLeads.map((lead) => (lead?.id && updates.has(lead.id) ? { ...lead, ...updates.get(lead.id) } : lead));
};

registerOutboxSender('lead-update', (item) =>
  apiCall(`/leads/${item.leadId}`, { method: 'PUT', body: JSON.stringify(item.payload) }, true));

registerOutboxSender('lead-note', (item) =>
  apiCall(`/lead-notes/${item.leadId}`, { method: 'POST', body: JSON.stringify({ content: item.content }) }, true));

/** Nota ainda na fila, no formato das notas da API (o id "queued_…" não existe no servidor) */
const queuedNoteToLeadNote = (item: Extract<OutboxItem, { kind: 'lead-note' }>): LeadNote => ({
  id: item.id,
  user_id: item.userId,
  lead_id: item.leadId,
  content: item.content,
  created_at: new Date(item.createdAt).toISOString(),
  updated_at: new Date(item.createdAt).toISOString(),
});

export const leadsApi = {
  /** Últimas mensagens trocadas com o lead (todas as conversas dele), por ordem cronológica */
  getMessages: async (leadId: string, limit = 50): Promise<Message[]> => {
    return apiCall(`/leads/${leadId}/messages?limit=${limit}`, {}, true);
  },

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
        const leadsArray = Array.isArray(pageLeads) ? mapLeadCollection(withQueuedLeadUpdates(pageLeads)) : [];

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
        const leadsArray = Array.isArray(leads) ? mapLeadCollection(withQueuedLeadUpdates(leads)) : [];
        console.log(`[LeadsAPI] ✅ Fallback successful: ${leadsArray.length} leads`);
        return { success: true, leads: leadsArray };
      } catch (fallbackError) {
        console.error('[LeadsAPI] ❌ All fetch methods failed:', fallbackError);
        return { success: false, leads: [] };
      }
    }
  },

  /** Leads guardados no aparelho (as mesmas páginas que getAll pede), para mostrar já ao abrir o app */
  getCached: async (): Promise<Lead[]> => {
    const limit = 1000;
    let allLeads: Lead[] = [];
    for (let page = 0; page < 20; page++) {
      const cached = await loadCachedResponse(`/api/leads?offset=${page * limit}&limit=${limit}`);
      const pageLeads = Array.isArray(cached?.data) ? mapLeadCollection(withQueuedLeadUpdates(cached.data)) : [];
      allLeads = [...allLeads, ...pageLeads];
      if (pageLeads.length < limit) break;
    }
    return allLeads;
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
    try {
      const lead = await apiCall(`/leads/${leadId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }, true);
      return { success: true, lead: mapLeadFromApi(lead) };
    } catch (error) {
      if (!isServerDownError(error)) throw error;
      // Sem servidor: a alteração fica na fila e o ecrã mostra-a já
      await enqueueOutbox({ kind: 'lead-update', id: `lead-update:${leadId}`, leadId, payload });
      return { success: true, queued: true, lead: { ...mapLeadFromApi({ ...payload, id: leadId }), ...leadData, id: leadId } };
    }
  },

  delete: async (leadId: string) => {
    if (!leadId || leadId === '0' || leadId === 'undefined' || leadId === 'null') {
      throw new Error('ID do lead inválido. Não é possível deletar este lead.');
    }
    console.log(`[LeadsAPI] 🗑️ Deleting lead: ${leadId}`);
    await apiCall(`/leads/${leadId}`, {
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
    return mapLeadFromApi(withQueuedLeadUpdates([lead])[0]);
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
    // Notas ainda na fila offline aparecem primeiro (são as mais recentes)
    const queued = queuedLeadNotes(leadId).map(queuedNoteToLeadNote).reverse();
    let notes: LeadNote[];
    try {
      notes = await apiCall(`/lead-notes/${leadId}`, {}, true);
    } catch (error) {
      if (!isServerDownError(error) || queued.length === 0) throw error;
      notes = [];
    }
    return queued.length > 0 ? [...queued, ...(Array.isArray(notes) ? notes : [])] : notes;
  },

  create: async (leadId: string, content: string): Promise<LeadNote> => {
    try {
      return await apiCall(`/lead-notes/${leadId}`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      }, true);
    } catch (error) {
      if (!isServerDownError(error)) throw error;
      const id = `queued_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await enqueueOutbox({ kind: 'lead-note', id, leadId, content });
      return queuedNoteToLeadNote({ kind: 'lead-note', id, leadId, content, userId: '', createdAt: Date.now() });
    }
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

  create: async (data: { lead_id?: string | null; title: string; description?: string; scheduled_at: string; metadata?: ScheduledConversation['metadata'] }): Promise<ScheduledConversation> => {
    return apiCall('/scheduled-conversations', {
      method: 'POST',
      body: JSON.stringify(data),
    }, true);
  },

  update: async (id: string, data: { title?: string; description?: string; scheduled_at?: string; status?: string; metadata?: ScheduledConversation['metadata'] }): Promise<ScheduledConversation> => {
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

// ============================================
// SMS CAMPAIGNS API
// ============================================

export const smsCampaignsApi = {
  getAll: async () => {
    return apiCall('/sms-campaigns', {}, true);
  },

  getById: async (id: string) => {
    return apiCall(`/sms-campaigns/${id}`, {}, true);
  },

  create: async (data: any) => {
    return apiCall('/sms-campaigns', {
      method: 'POST',
      body: JSON.stringify(data)
    }, true);
  },

  update: async (id: string, data: any) => {
    return apiCall(`/sms-campaigns/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }, true);
  },

  delete: async (id: string) => {
    return apiCall(`/sms-campaigns/${id}`, {
      method: 'DELETE'
    }, true);
  },

  send: async (id: string) => {
    return apiCall(`/sms-campaigns/${id}/send`, {
      method: 'POST',
      body: JSON.stringify({})
    }, true);
  }
};
