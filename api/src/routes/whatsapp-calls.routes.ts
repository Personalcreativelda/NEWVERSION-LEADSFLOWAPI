// /api/whatsapp-calls — chamadas do WhatsApp Business atendidas por um agente de voz
//   GET  /             disponível?, números WhatsApp Business com a escolha atual, agentes de voz, últimas chamadas
//   PUT  /:channelId   { enabled, voice_agent_id } — liga/desliga as chamadas no número (Meta) e guarda a escolha
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { query } from '../database/connection';
import { bridgeConfigured, callsEnabled, setNumberCalling, WhatsAppCallError } from '../services/whatsapp-calls.service';

const router = Router();
router.use(requireAuth);

const parse = (v: any) => (typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch { return {}; } })() : v || {});

router.get('/', async (req: any, res) => {
  try {
    const userId = req.user.id;
    const available = callsEnabled() && bridgeConfigured();
    const [channels, agents, calls] = await Promise.all([
      query(
        `SELECT id, name, settings, credentials->>'display_phone_number' AS phone
           FROM channels WHERE user_id = $1 AND type = 'whatsapp_cloud' AND status = 'active' ORDER BY created_at`,
        [userId],
      ),
      query(
        `SELECT id, name, call_config->>'elevenlabs_agent_id' AS elevenlabs_agent_id
           FROM voice_agents WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId],
      ),
      query(
        `SELECT c.id, c.phone_number, c.status, c.duration_seconds, c.transcript, c.started_at, c.ended_at,
                c.metadata->>'caller_name' AS caller_name, c.lead_id, a.name AS agent_name
           FROM voice_agent_calls c LEFT JOIN voice_agents a ON a.id = c.voice_agent_id
          WHERE c.user_id = $1 AND c.metadata->>'source' = 'whatsapp_call'
          ORDER BY c.created_at DESC LIMIT 50`,
        [userId],
      ),
    ]);
    res.json({
      available,
      channels: channels.rows.map((c: any) => {
        const cfg = parse(c.settings).whatsapp_calls || {};
        return { id: c.id, name: c.name, phone: c.phone, enabled: !!cfg.enabled, voice_agent_id: cfg.voice_agent_id || null };
      }),
      agents: agents.rows.map((a: any) => ({ id: a.id, name: a.name, ready: !!a.elevenlabs_agent_id })),
      calls: calls.rows,
    });
  } catch (err: any) {
    console.error('[WhatsAppCalls] GET:', err?.message);
    res.status(500).json({ error: 'Não foi possível carregar as chamadas' });
  }
});

router.put('/:channelId', async (req: any, res) => {
  try {
    if (!callsEnabled() || !bridgeConfigured()) return res.status(403).json({ error: 'Ainda não disponível' });
    const userId = req.user.id;
    const enabled = !!req.body?.enabled;
    const voiceAgentId = req.body?.voice_agent_id ? String(req.body.voice_agent_id) : null;

    const ch = (await query(
      `SELECT * FROM channels WHERE id = $1 AND user_id = $2 AND type = 'whatsapp_cloud'`,
      [req.params.channelId, userId],
    )).rows[0];
    if (!ch) return res.status(404).json({ error: 'Número não encontrado' });

    if (enabled) {
      if (!voiceAgentId) return res.status(400).json({ error: 'Escolha o agente' });
      const agent = (await query(
        `SELECT call_config->>'elevenlabs_agent_id' AS el FROM voice_agents WHERE id = $1 AND user_id = $2`,
        [voiceAgentId, userId],
      )).rows[0];
      if (!agent) return res.status(404).json({ error: 'Agente não encontrado' });
      if (!agent.el) return res.status(400).json({ error: 'Este agente ainda não está pronto para chamadas' });
    }

    const phoneId = ch.credentials?.phone_number_id;
    const token = ch.credentials?.access_token;
    if (!phoneId || !token) return res.status(400).json({ error: 'Volte a ligar este número' });
    await setNumberCalling(phoneId, token, enabled);

    await query(
      `UPDATE channels SET settings = COALESCE(settings, '{}'::jsonb) || $2::jsonb WHERE id = $1`,
      [ch.id, JSON.stringify({ whatsapp_calls: { enabled, voice_agent_id: voiceAgentId } })],
    );
    res.json({ ok: true, enabled, voice_agent_id: voiceAgentId });
  } catch (err: any) {
    const status = err instanceof WhatsAppCallError ? err.status : 500;
    console.error('[WhatsAppCalls] PUT:', err?.message);
    res.status(status).json({ error: status === 500 ? 'Não foi possível guardar' : err.message });
  }
});

export default router;
