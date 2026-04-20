import { useState, useEffect, useCallback } from 'react';
import { api } from '../../../lib/api';
import { Brain, Flame, TrendingDown, Target, Sparkles, RefreshCw, ChevronRight, MessageSquare, Mail } from 'lucide-react';

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

  const load = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await api.aiRemarketing.insights();
      setHotLeads((data.hotLeads || []).slice(0, 3));
      setAtRiskLeads((data.atRiskLeads || []).slice(0, 3));
      setStats(data.stats || {});
    } catch {
      // silently fail — panel just won't show data
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
      <div className="bg-card border border-border rounded-2xl p-5 h-full flex flex-col">
        <div className="flex items-center gap-2 mb-4">
          <Brain className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">IA Insights</span>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const hasData = hotLeads.length > 0 || atRiskLeads.length > 0;

  return (
    <div className="bg-card border border-border rounded-2xl p-5 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Brain className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="text-sm font-semibold text-foreground">IA Insights</span>
          {(stats.hot_count ?? 0) > 0 && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 text-[10px] font-semibold">
              <Flame className="w-2.5 h-2.5" />
              {stats.hot_count}
            </span>
          )}
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Atualizar insights"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {!hasData ? (
        <div className="flex flex-col items-center justify-center flex-1 text-center py-6">
          <Brain className="w-8 h-8 text-muted-foreground/40 mb-2" />
          <p className="text-xs text-muted-foreground">Nenhum dado de IA ainda.</p>
          <p className="text-[11px] text-muted-foreground/70 mt-0.5">Abra Remarketing → IA Insights para analisar.</p>
        </div>
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
                          {days !== null ? (days === 0 ? 'hoje' : `${days}d sem contato`) : 'sem contato'}
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
    </div>
  );
}
