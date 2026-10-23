// Confirma as credenciais de um canal junto do fornecedor antes de o marcar como ligado.
// Nunca se confia no estado enviado pelo app: só fica 'active' o que o fornecedor aceitar.
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { WhatsAppService } from './whatsapp.service';

const GRAPH = 'https://graph.facebook.com/v21.0';
const TIMEOUT_MS = 10_000;

export interface ChannelValidation {
  ok: boolean;
  /** Mensagem para o utilizador (pt-MZ) quando não está ligado */
  error?: string;
  /** Falha de rede/tempo: as credenciais podem estar certas, mas não foi possível confirmar */
  unreachable?: boolean;
  /** Dados confirmados pelo fornecedor (nome da página, @ do bot, número…) */
  details?: Record<string, any>;
}

const ok = (details?: Record<string, any>): ChannelValidation => ({ ok: true, details });
const fail = (error: string): ChannelValidation => ({ ok: false, error });
const unreachable = (who: string): ChannelValidation => ({
  ok: false,
  unreachable: true,
  error: `Não foi possível contactar ${who} para confirmar a ligação. Tente de novo dentro de momentos.`,
});

async function getJson(url: string, init: RequestInit = {}): Promise<{ status: number; data: any } | null> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } catch {
    return null;
  }
}

/** Erro da Graph API em texto curto (token expirado, sem permissão…) */
function metaError(data: any, fallback: string): string {
  const e = data?.error;
  if (!e) return fallback;
  if (e.code === 190) return 'O token da Meta é inválido ou expirou. Gere um token novo e tente de novo.';
  if (e.code === 10 || e.code === 200) return 'O token não tem as permissões necessárias para este canal.';
  if (e.code === 100) return 'O ID indicado não existe ou não pertence a este token.';
  return e.message || fallback;
}

async function validateWhatsAppCloud(c: any): Promise<ChannelValidation> {
  if (!c.phone_number_id || !c.access_token) return fail('Indique o Phone Number ID e o token de acesso.');
  const r = await getJson(`${GRAPH}/${encodeURIComponent(c.phone_number_id)}?fields=display_phone_number,verified_name`, {
    headers: { Authorization: `Bearer ${c.access_token}` },
  });
  if (!r) return unreachable('a Meta');
  if (r.status !== 200 || !r.data?.display_phone_number) return fail(metaError(r.data, 'A Meta não confirmou este número.'));
  return ok({ display_phone_number: r.data.display_phone_number, verified_name: r.data.verified_name });
}

/**
 * Confirma um token com o debug_token da Meta, usando as credenciais da app da LeadsFlow
 * (não precisa de permissões da página). null = não dá para usar aqui (app não configurada
 * ou token de outra app, como os canais antigos criados com a app de cada cliente).
 */
async function debugMetaToken(token: string): Promise<{ valid: boolean; profileId?: string; error?: string } | null> {
  const appId = process.env.META_APP_ID;
  const secret = process.env.META_APP_SECRET;
  if (!appId || !secret) return null;
  const r = await getJson(`${GRAPH}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(`${appId}|${secret}`)}`);
  const d = r?.data?.data;
  if (!d || String(d.app_id) !== String(appId)) return null;
  return { valid: !!d.is_valid, profileId: d.profile_id ? String(d.profile_id) : undefined, error: d.error?.message };
}

async function validateFacebook(c: any): Promise<ChannelValidation> {
  const token = c.page_access_token || c.access_token;
  if (!c.page_id || !token) return fail('Falta a página do Facebook ou o token de acesso.');
  // Token da app da LeadsFlow (ligado pelo login da Meta): confirmar pelo debug_token
  const debug = await debugMetaToken(token);
  if (debug) {
    if (!debug.valid) return fail('O acesso a esta página expirou ou foi retirado. Ligue de novo com o Facebook.');
    if (debug.profileId && debug.profileId !== String(c.page_id)) return fail('O token não pertence a esta página.');
    return ok({ page_name: c.page_name });
  }
  const r = await getJson(`${GRAPH}/${encodeURIComponent(c.page_id)}?fields=id,name&access_token=${encodeURIComponent(token)}`);
  if (!r) return unreachable('a Meta');
  if (r.status !== 200 || String(r.data?.id) !== String(c.page_id)) return fail(metaError(r.data, 'A Meta não confirmou o acesso a esta página.'));
  return ok({ page_name: r.data.name });
}

async function validateInstagram(c: any): Promise<ChannelValidation> {
  const token = c.page_access_token || c.access_token;
  if (!c.instagram_id || !token) return fail('Falta a conta do Instagram ou o token de acesso.');
  // Conta profissional ligada a uma página (Graph API do Facebook)
  const viaPage = await getJson(`${GRAPH}/${encodeURIComponent(c.instagram_id)}?fields=id,username&access_token=${encodeURIComponent(token)}`);
  if (viaPage?.status === 200 && viaPage.data?.id) return ok({ username: viaPage.data.username });
  // Token do "Instagram Login" (graph.instagram.com)
  const viaIg = await getJson(`https://graph.instagram.com/v21.0/me?fields=user_id,username&access_token=${encodeURIComponent(c.access_token || token)}`);
  if (viaIg?.status === 200 && (viaIg.data?.user_id || viaIg.data?.id)) return ok({ username: viaIg.data.username });
  if (!viaPage && !viaIg) return unreachable('a Meta');
  return fail(metaError(viaPage?.data?.error ? viaPage.data : viaIg?.data, 'A Meta não confirmou o acesso a esta conta do Instagram.'));
}

async function validateTelegram(c: any): Promise<ChannelValidation> {
  if (!c.bot_token) return fail('Indique o token do bot (do BotFather).');
  const r = await getJson(`https://api.telegram.org/bot${encodeURIComponent(c.bot_token)}/getMe`);
  if (!r) return unreachable('o Telegram');
  if (!r.data?.ok) return fail('O Telegram recusou este token. Confirme o token no @BotFather.');
  return ok({ bot_id: r.data.result.id, bot_username: r.data.result.username, bot_name: r.data.result.first_name });
}

async function validateTwilio(c: any): Promise<ChannelValidation> {
  const { accountSid, authToken, phoneNumber } = c;
  if (!accountSid || !authToken || !phoneNumber) return fail('Indique o Account SID, o Auth Token e o número.');
  const auth = { Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64') };
  const base = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}`;
  const account = await getJson(`${base}.json`, { headers: auth });
  if (!account) return unreachable('o Twilio');
  if (account.status === 401 || account.status === 404) return fail('O Twilio recusou o Account SID ou o Auth Token.');
  if (account.status !== 200) return fail('O Twilio não confirmou esta conta.');
  const numbers = await getJson(`${base}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(phoneNumber)}`, { headers: auth });
  if (!numbers) return unreachable('o Twilio');
  if (!numbers.data?.incoming_phone_numbers?.length) return fail(`O número ${phoneNumber} não pertence a esta conta do Twilio.`);
  return ok({ account_name: account.data?.friendly_name });
}

async function validateEmail(c: any): Promise<ChannelValidation> {
  const smtp = c.smtp || {};
  const imap = c.imap || {};
  const user = smtp.auth?.user || imap.auth?.user || c.email;
  const pass = smtp.auth?.pass || imap.auth?.pass || c.password;
  if (!smtp.host || !imap.host || !user || !pass) return fail('Faltam dados do servidor de email (SMTP/IMAP), do email ou da palavra-passe.');

  try {
    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: Number(smtp.port) || 587,
      secure: smtp.secure === true || Number(smtp.port) === 465,
      auth: { user, pass },
      connectionTimeout: TIMEOUT_MS,
      greetingTimeout: TIMEOUT_MS,
    });
    await transport.verify();
  } catch (err: any) {
    if (/EAUTH|Invalid login|535|authentication/i.test(err?.message || '') || err?.code === 'EAUTH') {
      return fail('O servidor de envio (SMTP) recusou o email ou a palavra-passe. Em Gmail/Outlook use uma palavra-passe de aplicação.');
    }
    return fail(`Não foi possível ligar ao servidor de envio (${smtp.host}).`);
  }

  const client = new ImapFlow({
    host: imap.host,
    port: Number(imap.port) || 993,
    secure: imap.secure !== false,
    auth: { user: imap.auth?.user || user, pass: imap.auth?.pass || pass },
    logger: false,
    emitLogs: false,
  } as any);
  try {
    await Promise.race([
      client.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)),
    ]);
    await client.logout().catch(() => {});
  } catch (err: any) {
    client.close?.();
    if (/auth|login|credentials/i.test(err?.message || '') || err?.authenticationFailed) {
      return fail('O servidor de receção (IMAP) recusou o email ou a palavra-passe.');
    }
    return fail(`Não foi possível ligar ao servidor de receção (${imap.host}).`);
  }
  return ok({ email: c.email || user });
}

async function validateEvolution(c: any): Promise<ChannelValidation> {
  const instance = c.instance_id || c.instance_name;
  if (!instance) return fail('Falta a instância do WhatsApp.');
  const wa = new WhatsAppService();
  if (!wa.isReady()) return unreachable('o servidor do WhatsApp');
  try {
    const status: any = await wa.getStatus(instance);
    const state = status?.instance?.state || status?.state || status?.connectionStatus;
    if (state === 'open' || status?.connected === true) return ok();
    return fail('O WhatsApp ainda não está ligado: leia o código QR no telemóvel.');
  } catch (err: any) {
    if (/^4\d\d/.test(err?.message || '')) return fail('A instância do WhatsApp não existe no servidor.');
    return unreachable('o servidor do WhatsApp');
  }
}

/** Confirma as credenciais de um canal. Tipos sem credenciais externas (ex.: chat do site) passam. */
export async function validateChannelCredentials(type: string, credentials: any): Promise<ChannelValidation> {
  const c = credentials || {};
  switch (type) {
    case 'whatsapp_cloud': return validateWhatsAppCloud(c);
    case 'facebook': return validateFacebook(c);
    case 'instagram': return validateInstagram(c);
    case 'telegram': return validateTelegram(c);
    case 'twilio_sms':
    case 'sms': return validateTwilio(c);
    case 'email': return validateEmail(c);
    case 'whatsapp': return validateEvolution(c);
    default: return ok();
  }
}
