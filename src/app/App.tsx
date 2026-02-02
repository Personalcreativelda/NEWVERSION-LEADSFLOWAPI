import { useState, useEffect, useRef, useCallback } from 'react';
import Header from './components/Header';
import HeroSection from './components/HeroSection';
import Features from './components/Features';
import Analytics from './components/Analytics';
import Pricing from './components/Pricing';
import Testimonials from './components/Testimonials';
import FAQ from './components/FAQ';
import CTASection from './components/CTASection';
import Footer from './components/Footer';
import Dashboard from './components/Dashboard';
import LoginPage from './components/auth/LoginPage';
import SignupPage from './components/auth/SignupPage';
import ResetPasswordPage from './components/auth/ResetPasswordPage';
import ForgotPasswordPage from './components/auth/ForgotPasswordPage';
import SettingsPage from './components/settings/SettingsPage';
import AdminPage from './components/settings/AdminPage';
import SetupTestUser from './components/SetupTestUser';
import UpgradeModal from './components/modals/UpgradeModal';
import { MetaPixel } from './components/MetaPixel';
import { authApi, apiRequest, isSessionExpired, startSessionExpiryTimer } from './utils/api';
import { mockAuth } from './utils/auth-mock';
import { Toaster } from './components/ui/sonner';
import { getSupabaseClient } from './utils/supabase/client';

declare global {
  interface Window {
    chatwootSDK?: {
      run: (options: { websiteToken: string; baseUrl: string }) => void;
    };
  }
}

// LeadsFlow SAAS - Main App Component
type Page = 'landing' | 'login' | 'signup' | 'dashboard' | 'settings' | 'admin' | 'setup' | 'reset-password' | 'forgot-password';

interface AppProps {
  initialPage?: Page;
  landingEnabled?: boolean;
}

// Helper functions for URL routing (clean URLs without hash)
const getPageFromPath = (): Page | null => {
  const pathname = window.location.pathname;
  const cleanPath = pathname.split('?')[0].split('#')[0]; // Remove query params and hash

  const pageMap: Record<string, Page> = {
    '/login': 'login',
    '/signup': 'signup',
    '/forgot-password': 'forgot-password',
    '/reset-password': 'reset-password',
    '/settings': 'settings',
    '/admin': 'admin',
    '/setup': 'setup',
  };

  return pageMap[cleanPath] || null;
};

const setPagePath = (page: Page) => {
  // Don't set path for dashboard or landing
  if (page === 'dashboard' || page === 'landing') {
    if (window.location.pathname !== '/' && window.location.pathname !== '') {
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
  const [appVersion, setAppVersion] = useState<string>('...');
  const [versionNotification, setVersionNotification] = useState<{ id: number; version: string; releaseNotes: string } | null>(null);
  const envMetaPixelId = import.meta.env.VITE_META_PIXEL_ID as string | undefined;
  const [metaPixelId] = useState<string>(envMetaPixelId ? envMetaPixelId.trim() : '');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const isLoggingOutRef = useRef(false);

  // Sync currentPage with URL path
  useEffect(() => {
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

    void enforceExpiry();

    return () => clearInterval(intervalId);
  }, [user, forceLogout]);

  useEffect(() => {
    // Add listener for upgrade modal events
    const handleOpenUpgradeModal = () => {
      console.log('[App] 🔔 Received open-upgrade-modal event');
      setShowUpgradeModal(true);
    };

    window.addEventListener('open-upgrade-modal', handleOpenUpgradeModal);

    return () => {
      window.removeEventListener('open-upgrade-modal', handleOpenUpgradeModal);
    };
  }, []);

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

  // Check for version notification when user logs in
  useEffect(() => {
    const checkVersionNotification = async () => {
      if (!user) return;
      
      try {
        const response = await apiRequest('/version/check-notification', 'GET');
        if (response.hasNewVersion && response.version) {
          setVersionNotification({
            id: response.version.id,
            version: response.version.version,
            releaseNotes: response.version.release_notes || ''
          });
        }
      } catch (error) {
        console.error('[App] Error checking version notification:', error);
      }
    };
    checkVersionNotification();
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

  // OAuth Callback Handler
  useEffect(() => {
    const handleOAuthCallback = async () => {
      try {
        const supabase = getSupabaseClient();

        // Check if we have an OAuth callback in the URL
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const queryParams = new URLSearchParams(window.location.search);

        // Check for access_token in hash (OAuth callback) or code in query (OAuth flow)
        const hasOAuthCallback = hashParams.get('access_token') || queryParams.get('code');

        if (!hasOAuthCallback) {
          return;
        }

        console.log('[OAuth] Detected OAuth callback, processing...');
        setLoading(true);

        // Get session from Supabase
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError || !session) {
          console.error('[OAuth] No session found after OAuth callback:', sessionError);
          setLoading(false);
          return;
        }

        console.log('[OAuth] Supabase session obtained:', {
          email: session.user.email,
          provider: session.user.app_metadata.provider,
        });

        // Extract user info
        const email = session.user.email;
        const name = session.user.user_metadata.full_name || session.user.user_metadata.name;
        const avatar_url = session.user.user_metadata.avatar_url || session.user.user_metadata.picture;
        const provider = session.user.app_metadata.provider || 'google';

        if (!email) {
          console.error('[OAuth] No email in OAuth user data');
          setLoading(false);
          return;
        }

        // Send to backend to create/get user in PostgreSQL
        console.log('[OAuth] Syncing with backend...');
        const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/api/auth/oauth/callback`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
            name,
            avatar_url,
            provider,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to process OAuth login');
        }

        const data = await response.json();
        console.log('[OAuth] Backend response:', data);

        // Store tokens from backend
        if (data.session?.access_token) {
          localStorage.setItem('leadflow_access_token', data.session.access_token);
          if (data.session.refresh_token) {
            localStorage.setItem('leadflow_refresh_token', data.session.refresh_token);
          }
          startSessionExpiryTimer();
        }

        // Store user
        if (data.user) {
          if (data.user.id) {
            localStorage.setItem('leadflow_user', JSON.stringify(data.user));
            setUser(data.user);
          } else {
            // Se não houver id, limpa localStorage e força logout
            localStorage.removeItem('leadflow_user');
            localStorage.removeItem('leadflow_access_token');
            localStorage.removeItem('leadflow_refresh_token');
            setUser(null);
            setLoading(false);
            alert('Erro ao obter ID do usuário. Faça login novamente.');
            setCurrentPage('login');
            return;
          }
        }

        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);

        // Redirect to dashboard
        setCurrentPage('dashboard');
        setLoading(false);

        console.log('[OAuth] ✅ OAuth login completed successfully!');
      } catch (error) {
        console.error('[OAuth] Error processing OAuth callback:', error);
        setLoading(false);
      }
    };

    handleOAuthCallback();
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
      };

      if (!userData.plan) {
        userData.plan = 'free';
      }
      if (!userData.subscription_plan) {
        userData.subscription_plan = userData.plan;
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
    try {
      console.log('[checkAuth] Starting authentication check...');

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
          setCurrentPage('dashboard');
          return;
        } catch (backendError) {
          console.error('[Auth] Failed to hydrate user from backend:', backendError);
          // If backend fails, logout to force re-login
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

      console.log('[checkAuth] No authentication found, redirecting to home');
      setCurrentPage(homePage);
    } catch (error) {
      console.error('[checkAuth] Unexpected error:', error);
      setCurrentPage(homePage);
    } finally {
      console.log('[checkAuth] Setting loading to false');
      setLoading(false);
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
    <>
      <MetaPixel pixelId={metaPixelId} />
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
            <Testimonials />
            <FAQ />
            <CTASection onGetStarted={() => setCurrentPage('signup')} />
          </main>
          <Footer />
        </div>
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
        <AdminPage />
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
        />
      )}

      {/* Setup Test User Page */}
      {currentPage === 'setup' && (
        <SetupTestUser
          onBack={() => setCurrentPage('login')}
          onSuccess={handleLoginSuccess}
        />
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

    </>
  );
}
