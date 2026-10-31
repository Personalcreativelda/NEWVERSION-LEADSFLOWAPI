// Envio dos fluxos de remarketing por cada canal: encontra a conversa do lead, respeita a janela
// de 24 horas da Meta, envia texto ou áudio e grava a mensagem na conversa (aparece na inbox).
import { query as dbQuery } from '../database/connection';
import { WhatsAppService } from './whatsapp.service';
import { MessagesService } from './messages.service';
import { getStorageService } from './storage.service';
import { getWebSocketService } from './websocket.service';
import { AIService } from './ai.service';
import { emailService } from './email.service';
import {
  CloudSendError, cloudRecipient, loadMediaFile, sendCloudMedia, sendCloudTemplate, sendCloudText,
} from './whatsapp-cloud.service';
import { metaMessagesUrl } from '../utils/meta-send';
import { publicFileUrl } from '../utils/storage-urls';
import { convertToM4a, convertToOggOpus } from '../utils/media-convert';

const whatsappService = new WhatsAppService();
const messagesService = new MessagesService();
const aiService = new AIService();

const WINDOW_MS = 24 * 3600 * 1000;
/** Canais da Meta: fora das 24 horas depois da última mensagem do cliente não aceitam texto livre */
const META_WINDOW_TYPES = new Set(['whatsapp_cloud', 'facebook', 'messenger', 'instagram']);
const MESSAGING_TYPES = ['whatsapp', 'whatsapp_cloud', 'facebook', 'messenger', 'instagram', 'telegram'];
const TYPES_BY_CHANNEL: Record<string, string[]> = {
  whatsapp: ['whatsapp', 'whatsapp_cloud'],
  facebook: ['facebook', 'messenger'],
  instagram: ['instagram'],
  telegram: ['telegram'],
};

/** `transient`: vale a pena tentar de novo mais tarde (rede, limite de envios, instância desligada) */
export class FlowSendError extends Error {
  constructor(message: string, public transient = false) { super(message); }
}

export interface FlowTarget {
  conversationId?: string;
  remoteJid: string;
  phone: string;
  channelId: string;
  channelType: string;
  credentials: any;
  lastInboundAt: Date | null;
}

export interface FlowLead {
  id: string;
  user_id: string;
  name?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  [key: string]: any;
}

export interface WhatsAppTemplateRef { name: string; language: string; params?: string[] }

function parseCredentials(value: any): any {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

const leadDigits = (lead: FlowLead) => String(lead.whatsapp || lead.phone || '').replace(/\D/g, '');

/**
 * Por onde falar com o lead: a conversa mais recente no canal pedido (ou em qualquer canal).
 * Sem conversa, só o WhatsApp consegue iniciar uma, pelo telefone do lead.
 */
export async function resolveTarget(lead: FlowLead, channel?: string | null): Promise<FlowTarget | null> {
  const wanted = channel && TYPES_BY_CHANNEL[channel] ? TYPES_BY_CHANNEL[channel] : MESSAGING_TYPES;
  const conv = await dbQuery(
    `SELECT c.id, c.remote_jid, c.channel_id, ch.type AS channel_type, ch.credentials AS channel_credentials,
            (SELECT MAX(m.created_at) FROM messages m WHERE m.conversation_id = c.id AND m.direction = 'in') AS last_inbound_at
       FROM conversations c
       JOIN channels ch ON ch.id = c.channel_id
      WHERE c.lead_id = $1 AND c.user_id = $2
        AND ch.type = ANY($3::text[]) AND ch.status IN ('active', 'connected')
      ORDER BY c.last_message_at DESC NULLS LAST
      LIMIT 1`,
    [lead.id, lead.user_id, wanted],
  );
  const row = conv.rows?.[0];
  if (row?.remote_jid) {
    return {
      conversationId: row.id,
      remoteJid: row.remote_jid,
      phone: leadDigits(lead),
      channelId: row.channel_id,
      channelType: row.channel_type,
      credentials: parseCredentials(row.channel_credentials),
      lastInboundAt: row.last_inbound_at ? new Date(row.last_inbound_at) : null,
    };
  }

  const digits = leadDigits(lead);
  if ((channel && channel !== 'whatsapp') || digits.length < 8) return null;
  const ch = await dbQuery(
    `SELECT id, type, credentials FROM channels
      WHERE user_id = $1 AND type = ANY($2::text[]) AND status IN ('active', 'connected')
      ORDER BY (type = 'whatsapp') DESC, created_at DESC
      LIMIT 1`,
    [lead.user_id, TYPES_BY_CHANNEL.whatsapp],
  );
  const found = ch.rows?.[0];
  if (!found) return null;
  return {
    remoteJid: `${digits}@s.whatsapp.net`,
    phone: digits,
    channelId: found.id,
    channelType: found.type,
    credentials: parseCredentials(found.credentials),
    lastInboundAt: null,
  };
}

/** A conversa onde o cliente acabou de escrever: é por ela que se responde */
export async function targetForConversation(conversationId: string, lead: FlowLead): Promise<FlowTarget | null> {
  const res = await dbQuery(
    `SELECT c.id, c.remote_jid, c.channel_id, ch.type AS channel_type, ch.credentials AS channel_credentials,
            (SELECT MAX(m.created_at) FROM messages m WHERE m.conversation_id = c.id AND m.direction = 'in') AS last_inbound_at
       FROM conversations c
       JOIN channels ch ON ch.id = c.channel_id
      WHERE c.id = $1 AND c.user_id = $2 AND ch.status IN ('active', 'connected')
      LIMIT 1`,
    [conversationId, lead.user_id],
  );
  const row = res.rows?.[0];
  if (!row?.remote_jid || !MESSAGING_TYPES.includes(row.channel_type)) return null;
  return {
    conversationId: row.id,
    remoteJid: row.remote_jid,
    phone: leadDigits(lead),
    channelId: row.channel_id,
    channelType: row.channel_type,
    credentials: parseCredentials(row.channel_credentials),
    lastInboundAt: row.last_inbound_at ? new Date(row.last_inbound_at) : null,
  };
}

/** A janela de 24 horas da Meta está aberta (ou o canal não tem essa regra)? */
export function isWindowOpen(target: FlowTarget, now = Date.now()): boolean {
  if (!META_WINDOW_TYPES.has(target.channelType)) return true;
  return !!target.lastInboundAt && now - target.lastInboundAt.getTime() < WINDOW_MS;
}

function evolutionInstance(target: FlowTarget): string {
  const c = target.credentials || {};
  const instance = c.instance_name || c.instanceId || c.instance_id;
  if (!instance) throw new FlowSendError('O canal WhatsApp não está configurado');
  return String(instance);
}

/** Número ou JID para a Evolution: contactos @lid só se alcançam pelo próprio JID */
function evolutionNumber(target: FlowTarget): string {
  if (target.remoteJid.includes('@lid')) return target.remoteJid;
  return target.phone || target.remoteJid.split('@')[0].replace(/\D/g, '');
}

function cloudError(err: unknown): FlowSendError {
  if (err instanceof CloudSendError) {
    return new FlowSendError(err.message, [130429, 80007, 131056].includes(Number(err.metaCode)));
  }
  return new FlowSendError((err as any)?.message || 'Falha de rede', true);
}

async function metaSend(target: FlowTarget, message: Record<string, any>): Promise<any> {
  const token = target.credentials?.page_access_token || target.credentials?.access_token;
  if (!token) throw new FlowSendError('O canal não tem token: ligue-o de novo');
  const url = metaMessagesUrl(token, target.credentials?.page_id);
  const res = await fetch(`${url}?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { id: target.remoteJid }, message }),
    signal: AbortSignal.timeout(30_000),
  }).catch((e) => { throw new FlowSendError(e?.message || 'Falha de rede', true); });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new FlowSendError(data?.error?.message || `A Meta respondeu ${res.status}`, res.status >= 500 || res.status === 429);
  }
  return data;
}

async function telegramCall(token: string, method: string, init: RequestInit): Promise<any> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', signal: AbortSignal.timeout(60_000), ...init })
    .catch((e) => { throw new FlowSendError(e?.message || 'Falha de rede', true); });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    throw new FlowSendError(data?.description || `O Telegram respondeu ${res.status}`, res.status >= 500 || res.status === 429);
  }
  return data.result;
}

function telegramToken(target: FlowTarget): string {
  const token = target.credentials?.bot_token || target.credentials?.token;
  if (!token) throw new FlowSendError('O canal Telegram não tem token: ligue-o de novo');
  return token;
}

const externalIdOf = (r: any): string | null =>
  r?.key?.id || r?.messages?.[0]?.id || r?.message_id?.toString?.() || null;

/** Texto, ou o modelo aprovado quando o WhatsApp oficial já está fora das 24 horas */
export async function sendText(target: FlowTarget, text: string, template?: WhatsAppTemplateRef | null): Promise<{ externalId: string | null; content: string }> {
  const open = isWindowOpen(target);

  if (target.channelType === 'whatsapp_cloud') {
    const to = cloudRecipient(target.remoteJid, target.phone);
    try {
      if (open) return { externalId: externalIdOf(await sendCloudText(target.credentials, to, text)), content: text };
      if (!template?.name) throw new FlowSendError('Fora das 24 horas: este passo precisa de um modelo aprovado do WhatsApp Business');
      const result = await sendCloudTemplate(target.credentials, to, template);
      return { externalId: externalIdOf(result), content: `Modelo: ${template.name}` };
    } catch (err) {
      throw err instanceof FlowSendError ? err : cloudError(err);
    }
  }

  if (!open) throw new FlowSendError('Fora das 24 horas: a Meta só permite responder neste canal até 24 horas depois da última mensagem do cliente');

  if (target.channelType === 'facebook' || target.channelType === 'messenger' || target.channelType === 'instagram') {
    return { externalId: externalIdOf(await metaSend(target, { text })), content: text };
  }

  if (target.channelType === 'telegram') {
    const result = await telegramCall(telegramToken(target), 'sendMessage', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: target.remoteJid, text }),
    });
    return { externalId: externalIdOf(result), content: text };
  }

  try {
    const result = await whatsappService.sendMessage({ instanceId: evolutionInstance(target), number: evolutionNumber(target), text });
    return { externalId: externalIdOf(result), content: text };
  } catch (err: any) {
    throw err instanceof FlowSendError ? err : new FlowSendError(err?.message || 'Falha ao enviar pelo WhatsApp', true);
  }
}

export const isVoiceConfigured = () => !!process.env.ELEVENLABS_API_KEY;

/** Gera a voz e guarda o ficheiro no armazenamento */
export async function generateVoice(text: string, userId: string): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new FlowSendError('A voz por IA não está configurada');
  const voiceId = process.env.ELEVENLABS_DEFAULT_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';
  let audio: Buffer;
  try {
    audio = await aiService.generateElevenLabsAudio(text, voiceId, apiKey);
  } catch (err: any) {
    throw new FlowSendError(err?.message || 'Não foi possível gerar a voz', true);
  }
  return getStorageService().uploadBuffer(audio, `flow_voice_${Date.now()}.mp3`, 'audio/mpeg', 'ai-voices', userId);
}

/** Envia um áudio (como mensagem de voz sempre que o canal o permite) e devolve o URL gravado */
export async function sendAudio(target: FlowTarget, audioUrl: string, userId: string): Promise<{ externalId: string | null; url: string }> {
  if (!isWindowOpen(target)) {
    throw new FlowSendError('Fora das 24 horas: a Meta não permite enviar áudio neste canal');
  }

  if (target.channelType === 'whatsapp') {
    try {
      const result = await whatsappService.sendAudio({ instanceId: evolutionInstance(target), number: evolutionNumber(target), audioUrl });
      return { externalId: externalIdOf(result), url: audioUrl };
    } catch (err: any) {
      throw err instanceof FlowSendError ? err : new FlowSendError(err?.message || 'Falha ao enviar o áudio', true);
    }
  }

  if (target.channelType === 'whatsapp_cloud') {
    try {
      const sent = await sendCloudMedia(target.credentials, cloudRecipient(target.remoteJid, target.phone), { kind: 'audio', url: audioUrl });
      return { externalId: externalIdOf(sent.result), url: audioUrl };
    } catch (err) {
      throw cloudError(err);
    }
  }

  if (target.channelType === 'facebook' || target.channelType === 'messenger' || target.channelType === 'instagram') {
    // O Instagram só aceita AAC/M4A, MP4 ou WAV: tudo segue em M4A
    let url = audioUrl;
    try {
      const file = await loadMediaFile(audioUrl);
      const m4a = await convertToM4a(file.buffer);
      url = await getStorageService().uploadBuffer(m4a, `flow_audio_${Date.now()}.m4a`, 'audio/mp4', 'inbox-media', userId);
    } catch (err: any) {
      throw new FlowSendError(err?.message || 'Não foi possível preparar o áudio', true);
    }
    const payload = target.channelType === 'instagram'
      ? { url: publicFileUrl(url) }
      : { url: publicFileUrl(url), is_reusable: true };
    const result = await metaSend(target, { attachment: { type: 'audio', payload } });
    return { externalId: externalIdOf(result), url };
  }

  if (target.channelType === 'telegram') {
    const token = telegramToken(target);
    try {
      // Nota de voz: tem de ser OGG Opus
      const file = await loadMediaFile(audioUrl);
      const ogg = await convertToOggOpus(file.buffer);
      const form = new FormData();
      form.append('chat_id', target.remoteJid);
      form.append('voice', new Blob([new Uint8Array(ogg)], { type: 'audio/ogg' }), 'voice.ogg');
      return { externalId: externalIdOf(await telegramCall(token, 'sendVoice', { body: form })), url: audioUrl };
    } catch {
      const result = await telegramCall(token, 'sendAudio', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: target.remoteJid, audio: publicFileUrl(audioUrl) }),
      });
      return { externalId: externalIdOf(result), url: audioUrl };
    }
  }

  throw new FlowSendError('Este canal não envia áudio');
}

/** Envia pelo canal de email ligado ou, sem ele, pelo SMTP do sistema */
export async function sendEmail(lead: FlowLead, subject: string, body: string): Promise<void> {
  const to = String(lead.email || '').trim();
  if (!to.includes('@')) throw new FlowSendError('Este lead não tem email');

  const ch = await dbQuery(
    `SELECT credentials FROM channels
      WHERE user_id = $1 AND type = 'email' AND status IN ('active', 'connected')
      ORDER BY created_at DESC LIMIT 1`,
    [lead.user_id],
  );
  const creds = parseCredentials(ch.rows?.[0]?.credentials);
  let smtp: any = null;
  if (creds?.smtp?.host) {
    smtp = {
      host: creds.smtp.host,
      port: creds.smtp.port || 587,
      user: creds.smtp.auth?.user || creds.email,
      pass: creds.smtp.auth?.pass || creds.password,
      fromEmail: creds.email,
      fromName: creds.from_name || '',
    };
  } else if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    smtp = {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      fromEmail: process.env.SMTP_USER,
      fromName: '',
    };
  }
  if (!smtp) throw new FlowSendError('Sem email configurado para enviar');

  const safe = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  try {
    await emailService.sendEmailWithSettings({
      to,
      subject,
      text: body,
      html: `<div style="font-family:sans-serif;white-space:pre-wrap;">${safe}</div>`,
    }, smtp);
  } catch (err: any) {
    throw new FlowSendError(err?.message || 'Falha ao enviar o email', true);
  }
}

/** Grava a mensagem na conversa (cria-a no primeiro contacto) e avisa a inbox */
export async function saveOutgoing(
  lead: FlowLead,
  target: FlowTarget,
  data: { content: string; externalId?: string | null; mediaUrl?: string; mediaType?: string; flowId: string; source?: string },
): Promise<void> {
  let conversationId = target.conversationId;
  if (!conversationId) {
    const found = await dbQuery(
      `SELECT id FROM conversations WHERE user_id = $1 AND channel_id = $2 AND remote_jid = $3 LIMIT 1`,
      [lead.user_id, target.channelId, target.remoteJid],
    );
    conversationId = found.rows?.[0]?.id;
    if (!conversationId) {
      const created = await dbQuery(
        `INSERT INTO conversations (user_id, lead_id, remote_jid, channel_id, status)
         VALUES ($1, $2, $3, $4, 'open') RETURNING id`,
        [lead.user_id, lead.id, target.remoteJid, target.channelId],
      );
      conversationId = created.rows?.[0]?.id;
    }
    target.conversationId = conversationId;
  }

  const message = await messagesService.create({
    conversation_id: conversationId,
    lead_id: lead.id,
    direction: 'out',
    channel: target.channelType,
    content: data.content,
    status: 'sent',
    sent_at: new Date().toISOString(),
    external_id: data.externalId || null,
    media_url: data.mediaUrl || null,
    media_type: data.mediaType || null,
    metadata: { source: data.source || 'remarketing', flow_id: data.flowId, remote_jid: target.remoteJid, channel_type: target.channelType },
  }, lead.user_id);

  await dbQuery('UPDATE leads SET last_contact_at = NOW() WHERE id = $1', [lead.id]);

  if (conversationId) {
    try { getWebSocketService()?.emitNewMessage(lead.user_id, { conversationId, message }); } catch { /* só atualiza o ecrã */ }
  }
}
