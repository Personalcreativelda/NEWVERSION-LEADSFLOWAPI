// Cópias de segurança da base de dados (Administração → Cópias de segurança).
//
//   pg_dump (formato próprio, comprimido) → cifrado AES-256-GCM → MinIO (bucket privado próprio)
//                                                              └→ armazenamento externo S3 (opcional)
//
// Porquê fora da VPS: a base de dados e o MinIO estão no mesmo servidor; se a VPS se perder, só sobrevivem
// as cópias descarregadas pelo administrador ou enviadas para BACKUP_S3_* (Cloudflare R2, Backblaze B2, AWS…).
//
// Ficheiro .lfbak = "LFBK1" + 8 bytes da impressão da chave + 12 bytes IV + dados cifrados + 16 bytes tag.
// A chave é BACKUP_ENCRYPTION_KEY (ou CHANNEL_SECRETS_KEY): sem ela uma cópia não se abre — guardar fora da VPS.
//
// A lista das cópias vem do próprio armazenamento (não de uma tabela): restaurar uma cópia antiga não
// apaga a lista das mais recentes. Restaurar faz antes uma cópia do estado atual ("antes de restaurar").
import { spawn } from 'child_process';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { createReadStream, createWriteStream, promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pipeline } from 'stream/promises';

const MAGIC = Buffer.from('LFBK1');
const HEADER = MAGIC.length + 8 + 12;
const TAG = 16;
const PREFIX = 'database/';
const KEEP = Math.max(Number(process.env.BACKUP_KEEP) || 14, 3);

export type BackupTrigger = 'manual' | 'auto' | 'pre_restore';

export interface BackupInfo {
  name: string;
  size: number;
  created_at: string;
  trigger: BackupTrigger;
  local: boolean;
  offsite: boolean;
}

export class BackupError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

// ── Chave ──
function rawKey(): string {
  return process.env.BACKUP_ENCRYPTION_KEY || process.env.CHANNEL_SECRETS_KEY || '';
}
function key(): Buffer {
  const k = rawKey();
  if (!k) throw new BackupError('Defina BACKUP_ENCRYPTION_KEY (ou CHANNEL_SECRETS_KEY) no servidor', 503);
  return createHash('sha256').update(`leadsflow-backup:${k}`).digest();
}
const keyFingerprint = () => createHash('sha256').update(key()).digest().subarray(0, 8);

// ── Armazenamento (MinIO local + S3 externo opcional) ──
interface Store { client: any; bucket: string; label: 'local' | 'offsite' }

function minioClient(opts: { endPoint: string; port?: number; useSSL: boolean; accessKey: string; secretKey: string; region?: string }) {
  const Client = require('minio').Client;
  return new Client(opts);
}

let localStore: Store | null | undefined;
function local(): Store | null {
  if (localStore !== undefined) return localStore;
  const endPoint = process.env.MINIO_ENDPOINT;
  const accessKey = process.env.MINIO_ACCESS_KEY || process.env.SERVICE_USER_MINIO || '';
  const secretKey = process.env.MINIO_SECRET_KEY || process.env.SERVICE_PASSWORD_MINIO || '';
  localStore = endPoint && accessKey && secretKey
    ? {
      client: minioClient({ endPoint, port: parseInt(process.env.MINIO_PORT || '9000', 10), useSSL: process.env.MINIO_USE_SSL === 'true', accessKey, secretKey }),
      bucket: process.env.MINIO_BACKUP_BUCKET || 'leadsflow-backups',
      label: 'local',
    }
    : null;
  return localStore;
}

let offsiteStore: Store | null | undefined;
function offsite(): Store | null {
  if (offsiteStore !== undefined) return offsiteStore;
  const raw = (process.env.BACKUP_S3_ENDPOINT || '').trim();
  const accessKey = process.env.BACKUP_S3_ACCESS_KEY || '';
  const secretKey = process.env.BACKUP_S3_SECRET_KEY || '';
  const bucket = process.env.BACKUP_S3_BUCKET || '';
  if (!raw || !accessKey || !secretKey || !bucket) return (offsiteStore = null);
  const url = new URL(/^https?:\/\//.test(raw) ? raw : `https://${raw}`);
  offsiteStore = {
    client: minioClient({
      endPoint: url.hostname, port: url.port ? Number(url.port) : undefined, useSSL: url.protocol === 'https:',
      accessKey, secretKey, region: process.env.BACKUP_S3_REGION || 'auto',
    }),
    bucket,
    label: 'offsite',
  };
  return offsiteStore;
}

export const backupStatus = () => ({
  local: !!local(),
  offsite: !!offsite(),
  encryption: !!rawKey(),
  keep: KEEP,
  hour: autoHour(),
});

async function ensureBucket(s: Store) {
  if (s.label !== 'local') return; // no externo o bucket é criado pela pessoa
  const exists = await s.client.bucketExists(s.bucket).catch(() => false);
  if (!exists) {
    await s.client.makeBucket(s.bucket, process.env.MINIO_REGION || 'us-east-1');
    // Só GET por endereço assinado (descarregar no painel); o bucket nunca fica público
    await s.client.setBucketCors?.(s.bucket, [{ AllowedOrigins: ['*'], AllowedMethods: ['GET'], AllowedHeaders: ['*'], MaxAgeSeconds: 3600 }]).catch(() => {});
  }
}

async function listStore(s: Store): Promise<{ name: string; size: number; lastModified: Date }[]> {
  return new Promise((resolve, reject) => {
    const out: any[] = [];
    const stream = s.client.listObjectsV2(s.bucket, PREFIX, true);
    stream.on('data', (o: any) => { if (o?.name?.endsWith('.lfbak')) out.push(o); });
    stream.on('end', () => resolve(out));
    stream.on('error', reject);
  });
}

// leadsflow-2026-11-27T03-00-00Z-auto.lfbak
const fileName = (trigger: BackupTrigger) => `leadsflow-${new Date().toISOString().replace(/[:.]/g, '-')}-${trigger}.lfbak`;
const safeName = (name: string) => /^leadsflow-[0-9T\-Z]+-(manual|auto|pre_restore)\.lfbak$/.test(name);
function parseName(name: string): { created_at: string; trigger: BackupTrigger } {
  const m = name.match(/^leadsflow-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z-(manual|auto|pre_restore)\.lfbak$/);
  if (!m) return { created_at: '', trigger: 'manual' };
  return { created_at: `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${m[7]}Z`, trigger: m[8] as BackupTrigger };
}

export async function listBackups(): Promise<BackupInfo[]> {
  const byName = new Map<string, BackupInfo>();
  for (const s of [local(), offsite()].filter(Boolean) as Store[]) {
    const items = await listStore(s).catch((err) => {
      console.warn(`[Backup] Não foi possível listar ${s.label}:`, err?.message);
      return [];
    });
    for (const o of items) {
      const name = o.name.slice(PREFIX.length);
      const cur = byName.get(name) || { name, size: o.size, ...parseName(name), local: false, offsite: false };
      cur[s.label] = true;
      byName.set(name, cur);
    }
  }
  return [...byName.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// ── Ferramentas do PostgreSQL ──
function pgEnv() {
  return {
    ...process.env,
    PGHOST: process.env.PG_HOST || 'localhost',
    PGPORT: process.env.PG_PORT || '5432',
    PGDATABASE: process.env.PG_DATABASE || 'leadsflow',
    PGUSER: process.env.PG_USER || 'postgres',
    PGPASSWORD: process.env.PG_PASSWORD || '',
    ...(process.env.PG_SSL === 'true' ? { PGSSLMODE: 'require' } : {}),
  };
}

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { env: pgEnv() });
    let err = '';
    let out = '';
    p.stdout.on('data', (d) => { out += d; if (out.length > 200_000) out = out.slice(-200_000); });
    p.stderr.on('data', (d) => { err += d; if (err.length > 20_000) err = err.slice(-20_000); });
    p.on('error', (e: any) => reject(new BackupError(
      e?.code === 'ENOENT' ? `${cmd} não está instalado no servidor da API` : e?.message, 500)));
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new BackupError(`${cmd} falhou: ${err.trim().split('\n').slice(-3).join(' ')}`, 500))));
  });
}

// ── Cifrar / decifrar (em ficheiros, sem carregar tudo em memória) ──
async function encryptFile(src: string, dst: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const out = createWriteStream(dst);
  out.write(Buffer.concat([MAGIC, keyFingerprint(), iv]));
  // Dados cifrados a seguir ao cabeçalho; o ficheiro só fecha depois de escrita a tag
  await new Promise<void>((resolve, reject) => {
    const input = createReadStream(src);
    input.on('error', reject);
    cipher.on('error', reject);
    out.on('error', reject);
    cipher.on('end', resolve);
    input.pipe(cipher).pipe(out, { end: false });
  });
  await new Promise<void>((resolve, reject) => {
    out.on('error', reject);
    out.end(cipher.getAuthTag(), () => resolve());
  });
}

async function decryptFile(src: string, dst: string) {
  const { size } = await fs.stat(src);
  if (size < HEADER + TAG) throw new BackupError('Ficheiro inválido: não é uma cópia da LeadsFlow');
  const fh = await fs.open(src, 'r');
  const head = Buffer.alloc(HEADER);
  const tag = Buffer.alloc(TAG);
  await fh.read(head, 0, HEADER, 0);
  await fh.read(tag, 0, TAG, size - TAG);
  await fh.close();
  if (!head.subarray(0, MAGIC.length).equals(MAGIC)) throw new BackupError('Ficheiro inválido: não é uma cópia da LeadsFlow');
  if (!head.subarray(MAGIC.length, MAGIC.length + 8).equals(keyFingerprint())) {
    throw new BackupError('Esta cópia foi feita com outra chave (BACKUP_ENCRYPTION_KEY / CHANNEL_SECRETS_KEY)');
  }
  const decipher = createDecipheriv('aes-256-gcm', key(), head.subarray(MAGIC.length + 8));
  decipher.setAuthTag(tag);
  try {
    await pipeline(createReadStream(src, { start: HEADER, end: size - TAG - 1 }), decipher, createWriteStream(dst));
  } catch {
    await fs.rm(dst, { force: true });
    throw new BackupError('A cópia está danificada ou foi alterada');
  }
}

// ── Uma operação de cada vez ──
let busy: string | null = null;
async function exclusive<T>(what: string, fn: () => Promise<T>): Promise<T> {
  if (busy) throw new BackupError(`Já está a decorrer: ${busy}`, 409);
  busy = what;
  try { return await fn(); } finally { busy = null; }
}
export const backupBusy = () => busy;

const tmp = (suffix: string) => join(tmpdir(), `lf-${Date.now()}-${randomBytes(4).toString('hex')}${suffix}`);

// ── Criar ──
async function createUnlocked(trigger: BackupTrigger): Promise<BackupInfo> {
  const stores = [local(), offsite()].filter(Boolean) as Store[];
  if (!stores.length) throw new BackupError('Sem armazenamento para as cópias (MinIO ou BACKUP_S3_*)', 503);
  key(); // falha já se não houver chave
  const dump = tmp('.dump');
  const enc = tmp('.lfbak');
  const name = fileName(trigger);
  try {
    const started = Date.now();
    await run('pg_dump', ['--format=custom', '--compress=6', '--no-owner', '--no-acl', `--file=${dump}`]);
    await encryptFile(dump, enc);
    const { size } = await fs.stat(enc);
    const info: BackupInfo = { name, size, ...parseName(name), local: false, offsite: false };
    for (const s of stores) {
      try {
        await ensureBucket(s);
        await s.client.fPutObject(s.bucket, PREFIX + name, enc, { 'Content-Type': 'application/octet-stream' });
        info[s.label] = true;
      } catch (err: any) {
        console.error(`[Backup] Envio para ${s.label} falhou:`, err?.message);
      }
    }
    if (!info.local && !info.offsite) throw new BackupError('Não foi possível guardar a cópia no armazenamento', 502);
    console.log(`[Backup] ✅ ${name} (${Math.round(size / 1024)} KB, ${Math.round((Date.now() - started) / 1000)} s) local=${info.local} externo=${info.offsite}`);
    return info;
  } finally {
    await fs.rm(dump, { force: true });
    await fs.rm(enc, { force: true });
  }
}

export const createBackup = (trigger: BackupTrigger = 'manual') => exclusive('cópia de segurança', async () => {
  const info = await createUnlocked(trigger);
  if (trigger === 'auto') await prune().catch((err) => console.warn('[Backup] Limpeza:', err?.message));
  return info;
});

/** Mantém as KEEP cópias automáticas mais recentes (manuais e "antes de restaurar" ficam) */
async function prune() {
  const autos = (await listBackups()).filter((b) => b.trigger === 'auto');
  for (const old of autos.slice(KEEP)) {
    for (const s of [local(), offsite()].filter(Boolean) as Store[]) {
      await s.client.removeObject(s.bucket, PREFIX + old.name).catch(() => {});
    }
  }
}

/** Endereço temporário (10 min) para descarregar uma cópia */
export async function downloadUrl(name: string): Promise<string> {
  if (!safeName(name)) throw new BackupError('Cópia inválida', 404);
  const list = await listBackups();
  const b = list.find((x) => x.name === name);
  if (!b) throw new BackupError('Cópia não encontrada', 404);
  const s = (b.local ? local() : offsite())!;
  return s.client.presignedGetObject(s.bucket, PREFIX + name, 10 * 60, {
    'response-content-disposition': `attachment; filename="${name}"`,
  });
}

export async function deleteBackup(name: string) {
  if (!safeName(name)) throw new BackupError('Cópia inválida', 404);
  for (const s of [local(), offsite()].filter(Boolean) as Store[]) {
    await s.client.removeObject(s.bucket, PREFIX + name).catch(() => {});
  }
}

// ── Restaurar ──
/**
 * Substitui a base de dados pela cópia: valida o ficheiro, faz uma cópia do estado atual e restaura tudo
 * numa só transação (se falhar a meio, nada muda). `source` = nome de uma cópia guardada ou ficheiro enviado.
 */
export const restoreBackup = (source: { name?: string; uploadedPath?: string }) => exclusive('restauro', async () => {
  const enc = source.uploadedPath || tmp('.lfbak');
  const dump = tmp('.dump');
  try {
    if (!source.uploadedPath) {
      const name = String(source.name || '');
      if (!safeName(name)) throw new BackupError('Cópia inválida', 404);
      const b = (await listBackups()).find((x) => x.name === name);
      if (!b) throw new BackupError('Cópia não encontrada', 404);
      const s = (b.local ? local() : offsite())!;
      await s.client.fGetObject(s.bucket, PREFIX + name, enc);
    }
    await decryptFile(enc, dump);
    await run('pg_restore', ['--list', dump]); // é mesmo uma cópia do PostgreSQL?
    const safety = await createUnlocked('pre_restore');
    await run('pg_restore', ['--clean', '--if-exists', '--no-owner', '--no-acl', '--single-transaction', '--exit-on-error', `--dbname=${pgEnv().PGDATABASE}`, dump]);
    console.log(`[Backup] ✅ Base de dados restaurada (cópia do estado anterior: ${safety.name})`);
    return { restored: true, safety_backup: safety.name };
  } finally {
    await fs.rm(enc, { force: true });
    await fs.rm(dump, { force: true });
  }
});

// ── Em segundo plano (o Cloudflare corta pedidos com mais de 100 s) ──
// O resultado fica num ficheiro: sobrevive ao reinício da API depois de restaurar.
const LAST_FILE = join(tmpdir(), 'leadsflow-backup-last.json');
export interface LastResult { op: 'backup' | 'restore'; ok: boolean; at: string; message: string; name?: string }

export async function lastResult(): Promise<LastResult | null> {
  try { return JSON.parse(await fs.readFile(LAST_FILE, 'utf8')); } catch { return null; }
}
const saveLast = (r: LastResult) => fs.writeFile(LAST_FILE, JSON.stringify(r)).catch(() => {});

/** Arranca a operação e devolve logo; erro imediato se já houver outra a decorrer */
export function startInBackground(op: 'backup' | 'restore', fn: () => Promise<{ name?: string; message: string }>, after?: () => void) {
  if (busy) throw new BackupError(`Já está a decorrer: ${busy}`, 409);
  void fn()
    .then(async (r) => { await saveLast({ op, ok: true, at: new Date().toISOString(), ...r }); after?.(); })
    .catch(async (err: any) => {
      console.error(`[Backup] ${op} falhou:`, err?.message);
      await saveLast({ op, ok: false, at: new Date().toISOString(), message: err instanceof BackupError ? err.message : 'Não foi possível concluir' });
    });
}

// ── Automático: uma vez por dia ──
const autoHour = () => {
  const h = Number(process.env.BACKUP_HOUR_UTC);
  return Number.isInteger(h) && h >= 0 && h <= 23 ? h : 1; // 01:00 UTC = 03:00 em Maputo
};

export const backupScheduler = {
  timer: null as NodeJS.Timeout | null,
  start() {
    if (process.env.DISABLE_AUTO_BACKUP === 'true' || this.timer) return;
    // Verifica a cada 15 min; faz a cópia na hora marcada se ainda não houver uma automática de hoje
    this.timer = setInterval(() => { void this.tick(); }, 15 * 60_000);
    this.timer.unref?.();
  },
  async tick() {
    try {
      if (new Date().getUTCHours() !== autoHour() || busy) return;
      if (!local() && !offsite()) return;
      const today = new Date().toISOString().slice(0, 10);
      const done = (await listBackups()).some((b) => b.trigger === 'auto' && b.created_at.startsWith(today));
      if (!done) await createBackup('auto');
    } catch (err: any) {
      console.error('[Backup] Cópia automática falhou:', err?.message);
    }
  },
};

export const _test = { encryptFile, decryptFile, parseName, safeName, fileName };
