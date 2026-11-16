/**
 * Pagamento dos planos por M-Pesa / e-Mola (ver services/mobile-payments.service.ts).
 *
 *  Cliente:  GET  /api/payments/mobile/config     métodos ativos, preços em MT, último pagamento
 *            POST /api/payments/mobile             envia o código da transação
 *  Admin:    GET/PUT /api/payments/mobile/admin/config, POST /admin/sms-secret,
 *            GET /admin/payments, POST /admin/payments/:id/confirm|reject
 *  SMS:      GET/POST /api/payments/mobile/sms/:secret  (app de reencaminhamento de SMS, sem sessão)
 */
import crypto from 'crypto';
import { Router, type Response } from 'express';
import multer from 'multer';
import { getStorageService } from '../services/storage.service';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware';
import {
  PaymentError,
  confirmMobilePayment,
  getMobilePaymentConfig,
  latestUserPayment,
  listMobilePayments,
  listRecentSms,
  priceFor,
  recordMerchantSms,
  regenerateSmsSecret,
  rejectMobilePayment,
  saveMobilePaymentConfig,
  setMethodLogo,
  submitMobilePayment,
  type BillingCycle,
  type MobileMethod,
} from '../services/mobile-payments.service';
import { plansService } from '../services/plans.service';

const router = Router();

const fail = (res: Response, err: any, next: (e: any) => void) => {
  if (err instanceof PaymentError) return res.status(err.status).json({ error: err.message });
  return next(err);
};

// ── Cliente ──────────────────────────────────────────────────────────────────────────────────────
router.get('/config', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const config = await getMobilePaymentConfig();
    const plans = await plansService.getAllPlans();
    const prices: Record<string, { monthly: number | null; annual: number | null }> = {};
    for (const p of plans) {
      prices[p.id] = { monthly: priceFor(config, p.id, 'monthly'), annual: priceFor(config, p.id, 'annual') };
    }
    res.json({
      success: true,
      // Sem o segredo das SMS: só o que o cliente precisa para pagar
      methods: config.methods
        .filter((m) => m.enabled && m.merchantCode)
        .map(({ id, label, merchantCode, merchantName, ussd, logoUrl }) => ({ id, label, merchantCode, merchantName, ussd, logoUrl })),
      prices,
      latest: await latestUserPayment(req.user!.id),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { planId, billingCycle, method, transactionId, proofText } = req.body || {};
    if (!planId || typeof planId !== 'string') return res.status(400).json({ error: 'Plano em falta' });
    if (!['monthly', 'annual'].includes(billingCycle)) return res.status(400).json({ error: 'Ciclo inválido' });
    if (!['mpesa', 'emola'].includes(method)) return res.status(400).json({ error: 'Método inválido' });
    const result = await submitMobilePayment({
      userId: req.user!.id,
      planId: planId.toLowerCase(),
      billingCycle: billingCycle as BillingCycle,
      method: method as MobileMethod,
      transactionId: typeof transactionId === 'string' ? transactionId : null,
      proofText: typeof proofText === 'string' ? proofText : null,
    });
    const p = result.payment;
    res.json({
      success: true,
      paid: result.paid,
      payment: {
        id: p.id, plan_id: p.plan_id, billing_cycle: p.billing_cycle, method: p.method, amount: p.amount,
        transaction_id: p.transaction_id, status: p.status, rejected_reason: p.rejected_reason, created_at: p.created_at,
      },
    });
  } catch (err) {
    fail(res, err, next);
  }
});

// ── Administrador ────────────────────────────────────────────────────────────────────────────────
const admin = [requireAuth, requireAdmin];

router.get('/admin/config', ...admin, async (_req, res, next) => {
  try {
    res.json({ success: true, config: await getMobilePaymentConfig(), sms: await listRecentSms(10) });
  } catch (err) {
    next(err);
  }
});

router.put('/admin/config', ...admin, async (req, res, next) => {
  try {
    const { methods, planPrices, smsEnabled } = req.body || {};
    res.json({ success: true, config: await saveMobilePaymentConfig({ methods, planPrices, smsEnabled }) });
  } catch (err) {
    next(err);
  }
});

router.post('/admin/sms-secret', ...admin, async (_req, res, next) => {
  try {
    res.json({ success: true, config: await regenerateSmsSecret() });
  } catch (err) {
    next(err);
  }
});

// Logótipo de um método: imagem até 2 MB, guardada para sempre (system-assets)
const logoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });
router.post('/admin/logo/:method', ...admin, logoUpload.single('logo'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const method = req.params.method as MobileMethod;
    if (!['mpesa', 'emola'].includes(method)) return res.status(400).json({ error: 'Método inválido' });
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Escolha uma imagem' });
    if (!/^image\/(png|jpe?g|webp)$/.test(file.mimetype)) {
      return res.status(400).json({ error: 'Use uma imagem PNG, JPG ou WebP' });
    }
    const url = await getStorageService().uploadFile(file, 'system-assets', req.user!.id);
    res.json({ success: true, config: await setMethodLogo(method, url) });
  } catch (err) {
    next(err);
  }
});

router.delete('/admin/logo/:method', ...admin, async (req, res, next) => {
  try {
    const method = req.params.method as MobileMethod;
    if (!['mpesa', 'emola'].includes(method)) return res.status(400).json({ error: 'Método inválido' });
    res.json({ success: true, config: await setMethodLogo(method, '') });
  } catch (err) {
    next(err);
  }
});

router.get('/admin/payments', ...admin, async (req, res, next) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : null;
    res.json({ success: true, payments: await listMobilePayments(status) });
  } catch (err) {
    next(err);
  }
});

router.post('/admin/payments/:id/confirm', ...admin, async (req: AuthenticatedRequest, res, next) => {
  try {
    const r = await confirmMobilePayment(req.params.id, `admin:${req.user!.id}`);
    res.json({ success: true, alreadyPaid: r.alreadyPaid });
  } catch (err) {
    fail(res, err, next);
  }
});

router.post('/admin/payments/:id/reject', ...admin, async (req: AuthenticatedRequest, res, next) => {
  try {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 300) : null;
    await rejectMobilePayment(req.params.id, reason, `admin:${req.user!.id}`);
    res.json({ success: true });
  } catch (err) {
    fail(res, err, next);
  }
});

// ── SMS reencaminhadas (app no telemóvel do comerciante) ────────────────────────────────────────
/**
 * GET  /api/payments/mobile/sms/<segredo>?text={msg}&from={from}   (o mais comum nestas apps)
 * POST JSON { "text": "...", "from": "..." }
 * Aceita vários nomes de campo para funcionar com apps diferentes. O segredo vai no caminho
 * porque muitas apps não deixam definir cabeçalhos.
 */
const pick = (obj: any, keys: string[]) => {
  for (const k of keys) if (obj && obj[k] != null && String(obj[k]).trim() !== '') return String(obj[k]);
  return '';
};

const sameSecret = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

async function handleSms(req: any, res: Response) {
  try {
    const config = await getMobilePaymentConfig();
    if (!config.smsEnabled || !config.smsSecret || !sameSecret(String(req.params.secret || ''), config.smsSecret)) {
      return res.status(401).json({ error: 'Endereço inválido' });
    }
    const src = { ...(req.query || {}), ...(req.body && typeof req.body === 'object' ? req.body : {}) };
    const text = pick(src, ['text', 'msg', 'message', 'body', 'content', 'sms']);
    const from = pick(src, ['from', 'sender', 'phone', 'number', 'address']);
    if (!text) return res.status(400).json({ error: 'Mensagem vazia — envie o texto da SMS em "text" ou "msg"' });

    // Só SMS do M-Pesa / e-Mola: outra mensagem no mesmo telemóvel nunca conta como pagamento
    if (from && !/m-?pesa|vodacom|e-?mola|movitel|^\d{3,6}$/i.test(from)) {
      return res.json({ ok: true, ignored: 'remetente não é o M-Pesa nem o e-Mola' });
    }
    const result = await recordMerchantSms(text, `sms:${from || 'desconhecido'}`);
    // 200 mesmo sem código (ex.: mensagem de teste da app), para a app não repetir o envio
    res.json(result);
  } catch (err) {
    console.error('[MobilePay/sms]', err);
    res.status(500).json({ error: 'Erro ao processar a SMS' });
  }
}

router.get('/sms/:secret', handleSms);
router.post('/sms/:secret', handleSms);

export default router;
