import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { LeadsService } from '../services/leads.service';

const router = Router();
const leadsService = new LeadsService();

const extractLeadsFromPayload = (payload: any): any[] => {
  if (!payload) {
    return [];
  }

  if (Array.isArray(payload)) {
    return payload;
  }

  const keys = ['dados', 'data', 'contatos', 'contacts', 'leads', 'result'];
  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  if (payload && typeof payload === 'object') {
    return [payload];
  }

  return [];
};

const fetchWebhookData = async (url: string, body: Record<string, any>) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  const attempt = async (method: 'POST' | 'GET') => {
    const response = await fetch(url, {
      method,
      headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
      body: method === 'POST' ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      const preview = (await response.text()).slice(0, 300);
      throw new Error(`Webhook responded with ${response.status} ${response.statusText}: ${preview}`);
    }

    const raw = await response.text();
    if (!raw.trim()) {
      throw new Error('Webhook returned empty response. Make sure the workflow ends with a Respond node.');
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      throw new Error('Webhook returned invalid JSON.');
    }
  };

  try {
    return await attempt('POST');
  } catch (postError) {
    console.warn('[Integrations] POST request to webhook failed. Retrying with GET...', postError);
    return await attempt('GET');
  } finally {
    clearTimeout(timeout);
  }
};

router.use(authMiddleware);

router.post('/n8n/sync', async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const webhookUrl = req.body?.webhookUrl;
    if (!webhookUrl || typeof webhookUrl !== 'string') {
      return res.status(400).json({ error: 'webhookUrl is required' });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(webhookUrl);
    } catch (error) {
      return res.status(400).json({ error: 'Invalid webhook URL' });
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: 'Webhook URL must be HTTP or HTTPS' });
    }

    const body = {
      userId: user.id,
      leadflow: true,
      source: 'leadflow-sync',
      timestamp: new Date().toISOString(),
    };

    const payload = await fetchWebhookData(parsedUrl.toString(), body);
    const leads = extractLeadsFromPayload(payload);

    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ error: 'Webhook did not return leads' });
    }

    const result = await leadsService.importBulk(leads, user.id, { source: 'n8n' });

    res.json({
      ...result,
      received: leads.length,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
