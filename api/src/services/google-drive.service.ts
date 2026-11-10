// Google Drive na base de conhecimento dos assistentes.
//
// Permissão "drive.file": o LeadsFlow só vê os ficheiros que o utilizador escolhe no seletor
// do Google (Picker). Não pede acesso a todo o Drive — esse ("drive.readonly") obriga a uma
// auditoria de segurança paga da Google.
//
// Fluxo: /start → login do Google → /callback (guarda o refresh token cifrado e mostra o
// seletor) → /import (os ficheiros escolhidos entram como "a importar" e são lidos em segundo
// plano) → volta ao painel. Os ficheiros voltam a ser lidos quando mudam no Drive (sincronizar).
import crypto from 'crypto';
import { query } from '../database/connection';
import { encryptSecret, decryptSecret } from '../utils/secret-box';
import { apiBaseUrl } from './meta-oauth.service';
import { AIService, getAvailableProviders } from './ai.service';
import { MAX_KNOWLEDGE_FILES } from './assistants.service';

export type DrivePlatform = 'web' | 'app';

const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/drive.file'];
const STATE_TTL_MS = 30 * 60_000;
const MAX_TEXT = 30_000;
const MAX_BYTES = 10 * 1024 * 1024;

/** Formatos aceites (o que o seletor mostra) */
export const DRIVE_MIME_TYPES = [
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/webp',
];

const EXPORTS: Record<string, string> = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
  'application/vnd.google-apps.presentation': 'text/plain',
};

export function isDriveConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && driveApiKey());
}

/** Chave de API do Google (Picker); o número do projeto é o appId do seletor */
const driveApiKey = () => process.env.GOOGLE_PICKER_API_KEY || process.env.GOOGLE_API_KEY || '';
const driveAppId = () => process.env.GOOGLE_PROJECT_NUMBER || (process.env.GOOGLE_CLIENT_ID || '').split('-')[0];
export const driveRedirectUri = () => `${apiBaseUrl()}/api/oauth/google-drive/callback`;

let tableReady: Promise<void> | null = null;
export function ensureDriveTables(): Promise<void> {
  tableReady ??= (async () => {
    await query(`CREATE TABLE IF NOT EXISTS google_drive_connections (
      user_id UUID PRIMARY KEY,
      email TEXT,
      refresh_token TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    for (const sql of [
      "ALTER TABLE assistant_knowledge_files ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'upload'",
      'ALTER TABLE assistant_knowledge_files ADD COLUMN IF NOT EXISTS external_id TEXT',
      'ALTER TABLE assistant_knowledge_files ADD COLUMN IF NOT EXISTS external_modified_at TIMESTAMPTZ',
      'ALTER TABLE assistant_knowledge_files ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ',
    ]) await query(sql);
  })().catch((err) => { tableReady = null; throw err; });
  return tableReady;
}

// ── state assinado: liga o regresso do Google ao utilizador e ao assistente ────────────
function stateKey(): string {
  const key = process.env.JWT_SECRET;
  if (!key) throw new Error('JWT_SECRET em falta');
  return key;
}

export interface DriveState { userId: string; assistantId: string; platform: DrivePlatform }

export function createDriveState(s: DriveState): string {
  const payload = Buffer.from(JSON.stringify({
    u: s.userId, a: s.assistantId, p: s.platform, n: crypto.randomBytes(9).toString('hex'), e: Date.now() + STATE_TTL_MS,
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', stateKey()).update(`drive.${payload}`).digest('base64url');
  return `${payload}.${sig}`;
}

export function readDriveState(state: string): DriveState | null {
  const [payload, sig] = String(state || '').split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', stateKey()).update(`drive.${payload}`).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!d.u || !d.a || typeof d.e !== 'number' || d.e < Date.now()) return null;
    return { userId: String(d.u), assistantId: String(d.a), platform: d.p === 'app' ? 'app' : 'web' };
  } catch {
    return null;
  }
}

export function buildDriveAuthorizeUrl(state: string, loginHint?: string): string {
  const qs = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    redirect_uri: driveRedirectUri(),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    // consent: o Google só devolve o refresh token quando mostra a autorização
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
    ...(loginHint ? { login_hint: loginHint } : {}),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${qs}`;
}

/** Fim do fluxo: no app volta pelo esquema do app; na web fecha a janela e avisa o painel */
export function driveReturnUrl(platform: DrivePlatform, params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString();
  if (platform === 'app') return `com.leadsflowapi.app://oauth/drive?${qs}`;
  return `${apiBaseUrl()}/api/oauth/google-drive/done?${qs}`;
}

// ── Tokens ────────────────────────────────────────────────────────────────────────────

export async function tokenRequest(params: Record<string, string>): Promise<any> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      ...params,
    }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    const err: any = new Error(data.error_description || data.error || 'Google recusou o pedido');
    err.code = data.error;
    throw err;
  }
  return data;
}

/** Troca o código do login pelo acesso; guarda o refresh token (cifrado) */
export async function exchangeDriveCode(userId: string, code: string): Promise<{ accessToken: string; email: string | null }> {
  await ensureDriveTables();
  const data = await tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: driveRedirectUri() });
  let email: string | null = null;
  try {
    const idPayload = String(data.id_token || '').split('.')[1];
    if (idPayload) email = JSON.parse(Buffer.from(idPayload, 'base64url').toString('utf8')).email || null;
  } catch { /* sem email */ }
  if (data.refresh_token) {
    await query(
      `INSERT INTO google_drive_connections (user_id, email, refresh_token) VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email, refresh_token = EXCLUDED.refresh_token, updated_at = NOW()`,
      [userId, email, encryptSecret(data.refresh_token)]
    );
  }
  return { accessToken: data.access_token, email };
}

/** Acesso novo a partir do refresh token guardado */
export async function driveAccessToken(userId: string): Promise<string> {
  await ensureDriveTables();
  const row = (await query('SELECT refresh_token FROM google_drive_connections WHERE user_id = $1', [userId])).rows[0];
  if (!row) { const e: any = new Error('Google Drive não está ligado'); e.code = 'DRIVE_NOT_CONNECTED'; throw e; }
  try {
    const data = await tokenRequest({ refresh_token: decryptSecret(row.refresh_token), grant_type: 'refresh_token' });
    return data.access_token;
  } catch (err: any) {
    // Acesso retirado na conta Google: liga-se de novo
    if (err.code === 'invalid_grant') await query('DELETE FROM google_drive_connections WHERE user_id = $1', [userId]);
    throw err;
  }
}

export async function driveConnection(userId: string): Promise<{ email: string | null } | null> {
  await ensureDriveTables();
  const row = (await query('SELECT email FROM google_drive_connections WHERE user_id = $1', [userId])).rows[0];
  return row ? { email: row.email || null } : null;
}

export async function disconnectDrive(userId: string): Promise<void> {
  await ensureDriveTables();
  const row = (await query('SELECT refresh_token FROM google_drive_connections WHERE user_id = $1', [userId])).rows[0];
  if (row) {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(decryptSecret(row.refresh_token))}`, { method: 'POST' });
    } catch { /* retira-se na mesma do LeadsFlow */ }
  }
  await query('DELETE FROM google_drive_connections WHERE user_id = $1', [userId]);
}

// ── Ler ficheiros ─────────────────────────────────────────────────────────────────────

async function driveFetch(token: string, path: string): Promise<Response> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body: any = await res.json().catch(() => ({}));
    const err: any = new Error(body?.error?.message || `Google Drive respondeu ${res.status}`);
    err.status = res.status;
    err.reason = body?.error?.errors?.[0]?.reason || body?.error?.status || '';
    throw err;
  }
  return res;
}

export interface DriveFileMeta { id: string; name: string; mimeType: string; size?: string; modifiedTime?: string }

export async function driveFileMeta(token: string, fileId: string): Promise<DriveFileMeta> {
  const res = await driveFetch(token, `files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,modifiedTime&supportsAllDrives=true`);
  return res.json() as Promise<DriveFileMeta>;
}

/** Texto do ficheiro: os do Google exportam-se como texto/CSV; PDF, Word e Excel passam pela extração */
export async function driveFileText(token: string, meta: DriveFileMeta): Promise<{ text: string; bytes: number }> {
  const exportAs = EXPORTS[meta.mimeType];
  if (exportAs) {
    const res = await driveFetch(token, `files/${encodeURIComponent(meta.id)}/export?mimeType=${encodeURIComponent(exportAs)}`);
    const text = await res.text();
    return { text: text.slice(0, MAX_TEXT), bytes: Buffer.byteLength(text) };
  }
  if (meta.size && Number(meta.size) > MAX_BYTES) {
    throw new Error('O ficheiro excede o limite de 10MB');
  }
  const res = await driveFetch(token, `files/${encodeURIComponent(meta.id)}?alt=media&supportsAllDrives=true`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_BYTES) throw new Error('O ficheiro excede o limite de 10MB');
  if (meta.mimeType.startsWith('text/')) return { text: buffer.toString('utf8').slice(0, MAX_TEXT), bytes: buffer.length };
  const dataUri = `data:${meta.mimeType};base64,${buffer.toString('base64')}`;
  // Imagem: a IA lê o texto e descreve o que se vê
  if (meta.mimeType.startsWith('image/')) {
    const text = await new AIService().analyzeImageWithVision(dataUri, '', getAvailableProviders());
    return { text: String(text || '').slice(0, MAX_TEXT), bytes: buffer.length };
  }
  const text = await new AIService().extractDocumentText(dataUri, meta.mimeType, process.env.GEMINI_API_KEY, MAX_TEXT, process.env.OPENAI_API_KEY);
  return { text: String(text || '').slice(0, MAX_TEXT), bytes: buffer.length };
}

// ── Importar para a base de conhecimento ──────────────────────────────────────────────

const ID_RE = /^[A-Za-z0-9_-]{10,200}$/;

/**
 * Regista os ficheiros escolhidos (a importar) e devolve os ids do LeadsFlow.
 * O mesmo ficheiro no mesmo assistente não duplica: volta a ser lido.
 */
export async function queueDriveFiles(userId: string, assistantId: string, fileIds: string[]): Promise<{ queued: string[]; skipped: number }> {
  await ensureDriveTables();
  const owner = await query('SELECT id FROM user_assistants WHERE id = $1 AND user_id = $2', [assistantId, userId]);
  if (!owner.rows[0]) throw new Error('Assistente não encontrado');
  // Sem cortar aqui: os que passam do limite contam como "ficaram de fora" (o painel avisa)
  const ids = Array.from(new Set(fileIds.filter((id) => ID_RE.test(id)))).slice(0, 100);
  const count = Number((await query(
    "SELECT COUNT(*)::int AS n FROM assistant_knowledge_files WHERE user_assistant_id = $1 AND kind = 'rag'", [assistantId]
  )).rows[0]?.n || 0);
  let free = MAX_KNOWLEDGE_FILES - count;
  const queued: string[] = [];
  let skipped = 0;
  for (const externalId of ids) {
    const existing = (await query(
      "SELECT id FROM assistant_knowledge_files WHERE user_assistant_id = $1 AND source = 'google_drive' AND external_id = $2 LIMIT 1",
      [assistantId, externalId]
    )).rows[0];
    if (existing) {
      await query("UPDATE assistant_knowledge_files SET status = 'processing', updated_at = NOW() WHERE id = $1", [existing.id]);
      queued.push(existing.id);
      continue;
    }
    if (free <= 0) { skipped++; continue; }
    const row = (await query(
      `INSERT INTO assistant_knowledge_files (user_assistant_id, user_id, file_name, kind, mime_type, status, source, external_id)
       VALUES ($1, $2, 'Google Drive', 'rag', NULL, 'processing', 'google_drive', $3) RETURNING id`,
      [assistantId, userId, externalId]
    )).rows[0];
    queued.push(row.id);
    free--;
  }
  return { queued, skipped };
}

/** Mensagem para o painel conforme a resposta do Google (o motivo técnico fica nos logs) */
export function driveErrorMessage(err: any, wasImported: boolean): string {
  const reason = String(err.reason || '');
  const text = String(err.message || '');
  // API do Drive desligada no projeto da Google Cloud (só o seletor estava ativo)
  if (/accessNotConfigured|SERVICE_DISABLED/i.test(reason) || /has not been used|is disabled/i.test(text)) {
    return 'O Google Drive não está disponível de momento. Tente de novo mais tarde.';
  }
  if (/insufficient|PERMISSION_DENIED|forbidden/i.test(reason) || err.status === 403 || (err.status === 404 && !wasImported)) {
    // Ficheiro escolhido mas sem acesso dado ao LeadsFlow: escolher de novo no seletor
    return 'Sem acesso a este ficheiro. Volte a escolhê-lo no Google Drive.';
  }
  if (err.status === 404) return 'O ficheiro já não está disponível no Google Drive.';
  if (/excede/.test(text)) return text;
  return 'Não foi possível ler o ficheiro.';
}

/** Lê um ficheiro do Drive e grava o texto (force: lê mesmo sem alterações no Drive) */
async function syncOne(token: string, row: any, force: boolean): Promise<'updated' | 'unchanged' | 'failed' | 'removed'> {
  try {
    const meta = await driveFileMeta(token, row.external_id);
    if (!force && row.external_modified_at && meta.modifiedTime
      && new Date(meta.modifiedTime).getTime() <= new Date(row.external_modified_at).getTime() && row.status === 'ready') {
      await query('UPDATE assistant_knowledge_files SET synced_at = NOW() WHERE id = $1', [row.id]);
      return 'unchanged';
    }
    const { text, bytes } = await driveFileText(token, meta);
    const clean = text.trim();
    await query(
      `UPDATE assistant_knowledge_files
          SET file_name = $2, mime_type = $3, size_bytes = $4, text_content = $5, char_count = $6,
              status = $7, error_message = $8, external_modified_at = $9, synced_at = NOW(), updated_at = NOW()
        WHERE id = $1`,
      [row.id, meta.name.slice(0, 255), meta.mimeType, bytes, clean, clean.length,
        clean ? 'ready' : 'failed', clean ? null : 'O documento não tem texto para ler.', meta.modifiedTime || null]
    );
    return clean ? 'updated' : 'failed';
  } catch (err: any) {
    console.warn(`[GoogleDrive] Ler ${row.external_id}: ${err.status || ''} ${err.reason || ''} ${err.message}`);
    // "Removido" só quando já tinha sido lido e o Drive deixou de o ter
    const gone = err.status === 404 && !!row.external_modified_at;
    await query(
      `UPDATE assistant_knowledge_files SET status = 'failed', error_message = $2, synced_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [row.id, driveErrorMessage(err, !!row.external_modified_at)]
    );
    return gone ? 'removed' : 'failed';
  }
}

/** Lê os ficheiros do Drive de um assistente (todos, ou só os indicados) */
export async function syncDriveFiles(userId: string, assistantId: string, opts: { ids?: string[]; force?: boolean } = {}) {
  await ensureDriveTables();
  const rows = (await query(
    `SELECT id, external_id, external_modified_at, status FROM assistant_knowledge_files
      WHERE user_assistant_id = $1 AND user_id = $2 AND source = 'google_drive'
        ${opts.ids?.length ? 'AND id = ANY($3::uuid[])' : ''}`,
    opts.ids?.length ? [assistantId, userId, opts.ids] : [assistantId, userId]
  )).rows;
  const result = { updated: 0, unchanged: 0, failed: 0, removed: 0 };
  if (rows.length === 0) return result;
  let token: string;
  try {
    token = await driveAccessToken(userId);
  } catch (err: any) {
    await query(
      `UPDATE assistant_knowledge_files SET status = CASE WHEN status = 'processing' THEN 'failed' ELSE status END,
              error_message = CASE WHEN status = 'processing' THEN $2 ELSE error_message END
        WHERE id = ANY($1::uuid[])`,
      [rows.map((r: any) => r.id), 'Ligue de novo o Google Drive.']
    );
    throw err;
  }
  for (const row of rows) result[await syncOne(token, row, !!opts.force || row.status !== 'ready')]++;
  return result;
}

/** Sincronização automática (de 6 em 6 horas): só ficheiros que mudaram no Drive */
export async function syncAllDriveFiles(): Promise<void> {
  if (!isDriveConfigured()) return;
  await ensureDriveTables();
  const pairs = (await query(
    `SELECT DISTINCT f.user_id, f.user_assistant_id FROM assistant_knowledge_files f
       JOIN google_drive_connections g ON g.user_id = f.user_id
      WHERE f.source = 'google_drive' AND (f.synced_at IS NULL OR f.synced_at < NOW() - INTERVAL '6 hours')
      LIMIT 200`
  )).rows;
  for (const p of pairs) {
    try { await syncDriveFiles(p.user_id, p.user_assistant_id); } catch { /* fica para a próxima */ }
  }
}

// ── Páginas mostradas no browser durante o fluxo ──────────────────────────────────────

export const esc = (v: string) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
export const js = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');

/** Política de segurança das páginas (scripts só com nonce; o seletor vem dos domínios do Google) */
export function drivePageCsp(nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}' https://apis.google.com https://*.google.com https://*.gstatic.com https://*.googleusercontent.com`,
    'connect-src https://*.googleapis.com https://*.google.com',
    'frame-src https://docs.google.com https://drive.google.com https://*.google.com https://*.googleusercontent.com',
    "img-src 'self' data: https:",
    "style-src 'unsafe-inline' https://*.gstatic.com https://*.google.com",
    'font-src https://fonts.gstatic.com',
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

export function shell(title: string, body: string, script = '', nonce = ''): string {
  return `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#111827}
.card{background:#fff;border:1px solid #E5E7EB;border-radius:14px;padding:28px;max-width:380px;width:calc(100% - 32px);text-align:center}
.logo{width:40px;height:40px;border-radius:10px;margin:0 auto 14px;display:block}h1{font-size:18px;margin:0 0 8px}p{font-size:14px;line-height:1.5;color:#6B7280;margin:0 0 18px}
button{height:40px;padding:0 18px;border:0;border-radius:8px;background:#2563EB;color:#fff;font-size:14px;font-weight:600;cursor:pointer}
.spin{width:22px;height:22px;border:3px solid #DBEAFE;border-top-color:#2563EB;border-radius:50%;margin:0 auto 14px;animation:s 1s linear infinite}@keyframes s{to{transform:rotate(360deg)}}</style>
</head><body><div class="card"><img class="logo" src="${esc(process.env.EMAIL_LOGO_URL || 'https://app.leadsflowapi.com/email/logo.png')}" alt="LeadsFlow">${body}</div>${script.replace(/<script(?= |>)/g, `<script nonce="${nonce}"`)}</body></html>`;
}

/** Seletor de ficheiros do Google (Picker) com o acesso acabado de obter */
export function pickerPage(accessToken: string, state: string, cancelUrl: string, nonce: string): string {
  const importUrl = `${apiBaseUrl()}/api/oauth/google-drive/import`;
  return shell('Escolher ficheiros do Google Drive', `<div class="spin" id="spin"></div><h1>Google Drive</h1><p id="msg">A abrir os seus ficheiros…</p>
<button id="again" style="display:none">Escolher ficheiros</button>`,
  `<script>
var TOKEN=${js(accessToken)}, KEY=${js(driveApiKey())}, APP=${js(driveAppId())}, STATE=${js(state)}, IMPORT=${js(importUrl)}, CANCEL=${js(cancelUrl)}, MIMES=${js(DRIVE_MIME_TYPES.join(','))};
function openPicker(){
  var view=new google.picker.DocsView(google.picker.ViewId.DOCS).setMimeTypes(MIMES).setIncludeFolders(true).setSelectFolderEnabled(false).setMode(google.picker.DocsViewMode.LIST);
  var picker=new google.picker.PickerBuilder()
    .addView(view).enableFeature(google.picker.Feature.MULTISELECT_ENABLED).enableFeature(google.picker.Feature.SUPPORT_DRIVES)
    .setOAuthToken(TOKEN).setDeveloperKey(KEY).setAppId(APP).setLocale('pt').setTitle('Escolha os documentos para o assistente')
    .setCallback(function(d){
      if(d.action===google.picker.Action.PICKED){
        var ids=(d.docs||[]).map(function(x){return x.id}).join(',');
        document.getElementById('msg').textContent='A importar…';document.getElementById('spin').style.display='block';
        location.href=IMPORT+'?state='+encodeURIComponent(STATE)+'&ids='+encodeURIComponent(ids);
      } else if(d.action===google.picker.Action.CANCEL){ location.href=CANCEL; }
    }).build();
  picker.setVisible(true);
  document.getElementById('spin').style.display='none';
  document.getElementById('msg').textContent='Escolha os documentos que o assistente pode consultar.';
  document.getElementById('again').style.display='inline-block';
}
document.getElementById('again').addEventListener('click',openPicker);
var s=document.createElement('script');s.src='https://apis.google.com/js/api.js';s.async=true;s.nonce=${js(nonce)};
s.onload=function(){ gapi.load('picker',{callback:openPicker}); };
s.onerror=function(){ document.getElementById('spin').style.display='none'; document.getElementById('msg').textContent='Não foi possível abrir o Google Drive. Tente de novo.'; };
document.head.appendChild(s);
</script>`, nonce);
}

/** Fim na web: avisa o painel (janela que abriu) e fecha */
export function donePage(params: Record<string, string>, nonce: string): string {
  const ok = params.drive === 'importing';
  const title = ok ? 'Documentos a importar' : params.drive === 'cancelled' ? 'Cancelado' : 'Não foi possível ligar';
  const text = ok ? 'Pode fechar esta janela. Os documentos aparecem no assistente dentro de momentos.'
    : params.drive === 'cancelled' ? 'Não foi escolhido nenhum ficheiro.' : 'Tente de novo dentro de momentos.';
  return shell(title, `<h1>${esc(title)}</h1><p>${esc(text)}</p><button id="close">Fechar</button>`,
    `<script>document.getElementById('close').addEventListener('click',function(){window.close()});try{if(window.opener){window.opener.postMessage(${js({ type: 'leadsflow-drive', ...params })},'*');setTimeout(function(){window.close()},600);}}catch(e){}</script>`, nonce);
}
