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
  verify2FALogin,
} from '../services/auth.service';
import { googleOAuthService } from '../services/google-oauth.service';
import { activityService } from '../services/activity.service';
import { notificationsService } from '../services/notifications.service';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.middleware';
import { AIAssistantsService } from '../services/ai-assistants.service';
import { DEFAULT_ONBOARDING_TEMPLATE } from './ai-assistants.routes';
import { query as dbQuery } from '../database/connection';

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
    
    // 📝 Log activity
    void activityService.logActivity({
      userId: authResult.user.id,
      type: 'login',
      description: `Login via Google: ${userData.email}`,
      metadata: { provider: 'google', ip: req.ip }
    });

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

    // 📝 Log activity
    void activityService.logActivity({
      userId: authResult.user.id,
      type: 'login',
      description: `Login via Google (Token): ${userData.email}`,
      metadata: { provider: 'google', source: 'token_endpoint', ip: req.ip }
    });

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

    // If 2FA is required, return temp token without logging activity
    if ('requires_2fa' in data && data.requires_2fa) {
      return res.json(data);
    }
    
    // 📝 Log activity
    void activityService.logActivity({
      userId: (data as any).user.id,
      type: 'login',
      description: `Login via Email: ${email}`,
      metadata: { ip: req.ip }
    });

    return res.json(data);
  } catch (error) {
    return next(error);
  }
});

router.post('/login/2fa', async (req, res, next) => {
  try {
    const { temp_token, code } = req.body;
    if (!temp_token || !code) {
      return res.status(400).json({ error: 'Token e código são obrigatórios' });
    }
    const data = await verify2FALogin(temp_token, code);
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
    
    // 📝 Log activity
    void activityService.logActivity({
      userId: data.user.id,
      type: 'login',
      description: `Login via OAuth: ${email}`,
      metadata: { provider, ip: req.ip }
    });

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
    
    // 🤖 Auto-create onboarding assistant for new user
    void (async () => {
      try {
        const aiService = new AIAssistantsService();
        await aiService.create({
          name: DEFAULT_ONBOARDING_TEMPLATE.name,
          mode: DEFAULT_ONBOARDING_TEMPLATE.mode,
          channel_id: null,
          llm_provider: DEFAULT_ONBOARDING_TEMPLATE.llm_provider,
          llm_model: DEFAULT_ONBOARDING_TEMPLATE.llm_model,
          llm_system_prompt: DEFAULT_ONBOARDING_TEMPLATE.llm_system_prompt,
          settings: { ...DEFAULT_ONBOARDING_TEMPLATE.settings }
        }, data.user.id);
      } catch (err) {
        console.error('[Register] Error creating onboarding assistant:', err);
      }
    })();

    // 📝 Log activity
    void activityService.logActivity({
      userId: data.user.id,
      type: 'registration',
      description: `Novo cadastro: ${email}`,
      metadata: { ip: req.ip, ...metadata }
    });

    // 🔔 Notify admins of new user registration
    void notificationsService.sendAdminNotification(
      'newUserNotifications',
      'admin_new_user',
      'Novo Usuário Cadastrado',
      `${data.user.name || email} acabou de criar uma conta.`,
      'user-plus',
      { userId: data.user.id, email, name: data.user.name }
    );

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

// ─── WORKSPACE INVITE ACCEPTANCE ──────────────────────────────────────────────

// GET /auth/invite/:token  — public: returns invite details so frontend can show context
router.get('/invite/:token', async (req, res, next) => {
  try {
    const { token } = req.params;
    const result = await dbQuery(
      `SELECT wi.email, wi.role, wi.status, wi.expires_at,
              w.name AS workspace_name,
              u.name AS invited_by_name
       FROM workspace_invites wi
       JOIN workspaces w  ON w.id  = wi.workspace_id
       LEFT JOIN users u ON u.id  = wi.invited_by
       WHERE wi.token = $1`,
      [token]
    );
    const invite = result.rows[0];
    if (!invite) return res.status(404).json({ error: 'Convite não encontrado' });
    if (invite.status !== 'pending') {
      return res.status(410).json({ error: `Convite ${invite.status}` });
    }
    if (new Date(invite.expires_at) < new Date()) {
      await dbQuery(`UPDATE workspace_invites SET status = 'expired' WHERE token = $1`, [token]);
      return res.status(410).json({ error: 'Convite expirado' });
    }
    res.json({
      email:            invite.email,
      role:             invite.role,
      workspace_name:   invite.workspace_name,
      invited_by_name:  invite.invited_by_name,
    });
  } catch (error) {
    return next(error);
  }
});

// POST /auth/accept-invite  — accepts invite and returns session
// Body: { token, password?, name? }
// - If a user account already exists for that email → just log them in + link membership
// - If no account → create account then link membership
router.post('/accept-invite', async (req, res, next) => {
  try {
    const { token, password, name } = req.body || {};
    if (!token) return res.status(400).json({ error: 'token é obrigatório' });

    // Load invite
    const invResult = await dbQuery(
      `SELECT wi.*, w.id AS workspace_id, w.name AS workspace_name, w.owner_id
       FROM workspace_invites wi
       JOIN workspaces w ON w.id = wi.workspace_id
       WHERE wi.token = $1`,
      [token]
    );
    const invite = invResult.rows[0];
    if (!invite) return res.status(404).json({ error: 'Convite não encontrado' });
    if (invite.status !== 'pending') {
      return res.status(410).json({ error: `Convite ${invite.status}` });
    }
    if (new Date(invite.expires_at) < new Date()) {
      await dbQuery(`UPDATE workspace_invites SET status = 'expired' WHERE token = $1`, [token]);
      return res.status(410).json({ error: 'Convite expirado' });
    }

    // Check if user exists
    const existingUser = await dbQuery('SELECT id FROM users WHERE email = $1', [invite.email]);
    let userId: string;
    let session: any;

    if (existingUser.rows[0]) {
      // User already has an account — log them in if password provided, else just use their id
      userId = existingUser.rows[0].id;
      if (password) {
        try {
          const loginData = await loginWithEmail(invite.email, password) as any;
          session = loginData.session;
        } catch {
          return res.status(401).json({ error: 'Senha incorreta para a conta existente' });
        }
      } else {
        // No password — must already be authenticated or we issue a token-only response
        // For simplicity: require password when accepting via link
        return res.status(400).json({
          error: 'Conta existente. Forneça a senha para aceitar o convite.',
          email: invite.email,
          has_account: true,
        });
      }
    } else {
      // Create new account
      if (!password) return res.status(400).json({ error: 'password é obrigatório para criar conta' });
      const regData = await registerWithEmail(invite.email, password, { name: name || invite.email }) as any;
      userId = regData.user.id;
      session = regData.session;
    }

    // Link team_members row (upsert)
    // team_members has UNIQUE(owner_id, email) — use that constraint for ON CONFLICT
    await dbQuery(
      `INSERT INTO team_members
         (workspace_id, owner_id, user_id, email, name, role, status, is_active, invited_by, accepted_at, joined_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', true, $7, NOW(), NOW())
       ON CONFLICT (owner_id, email) DO UPDATE
         SET user_id     = EXCLUDED.user_id,
             workspace_id = EXCLUDED.workspace_id,
             status      = 'active',
             is_active   = true,
             joined_at   = COALESCE(team_members.joined_at, NOW()),
             accepted_at = COALESCE(team_members.accepted_at, NOW())`,
      [
        invite.workspace_id,
        invite.owner_id,
        userId,
        invite.email,
        name || invite.email,
        invite.role,
        invite.invited_by ?? null,
      ]
    );

    // Mark invite as accepted
    await dbQuery(
      `UPDATE workspace_invites
       SET status = 'accepted', accepted_at = NOW(), accepted_by = $1
       WHERE token = $2`,
      [userId, token]
    );

    res.json({
      success: true,
      session,
      workspace_name: invite.workspace_name,
      role: invite.role,
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
