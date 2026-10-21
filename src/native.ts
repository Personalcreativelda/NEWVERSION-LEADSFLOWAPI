import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { SplashScreen } from '@capacitor/splash-screen';

// Plugin nativo do app (android/.../SystemBarsPlugin.java).
const SystemBars = registerPlugin<{
  setColors(options: { color: string; dark: boolean }): Promise<void>;
}>('SystemBars');

// Deep link para onde a API redireciona no fim do login Google (ver NATIVE_APP_REDIRECTS na API).
export const NATIVE_OAUTH_REDIRECT = 'com.leadsflowapi.app://oauth';

export const isNativeApp = () => Capacitor.isNativePlatform();

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
    const color =
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
  new MutationObserver(apply).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'style', 'data-theme'],
  });
  return () => {
    last = '';
    apply();
  };
}

// Desliga o zoom por pinça/duplo toque — num app as telas têm tamanho fixo.
function lockViewport() {
  document
    .querySelector('meta[name="viewport"]')
    ?.setAttribute(
      'content',
      'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
    );
}

// Integração com o Android — no navegador não faz nada.
export async function initNative() {
  if (!isNativeApp()) return;

  document.documentElement.classList.add('native-app');
  lockViewport();

  // Botão "voltar" do Android: fecha o chat de suporte se estiver aberto, senão navega
  // no histórico; na primeira página fecha o app.
  App.addListener('backButton', ({ canGoBack }) => {
    const chat = document.getElementById('lfw-window');
    if (chat && getComputedStyle(chat).display !== 'none') {
      document.getElementById('lfw-close')?.click();
      return;
    }
    if (canGoBack) window.history.back();
    else App.exitApp();
  });

  App.addListener('appUrlOpen', ({ url }) => {
    if (url.startsWith(NATIVE_OAUTH_REDIRECT)) handleOAuthDeepLink(url);
  });

  const reapplySystemBars = syncSystemBars();
  await SplashScreen.hide();
  setTimeout(reapplySystemBars, 400);
}
