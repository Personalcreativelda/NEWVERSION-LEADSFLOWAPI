import { useState, useEffect } from 'react';
import { Check, Crown, Zap, Rocket, Loader2, Calendar, Clock, History, ShieldCheck, AlertTriangle, XCircle, ExternalLink } from 'lucide-react';
import { Button } from '../ui/button';
import { plansApi } from '../../utils/api';
import { toast } from 'sonner';
import PaymentMethodModal from '../modals/PaymentMethodModal';

interface PlanPageProps {
  user: any;
  onUpgrade: () => void;
  diasRestantes?: number | null;
}

// Maps plan status to display info
function getStatusInfo(status: string | undefined, diasRestantes: number | null, plan = 'free') {
  // Only show "Gratuito" when the actual plan is free
  if (plan === 'free') return { label: 'Gratuito', color: 'bg-gray-500/15 text-gray-400 border-gray-500/30', icon: Zap };
  if (diasRestantes === 0 || status === 'expired') return { label: 'Expirado', color: 'bg-red-500/15 text-red-400 border-red-500/30', icon: XCircle };
  if (status === 'pending') return { label: 'Pendente', color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30', icon: Clock };
  if (status === 'overdue' || (diasRestantes !== null && diasRestantes <= 7 && diasRestantes > 0)) return { label: 'Atenção', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30', icon: AlertTriangle };
  return { label: 'Ativo', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', icon: ShieldCheck };
}

function fmt(dateStr: string | null | undefined) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtMoney(amount: number | null, currency = 'USD') {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(amount);
}

export default function PlanPage({ user, onUpgrade, diasRestantes = null }: PlanPageProps) {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly');
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [planForPayment, setPlanForPayment] = useState<string | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);

  const currentPlan = user?.plan || 'free';
  const subscriptionStatus = user?.subscriptionStatus || user?.subscription_status;

  const planNames: Record<string, string> = {
    free: 'Plano Gratuito',
    business: 'Plano Business',
    enterprise: 'Plano Enterprise',
  };

  const iconMap: Record<string, any> = { free: Zap, business: Rocket, enterprise: Crown };
  const colorMap: Record<string, string> = {
    free: 'from-gray-500 to-gray-600',
    business: 'from-blue-500 to-blue-600',
    enterprise: 'from-purple-500 to-purple-600',
  };
  const borderColorMap: Record<string, string> = {
    free: 'border-gray-500/40',
    business: 'border-blue-500/40',
    enterprise: 'border-purple-500/40',
  };
  const gradientMap: Record<string, string> = {
    free: 'from-gray-500/10 to-gray-600/5',
    business: 'from-blue-500/10 to-blue-600/5',
    enterprise: 'from-purple-500/10 to-purple-600/5',
  };

  const statusInfo = getStatusInfo(subscriptionStatus, diasRestantes, currentPlan);
  const StatusIcon = statusInfo.icon;
  const CurrentPlanIcon = iconMap[currentPlan] || Zap;

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const response = await plansApi.getPlans();
        if (response.success && response.plans) {
          setPlans(response.plans.map((plan: any) => ({
            id: plan.id,
            name: plan.name,
            icon: iconMap[plan.id] || Zap,
            color: colorMap[plan.id] || 'from-gray-500 to-gray-600',
            price: plan.price,
            paymentLinks: plan.paymentLinks || { monthly: null, annual: null },
            stripe: plan.stripe || { productId: null, priceMonthlyId: null, priceAnnualId: null },
            features: plan.features,
          })));
        }
      } catch (error) {
        console.error('[PlanPage] Error fetching plans:', error);
      } finally {
        setLoading(false);
      }
    };

    const fetchHistory = async () => {
      try {
        const response = await plansApi.getPaymentHistory();
        if (response.success) setPaymentHistory(response.history || []);
      } catch {
        // silently ignore
      } finally {
        setHistoryLoading(false);
      }
    };

    fetchPlans();
    fetchHistory();
  }, []);

  const handleSelectPlan = (planId: string) => {
    setPlanForPayment(planId);
    setShowPaymentModal(true);
  };

  const handleOpenPortal = async () => {
    setOpeningPortal(true);
    try {
      const res = await plansApi.createPortalSession();
      if (res?.url) {
        window.location.href = res.url;
      } else {
        toast.error('Não foi possível abrir o portal. Tente novamente.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao abrir o portal de gestão.');
    } finally {
      setOpeningPortal(false);
    }
  };

  const paymentProviderLabel: Record<string, string> = { stripe: 'Stripe', paypal: 'PayPal' };
  const paymentStatusLabel: Record<string, { label: string; cls: string }> = {
    completed: { label: 'Concluído', cls: 'bg-emerald-500/15 text-emerald-400' },
    pending:   { label: 'Pendente',  cls: 'bg-yellow-500/15 text-yellow-400' },
    failed:    { label: 'Falhou',    cls: 'bg-red-500/15 text-red-400' },
    refunded:  { label: 'Reembolso', cls: 'bg-blue-500/15 text-blue-400' },
  };

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-0 space-y-8 pb-12">

      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-foreground mb-1">Planos e Preços</h1>
        <p className="text-sm text-muted-foreground">Escolha o plano ideal para o seu negócio</p>
      </div>

      {/* ── CARD PLANO ATIVO ── */}
      <div className={`rounded-xl border-2 bg-gradient-to-br ${gradientMap[currentPlan] || 'from-gray-500/10 to-gray-600/5'} ${borderColorMap[currentPlan] || 'border-gray-500/40'} p-6`}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-6">

          {/* Icon + nome */}
          <div className="flex items-center gap-4 flex-1">
            <div className={`w-14 h-14 bg-gradient-to-br ${colorMap[currentPlan] || 'from-gray-500 to-gray-600'} rounded-xl flex items-center justify-center flex-shrink-0`}>
              <CurrentPlanIcon className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-foreground">{planNames[currentPlan] || 'Plano Atual'}</h2>
                <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border ${statusInfo.color}`}>
                  <StatusIcon className="w-3 h-3" />
                  {statusInfo.label}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">Subscrição atual da sua conta</p>
            </div>
          </div>

          {/* Datas */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:text-right">
            {user?.plan_activated_at || user?.planActivatedAt ? (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1 sm:justify-end">
                  <Calendar className="w-3 h-3" /> Ativação
                </p>
                <p className="text-sm font-semibold text-foreground">{fmt(user.plan_activated_at || user.planActivatedAt)}</p>
              </div>
            ) : null}

            {(user?.planExpiresAt || user?.plan_expires_at) ? (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1 sm:justify-end">
                  <Clock className="w-3 h-3" /> Expiração
                </p>
                <p className={`text-sm font-semibold ${diasRestantes === 0 ? 'text-red-400' : diasRestantes !== null && diasRestantes <= 7 ? 'text-amber-400' : 'text-foreground'}`}>
                  {fmt(user.planExpiresAt || user.plan_expires_at)}
                </p>
              </div>
            ) : null}

            {diasRestantes !== null && currentPlan !== 'free' ? (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5 sm:justify-end flex items-center gap-1 sm:ml-auto">
                  <ShieldCheck className="w-3 h-3" /> Restam
                </p>
                <p className={`text-sm font-semibold ${diasRestantes === 0 ? 'text-red-400' : diasRestantes <= 7 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {diasRestantes === 0 ? 'Expirado' : `${diasRestantes} dia${diasRestantes === 1 ? '' : 's'}`}
                </p>
              </div>
            ) : null}
          </div>

          {/* Botão de renovação + cancelamento */}
          <div className="flex flex-col gap-2 flex-shrink-0">
            {diasRestantes !== null && diasRestantes <= 7 && currentPlan !== 'free' && (
              <button
                onClick={onUpgrade}
                className="px-5 py-2.5 bg-primary text-primary-foreground hover:opacity-90 transition-all duration-150 rounded-lg font-medium transition-all shadow-lg text-sm"
              >
                {diasRestantes === 0 ? 'Renovar Agora' : 'Renovar'}
              </button>
            )}
            {currentPlan !== 'free' && (
              <button
                onClick={handleOpenPortal}
                disabled={openingPortal}
                className="px-5 py-2.5 border border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 rounded-lg font-medium transition-all text-sm flex items-center gap-2 disabled:opacity-50"
              >
                {openingPortal ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> A abrir portal...</>
                ) : (
                  <><ExternalLink className="w-4 h-4" /> Gerir Subscrição</>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── TOGGLE MENSAL / ANUAL ── */}
      <div className="flex justify-center">
        <div className="inline-flex items-center bg-muted/30 rounded-xl p-1 border border-border">
          <button
            onClick={() => setBillingPeriod('monthly')}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
              billingPeriod === 'monthly'
                ? 'bg-card text-foreground shadow-sm border border-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Mensal
          </button>
          <button
            onClick={() => setBillingPeriod('annual')}
            className={`relative px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
              billingPeriod === 'annual'
                ? 'bg-card text-foreground shadow-sm border border-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Anual
            <span className="ml-2 text-xs bg-emerald-500 text-white px-1.5 py-0.5 rounded-full">-20%</span>
          </button>
        </div>
      </div>

      {/* ── PLANOS ── */}
      {loading ? (
        <div className="flex justify-center items-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          <span className="ml-3 text-muted-foreground">Carregando planos...</span>
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const Icon = plan.icon;
            const isCurrentPlan = currentPlan === plan.id;
            const price = plan.price?.[billingPeriod] ?? 0;

            return (
              <div
                key={plan.id}
                className={`relative bg-card rounded-xl border-2 transition-all flex flex-col ${
                  isCurrentPlan
                    ? `${borderColorMap[plan.id] || 'border-blue-500'} shadow-lg`
                    : 'border-border hover:border-muted-foreground/40'
                }`}
              >
                {isCurrentPlan && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className={`bg-gradient-to-r ${colorMap[plan.id]} text-white text-xs font-medium px-3 py-1 rounded-full shadow`}>
                      Plano Atual
                    </span>
                  </div>
                )}

                <div className="p-6 flex flex-col flex-1">
                  {/* Icon + name */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-12 h-12 bg-gradient-to-br ${plan.color} rounded-xl flex items-center justify-center`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
                  </div>

                  {/* Price */}
                  <div className="mb-5">
                    <span className="text-4xl font-bold text-foreground">${price}</span>
                    <span className="text-muted-foreground text-sm ml-1">/{billingPeriod === 'monthly' ? 'mês' : 'ano'}</span>
                    {billingPeriod === 'annual' && price > 0 && (
                      <p className="text-xs text-emerald-400 mt-1">≈ ${(price / 12).toFixed(0)}/mês</p>
                    )}
                  </div>

                  {/* Features */}
                  <ul className="space-y-2.5 mb-6 flex-1">
                    {(plan.features || []).map((feature: string, i: number) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Buttons */}
                  {plan.id === 'free' ? (
                    <Button disabled className="w-full bg-muted text-muted-foreground cursor-not-allowed">
                      Plano Gratuito
                    </Button>
                  ) : isCurrentPlan ? (
                    <div className="grid gap-2">
                      <Button disabled className="w-full bg-muted text-muted-foreground cursor-not-allowed">
                        Plano Atual
                      </Button>
                      <Button
                        onClick={() => handleSelectPlan(plan.id)}
                        className="w-full bg-primary text-primary-foreground hover:opacity-90 transition-all duration-200 hover:scale-105"
                        size="sm"
                      >
                        Renovar Plano
                      </Button>
                    </div>
                  ) : (
                    <Button
                      onClick={() => handleSelectPlan(plan.id)}
                      className="w-full bg-primary text-primary-foreground hover:opacity-90 transition-all duration-200 hover:scale-105"
                    >
                      Selecionar Plano
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── HISTÓRICO DE PAGAMENTOS ── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
          <History className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-base font-semibold text-foreground">Histórico de Pagamentos</h2>
        </div>

        {historyLoading ? (
          <div className="flex justify-center items-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Carregando histórico...</span>
          </div>
        ) : paymentHistory.length === 0 ? (
          <div className="py-12 text-center">
            <History className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum pagamento registado ainda.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Os pagamentos via Stripe serão registados automaticamente.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Data</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Plano</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Ciclo</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Valor</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Cartão</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Método</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paymentHistory.map((item) => {
                  const st = paymentStatusLabel[item.status] || { label: item.status, cls: 'bg-gray-500/15 text-gray-400' };
                  return (
                    <tr key={item.id} className="hover:bg-muted/10 transition-colors">
                      <td className="px-6 py-4 text-foreground whitespace-nowrap">{fmt(item.created_at)}</td>
                      <td className="px-6 py-4">
                        <span className="capitalize font-medium text-foreground">{item.plan_id}</span>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground capitalize">
                        {item.billing_cycle === 'monthly' ? 'Mensal' : item.billing_cycle === 'annual' ? 'Anual' : item.billing_cycle || '—'}
                      </td>
                      <td className="px-6 py-4 font-semibold text-foreground">
                        {fmtMoney(item.amount, item.currency)}
                      </td>
                      <td className="px-6 py-4">
                        {item.card_brand && item.card_last4 ? (
                          <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
                            <span className="inline-flex items-center justify-center bg-blue-600 text-white text-xs font-bold px-1.5 py-0.5 rounded uppercase tracking-wide">
                              {item.card_brand}
                            </span>
                            •••• {item.card_last4}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {paymentProviderLabel[item.payment_provider] || item.payment_provider || '—'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${st.cls}`}>{st.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payment Method Modal */}
      <PaymentMethodModal
        isOpen={showPaymentModal}
        onClose={() => { setShowPaymentModal(false); setPlanForPayment(null); }}
        planId={planForPayment}
        billingPeriod={billingPeriod}
      />


    </div>
  );
}
