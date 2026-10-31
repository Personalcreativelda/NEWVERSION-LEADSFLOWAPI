// Motor dos fluxos de remarketing.
//
// Cada lead inscrito tem uma linha em flow_enrollments com o passo atual e quando corre o próximo:
// as esperas (dias, semanas) sobrevivem a deploys e reinícios. O motor acorda a cada 15 segundos e
// trata no máximo um lead por conta em cada volta (no máximo 4 envios por minuto por conta, para
// proteger o número de WhatsApp de bloqueios). Quem responde, compra ou pede para sair deixa logo
// de receber mensagens.
import { query as dbQuery } from '../database/connection';
import { getWebSocketService } from './websocket.service';
import { notificationsService } from './notifications.service';
import { LeadNotesService } from './lead-notes.service';
import { ScheduledConversationsService } from './scheduled-conversations.service';
import { checkMessageLimit } from '../middleware/plan-enforcement.middleware';
import { SEND_STEP_TYPES } from './flow-validation';
import {
  FlowSendError, generateVoice, isVoiceConfigured, isWindowOpen, resolveTarget, saveOutgoing, sendAudio, sendEmail, sendText,
  targetForConversation, type FlowLead, type FlowTarget, type WhatsAppTemplateRef,
} from './flow-send.service';
import {
  classifyReply, contextualAcknowledgement, conversationContext, hasActiveAssistant, isAiAvailable, personalizeMessage,
  transcribeReply, type ReplyIntent,
} from './flow-context.service';

const TICK_MS = 15_000;
const SWEEP_MS = 30_000;
/** Enquanto um lead está a ser tratado, nenhuma outra volta lhe toca; se o processo cair, retoma depois disto */
const LEASE_MINUTES = 10;
const MAX_SEND_ATTEMPTS = 3;
const RETRY_BASE_MS = 15 * 60_000;
const TEST_WAIT_MS = 20_000;
const MAX_STEPS_PER_RUN = 60;
const DEFAULT_TIMEZONE = 'Africa/Maputo';
/** Tag de quem pediu para não receber mais mensagens: nunca volta a entrar num fluxo */
export const OPT_OUT_TAG = 'nao-contactar';
/** Disse que não tem interesse: sai dos fluxos e não volta a receber remarketing (só o pós-venda) */
export const NOT_INTERESTED_TAG = 'sem-interesse';

/** Com assistente no canal é ele quem responde; se ficar calado, segue a resposta automática */
const ASSISTANT_GRACE_MS = 3 * 60_000;
/** Ninguém respondeu ao cliente: avisa a equipa outra vez */
const HANDOFF_REMINDER_MS = 2 * 3_600_000;

const DEFAULT_AUTO_REPLY = 'Obrigado pela resposta, {{nome}}! Já passei à nossa equipa e falamos consigo muito em breve.';
const NOT_INTERESTED_REPLY = 'Sem problema, {{nome}}. Obrigado por responder, não voltamos a insistir.';
const LATER_REPLY = 'Combinado, {{nome}}. Voltamos a falar mais tarde. Obrigado por responder!';

const CONVERTED = ['convertido', 'converted', 'ganho', 'won'];
const LOST = ['perdido', 'lost'];

const STAGE_LABEL: Record<string, string> = {
  novo: 'Novo Lead',
  contatado: 'Contatado',
  qualificado: 'Qualificado',
  negociacao: 'Em Negociação',
  convertido: 'Convertido',
  perdido: 'Perdido',
};

/** Pedido de saída: a mensagem inteira tem de ser o pedido ("não quero perder a oferta" não conta) */
const OPT_OUT_RE = /^\s*(parar|pare|sair|stop|cancelar|remover|descadastrar|unsubscribe|n[aã]o quero( mais)?( receber)?( mensage(m|ns))?|n[aã]o (me )?(contact|mand|envi)\w*( mais)?( mensage(m|ns))?)\s*[.!]*\s*$/i;

const WAIT_UNITS_MS: Record<string, number> = {
  minutos: 60_000,
  horas: 3_600_000,
  dias: 86_400_000,
  semanas: 604_800_000,
};

export interface FlowSettings {
  stop_on_reply: boolean;
  on_reply: { stage?: string; tag?: string; notify?: boolean; task?: boolean; auto_reply?: string };
  /** A IA adapta as mensagens ao que já foi conversado (sem IA segue o texto escrito) */
  personalize: boolean;
  window_start: number;
  window_end: number;
  weekdays_only: boolean;
  timezone: string;
  reentry_days: number;
  channel: string;
  business_name: string;
  daily_limit: number;
}

const numberOr = (value: unknown, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export function flowSettings(raw: any): FlowSettings {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    stop_on_reply: s.stop_on_reply !== false,
    on_reply: s.on_reply && typeof s.on_reply === 'object' ? s.on_reply : { notify: true },
    personalize: s.personalize === true,
    window_start: Math.min(23, Math.max(0, numberOr(s.window_start, 8))),
    window_end: Math.min(24, Math.max(1, numberOr(s.window_end, 20))),
    weekdays_only: s.weekdays_only === true,
    timezone: typeof s.timezone === 'string' && s.timezone ? s.timezone : DEFAULT_TIMEZONE,
    reentry_days: Math.trunc(Math.max(0, numberOr(s.reentry_days, 30))),
    channel: typeof s.channel === 'string' && s.channel ? s.channel : 'any',
    business_name: typeof s.business_name === 'string' ? s.business_name : '',
    daily_limit: Math.max(1, numberOr(s.daily_limit, 200)),
  };
}

/** Milissegundos até o horário de envio abrir (0 = pode enviar agora) */
export function msUntilSendWindow(settings: FlowSettings, now = new Date()): number {
  const read = (timeZone: string) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
    }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
    return { minutes: Number(get('hour')) * 60 + Number(get('minute')), weekday: get('weekday') };
  };
  let local: { minutes: number; weekday: string };
  try { local = read(settings.timezone); } catch { local = read(DEFAULT_TIMEZONE); }

  const start = settings.window_start * 60;
  const end = settings.window_end * 60;
  const open = local.minutes >= start && local.minutes < end;
  const weekend = local.weekday === 'Sat' || local.weekday === 'Sun';
  if (open && !(settings.weekdays_only && weekend)) return 0;

  // Próxima abertura: hoje (se ainda não abriu) ou amanhã
  let wait = local.minutes < start ? start - local.minutes : 24 * 60 - local.minutes + start;
  if (settings.weekdays_only) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const next = (days.indexOf(local.weekday) + (local.minutes < start ? 0 : 1)) % 7;
    if (next === 6) wait += 2 * 24 * 60;
    else if (next === 0) wait += 24 * 60;
  }
  return wait * 60_000;
}

/** Texto final para este lead. Nomes que são só um número ficam em branco (e a pontuação arruma-se) */
export function renderText(text: string, lead: FlowLead, settings: FlowSettings, ownerName: string): string {
  const fullName = String(lead.name || '').trim();
  const usableName = /\d{5,}/.test(fullName) ? '' : fullName;
  const values: Record<string, string> = {
    nome: usableName.split(/\s+/)[0] || '',
    nome_completo: usableName,
    empresa: String(lead.company || ''),
    minha_empresa: settings.business_name || ownerName || '',
    telefone: String(lead.whatsapp || lead.phone || ''),
  };
  return String(text || '')
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, key) => values[String(key).toLowerCase()] ?? '')
    .replace(/[ \t]+([,.!?;:])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

type StepOutcome =
  | { kind: 'next'; note?: string; sent?: boolean }
  | { kind: 'goto'; stepId: string; note?: string }
  | { kind: 'end'; note?: string }
  | { kind: 'stop'; reason: string; note?: string }
  | { kind: 'pause'; ms: number; advance: boolean; note?: string };

export class FlowExecutionService {
  private notesService = new LeadNotesService();
  private schedulesService = new ScheduledConversationsService();
  private ticking = false;
  private sweeping = false;
  private sendCounts = new Map<string, { count: number; at: number }>();
  private limitWarnedAt = new Map<string, number>();

  // ── Arranque ──────────────────────────────────────────────────────────────

  start() {
    if (process.env.DISABLE_FLOW_WORKER === 'true') return;
    console.log('[FlowExecution] Motor dos fluxos iniciado');
    setTimeout(() => {
      setInterval(() => { void this.tick(); }, TICK_MS).unref?.();
      setInterval(() => { void this.sweep(); }, SWEEP_MS).unref?.();
      void this.sweep();
      void this.tick();
    }, 20_000).unref?.();
  }

  // ── Entrada de leads ──────────────────────────────────────────────────────

  /** Um evento aconteceu ao lead (mudou de etapa, recebeu uma tag…): inscreve-o nos fluxos que o esperam */
  async triggerFlowsForLead(
    userId: string,
    leadId: string,
    triggerType: 'funnel_stage' | 'tag' | 'inactivity' | 'purchase' | 'lead_score',
    triggerValue: string,
  ) {
    try {
      let flows: any[] = [];
      if (triggerType === 'funnel_stage') {
        const label = STAGE_LABEL[triggerValue] ?? triggerValue;
        const res = await dbQuery(
          `SELECT * FROM remarketing_flows
            WHERE user_id = $1 AND status = 'active' AND trigger_type = 'funnel_stage'
              AND (trigger_label ILIKE $2::text || ' +%' OR trigger_label ILIKE $3::text || ' +%'
                   OR LOWER(trigger_label) = LOWER($2::text))`,
          [userId, triggerValue, label],
        );
        flows = res.rows;
      } else if (triggerType === 'lead_score') {
        const score = parseInt(triggerValue, 10);
        if (Number.isNaN(score)) return;
        const res = await dbQuery(
          `SELECT * FROM remarketing_flows
            WHERE user_id = $1 AND status = 'active' AND trigger_type = 'lead_score'
              AND CAST(NULLIF(regexp_replace(trigger_label, '[^0-9]', '', 'g'), '') AS INTEGER) <= $2`,
          [userId, score],
        );
        flows = res.rows;
      } else if (triggerType === 'purchase') {
        const res = await dbQuery(
          `SELECT * FROM remarketing_flows WHERE user_id = $1 AND status = 'active' AND trigger_type = 'purchase'`,
          [userId],
        );
        flows = res.rows;
      } else if (triggerType === 'tag') {
        const res = await dbQuery(
          `SELECT * FROM remarketing_flows
            WHERE user_id = $1 AND status = 'active' AND trigger_type = 'tag' AND LOWER(trigger_label) = LOWER($2::text)`,
          [userId, `Tag: ${triggerValue}`],
        );
        flows = res.rows;
      }

      for (const flow of flows) {
        if (triggerType === 'funnel_stage') {
          // "negociacao +3 dias": só corre se ainda lá estiver daqui a 3 dias
          const days = Number(String(flow.trigger_label).match(/\+(\d+)/)?.[1] || 0);
          await this.enrollLead(flow, leadId, { delayMs: days * 86_400_000, entryStage: triggerValue });
        } else {
          await this.enrollLead(flow, leadId);
        }
      }
    } catch (err: any) {
      console.error('[FlowExecution] Erro ao inscrever lead:', err?.message);
    }
  }

  /** Inscreve o lead se puder entrar. Devolve true quando ficou inscrito. */
  async enrollLead(
    flow: any,
    leadId: string,
    opts: { delayMs?: number; entryStage?: string; test?: boolean; manual?: boolean } = {},
  ): Promise<boolean> {
    const settings = flowSettings(flow.settings);
    const steps: any[] = Array.isArray(flow.steps) ? flow.steps : [];
    if (steps.length === 0) return false;

    const leadRes = await dbQuery('SELECT * FROM leads WHERE id = $1 AND user_id = $2', [leadId, flow.user_id]);
    const lead: FlowLead | undefined = leadRes.rows?.[0];
    if (!lead) return false;

    if (!opts.test) {
      if ((lead.tags || []).includes(OPT_OUT_TAG)) return false;
      if ((lead.tags || []).includes(NOT_INTERESTED_TAG) && flow.trigger_type !== 'purchase') return false;

      // Quem já passou por este fluxo há pouco não volta a entrar (quem adiciona à mão decide)
      if (!opts.manual) {
        const recent = await dbQuery(
          `SELECT 1 FROM flow_enrollments
            WHERE flow_id = $1 AND lead_id = $2
              AND (status = 'active' OR enrolled_at > NOW() - make_interval(days => $3::int))
            LIMIT 1`,
          [flow.id, leadId, settings.reentry_days],
        );
        if (recent.rows?.length) return false;
      }

      const sends = steps.some((s) => SEND_STEP_TYPES.has(s?.type) && s.type !== 'email');
      if (sends && !(await resolveTarget(lead, settings.channel === 'any' ? null : settings.channel))) return false;
    }

    const context: Record<string, any> = {};
    if (opts.entryStage) context.entry_stage = opts.entryStage;
    if (opts.test) context.test = true;
    if (opts.manual) context.manual = true;

    const inserted = await dbQuery(
      `INSERT INTO flow_enrollments (flow_id, lead_id, user_id, status, step_index, next_run_at, context)
       VALUES ($1, $2, $3, 'active', 0, NOW() + ($4::float8 * INTERVAL '1 millisecond'), $5::jsonb)
       ON CONFLICT (flow_id, lead_id) WHERE status = 'active' DO NOTHING
       RETURNING id`,
      [flow.id, leadId, flow.user_id, Math.max(0, Math.round(opts.delayMs || 0)), JSON.stringify(context)],
    );
    if (!inserted.rows?.length) return false;

    if (!opts.test) {
      await dbQuery('UPDATE remarketing_flows SET enrolled_leads = enrolled_leads + 1 WHERE id = $1', [flow.id]);
    }
    return true;
  }

  /**
   * Adicionados à mão: entram logo, mesmo que já tenham passado pelo fluxo e seja qual for a etapa.
   * Quem pediu para sair ou disse que não tem interesse fica sempre de fora.
   */
  async enrollManually(flow: any, leadIds: string[], userId: string) {
    const counts = { enrolled: 0, already: 0, opted_out: 0, no_channel: 0, not_found: 0 };
    const res = await dbQuery('SELECT id, status, tags FROM leads WHERE user_id = $1 AND id = ANY($2::uuid[])', [userId, leadIds]);
    const rows: any[] = res.rows || [];
    counts.not_found = leadIds.length - rows.length;

    const activeRes = await dbQuery(
      `SELECT lead_id FROM flow_enrollments WHERE flow_id = $1 AND status = 'active' AND lead_id = ANY($2::uuid[])`,
      [flow.id, leadIds],
    );
    const active = new Set((activeRes.rows || []).map((r: any) => r.lead_id));

    for (const lead of rows) {
      const tags: string[] = lead.tags || [];
      if (active.has(lead.id)) counts.already += 1;
      else if (tags.includes(OPT_OUT_TAG) || (tags.includes(NOT_INTERESTED_TAG) && flow.trigger_type !== 'purchase')) counts.opted_out += 1;
      // A etapa de entrada é a atual: sai se mudar, mas um perdido adicionado à mão não sai logo
      else if (await this.enrollLead(flow, lead.id, { manual: true, entryStage: lead.status || undefined })) counts.enrolled += 1;
      else counts.no_channel += 1;
    }
    return counts;
  }

  /** Corre o fluxo para um lead à escolha: esperas curtas, a qualquer hora, mesmo em rascunho */
  async startTest(flow: any, leadId: string, userId: string): Promise<boolean> {
    await dbQuery(
      `UPDATE flow_enrollments SET status = 'stopped', stop_reason = 'restarted', finished_at = NOW(), next_run_at = NULL
        WHERE flow_id = $1 AND lead_id = $2 AND user_id = $3 AND status = 'active'`,
      [flow.id, leadId, userId],
    );
    return this.enrollLead(flow, leadId, { test: true });
  }

  // ── Volta do motor ────────────────────────────────────────────────────────

  private async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const due = await dbQuery(
        `UPDATE flow_enrollments
            SET next_run_at = NOW() + make_interval(mins => ${LEASE_MINUTES})
          WHERE status = 'active' AND next_run_at <= NOW() AND id IN (
            SELECT DISTINCT ON (e.user_id) e.id
              FROM flow_enrollments e
              JOIN remarketing_flows f ON f.id = e.flow_id
             WHERE e.status = 'active' AND e.next_run_at <= NOW()
               AND (f.status = 'active' OR e.context->>'test' = 'true')
             ORDER BY e.user_id, (e.context->>'test' = 'true') DESC NULLS LAST, e.next_run_at
          )
          RETURNING *`,
      );
      await Promise.allSettled((due.rows || []).map((e: any) => this.processEnrollment(e).catch(async (err) => {
        console.error(`[FlowExecution] Inscrição ${e.id}:`, err?.message);
      })));
    } catch (err: any) {
      console.error('[FlowExecution] Volta do motor falhou:', err?.message);
    } finally {
      this.ticking = false;
    }
  }

  private async processEnrollment(e: any) {
    const flowRes = await dbQuery('SELECT * FROM remarketing_flows WHERE id = $1 AND user_id = $2', [e.flow_id, e.user_id]);
    const flow = flowRes.rows?.[0];
    if (!flow) return this.finish(e, 'stopped', 'flow_removed');

    const leadRes = await dbQuery('SELECT * FROM leads WHERE id = $1 AND user_id = $2', [e.lead_id, e.user_id]);
    const lead: FlowLead | undefined = leadRes.rows?.[0];
    if (!lead) return this.finish(e, 'stopped', 'lead_removed');

    const ownerRes = await dbQuery('SELECT name FROM users WHERE id = $1', [e.user_id]);
    const ownerName: string = ownerRes.rows?.[0]?.name || '';

    const settings = flowSettings(flow.settings);
    const steps: any[] = Array.isArray(flow.steps) ? flow.steps : [];
    const context: Record<string, any> = e.context && typeof e.context === 'object' ? { ...e.context } : {};
    const isTest = context.test === true;

    let stepIndex: number = e.step_index || 0;
    let attempts: number = e.attempts || 0;
    const events: any[] = [];
    const save = async (nextRun: number | null) => dbQuery(
      `UPDATE flow_enrollments
          SET step_index = $2, attempts = $3, context = $4::jsonb, log = log || $5::jsonb,
              next_run_at = NOW() + ($6::float8 * INTERVAL '1 millisecond')
        WHERE id = $1`,
      [e.id, stepIndex, attempts, JSON.stringify(context), JSON.stringify(events), nextRun ?? 0],
    );

    for (let guard = 0; guard < MAX_STEPS_PER_RUN; guard++) {
      // Antes de cada passo: o lead ainda deve receber isto?
      const exit = this.exitReason(flow, lead, context);
      if (exit) return this.finish(e, 'stopped', exit, events, stepIndex);

      if (settings.stop_on_reply) {
        const reply = await this.lastReply(e);
        if (reply) {
          await this.handleReply({ ...e, settings: flow.settings, flow_name: flow.name, lead_name: lead.name, ...reply });
          return;
        }
        // A conversa já está com pessoas: o fluxo não se mete no meio
        if (!isTest) {
          const human = await this.humanInConversation(e);
          if (human) return this.finish(e, 'stopped', human, events, stepIndex);
        }
      }

      if (stepIndex >= steps.length) return this.finish(e, 'completed', null, events, stepIndex);

      const step = steps[stepIndex];
      let outcome: StepOutcome;
      try {
        outcome = await this.runStep(step, { e, flow, lead, settings, context, ownerName, isTest });
        attempts = 0;
      } catch (err: any) {
        const transient = err instanceof FlowSendError ? err.transient : true;
        attempts += 1;
        if (transient && attempts < MAX_SEND_ATTEMPTS) {
          outcome = { kind: 'pause', ms: RETRY_BASE_MS * attempts, advance: false };
          console.warn(`[FlowExecution] Passo ${stepIndex + 1} do fluxo ${flow.id}: nova tentativa (${err?.message})`);
        } else {
          // Sem hipótese de chegar a este lead neste passo: segue para o seguinte
          outcome = { kind: 'next', note: `Não enviado: ${err?.message || 'erro'}` };
          attempts = 0;
        }
      }

      if (outcome.note) {
        events.push({ at: new Date().toISOString(), step: stepIndex + 1, type: step?.type, note: outcome.note });
      }

      if (outcome.kind === 'pause') {
        if (outcome.advance) stepIndex += 1;
        await save(outcome.ms);
        return;
      }
      if (outcome.kind === 'end') return this.finish(e, 'completed', null, events, stepIndex);
      if (outcome.kind === 'stop') return this.finish(e, 'stopped', outcome.reason, events, stepIndex);
      if (outcome.kind === 'goto') {
        const target = steps.findIndex((s) => s?.id === outcome.stepId);
        stepIndex = target >= 0 ? target : stepIndex + 1;
        continue;
      }

      stepIndex += 1;
      if (outcome.sent) {
        // Depois de uma mensagem há sempre uma pausa curta, como quem está a escrever
        await save(8_000 + Math.floor(Math.random() * 17_000));
        return;
      }
    }
    // Condições a apontarem umas para as outras sem fim
    await this.finish(e, 'stopped', 'loop', events, stepIndex);
  }

  /** Razão para o lead sair já do fluxo, ou null */
  private exitReason(flow: any, lead: FlowLead, context: Record<string, any>): string | null {
    if ((lead.tags || []).includes(OPT_OUT_TAG)) return 'opt_out';
    const status = String(lead.status || '').toLowerCase();
    const entry = String(context.entry_stage || '').toLowerCase();
    if (context.test === true) return null;
    if (entry && status !== entry) return 'stage_changed';
    if (status !== entry) {
      if (LOST.includes(status)) return 'lost';
      if (CONVERTED.includes(status) && flow.trigger_type !== 'purchase') return 'converted';
    }
    return null;
  }

  private async finish(e: any, status: 'completed' | 'stopped', reason: string | null, events: any[] = [], stepIndex?: number) {
    await dbQuery(
      `UPDATE flow_enrollments
          SET status = $2, stop_reason = $3, finished_at = NOW(), next_run_at = NULL,
              log = log || $4::jsonb, step_index = COALESCE($5, step_index)
        WHERE id = $1`,
      [e.id, status, reason, JSON.stringify(events), stepIndex ?? null],
    );
  }

  /** Última resposta do lead desde que entrou no fluxo, ou null */
  private async lastReply(e: any): Promise<{ reply: string; reply_media_type: string | null; reply_media_url: string | null; reply_conversation_id: string } | null> {
    const res = await dbQuery(
      `SELECT m.content, m.media_type, m.media_url, m.conversation_id FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
        WHERE c.lead_id = $1 AND c.user_id = $2 AND m.direction = 'in' AND m.created_at > $3
        ORDER BY m.created_at DESC
        LIMIT 1`,
      [e.lead_id, e.user_id, e.enrolled_at],
    );
    const row = res.rows?.[0];
    if (!row) return null;
    return {
      reply: String(row.content ?? ''),
      reply_media_type: row.media_type ?? null,
      reply_media_url: row.media_url ?? null,
      reply_conversation_id: row.conversation_id,
    };
  }

  /**
   * A equipa (ou o assistente) está a falar com o lead? Mensagens enviadas perto de um envio do fluxo
   * não contam: podem ser o eco do próprio envio, que o WhatsApp devolve pelo webhook.
   */
  private async humanInConversation(e: any): Promise<string | null> {
    const res = await dbQuery(
      `SELECT
         EXISTS (
           SELECT 1 FROM conversations c WHERE c.lead_id = $1 AND c.user_id = $2 AND c.status = 'pending'
         ) AS human_mode,
         EXISTS (
           SELECT 1 FROM messages m
             JOIN conversations c ON c.id = m.conversation_id
            WHERE c.lead_id = $1 AND c.user_id = $2 AND m.direction = 'out' AND m.campaign_id IS NULL
              AND m.created_at > $3
              AND COALESCE(m.metadata->>'source', '') NOT LIKE 'remarketing%'
              AND NOT EXISTS (
                SELECT 1 FROM messages own
                 WHERE own.conversation_id = m.conversation_id
                   AND own.metadata->>'source' LIKE 'remarketing%'
                   AND ABS(EXTRACT(EPOCH FROM (own.created_at - m.created_at))) < 60
              )
         ) AS took_over`,
      [e.lead_id, e.user_id, e.enrolled_at],
    );
    const row = res.rows?.[0];
    if (row?.human_mode) return 'human_mode';
    if (row?.took_over) return 'human_took_over';
    return null;
  }

  /** Avisa a equipa, sem repetir o mesmo aviso sobre o mesmo lead no mesmo dia */
  private async notifyOnce(lead: FlowLead, type: string, title: string, text: string, flowId: string) {
    const seen = await dbQuery(
      `SELECT 1 FROM notifications
        WHERE user_id = $1 AND type = $2 AND metadata->>'leadId' = $3 AND created_at > NOW() - INTERVAL '1 day'
        LIMIT 1`,
      [lead.user_id, type, lead.id],
    );
    if (seen.rows?.length) return;
    await notificationsService.createNotification(lead.user_id, type, title, text, 'message-circle', { leadId: lead.id, flowId }).catch(() => {});
  }

  /** O cliente está à espera de resposta e o fluxo não sabe responder: passa à equipa, em vez de insistir */
  private async handToTeamWaiting(flow: any, lead: FlowLead): Promise<StepOutcome> {
    await this.notifyOnce(
      lead, 'flow_waiting', `${lead.name || 'Um lead'} está à espera de resposta`,
      `O fluxo "${flow.name}" parou: a última mensagem do cliente ficou sem resposta.`, flow.id,
    );
    await this.createFollowUpTask(lead, flow, `Responder a ${lead.name || 'este lead'}: está à espera de resposta`, 1);
    return { kind: 'stop', reason: 'client_waiting', note: 'O cliente estava à espera de resposta: passou à equipa' };
  }

  private async createFollowUpTask(lead: FlowLead, flow: any, title: string, dueHours: number) {
    await this.schedulesService.create({
      lead_id: lead.id,
      title,
      description: `Criada pelo fluxo "${flow.name}"`,
      scheduled_at: new Date(Date.now() + dueHours * 3_600_000).toISOString(),
      metadata: { type: 'whatsapp', priority: 'high', source: 'remarketing', flow_id: flow.id },
    }, lead.user_id);
  }

  /**
   * Texto final de uma mensagem do fluxo: adaptado à conversa quando se pode. Se o cliente ficou
   * sem resposta, só segue uma mensagem que o reconheça; sem isso, passa à equipa.
   */
  private async composeText(
    flow: any, lead: FlowLead, settings: FlowSettings, target: FlowTarget, base: string,
    opts: { spoken?: boolean; canAdapt?: boolean; ownerName?: string } = {},
  ): Promise<{ text: string } | { outcome: StepOutcome }> {
    if (!target.conversationId || !settings.stop_on_reply && !settings.personalize) return { text: base };

    const ctx = await conversationContext(target.conversationId);
    const waiting = settings.stop_on_reply && ctx.unanswered;
    const canAdapt = opts.canAdapt !== false && settings.personalize && isAiAvailable() && ctx.history.length > 0 && isWindowOpen(target);

    if (canAdapt) {
      const adapted = await personalizeMessage({
        base,
        history: ctx.history,
        unanswered: waiting,
        leadName: lead.name,
        businessName: settings.business_name || opts.ownerName,
        goal: flow.description || flow.name,
        spoken: opts.spoken,
      });
      if (adapted) return { text: adapted };
    }
    if (waiting) return { outcome: await this.handToTeamWaiting(flow, lead) };
    return { text: base };
  }

  // ── Passos ────────────────────────────────────────────────────────────────

  private async runStep(
    step: any,
    run: { e: any; flow: any; lead: FlowLead; settings: FlowSettings; context: Record<string, any>; ownerName: string; isTest: boolean },
  ): Promise<StepOutcome> {
    const { flow, lead, settings, context, ownerName, isTest } = run;
    const cfg = step?.config || {};
    const render = (text: string) => renderText(text, lead, settings, ownerName);

    if (SEND_STEP_TYPES.has(step?.type)) {
      const blocked = await this.sendGate(run);
      if (blocked) return blocked;
    }

    switch (step?.type) {
      case 'wait': {
        if (isTest) return { kind: 'pause', ms: TEST_WAIT_MS, advance: true, note: 'Espera encurtada no teste' };
        const unit = WAIT_UNITS_MS[cfg.unit] ?? WAIT_UNITS_MS.dias;
        const n = Number(cfg.duration);
        if (!(n > 0)) return { kind: 'next', note: 'Espera sem tempo definido' };
        return { kind: 'pause', ms: n * unit, advance: true };
      }

      case 'message':
      case 'whatsapp':
      case 'facebook':
      case 'instagram':
      case 'telegram': {
        const text = render(cfg.message);
        if (!text) return { kind: 'next', note: 'Passo sem mensagem' };
        const channel = step.type === 'message' ? (settings.channel === 'any' ? null : settings.channel) : step.type;
        return this.deliverText(flow, lead, channel, text, cfg, render, settings, ownerName);
      }

      case 'ab_test': {
        if (!context.variant) context.variant = Math.random() < 0.5 ? 'A' : 'B';
        const text = render(context.variant === 'A' ? cfg.messageA : cfg.messageB);
        if (!text) return { kind: 'next', note: `Versão ${context.variant} sem mensagem` };
        return this.deliverText(flow, lead, settings.channel === 'any' ? null : settings.channel, text, cfg, render, settings, ownerName, `Versão ${context.variant} enviada`);
      }

      case 'dynamic_audio':
        return this.deliverAudio(flow, lead, settings, cfg, render, ownerName);

      case 'email': {
        const subject = render(cfg.subject);
        const body = render(cfg.body);
        if (!subject || !body) return { kind: 'next', note: 'Email sem assunto ou texto' };
        await sendEmail(lead, subject, body);
        return { kind: 'next', note: 'Email enviado', sent: true };
      }

      case 'tag':
        if (!cfg.tag) return { kind: 'next' };
        await this.addTag(lead, String(cfg.tag));
        return { kind: 'next', note: `Tag "${cfg.tag}" aplicada` };

      case 'remove_tag':
        if (!cfg.tag) return { kind: 'next' };
        await dbQuery('UPDATE leads SET tags = array_remove(tags, $1::text) WHERE id = $2 AND user_id = $3', [String(cfg.tag), lead.id, lead.user_id]);
        lead.tags = (lead.tags || []).filter((t: string) => t !== cfg.tag);
        return { kind: 'next', note: `Tag "${cfg.tag}" removida` };

      case 'move_stage': {
        if (!cfg.stage) return { kind: 'next' };
        await this.moveStage(lead, String(cfg.stage));
        // A mudança foi do próprio fluxo: não conta como "saiu da etapa"
        if (context.entry_stage) context.entry_stage = String(cfg.stage);
        return { kind: 'next', note: `Movido para ${STAGE_LABEL[cfg.stage] || cfg.stage}` };
      }

      case 'create_task': {
        const title = render(cfg.title);
        if (!title) return { kind: 'next' };
        const hours = Number(cfg.due_hours);
        await this.schedulesService.create({
          lead_id: lead.id,
          title,
          description: cfg.description ? render(cfg.description) : `Criada pelo fluxo "${flow.name}"`,
          scheduled_at: new Date(Date.now() + (hours > 0 ? hours : 24) * 3_600_000).toISOString(),
          metadata: { type: cfg.task_type || 'call', priority: cfg.priority || 'high', source: 'remarketing', flow_id: flow.id },
        }, lead.user_id);
        return { kind: 'next', note: 'Tarefa criada' };
      }

      case 'add_note': {
        const content = render(cfg.text);
        if (!content) return { kind: 'next' };
        await this.notesService.create({ lead_id: lead.id, content }, lead.user_id);
        return { kind: 'next', note: 'Nota adicionada' };
      }

      case 'notify': {
        const title = render(cfg.title);
        if (!title) return { kind: 'next' };
        await notificationsService.createNotification(
          lead.user_id, 'flow_notify', title, cfg.text ? render(cfg.text) : `${lead.name || 'Lead'} · ${flow.name}`, 'bell',
          { leadId: lead.id, flowId: flow.id },
        );
        return { kind: 'next', note: 'Aviso enviado à equipa' };
      }

      case 'score': {
        const points = Number(cfg.points);
        if (!points) return { kind: 'next' };
        await dbQuery(
          'UPDATE leads SET score = LEAST(100, GREATEST(0, COALESCE(score, 0) + $1::int)) WHERE id = $2 AND user_id = $3',
          [Math.trunc(points), lead.id, lead.user_id],
        );
        return { kind: 'next', note: `Pontuação ${points > 0 ? '+' : ''}${Math.trunc(points)}` };
      }

      case 'condition': {
        const matched = await this.evaluateCondition(cfg, run.e, lead);
        if (matched === null) return { kind: 'next', note: 'Condição por configurar' };
        const route = String((matched ? cfg.if_true : cfg.if_false) || 'continue');
        if (route === 'end') return { kind: 'end', note: 'Condição terminou o fluxo' };
        if (route !== 'continue') return { kind: 'goto', stepId: route };
        return { kind: 'next' };
      }

      default:
        return { kind: 'next', note: 'Passo não reconhecido' };
    }
  }

  private async evaluateCondition(cfg: any, e: any, lead: FlowLead): Promise<boolean | null> {
    const status = String(lead.status || '').toLowerCase();
    const value = String(cfg.value || '').toLowerCase();
    const tags: string[] = (lead.tags || []).map((t: string) => String(t).toLowerCase());
    switch (cfg.check) {
      case 'replied': return (await this.lastReply(e)) !== null;
      case 'not_replied': return (await this.lastReply(e)) === null;
      case 'stage': return status === value;
      case 'not_stage': return status !== value;
      case 'tag': return tags.includes(value);
      case 'not_tag': return !tags.includes(value);
      default: return null;
    }
  }

  /** Limites antes de enviar: horário, plano e máximo diário. Devolve a pausa, ou null se pode enviar. */
  private async sendGate(run: { lead: FlowLead; settings: FlowSettings; isTest: boolean }): Promise<StepOutcome | null> {
    const { lead, settings, isTest } = run;

    const limit = await checkMessageLimit(lead.user_id, 'messages');
    if (!limit.allowed) {
      await this.warnLimit(lead.user_id);
      return { kind: 'pause', ms: 6 * 3_600_000, advance: false };
    }
    if (isTest) return null;

    const wait = msUntilSendWindow(settings);
    // Espalha os envios pela primeira meia hora, em vez de todos à hora certa
    if (wait > 0) return { kind: 'pause', ms: wait + Math.floor(Math.random() * 30 * 60_000), advance: false };

    const sent = await this.sendsInLastDay(lead.user_id);
    if (sent >= settings.daily_limit) return { kind: 'pause', ms: 3_600_000, advance: false };
    return null;
  }

  private async sendsInLastDay(userId: string): Promise<number> {
    const cached = this.sendCounts.get(userId);
    if (cached && Date.now() - cached.at < 5 * 60_000) return cached.count;
    const res = await dbQuery(
      `SELECT COUNT(*)::int AS count FROM messages
        WHERE user_id = $1 AND direction = 'out' AND created_at > NOW() - INTERVAL '24 hours'
          AND metadata->>'source' = 'remarketing'`,
      [userId],
    );
    const count = res.rows?.[0]?.count ?? 0;
    this.sendCounts.set(userId, { count, at: Date.now() });
    return count;
  }

  private countSend(userId: string) {
    const cached = this.sendCounts.get(userId);
    if (cached) cached.count += 1;
  }

  /** Avisa uma vez por dia que os fluxos pararam por falta de mensagens no plano */
  private async warnLimit(userId: string) {
    const last = this.limitWarnedAt.get(userId) || 0;
    if (Date.now() - last < 86_400_000) return;
    this.limitWarnedAt.set(userId, Date.now());
    await notificationsService.createNotification(
      userId, 'plan_limit', 'Fluxos em pausa',
      'Atingiu o limite de mensagens do plano. Os fluxos continuam quando houver mensagens disponíveis.',
      'alert-triangle',
    ).catch(() => {});
  }

  private async deliverText(
    flow: any, lead: FlowLead, channel: string | null, baseText: string, cfg: any,
    render: (t: string) => string, settings: FlowSettings, ownerName: string, note?: string,
  ): Promise<StepOutcome> {
    const target = await resolveTarget(lead, channel);
    if (!target) return { kind: 'next', note: channel ? `Lead sem conversa em ${channel}` : 'Lead sem canal disponível' };

    const template: WhatsAppTemplateRef | null = cfg.wa_template?.name
      ? {
        name: String(cfg.wa_template.name),
        language: String(cfg.wa_template.language || 'pt_PT'),
        // {{1}} é o nome do lead; as outras variáveis levam o nome do negócio
        params: Array.from({ length: Math.max(0, Number(cfg.wa_template.params) || 0) }, (_v, i) => (
          render(i === 0 ? '{{nome}}' : '{{minha_empresa}}') || '-'
        )),
      }
      : null;

    const composed = await this.composeText(flow, lead, settings, target, baseText, { ownerName });
    if ('outcome' in composed) return composed.outcome;

    const sent = await sendText(target, composed.text, template);
    await saveOutgoing(lead, target, { content: sent.content, externalId: sent.externalId, flowId: flow.id });
    this.countSend(lead.user_id);
    return { kind: 'next', note: note || (composed.text !== baseText ? 'Mensagem adaptada à conversa e enviada' : 'Mensagem enviada'), sent: true };
  }

  private async deliverAudio(flow: any, lead: FlowLead, settings: FlowSettings, cfg: any, render: (t: string) => string, ownerName: string): Promise<StepOutcome> {
    const target = await resolveTarget(lead, settings.channel === 'any' ? null : settings.channel);
    if (!target) return { kind: 'next', note: 'Lead sem canal disponível' };

    // Áudio gravado não se adapta: só pode seguir se o cliente não estiver à espera de resposta
    const composed = await this.composeText(flow, lead, settings, target, render(cfg.text || cfg.fallback_text || ''), {
      spoken: true, canAdapt: !cfg.audio_url, ownerName,
    });
    if ('outcome' in composed) return composed.outcome;
    const spoken = composed.text;
    try {
      let url: string | null = cfg.audio_url ? String(cfg.audio_url) : null;
      if (!url && spoken && isVoiceConfigured()) url = await generateVoice(spoken, lead.user_id);
      if (!url) throw new FlowSendError('A voz por IA não está configurada');
      const sent = await sendAudio(target, url, lead.user_id);
      await saveOutgoing(lead, target, {
        content: 'Mensagem de voz', externalId: sent.externalId, mediaUrl: sent.url, mediaType: 'audio', flowId: flow.id,
      });
      this.countSend(lead.user_id);
      return { kind: 'next', note: 'Áudio enviado', sent: true };
    } catch (err: any) {
      if (err instanceof FlowSendError && err.transient) throw err;
      // Sem áudio, a mesma mensagem segue em texto (se o canal o permitir)
      const fallback = spoken;
      if (!fallback) throw err;
      const sent = await sendText(target, fallback);
      await saveOutgoing(lead, target, { content: sent.content, externalId: sent.externalId, flowId: flow.id });
      this.countSend(lead.user_id);
      return { kind: 'next', note: `Enviado em texto: ${err?.message || 'áudio indisponível'}`, sent: true };
    }
  }

  // ── Ações no painel ───────────────────────────────────────────────────────

  private async addTag(lead: FlowLead, tag: string) {
    await dbQuery(
      `UPDATE leads SET tags = CASE
         WHEN tags IS NULL THEN ARRAY[$1::text]
         WHEN NOT ($1::text = ANY(tags)) THEN array_append(tags, $1::text)
         ELSE tags END
       WHERE id = $2 AND user_id = $3`,
      [tag, lead.id, lead.user_id],
    );
    lead.tags = [...new Set([...(lead.tags || []), tag])];
    // Outros fluxos podem estar à espera desta tag
    void this.triggerFlowsForLead(lead.user_id, lead.id, 'tag', tag);
  }

  private async moveStage(lead: FlowLead, stage: string) {
    await dbQuery('UPDATE leads SET status = $1 WHERE id = $2 AND user_id = $3', [stage, lead.id, lead.user_id]);
    lead.status = stage;
    // O funil atualiza em direto
    try {
      getWebSocketService()?.emitLeadFunnelUpdate(lead.user_id, { leadId: lead.id, leadName: lead.name, newStatus: stage });
    } catch { /* só atualiza o ecrã */ }
    void this.triggerFlowsForLead(lead.user_id, lead.id, 'funnel_stage', stage);
    if (CONVERTED.includes(stage.toLowerCase())) void this.triggerFlowsForLead(lead.user_id, lead.id, 'purchase', stage);
  }

  // ── Respostas e conversões ────────────────────────────────────────────────

  /** A cada 30 segundos: trata as respostas dos clientes; quem comprou conta como conversão do fluxo */
  private async sweep() {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const replies = await dbQuery(
        `SELECT DISTINCT ON (e.id) e.*, f.settings, f.name AS flow_name, l.name AS lead_name, m.content AS reply,
                m.media_type AS reply_media_type, m.media_url AS reply_media_url, m.conversation_id AS reply_conversation_id
           FROM messages m
           JOIN conversations c ON c.id = m.conversation_id
           JOIN flow_enrollments e ON e.lead_id = c.lead_id AND e.user_id = c.user_id
                AND e.status = 'active' AND e.replied_at IS NULL AND m.created_at > e.enrolled_at
           JOIN remarketing_flows f ON f.id = e.flow_id
           JOIN leads l ON l.id = e.lead_id
          WHERE m.direction = 'in' AND m.created_at > NOW() - INTERVAL '15 minutes'
          ORDER BY e.id, m.created_at DESC
          LIMIT 200`,
      );
      for (const row of replies.rows || []) {
        await this.handleReply(row).catch((err) => console.error('[FlowExecution] Resposta:', err?.message));
      }

      await this.runHandoffs();

      // Conversão: comprou até 30 dias depois de entrar no fluxo (os fluxos de pós-venda não contam)
      const converted = await dbQuery(
        `UPDATE flow_enrollments e
            SET converted_at = NOW(),
                status = CASE WHEN e.status = 'active' THEN 'stopped' ELSE e.status END,
                stop_reason = CASE WHEN e.status = 'active' THEN 'converted' ELSE e.stop_reason END,
                finished_at = CASE WHEN e.status = 'active' THEN NOW() ELSE e.finished_at END,
                next_run_at = CASE WHEN e.status = 'active' THEN NULL ELSE e.next_run_at END
           FROM leads l, remarketing_flows f
          WHERE l.id = e.lead_id AND f.id = e.flow_id
            AND e.converted_at IS NULL AND e.enrolled_at > NOW() - INTERVAL '30 days'
            AND LOWER(l.status) = ANY($1::text[])
            AND f.trigger_type <> 'purchase'
            AND LOWER(COALESCE(e.context->>'entry_stage', '')) <> LOWER(l.status)
            AND COALESCE(e.context->>'test', '') <> 'true'
          RETURNING e.flow_id`,
        [CONVERTED],
      );
      for (const row of converted.rows || []) {
        await dbQuery('UPDATE remarketing_flows SET conversions = conversions + 1 WHERE id = $1', [row.flow_id]);
      }
    } catch (err: any) {
      console.error('[FlowExecution] Verificação de respostas falhou:', err?.message);
    } finally {
      this.sweeping = false;
    }
  }

  private async handleReply(row: any) {
    const claimed = await dbQuery(
      `UPDATE flow_enrollments SET replied_at = NOW() WHERE id = $1 AND replied_at IS NULL AND status = 'active' RETURNING id`,
      [row.id],
    );
    if (!claimed.rows?.length) return;

    const settings = flowSettings(row.settings);
    const leadRes = await dbQuery('SELECT * FROM leads WHERE id = $1 AND user_id = $2', [row.lead_id, row.user_id]);
    const lead: FlowLead | undefined = leadRes.rows?.[0];
    if (!lead) return;
    const flow = { id: row.flow_id, name: row.flow_name };

    // Resposta em áudio: percebe-se pelo texto transcrito
    let text = String(row.reply ?? '');
    if (row.reply_media_type === 'audio' && row.reply_media_url) {
      text = (await transcribeReply(row.reply_media_url)) || '';
    }

    // "SAIR", "parar"…: sai de todos os fluxos e não volta a entrar
    if (text && OPT_OUT_RE.test(text)) {
      await this.addTag(lead, OPT_OUT_TAG);
      await this.stopAllFor(row, 'opt_out');
      return;
    }

    const conversationId: string | undefined = row.reply_conversation_id;
    const ctx = conversationId ? await conversationContext(conversationId) : { history: [], unanswered: true };
    const intent: ReplyIntent = text ? await classifyReply(text, ctx.history) : 'other';
    const target = conversationId ? await targetForConversation(conversationId, lead) : null;
    const assistant = await hasActiveAssistant(target?.channelId, row.user_id);
    const { stage, tag, notify, task, auto_reply: autoReply } = settings.on_reply;
    const leadLabel = row.lead_name || lead.name || 'Um lead';

    // Pós-venda e semelhantes: a sequência continua, mas o cliente não fica sem resposta
    if (!settings.stop_on_reply) {
      await this.scheduleHandoff(row, assistant, { reply: autoReply ?? DEFAULT_AUTO_REPLY, intent });
      if (notify !== false) {
        await this.notifyOnce(lead, 'flow_reply', `${leadLabel} respondeu`, `Ao fluxo "${row.flow_name}".`, row.flow_id);
      }
      return;
    }

    if (intent === 'not_interested') {
      await this.addTag(lead, NOT_INTERESTED_TAG);
      await this.stopAllFor(row, 'no_interest', 'O cliente disse que não tem interesse');
      if (!assistant && target) await this.sendQuickReply(lead, target, render(NOT_INTERESTED_REPLY), flow.id);
      if (notify !== false) {
        await this.notifyOnce(lead, 'flow_reply', `${leadLabel} não tem interesse`, `Ao fluxo "${row.flow_name}". Não volta a receber remarketing.`, row.flow_id);
      }
      return;
    }

    if (intent === 'later') {
      await this.addTag(lead, 'mais-tarde');
      await this.stopAllFor(row, 'later', 'O cliente pediu para falar mais tarde');
      await this.createFollowUpTask(lead, flow, `Voltar a falar com ${leadLabel}: pediu mais tarde`, 30 * 24);
      if (!assistant && target) await this.sendQuickReply(lead, target, render(LATER_REPLY), flow.id);
      return;
    }

    // Interessado, com dúvida ou por perceber: a conversa passa para a equipa ou para o assistente
    await this.finishReplied(row, intent);
    const status = String(lead.status || '').toLowerCase();
    if (stage && !CONVERTED.includes(status) && status !== String(stage).toLowerCase()) await this.moveStage(lead, String(stage));
    if (tag) await this.addTag(lead, String(tag));
    if (!assistant && task !== false) {
      await this.createFollowUpTask(lead, flow, `Responder a ${leadLabel}: respondeu ao fluxo`, 1);
    }
    if (notify !== false) {
      await this.notifyOnce(
        lead, 'flow_reply', `${leadLabel} respondeu`,
        assistant ? `Ao fluxo "${row.flow_name}". O assistente está a responder.` : `Ao fluxo "${row.flow_name}". A conversa é sua.`,
        row.flow_id,
      );
    }
    await this.scheduleHandoff(row, assistant, { reply: autoReply ?? DEFAULT_AUTO_REPLY, intent, personalize: settings.personalize });

    function render(textToRender: string) {
      return renderText(textToRender, lead as FlowLead, settings, settings.business_name);
    }
  }

  private async finishReplied(row: any, intent: ReplyIntent) {
    await dbQuery(
      `UPDATE flow_enrollments
          SET status = 'stopped', stop_reason = 'replied', finished_at = NOW(), next_run_at = NULL, log = log || $2::jsonb
        WHERE id = $1`,
      [row.id, JSON.stringify([{ at: new Date().toISOString(), note: `Respondeu (${intent})` }])],
    );
  }

  private async stopAllFor(row: any, reason: string, note?: string) {
    await dbQuery(
      `UPDATE flow_enrollments
          SET status = 'stopped', stop_reason = $3, finished_at = NOW(), next_run_at = NULL, log = log || $4::jsonb
        WHERE lead_id = $1 AND user_id = $2 AND status = 'active'`,
      [row.lead_id, row.user_id, reason, JSON.stringify(note ? [{ at: new Date().toISOString(), note }] : [])],
    );
  }

  /** Marca o que falta fazer se ninguém responder ao cliente (ver runHandoffs) */
  private async scheduleHandoff(row: any, assistant: boolean, data: { reply: string; intent: ReplyIntent; personalize?: boolean }) {
    const now = Date.now();
    const handoff = {
      conversation_id: row.reply_conversation_id,
      reply: data.reply,
      personalize: data.personalize === true,
      ack_at: new Date(assistant ? now + ASSISTANT_GRACE_MS : now).toISOString(),
      remind_at: new Date(now + HANDOFF_REMINDER_MS).toISOString(),
    };
    await dbQuery(
      `UPDATE flow_enrollments SET context = context || jsonb_build_object('handoff', $2::jsonb) WHERE id = $1`,
      [row.id, JSON.stringify(handoff)],
    );
  }

  /** Enquanto ninguém responde ao cliente: resposta automática e, passado um tempo, novo aviso */
  private async runHandoffs() {
    const res = await dbQuery(
      `SELECT e.*, f.name AS flow_name, f.settings
         FROM flow_enrollments e
         JOIN remarketing_flows f ON f.id = e.flow_id
        WHERE e.context ? 'handoff' AND e.replied_at > NOW() - INTERVAL '1 day'
        LIMIT 100`,
    );
    for (const row of res.rows || []) {
      try {
        await this.advanceHandoff(row);
      } catch (err: any) {
        console.error('[FlowExecution] Resposta ao cliente:', err?.message);
      }
    }
  }

  private async advanceHandoff(row: any) {
    const handoff = row.context.handoff;
    const clear = () => dbQuery(`UPDATE flow_enrollments SET context = context - 'handoff' WHERE id = $1`, [row.id]);

    // Já alguém respondeu (equipa ou assistente): não há mais nada a fazer
    const answered = await dbQuery(
      `SELECT 1 FROM messages
        WHERE conversation_id = $1 AND direction = 'out' AND created_at > $2
          AND COALESCE(metadata->>'source', '') NOT LIKE 'remarketing%'
        LIMIT 1`,
      [handoff.conversation_id, row.replied_at],
    );
    if (answered.rows?.length) return clear();

    const leadRes = await dbQuery('SELECT * FROM leads WHERE id = $1 AND user_id = $2', [row.lead_id, row.user_id]);
    const lead: FlowLead | undefined = leadRes.rows?.[0];
    if (!lead) return clear();

    const now = Date.now();
    if (handoff.ack_at && new Date(handoff.ack_at).getTime() <= now) {
      await this.acknowledge(row, lead, handoff);
      await dbQuery(`UPDATE flow_enrollments SET context = jsonb_set(context, '{handoff,ack_at}', 'null'::jsonb) WHERE id = $1`, [row.id]);
    }

    if (new Date(handoff.remind_at).getTime() <= now) {
      await notificationsService.createNotification(
        lead.user_id, 'flow_waiting', `${lead.name || 'Um lead'} continua à espera de resposta`,
        `Respondeu ao fluxo "${row.flow_name}" há 2 horas e ninguém lhe respondeu.`, 'alert-triangle',
        { leadId: lead.id, flowId: row.flow_id },
      ).catch(() => {});
      await clear();
    }
  }

  /** "Recebemos a sua mensagem": adaptada ao que o cliente disse, quando há IA */
  private async acknowledge(row: any, lead: FlowLead, handoff: any) {
    const base = String(handoff.reply ?? '');
    if (!base.trim()) return;
    const settings = flowSettings(row.settings);
    const target = await targetForConversation(handoff.conversation_id, lead);
    if (!target) return;

    // Vários fluxos podem parar com a mesma resposta: o cliente só recebe uma
    const recent = await dbQuery(
      `SELECT 1 FROM messages
        WHERE conversation_id = $1 AND metadata->>'source' = 'remarketing_ack' AND created_at > NOW() - INTERVAL '1 hour'
        LIMIT 1`,
      [handoff.conversation_id],
    );
    if (recent.rows?.length) return;

    let text = renderText(base, lead, settings, settings.business_name);
    if (handoff.personalize && isAiAvailable()) {
      const ctx = await conversationContext(handoff.conversation_id);
      const adapted = await contextualAcknowledgement({ history: ctx.history, leadName: lead.name, businessName: settings.business_name });
      if (adapted) text = adapted;
    }
    await this.sendQuickReply(lead, target, text, row.flow_id);
  }

  private async sendQuickReply(lead: FlowLead, target: FlowTarget, text: string, flowId: string) {
    const limit = await checkMessageLimit(lead.user_id, 'messages');
    if (!limit.allowed) return;
    try {
      const sent = await sendText(target, text);
      await saveOutgoing(lead, target, { content: sent.content, externalId: sent.externalId, flowId, source: 'remarketing_ack' });
    } catch (err: any) {
      console.warn('[FlowExecution] Resposta automática não enviada:', err?.message);
    }
  }
}

export const flowExecutionService = new FlowExecutionService();
