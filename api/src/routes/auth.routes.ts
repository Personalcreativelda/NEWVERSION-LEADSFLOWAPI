import { Router } from 'express';
import {
  loginWithEmail,
  loginWithOAuth,
  registerWithEmail,
  logoutSession,
  refreshSession,
  requestPasswordReset,
  updatePassword,
  verifySignupOtp,
  resendSignupConfirmation,
  resetPasswordWithToken,
  setupDemoAccount,
  setupAdminAccount,
} from '../services/auth.service';
import { googleOAuthService } from '../services/google-oauth.service';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.middleware';

const router = Router();

// ============================================
// Google OAuth Routes (Direct, without Supabase)
// ============================================

// GET /auth/google - Initiate Google OAuth flow
router.get('/google', async (req, res, next) => {
  try {
    if (!googleOAuthService.isConfigured()) {
      return res.status(503).json({
        error: 'Google OAuth não está configurado. Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.'
      });
    }

    // Get frontend redirect URL if provided
    const frontendRedirectUrl = req.query.redirect as string | undefined;

    const { url, state } = googleOAuthService.getAuthorizationUrl(frontendRedirectUrl);

    console.log('[Auth Google] Redirecting to Google OAuth...');

    // Redirect to Google OAuth
    return res.redirect(url);
  } catch (error) {
    console.error('[Auth Google] Error initiating OAuth:', error);
    return next(error);
  }
});

// GET /auth/google/callback - Handle Google OAuth callback
router.get('/google/callback', async (req, res, next) => {
  try {
    const { code, state, error: oauthError } = req.query;

    // Handle OAuth errors from Google
    if (oauthError) {
      console.error('[Auth Google] OAuth error from Google:', oauthError);
      const appUrl = process.env.APP_URL || 'http://localhost:3000';
      return res.redirect(`${appUrl}/login?error=oauth_error&message=${encodeURIComponent(String(oauthError))}`);
    }

    if (!code || typeof code !== 'string') {
      console.error('[Auth Google] No authorization code received');
      const appUrl = process.env.APP_URL || 'http://localhost:3000';
      return res.redirect(`${appUrl}/login?error=no_code`);
    }

    // Validate state token for CSRF protection
    if (state && typeof state === 'string') {
      const stateValidation = googleOAuthService.validateState(state);
      if (!stateValidation.valid) {
        console.error('[Auth Google] Invalid state token');
        const appUrl = process.env.APP_URL || 'http://localhost:3000';
        return res.redirect(`${appUrl}/login?error=invalid_state`);
      }
    }

    console.log('[Auth Google] Processing OAuth callback with code...');

    // Complete OAuth flow - exchange code for user info
    const userData = await googleOAuthService.completeOAuthFlow(code);

    // Create or update user and get session
    const authResult = await loginWithOAuth(userData);

    console.log('[Auth Google] User authenticated:', userData.email);

    // Redirect to frontend with tokens in URL fragment (hash)
    // This is secure because URL fragments are not sent to server in HTTP requests
    // FRONTEND_URL is where the dashboard/app is hosted (e.g., app.leadsflowapi.com)
    const frontendUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3000';

    // Encode user data as base64 to avoid URL encoding issues with special characters
    const userBase64 = Buffer.from(JSON.stringify(authResult.user)).toString('base64');

    const tokenData = new URLSearchParams({
      access_token: authResult.session.access_token,
      refresh_token: authResult.session.refresh_token,
      user: userBase64,
    });

    const redirectUrl = `${frontendUrl}/#oauth_callback&${tokenData.toString()}`;

    console.log('[Auth Google] Redirecting to frontend:', frontendUrl);
    return res.redirect(redirectUrl);

  } catch (error: any) {
    console.error('[Auth Google] OAuth callback error:', error);
    const frontendUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3000';
    const errorMessage = encodeURIComponent(error.message || 'Erro ao autenticar com Google');
    return res.redirect(`${frontendUrl}/login?error=oauth_failed&message=${errorMessage}`);
  }
});

// POST /auth/google/token - Exchange code for tokens (alternative for SPA)
router.post('/google/token', async (req, res, next) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    // Complete OAuth flow
    const userData = await googleOAuthService.completeOAuthFlow(code);

    // Create or update user and get session
    const authResult = await loginWithOAuth(userData);

    console.log('[Auth Google] User authenticated via token endpoint:', userData.email);

    return res.json(authResult);
  } catch (error) {
    console.error('[Auth Google] Token exchange error:', error);
    return next(error);
  }
});

// GET /auth/google/url - Get OAuth URL without redirect (for popup/iframe flows)
router.get('/google/url', async (req, res, next) => {
  try {
    if (!googleOAuthService.isConfigured()) {
      return res.status(503).json({
        error: 'Google OAuth não está configurado. Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.'
      });
    }

    const frontendRedirectUrl = req.query.redirect as string | undefined;
    const { url, state } = googleOAuthService.getAuthorizationUrl(frontendRedirectUrl);

    return res.json({ url, state });
  } catch (error) {
    console.error('[Auth Google] Error generating OAuth URL:', error);
    return next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const data = await loginWithEmail(email, password);
    return res.json(data);
  } catch (error) {
    return next(error);
  }
});

router.post('/oauth/callback', async (req, res, next) => {
  try {
    const { email, name, avatar_url, provider } = req.body;

    if (!email || !provider) {
      return res.status(400).json({ error: 'Email and provider are required' });
    }

    console.log('[Auth OAuth] Processing OAuth callback:', { email, provider, name });

    const data = await loginWithOAuth({ email, name, avatar_url, provider });
    return res.json(data);
  } catch (error) {
    console.error('[Auth OAuth] Error processing OAuth callback:', error);
    return next(error);
  }
});

router.post('/setup-demo', async (_req, res, next) => {
  try {
    const data = await setupDemoAccount();
    return res.json(data);
  } catch (error) {
    return next(error);
  }
});

router.post('/setup-admin', async (_req, res, next) => {
  try {
    const data = await setupAdminAccount();
    return res.json(data);
  } catch (error) {
    return next(error);
  }
});

router.post('/register', async (req, res, next) => {
  try {
    const { email, password, metadata } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const data = await registerWithEmail(email, password, metadata);
    return res.json(data);
  } catch (error) {
    return next(error);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    const { refresh_token: refreshToken } = req.body || {};
    await logoutSession(refreshToken);
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const { refresh_token: refreshToken } = req.body || {};

    if (!refreshToken) {
      return res.status(400).json({ error: 'refresh_token is required' });
    }

    const data = await refreshSession(refreshToken);
    return res.json(data);
  } catch (error) {
    return next(error);
  }
});

router.post('/password/reset', async (req, res, next) => {
  try {
    const { email, redirect_to: redirectTo } = req.body || {};

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    await requestPasswordReset(email, redirectTo);
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

router.post('/password/complete', async (req, res, next) => {
  try {
    const { email, token, password } = req.body || {};

    if (!email || !token || !password) {
      return res.status(400).json({ error: 'Email, token and password are required' });
    }

    await resetPasswordWithToken(email, token, password);
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

router.post('/password/update', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { password } = req.body || {};
    if (!password) {
      return res.status(400).json({ error: 'New password is required' });
    }

    await updatePassword(user.id, password);
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

router.get('/me', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    return res.json({ user: req.user });
  } catch (error) {
    return next(error);
  }
});

router.post('/verify-email', async (req, res, next) => {
  try {
    const { email, token } = req.body || {};

    if (!email || !token) {
      return res.status(400).json({ error: 'Email and token are required' });
    }

    await verifySignupOtp(email, token);
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

router.post('/resend-confirmation', async (req, res, next) => {
  try {
    const { email } = req.body || {};

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    await resendSignupConfirmation(email);
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

export default router;
