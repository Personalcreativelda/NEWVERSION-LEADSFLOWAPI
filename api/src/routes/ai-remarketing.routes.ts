import { Router } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.middleware';
import { query } from '../database/connection';
import { WhatsAppService } from '../services/whatsapp.service';
import { ChannelsService } from '../services/channels.service';
import { ConversationsService } from '../services/conversations.service';
import { MessagesService } from '../services/messages.service';
import { FlowExecutionService } from '../services/flow-execution.service';

const whatsappService = new WhatsAppService();
const channelsService = new ChannelsService();
const conversationsService = new ConversationsService();
const messagesService = new MessagesService();
const flowExecutionService = new FlowExecutionService();

const router = Router();
router.use(authMiddleware);

// ─── Scoring helpers ──────────────────────────────────────────────────────────

const STATUS_SCORE: Record<string, number> = {
  novo: 10,
  contatado: 30,
  qualificado: 60,
  negociacao: 80,
  convertido: 100,
  perdido: 0,
};

const STATUS_CONV_PROB: Record<string, number> = {
  novo: 5,
  contatado: 20,
  qualificado: 45,
  negociacao: 70,
  convertido: 100,
  perdido: 0,
};

function daysSince(date: Date | null | undefined): number {
  if (!date) return 999;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
}

function scoreOneLead(lead: any): {
  engagement_score: number;
  conversion_probability: number;
  intent: string;
  risk_level: string;
  next_best_action: string;
  recommended_channel: string;
  best_contact_time: string;
  ai_notes: string;
} {
  const status = (lead.status || 'novo').toLowerCase();
  const days = daysSince(lead.last_contact_at);

  // ─ Engagement score ─────────────────────────────────────────────────────
  const statusBase = (STATUS_SCORE[status] ?? 10) * 0.55;
  const recency =
    days < 1  ? 30 :
    days < 3  ? 22 :
    days < 7  ? 12 :
    days < 14 ?  5 : 0;
  const valuePts = lead.deal_value > 0 ? 10 : 0;
  const tagPts   = Math.min((lead.tags?.length ?? 0) * 2, 8);
  const contactPts =
    (lead.whatsapp || lead.phone ? 4 : 0) +
    (lead.email                  ? 3 : 0);

  const engagement_score = Math.min(
    100,
    Math.round(statusBase + recency + valuePts + tagPts + contactPts),
  );

  // ─ Conversion probability ────────────────────────────────────────────────
  const convBase = STATUS_CONV_PROB[status] ?? 5;
  const conversion_probability = Math.min(
    100,
    Math.round(convBase * 0.7 + engagement_score * 0.3),
  );

  // ─ Intent ────────────────────────────────────────────────────────────────
  let intent =
    conversion_probability >= 65 ? 'buy'    :
    days > 21                    ? 'ignore' :
    days > 7                     ? 'delay'  : 'buy';

  if (status === 'perdido') intent = 'ignore';

  // ─ Risk level ────────────────────────────────────────────────────────────
  const risk_level =
    (status === 'convertido' || status === 'perdido') ? 'low' :
    days > 14 ? 'high' :
    days >  7 ? 'medium' : 'low';

  // ─ Next best action ───────────────────────────────────────────────────────
  let next_best_action = '';
  if (status === 'perdido')      next_best_action = 'Enviar campanha de recuperação';
  else if (days > 14)            next_best_action = 'Reengajar com oferta especial urgente';
  else if (days > 7)             next_best_action = 'Enviar follow-up personalizado';
  else if (status === 'novo')    next_best_action = 'Realizar primeiro contato hoje';
  else if (status === 'contatado') next_best_action = 'Agendar demonstração ou qualificação';
  else if (status === 'qualificado') next_best_action = 'Enviar proposta comercial';
  else if (status === 'negociacao')  next_best_action = 'Criar senso de urgência e fechar';
  else if (status === 'convertido')  next_best_action = 'Iniciar onboarding / upsell';
  else next_best_action = 'Revisar perfil e planejar abordagem';

  // ─ Recommended channel ────────────────────────────────────────────────────
  const recommended_channel =
    lead.whatsapp || lead.phone ? 'whatsapp' : lead.email ? 'email' : 'whatsapp';

  // ─ Best contact time ─────────────────────────────────────────────────────
  const best_contact_time =
    status === 'negociacao' ? 'Manhã (9h–11h) — período decisório' :
    status === 'novo'       ? 'Tarde (14h–17h) — horário de triagem' :
                              'Manhã (10h–12h) — pico de engajamento';

  // ─ AI notes ──────────────────────────────────────────────────────────────
  const ai_notes =
    `Score: ${engagement_score}/100 | Conversão: ${conversion_probability}% | ` +
    `Último contato: ${days > 998 ? 'nunca' : `há ${days}d`} | Status: ${status}`;

  return {
    engagement_score,
    conversion_probability,
    intent,
    risk_level,
    next_best_action,
    recommended_channel,
    best_contact_time,
    ai_notes,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ai-remarketing/analyze
// Score all leads for the current user and upsert into lead_ai_scores
// ─────────────────────────────────────────────────────────────────────────────
router.post('/analyze', async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user!.id;

    // Ensure table exists (runs migration inline so it's idempotent)
    await query(`
      CREATE TABLE IF NOT EXISTS lead_ai_scores (
        id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lead_id                UUID REFERENCES leads(id) ON DELETE CASCADE,
        user_id                UUID REFERENCES users(id) ON DELETE CASCADE,
        engagement_score       INTEGER DEFAULT 0,
        conversion_probability INTEGER DEFAULT 0,
        intent                 VARCHAR(20) DEFAULT 'unknown',
        risk_level             VARCHAR(10) DEFAULT 'low',
        next_best_action       TEXT,
        recommended_channel    VARCHAR(20) DEFAULT 'whatsapp',
        best_contact_time      VARCHAR(50),
        ai_notes               TEXT,
        last_analyzed_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at             TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at             TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(lead_id, user_id)
      )
    `);

    const leadsResult = await query(
      `SELECT id, name, status, score, tags, deal_value, phone, whatsapp, email, last_contact_at
       FROM leads WHERE user_id = $1 AND status != 'perdido' OR (status = 'perdido' AND last_contact_at > NOW() - INTERVAL '30 days')`,
      [userId],
    );

    const leads = leadsResult.rows;
    if (leads.length === 0) {
      return res.json({ success: true, analyzed: 0 });
    }

    let analyzed = 0;
    for (const lead of leads) {
      const s = scoreOneLead(lead);
      await query(
        `INSERT INTO lead_ai_scores
           (lead_id, user_id, engagement_score, conversion_probability, intent, risk_level,
            next_best_action, recommended_channel, best_contact_time, ai_notes, last_analyzed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, NOW())
         ON CONFLICT (lead_id, user_id) DO UPDATE SET
           engagement_score       = EXCLUDED.engagement_score,
           conversion_probability = EXCLUDED.conversion_probability,
           intent                 = EXCLUDED.intent,
           risk_level             = EXCLUDED.risk_level,
           next_best_action       = EXCLUDED.next_best_action,
           recommended_channel    = EXCLUDED.recommended_channel,
           best_contact_time      = EXCLUDED.best_contact_time,
           ai_notes               = EXCLUDED.ai_notes,
           last_analyzed_at       = NOW(),
           updated_at             = NOW()`,
        [
          lead.id, userId,
          s.engagement_score, s.conversion_probability,
          s.intent, s.risk_level,
          s.next_best_action, s.recommended_channel,
          s.best_contact_time, s.ai_notes,
        ],
      );
      analyzed++;

      // 🔥 Fire lead_score trigger flows when score is significant (≥ 20 to avoid noise)
      if (s.engagement_score >= 20) {
        flowExecutionService.triggerFlowsForLead(userId, lead.id, 'lead_score', String(s.engagement_score))
          .catch(err => console.error('[AIAnalyze] lead_score trigger error:', (err as any).message));
      }
    }

    res.json({ success: true, analyzed });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ai-remarketing/insights
// Returns hot leads, at-risk leads, recommended actions, and summary stats
// ─────────────────────────────────────────────────────────────────────────────
router.get('/insights', async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user!.id;

    // Ensure table exists
    await query(`
      CREATE TABLE IF NOT EXISTS lead_ai_scores (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        engagement_score INTEGER DEFAULT 0,
        conversion_probability INTEGER DEFAULT 0,
        intent VARCHAR(20) DEFAULT 'unknown',
        risk_level VARCHAR(10) DEFAULT 'low',
        next_best_action TEXT,
        recommended_channel VARCHAR(20) DEFAULT 'whatsapp',
        best_contact_time VARCHAR(50),
        ai_notes TEXT,
        last_analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(lead_id, user_id)
      )
    `);

    // Check if we have scores; if not, do an inline analysis first
    const countResult = await query(
      'SELECT COUNT(*) as cnt FROM lead_ai_scores WHERE user_id = $1',
      [userId],
    );
    if (parseInt(countResult.rows[0]?.cnt ?? '0') === 0) {
      // Trigger inline analysis (same logic as POST /analyze)
      const leadsResult = await query(
        `SELECT id, name, status, score, tags, deal_value, phone, whatsapp, email, last_contact_at
         FROM leads WHERE user_id = $1`,
        [userId],
      );
      for (const lead of leadsResult.rows) {
        const s = scoreOneLead(lead);
        await query(
          `INSERT INTO lead_ai_scores
             (lead_id, user_id, engagement_score, conversion_probability, intent, risk_level,
              next_best_action, recommended_channel, best_contact_time, ai_notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (lead_id, user_id) DO NOTHING`,
          [lead.id, userId, s.engagement_score, s.conversion_probability,
           s.intent, s.risk_level, s.next_best_action, s.recommended_channel,
           s.best_contact_time, s.ai_notes],
        );
      }
    }

    // ── Hot Leads: high score + active status ──────────────────────────────
    const hotResult = await query(
      `SELECT l.id, l.name, l.email, l.phone, l.whatsapp, l.status, l.deal_value, l.last_contact_at,
              s.engagement_score, s.conversion_probability, s.intent, s.next_best_action,
              s.recommended_channel, s.best_contact_time
       FROM leads l
       JOIN lead_ai_scores s ON s.lead_id = l.id AND s.user_id = l.user_id
       WHERE l.user_id = $1
         AND s.engagement_score >= 60
         AND l.status NOT IN ('perdido', 'convertido')
       ORDER BY s.engagement_score DESC, s.conversion_probability DESC
       LIMIT 8`,
      [userId],
    );

    // ── At-Risk Leads: high risk or long inactivity ────────────────────────
    const riskResult = await query(
      `SELECT l.id, l.name, l.email, l.phone, l.whatsapp, l.status, l.deal_value, l.last_contact_at,
              s.engagement_score, s.conversion_probability, s.risk_level, s.next_best_action,
              s.recommended_channel
       FROM leads l
       JOIN lead_ai_scores s ON s.lead_id = l.id AND s.user_id = l.user_id
       WHERE l.user_id = $1
         AND s.risk_level IN ('medium', 'high')
         AND l.status NOT IN ('perdido', 'convertido')
       ORDER BY s.risk_level DESC, s.engagement_score DESC
       LIMIT 8`,
      [userId],
    );

    // ── Recommended Actions: top priority next actions ─────────────────────
    const actionsResult = await query(
      `SELECT l.id, l.name, l.status, l.deal_value, l.last_contact_at,
              s.next_best_action, s.recommended_channel, s.best_contact_time,
              s.engagement_score, s.conversion_probability, s.intent
       FROM leads l
       JOIN lead_ai_scores s ON s.lead_id = l.id AND s.user_id = l.user_id
       WHERE l.user_id = $1
         AND l.status NOT IN ('perdido', 'convertido')
         AND s.next_best_action IS NOT NULL
       ORDER BY s.conversion_probability DESC, s.engagement_score DESC
       LIMIT 6`,
      [userId],
    );

    // ── Summary stats ──────────────────────────────────────────────────────
    const statsResult = await query(
      `SELECT
         COUNT(*) FILTER (WHERE s.engagement_score >= 60 AND l.status NOT IN ('perdido','convertido')) AS hot_count,
         COUNT(*) FILTER (WHERE s.risk_level = 'high' AND l.status NOT IN ('perdido','convertido'))    AS high_risk_count,
         COUNT(*) FILTER (WHERE s.risk_level = 'medium' AND l.status NOT IN ('perdido','convertido'))  AS medium_risk_count,
         ROUND(AVG(s.engagement_score))      AS avg_engagement,
         ROUND(AVG(s.conversion_probability)) AS avg_conversion,
         COUNT(*) FILTER (WHERE l.status NOT IN ('perdido','convertido')) AS active_leads
       FROM leads l
       JOIN lead_ai_scores s ON s.lead_id = l.id AND s.user_id = l.user_id
       WHERE l.user_id = $1`,
      [userId],
    );

    res.json({
      success: true,
      hotLeads: hotResult.rows,
      atRiskLeads: riskResult.rows,
      recommendedActions: actionsResult.rows,
      stats: statsResult.rows[0] || {},
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ai-remarketing/lead/:leadId/score
// ─────────────────────────────────────────────────────────────────────────────
router.get('/lead/:leadId/score', async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const { leadId } = req.params;

    const result = await query(
      `SELECT s.*, l.name, l.status, l.last_contact_at
       FROM lead_ai_scores s
       JOIN leads l ON l.id = s.lead_id
       WHERE s.lead_id = $1 AND s.user_id = $2`,
      [leadId, userId],
    );

    if (!result.rows[0]) {
      // Score on demand
      const leadRes = await query(
        'SELECT * FROM leads WHERE id = $1 AND user_id = $2',
        [leadId, userId],
      );
      if (!leadRes.rows[0]) return res.status(404).json({ error: 'Lead not found' });
      const s = scoreOneLead(leadRes.rows[0]);
      return res.json({ success: true, score: s });
    }

    res.json({ success: true, score: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ai-remarketing/generate-message
// Uses OpenAI (user's stored key) to generate context-aware message suggestions
// ─────────────────────────────────────────────────────────────────────────────
router.post('/generate-message', async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const { leadId, tone = 'friendly', goal = 'follow-up', channel = 'whatsapp' } = req.body;

    if (!leadId) return res.status(400).json({ error: 'leadId is required' });

    // Fetch lead + user's OpenAI key
    const [leadRes, userRes] = await Promise.all([
      query(
        `SELECT l.*, s.engagement_score, s.conversion_probability, s.intent, s.next_best_action
         FROM leads l
         LEFT JOIN lead_ai_scores s ON s.lead_id = l.id AND s.user_id = l.user_id
         WHERE l.id = $1 AND l.user_id = $2`,
        [leadId, userId],
      ),
      query('SELECT openai_api_key FROM users WHERE id = $1', [userId]),
    ]);

    const lead = leadRes.rows[0];
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const openaiKey = userRes.rows[0]?.openai_api_key;

    const days = daysSince(lead.last_contact_at);
    const context = [
      `Nome: ${lead.name || 'Lead'}`,
      `Status no funil: ${lead.status || 'novo'}`,
      `Último contato: ${days > 998 ? 'nunca' : `há ${days} dias`}`,
      lead.deal_value ? `Valor do negócio: R$ ${lead.deal_value}` : null,
      lead.company   ? `Empresa: ${lead.company}` : null,
      lead.intent    ? `Intenção detectada pela IA: ${lead.intent}` : null,
    ].filter(Boolean).join('\n');

    // If no OpenAI key, return rule-based suggestions
    if (!openaiKey) {
      const suggestions = generateRuleBasedMessages(lead, tone, goal, channel);
      return res.json({ success: true, suggestions, powered_by: 'rules' });
    }

    // Use OpenAI
    const prompt = `Você é um especialista em vendas B2C/B2B no Brasil. Gere 3 mensagens de ${channel === 'whatsapp' ? 'WhatsApp' : 'email'} diferentes para o seguinte lead:

${context}

Tom: ${tone === 'friendly' ? 'amigável e próximo' : tone === 'formal' ? 'profissional e formal' : 'urgente e direto'}
Objetivo: ${goal === 'follow-up' ? 'fazer follow-up e manter o interesse' : goal === 'close' ? 'fechar a venda' : goal === 'recover' ? 'recuperar lead inativo' : 'qualificar interesse'}
Canal: ${channel}

Responda APENAS com um JSON no formato:
{"suggestions": ["mensagem 1", "mensagem 2", "mensagem 3"]}

As mensagens devem ser naturais, curtas (máx 3 parágrafos), personalizadas pelo nome e contexto.`;

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 600,
        response_format: { type: 'json_object' },
      }),
    });

    if (!openaiRes.ok) {
      // Fallback to rule-based
      const suggestions = generateRuleBasedMessages(lead, tone, goal, channel);
      return res.json({ success: true, suggestions, powered_by: 'rules' });
    }

    const openaiData = await openaiRes.json() as any;
    const content = openaiData.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content || '{}');

    res.json({
      success: true,
      suggestions: parsed.suggestions || generateRuleBasedMessages(lead, tone, goal, channel),
      powered_by: 'openai',
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper: rule-based message generation (no OpenAI needed)
// ─────────────────────────────────────────────────────────────────────────────
function generateRuleBasedMessages(lead: any, tone: string, goal: string, channel: string): string[] {
  const name = lead.name?.split(' ')[0] || 'olá';
  const days = daysSince(lead.last_contact_at);

  if (goal === 'recover' || days > 7) {
    return [
      `Oi ${name}! Tudo bem? Notei que faz um tempo que não conversamos. Tenho algumas novidades que podem te interessar. Podemos bater um papo rápido?`,
      `${name}, vi que você estava interessado(a) em nossa solução. Preparei algo especial pra você — posso compartilhar?`,
      `Oi ${name}! Queria saber como você está. Tenho uma oferta exclusiva disponível por tempo limitado. Vale a pena dar uma olhada!`,
    ];
  }
  if (goal === 'close' || lead.status === 'negociacao') {
    return [
      `${name}, chegou o momento ideal para fecharmos! Nossa proposta ainda está disponível e posso garantir as condições que conversamos. O que acha de confirmarmos hoje?`,
      `Oi ${name}! Queria dar um último aviso: a oferta que conversamos vence em breve. Quer aproveitar agora?`,
      `${name}, estou reservando sua vaga. Só preciso da sua confirmação. Posso processar hoje?`,
    ];
  }
  if (lead.status === 'qualificado') {
    return [
      `Oi ${name}! Preparei uma proposta personalizada pra você com base no que conversamos. Posso enviar?`,
      `${name}, com base no seu perfil, tenho a solução perfeita. Quando podemos conversar 15 minutos?`,
      `Oi ${name}! Que tal agendar uma demonstração rápida? Tenho horários disponíveis essa semana.`,
    ];
  }
  return [
    `Oi ${name}! Tudo bem? Passando para saber se posso te ajudar com alguma coisa hoje.`,
    `${name}, como estão as coisas? Tenho algumas novidades que podem ser relevantes pra você.`,
    `Oi ${name}! Vi que você entrou em contato conosco. Posso te ajudar com alguma dúvida?`,
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ai-remarketing/send-message
// Send an AI-generated message to a lead via the specified channel
// ─────────────────────────────────────────────────────────────────────────────
router.post('/send-message', async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const { leadId, content, channel = 'whatsapp' } = req.body;

    if (!leadId || !content) {
      return res.status(400).json({ error: 'leadId and content are required' });
    }

    // Fetch lead to verify ownership and get contact details
    const leadResult = await query(
      'SELECT id, name, email, phone, whatsapp FROM leads WHERE id = $1 AND user_id = $2',
      [leadId, userId],
    );

    if (!leadResult.rows[0]) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const lead = leadResult.rows[0];

    // Determine the contact number (phone is fallback for whatsapp)
    let contactTarget = '';
    if (channel === 'whatsapp') {
      contactTarget = lead.whatsapp || lead.phone || '';
    } else if (channel === 'sms') {
      contactTarget = lead.phone || '';
    } else if (channel === 'email') {
      contactTarget = lead.email || '';
    }

    if (!contactTarget) {
      return res.status(400).json({
        error: `Lead não possui contato válido para o canal ${channel}`,
      });
    }

    // Find user's connected WhatsApp channel
    let whatsappChannel: any = null;
    if (channel === 'whatsapp') {
      const whatsappChannels = await channelsService.findByType('whatsapp', userId);
      whatsappChannel = whatsappChannels.find(
        (c: any) => c.status === 'connected' || c.status === 'active',
      );

      if (!whatsappChannel) {
        const cloudChannels = await channelsService.findByType('whatsapp_cloud', userId);
        whatsappChannel = cloudChannels.find(
          (c: any) => c.status === 'connected' || c.status === 'active' || c.status === 'pending',
        );
      }

      if (!whatsappChannel) {
        return res.status(400).json({
          error: 'Nenhum canal WhatsApp ativo encontrado. Conecte o WhatsApp primeiro.',
        });
      }

      const instanceId =
        whatsappChannel.credentials?.instance_id ||
        whatsappChannel.credentials?.instance_name;

      if (!instanceId) {
        return res.status(400).json({ error: 'Canal WhatsApp não tem instância configurada' });
      }

      // Actually send via Evolution API
      await whatsappService.sendMessage({
        instanceId,
        number: contactTarget,
        text: content,
      });
    }

    // Build remoteJid for inbox
    const cleanPhone = contactTarget.replace(/\D/g, '');
    const remoteJid = contactTarget.includes('@')
      ? contactTarget
      : `${cleanPhone}@s.whatsapp.net`;

    // Find or create conversation so message appears in inbox
    let conversationId: string | null = null;
    if (whatsappChannel) {
      try {
        const conversation = await conversationsService.findOrCreate(
          userId,
          whatsappChannel.id,
          remoteJid,
          leadId,
          { contact_name: lead.name, phone: cleanPhone },
        );
        conversationId = conversation.id;
      } catch (convErr) {
        console.warn('[AI-Remarketing] Could not find/create conversation:', convErr);
      }
    }

    // Save message to inbox messages table so it appears in inbox
    let savedMessage: any = null;
    try {
      savedMessage = await messagesService.create(
        {
          conversation_id: conversationId,
          lead_id: leadId,
          direction: 'out',
          channel,
          content,
          status: 'sent',
          sent_at: new Date().toISOString(),
          metadata: { remote_jid: remoteJid, phone: cleanPhone, source: 'motor_de_vendas' },
        },
        userId,
      );
    } catch (msgErr) {
      console.warn('[AI-Remarketing] Could not save message to inbox:', msgErr);
    }

    // Update lead's last_contact_at
    await query('UPDATE leads SET last_contact_at = NOW() WHERE id = $1', [leadId]);

    res.json({
      success: true,
      messageId: savedMessage?.id,
      message: `Mensagem enviada para ${lead.name} via ${channel}`,
      sentAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
