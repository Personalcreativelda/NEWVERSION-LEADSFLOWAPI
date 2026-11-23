import { Target, CheckCircle2, TrendingUp, XCircle } from 'lucide-react';
import { DashboardCard } from '../base/DashboardCard';
import { NUMBER_OPTS, getLocale } from '../../utils/format';

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

export default function StatsCards({ leads = [] }: StatsCardsProps) {
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
      title: 'Leads novos',
      value: leadsNovos.toLocaleString(getLocale(), NUMBER_OPTS),
      icon: TrendingUp,
      iconBg: 'bg-muted',
      iconColor: 'text-muted-foreground',
    },
    {
      title: 'Em negociação',
      value: leadsEmNegociacao.toLocaleString(getLocale(), NUMBER_OPTS),
      icon: Target,
      iconBg: 'bg-muted',
      iconColor: 'text-muted-foreground',
    },
    {
      title: 'Qualificados',
      value: leadsQualificados.toLocaleString(getLocale(), NUMBER_OPTS),
      icon: CheckCircle2,
      iconBg: 'bg-muted',
      iconColor: 'text-muted-foreground',
    },
    {
      title: 'Leads perdidos',
      value: leadsPerdidos.toLocaleString(getLocale(), NUMBER_OPTS),
      icon: XCircle,
      iconBg: 'bg-muted',
      iconColor: 'text-muted-foreground',
    },
  ];

  return (
    <div className="stagger grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <DashboardCard key={stat.title} disableContentPadding>
            {/* Telemóvel: ícone por cima (ao lado, o rótulo ficava cortado: "Em Negoci…") */}
            <div className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
              <div className={`w-10 h-10 rounded-lg ${stat.iconBg} flex items-center justify-center flex-shrink-0`}>
                <Icon className={`w-5 h-5 ${stat.iconColor}`} />
              </div>
              <div className="w-full min-w-0 sm:flex-1">
                <p className="text-2xl font-medium text-foreground tabular-nums">
                  {stat.value}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {stat.title}
                </p>
              </div>
            </div>
          </DashboardCard>
        );
      })}
    </div>
  );
}

