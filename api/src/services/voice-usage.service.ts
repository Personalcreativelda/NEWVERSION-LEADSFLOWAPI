// Consumo das chamadas dos agentes de voz (recebidas + feitas), por período de faturação.
//
// Limites do plano (users.service → limits):
//   voiceAgents       agentes (Business 1, Enterprise ilimitado)
//   voiceMinutes      minutos por período, chamadas recebidas e feitas somadas (-1 = sem limite)
//   voiceCallMinutes  duração máxima de cada chamada
// Proteções contra gastos do ElevenLabs:
//   - sem minutos → as chamadas recebidas são recusadas e não se pode ligar (até ao upgrade ou ao novo período)
//   - cada chamada é cortada no máximo do plano ou nos minutos que restam, o que for menor
//   - o mesmo número só pode ligar CALLER_MAX_CALLS vezes / CALLER_MAX_MINUTES minutos em 24 h
//   - o agente desliga ao fim de 20 s de silêncio (whatsapp-calls.service → agentBody)
//   - aviso no sino aos 80 % e aos 100 % dos minutos
import { query } from '../database/connection';
import { billingPeriodStart } from '../utils/billing-period';
import { getUserProfile } from './users.service';
import { notificationsService } from './notifications.service';

export const CALLER_MAX_CALLS = Number(process.env.VOICE_CALLER_MAX_CALLS) || 3;
export const CALLER_MAX_MINUTES = Number(process.env.VOICE_CALLER_MAX_MINUTES) || 20;
/** Abaixo disto não vale a pena atender nem ligar */
const MIN_SECONDS_TO_CALL = 30;

export interface VoiceUsage {
  agents_limit: number;
  minutes_limit: number;      // -1 = sem limite
  call_max_minutes: number;
  used_seconds: number;
  remaining_seconds: number;  // -1 = sem limite
  period_start: string;
}

// Chamadas em curso contam o tempo que já levam (duas chamadas em paralelo não passam o limite)
const USED_SQL = `
  SELECT COALESCE(SUM(CASE WHEN status = 'answered' AND started_at IS NOT NULL
                           THEN GREATEST(duration_seconds, EXTRACT(EPOCH FROM (NOW() - started_at))::int)
                           ELSE duration_seconds END), 0)::int AS used
    FROM voice_agent_calls
   WHERE user_id = $1 AND metadata->>'source' = 'whatsapp_call' AND created_at >= $2`;

export async function voiceUsage(userId: string): Promise<VoiceUsage> {
  const profile: any = await getUserProfile(userId);
  const limits = profile?.limits || {};
  const start = billingPeriodStart(profile?.plan, profile?.plan_activated_at);
  const used = Number((await query(USED_SQL, [userId, start])).rows[0]?.used) || 0;
  const minutes = Number(limits.voiceMinutes ?? 0);
  return {
    agents_limit: Number(limits.voiceAgents ?? 0),
    minutes_limit: minutes,
    call_max_minutes: Number(limits.voiceCallMinutes ?? 0) || 10,
    used_seconds: used,
    remaining_seconds: minutes === -1 ? -1 : Math.max(0, minutes * 60 - used),
    period_start: start.toISOString(),
  };
}

export interface Allowance { ok: boolean; maxSeconds: number; reason: string; code: string; usage: VoiceUsage }

/** Pode haver uma chamada agora? E durante quanto tempo no máximo? */
export async function callAllowance(userId: string): Promise<Allowance> {
  const usage = await voiceUsage(userId);
  if (usage.agents_limit === 0 || usage.minutes_limit === 0) {
    return { ok: false, maxSeconds: 0, code: 'PLAN', reason: 'O seu plano não inclui chamadas com agentes de voz', usage };
  }
  if (usage.remaining_seconds !== -1 && usage.remaining_seconds < MIN_SECONDS_TO_CALL) {
    return { ok: false, maxSeconds: 0, code: 'NO_MINUTES', reason: 'Os minutos de chamadas do seu plano acabaram. Melhore o plano para continuar.', usage };
  }
  const perCall = usage.call_max_minutes * 60;
  const maxSeconds = usage.remaining_seconds === -1 ? perCall : Math.min(perCall, usage.remaining_seconds);
  return { ok: true, maxSeconds, code: '', reason: '', usage };
}

/** O mesmo número a ligar vezes sem conta (ou a ficar à conversa) é recusado durante 24 h */
export async function callerBlocked(userId: string, phoneDigits: string): Promise<boolean> {
  if (!phoneDigits) return false;
  const r = await query(
    `SELECT COUNT(*)::int AS n, COALESCE(SUM(duration_seconds), 0)::int AS secs
       FROM voice_agent_calls
      WHERE user_id = $1 AND phone_number = $2 AND direction = 'inbound'
        AND metadata->>'source' = 'whatsapp_call' AND status IN ('answered', 'completed')
        AND created_at > NOW() - INTERVAL '24 hours'`,
    [userId, phoneDigits],
  );
  const row = r.rows[0] || {};
  return Number(row.n) >= CALLER_MAX_CALLS || Number(row.secs) >= CALLER_MAX_MINUTES * 60;
}

/** Avisos no sino aos 80 % e aos 100 % (uma vez por período) */
export async function notifyUsageThresholds(userId: string): Promise<void> {
  const usage = await voiceUsage(userId);
  if (usage.minutes_limit <= 0) return;
  const pct = usage.used_seconds / (usage.minutes_limit * 60);
  const level = pct >= 1 ? 100 : pct >= 0.8 ? 80 : 0;
  if (!level) return;
  const type = `voice_minutes_${level}`;
  const sent = await query(
    'SELECT 1 FROM notifications WHERE user_id = $1 AND type = $2 AND created_at >= $3 LIMIT 1',
    [userId, type, usage.period_start],
  );
  if (sent.rows.length) return;
  await notificationsService.createNotification(
    userId, type,
    level === 100 ? 'Minutos de chamadas esgotados' : 'Minutos de chamadas quase no fim',
    level === 100
      ? 'Os agentes de voz deixam de atender e ligar até melhorar o plano ou começar o próximo período.'
      : `Já usou ${Math.round(usage.used_seconds / 60)} de ${usage.minutes_limit} minutos deste período.`,
    'phone',
    { actionUrl: '/dashboard/voice-agents' },
    { actionUrl: '/dashboard/voice-agents', priority: level === 100 ? 'high' : 'normal' },
  ).catch(() => {});
}
