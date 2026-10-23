// /api/oauth/meta — ligar Facebook Messenger e Instagram com o login oficial da Meta.
//   POST /start               (sessão)  → { url } do diálogo do Facebook
//   GET  /callback            (público) ← o Facebook volta aqui com ?code&state
//   GET  /sessions/:id        (sessão)  → páginas e contas do Instagram para escolher (sem tokens)
//   POST /sessions/:id/connect (sessão) → cria/atualiza os canais escolhidos
import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.middleware';
import { ChannelsService } from '../services/channels.service';
import { validateChannelCredentials } from '../services/channel-validation.service';
import {
  buildAuthorizeUrl, createState, deleteSession, exchangeCodeForUserToken, isMetaOAuthConfigured,
  listPages, loadSession, readState, returnUrl, saveSession, subscribePage, type MetaPage, type OAuthPlatform,
} from '../services/meta-oauth.service';

const router = Router();
const channelsService = new ChannelsService();

// Campos de subscribed_apps de uma Página (os eventos do Instagram chegam pelo objeto 'instagram'
// dos webhooks da app; a página só tem de estar subscrita com 'messages')
const MESSENGER_FIELDS = ['messages', 'messaging_postbacks', 'messaging_optins', 'message_deliveries', 'message_reads'];
const INSTAGRAM_FIELDS = ['messages', 'messaging_postbacks'];

router.post('/start', requireAuth, (req: AuthenticatedRequest, res) => {
  if (!isMetaOAuthConfigured()) {
    return res.status(503).json({ code: 'meta_not_configured', error: 'A ligação automática com a Meta ainda não está configurada.' });
  }
  const platform: OAuthPlatform = req.body?.platform === 'app' ? 'app' : 'web';
  res.json({ url: buildAuthorizeUrl(createState(req.user!.id, platform)) });
});

router.get('/callback', async (req, res) => {
  const state = readState(String(req.query.state || ''));
  // Sem state válido não se sabe de quem é: volta ao painel web com erro
  if (!state) return res.redirect(returnUrl('web', { meta_error: 'invalid_state' }));

  if (req.query.error || !req.query.code) {
    // Cancelado no Facebook ("Agora não") ou permissões recusadas
    const reason = String(req.query.error_reason || req.query.error || 'cancelled');
    return res.redirect(returnUrl(state.platform, { meta_error: reason === 'user_denied' ? 'cancelled' : reason }));
  }

  try {
    const userToken = await exchangeCodeForUserToken(String(req.query.code));
    const pages = await listPages(userToken);
    if (pages.length === 0) return res.redirect(returnUrl(state.platform, { meta_error: 'no_pages' }));
    const sessionId = await saveSession(state.userId, userToken, pages);
    return res.redirect(returnUrl(state.platform, { meta_session: sessionId }));
  } catch (err: any) {
    console.error('[MetaOAuth] Erro no retorno do Facebook:', err?.message);
    return res.redirect(returnUrl(state.platform, { meta_error: 'exchange_failed' }));
  }
});

/** Canais já ligados deste utilizador (para marcar "já ligado" na lista) */
async function connectedIds(userId: string) {
  const channels = await channelsService.findAll(userId);
  const pages = new Set<string>();
  const instagram = new Set<string>();
  for (const ch of channels as any[]) {
    if (ch.status === 'deleted') continue;
    if (ch.type === 'facebook' && ch.credentials?.page_id) pages.add(String(ch.credentials.page_id));
    if (ch.type === 'instagram' && ch.credentials?.instagram_id) instagram.add(String(ch.credentials.instagram_id));
  }
  return { pages, instagram };
}

router.get('/sessions/:id', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const session = await loadSession(req.params.id, req.user!.id);
    if (!session) return res.status(404).json({ error: 'A autorização expirou. Toque em "Ligar" de novo.' });
    const connected = await connectedIds(req.user!.id);
    res.json({
      pages: session.pages.map((p: MetaPage) => ({
        id: p.id,
        name: p.name,
        picture: p.picture || null,
        connected: connected.pages.has(p.id),
        instagram: p.instagram
          ? { id: p.instagram.id, username: p.instagram.username || null, picture: p.instagram.picture || null, connected: connected.instagram.has(p.instagram.id) }
          : null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/sessions/:id/connect', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const session = await loadSession(req.params.id, userId);
    if (!session) return res.status(404).json({ error: 'A autorização expirou. Toque em "Ligar" de novo.' });

    const wantPages = new Set<string>((req.body?.pages || []).map(String));
    const wantInstagram = new Set<string>((req.body?.instagram || []).map(String));
    if (!wantPages.size && !wantInstagram.size) return res.status(400).json({ error: 'Escolha pelo menos uma página ou conta.' });

    const connected: any[] = [];
    const failed: any[] = [];

    for (const page of session.pages) {
      // Messenger da página
      if (wantPages.has(page.id)) {
        const credentials = {
          page_id: page.id,
          page_name: page.name,
          page_picture: page.picture,
          page_access_token: page.access_token,
          connected_via: 'meta_oauth',
        };
        const check = await validateChannelCredentials('facebook', credentials);
        const sub = check.ok ? await subscribePage(page.id, page.access_token, MESSENGER_FIELDS) : null;
        if (!check.ok || !sub?.ok) {
          failed.push({ id: page.id, name: page.name, error: check.error || sub?.error || 'A Meta não ativou as mensagens desta página.' });
        } else {
          const existing = await channelsService.findByCredentialField('page_id', page.id, userId);
          const channel = existing && existing.type === 'facebook'
            ? await channelsService.update(existing.id, { status: 'active', name: page.name, credentials: { ...existing.credentials, ...credentials } }, userId)
            : await channelsService.create({ type: 'facebook', name: page.name, status: 'active', credentials, settings: {} }, userId);
          connected.push({ id: channel?.id, type: 'facebook', name: page.name });
        }
      }

      // Instagram ligado à página
      const ig = page.instagram;
      if (ig && wantInstagram.has(ig.id)) {
        const credentials = {
          instagram_id: ig.id,
          username: ig.username,
          profile_picture_url: ig.picture,
          page_id: page.id,
          page_name: page.name,
          page_access_token: page.access_token,
          access_token: page.access_token,
          token_type: 'facebook',
          connected_via: 'meta_oauth',
        };
        const name = ig.username ? `@${ig.username}` : page.name;
        const check = await validateChannelCredentials('instagram', credentials);
        const sub = check.ok ? await subscribePage(page.id, page.access_token, INSTAGRAM_FIELDS) : null;
        if (!check.ok || !sub?.ok) {
          failed.push({ id: ig.id, name, error: check.error || sub?.error || 'A Meta não ativou as mensagens desta conta do Instagram.' });
        } else {
          const existing = await channelsService.findByCredentialField('instagram_id', ig.id, userId);
          const channel = existing && existing.type === 'instagram'
            ? await channelsService.update(existing.id, { status: 'active', name, credentials: { ...existing.credentials, ...credentials } }, userId)
            : await channelsService.create({ type: 'instagram', name, status: 'active', credentials, settings: {} }, userId);
          connected.push({ id: channel?.id, type: 'instagram', name });
        }
      }
    }

    if (connected.length) await deleteSession(req.params.id);
    res.status(connected.length ? 200 : 400).json({
      connected,
      failed,
      ...(connected.length ? {} : { error: failed[0]?.error || 'Não foi possível ligar.' }),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
