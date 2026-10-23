import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { SplashScreen } from '@capacitor/splash-screen';
import { initLiveUpdates } from './live-update';

// Plugin nativo do app (android/.../SystemBarsPlugin.java).
const SystemBars = registerPlugin<{
  setColors(options: { color: string; dark: boolean }): Promise<void>;
}>('SystemBars');

// Deep link para onde a API redireciona no fim do login Google (ver NATIVE_APP_REDIRECTS na API).
export const NATIVE_OAUTH_REDIRECT = 'com.leadsflowapi.app://oauth';

export const isNativeApp = () => Capacitor.isNativePlatform();

/** Vibração curta de confirmação (só no app; no browser não faz nada). */
export function haptic(strength: 'light' | 'medium' = 'light') {
  if (!isNativeApp()) return;
  Haptics.impact({ style: strength === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light }).catch(() => {});
}

let oauthCompleting = false;

// Abre o login Google numa Custom Tab do Chrome (o Google bloqueia login dentro do WebView).
// Só termina se o utilizador fechar a aba sem concluir — nesse caso lança erro.
export async function openNativeOAuth(url: string): Promise<never> {
  oauthCompleting = false;
  await new Promise<void>((resolve) => {
    Browser.addListener('browserFinished', () => {
      if (!oauthCompleting) resolve();
    }).then(() => Browser.open({ url }));
  });
  await Browser.removeAllListeners();
  throw new Error('Login com Google cancelado.');
}

// Abre o chat de suporte (widget do index.html). No app o botão flutuante fica escondido
// e o chat é aberto pelo Menu.
export function openSupportChat() {
  document.getElementById('lfw-btn')?.click();
}

// Recarrega o app num caminho para que o App.tsx leia o #oauth_callback no arranque,
// exatamente como acontece na versão web.
function reloadAt(pathWithHash: string) {
  const target = new URL(pathWithHash, window.location.origin);
  const samePage =
    target.pathname === window.location.pathname && target.search === window.location.search;
  window.location.replace(target.href);
  if (samePage) window.location.reload();
}

// Regresso do login da Meta (ligar Facebook/Instagram): fecha o browser e abre os Canais
// com ?meta_session (o ChannelsList lê-o e mostra as páginas para escolher), sem recarregar.
function handleMetaDeepLink(url: string) {
  Browser.close().catch(() => {});
  const queryIndex = url.indexOf('?');
  const query = queryIndex >= 0 ? url.slice(queryIndex) : '';
  window.history.pushState({ dashboardPage: true }, '', `/dashboard/inbox/settings${query}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.dispatchEvent(new Event('meta-oauth-return'));
}

function handleOAuthDeepLink(url: string) {
  oauthCompleting = true;
  Browser.close().catch(() => {});

  const hashIndex = url.indexOf('#');
  if (hashIndex >= 0) {
    reloadAt('/#' + url.slice(hashIndex + 1));
    return;
  }
  const queryIndex = url.indexOf('?');
  reloadAt('/login' + (queryIndex >= 0 ? url.slice(queryIndex) : ''));
}

function toHex(cssColor: string): string | null {
  const m = cssColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!m || m[4] === '0') return null;
  return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
}

// Pinta as barras do sistema com o fundo atual do app e acompanha a troca de tema.
// Devolve uma função que força a reaplicação (o splash repõe o estilo ao fechar).
function syncSystemBars(): () => void {
  let last = '';
  const apply = () => {
    const boot = document.getElementById('app-boot');
    const bootVisible = boot && document.documentElement.classList.contains('app-booting');
    const color =
      (bootVisible ? toHex(getComputedStyle(boot).backgroundColor) : null) ??
      toHex(getComputedStyle(document.body).backgroundColor) ??
      toHex(getComputedStyle(document.documentElement).backgroundColor) ??
      (document.documentElement.classList.contains('dark') ? '#0a0a0a' : '#ffffff');
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
    const dark = 0.299 * r + 0.587 * g + 0.114 * b < 140;
    const key = color + dark;
    if (key === last) return;
    last = key;
    SystemBars.setColors({ color, dark }).catch(() => {});
  };
  apply();
  // O fundo muda com o tema e também com a página (login claro, painel escuro) e tem
  // transições de cor: reaplicar depois da transição, e numa verificação leve periódica
  // (só chama o plugin quando a cor muda).
  let pending: number | undefined;
  const scheduleApply = () => {
    window.clearTimeout(pending);
    pending = window.setTimeout(apply, 350);
  };
  const observer = new MutationObserver(scheduleApply);
  const attributeFilter = ['class', 'style', 'data-theme'];
  observer.observe(document.documentElement, { attributes: true, attributeFilter });
  observer.observe(document.body, { attributes: true, attributeFilter });
  window.addEventListener('popstate', scheduleApply);
  window.setInterval(apply, 1500);
  return () => {
    last = '';
    apply();
  };
}

// Domínios que abrem dentro do próprio WebView (pagamentos). Manter em sincronia com
// server.allowNavigation em capacitor.config.ts.
const IN_APP_HOSTS = ['stripe.com', 'paypal.com'];

const matchesHost = (host: string, domain: string) => host === domain || host.endsWith('.' + domain);

// Decide onde abre um link: null = comportamento normal (mesmo app, tel:, mailto:, WhatsApp…).
function routeExternalUrl(rawUrl: string): 'in-app' | 'overlay' | null {
  let url: URL;
  try {
    url = new URL(rawUrl, window.location.href);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.host === window.location.host) return null;
  if (IN_APP_HOSTS.some((d) => matchesHost(url.hostname, d))) return 'in-app';
  // WhatsApp deve abrir a app do WhatsApp, não uma página.
  if (['wa.me', 'whatsapp.com'].some((d) => matchesHost(url.hostname, d))) return null;
  return 'overlay';
}

function openRouted(rawUrl: string, route: 'in-app' | 'overlay') {
  const href = new URL(rawUrl, window.location.href).href;
  if (route === 'in-app') window.location.href = href;
  else Browser.open({ url: href }).catch(() => {});
}

// Mantém o utilizador dentro do app: pagamentos abrem no próprio app e restantes links
// externos numa Custom Tab por cima do app (com ✕ para voltar), em vez de saltar para o Chrome.
function keepLinksInApp() {
  const nativeOpen = window.open.bind(window);
  window.open = ((url?: string | URL, target?: string, features?: string) => {
    const route = url ? routeExternalUrl(String(url)) : null;
    if (!route) return nativeOpen(url, target, features);
    openRouted(String(url), route);
    return null;
  }) as typeof window.open;

  // Fase de bubbling: corre depois dos handlers do React, que podem já ter tratado o clique.
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented) return;
    const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!anchor || anchor.hasAttribute('download')) return;
    const route = routeExternalUrl(anchor.href);
    if (!route) return;
    event.preventDefault();
    openRouted(anchor.href, route);
  });
}

// O App avisa ('app-ready') quando termina o carregamento inicial — pode acontecer antes
// de o splash nativo sair, por isso fica registado desde o carregamento deste módulo.
let appReady = false;
window.addEventListener('app-ready', () => { appReady = true; }, { once: true });

// Ecrã de abertura (#app-boot em index.html, logo + nome sobre azul). Chamado quando o splash
// nativo sai: fica visível pelo menos MIN_VISIBLE_MS e até o App estar pronto.
function finishBootScreen() {
  const boot = document.getElementById('app-boot');
  if (!boot) return;
  const MIN_VISIBLE_MS = 900;
  const MAX_WAIT_MS = 8000;
  const shownAt = performance.now();
  const hide = () => {
    boot.classList.add('is-done');
    window.setTimeout(() => {
      boot.remove();
      document.documentElement.classList.remove('app-booting');
    }, 400);
  };
  const waitUntilReady = () => {
    const elapsed = performance.now() - shownAt;
    if ((appReady && elapsed >= MIN_VISIBLE_MS) || elapsed >= MAX_WAIT_MS) hide();
    else window.setTimeout(waitUntilReady, 100);
  };
  waitUntilReady();
}

// Integração com o Android — no navegador não faz nada.
export async function initNative() {
  if (!isNativeApp()) return;

  // Primeiro de tudo: confirmar que este pacote web arrancou (ver live-update.ts)
  initLiveUpdates();

  document.documentElement.classList.add('native-app');
  keepLinksInApp();

  // Botão "voltar" do Android, por ordem: painéis do app (evento 'native-back', que um
  // componente cancela com preventDefault), chat de suporte, diálogos/modais Radix
  // (fecham com Escape), histórico; na primeira página fecha o app.
  App.addListener('backButton', ({ canGoBack }) => {
    if (!window.dispatchEvent(new Event('native-back', { cancelable: true }))) return;

    const chat = document.getElementById('lfw-window');
    if (chat && getComputedStyle(chat).display !== 'none') {
      document.getElementById('lfw-close')?.click();
      return;
    }
    if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) {
      const target = document.activeElement ?? document.body;
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      return;
    }
    if (canGoBack) window.history.back();
    else App.exitApp();
  });

  App.addListener('appUrlOpen', ({ url }) => {
    if (url.startsWith(`${NATIVE_OAUTH_REDIRECT}/meta`)) handleMetaDeepLink(url);
    else if (url.startsWith(NATIVE_OAUTH_REDIRECT)) handleOAuthDeepLink(url);
  });

  const reapplySystemBars = syncSystemBars();
  // O ecrã de abertura em HTML (mesmo azul) já está pintado: o splash nativo sai já
  await SplashScreen.hide();
  finishBootScreen();
  setTimeout(reapplySystemBars, 400);
}
