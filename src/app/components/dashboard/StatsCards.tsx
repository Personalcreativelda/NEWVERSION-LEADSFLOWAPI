import { Users as UsersIcon, Target, CheckCircle2, TrendingUp, XCircle } from 'lucide-react';

interface StatsCardsProps {
  totalLeads: number;
  leadsNovosHoje: number;
  leadsFechados: number;
  leads?: Array<{
    id: string;
    status: string;
    [key: string]: any;
  }>;
  limites?: {
    leads: number;
    mensagens: number;
    envios: number;
    usados: {
      leads: number;
      mensagens: number;
      envios: number;
      whatsappMessages?: number;
      emailMessages?: number;
      massWhatsappMessages?: number;
      massEmailMessages?: number;
    };
  };
  isDark?: boolean;
}

export default function StatsCards({ totalLeads, leadsNovosHoje, leadsFechados, leads = [], limites, isDark = false }: StatsCardsProps) {
  // Contar leads por status real
  const leadsNovos = leads.filter(lead => {
    const status = lead.status?.toLowerCase().replace(/_/g, ' ');
    return status === 'novo' || status === 'new';
  }).length;
  
  const leadsEmNegociacao = leads.filter(lead => {
    const status = lead.status?.toLowerCase().replace(/_/g, ' ');
    return status === 'em negociacao' || 
           status === 'negociacao' ||
           status === 'in negotiation' ||
           status === 'negotiation';
  }).length;
  
  const leadsQualificados = leads.filter(lead => {
    const status = lead.status?.toLowerCase().replace(/_/g, ' ');
    return status === 'qualificado' ||
           status === 'qualified' ||
           status === 'aguardando resposta' ||
           status === 'waiting';
  }).length;
  
  const leadsPerdidos = leads.filter(lead => {
    const status = lead.status?.toLowerCase().replace(/_/g, ' ');
    return status === 'perdido' ||
           status === 'lost' ||
           status === 'descartado' ||
           status === 'rejeitado' ||
           status === 'rejected';
  }).length;

  const stats = [
    {
      title: 'Leads Novos',
      value: leadsNovos.toLocaleString(),
      icon: TrendingUp,
      iconBg: 'bg-blue-500/10',
      iconColor: 'text-blue-600 dark:text-blue-400',
    },
    {
      title: 'Em Negociação',
      value: leadsEmNegociacao.toLocaleString(),
      icon: Target,
      iconBg: 'bg-orange-500/10',
      iconColor: 'text-orange-600 dark:text-orange-400',
    },
    {
      title: 'Qualificados',
      value: leadsQualificados.toLocaleString(),
      icon: CheckCircle2,
      iconBg: 'bg-purple-500/10',
      iconColor: 'text-purple-600 dark:text-purple-400',
    },
    {
      title: 'Leads Perdidos',
      value: leadsPerdidos.toLocaleString(),
      icon: XCircle,
      iconBg: 'bg-red-500/10',
      iconColor: 'text-red-600 dark:text-red-400',
    },
  ];

  return (
    <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <div
            key={index}
            className="rounded-xl p-5 transition-all duration-200 bg-card border border-border enterprise-card enterprise-card-secondary"
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg ${stat.iconBg} flex items-center justify-center flex-shrink-0`}>
                <Icon className={`w-5 h-5 ${stat.iconColor}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-2xl font-semibold text-foreground tracking-tight">
                  {stat.value}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {stat.title}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

