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
    free: { icon: Zap, color: 'text-muted-foreground', bg: 'bg-muted' },
    business: { icon: Rocket, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30' },
    enterprise: { icon: Crown, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-100 dark:bg-purple-900/30' },
  };

  if (!isOpen) return null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-4xl max-h-[92vh] flex flex-col bg-card text-card-foreground border border-border shadow-xl overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-bottom-8 duration-300 p-0">

          {/* Header */}
          <DialogHeader className="px-6 pt-6 pb-3 flex-shrink-0">
            <DialogTitle className="text-lg sm:text-xl text-center text-foreground font-bold">
              ✨ Escolha o Plano Ideal para Você
            </DialogTitle>
            <DialogDescription className="text-center text-muted-foreground text-xs sm:text-sm mt-1">
              Desbloqueie recursos poderosos e leve sua operação para o próximo nível
            </DialogDescription>
          </DialogHeader>

          {/* Billing toggle */}
          <div className="flex justify-center py-2 px-4 flex-shrink-0">
            <div className="inline-flex items-center bg-muted/30 rounded-lg p-0.5 border border-border">
              <button
                onClick={() => setBillingPeriod('monthly')}
                className={`px-5 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                  billingPeriod === 'monthly'
                    ? 'bg-card text-foreground shadow-sm border border-border'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Mensal
              </button>
              <button
                onClick={() => setBillingPeriod('annual')}
                className={`relative px-5 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                  billingPeriod === 'annual'
                    ? 'bg-card text-foreground shadow-sm border border-border'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Anual
                <span className="ml-1.5 text-[10px] bg-emerald-500 text-white px-1.5 py-0.5 rounded-full">-20%</span>
              </button>
            </div>
          </div>

          {/* Scrollable cards area */}
          <div className="flex-1 overflow-y-auto px-6 pb-6 min-h-0">

            {/* Desktop grid */}
            <div className="hidden sm:grid sm:grid-cols-3 gap-5 pt-5">
              {plans.map((plan) => {
                const isCurrentPlan = plan.id === currentPlan;
                const isBestValue = plan.id === 'business';
                const config = planConfig[plan.id as keyof typeof planConfig] || planConfig.free;
                const Icon = config?.icon || Zap;

                return (
                  <div
                    key={plan.id}
                    className={`relative rounded-xl p-5 border-2 transition flex flex-col ${
                      isBestValue
                        ? 'border-blue-500 bg-blue-500/5 shadow-lg shadow-blue-500/20 ring-1 ring-blue-500/20'
                        : 'bg-muted border-border hover:border-muted-foreground/40'
                    }`}
                  >
                    {isBestValue && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-[10px] px-3 py-0.5 rounded-full font-medium shadow-md whitespace-nowrap">
                        ⭐ Popular
                      </div>
                    )}
                    {isCurrentPlan && (
                      <div className="absolute top-3 right-3">
                        <span className="bg-green-500/10 text-green-600 dark:text-green-300 px-1.5 py-0.5 rounded text-[10px] border border-green-500/20">
                          Atual
                        </span>
                      </div>
                    )}

                    {/* Icon + name */}
                    <div className="flex items-center gap-2.5 mb-3">
                      <div className={`${config.bg} p-2 rounded-lg flex-shrink-0`}>
                        <Icon className={`w-6 h-6 ${config.color}`} />
                      </div>
                      <h3 className="text-base font-bold text-foreground">{plan.name}</h3>
                    </div>

                    {/* Price */}
                    <div className="mb-4">
                      <span className="text-3xl font-bold text-foreground">
                        {plan.id === 'free' ? 'Grátis' : billingPeriod === 'annual' ? `$${plan.price?.annual || 0}` : `$${plan.price?.monthly || 0}`}
                      </span>
                      {plan.id !== 'free' && (
                        <span className="text-xs text-muted-foreground ml-1">
                          {billingPeriod === 'annual' ? '/ano' : '/mo'}
                        </span>
                      )}
                    </div>

                    {/* Features */}
                    <div className="space-y-1.5 border-t border-border pt-3 flex-1">
                      {plan.features.map((feature: string, index: number) => (
                        <div key={index} className="flex items-start gap-2">
                          <Check className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
                          <span className="text-xs text-muted-foreground leading-snug">{feature}</span>
                        </div>
                      ))}
                    </div>

                    {/* Button */}
                    {plan.id !== 'free' ? (
                      <Button
                        onClick={() => handleSelectPlan(plan.id)}
                        disabled={isCurrentPlan || loading}
                        className={`w-full text-sm font-medium h-9 rounded-lg mt-4 transition-all ${
                          isCurrentPlan
                            ? 'bg-muted text-muted-foreground cursor-not-allowed opacity-60'
                            : 'bg-primary text-primary-foreground hover:opacity-90 transition-all duration-150'
                        }`}
                      >
                        {loading && selectedPlan === plan.id ? (
                          <span className="flex items-center justify-center gap-1.5">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Carregando...
                          </span>
                        ) : isCurrentPlan ? 'Plano Atual' : 'Selecionar Plano'}
                      </Button>
                    ) : (
                      <Button
                        onClick={() => handleSelectPlan(plan.id)}
                        disabled={isCurrentPlan || loading}
                        className={`w-full text-sm font-medium h-9 rounded-lg mt-4 transition ${
                          isCurrentPlan
                            ? 'bg-muted text-muted-foreground cursor-not-allowed'
                            : 'bg-primary text-primary-foreground hover:bg-primary/90'
                        }`}
                      >
                        {isCurrentPlan ? 'Plano Atual' : 'Fazer Upgrade'}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Mobile horizontal scroll */}
            <div className="sm:hidden flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 pt-5">
              {plans.map((plan) => {
                const isCurrentPlan = plan.id === currentPlan;
                const isBestValue = plan.id === 'business';
                const config = planConfig[plan.id as keyof typeof planConfig] || planConfig.free;
                const Icon = config?.icon || Zap;

                return (
                  <div
                    key={plan.id}
                    className={`snap-center min-w-[82vw] max-w-[82vw] relative rounded-xl p-5 border-2 flex-shrink-0 flex flex-col transition ${
                      isBestValue
                        ? 'border-blue-500 bg-blue-500/5 shadow-lg shadow-blue-500/20'
                        : 'bg-muted border-border'
                    }`}
                  >
                    {isBestValue && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-[10px] px-3 py-0.5 rounded-full font-medium shadow-md whitespace-nowrap">
                        ⭐ Popular
                      </div>
                    )}
                    {isCurrentPlan && (
                      <div className="absolute top-3 right-3">
                        <span className="bg-green-500/10 text-green-600 dark:text-green-300 px-1.5 py-0.5 rounded text-[10px] border border-green-500/20">
                          Atual
                        </span>
                      </div>
                    )}

                    {/* Icon + name */}
                    <div className="flex items-center gap-2.5 mb-3">
                      <div className={`${config.bg} p-2 rounded-lg flex-shrink-0`}>
                        <Icon className={`w-6 h-6 ${config.color}`} />
                      </div>
                      <h3 className="text-base font-bold text-foreground">{plan.name}</h3>
                    </div>

                    {/* Price */}
                    <div className="mb-4">
                      <span className="text-3xl font-bold text-foreground">
                        {plan.id === 'free' ? 'Grátis' : billingPeriod === 'annual' ? `$${plan.price?.annual || 0}` : `$${plan.price?.monthly || 0}`}
                      </span>
                      {plan.id !== 'free' && (
                        <span className="text-xs text-muted-foreground ml-1">
                          {billingPeriod === 'annual' ? '/ano' : '/mo'}
                        </span>
                      )}
                    </div>

                    {/* Features */}
                    <div className="space-y-2 border-t border-border pt-3 flex-1">
                      {plan.features.map((feature: string, index: number) => (
                        <div key={index} className="flex items-start gap-2">
                          <Check className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
                          <span className="text-xs text-muted-foreground leading-snug">{feature}</span>
                        </div>
                      ))}
                    </div>

                    {/* Button */}
                    {plan.id !== 'free' ? (
                      <Button
                        onClick={() => handleSelectPlan(plan.id)}
                        disabled={isCurrentPlan || loading}
                        className={`w-full text-sm font-medium h-9 rounded-lg mt-4 transition-all ${
                          isCurrentPlan
                            ? 'bg-muted text-muted-foreground cursor-not-allowed opacity-50'
                            : 'bg-primary text-primary-foreground hover:opacity-90 transition-all duration-150'
                        }`}
                      >
                        {loading && selectedPlan === plan.id ? (
                          <span className="flex items-center justify-center gap-1.5">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Carregando...
                          </span>
                        ) : isCurrentPlan ? 'Plano Atual' : 'Selecionar Plano'}
                      </Button>
                    ) : (
                      <Button
                        onClick={() => handleSelectPlan(plan.id)}
                        disabled={isCurrentPlan || loading}
                        className={`w-full text-sm font-medium h-9 rounded-lg mt-4 transition ${
                          isCurrentPlan
                            ? 'bg-muted text-muted-foreground cursor-not-allowed'
                            : 'bg-primary text-primary-foreground hover:bg-primary/90'
                        }`}
                      >
                        {isCurrentPlan ? 'Plano Atual' : 'Fazer Upgrade'}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 border-t border-border px-6 py-3">
            <div className="flex flex-wrap items-center justify-center gap-5 text-muted-foreground text-xs">
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

