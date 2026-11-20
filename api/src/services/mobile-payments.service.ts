/**
 * Pagamento dos planos por M-Pesa / e-Mola "ao comerciante", sem fornecedor de pagamentos
 * (mesmo modelo do checkout da Natur Erva).
 *
 * Fluxo:
 *  1. O cliente paga ao código de comerciante (Admin → Pagamentos) e envia no checkout o código da
 *     transação (ou cola a SMS de confirmação que recebeu).
 *  2. O comerciante recebe a SUA SMS de confirmação, com o MESMO código. Uma app de reencaminhamento
 *     de SMS no telemóvel do comerciante (ex.: "SMS Forwarder") envia-a para
 *     /api/payments/mobile/sms/<segredo>.
 *  3. Quando os dois códigos coincidem (e o valor chega), o plano fica ativo sozinho.
 *     Sem correspondência, o administrador confirma ou rejeita em Admin → Pagamentos.
 *
 * Tudo o que ativa o plano passa por confirmMobilePayment(): transacional e idempotente.
 * O Stripe e o PayPal continuam iguais — isto é só mais um método no checkout.
 */
import crypto from 'crypto';
import { query, transaction } from '../database/connection';
import { plansService } from './plans.service';
import { notificationsService } from './notifications.service';
import { clearPlanEnforcementCache } from '../middleware/plan-enforcement.middleware';
import { isServableKey, isStorageUrl, storageKeyFromUrl } from '../utils/storage-urls';
import { recomputeEffectiveEntitlement, upsertBillingSubscription } from './billing-entitlement.service';

export type MobileMethod = 'mpesa' | 'emola';
export type BillingCycle = 'monthly' | 'annual';

export interface MobileMethodConfig {
  id: MobileMethod;
  label: string;
  enabled: boolean;
  merchantCode: string;
  merchantName: string;
  ussd: string;
  /** Logótipo carregado no admin (vazio = cor da marca) */
  logoUrl: string;
}

export interface MobilePaymentConfig {
  methods: MobileMethodConfig[];
  /** Preço em MT por plano: { business: { monthly: 1500, annual: 14400 } } */
  planPrices: Record<string, { monthly?: number | null; annual?: number | null }>;
  smsEnabled: boolean;
  smsSecret: string | null;
}

export const METHOD_LABELS: Record<MobileMethod, string> = { mpesa: 'M-Pesa', emola: 'e-Mola' };

const METHOD_DEFAULTS: MobileMethodConfig[] = [
  { id: 'mpesa', label: 'M-Pesa', enabled: false, merchantCode: '', merchantName: 'LeadsFlow', ussd: '*150#', logoUrl: '' },
  { id: 'emola', label: 'e-Mola', enabled: false, merchantCode: '', merchantName: 'LeadsFlow', ussd: '*898#', logoUrl: '' },
];

// ── Esquema (aditivo; aplicado na primeira utilização) ────────────────────────────────────────────
let schemaPromise: Promise<void> | null = null;
export function ensureMobilePaymentsSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await query(`CREATE TABLE IF NOT EXISTS mobile_payment_config (
        id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        methods JSONB NOT NULL DEFAULT '[]'::jsonb,
        plan_prices JSONB NOT NULL DEFAULT '{}'::jsonb,
        sms_enabled BOOLEAN NOT NULL DEFAULT false,
        sms_secret TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await query(`CREATE TABLE IF NOT EXISTS mobile_payments (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        plan_id VARCHAR(50) NOT NULL,
        billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly',
        method VARCHAR(20) NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        transaction_id VARCHAR(40) NOT NULL,
        proof_text TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        rejected_reason TEXT,
        confirmed_by TEXT,
        confirmed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      // Uma transação só pode pagar um plano (as rejeitadas libertam o código)
      await query(`CREATE UNIQUE INDEX IF NOT EXISTS mobile_payments_txid_unique
        ON mobile_payments (transaction_id) WHERE status <> 'rejected'`);
      await query(`CREATE INDEX IF NOT EXISTS mobile_payments_user_idx ON mobile_payments (user_id, created_at DESC)`);
      await query(`CREATE TABLE IF NOT EXISTS mobile_payment_sms (
        id SERIAL PRIMARY KEY,
        transaction_id VARCHAR(40) UNIQUE NOT NULL,
        amount NUMERIC(12,2),
        payer_phone VARCHAR(20),
        raw_text TEXT NOT NULL,
        received_from TEXT,
        payment_id UUID REFERENCES mobile_payments(id) ON DELETE SET NULL,
        received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        matched_at TIMESTAMPTZ
      )`);
    })().catch((err) => {
      schemaPromise = null; // volta a tentar no próximo pedido
      throw err;
    });
  }
  return schemaPromise;
}

// ── Configuração ─────────────────────────────────────────────────────────────────────────────────
const withMethodDefaults = (list: any): MobileMethodConfig[] =>
  METHOD_DEFAULTS.map((def) => {
    const saved = Array.isArray(list) ? list.find((m: any) => m?.id === def.id) : null;
    return {
      ...def,
      enabled: saved?.enabled === true,
      merchantCode: String(saved?.merchantCode ?? '').replace(/\s+/g, ''),
      merchantName: String(saved?.merchantName ?? def.merchantName).trim() || def.merchantName,
      ussd: String(saved?.ussd ?? def.ussd).trim() || def.ussd,
      logoUrl: safeLogoUrl(saved?.logoUrl),
    };
  });

// Logótipos nossos guardam-se como "/api/files/<chave>" (sem protocolo nem host): a API podia
// devolver "http://…" atrás do proxy e o WebView do Android bloqueia imagens http numa página https.
// O app junta-lhe o endereço da API. Também aceita imagem em base64 (sem MinIO); nada de javascript:.
const safeLogoUrl = (v: any): string => {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (!s.startsWith('data:')) {
    let key: string | null = null;
    try { key = storageKeyFromUrl(s); } catch { key = null; }
    if (key && isServableKey(key)) return `/api/files/${key.split('/').map(encodeURIComponent).join('/')}`;
    if (s.includes('/api/files/') || isStorageUrl(s)) return '';
  }
  if (/^https:\/\//i.test(s) && s.length <= 1000) return s;
  if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s) && s.length <= 3_000_000) return s;
  return '';
};

/** Guarda o logótipo de um método (o ficheiro já foi carregado para o armazenamento). */
export async function setMethodLogo(method: MobileMethod, logoUrl: string): Promise<MobilePaymentConfig> {
  const current = await getMobilePaymentConfig();
  const methods = current.methods.map((m) => (m.id === method ? { ...m, logoUrl } : m));
  return saveMobilePaymentConfig({ methods });
}

const cleanPrice = (v: any): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

export async function getMobilePaymentConfig(): Promise<MobilePaymentConfig> {
  await ensureMobilePaymentsSchema();
  const { rows } = await query('SELECT * FROM mobile_payment_config WHERE id = 1');
  const row = rows[0];
  return {
    methods: withMethodDefaults(row?.methods),
    planPrices: row?.plan_prices && typeof row.plan_prices === 'object' ? row.plan_prices : {},
    smsEnabled: row?.sms_enabled === true,
    smsSecret: row?.sms_secret || null,
  };
}

export async function saveMobilePaymentConfig(input: Partial<MobilePaymentConfig>): Promise<MobilePaymentConfig> {
  const current = await getMobilePaymentConfig();
  const methods = input.methods ? withMethodDefaults(input.methods) : current.methods;

  let planPrices = current.planPrices;
  if (input.planPrices && typeof input.planPrices === 'object') {
    planPrices = {};
    for (const [planId, p] of Object.entries(input.planPrices)) {
      if (!/^[a-z0-9_-]{1,50}$/i.test(planId) || !p || typeof p !== 'object') continue;
      planPrices[planId] = { monthly: cleanPrice((p as any).monthly), annual: cleanPrice((p as any).annual) };
    }
  }
  const smsEnabled = typeof input.smsEnabled === 'boolean' ? input.smsEnabled : current.smsEnabled;
  // O segredo do endereço das SMS é criado na primeira vez que se liga o reencaminhamento
  const smsSecret = current.smsSecret || (smsEnabled ? newSecret() : null);

  await query(
    `INSERT INTO mobile_payment_config (id, methods, plan_prices, sms_enabled, sms_secret, updated_at)
     VALUES (1, $1, $2, $3, $4, NOW())
     ON CONFLICT (id) DO UPDATE SET methods = $1, plan_prices = $2, sms_enabled = $3, sms_secret = $4, updated_at = NOW()`,
    [JSON.stringify(methods), JSON.stringify(planPrices), smsEnabled, smsSecret]
  );
  return getMobilePaymentConfig();
}

const newSecret = () => crypto.randomBytes(18).toString('base64url');

export async function regenerateSmsSecret(): Promise<MobilePaymentConfig> {
  await getMobilePaymentConfig();
  await query(
    `INSERT INTO mobile_payment_config (id, sms_secret, updated_at) VALUES (1, $1, NOW())
     ON CONFLICT (id) DO UPDATE SET sms_secret = $1, updated_at = NOW()`,
    [newSecret()]
  );
  return getMobilePaymentConfig();
}

/** Preço em MT de um plano/ciclo, ou null se o administrador não o definiu. */
export function priceFor(config: MobilePaymentConfig, planId: string, cycle: BillingCycle): number | null {
  return cleanPrice(config.planPrices?.[planId]?.[cycle]);
}

// ── Leitura de SMS do M-Pesa / e-Mola ─────────────────────────────────────────────────────────────
const toAmount = (raw: string): number | null => {
  let s = String(raw).replace(/\s/g, '');
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // o último separador é o decimal ("1,895.00" ou "1.895,00")
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma > -1) {
    s = /,\d{2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Código da transação, valor, telefone e código do comerciante de uma SMS de confirmação. */
export function parseMobileMoneySms(text: string) {
  const t = String(text || '');
  const tx =
    // e-Mola: "ID Trans: MP261104.1749.e44538"
    t.match(/\b([A-Z]{2}\d{6}\.\d{4}\.[A-Z][A-Z0-9]{4,7})\b/i)?.[1] ||
    t.match(/ID\s*(?:da\s*)?transa[cç][aã]o\s*[:\-]?\s*([A-Z0-9.]{6,20})/i)?.[1] ||
    t.match(/Confirmad[oa]\.?\s+([A-Z0-9]{8,14})\b/i)?.[1] ||
    t.match(/\bID\s*[:\-]\s*([A-Z0-9][A-Z0-9.]{5,30})/i)?.[1] ||
    // código solto com letras E números (ex.: "CJK7XYZ123") — nunca um telefone
    (t.match(/\b(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]{8,12}\b/) || [])[0] ||
    null;
  const amountRaw = t.match(/(\d[\d.,\s]*\d|\d)\s*MT/i)?.[1];
  const phone = t.match(/(?:\+?258)?\s?(8[2-7]\d{7})\b/)?.[1] || null;
  // "no comerciante 598705 - …" (M-Pesa) / "ao comerciante ID: 801281, …" (e-Mola)
  const merchantCode = t.match(/comerciante\s*(?:ID\s*[:\-]?\s*)?(\d{4,10})\b/i)?.[1] || null;
  return {
    transactionId: tx ? tx.replace(/\./g, '').toUpperCase() : null,
    amount: amountRaw ? toAmount(amountRaw) : null,
    phone,
    merchantCode,
  };
}

// Formato dos códigos — igual em src/app/utils/mobileMoney.ts (manter os dois iguais).
//  • M-Pesa: 11 caracteres, começa por letra, com pelo menos um número   → DKD2MBCPN4A
//  • e-Mola: 2 letras + AAMMDD + HHMM + sufixo (letra + 4–7)             → MP261104.1749.e44538
const MPESA_TX_RE = /^[A-Z](?=[A-Z0-9]*\d)[A-Z0-9]{10}$/;
const EMOLA_TX_RE = /^[A-Z]{2}(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})[A-Z][A-Z0-9]{4,7}$/;
export const TX_EXAMPLES: Record<MobileMethod, string> = { mpesa: 'DKD2MBCPN4A', emola: 'MP261104.1749.e44538' };

export const normalizeTxId = (s: any): string | null => (s ? String(s).replace(/[\s.]/g, '').toUpperCase() : null);

export function detectTxMethod(txId: string | null): MobileMethod | null {
  const id = String(txId || '');
  if (MPESA_TX_RE.test(id)) return 'mpesa';
  const m = id.match(EMOLA_TX_RE);
  if (m) {
    const [, , mm, dd, hh, mi] = m.map(Number);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 && hh <= 23 && mi <= 59) return 'emola';
  }
  return null;
}

const fmtMT = (n: any) =>
  `${Number(n || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT`;

class PaymentError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export { PaymentError };

// ── Confirmar / rejeitar ─────────────────────────────────────────────────────────────────────────
/**
 * Marca o pagamento como pago e ativa (ou renova) o plano. Idempotente.
 * @param confirmedBy ex.: id do administrador, "auto:sms"
 */
export async function confirmMobilePayment(paymentId: string, confirmedBy: string) {
  await ensureMobilePaymentsSchema();
  const result = await transaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM mobile_payments WHERE id = $1 FOR UPDATE', [paymentId]);
    const p = rows[0];
    if (!p) throw new PaymentError('Pagamento não encontrado', 404);
    if (p.status === 'paid') return { payment: p, alreadyPaid: true };

    const plan = await plansService.getPlanById(p.plan_id);
    const limits = plan?.limits || { leads: 2000, messages: 1000, massMessages: 5000 };

    // Renovação do mesmo plano ainda ativo: soma ao fim do período atual
    const u = await client.query('SELECT plan, plan_expires_at FROM users WHERE id = $1 FOR UPDATE', [p.user_id]);
    const cur = u.rows[0];
    if (!cur) throw new PaymentError('Utilizador não encontrado', 404);
    const now = Date.now();
    const curEnd = cur.plan_expires_at ? new Date(cur.plan_expires_at).getTime() : 0;
    const base = cur.plan === p.plan_id && curEnd > now ? curEnd : now;
    const days = p.billing_cycle === 'annual' ? 365 : 30;
    const expiresAt = new Date(base + days * 24 * 60 * 60 * 1000);

    const upd = await client.query(
      `UPDATE mobile_payments SET status = 'paid', confirmed_by = $2, confirmed_at = NOW(), rejected_reason = NULL, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [paymentId, String(confirmedBy || 'admin')]
    );
    await upsertBillingSubscription({
      userId: p.user_id,
      provider: 'mobile_money',
      providerReference: `${p.method}:${p.transaction_id}`,
      planId: p.plan_id,
      billingCycle: p.billing_cycle,
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: expiresAt,
      autoRenew: false,
      acknowledged: true,
      metadata: { method: p.method, confirmedBy: String(confirmedBy || 'admin') },
    }, client);
    await recomputeEffectiveEntitlement(p.user_id, client);
    await client.query(
      `INSERT INTO payment_history
         (user_id, plan_id, amount, currency, billing_cycle, payment_method, payment_provider, status, provider_transaction_id)
       VALUES ($1, $2, $3, 'MZN', $4, $5, $5, 'completed', $6)
       ON CONFLICT DO NOTHING`,
      [p.user_id, p.plan_id, p.amount, p.billing_cycle, p.method, `${p.method}:${p.transaction_id}`]
    );
    return { payment: upd.rows[0], alreadyPaid: false, expiresAt };
  });

  if (!result.alreadyPaid) {
    const p = result.payment;
    clearPlanEnforcementCache(p.user_id);
    const label = METHOD_LABELS[p.method as MobileMethod] || p.method;
    void notificationsService.createNotification(
      p.user_id, 'plan_upgraded', 'Pagamento confirmado',
      `O plano ${String(p.plan_id).toUpperCase()} está ativo (${label} · ${fmtMT(p.amount)}).`,
      'zap', { planId: p.plan_id, method: p.method, transactionId: p.transaction_id }
    ).catch(() => {});
    void notificationsService.sendAdminNotification(
      'paymentNotifications', 'admin_payment_received', 'Pagamento recebido',
      `${label} ${fmtMT(p.amount)} · plano ${p.plan_id} (${p.billing_cycle === 'annual' ? 'anual' : 'mensal'}) · transação ${p.transaction_id}`,
      'credit-card', { userId: p.user_id, planId: p.plan_id, method: p.method, amount: Number(p.amount), currency: 'MZN' }
    );
    console.log(`[MobilePay] ${p.id} pago (${confirmedBy}) → ${p.user_id} plano ${p.plan_id}`);
  }
  return result;
}

export async function rejectMobilePayment(paymentId: string, reason: string | null, rejectedBy: string) {
  await ensureMobilePaymentsSchema();
  const { rows } = await query(
    `UPDATE mobile_payments SET status = 'rejected', rejected_reason = $2, confirmed_by = $3, updated_at = NOW()
     WHERE id = $1 AND status = 'pending' RETURNING *`,
    [paymentId, (reason || '').trim() || 'Pagamento não encontrado', rejectedBy]
  );
  const p = rows[0];
  if (!p) throw new PaymentError('Pagamento não encontrado ou já tratado', 404);
  void notificationsService.createNotification(
    p.user_id, 'payment_rejected', 'Pagamento não confirmado',
    `${p.rejected_reason}. Verifique o código da transação e envie de novo em Plano.`,
    'alert-triangle', { paymentId: p.id }
  ).catch(() => {});
  return p;
}

// ── Correspondência automática ───────────────────────────────────────────────────────────────────
/** Se já chegou a SMS do comerciante com este código e o valor chega, confirma o pagamento. */
async function tryMatch(payment: any): Promise<boolean> {
  if (!payment || payment.status !== 'pending') return false;
  const { rows } = await query(
    'SELECT * FROM mobile_payment_sms WHERE transaction_id = $1 AND payment_id IS NULL',
    [payment.transaction_id]
  );
  const sms = rows[0];
  if (!sms) return false;
  if (sms.amount != null && Number(sms.amount) + 0.5 < Number(payment.amount)) {
    void notificationsService.sendAdminNotification(
      'paymentNotifications', 'admin_payment_review', 'Pagamento abaixo do valor',
      `Recebido ${fmtMT(sms.amount)}, esperado ${fmtMT(payment.amount)} (transação ${sms.transaction_id}). Confirme à mão se estiver certo.`,
      'alert-triangle', { paymentId: payment.id }
    );
    return false;
  }
  const r = await confirmMobilePayment(payment.id, 'auto:sms');
  if (!r.alreadyPaid) {
    await query('UPDATE mobile_payment_sms SET payment_id = $1, matched_at = NOW() WHERE id = $2', [payment.id, sms.id]);
  }
  return true;
}

/** O cliente envia o código da transação (ou a SMS colada) depois de pagar. */
export async function submitMobilePayment(input: {
  userId: string;
  planId: string;
  billingCycle: BillingCycle;
  method: MobileMethod;
  transactionId?: string | null;
  proofText?: string | null;
}) {
  const config = await getMobilePaymentConfig();
  const method = config.methods.find((m) => m.id === input.method && m.enabled && m.merchantCode);
  if (!method) throw new PaymentError('Este método de pagamento não está disponível.');
  const plan = await plansService.getPlanById(input.planId);
  if (!plan) throw new PaymentError('Plano não encontrado', 404);
  const amount = priceFor(config, input.planId, input.billingCycle);
  if (!amount) throw new PaymentError(`O pagamento por ${method.label} não está disponível para este plano.`);

  const proofText = input.proofText ? String(input.proofText).slice(0, 2000) : null;
  const parsed = parseMobileMoneySms(proofText || '');
  const txId = normalizeTxId(input.transactionId) || parsed.transactionId;
  if (!txId) throw new PaymentError('Indique o código da transação que vem na SMS de confirmação.');

  const detected = detectTxMethod(txId);
  if (!detected) {
    throw new PaymentError(`Código inválido. Copie o código da SMS de confirmação do ${method.label} (ex.: ${TX_EXAMPLES[method.id]}).`);
  }
  if (detected !== method.id) {
    throw new PaymentError(`Este código é do ${METHOD_LABELS[detected]}, mas escolheu pagar com ${method.label}.`);
  }
  // SMS colada: o valor e o comerciante têm de bater certo
  if (proofText) {
    if (parsed.amount != null && parsed.amount + 0.5 < amount) {
      throw new PaymentError(`A SMS mostra ${fmtMT(parsed.amount)}, mas o valor do plano é ${fmtMT(amount)}.`);
    }
    if (parsed.merchantCode && parsed.merchantCode !== method.merchantCode) {
      throw new PaymentError(`Esta SMS é de um pagamento a outro comerciante (${parsed.merchantCode}). O nosso código ${method.label} é ${method.merchantCode}.`);
    }
  }

  let payment: any;
  try {
    payment = await transaction(async (client) => {
      // Um pedido pendente do mesmo utilizador é substituído (ex.: corrigiu o código)
      await client.query(
        `UPDATE mobile_payments SET status = 'rejected', rejected_reason = 'Substituído', updated_at = NOW()
         WHERE user_id = $1 AND status = 'pending'`,
        [input.userId]
      );
      const ins = await client.query(
        `INSERT INTO mobile_payments (user_id, plan_id, billing_cycle, method, amount, transaction_id, proof_text)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [input.userId, input.planId, input.billingCycle, method.id, amount, txId, proofText]
      );
      return ins.rows[0];
    });
  } catch (err: any) {
    if (err?.code === '23505') throw new PaymentError('Este código de transação já foi usado.', 409);
    throw err;
  }

  if (await tryMatch(payment)) {
    const { rows } = await query('SELECT * FROM mobile_payments WHERE id = $1', [payment.id]);
    return { paid: true, payment: rows[0] };
  }

  const u = await query('SELECT name, email FROM users WHERE id = $1', [input.userId]);
  const who = u.rows[0]?.name || u.rows[0]?.email || input.userId;
  void notificationsService.sendAdminNotification(
    'paymentNotifications', 'admin_payment_review', 'Pagamento a confirmar',
    `${who} · ${method.label} ${fmtMT(amount)} · plano ${input.planId} · transação ${txId}. Confirme em Admin → Pagamentos.`,
    'credit-card', { paymentId: payment.id, userId: input.userId }
  );
  return { paid: false, payment };
}

/** SMS de confirmação recebida pelo telemóvel do COMERCIANTE (reencaminhada pela app). */
export async function recordMerchantSms(text: string, receivedFrom: string | null) {
  await ensureMobilePaymentsSchema();
  const parsed = parseMobileMoneySms(text);
  if (!parsed.transactionId) return { ok: false, matched: false, error: 'Sem código de transação nesta mensagem' };

  await query(
    `INSERT INTO mobile_payment_sms (transaction_id, amount, payer_phone, raw_text, received_from)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT (transaction_id) DO NOTHING`,
    [parsed.transactionId, parsed.amount, parsed.phone, String(text).slice(0, 2000), receivedFrom]
  );
  const { rows } = await query(
    `SELECT * FROM mobile_payments WHERE transaction_id = $1 AND status = 'pending' LIMIT 1`,
    [parsed.transactionId]
  );
  const matched = rows[0] ? await tryMatch(rows[0]) : false;
  return { ok: true, matched, transactionId: parsed.transactionId, amount: parsed.amount };
}

/** Último pagamento do utilizador ainda em curso (a confirmar, ou rejeitado há pouco). */
export async function latestUserPayment(userId: string) {
  await ensureMobilePaymentsSchema();
  const { rows } = await query(
    `SELECT id, plan_id, billing_cycle, method, amount, transaction_id, status, rejected_reason, created_at
     FROM mobile_payments
     WHERE user_id = $1 AND (status = 'pending' OR (status = 'rejected' AND rejected_reason <> 'Substituído'
           AND updated_at > NOW() - INTERVAL '7 days'))
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

export async function listMobilePayments(status: string | null) {
  await ensureMobilePaymentsSchema();
  const allowed = ['pending', 'paid', 'rejected'];
  const st = status && allowed.includes(status) ? status : null;
  const { rows } = await query(
    `SELECT p.id, p.plan_id, p.billing_cycle, p.method, p.amount, p.transaction_id, p.status, p.rejected_reason,
            p.confirmed_by, p.confirmed_at, p.created_at, p.proof_text, u.name AS user_name, u.email AS user_email,
            (SELECT s.amount FROM mobile_payment_sms s WHERE s.transaction_id = p.transaction_id) AS sms_amount
     FROM mobile_payments p JOIN users u ON u.id = p.user_id
     WHERE ($1::text IS NULL OR p.status = $1) AND NOT (p.status = 'rejected' AND p.rejected_reason = 'Substituído')
     ORDER BY p.created_at DESC LIMIT 100`,
    [st]
  );
  return rows;
}

export async function listRecentSms(limit = 20) {
  await ensureMobilePaymentsSchema();
  const { rows } = await query(
    `SELECT id, transaction_id, amount, received_from, received_at, payment_id
     FROM mobile_payment_sms ORDER BY received_at DESC LIMIT $1`,
    [limit]
  );
  return rows;
}
