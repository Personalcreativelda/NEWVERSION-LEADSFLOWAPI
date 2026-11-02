// Conversões para a Meta (API de Conversões). Os eventos do funil saem do servidor, não do browser
// de quem usa o painel: Lead, Lead qualificado e Compra (com o valor do negócio), um por lead.
// - Lead que veio de um anúncio "Enviar mensagem" do WhatsApp oficial: o evento leva o código do
//   clique (ctwa_clid) e a Meta atribui-o ao anúncio exato (business_messaging).
// - Os outros: telefone, email e nome cifrados (SHA-256) para a Meta os reconhecer (system_generated).
import crypto from 'crypto';
import { query } from '../database/connection';
import { decryptSecret, encryptSecret } from '../utils/secret-box';

const GRAPH = 'https://graph.facebook.com/v21.0';
const SETTINGS_KEY = 'meta_conversions';
const SWEEP_MS = 60_000;
/** A Meta só aceita eventos dos últimos 7 dias */
const MAX_EVENT_AGE_DAYS = 6;
const MAX_ATTEMPTS = 3;
const BATCH = 200;

export type MetaEventName = 'Lead' | 'QualifiedLead' | 'Purchase';
export const META_EVENTS: MetaEventName[] = ['Lead', 'QualifiedLead', 'Purchase'];

/** Etapa do funil → evento (as etapas sem evento não enviam nada) */
export const DEFAULT_MAPPING: Record<string, MetaEventName> = {
  novo: 'Lead',
  qualificado: 'QualifiedLead',
  convertido: 'Purchase',
};

/** Nas conversas de anúncios a Meta usa outros nomes para os mesmos eventos */
const MESSAGING_NAMES: Record<MetaEventName, string> = {
  Lead: 'LeadSubmitted',
  QualifiedLead: 'QualifiedLead',
  Purchase: 'Purchase',
};

/** Indicativo do país (para números guardados sem ele) */
const PHONE_PREFIX: Record<string, string> = {
  MZ: '258', PT: '351', BR: '55', AO: '244', ZA: '27', CV: '238', GW: '245', ST: '239', TL: '670',
  US: '1', GB: '44', FR: '33', ES: '34', ZW: '263', MW: '265', TZ: '255', KE: '254', NG: '234',
};

export interface MetaConfig {
  enabled: boolean;
  dataset_id: string;
  access_token: string;
  test_event_code: string;
  currency: string;
  country: string;
  mapping: Record<string, MetaEventName>;
  enabled_at: string | null;
}

export class MetaConversionsError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const sha = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const clean = (v: unknown) => String(v ?? '').trim();

function normalizeConfig(raw: any): MetaConfig {
  const v = raw && typeof raw === 'object' ? raw : {};
  const mapping: Record<string, MetaEventName> = {};
  const source = v.mapping && typeof v.mapping === 'object' ? v.mapping : DEFAULT_MAPPING;
  for (const [stage, event] of Object.entries(source)) {
    if (META_EVENTS.includes(event as MetaEventName)) mapping[String(stage).toLowerCase()] = event as MetaEventName;
  }
  let token = clean(v.access_token);
  try { token = decryptSecret(token); } catch { token = ''; }
  return {
    enabled: v.enabled === true,
    dataset_id: clean(v.dataset_id).replace(/\D/g, ''),
    access_token: token,
    test_event_code: clean(v.test_event_code),
    currency: (clean(v.currency) || 'MZN').toUpperCase().slice(0, 3),
    country: (clean(v.country) || 'MZ').toUpperCase().slice(0, 2),
    mapping,
    enabled_at: v.enabled_at || null,
  };
}

export async function getMetaConfig(userId: string): Promise<MetaConfig> {
  const r = await query('SELECT value FROM settings WHERE user_id = $1 AND key = $2', [userId, SETTINGS_KEY]);
  return normalizeConfig(r.rows[0]?.value);
}

/** Para o painel: nunca leva o token */
export function publicConfig(cfg: MetaConfig) {
  const { access_token, ...rest } = cfg;
  return { ...rest, has_token: !!access_token };
}

/** Guarda a ligação. Sem token novo mantém o guardado; ativar marca a partir de quando se envia. */
export async function saveMetaConfig(userId: string, input: any): Promise<MetaConfig> {
  const current = await getMetaConfig(userId);
  const next: MetaConfig = normalizeConfig({
    ...current,
    ...(input || {}),
    access_token: clean(input?.access_token) || current.access_token,
  });
  if (next.enabled && (!next.dataset_id || !next.access_token)) {
    throw new MetaConversionsError('Indique o ID do conjunto de dados e o token de acesso');
  }
  // Só os eventos a partir de agora: o histórico antigo não é enviado de repente
  if (next.enabled && (!current.enabled || !current.enabled_at)) next.enabled_at = new Date().toISOString();
  if (!next.enabled) next.enabled_at = null;
  const stored = { ...next, access_token: next.access_token ? encryptSecret(next.access_token) : '' };
  await query(
    `INSERT INTO settings (user_id, key, value) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [userId, SETTINGS_KEY, JSON.stringify(stored)],
  );
  return next;
}

// ── Contactos em formato da Meta ─────────────────────────────────────────────

/** Telefone com indicativo, só dígitos (sem o 0/00 inicial) */
export function normalizePhone(phone: unknown, country: string): string {
  let d = String(phone ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  const prefix = PHONE_PREFIX[country] || '';
  if (prefix && !d.startsWith(prefix) && d.length <= 10) d = prefix + d.replace(/^0+/, '');
  return d.length >= 8 && d.length <= 15 ? d : '';
}

export function splitName(name: unknown): { fn: string; ln: string } {
  const parts = String(name ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z\s'-]/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { fn: '', ln: '' };
  return { fn: parts[0], ln: parts.length > 1 ? parts[parts.length - 1] : '' };
}

const validEmail = (email: unknown) => {
  const e = clean(email).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : '';
};

interface LeadRow {
  id: string;
  name?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  status?: string | null;
  deal_value?: number | string | null;
  ad_referral?: any;
  changed_at?: Date | string | null;
}

/** Monta o evento. Com o clique do anúncio do WhatsApp oficial vai como conversa de anúncio. */
export function buildEvent(cfg: MetaConfig, lead: LeadRow, event: MetaEventName, now = Date.now()) {
  const changed = lead.changed_at ? new Date(lead.changed_at).getTime() : now;
  const eventTime = Math.floor(Math.max(Math.min(changed, now), now - MAX_EVENT_AGE_DAYS * 86_400_000) / 1000);
  const value = Number(lead.deal_value) || 0;
  const custom: Record<string, any> = {};
  if (event === 'Purchase' || value > 0) {
    custom.value = value;
    custom.currency = cfg.currency;
  }
  const eventId = `${lead.id}:${event}`;

  const ad = lead.ad_referral && typeof lead.ad_referral === 'object' ? lead.ad_referral : null;
  if (ad?.ctwa_clid && ad?.waba_id) {
    return {
      event_name: MESSAGING_NAMES[event],
      event_time: eventTime,
      event_id: eventId,
      action_source: 'business_messaging',
      messaging_channel: 'whatsapp',
      user_data: { whatsapp_business_account_id: String(ad.waba_id), ctwa_clid: String(ad.ctwa_clid) },
      ...(Object.keys(custom).length ? { custom_data: custom } : {}),
    };
  }

  const user: Record<string, string[]> = { external_id: [sha(lead.id)] };
  const phone = normalizePhone(lead.whatsapp || lead.phone, cfg.country);
  if (phone) user.ph = [sha(phone)];
  const email = validEmail(lead.email);
  if (email) user.em = [sha(email)];
  const { fn, ln } = splitName(lead.name);
  if (fn && !/^\d+$/.test(fn)) user.fn = [sha(fn)];
  if (ln) user.ln = [sha(ln)];
  if (cfg.country) user.country = [sha(cfg.country.toLowerCase())];
  return {
    event_name: event,
    event_time: eventTime,
    event_id: eventId,
    action_source: 'system_generated',
    user_data: user,
    custom_data: { ...custom, event_source: 'crm', lead_event_source: 'LeadsFlow' },
  };
}

// ── Envio ────────────────────────────────────────────────────────────────────

/** Mensagem clara para os erros mais comuns da Meta (os outros seguem como a Meta os escreve) */
export function metaErrorMessage(error: any, datasetId: string): string {
  const code = Number(error?.code);
  const sub = Number(error?.error_subcode);
  if (code === 190) return 'Token inválido ou expirado. Gere um token novo no Gestor de Eventos.';
  if (code === 100 && sub === 33) {
    return `O token não tem acesso ao conjunto de dados ${datasetId}. Use o ID do conjunto de dados onde gerou o token.`;
  }
  if (code === 10 || code === 200 || code === 803) {
    return `O token não tem permissão para o conjunto de dados ${datasetId}. Gere o token nas Configurações desse conjunto de dados.`;
  }
  return error?.error_user_msg || error?.message || 'A Meta recusou o pedido';
}

// Os erros da Meta seguem como 400 com a mensagem: um 502 passava pela Cloudflare como
// "servidor em baixo" e o painel escondia o motivo
async function graph(cfg: MetaConfig, path: string, body?: any) {
  let res: Response;
  try {
    res = await fetch(`${GRAPH}/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${cfg.access_token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new MetaConversionsError('Não foi possível contactar a Meta. Tente de novo dentro de momentos.', 400);
  }
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new MetaConversionsError(metaErrorMessage(data?.error, cfg.dataset_id), 400);
  }
  return data;
}

export async function sendEvents(cfg: MetaConfig, events: any[]) {
  return graph(cfg, `${cfg.dataset_id}/events`, {
    data: events,
    ...(cfg.test_event_code ? { test_event_code: cfg.test_event_code } : {}),
  });
}

/** Confirma o token e o conjunto de dados; com código de teste envia também um evento de teste */
export async function testConnection(userId: string) {
  const cfg = await getMetaConfig(userId);
  if (!cfg.dataset_id || !cfg.access_token) throw new MetaConversionsError('Indique o ID do conjunto de dados e o token de acesso');
  // Com código de teste, o próprio evento é a prova (os tokens da API de Conversões nem sempre
  // podem ler os dados do conjunto); sem ele, confirma-se o token lendo o conjunto de dados
  if (cfg.test_event_code) {
    const sample = buildEvent(cfg, { id: `teste-${Date.now()}`, name: 'Teste LeadsFlow', email: 'teste@leadsflow.test' }, 'Lead');
    await sendEvents(cfg, [sample]);
    return { dataset: { id: cfg.dataset_id, name: '' }, test_event: true };
  }
  const dataset = await graph(cfg, `${cfg.dataset_id}?fields=id,name`);
  return { dataset: { id: String(dataset.id || cfg.dataset_id), name: String(dataset.name || '') }, test_event: false };
}

/** Eventos por enviar de uma conta: leads que chegaram a uma etapa com evento depois de ativar */
async function dueEvents(userId: string, cfg: MetaConfig) {
  const pairs = Object.entries(cfg.mapping);
  if (pairs.length === 0 || !cfg.enabled_at) return [];
  const res = await query(
    `SELECT l.id, l.name, l.phone, l.whatsapp, l.email, l.status, l.deal_value, l.ad_referral,
            COALESCE(l.stage_changed_at, l.created_at) AS changed_at, m.event
       FROM leads l
       JOIN unnest($2::text[], $3::text[]) AS m(stage, event) ON LOWER(l.status) = m.stage
      WHERE l.user_id = $1
        AND COALESCE(l.stage_changed_at, l.created_at) >= $4
        AND COALESCE(l.stage_changed_at, l.created_at) > NOW() - make_interval(days => $5)
        -- Já enviado, ou falhou há pouco / demasiadas vezes
        AND NOT EXISTS (
          SELECT 1 FROM meta_events e
           WHERE e.lead_id = l.id AND e.event_name = m.event
             AND (e.status <> 'failed' OR e.attempts >= $6 OR e.updated_at > NOW() - INTERVAL '10 minutes'))
      ORDER BY changed_at
      LIMIT $7`,
    [userId, pairs.map((p) => p[0]), pairs.map((p) => p[1]), cfg.enabled_at, MAX_EVENT_AGE_DAYS, MAX_ATTEMPTS, BATCH],
  );
  return res.rows.map((row: any) => ({ lead: row as LeadRow, event: row.event as MetaEventName }));
}

async function record(userId: string, items: Array<{ lead: LeadRow; event: MetaEventName }>, status: 'sent' | 'failed', error?: string) {
  for (const { lead, event } of items) {
    const viaAd = !!(lead.ad_referral?.ctwa_clid && lead.ad_referral?.waba_id);
    await query(
      `INSERT INTO meta_events (user_id, lead_id, event_name, stage, value, via_ad, status, attempts, error, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::text, 1, $8, CASE WHEN $7::text = 'sent' THEN NOW() END)
       ON CONFLICT (lead_id, event_name) DO UPDATE
         SET status = EXCLUDED.status, attempts = meta_events.attempts + 1, error = EXCLUDED.error,
             sent_at = COALESCE(EXCLUDED.sent_at, meta_events.sent_at), value = EXCLUDED.value,
             via_ad = EXCLUDED.via_ad, updated_at = NOW()`,
      [userId, lead.id, event, lead.status, Number(lead.deal_value) || 0, viaAd, status, error ? error.slice(0, 500) : null],
    );
  }
}

/** Envia os eventos por enviar de uma conta. Um evento recusado não impede os outros. */
export async function flushUser(userId: string) {
  const cfg = await getMetaConfig(userId);
  if (!cfg.enabled || !cfg.dataset_id || !cfg.access_token) return { sent: 0, failed: 0 };
  const items = await dueEvents(userId, cfg);
  if (items.length === 0) return { sent: 0, failed: 0 };
  const now = Date.now();
  try {
    await sendEvents(cfg, items.map((i) => buildEvent(cfg, i.lead, i.event, now)));
    await record(userId, items, 'sent');
    return { sent: items.length, failed: 0 };
  } catch (batchErr: any) {
    if (items.length === 1) {
      await record(userId, items, 'failed', batchErr?.message);
      return { sent: 0, failed: 1 };
    }
    // O lote foi recusado: um a um, para saber qual falhou
    let sent = 0, failed = 0;
    for (const item of items) {
      try {
        await sendEvents(cfg, [buildEvent(cfg, item.lead, item.event, now)]);
        await record(userId, [item], 'sent');
        sent += 1;
      } catch (err: any) {
        await record(userId, [item], 'failed', err?.message);
        failed += 1;
      }
    }
    return { sent, failed };
  }
}

// ── Origem dos leads: anúncios ───────────────────────────────────────────────

export interface AdReferral {
  channel: 'whatsapp_cloud' | 'whatsapp' | 'facebook' | 'instagram';
  ad_id?: string;
  headline?: string;
  body?: string;
  source_url?: string;
  ctwa_clid?: string;
  waba_id?: string;
  at: string;
}

const cut = (v: unknown, n = 300) => (v ? String(v).slice(0, n) : undefined);

/** WhatsApp oficial: o campo referral da primeira mensagem vinda de um anúncio */
export function referralFromCloud(message: any, wabaId?: string | null): AdReferral | null {
  const r = message?.referral;
  if (!r || (!r.ctwa_clid && !r.source_id && !r.source_url)) return null;
  return {
    channel: 'whatsapp_cloud',
    ad_id: cut(r.source_id, 60), headline: cut(r.headline), body: cut(r.body), source_url: cut(r.source_url, 500),
    ctwa_clid: cut(r.ctwa_clid, 500), waba_id: wabaId ? String(wabaId) : undefined, at: new Date().toISOString(),
  };
}

/** WhatsApp por QR: contextInfo.externalAdReply (nem sempre vem) */
export function referralFromEvolution(messageData: any): AdReferral | null {
  const msg = messageData?.message || {};
  const candidates = [messageData?.contextInfo, ...Object.values(msg).map((m: any) => m?.contextInfo)];
  const ad = candidates.map((c: any) => c?.externalAdReply).find((x: any) => x && (x.sourceId || x.sourceUrl || x.ctwaClid));
  if (!ad) return null;
  return {
    channel: 'whatsapp',
    ad_id: cut(ad.sourceId, 60), headline: cut(ad.title), body: cut(ad.body), source_url: cut(ad.sourceUrl, 500),
    ctwa_clid: cut(ad.ctwaClid, 500), at: new Date().toISOString(),
  };
}

/** Messenger e Instagram: referral do anúncio (no evento ou na mensagem) */
export function referralFromMessaging(event: any, channel: 'facebook' | 'instagram'): AdReferral | null {
  const r = event?.referral || event?.message?.referral || event?.postback?.referral;
  if (!r || (r.source !== 'ADS' && !r.ad_id)) return null;
  return {
    channel, ad_id: cut(r.ad_id, 60), headline: cut(r.ads_context_data?.ad_title), source_url: cut(r.ads_context_data?.photo_url || r.ads_context_data?.video_url, 500),
    at: new Date().toISOString(),
  };
}

/** Guarda o último anúncio de onde o lead veio (é esse clique que conta para a Meta) */
export async function recordAdReferral(leadId: string | null | undefined, referral: AdReferral | null) {
  if (!leadId || !referral) return;
  await query('UPDATE leads SET ad_referral = $2::jsonb WHERE id = $1', [leadId, JSON.stringify(referral)]);
}

// ── Públicos (lista de clientes) ─────────────────────────────────────────────

const csvCell = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Lista de clientes no formato da Meta (Gestor de Anúncios → Públicos → Lista de clientes) */
export async function audienceCsv(userId: string, stages: string[]) {
  const cfg = await getMetaConfig(userId);
  const params: any[] = [userId];
  let filter = '';
  if (stages.length > 0) {
    params.push(stages.map((s) => s.toLowerCase()));
    filter = ` AND LOWER(status) = ANY($2::text[])`;
  }
  const res = await query(
    `SELECT name, phone, whatsapp, email, deal_value FROM leads WHERE user_id = $1${filter} ORDER BY created_at`,
    params,
  );
  const lines = ['email,phone,fn,ln,country,value'];
  let count = 0;
  for (const l of res.rows) {
    const phone = normalizePhone(l.whatsapp || l.phone, cfg.country);
    const email = validEmail(l.email);
    if (!phone && !email) continue;
    const { fn, ln } = splitName(l.name);
    lines.push([email, phone ? `+${phone}` : '', /^\d+$/.test(fn) ? '' : fn, ln, cfg.country.toLowerCase(), Number(l.deal_value) || 0]
      .map(csvCell).join(','));
    count += 1;
  }
  return { csv: lines.join('\n') + '\n', count };
}

// ── Envio periódico ──────────────────────────────────────────────────────────

class MetaConversionsWorker {
  private running = false;

  start() {
    if (process.env.DISABLE_META_CONVERSIONS === 'true') return;
    setTimeout(() => {
      setInterval(() => { void this.sweep(); }, SWEEP_MS).unref?.();
      void this.sweep();
    }, 30_000).unref?.();
  }

  async sweep() {
    if (this.running) return;
    this.running = true;
    try {
      const users = await query(
        `SELECT user_id FROM settings WHERE key = $1 AND (value->>'enabled')::boolean IS TRUE`,
        [SETTINGS_KEY],
      );
      for (const row of users.rows) {
        await flushUser(row.user_id).catch((err: any) => console.error('[MetaConversions] Conta', row.user_id, err?.message));
      }
    } catch (err: any) {
      console.error('[MetaConversions] Volta falhou:', err?.message);
    } finally {
      this.running = false;
    }
  }
}

export const metaConversionsWorker = new MetaConversionsWorker();
