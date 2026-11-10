// Google Calendar nas Tarefas e lembretes (ver services/google-calendar.service.ts).
//   GET    /status     configurado? ligado? com que email?
//   POST   /start      endereço do login do Google
//   GET    /events     próximos eventos (?days=1..90, por omissão 30)
//   GET    /callback   (público) o Google volta aqui
//   GET    /done       (público) fim na web: avisa as Tarefas e fecha a janela
//   DELETE /           desligar
import crypto from 'crypto';
import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.middleware';
import {
  buildCalendarAuthorizeUrl, calendarConnection, calendarDonePage, calendarReturnUrl, createCalendarState,
  disconnectCalendar, exchangeCalendarCode, isCalendarConfigured, listEvents, readCalendarState,
} from '../services/google-calendar.service';
import { drivePageCsp } from '../services/google-drive.service';
import { backfillTasksToCalendar } from '../services/task-calendar-sync.service';

const router = Router();

function sendPage(res: any, html: string, nonce: string) {
  res.setHeader('Content-Security-Policy', drivePageCsp(nonce));
  res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(html);
}

router.get('/status', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const configured = isCalendarConfigured();
    const conn = configured ? await calendarConnection(req.user!.id) : null;
    res.json({ configured, connected: !!conn, email: conn?.email || null });
  } catch (err) {
    next(err);
  }
});

router.get('/events', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from.getTime() + days * 86_400_000);
    const events = await listEvents(req.user!.id, from, to);
    if (events === null) return res.status(404).json({ error: 'Google Calendar não ligado' });
    res.json({ events });
  } catch (err: any) {
    // Acesso retirado na conta Google: pedir para ligar de novo em vez de um erro genérico
    if (err?.status === 401 || err?.status === 403) return res.status(409).json({ error: 'Ligue o Google Calendar de novo.', reconnect: true });
    next(err);
  }
});

router.post('/start', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!isCalendarConfigured()) return res.status(503).json({ error: 'O Google Calendar ainda não está disponível.' });
    const platform = req.body?.platform === 'app' ? 'app' : 'web';
    const conn = await calendarConnection(req.user!.id);
    res.json({ url: buildCalendarAuthorizeUrl(createCalendarState(req.user!.id, platform), conn?.email || undefined) });
  } catch (err) {
    next(err);
  }
});

router.get('/callback', async (req, res) => {
  const state = readCalendarState(String(req.query.state || ''));
  const nonce = crypto.randomBytes(16).toString('base64');
  if (!state) return sendPage(res.status(400), calendarDonePage({ calendar: 'error', reason: 'expired' }, nonce), nonce);
  if (req.query.error || !req.query.code) return res.redirect(calendarReturnUrl(state.platform, { calendar: 'cancelled' }));
  try {
    await exchangeCalendarCode(state.userId, String(req.query.code));
    // As tarefas que já existiam entram também no calendário
    void backfillTasksToCalendar(state.userId);
    res.redirect(calendarReturnUrl(state.platform, { calendar: 'connected' }));
  } catch (err: any) {
    console.error('[GoogleCalendar] Falha a ligar:', err.message);
    res.redirect(calendarReturnUrl(state.platform, { calendar: 'error' }));
  }
});

router.get('/done', (req, res) => {
  const nonce = crypto.randomBytes(16).toString('base64');
  const params: Record<string, string> = {};
  for (const k of ['calendar', 'reason']) if (typeof req.query[k] === 'string') params[k] = String(req.query[k]).slice(0, 40);
  sendPage(res, calendarDonePage(params, nonce), nonce);
});

router.delete('/', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    await disconnectCalendar(req.user!.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
