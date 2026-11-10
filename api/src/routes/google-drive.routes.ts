// Google Drive na base de conhecimento dos assistentes (ver services/google-drive.service.ts).
//   GET    /status     estado (configurado no servidor? ligado? com que email?)
//   POST   /start      começa: devolve o endereço do login do Google
//   GET    /callback   (público) o Google volta aqui → seletor de ficheiros
//   GET    /import     (público, com state assinado) ficheiros escolhidos → importar
//   GET    /done       (público) fim na web: avisa o painel e fecha a janela
//   DELETE /           desligar o Google Drive
import crypto from 'crypto';
import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.middleware';
import { query } from '../database/connection';
import {
  buildDriveAuthorizeUrl, createDriveState, disconnectDrive, donePage, drivePageCsp, driveConnection,
  driveReturnUrl, exchangeDriveCode, isDriveConfigured, pickerPage, queueDriveFiles, readDriveState, syncDriveFiles,
} from '../services/google-drive.service';

const router = Router();

function sendPage(res: any, html: string, nonce: string) {
  res.setHeader('Content-Security-Policy', drivePageCsp(nonce));
  // O seletor do Google abre janelas e a página de fim fala com a janela que a abriu
  res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(html);
}

router.get('/status', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const configured = isDriveConfigured();
    const conn = configured ? await driveConnection(req.user!.id) : null;
    res.json({ configured, connected: !!conn, email: conn?.email || null });
  } catch (err) {
    next(err);
  }
});

router.post('/start', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!isDriveConfigured()) return res.status(503).json({ error: 'O Google Drive ainda não está disponível.' });
    const assistantId = String(req.body?.assistant_id || '');
    if (!/^[0-9a-f-]{36}$/i.test(assistantId)) return res.status(400).json({ error: 'Assistente inválido' });
    const owner = await query('SELECT id FROM user_assistants WHERE id = $1 AND user_id = $2', [assistantId, req.user!.id]);
    if (!owner.rows[0]) return res.status(404).json({ error: 'Assistente não encontrado' });
    const platform = req.body?.platform === 'app' ? 'app' : 'web';
    const conn = await driveConnection(req.user!.id);
    res.json({ url: buildDriveAuthorizeUrl(createDriveState({ userId: req.user!.id, assistantId, platform }), conn?.email || undefined) });
  } catch (err) {
    next(err);
  }
});

router.get('/callback', async (req, res) => {
  const state = readDriveState(String(req.query.state || ''));
  const nonce = crypto.randomBytes(16).toString('base64');
  if (!state) return sendPage(res.status(400), donePage({ drive: 'error', reason: 'expired' }, nonce), nonce);
  if (req.query.error || !req.query.code) {
    return res.redirect(driveReturnUrl(state.platform, { drive: 'cancelled', assistant: state.assistantId }));
  }
  try {
    const { accessToken } = await exchangeDriveCode(state.userId, String(req.query.code));
    const cancelUrl = driveReturnUrl(state.platform, { drive: 'cancelled', assistant: state.assistantId });
    // O mesmo state (assinado, 30 min) autoriza o passo seguinte
    sendPage(res, pickerPage(accessToken, String(req.query.state), cancelUrl, nonce), nonce);
  } catch (err: any) {
    console.error('[GoogleDrive] Falha a trocar o código:', err.message);
    res.redirect(driveReturnUrl(state.platform, { drive: 'error', assistant: state.assistantId }));
  }
});

router.get('/import', async (req, res) => {
  const state = readDriveState(String(req.query.state || ''));
  const nonce = crypto.randomBytes(16).toString('base64');
  if (!state) return sendPage(res.status(400), donePage({ drive: 'error', reason: 'expired' }, nonce), nonce);
  const ids = String(req.query.ids || '').split(',').map((s) => s.trim()).filter(Boolean);
  try {
    const { queued, skipped } = await queueDriveFiles(state.userId, state.assistantId, ids);
    // Ler os ficheiros demora (PDF/Word passam pela extração): em segundo plano
    void syncDriveFiles(state.userId, state.assistantId, { ids: queued, force: true })
      .catch((err) => console.warn('[GoogleDrive] Importação falhou:', err.message));
    res.redirect(driveReturnUrl(state.platform, {
      drive: 'importing', assistant: state.assistantId, count: String(queued.length), ...(skipped ? { skipped: String(skipped) } : {}),
    }));
  } catch (err: any) {
    console.error('[GoogleDrive] Falha a importar:', err.message);
    res.redirect(driveReturnUrl(state.platform, { drive: 'error', assistant: state.assistantId }));
  }
});

router.get('/done', (req, res) => {
  const nonce = crypto.randomBytes(16).toString('base64');
  const allowed = ['drive', 'assistant', 'count', 'skipped', 'reason'];
  const params: Record<string, string> = {};
  for (const k of allowed) if (typeof req.query[k] === 'string') params[k] = String(req.query[k]).slice(0, 80);
  sendPage(res, donePage(params, nonce), nonce);
});

router.delete('/', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    await disconnectDrive(req.user!.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
