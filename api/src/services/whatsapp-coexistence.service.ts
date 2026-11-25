// WhatsApp Coexistence da Meta: o número continua na app WhatsApp Business do telemóvel e passa
// também a funcionar pela Cloud API (canal whatsapp_cloud com credentials.is_on_biz_app = true).
// Documentação: developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users
//
// Depois do Embedded Signup (featureType whatsapp_business_app_onboarding), até 24 horas:
//   POST /<PHONE_NUMBER_ID>/smb_app_data { messaging_product: 'whatsapp', sync_type: 'smb_app_state_sync' }  (contactos)
//   POST /<PHONE_NUMBER_ID>/smb_app_data { messaging_product: 'whatsapp', sync_type: 'history' }              (histórico)
// Cada um só se pode fazer uma vez por ligação. Os dados chegam pelos webhooks:
//   history             conversas dos últimos 6 meses, por blocos (metadata.phase / chunk_order / progress)
//   smb_app_state_sync  contactos da app (action add|remove)
//   smb_message_echoes  mensagens que a empresa envia pela app do telemóvel
//   account_update      PARTNER_REMOVED: a ligação foi desfeita (ex.: telemóvel sem uso ~14 dias)
//
// Regras: nada de duplicados (external_id por conta); o histórico não conta como não lido, não chama a IA,
// as automações nem os webhooks externos; uma resposta pelo telemóvel (eco) pausa o assistente nessa
// conversa (ver assistant-processor: HUMAN_ECHO_PAUSE_MIN). Tudo isolado por user_id do canal.
import { query } from '../database/connection';
import { ConversationsService } from './conversations.service';
import { normalizePhoneNumber } from '../utils/phone.utils';
import { getStorageService } from './storage.service';
import { getWebSocketService } from './websocket.service';
import { notificationsService } from './notifications.service';
import { applyWhatsAppEvent } from './whatsapp-events.service';
import { GRAPH_VERSION } from './meta-oauth.service';

const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const TIMEOUT_MS = 20_000;
const conversationsService = new ConversationsService();

const parse = (v: any) => (typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch { return {}; } })() : v || {});
const digits = (s: any) => String(s || '').replace(/\D/g, '');
const toDate = (ts: any) => {
  const n = Number(ts);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : new Date();
};

// ── Canal ────────────────────────────────────────────────────────────────────
async function channelFor(phoneNumberId?: string, wabaId?: string) {
  if (phoneNumberId) {
    const r = await query(
      `SELECT * FROM channels WHERE type = 'whatsapp_cloud' AND credentials->>'phone_number_id' = $1 LIMIT 1`,
      [String(phoneNumberId)],
    );
    if (r.rows[0]) return r.rows[0];
  }
  if (wabaId) {
    const r = await query(
      `SELECT * FROM channels WHERE type = 'whatsapp_cloud' AND credentials->>'waba_id' = $1 ORDER BY created_at DESC LIMIT 1`,
      [String(wabaId)],
    );
    if (r.rows[0]) return r.rows[0];
  }
  return null;
}

async function saveSyncState(channelId: string, patch: Record<string, any>) {
  await query(
    `UPDATE channels
        SET settings = COALESCE(settings, '{}'::jsonb)
                       || jsonb_build_object('coexistence', COALESCE(settings->'coexistence', '{}'::jsonb) || $2::jsonb)
      WHERE id = $1`,
    [channelId, JSON.stringify(patch)],
  );
}

// ── Contacto / conversa ──────────────────────────────────────────────────────
async function leadFor(userId: string, waId: string, name: string | null) {
  const phone = normalizePhoneNumber(waId) || digits(waId);
  const found = await query(
    `SELECT id, name, phone FROM leads
      WHERE user_id = $1 AND (REGEXP_REPLACE(phone, '[^0-9]', '', 'g') = $2 OR REGEXP_REPLACE(whatsapp, '[^0-9]', '', 'g') = $2)
      ORDER BY updated_at DESC LIMIT 1`,
    [userId, phone],
  );
  if (found.rows[0]) return { id: found.rows[0].id as string, phone: normalizePhoneNumber(found.rows[0].phone) || phone };
  // Os contactos da app chegam antes do histórico: o lead novo leva o nome da agenda
  if (!name) {
    const contact = await query(
      `SELECT name FROM contacts WHERE user_id = $1 AND REGEXP_REPLACE(COALESCE(whatsapp, phone, ''), '[^0-9]', '', 'g') = $2 LIMIT 1`,
      [userId, phone],
    );
    name = contact.rows[0]?.name || null;
  }
  const created = await query(
    `INSERT INTO leads (user_id, name, phone, whatsapp, source, status) VALUES ($1, $2, $3, $3, 'whatsapp_cloud', 'novo') RETURNING id`,
    [userId, name || phone, phone],
  );
  return { id: created.rows[0].id as string, phone };
}

async function conversationFor(channel: any, waId: string, name: string | null) {
  const lead = await leadFor(channel.user_id, waId, name);
  const conversation = await conversationsService.findOrCreate(
    channel.user_id, channel.id, `${digits(waId)}@s.whatsapp.net`, lead.id,
    { contact_name: name || lead.phone, phone: lead.phone },
  );
  return { conversation, leadId: lead.id };
}

// ── Mensagens ────────────────────────────────────────────────────────────────
const MEDIA = new Set(['image', 'video', 'audio', 'document', 'sticker']);

/** Texto e média de uma mensagem no formato da Cloud API (histórico e ecos) */
function contentOf(m: any): { content: string; mediaType: string | null; mediaId: string | null; mime: string | null } {
  const type = String(m?.type || '');
  if (type === 'text') return { content: String(m.text?.body || ''), mediaType: null, mediaId: null, mime: null };
  if (MEDIA.has(type)) {
    const media = m[type] || {};
    return {
      content: String(media.caption || (type === 'document' ? media.filename || '' : '')),
      mediaType: type === 'sticker' ? 'image' : type,
      mediaId: media.id ? String(media.id) : null,
      mime: media.mime_type || null,
    };
  }
  if (type === 'location') {
    const l = m.location || {};
    return { content: `📍 ${l.name || ''} ${l.latitude ?? ''},${l.longitude ?? ''}`.trim(), mediaType: null, mediaId: null, mime: null };
  }
  if (type === 'contacts') return { content: `[${(m.contacts || []).map((c: any) => c?.name?.formatted_name).filter(Boolean).join(', ') || 'contacto'}]`, mediaType: null, mediaId: null, mime: null };
  if (type === 'interactive' || type === 'button') {
    return { content: String(m.button?.text || m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || ''), mediaType: null, mediaId: null, mime: null };
  }
  return { content: `[${type || 'mensagem'}]`, mediaType: null, mediaId: null, mime: null };
}

/** Descarrega a média da Meta para o armazenamento (os links da Meta expiram) */
async function downloadMedia(channel: any, mediaId: string, mime: string | null, kind: string): Promise<string | null> {
  const token = parse(channel.credentials).access_token;
  if (!token) return null;
  try {
    const info: any = await (await fetch(`${GRAPH}/${encodeURIComponent(mediaId)}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT_MS),
    })).json();
    if (!info?.url) return null;
    const file = await fetch(info.url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60_000) });
    if (!file.ok) return null;
    const type = mime || info.mime_type || 'application/octet-stream';
    const ext = (type.split('/')[1] || 'bin').split(';')[0].replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'bin';
    return await getStorageService().uploadBuffer(
      Buffer.from(await file.arrayBuffer()), `coex_${kind}_${Date.now()}.${ext}`, type, 'inbox-attachments', channel.user_id,
    );
  } catch (err: any) {
    console.warn('[Coexistence] Média não descarregada:', mediaId, err?.message);
    return null;
  }
}

const HISTORY_STATUS: Record<string, string> = {
  READ: 'read', PLAYED: 'read', DELIVERED: 'delivered', SENT: 'sent', PENDING: 'pending', ERROR: 'failed',
};

async function alreadySaved(userId: string, externalId: string): Promise<boolean> {
  const r = await query('SELECT 1 FROM messages WHERE user_id = $1 AND external_id = $2 LIMIT 1', [userId, externalId]);
  return r.rows.length > 0;
}

// ── Serviço ──────────────────────────────────────────────────────────────────
export class WhatsAppCoexistenceService {
  private chains = new Map<string, Promise<void>>();

  /**
   * Processa em segundo plano (a Meta quer resposta rápida e um bloco do histórico pode ser grande),
   * um evento de cada vez por número: sem leads nem conversas duplicadas entre blocos simultâneos.
   */
  enqueue(field: string, value: any, wabaId?: string) {
    const key = String(value?.metadata?.phone_number_id || wabaId || 'sem-numero');
    const prev = this.chains.get(key) || Promise.resolve();
    const job = prev.then(() => this.handle(field, value, wabaId));
    this.chains.set(key, job);
    void job.finally(() => { if (this.chains.get(key) === job) this.chains.delete(key); });
  }

  /** Pede à Meta os contactos e depois o histórico (logo depois do Embedded Signup; prazo de 24 horas) */
  async startSync(channelId: string): Promise<void> {
    const r = await query('SELECT * FROM channels WHERE id = $1', [channelId]);
    const channel = r.rows[0];
    const cred = parse(channel?.credentials);
    if (!channel || !cred.access_token || !cred.phone_number_id) return;
    const result: Record<string, any> = { onboarded_at: new Date().toISOString(), history_progress: 0 };
    for (const syncType of ['smb_app_state_sync', 'history']) {
      try {
        const res = await fetch(`${GRAPH}/${encodeURIComponent(cred.phone_number_id)}/smb_app_data`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${cred.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messaging_product: 'whatsapp', sync_type: syncType }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        const data: any = await res.json().catch(() => ({}));
        if (!res.ok || data?.error) throw new Error(data?.error?.message || `Meta respondeu ${res.status}`);
        result[syncType === 'history' ? 'history_request_id' : 'contacts_request_id'] = data.request_id || null;
      } catch (err: any) {
        console.warn(`[Coexistence] ${syncType} não pedido:`, channel.id, err?.message);
        result[syncType === 'history' ? 'history_error' : 'contacts_error'] = String(err?.message || 'erro').slice(0, 300);
      }
    }
    await saveSyncState(channel.id, result);
  }

  /** Webhooks history / smb_app_state_sync / smb_message_echoes / account_update. Nunca lança. */
  async handle(field: string, value: any, wabaId?: string): Promise<void> {
    try {
      const channel = await channelFor(value?.metadata?.phone_number_id, wabaId);
      if (!channel) {
        console.warn(`[Coexistence] ${field}: canal não encontrado`, value?.metadata?.phone_number_id || wabaId);
        return;
      }
      if (field === 'history') await this.onHistory(channel, value);
      else if (field === 'smb_app_state_sync') await this.onContacts(channel, value);
      else if (field === 'smb_message_echoes') await this.onEchoes(channel, value);
      else if (field === 'account_update') await this.onAccountUpdate(channel, value);
    } catch (err: any) {
      console.error(`[Coexistence] ${field}:`, err?.message || err);
    }
  }

  // Histórico: conversas e mensagens antigas, sem notificar nem acordar a IA
  private async onHistory(channel: any, value: any) {
    const businessNumber = digits(value?.metadata?.display_phone_number);
    let saved = 0;
    let skipped = 0;
    for (const chunk of value?.history || []) {
      if (Array.isArray(chunk?.errors) && chunk.errors.length) {
        const e = chunk.errors[0];
        // 2593109: a empresa não partilhou o histórico na app
        await saveSyncState(channel.id, {
          history_error: e?.error_data?.details || e?.message || e?.title || 'Histórico não partilhado',
          history_error_code: e?.code || null,
        });
        continue;
      }
      for (const thread of chunk?.threads || []) {
        const waId = digits(thread?.context?.wa_id || thread?.id);
        if (!waId) { skipped += (thread?.messages || []).length; continue; }
        let conv: { conversation: any; leadId: string } | null = null;
        let lastAt: Date | null = null;
        for (const m of thread?.messages || []) {
          if (!m?.id || await alreadySaved(channel.user_id, String(m.id))) continue;
          conv ||= await conversationFor(channel, waId, thread?.context?.username || null);
          const fromBusiness = businessNumber ? digits(m.from) === businessNumber : digits(m.from) !== waId;
          const { content, mediaType } = contentOf(m);
          const at = toDate(m.timestamp);
          const status = fromBusiness ? (HISTORY_STATUS[String(m.history_context?.status || '').toUpperCase()] || 'sent') : 'read';
          await query(
            `INSERT INTO messages (user_id, conversation_id, lead_id, direction, channel, content, media_type, status,
                                   external_id, metadata, sent_at, created_at, updated_at)
             VALUES ($1, $2, $3, $4, 'whatsapp_cloud', $5, $6, $7, $8, $9, $10, $10, $10)`,
            [channel.user_id, conv.conversation.id, conv.leadId, fromBusiness ? 'out' : 'in', content,
              m.type === 'media_placeholder' ? null : mediaType, status, String(m.id),
              JSON.stringify({ source: 'history_sync', from: m.from, message_type: m.type, history_status: m.history_context?.status || null }),
              at],
          );
          saved += 1;
          if (!lastAt || at > lastAt) lastAt = at;
        }
        if (conv && lastAt) {
          await query(
            `UPDATE conversations SET last_message_at = GREATEST(COALESCE(last_message_at, $2), $2), updated_at = NOW() WHERE id = $1`,
            [conv.conversation.id, lastAt],
          );
        }
      }
      const meta = chunk?.metadata || {};
      if (meta.progress !== undefined) {
        await saveSyncState(channel.id, {
          history_progress: Number(meta.progress) || 0,
          history_phase: meta.phase ?? null,
          ...(Number(meta.progress) >= 100 ? { history_done_at: new Date().toISOString() } : {}),
        });
      }
    }
    if (saved) {
      console.log(`[Coexistence] Histórico: ${saved} mensagens guardadas (${skipped} sem número) — canal ${channel.id}`);
      getWebSocketService()?.emitToUser(channel.user_id, 'inbox:refresh', { channelId: channel.id, reason: 'history_sync' });
    }
  }

  // Contactos da app: nomes nos contactos e nos leads que ainda só tinham o número
  private async onContacts(channel: any, value: any) {
    for (const item of value?.state_sync || []) {
      if (item?.type !== 'contact' || item?.action !== 'add') continue; // "remove" não apaga nada na LeadsFlow
      const c = item.contact || {};
      const phone = normalizePhoneNumber(c.phone_number) || digits(c.phone_number);
      const name = String(c.full_name || c.first_name || '').trim().slice(0, 255);
      if (!phone || !name) continue;
      const existing = await query(
        `SELECT id FROM contacts WHERE user_id = $1 AND REGEXP_REPLACE(COALESCE(whatsapp, phone, ''), '[^0-9]', '', 'g') = $2 LIMIT 1`,
        [channel.user_id, phone],
      );
      if (existing.rows[0]) {
        await query('UPDATE contacts SET name = $2, updated_at = NOW() WHERE id = $1', [existing.rows[0].id, name]);
      } else {
        await query(
          `INSERT INTO contacts (user_id, name, phone, whatsapp, custom_fields) VALUES ($1, $2, $3, $3, $4)`,
          [channel.user_id, name, phone, JSON.stringify({ source: 'whatsapp_business_app' })],
        );
      }
      // Lead que só tinha o número como nome passa a ter o nome da agenda
      await query(
        `UPDATE leads SET name = $3
          WHERE user_id = $1 AND REGEXP_REPLACE(COALESCE(whatsapp, phone, ''), '[^0-9]', '', 'g') = $2
            AND (name IS NULL OR name ~ '^[+0-9 ()-]*$')`,
        [channel.user_id, phone, name],
      );
    }
  }

  // Ecos: o que a empresa escreve pela app do telemóvel aparece na caixa de entrada (e pausa a IA)
  private async onEchoes(channel: any, value: any) {
    const names = new Map<string, string>();
    for (const c of value?.contacts || []) if (c?.wa_id) names.set(digits(c.wa_id), c?.profile?.name || c?.profile?.username || '');

    for (const m of value?.message_echoes || []) {
      if (!m?.id) continue;
      // Apagar / editar pela app
      if (m.type === 'revoke' && m.revoke?.original_message_id) {
        await applyWhatsAppEvent(channel.user_id, { kind: 'revoke', targetId: String(m.revoke.original_message_id) }, true);
        continue;
      }
      if (m.type === 'edit' && m.edit?.original_message_id) {
        const text = contentOf(m.edit.message || {}).content;
        if (text) await applyWhatsAppEvent(channel.user_id, { kind: 'edit', targetId: String(m.edit.original_message_id), text }, true);
        continue;
      }
      if (await alreadySaved(channel.user_id, String(m.id))) continue;
      const waId = digits(m.to);
      if (!waId) continue;

      const { conversation, leadId } = await conversationFor(channel, waId, names.get(waId) || null);
      const { content, mediaType, mediaId, mime } = contentOf(m);
      const mediaUrl = mediaId ? await downloadMedia(channel, mediaId, mime, mediaType || 'file') : null;
      const at = toDate(m.timestamp);
      const saved = (await query(
        `INSERT INTO messages (user_id, conversation_id, lead_id, direction, channel, content, media_url, media_type, status,
                               external_id, metadata, sent_at, created_at)
         VALUES ($1, $2, $3, 'out', 'whatsapp_cloud', $4, $5, $6, 'sent', $7, $8, $9, $9)
         RETURNING *`,
        [channel.user_id, conversation.id, leadId, content, mediaUrl, mediaType, String(m.id),
          JSON.stringify({ source: 'business_app', fromMe: true, to: m.to, message_type: m.type, media_id: mediaId || undefined }), at],
      )).rows[0];

      await query(
        `UPDATE conversations SET last_message_at = GREATEST(COALESCE(last_message_at, $2), $2), updated_at = NOW() WHERE id = $1`,
        [conversation.id, at],
      );
      getWebSocketService()?.emitNewMessage(channel.user_id, { conversationId: conversation.id, message: saved, conversation });
    }
  }

  // Ligação desfeita pela Meta (ex.: PARTNER_REMOVED por inatividade do telemóvel)
  private async onAccountUpdate(channel: any, value: any) {
    if (String(value?.event || '').toUpperCase() !== 'PARTNER_REMOVED') return;
    const upd = await query(
      `UPDATE channels SET status = 'inactive', updated_at = NOW() WHERE id = $1 AND status <> 'inactive' RETURNING id`,
      [channel.id],
    );
    if (!upd.rowCount) return;
    getWebSocketService()?.emitToUser(channel.user_id, 'channel:status', { channelId: channel.id, status: 'inactive' });
    await notificationsService.createNotification(
      channel.user_id, 'channel_disconnected', `WhatsApp "${channel.name}" desligado`,
      'A Meta desfez a ligação deste número. Abra o canal e ligue de novo.', 'whatsapp',
      { channelId: channel.id, actionUrl: '/dashboard/inbox/settings' },
    ).catch(() => {});
  }
}

export const whatsappCoexistenceService = new WhatsAppCoexistenceService();
