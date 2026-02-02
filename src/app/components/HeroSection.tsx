import type { CSSProperties } from 'react';
import { Button } from './ui/button';
import { ArrowRight, Play, Sparkles, Check } from 'lucide-react';
import { trackMetaEvent } from './MetaPixel';

const heroTitleGradient: CSSProperties = {
  backgroundImage: 'linear-gradient(90deg, #60a5fa 0%, #a855f7 48%, #ec4899 100%)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
};

const primaryCtaGradient: CSSProperties = {
  backgroundImage: 'linear-gradient(90deg, #2563eb 0%, #7c3aed 55%, #a855f7 100%)',
  boxShadow: '0 20px 45px -18px rgba(129, 140, 248, 0.65)',
};

interface HeroSectionProps {
  onGetStarted?: () => void;
}

export default function HeroSection({ onGetStarted }: HeroSectionProps) {
  const handleGetStartedClick = () => {
    // Track Meta Pixel event
    trackMetaEvent('Lead', {
      content_name: 'Hero CTA - Começar Gratuitamente',
      content_category: 'signup',
      value: 0,
      currency: 'BRL'
    });
    
    // Call original handler
    if (onGetStarted) {
      onGetStarted();
    }
  };

  const handleDemoClick = () => {
    // Track Meta Pixel event
    trackMetaEvent('ViewContent', {
      content_name: 'Demo Video Button',
      content_category: 'engagement',
    });
  };

  return (
    <section
      id="inicio"
      className="relative pt-24 sm:pt-32 pb-16 sm:pb-24 lg:pt-40 lg:pb-32 overflow-hidden bg-gradient-to-b from-[#1a1625] via-[#1a1625] to-[#0f0a1a]"
    >
      {/* Animated Background Grid */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLW9wYWNpdHk9IjAuMDMiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-100"></div>
      
      {/* Gradient Orbs */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
      <div className="absolute -bottom-32 left-1/2 w-96 h-96 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Content + Dashboard Layout */}
        <div className="max-w-7xl mx-auto">
          {/* Text Content - Centered on top */}
          <div className="text-center mb-12 lg:mb-16">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 rounded-full px-4 py-2 mb-6 hover:bg-purple-500/20 transition-all">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span className="text-purple-300 text-sm font-medium">Confiado por mais de 10.000 empresas</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-white mb-6 leading-[1.1] font-bold">
              <span className="block text-4xl sm:text-5xl lg:text-6xl xl:text-7xl tracking-tight">
                Maximize vendas com
              </span>
              <span
                className="block text-4xl sm:text-5xl lg:text-6xl xl:text-7xl tracking-tight text-transparent mt-2"
                style={heroTitleGradient}
              >
                LeadsFlow API
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-gray-400 mb-8 text-base sm:text-lg lg:text-xl leading-relaxed max-w-2xl mx-auto">
              Automatize seu funil de vendas, acompanhe cada interação e converta mais leads com
              o poder da inteligência artificial.
            </p>

            {/* Benefits List */}
            <div className="mb-8 space-y-3 max-w-xl mx-auto">
              {[
                'Sem cartão de crédito necessário',
                'Configure em menos de 5 minutos',
                'Suporte 24/7 em português'
              ].map((benefit, index) => (
                <div key={index} className="flex items-center gap-3 text-gray-300 justify-center">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
                    <Check className="w-3 h-3 text-green-400" />
                  </div>
                  <span className="text-sm sm:text-base">{benefit}</span>
                </div>
              ))}
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 mb-10 justify-center">
              <Button
                onClick={handleGetStartedClick}
                size="lg"
                className="bg-transparent text-white shadow-purple-500/30 hover:shadow-purple-500/40 hover:brightness-110 transition-all duration-300 text-base sm:text-lg px-8 py-6 font-semibold group rounded-xl"
                style={primaryCtaGradient}
              >
                Começar Gratuitamente
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="border-2 border-gray-600 text-gray-300 hover:bg-white/5 hover:border-gray-500 transition-all duration-200 text-base sm:text-lg px-8 py-6 font-semibold bg-transparent"
                onClick={handleDemoClick}
              >
                <Play className="w-5 h-5 mr-2" />
                Assistir Demo
              </Button>
            </div>

            {/* Stats - Centered */}
            <div className="grid grid-cols-3 gap-4 sm:gap-8 pt-6 border-t border-gray-800 max-w-xl mx-auto">
              <div className="text-center">
                <div className="text-2xl sm:text-3xl text-white mb-1 font-bold">10k+</div>
                <div className="text-gray-600 dark:text-gray-400 text-xs sm:text-sm font-medium">Clientes</div>
              </div>
              <div className="text-center">
                <div className="text-2xl sm:text-3xl text-white mb-1 font-bold">95%</div>
                <div className="text-gray-600 dark:text-gray-400 text-xs sm:text-sm font-medium">Satisfação</div>
              </div>
              <div className="text-center">
                <div className="text-2xl sm:text-3xl text-white mb-1 font-bold">24/7</div>
                <div className="text-gray-600 dark:text-gray-400 text-xs sm:text-sm font-medium">Suporte</div>
              </div>
            </div>
          </div>

          {/* Dashboard Image - Full Width, Large and Prominent */}
          <div className="relative max-w-6xl mx-auto mt-16">
            {/* Multiple Glow Effects for depth */}
            <div className="absolute -inset-8 bg-gradient-to-r from-blue-500/30 to-purple-500/30 rounded-3xl blur-3xl animate-pulse"></div>
            <div className="absolute -inset-4 bg-gradient-to-br from-purple-500/20 via-blue-500/20 to-cyan-500/20 rounded-3xl blur-2xl"></div>
            
            {/* Dashboard Container - Enhanced */}
            <div className="relative transform hover:scale-[1.02] transition-transform duration-500">
              {/* Border Glow Effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500 rounded-2xl opacity-20 blur-sm"></div>
              
              {/* Main Image Container - Placeholder */}
              <div className="relative bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-2">
                <div 
                  className="w-full h-auto rounded-xl shadow-[0_25px_70px_-20px_rgba(147,51,234,0.5)] border border-purple-500/30 hover:border-purple-500/50 transition-all duration-300 bg-gradient-to-br from-gray-800 to-gray-900 min-h-96 flex items-center justify-center"
                >
                  <div className="text-center text-gray-500 dark:text-gray-400">
                    <div className="text-6xl mb-4">📊</div>
                    <p className="text-lg font-semibold">LeadsFlow Dashboard</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Interface em tempo real</p>
                  </div>
                </div>
              </div>
              
              {/* Floating Badges for highlights */}
              <div className="absolute -top-6 -right-6 bg-gradient-to-r from-green-500 to-emerald-500 text-white px-5 py-3 rounded-full shadow-md font-semibold flex items-center gap-2 animate-bounce z-10">
                <span className="w-2.5 h-2.5 bg-white rounded-full animate-pulse"></span>
                Dashboard Real
              </div>
              
              <div className="absolute -bottom-6 -left-6 bg-gradient-to-r from-blue-500 to-purple-500 text-white px-5 py-3 rounded-full shadow-md font-semibold z-10">
                ⚡ Tempo Real
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Custom Animations */}
      <style>{`
        @keyframes blob {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
    </section>
  );
}

