import { useState, useEffect, useRef, useCallback } from 'react';
import Header from './components/Header';
import HeroSection from './components/HeroSection';
import Features from './components/Features';
import Analytics from './components/Analytics';
import Pricing from './components/Pricing';
import CTASection from './components/CTASection';
import Footer from './components/Footer';
import Dashboard from './components/Dashboard';
import HlsVideoBackground from './components/auth/HlsVideoBackground';
import LoginPage from './components/auth/LoginPage';
import SignupPage from './components/auth/SignupPage';
import ResetPasswordPage from './components/auth/ResetPasswordPage';
import ForgotPasswordPage from './components/auth/ForgotPasswordPage';
import SettingsPage from './components/settings/SettingsPage';
import AdminPage from './components/settings/AdminPage';
import SetupTestUser from './components/SetupTestUser';
import AgentCallPage from './components/pages/AgentCallPage';
import AcceptInvitePage from './components/auth/AcceptInvitePage';
import UpgradeModal from './components/modals/UpgradeModal';
import PlanUpgradeSuccessModal from './components/modals/PlanUpgradeSuccessModal';
import { MetaPixel } from './components/MetaPixel';
import { GoogleAnalytics } from './components/GoogleAnalytics';
import { ConfirmProvider } from './components/ui/ConfirmDialog';
import { authApi, apiRequest, plansApi, isSessionExpired, startSessionExpiryTimer } from './utils/api';
import { mockAuth } from './utils/auth-mock';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';

// ============================================
// CAPTURE OAUTH HASH IMMEDIATELY ON SCRIPT LOAD
// This runs before React initializes, so the hash won't be lost
// ============================================
const CAPTURED_HASH = window.location.hash;
const CAPTURED_URL = window.location.href;
console.log('[OAuth Capture] Hash captured on load:', CAPTURED_HASH);
console.log('[OAuth Capture] Full URL on load:', CAPTURED_URL);

// Decode base64url (URL-safe variant: - instead of +, _ instead of /, no padding)
function decodeBase64url(str: string): string {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '=='.slice((base64.length % 4 + 2) % 4);
  return atob(padded);
}

// Process OAuth callback immediately if detected
let OAUTH_PROCESSED = false;
if (CAPTURED_HASH.includes('oauth_callback') || CAPTURED_HASH.includes('access_token')) {
  console.log('[OAuth Capture] OAuth callback detected in hash!');
  try {
    let hashContent = CAPTURED_HASH.substring(1); // Remove #
    if (hashContent.startsWith('oauth_callback&')) {
      hashContent = hashContent.substring('oauth_callback&'.length);
    }
    const hashParams = new URLSearchParams(hashContent);
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');
    const userBase64 = hashParams.get('user');

    if (accessToken) {
      console.log('[OAuth Capture] Tokens found, saving to localStorage...');
      localStorage.setItem('leadflow_access_token', accessToken);
      if (refreshToken) {
        localStorage.setItem('leadflow_refresh_token', refreshToken);
      }
      // Reset session timer IMMEDIATELY so any stale/expired timer from a
      // previous session doesn't cause ensureValidToken() to clear these fresh tokens.
      startSessionExpiryTimer();

      if (userBase64) {
        try {
          const userJsonDecoded = decodeBase64url(userBase64);
          const userData = JSON.parse(userJsonDecoded);
          localStorage.setItem('leadflow_user', JSON.stringify(userData));
          console.log('[OAuth Capture] User saved:', userData.email);
        } catch (parseErr) {
          console.warn('[OAuth Capture] Could not parse user data — will fetch from API:', parseErr);
          // Don't block OAUTH_PROCESSED — token is valid, user will be fetched via /auth/me
        }
      }

      // Clean up URL immediately
      window.history.replaceState({}, document.title, window.location.pathname);
      OAUTH_PROCESSED = true;
      console.log('[OAuth Capture] ✅ OAuth data captured and saved!');
    }
  } catch (error) {
    console.error('[OAuth Capture] Error processing OAuth hash:', error);
  }
}

// Report auth errors to the backend so they appear in the diagnostic endpoint.
// Fire-and-forget: failures here must never affect the auth flow.
function reportAuthError(code: string, detail?: string): void {
  try {
    const base = import.meta.env.VITE_API_URL || 'http://localhost:4000';
    const token = localStorage.getItem('leadflow_access_token') ?? undefined;
    fetch(`${base}/api/auth/error-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ code, detail, userAgent: navigator.userAgent }),
    }).catch(() => { /* silent */ });
  } catch {
    // localStorage might be unavailable in certain browsers — ignore
  }
}

declare global {
  interface Window {
    chatwootSDK?: {
      run: (options: { websiteToken: string; baseUrl: string }) => void;
    };
  }
}

// LeadsFlow SAAS - Main App Component
type Page = 'landing' | 'login' | 'signup' | 'dashboard' | 'settings' | 'admin' | 'setup' | 'reset-password' | 'forgot-password' | 'agent-call' | 'accept-invite';

interface AppProps {
  initialPage?: Page;
  landingEnabled?: boolean;
}

// Helper functions for URL routing (clean URLs without hash)
const getPageFromPath = (): Page | null => {
  const pathname = window.location.pathname;
  const cleanPath = pathname.split('?')[0].split('#')[0]; // Remove query params and hash

  // Dashboard sub-routes (/dashboard, /dashboard/leads, etc.) all map to dashboard
  if (cleanPath === '/dashboard' || cleanPath.startsWith('/dashboard/')) return 'dashboard';

  const pageMap: Record<string, Page> = {
    '/login': 'login',
    '/signup': 'signup',
    '/forgot-password': 'forgot-password',
    '/reset-password': 'reset-password',
    '/settings': 'settings',
    '/admin': 'admin',
    '/setup': 'setup',
    '/agent-call': 'agent-call',
    '/accept-invite': 'accept-invite',
  };

  return pageMap[cleanPath] || null;
};

const setPagePath = (page: Page) => {
  if (page === 'landing') {
    if (window.location.pathname !== '/' && window.location.pathname !== '') {
      window.history.pushState({ page }, '', '/');
    }
    return;
  }

  if (page === 'dashboard') {
    // Don't overwrite /dashboard/* sub-paths — those are managed within Dashboard
    const p = window.location.pathname;
    const isAlreadyDashboard = p === '/' || p === '/dashboard' || p.startsWith('/dashboard/');
    if (!isAlreadyDashboard) {
      window.history.pushState({ page }, '', '/');
    }
    return;
  }

  const pathMap: Record<Page, string> = {
    'login': '/login',
    'signup': '/signup',
    'forgot-password': '/forgot-password',
    'reset-password': '/reset-password',
    'settings': '/settings',
    'admin': '/admin',
    'setup': '/setup',
    'agent-call': '/agent-call',
    'accept-invite': '/accept-invite',
    'landing': '/',
    'dashboard': '/',
  };

  const newPath = pathMap[page];
  if (newPath && window.location.pathname !== newPath) {
    window.history.pushState({ page }, '', newPath);
  }
};

export default function App({ initialPage, landingEnabled = true }: AppProps = {}) {
  const homePage: Page = landingEnabled ? 'landing' : 'login';

  // Check URL path for initial page (clean URLs)
  const pageFromUrl = getPageFromPath();
  const resolvedInitialPage: Page =
    pageFromUrl ? pageFromUrl :
    initialPage && (!landingEnabled ? initialPage !== 'landing' : true)
      ? initialPage
      : homePage;
  const [currentPage, setCurrentPage] = useState<Page>(resolvedInitialPage);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  // Prevent concurrent checkAuth calls (e.g. React StrictMode double-invocation in dev)
  const isCheckingAuthRef = useRef(false);
  const [appVersion, setAppVersion] = useState<string>('...');
  const [versionNotification, setVersionNotification] = useState<{ id: number; version: string; releaseNotes: string } | null>(null);
  const envMetaPixelId = import.meta.env.VITE_META_PIXEL_ID as string | undefined;
  const [metaPixelId, setMetaPixelId] = useState<string>(envMetaPixelId ? envMetaPixelId.trim() : '');
  const [googleAnalyticsId, setGoogleAnalyticsId] = useState<string>('');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [planEnforcementBlock, setPlanEnforcementBlock] = useState<{ code: string; message: string } | null>(null);
  const [upgradeSuccessModal, setUpgradeSuccessModal] = useState<{ open: boolean; plan: string }>({ open: false, plan: '' });
  // Capture checkout success from URL params on mount (before user loads)
  const [pendingCheckoutSuccess, setPendingCheckoutSuccess] = useState<boolean>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('checkoutSuccess') === 'true';
  });
  const [pendingCheckoutPlanId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('checkoutSuccess') === 'true' ? (params.get('plan') || null) : null;
  });
  const [pendingCheckoutCanceled] = useState<boolean>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('checkoutCanceled') === 'true';
  });
  const isLoggingOutRef = useRef(false);

  // Sync currentPage with URL path.
  // Guard: if OAuth was just processed, the initial currentPage is still 'login' (from
  // useState's initial value). Calling setPagePath('login') here would push '/login' to
  // the URL BEFORE initialize fires, causing initialize's public-page guard to return
  // early and block OAuth entirely. Skip public-page URL pushes during OAuth.
  useEffect(() => {
    const publicPages = ['login', 'signup', 'forgot-password', 'reset-password'];
    if (OAUTH_PROCESSED && publicPages.includes(currentPage)) return;
    setPagePath(currentPage);
  }, [currentPage]);

  // Listen for browser back/forward button
  useEffect(() => {
    const handlePopState = () => {
      const pageFromPath = getPageFromPath();
      if (pageFromPath && pageFromPath !== currentPage) {
        setCurrentPage(pageFromPath);
      } else if (!pageFromPath && user) {
        setCurrentPage('dashboard');
      } else if (!pageFromPath && !user) {
        setCurrentPage(homePage);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [currentPage, user, homePage]);


  const forceLogout = useCallback(async (reason?: string) => {
    if (isLoggingOutRef.current) {
      return;
    }

    isLoggingOutRef.current = true;

    if (reason) {
      console.log(`[Auth] 🔒 Forcing logout: ${reason}`);
    }

    try {
      await authApi.signout();
    } catch (logoutError) {
      console.error('[Auth] Error during forced logout:', logoutError);
    } finally {
      setUser(null);
      setCurrentPage(homePage);
      setLoading(false);
      isLoggingOutRef.current = false;
    }
  }, [homePage]);

  useEffect(() => {
    const BASE_URL = import.meta.env.VITE_CHATWOOT_URL;
    const WEBSITE_TOKEN = import.meta.env.VITE_CHATWOOT_TOKEN;

    // Skip Chatwoot initialization if not configured
    if (!BASE_URL || !WEBSITE_TOKEN) {
      return;
    }

    const initChatwoot = () => {
      if (window.chatwootSDK) {
        window.chatwootSDK.run({
          websiteToken: WEBSITE_TOKEN,
          baseUrl: BASE_URL,
        });
      }
    };

    const existingScript = document.getElementById('chatwoot-sdk');
    if (existingScript) {
      initChatwoot();
      return;
    }

    const script = document.createElement('script');
    script.id = 'chatwoot-sdk';
    script.src = `${BASE_URL}/packs/js/sdk.js`;
    script.async = true;
    script.dataset.chatwoot = 'true';
    script.onload = initChatwoot;
    document.body.appendChild(script);

    return () => {
      // Keep widget available across navigation; no cleanup required
    };
  }, []);

  // ✅ AUTO-REFRESH TOKEN - Renova o token a cada 30 minutos para evitar expiração
  useEffect(() => {
    const attemptRefresh = async () => {
      if (!user) {
        return;
      }

      if (isSessionExpired()) {
        await forceLogout('Session expired (auto-refresh)');
        return;
      }

      try {
        await authApi.refreshSession();
      } catch (error) {
        console.error('[Auth] Error during auto-refresh:', error);
        await forceLogout('Session refresh failed');
      }
    };

    const refreshInterval = setInterval(() => {
      void attemptRefresh();
    }, 30 * 60 * 1000);

    return () => clearInterval(refreshInterval);
  }, [user, forceLogout]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const enforceExpiry = async () => {
      if (isSessionExpired()) {
        await forceLogout('Session expired (periodic enforcement)');
      }
    };

    const intervalId = setInterval(() => {
      void enforceExpiry();
    }, 60 * 1000);

    // Skip the immediate check right after OAuth. The session was just created and
    // concurrent in-flight requests (e.g. version check) may not have settled yet.
    // In StrictMode this effect fires 2–3 times; the interval handles enforcement.
    if (!OAUTH_PROCESSED) {
      void enforceExpiry();
    }

    return () => clearInterval(intervalId);
  }, [user, forceLogout]);

  useEffect(() => {
    // Add listener for upgrade modal events
    const handleOpenUpgradeModal = () => {
      console.log('[App] 🔔 Received open-upgrade-modal event');
      setShowUpgradeModal(true);
    };

    // Plan enforcement: backend returned 403 with enforcement code
    const handlePlanEnforcement = (e: Event) => {
      const detail = (e as CustomEvent<{ code: string; message: string }>).detail;
      if (detail?.code) {
        setPlanEnforcementBlock(detail);
      }
    };

    window.addEventListener('open-upgrade-modal', handleOpenUpgradeModal);
    window.addEventListener('plan-enforcement-blocked', handlePlanEnforcement);

    // Refresh usage counters after a message is sent (debounced 2s to batch rapid sends)
    let messageSentTimer: ReturnType<typeof setTimeout> | null = null;
    const handleMessageSent = () => {
      if (messageSentTimer) clearTimeout(messageSentTimer);
      messageSentTimer = setTimeout(() => {
        refreshUserData().catch(() => {});
      }, 2000);
    };
    window.addEventListener('message-sent', handleMessageSent);

    return () => {
      window.removeEventListener('open-upgrade-modal', handleOpenUpgradeModal);
      window.removeEventListener('plan-enforcement-blocked', handlePlanEnforcement);
      window.removeEventListener('message-sent', handleMessageSent);
      if (messageSentTimer) clearTimeout(messageSentTimer);
    };
  }, []);



  // Handle Stripe redirect back with ?checkoutSuccess=true
  // Clean the URL on mount (runs once) — params already captured in state above
  useEffect(() => {
    if (pendingCheckoutSuccess || pendingCheckoutCanceled) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    if (pendingCheckoutCanceled) {
      toast.info('Pagamento cancelado. Você pode tentar novamente quando quiser.');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When user is available and there's a pending checkout success, sync the plan
  useEffect(() => {
    if (!pendingCheckoutSuccess || !user) return;

    setPendingCheckoutSuccess(false);

    // Optimistic update: immediately apply the plan from the URL param so the
    // dashboard shows the new plan as soon as the user object is available,
    // before the network sync comes back.
    if (pendingCheckoutPlanId) {
      setUser((prev: any) => ({
        ...prev,
        plan: pendingCheckoutPlanId,
        subscription_plan: pendingCheckoutPlanId,
      }));
    }

    // Sync with Stripe in background to get accurate limits + expiry
    const doSync = async () => {
      try {
        const syncResult = await plansApi.syncActiveSubscription(pendingCheckoutPlanId || undefined);
        await refreshUserData();
        const activatedPlan = syncResult?.plan || pendingCheckoutPlanId || '';
        setUpgradeSuccessModal({ open: true, plan: activatedPlan });
      } catch (e) {
        console.warn('[Stripe] Could not auto-refresh after checkout:', e);
        setUpgradeSuccessModal({ open: true, plan: pendingCheckoutPlanId || '' });
      }
    };
    void doSync();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, pendingCheckoutSuccess]);

  // Fetch app version from database
  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/api/version/current`);
        if (response.ok) {
          const data = await response.json();
          setAppVersion(data.version || '1.0.0');
        }
      } catch (error) {
        console.error('[App] Error fetching version:', error);
        setAppVersion('1.0.0');
      }
    };
    fetchVersion();
  }, []);

  // Check for version notification when user logs in.
  // Uses raw fetch (not apiRequest) so a transient 401 never clears the active tokens.
  useEffect(() => {
    const checkVersionNotification = async () => {
      if (!user) return;
      const token = localStorage.getItem('leadflow_access_token');
      if (!token) return;
      try {
        const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
        const res = await fetch(`${baseUrl}/api/version/check-notification`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.hasNewVersion && data.version) {
          setVersionNotification({
            id: data.version.id,
            version: data.version.version,
            releaseNotes: data.version.release_notes || '',
          });
        }
      } catch {
        // Version notifications are non-critical — silently ignore network/parse errors.
      }
    };
    void checkVersionNotification();
  }, [user]);

  const dismissVersionNotification = async () => {
    if (!versionNotification) return;
    
    try {
      await apiRequest('/version/mark-seen', 'POST', { versionId: versionNotification.id });
    } catch (error) {
      console.error('[App] Error marking version as seen:', error);
    }
    setVersionNotification(null);
  };

  // OAuth error handler — success path is handled at module level (early capture above).
  // Only need to surface provider errors returned via ?error=... query params.
  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const oauthError = queryParams.get('error');
    if (oauthError) {
      const errorMessage = queryParams.get('message') || 'Erro ao autenticar com Google';
      console.error('[OAuth] Provider returned error:', oauthError, errorMessage);
      alert(decodeURIComponent(errorMessage));
      window.history.replaceState({}, document.title, window.location.pathname);
      setLoading(false);
    }
  }, []);

  const loadWebhookSettings = useCallback(async () => {
    const token = localStorage.getItem('leadflow_access_token');
    if (!token) {
      console.log('No token available for loading webhook settings');
      return;
    }

    try {
      const response = await apiRequest('/webhooks/settings', 'GET');
      if (response.success && response.webhookSettings?.metaPixelId) {
        console.log('[Meta Pixel] Dynamic pixel ID from settings:', response.webhookSettings.metaPixelId);
      }
      // Load pixel + GA IDs from user settings (saved by IntegrationsPage)
      const storedPixelId = localStorage.getItem('meta_pixel_id');
      const storedGaId = localStorage.getItem('google_analytics_id');
      if (storedPixelId) setMetaPixelId(storedPixelId);
      if (storedGaId) setGoogleAnalyticsId(storedGaId);
    } catch (error) {
      console.log('[Meta Pixel] Using default configuration (webhook settings unavailable)');
    }
  }, []);

  const fetchUserContext = useCallback(async () => {
    try {
      const authResponse = await apiRequest('/auth/me', 'GET');
      const authUser = authResponse?.user;

      if (!authUser?.id || !authUser?.email) {
        throw new Error('Sessão inválida. Faça login novamente.');
      }

      let profile: any = null;
      try {
        profile = await apiRequest('/user/profile', 'GET');
      } catch (profileError) {
        console.warn('[Auth] Failed to load profile from backend:', profileError);
        // Continue with auth user data even if profile fails
      }

      const userData: any = {
        ...(profile || {}),
        id: authUser.id,
        email: authUser.email,
        name: profile?.name || authUser.name || '',
        avatar_url: profile?.avatar_url || authUser.avatar_url || null,
        // Pull subscription fields from both sources (profile from DB is authoritative if present)
        subscription_status: profile?.subscription_status || authUser.subscription_status || 'active',
        plan_expires_at: profile?.plan_expires_at || authUser.plan_expires_at || authUser.planExpiresAt || null,
        planExpiresAt: profile?.planExpiresAt || profile?.plan_expires_at || authUser.planExpiresAt || authUser.plan_expires_at || null,
        plan_activated_at: profile?.plan_activated_at || authUser.plan_activated_at || authUser.planActivatedAt || null,
        planActivatedAt: profile?.planActivatedAt || profile?.plan_activated_at || authUser.planActivatedAt || authUser.plan_activated_at || null,
      };

      // Normalize plan values to lowercase to ensure consistent comparisons throughout the UI
      // Use authUser.plan as fallback in case profile fetch failed silently (avoids defaulting to 'free')
      userData.plan = (userData.plan || authUser.plan || 'free').toLowerCase();
      userData.subscription_plan = (userData.subscription_plan || authUser.subscription_plan || userData.plan).toLowerCase();

      // If the user has a paid plan but no expiry date stored, sync from Stripe to populate it
      if (userData.plan !== 'free' && !userData.plan_expires_at && !userData.planExpiresAt) {
        try {
          const syncResult = await plansApi.syncActiveSubscription();
          if (syncResult?.synced && syncResult.expiresAt) {
            userData.plan_expires_at = syncResult.expiresAt;
            userData.planExpiresAt = syncResult.expiresAt;
            console.log('[Auth] Auto-synced plan expiry from Stripe:', syncResult.expiresAt);
          }
        } catch (e) {
          console.warn('[Auth] Could not auto-sync subscription expiry from Stripe:', e);
        }
      }

      if (!userData.limits) {
        userData.limits = {
          leads: 100,
          messages: 100,
          massMessages: 200,
        };
      }
      if (!userData.usage) {
        userData.usage = {
          leads: 0,
          messages: 0,
          massMessages: 0,
        };
      }

      return userData;
    } catch (error) {
      console.error('[fetchUserContext] Error:', error);
      throw error;
    }
  }, []);

  const checkAuth = useCallback(async () => {
    // Guard: prevent concurrent executions (React StrictMode runs effects twice in dev)
    if (isCheckingAuthRef.current) {
      console.log('[checkAuth] Already running, skipping duplicate call');
      return;
    }
    isCheckingAuthRef.current = true;
    try {
      console.log('[checkAuth] Starting authentication check...');

      // Standalone public pages — never redirect away, just stop loading
      const pageAtStart = getPageFromPath();
      const publicPages: (Page | null)[] = ['accept-invite', 'agent-call', 'login', 'signup', 'forgot-password', 'reset-password'];
      if (publicPages.includes(pageAtStart)) {
        setLoading(false);
        return;
      }

      // Skip auth check if we're in an OAuth callback - let the OAuth handler process first
      const hash = window.location.hash;
      if (hash.startsWith('#oauth_callback')) {
        console.log('[checkAuth] OAuth callback detected, skipping auth check...');
        return;
      }

      if (isSessionExpired()) {
        console.log('[checkAuth] Session expired');
        await forceLogout('Session expired (initial check)');
        return;
      }

      const token = localStorage.getItem('leadflow_access_token');

      if (token) {
        try {
          console.log('[checkAuth] Token found, fetching user context...');
          const userData = await Promise.race([
            fetchUserContext(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Timeout fetching user context')), 10000)
            )
          ]);
          console.log('[checkAuth] User context loaded successfully');
          setUser(userData);
          // Salva no localStorage para WhatsAppConnection e outros componentes
          if (userData && userData.id) {
            localStorage.setItem('leadflow_user', JSON.stringify(userData));
          }
          // Navigate to the page the user originally requested, if it requires auth
          // Public pages (login, signup, landing) are redirected to dashboard
          const pageFromUrl = getPageFromPath();
          // Standalone pages — never override, they handle their own flow
          if (pageFromUrl === 'agent-call' || pageFromUrl === 'accept-invite') {
            return;
          }
          const authRequiredPages: Page[] = ['dashboard', 'settings', 'admin'];
          if (pageFromUrl && authRequiredPages.includes(pageFromUrl)) {
            setCurrentPage(pageFromUrl);
          } else {
            setCurrentPage('dashboard');
          }
          return;
        } catch (backendError) {
          console.error('[Auth] Failed to hydrate user from backend:', backendError);
          if (OAUTH_PROCESSED) {
            // The token was JUST received via OAuth — a transient backend error should not
            // destroy the fresh tokens. Keep them and let the user try again from login.
            console.warn('[Auth] OAUTH_PROCESSED=true — not calling forceLogout on backend error');
            setCurrentPage('login');
            return;
          }
          await forceLogout('Failed to load user data');
          return;
        }
      }

      console.log('[checkAuth] No token found, checking mock session...');
      const mockSession = await mockAuth.getSession();
      const session = mockSession?.data?.session;

      if (session) {
        console.warn('[Auth] Using mock session fallback');
        setUser({
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
          plan: 'free',
          subscription_plan: 'free',
          isTrial: false,
          limits: {
            leads: 100,
            messages: 100,
            massMessages: 200,
          },
          usage: {
            leads: 0,
            messages: 0,
            massMessages: 0,
          },
        });
        setCurrentPage('dashboard');
        return;
      }

      // Don't redirect if already on a public page
      const currentPageFromUrl = getPageFromPath();
      const noRedirectPages: (Page | null)[] = ['accept-invite', 'agent-call', 'login', 'signup', 'forgot-password', 'reset-password'];
      if (noRedirectPages.includes(currentPageFromUrl)) return;

      console.log('[checkAuth] No authentication found, redirecting to home');
      setCurrentPage(homePage);
    } catch (error) {
      console.error('[checkAuth] Unexpected error:', error);
      setCurrentPage(homePage);
    } finally {
      console.log('[checkAuth] Setting loading to false');
      setLoading(false);
      isCheckingAuthRef.current = false;
    }
  }, [fetchUserContext, forceLogout, homePage]);

  const checkPasswordResetCallback = useCallback(() => {
    const rawHash = window.location.hash.startsWith('#')
      ? window.location.hash.substring(1)
      : window.location.hash;
    const hashParams = new URLSearchParams(rawHash);
    const searchParams = new URLSearchParams(window.location.search);

    const isRecovery = hashParams.get('type') === 'recovery' || searchParams.get('type') === 'recovery';
    const resetRequested = sessionStorage.getItem('password_reset_requested') === 'true';
    const resetMode = sessionStorage.getItem('password_reset_mode') === 'true';

    if (isRecovery || resetRequested || resetMode) {
      console.log('[Reset] Redirecting to reset-password flow');
      sessionStorage.setItem('password_reset_mode', 'true');
      sessionStorage.removeItem('password_reset_requested');
      window.history.replaceState(null, '', window.location.pathname);
      setCurrentPage('reset-password');
      setLoading(false);
      return true;
    }

    return false;
  }, []);

  useEffect(() => {
    const initialize = async () => {
      console.log('[Initialize] Starting... OAUTH_PROCESSED:', OAUTH_PROCESSED);

      // OAuth MUST be checked before the URL-based public page guard below.
      // Two reasons:
      //   1. The [currentPage] effect (defined earlier in the component) fires first and
      //      calls pushState('/login'), so getPageFromPath() returns 'login' by the time
      //      we reach the public-page check — which would block OAuth entirely.
      //   2. The [currentPage] effect now has its own guard (OAUTH_PROCESSED + public page
      //      list), but we keep this check first as the primary defense.
      if (OAUTH_PROCESSED) {
        console.log('[Initialize] OAuth was processed on script load, loading user...');

        // Fast path: user was serialised into localStorage by early capture
        const storedUser = localStorage.getItem('leadflow_user');
        if (storedUser) {
          try {
            const userData = JSON.parse(storedUser);
            setUser(userData);
            startSessionExpiryTimer();
            setCurrentPage('dashboard');
            setLoading(false);
            console.log('[Initialize] ✅ OAuth user loaded from localStorage:', userData.email);
            return;
          } catch (e) {
            console.error('[Initialize] Error parsing stored user — will try API fallback:', e);
          }
        }

        // Fallback: token exists but user JSON was missing or corrupt — hydrate from API.
        // This path is self-contained so we never fall through to checkAuth(), which also
        // has a public-page URL guard that would silently bail out when the URL is '/login'.
        const token = localStorage.getItem('leadflow_access_token');
        if (token) {
          try {
            console.log('[Initialize] OAuth token present, hydrating user from API...');
            const userData = await fetchUserContext();
            if (userData?.id) {
              localStorage.setItem('leadflow_user', JSON.stringify(userData));
              setUser(userData);
              startSessionExpiryTimer();
              setCurrentPage('dashboard');
              setLoading(false);
              console.log('[Initialize] ✅ OAuth user hydrated from API:', userData.email);
              return;
            }
          } catch (e) {
            console.error('[Initialize] OAuth API fallback failed:', e);
            // Report to backend so ops can see repeated OAuth failures in diagnostics
            void reportAuthError('oauth_hydration_failed', (e as Error)?.message ?? String(e));
          }
        }

        // All OAuth recovery attempts failed — keep tokens intact, redirect to login
        // so the user can retry. Do NOT call forceLogout (that would clear the tokens).
        console.error('[Initialize] ❌ OAuth processing failed — redirecting to login for retry');
        setCurrentPage('login');
        setLoading(false);
        return;
      }

      // Never interfere with standalone public pages
      const initPageFromUrl = getPageFromPath();
      const initPublicPages: (Page | null)[] = ['accept-invite', 'agent-call', 'login', 'signup', 'forgot-password', 'reset-password'];
      if (initPublicPages.includes(initPageFromUrl)) {
        setLoading(false);
        return;
      }

      const resetHandled = checkPasswordResetCallback();

      if (!resetHandled) {
        await checkAuth();
      }

      await loadWebhookSettings();
    };

    void initialize();
  }, [checkAuth, loadWebhookSettings, checkPasswordResetCallback]);

  const handleLoginSuccess = async () => {
    try {
      startSessionExpiryTimer();
      await new Promise(resolve => setTimeout(resolve, 100));

      const token = localStorage.getItem('leadflow_access_token');
      console.log('Login success - Token present:', !!token);

      if (!token) {
        throw new Error('Token não encontrado após login.');
      }

      try {
        const userData = await fetchUserContext();
        setUser(userData);
        // Salva no localStorage para WhatsAppConnection e outros componentes
        if (userData && userData.id) {
          localStorage.setItem('leadflow_user', JSON.stringify(userData));
        }
      } catch (profileError) {
        console.error('Error fetching profile after login:', profileError);

        const mockSession = await mockAuth.getSession();
        const session = mockSession?.data?.session;

        if (session?.user) {
          console.log('[Auth] Using mock session fallback after login');
          setUser({
            id: session.user.id,
            email: session.user.email,
            name: session.user.name,
            plan: 'free',
            subscription_plan: 'free',
            isTrial: false,
            limits: {
              leads: 100,
              messages: 100,
              massMessages: 200,
            },
            usage: {
              leads: 0,
              messages: 0,
              massMessages: 0,
            },
          });
        } else {
          throw profileError;
        }
      }

      setCurrentPage('dashboard');
      setLoading(false);
    } catch (error) {
      console.error('Login success handler error:', error);
      await forceLogout('Login post-processing failed');
    }
  };

  const handleLogout = () => {
    forceLogout('Manual logout');
  };

  const handleProfileUpdate = (updatedUser: any) => {
    console.log('[Profile Update] Updating user with avatar:', updatedUser.avatar_url ? 'exists' : 'missing');
    setUser(updatedUser);
  };

  const refreshUserData = async () => {
    try {
      console.log('[Refresh] Fetching user profile with updated limits...');

      // Fetch the updated profile (now includes plan-based limits)
      const profile = await apiRequest('/user/profile', 'GET');
      console.log('[Refresh] Profile fetched:', profile);
      console.log('[Refresh] Plan:', profile.plan);
      console.log('[Refresh] Limits:', profile.limits);
      console.log('[Refresh] Usage:', profile.usage);

      setUser((prevUser: any) => ({
        ...prevUser,
        ...profile,
      }));

      return profile;
    } catch (error) {
      console.error('[Refresh] Error fetching profile:', error);
      throw error;
    }
  };

  // Standalone pages — render without waiting for auth
  if (currentPage === 'agent-call') {
    return <AgentCallPage />;
  }
  if (currentPage === 'accept-invite') {
    return <AcceptInvitePage onSuccess={() => { window.history.replaceState({}, '', '/'); window.location.reload(); }} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#00C48C] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Carregando...</p>
          <p className="text-xs text-gray-500 mt-2">Versão {appVersion} - LeadFlow CRM</p>
        </div>
      </div>
    );
  }

  return (
    <ConfirmProvider>
      <MetaPixel pixelId={metaPixelId} />
      <GoogleAnalytics gaId={googleAnalyticsId} />
      <Toaster />
      {/* Landing Page */}
      {landingEnabled && currentPage === 'landing' && (
        <div className="min-h-screen bg-[#0f0a1a]">
          <Header
            onLogin={() => setCurrentPage('login')}
            onSignup={() => setCurrentPage('signup')}
          />
          <main>
            <HeroSection onGetStarted={() => setCurrentPage('signup')} />
            <Features />
            <Analytics />
            <Pricing onSelectPlan={() => setCurrentPage('signup')} />
            <CTASection onGetStarted={() => setCurrentPage('signup')} />
          </main>
          <Footer />
        </div>
      )}

      {/* Shared auth video background — rendered once, persists across login/signup/forgot-password */}
      {(['login', 'signup', 'forgot-password'] as Page[]).includes(currentPage) && (
        <HlsVideoBackground overlay="rgba(0,0,0,0.12)" />
      )}

      {/* Login Page */}
      {currentPage === 'login' && (
        <LoginPage
          onSuccess={handleLoginSuccess}
          onSwitchToSignup={() => setCurrentPage('signup')}
          onSetup={() => setCurrentPage('setup')}
          onForgotPassword={() => setCurrentPage('forgot-password')}
          onBackToHome={() => setCurrentPage(homePage)}
        />
      )}

      {/* Signup Page */}
      {currentPage === 'signup' && (
        <SignupPage
          onSuccess={handleLoginSuccess}
          onSwitchToLogin={() => setCurrentPage('login')}
          onBackToHome={() => setCurrentPage(homePage)}
        />
      )}

      {/* Reset Password Page */}
      {currentPage === 'reset-password' && (
        <ResetPasswordPage
          onSuccess={handleLoginSuccess}
          onBackToLogin={() => setCurrentPage('login')}
        />
      )}

      {/* Forgot Password Page */}
      {currentPage === 'forgot-password' && (
        <ForgotPasswordPage
          onBackToLogin={() => setCurrentPage('login')}
        />
      )}

      {/* Settings Page */}
      {currentPage === 'settings' && (
        <SettingsPage
          user={user}
          onBack={() => setCurrentPage('dashboard')}
          onLogout={handleLogout}
          onProfileUpdate={handleProfileUpdate}
          onUpgrade={() => setShowUpgradeModal(true)}
        />
      )}

      {/* Admin Page */}
      {currentPage === 'admin' && (
        <AdminPage
          onBack={() => setCurrentPage('dashboard')}
          adminEmail={user?.email}
        />
      )}

      {/* Dashboard Page */}
      {currentPage === 'dashboard' && (
        <Dashboard
          user={user}
          onLogout={handleLogout}
          onSettings={() => setCurrentPage('settings')}
          onAdmin={() => setCurrentPage('admin')}
          onUserUpdate={setUser}
          onRefreshUser={refreshUserData}
          enforcementBlock={planEnforcementBlock}
          onEnforcementBlockCleared={() => setPlanEnforcementBlock(null)}
        />
      )}

      {/* Setup Test User Page */}
      {currentPage === 'setup' && (
        <SetupTestUser
          onBack={() => setCurrentPage('login')}
          onSuccess={handleLoginSuccess}
        />
      )}

      {/* Agent Call Popup Page */}
      {(currentPage as string) === 'agent-call' && (
        <AgentCallPage />
      )}

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <UpgradeModal
          isOpen={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          currentPlan={user?.plan || 'free'}
          onUpgradeSuccess={(updatedUser) => {
            setUser(updatedUser);
            setShowUpgradeModal(false);
          }}
        />
      )}

      {/* Plan Upgrade Success Modal */}
      <PlanUpgradeSuccessModal
        isOpen={upgradeSuccessModal.open}
        plan={upgradeSuccessModal.plan}
        onClose={() => {
          setUpgradeSuccessModal({ open: false, plan: '' });
          // Refresh user data so dashboard cards reflect new plan limits immediately
          refreshUserData().catch(() => {});
        }}
      />



      {/* Version Notification Modal */}
      {versionNotification && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a1a1a] rounded-2xl shadow-2xl p-8 max-w-md w-full border border-[#2a2a2a] text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#00C48C]/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-[#00C48C]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            </div>
            <h3 className="text-white text-2xl font-semibold mb-2">Nova Versão Disponível!</h3>
            <p className="text-[#00C48C] text-lg font-medium mb-4">Versão {versionNotification.version}</p>
            {versionNotification.releaseNotes && (
              <p className="text-gray-400 text-sm mb-6 whitespace-pre-line">{versionNotification.releaseNotes}</p>
            )}
            <button
              onClick={dismissVersionNotification}
              className="w-full py-3 bg-[#00C48C] hover:bg-[#00a576] text-white font-medium rounded-xl transition-colors"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

    </ConfirmProvider>
  );
}
