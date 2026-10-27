// Envio pelo WhatsApp oficial (Cloud API): texto, imagens, vídeos, áudio, documentos e figurinhas.
//
// - Destinatário: o wa_id da conversa (remote_jid "<wa_id>@s.whatsapp.net", vindo do webhook)
//   vale mais do que o telefone do lead, que pode estar sem indicativo ou ser de outro lead.
// - Anexos: o ficheiro sobe primeiro para a Meta (/media) e a mensagem leva o id. Com `link`
//   a Meta descarregava o ficheiro mais tarde e, se falhasse, a mensagem nunca chegava.
// - Formatos que a Meta não aceita são convertidos (ver utils/media-convert.ts).
import { GRAPH_VERSION } from './meta-oauth.service';
import { getStorageService } from './storage.service';
import { storageKeyFromUrl } from '../utils/storage-urls';
import { convertToJpeg, convertToM4a, convertToOggOpus, convertToStickerWebp } from '../utils/media-convert';

const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const TIMEOUT_MS = 60_000;

export type CloudMediaKind = 'image' | 'video' | 'audio' | 'document' | 'sticker';

export interface CloudCredentials {
  phone_number_id?: string;
  access_token?: string;
}

export class CloudSendError extends Error {
  constructor(message: string, public metaCode?: number, public metaMessage?: string) { super(message); }
}

/** Erros da Meta em texto para quem usa o painel */
function friendlyError(code: number | undefined, message: string): string {
  switch (code) {
    case 131047: return 'Passaram mais de 24 horas desde a última mensagem deste contacto. Só é possível enviar um modelo aprovado.';
    case 131026: return 'Este número não pode receber mensagens no WhatsApp.';
    case 131030: return 'Este número não está na lista de destinatários de teste da conta WhatsApp Business.';
    case 133010: return 'O número do WhatsApp Business ainda não está ativo. Ative-o em Definições → WhatsApp Business.';
    case 131031: return 'A conta WhatsApp Business está bloqueada pela Meta.';
    case 131056: return 'Demasiadas mensagens para este contacto. Aguarde um pouco e tente de novo.';
    case 130429: case 80007: return 'Limite de envios da Meta atingido. Tente de novo dentro de momentos.';
    case 131053: return 'A Meta não aceitou o ficheiro (formato ou tamanho).';
    case 190: return 'A ligação ao WhatsApp Business expirou. Ligue o canal de novo.';
    case 10: case 200: return 'A app não tem permissão para enviar por este número. Ligue o canal de novo.';
    default: return `O WhatsApp não aceitou a mensagem: ${message}`;
  }
}

async function graph(path: string, token: string, init: { json?: any; form?: FormData }): Promise<any> {
  const res = await fetch(`${GRAPH}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, ...(init.json ? { 'Content-Type': 'application/json' } : {}) },
    body: init.json ? JSON.stringify(init.json) : init.form,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    const code = data?.error?.code;
    const msg = data?.error?.error_data?.details || data?.error?.message || `Meta respondeu ${res.status}`;
    console.error('[WhatsApp Cloud] Erro da Meta:', path.split('/').pop(), JSON.stringify(data?.error || data).slice(0, 500));
    throw new CloudSendError(friendlyError(code, msg), code, msg);
  }
  return data;
}

function requireCreds(creds: CloudCredentials | null | undefined): { phoneId: string; token: string } {
  const phoneId = creds?.phone_number_id;
  const token = creds?.access_token;
  if (!phoneId || !token) throw new CloudSendError('O canal WhatsApp Business não está configurado. Ligue-o de novo.');
  return { phoneId: String(phoneId), token };
}

/** Número para onde enviar: o wa_id da conversa ou, sem ele, o telefone do lead */
export function cloudRecipient(remoteJid?: string | null, phone?: string | null): string {
  const jid = String(remoteJid || '');
  if (jid.endsWith('@s.whatsapp.net')) {
    const waId = jid.split('@')[0].replace(/\D/g, '');
    if (waId) return waId;
  }
  return String(phone || '').replace(/\D/g, '');
}

/** Tipo de anexo do WhatsApp a partir do media_type do painel ("image", "image/png"…) */
export function cloudMediaKind(mediaType?: string | null): CloudMediaKind {
  const t = String(mediaType || '').toLowerCase();
  if (t === 'sticker') return 'sticker';
  if (t.startsWith('image')) return 'image';
  if (t.startsWith('video')) return 'video';
  if (t.startsWith('audio') || t === 'ptt' || t === 'voice') return 'audio';
  return 'document';
}

export async function sendCloudText(creds: CloudCredentials | null | undefined, to: string, body: string): Promise<any> {
  const { phoneId, token } = requireCreds(creds);
  if (!to) throw new CloudSendError('Este contacto não tem número de WhatsApp.');
  return graph(`/${encodeURIComponent(phoneId)}/messages`, token, {
    json: { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { body, preview_url: true } },
  });
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic',
  mp4: 'video/mp4', '3gp': 'video/3gpp', webm: 'video/webm', mov: 'video/quicktime',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac', amr: 'audio/amr', wav: 'audio/wav',
  pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
};

/** Tipo pelo conteúdo (os ficheiros gravados no app chegam muitas vezes sem tipo certo) */
function sniffMime(buf: Buffer): string | null {
  const hex = buf.subarray(0, 12).toString('hex');
  if (hex.startsWith('ffd8ff')) return 'image/jpeg';
  if (hex.startsWith('89504e47')) return 'image/png';
  if (hex.startsWith('47494638')) return 'image/gif';
  if (hex.startsWith('52494646') && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (hex.startsWith('1a45dfa3')) return 'video/webm';
  if (hex.startsWith('4f676753')) return 'audio/ogg';
  if (hex.startsWith('25504446')) return 'application/pdf';
  if (buf.subarray(4, 8).toString() === 'ftyp') {
    const brand = buf.subarray(8, 12).toString();
    if (/^M4A|^M4B/.test(brand)) return 'audio/mp4';
    if (/^heic|^heix|^mif1/.test(brand)) return 'image/heic';
    return /^3gp/.test(brand) ? 'video/3gpp' : 'video/mp4';
  }
  return null;
}

interface LoadedFile { buffer: Buffer; mime: string; filename: string }

/** Lê um ficheiro do armazenamento da LeadsFlow (ou de um URL externo) */
export async function loadMediaFile(url: string): Promise<LoadedFile> {
  let buffer: Buffer | null = null;
  let headerMime = '';
  const storage = getStorageService();
  if (storageKeyFromUrl(url) && storage.getFileStream) {
    const stream = await storage.getFileStream(url).catch(() => null);
    if (stream) {
      const chunks: Buffer[] = [];
      for await (const chunk of stream as any) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      buffer = Buffer.concat(chunks);
    }
  }
  if (!buffer) {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new CloudSendError('Não foi possível ler o ficheiro para enviar. Anexe-o de novo.');
    buffer = Buffer.from(await res.arrayBuffer());
    headerMime = (res.headers.get('content-type') || '').split(';')[0].trim();
  }
  const rawName = decodeURIComponent(url.split('?')[0].split('/').pop() || 'ficheiro');
  // As chaves gravadas têm o formato <timestamp>_<nome original>
  const filename = rawName.replace(/^\d{10,}_/, '') || 'ficheiro';
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const mime = sniffMime(buffer) || MIME_BY_EXT[ext] || (headerMime && headerMime !== 'application/octet-stream' ? headerMime : '') || 'application/octet-stream';
  return { buffer, mime, filename };
}

const IMAGE_OK = new Set(['image/jpeg', 'image/png']);
const VIDEO_OK = new Set(['video/mp4', 'video/3gpp']);
const AUDIO_OK = new Set(['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr']);
const LIMITS: Record<CloudMediaKind, number> = {
  image: 5 * 1024 * 1024, video: 16 * 1024 * 1024, audio: 16 * 1024 * 1024, document: 100 * 1024 * 1024, sticker: 500 * 1024,
};

/** Ajusta o ficheiro ao que o WhatsApp aceita para cada tipo (pode passar a documento) */
async function prepare(kind: CloudMediaKind, file: LoadedFile): Promise<{ kind: CloudMediaKind; file: LoadedFile }> {
  const base = file.filename.replace(/\.[^.]+$/, '') || 'ficheiro';
  try {
    if (kind === 'sticker') {
      if (file.mime === 'image/webp' && file.buffer.length <= 100 * 1024) return { kind, file };
      const webp = await convertToStickerWebp(file.buffer);
      return { kind, file: { buffer: webp, mime: 'image/webp', filename: `${base}.webp` } };
    }
    if (kind === 'image' && !IMAGE_OK.has(file.mime)) {
      if (!file.mime.startsWith('image/')) return { kind: 'document', file };
      const jpg = await convertToJpeg(file.buffer);
      return { kind, file: { buffer: jpg, mime: 'image/jpeg', filename: `${base}.jpg` } };
    }
    if (kind === 'audio' && !AUDIO_OK.has(file.mime)) {
      // OGG/WebM gravados no app → OGG Opus (mensagem de voz); sem libopus, M4A
      try {
        return { kind, file: { buffer: await convertToOggOpus(file.buffer), mime: 'audio/ogg', filename: `${base}.ogg` } };
      } catch (err: any) {
        console.warn('[WhatsApp Cloud] OGG Opus falhou, a usar M4A:', err?.message);
        return { kind, file: { buffer: await convertToM4a(file.buffer), mime: 'audio/mp4', filename: `${base}.m4a` } };
      }
    }
    if (kind === 'video' && !VIDEO_OK.has(file.mime)) return { kind: 'document', file };
  } catch (err: any) {
    console.error('[WhatsApp Cloud] Conversão falhou:', kind, file.mime, err?.message);
    if (kind === 'sticker' || kind === 'audio') throw new CloudSendError('Não foi possível preparar o ficheiro para o WhatsApp.');
    return { kind: 'document', file };
  }
  return { kind, file };
}

/** Sobe o ficheiro para a Meta e envia-o. `kind` é o que o painel pediu (pode mudar para documento). */
export async function sendCloudMedia(
  creds: CloudCredentials | null | undefined,
  to: string,
  opts: { kind: CloudMediaKind; url?: string; file?: LoadedFile; caption?: string },
): Promise<{ result: any; kind: CloudMediaKind }> {
  const { phoneId, token } = requireCreds(creds);
  if (!to) throw new CloudSendError('Este contacto não tem número de WhatsApp.');
  const original = opts.file || (opts.url ? await loadMediaFile(opts.url) : null);
  if (!original) throw new CloudSendError('Ficheiro em falta.');

  const { kind, file } = await prepare(opts.kind, original);
  if (file.buffer.length > LIMITS[kind]) {
    const mb = Math.round(LIMITS[kind] / 1024 / 1024) || 0.5;
    throw new CloudSendError(`O ficheiro é grande demais para o WhatsApp (máximo ${mb} MB).`);
  }

  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', file.mime);
  form.append('file', new Blob([new Uint8Array(file.buffer)], { type: file.mime }), file.filename);
  const upload = await graph(`/${encodeURIComponent(phoneId)}/media`, token, { form });

  const media: Record<string, any> = { id: upload.id };
  const caption = (opts.caption || '').trim();
  if (caption && (kind === 'image' || kind === 'video' || kind === 'document')) media.caption = caption;
  if (kind === 'document') media.filename = file.filename;

  const result = await graph(`/${encodeURIComponent(phoneId)}/messages`, token, {
    json: { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: kind, [kind]: media },
  });
  // A legenda não vai com áudio nem figurinhas: segue numa mensagem de texto
  if (caption && (kind === 'audio' || kind === 'sticker')) await sendCloudText(creds, to, caption).catch(() => {});
  return { result, kind };
}
