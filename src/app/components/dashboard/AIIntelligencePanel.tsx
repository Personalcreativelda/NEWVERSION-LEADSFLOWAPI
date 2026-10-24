import { useState, useEffect, useCallback } from 'react';
import { api } from '../../../lib/api';
import { LoadingState } from '../base/LoadingState';
import { EmptyState } from '../base/EmptyState';
import { ErrorState } from '../base/ErrorState';
import { AppButton } from '../base/AppButton';

interface AILead {
  id: string;
  name: string;
  status: string;
  engagement_score: number;
  conversion_probability: number;
  risk_level: string;
  next_best_action: string;
  recommended_channel: string;
  last_contact_at?: string;
}

interface AIStats {
  hot_count?: number;
  high_risk_count?: number;
  avg_engagement?: number;
  avg_conversion?: number;
}

interface AIIntelligencePanelProps {
  onNavigateToRemarketing?: () => void;
}

export default function AIIntelligencePanel({ onNavigateToRemarketing }: AIIntelligencePanelProps) {
  const [hotLeads, setHotLeads] = useState<AILead[]>([]);
  const [atRiskLeads, setAtRiskLeads] = useState<AILead[]>([]);
  const [stats, setStats] = useState<AIStats>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    else setLoading(true);
    setError(false);
    try {
      const data = await api.aiRemarketing.insights();
      setHotLeads((data.hotLeads || []).slice(0, 3));
      setAtRiskLeads((data.atRiskLeads || []).slice(0, 3));
      setStats(data.stats || {});
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const daysSince = (date?: string) => {
    if (!date) return null;
    return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  };

  if (loading) {
    return (
      <section className="h-full rounded-2xl border border-border bg-card p-4 sm:p-5">
        <h3 className="mb-2 text-[15px] font-semibold text-foreground">Assistente de vendas IA</h3>
        <LoadingState minHeight={140} />
      </section>
    );
  }

  const hasData = hotLeads.length > 0 || atRiskLeads.length > 0;

  // Mesmo estilo dos outros cartões do Início (ex.: "Leads por origem"): título simples,
  // linhas neutras como na lista de leads e um selo à direita
  const Row = ({ lead, sub, chip, chipClass }: { lead: AILead; sub: string; chip: string; chipClass: string }) => (
    <li className="flex items-center gap-3 py-2.5">
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground">
        {(lead.name || 'L').charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-foreground">{lead.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{sub}</span>
      </span>
      <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${chipClass}`}>{chip}</span>
    </li>
  );

  return (
    <section className="h-full rounded-2xl border border-border bg-card p-4 sm:p-5 flex flex-col">
      <h3 className="mb-2 text-[15px] font-semibold text-foreground">Assistente de vendas IA</h3>
      {error ? (
        <ErrorState
          title="Não foi possível carregar a análise"
          action={<AppButton size="sm" onClick={() => load(true)}>Tentar novamente</AppButton>}
        />
      ) : !hasData ? (
        <EmptyState
          title="Ainda sem análise"
          description="Abra o Assistente de vendas IA no menu."
          imgSrc="/assets/icons/empty/ic_content.svg"
        />
      ) : (
        <div className="space-y-3">
          {hotLeads.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Mais prováveis de comprar</p>
              <ul className="divide-y divide-border">
                {hotLeads.map((lead) => (
                  <Row
                    key={lead.id}
                    lead={lead}
                    sub={`${lead.conversion_probability}% de probabilidade`}
                    chip="Quente"
                    chipClass="bg-orange-500/10 text-orange-600 dark:text-orange-400"
                  />
                ))}
              </ul>
            </div>
          )}

          {atRiskLeads.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Em risco</p>
              <ul className="divide-y divide-border">
                {atRiskLeads.map((lead) => {
                  const days = daysSince(lead.last_contact_at);
                  return (
                    <Row
                      key={lead.id}
                      lead={lead}
                      sub={days !== null ? (days === 0 ? 'Contactado hoje' : `${days} dias sem contacto`) : 'Sem contacto'}
                      chip={lead.risk_level === 'high' ? 'Risco alto' : 'Risco médio'}
                      chipClass={lead.risk_level === 'high' ? 'bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}
                    />
                  );
                })}
              </ul>
            </div>
          )}

          <AppButton variant="outline" className="w-full" onClick={onNavigateToRemarketing}>
            Ver análise completa
          </AppButton>
        </div>
      )}
    </section>
  );
}
