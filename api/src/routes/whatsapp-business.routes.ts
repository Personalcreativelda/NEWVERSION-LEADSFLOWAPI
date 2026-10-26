// /api/whatsapp-business — gestão do WhatsApp Business oficial nas Definições:
//   GET    /channels                                canais whatsapp_cloud da conta
//   GET    /:channelId/overview                     conta (WABA) e números
//   GET    /:channelId/profile                      perfil da empresa
//   PUT    /:channelId/profile                      atualizar perfil
//   POST   /:channelId/numbers/:phoneId/request-code   pedir código (SMS/VOICE)
//   POST   /:channelId/numbers/:phoneId/verify-code    confirmar código
//   POST   /:channelId/numbers/:phoneId/register       ativar na Cloud API (PIN)
//   PUT    /:channelId/numbers/:phoneId/use             usar este número no canal
//   GET    /:channelId/templates                    modelos de mensagem
//   POST   /:channelId/templates                    criar modelo
//   DELETE /:channelId/templates/:name?id=          apagar modelo
import { Router, type Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';
import { ChannelsService } from '../services/channels.service';
import {
  cloudCredentials,
  createTemplate,
  deleteTemplate,
  getOverview,
  getProfile,
  listTemplates,
  registerNumber,
  requestCode,
  updateProfile,
  verifyCode,
  WhatsAppBusinessError,
} from '../services/whatsapp-business.service';

const router = Router();
const channelsService = new ChannelsService();

async function credentialsFor(req: AuthenticatedRequest) {
  const channel = await channelsService.findById(String(req.params.channelId), req.user!.id);
  if (!channel) throw new WhatsAppBusinessError('Canal não encontrado.', 404);
  return { channel, cred: cloudCredentials(channel) };
}

function fail(res: Response, error: unknown) {
  if (error instanceof WhatsAppBusinessError) return res.status(error.status).json({ error: error.message, code: error.code });
  console.error('[WhatsApp Business]', error);
  return res.status(502).json({ error: 'Não foi possível falar com a Meta. Tente de novo.' });
}

router.get('/channels', async (req: AuthenticatedRequest, res) => {
  try {
    const channels = await channelsService.findByType('whatsapp_cloud', req.user!.id);
    res.json(channels.map((c: any) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      phone: c.credentials?.display_phone_number || null,
      has_account: !!c.credentials?.waba_id,
    })));
  } catch (error) { fail(res, error); }
});

router.get('/:channelId/overview', async (req: AuthenticatedRequest, res) => {
  try {
    const { cred } = await credentialsFor(req);
    res.json(await getOverview(cred));
  } catch (error) { fail(res, error); }
});

router.get('/:channelId/profile', async (req: AuthenticatedRequest, res) => {
  try {
    const { cred } = await credentialsFor(req);
    res.json(await getProfile(cred));
  } catch (error) { fail(res, error); }
});

router.put('/:channelId/profile', async (req: AuthenticatedRequest, res) => {
  try {
    const { cred } = await credentialsFor(req);
    res.json(await updateProfile(cred, req.body || {}));
  } catch (error) { fail(res, error); }
});

router.post('/:channelId/numbers/:phoneId/request-code', async (req: AuthenticatedRequest, res) => {
  try {
    const { cred } = await credentialsFor(req);
    await requestCode(cred, String(req.params.phoneId), String(req.body?.method || 'SMS'));
    res.json({ success: true });
  } catch (error) { fail(res, error); }
});

router.post('/:channelId/numbers/:phoneId/verify-code', async (req: AuthenticatedRequest, res) => {
  try {
    const { cred } = await credentialsFor(req);
    await verifyCode(cred, String(req.params.phoneId), String(req.body?.code || ''));
    res.json({ success: true });
  } catch (error) { fail(res, error); }
});

router.post('/:channelId/numbers/:phoneId/register', async (req: AuthenticatedRequest, res) => {
  try {
    const { cred } = await credentialsFor(req);
    await registerNumber(cred, String(req.params.phoneId), String(req.body?.pin || ''));
    res.json({ success: true });
  } catch (error) { fail(res, error); }
});

// Passar o canal a usar outro número da mesma conta WhatsApp Business
router.put('/:channelId/numbers/:phoneId/use', async (req: AuthenticatedRequest, res) => {
  try {
    const { channel, cred } = await credentialsFor(req);
    const phoneId = String(req.params.phoneId);
    const overview = await getOverview(cred);
    const number = overview.phone_numbers.find((n: any) => n.id === phoneId);
    if (!number) throw new WhatsAppBusinessError('Este número não pertence a esta conta WhatsApp Business.', 404);
    await channelsService.update(channel.id, {
      credentials: { ...(channel as any).credentials, phone_number_id: phoneId, display_phone_number: number.display_phone_number, verified_name: number.verified_name },
    } as any, req.user!.id);
    res.json({ success: true });
  } catch (error) { fail(res, error); }
});

router.get('/:channelId/templates', async (req: AuthenticatedRequest, res) => {
  try {
    const { cred } = await credentialsFor(req);
    res.json(await listTemplates(cred));
  } catch (error) { fail(res, error); }
});

router.post('/:channelId/templates', async (req: AuthenticatedRequest, res) => {
  try {
    const { cred } = await credentialsFor(req);
    res.status(201).json(await createTemplate(cred, req.body || {}));
  } catch (error) { fail(res, error); }
});

router.delete('/:channelId/templates/:name', async (req: AuthenticatedRequest, res) => {
  try {
    const { cred } = await credentialsFor(req);
    await deleteTemplate(cred, String(req.params.name), req.query.id ? String(req.query.id) : undefined);
    res.json({ success: true });
  } catch (error) { fail(res, error); }
});

export default router;
