import { useState, useEffect } from 'react';
import { Check, Crown, Zap, Rocket, Loader2, CreditCard, Wallet } from 'lucide-react';
import { Button } from '../ui/button';
import { plansApi } from '../../utils/api';
import { toast } from 'sonner';

interface PlanPageProps {
  user: any;
  onUpgrade: () => void;
  diasRestantes?: number | null;
}

export default function PlanPage({ user, onUpgrade, diasRestantes = null }: PlanPageProps) {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly');
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isStripeAvailable, setIsStripeAvailable] = useState(false);
  const currentPlan = user?.plan || 'free';
  const formattedPlanExpiry = user?.planExpiresAt
    ? new Date(user.planExpiresAt).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : null;
  const getPlanName = () => {
    switch(currentPlan) {
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

  // Icon mapping
  const iconMap: Record<string, any> = {
    free: Zap,
    business: Rocket,
    enterprise: Crown,
  };

  // Color mapping
  const colorMap: Record<string, string> = {
    free: 'from-gray-500 to-gray-600',
    business: 'from-blue-500 to-blue-600',
    enterprise: 'from-purple-500 to-purple-600',
  };

  // Fetch plans from database on mount
  useEffect(() => {
    const fetchPlans = async () => {
      try {
        console.log('[PlanPage] Fetching plans from database...');
        const response = await plansApi.getPlans();
        console.log('[PlanPage] Plans loaded:', response);

        if (response.success && response.plans) {
          // Map database plans to UI format
          const mappedPlans = response.plans.map((plan: any) => ({
            id: plan.id,
            name: plan.name,
            icon: iconMap[plan.id] || Zap,
            color: colorMap[plan.id] || 'from-gray-500 to-gray-600',
            price: plan.price,
            paymentLinks: plan.paymentLinks || { monthly: null, annual: null },
            stripe: plan.stripe || { productId: null, priceMonthlyId: null, priceAnnualId: null },
            features: plan.features,
            limits: plan.limits,
          }));
          setPlans(mappedPlans);
          setIsStripeAvailable(
            mappedPlans.some(
              (plan: any) => !!plan.stripe?.priceMonthlyId || !!plan.stripe?.priceAnnualId
            )
          );
        } else {
          console.error('[PlanPage] Invalid response format:', response);
          setIsStripeAvailable(false);
        }
      } catch (error) {
        console.error('[PlanPage] Error fetching plans:', error);
        // Fallback to hardcoded plans if database fails
        setPlans([
          {
            id: 'free',
            name: 'Free',
            icon: Zap,
            color: 'from-gray-500 to-gray-600',
            price: { monthly: 0, annual: 0 },
            paymentLinks: { monthly: null, annual: null },
            features: [
              '100 leads',
              '100 mensagens individuais/mês',
              '200 mensagens em massa/mês',
              '3 campanhas ativas',
              'Suporte básico',
            ],
          },
          {
            id: 'business',
            name: 'Business',
            icon: Rocket,
            color: 'from-blue-500 to-blue-600',
            price: { monthly: 30, annual: 100 },
            paymentLinks: { 
              monthly: 'https://www.paypal.com/ncp/payment/MJFXSMAZY9VPS', 
              annual: 'https://www.paypal.com/ncp/payment/ADJF2GY82HDCW' 
            },
            features: [
              '1.000 leads',
              '500 mensagens individuais/mês',
              '100 mensagens em massa/mês',
              '100 campanhas ativas',
              'Suporte prioritário',
              'Integrações avançadas',
            ],
          },
          {
            id: 'enterprise',
            name: 'Enterprise',
            icon: Crown,
            color: 'from-purple-500 to-purple-600',
            price: { monthly: 59, annual: 200 },
            paymentLinks: { 
              monthly: 'https://www.paypal.com/ncp/payment/6XX4G2TKPCA6Y', 
              annual: 'https://www.paypal.com/ncp/payment/ESX4B2DFC6AZL' 
            },
            features: [
              'Leads ilimitados',
              'Mensagens individuais ilimitadas',
              'Mensagens em massa ilimitadas',
              'Campanhas ilimitadas',
              'Suporte VIP 24/7',
              'API dedicada',
              'Gestor de conta',
            ],
          },
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchPlans();
  }, []);

  // Handle upgrade button click - prefer Stripe if configured, otherwise fallback to payment link
  const handleUpgradeClick = async (plan: any) => {
    const stripePriceId = billingPeriod === 'monthly'
      ? plan.stripe?.priceMonthlyId
      : plan.stripe?.priceAnnualId;

    if (stripePriceId) {
      setLoading(true);
      try {
        const response = await plansApi.createStripeCheckoutSession(plan.id, billingPeriod);
        if (response.success && response.sessionUrl) {
          window.location.href = response.sessionUrl;
          return;
        }
        toast.error('Falha ao iniciar checkout Stripe. Tente novamente.');
      } catch (error: any) {
        console.error('[PlanPage] Stripe checkout error:', error);
        toast.error(error.message || 'Erro ao iniciar pagamento Stripe.');
      } finally {
        setLoading(false);
      }
      return;
    }

    const paymentLink = billingPeriod === 'monthly'
      ? plan.paymentLinks?.monthly
      : plan.paymentLinks?.annual;

    if (paymentLink) {
      window.open(paymentLink, '_blank', 'noopener,noreferrer');
    } else {
      toast.error('Link de pagamento não configurado. Entre em contato com o suporte.');
    }
  };

  const handleStripeCheckout = async (plan: any) => {
    const stripePriceId = billingPeriod === 'monthly'
      ? plan.stripe?.priceMonthlyId
      : plan.stripe?.priceAnnualId;

    if (!stripePriceId) {
      toast.error('Stripe não está configurado para este período. Use PayPal abaixo.');
      return;
    }

    setLoading(true);
    try {
      const response = await plansApi.createStripeCheckoutSession(plan.id, billingPeriod);
      if (response.success && response.sessionUrl) {
        window.location.href = response.sessionUrl;
        return;
      }
      toast.error('Falha ao iniciar checkout Stripe. Tente novamente.');
    } catch (error: any) {
      console.error('[PlanPage] Stripe checkout error:', error);
      toast.error(error.message || 'Erro ao iniciar pagamento Stripe.');
    } finally {
      setLoading(false);
    }
  };

  const handlePayPalCheckout = (plan: any) => {
    const paymentLink = billingPeriod === 'monthly'
      ? plan.paymentLinks?.monthly
      : plan.paymentLinks?.annual;

    if (paymentLink) {
      window.open(paymentLink, '_blank', 'noopener,noreferrer');
      return;
    }

    toast.error('Link de pagamento PayPal não configurado para este plano.');
  };

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-0">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold text-foreground mb-2">
          Planos e Preços
        </h1>
        <p className="text-sm text-muted-foreground">
          Escolha o plano ideal para o seu negócio
        </p>
      </div>

      {/* Alerta do Plano Ativo com Status */}
      <div className="mb-8 rounded-lg border-2 bg-gradient-to-r from-purple-500/10 to-indigo-500/10 border-purple-500/40 p-6">
        <div className="flex items-center gap-4">
          <div className="flex-shrink-0">
            <div className="flex items-center justify-center h-12 w-12 rounded-md bg-purple-600 text-white">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-foreground">
              {getPlanName()} - Plano Ativo
            </h3>
            <div className="mt-2 flex flex-col gap-2">
              {diasRestantes !== null && (
                <p className={`text-sm font-medium ${
                  diasRestantes === 0
                    ? 'text-red-500'
                    : diasRestantes <= 7
                    ? 'text-amber-500'
                    : 'text-emerald-500'
                }`}>
                  {diasRestantes === 0
                    ? '🚨 Plano expirado - Renove agora para continuar usando'
                    : diasRestantes <= 7
                    ? `⚠️ ${diasRestantes} dia${diasRestantes === 1 ? '' : 's'} restante${diasRestantes === 1 ? '' : 's'}`
                    : `✅ ${diasRestantes} dias restantes`}
                </p>
              )}
              {formattedPlanExpiry && (
                <p className="text-xs text-muted-foreground">
                  Data de renovação: <strong>{formattedPlanExpiry}</strong>
                </p>
              )}
            </div>
          </div>
          {diasRestantes !== null && diasRestantes <= 7 && (
            <button
              onClick={onUpgrade}
              className="flex-shrink-0 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-lg font-medium transition-all shadow-lg"
            >
              Renovar
            </button>
          )}
        </div>
      </div>

      {!loading && plans.length > 0 && !isStripeAvailable && (
        <div className="mb-6 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-900">
          Stripe ainda não está configurado nos planos retornados pelo backend. O fluxo de upgrade usará o pagamento legado (PayPal) até que os IDs de preço Stripe sejam adicionados.
        </div>
      )}

      {/* Alerta de Expiração - Aparece apenas se houver diasRestantes */}
      {diasRestantes !== null && diasRestantes !== undefined && (
        <div 
          className={`mb-6 rounded-lg p-5 border transition-all duration-300 ${
            diasRestantes === 0 
              ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
              : diasRestantes <= 7
              ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800'
              : diasRestantes <= 30
              ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800'
              : 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800'
          }`} 
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
        >
          <div className="flex items-start gap-4">
            {/* Ícone */}
            <div className="flex-shrink-0 mt-0.5">
              {diasRestantes === 0 ? (
                <span className="text-2xl">🚨</span>
              ) : diasRestantes <= 7 ? (
                <span className="text-2xl">⚠️</span>
              ) : (
                <span className="text-2xl">ℹ️</span>
              )}
            </div>
            
            {/* Conteúdo */}
            <div className="flex-1 min-w-0">
              <h4 
                className={`font-semibold text-[15px] mb-1 ${
                  diasRestantes === 0
                    ? 'text-[#991B1B]'
                    : diasRestantes <= 7
                    ? 'text-[#92400E]'
                    : 'text-[#1E3A8A]'
                }`}
              >
                {diasRestantes === 0 
                  ? 'Plano Expirado' 
                  : `Seu plano expira em ${diasRestantes} ${diasRestantes === 1 ? 'dia' : 'dias'}`
                }
              </h4>
              <p 
                className={`text-[13px] leading-relaxed ${
                  diasRestantes === 0
                    ? 'text-[#7F1D1D]'
                    : diasRestantes <= 7
                    ? 'text-[#78350F]'
                    : 'text-[#1E40AF]'
                }`}
              >
                {diasRestantes === 0 
                  ? 'Todas as funcionalidades foram bloqueadas. Renove seu plano para continuar usando o LeadsFlowAPI.'
                  : 'Após este período, você precisará renovar para continuar usando o LeadsFlowAPI.'
                }
              </p>
            </div>

            {/* Botão de Ação */}
            <div className="flex-shrink-0">
              <button
                onClick={onUpgrade}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  diasRestantes === 0
                    ? 'bg-red-600 hover:bg-red-700 text-white shadow-sm hover:shadow-md'
                    : diasRestantes <= 7
                    ? 'border border-amber-600 text-amber-700 dark:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                    : 'border border-blue-600 text-blue-700 dark:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                }`}
              >
                {diasRestantes === 0 ? 'Renovar Agora' : 'Renovar Plano'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Billing Period Toggle */}
      <div className="flex justify-center mb-8">
        <div className="inline-flex items-center bg-gray-100 dark:bg-muted/20 rounded-lg p-1 border border-gray-200 dark:border-border">
          <button
            onClick={() => setBillingPeriod('monthly')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              billingPeriod === 'monthly'
                ? 'bg-white dark:bg-card text-gray-900 dark:text-foreground shadow-sm'
                : 'text-gray-600 dark:text-muted-foreground hover:text-gray-900 dark:hover:text-foreground'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingPeriod('annual')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              billingPeriod === 'annual'
                ? 'bg-white dark:bg-card text-gray-900 dark:text-foreground shadow-sm'
                : 'text-gray-600 dark:text-muted-foreground hover:text-gray-900 dark:hover:text-foreground'
            }`}
          >
            Annual
            <span className="ml-2 text-xs bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full">
              -20%
            </span>
          </button>
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          <span className="ml-3 text-muted-foreground">Carregando planos...</span>
        </div>
      ) : (
        /* Plans Grid */
        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((plan) => {
          const Icon = plan.icon;
          const isCurrentPlan = currentPlan === plan.id;
          const price = plan.price[billingPeriod];

          return (
            <div
              key={plan.id}
              className={`relative bg-card rounded-xl border-2 transition-all ${
                isCurrentPlan
                  ? 'border-blue-500 shadow-md'
                  : 'border-border hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              {isCurrentPlan && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-blue-600 text-white text-xs font-medium px-3 py-1 rounded-full">
                    Plano Atual
                  </span>
                </div>
              )}

              <div className="p-6">
                {/* Icon */}
                <div className={`w-12 h-12 bg-gradient-to-br ${plan.color} rounded-lg flex items-center justify-center mb-4`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>

                {/* Plan Name */}
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  {plan.name}
                </h3>

                {/* Price */}
                <div className="mb-6">
                  <span className="text-3xl font-bold text-foreground">
                    ${price}
                  </span>
                  <span className="text-muted-foreground">
                    /{billingPeriod === 'monthly' ? 'mês' : 'ano'}
                  </span>
                </div>

                {/* Features */}
                <ul className="space-y-3 mb-6">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-muted-foreground">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* Payment buttons */}
                {plan.id === 'free' ? (
                  <Button
                    disabled
                    className="w-full bg-muted text-muted-foreground cursor-not-allowed"
                  >
                    Plano Gratuito
                  </Button>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Button
                      onClick={() => handleStripeCheckout(plan)}
                      disabled={isCurrentPlan || loading || !(billingPeriod === 'monthly'
                        ? plan.stripe?.priceMonthlyId
                        : plan.stripe?.priceAnnualId)}
                      className={`w-full ${
                        isCurrentPlan || !(billingPeriod === 'monthly'
                          ? plan.stripe?.priceMonthlyId
                          : plan.stripe?.priceAnnualId)
                          ? 'bg-muted text-muted-foreground cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                    >
                      {isCurrentPlan ? (
                        'Plano Atual'
                      ) : (
                        <>
                          <CreditCard className="w-4 h-4 mr-2" />
                          Pagar com Stripe
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={() => handlePayPalCheckout(plan)}
                      disabled={isCurrentPlan || !(
                        billingPeriod === 'monthly'
                          ? plan.paymentLinks?.monthly
                          : plan.paymentLinks?.annual
                      )}
                      className={`w-full ${
                        isCurrentPlan || !(
                          billingPeriod === 'monthly'
                            ? plan.paymentLinks?.monthly
                            : plan.paymentLinks?.annual
                        )
                          ? 'bg-muted text-muted-foreground cursor-not-allowed'
                          : 'bg-[#0070ba] hover:bg-[#005a9c] text-white'
                      }`}
                    >
                      <Wallet className="w-4 h-4 mr-2" />
                      Pagar com PayPal
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        </div>
      )}
    </div>
  );
}

