import { useMemo, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import type { Lead } from '../../types';
import { AppModal } from '../base/AppModal';
import { formatNumber, formatPercent } from '../../utils/format';
import { formatLeadStatus, getOriginInfo } from './leadDisplay';

interface OriginsListProps {
  leads: Lead[];
}

const selectClass =
  'mt-1.5 h-11 w-full rounded-lg border border-border bg-card px-3 text-[15px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30';

/**
 * "Leads por origem" no Início: só a lista (ícone, nome, número, percentagem) com uma
 * barra fina por linha — o gráfico de barras repetia os mesmos dados. Os filtros
 * (origem/estado) abrem num painel que sobe do fundo.
 */
export function OriginsList({ leads }: OriginsListProps) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [origin, setOrigin] = useState('');
  const [status, setStatus] = useState('');
  const [draftOrigin, setDraftOrigin] = useState('');
  const [draftStatus, setDraftStatus] = useState('');

  const originOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const lead of leads) {
      const info = getOriginInfo(lead.origem, lead.channelSource);
      map.set(info.key, info.label);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [leads]);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const lead of leads) if (lead.status) set.add(lead.status.toLowerCase());
    return [...set].sort();
  }, [leads]);

  const rows = useMemo(() => {
    const filtered = leads.filter((lead) => {
      if (status && (lead.status || '').toLowerCase() !== status) return false;
      if (origin && getOriginInfo(lead.origem, lead.channelSource).key !== origin) return false;
      return true;
    });
    const groups = new Map<string, { info: ReturnType<typeof getOriginInfo>; count: number }>();
    for (const lead of filtered) {
      const info = getOriginInfo(lead.origem, lead.channelSource);
      const g = groups.get(info.key);
      if (g) g.count++;
      else groups.set(info.key, { info, count: 1 });
    }
    const total = filtered.length || 1;
    return [...groups.values()]
      .sort((a, b) => b.count - a.count)
      .map((g) => ({ ...g, percent: (g.count / total) * 100 }));
  }, [leads, origin, status]);

  const activeFilters = (origin ? 1 : 0) + (status ? 1 : 0);

  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-semibold text-foreground">Leads por origem</h3>
        <button
          type="button"
          onClick={() => {
            setDraftOrigin(origin);
            setDraftStatus(status);
            setFilterOpen(true);
          }}
          className={`relative inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors hover:bg-muted ${activeFilters ? 'text-primary' : 'text-muted-foreground'}`}
          aria-label="Filtrar"
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span>Filtrar</span>
          {activeFilters > 0 && (
            <span className="ml-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">
              {activeFilters}
            </span>
          )}
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Sem leads com estes filtros</p>
      ) : (
        <ul className="space-y-3">
          {rows.map(({ info, count, percent }) => {
            const Icon = info.Icon;
            return (
              <li key={info.key}>
                <div className="flex items-center gap-3">
                  <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-muted ${info.color}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{info.label}</span>
                  <span className="text-sm font-semibold tabular-nums text-foreground">{formatNumber(count)}</span>
                  <span className="w-14 text-right text-xs tabular-nums text-muted-foreground">{formatPercent(percent)}</span>
                </div>
                <div className="ml-11 mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                  <div className={`h-full rounded-full ${info.bar}`} style={{ width: `${Math.max(2, percent)}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <AppModal
        open={filterOpen}
        onOpenChange={setFilterOpen}
        size="sm"
        title="Filtrar leads por origem"
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setOrigin('');
                setStatus('');
                setFilterOpen(false);
              }}
              className="h-10 rounded-lg border border-border px-4 text-sm font-medium text-foreground hover:bg-muted"
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={() => {
                setOrigin(draftOrigin);
                setStatus(draftStatus);
                setFilterOpen(false);
              }}
              className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Aplicar
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block text-sm font-medium text-foreground">
            Origem
            <select value={draftOrigin} onChange={(e) => setDraftOrigin(e.target.value)} className={selectClass}>
              <option value="">Todas</option>
              {originOptions.map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-foreground">
            Estado
            <select value={draftStatus} onChange={(e) => setDraftStatus(e.target.value)} className={selectClass}>
              <option value="">Todos</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>{formatLeadStatus(s)}</option>
              ))}
            </select>
          </label>
        </div>
      </AppModal>
    </section>
  );
}
