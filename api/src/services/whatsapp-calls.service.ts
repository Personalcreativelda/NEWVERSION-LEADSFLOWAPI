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
import { callAllowance, callerBlocked, notifyUsageThresholds } from './voice-usage.service';
import { contactWindow } from './whatsapp-window.service';
import { notificationsService } from './notifications.service';
import { cloudChannelForNumber } from './channels.service';
import { callContext, noteCallInConversation, toolsPrompt, voiceToolIds } from './voice-tools.service';

// A API de chamadas não existe em versões antigas da Graph API
const GRAPH = 'https://graph.facebook.com/v23.0';
const ELEVEN = 'https://api.elevenlabs.io/v1';
const TIMEOUT_MS = 15_000;
// Aviso fixo antes do agente: só com WHATSAPP_CALLS_DISCLOSURE definido. Por omissão quem fala primeiro é o
// agente, com a primeira frase que o cliente escreveu (o aviso + "Olá" do agente repetia a saudação).
const DISCLOSURE_TEXT = (process.env.WHATSAPP_CALLS_DISCLOSURE || '').trim();

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
  // Chamadas feitas pela empresa
  138000: 'As chamadas não estão ativas neste número. Ative "Atender" no número primeiro.',
  138001: 'Este contacto não pode receber chamadas do WhatsApp (número sem WhatsApp ou app desatualizada).',
  138003: 'Já há uma chamada em curso com este contacto.',
  138005: 'Demasiadas chamadas seguidas. Tente daqui a pouco.',
  138006: 'Este cliente ainda não autorizou chamadas. Peça autorização primeiro.',
  138009: 'Já pediu autorização a este cliente recentemente (máximo 1 por dia e 2 por semana).',
  138012: 'Chegou ao limite de chamadas feitas deste número nas últimas 24 horas.',
  138013: 'Este número não pode fazer chamadas pelo WhatsApp.',
  138017: 'Este cliente já autorizou chamadas.',
  138037: 'Chegou ao limite de chamadas deste número nas últimas 24 horas.',
};

async function graphGet(path: string, token: string) {
  const res = await fetch(`${GRAPH}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    const e = data?.error || {};
    throw new WhatsAppCallError(META_ERRORS[e.code] || e.message || `Erro ${res.status} da Meta`, 422);
  }
  return data;
}

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
  /** Grupos de ações ligados (voice-tools.service TOOL_GROUPS); sem valor = todos */
  tools?: string[];
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
  + 'sem listas nem formatação. Se não souberes algo, diz que a equipa vai entrar em contacto.'
  + '\nA chamada começa com a tua primeira frase, que já foi dita: não voltes a cumprimentar nem a apresentar-te; '
  + 'continua a conversa a partir da resposta do cliente.';

const SILENCE_END_SECONDS = Number(process.env.VOICE_SILENCE_END_SECONDS) || 20;

/** Instruções completas do agente (as mesmas que ficam no ElevenLabs) */
function agentPrompt(instructions: string, tools?: unknown) {
  return `${instructions.trim()}${CALL_STYLE}${toolsPrompt(tools)}`;
}

/** Corpo do agente no ElevenLabs; toolIds = ferramentas para agir no LeadsFlow (voice-tools.service) */
function agentBody(input: ManagedAgentInput, toolIds: string[] = []) {
  return {
    name: input.name.slice(0, 100),
    conversation_config: {
      agent: {
        // Sempre tool_ids (mesmo vazio): desligar todas as ações tem de as tirar do agente
        prompt: { prompt: agentPrompt(input.instructions, input.tools), tool_ids: toolIds },
        first_message: input.greeting.trim(),
        language: input.language,
      },
      // Modelos v2.5 aceitam todas as línguas nos agentes de conversa
      tts: { voice_id: input.voice_id, model_id: input.language === 'en' ? 'eleven_flash_v2' : 'eleven_flash_v2_5' },
      // 20 s sem o cliente falar → o agente desliga (não fica a gastar minutos numa linha calada)
      turn: { silence_end_call_timeout: SILENCE_END_SECONDS },
      // Teto do ElevenLabs; o limite real de cada chamada (plano/minutos restantes) é a ponte que corta
      conversation: { max_duration_seconds: 1800 },
    },
    // Guarda o áudio da conversa para o cliente o ouvir no histórico; deixa a ponte trocar a primeira
    // frase e as instruções numa chamada feita pela empresa (o agente liga em vez de atender)
    platform_settings: {
      privacy: { record_voice: true },
      overrides: { conversation_config_override: { agent: { first_message: true, prompt: { prompt: true } } } },
    },
  };
}

export async function createManagedAgent(input: ManagedAgentInput): Promise<string> {
  const data = await eleven('POST', '/convai/agents/create', agentBody(input, await voiceToolIds(input.tools)));
  if (!data?.agent_id) throw new WhatsAppCallError('Não foi possível criar o agente de voz', 422);
  return data.agent_id;
}

export async function updateManagedAgent(agentId: string, input: ManagedAgentInput) {
  await eleven('PATCH', `/convai/agents/${encodeURIComponent(agentId)}`, agentBody(input, await voiceToolIds(input.tools)));
}

/** Sobe quando CALL_STYLE/agentBody mudam: os agentes com versão anterior são atualizados ao arrancar */
export const AGENT_PROMPT_VERSION = 5;

export async function resyncManagedAgents(): Promise<void> {
  if (!platformKey()) return;
  const rows = (await query(
    `SELECT id, name, instructions, greeting_message, language, voice_config, call_config FROM voice_agents
      WHERE call_config->>'managed' = 'true' AND call_config->>'elevenlabs_agent_id' IS NOT NULL
        AND COALESCE((call_config->>'prompt_v')::int, 1) < $1`,
    [AGENT_PROMPT_VERSION],
  )).rows;
  for (const a of rows) {
    try {
      const voiceId = parse(a.voice_config).voice_id;
      if (!voiceId || !a.greeting_message) continue;
      await updateManagedAgent(parse(a.call_config).elevenlabs_agent_id, {
        name: a.name, instructions: a.instructions || '', greeting: a.greeting_message,
        voice_id: voiceId, language: String(a.language || 'pt').slice(0, 2), tools: parse(a.call_config).tools,
      });
      await query(
        `UPDATE voice_agents SET call_config = call_config || $2::jsonb WHERE id = $1`,
        [a.id, JSON.stringify({ prompt_v: AGENT_PROMPT_VERSION })],
      );
    } catch (err: any) {
      console.warn(`[WhatsAppCalls] Agente ${a.id} não atualizado:`, err?.message);
    }
  }
  if (rows.length) console.log(`[WhatsAppCalls] ${rows.length} agente(s) de voz atualizados para a versão ${AGENT_PROMPT_VERSION}`);
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
  if (!voice || !DISCLOSURE_TEXT) return null;
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

const channelForNumber = (phoneId: string) => cloudChannelForNumber(phoneId, { activeOnly: true });

/** Pela id da Meta (wacid…) ou pela chave da ponte (chamadas feitas usam a id da linha) */
async function callRow(callId: string) {
  if (!callId) return null;
  const r = await query(
    `SELECT * FROM voice_agent_calls
      WHERE (call_provider_id = $1 OR metadata->>'bridge_key' = $1) AND metadata->>'source' = 'whatsapp_call'
      ORDER BY created_at DESC LIMIT 1`,
    [callId],
  );
  return r.rows[0] || null;
}

/** Chave da sessão na ponte: a id da Meta nas recebidas, a id da linha nas feitas */
const bridgeKey = (row: any, fallback: string) => parse(row?.metadata).bridge_key || fallback;

async function findLeadByPhone(userId: string, phone: string) {
  if (phone.length < 7) return null;
  return (await query(
    `SELECT id, name FROM leads WHERE user_id = $1
        AND (RIGHT(regexp_replace(COALESCE(phone, ''), '\\D', '', 'g'), 9) = $2
          OR RIGHT(regexp_replace(COALESCE(whatsapp, ''), '\\D', '', 'g'), 9) = $2) LIMIT 1`,
    [userId, phone.slice(-9)],
  )).rows[0] || null;
}

// ── Eventos ──────────────────────────────────────────────────────────────────
export class WhatsAppCallsService {
  /** Webhook "calls" do WhatsApp Business. Nunca lança: os erros ficam no registo. */
  async handleCallsChange(value: any): Promise<void> {
    if (!callsEnabled() || !bridgeConfigured()) return;
    const phoneId = String(value?.metadata?.phone_number_id || '');
    for (const st of value?.statuses || []) {
      if (st?.type === 'call' || st?.id) await this.onOutboundStatus(st).catch((err) => console.error('[WhatsAppCalls] estado:', err?.message));
    }
    for (const call of value?.calls || []) {
      try {
        if (call.event === 'connect' && call.direction === 'BUSINESS_INITIATED') {
          await this.onOutboundAnswered(call);
        } else if (call.event === 'connect' && call.session?.sdp) {
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
    const lead = await findLeadByPhone(channel.user_id, from);
    const baseMeta = {
      source: 'whatsapp_call', channel_id: channel.id, phone_number_id: phoneId, bridge_key: call.id,
      caller_name: contact?.profile?.name || null, managed: !!parse(agent.call_config).managed,
    };

    // Minutos do plano esgotados, ou o mesmo número a ligar sem parar: recusa sem gastar o agente
    const allowance = await callAllowance(channel.user_id);
    const blocked = allowance.ok && await callerBlocked(channel.user_id, from);
    if (!allowance.ok || blocked) {
      await callAction(phoneId, token, call.id, 'reject').catch(() => {});
      await query(
        `INSERT INTO voice_agent_calls (voice_agent_id, user_id, phone_number, direction, status, lead_id, call_provider_id, metadata, started_at, ended_at)
         VALUES ($1, $2, $3, 'inbound', 'rejected', $4, $5, $6, NOW(), NOW())`,
        [agent.id, channel.user_id, from || 'desconhecido', lead?.id || null, call.id,
          JSON.stringify({ ...baseMeta, reject_reason: !allowance.ok ? allowance.code : 'CALLER_LIMIT' })],
      );
      if (!allowance.ok) void notifyUsageThresholds(channel.user_id);
      return;
    }

    const row = (await query(
      `INSERT INTO voice_agent_calls (voice_agent_id, user_id, phone_number, direction, status, lead_id, call_provider_id, metadata, started_at)
       VALUES ($1, $2, $3, 'inbound', 'ringing', $4, $5, $6, NOW()) RETURNING id`,
      [agent.id, channel.user_id, from || 'desconhecido', lead?.id || null, call.id, JSON.stringify(baseMeta)],
    )).rows[0];
    void callContext(call.id).catch(() => {});

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
        maxSeconds: allowance.maxSeconds,
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
    const row = await callRow(call.id) || await callRow(String(call.biz_opaque_callback_data || ''));
    await bridge('DELETE', `/calls/${encodeURIComponent(bridgeKey(row, call.id))}?reason=terminate`).catch(() => {});
    if (!row) return;
    if (row.status === 'rejected') return;
    const status = call.status === 'FAILED' ? 'failed'
      : ['ringing', 'initiated'].includes(row.status) ? 'no-answer' : 'completed';
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
      setTimeout(() => {
        void this.syncConversation(row.id, row.user_id, result.conversationId, !!meta.managed).then(() => noteCallInConversation(row.id));
      }, 20_000).unref?.();
    } else {
      void noteCallInConversation(row.id);
    }
    void notifyUsageThresholds(row.user_id).catch(() => {});
  }

  // ── Chamadas feitas pela empresa ──────────────────────────────────────────
  /**
   * O agente liga a um cliente. A Meta exige autorização do cliente (pedido por mensagem, válida 7 dias).
   * Ordem: oferta SDP da ponte → "connect" na Meta → (o cliente atende) webhook connect com a resposta SDP
   * → ponte liga o agente. A chave da sessão na ponte é a id da linha (a da Meta só chega depois).
   */
  async startOutbound(userId: string, input: { channel_id: string; voice_agent_id: string; to: string; greeting: string; purpose?: string }) {
    if (!callsEnabled() || !bridgeConfigured()) throw new WhatsAppCallError('Ainda não disponível', 403);
    const to = digits(input.to);
    if (to.length < 8) throw new WhatsAppCallError('Número inválido. Use o indicativo do país (ex.: 258…).');
    const greeting = String(input.greeting || '').trim();
    if (!greeting) throw new WhatsAppCallError('Escreva a primeira frase');
    const purpose = String(input.purpose || '').trim().slice(0, 1500);

    const channel = (await query(
      `SELECT * FROM channels WHERE id = $1 AND user_id = $2 AND type = 'whatsapp_cloud' AND status = 'active'`,
      [input.channel_id, userId],
    )).rows[0];
    if (!channel) throw new WhatsAppCallError('Número WhatsApp Business não encontrado', 404);
    const phoneId = channel.credentials?.phone_number_id;
    const token = channel.credentials?.access_token;
    if (!phoneId || !token) throw new WhatsAppCallError('Ligue de novo o número WhatsApp Business');
    if (!parse(channel.settings).whatsapp_calls?.enabled) {
      throw new WhatsAppCallError('Ative as chamadas neste número primeiro (secção Números)');
    }
    const agent = (await query('SELECT * FROM voice_agents WHERE id = $1 AND user_id = $2', [input.voice_agent_id, userId])).rows[0];
    const call = parse(agent?.call_config);
    if (!agent || !call.elevenlabs_agent_id) throw new WhatsAppCallError('Escolha um agente', 404);

    const allowance = await callAllowance(userId);
    if (!allowance.ok) throw Object.assign(new WhatsAppCallError(allowance.reason, 403), { code: allowance.code });

    const permission = await this.permissionStatus(phoneId, token, to);
    if (!permission.can_call) {
      throw Object.assign(new WhatsAppCallError('Este cliente ainda não autorizou chamadas', 409), {
        code: 'NEEDS_PERMISSION', can_request: permission.can_request,
      });
    }

    const lead = await findLeadByPhone(userId, to);
    const row = (await query(
      `INSERT INTO voice_agent_calls (voice_agent_id, user_id, phone_number, direction, status, lead_id, metadata)
       VALUES ($1, $2, $3, 'outbound', 'initiated', $4, $5) RETURNING id`,
      [agent.id, userId, to, lead?.id || null,
        JSON.stringify({ source: 'whatsapp_call', channel_id: channel.id, phone_number_id: phoneId, managed: !!call.managed, caller_name: lead?.name || null, purpose: purpose || null })],
    )).rows[0];
    await query(`UPDATE voice_agent_calls SET metadata = metadata || $2::jsonb WHERE id = $1`, [row.id, JSON.stringify({ bridge_key: row.id })]);
    void callContext(row.id).catch(() => {});

    try {
      const apiKey = await elevenKey(userId, !!call.managed);
      if (!apiKey) throw new WhatsAppCallError('Agentes de voz indisponíveis de momento', 503);
      const url = await signedUrl(apiKey, call.elevenlabs_agent_id);
      const outboundNote = '\n\nEsta chamada foi feita por ti: foste tu que ligaste ao cliente, ele não te ligou. '
        + 'Se a pessoa não puder falar agora, agradece e despede-te.'
        + (purpose ? `\nObjetivo desta chamada: ${purpose}` : '');
      const offer = await bridge('POST', '/calls/outbound', {
        callId: row.id,
        signedUrl: url,
        dynamicVariables: { caller_number: to, caller_name: lead?.name || '' },
        conversationOverride: { agent: { first_message: greeting.slice(0, 500), prompt: { prompt: agentPrompt(agent.instructions || '', call.tools) + outboundNote } } },
        maxSeconds: allowance.maxSeconds,
      });
      const res = await graph(`/${encodeURIComponent(phoneId)}/calls`, token, {
        messaging_product: 'whatsapp',
        to,
        action: 'connect',
        session: { sdp_type: 'offer', sdp: offer.sdp },
        biz_opaque_callback_data: row.id,
      });
      const wacid = res?.calls?.[0]?.id || null;
      await query(`UPDATE voice_agent_calls SET call_provider_id = $2, status = 'ringing' WHERE id = $1`, [row.id, wacid]);
      return { id: row.id };
    } catch (err: any) {
      await bridge('DELETE', `/calls/${encodeURIComponent(row.id)}?reason=failed`).catch(() => {});
      await query(
        `UPDATE voice_agent_calls SET status = 'failed', ended_at = NOW(), metadata = metadata || $2::jsonb WHERE id = $1`,
        [row.id, JSON.stringify({ error: String(err?.message || 'Não foi possível ligar').slice(0, 300) })],
      );
      throw err;
    }
  }

  /** O cliente atendeu: a resposta SDP vai para a ponte, que liga o agente */
  private async onOutboundAnswered(call: any) {
    const row = await callRow(String(call.biz_opaque_callback_data || '')) || await callRow(call.id);
    if (!row || row.direction !== 'outbound') return;
    const sdp = call.session?.sdp;
    if (!sdp) return;
    if (['answered', 'completed', 'failed'].includes(row.status)) return; // evento repetido
    await query(
      `UPDATE voice_agent_calls SET status = 'answered', started_at = NOW(), call_provider_id = COALESCE(call_provider_id, $2) WHERE id = $1`,
      [row.id, call.id],
    );
    try {
      await bridge('POST', `/calls/${encodeURIComponent(bridgeKey(row, row.id))}/answer`, { sdp });
    } catch (err: any) {
      const meta = parse(row.metadata);
      const ch = (await query('SELECT credentials FROM channels WHERE id = $1', [meta.channel_id])).rows[0];
      if (ch?.credentials?.access_token) await callAction(meta.phone_number_id, ch.credentials.access_token, call.id, 'terminate').catch(() => {});
      await query(
        `UPDATE voice_agent_calls SET status = 'failed', ended_at = NOW(), metadata = metadata || $2::jsonb WHERE id = $1`,
        [row.id, JSON.stringify({ error: String(err?.message || 'Falhou o áudio').slice(0, 300) })],
      );
    }
  }

  /** RINGING / ACCEPTED / REJECTED das chamadas feitas */
  private async onOutboundStatus(st: any) {
    const row = await callRow(String(st.biz_opaque_callback_data || '')) || await callRow(String(st.id || ''));
    if (!row || row.direction !== 'outbound') return;
    const s = String(st.status || '').toUpperCase();
    if (s === 'RINGING' && row.status === 'initiated') {
      await query(`UPDATE voice_agent_calls SET status = 'ringing' WHERE id = $1`, [row.id]);
    } else if (s === 'REJECTED') {
      await bridge('DELETE', `/calls/${encodeURIComponent(bridgeKey(row, row.id))}?reason=rejected`).catch(() => {});
      await query(
        `UPDATE voice_agent_calls SET status = 'no-answer', ended_at = COALESCE(ended_at, NOW()) WHERE id = $1 AND status IN ('initiated', 'ringing')`,
        [row.id],
      );
    }
  }

  /** O cliente pode receber chamadas deste número? (e ainda se pode pedir autorização?) */
  async permissionStatus(phoneId: string, token: string, to: string) {
    const data = await graphGet(`/${encodeURIComponent(phoneId)}/call_permissions?user_wa_id=${encodeURIComponent(to)}`, token);
    const action = (name: string) => (data?.actions || []).find((a: any) => a.action_name === name);
    const status = String(data?.permission?.status || 'no_permission');
    return {
      status,
      expires_at: data?.permission?.expiration_time ? new Date(Number(data.permission.expiration_time) * 1000).toISOString() : null,
      can_call: action('start_call')?.can_perform_action ?? status !== 'no_permission',
      can_request: action('send_call_permission_request')?.can_perform_action ?? status === 'no_permission',
    };
  }

  async permissionForUser(userId: string, channelId: string, to: string) {
    const ch = await this.callChannel(userId, channelId);
    return this.permissionStatus(ch.phoneId, ch.token, digits(to));
  }

  private async callChannel(userId: string, channelId: string) {
    const channel = (await query(
      `SELECT * FROM channels WHERE id = $1 AND user_id = $2 AND type = 'whatsapp_cloud' AND status = 'active'`,
      [channelId, userId],
    )).rows[0];
    const phoneId = channel?.credentials?.phone_number_id;
    const token = channel?.credentials?.access_token;
    if (!channel || !phoneId || !token) throw new WhatsAppCallError('Número WhatsApp Business não encontrado', 404);
    return { channel, phoneId: String(phoneId), token: String(token) };
  }

  /**
   * Pede autorização para ligar (mensagem interativa "call_permission_request"). Só com a janela de
   * 24 horas aberta (o cliente escreveu nas últimas 24 h); a Meta deixa 1 pedido por dia e 2 por semana.
   */
  async requestPermission(userId: string, channelId: string, toRaw: string, text?: string) {
    const { channel, phoneId, token } = await this.callChannel(userId, channelId);
    const to = digits(toRaw);
    const win = await contactWindow(userId, channel.id, to);
    if (!win.open) {
      throw new WhatsAppCallError('O cliente não escreveu nas últimas 24 horas. Peça-lhe que mande uma mensagem e depois peça autorização.', 422);
    }
    const body = String(text || '').trim().slice(0, 1024) || 'Podemos ligar-lhe pelo WhatsApp?';
    const res = await graph(`/${encodeURIComponent(phoneId)}/messages`, token, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: { type: 'call_permission_request', action: { name: 'call_permission_request' }, body: { text: body } },
    });
    // Fica também na conversa da caixa de entrada
    const conv = (await query(
      `SELECT id, lead_id FROM conversations WHERE user_id = $1 AND channel_id = $2 AND remote_jid = $3 LIMIT 1`,
      [userId, channel.id, `${to}@s.whatsapp.net`],
    )).rows[0];
    if (conv) {
      await query(
        `INSERT INTO messages (user_id, conversation_id, lead_id, direction, channel, content, status, external_id, metadata)
         VALUES ($1, $2, $3, 'out', 'whatsapp_cloud', $4, 'pending', $5, $6)`,
        [userId, conv.id, conv.lead_id, `📞 ${body}`, res?.messages?.[0]?.id || null, JSON.stringify({ source: 'call_permission_request' })],
      ).catch((err: any) => console.warn('[WhatsAppCalls] Pedido não guardado na conversa:', err?.message));
    }
    return { ok: true };
  }

  /** Resposta do cliente ao pedido de autorização (webhook messages → interactive call_permission_reply) */
  async onPermissionReply(phoneId: string, from: string, reply: any): Promise<void> {
    try {
      const channel = await channelForNumber(phoneId);
      if (!channel) return;
      const accepted = reply?.response === 'accept';
      const who = (await findLeadByPhone(channel.user_id, digits(from)))?.name || `+${digits(from)}`;
      await notificationsService.createNotification(
        channel.user_id, 'call_permission',
        accepted ? `${who} autorizou chamadas` : `${who} recusou chamadas`,
        accepted
          ? (reply?.is_permanent ? 'Pode ligar-lhe com um agente de voz.' : 'Pode ligar-lhe com um agente de voz nos próximos 7 dias.')
          : undefined,
        'phone',
        { actionUrl: '/dashboard/voice-agents', phone: digits(from) },
        { actionUrl: '/dashboard/voice-agents' },
      );
    } catch (err: any) {
      console.warn('[WhatsAppCalls] Resposta de autorização:', err?.message);
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
          JSON.stringify({
            elevenlabs_cost: conv.metadata?.cost ?? null,
            elevenlabs_cost_fiat: conv.metadata?.cost_fiat ?? null,
            has_audio: conv.has_audio ?? null,
          })],
      );
    } catch (err: any) {
      console.warn('[WhatsAppCalls] Conversa do ElevenLabs não sincronizada:', err?.message);
    }
  }
}

export const whatsappCallsService = new WhatsAppCallsService();

/** Gravação da chamada (MP3, as duas vozes) guardada pelo ElevenLabs. null = sem gravação. */
export async function callRecording(userId: string, callId: string): Promise<Response | null> {
  const row = (await query(
    `SELECT voice_provider_id, metadata FROM voice_agent_calls
      WHERE id = $1 AND user_id = $2 AND metadata->>'source' = 'whatsapp_call'`,
    [callId, userId],
  )).rows[0];
  if (!row?.voice_provider_id) return null;
  const meta = parse(row.metadata);
  if (meta.has_audio === false) return null;
  const apiKey = await elevenKey(userId, !!meta.managed);
  if (!apiKey) return null;
  const res = await fetch(`${ELEVEN}/convai/conversations/${encodeURIComponent(row.voice_provider_id)}/audio`, {
    headers: { 'xi-api-key': apiKey },
    signal: AbortSignal.timeout(60_000),
  });
  return res.ok && res.body ? res : null;
}
