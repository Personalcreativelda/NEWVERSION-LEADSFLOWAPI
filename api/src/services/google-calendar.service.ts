// Google Calendar nas Tarefas e lembretes: os assistentes veem os horários ocupados antes de
// propor uma marcação, e as marcações feitas pela IA entram no calendário (e saem ou mudam
// quando o cliente desmarca ou remarca).
//
// Permissões: "calendar.events" (criar/mudar/apagar eventos) e "calendar.freebusy" (ver só
// quando está ocupado, sem ler os detalhes dos outros eventos).
import crypto from 'crypto';
import { query } from '../database/connection';
import { encryptSecret, decryptSecret } from '../utils/secret-box';
import { apiBaseUrl } from './meta-oauth.service';
import { tokenRequest, shell, esc, js } from './google-drive.service';

export type CalendarPlatform = 'web' | 'app';

const SCOPES = [
  'openid', 'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
];
const STATE_TTL_MS = 30 * 60_000;
const API = 'https://www.googleapis.com/calendar/v3';

export const isCalendarConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
export const calendarRedirectUri = () => `${apiBaseUrl()}/api/oauth/google-calendar/callback`;

let ready: Promise<void> | null = null;
export function ensureCalendarTables(): Promise<void> {
  ready ??= query(`CREATE TABLE IF NOT EXISTS google_calendar_connections (
      user_id UUID PRIMARY KEY,
      email TEXT,
      refresh_token TEXT NOT NULL,
      calendar_id TEXT NOT NULL DEFAULT 'primary',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`).then(() => undefined).catch((err) => { ready = null; throw err; });
  return ready;
}

// ── state assinado ────────────────────────────────────────────────────────────────────
const stateKey = () => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET em falta');
  return process.env.JWT_SECRET;
};

export function createCalendarState(userId: string, platform: CalendarPlatform): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, p: platform, n: crypto.randomBytes(9).toString('hex'), e: Date.now() + STATE_TTL_MS })).toString('base64url');
  return `${payload}.${crypto.createHmac('sha256', stateKey()).update(`cal.${payload}`).digest('base64url')}`;
}

export function readCalendarState(state: string): { userId: string; platform: CalendarPlatform } | null {
  const [payload, sig] = String(state || '').split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', stateKey()).update(`cal.${payload}`).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!d.u || typeof d.e !== 'number' || d.e < Date.now()) return null;
    return { userId: String(d.u), platform: d.p === 'app' ? 'app' : 'web' };
  } catch {
    return null;
  }
}

export function buildCalendarAuthorizeUrl(state: string, loginHint?: string): string {
  const qs = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    redirect_uri: calendarRedirectUri(),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
    ...(loginHint ? { login_hint: loginHint } : {}),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${qs}`;
}

export function calendarReturnUrl(platform: CalendarPlatform, params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString();
  if (platform === 'app') return `com.leadsflowapi.app://oauth/calendar?${qs}`;
  return `${apiBaseUrl()}/api/oauth/google-calendar/done?${qs}`;
}

// ── Ligação ───────────────────────────────────────────────────────────────────────────
export async function exchangeCalendarCode(userId: string, code: string): Promise<{ email: string | null }> {
  await ensureCalendarTables();
  const data = await tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: calendarRedirectUri() });
  let email: string | null = null;
  try {
    const p = String(data.id_token || '').split('.')[1];
    if (p) email = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')).email || null;
  } catch { /* sem email */ }
  if (!data.refresh_token) throw new Error('O Google não devolveu acesso permanente');
  await query(
    `INSERT INTO google_calendar_connections (user_id, email, refresh_token) VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email, refresh_token = EXCLUDED.refresh_token, updated_at = NOW()`,
    [userId, email, encryptSecret(data.refresh_token)]
  );
  return { email };
}

/** Tokens de acesso em memória (duram ~1 hora): poupa um pedido ao Google por mensagem */
const tokenCache = new Map<string, { token: string; until: number }>();

async function accessToken(userId: string): Promise<string | null> {
  const cached = tokenCache.get(userId);
  if (cached && cached.until > Date.now()) return cached.token;
  await ensureCalendarTables();
  const row = (await query('SELECT refresh_token FROM google_calendar_connections WHERE user_id = $1', [userId])).rows[0];
  if (!row) return null;
  try {
    const data = await tokenRequest({ refresh_token: decryptSecret(row.refresh_token), grant_type: 'refresh_token' });
    tokenCache.set(userId, { token: data.access_token, until: Date.now() + Math.max(60, Number(data.expires_in || 3600) - 300) * 1000 });
    return data.access_token;
  } catch (err: any) {
    if (err.code === 'invalid_grant') await query('DELETE FROM google_calendar_connections WHERE user_id = $1', [userId]);
    return null;
  }
}

export async function calendarConnection(userId: string): Promise<{ email: string | null; calendarId: string } | null> {
  await ensureCalendarTables();
  const row = (await query('SELECT email, calendar_id FROM google_calendar_connections WHERE user_id = $1', [userId])).rows[0];
  return row ? { email: row.email || null, calendarId: row.calendar_id || 'primary' } : null;
}

export async function disconnectCalendar(userId: string): Promise<void> {
  await ensureCalendarTables();
  const row = (await query('SELECT refresh_token FROM google_calendar_connections WHERE user_id = $1', [userId])).rows[0];
  if (row) {
    try { await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(decryptSecret(row.refresh_token))}`, { method: 'POST' }); } catch { /* sai na mesma */ }
  }
  tokenCache.delete(userId);
  await query('DELETE FROM google_calendar_connections WHERE user_id = $1', [userId]);
}

// ── Agenda ────────────────────────────────────────────────────────────────────────────
async function calendarFetch(userId: string, path: string, init: RequestInit = {}): Promise<any | null> {
  const token = await accessToken(userId);
  if (!token) return null;
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 204 || res.status === 410) return {};
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(data?.error?.message || `Google Calendar respondeu ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export interface BusySlot { start: Date; end: Date }

/** Horários ocupados no calendário (null = calendário não ligado ou sem resposta) */
export async function getBusy(userId: string, from: Date, to: Date): Promise<BusySlot[] | null> {
  try {
    const conn = await calendarConnection(userId);
    if (!conn) return null;
    const data = await calendarFetch(userId, '/freeBusy', {
      method: 'POST',
      body: JSON.stringify({ timeMin: from.toISOString(), timeMax: to.toISOString(), items: [{ id: conn.calendarId }] }),
    });
    if (!data) return null;
    const busy = data.calendars?.[conn.calendarId]?.busy || [];
    return busy.map((b: any) => ({ start: new Date(b.start), end: new Date(b.end) }))
      .filter((b: BusySlot) => !isNaN(b.start.getTime()) && !isNaN(b.end.getTime()));
  } catch (err: any) {
    console.warn('[GoogleCalendar] Disponibilidade:', err.message);
    return null;
  }
}

export interface CalendarEvent { id: string; summary: string; start: string; end: string; allDay: boolean; location: string | null; link: string | null }

/** Próximos eventos do calendário ligado, para mostrar nas Tarefas (null = não ligado) */
export async function listEvents(userId: string, from: Date, to: Date): Promise<CalendarEvent[] | null> {
  const conn = await calendarConnection(userId);
  if (!conn) return null;
  const qs = new URLSearchParams({
    timeMin: from.toISOString(), timeMax: to.toISOString(),
    singleEvents: 'true', orderBy: 'startTime', maxResults: '100',
  });
  const data = await calendarFetch(userId, `/calendars/${encodeURIComponent(conn.calendarId)}/events?${qs}`);
  if (!data) return null;
  return (data.items || [])
    .filter((e: any) => e.status !== 'cancelled' && (e.start?.dateTime || e.start?.date))
    .map((e: any) => ({
      id: String(e.id),
      summary: e.summary || '(sem título)',
      start: e.start.dateTime || e.start.date,
      end: e.end?.dateTime || e.end?.date || e.start.dateTime || e.start.date,
      allDay: !e.start.dateTime,
      location: e.location || null,
      link: e.htmlLink || null,
    }));
}

export interface EventInput { summary: string; description?: string; start: Date; end: Date }

/** Cria o evento; devolve o id (ou null sem calendário ligado / em erro) */
export async function createEvent(userId: string, ev: EventInput): Promise<string | null> {
  try {
    const conn = await calendarConnection(userId);
    if (!conn) return null;
    const data = await calendarFetch(userId, `/calendars/${encodeURIComponent(conn.calendarId)}/events`, {
      method: 'POST',
      body: JSON.stringify({
        summary: ev.summary.slice(0, 200),
        description: (ev.description || '').slice(0, 2000),
        start: { dateTime: ev.start.toISOString() },
        end: { dateTime: ev.end.toISOString() },
        reminders: { useDefault: true },
        source: { title: 'LeadsFlow', url: (process.env.APP_URL || 'https://app.leadsflowapi.com').replace(/\/$/, '') + '/dashboard/tasks' },
      }),
    });
    return data?.id || null;
  } catch (err: any) {
    console.warn('[GoogleCalendar] Criar evento:', err.message);
    return null;
  }
}

export async function updateEvent(userId: string, eventId: string, patch: Partial<EventInput>): Promise<boolean> {
  try {
    const conn = await calendarConnection(userId);
    if (!conn) return false;
    const body: any = {};
    if (patch.summary) body.summary = patch.summary.slice(0, 200);
    if (patch.description !== undefined) body.description = patch.description.slice(0, 2000);
    if (patch.start) body.start = { dateTime: patch.start.toISOString() };
    if (patch.end) body.end = { dateTime: patch.end.toISOString() };
    await calendarFetch(userId, `/calendars/${encodeURIComponent(conn.calendarId)}/events/${encodeURIComponent(eventId)}`, {
      method: 'PATCH', body: JSON.stringify(body),
    });
    return true;
  } catch (err: any) {
    console.warn('[GoogleCalendar] Mudar evento:', err.message);
    return false;
  }
}

export async function deleteEvent(userId: string, eventId: string): Promise<boolean> {
  try {
    const conn = await calendarConnection(userId);
    if (!conn) return false;
    await calendarFetch(userId, `/calendars/${encodeURIComponent(conn.calendarId)}/events/${encodeURIComponent(eventId)}`, { method: 'DELETE' });
    return true;
  } catch (err: any) {
    if (err.status === 404 || err.status === 410) return true;
    console.warn('[GoogleCalendar] Apagar evento:', err.message);
    return false;
  }
}

/** Página final na web: avisa as Tarefas (janela que abriu) e fecha */
export function calendarDonePage(params: Record<string, string>, nonce: string): string {
  const ok = params.calendar === 'connected';
  const title = ok ? 'Google Calendar ligado' : params.calendar === 'cancelled' ? 'Cancelado' : 'Não foi possível ligar';
  const text = ok ? 'Pode fechar esta janela. Os assistentes já veem os horários livres antes de marcar.'
    : params.calendar === 'cancelled' ? 'O Google Calendar não foi ligado.' : 'Tente de novo dentro de momentos.';
  return shell(title, `<h1>${esc(title)}</h1><p>${esc(text)}</p><button id="close">Fechar</button>`,
    `<script>document.getElementById('close').addEventListener('click',function(){window.close()});try{if(window.opener){window.opener.postMessage(${js({ type: 'leadsflow-calendar', ...params })},'*');setTimeout(function(){window.close()},600);}}catch(e){}</script>`, nonce);
}
