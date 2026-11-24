// /api/lead-finder — encontrar leads no Google Maps
//   GET  /usage    pesquisas usadas este mês e se está configurado
//   POST /search   { query, location, pageToken? } → empresas (marca as que já são leads)
//   POST /import   { places: [...], query } → cria os leads escolhidos
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { checkLeadLimit } from '../middleware/plan-enforcement.middleware';
import { importPlaces, isPlacesConfigured, LeadFinderError, searchesThisMonth, searchPlaces } from '../services/lead-finder.service';

const router = Router();
router.use(requireAuth);

const sendError = (res: any, error: unknown, next: (e: unknown) => void) => {
  if (error instanceof LeadFinderError) return res.status(error.status).json({ error: error.message, code: error.code });
  return next(error);
};

router.get('/usage', async (req: any, res, next) => {
  try {
    res.json({ success: true, configured: isPlacesConfigured(), usage: await searchesThisMonth(req.user.id) });
  } catch (error) {
    next(error);
  }
});

router.post('/search', async (req: any, res, next) => {
  try {
    const { query, location, pageToken } = req.body || {};
    const result = await searchPlaces(
      req.user.id,
      String(query || ''),
      String(location || ''),
      typeof pageToken === 'string' && pageToken ? pageToken : undefined,
    );
    res.json({ success: true, ...result });
  } catch (error) {
    sendError(res, error, next);
  }
});

router.post('/import', async (req: any, res, next) => {
  try {
    const places = Array.isArray(req.body?.places) ? req.body.places : [];
    if (places.length === 0) return res.status(400).json({ error: 'Escolha pelo menos uma empresa' });
    const limit = await checkLeadLimit(req.user.id);
    const room = limit.limit === -1 ? Infinity : Math.max(0, limit.limit - limit.current);
    if (room === 0) return res.status(403).json({ error: limit.message || 'Chegou ao limite de leads do plano', code: limit.code });
    const result = await importPlaces(req.user.id, places, String(req.body?.query || ''), room);
    res.json({ success: true, ...result, limited: room !== Infinity && result.imported >= room });
  } catch (error) {
    sendError(res, error, next);
  }
});

export default router;
