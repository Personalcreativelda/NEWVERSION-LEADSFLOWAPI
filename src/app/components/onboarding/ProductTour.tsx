import { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Check, Sparkles } from 'lucide-react';
import { Button } from '../ui/button';

interface TourStep {
  target: string;
  title: string;
  description: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  navigateTo?: string; // Página para navegar antes de mostrar o step
}

interface ProductTourProps {
  onComplete: () => void;
  onSkip: () => void;
  isDark?: boolean;
  onNavigate?: (page: string) => void;
}

const tourSteps: TourStep[] = [
  {
    target: '#dashboard-welcome',
    title: '👋 Bem-vindo ao LeadsFlow!',
    description: 'Vamos fazer um tour rápido pela plataforma. Você pode pular a qualquer momento.',
    position: 'bottom',
  },
  {
    target: '#plan-limits-card',
    title: '📊 Limites do seu Plano',
    description: 'Aqui você acompanha o uso de leads, mensagens WhatsApp e envios em massa do seu plano atual.',
    position: 'bottom',
  },
  {
    target: '#total-leads-card',
    title: '📈 Total de Leads',
    description: 'Visualize o número total de leads cadastrados no sistema.',
    position: 'right',
  },
  {
    target: '#leads-today-card',
    title: '🎯 Leads Captados Hoje',
    description: 'Acompanhe quantos leads novos chegaram hoje.',
    position: 'right',
  },
  {
    target: '#leads-converted-card',
    title: '✅ Leads Convertidos',
    description: 'Veja quantos leads foram convertidos em clientes.',
    position: 'right',
  },
  {
    target: '#conversion-rate-card',
    title: '📊 Taxa de Conversão',
    description: 'Monitore a eficiência das suas conversões em tempo real.',
    position: 'right',
  },
  {
    target: '#sidebar-navigation',
    title: '🧭 Menu de Navegação',
    description: 'Acesse todas as funcionalidades: Dashboard, Leads, Inbox (caixa de entrada), Funil de Vendas, Analytics, Tarefas, Campanhas e muito mais!',
    position: 'right',
  },
  {
    target: '#sidebar-navigation',
    title: '📬 Conectar Canal de Comunicação',
    description: 'Acesse "Inbox" > "Configurações" no menu lateral para conectar seus canais de WhatsApp, Email e outros. Isso permite receber e enviar mensagens diretamente pela plataforma.',
    position: 'right',
    navigateTo: 'inbox-settings',
  },
  {
    target: '#sidebar-navigation',
    title: '📤 Configurar Envio em Massa',
    description: 'Vá em "Integrações" no menu para configurar a URL do webhook de envio em massa via n8n. Isso permite disparar campanhas de WhatsApp para múltiplos leads de uma vez.',
    position: 'right',
    navigateTo: 'integrations',
  },
  {
    target: '#sidebar-navigation',
    title: '📥 Importar Contatos do WhatsApp',
    description: 'Também em "Integrações", configure a URL de importação de contatos. Com isso, você pode importar sua lista de contatos do WhatsApp automaticamente para a plataforma.',
    position: 'right',
  },
  {
    target: '#notification-button',
    title: '🔔 Central de Notificações',
    description: 'Receba atualizações importantes, alertas sobre campanhas, novos leads e dicas de uso da plataforma.',
    position: 'left',
  },
  {
    target: '#theme-toggle',
    title: '🌓 Alternar Tema',
    description: 'Alterne entre modo claro e escuro conforme sua preferência. O tour também se adapta ao tema selecionado!',
    position: 'left',
  },
  {
    target: '#user-avatar',
    title: '👤 Perfil e Configurações',
    description: 'Acesse suas configurações, personalize seu perfil, gerencie sua conta e veja detalhes do seu plano.',
    position: 'left',
  },
  {
    target: '#dashboard-welcome',
    title: '🎉 Tour Concluído!',
    description: 'Agora você está pronto para começar a gerenciar seus leads e campanhas. Boa sorte nas vendas! 🚀',
    position: 'bottom',
  },
];

export default function ProductTour({ onComplete, onSkip, isDark = false, onNavigate }: ProductTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const [isVisible, setIsVisible] = useState(false);

  const currentTourStep = tourSteps[currentStep];
  
  // Theme-aware colors - overlay mais transparente para ver o conteúdo atrás
  const overlayBg = isDark ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.3)';
  const cardBg = isDark ? 'hsl(var(--card))' : '#ffffff';
  const cardBorder = isDark ? 'hsl(var(--border))' : '#e5e7eb';
  const textPrimary = isDark ? 'hsl(var(--foreground))' : '#1f2937';
  const textSecondary = isDark ? 'hsl(var(--muted-foreground))' : '#6b7280';
  const progressBg = isDark ? 'hsl(var(--muted))' : '#e5e7eb';

  useEffect(() => {
    // Wait for DOM to be ready
    const timer = setTimeout(() => {
      updateTargetElement();
      setIsVisible(true);
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Navigate to specific page if needed
    if (currentTourStep.navigateTo && onNavigate) {
      onNavigate(currentTourStep.navigateTo);
      // Wait for navigation to complete before updating target
      setTimeout(() => {
        updateTargetElement();
      }, 300);
    } else {
      updateTargetElement();
    }
    
    // Update position on resize
    const handleResize = () => updateTargetElement();
    window.addEventListener('resize', handleResize);
    
    return () => window.removeEventListener('resize', handleResize);
  }, [currentStep]);

  const updateTargetElement = () => {
    const element = document.querySelector(currentTourStep.target) as HTMLElement;
    if (element) {
      setTargetElement(element);
      
      // Scroll element into view
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Calculate tooltip position
      const rect = element.getBoundingClientRect();
      const position = currentTourStep.position || 'bottom';
      
      let top = 0;
      let left = 0;
      
      switch (position) {
        case 'top':
          top = rect.top - 180;
          left = rect.left + rect.width / 2 - 200;
          break;
        case 'bottom':
          top = rect.bottom + 20;
          left = rect.left + rect.width / 2 - 200;
          break;
        case 'left':
          top = rect.top + rect.height / 2 - 100;
          left = rect.left - 420;
          break;
        case 'right':
          top = rect.top + rect.height / 2 - 100;
          left = rect.right + 20;
          break;
      }
      
      // Keep tooltip within viewport
      const tooltipWidth = 400;
      const tooltipHeight = 200;
      
      if (left < 10) left = 10;
      if (left + tooltipWidth > window.innerWidth - 10) {
        left = window.innerWidth - tooltipWidth - 10;
      }
      if (top < 10) top = 10;
      if (top + tooltipHeight > window.innerHeight - 10) {
        top = window.innerHeight - tooltipHeight - 10;
      }
      
      setTooltipPosition({ top, left });
    }
  };

  const handleNext = () => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    setIsVisible(false);
    setTimeout(() => {
      onComplete();
    }, 300);
  };

  const handleSkip = () => {
    setIsVisible(false);
    setTimeout(() => {
      onSkip();
    }, 300);
  };

  if (!targetElement) return null;

  const targetRect = targetElement.getBoundingClientRect();

  return (
    <>
      {/* Overlay - adapts to theme */}
      <div 
        className={`fixed inset-0 transition-opacity duration-300 z-[9998] pointer-events-none ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ backgroundColor: overlayBg }}
      />
      
      {/* Spotlight (cut-out effect) */}
      <div 
        className={`fixed z-[9999] pointer-events-none transition-all duration-300 ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          top: `${targetRect.top - 8}px`,
          left: `${targetRect.left - 8}px`,
          width: `${targetRect.width + 16}px`,
          height: `${targetRect.height + 16}px`,
          boxShadow: isDark 
            ? '0 0 0 9999px rgba(0, 0, 0, 0.75), 0 0 30px rgba(139, 92, 246, 0.6)' 
            : '0 0 0 9999px rgba(0, 0, 0, 0.6), 0 0 20px rgba(59, 130, 246, 0.5)',
          borderRadius: '12px',
        }}
      />

      {/* Tooltip - Theme Adaptive */}
      <div
        className={`fixed z-[10000] transition-all duration-300 ${
          isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
        style={{
          top: `${tooltipPosition.top}px`,
          left: `${tooltipPosition.left}px`,
          width: '420px',
        }}
      >
        <div 
          className="rounded-xl shadow-2xl overflow-hidden"
          style={{ 
            backgroundColor: cardBg,
            border: `1px solid ${cardBorder}`,
            boxShadow: isDark 
              ? '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 30px rgba(139, 92, 246, 0.2)'
              : '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
          }}
        >
          {/* Header - Gradient adapts to theme */}
          <div 
            className="p-4 text-white relative overflow-hidden"
            style={{
              background: isDark 
                ? 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 50%, #2563eb 100%)'
                : 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)'
            }}
          >
            {/* Decorative sparkles */}
            <div className="absolute top-2 right-12 opacity-30">
              <Sparkles className="w-6 h-6" />
            </div>
            
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium bg-white/20 px-2 py-0.5 rounded-full">
                Etapa {currentStep + 1} de {tourSteps.length}
              </span>
              <button
                onClick={handleSkip}
                className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                title="Pular tour"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <h3 className="font-semibold text-lg">{currentTourStep.title}</h3>
          </div>

          {/* Content */}
          <div className="p-5">
            <p 
              className="text-sm leading-relaxed mb-4"
              style={{ color: textSecondary }}
            >
              {currentTourStep.description}
            </p>

            {/* Progress bar */}
            <div 
              className="w-full rounded-full h-2 mb-4"
              style={{ backgroundColor: progressBg }}
            >
              <div
                className="h-2 rounded-full transition-all duration-500 ease-out"
                style={{ 
                  width: `${((currentStep + 1) / tourSteps.length) * 100}%`,
                  background: isDark 
                    ? 'linear-gradient(90deg, #7c3aed, #3b82f6)'
                    : 'linear-gradient(90deg, #3b82f6, #8b5cf6)'
                }}
              />
            </div>

            {/* Navigation buttons */}
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrevious}
                disabled={currentStep === 0}
                className="flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" />
                Voltar
              </Button>

              <span 
                className="text-xs font-medium"
                style={{ color: textSecondary }}
              >
                {currentStep + 1}/{tourSteps.length}
              </span>

              {currentStep === tourSteps.length - 1 ? (
                <Button
                  size="sm"
                  onClick={handleComplete}
                  className="flex items-center gap-1 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white border-0 shadow-lg"
                >
                  <Check className="w-4 h-4" />
                  Finalizar
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleNext}
                  className="flex items-center gap-1 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white border-0 shadow-lg"
                >
                  Próximo
                  <ChevronRight className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}


