import { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import type { Lead } from '../../types';
import { LeadListRow } from './LeadListRow';

interface LatestLeadsProps {
  leads: Lead[];
  onViewAll: () => void;
  onOpen: (lead: Lead) => void;
  onMessage?: (lead: Lead) => void;
  onDelete?: (lead: Lead) => void;
}

const leadTime = (lead: Lead) => new Date(lead.data || lead.createdAt || lead.capturedAt || 0).getTime() || 0;

/** "Últimos leads" no Início: os 5 mais recentes + "Ver todos" (a lista completa vive na tab Leads) */
export function LatestLeads({ leads, onViewAll, onOpen, onMessage, onDelete }: LatestLeadsProps) {
  const latest = useMemo(() => [...leads].sort((a, b) => leadTime(b) - leadTime(a)).slice(0, 5), [leads]);

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-4 sm:px-5">
        <h3 className="text-[15px] font-semibold text-foreground">Últimos leads</h3>
        {leads.length > 0 && (
          <button
            type="button"
            onClick={onViewAll}
            className="inline-flex h-9 items-center gap-0.5 rounded-lg px-2 text-sm font-medium text-primary hover:bg-primary/10"
          >
            Ver todos
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
      {latest.length === 0 ? (
        <p className="px-4 pb-5 pt-2 text-sm text-muted-foreground sm:px-5">Ainda não tem leads.</p>
      ) : (
        <ul className="divide-y divide-border">
          {latest.map((lead) => (
            <LeadListRow key={lead.id} lead={lead} onOpen={onOpen} onMessage={onMessage} onDelete={onDelete} />
          ))}
        </ul>
      )}
    </section>
  );
}
