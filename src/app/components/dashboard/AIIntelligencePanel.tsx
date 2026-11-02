import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { api } from '../../../lib/api';
import { LoadingState } from '../base/LoadingState';
import { EmptyState } from '../base/EmptyState';
import { ErrorState } from '../base/ErrorState';
import { AppButton } from '../base/AppButton';
import { ChannelLogo } from '../base/ChannelLogo';
import { formatNumber, formatRelativeDay } from '../../utils/format';
import { cn } from '../ui/utils';
import { BUCKETS, bucketDot, displayName, type SalesQueue } from '../pages/AIInsightsPage';

interface AIIntelligencePanelProps {
  onNavigateToRemarketing?: () => void;
}

export default function AIIntelligencePanel({ onNavigateToRemarketing }: AIIntelligencePanelProps) {
  const [queue, setQueue] = useState<SalesQueue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setQueue(await api.aiRemarketing.opportunities());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && !queue) {
    return (
      <section className="h-full rounded-2xl border border-border bg-card p-4 sm:p-5">
        <h3 className="mb-2 text-[15px] font-semibold text-foreground">Assistente de vendas IA</h3>
        <LoadingState minHeight={140} />
      </section>
    );
  }

  const top = (queue?.items || []).slice(0, 4);

  // Mesmo estilo dos outros cartões do Início: título simples e linhas neutras
  return (
    <section className="h-full rounded-2xl border border-border bg-card p-4 sm:p-5 flex flex-col">
      <h3 className="mb-2 text-[15px] font-semibold text-foreground">Assistente de vendas IA</h3>
      {error || !queue ? (
        <ErrorState
          title="Não foi possível carregar"
          action={<AppButton size="sm" onClick={load}>Tentar novamente</AppButton>}
        />
      ) : top.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="Está tudo em dia" />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {BUCKETS.filter((b) => queue.counts[b.key] > 0).map((b) => (
              <span key={b.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn('h-2 w-2 rounded-full', b.dot)} />
                {b.label} <span className="font-semibold tabular-nums text-foreground">{formatNumber(queue.counts[b.key])}</span>
              </span>
            ))}
          </div>
          <ul className="divide-y divide-border">
            {top.map((o) => (
              <li key={o.lead_id} className="flex items-center gap-3 py-2.5">
                <span className="relative flex-shrink-0">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground" translate="no">
                    {displayName(o.name).charAt(0).toUpperCase()}
                  </span>
                  {o.channel && <ChannelLogo type={o.channel} className="absolute -bottom-1 -right-1 h-4 w-4 ring-2 ring-card" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[15px] font-medium text-foreground" translate="no">{displayName(o.name)}</span>
                    <span className="flex-shrink-0 text-xs text-muted-foreground tabular-nums">{formatRelativeDay(o.since, 'time')}</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={cn('h-1.5 w-1.5 flex-shrink-0 rounded-full', bucketDot(o.bucket))} />
                    <span className="truncate">{o.reason}</span>
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <AppButton variant="outline" className="w-full" onClick={onNavigateToRemarketing}>
            Ver todos
          </AppButton>
        </div>
      )}
    </section>
  );
}
