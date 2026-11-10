// Tarefas e lembretes ↔ Google Calendar. Cada tarefa (painel, fluxos, resumo da IA) passa a
// ser um evento no calendário ligado: criar, mudar a hora/título, concluir (✓ no título) e
// apagar/cancelar (sai do calendário). As marcações dos assistentes já criam o evento em
// appointments.service — aqui só se atualizam, não se duplicam (metadata.calendar_event_id).
import { query } from '../database/connection';
import { calendarConnection, createEvent, deleteEvent, updateEvent } from './google-calendar.service';

const DEFAULT_MINUTES = 30;
const DONE_MARK = '✓ ';

function eventFields(task: any) {
  const start = new Date(task.scheduled_at);
  const minutes = Math.min(Math.max(Number(task.metadata?.duration_minutes) || DEFAULT_MINUTES, 5), 480);
  const end = new Date(start.getTime() + minutes * 60_000);
  const lead = task.lead_name ? `\n\nLead: ${task.lead_name}${task.lead_phone ? ` (${task.lead_phone})` : ''}` : '';
  const summary = `${task.status === 'completed' ? DONE_MARK : ''}${task.title || 'Tarefa'}`;
  return { summary, description: `${task.description || ''}${lead}`.trim(), start, end };
}

async function saveEventId(taskId: string, userId: string, eventId: string | null) {
  await query(
    `UPDATE scheduled_conversations
        SET metadata = CASE WHEN $3::text IS NULL THEN COALESCE(metadata, '{}'::jsonb) - 'calendar_event_id'
                            ELSE COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('calendar_event_id', $3::text) END
      WHERE id = $1 AND user_id = $2`,
    [taskId, userId, eventId]
  );
}

// Uma sincronização de cada vez por tarefa (criar e logo editar não pode dar dois eventos)
const running = new Map<string, Promise<void>>();

/** Põe o calendário igual à tarefa, em segundo plano. Nunca falha o pedido de quem chamou. */
export function queueTaskSync(userId: string, taskId: string): Promise<void> {
  const prev = running.get(taskId) || Promise.resolve();
  const next = prev.then(() => syncTaskToCalendar(userId, taskId));
  running.set(taskId, next);
  void next.finally(() => { if (running.get(taskId) === next) running.delete(taskId); });
  return next;
}

export async function syncTaskToCalendar(userId: string, taskId: string): Promise<void> {
  try {
    if (!(await calendarConnection(userId))) return;
    const task = (await query(
      `SELECT sc.*, l.name AS lead_name, l.phone AS lead_phone FROM scheduled_conversations sc
         LEFT JOIN leads l ON l.id = sc.lead_id WHERE sc.id = $1 AND sc.user_id = $2`,
      [taskId, userId]
    )).rows[0];
    if (!task || isNaN(new Date(task.scheduled_at).getTime())) return;
    const eventId: string | undefined = task.metadata?.calendar_event_id;

    if (task.status === 'cancelled') {
      if (eventId) { await deleteEvent(userId, eventId); await saveEventId(taskId, userId, null); }
      return;
    }
    const fields = eventFields(task);
    if (eventId && (await updateEvent(userId, eventId, fields))) return;
    // Sem evento, ou foi apagado no Google: criar de novo
    const created = await createEvent(userId, fields);
    if (created) await saveEventId(taskId, userId, created);
  } catch (err: any) {
    console.warn('[TaskCalendar] Sincronizar tarefa:', err.message);
  }
}

/** A tarefa foi apagada: tira o evento do calendário (recebe a linha apagada) */
export async function removeTaskFromCalendar(userId: string, deletedTask: any): Promise<void> {
  const eventId = deletedTask?.metadata?.calendar_event_id;
  if (!eventId) return;
  try { await deleteEvent(userId, eventId); } catch (err: any) { console.warn('[TaskCalendar] Apagar evento:', err.message); }
}

/** Ao ligar o calendário: as tarefas pendentes que ainda vêm aí entram também (até 200) */
export async function backfillTasksToCalendar(userId: string): Promise<void> {
  try {
    const rows = (await query(
      `SELECT id FROM scheduled_conversations
        WHERE user_id = $1 AND status = 'pending' AND scheduled_at > NOW()
          AND (metadata->>'calendar_event_id') IS NULL
        ORDER BY scheduled_at ASC LIMIT 200`,
      [userId]
    )).rows;
    for (const r of rows) await queueTaskSync(userId, r.id);
  } catch (err: any) {
    console.warn('[TaskCalendar] Tarefas existentes:', err.message);
  }
}
