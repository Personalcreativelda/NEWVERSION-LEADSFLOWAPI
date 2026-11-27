// Fuso horário de cada conta (Definições → Perfil). Sem escolha usa o da plataforma (APP_TIMEZONE).
// As marcações dos assistentes e dos agentes de voz usam-no para "amanhã às 10h" ser a hora do negócio.
import { query } from '../database/connection';
import { appTimezone } from './timezone';

const cache = new Map<string, { tz: string; at: number }>();

export function isValidTimezone(tz: string): boolean {
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function userTimezone(userId: string): Promise<string> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < 60_000) return hit.tz;
  let tz = appTimezone();
  try {
    const r = await query(`SELECT value FROM settings WHERE user_id = $1 AND key = 'timezone'`, [userId]);
    const raw = r.rows[0]?.value;
    const v = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return raw; } })() : raw;
    if (typeof v === 'string' && isValidTimezone(v)) tz = v;
  } catch { /* fica o da plataforma */ }
  cache.set(userId, { tz, at: Date.now() });
  return tz;
}

export async function setUserTimezone(userId: string, tz: string): Promise<void> {
  await query(
    `INSERT INTO settings (user_id, key, value, updated_at) VALUES ($1, 'timezone', $2, NOW())
     ON CONFLICT (user_id, key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [userId, JSON.stringify(tz)],
  );
  cache.set(userId, { tz, at: Date.now() });
}
