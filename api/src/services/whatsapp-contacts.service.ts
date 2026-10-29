// Contactos do WhatsApp ligado por código QR (Evolution) para importar como leads.
// Só contactos individuais com número válido e com WhatsApp, sem repetidos, com a foto
// de perfil, e marcados quando o número já é um lead.
import { query } from '../database/connection';
import { getStorageService } from './storage.service';
import type { WhatsAppService } from './whatsapp.service';

export interface WhatsAppImportContact {
  number: string;         // só dígitos, com indicativo
  name: string;           // nome do contacto ('' se o WhatsApp não tiver)
  avatar: string | null;  // foto de perfil (link do WhatsApp; expira)
  existing: boolean;      // o número já é um lead
}

const CHECK_BATCH = 100;
const CHECK_PARALLEL = 3;
/** Tempo máximo para confirmar números na Evolution; o resto fica como veio da lista do WhatsApp */
const CHECK_BUDGET_MS = 40_000;

const digitsOf = (v: unknown) => String(v ?? '').replace(/\D/g, '');
/** Os números guardados nos leads podem vir sem indicativo: compara-se o fim */
const tail = (digits: string) => digits.slice(-9);

function pickName(c: any, number: string): string {
  for (const v of [c?.pushName, c?.name, c?.verifiedName, c?.notify, c?.shortName]) {
    const s = typeof v === 'string' ? v.trim() : '';
    if (s && digitsOf(s) !== number && s !== '.' && s.toLowerCase() !== 'null') return s;
  }
  return '';
}

function pickAvatar(c: any): string | null {
  const v = c?.profilePicUrl || c?.profilePictureUrl || c?.picture || c?.imgUrl;
  return typeof v === 'string' && /^https:\/\//.test(v) ? v : null;
}

export async function listWhatsAppContacts(
  whatsapp: WhatsAppService,
  instance: string,
  userId: string,
): Promise<{ contacts: WhatsAppImportContact[]; found: number; withoutWhatsApp: number }> {
  const raw: any = await whatsapp.fetchContacts(instance);
  const list: any[] = Array.isArray(raw) ? raw : raw?.contacts ?? raw?.data ?? raw?.response ?? [];

  // 1. Contactos individuais com número válido (sem grupos, listas, estados nem @lid), sem repetidos
  const byNumber = new Map<string, { number: string; name: string; avatar: string | null }>();
  for (const c of list) {
    const jid = String(c?.remoteJid || c?.jid || c?.id || '');
    if (!jid.endsWith('@s.whatsapp.net')) continue;
    const number = digitsOf(jid.split('@')[0].split(':')[0]);
    if (number.length < 8 || number.length > 15 || /^0/.test(number)) continue;
    const name = pickName(c, number);
    const avatar = pickAvatar(c);
    const prev = byNumber.get(number);
    if (!prev) byNumber.set(number, { number, name, avatar });
    else byNumber.set(number, { number, name: prev.name || name, avatar: prev.avatar || avatar });
  }
  const found = byNumber.size;
  const numbers = [...byNumber.keys()];

  // 2. Confirmar na Evolution que cada número tem WhatsApp (por lotes, com tempo máximo)
  const hasWhatsApp = new Map<string, boolean>();
  const started = Date.now();
  const batches: string[][] = [];
  for (let i = 0; i < numbers.length; i += CHECK_BATCH) batches.push(numbers.slice(i, i + CHECK_BATCH));
  for (let i = 0; i < batches.length; i += CHECK_PARALLEL) {
    if (Date.now() - started > CHECK_BUDGET_MS) break;
    await Promise.all(batches.slice(i, i + CHECK_PARALLEL).map(async (batch) => {
      try {
        const res = await whatsapp.checkWhatsAppNumbers(instance, batch);
        for (const r of res.results || []) {
          const n = digitsOf(r.jid ? String(r.jid).split('@')[0] : r.number);
          if (n) hasWhatsApp.set(n, r.exists === true);
        }
      } catch {
        // Lote sem resposta: os números ficam como vieram da lista do WhatsApp
      }
    }));
  }
  let withoutWhatsApp = 0;
  const kept = numbers.filter((n) => {
    if (hasWhatsApp.get(n) === false) { withoutWhatsApp++; return false; }
    return true;
  });

  // 3. Números que já são leads (telefone ou whatsapp do lead, comparando o fim do número)
  const existingTails = new Set<string>();
  if (kept.length > 0) {
    const r = await query(
      `SELECT DISTINCT RIGHT(regexp_replace(COALESCE(NULLIF(phone, ''), whatsapp, ''), '\\D', '', 'g'), 9) AS t
         FROM leads
        WHERE user_id = $1
          AND RIGHT(regexp_replace(COALESCE(NULLIF(phone, ''), whatsapp, ''), '\\D', '', 'g'), 9) = ANY($2)`,
      [userId, [...new Set(kept.map(tail))]],
    );
    for (const row of r.rows) if (row.t) existingTails.add(row.t);
  }

  const contacts = kept
    .map((n) => ({ ...byNumber.get(n)!, existing: existingTails.has(tail(n)) }))
    // Com nome primeiro (por ordem alfabética), depois só com número
    .sort((a, b) => (a.name ? 0 : 1) - (b.name ? 0 : 1) || (a.name || a.number).localeCompare(b.name || b.number));

  return { contacts, found, withoutWhatsApp };
}

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_PARALLEL = 6;

/** Link de foto do WhatsApp (pps.whatsapp.net…): expira, por isso guarda-se uma cópia */
export const isWhatsAppCdnUrl = (url: unknown): url is string => {
  if (typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname === 'whatsapp.net' || u.hostname.endsWith('.whatsapp.net'));
  } catch {
    return false;
  }
};

async function copyAvatar(url: string, userId: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const type = (res.headers.get('content-type') || '').split(';')[0].trim();
    if (!/^image\/(jpeg|png|webp)$/.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > AVATAR_MAX_BYTES) return null;
    const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
    return await getStorageService().uploadBuffer(buf, `avatar.${ext}`, type, 'avatars', userId);
  } catch {
    return null;
  }
}

/**
 * Troca as fotos do WhatsApp dos leads a importar por cópias no armazenamento do app.
 * Foto que não se consegue copiar fica sem foto (o link do WhatsApp deixaria de abrir).
 */
export async function persistWhatsAppAvatars<T extends { avatarUrl?: string | null; avatar_url?: string | null }>(
  leads: T[],
  userId: string,
): Promise<T[]> {
  const out = [...leads];
  const todo = out
    .map((lead, i) => ({ i, url: lead.avatarUrl ?? lead.avatar_url }))
    .filter((x): x is { i: number; url: string } => isWhatsAppCdnUrl(x.url));
  for (let k = 0; k < todo.length; k += AVATAR_PARALLEL) {
    await Promise.all(todo.slice(k, k + AVATAR_PARALLEL).map(async ({ i, url }) => {
      const stored = await copyAvatar(url, userId);
      out[i] = { ...out[i], avatarUrl: stored, avatar_url: stored };
    }));
  }
  return out;
}
