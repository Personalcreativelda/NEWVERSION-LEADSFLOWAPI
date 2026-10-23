import { Database, TrendingUp, CheckCircle2, Target } from 'lucide-react';
import { DashboardCard } from '../base/DashboardCard';
import { NUMBER_OPTS, formatPercent, getLocale } from '../../utils/format';

interface MainStatsCardsProps {
  totalLeads: number;
  leadsNovosHoje: number;
  leadsFechados: number;
  limiteLeads?: number; // Limite do plano
}

export default function MainStatsCards({ totalLeads, leadsNovosHoje, leadsFechados, limiteLeads = 100 }: MainStatsCardsProps) {
  // Calcular taxa de conversão
  const taxaConversao = totalLeads > 0 ? ((leadsFechados / totalLeads) * 100).toFixed(1) : '0';

  // Calcular progresso baseado no limite do plano (100% = limite do plano)
  // Para Total de Leads - progresso em relação ao limite
  const progressTotalLeads = limiteLeads > 0 ? Math.min((totalLeads / limiteLeads) * 100, 100) : 0;
  
  // Para Leads Captados Hoje - progresso em relação ao limite do plano
  const progressLeadsHoje = limiteLeads > 0 ? Math.min(100, (leadsNovosHoje / limiteLeads) * 100) : 0;
  
  // Para Leads Convertidos - mostrar como porcentagem do total de leads
  const progressConvertidos = totalLeads > 0 ? (leadsFechados / totalLeads) * 100 : 0;
  
  // Badges com formatação inteligente (mostrar decimal se < 10%)
  const formatPercentage = (value: number): string => {
    if (value === 0) return formatPercent(0);
    if (value < 0.1) return `< ${formatPercent(0.1)}`;
    return formatPercent(value, value < 10 ? 1 : 0);
  };

  const badgeTotalLeads = formatPercentage(progressTotalLeads);
  const badgeLeadsHoje = formatPercentage(progressLeadsHoje);
  const badgeConvertidos = formatPercentage(progressConvertidos);
  const badgeTaxaConversao = formatPercent(parseFloat(taxaConversao));

  const stats = [
    {
      id: 'total-leads-card',
      value: totalLeads.toLocaleString(getLocale(), NUMBER_OPTS),
      label: 'Total de Leads',
      icon: Database,
      iconColor: '#B794F6',
      badge: badgeTotalLeads,
      progressColor: '#B794F6',
      progress: progressTotalLeads,
    },
    {
      id: 'leads-today-card',
      value: leadsNovosHoje.toLocaleString(getLocale(), NUMBER_OPTS),
      label: 'Leads Captados Hoje',
      icon: TrendingUp,
      iconColor: '#5B9FED',
      badge: badgeLeadsHoje,
      progressColor: '#5B9FED',
      progress: progressLeadsHoje,
    },
    {
      id: 'leads-converted-card',
      value: leadsFechados.toLocaleString(getLocale(), NUMBER_OPTS),
      label: 'Leads Convertidos',
      icon: CheckCircle2,
      iconColor: '#00D9A3',
      badge: badgeConvertidos,
      progressColor: '#00D9A3',
      progress: progressConvertidos,
    },
    {
      id: 'conversion-rate-card',
      value: formatPercent(parseFloat(taxaConversao)),
      label: 'Taxa de Conversão',
      icon: Target,
      iconColor: '#FFA26B',
      badge: badgeTaxaConversao,
      progressColor: '#FFA26B',
      progress: parseFloat(taxaConversao),
    },
  ];

  return (
    <div className="stagger grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        const isPrimary = index === 0;
        return (
          <DashboardCard
            key={index}
            className="group"
            disableContentPadding
            style={isPrimary ? { transform: 'scale(1.02)' } : undefined}
          >
            <div id={stat.id} className="p-3 sm:p-5">
              {/* Header: icon + badge */}
              <div className="flex items-center justify-between mb-4">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${stat.iconColor}15` }}
                >
                  <Icon className="w-5 h-5" style={{ color: stat.iconColor }} />
                </div>

                <span
                  className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                  style={{ backgroundColor: `${stat.progressColor}12`, color: stat.progressColor }}
                >
                  {stat.badge}
                </span>
              </div>

              {/* Value */}
              <div className="mb-0.5">
                <span className="text-2xl sm:text-3xl font-semibold leading-tight text-foreground tracking-tight">
                  {stat.value}
                </span>
              </div>

              {/* Label */}
              <p className="text-xs text-muted-foreground mb-3">
                {stat.label}
              </p>

              {/* Progress bar */}
              <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${Math.min(100, stat.progress)}%`,
                    backgroundColor: stat.progressColor
                  }}
                />
              </div>
            </div>
          </DashboardCard>
        );
      })}
    </div>
  );
}

