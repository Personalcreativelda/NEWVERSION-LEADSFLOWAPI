import { Database, TrendingUp, CheckCircle2, Target } from 'lucide-react';

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
    if (value === 0) return '0%';
    if (value < 0.1) return '<0.1%';
    if (value < 10) return `${value.toFixed(1)}%`;
    return `${Math.round(value)}%`;
  };

  const badgeTotalLeads = formatPercentage(progressTotalLeads);
  const badgeLeadsHoje = formatPercentage(progressLeadsHoje);
  const badgeConvertidos = formatPercentage(progressConvertidos);
  const badgeTaxaConversao = `${taxaConversao}%`;

  const stats = [
    {
      id: 'total-leads-card',
      value: totalLeads.toLocaleString(),
      label: 'Total de Leads',
      icon: Database,
      iconColor: '#B794F6', // Roxo
      bgColor: 'bg-white/90 border border-border/40 shadow-sm dark:bg-white/10 dark:border-white/10 dark:shadow-none backdrop-blur-sm',
      badge: badgeTotalLeads,
      progressColor: '#B794F6',
      progress: progressTotalLeads,
    },
    {
      id: 'leads-today-card',
      value: leadsNovosHoje.toLocaleString(),
      label: 'Leads Captados Hoje',
      icon: TrendingUp,
      iconColor: '#5B9FED', // Azul
      bgColor: 'bg-white/90 border border-border/40 shadow-sm dark:bg-white/10 dark:border-white/10 dark:shadow-none backdrop-blur-sm',
      badge: badgeLeadsHoje,
      progressColor: '#5B9FED',
      progress: progressLeadsHoje,
    },
    {
      id: 'leads-converted-card',
      value: leadsFechados.toLocaleString(),
      label: 'Leads Convertidos',
      icon: CheckCircle2,
      iconColor: '#00D9A3', // Verde
      bgColor: 'bg-white/90 border border-border/40 shadow-sm dark:bg-white/10 dark:border-white/10 dark:shadow-none backdrop-blur-sm',
      badge: badgeConvertidos,
      progressColor: '#00D9A3',
      progress: progressConvertidos,
    },
    {
      id: 'conversion-rate-card',
      value: `${taxaConversao}%`,
      label: 'Taxa de Conversão',
      icon: Target,
      iconColor: '#FFA26B', // Laranja
      bgColor: 'bg-white/90 border border-border/40 shadow-sm dark:bg-white/10 dark:border-white/10 dark:shadow-none backdrop-blur-sm',
      badge: badgeTaxaConversao,
      progressColor: '#FFA26B',
      progress: parseFloat(taxaConversao),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4 lg:gap-5 xl:gap-6">
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <div
            key={index}
            id={stat.id}
            className="relative bg-card dark:bg-card rounded-xl sm:rounded-2xl p-3 sm:p-5 lg:p-6 border border-border dark:border-border shadow-sm hover:shadow-md transition-all duration-300"
          >
            {/* Badge de percentagem no topo direito */}
            <div className="flex items-start justify-between gap-2 sm:gap-3 mb-2 sm:mb-4">
              {/* Ícone com cor de acento */}
              <div 
                className={`w-9 h-9 sm:w-11 sm:h-11 lg:w-12 lg:h-12 rounded-lg sm:rounded-xl ${stat.bgColor} flex items-center justify-center shadow-lg`}
                style={{ boxShadow: `0 8px 16px ${stat.iconColor}20` }}
              >
                <Icon className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6" style={{ color: stat.iconColor }} />
              </div>
              
              {/* Badge verde */}
              <span className="px-1.5 sm:px-2 lg:px-2.5 py-0.5 sm:py-1 bg-[#00D9A3]/10 text-[#00D9A3] rounded-full text-[9px] sm:text-[10px] lg:text-xs font-semibold">
                {stat.badge}
              </span>
            </div>

            {/* Valor grande */}
            <div className="mb-1">
              <span className="text-xl sm:text-2xl lg:text-3xl font-bold leading-tight text-foreground dark:text-foreground">
                {stat.value}
              </span>
            </div>

            {/* Label */}
            <p className="text-xs sm:text-sm text-muted-foreground dark:text-muted-foreground mb-2 sm:mb-4 truncate">
              {stat.label}
            </p>

            {/* Barra de progresso colorida */}
            <div className="w-full bg-muted dark:bg-muted rounded-full h-1.5 sm:h-2 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ 
                  width: `${Math.min(100, stat.progress)}%`,
                  backgroundColor: stat.progressColor
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

