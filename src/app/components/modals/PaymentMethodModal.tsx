import { useState } from 'react';
import { plansApi } from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';

// PayPal Payment Links - Direct checkout links
const PAYPAL_PAYMENT_LINKS: Record<string, string> = {
  'business-monthly': 'https://www.paypal.com/ncp/payment/MJFXSMAZY9VPS',
  'business-annual': 'https://www.paypal.com/ncp/payment/ADJF2GY82HDCW',
  'enterprise-monthly': 'https://www.paypal.com/ncp/payment/6XX4G2TKPCA6Y',
  'enterprise-annual': 'https://www.paypal.com/ncp/payment/ESX4B2DFC6AZL',
};

interface PaymentMethodModalProps {
  isOpen: boolean;
  onClose: () => void;
  planId: string | null;
  billingPeriod: 'monthly' | 'annual';
  onPaymentSuccess?: () => void;
}

export default function PaymentMethodModal({
  isOpen,
  onClose,
  planId,
  billingPeriod,
  onPaymentSuccess,
}: PaymentMethodModalProps) {
  const [loading, setLoading] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<'stripe' | 'paypal' | null>(null);

  const handleStripePayment = async () => {
    if (!planId) return;

    setLoading(true);
    setSelectedMethod('stripe');

    try {
      const response = await plansApi.createStripeCheckoutSession(planId, billingPeriod);
      if (response.success && response.sessionUrl) {
        window.location.href = response.sessionUrl;
        return;
      }

      toast.error('Falha ao iniciar checkout Stripe. Tente novamente.');
      setSelectedMethod(null);
      setLoading(false);
    } catch (error: any) {
      console.error('Error creating Stripe checkout session:', error);
      const errorMessage = error.message || 'Erro ao iniciar checkout Stripe.';
      toast.error(errorMessage);
      setSelectedMethod(null);
      setLoading(false);
    }
  };

  const handlePayPalPayment = async () => {
    if (!planId) return;

    setSelectedMethod('paypal');
    const paymentLinkKey = `${planId}-${billingPeriod}`;
    const paymentLink = PAYPAL_PAYMENT_LINKS[paymentLinkKey];

    if (!paymentLink) {
      toast.error('Link de pagamento PayPal não configurado para este plano.');
      setSelectedMethod(null);
      return;
    }

    // Abrir link de pagamento em nova aba
    window.open(paymentLink, '_blank', 'noopener,noreferrer');
    setSelectedMethod(null);
    setLoading(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-card text-card-foreground border border-border shadow-xl animate-in fade-in slide-in-from-bottom-10 duration-300">
        <DialogHeader>
          <DialogTitle className="text-xl text-center text-foreground">
            Escolha o Método de Pagamento
          </DialogTitle>
          <DialogDescription className="text-center text-muted-foreground py-2">
            Selecione como deseja pagar seu plano
          </DialogDescription>
        </DialogHeader>

        {/* Billing Period Toggle */}
        <div className="flex justify-center pb-6 px-4">
          <div className="inline-flex gap-2 bg-gray-800 dark:bg-gray-700 p-1 rounded-lg border border-gray-700 dark:border-gray-600">
            <button
              onClick={() => setBillingPeriod('monthly')}
              className={`px-6 py-2 text-sm font-medium rounded-md transition ${
                billingPeriod === 'monthly'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-300 dark:text-gray-400 hover:text-gray-200 dark:hover:text-gray-300'
              }`}
            >
              Mensal
            </button>
            <button
              onClick={() => setBillingPeriod('annual')}
              className={`px-6 py-2 text-sm font-medium rounded-md transition relative ${
                billingPeriod === 'annual'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-300 dark:text-gray-400 hover:text-gray-200 dark:hover:text-gray-300'
              }`}
            >
              Anual
              <span className="absolute -top-1.5 -right-1.5 bg-green-500 text-white text-xs px-1.5 py-0.5 rounded-full shadow-sm">
                -20%
              </span>
            </button>
          </div>
        </div>

        {/* Payment Methods */}
        <div className="flex flex-col gap-4 py-6 px-4">
          {/* Stripe Option */}
          <button
            onClick={handleStripePayment}
            disabled={loading}
            className={`relative w-full p-6 rounded-lg border-2 transition-all duration-200 transform hover:scale-105 hover:shadow-lg ${
              loading && selectedMethod === 'stripe'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-blue-500 bg-blue-500/5 hover:bg-blue-500/10 hover:border-blue-400'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 flex-1">
                <svg
                  className="w-12 h-12 flex-shrink-0"
                  viewBox="0 -11 70 70"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <rect
                    x="0.5"
                    y="0.5"
                    width="69"
                    height="47"
                    rx="5.5"
                    fill="white"
                    stroke="#D9D9D9"
                  />
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M37.6109 16.2838L34.055 17.047V14.164L37.6109 13.415V16.2838ZM45.0057 17.8808C43.6173 17.8808 42.7248 18.5308 42.229 18.9831L42.0448 18.1069H38.9281V34.5849L42.4698 33.8359L42.484 29.8365C42.994 30.2039 43.7448 30.7268 44.9915 30.7268C47.5273 30.7268 49.8365 28.6918 49.8365 24.2119C49.8223 20.1136 47.4848 17.8808 45.0057 17.8808ZM44.1556 27.6177C43.3198 27.6177 42.8239 27.321 42.4839 26.9535L42.4698 21.7105C42.8381 21.3007 43.3481 21.0181 44.1556 21.0181C45.4448 21.0181 46.3373 22.4595 46.3373 24.3108C46.3373 26.2045 45.4589 27.6177 44.1556 27.6177ZM61 24.3532C61 20.7354 59.2433 17.8808 55.8858 17.8808C52.5142 17.8808 50.4742 20.7354 50.4742 24.325C50.4742 28.5787 52.8825 30.7268 56.3392 30.7268C58.025 30.7268 59.3 30.3452 60.2633 29.8082V26.9818C59.3 27.4623 58.195 27.7591 56.7925 27.7591C55.4183 27.7591 54.2 27.2786 54.0442 25.611H60.9717C60.9717 25.5332 60.9768 25.3565 60.9826 25.1528L60.9826 25.1526V25.1525V25.1524V25.1523V25.1523C60.9906 24.8753 61 24.5486 61 24.3532ZM54.0016 23.0107C54.0016 21.4138 54.9791 20.7496 55.8716 20.7496C56.7358 20.7496 57.6566 21.4138 57.6566 23.0107H54.0016ZM34.0548 18.121H37.6107V30.4866H34.0548V18.121ZM30.0176 18.121L30.2443 19.1668C31.0801 17.6405 32.7376 17.9514 33.1909 18.121V21.3714C32.7518 21.2159 31.3351 21.0181 30.4993 22.1063V30.4866H26.9576V18.121H30.0176ZM23.1607 15.0543L19.704 15.7892L19.6899 27.109C19.6899 29.2005 21.2624 30.7409 23.359 30.7409C24.5207 30.7409 25.3707 30.529 25.8382 30.2746V27.4058C25.3849 27.5895 23.1465 28.2396 23.1465 26.148V21.1311H25.8382V18.121H23.1465L23.1607 15.0543ZM14.7884 20.9475C14.0375 20.9475 13.5842 21.1594 13.5842 21.7106C13.5842 22.3124 14.3644 22.5771 15.3323 22.9055C16.9102 23.4409 18.9871 24.1455 18.9959 26.7557C18.9959 29.2854 16.97 30.741 14.0234 30.741C12.805 30.741 11.4733 30.5007 10.1558 29.9355V26.572C11.3458 27.2221 12.8475 27.7026 14.0234 27.7026C14.8167 27.7026 15.3834 27.4906 15.3834 26.8405C15.3834 26.174 14.5376 25.8693 13.5166 25.5015C11.9616 24.9413 10 24.2346 10 21.8802C10 19.3788 11.9125 17.8808 14.7884 17.8808C15.9642 17.8808 17.1259 18.0645 18.3017 18.5309V21.8519C17.225 21.2725 15.865 20.9475 14.7884 20.9475Z"
                    fill="#6461FC"
                  />
                </svg>
                <div className="text-left">
                  <div className="font-semibold text-foreground">Stripe</div>
                  <div className="text-xs text-muted-foreground">Cartão de crédito/débito</div>
                </div>
              </div>
              {loading && selectedMethod === 'stripe' && (
                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              )}
            </div>
          </button>

          {/* PayPal Option */}
          <button
            onClick={handlePayPalPayment}
            disabled={loading}
            className={`relative w-full p-6 rounded-lg border-2 transition-all duration-200 transform hover:scale-105 hover:shadow-lg ${
              loading && selectedMethod === 'paypal'
                ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                : 'border-blue-500 bg-blue-500/5 hover:bg-blue-500/10 hover:border-blue-400'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 flex-1">
                <svg
                  className="w-12 h-12 flex-shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <g clipPath="url(#clip0_1_2)">
                    <path
                      d="M 8.625 2h6.75a6.625 6.625 0 1 1 0 13.25h-6.75a6.625 6.625 0 0 1 0-13.25z"
                      fill="#003087"
                    />
                    <path
                      d="M 2 5.5h20c.55 0 1 .45 1 1v11c0 .55-.45 1-1 1H2c-.55 0-1-.45-1-1v-11c0-.55.45-1 1-1z"
                      fill="#009cde"
                    />
                  </g>
                </svg>
                <div className="text-left">
                  <div className="font-semibold text-foreground">PayPal</div>
                  <div className="text-xs text-muted-foreground">Conta PayPal</div>
                </div>
              </div>
              {loading && selectedMethod === 'paypal' && (
                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              )}
            </div>
          </button>
        </div>

        {/* Close Button */}
        <div className="flex justify-center pt-4">
          <Button
            onClick={onClose}
            variant="outline"
            className="w-full"
            disabled={loading}
          >
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
