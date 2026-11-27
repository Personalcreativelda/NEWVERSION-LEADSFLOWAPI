// /api/inbox — WhatsApp oficial numa conversa: janela de 24 horas e modelos de mensagem
//   GET  /conversations/:id/whatsapp-window   { applies, open, last_inbound_at, expires_at }
//   GET  /conversations/:id/templates         modelos APROVADOS do número da conversa (Meta: GET /{WABA_ID}/message_templates)
//   POST /conversations/:id/send-template     { name, language, body_params?, header_params? }
//
// O envio de um modelo não abre a janela (só a mensagem do cliente a abre). A mensagem fica 'pending'
// até a Meta dizer sent / delivered / read / failed (cloud-status.service).
import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.middleware';
import { query } from '../database/connection';
import { conversationWindow } from '../services/whatsapp-window.service';
import { cloudCredentials, listTemplates, WhatsAppBusinessError } from '../services/whatsapp-business.service';
import { CloudSendError, cloudRecipient, sendCloudTemplate } from '../services/whatsapp-cloud.service';
import { drainBufferedStatuses } from '../services/cloud-status.service';
import { getWebSocketService } from '../services/websocket.service';

const router = Router();
router.use(requireAuth);

/** Contas cujas conversas este utilizador pode usar: a dele e a do dono da equipa (como na inbox) */
async function ownersOf(userId: string): Promise<string[]> {
  const team = await query(
    `SELECT w.owner_id FROM team_members tm JOIN workspaces w ON w.id = tm.workspace_id
      WHERE tm.user_id = $1 AND tm.status = 'active' AND tm.is_active = true AND w.owner_id != $1 LIMIT 1`,
    [userId],
  ).catch(() => ({ rows: [] as any[] }));
  return [userId, ...(team.rows[0]?.owner_id ? [team.rows[0].owner_id] : [])];
}

async function cloudConversation(conversationId: string, userId: string) {
  const owners = await ownersOf(userId);
  const r = await query(
    `SELECT c.id, c.user_id, c.remote_jid, c.lead_id, c.channel_id, c.metadata, ch.type AS channel_type, ch.credentials
       FROM conversations c JOIN channels ch ON ch.id = c.channel_id
      WHERE c.id = $1 AND c.user_id = ANY($2::uuid[])`,
    [conversationId, owners],
  );
  const conv = r.rows[0];
  if (!conv) throw new WhatsAppBusinessError('Conversa não encontrada.', 404);
  if (conv.channel_type !== 'whatsapp_cloud') throw new WhatsAppBusinessError('Esta conversa não é do WhatsApp Business.', 400);
  if (typeof conv.credentials === 'string') { try { conv.credentials = JSON.parse(conv.credentials); } catch { conv.credentials = {}; } }
  return { conv, owners };
}

const fail = (res: any, err: any) => {
  if (err instanceof WhatsAppBusinessError) return res.status(err.status).json({ error: err.message });
  if (err instanceof CloudSendError) return res.status(422).json({ error: err.message, code: err.metaCode || null });
  console.error('[Inbox WhatsApp]', err?.message || err);
  return res.status(502).json({ error: 'Não foi possível falar com a Meta. Tente de novo.' });
};

/** Variáveis {{1}}, {{2}}… de um texto */
const varsIn = (text: string) => [...new Set([...String(text || '').matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
const fill = (text: string, params: string[]) => String(text || '').replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? `{{${n}}}`);

router.get('/conversations/:id/whatsapp-window', async (req: AuthenticatedRequest, res) => {
  try {
    const owners = await ownersOf(req.user!.id);
    const w = await conversationWindow(String(req.params.id), owners);
    res.json(w);
  } catch (err) { fail(res, err); }
});

router.get('/conversations/:id/templates', async (req: AuthenticatedRequest, res) => {
  try {
    const { conv } = await cloudConversation(String(req.params.id), req.user!.id);
    const all = await listTemplates(cloudCredentials({ type: 'whatsapp_cloud', credentials: conv.credentials }));
    res.json(all.filter((t: any) => t.status === 'APPROVED').map((t: any) => {
      const header = (t.components || []).find((c: any) => c.type === 'HEADER');
      const body = (t.components || []).find((c: any) => c.type === 'BODY');
      const footer = (t.components || []).find((c: any) => c.type === 'FOOTER');
      const buttons = (t.components || []).find((c: any) => c.type === 'BUTTONS');
      return {
        name: t.name,
        language: t.language,
        category: t.category,
        header: header?.format === 'TEXT' ? header.text : null,
        header_format: header?.format || null,
        body: body?.text || '',
        footer: footer?.text || null,
        buttons: (buttons?.buttons || []).map((b: any) => ({ type: b.type, text: b.text, url: b.url || null })),
        header_vars: header?.format === 'TEXT' ? varsIn(header.text).length : 0,
        body_vars: varsIn(body?.text || '').length,
        // Modelos com cabeçalho de média ou botões com variáveis precisam de dados que a inbox ainda não pede
        sendable: !header || header.format === 'TEXT'
          ? !(buttons?.buttons || []).some((b: any) => b.type === 'URL' && /\{\{\d+\}\}/.test(b.url || ''))
          : false,
      };
    }));
  } catch (err) { fail(res, err); }
});

router.post('/conversations/:id/send-template', async (req: AuthenticatedRequest, res) => {
  try {
    const { conv } = await cloudConversation(String(req.params.id), req.user!.id);
    const name = String(req.body?.name || '').trim();
    const language = String(req.body?.language || '').trim();
    const bodyParams: string[] = (Array.isArray(req.body?.body_params) ? req.body.body_params : []).map((v: any) => String(v ?? '').trim());
    const headerParams: string[] = (Array.isArray(req.body?.header_params) ? req.body.header_params : []).map((v: any) => String(v ?? '').trim());
    if (!name || !language) return res.status(400).json({ error: 'Escolha o modelo.' });

    // Consentimento: quem pediu para não ser contactado não recebe modelos
    if (conv.lead_id) {
      const lead = (await query('SELECT tags FROM leads WHERE id = $1', [conv.lead_id])).rows[0];
      if ((lead?.tags || []).some((t: string) => ['nao-contactar', 'opt-out', 'sem-consentimento'].includes(String(t).toLowerCase()))) {
        return res.status(403).json({ error: 'Este contacto pediu para não ser contactado. Retire a etiqueta "nao-contactar" só se ele voltar a dar consentimento.' });
      }
    }

    // O modelo tem de existir APROVADO neste número e idioma (evita o 132001 da Meta)
    const creds = cloudCredentials({ type: 'whatsapp_cloud', credentials: conv.credentials });
    const tpl = (await listTemplates(creds)).find((t: any) => t.name === name && t.language === language);
    if (!tpl) return res.status(400).json({ error: 'O modelo não existe neste número com esse idioma. Atualize a lista de modelos.' });
    if (tpl.status !== 'APPROVED') return res.status(400).json({ error: 'Este modelo ainda não está aprovado pela Meta.' });
    const header = (tpl.components || []).find((c: any) => c.type === 'HEADER');
    const body = (tpl.components || []).find((c: any) => c.type === 'BODY');
    const needBody = varsIn(body?.text || '').length;
    const needHeader = header?.format === 'TEXT' ? varsIn(header.text).length : 0;
    if (bodyParams.length < needBody || bodyParams.slice(0, needBody).some((v) => !v)
      || headerParams.length < needHeader || headerParams.slice(0, needHeader).some((v) => !v)) {
      return res.status(400).json({ error: 'Preencha todas as variáveis do modelo.' });
    }

    const phone = String(conv.remote_jid || '').split('@')[0];
    const result = await sendCloudTemplate(conv.credentials, cloudRecipient(conv.remote_jid, phone), {
      name, language, params: bodyParams.slice(0, needBody), headerParams: headerParams.slice(0, needHeader),
    });
    const wamid = result?.messages?.[0]?.id || null;
    const text = [header?.format === 'TEXT' ? fill(header.text, headerParams) : null, fill(body?.text || '', bodyParams)]
      .filter(Boolean).join('\n\n');

    const saved = (await query(
      `INSERT INTO messages (user_id, conversation_id, lead_id, direction, channel, content, status, external_id, metadata)
       VALUES ($1, $2, $3, 'out', 'whatsapp_cloud', $4, 'pending', $5, $6)
       RETURNING *`,
      [conv.user_id, conv.id, conv.lead_id, text, wamid,
        JSON.stringify({
          source: 'template', template: { name, language, category: tpl.category, body_params: bodyParams, header_params: headerParams },
          sent_by: req.user!.id !== conv.user_id ? req.user!.id : undefined,
        })],
    )).rows[0];
    await query('UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1', [conv.id]);
    if (wamid) void drainBufferedStatuses(wamid).catch(() => {});
    getWebSocketService()?.emitNewMessage(conv.user_id, { conversationId: conv.id, message: saved });
    res.status(201).json(saved);
  } catch (err) { fail(res, err); }
});

export default router;
