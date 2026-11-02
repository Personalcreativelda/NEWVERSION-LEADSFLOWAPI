import { Router } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.middleware';
import { query } from '../database/connection';
import { FlowExecutionService } from '../services/flow-execution.service';
import { reactivationDraft, salesOpportunities, sendToLead, suggestMessages } from '../services/sales-engine.service';
import { FlowSendError } from '../services/flow-send.service';

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

/** Dados reais de conversa do lead vindos do inbox */
interface ConvStats {
  channelType: string;   // whatsapp | facebook | telegram | instagram | email
  channelId: string;
  recipientId: string;   // remote_jid / PSID / chat_id / etc.
  totalMessages: number;
  inboundMessages: number;   // mensagens enviadas pelo lead
  outboundMessages: number;  // mensagens enviadas pela empresa
  daysSinceLastMsg: number;  // dias desde a última mensagem no inbox
  responseRate: number;      // 0-100: % de msgs inbound que receberam resposta
}

/** Mapeia o campo 'source' do lead para o canal de comunicação correto */
function mapSourceToChannel(source?: string | null): string | null {
  if (!source) return null;
  const s = source.toLowerCase();
  if (s.includes('facebook') || s.includes('fb') || s.includes('messenger')) return 'facebook';
  if (s.includes('instagram') || s.includes('ig_')) return 'instagram';
  if (s.includes('telegram')) return 'telegram';
  if (s.includes('whatsapp') || s.includes('wapp') || s === 'wa') return 'whatsapp';
  if (s.includes('email') || s.includes('mail')) return 'email';
  return null;
}

function daysSince(date: Date | null | undefined): number {
  if (!date) return 999;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
}

function scoreOneLead(lead: any, convStats?: ConvStats): {
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
  // Use inbox last message date if more recent than lead.last_contact_at
  const leadDays = daysSince(lead.last_contact_at);
  const days = convStats ? Math.min(leadDays, convStats.daysSinceLastMsg) : leadDays;

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

  // ─ Inbox activity bonus ──────────────────────────────────────────────────
  let inboxBonus = 0;
  if (convStats) {
    inboxBonus += 5; // tem conversa ativa
    if (convStats.totalMessages >= 20)     inboxBonus += 12;
    else if (convStats.totalMessages >= 10) inboxBonus += 8;
    else if (convStats.totalMessages >= 5)  inboxBonus += 4;
    if (convStats.inboundMessages > 0)      inboxBonus += 5; // lead enviou msgs
    if (convStats.responseRate >= 80)       inboxBonus += 6;
    else if (convStats.responseRate >= 50)  inboxBonus += 3;
    // Inbox mais recente que last_contact_at — recalcular bônus
    if (convStats.daysSinceLastMsg < leadDays) {
      const d = convStats.daysSinceLastMsg;
      const extraRecency = (d < 1 ? 30 : d < 3 ? 22 : d < 7 ? 12 : d < 14 ? 5 : 0) - recency;
      inboxBonus += Math.max(0, extraRecency);
    }
  }

  const engagement_score = Math.min(
    100,
    Math.round(statusBase + recency + valuePts + tagPts + contactPts + inboxBonus),
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

  // ─ Recommended channel — usar canal real da conversa > source do funil > telefone/email ────
  const recommended_channel =
    convStats?.channelType ||
    mapSourceToChannel(lead.source) ||
    (lead.whatsapp || lead.phone ? 'whatsapp' : lead.email ? 'email' : 'whatsapp');

  // ─ Best contact time ─────────────────────────────────────────────────────
  const best_contact_time =
    status === 'negociacao' ? 'Manhã (9h–11h) — período decisório' :
    status === 'novo'       ? 'Tarde (14h–17h) — horário de triagem' :
                              'Manhã (10h–12h) — pico de engajamento';

  // ─ AI notes ──────────────────────────────────────────────────────────────
  const ai_notes =
    `Score: ${engagement_score}/100 | Conversão: ${conversion_probability}% | ` +
    `Último contato: ${days > 998 ? 'nunca' : `há ${days}d`} | Status: ${status}` +
    (convStats ? ` | Canal: ${convStats.channelType} | Msgs: ${convStats.totalMessages}` : '');

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
      `SELECT id, name, status, score, tags, deal_value, phone, whatsapp, email, last_contact_at, source
       FROM leads WHERE user_id = $1 AND (status != 'perdido' OR (status = 'perdido' AND last_contact_at > NOW() - INTERVAL '30 days'))`,
      [userId],
    );

    const leads = leadsResult.rows;
    if (leads.length === 0) {
      return res.json({ success: true, analyzed: 0 });
    }

    // ── Buscar stats de inbox para todos os leads de uma vez ───────────────
    const convStatsResult = await query(
      `SELECT DISTINCT ON (conv.lead_id)
         conv.lead_id,
         ch.type                                            AS channel_type,
         ch.id                                             AS channel_id,
         conv.remote_jid,
         COUNT(m.id)::int                                  AS total_messages,
         COUNT(m.id) FILTER (WHERE m.direction = 'in')::int AS inbound_messages,
         COUNT(m.id) FILTER (WHERE m.direction = 'out')::int AS outbound_messages,
         COALESCE(
           EXTRACT(EPOCH FROM (NOW() - MAX(m.created_at))) / 86400,
           999
         )::float                                          AS days_since_last_msg,
         CASE
           WHEN COUNT(m.id) FILTER (WHERE m.direction = 'in') = 0 THEN 0
           ELSE ROUND(
             100.0 * COUNT(m.id) FILTER (WHERE m.direction = 'out') /
             NULLIF(COUNT(m.id) FILTER (WHERE m.direction = 'in'), 0)
           )
         END::int                                          AS response_rate
       FROM conversations conv
       JOIN channels ch ON ch.id = conv.channel_id
       LEFT JOIN messages m ON m.conversation_id = conv.id
       WHERE conv.user_id = $1 AND conv.lead_id IS NOT NULL
       GROUP BY conv.lead_id, ch.type, ch.id, conv.remote_jid, conv.last_message_at
       ORDER BY conv.lead_id, conv.last_message_at DESC NULLS LAST`,
      [userId],
    );

    const convStatsMap = new Map<string, ConvStats>();
    for (const row of convStatsResult.rows) {
      if (!convStatsMap.has(row.lead_id)) {
        convStatsMap.set(row.lead_id, {
          channelType: row.channel_type,
          channelId: row.channel_id,
          recipientId: row.remote_jid,
          totalMessages: Number(row.total_messages),
          inboundMessages: Number(row.inbound_messages),
          outboundMessages: Number(row.outbound_messages),
          daysSinceLastMsg: Number(row.days_since_last_msg),
          responseRate: Number(row.response_rate),
        });
      }
    }

    let analyzed = 0;
    for (const lead of leads) {
      const s = scoreOneLead(lead, convStatsMap.get(lead.id));
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
        `SELECT id, name, status, score, tags, deal_value, phone, whatsapp, email, last_contact_at, source
         FROM leads WHERE user_id = $1`,
        [userId],
      );

      // Batch fetch conv stats for inline scoring
      const inlineConvResult = await query(
        `SELECT DISTINCT ON (conv.lead_id)
           conv.lead_id, ch.type AS channel_type, ch.id AS channel_id, conv.remote_jid,
           COUNT(m.id)::int AS total_messages,
           COUNT(m.id) FILTER (WHERE m.direction = 'in')::int AS inbound_messages,
           COUNT(m.id) FILTER (WHERE m.direction = 'out')::int AS outbound_messages,
           COALESCE(EXTRACT(EPOCH FROM (NOW() - MAX(m.created_at))) / 86400, 999)::float AS days_since_last_msg,
           CASE WHEN COUNT(m.id) FILTER (WHERE m.direction = 'in') = 0 THEN 0
                ELSE ROUND(100.0 * COUNT(m.id) FILTER (WHERE m.direction = 'out') /
                     NULLIF(COUNT(m.id) FILTER (WHERE m.direction = 'in'), 0))
           END::int AS response_rate
         FROM conversations conv
         JOIN channels ch ON ch.id = conv.channel_id
         LEFT JOIN messages m ON m.conversation_id = conv.id
         WHERE conv.user_id = $1 AND conv.lead_id IS NOT NULL
         GROUP BY conv.lead_id, ch.type, ch.id, conv.remote_jid, conv.last_message_at
         ORDER BY conv.lead_id, conv.last_message_at DESC NULLS LAST`,
        [userId],
      );
      const inlineConvMap = new Map<string, ConvStats>();
      for (const row of inlineConvResult.rows) {
        if (!inlineConvMap.has(row.lead_id)) {
          inlineConvMap.set(row.lead_id, {
            channelType: row.channel_type, channelId: row.channel_id,
            recipientId: row.remote_jid, totalMessages: Number(row.total_messages),
            inboundMessages: Number(row.inbound_messages), outboundMessages: Number(row.outbound_messages),
            daysSinceLastMsg: Number(row.days_since_last_msg), responseRate: Number(row.response_rate),
          });
        }
      }

      for (const lead of leadsResult.rows) {
        const s = scoreOneLead(lead, inlineConvMap.get(lead.id));
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
              s.best_contact_time,
              LOWER(COALESCE(real_ch.channel_type, l.source, s.recommended_channel)) AS recommended_channel
       FROM leads l
       JOIN lead_ai_scores s ON s.lead_id = l.id AND s.user_id = l.user_id
       LEFT JOIN LATERAL (
         SELECT ch.type AS channel_type
         FROM conversations conv
         JOIN channels ch ON ch.id = conv.channel_id
         WHERE conv.lead_id = l.id AND conv.user_id = l.user_id
         ORDER BY conv.last_message_at DESC NULLS LAST
         LIMIT 1
       ) real_ch ON true
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
              LOWER(COALESCE(real_ch.channel_type, l.source, s.recommended_channel)) AS recommended_channel
       FROM leads l
       JOIN lead_ai_scores s ON s.lead_id = l.id AND s.user_id = l.user_id
       LEFT JOIN LATERAL (
         SELECT ch.type AS channel_type
         FROM conversations conv
         JOIN channels ch ON ch.id = conv.channel_id
         WHERE conv.lead_id = l.id AND conv.user_id = l.user_id
         ORDER BY conv.last_message_at DESC NULLS LAST
         LIMIT 1
       ) real_ch ON true
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
              s.next_best_action, s.best_contact_time,
              s.engagement_score, s.conversion_probability, s.intent,
              LOWER(COALESCE(real_ch.channel_type, l.source, s.recommended_channel)) AS recommended_channel
       FROM leads l
       JOIN lead_ai_scores s ON s.lead_id = l.id AND s.user_id = l.user_id
       LEFT JOIN LATERAL (
         SELECT ch.type AS channel_type
         FROM conversations conv
         JOIN channels ch ON ch.id = conv.channel_id
         WHERE conv.lead_id = l.id AND conv.user_id = l.user_id
         ORDER BY conv.last_message_at DESC NULLS LAST
         LIMIT 1
       ) real_ch ON true
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
// Motor de vendas: fila priorizada, mensagens pela IA a partir da conversa e envio
// ─────────────────────────────────────────────────────────────────────────────
router.get('/opportunities', async (req: AuthenticatedRequest, res, next) => {
  try {
    res.json(await salesOpportunities(req.user!.id));
  } catch (err) {
    next(err);
  }
});

// Rascunho de um fluxo de reativação para os leads parados (não grava nada)
router.post('/reactivation-flow', async (req: AuthenticatedRequest, res, next) => {
  try {
    res.json(await reactivationDraft(req.user!.id));
  } catch (err) {
    next(err);
  }
});

router.post('/generate-message', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { leadId, bucket } = req.body || {};
    if (!leadId) return res.status(400).json({ error: 'leadId é obrigatório' });
    const result = await suggestMessages(req.user!.id, String(leadId), bucket);
    if (!result) return res.status(404).json({ error: 'Lead não encontrado' });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

router.post('/send-message', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { leadId, content } = req.body || {};
    const text = String(content || '').trim();
    if (!leadId || !text) return res.status(400).json({ error: 'leadId e content são obrigatórios' });
    if (text.length > 4000) return res.status(400).json({ error: 'Mensagem demasiado longa' });

    const sent = await sendToLead(req.user!.id, String(leadId), text);
    if (!sent) return res.status(404).json({ error: 'Lead não encontrado' });
    res.json({ success: true, ...sent });
  } catch (err: any) {
    if (err instanceof FlowSendError) {
      const message = /^Fora das 24 horas/.test(err.message)
        ? 'Passaram mais de 24 horas desde a última mensagem do cliente: neste canal só pode responder quando ele voltar a escrever (ou com um modelo aprovado no WhatsApp Business)'
        : err.message;
      return res.status(422).json({ error: message });
    }
    next(err);
  }
});

export default router;
