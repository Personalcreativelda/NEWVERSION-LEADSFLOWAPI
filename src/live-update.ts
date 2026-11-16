import { App } from '@capacitor/app';
import { Capacitor, registerPlugin } from '@capacitor/core';
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
    // Já está a correr esta versão: nunca a instalar outra vez. Se a hora publicada não bater
    // com a do pacote (aconteceu na 1.0.58), o app reinstalava-se e reiniciava sem fim.
    if ((await withTimeout(getInstalledVersion(), 2500).catch(() => null)) === release.version) return;

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

// ── Sobre o app: verificar e aplicar atualizações à mão ───────────────────────

type AppUpdaterPlugin = {
  canInstall(): Promise<{ allowed: boolean }>;
  openInstallSettings(): Promise<void>;
  downloadAndInstall(options: { url: string; checksum?: string }): Promise<void>;
  addListener(event: 'progress', cb: (data: { percent: number }) => void): Promise<{ remove: () => Promise<void> }>;
};

// O plugin é usado diretamente, nunca devolvido por uma função async nem passado a um
// await: o proxy do Capacitor responde a qualquer propriedade, incluindo "then", e o await
// tratava-o como promessa e ficava à espera para sempre ("A verificar atualizações…").
const AppUpdater = registerPlugin<AppUpdaterPlugin>('AppUpdater');
/** APKs anteriores ao 1.5 não têm o plugin: a atualização do APK é feita pelo browser */
const hasAppUpdater = () => Capacitor.isPluginAvailable('AppUpdater');

export interface AppUpdateStatus {
  /** Versão em uso (pacote ao vivo ou APK) */
  current: string | null;
  /** APK instalado */
  nativeVersion: string | null;
  nativeBuild: number;
  /** Atualização do código (entra sem reinstalar) */
  web: { version: string; notes: string | null } | null;
  /** APK novo (instalador do Android) */
  apk: { versionName: string; versionCode: number; notes: string | null; size: number | null; url: string; checksum: string | null } | null;
  /** O APK instalado já sabe atualizar-se sozinho */
  canSelfUpdateApk: boolean;
}

export interface ChangelogItem { kind: 'app' | 'apk'; version: string; notes: string; date: string }

export async function getChangelog(): Promise<ChangelogItem[]> {
  const apiBase = getApiBaseUrl();
  if (!apiBase) return [];
  const res = await fetch(`${apiBase}/api/version/changelog`, { cache: 'no-store' });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data.items) ? data.items : [];
}

/** O que há para atualizar neste telemóvel (Sobre o app) */
/** Rejeita se a promessa não responder a tempo (o ecrã nunca fica preso à espera) */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); },
    );
  });
}

export async function getAppUpdateStatus(): Promise<AppUpdateStatus> {
  const apiBase = getApiBaseUrl();
  const { build, version: nativeVersion } = await withTimeout(App.getInfo(), 3000);
  const nativeBuild = parseInt(build, 10) || 0;
  // Sem perguntar ao plugin de atualizações ao vivo: logo a seguir a instalar um APK novo
  // ele está ocupado a descarregar o pacote e não responde (o ecrã ficava em "A carregar…")
  const status: AppUpdateStatus = {
    current: await withTimeout(getInstalledVersion(), 2500).catch(() => null),
    nativeVersion,
    nativeBuild,
    web: null,
    apk: null,
    canSelfUpdateApk: hasAppUpdater(),
  };
  if (!apiBase) return status;

  const [webRes, apkRes, changelog] = await Promise.all([
    withTimeout(fetch(`${apiBase}/api/version/mobile?native=${nativeBuild}`, { cache: 'no-store' }), 10000).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    withTimeout(fetch(`${apiBase}/api/version/apk/latest?native=${nativeBuild}`, { cache: 'no-store' }), 10000).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    withTimeout(getChangelog(), 10000).catch(() => [] as ChangelogItem[]),
  ]);

  const release = webRes as MobileRelease | null;
  if (release?.available && release.version && release.builtAt && new Date(release.builtAt).getTime() > __APP_BUILD_TIME__
      && release.version !== status.current) {
    const notes = changelog.find((c) => c.kind === 'app' && c.version === release.version)?.notes || null;
    status.web = { version: release.version, notes };
  }
  if (apkRes?.available) {
    status.apk = {
      versionName: apkRes.versionName,
      versionCode: apkRes.versionCode,
      notes: apkRes.notes || null,
      size: apkRes.size || null,
      url: `${apiBase}${apkRes.path}`,
      checksum: apkRes.checksum || null,
    };
  }
  return status;
}

/** Descarrega a versão nova do código e reinicia o app já com ela */
export async function applyLiveUpdateNow(): Promise<void> {
  const apiBase = getApiBaseUrl();
  if (!apiBase) throw new Error('Sem ligação ao servidor');
  const { build } = await App.getInfo();
  const res = await fetch(`${apiBase}/api/version/mobile?native=${encodeURIComponent(build)}`, { cache: 'no-store' });
  const release: MobileRelease = await res.json();
  if (!release.available || !release.version || !release.path) throw new Error('Não há atualização');
  const { bundles } = await CapacitorUpdater.list();
  const existing = bundles.find((b) => b.version === release.version && b.status !== 'error' && b.status !== 'downloading');
  const bundle = existing ?? await CapacitorUpdater.download({
    url: `${apiBase}${release.path}`,
    version: release.version,
    checksum: release.checksum,
  });
  // Recarrega o app com o pacote novo (a sessão fica)
  await CapacitorUpdater.set({ id: bundle.id });
}

/**
 * Descarrega o APK novo e abre o instalador do Android. Devolve 'needs-permission' quando
 * falta "permitir instalar a partir do LeadsFlow" (abre-se esse ecrã do Android).
 */
export async function installApkUpdate(
  apk: NonNullable<AppUpdateStatus['apk']>,
  onProgress?: (percent: number) => void,
): Promise<'started' | 'needs-permission' | 'unsupported'> {
  if (!hasAppUpdater()) return 'unsupported';
  const { allowed } = await AppUpdater.canInstall();
  if (!allowed) {
    await AppUpdater.openInstallSettings();
    return 'needs-permission';
  }
  const sub = onProgress ? await AppUpdater.addListener('progress', ({ percent }) => onProgress(percent)) : null;
  try {
    await AppUpdater.downloadAndInstall({ url: apk.url, checksum: apk.checksum || undefined });
    return 'started';
  } finally {
    await sub?.remove();
  }
}
