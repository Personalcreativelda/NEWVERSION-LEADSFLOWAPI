import { useState, useEffect } from 'react';
import { plansApi } from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Check, Loader2, Zap, Rocket, CreditCard, Crown, X } from 'lucide-react';
import PaymentMethodModal from './PaymentMethodModal';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPlan: string;
  onUpgradeSuccess: (newPlan: any) => void;
}

export default function UpgradeModal({
  isOpen,
  onClose,
  currentPlan,
  onUpgradeSuccess,
}: UpgradeModalProps) {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [planForPayment, setPlanForPayment] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadPlans();
    }
  }, [isOpen]);

  const loadPlans = async () => {
    try {
      const response = await plansApi.getPlans();
      if (response.success) {
        setPlans(response.plans);
      }
    } catch (error) {
      console.error('Error loading plans:', error);
    }
  };

  const handleSelectPlan = (planId: string) => {
    if (planId === currentPlan) {
      return;
    }

    if (planId !== 'free') {
      // Abrir modal de pagamento para planos pagos
      setPlanForPayment(planId);
      setShowPaymentModal(true);
      return;
    }

    // Para plano free, processar diretamente
    handleFreeUpgrade(planId);
  };

  const handleFreeUpgrade = async (planId: string) => {
    setLoading(true);
    setSelectedPlan(planId);

    try {
      const response = await plansApi.upgrade(planId);
      if (response.success) {
        toast.success('Plano atualizado para Free!');
        onUpgradeSuccess(response.user);
        onClose();
      }
    } catch (error: any) {
      console.error('Error upgrading plan:', error);
      const errorMessage = error.message || 'Erro ao atualizar plano. Tente novamente.';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
      setSelectedPlan(null);
    }
  };

  const handleUpgrade = async (planId: string) => {
    if (planId === currentPlan) {
      return;
    }

    const selected = plans.find((plan) => plan.id === planId);
    const stripePriceId = billingPeriod === 'annual'
      ? selected?.stripe?.priceAnnualId
      : selected?.stripe?.priceMonthlyId;

    if (planId !== 'free') {
      if (!stripePriceId) {
        toast.error('Stripe não está configurado para este plano. Use PayPal para continuar.');
        return;
      }

      setLoading(true);
      setSelectedPlan(planId);

      try {
        const response = await plansApi.createStripeCheckoutSession(planId, billingPeriod);
        if (response.success && response.sessionUrl) {
          window.location.href = response.sessionUrl;
          return;
        }

        toast.error('Falha ao iniciar checkout Stripe. Tente novamente ou use outra forma de pagamento.');
      } catch (error: any) {
        console.error('Error creating Stripe checkout session:', error);
        const errorMessage = error.message || 'Erro ao iniciar checkout Stripe.';
        toast.error(errorMessage);
      } finally {
        setLoading(false);
        setSelectedPlan(null);
      }

      return;
    }

    // Para plano free, processar diretamente
    setLoading(true);
    setSelectedPlan(planId);

    try {
      const response = await plansApi.upgrade(planId);
      if (response.success) {
        toast.success('Plano atualizado para Free!');
        onUpgradeSuccess(response.user);
        onClose();
      }
    } catch (error: any) {
      console.error('Error upgrading plan:', error);
      const errorMessage = error.message || 'Erro ao atualizar plano. Tente novamente.';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
      setSelectedPlan(null);
    }
  };


  const planConfig = {
    free: { icon: Zap, color: 'text-gray-500 dark:text-muted-foreground', bg: 'bg-gray-100 dark:bg-muted' },
    business: { icon: Rocket, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30' },
    enterprise: { icon: Crown, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-100 dark:bg-purple-900/30' },
  };

  if (!isOpen) return null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-5xl bg-card text-card-foreground border border-border shadow-xl max-h-[90vh] overflow-y-auto animate-in fade-in slide-in-from-bottom-10 duration-300">
        <DialogHeader>
          <DialogTitle className="text-2xl text-center text-foreground mb-2">
            ✨ Escolha o Plano Ideal para Você
          </DialogTitle>
          <DialogDescription className="text-center text-muted-foreground">
            Desbloqueie recursos poderosos e leve sua operação para o próximo nível
          </DialogDescription>
        </DialogHeader>

        {/* Toggle */}
        <div className="flex justify-center pb-6 px-4">
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

        {/* Cards - Desktop Grid */}
        <div className="hidden sm:grid sm:grid-cols-3 gap-6 px-6 sm:px-8">
          {plans.map((plan) => {
            const isCurrentPlan = plan.id === currentPlan;
            const isBestValue = plan.id === 'business';
            const config = planConfig[plan.id as keyof typeof planConfig] || planConfig.free;
            const Icon = config?.icon || Zap;

            return (
              <div
                key={plan.id}
                className={`relative rounded-xl p-6 border-2 transition ${
                  isBestValue
                    ? 'border-blue-500 bg-blue-500/5 shadow-lg shadow-blue-500/20 ring-1 ring-blue-500/20'
                    : 'bg-muted border-border hover:border-muted-foreground/40'
                }`}
              >
                {isBestValue && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-xs px-3 py-1 rounded-full font-medium shadow-md">
                    Popular
                  </div>
                )}

                {isCurrentPlan && (
                  <div className="absolute top-3 right-3">
                    <span className="bg-green-500/10 text-green-600 dark:text-green-300 px-2 py-1 rounded-md text-xs border border-green-500/20">
                      Current
                    </span>
                  </div>
                )}

                {/* Icon */}
                <div className="flex justify-center mb-4">
                  <div className={`${config.bg} p-3 rounded-lg`}>
                    <Icon className={`w-8 h-8 ${config.color}`} />
                  </div>
                </div>

                {/* Plan Name */}
                <h3 className="text-xl font-bold text-foreground text-center mb-1">{plan.name}</h3>

                {/* Price */}
                <div className="text-center mb-6">
                  <div className="text-3xl font-bold text-foreground">
                    {plan.id === 'free' ? (
                      'Grátis'
                    ) : billingPeriod === 'annual' ? (
                      `R$${plan.price?.annual || 0}`
                    ) : (
                      `R$${plan.price?.monthly || 0}`
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {plan.id === 'free' ? '' : billingPeriod === 'annual' ? '/mês (anual)' : '/mês'}
                  </p>
                  {plan.id !== 'free' && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {plan.stripe?.priceMonthlyId || plan.stripe?.priceAnnualId
                        ? 'Pagamento com Stripe disponível'
                        : 'Stripe não configurado para este plano. Usando PayPal como fallback.'}
                    </p>
                  )}
                </div>

                {/* Select Plan Button */}
                {plan.id !== 'free' ? (
                  <Button
                    onClick={() => handleSelectPlan(plan.id)}
                    disabled={isCurrentPlan || loading}
                    className={`w-full font-medium py-5 rounded-lg mb-6 transition-all duration-200 transform hover:shadow-lg hover:scale-105 ${
                      isCurrentPlan
                        ? 'bg-gray-600 text-gray-400 cursor-not-allowed opacity-50'
                        : 'bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-700 hover:to-blue-600 shadow-lg shadow-blue-500/50'
                    }`}
                  >
                    {loading && selectedPlan === plan.id ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Carregando...
                      </span>
                    ) : isCurrentPlan ? (
                      'Plano Atual'
                    ) : (
                      'Selecionar Plano'
                    )}
                  </Button>
                ) : (
                  <Button
                    onClick={() => handleSelectPlan(plan.id)}
                    disabled={isCurrentPlan || loading}
                    className={`w-full font-medium py-5 rounded-lg mb-6 transition ${
                      isCurrentPlan
                        ? 'bg-muted text-muted-foreground cursor-not-allowed'
                        : 'bg-primary text-primary-foreground hover:bg-primary/90'
                    }`}
                  >
                    {loading && selectedPlan === plan.id ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Carregando...
                      </span>
                    ) : isCurrentPlan ? (
                      'Plano Atual'
                    ) : (
                      'Fazer Upgrade'
                    )}
                  </Button>
                )}

                {/* Features */}
                <div className="space-y-2 border-t border-border pt-4">
                  {plan.features.slice(0, 5).map((feature: string, index: number) => (
                    <div key={index} className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                      <span className="text-xs text-muted-foreground leading-relaxed">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Cards - Mobile Scroll Horizontal */}
        <div className="sm:hidden flex gap-4 overflow-x-auto snap-x snap-mandatory px-4 pb-4">
          {plans.map((plan) => {
            const isCurrentPlan = plan.id === currentPlan;
            const isBestValue = plan.id === 'business';
            const config = planConfig[plan.id as keyof typeof planConfig] || planConfig.free;
            const Icon = config?.icon || Zap;

            return (
              <div
                key={plan.id}
                className={`snap-center min-w-[85%] relative rounded-xl p-6 border-2 flex-shrink-0 transition ${
                  isBestValue
                    ? 'border-blue-500 bg-blue-500/5 shadow-lg shadow-blue-500/20'
                    : 'bg-muted border-border'
                }`}
              >
                {isBestValue && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-xs px-3 py-1 rounded-full font-medium shadow-md">
                    Popular
                  </div>
                )}

                {isCurrentPlan && (
                  <div className="absolute top-3 right-3">
                    <span className="bg-green-500/10 text-green-600 dark:text-green-300 px-2 py-1 rounded-md text-xs border border-green-500/20">
                      Atual
                    </span>
                  </div>
                )}

                {/* Icon */}
                <div className="flex justify-center mb-4">
                  <div className={`${config.bg} p-3 rounded-lg`}>
                    <Icon className={`w-8 h-8 ${config.color}`} />
                  </div>
                </div>

                {/* Plan Name */}
                <h3 className="text-xl font-bold text-foreground text-center mb-1">{plan.name}</h3>

                {/* Price */}
                <div className="text-center mb-6">
                  <div className="text-3xl font-bold text-foreground">
                    {plan.id === 'free' ? (
                      'Grátis'
                    ) : billingPeriod === 'annual' ? (
                      `R$${plan.price?.annual || 0}`
                    ) : (
                      `R$${plan.price?.monthly || 0}`
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {plan.id === 'free' ? '' : billingPeriod === 'annual' ? '/mês (anual)' : '/mês'}
                  </p>
                </div>

                {/* Select Plan Button */}
                {plan.id !== 'free' ? (
                  <Button
                    onClick={() => handleSelectPlan(plan.id)}
                    disabled={isCurrentPlan || loading}
                    className={`w-full font-medium py-5 rounded-lg mb-6 transition-all duration-200 transform hover:shadow-lg hover:scale-105 ${
                      isCurrentPlan
                        ? 'bg-muted text-muted-foreground cursor-not-allowed opacity-50'
                        : 'bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-700 hover:to-blue-600 shadow-lg shadow-blue-500/50'
                    }`}
                  >
                    {loading && selectedPlan === plan.id ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Carregando...
                      </span>
                    ) : isCurrentPlan ? (
                      'Plano Atual'
                    ) : (
                      'Selecionar Plano'
                    )}
                  </Button>
                ) : (
                  <Button
                    onClick={() => handleSelectPlan(plan.id)}
                    disabled={isCurrentPlan || loading}
                    className={`w-full font-medium py-5 rounded-lg mb-6 transition ${
                      isCurrentPlan
                        ? 'bg-muted text-muted-foreground cursor-not-allowed'
                        : 'bg-primary text-primary-foreground hover:bg-primary/90'
                    }`}
                  >
                    {loading && selectedPlan === plan.id ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Carregando...
                      </span>
                    ) : isCurrentPlan ? (
                      'Plano Atual'
                    ) : (
                      'Fazer Upgrade'
                    )}
                  </Button>
                )}

                {/* Features */}
                <div className="space-y-2 border-t border-border pt-4">
                  {plan.features.slice(0, 5).map((feature: string, index: number) => (
                    <div key={index} className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                      <span className="text-xs text-muted-foreground leading-relaxed">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-6 text-center border-t border-border pt-6 px-4">
          <div className="flex flex-wrap items-center justify-center gap-4 text-muted-foreground text-xs">
            <span>✓ No hidden fees</span>
            <span>✓ Cancel anytime</span>
            <span>✓ Secure payments</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Payment Method Modal */}
    <PaymentMethodModal
      isOpen={showPaymentModal}
      onClose={() => {
        setShowPaymentModal(false);
        setPlanForPayment(null);
      }}
      planId={planForPayment}
      billingPeriod={billingPeriod}
    />
  </>
  );
}



