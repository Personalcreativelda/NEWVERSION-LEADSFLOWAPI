// Marcações feitas pelos assistentes: veem a agenda antes de propor, e marcam, remarcam ou
// desmarcam quando a conversa o confirma. Cada marcação é uma tarefa (scheduled_conversations)
// e, com o Google Calendar ligado, um evento no calendário.
import { query } from '../database/connection';
import { getWebSocketService } from './websocket.service';
import { createEvent, deleteEvent, getBusy, updateEvent, type BusySlot } from './google-calendar.service';
import { appTimezone, formatLocal, hhmmToMinutes, localMinutes, localToUtc, toLocalIso } from '../utils/timezone';

const fold = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const INTENT_WORDS = [
  'agend', 'marca', 'marcar', 'remarc', 'desmarc', 'cancel', 'adiar', 'antecipar', 'mudar a hora', 'mudar o dia', 'trocar o horario',
  'reuniao', 'consulta', 'visita', 'demonstra', 'demo', 'horario', 'disponib', 'vaga', 'que dia', 'que hora', 'quando posso', 'quando podemos',
  'amanha', 'hoje as', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo', 'semana que vem', 'proxima semana',
  'appointment', 'schedule', 'reschedule', 'book', 'meeting', 'tomorrow', 'cita', 'reunion', 'rendez-vous',
];

/** A conversa fala de marcações? (evita perguntar à IA ou ao calendário em todas as mensagens) */
export function hasSchedulingIntent(text: string): boolean {
  const t = fold(text);
  return INTENT_WORDS.some((w) => t.includes(w)) || /\b\d{1,2}\s*(h|:\d{2})\b/.test(t);
}

/** Opções de agenda do assistente (configuração própria, ou a do modelo do marketplace) */
export function agendaOptions(config: any, defaults: any = {}) {
  const pick = (k: string) => (config?.[k] !== undefined ? config[k] : defaults?.[k]);
  return {
    enabled: pick('calendar_check_enabled') !== false,
    startMin: hhmmToMinutes(pick('business_hours_start'), 9 * 60),
    endMin: hhmmToMinutes(pick('business_hours_end'), 18 * 60),
    durationMin: Math.min(Math.max(Number(pick('appointment_minutes')) || 60, 15), 240),
    workDays: Array.isArray(pick('business_days')) ? (pick('business_days') as number[]) : [1, 2, 3, 4, 5, 6],
  };
}

interface PendingAppointment { id: string; title: string; scheduled_at: Date; metadata: any }

export async function pendingForConversation(userId: string, conversationId: string): Promise<PendingAppointment[]> {
  const r = await query(
    `SELECT id, title, scheduled_at, metadata FROM scheduled_conversations
      WHERE user_id = $1 AND conversation_id = $2 AND status = 'pending' AND scheduled_at > NOW() - INTERVAL '1 day'
      ORDER BY scheduled_at ASC LIMIT 5`,
    [userId, conversationId]
  ).catch(() => ({ rows: [] as any[] }));
  return r.rows.map((x: any) => ({ ...x, scheduled_at: new Date(x.scheduled_at), metadata: x.metadata || {} }));
}

/** Horários ocupados: marcações do LeadsFlow + Google Calendar (se ligado) */
async function busySlots(userId: string, from: Date, to: Date, durationMin: number): Promise<{ slots: BusySlot[]; calendar: boolean }> {
  const own = await query(
    `SELECT scheduled_at, metadata FROM scheduled_conversations
      WHERE user_id = $1 AND status = 'pending' AND scheduled_at BETWEEN $2 AND $3`,
    [userId, from, to]
  ).catch(() => ({ rows: [] as any[] }));
  const slots: BusySlot[] = own.rows.map((r: any) => {
    const start = new Date(r.scheduled_at);
    const mins = Number(r.metadata?.duration_minutes) || durationMin;
    return { start, end: new Date(start.getTime() + mins * 60_000) };
  });
  const cal = await getBusy(userId, from, to);
  if (cal) slots.push(...cal);
  slots.sort((a, b) => a.start.getTime() - b.start.getTime());
  // Juntar sobreposições (o mesmo evento vem do LeadsFlow e do calendário)
  const merged: BusySlot[] = [];
  for (const s of slots) {
    const last = merged[merged.length - 1];
    if (last && s.start.getTime() <= last.end.getTime()) last.end = new Date(Math.max(last.end.getTime(), s.end.getTime()));
    else merged.push({ ...s });
  }
  return { slots: merged, calendar: !!cal };
}

const DAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** Bloco [AGENDA] para as instruções: agora, horário, dias, ocupados e as marcações deste cliente */
export async function agendaBlock(userId: string, conversationId: string, opts: ReturnType<typeof agendaOptions>): Promise<string> {
  const tz = appTimezone();
  const now = new Date();
  const to = new Date(now.getTime() + 14 * 86400_000);
  const { slots } = await busySlots(userId, now, to, opts.durationMin);
  const mine = await pendingForConversation(userId, conversationId);
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const busy = slots.slice(0, 40).map((s) => `- ${formatLocal(s.start, tz)} até ${hhmm(localMinutes(s.end, tz))}`).join('\n');
  return '\n\n---\n[AGENDA]\n' +
    `Agora: ${formatLocal(now, tz)} (${toLocalIso(now, tz)}, fuso ${tz}).\n` +
    `Horário de funcionamento: ${hhmm(opts.startMin)}–${hhmm(opts.endMin)}, dias: ${opts.workDays.map((d) => DAY_NAMES[d]).join(', ')}. ` +
    `Cada marcação dura ${opts.durationMin} minutos.\n` +
    (busy ? `Horários OCUPADOS nos próximos 14 dias (não proponha nem marque nestes):\n${busy}\n` : 'Não há horários ocupados nos próximos 14 dias.\n') +
    (mine.length ? `Marcações deste cliente: ${mine.map((m) => `"${m.title}" ${formatLocal(m.scheduled_at, tz)}`).join('; ')}.\n` : '') +
    'Proponha só horários livres, dentro do horário e dos dias acima, e nunca no passado. Confirme sempre dia da semana, dia e hora.\n---';
}

/** Um horário pedido está livre? (dentro do horário de funcionamento e sem sobreposição) */
export async function isSlotFree(userId: string, start: Date, opts: ReturnType<typeof agendaOptions>, ignoreId?: string): Promise<boolean> {
  const tz = appTimezone();
  const end = new Date(start.getTime() + opts.durationMin * 60_000);
  const startMin = localMinutes(start, tz);
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(start));
  if (start.getTime() < Date.now() - 5 * 60_000) return false;
  if (!opts.workDays.includes(weekday)) return false;
  if (startMin < opts.startMin || startMin + opts.durationMin > opts.endMin) return false;
  const own = await query(
    `SELECT id, scheduled_at, metadata FROM scheduled_conversations
      WHERE user_id = $1 AND status = 'pending' AND scheduled_at BETWEEN $2 AND $3`,
    [userId, new Date(start.getTime() - 4 * 3600_000), end]
  ).catch(() => ({ rows: [] as any[] }));
  for (const r of own.rows) {
    if (ignoreId && r.id === ignoreId) continue;
    const s = new Date(r.scheduled_at).getTime();
    const e = s + (Number(r.metadata?.duration_minutes) || opts.durationMin) * 60_000;
    if (s < end.getTime() && e > start.getTime()) return false;
  }
  const cal = await getBusy(userId, start, end);
  if (cal) {
    // O próprio evento (ao remarcar) não conta
    if (cal.some((b) => b.start < end && b.end > start)) {
      if (!ignoreId) return false;
      const moving = own.rows.find((r: any) => r.id === ignoreId);
      const ms = moving ? new Date(moving.scheduled_at).getTime() : 0;
      if (cal.some((b) => b.start < end && b.end > start && !(b.start.getTime() === ms))) return false;
    }
  }
  return true;
}

export interface SchedulingDecision {
  action: 'create' | 'reschedule' | 'cancel' | 'none';
  appointment_id?: string | null;
  local_datetime?: string | null;
  title?: string;
  description?: string;
  task_type?: string;
  priority?: string;
}

/** Lê a resposta da IA (JSON) */
export function parseDecision(raw: string | null | undefined): SchedulingDecision | null {
  const m = String(raw || '').replace(/```json|```/g, '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    const action = ['create', 'reschedule', 'cancel'].includes(j.action) ? j.action : 'none';
    return { ...j, action };
  } catch {
    return null;
  }
}

/** Prompt para decidir a ação de agenda a partir da última troca de mensagens */
export function decisionPrompt(now: Date, existing: PendingAppointment[]): string {
  const tz = appTimezone();
  return `Analise a conversa e diga se o ASSISTENTE acabou de CONFIRMAR uma marcação, uma remarcação ou uma desmarcação.
Agora: ${toLocalIso(now, tz)} (${formatLocal(now, tz)}), fuso ${tz}.
Marcações atuais deste cliente: ${existing.length ? existing.map((e) => `[id ${e.id}] "${e.title}" em ${toLocalIso(e.scheduled_at, tz)}`).join('; ') : 'nenhuma'}.
Responda APENAS com JSON:
{"action":"create"|"reschedule"|"cancel"|"none","appointment_id":"id da marcação (remarcar/desmarcar)","local_datetime":"AAAA-MM-DDTHH:mm na hora local (criar/remarcar)","title":"título curto, ex.: Consulta - João","description":"o que foi combinado","task_type":"meeting"|"call"|"follow-up","priority":"low"|"medium"|"high"}
Regras: "none" quando o assistente só está a propor opções ou a perguntar; só há ação quando a data e a hora ficaram confirmadas na resposta. Remarcar/desmarcar usa o id de uma marcação atual.`;
}

export interface AppointmentContext {
  userId: string;
  conversationId: string;
  leadId: string | null;
  leadName: string;
  contactPhone?: string;
  channelType: string;
  assistantName: string;
}

/** Aplica a decisão: tarefa + evento no calendário + nota na conversa. Devolve o que fez. */
export async function applyDecision(ctx: AppointmentContext, d: SchedulingDecision, opts: ReturnType<typeof agendaOptions>):
  Promise<{ done: 'created' | 'rescheduled' | 'cancelled' | 'skipped'; id?: string; reason?: string }> {
  const tz = appTimezone();
  const existing = await pendingForConversation(ctx.userId, ctx.conversationId);

  if (d.action === 'cancel') {
    const target = existing.find((e) => e.id === d.appointment_id) || (existing.length === 1 ? existing[0] : null);
    if (!target) return { done: 'skipped', reason: 'sem marcação para desmarcar' };
    await query(
      `UPDATE scheduled_conversations SET status = 'cancelled', updated_at = NOW(),
              metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('cancelled_at', NOW(), 'cancelled_by', 'ai_assistant')
        WHERE id = $1 AND user_id = $2`,
      [target.id, ctx.userId]
    );
    if (target.metadata?.calendar_event_id) await deleteEvent(ctx.userId, target.metadata.calendar_event_id);
    await note(ctx, `🤖 ${ctx.assistantName} desmarcou "${target.title}" (${formatLocal(target.scheduled_at, tz)}).`, target.id, 'cancelled');
    return { done: 'cancelled', id: target.id };
  }

  if (d.action !== 'create' && d.action !== 'reschedule') return { done: 'skipped' };
  const start = localToUtc(String(d.local_datetime || ''), tz);
  if (!start) return { done: 'skipped', reason: 'sem data' };
  const end = new Date(start.getTime() + opts.durationMin * 60_000);

  if (d.action === 'reschedule') {
    const target = existing.find((e) => e.id === d.appointment_id) || (existing.length === 1 ? existing[0] : null);
    if (!target) d.action = 'create';
    else {
      if (Math.abs(target.scheduled_at.getTime() - start.getTime()) < 60_000) return { done: 'skipped', reason: 'mesma hora' };
      if (opts.enabled && !(await isSlotFree(ctx.userId, start, opts, target.id))) return { done: 'skipped', reason: 'ocupado' };
      await query(
        `UPDATE scheduled_conversations SET scheduled_at = $3, updated_at = NOW(),
                metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('rescheduled_from', $4::text, 'rescheduled_by', 'ai_assistant')
          WHERE id = $1 AND user_id = $2`,
        [target.id, ctx.userId, start, target.scheduled_at.toISOString()]
      );
      if (target.metadata?.calendar_event_id) await updateEvent(ctx.userId, target.metadata.calendar_event_id, { start, end });
      await note(ctx, `🤖 ${ctx.assistantName} remarcou "${target.title}" para ${formatLocal(start, tz)}.`, target.id, 'rescheduled');
      return { done: 'rescheduled', id: target.id };
    }
  }

  // Marcar: sem duplicar (mesma conversa, ±30 min) e só num horário livre
  if (existing.some((e) => Math.abs(e.scheduled_at.getTime() - start.getTime()) < 30 * 60_000)) return { done: 'skipped', reason: 'já marcada' };
  if (opts.enabled && !(await isSlotFree(ctx.userId, start, opts))) return { done: 'skipped', reason: 'ocupado' };
  const title = String(d.title || `Marcação - ${ctx.leadName}`).slice(0, 255);
  const description = String(d.description || 'Marcado pelo assistente na conversa.').slice(0, 2000);
  const eventId = await createEvent(ctx.userId, {
    summary: title,
    description: `${description}\n\nCliente: ${ctx.leadName}${ctx.contactPhone ? ` (${ctx.contactPhone})` : ''}\nMarcado por ${ctx.assistantName} (LeadsFlow)`,
    start, end,
  });
  const row = (await query(
    `INSERT INTO scheduled_conversations (user_id, conversation_id, lead_id, title, description, scheduled_at, status, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7) RETURNING id`,
    [ctx.userId, ctx.conversationId, ctx.leadId, title, description, start, JSON.stringify({
      type: ['meeting', 'call', 'follow-up'].includes(String(d.task_type)) ? d.task_type : 'meeting',
      priority: ['low', 'medium', 'high', 'urgent'].includes(String(d.priority)) ? d.priority : 'medium',
      source: 'ai_assistant', assistant: ctx.assistantName, duration_minutes: opts.durationMin,
      ...(eventId ? { calendar_event_id: eventId } : {}),
    })]
  )).rows[0];
  await note(ctx, `🤖 ${ctx.assistantName} marcou "${title}" para ${formatLocal(start, tz)}.`, row.id, 'created');
  return { done: 'created', id: row.id };
}

/** Nota na conversa + aviso ao painel (Tarefas e inbox atualizam) */
async function note(ctx: AppointmentContext, text: string, appointmentId: string, change: string) {
  await query(
    `INSERT INTO messages (user_id, conversation_id, direction, channel, content, status, metadata)
     VALUES ($1, $2, 'out', $3, $4, 'sent', $5)`,
    [ctx.userId, ctx.conversationId, ctx.channelType, text, JSON.stringify({ source: 'funnel_automation', is_system: true, appointment_id: appointmentId, appointment_change: change })]
  ).catch(() => {});
  try {
    getWebSocketService()?.emitToUser(ctx.userId, 'ai_task_created', { task: { id: appointmentId, change, source: 'ai_assistant' }, timestamp: new Date().toISOString() });
  } catch { /* só o ecrã */ }
}
