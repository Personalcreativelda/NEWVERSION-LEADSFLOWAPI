// /api/oauth/whatsapp — WhatsApp Business oficial (Cloud API) pelo Embedded Signup da Meta.
//   POST /start     (sessão)  → { url } do diálogo do Facebook (volta ao /api/oauth/meta/callback)
//   GET  /connect   (público) → página com o SDK da Meta (só com META_WA_SIGNUP_PAGE=true)
//   POST /complete  (público, state assinado) → liga a WABA/número e cria o canal (página do SDK)
import { Router } from 'express';
import crypto from 'crypto';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.middleware';
import { ChannelsService } from '../services/channels.service';
import { validateChannelCredentials } from '../services/channel-validation.service';
import { apiBaseUrl, createState, GRAPH_VERSION, metaRedirectUri, readState, returnUrl, type OAuthPlatform } from '../services/meta-oauth.service';
import { buildSignupDialogUrl, completeSignup, isWhatsAppSignupConfigured, signupPageHtml, waConfigId, type SignupResult } from '../services/whatsapp-signup.service';

const router = Router();
const channelsService = new ChannelsService();

/** Página intermédia com o SDK (antiga): só se o diálogo direto der problemas */
const useSignupPage = () => process.env.META_WA_SIGNUP_PAGE === 'true';

/** Números do WhatsApp oficial já ligados a este utilizador */
async function linkedPhoneIds(userId: string): Promise<Set<string>> {
  const channels = await channelsService.findAll(userId);
  return new Set((channels as any[])
    .filter((ch) => ch.type === 'whatsapp_cloud' && ch.status !== 'deleted' && ch.credentials?.phone_number_id)
    .map((ch) => String(ch.credentials.phone_number_id)));
}

/** Cria (ou atualiza) o canal depois de a Meta confirmar o número. Devolve o nome do canal. */
async function saveSignupChannel(userId: string, result: SignupResult): Promise<string> {
  const credentials = { ...result, connected_via: 'meta_embedded_signup' };

  // Só fica ligado depois de a Meta confirmar o número com o token novo
  const check = await validateChannelCredentials('whatsapp_cloud', credentials);
  if (!check.ok) throw new Error(check.error);

  const name = result.verified_name || result.display_phone_number || 'WhatsApp Business';
  const existing = await channelsService.findByCredentialField('phone_number_id', result.phone_number_id, userId);
  if (existing && existing.type === 'whatsapp_cloud') {
    await channelsService.update(existing.id, { status: 'active', name, credentials: { ...existing.credentials, ...credentials } }, userId);
  } else {
    await channelsService.create({ type: 'whatsapp_cloud', name, status: 'active', credentials, settings: {} }, userId);
  }
  return name;
}

/**
 * Regresso do diálogo direto (chamado pelo /api/oauth/meta/callback quando o state é do
 * WhatsApp). Devolve o URL para onde o browser volta (app ou painel).
 */
export async function finishWhatsAppSignup(state: { userId: string; platform: OAuthPlatform }, query: Record<string, any>): Promise<string> {
  if (query.error || !query.code) {
    const reason = String(query.error_reason || query.error || 'cancelled');
    return returnUrl(state.platform, { meta_error: reason === 'user_denied' ? 'cancelled' : reason });
  }
  try {
    const result = await completeSignup({
      code: String(query.code),
      redirect_uri: metaRedirectUri(),
      linkedPhoneIds: await linkedPhoneIds(state.userId),
    });
    const name = await saveSignupChannel(state.userId, result);
    return returnUrl(state.platform, { wa_connected: name });
  } catch (err: any) {
    console.error('[WhatsAppSignup] Erro no regresso do Facebook:', err?.message);
    return returnUrl(state.platform, { wa_error: err?.message || 'Não foi possível ligar o WhatsApp. Tente de novo.' });
  }
}

router.post('/start', requireAuth, (req: AuthenticatedRequest, res) => {
  if (!isWhatsAppSignupConfigured()) {
    return res.status(503).json({ code: 'wa_not_configured', error: 'A ligação automática do WhatsApp oficial ainda não está configurada.' });
  }
  const platform: OAuthPlatform = req.body?.platform === 'app' ? 'app' : 'web';
  if (useSignupPage()) {
    const state = createState(req.user!.id, platform);
    return res.json({ url: `${apiBaseUrl()}/api/oauth/whatsapp/connect?state=${encodeURIComponent(state)}` });
  }
  res.json({ url: buildSignupDialogUrl(createState(req.user!.id, platform, 'whatsapp')) });
});

router.get('/connect', (req, res) => {
  const state = String(req.query.state || '');
  const valid = readState(state);
  res.setHeader('Cache-Control', 'no-store');
  if (!valid || !isWhatsAppSignupConfigured()) {
    res.status(400).type('html').send('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>LeadsFlow</title><p style="font:16px system-ui;padding:24px">O pedido expirou. Volte ao LeadsFlow e toque em "Ligar" de novo.</p>');
    return;
  }
  const nonce = crypto.randomBytes(16).toString('base64');
  // O SDK da Meta abre uma janela e fala com esta página: permitir os domínios da Meta e as janelas
  res.setHeader('Content-Security-Policy', [
    "default-src 'none'",
    `script-src 'nonce-${nonce}' https://connect.facebook.net https://*.facebook.com https://*.facebook.net`,
    "connect-src 'self' https://*.facebook.com https://*.facebook.net",
    'frame-src https://*.facebook.com https://*.facebook.net',
    "img-src 'self' data: https:",
    "style-src 'unsafe-inline'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; '));
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.type('html').send(signupPageHtml({
    state,
    nonce,
    appId: process.env.META_APP_ID || '',
    configId: waConfigId(),
    version: GRAPH_VERSION,
  }));
});

router.post('/complete', async (req, res) => {
  const state = readState(String(req.body?.state || ''));
  if (!state) return res.status(400).json({ error: 'O pedido expirou. Volte ao LeadsFlow e toque em "Ligar" de novo.' });
  const { code, waba_id: wabaId, phone_number_id: phoneId } = req.body || {};
  if (!code || !wabaId) return res.status(400).json({ error: 'A Meta não devolveu a conta do WhatsApp. Tente de novo.' });

  try {
    const result = await completeSignup({ code: String(code), waba_id: String(wabaId), phone_number_id: phoneId ? String(phoneId) : undefined });
    const name = await saveSignupChannel(state.userId, result);
    res.json({ ok: true, redirect: returnUrl(state.platform, { wa_connected: name }) });
  } catch (err: any) {
    console.error('[WhatsAppSignup] Erro ao concluir:', err?.message);
    res.status(400).json({ error: err?.message || 'Não foi possível ligar o WhatsApp. Tente de novo.' });
  }
});

export default router;
