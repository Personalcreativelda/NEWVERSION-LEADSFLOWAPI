// Lembretes do funil: agendamentos pendentes dos leads (ficha do lead, assistente de IA,
// página Agendamentos), mostrados ao entrar no funil e no cartão de cada lead.
import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, ChevronDown, X } from 'lucide-react';
import { scheduledConversationsApi } from '../../utils/api';
import type { ScheduledConversation } from '../../types';
import { getLocale } from '../../utils/format';
import { cn } from '../ui/utils';

/** Evento disparado quando um agendamento é criado/alterado (ficha do lead, página Agendamentos) */
export const SCHEDULES_CHANGED_EVENT = 'leadsflow:schedules-changed';

/** Próximo agendamento pendente de cada lead (para o cartão) */
export const LeadRemindersContext = createContext<Map<string, ScheduledConversation>>(new Map());

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "Hoje 15:00", "Amanhã 09:30", "Ontem 10:00", "12/10 14:00" */
export function reminderLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' });
  const days = Math.round((startOfDay(d) - startOfDay(new Date())) / 864e5);
  if (days === 0) return `Hoje ${time}`;
  if (days === 1) return `Amanhã ${time}`;
  if (days === -1) return `Ontem ${time}`;
  return `${d.toLocaleDateString(getLocale(), { day: '2-digit', month: '2-digit' })} ${time}`;
}

export const isOverdue = (iso: string) => new Date(iso).getTime() < Date.now();

export function useLeadReminders() {
  const [reminders, setReminders] = useState<ScheduledConversation[]>([]);

  const load = useCallback(async () => {
    try {
      const list = await scheduledConversationsApi.getAll({ status: 'pending' });
      setReminders((Array.isArray(list) ? list : [])
        .filter((s) => s.lead_id && s.scheduled_at)
        .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()));
    } catch {
      // Sem servidor: fica o que já está no ecrã
    }
  }, []);

  useEffect(() => {
    void load();
    window.addEventListener(SCHEDULES_CHANGED_EVENT, load);
    return () => window.removeEventListener(SCHEDULES_CHANGED_EVENT, load);
  }, [load]);

  const byLead = useMemo(() => {
    const map = new Map<string, ScheduledConversation>();
    for (const r of reminders) if (r.lead_id && !map.has(r.lead_id)) map.set(r.lead_id, r);
    return map;
  }, [reminders]);

  return { reminders, byLead, reload: load };
}

const DISMISS_KEY = 'funnel_reminders_hidden';
const COLLAPSED_COUNT = 3;

type LeadLike = { id: string; nome?: string; name?: string };

interface FunnelRemindersProps<L extends LeadLike> {
  reminders: ScheduledConversation[];
  leads: L[];
  onOpen: (lead: L) => void;
}

/** Bloco no topo do funil: atrasados primeiro, depois os próximos 7 dias */
export function FunnelReminders<L extends LeadLike>({ reminders, leads, onOpen }: FunnelRemindersProps<L>) {
  const [expanded, setExpanded] = useState(false);
  // Escondido até haver um lembrete novo (guarda-se o conjunto visto)
  const [hiddenSig, setHiddenSig] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) || ''; } catch { return ''; }
  });

  const leadById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);
  const weekAhead = Date.now() + 7 * 864e5;
  const items = reminders.filter((r) => r.lead_id && leadById.has(r.lead_id) && new Date(r.scheduled_at).getTime() <= weekAhead);
  const overdue = items.filter((r) => isOverdue(r.scheduled_at)).length;
  const signature = items.map((r) => r.id).join(',');

  if (items.length === 0 || hiddenSig === signature) return null;

  const shown = expanded ? items : items.slice(0, COLLAPSED_COUNT);

  return (
    <section className="mb-4 overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 px-4 py-2.5">
        <CalendarClock className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        <h2 className="flex-1 text-sm font-semibold text-foreground">Lembretes</h2>
        <span className="text-xs text-muted-foreground">
          {overdue > 0 && <span className="font-medium text-red-600 dark:text-red-400">{`${overdue} atrasado(s)`}</span>}
          {overdue > 0 && ' · '}
          {`${items.length} pendente(s)`}
        </span>
        <button
          type="button"
          onClick={() => {
            setHiddenSig(signature);
            try { sessionStorage.setItem(DISMISS_KEY, signature); } catch { /* sem armazenamento */ }
          }}
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Esconder lembretes"
          title="Esconder"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <ul className="divide-y divide-border border-t border-border">
        {shown.map((r) => {
          const lead = leadById.get(r.lead_id!)!;
          const late = isOverdue(r.scheduled_at);
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onOpen(lead)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50"
              >
                <span className={cn('h-2 w-2 flex-shrink-0 rounded-full', late ? 'bg-red-500' : 'bg-amber-500')} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground" translate="no">{r.title}</span>
                  <span className="block truncate text-xs text-muted-foreground" translate="no">{r.lead_name || lead.nome || lead.name}</span>
                </span>
                <span className={cn('flex-shrink-0 text-xs tabular-nums', late ? 'font-medium text-red-600 dark:text-red-400' : 'text-muted-foreground')}>
                  {reminderLabel(r.scheduled_at)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {items.length > COLLAPSED_COUNT && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-center gap-1 border-t border-border py-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        >
          {expanded ? 'Mostrar menos' : `Ver todos (${items.length})`}
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
        </button>
      )}
    </section>
  );
}
