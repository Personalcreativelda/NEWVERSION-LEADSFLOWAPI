// /api/oauth/instagram — ligar o Instagram com o login do próprio Instagram (sem página do Facebook).
//   POST /start    (sessão)  → { url } do login do Instagram
//   GET  /callback (público) ← o Instagram volta aqui com ?code&state
// A escolha e a ligação da conta usam as mesmas rotas de /api/oauth/meta/sessions.
import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.middleware';
import { createState, readState, returnUrl, saveSession, type OAuthPlatform } from '../services/meta-oauth.service';
import { buildInstagramAuthorizeUrl, exchangeInstagramCode, isInstagramLoginConfigured } from '../services/instagram-oauth.service';

const router = Router();

router.post('/start', requireAuth, (req: AuthenticatedRequest, res) => {
  if (!isInstagramLoginConfigured()) {
    return res.status(503).json({ code: 'ig_not_configured', error: 'A ligação direta com o Instagram ainda não está configurada.' });
  }
  const platform: OAuthPlatform = req.body?.platform === 'app' ? 'app' : 'web';
  res.json({ url: buildInstagramAuthorizeUrl(createState(req.user!.id, platform)) });
});

router.get('/callback', async (req, res) => {
  const state = readState(String(req.query.state || ''));
  if (!state) return res.redirect(returnUrl('web', { meta_error: 'invalid_state' }));

  if (req.query.error || !req.query.code) {
    const reason = String(req.query.error_reason || req.query.error || 'cancelled');
    return res.redirect(returnUrl(state.platform, { meta_error: reason === 'user_denied' ? 'cancelled' : reason }));
  }

  try {
    const account = await exchangeInstagramCode(String(req.query.code));
    const sessionId = await saveSession(state.userId, '', [], [account]);
    return res.redirect(returnUrl(state.platform, { meta_session: sessionId }));
  } catch (err: any) {
    console.error('[InstagramOAuth] Erro no retorno do Instagram:', err?.message);
    return res.redirect(returnUrl(state.platform, { meta_error: 'exchange_failed' }));
  }
});

export default router;
