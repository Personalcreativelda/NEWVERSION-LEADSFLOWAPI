import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';

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

// Integração com o Android — no navegador não faz nada.
export async function initNative() {
  if (!isNativeApp()) return;

  document.documentElement.classList.add('native-app');

  // Botão "voltar" do Android: navega no histórico em vez de fechar o app.
  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else App.exitApp();
  });

  App.addListener('appUrlOpen', ({ url }) => {
    if (url.startsWith(NATIVE_OAUTH_REDIRECT)) handleOAuthDeepLink(url);
  });

  try {
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#0f0f14' });
  } catch {
    // StatusBar indisponível em alguns dispositivos — ignorar.
  }

  await SplashScreen.hide();
}
