import { Button } from './ui/button';
import { ArrowRight, Zap } from 'lucide-react';
import { trackMetaEvent } from './MetaPixel';

interface CTASectionProps {
  onGetStarted?: () => void;
}

export default function CTASection({ onGetStarted }: CTASectionProps) {
  const handleGetStartedClick = () => {
    // Track Meta Pixel event
    trackMetaEvent('Lead', {
      content_name: 'CTA Section - Começar Gratuitamente',
      content_category: 'bottom-cta',
      value: 0,
      currency: 'BRL'
    });
    
    // Call original handler
    if (onGetStarted) {
      onGetStarted();
    }
  };

  const handleContactSalesClick = () => {
    // Track Meta Pixel event
    trackMetaEvent('Contact', {
      content_name: 'CTA Section - Falar com Vendas',
      content_category: 'sales-contact',
    });
  };

  return (
    <section className="py-20 lg:py-32 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-blue-700 to-purple-800"></div>
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjEiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-20"></div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          {/* Icon */}
          <div className="w-16 h-16 bg-white/10 backdrop-blur-sm rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Zap className="w-8 h-8 text-white" />
          </div>

          {/* Heading */}
          <h2 className="text-white mb-6">
            Pronto para transformar seus leads em clientes?
          </h2>

          {/* Description */}
          <p className="text-blue-100 text-lg mb-8 max-w-2xl mx-auto">
            Junte-se a milhares de empresas que já aumentaram suas vendas com LeadFlow CRM.
            Comece gratuitamente hoje mesmo, sem cartão de crédito necessário.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Button
              onClick={handleGetStartedClick}
              className="bg-white text-blue-600 hover:bg-gray-100 shadow-md"
            >
              Começar Gratuitamente
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button
              variant="outline"
              onClick={handleContactSalesClick}
              className="border-white/20 text-white hover:bg-white/10 backdrop-blur-sm"
            >
              Falar com Vendas
            </Button>
          </div>

          {/* Trust Indicators */}
          <div className="flex flex-wrap items-center justify-center gap-8 text-blue-100">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              <span>Teste grátis de 14 dias</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              <span>Sem cartão de crédito</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              <span>Cancele a qualquer momento</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

