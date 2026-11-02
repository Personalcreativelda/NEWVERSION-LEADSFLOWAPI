// Ligação à API de Conversões da Meta, eventos enviados e exportação de públicos
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { query } from '../database/connection';
import {
  audienceCsv, getMetaConfig, MetaConversionsError, publicConfig, saveMetaConfig, testConnection,
} from '../services/meta-conversions.service';

const router = Router();
router.use(authMiddleware);

const fail = (res: any, next: any, err: any) => {
  if (err instanceof MetaConversionsError) return res.status(err.status).json({ error: err.message });
  next(err);
};

router.get('/config', async (req, res, next) => {
  try {
    res.json(publicConfig(await getMetaConfig(req.user!.id)));
  } catch (err) { fail(res, next, err); }
});

router.put('/config', async (req, res, next) => {
  try {
    const { enabled, dataset_id, access_token, test_event_code, currency, country, mapping } = req.body || {};
    const saved = await saveMetaConfig(req.user!.id, { enabled, dataset_id, access_token, test_event_code, currency, country, mapping });
    res.json(publicConfig(saved));
  } catch (err) { fail(res, next, err); }
});

router.post('/test', async (req, res, next) => {
  try {
    res.json(await testConnection(req.user!.id));
  } catch (err) { fail(res, next, err); }
});

/** Últimos eventos enviados (e os que falharam) */
router.get('/events', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT e.id, e.event_name, e.stage, e.value, e.via_ad, e.status, e.error, e.sent_at, e.updated_at,
              l.id AS lead_id, l.name AS lead_name
         FROM meta_events e JOIN leads l ON l.id = e.lead_id
        WHERE e.user_id = $1
        ORDER BY e.updated_at DESC
        LIMIT 30`,
      [req.user!.id],
    );
    const totals = await query(
      `SELECT COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
              COUNT(*) FILTER (WHERE status = 'sent' AND via_ad)::int AS via_ad,
              COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
         FROM meta_events WHERE user_id = $1 AND created_at > NOW() - INTERVAL '30 days'`,
      [req.user!.id],
    );
    res.json({ events: rows.rows, totals: totals.rows[0] });
  } catch (err) { fail(res, next, err); }
});

/** Lista de clientes para criar públicos personalizados e semelhantes */
router.get('/audience', async (req, res, next) => {
  try {
    const stages = String(req.query.stages || '').split(',').map((s) => s.trim()).filter((s) => /^[a-z0-9_-]{1,60}$/i.test(s));
    const result = await audienceCsv(req.user!.id, stages);
    res.json(result);
  } catch (err) { fail(res, next, err); }
});

export default router;
