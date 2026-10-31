/**
 * Procura leads para os fluxos que dependem do tempo: inativos há X dias, parados numa etapa há
 * X dias e conversas paradas há X horas. Quem entra e quando corre fica em flow_enrollments
 * (flow-execution.service). Cada volta inscreve um número limitado por fluxo: ativar um fluxo numa
 * base grande enche a fila aos poucos, em vez de tudo de uma vez.
 */
import { query as dbQuery } from '../database/connection';
import { flowExecutionService, flowSettings, OPT_OUT_TAG } from './flow-execution.service';

const SWEEP_MS = 5 * 60 * 1000;
const HOURLY_EVERY = 12; // inatividade e etapas: de 12 em 12 voltas (1 hora)
const MAX_PER_FLOW = 100;
const CLOSED_STAGES = ['convertido', 'converted', 'ganho', 'won', 'perdido', 'lost'];
const IDLE_MAX_HOURS = 23; // A Meta só deixa responder até 24 horas depois da última mensagem do cliente

const IDLE_TYPES: Record<string, string[]> = {
  whatsapp: ['whatsapp', 'whatsapp_cloud'],
  facebook: ['facebook', 'messenger'],
  instagram: ['instagram'],
  telegram: ['telegram'],
};
const ALL_IDLE_TYPES = ['whatsapp', 'whatsapp_cloud', 'facebook', 'messenger', 'instagram', 'telegram'];

/** Não voltar a inscrever quem está no fluxo ou passou por ele há pouco, nem quem pediu para sair */
const NOT_ENROLLED = (flowParam: string, daysParam: string) => `
  NOT EXISTS (
    SELECT 1 FROM flow_enrollments e
     WHERE e.flow_id = ${flowParam} AND e.lead_id = l.id
       AND (e.status = 'active' OR e.enrolled_at > NOW() - make_interval(days => ${daysParam}::int))
  )
  AND NOT ('${OPT_OUT_TAG}' = ANY(COALESCE(l.tags, ARRAY[]::text[])))`;

const firstNumber = (label: string) => {
  const n = parseInt(String(label).match(/(\d+)/)?.[1] || '', 10);
  return Number.isNaN(n) ? 0 : n;
};

async function enrollAll(flow: any, rows: any[], opts: { entryStage?: (row: any) => string } = {}) {
  for (const row of rows) {
    await flowExecutionService
      .enrollLead(flow, row.id, opts.entryStage ? { entryStage: opts.entryStage(row) } : {})
      .catch((err) => console.error(`[FlowScheduler] Lead ${row.id}:`, err?.message));
  }
}

/** Sem qualquer contacto (mensagens de qualquer lado) há X dias */
async function sweepInactive(flow: any) {
  const days = firstNumber(flow.trigger_label);
  if (days <= 0) return;
  const settings = flowSettings(flow.settings);
  const res = await dbQuery(
    `SELECT l.id
       FROM leads l
       LEFT JOIN LATERAL (
         SELECT MAX(c.last_message_at) AS last_message_at FROM conversations c WHERE c.lead_id = l.id
       ) conv ON TRUE
      WHERE l.user_id = $1
        AND LOWER(COALESCE(l.status, '')) <> ALL($2::text[])
        AND GREATEST(l.last_contact_at, conv.last_message_at, l.created_at) < NOW() - make_interval(days => $3::int)
        AND ${NOT_ENROLLED('$4', '$5')}
      LIMIT ${MAX_PER_FLOW}`,
    [flow.user_id, CLOSED_STAGES, days, flow.id, settings.reentry_days],
  );
  await enrollAll(flow, res.rows || []);
}

/** Parados na etapa há X dias, incluindo os que já lá estavam quando o fluxo foi ativado */
async function sweepStalled(flow: any) {
  const label = String(flow.trigger_label || '');
  const stage = label.split(' +')[0].trim().toLowerCase();
  const days = Number(label.match(/\+(\d+)/)?.[1] || 0);
  if (!stage || days <= 0) return;
  const settings = flowSettings(flow.settings);
  const res = await dbQuery(
    `SELECT l.id, l.status
       FROM leads l
      WHERE l.user_id = $1
        AND LOWER(l.status) = $2
        AND COALESCE(l.stage_changed_at, l.updated_at, l.created_at) < NOW() - make_interval(days => $3::int)
        AND ${NOT_ENROLLED('$4', '$5')}
      LIMIT ${MAX_PER_FLOW}`,
    [flow.user_id, stage, days, flow.id, settings.reentry_days],
  );
  await enrollAll(flow, res.rows || [], { entryStage: (row) => row.status });
}

/** Conversa parada há X horas, com o cliente a ter falado nas últimas 23 (Instagram, Messenger…) */
async function sweepIdleConversations(flow: any) {
  const hours = firstNumber(flow.trigger_label);
  if (hours <= 0 || hours >= IDLE_MAX_HOURS) return;
  const settings = flowSettings(flow.settings);
  const types = IDLE_TYPES[settings.channel] || ALL_IDLE_TYPES;
  const res = await dbQuery(
    `SELECT DISTINCT l.id
       FROM conversations c
       JOIN channels ch ON ch.id = c.channel_id
       JOIN leads l ON l.id = c.lead_id
      WHERE c.user_id = $1
        AND ch.type = ANY($2::text[])
        AND c.last_message_at < NOW() - make_interval(hours => $3::int)
        AND c.last_message_at > NOW() - make_interval(hours => ${IDLE_MAX_HOURS})
        AND EXISTS (
          SELECT 1 FROM messages m
           WHERE m.conversation_id = c.id AND m.direction = 'in'
             AND m.created_at > NOW() - make_interval(hours => ${IDLE_MAX_HOURS})
        )
        AND LOWER(COALESCE(l.status, '')) <> ALL($4::text[])
        AND ${NOT_ENROLLED('$5', '$6')}
      LIMIT ${MAX_PER_FLOW}`,
    [flow.user_id, types, hours, CLOSED_STAGES, flow.id, settings.reentry_days],
  );
  await enrollAll(flow, res.rows || []);
}

let turn = 0;

async function runSweep(): Promise<void> {
  const includeDaily = turn % HOURLY_EVERY === 0;
  turn += 1;
  try {
    const flows = await dbQuery(
      `SELECT * FROM remarketing_flows
        WHERE status = 'active' AND trigger_type = ANY($1::text[])`,
      [includeDaily ? ['inactivity', 'funnel_stage', 'conversation_idle'] : ['conversation_idle']],
    );
    for (const flow of flows.rows || []) {
      try {
        if (flow.trigger_type === 'inactivity') await sweepInactive(flow);
        else if (flow.trigger_type === 'funnel_stage') await sweepStalled(flow);
        else await sweepIdleConversations(flow);
      } catch (err: any) {
        console.error(`[FlowScheduler] Fluxo ${flow.id}:`, err?.message);
      }
    }
  } catch (err: any) {
    console.error('[FlowScheduler] Verificação falhou:', err?.message);
  }
}

export const inactivityScheduler = {
  start() {
    if (process.env.DISABLE_FLOW_WORKER === 'true') return;
    console.log('[FlowScheduler] Iniciado');
    setTimeout(() => {
      void runSweep();
      setInterval(() => { void runSweep(); }, SWEEP_MS).unref?.();
    }, 30_000).unref?.();
  },
};
