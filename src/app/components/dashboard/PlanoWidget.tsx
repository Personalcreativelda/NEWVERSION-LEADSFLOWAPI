import { Users, MessageSquare, Mail, Crown, RefreshCw, AlertTriangle, Clock } from 'lucide-react';
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
  planExpiresAt?: string | null;
  subscriptionStatus?: string | null;
  onUpgrade: () => void;
  userPlan?: string;
  isTrial?: boolean;
  onRefresh?: () => Promise<void>;
}

export default function PlanoWidget({ limites, diasRestantes, planExpiresAt, subscriptionStatus, onUpgrade, userPlan = 'free', isTrial = false, onRefresh }: PlanoWidgetProps) {
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

  // Verificar se algum limite está esgotado
  const isLeadsEsgotado = limites.leads > 0 && limites.leads !== -1 && restantesLeads === 0;
  const isMensagensEsgotado = limites.mensagens > 0 && limites.mensagens !== -1 && restantesMensagens === 0;
  const isEnviosEsgotado = limites.envios > 0 && limites.envios !== -1 && restantesEnvios === 0;
  const algumLimiteEsgotado = isLeadsEsgotado || isMensagensEsgotado || isEnviosEsgotado;

  // Estado do plano
  const isPlanPaid = userPlan !== 'free';
  const isPlanExpired = isPlanPaid && !!planExpiresAt && new Date(planExpiresAt) < new Date();
  const isPaymentOverdue = subscriptionStatus === 'past_due';
  const diasParaExpirar = diasRestantes ?? null;
  const isExpiringSoon = isPlanPaid && !isPlanExpired && diasParaExpirar !== null && diasParaExpirar <= 7 && diasParaExpirar > 0;

  // Determinar cor do círculo baseado no percentual
  const getCircleColor = (perc: number) => {
    if (perc >= 100) return { stroke: '#ef4444', bg: '#fee2e2', text: 'text-red-500 dark:text-red-400' }; // red - esgotado
    if (perc >= 90) return { stroke: '#ef4444', bg: '#fee2e2', text: 'text-red-600' }; // red
    if (perc >= 75) return { stroke: '#f59e0b', bg: '#fef3c7', text: 'text-amber-600' }; // amber
    return { stroke: '#10b981', bg: '#d1fae5', text: 'text-emerald-600' }; // emerald
  };

  const limitCards = [
    {
      title: 'Leads',
      label: isLeadsEsgotado ? '⚠️ Limite Esgotado' : 'Restantes',
      usado: limites.usados.leads,
      restante: restantesLeads,
      total: limites.leads,
      percentual: percLeads,
      icon: Users,
      iconBg: isLeadsEsgotado ? 'bg-red-500/10' : 'bg-muted',
      iconColor: isLeadsEsgotado ? 'text-red-500 dark:text-red-400' : 'text-cyan-600 dark:text-cyan-300',
      colors: getCircleColor(percLeads),
      esgotado: isLeadsEsgotado,
    },
    {
      title: 'Mensagens',
      label: isMensagensEsgotado ? '⚠️ Limite Esgotado' : 'Restantes',
      usado: limites.usados.mensagens,
      restante: restantesMensagens,
      total: limites.mensagens,
      percentual: percMensagens,
      icon: MessageSquare,
      iconBg: isMensagensEsgotado ? 'bg-red-500/10' : 'bg-muted',
      iconColor: isMensagensEsgotado ? 'text-red-500 dark:text-red-400' : 'text-amber-600 dark:text-amber-300',
      colors: getCircleColor(percMensagens),
      esgotado: isMensagensEsgotado,
    },
    {
      title: 'Campanhas',
      label: isEnviosEsgotado ? '⚠️ Limite Esgotado' : 'Restantes',
      usado: limites.usados.envios,
      restante: restantesEnvios,
      total: limites.envios,
      percentual: percEnvios,
      icon: Mail,
      iconBg: isEnviosEsgotado ? 'bg-red-500/10' : 'bg-muted',
      iconColor: isEnviosEsgotado ? 'text-red-500 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-300',
      colors: getCircleColor(percEnvios),
      esgotado: isEnviosEsgotado,
    },
  ];

  // SVG para círculo de progresso
  const CircularProgress = ({ percentage, colors }: { percentage: number; colors: { stroke: string; bg: string; text?: string } }) => {
    const radius = 45;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    return (
      <svg className="w-20 h-20 -rotate-90" viewBox="0 0 100 100">
        {/* Background circle - claro no modo claro, escuro no modo escuro */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          className="text-muted-foreground/20"
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
    <div id="plan-limits-card" className="space-y-4">
      {/* Header com botão de atualizar limites e botão de abrir modal de upgrade */}
      <div id="dashboard-welcome" className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 items-center w-full md:w-auto">
          {onRefresh && (
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="w-full md:w-auto px-4 py-2 bg-secondary hover:bg-secondary/80 text-foreground/80 rounded-lg transition-all duration-150 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 border border-border"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Atualizando...' : 'Atualizar Limites'}</span>
            </button>
          )}
        </div>

        <button
          onClick={onUpgrade}
          className={`w-full md:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-all duration-150 text-sm font-medium flex items-center justify-center gap-2 shadow-sm hover:shadow-md ${algumLimiteEsgotado ? 'hidden' : ''}`}
        >
          <Crown className="w-4 h-4" />
          <span>Fazer Upgrade</span>
        </button>
      </div>

      {/* Banner: Plano Expirado */}
      {isPlanExpired && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-500/20 rounded-full flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-red-500 dark:text-red-400">Plano Expirado</p>
              <p className="text-xs text-red-400/80 dark:text-red-400/60">
                Seu plano expirou. Renove sua assinatura para continuar.
              </p>
            </div>
          </div>
          <button
            onClick={onUpgrade}
            className="w-full sm:w-auto px-6 py-2.5 bg-destructive hover:opacity-90 text-white font-medium rounded-lg transition-all duration-150 text-sm flex items-center justify-center gap-2 shadow-sm"
          >
            <Crown className="w-4 h-4" />
            Renovar Plano
          </button>
        </div>
      )}

      {/* Banner: Pagamento Atrasado */}
      {!isPlanExpired && isPaymentOverdue && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center flex-shrink-0">
              <Clock className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-500 dark:text-amber-400">Pagamento em Atraso</p>
              <p className="text-xs text-amber-400/80 dark:text-amber-400/60">
                Regularize sua assinatura para não perder o acesso.
              </p>
            </div>
          </div>
          <button
            onClick={onUpgrade}
            className="w-full sm:w-auto px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-all duration-150 text-sm flex items-center justify-center gap-2 shadow-sm"
          >
            <Crown className="w-4 h-4" />
            Regularizar
          </button>
        </div>
      )}

      {/* Banner: Plano expirando em breve */}
      {isExpiringSoon && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center flex-shrink-0">
              <Clock className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-500 dark:text-amber-400">
                Plano expira em {diasParaExpirar} {diasParaExpirar === 1 ? 'dia' : 'dias'}
              </p>
              <p className="text-xs text-amber-400/80 dark:text-amber-400/60">
                Renove agora para não perder o acesso aos seus dados.
              </p>
            </div>
          </div>
          <button
            onClick={onUpgrade}
            className="w-full sm:w-auto px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-all duration-150 text-sm flex items-center justify-center gap-2 shadow-sm"
          >
            <Crown className="w-4 h-4" />
            Renovar Agora
          </button>
        </div>
      )}

      {/* Banner de alerta quando algum limite está esgotado */}
      {algumLimiteEsgotado && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-500/20 rounded-full flex items-center justify-center flex-shrink-0">
              <Crown className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-red-500 dark:text-red-400">
                Limite do plano atingido!
              </p>
              <p className="text-xs text-red-400/80 dark:text-red-400/60">
                Faça upgrade para continuar usando todos os recursos sem limitações.
              </p>
            </div>
          </div>
          <button
            onClick={onUpgrade}
            className="w-full sm:w-auto px-6 py-2.5 bg-destructive hover:opacity-90 text-white font-medium rounded-lg transition-all duration-150 text-sm flex items-center justify-center gap-2 shadow-sm"
          >
            <Crown className="w-4 h-4" />
            Upgrade Agora
          </button>
        </div>
      )}

      {/* Grid de Cards Horizontais com Círculos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
        {limitCards.map((card, index) => {
          const Icon = card.icon;
          
          return (
            <div
              key={index}
              className={`bg-card rounded-xl p-4 sm:p-5 border shadow-sm transition-all duration-200 ${
                card.esgotado 
                  ? 'border-red-500/40 ring-1 ring-red-500/20' 
                  : 'border-border hover:shadow-md'
              }`}
            >
              {/* Header com ícone */}
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${card.esgotado ? 'bg-red-500/10' : 'bg-muted'}`}>
                  <Icon className={`w-5 h-5 ${card.iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className={`text-sm font-medium truncate ${card.esgotado ? 'text-red-500 dark:text-red-400' : 'text-foreground'}`}>
                    {card.title}
                  </h4>
                  <p className={`text-xs ${card.esgotado ? 'text-red-400 font-semibold' : 'text-muted-foreground'}`}>
                    {card.label}
                  </p>
                </div>
              </div>

              {/* Layout Horizontal: Valores + Círculo */}
              <div className="flex items-center justify-between">
                {/* Valores */}
                <div>
                  <div className="flex items-baseline gap-1 mb-1">
                    <span className={`text-2xl font-bold ${card.esgotado ? 'text-red-500 dark:text-red-400' : 'text-foreground'}`}>
                      {card.total === -1 ? '∞' : card.restante.toLocaleString()}
                    </span>
                    <span className={`text-xs ${card.esgotado ? 'text-red-400/70' : 'text-muted-foreground'}`}>
                      / {card.total === -1 ? '∞' : card.total.toLocaleString()}
                    </span>
                  </div>
                  {card.esgotado ? (
                    <button
                      onClick={onUpgrade}
                      className="mt-1 px-2.5 py-1 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1"
                    >
                      <Crown className="w-3 h-3" />
                      Fazer Upgrade
                    </button>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Restantes
                    </p>
                  )}
                </div>

                {/* Círculo de Progresso */}
                <div className="relative flex-shrink-0">
                  <CircularProgress percentage={card.percentual} colors={card.colors} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className={`text-sm font-bold ${card.colors.text}`}>
                      {card.percentual === 0 ? '0' : Math.min(100, Math.ceil(card.percentual))}%
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

