import { useState, useEffect, useCallback } from 'react';
import { api } from '../../../lib/api';
import { Brain, Flame, TrendingDown, Sparkles, RefreshCw, ChevronRight } from 'lucide-react';
import { DashboardCard } from '../base/DashboardCard';
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
      <DashboardCard
        className="h-full flex flex-col"
        title={
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Brain className="w-4 h-4 text-primary" />
            Assistente de vendas IA
          </span>
        }
      >
        <LoadingState minHeight={140} />
      </DashboardCard>
    );
  }

  const hasData = hotLeads.length > 0 || atRiskLeads.length > 0;

  return (
    <DashboardCard
      className="h-full flex flex-col"
      title={
        <span className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Brain className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="text-sm font-semibold text-foreground">Assistente de vendas IA</span>
          {(stats.hot_count ?? 0) > 0 && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 text-[10px] font-semibold">
              <Flame className="w-2.5 h-2.5" />
              {stats.hot_count}
            </span>
          )}
        </span>
      }
    >
      {error ? (
        <ErrorState
          title="Não foi possível carregar os insights"
          action={<AppButton size="sm" onClick={() => load(true)}>Tentar novamente</AppButton>}
        />
      ) : !hasData ? (
        <EmptyState
          title="Ainda sem análise de IA"
          description="Abra o Assistente de vendas IA no menu para analisar os seus leads."
          imgSrc="/assets/icons/empty/ic_content.svg"
        />
      ) : (
        <div className="space-y-4">
          {/* Hot Leads */}
          {hotLeads.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Flame className="w-3.5 h-3.5 text-orange-500" />
                <span className="text-xs font-medium text-foreground">Leads Quentes</span>
              </div>
              <div className="space-y-1.5">
                {hotLeads.map(lead => (
                  <div key={lead.id} className="flex items-center gap-2.5 py-1.5 px-3 rounded-lg bg-orange-500/5 border border-orange-500/10">
                    <div className="w-6 h-6 rounded-full bg-orange-500/15 flex items-center justify-center flex-shrink-0">
                      <span className="text-[9px] font-bold text-orange-600 dark:text-orange-400">
                        {(lead.name || 'L').charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{lead.name}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">{lead.status}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[10px] font-semibold text-orange-600 dark:text-orange-400">{lead.engagement_score}</span>
                      <span className="text-[10px] text-muted-foreground">{lead.conversion_probability}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* At-Risk Leads */}
          {atRiskLeads.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <TrendingDown className="w-3.5 h-3.5 text-red-500" />
                <span className="text-xs font-medium text-foreground">Em Risco</span>
              </div>
              <div className="space-y-1.5">
                {atRiskLeads.map(lead => {
                  const days = daysSince(lead.last_contact_at);
                  return (
                    <div key={lead.id} className="flex items-center gap-2.5 py-1.5 px-3 rounded-lg bg-red-500/5 border border-red-500/10">
                      <div className="w-6 h-6 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0">
                        <span className="text-[9px] font-bold text-red-600 dark:text-red-400">
                          {(lead.name || 'L').charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{lead.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {days !== null ? (days === 0 ? 'hoje' : `${days}d sem contacto`) : 'sem contacto'}
                        </p>
                      </div>
                      <span className={`text-[10px] font-medium flex-shrink-0 ${
                        lead.risk_level === 'high' ? 'text-red-500' : 'text-amber-500'
                      }`}>
                        {lead.risk_level === 'high' ? 'alto' : 'médio'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Footer CTA */}
          <button
            onClick={onNavigateToRemarketing}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all"
          >
            <Sparkles className="w-3 h-3" />
            Ver análise completa
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      )}
    </DashboardCard>
  );
}
