import { Users, MessageSquare, Mail, Crown, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { apiRequest } from '../../utils/api';
import { toast } from 'sonner';

interface PlanoWidgetProps {
  limites: {
    leads: number;
    mensagens: number;
    envios: number;
    usados: {
      leads: number;
      mensagens: number;
      envios: number;
    };
  };
  diasRestantes: number | null;
  onUpgrade: () => void;
  userPlan?: string;
  isTrial?: boolean;
  onRefresh?: () => Promise<void>;
}

export default function PlanoWidget({ limites, diasRestantes, onUpgrade, userPlan = 'free', isTrial = false, onRefresh }: PlanoWidgetProps) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (onRefresh && !refreshing) {
      setRefreshing(true);
      try {
        await onRefresh();
        toast.success('✅ Limites atualizados com sucesso!');
      } catch (error) {
        console.error('Error refreshing:', error);
        toast.error('Erro ao atualizar limites. Tente novamente.');
      } finally {
        setTimeout(() => setRefreshing(false), 1000);
      }
    }
  };

  // Calcular restantes ao invés de usados (nunca menor que 0)
  const restantesLeads = Math.max(0, limites.leads - limites.usados.leads);
  const restantesMensagens = Math.max(0, limites.mensagens - limites.usados.mensagens);
  const restantesEnvios = Math.max(0, limites.envios - limites.usados.envios);

  // Calcular percentuais (máximo 100%)
  const percLeads = limites.leads > 0 ? Math.min(100, (limites.usados.leads / limites.leads) * 100) : 0;
  const percMensagens = limites.mensagens > 0 ? Math.min(100, (limites.usados.mensagens / limites.mensagens) * 100) : 0;
  const percEnvios = limites.envios > 0 ? Math.min(100, (limites.usados.envios / limites.envios) * 100) : 0;

  // Determinar cor do círculo baseado no percentual
  const getCircleColor = (perc: number) => {
    if (perc >= 90) return { stroke: '#ef4444', bg: '#fee2e2', text: 'text-red-600' }; // red
    if (perc >= 75) return { stroke: '#f59e0b', bg: '#fef3c7', text: 'text-amber-600' }; // amber
    return { stroke: '#10b981', bg: '#d1fae5', text: 'text-emerald-600' }; // emerald
  };

  // Mapear nome do plano
  const getPlanName = () => {
    switch(userPlan) {
      case 'business':
      case 'business_monthly':
        return 'Plano Business';
      case 'professional':
      case 'professional_monthly':
        return 'Plano Professional';
      case 'enterprise':
      case 'enterprise_monthly':
        return 'Plano Enterprise';
      case 'unlimited':
      case 'unlimited_monthly':
        return 'Plano Unlimited';
      default:
        return 'Plano Gratuito';
    }
  };

  const limitCards = [
    {
      title: 'Leads',
      label: 'Restantes',
      usado: limites.usados.leads,
      restante: restantesLeads,
      total: limites.leads,
      percentual: percLeads,
      icon: Users,
      iconBg: 'bg-white/90 border border-border/40 shadow-sm dark:bg-white/10 dark:border-white/10 dark:shadow-none backdrop-blur-sm',
      iconColor: 'text-cyan-600 dark:text-cyan-300',
      colors: getCircleColor(percLeads),
    },
    {
      title: 'Mensagens Individuais',
      label: 'Restantes',
      usado: limites.usados.mensagens,
      restante: restantesMensagens,
      total: limites.mensagens,
      percentual: percMensagens,
      icon: MessageSquare,
      iconBg: 'bg-white/90 border border-border/40 shadow-sm dark:bg-white/10 dark:border-white/10 dark:shadow-none backdrop-blur-sm',
      iconColor: 'text-amber-600 dark:text-amber-300',
      colors: getCircleColor(percMensagens),
    },
    {
      title: 'Mensagens em Massa',
      label: 'Restantes',
      usado: limites.usados.envios,
      restante: restantesEnvios,
      total: limites.envios,
      percentual: percEnvios,
      icon: Mail,
      iconBg: 'bg-white/90 border border-border/40 shadow-sm dark:bg-white/10 dark:border-white/10 dark:shadow-none backdrop-blur-sm',
      iconColor: 'text-emerald-600 dark:text-emerald-300',
      colors: getCircleColor(percEnvios),
    },
  ];

  // SVG para círculo de progresso
  const CircularProgress = ({ percentage, colors }: { percentage: number; colors: { stroke: string; bg: string; text?: string } }) => {
    const radius = 45;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    return (
      <svg className="w-20 h-20 sm:w-24 sm:h-24 lg:w-28 lg:h-28 -rotate-90" viewBox="0 0 100 100">
        {/* Background circle - claro no modo claro, escuro no modo escuro */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          className="text-slate-200 dark:text-neutral-700"
        />
        {/* Progress circle */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={colors.stroke}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
    );
  };

  return (
    <div id="plan-limits-card" className="space-y-6">
      {/* Header simplificado com botões lado a lado */}
      <div id="dashboard-welcome" className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 md:gap-4">
        {/* Botão de Atualizar Limites - alinhado à esquerda */}
        {onRefresh && (
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="w-full md:w-auto px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-purple-500/20 dark:hover:bg-purple-500/30 text-gray-700 dark:text-purple-300 rounded-lg transition-colors text-sm font-medium flex items-center justify-center md:justify-start gap-2 disabled:opacity-50 border border-transparent dark:border-purple-500/30"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Atualizando...' : 'Atualizar Limites'}</span>
          </button>
        )}
        
        {/* Botão de Upgrade - alinhado à direita */}
        <button
          onClick={onUpgrade}
          data-upgrade-btn
          className="w-full md:w-auto bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white px-6 py-2.5 rounded-xl transition-all duration-300 flex items-center justify-center md:justify-start gap-2 shadow-md hover:shadow-lg font-semibold text-sm md:ml-auto"
        >
          <Crown className="w-4 h-4" />
          <span>Upgrade</span>
        </button>
      </div>

      {/* Grid de Cards Horizontais com Círculos */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 lg:gap-5">
        {limitCards.map((card, index) => {
          const Icon = card.icon;
          
          return (
            <div
              key={index}
              className="bg-card dark:bg-card rounded-xl sm:rounded-2xl p-3 sm:p-4 lg:p-5 border border-border dark:border-border shadow-sm hover:shadow-lg hover:shadow-purple-500/10 dark:hover:border-purple-500/40 transition-all duration-300"
            >
              {/* Header com ícone */}
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                <div className={`w-10 h-10 sm:w-11 sm:h-11 lg:w-12 lg:h-12 rounded-lg sm:rounded-xl ${card.iconBg} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-5 h-5 sm:w-6 sm:h-6 ${card.iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs sm:text-sm font-medium text-foreground dark:text-foreground truncate">
                    {card.title}
                  </h4>
                  <p className="text-[10px] sm:text-xs text-muted-foreground dark:text-muted-foreground">
                    {card.label}
                  </p>
                </div>
              </div>

              {/* Layout Horizontal: Valores + Círculo */}
              <div className="flex items-center justify-between">
                {/* Valores */}
                <div>
                  <div className="flex items-baseline gap-1 mb-0.5 sm:mb-1">
                    <span className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground dark:text-foreground">
                      {card.total === -1 ? '∞' : card.restante.toLocaleString()}
                    </span>
                    <span className="text-xs sm:text-sm text-muted-foreground">
                      / {card.total === -1 ? '∞' : card.total.toLocaleString()}
                    </span>
                  </div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">
                    Restantes
                  </p>
                </div>

                {/* Círculo de Progresso */}
                <div className="relative flex-shrink-0">
                  <CircularProgress percentage={card.percentual} colors={card.colors} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className={`text-sm sm:text-base lg:text-lg font-bold ${card.colors.text}`}>
                      {Math.round(card.percentual)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

