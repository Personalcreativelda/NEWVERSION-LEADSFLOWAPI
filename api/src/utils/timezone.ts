// Horas locais da empresa (marcações, follow-ups, agenda). Por omissão Maputo; APP_TIMEZONE muda.
export const appTimezone = () => process.env.APP_TIMEZONE || 'Africa/Maputo';

/** Partes da data no fuso indicado */
function parts(date: Date, tz: string) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(date)) if (p.type !== 'literal') o[p.type] = Number(p.value);
  return o as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** Diferença (ms) entre a hora local do fuso e UTC, nesse instante */
function offsetMs(date: Date, tz: string): number {
  const p = parts(date, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000;
}

/** "2026-11-14T15:00" na hora local da empresa → instante certo (Date) */
export function localToUtc(local: string, tz = appTimezone()): Date | null {
  const m = String(local || '').match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  // Duas passagens: acerta também perto das mudanças de hora
  let t = guess - offsetMs(new Date(guess), tz);
  t = guess - offsetMs(new Date(t), tz);
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d;
}

/** "sexta-feira, 14/11 às 15:00" (hora local) */
export function formatLocal(date: Date, tz = appTimezone()): string {
  const weekday = new Intl.DateTimeFormat('pt-PT', { timeZone: tz, weekday: 'long' }).format(date);
  const day = new Intl.DateTimeFormat('pt-PT', { timeZone: tz, day: '2-digit', month: '2-digit' }).format(date);
  const time = new Intl.DateTimeFormat('pt-PT', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
  return `${weekday}, ${day} às ${time}`;
}

/** "2026-11-14T15:00" (hora local), para a IA ler e escrever datas sem fusos */
export function toLocalIso(date: Date, tz = appTimezone()): string {
  const p = parts(date, tz);
  const z = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${z(p.month)}-${z(p.day)}T${z(p.hour)}:${z(p.minute)}`;
}

/** Minutos desde a meia-noite (hora local) */
export function localMinutes(date: Date, tz = appTimezone()): number {
  const p = parts(date, tz);
  return p.hour * 60 + p.minute;
}

/** "09:00" → 540 */
export function hhmmToMinutes(v: unknown, fallback: number): number {
  const m = String(v || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? Math.min(23, +m[1]) * 60 + Math.min(59, +m[2]) : fallback;
}
