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
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.middleware';

const router = Router();

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
