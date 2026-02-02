import { useState, useEffect } from 'react';
import { plansApi, apiRequest } from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Check, Loader2, Zap, Rocket, Crown, X } from 'lucide-react';
import PayPalButton from '../payment/PayPalButton';

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
  const [showPayPalButton, setShowPayPalButton] = useState<string | null>(null);

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

  const handleUpgrade = async (planId: string) => {
    if (planId === currentPlan) {
      return;
    }

    // Para planos pagos, mostrar botão PayPal
    if (planId !== 'free') {
      setShowPayPalButton(planId);
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

  const handlePayPalSuccess = async (subscriptionId: string) => {
    console.log('PayPal subscription successful:', subscriptionId);
    setLoading(true);

    try {
      // Call backend to activate the subscription
      const response = await apiRequest('/paypal/activate-subscription', 'POST', {
        subscriptionId,
        planId: showPayPalButton,
        billingPeriod,
      });

      if (response.success) {
        toast.success('Plano ativado com sucesso!');
        onUpgradeSuccess(response.user);
        onClose();
      }
    } catch (error: any) {
      console.error('Error activating subscription:', error);
      toast.error('Erro ao ativar assinatura. Entre em contato com o suporte.');
    } finally {
      setLoading(false);
    }
  };

  const planConfig = {
    free: { icon: Zap, color: 'text-gray-500 dark:text-muted-foreground', bg: 'bg-gray-100 dark:bg-muted' },
    business: { icon: Rocket, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30' },
    enterprise: { icon: Crown, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-100 dark:bg-purple-900/30' },
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-5xl bg-card text-card-foreground border border-border shadow-xl max-h-[90vh] overflow-y-auto">
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
          <div className="inline-flex gap-2 bg-gray-100 dark:bg-muted p-1 rounded-lg border border-gray-200 dark:border-border">
            <button
              onClick={() => setBillingPeriod('monthly')}
              className={`px-6 py-2 text-sm font-medium rounded-md transition ${
                billingPeriod === 'monthly'
                  ? 'bg-white dark:bg-primary text-gray-900 dark:text-primary-foreground shadow-sm'
                  : 'text-gray-600 dark:text-muted-foreground hover:text-gray-900 dark:hover:text-foreground'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingPeriod('annual')}
              className={`px-6 py-2 text-sm font-medium rounded-md transition relative ${
                billingPeriod === 'annual'
                  ? 'bg-white dark:bg-primary text-gray-900 dark:text-primary-foreground shadow-sm'
                  : 'text-gray-600 dark:text-muted-foreground hover:text-gray-900 dark:hover:text-foreground'
              }`}
            >
              Annual
              <span className="absolute -top-1.5 -right-1.5 bg-green-500 text-white text-xs px-1.5 py-0.5 rounded-full shadow-sm">
                -20%
              </span>
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
                className="relative bg-muted rounded-xl p-6 border border-border hover:border-muted-foreground/40 transition"
              >
                {isBestValue && (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs px-3 py-1 rounded-full font-medium shadow-sm">
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
                      '$0'
                    ) : billingPeriod === 'annual' ? (
                      `$${plan.price?.annual || 0}`
                    ) : (
                      `$${plan.price?.monthly || 0}`
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {billingPeriod === 'annual' ? '/year' : '/month'}
                  </p>
                </div>

                {/* Button */}
                {showPayPalButton === plan.id ? (
                  <div className="mb-6">
                    <PayPalButton
                      planId={`${plan.id}-${billingPeriod}`}
                      onSuccess={handlePayPalSuccess}
                      onError={() => setShowPayPalButton(null)}
                    />
                    <button
                      onClick={() => setShowPayPalButton(null)}
                      className="w-full mt-2 text-xs text-muted-foreground hover:text-foreground transition"
                    >
                      Voltar
                    </button>
                  </div>
                ) : (
                  <Button
                    onClick={() => handleUpgrade(plan.id)}
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
                        Loading...
                      </span>
                    ) : isCurrentPlan ? (
                      'Current Plan'
                    ) : (
                      'Select Plan'
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
                className="snap-center min-w-[85%] relative bg-neutral-900 rounded-xl p-6 border border-neutral-800 flex-shrink-0"
              >
                {isBestValue && (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-white text-black text-xs px-3 py-1 rounded-full font-medium">
                    Popular
                  </div>
                )}

                {isCurrentPlan && (
                  <div className="absolute top-3 right-3">
                    <span className="bg-green-500/10 text-green-400 px-2 py-1 rounded-md text-xs border border-green-500/20">
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
                <h3 className="text-xl font-bold text-white text-center mb-1">{plan.name}</h3>

                {/* Price */}
                <div className="text-center mb-6">
                  <div className="text-3xl font-bold text-white">
                    {plan.id === 'free' ? (
                      '$0'
                    ) : billingPeriod === 'annual' ? (
                      `$${plan.price?.annual || 0}`
                    ) : (
                      `$${plan.price?.monthly || 0}`
                    )}
                  </div>
                  <p className="text-xs text-neutral-500 mt-1">
                    {billingPeriod === 'annual' ? '/year' : '/month'}
                  </p>
                </div>

                {/* Button */}
                {showPayPalButton === plan.id ? (
                  <div className="mb-6">
                    <PayPalButton
                      planId={`${plan.id}-${billingPeriod}`}
                      onSuccess={handlePayPalSuccess}
                      onError={() => setShowPayPalButton(null)}
                    />
                    <button
                      onClick={() => setShowPayPalButton(null)}
                      className="w-full mt-2 text-xs text-neutral-500 hover:text-neutral-300 transition"
                    >
                      Voltar
                    </button>
                  </div>
                ) : (
                  <Button
                    onClick={() => handleUpgrade(plan.id)}
                    disabled={isCurrentPlan || loading}
                    className={`w-full font-medium py-5 rounded-lg mb-6 transition ${
                      isCurrentPlan
                        ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                        : 'bg-white text-black hover:bg-neutral-200'
                    }`}
                  >
                    {loading && selectedPlan === plan.id ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading...
                      </span>
                    ) : isCurrentPlan ? (
                      'Current Plan'
                    ) : (
                      'Select Plan'
                    )}
                  </Button>
                )}

                {/* Features */}
                <div className="space-y-2 border-t border-neutral-800 pt-4">
                  {plan.features.slice(0, 5).map((feature: string, index: number) => (
                    <div key={index} className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-neutral-500 flex-shrink-0 mt-0.5" />
                      <span className="text-xs text-neutral-400 leading-relaxed">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-6 text-center border-t border-neutral-800 pt-6 px-4">
          <div className="flex flex-wrap items-center justify-center gap-4 text-neutral-500 text-xs">
            <span>✓ No hidden fees</span>
            <span>✓ Cancel anytime</span>
            <span>✓ Secure payments</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}



