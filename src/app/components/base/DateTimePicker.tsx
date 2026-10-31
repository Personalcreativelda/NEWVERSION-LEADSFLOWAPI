// Escolher data e hora: calendário e horas num só campo, igual no computador e no telemóvel.
// O valor é o mesmo de um <input type="datetime-local"> ("2026-10-31T14:30", hora local).
// Abre dentro do formulário, por baixo do campo: numa janela flutuante, em ecrãs baixos o
// calendário saía do ecrã e, dentro de modais, não dava para fazer scroll.
import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { enUS, es, fr, pt } from 'date-fns/locale';
import { Calendar } from '../ui/calendar';
import { cn } from '../ui/utils';
import { getLocale } from '../../utils/format';

const QUICK_TIMES = ['09:00', '11:00', '14:00', '16:00'];
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
const CALENDAR_LOCALES: Record<string, typeof pt> = { pt, en: enUS, es, fr };

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Date → valor do campo */
export function toDateTimeValue(date: Date): string {
  return `${dayKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface DateTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Não deixa escolher datas e horas que já passaram */
  disablePast?: boolean;
  className?: string;
}

export function DateTimePicker({ value, onChange, placeholder = 'Escolher data e hora', disablePast, className }: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) panelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [open]);
  const [dayPart, timePart] = value ? value.split('T') : ['', ''];
  const selected = useMemo(() => (dayPart ? new Date(`${dayPart}T12:00`) : undefined), [dayPart]);
  const [hour, minute] = (timePart || '').split(':');

  const now = new Date();
  const today = dayKey(now);
  const isPast = (day: string, time: string) => !!disablePast && new Date(`${day}T${time}`).getTime() < now.getTime();

  /** Primeira hora livre de hoje; noutro dia, 09:00 */
  const defaultTime = (day: string) => {
    if (day !== today) return '09:00';
    const next = new Date(now.getTime() + 60 * 60_000);
    return next.getDate() === now.getDate() ? `${pad(next.getHours())}:00` : '23:55';
  };

  const pickDay = (date?: Date) => {
    if (!date) return;
    const day = dayKey(date);
    const keepTime = timePart && !isPast(day, timePart);
    onChange(`${day}T${keepTime ? timePart : defaultTime(day)}`);
  };
  const pickTime = (time: string) => onChange(`${dayPart || today}T${time}`);

  const label = value
    ? new Date(value).toLocaleString(getLocale(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : placeholder;
  const language = getLocale().slice(0, 2);
  const minuteOptions = minute && !MINUTES.includes(minute) ? [...MINUTES, minute].sort() : MINUTES;

  return (
    <div className="w-full min-w-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 text-left text-sm transition-colors hover:bg-muted/50',
          value ? 'text-foreground' : 'text-muted-foreground',
          className,
        )}
      >
        <span className="min-w-0 truncate" translate="no">{label}</span>
        <CalendarClock className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div ref={panelRef} className="mt-2 scroll-my-2 rounded-lg border border-border bg-card animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex justify-center" translate="no">
            <Calendar
              mode="single"
              selected={selected}
              defaultMonth={selected}
              onSelect={pickDay}
              locale={CALENDAR_LOCALES[language] || pt}
              disabled={disablePast ? { before: new Date(now.getFullYear(), now.getMonth(), now.getDate()) } : undefined}
            />
          </div>
          <div className="space-y-2 border-t border-border p-3">
            <div className="grid grid-cols-4 gap-1.5">
              {QUICK_TIMES.map((time) => (
                <button
                  key={time}
                  type="button"
                  disabled={isPast(dayPart || today, time)}
                  onClick={() => pickTime(time)}
                  className={cn(
                    'h-9 rounded-lg border text-sm tabular-nums transition-colors disabled:opacity-30',
                    timePart === time ? 'border-foreground/25 bg-muted font-medium text-foreground' : 'border-border text-muted-foreground hover:bg-muted/50',
                  )}
                >
                  {time}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <select aria-label="Hora" value={hour ?? ''} onChange={(e) => pickTime(`${e.target.value}:${minute || '00'}`)} className="min-w-0 flex-1 px-2 tabular-nums">
                {!hour && <option value="">--</option>}
                {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
              <span className="text-muted-foreground">:</span>
              <select aria-label="Minutos" value={minute ?? ''} onChange={(e) => pickTime(`${hour || defaultTime(dayPart || today).slice(0, 2)}:${e.target.value}`)} className="min-w-0 flex-1 px-2 tabular-nums">
                {!minute && <option value="">--</option>}
                {minuteOptions.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-10 flex-shrink-0 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:brightness-110"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
