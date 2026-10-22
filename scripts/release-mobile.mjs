#!/usr/bin/env node
/**
 * Publica uma atualização ao vivo do app Android (sem reinstalar o APK).
 *
 *   npm run release:mobile -- --notes "Correções no funil"
 *   npm run release:mobile -- --version 1.2.0 --notes "..." --notify
 *   npm run release:mobile -- --dry-run          (só gera o zip, não publica)
 *
 * Passos: build Android (vite --mode android) para dist-mobile/ → zip → envio para
 * POST /api/version/mobile/release, que guarda o zip e regista a versão no app_version.
 *
 * Precisa de MOBILE_RELEASE_KEY (a mesma da API), no ambiente ou em .env.release.local.
 * Só serve para código web (React/CSS). Mudanças nativas (plugins, MainActivity,
 * ícones, permissões) exigem APK novo: subir o versionCode em android/app/build.gradle.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const root = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = 'dist-mobile';

// ── Argumentos ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

// .env.release.local (ignorado pelo git) para não ter de exportar a chave sempre
const localEnvPath = join(root, '.env.release.local');
if (existsSync(localEnvPath)) {
  for (const line of readFileSync(localEnvPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
}

const apiUrl = (process.env.RELEASE_API_URL || 'https://api.leadsflowapi.com').replace(/\/$/, '');
const releaseKey = process.env.MOBILE_RELEASE_KEY;
const dryRun = flag('dry-run');
const notes = option('notes') || '';
const notify = flag('notify') || (Boolean(notes) && !flag('no-notify'));

const fail = (message) => {
  console.error(`\n✖ ${message}`);
  process.exit(1);
};

if (!dryRun && !releaseKey) {
  fail('Defina MOBILE_RELEASE_KEY (ambiente ou .env.release.local), igual à da API.');
}

// ── Versão ───────────────────────────────────────────────────────────────────
// versionCode do APK atual: os pacotes publicados exigem pelo menos este APK
const gradle = readFileSync(join(root, 'android/app/build.gradle'), 'utf8');
const versionCode = Number(gradle.match(/versionCode\s+(\d+)/)?.[1] || 1);
const minNativeBuild = Number(option('min-native') || versionCode);

async function nextVersion() {
  const explicit = option('version');
  if (explicit) return explicit;
  // Sem --version: sobe o último número da versão atual do app_version (1.0.4 → 1.0.5)
  try {
    const res = await fetch(`${apiUrl}/api/version/current`, { headers: { Origin: 'https://app.leadsflowapi.com' } });
    const current = String((await res.json()).version || '1.0.0');
    const parts = current.split('.').map((n) => parseInt(n, 10) || 0);
    while (parts.length < 3) parts.push(0);
    parts[parts.length - 1] += 1;
    return parts.join('.');
  } catch {
    fail('Não consegui ler a versão atual da API. Use --version X.Y.Z.');
  }
}

// ── Build ────────────────────────────────────────────────────────────────────
const version = await nextVersion();
const builtAt = Date.now();

console.log(`\n▶ Build Android ${version} (APK mínimo: versionCode ${minNativeBuild})`);
const build = spawnSync('npx', ['vite', 'build', '--mode', 'android', '--outDir', OUT_DIR, '--emptyOutDir'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, APP_BUILD_TIME: String(builtAt) },
});
if (build.status !== 0) fail('O build falhou.');

const bundled = readFileSync(join(root, OUT_DIR, 'index.html'), 'utf8');
if (!bundled.includes('<div id="root">')) fail(`${OUT_DIR}/index.html inesperado.`);

// ── Zip (index.html na raiz, como o plugin espera) ───────────────────────────
function collect(dir, files = {}) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) collect(full, files);
    else files[relative(join(root, OUT_DIR), full).split(sep).join('/')] = readFileSync(full);
  }
  return files;
}
const zip = Buffer.from(zipSync(collect(join(root, OUT_DIR)), { level: 9 }));
const checksum = createHash('sha256').update(zip).digest('hex');
const zipPath = join(root, OUT_DIR, `../${OUT_DIR}-${version}.zip`);
writeFileSync(zipPath, zip);
console.log(`▶ Pacote: ${(zip.length / 1024 / 1024).toFixed(2)} MB  sha256 ${checksum.slice(0, 12)}…`);

if (dryRun) {
  console.log(`\n✔ Dry run: zip em ${relative(root, zipPath)} (nada publicado)`);
  process.exit(0);
}

// ── Publicar ─────────────────────────────────────────────────────────────────
const form = new FormData();
form.append('bundle', new Blob([zip], { type: 'application/zip' }), `leadsflow-${version}.zip`);
form.append('version', version);
form.append('builtAt', String(builtAt));
form.append('minNativeBuild', String(minNativeBuild));
form.append('checksum', checksum);
form.append('releaseNotes', notes);
form.append('notifyUsers', String(notify));

console.log(`▶ A publicar em ${apiUrl} …`);
const res = await fetch(`${apiUrl}/api/version/mobile/release`, {
  method: 'POST',
  headers: { 'x-release-key': releaseKey },
  body: form,
});
const body = await res.json().catch(() => ({}));
if (!res.ok) fail(`A API recusou (${res.status}): ${body.error || 'erro desconhecido'}`);

console.log(`\n✔ Versão ${version} publicada. Os telemóveis recebem-na na próxima vez que abrirem o app.`);
