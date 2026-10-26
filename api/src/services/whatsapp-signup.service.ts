// WhatsApp Business oficial (Cloud API) pelo Embedded Signup da Meta: o cliente entra
// com o Facebook, escolhe/cria a conta WhatsApp Business e o número, e o servidor:
//  1) troca o código pelo token de negócio, 2) subscreve a app na WABA (webhooks),
//  3) regista o número na Cloud API e 4) cria o canal whatsapp_cloud.
// Configuração: META_APP_ID, META_APP_SECRET e META_WA_CONFIG_ID (configuração do
// Facebook Login for Business do tipo "WhatsApp Embedded Signup"; exige Tech Provider).
import crypto from 'crypto';
import { GRAPH_VERSION } from './meta-oauth.service';

const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const TIMEOUT_MS = 15_000;

/**
 * ID da configuração "WhatsApp Embedded Signup" (Facebook Login for Business). Limpo de
 * espaços/aspas coladas no Coolify; um valor que não seja só dígitos conta como em falta —
 * a Meta respondia "config_id é obrigatório" numa janela que o cliente não percebe.
 */
export function waConfigId(): string {
  const raw = (process.env.META_WA_CONFIG_ID || '').trim().replace(/^["']+|["']+$/g, '').trim();
  if (raw && (!/^\d+$/.test(raw) || raw === (process.env.META_APP_ID || '').trim())) {
    console.error(`[WhatsApp Signup] META_WA_CONFIG_ID inválido ("${raw.slice(0, 40)}"): tem de ser o Configuration ID numérico da configuração "WhatsApp Embedded Signup" da app ${process.env.META_APP_ID || ''}.`);
    return '';
  }
  return raw;
}

export function isWhatsAppSignupConfigured(): boolean {
  return !!(process.env.META_APP_ID && process.env.META_APP_SECRET && waConfigId());
}

class MetaError extends Error {
  constructor(message: string, public code?: number, public subcode?: number) { super(message); }
}

async function graph(method: 'GET' | 'POST', path: string, token: string, body?: Record<string, any>): Promise<any> {
  const url = new URL(path.startsWith('http') ? path : GRAPH + path);
  if (method === 'GET') url.searchParams.set('access_token', token);
  const res = await fetch(url.toString(), {
    method,
    headers: method === 'POST' ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : undefined,
    body: method === 'POST' && body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    throw new MetaError(data?.error?.error_user_msg || data?.error?.message || `Meta respondeu ${res.status}`, data?.error?.code, data?.error?.error_subcode);
  }
  return data;
}

/** Código do Embedded Signup → token de negócio (no Embedded Signup não há redirect_uri) */
export async function exchangeSignupCode(code: string): Promise<string> {
  const url = new URL(`${GRAPH}/oauth/access_token`);
  url.searchParams.set('client_id', process.env.META_APP_ID || '');
  url.searchParams.set('client_secret', process.env.META_APP_SECRET || '');
  url.searchParams.set('code', code);
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(TIMEOUT_MS) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.access_token) throw new MetaError(data?.error?.message || 'A Meta não aceitou a autorização.');
  return data.access_token;
}

export interface SignupResult {
  phone_number_id: string;
  waba_id: string;
  access_token: string;
  display_phone_number?: string;
  verified_name?: string;
  pin: string;
}

/** Liga a conta WhatsApp Business ao LeadsFlow (webhooks + registo do número) */
export async function completeSignup(input: { code: string; waba_id: string; phone_number_id?: string }): Promise<SignupResult> {
  const token = await exchangeSignupCode(input.code);
  const waba = String(input.waba_id);

  // Só a WABA (o número ainda não estava escolhido): usar o primeiro número da conta
  let phoneId = input.phone_number_id ? String(input.phone_number_id) : '';
  if (!phoneId) {
    const list = await graph('GET', `/${encodeURIComponent(waba)}/phone_numbers`, token);
    phoneId = list?.data?.[0]?.id ? String(list.data[0].id) : '';
    if (!phoneId) throw new MetaError('A conta WhatsApp Business ainda não tem um número. Adicione um número e tente de novo.');
  }

  // Webhooks das mensagens desta WABA para a app da LeadsFlow
  await graph('POST', `/${encodeURIComponent(waba)}/subscribed_apps`, token);

  // Registar o número na Cloud API (PIN da verificação em dois passos)
  const pin = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  try {
    await graph('POST', `/${encodeURIComponent(phoneId)}/register`, token, { messaging_product: 'whatsapp', pin });
  } catch (err: any) {
    // Número já registado com outro PIN de verificação em dois passos
    if (err?.code === 133005 || /two.step|pin/i.test(err?.message || '')) {
      throw new MetaError('Este número tem um PIN de verificação em dois passos. Desative-o no WhatsApp Manager (ou indique o PIN) e tente de novo.');
    }
    // Já registado (ex.: ligar de novo): segue
    if (!(err?.code === 133015 || /already registered/i.test(err?.message || ''))) throw err;
  }

  const phone = await graph('GET', `/${encodeURIComponent(phoneId)}?fields=display_phone_number,verified_name`, token);
  return {
    phone_number_id: phoneId,
    waba_id: waba,
    access_token: token,
    display_phone_number: phone?.display_phone_number,
    verified_name: phone?.verified_name,
    pin,
  };
}

/** Página servida pela API que corre o SDK da Meta (funciona no browser e no app, via browser do sistema) */
export function signupPageHtml(opts: { state: string; nonce: string; appId: string; configId: string; version: string }): string {
  const cfg = JSON.stringify({ state: opts.state, appId: opts.appId, configId: opts.configId, version: opts.version });
  return `<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ligar WhatsApp · LeadsFlow</title>
<style>
  :root { color-scheme: light dark; --bg:#f5f6f8; --card:#fff; --fg:#111827; --muted:#6b7280; --primary:#25D366; --err:#dc2626; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0f1115; --card:#181b21; --fg:#f3f4f6; --muted:#9ca3af; } }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:16px; background:var(--bg); color:var(--fg); font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
  main { width:100%; max-width:400px; background:var(--card); border-radius:16px; padding:28px 22px; text-align:center; box-shadow:0 8px 30px rgba(0,0,0,.08); }
  svg.logo { width:52px; height:52px; fill:var(--primary); }
  h1 { font-size:20px; margin:14px 0 6px; }
  p { color:var(--muted); margin:0 0 20px; font-size:15px; }
  button { width:100%; height:48px; border:0; border-radius:12px; background:#1877F2; color:#fff; font-size:16px; font-weight:600; cursor:pointer; }
  button:disabled { opacity:.6; cursor:default; }
  .msg { margin-top:16px; font-size:14px; min-height:20px; }
  .err { color:var(--err); }
</style>
</head>
<body>
<main>
  <svg class="logo" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
  <h1>Ligar o WhatsApp Business</h1>
  <p>Entre com o Facebook e escolha a conta e o número do WhatsApp que quer usar no LeadsFlow.</p>
  <button id="go" disabled>A preparar…</button>
  <div id="msg" class="msg" role="status"></div>
</main>
<script nonce="${opts.nonce}">
(function () {
  var cfg = ${cfg};
  var go = document.getElementById('go');
  var msg = document.getElementById('msg');
  var session = null, code = null, sent = false;
  function say(text, isErr) { msg.textContent = text; msg.className = 'msg' + (isErr ? ' err' : ''); }
  function finish() {
    if (sent || !code || !session) return;
    sent = true;
    say('A ligar o número…');
    fetch('/api/oauth/whatsapp/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: cfg.state, code: code, waba_id: session.waba_id, phone_number_id: session.phone_number_id }) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (r) {
        if (r.d && r.d.redirect) { say(r.ok ? 'Ligado! A voltar ao LeadsFlow…' : (r.d.error || 'Não foi possível ligar.'), !r.ok); setTimeout(function () { location.href = r.d.redirect; }, r.ok ? 600 : 2500); }
        else { sent = false; go.disabled = false; say((r.d && r.d.error) || 'Não foi possível ligar.', true); }
      })
      .catch(function () { sent = false; go.disabled = false; say('Sem ligação à internet. Tente de novo.', true); });
  }
  window.addEventListener('message', function (event) {
    if (!/(^|\\.)facebook\\.com$/.test(new URL(event.origin).hostname)) return;
    try {
      var data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      if (!data || data.type !== 'WA_EMBEDDED_SIGNUP') return;
      if (data.event === 'FINISH' || data.event === 'FINISH_ONLY_WABA') { session = data.data || {}; finish(); }
      else if (data.event === 'CANCEL') { go.disabled = false; say('Ligação cancelada antes de terminar.', true); }
      else if (data.event === 'ERROR') { go.disabled = false; say((data.data && data.data.error_message) || 'A Meta devolveu um erro.', true); }
    } catch (e) { /* mensagens de outros scripts */ }
  });
  window.fbAsyncInit = function () {
    FB.init({ appId: cfg.appId, autoLogAppEvents: true, xfbml: false, version: cfg.version });
    go.disabled = false; go.textContent = 'Continuar com o Facebook';
  };
  go.addEventListener('click', function () {
    go.disabled = true; say('');
    FB.login(function (response) {
      if (response.authResponse && response.authResponse.code) { code = response.authResponse.code; finish(); if (!session) say('A aguardar a confirmação da Meta…'); }
      else { go.disabled = false; say('Ligação cancelada.', true); }
    }, { config_id: cfg.configId, response_type: 'code', override_default_response_type: true,
         extras: { setup: {}, featureType: '', sessionInfoVersion: '3' } });
  });
})();
</script>
<script nonce="${opts.nonce}" async defer crossorigin="anonymous" src="https://connect.facebook.net/pt_PT/sdk.js"></script>
</body>
</html>`;
}
