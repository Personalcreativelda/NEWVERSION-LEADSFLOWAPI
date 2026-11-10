// Follow-ups automáticos dos assistentes: quando o cliente deixa de responder a uma mensagem do
// assistente, este volta a escrever (com base na conversa, nunca uma mensagem genérica) nos
// intervalos definidos — por omissão 1 dia, depois 2 e depois 4.
//
// Não escreve: fora do horário do assistente; em conversas em espera ou resolvidas; quando a
// equipa já falou depois do assistente; a quem é cliente convertido/perdido ou tem as etiquetas
// "nao-contactar"/"sem-interesse"; a quem está num fluxo de remarketing ativo; nem fora da
// janela de 24 horas da Meta (Instagram/Messenger/WhatsApp oficial). Quando o cliente responde,
// a contagem recomeça. Cada volta envia no máximo 3 por conta (protege o número de bloqueios).
import { query } from '../database/connection';
import { AIService, getAvailableProviders, type AIMessage, type AIProvider } from './ai.service';
import { targetForConversation, isWindowOpen, sendText, saveOutgoing } from './flow-send.service';
import { GUARDRAIL_RULES, checkReply } from './guardrails.service';
import { appTimezone, hhmmToMinutes, localMinutes } from '../utils/timezone';

const ai = new AIService();
const DEFAULT_STEPS = [24, 48, 96];
const MAX_PER_ACCOUNT = 3;
const MAX_PER_RUN = 30;
const SKIP = '[[SEM_FOLLOWUP]]';

/** Intervalos (horas) entre cada follow-up, a partir da última mensagem enviada */
export function followupSteps(config: any, defaults: any): number[] {
  const raw = config?.followup_steps_hours ?? defaults?.followup_steps_hours;
  const list = Array.isArray(raw) ? raw.map(Number).filter((n) => n >= 1 && n <= 24 * 30) : [];
  return (list.length ? list : DEFAULT_STEPS).slice(0, 5);
}

export function followupEnabled(config: any, defaults: any): boolean {
  const v = config?.followup_enabled ?? defaults?.followup_enabled;
  return v === true || v === 'true';
}

/** Dentro do horário do assistente (hora local)? */
export function withinHours(config: any, defaults: any, now = new Date()): boolean {
  const pick = (k: string) => (config?.[k] !== undefined ? config[k] : defaults?.[k]);
  const start = hhmmToMinutes(pick('business_hours_start'), 8 * 60);
  const end = hhmmToMinutes(pick('business_hours_end'), 20 * 60);
  const m = localMinutes(now, appTimezone());
  return start <= end ? m >= start && m < end : m >= start || m < end;
}

export interface FollowupCandidate {
  conversation_id: string;
  user_id: string;
  lead_id: string;
  lead_name: string | null;
  lead_status: string | null;
  lead_tags: string[] | null;
  conv_metadata: any;
  ua_id: string;
  config: any;
  default_config: any;
  assistant_name: string;
  last_out_at: Date;
  last_in_at: Date | null;
}

/** Em que passo está e se já é altura (null = não escrever) */
export function dueStep(c: FollowupCandidate, now = Date.now()): number | null {
  const steps = followupSteps(c.config, c.default_config);
  const state = c.conv_metadata?.ai_followup || {};
  // O cliente respondeu depois do último follow-up: recomeça
  const lastIn = c.last_in_at ? new Date(c.last_in_at).getTime() : 0;
  const since = state.since ? new Date(state.since).getTime() : 0;
  const count = lastIn > since ? 0 : Number(state.count || 0);
  if (state.stopped && lastIn <= since) return null;
  if (count >= steps.length) return null;
  const waitedH = (now - new Date(c.last_out_at).getTime()) / 3600_000;
  return waitedH >= steps[count] ? count : null;
}

const STOP_TAGS = ['nao-contactar', 'sem-interesse', 'não-contactar'];

/** Conversas paradas à espera de resposta do cliente a uma mensagem do assistente */
async function candidates(): Promise<FollowupCandidate[]> {
  const r = await query(
    `SELECT c.id AS conversation_id, c.user_id, c.lead_id, c.metadata AS conv_metadata,
            l.name AS lead_name, l.status AS lead_status, l.tags AS lead_tags,
            ua.id AS ua_id, ua.config, a.default_config, a.name AS assistant_name,
            lm.created_at AS last_out_at,
            (SELECT MAX(m2.created_at) FROM messages m2 WHERE m2.conversation_id = c.id AND m2.direction = 'in') AS last_in_at
       FROM conversations c
       JOIN leads l ON l.id = c.lead_id
       JOIN user_assistants ua ON ua.user_id = c.user_id AND ua.is_active = true
                              AND (c.channel_id = ANY(ua.channel_ids) OR ua.channel_id = c.channel_id)
       JOIN assistants a ON a.id = ua.assistant_id
       JOIN LATERAL (
         SELECT m.direction, m.created_at, m.metadata FROM messages m
          WHERE m.conversation_id = c.id AND COALESCE(m.metadata->>'is_system', 'false') <> 'true'
          ORDER BY m.created_at DESC LIMIT 1
       ) lm ON true
      WHERE c.status = 'open'
        AND COALESCE(c.is_group, false) = false
        AND lm.direction = 'out'
        AND lm.metadata->>'source' IN ('ai_assistant', 'ai_followup')
        AND lm.created_at < NOW() - INTERVAL '1 hour'
        AND lm.created_at > NOW() - INTERVAL '45 days'
        AND COALESCE(l.status, '') NOT IN ('convertido', 'perdido')
        AND COALESCE((ua.config->>'followup_enabled')::boolean, (a.default_config->>'followup_enabled')::boolean, false) = true
        AND NOT EXISTS (SELECT 1 FROM flow_enrollments fe WHERE fe.lead_id = c.lead_id AND fe.status = 'active')
      ORDER BY lm.created_at ASC
      LIMIT 300`
  );
  return r.rows;
}

/** Mensagem de follow-up escrita pela IA a partir da conversa (null = melhor não escrever) */
export async function writeFollowup(c: FollowupCandidate, step: number, total: number): Promise<string | null> {
  const providers = getAvailableProviders(c.config?.ai_provider as AIProvider | undefined);
  if (providers.length === 0) return null;
  const instructions = String(c.config?.instructions || c.default_config?.instructions || '')
    .replace(/\[nome da empresa\]/gi, 'a nossa empresa');
  const history = await ai.getConversationHistory(c.conversation_id, 20);
  const last = step === total - 1;
  const system: AIMessage = {
    role: 'system',
    content: `${instructions}

---
[FOLLOW-UP ${step + 1} de ${total}]
O cliente não responde à última mensagem. Escreva UMA mensagem curta (1 ou 2 frases) para retomar a conversa:
- retome o assunto concreto da conversa (produto, dúvida, horário, proposta) — nunca uma mensagem genérica
- não repita a mensagem anterior nem peça desculpa por insistir
- termine com uma pergunta simples, fácil de responder
${last ? '- é a última tentativa: deixe a porta aberta com simpatia, sem pressão\n' : ''}- escreva no idioma do cliente, sem marcadores nem aspas
Se não fizer sentido escrever (o cliente despediu-se, já resolveu, disse que não quer, pediu para não contactar, ou a conversa terminou naturalmente), responda apenas ${SKIP}.
---${GUARDRAIL_RULES}`,
  };
  const res = await ai.generateResponseWithFallback([system, ...history], providers, c.config?.ai_model);
  const text = String(res.content || '').trim().replace(/^["“]|["”]$/g, '');
  if (!text || text.includes(SKIP) || text.length > 700) return null;
  const verdict = checkReply(text, instructions + GUARDRAIL_RULES);
  return verdict.safe ? text : null;
}

async function saveState(c: FollowupCandidate, patch: Record<string, unknown>) {
  await query(
    `UPDATE conversations SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('ai_followup', $2::jsonb) WHERE id = $1`,
    [c.conversation_id, JSON.stringify(patch)]
  );
}

/** Uma volta do trabalho: escreve os follow-ups que já estão na altura */
export async function runFollowups(): Promise<{ sent: number; skipped: number }> {
  let sent = 0, skipped = 0;
  const perAccount = new Map<string, number>();
  const list = await candidates();
  for (const c of list) {
    if (sent >= MAX_PER_RUN) break;
    if ((perAccount.get(c.user_id) || 0) >= MAX_PER_ACCOUNT) continue;
    if ((c.lead_tags || []).some((t) => STOP_TAGS.includes(String(t).toLowerCase()))) continue;
    if (!followupEnabled(c.config, c.default_config)) continue;
    const step = dueStep(c);
    if (step === null) continue;
    if (!withinHours(c.config, c.default_config)) continue;

    const target = await targetForConversation(c.conversation_id, { id: c.lead_id, user_id: c.user_id });
    if (!target) continue;
    // Instagram/Messenger/WhatsApp oficial: só dentro das 24 horas depois da última mensagem do cliente
    if (!isWindowOpen(target)) continue;

    const steps = followupSteps(c.config, c.default_config);
    const since = c.last_in_at ? new Date(c.last_in_at).toISOString() : null;
    try {
      const text = await writeFollowup(c, step, steps.length);
      if (!text) {
        await saveState(c, { count: step, since, stopped: true, at: new Date().toISOString() });
        skipped++;
        continue;
      }
      const result = await sendText(target, text);
      await saveOutgoing({ id: c.lead_id, user_id: c.user_id }, target, { content: result.content, externalId: result.externalId, source: 'ai_followup' });
      await saveState(c, { count: step + 1, since, at: new Date().toISOString() });
      await query(
        `INSERT INTO assistant_logs (user_assistant_id, conversation_id, message_in, message_out, status, metadata)
         VALUES ($1, $2, '', $3, 'success', $4)`,
        [c.ua_id, c.conversation_id, result.content, JSON.stringify({ followup: step + 1, of: steps.length })]
      ).catch(() => {});
      perAccount.set(c.user_id, (perAccount.get(c.user_id) || 0) + 1);
      sent++;
    } catch (err: any) {
      console.warn(`[Followup] Conversa ${c.conversation_id}:`, err.message);
      skipped++;
    }
  }
  if (sent) console.log(`[Followup] ✅ ${sent} follow-up(s) enviados`);
  return { sent, skipped };
}

let timer: NodeJS.Timeout | null = null;
let running = false;

/** De 5 em 5 minutos (DISABLE_FOLLOWUP_WORKER=true desliga) */
export function startFollowupWorker() {
  if (timer || process.env.DISABLE_FOLLOWUP_WORKER === 'true') return;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await runFollowups(); } catch (err: any) { console.error('[Followup] Erro:', err.message); } finally { running = false; }
  };
  setTimeout(tick, 90_000);
  timer = setInterval(tick, 5 * 60_000);
}
