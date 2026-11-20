import { Router } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import {
  getGooglePlayCatalog,
  googlePlayAccountId,
  isGooglePlayConfigured,
  processGooglePlayRtdn,
  verifyGooglePlaySubscription,
  verifyGooglePubSubToken,
  type GooglePlayRtdnMessage,
} from '../services/google-play-billing.service';

const router = Router();

// Configuração pública para a conta autenticada. Nunca devolve credenciais da Google.
router.get('/config', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Não autorizado' });
    const enabled = isGooglePlayConfigured();
    return res.json({
      success: true,
      enabled,
      accountId: enabled ? googlePlayAccountId(req.user.id) : null,
      products: enabled ? getGooglePlayCatalog() : [],
    });
  } catch (error) {
    next(error);
  }
});

// O cliente envia apenas o token. Plano, ciclo, validade e estado vêm da Google.
router.post('/verify', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Não autorizado' });
    const purchaseToken = typeof req.body?.purchaseToken === 'string' ? req.body.purchaseToken : '';
    const productId = typeof req.body?.productId === 'string' ? req.body.productId : undefined;
    const result = await verifyGooglePlaySubscription({
      userId: req.user.id,
      purchaseToken,
      expectedProductId: productId,
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

// Google Pub/Sub envia RTDN com um ID token OIDC no cabeçalho Authorization.
router.post('/rtdn', async (req, res, next) => {
  try {
    if (!(await verifyGooglePubSubToken(req.headers.authorization))) {
      return res.status(401).json({ error: 'Notificação Google não autenticada' });
    }

    const encoded = req.body?.message?.data;
    if (typeof encoded !== 'string' || encoded.length > 1_000_000) {
      return res.status(400).json({ error: 'Notificação Google inválida' });
    }
    let message: GooglePlayRtdnMessage;
    try {
      message = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Dados da notificação Google inválidos' });
    }

    const result = await processGooglePlayRtdn(message);
    return res.json({ received: true, ...result });
  } catch (error) {
    next(error);
  }
});

export default router;
