// Chamadas do WhatsApp Business atendidas por um agente de voz (ElevenLabs), pela API de chamadas
// da Meta (Cloud API Calling). O áudio passa pela ponte de voz (voice-bridge/, serviço à parte):
//
//   Meta ──webhook "calls" (connect, oferta SDP)──► API ──POST /calls──► ponte (resposta SDP)
//   API ──pre_accept + accept (resposta SDP)──► Meta;  API ──POST /calls/:id/start──► ponte
//   Meta ──webhook "terminate"──► API ──DELETE /calls/:id──► ponte ──aviso de fim──► API
//
// Desligado por omissão: WHATSAPP_CALLS_ENABLED=true só depois de validar uma chamada real.
// Cada número (canal whatsapp_cloud) guarda em settings.whatsapp_calls { enabled, voice_agent_id }.
// O histórico fica em voice_agent_calls (direction 'inbound', metadata.source 'whatsapp_call').
import { timingSafeEqual } from 'crypto';
import { query } from '../database/connection';

// A API de chamadas não existe em versões antigas da Graph API
const GRAPH = 'https://graph.facebook.com/v23.0';
const ELEVEN = 'https://api.elevenlabs.io/v1';
const TIMEOUT_MS = 15_000;
const DISCLOSURE_TEXT = process.env.WHATSAPP_CALLS_DISCLOSURE
  || 'Olá. Está a falar com um assistente virtual com inteligência artificial.';

export const callsEnabled = () => process.env.WHATSAPP_CALLS_ENABLED === 'true';
const bridgeUrl = () => (process.env.VOICE_BRIDGE_URL || '').replace(/\/$/, '');
const bridgeToken = () => process.env.VOICE_BRIDGE_TOKEN || '';
export const bridgeConfigured = () => !!(bridgeUrl() && bridgeToken());

/** O pedido vem da ponte de voz (mesmo token partilhado) */
export function isBridgeRequest(authorization: string | undefined): boolean {
  const expected = Buffer.from(`Bearer ${bridgeToken()}`);
  const got = Buffer.from(String(authorization || ''));
  return !!bridgeToken() && got.length === expected.length && timingSafeEqual(got, expected);
}

export class WhatsAppCallError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

// ── Meta ─────────────────────────────────────────────────────────────────────
async function graph(path: string, token: string, body: unknown) {
  const res = await fetch(`${GRAPH}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    const e = data?.error || {};
    console.error(`[WhatsAppCalls] Meta ${path}: ${e.code} ${e.message}`, JSON.stringify(e.error_data || {}));
    throw new WhatsAppCallError(META_ERRORS[e.code] || e.error_data?.details || e.message || `Erro ${res.status} da Meta`, 422);
  }
  return data;
}

// Erros da API de chamadas com o que a pessoa tem de fazer (developers.facebook.com → calling/troubleshooting)
const META_ERRORS: Record<number, string> = {
  138015: 'A Meta só liga as chamadas em números com limite de 2000 conversas por dia ou mais. Veja o limite do número no Gestor do WhatsApp.',
  138018: 'Falta subscrever as chamadas no webhook do WhatsApp Business.',
  138014: 'A Meta desativou as chamadas neste número por agora, por causa da qualidade.',
  131055: 'Este número está configurado para chamadas por SIP.',
};

const callAction = (phoneId: string, token: string, callId: string, action: string, sdp?: string) =>
  graph(`/${encodeURIComponent(phoneId)}/calls`, token, {
    messaging_product: 'whatsapp',
    call_id: callId,
    action,
    ...(sdp ? { session: { sdp_type: 'answer', sdp } } : {}),
  });

/** Liga ou desliga as chamadas no número (o ícone de chamada aparece aos clientes quando ligado) */
export async function setNumberCalling(phoneId: string, token: string, enabled: boolean) {
  return graph(`/${encodeURIComponent(phoneId)}/settings`, token, {
    calling: enabled
      ? { status: 'enabled', call_icon_visibility: 'DEFAULT' }
      : { status: 'disabled' },
  });
}

// ── Ponte ────────────────────────────────────────────────────────────────────
async function bridge(method: string, path: string, body?: unknown) {
  const res = await fetch(`${bridgeUrl()}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bridgeToken()}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new WhatsAppCallError(data?.error || `Ponte de voz: erro ${res.status}`, 502);
  return data;
}

// ── ElevenLabs ───────────────────────────────────────────────────────────────
const platformKey = () => process.env.ELEVENLABS_API_KEY || '';

/** Agentes criados na LeadsFlow (managed) vivem na conta ElevenLabs da plataforma; os antigos na do cliente */
async function elevenKey(userId: string, managed = false): Promise<string> {
  if (managed) return platformKey();
  const r = await query('SELECT elevenlabs_api_key FROM users WHERE id = $1', [userId]);
  return r.rows[0]?.elevenlabs_api_key || platformKey();
}

// ── Agentes geridos pela plataforma (o cliente não configura nada do ElevenLabs) ──
export interface ManagedAgentInput {
  name: string;
  instructions: string;
  greeting: string;
  voice_id: string;
  language: string;
}

export const LANGUAGES = ['pt', 'en', 'es', 'fr'] as const;

async function eleven(method: string, path: string, body?: unknown) {
  const key = platformKey();
  if (!key) throw new WhatsAppCallError('Agentes de voz indisponíveis de momento', 503);
  const res = await fetch(`${ELEVEN}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'xi-api-key': key },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data?.detail;
    const msg = typeof detail === 'string' ? detail : detail?.message || (Array.isArray(detail) ? detail.map((d: any) => d.msg).join('; ') : '');
    console.error(`[WhatsAppCalls] ElevenLabs ${method} ${path}: ${res.status}`, msg);
    throw new WhatsAppCallError('Não foi possível guardar o agente de voz', 422);
  }
  return data;
}

const CALL_STYLE = '\n\nEstás numa chamada de voz pelo WhatsApp: responde em frases curtas e naturais, uma ideia de cada vez, '
  + 'sem listas nem formatação. Se não souberes algo, diz que a equipa vai entrar em contacto.';

function agentBody(input: ManagedAgentInput) {
  return {
    name: input.name.slice(0, 100),
    conversation_config: {
      agent: {
        prompt: { prompt: `${input.instructions.trim()}${CALL_STYLE}` },
        first_message: input.greeting.trim(),
        language: input.language,
      },
      // Modelos v2.5 aceitam todas as línguas nos agentes de conversa
      tts: { voice_id: input.voice_id, model_id: input.language === 'en' ? 'eleven_flash_v2' : 'eleven_flash_v2_5' },
    },
  };
}

export async function createManagedAgent(input: ManagedAgentInput): Promise<string> {
  const data = await eleven('POST', '/convai/agents/create', agentBody(input));
  if (!data?.agent_id) throw new WhatsAppCallError('Não foi possível criar o agente de voz', 422);
  return data.agent_id;
}

export async function updateManagedAgent(agentId: string, input: ManagedAgentInput) {
  await eleven('PATCH', `/convai/agents/${encodeURIComponent(agentId)}`, agentBody(input));
}

export async function deleteManagedAgent(agentId: string) {
  await eleven('DELETE', `/convai/agents/${encodeURIComponent(agentId)}`).catch(() => {});
}

/** Vozes prontas da biblioteca (nunca as vozes clonadas da conta da plataforma) */
let voicesCache: { at: number; voices: any[] } | null = null;
export async function listVoices() {
  if (voicesCache && Date.now() - voicesCache.at < 3600_000) return voicesCache.voices;
  const data = await eleven('GET', '/voices');
  const voices = (data?.voices || [])
    .filter((v: any) => v.category === 'premade' || v.category === 'professional')
    .map((v: any) => ({
      voice_id: v.voice_id,
      name: v.name,
      gender: v.labels?.gender || null,
      accent: v.labels?.accent || null,
      preview_url: v.preview_url || null,
    }));
  voicesCache = { at: Date.now(), voices };
  return voices;
}

async function signedUrl(apiKey: string, agentId: string): Promise<string> {
  const res = await fetch(`${ELEVEN}/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`, {
    headers: { 'xi-api-key': apiKey },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data?.signed_url) throw new WhatsAppCallError(data?.detail?.message || 'O ElevenLabs recusou o agente', 422);
  return data.signed_url;
}

// O aviso "está a falar com uma IA" é dito pela ponte antes do agente (não depende de overrides no agente)
const disclosureCache = new Map<string, string>();
async function disclosureAudio(apiKey: string, voiceId: string | null): Promise<{ audioBase64: string; format: string } | null> {
  const voice = voiceId || process.env.ELEVENLABS_DEFAULT_VOICE_ID;
  if (!voice) return null;
  const key = `${voice}|${DISCLOSURE_TEXT}`;
  const cached = disclosureCache.get(key);
  if (cached) return { audioBase64: cached, format: 'pcm_16000' };
  const res = await fetch(`${ELEVEN}/text-to-speech/${encodeURIComponent(voice)}?output_format=pcm_16000`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
    body: JSON.stringify({ text: DISCLOSURE_TEXT, model_id: 'eleven_multilingual_v2' }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const b64 = Buffer.from(await res.arrayBuffer()).toString('base64');
  if (disclosureCache.size > 50) disclosureCache.clear();
  disclosureCache.set(key, b64);
  return { audioBase64: b64, format: 'pcm_16000' };
}

async function fetchConversation(apiKey: string, conversationId: string) {
  const res = await fetch(`${ELEVEN}/convai/conversations/${encodeURIComponent(conversationId)}`, {
    headers: { 'xi-api-key': apiKey },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return res.ok ? res.json() : null;
}

// ── Dados ────────────────────────────────────────────────────────────────────
const parse = (v: any) => (typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch { return {}; } })() : v || {});
const digits = (s: string) => String(s || '').replace(/\D/g, '');

async function channelForNumber(phoneId: string) {
  const r = await query(
    `SELECT * FROM channels WHERE type = 'whatsapp_cloud' AND credentials->>'phone_number_id' = $1
        AND status = 'active' LIMIT 1`,
    [phoneId],
  );
  return r.rows[0] || null;
}

async function callRow(callId: string) {
  const r = await query(
    `SELECT * FROM voice_agent_calls WHERE call_provider_id = $1 AND metadata->>'source' = 'whatsapp_call' LIMIT 1`,
    [callId],
  );
  return r.rows[0] || null;
}

// ── Eventos ──────────────────────────────────────────────────────────────────
export class WhatsAppCallsService {
  /** Webhook "calls" do WhatsApp Business. Nunca lança: os erros ficam no registo. */
  async handleCallsChange(value: any): Promise<void> {
    if (!callsEnabled() || !bridgeConfigured()) return;
    const phoneId = String(value?.metadata?.phone_number_id || '');
    for (const call of value?.calls || []) {
      try {
        if (call.event === 'connect' && call.direction !== 'BUSINESS_INITIATED' && call.session?.sdp) {
          await this.onConnect(phoneId, call, value?.contacts?.[0]);
        } else if (call.event === 'terminate') {
          await this.onTerminate(call);
        }
      } catch (err: any) {
        console.error(`[WhatsAppCalls] ${call?.event} ${call?.id}:`, err?.message || err);
      }
    }
  }

  private async onConnect(phoneId: string, call: any, contact: any) {
    if (await callRow(call.id)) return; // a Meta reenviou o evento
    const channel = await channelForNumber(phoneId);
    if (!channel) return;
    const token: string = channel.credentials?.access_token || '';
    const cfg = parse(channel.settings).whatsapp_calls || {};
    if (!cfg.enabled || !cfg.voice_agent_id || !token) {
      if (token) await callAction(phoneId, token, call.id, 'reject').catch(() => {});
      return;
    }

    const agentRes = await query('SELECT * FROM voice_agents WHERE id = $1 AND user_id = $2', [cfg.voice_agent_id, channel.user_id]);
    const agent = agentRes.rows[0];
    if (!agent) { // agente apagado depois de escolhido
      await callAction(phoneId, token, call.id, 'reject').catch(() => {});
      return;
    }
    const agentId: string | undefined = parse(agent.call_config).elevenlabs_agent_id;
    const from = digits(call.from || contact?.wa_id || '');
    const lead = from.length >= 7
      ? (await query(
          `SELECT id FROM leads WHERE user_id = $1
              AND (RIGHT(regexp_replace(COALESCE(phone, ''), '\\D', '', 'g'), 9) = $2
                OR RIGHT(regexp_replace(COALESCE(whatsapp, ''), '\\D', '', 'g'), 9) = $2) LIMIT 1`,
          [channel.user_id, from.slice(-9)],
        )).rows[0]
      : null;

    const row = (await query(
      `INSERT INTO voice_agent_calls (voice_agent_id, user_id, phone_number, direction, status, lead_id, call_provider_id, metadata, started_at)
       VALUES ($1, $2, $3, 'inbound', 'ringing', $4, $5, $6, NOW()) RETURNING id`,
      [agent.id, channel.user_id, from || 'desconhecido', lead?.id || null, call.id,
        JSON.stringify({ source: 'whatsapp_call', channel_id: channel.id, phone_number_id: phoneId, caller_name: contact?.profile?.name || null, managed: !!parse(agent.call_config).managed })],
    )).rows[0];

    const fail = async (message: string) => {
      await callAction(phoneId, token, call.id, 'reject').catch(() => {});
      await bridge('DELETE', `/calls/${encodeURIComponent(call.id)}?reason=failed`).catch(() => {});
      await query(
        `UPDATE voice_agent_calls SET status = 'failed', ended_at = NOW(), metadata = metadata || $2::jsonb WHERE id = $1`,
        [row.id, JSON.stringify({ error: message.slice(0, 300) })],
      );
    };

    try {
      if (!agentId) throw new WhatsAppCallError('O agente de voz não tem um agente ElevenLabs');
      const apiKey = await elevenKey(channel.user_id, !!parse(agent.call_config).managed);
      if (!apiKey) throw new WhatsAppCallError('Sem chave do ElevenLabs');
      const [url, disclosure] = await Promise.all([
        signedUrl(apiKey, agentId),
        disclosureAudio(apiKey, parse(agent.voice_config).voice_id || null).catch(() => null),
      ]);

      const answer = await bridge('POST', '/calls', {
        callId: call.id,
        sdp: call.session.sdp,
        signedUrl: url,
        disclosure,
        dynamicVariables: { caller_number: from, caller_name: contact?.profile?.name || '' },
        maxSeconds: Number(process.env.WHATSAPP_CALLS_MAX_SECONDS) || 1800,
      });
      await callAction(phoneId, token, call.id, 'pre_accept', answer.sdp);
      await callAction(phoneId, token, call.id, 'accept', answer.sdp);
      await bridge('POST', `/calls/${encodeURIComponent(call.id)}/start`);
      await query(`UPDATE voice_agent_calls SET status = 'answered', started_at = NOW() WHERE id = $1`, [row.id]);
    } catch (err: any) {
      await fail(String(err?.message || 'Não foi possível atender'));
      throw err;
    }
  }

  private async onTerminate(call: any) {
    await bridge('DELETE', `/calls/${encodeURIComponent(call.id)}?reason=terminate`).catch(() => {});
    const row = await callRow(call.id);
    if (!row) return;
    const status = call.status === 'FAILED' ? 'failed' : row.status === 'ringing' ? 'no-answer' : 'completed';
    await query(
      `UPDATE voice_agent_calls
          SET status = CASE WHEN status = 'failed' THEN status ELSE $2 END,
              duration_seconds = GREATEST(duration_seconds, $3), ended_at = COALESCE(ended_at, NOW()),
              metadata = metadata || $4::jsonb
        WHERE id = $1`,
      [row.id, status, Number(call.duration) || 0, JSON.stringify({ meta_status: call.status || null })],
    );
  }

  /** A ponte terminou a sessão: guarda a transcrição; se foi o agente a desligar, termina a chamada na Meta */
  async onBridgeEnded(result: any): Promise<void> {
    const row = await callRow(String(result?.callId || ''));
    if (!row) return;
    const lines = Array.isArray(result.transcript)
      ? result.transcript.map((t: any) => `${t.role === 'agent' ? 'Agente' : 'Cliente'}: ${t.message}`).join('\n')
      : null;
    await query(
      `UPDATE voice_agent_calls
          SET voice_provider_id = COALESCE($2, voice_provider_id), transcript = COALESCE($3, transcript),
              duration_seconds = GREATEST(duration_seconds, $4), ended_at = COALESCE(ended_at, NOW()),
              status = CASE WHEN status = 'answered' THEN 'completed' ELSE status END,
              metadata = metadata || $5::jsonb
        WHERE id = $1`,
      [row.id, result.conversationId || null, lines, Number(result.durationSecs) || 0,
        JSON.stringify({ bridge_reason: result.reason || null, bridge_stats: result.stats || null })],
    );

    const meta = parse(row.metadata);
    if (['agent_closed', 'max_duration', 'media_failed'].includes(result.reason) && meta.phone_number_id) {
      const ch = (await query('SELECT * FROM channels WHERE id = $1', [meta.channel_id])).rows[0];
      const token = ch?.credentials?.access_token;
      if (token) await callAction(meta.phone_number_id, token, row.call_provider_id, 'terminate').catch(() => {});
    }

    // Transcrição final, duração e custo do ElevenLabs (prontos uns segundos depois)
    if (result.conversationId) {
      setTimeout(() => { void this.syncConversation(row.id, row.user_id, result.conversationId, !!meta.managed); }, 20_000).unref?.();
    }
  }

  private async syncConversation(rowId: string, userId: string, conversationId: string, managed = false) {
    try {
      const apiKey = await elevenKey(userId, managed);
      const conv: any = apiKey ? await fetchConversation(apiKey, conversationId) : null;
      if (!conv) return;
      const lines = (conv.transcript || [])
        .filter((t: any) => t?.message)
        .map((t: any) => `${t.role === 'agent' ? 'Agente' : 'Cliente'}: ${t.message}`)
        .join('\n');
      await query(
        `UPDATE voice_agent_calls
            SET transcript = COALESCE(NULLIF($2, ''), transcript),
                duration_seconds = GREATEST(duration_seconds, $3),
                metadata = metadata || $4::jsonb
          WHERE id = $1`,
        [rowId, lines, Number(conv.metadata?.call_duration_secs) || 0,
          JSON.stringify({ elevenlabs_cost: conv.metadata?.cost ?? null, elevenlabs_cost_fiat: conv.metadata?.cost_fiat ?? null })],
      );
    } catch (err: any) {
      console.warn('[WhatsAppCalls] Conversa do ElevenLabs não sincronizada:', err?.message);
    }
  }
}

export const whatsappCallsService = new WhatsAppCallsService();
