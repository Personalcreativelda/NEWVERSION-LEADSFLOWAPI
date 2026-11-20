/**
 * Publica um APK novo para os telemóveis se atualizarem sem loja (Definições → Sobre o app
 * → "Descarregar e instalar"; quem tem o app recebe também uma notificação com as novidades).
 *
 *   npm run release:apk -- --notes "Notificações push e atualização pelo próprio app"
 *   npm run release:apk -- --apk caminho/para/app.apk --notes "..."
 *   npm run release:apk -- --no-notify      (publica sem avisar)
 *
 * Antes: subir versionCode/versionName em android/app/build.gradle, `npm run android:sync`
 * e gerar o APK (ver CLAUDE.md). O APK TEM de ser assinado com a mesma chave do instalado
 * (hoje ~/.android/debug.keystore deste computador), senão o Android recusa instalar por cima.
 * Precisa de MOBILE_RELEASE_KEY (ambiente ou .env.release.local), a mesma da API.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const localEnvPath = join(root, '.env.release.local');
if (existsSync(localEnvPath)) {
  for (const line of readFileSync(localEnvPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
}

const fail = (message) => {
  console.error(`\n✖ ${message}`);
  process.exit(1);
};

const apiUrl = (process.env.RELEASE_API_URL || 'https://api.leadsflowapi.com').replace(/\/$/, '');
const releaseKey = process.env.MOBILE_RELEASE_KEY;
if (!releaseKey) fail('Defina MOBILE_RELEASE_KEY (ambiente ou .env.release.local), igual à da API.');

const apkPath = option('apk') || join(root, 'android/app/build/outputs/apk/direct/debug/app-direct-debug.apk');
if (!existsSync(apkPath)) fail(`APK não encontrado: ${apkPath}`);

const gradle = readFileSync(join(root, 'android/app/build.gradle'), 'utf8');
const versionCode = Number(gradle.match(/versionCode\s+(\d+)/)?.[1]);
const versionName = gradle.match(/versionName\s+"([^"]+)"/)?.[1];
if (!versionCode || !versionName) fail('Não encontrei versionCode/versionName em android/app/build.gradle');

const notes = option('notes') || '';
const notify = !flag('no-notify');
const apk = readFileSync(apkPath);
const checksum = createHash('sha256').update(apk).digest('hex');
console.log(`▶ APK ${versionName} (versionCode ${versionCode}): ${(apk.length / 1024 / 1024).toFixed(1)} MB  sha256 ${checksum.slice(0, 12)}…`);

const form = new FormData();
form.append('apk', new Blob([apk], { type: 'application/vnd.android.package-archive' }), `LeadsFlow-${versionName}.apk`);
form.append('versionCode', String(versionCode));
form.append('versionName', versionName);
form.append('checksum', checksum);
form.append('releaseNotes', notes);
form.append('notifyUsers', String(notify));

console.log(`▶ A publicar em ${apiUrl} …`);
const res = await fetch(`${apiUrl}/api/version/apk/release`, {
  method: 'POST',
  headers: { 'x-release-key': releaseKey },
  body: form,
});
const body = await res.json().catch(() => ({}));
if (!res.ok) fail(`A API recusou (${res.status}): ${body.error || 'erro desconhecido'}`);

console.log(`\n✔ APK ${versionName} publicado.${notify ? ' Quem tem o app recebe uma notificação.' : ''}`);
console.log('  Atualiza-se em Definições → Sobre o app → "Descarregar e instalar".');
