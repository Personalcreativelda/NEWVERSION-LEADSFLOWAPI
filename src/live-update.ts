import { App } from '@capacitor/app';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { getApiBaseUrl } from './app/utils/api-client';

/**
 * Atualizações ao vivo do app Android (Capgo auto-hospedado, sem o serviço Capgo).
 *
 * Cada build web leva a hora a que foi feito (__APP_BUILD_TIME__). O app pergunta à
 * API (GET /api/version/mobile) pelo pacote mais recente compatível com o seu APK;
 * se for mais novo que o código que está a correr, descarrega-o em segundo plano e
 * deixa-o marcado para entrar quando o app for para segundo plano ou voltar a abrir.
 * Se o pacote novo não arrancar (notifyAppReady não chega em 10s), o plugin volta
 * sozinho à versão anterior. Publicar: `npm run release:mobile`.
 */

const CHECK_INTERVAL_MS = 30 * 60 * 1000;

let lastCheck = 0;
let checking = false;

interface MobileRelease {
  available: boolean;
  version?: string;
  path?: string;
  checksum?: string;
  builtAt?: string;
}

/** Confirma ao plugin que este pacote arrancou bem (senão ele reverte). Chamar logo no arranque. */
export function confirmBundleReady() {
  CapacitorUpdater.notifyAppReady().catch(() => {});
}

export async function checkForLiveUpdate(force = false) {
  if (checking || (!force && Date.now() - lastCheck < CHECK_INTERVAL_MS)) return;
  checking = true;
  lastCheck = Date.now();

  try {
    const apiBase = getApiBaseUrl();
    if (!apiBase) return;

    const { build } = await App.getInfo();
    const response = await fetch(`${apiBase}/api/version/mobile?native=${encodeURIComponent(build)}`, {
      cache: 'no-store',
    });
    if (!response.ok) return;

    const release: MobileRelease = await response.json();
    if (!release.available || !release.version || !release.path || !release.builtAt) return;

    // Este código já é esta versão ou mais recente (ex.: APK novo instalado depois)
    if (new Date(release.builtAt).getTime() <= __APP_BUILD_TIME__) return;

    const { bundles } = await CapacitorUpdater.list();
    const existing = bundles.find((bundle) => bundle.version === release.version);

    // Um pacote que já falhou ao arrancar não é tentado de novo
    if (existing?.status === 'error') return;

    const bundle = existing && existing.status !== 'downloading'
      ? existing
      : await CapacitorUpdater.download({
          url: `${apiBase}${release.path}`,
          version: release.version,
          checksum: release.checksum,
        });

    await CapacitorUpdater.next({ id: bundle.id });
    console.info(`[LiveUpdate] Versão ${release.version} pronta — entra ao reabrir o app`);
  } catch (error) {
    console.warn('[LiveUpdate] Verificação falhou:', error);
  } finally {
    checking = false;
  }
}

/**
 * Versão em uso no app: a do pacote ao vivo (ex.: "1.0.2") ou, sem nenhum, a do APK
 * (ex.: "1.1"). null fora do app.
 */
export async function getInstalledVersion(): Promise<string | null> {
  try {
    const { bundle, native } = await CapacitorUpdater.current();
    return bundle.id === 'builtin' ? native : bundle.version;
  } catch {
    return null;
  }
}

export function initLiveUpdates() {
  confirmBundleReady();
  // Depois do arranque, para não competir com o carregamento do painel
  setTimeout(() => void checkForLiveUpdate(true), 5000);
  App.addListener('resume', () => void checkForLiveUpdate());
}
