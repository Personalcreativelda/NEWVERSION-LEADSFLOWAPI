// /api/whatsapp-calls — agentes de voz que atendem as chamadas do WhatsApp Business
//   GET    /              disponível?, números WhatsApp Business, agentes da conta, últimas chamadas, limite do plano
//   GET    /voices        vozes que se podem escolher
//   POST   /avatar        foto do agente (multipart "avatar") → { url }
//   POST   /agents        criar agente { name, instructions, greeting, voice_id, language }
//   PUT    /agents/:id    editar agente
//   DELETE /agents/:id    apagar agente (desliga-o dos números que o usavam)
//   POST   /outbound      o agente liga a um cliente { channel_id, voice_agent_id, to, greeting, purpose? }
//   GET    /permission    ?channel_id=&to= — o cliente autorizou chamadas?
//   POST   /permission    { channel_id, to, text? } — pede autorização por mensagem
//   GET    /calls/:id/audio  gravação da chamada (MP3, as duas vozes)
//   PUT    /:channelId    { enabled, voice_agent_id } — liga/desliga as chamadas no número (Meta) e guarda a escolha
//
// Os agentes criados aqui vivem na conta ElevenLabs da plataforma (call_config.managed): o cliente não
// configura chaves e só vê os seus (voice_agents.user_id).
import { Router } from 'express';
import { Readable } from 'stream';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.middleware';
import { query } from '../database/connection';
import { getUserProfile } from '../services/users.service';
import {
  AGENT_PROMPT_VERSION, LANGUAGES, ManagedAgentInput, WhatsAppCallError, bridgeConfigured, callRecording, callsEnabled, createManagedAgent,
  deleteManagedAgent, listVoices, setNumberCalling, updateManagedAgent,
} from '../services/whatsapp-calls.service';
import { whatsappCallsService } from '../services/whatsapp-calls.service';
import { voiceUsage } from '../services/voice-usage.service';
import { TOOL_GROUPS } from '../services/voice-tools.service';
import { getStorageService } from '../services/storage.service';
import { publicFileUrl } from '../utils/storage-urls';

const router = Router();
const avatarUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });
router.use(requireAuth);

const parse = (v: any) => (typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch { return {}; } })() : v || {});

const fail = (res: any, err: any, where: string) => {
  const status = err instanceof WhatsAppCallError ? err.status : 500;
  console.error(`[WhatsAppCalls] ${where}:`, err?.message);
  res.status(status).json({
    error: status === 500 ? 'Não foi possível concluir' : err.message,
    ...(err?.code ? { code: err.code } : {}),
    ...(err?.can_request !== undefined ? { can_request: !!err.can_request } : {}),
    ...(err?.channel_id ? { channel_id: String(err.channel_id) } : {}),
    ...(err?.to ? { to: String(err.to) } : {}),
  });
};

function readAgent(body: any): { error: string } | ManagedAgentInput {
  const name = String(body?.name || '').trim();
  const instructions = String(body?.instructions || '').trim();
  const greeting = String(body?.greeting || '').trim();
  const voice_id = String(body?.voice_id || '').trim();
  const language = String(body?.language || 'pt');
  if (!name) return { error: 'Escreva o nome' };
  if (!instructions) return { error: 'Escreva as instruções' };
  if (!greeting) return { error: 'Escreva a primeira frase' };
  if (!voice_id) return { error: 'Escolha a voz' };
  if (!(LANGUAGES as readonly string[]).includes(language)) return { error: 'Idioma inválido' };
  if (instructions.length > 8000 || greeting.length > 500 || name.length > 100) return { error: 'Texto demasiado longo' };
  // Modelos prontos trazem campos como [nome da empresa]: o agente lê-los-ia em voz alta
  if (/\[[^\]]{2,60}\]/.test(`${greeting}\n${instructions}`)) return { error: 'Substitua os campos entre [ ] pelos dados da sua empresa' };
  const tools = Array.isArray(body?.tools)
    ? [...new Set(body.tools.map(String).filter((g: string) => g in TOOL_GROUPS))] as string[]
    : undefined;
  return { name, instructions, greeting, voice_id, language, tools };
}

/** Agenda do agente (mesmas chaves que agendaOptions lê nos assistentes) */
function readAgenda(raw: any) {
  const hhmm = (v: any, d: string) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '')) ? String(v) : d);
  const days = Array.isArray(raw?.business_days)
    ? [...new Set(raw.business_days.map(Number).filter((d: number) => Number.isInteger(d) && d >= 0 && d <= 6))]
    : [1, 2, 3, 4, 5, 6];
  const start = hhmm(raw?.business_hours_start, '09:00');
  const end = hhmm(raw?.business_hours_end, '18:00');
  return {
    business_days: days.length ? days : [1, 2, 3, 4, 5, 6],
    business_hours_start: start,
    business_hours_end: end > start ? end : '18:00',
    appointment_minutes: Math.min(Math.max(Number(raw?.appointment_minutes) || 60, 15), 240),
  };
}

// Agentes prontos pagos: o plano mínimo de cada um (o painel mostra-os com cadeado)
const TEMPLATE_PLAN: Record<string, 'business' | 'enterprise'> = {
  rececao: 'business', marcacoes: 'business', apoio: 'business', vendas: 'enterprise', encomendas: 'enterprise',
};
const PLAN_RANK: Record<string, number> = { free: 0, business: 1, enterprise: 2 };
const planAllows = (plan: string | undefined, needed: string) => (PLAN_RANK[String(plan || 'free')] ?? 0) >= (PLAN_RANK[needed] ?? 1);

/** Extras guardados em call_config: agenda, ações, foto e o modelo de origem */
function agentExtras(body: any, input: ManagedAgentInput) {
  const avatar = String(body?.avatar_url || '').trim();
  return {
    agenda: readAgenda(body?.agenda),
    ...(input.tools ? { tools: input.tools } : {}),
    avatar_url: avatar && avatar.length < 1000 && /^(https?:\/\/|\/api\/files\/)/.test(avatar) ? avatar : null,
    ...(body?.template_id && TEMPLATE_PLAN[String(body.template_id)] ? { template_id: String(body.template_id) } : {}),
  };
}

router.get('/', async (req: any, res) => {
  try {
    const userId = req.user.id;
    const [channels, agents, calls, profile, usage] = await Promise.all([
      query(
        `SELECT id, name, settings, credentials->>'display_phone_number' AS phone
           FROM channels WHERE user_id = $1 AND type = 'whatsapp_cloud' AND status = 'active' ORDER BY created_at`,
        [userId],
      ),
      query(
        `SELECT id, name, instructions, greeting_message, language, voice_config, call_config
           FROM voice_agents WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId],
      ),
      query(
        `SELECT c.id, c.phone_number, c.status, c.duration_seconds, c.transcript, c.started_at, c.ended_at,
                c.metadata->>'caller_name' AS caller_name, c.lead_id, a.name AS agent_name, c.direction,
                c.metadata->>'reject_reason' AS reject_reason, c.metadata->>'purpose' AS purpose,
                (c.voice_provider_id IS NOT NULL AND COALESCE(c.metadata->>'has_audio', 'true') <> 'false') AS has_audio
           FROM voice_agent_calls c LEFT JOIN voice_agents a ON a.id = c.voice_agent_id
          WHERE c.user_id = $1 AND c.metadata->>'source' = 'whatsapp_call'
          ORDER BY c.created_at DESC LIMIT 50`,
        [userId],
      ),
      getUserProfile(userId).catch(() => null),
      voiceUsage(userId).catch(() => null),
    ]);
    res.json({
      available: callsEnabled() && bridgeConfigured() && !!process.env.ELEVENLABS_API_KEY,
      limit: profile?.limits?.voiceAgents ?? 0,
      plan: String(profile?.plan || 'free'),
      // Agentes prontos: plano mínimo de cada um (os outros aparecem com cadeado)
      template_plans: TEMPLATE_PLAN,
      channels: channels.rows.map((c: any) => {
        const cfg = parse(c.settings).whatsapp_calls || {};
        return { id: c.id, name: c.name, phone: c.phone, enabled: !!cfg.enabled, voice_agent_id: cfg.voice_agent_id || null };
      }),
      agents: agents.rows.map((a: any) => {
        const call = parse(a.call_config);
        return {
          id: a.id,
          name: a.name,
          instructions: a.instructions || '',
          greeting: a.greeting_message || '',
          language: String(a.language || 'pt').slice(0, 2),
          voice_id: parse(a.voice_config).voice_id || '',
          ready: !!call.elevenlabs_agent_id,
          managed: !!call.managed,
          agenda: readAgenda(call.agenda),
          tools: Array.isArray(call.tools) ? call.tools : Object.keys(TOOL_GROUPS),
          avatar_url: call.avatar_url || null,
          template_id: call.template_id || null,
        };
      }),
      calls: calls.rows,
      usage,
    });
  } catch (err: any) {
    fail(res, err, 'GET');
  }
});

// O agente liga a um cliente { channel_id, voice_agent_id, to, greeting, purpose? }
router.post('/outbound', async (req: any, res) => {
  try {
    const b = req.body || {};
    res.status(201).json(await whatsappCallsService.startOutbound(req.user.id, {
      channel_id: String(b.channel_id || ''), voice_agent_id: String(b.voice_agent_id || ''),
      to: String(b.to || ''), greeting: String(b.greeting || ''), purpose: b.purpose ? String(b.purpose) : undefined,
    }));
  } catch (err: any) {
    fail(res, err, 'ligar');
  }
});

// Autorização do cliente para receber chamadas (?channel_id=&to=)
router.get('/permission', async (req: any, res) => {
  try {
    res.json(await whatsappCallsService.permissionForUser(req.user.id, String(req.query.channel_id || ''), String(req.query.to || '')));
  } catch (err: any) {
    fail(res, err, 'autorização');
  }
});

// Pedir autorização { channel_id, to, text? } (mensagem do WhatsApp; janela de 24 horas aberta)
router.post('/permission', async (req: any, res) => {
  try {
    const b = req.body || {};
    res.json(await whatsappCallsService.requestPermission(req.user.id, String(b.channel_id || ''), String(b.to || ''), b.text ? String(b.text) : undefined));
  } catch (err: any) {
    fail(res, err, 'pedir autorização');
  }
});

router.get('/calls/:id/audio', async (req: any, res) => {
  try {
    const audio = await callRecording(req.user.id, String(req.params.id));
    if (!audio) return res.status(404).json({ error: 'Esta chamada não tem gravação' });
    res.setHeader('Content-Type', audio.headers.get('content-type') || 'audio/mpeg');
    const len = audio.headers.get('content-length');
    if (len) res.setHeader('Content-Length', len);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    Readable.fromWeb(audio.body as any).pipe(res);
  } catch (err: any) {
    fail(res, err, 'GET audio');
  }
});

// Foto do agente (imagem até 2 MB) → URL para guardar com o agente
router.post('/avatar', avatarUpload.single('avatar'), async (req: any, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Escolha uma imagem' });
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.mimetype)) return res.status(400).json({ error: 'Use uma imagem PNG, JPG ou WebP' });
    const url = await getStorageService().uploadFile(file, 'avatars', req.user.id);
    res.json({ url: publicFileUrl(url) });
  } catch (err: any) {
    fail(res, err, 'foto');
  }
});

router.get('/voices', async (_req, res) => {
  try {
    res.json({ voices: await listVoices() });
  } catch (err: any) {
    fail(res, err, 'vozes');
  }
});

router.post('/agents', async (req: any, res) => {
  try {
    const userId = req.user.id;
    const input = readAgent(req.body);
    if ('error' in input) return res.status(400).json(input);

    const profile = await getUserProfile(userId).catch(() => null);
    const limit = Number(profile?.limits?.voiceAgents ?? 0);
    if (limit !== -1) {
      const count = Number((await query('SELECT COUNT(*) AS n FROM voice_agents WHERE user_id = $1', [userId])).rows[0]?.n || 0);
      if (count >= limit) {
        return res.status(403).json({ error: limit === 0 ? 'O seu plano não inclui agentes de voz' : 'Chegou ao limite de agentes do seu plano', code: 'PLAN' });
      }
    }
    const extras = agentExtras(req.body, input);
    const needed = extras.template_id ? TEMPLATE_PLAN[extras.template_id] : null;
    if (needed && !planAllows(profile?.plan, needed)) {
      return res.status(403).json({ error: `Este agente pronto é do plano ${needed === 'enterprise' ? 'Enterprise' : 'Business'}`, code: 'PLAN' });
    }

    const agentId = await createManagedAgent(input);
    try {
      const row = (await query(
        `INSERT INTO voice_agents (user_id, name, voice_provider, voice_config, call_provider, call_config,
                                   greeting_message, instructions, language, is_active)
         VALUES ($1, $2, 'elevenlabs', $3, 'whatsapp', $4, $5, $6, $7, true) RETURNING id`,
        [userId, input.name, JSON.stringify({ voice_id: input.voice_id }),
          JSON.stringify({ elevenlabs_agent_id: agentId, managed: true, prompt_v: AGENT_PROMPT_VERSION, ...extras }), input.greeting, input.instructions, input.language],
      )).rows[0];
      res.status(201).json({ id: row.id });
    } catch (err) {
      await deleteManagedAgent(agentId); // não deixa agentes órfãos na conta da plataforma
      throw err;
    }
  } catch (err: any) {
    fail(res, err, 'criar agente');
  }
});

router.put('/agents/:id', async (req: any, res) => {
  try {
    const userId = req.user.id;
    const input = readAgent(req.body);
    if ('error' in input) return res.status(400).json(input);
    const agent = (await query('SELECT * FROM voice_agents WHERE id = $1 AND user_id = $2', [req.params.id, userId])).rows[0];
    if (!agent) return res.status(404).json({ error: 'Agente não encontrado' });

    const call = parse(agent.call_config);
    if (!input.tools && Array.isArray(call.tools)) input.tools = call.tools; // sem escolha mantém as ações
    const extras = { ...agentExtras(req.body, input), template_id: call.template_id || null };
    let agentId = call.managed ? call.elevenlabs_agent_id : null;
    if (agentId) await updateManagedAgent(agentId, input);
    else agentId = await createManagedAgent(input); // agente antigo (da conta do cliente) passa a ser gerido aqui

    await query(
      `UPDATE voice_agents SET name = $3, voice_config = COALESCE(voice_config, '{}'::jsonb) || $4::jsonb,
              call_config = COALESCE(call_config, '{}'::jsonb) || $5::jsonb,
              greeting_message = $6, instructions = $7, language = $8, updated_at = NOW()
        WHERE id = $1 AND user_id = $2`,
      [agent.id, userId, input.name, JSON.stringify({ voice_id: input.voice_id }),
        JSON.stringify({ elevenlabs_agent_id: agentId, managed: true, prompt_v: AGENT_PROMPT_VERSION, ...extras }), input.greeting, input.instructions, input.language],
    );
    res.json({ ok: true });
  } catch (err: any) {
    fail(res, err, 'editar agente');
  }
});

router.delete('/agents/:id', async (req: any, res) => {
  try {
    const userId = req.user.id;
    const agent = (await query('SELECT * FROM voice_agents WHERE id = $1 AND user_id = $2', [req.params.id, userId])).rows[0];
    if (!agent) return res.status(404).json({ error: 'Agente não encontrado' });

    // Números que o usavam deixam de atender (e o ícone de chamada sai)
    const using = (await query(
      `SELECT * FROM channels WHERE user_id = $1 AND type = 'whatsapp_cloud' AND settings->'whatsapp_calls'->>'voice_agent_id' = $2`,
      [userId, agent.id],
    )).rows;
    for (const ch of using) {
      if (parse(ch.settings).whatsapp_calls?.enabled && ch.credentials?.phone_number_id && ch.credentials?.access_token) {
        await setNumberCalling(ch.credentials.phone_number_id, ch.credentials.access_token, false).catch(() => {});
      }
      await query(
        `UPDATE channels SET settings = COALESCE(settings, '{}'::jsonb) || '{"whatsapp_calls": {"enabled": false, "voice_agent_id": null}}'::jsonb WHERE id = $1`,
        [ch.id],
      );
    }

    await query('DELETE FROM voice_agents WHERE id = $1 AND user_id = $2', [agent.id, userId]);
    const call = parse(agent.call_config);
    if (call.managed && call.elevenlabs_agent_id) await deleteManagedAgent(call.elevenlabs_agent_id);
    res.json({ ok: true });
  } catch (err: any) {
    fail(res, err, 'apagar agente');
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

    if (voiceAgentId) {
      const agent = (await query(
        `SELECT call_config->>'elevenlabs_agent_id' AS el FROM voice_agents WHERE id = $1 AND user_id = $2`,
        [voiceAgentId, userId],
      )).rows[0];
      if (!agent) return res.status(404).json({ error: 'Agente não encontrado' });
      if (enabled && !agent.el) return res.status(400).json({ error: 'Este agente ainda não está pronto para chamadas' });
    }
    if (enabled && !voiceAgentId) return res.status(400).json({ error: 'Escolha o agente' });

    const wasEnabled = !!parse(ch.settings).whatsapp_calls?.enabled;
    if (enabled || enabled !== wasEnabled) {
      const phoneId = ch.credentials?.phone_number_id;
      const token = ch.credentials?.access_token;
      if (!phoneId || !token) return res.status(400).json({ error: 'Volte a ligar este número' });
      await setNumberCalling(phoneId, token, enabled);
    }

    await query(
      `UPDATE channels SET settings = COALESCE(settings, '{}'::jsonb) || $2::jsonb WHERE id = $1`,
      [ch.id, JSON.stringify({ whatsapp_calls: { enabled, voice_agent_id: voiceAgentId } })],
    );
    res.json({ ok: true, enabled, voice_agent_id: voiceAgentId });
  } catch (err: any) {
    fail(res, err, 'número');
  }
});

export default router;
