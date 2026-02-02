import { Button } from '../ui/button';
import { ExternalLink } from 'lucide-react';

interface PayPalButtonProps {
  planId: string;
  onSuccess?: (subscriptionId: string) => void;
  onError?: (error: any) => void;
}

// PayPal Payment Links - Direct checkout links
const PAYPAL_PAYMENT_LINKS: Record<string, string> = {
  'business-monthly': 'https://www.paypal.com/ncp/payment/MJFXSMAZY9VPS',
  'business-annual': 'https://www.paypal.com/ncp/payment/ADJF2GY82HDCW',
  'enterprise-monthly': 'https://www.paypal.com/ncp/payment/6XX4G2TKPCA6Y',
  'enterprise-annual': 'https://www.paypal.com/ncp/payment/ESX4B2DFC6AZL',
};

export default function PayPalButton({ planId }: PayPalButtonProps) {
  const paymentLink = PAYPAL_PAYMENT_LINKS[planId];

  if (!paymentLink) {
    console.error(`PayPal payment link not configured for: ${planId}`);
    return (
      <div className="text-center text-red-500 text-sm p-4">
        Link de pagamento não configurado. Entre em contato com o suporte.
      </div>
    );
  }

  const handlePayment = () => {
    // Abrir link de pagamento em nova aba
    window.open(paymentLink, '_blank', 'noopener,noreferrer');
  };

  return (
    <Button
      onClick={handlePayment}
      className="w-full bg-[#0070ba] hover:bg-[#005a9c] text-white font-medium py-6 rounded-lg flex items-center justify-center gap-2 transition-all"
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106zm14.146-14.42a3.35 3.35 0 0 0-.607-.541c-.013.076-.026.175-.041.254-.93 4.778-4.005 7.201-9.138 7.201h-2.19a.563.563 0 0 0-.556.479l-1.187 7.527h-.506L9.18 14.311h1.248c4.57 0 7.266-2.292 8.032-6.828.018-.106.053-.31.086-.563.055-.062.116-.12.178-.18.117-.114.26-.217.46-.217z"/>
      </svg>
      Pagar com PayPal
      <ExternalLink className="w-4 h-4" />
    </Button>
  );
}

