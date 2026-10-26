// Gestão da conta WhatsApp Business (Cloud API) de um canal whatsapp_cloud:
// conta (WABA), números, perfil da empresa e modelos de mensagem. Usa o token guardado no
// canal (Embedded Signup ou formulário manual) — permissões whatsapp_business_management
// (gestão) e whatsapp_business_messaging (envio, nas rotas de mensagens).
import { GRAPH_VERSION } from './meta-oauth.service';

const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const TIMEOUT_MS = 20_000;

export class WhatsAppBusinessError extends Error {
  constructor(message: string, public status = 400, public code?: number) { super(message); }
}

export interface CloudCredentials {
  waba_id: string;
  phone_number_id: string;
  access_token: string;
}

async function graph(method: 'GET' | 'POST' | 'DELETE', path: string, token: string, params?: Record<string, any>): Promise<any> {
  const url = new URL(GRAPH + path);
  const isBody = method === 'POST';
  if (!isBody && params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }
  }
  const res = await fetch(url.toString(), {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(isBody ? { 'Content-Type': 'application/json' } : {}) },
    body: isBody ? JSON.stringify(params || {}) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    const err = data?.error || {};
    // Token expirado/revogado: o canal tem de ser ligado de novo
    if (err.code === 190) throw new WhatsAppBusinessError('O acesso à conta WhatsApp Business expirou. Ligue o canal de novo.', 401, 190);
    if (err.code === 200 || err.code === 10) throw new WhatsAppBusinessError('A app não tem permissão para esta conta WhatsApp Business.', 403, err.code);
    throw new WhatsAppBusinessError(err.error_user_msg || err.message || `A Meta respondeu ${res.status}`, 400, err.code);
  }
  return data;
}

/** Credenciais de um canal whatsapp_cloud, já validadas */
export function cloudCredentials(channel: any): CloudCredentials {
  const c = channel?.credentials || {};
  const token = c.access_token || c.token;
  if (channel?.type !== 'whatsapp_cloud') throw new WhatsAppBusinessError('Este canal não é um WhatsApp Business.', 400);
  if (!token) throw new WhatsAppBusinessError('O canal não tem acesso à conta. Ligue-o de novo.', 400);
  if (!c.waba_id) throw new WhatsAppBusinessError('Falta o ID da conta WhatsApp Business neste canal. Ligue-o de novo pelo Facebook.', 400);
  return { waba_id: String(c.waba_id), phone_number_id: String(c.phone_number_id || ''), access_token: String(token) };
}

const PHONE_FIELDS = 'id,display_phone_number,verified_name,quality_rating,code_verification_status,platform_type,name_status,messaging_limit_tier,throughput,status';

/** Conta (WABA) e os seus números */
export async function getOverview(cred: CloudCredentials) {
  const [account, numbers] = await Promise.all([
    graph('GET', `/${cred.waba_id}`, cred.access_token, {
      fields: 'id,name,currency,timezone_id,account_review_status,business_verification_status,message_template_namespace',
    }),
    graph('GET', `/${cred.waba_id}/phone_numbers`, cred.access_token, { fields: PHONE_FIELDS, limit: 50 }),
  ]);
  return {
    account: {
      id: account.id,
      name: account.name,
      currency: account.currency,
      review_status: account.account_review_status,
      business_verification: account.business_verification_status,
    },
    phone_numbers: (numbers.data || []).map((n: any) => ({
      id: n.id,
      display_phone_number: n.display_phone_number,
      verified_name: n.verified_name,
      quality_rating: n.quality_rating,
      verification: n.code_verification_status,
      platform: n.platform_type,
      name_status: n.name_status,
      messaging_limit: n.messaging_limit_tier,
      status: n.status,
      in_use: n.id === cred.phone_number_id,
    })),
  };
}

// ── Perfil da empresa ──────────────────────────────────────────────────────────

const PROFILE_FIELDS = 'about,address,description,email,websites,vertical,profile_picture_url';

export async function getProfile(cred: CloudCredentials, phoneId = cred.phone_number_id) {
  const data = await graph('GET', `/${phoneId}/whatsapp_business_profile`, cred.access_token, { fields: PROFILE_FIELDS });
  return data.data?.[0] || {};
}

export async function updateProfile(cred: CloudCredentials, input: any, phoneId = cred.phone_number_id) {
  const text = (v: unknown, max: number, label: string) => {
    if (v === undefined) return undefined;
    const s = String(v ?? '').trim();
    if (s.length > max) throw new WhatsAppBusinessError(`${label}: no máximo ${max} caracteres.`);
    return s;
  };
  const websites = Array.isArray(input.websites)
    ? input.websites.map((w: unknown) => String(w).trim()).filter(Boolean).slice(0, 2)
    : undefined;
  if (websites?.some((w: string) => !/^https?:\/\//i.test(w))) {
    throw new WhatsAppBusinessError('Os sites têm de começar por http:// ou https://.');
  }
  const body: Record<string, any> = {
    messaging_product: 'whatsapp',
    about: text(input.about, 139, 'Sobre'),
    description: text(input.description, 512, 'Descrição'),
    address: text(input.address, 256, 'Morada'),
    email: text(input.email, 128, 'Email'),
    websites,
    vertical: input.vertical ? String(input.vertical) : undefined,
  };
  Object.keys(body).forEach((k) => body[k] === undefined && delete body[k]);
  await graph('POST', `/${phoneId}/whatsapp_business_profile`, cred.access_token, body);
  return getProfile(cred, phoneId);
}

// ── Números: verificação e registo na Cloud API ───────────────────────────────

function ownPhone(phoneId: string) {
  if (!/^\d+$/.test(phoneId)) throw new WhatsAppBusinessError('Número inválido.');
  return phoneId;
}

export async function requestCode(cred: CloudCredentials, phoneId: string, method: string) {
  await graph('POST', `/${ownPhone(phoneId)}/request_code`, cred.access_token, {
    code_method: method === 'VOICE' ? 'VOICE' : 'SMS',
    language: 'pt_BR',
  });
}

export async function verifyCode(cred: CloudCredentials, phoneId: string, code: string) {
  if (!/^\d{6}$/.test(String(code || ''))) throw new WhatsAppBusinessError('O código tem 6 dígitos.');
  await graph('POST', `/${ownPhone(phoneId)}/verify_code`, cred.access_token, { code: String(code) });
}

/** Ativa o número na Cloud API; o PIN é o da verificação em dois passos (6 dígitos) */
export async function registerNumber(cred: CloudCredentials, phoneId: string, pin: string) {
  if (!/^\d{6}$/.test(String(pin || ''))) throw new WhatsAppBusinessError('O PIN tem 6 dígitos.');
  await graph('POST', `/${ownPhone(phoneId)}/register`, cred.access_token, { messaging_product: 'whatsapp', pin: String(pin) });
}

// ── Modelos de mensagem ───────────────────────────────────────────────────────

export async function listTemplates(cred: CloudCredentials) {
  const templates: any[] = [];
  let after: string | undefined;
  // Até 5 páginas de 100 (500 modelos) — chega para qualquer conta normal
  for (let page = 0; page < 5; page++) {
    const data = await graph('GET', `/${cred.waba_id}/message_templates`, cred.access_token, {
      fields: 'id,name,status,category,language,components,rejected_reason,quality_score',
      limit: 100,
      after,
    });
    templates.push(...(data.data || []));
    after = data.paging?.cursors?.after;
    if (!data.paging?.next || !after) break;
  }
  return templates.map((t) => ({
    id: t.id,
    name: t.name,
    status: t.status,
    category: t.category,
    language: t.language,
    components: t.components || [],
    rejected_reason: t.rejected_reason && t.rejected_reason !== 'NONE' ? t.rejected_reason : null,
    quality: t.quality_score?.score || null,
  }));
}

const CATEGORIES = new Set(['MARKETING', 'UTILITY', 'AUTHENTICATION']);

/** Variáveis {{1}}, {{2}}… usadas num texto */
function variablesIn(text: string): number[] {
  return [...new Set([...text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
}

export async function createTemplate(cred: CloudCredentials, input: any) {
  // A Meta só aceita a-z, 0-9 e _: tira acentos e troca espaços/hífens por _
  const name = String(input.name || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!/^[a-z0-9_]{1,512}$/.test(name)) throw new WhatsAppBusinessError('Nome: só letras minúsculas, números e _ (sem espaços nem acentos).');
  const category = String(input.category || '').toUpperCase();
  if (!CATEGORIES.has(category)) throw new WhatsAppBusinessError('Escolha a categoria do modelo.');
  const language = String(input.language || 'pt_PT');

  const body = String(input.body || '').trim();
  if (!body) throw new WhatsAppBusinessError('Escreva o texto da mensagem.');
  if (body.length > 1024) throw new WhatsAppBusinessError('O texto tem no máximo 1024 caracteres.');
  const vars = variablesIn(body);
  if (vars.some((n, i) => n !== i + 1)) throw new WhatsAppBusinessError('As variáveis têm de seguir a ordem {{1}}, {{2}}, {{3}}…');
  const examples: string[] = Array.isArray(input.examples) ? input.examples.map((e: unknown) => String(e).trim()) : [];
  if (vars.length && (examples.length < vars.length || examples.slice(0, vars.length).some((e) => !e))) {
    throw new WhatsAppBusinessError('Dê um exemplo para cada variável (a Meta pede-os para aprovar o modelo).');
  }

  const components: any[] = [];
  const header = String(input.header || '').trim();
  if (header) {
    if (header.length > 60) throw new WhatsAppBusinessError('O título tem no máximo 60 caracteres.');
    if (variablesIn(header).length) throw new WhatsAppBusinessError('O título não pode ter variáveis.');
    components.push({ type: 'HEADER', format: 'TEXT', text: header });
  }
  components.push({
    type: 'BODY',
    text: body,
    ...(vars.length ? { example: { body_text: [examples.slice(0, vars.length)] } } : {}),
  });
  const footer = String(input.footer || '').trim();
  if (footer) {
    if (footer.length > 60) throw new WhatsAppBusinessError('O rodapé tem no máximo 60 caracteres.');
    components.push({ type: 'FOOTER', text: footer });
  }
  const buttons: any[] = (Array.isArray(input.buttons) ? input.buttons : [])
    .filter((b: any) => b && String(b.text || '').trim())
    .slice(0, 3)
    .map((b: any) => {
      const text = String(b.text).trim().slice(0, 25);
      if (b.type === 'URL') {
        if (!/^https:\/\//i.test(String(b.url || ''))) throw new WhatsAppBusinessError('O botão de link precisa de um endereço https://.');
        return { type: 'URL', text, url: String(b.url).trim() };
      }
      if (b.type === 'PHONE_NUMBER') {
        const phone = String(b.phone || '').replace(/[^\d+]/g, '');
        if (phone.replace(/\D/g, '').length < 8) throw new WhatsAppBusinessError('O botão de chamada precisa de um número com o código do país.');
        return { type: 'PHONE_NUMBER', text, phone_number: phone.startsWith('+') ? phone : `+${phone}` };
      }
      return { type: 'QUICK_REPLY', text };
    });
  if (buttons.length) components.push({ type: 'BUTTONS', buttons });

  const created = await graph('POST', `/${cred.waba_id}/message_templates`, cred.access_token, { name, language, category, components });
  return { id: created.id, name, status: created.status, category: created.category || category, language };
}

export async function deleteTemplate(cred: CloudCredentials, name: string, id?: string) {
  if (!/^[a-z0-9_]{1,512}$/.test(name)) throw new WhatsAppBusinessError('Nome do modelo inválido.');
  // Com hsm_id apaga só esse idioma; sem ele, todos os idiomas com este nome
  await graph('DELETE', `/${cred.waba_id}/message_templates`, cred.access_token, { name, hsm_id: id && /^\d+$/.test(id) ? id : undefined });
}
