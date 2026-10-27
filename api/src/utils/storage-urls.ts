/**
 * Esconde o endereço do armazenamento (MinIO) dos utilizadores.
 *
 * Os ficheiros continuam guardados no MinIO e os URLs na base de dados não mudam;
 * o que sai da API (respostas JSON e eventos WebSocket) passa a apontar para
 * `<API>/api/files/<chave>`, servido por routes/files.routes.ts.
 */

const FILES_PATH = '/api/files/';

// Formato das chaves criadas pelo storage.service (uploadBuffer / presigned):
// <pasta>/users/<utilizador>/<timestamp>_<nome>  ou  <pasta>/<timestamp>_<nome>
const KEY_PATTERN = /^[a-z0-9-]+\/(users\/[A-Za-z0-9_]+\/)?\d+_[^/]+$/;

function bucket(): string {
  return process.env.MINIO_BUCKET || 'leadflow-avatars';
}

/** Prefixos (com o bucket) pelos quais os URLs do MinIO começam */
function storagePrefixes(): string[] {
  const prefixes: string[] = [];
  const b = bucket();

  const publicUrl = (process.env.MINIO_PUBLIC_URL || '').trim().replace(/\/$/, '');
  if (publicUrl) {
    const base = /^https?:\/\//.test(publicUrl) ? publicUrl : `https://${publicUrl}`;
    prefixes.push(`${base}/${b}/`);
  }

  const endpoint = process.env.MINIO_ENDPOINT;
  if (endpoint) {
    const ssl = process.env.MINIO_USE_SSL === 'true';
    const protocol = ssl ? 'https' : 'http';
    const port = parseInt(process.env.MINIO_PORT || '9000', 10);
    const needsPort = (ssl && port !== 443) || (!ssl && port !== 80);
    prefixes.push(`${protocol}://${endpoint}${needsPort ? `:${port}` : ''}/${b}/`);
  }

  return [...new Set(prefixes)];
}

/** Endereço público da API (o que os telemóveis/browsers usam) */
function apiPublicBase(): string | null {
  const raw = process.env.API_PUBLIC_URL || process.env.WEBHOOK_URL || process.env.API_URL || process.env.BACKEND_URL || '';
  const base = raw.trim().replace(/\/$/, '');
  return /^https?:\/\//.test(base) ? base : null;
}

/** Chave do ficheiro a partir de um URL do MinIO ou de /api/files/ */
export function storageKeyFromUrl(url: string): string | null {
  const filesIndex = url.indexOf(FILES_PATH);
  if (filesIndex >= 0) return decodeURIComponent(url.slice(filesIndex + FILES_PATH.length).split('?')[0]);
  const parts = url.split(`/${bucket()}/`);
  return parts.length >= 2 ? decodeURIComponent(parts[1].split('?')[0]) : null;
}

/** Só ficheiros criados pela própria API podem ser servidos por /api/files */
export function isServableKey(key: string): boolean {
  return !key.includes('..') && !key.startsWith('mobile-bundles/') && KEY_PATTERN.test(key);
}

/** Troca os URLs do MinIO por URLs da API num texto JSON */
export function rewriteStorageUrlsInJson(json: string, baseOverride?: string | null): string {
  const base = baseOverride || apiPublicBase();
  if (!base || !json) return json;
  let out = json;
  for (const prefix of storagePrefixes()) {
    if (!out.includes(prefix)) continue;
    // Só reescreve chaves que /api/files consegue servir; ficheiros antigos com outro
    // formato de chave mantêm o URL original para não ficarem partidos
    const pattern = new RegExp(prefix.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + '([^"\\\\\\s?#]+)', 'g');
    out = out.replace(pattern, (match, key: string, offset: number, whole: string) => {
      // URLs com query (ex.: upload pré-assinado ?X-Amz-...) têm de ir direto ao MinIO
      const next = whole.charAt(offset + match.length);
      if (next === '?' || next === '#') return match;
      let decoded = key;
      try {
        decoded = decodeURIComponent(key);
      } catch {
        return match;
      }
      return isServableKey(decoded) ? `${base}${FILES_PATH}${key}` : match;
    });
  }
  return out;
}

/** Igual a rewriteStorageUrlsInJson, para objetos (ex.: eventos WebSocket) */
export function rewriteStorageUrls<T>(value: T): T {
  if (value === null || value === undefined || !apiPublicBase()) return value;
  try {
    const json = JSON.stringify(value);
    const rewritten = rewriteStorageUrlsInJson(json);
    return rewritten === json ? value : JSON.parse(rewritten);
  } catch {
    return value;
  }
}

/**
 * URL público de um ficheiro nosso pela API (/api/files/<chave>), para serviços de fora
 * (ex.: a Meta descarregar um áudio). Sem endereço público da API, devolve o original.
 */
export function publicFileUrl(url: string): string {
  return JSON.parse(rewriteStorageUrlsInJson(JSON.stringify(url)));
}

/** true se o URL é um ficheiro do nosso armazenamento (MinIO) */
export function isStorageUrl(url: string): boolean {
  return storagePrefixes().some((prefix) => url.startsWith(prefix));
}
