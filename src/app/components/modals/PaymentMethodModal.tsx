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

        {/* Período selecionado */}
        <div className="flex justify-center pb-2 px-4">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-600/10 border border-blue-600/30 text-blue-400 text-sm font-medium">
            {billingPeriod === 'monthly' ? '🗓 Plano Mensal' : '📅 Plano Anual'}
            {billingPeriod === 'annual' && (
              <span className="bg-green-500 text-white text-xs px-1.5 py-0.5 rounded-full">-20%</span>
            )}
          </span>
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
                  className="w-16 h-10 flex-shrink-0"
                  viewBox="0 -140 780 780"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M725,0H55C24.673,0,0,24.673,0,55v391c0,30.327,24.673,55,55,55h670c30.325,0,55-24.673,55-55V55C780,24.673,755.325,0,725,0z" fill="#FFF"/>
                  <path d="m168.38 169.85c-8.399-5.774-19.359-8.668-32.88-8.668h-52.346c-4.145 0-6.435 2.073-6.87 6.214l-21.265 133.48c-0.221 1.311 0.107 2.51 0.981 3.6 0.869 1.093 1.962 1.636 3.271 1.636h24.864c4.361 0 6.758-2.068 7.198-6.216l5.888-35.985c0.215-1.744 0.982-3.162 2.291-4.254 1.308-1.09 2.944-1.804 4.907-2.13 1.963-0.324 3.814-0.487 5.562-0.487 1.743 0 3.814 0.11 6.217 0.327 2.397 0.218 3.925 0.324 4.58 0.324 18.756 0 33.478-5.285 44.167-15.866 10.684-10.577 16.032-25.244 16.032-44.004 0-12.868-4.202-22.192-12.597-27.975zm-26.99 40.08c-1.094 7.635-3.926 12.649-8.506 15.049-4.581 2.403-11.124 3.597-19.629 3.597l-10.797 0.328 5.563-35.007c0.434-2.397 1.851-3.597 4.252-3.597h6.218c8.72 0 15.049 1.257 18.975 3.761 3.924 2.51 5.233 7.802 3.924 15.869z" fill="#003087"/>
                  <path d="m720.79 161.18h-24.208c-2.405 0-3.821 1.2-4.253 3.599l-21.267 136.1-0.328 0.654c0 1.096 0.437 2.127 1.311 3.109 0.868 0.979 1.963 1.471 3.271 1.471h21.595c4.138 0 6.429-2.068 6.871-6.215l21.265-133.81v-0.325c-2e-3 -3.053-1.424-4.58-4.257-4.58z" fill="#009CDE"/>
                  <path d="m428.31 213.86c0-1.088-0.438-2.126-1.306-3.106-0.875-0.981-1.857-1.474-2.945-1.474h-25.191c-2.404 0-4.366 1.096-5.89 3.271l-34.679 51.04-14.394-49.075c-1.096-3.488-3.493-5.236-7.198-5.236h-24.54c-1.093 0-2.075 0.492-2.942 1.474-0.875 0.98-1.309 2.019-1.309 3.106 0 0.44 2.127 6.871 6.379 19.303 4.252 12.434 8.833 25.848 13.741 40.244 4.908 14.394 7.468 22.031 7.688 22.898-17.886 24.43-26.826 37.518-26.826 39.26 0 2.838 1.417 4.254 4.253 4.254h25.191c2.399 0 4.361-1.088 5.89-3.271l83.427-120.4c0.433-0.433 0.651-1.193 0.651-2.289z" fill="#003087"/>
                  <path d="m662.89 209.28h-24.865c-3.056 0-4.904 3.599-5.559 10.797-5.677-8.72-16.031-13.088-31.083-13.088-15.704 0-29.065 5.89-40.077 17.668-11.016 11.779-16.521 25.631-16.521 41.551 0 12.871 3.761 23.121 11.285 30.752 7.524 7.639 17.611 11.451 30.266 11.451 6.323 0 12.757-1.311 19.3-3.926 6.544-2.617 11.665-6.105 15.379-10.469 0 0.219-0.222 1.198-0.654 2.942-0.44 1.748-0.655 3.06-0.655 3.926 0 3.494 1.414 5.234 4.254 5.234h22.576c4.138 0 6.541-2.068 7.193-6.216l13.415-85.389c0.215-1.309-0.111-2.507-0.981-3.599-0.876-1.087-1.964-1.634-3.273-1.634zm-42.694 64.452c-5.562 5.453-12.269 8.179-20.12 8.179-6.328 0-11.449-1.742-15.377-5.234-3.928-3.483-5.891-8.282-5.891-14.396 0-8.064 2.727-14.884 8.181-20.446 5.446-5.562 12.214-8.343 20.284-8.343 6.102 0 11.174 1.8 15.212 5.397 4.032 3.599 6.055 8.563 6.055 14.888-1e-3 7.851-2.783 14.505-8.344 19.955z" fill="#009CDE"/>
                  <path d="m291.23 209.28h-24.864c-3.058 0-4.908 3.599-5.563 10.797-5.889-8.72-16.25-13.088-31.081-13.088-15.704 0-29.065 5.89-40.078 17.668-11.016 11.779-16.521 25.631-16.521 41.551 0 12.871 3.763 23.121 11.288 30.752 7.525 7.639 17.61 11.451 30.262 11.451 6.104 0 12.433-1.311 18.975-3.926 6.543-2.617 11.778-6.105 15.704-10.469-0.875 2.616-1.309 4.907-1.309 6.868 0 3.494 1.417 5.234 4.253 5.234h22.574c4.141 0 6.543-2.068 7.198-6.216l13.413-85.389c0.215-1.309-0.112-2.507-0.981-3.599-0.873-1.087-1.962-1.634-3.27-1.634zm-42.695 64.614c-5.563 5.351-12.382 8.017-20.447 8.017-6.329 0-11.4-1.742-15.214-5.234-3.819-3.483-5.726-8.282-5.726-14.396 0-8.064 2.725-14.884 8.18-20.446 5.449-5.562 12.211-8.343 20.284-8.343 6.104 0 11.175 1.8 15.214 5.398 4.032 3.599 6.052 8.563 6.052 14.888 0 8.069-2.781 14.778-8.343 20.116z" fill="#003087"/>
                  <path d="m540.04 169.85c-8.398-5.774-19.356-8.668-32.879-8.668h-52.02c-4.364 0-6.765 2.073-7.197 6.214l-21.266 133.48c-0.221 1.312 0.106 2.511 0.981 3.601 0.865 1.092 1.962 1.635 3.271 1.635h26.826c2.617 0 4.361-1.416 5.235-4.252l5.89-37.949c0.216-1.744 0.98-3.162 2.29-4.254 1.309-1.09 2.943-1.803 4.908-2.13 1.962-0.324 3.812-0.487 5.562-0.487 1.743 0 3.814 0.11 6.214 0.327 2.399 0.218 3.931 0.324 4.58 0.324 18.76 0 33.479-5.285 44.168-15.866 10.688-10.577 16.031-25.244 16.031-44.004 2e-3 -12.867-4.199-22.191-12.594-27.974zm-33.534 53.82c-4.799 3.271-11.997 4.906-21.592 4.906l-10.47 0.328 5.562-35.007c0.432-2.397 1.849-3.597 4.252-3.597h5.887c4.798 0 8.614 0.218 11.454 0.653 2.831 0.44 5.562 1.799 8.179 4.089 2.618 2.291 3.926 5.618 3.926 9.98 0 9.16-2.402 15.375-7.198 18.648z" fill="#009CDE"/>
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
