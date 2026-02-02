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
      iconBg: 'bg-white/90 border border-border/40 shadow-sm dark:bg-white/10 dark:border-white/10 dark:shadow-none backdrop-blur-sm',
      iconColor: 'text-blue-600 dark:text-blue-300',
    },
    {
      title: 'Em Negociação',
      value: leadsEmNegociacao.toLocaleString(),
      icon: Target,
      iconBg: 'bg-white/90 border border-border/40 shadow-sm dark:bg-white/10 dark:border-white/10 dark:shadow-none backdrop-blur-sm',
      iconColor: 'text-orange-600 dark:text-orange-300',
    },
    {
      title: 'Qualificados',
      value: leadsQualificados.toLocaleString(),
      icon: CheckCircle2,
      iconBg: 'bg-white/90 border border-border/40 shadow-sm dark:bg-white/10 dark:border-white/10 dark:shadow-none backdrop-blur-sm',
      iconColor: 'text-purple-600 dark:text-purple-300',
    },
    {
      title: 'Leads Perdidos',
      value: leadsPerdidos.toLocaleString(),
      icon: XCircle,
      iconBg: 'bg-white/90 border border-border/40 shadow-sm dark:bg-white/10 dark:border-white/10 dark:shadow-none backdrop-blur-sm',
      iconColor: 'text-red-600 dark:text-red-300',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 lg:gap-5">
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <div
            key={index}
            className="rounded-lg sm:rounded-xl p-3 sm:p-4 lg:p-5 border shadow-sm hover:shadow-md transition-all duration-300 bg-card dark:bg-card border-border dark:border-border"
          >
            <div className="flex items-center gap-2 sm:gap-3 lg:gap-4">
              <div className={`w-9 h-9 sm:w-10 sm:h-10 lg:w-12 lg:h-12 rounded-lg sm:rounded-xl ${stat.iconBg} flex items-center justify-center flex-shrink-0`}>
                <Icon className={`w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 ${stat.iconColor}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-lg sm:text-xl lg:text-2xl font-bold text-foreground dark:text-foreground mb-0.5">
                  {stat.value}
                </p>
                <p className="text-[10px] sm:text-xs lg:text-sm text-muted-foreground dark:text-muted-foreground truncate">
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

