import { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Check, Users, MessageSquare, Workflow, Bot, Megaphone, BarChart3, Plug, Bell, Zap, Target } from 'lucide-react';
import { Button } from '../ui/button';

interface TourStep {
  target: string;
  title: string;
  description: string;
  tip?: string; // Dica de vendas extra
  icon?: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  navigateTo?: string;
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
    title: 'Bem-vindo ao LeadsFlow!',
    description: 'A plataforma completa de vendas e automação. Em poucos minutos vamos mostrar tudo o que precisa para fechar mais negócios.',
    tip: 'Dica: Empresas que usam CRM vendem até 29% mais. Vamos configurar o seu!',
    icon: <Target className="w-5 h-5" />,
    position: 'bottom',
  },
  {
    target: '#plan-limits-card',
    title: 'Limites do seu Plano',
    description: 'Acompanhe em tempo real o uso de leads, mensagens WhatsApp e campanhas do seu plano. Quando atingir o limite, faça upgrade para não perder oportunidades.',
    tip: 'Dica: Mantenha sempre abaixo de 80% para garantir que nenhum lead se perde.',
    icon: <BarChart3 className="w-5 h-5" />,
    position: 'bottom',
  },
  {
    target: '#total-leads-card',
    title: 'Base de Leads',
    description: 'O seu ativo mais valioso. Cada lead aqui é uma oportunidade de negócio. Importe contactos existentes ou capture novos via formulários e WhatsApp.',
    tip: 'Dica: Leads contactados nas primeiras 5 min têm 9x mais chance de conversão.',
    icon: <Users className="w-5 h-5" />,
    position: 'right',
  },
  {
    target: '#leads-today-card',
    title: 'Leads Captados Hoje',
    description: 'Novos leads entram automaticamente quando alguém fala no WhatsApp conectado ou preenche um formulário. Responda rápido — a velocidade define o resultado.',
    tip: 'Dica: Use o Assistente de IA para responder automaticamente fora do horário.',
    icon: <Zap className="w-5 h-5" />,
    position: 'right',
  },
  {
    target: '#leads-converted-card',
    title: 'Leads Convertidos',
    description: 'Leads marcados como "Convertido" no funil de vendas. Analise quais abordagens têm melhor resultado e replique para o time.',
    tip: 'Dica: Celebre cada conversão! Defina metas semanais e acompanhe aqui.',
    icon: <Check className="w-5 h-5" />,
    position: 'right',
  },
  {
    target: '#conversion-rate-card',
    title: 'Taxa de Conversão',
    description: 'A métrica mais importante do seu negócio. Mostra a percentagem de leads que se tornam clientes. Abaixo de 10%? Reveja o processo de abordagem.',
    tip: 'Dica: Média do mercado é 5–15%. Com automação e follow-up pode chegar a 25%+.',
    icon: <BarChart3 className="w-5 h-5" />,
    position: 'right',
  },
  {
    target: '#sidebar-navigation',
    title: 'Funil de Vendas',
    description: 'O coração da gestão comercial. Arraste leads entre etapas: Novo → Contactado → Qualificado → Negociação → Convertido. Visualize em Kanban ou lista.',
    tip: 'Dica: Defina critérios claros para cada etapa. Ex: "Qualificado" = lead com budget confirmado.',
    icon: <Workflow className="w-5 h-5" />,
    position: 'right',
    navigateTo: 'funnel',
  },
  {
    target: '#sidebar-navigation',
    title: 'Inbox — Central de Mensagens',
    description: 'Todas as conversas de WhatsApp, email e outros canais num só lugar. Atribua conversas a agentes, use respostas rápidas e nunca perca uma mensagem.',
    tip: 'Dica: Configure SLA de resposta. Leads que esperam mais de 24h perdem o interesse.',
    icon: <MessageSquare className="w-5 h-5" />,
    position: 'right',
    navigateTo: 'inbox',
  },
  {
    target: '#sidebar-navigation',
    title: 'Assistentes de IA',
    description: 'Bots inteligentes que qualificam leads, respondem perguntas frequentes e avançam o funil automaticamente — 24 horas por dia, 7 dias por semana, sem custo adicional.',
    tip: 'Dica: Configure o "Qualificador de Leads" para fazer as perguntas certas antes de passar para o humano.',
    icon: <Bot className="w-5 h-5" />,
    position: 'right',
    navigateTo: 'ai-assistants',
  },
  {
    target: '#sidebar-navigation',
    title: 'Campanhas em Massa',
    description: 'Envie mensagens personalizadas para centenas de leads de uma vez. Ideal para promoções, follow-ups, reativação de leads frios e anúncios de novos produtos.',
    tip: 'Dica: Segmente por etapa do funil. Leads em "Negociação" precisam de mensagens diferentes dos "Novos".',
    icon: <Megaphone className="w-5 h-5" />,
    position: 'right',
    navigateTo: 'campaigns',
  },
  {
    target: '#sidebar-navigation',
    title: 'Conectar WhatsApp',
    description: 'Vá em Inbox → Configurações para conectar o seu número de WhatsApp. Após conectado, todas as mensagens chegam aqui e o bot entra em ação automaticamente.',
    tip: 'Dica: Use um número dedicado para o negócio. Misturar pessoal e profissional reduz a confiança.',
    icon: <Plug className="w-5 h-5" />,
    position: 'right',
    navigateTo: 'inbox-settings',
  },
  {
    target: '#sidebar-navigation',
    title: 'Integrações',
    description: 'Conecte o LeadsFlow com n8n, webhooks e APIs externas. Configure envio em massa, importação de contactos e automações avançadas de vendas.',
    tip: 'Dica: A integração com n8n permite criar fluxos de automação sem código — notificações, CRMs externos, e muito mais.',
    icon: <Plug className="w-5 h-5" />,
    position: 'right',
    navigateTo: 'integrations',
  },
  {
    target: '#notification-button',
    title: 'Notificações em Tempo Real',
    description: 'Receba alertas instantâneos de novos leads, mensagens não lidas, campanhas concluídas e atualizações de funil. Nunca perca um momento crítico de venda.',
    tip: 'Dica: Active as notificações do navegador para ser avisado mesmo com o computador em segundo plano.',
    icon: <Bell className="w-5 h-5" />,
    position: 'left',
    navigateTo: 'dashboard',
  },
  {
    target: '#user-avatar',
    title: 'Perfil e Configurações',
    description: 'Gerencie a sua conta, segurança (2FA, tokens de API), avatar e nome. Aqui também acede ao seu plano e pode fazer upgrade quando precisar de mais capacidade.',
    tip: 'Dica: Active a autenticação de dois fatores para proteger o acesso à plataforma.',
    icon: <Users className="w-5 h-5" />,
    position: 'left',
  },
  {
    target: '#dashboard-welcome',
    title: 'Está pronto para vender mais!',
    description: 'Agora conhece todas as ferramentas do LeadsFlow. O próximo passo é conectar o seu WhatsApp, importar os primeiros leads e lançar uma campanha.',
    tip: '🚀 Meta: nas próximas 24h conecte o WhatsApp e importe pelo menos 10 leads.',
    icon: <Target className="w-5 h-5" />,
    position: 'bottom',
  },
];

export default function ProductTour({ onComplete, onSkip, onNavigate }: ProductTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const [isVisible, setIsVisible] = useState(false);

  const currentTourStep = tourSteps[currentStep];

  useEffect(() => {
    const timer = setTimeout(() => {
      updateTargetElement();
      setIsVisible(true);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (currentTourStep.navigateTo && onNavigate) {
      onNavigate(currentTourStep.navigateTo);
      setTimeout(() => updateTargetElement(), 300);
    } else {
      updateTargetElement();
    }
    const handleResize = () => updateTargetElement();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [currentStep]);

  const updateTargetElement = () => {
    const element = document.querySelector(currentTourStep.target) as HTMLElement;
    if (element) {
      setTargetElement(element);
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });

      const rect = element.getBoundingClientRect();
      const position = currentTourStep.position || 'bottom';
      const TW = 440; // tooltip width
      const TH = 280; // tooltip estimated height

      let top = 0;
      let left = 0;

      if (position === 'center') {
        top = window.innerHeight / 2 - TH / 2;
        left = window.innerWidth / 2 - TW / 2;
      } else {
        switch (position) {
          case 'top':
            top = rect.top - TH - 16;
            left = rect.left + rect.width / 2 - TW / 2;
            break;
          case 'bottom':
            top = rect.bottom + 16;
            left = rect.left + rect.width / 2 - TW / 2;
            break;
          case 'left':
            top = rect.top + rect.height / 2 - TH / 2;
            left = rect.left - TW - 16;
            break;
          case 'right':
            top = rect.top + rect.height / 2 - TH / 2;
            left = rect.right + 16;
            break;
        }
        if (left < 10) left = 10;
        if (left + TW > window.innerWidth - 10) left = window.innerWidth - TW - 10;
        if (top < 10) top = 10;
        if (top + TH > window.innerHeight - 10) top = window.innerHeight - TH - 10;
      }

      setTooltipPosition({ top, left });
    }
  };

  const handleNext = () => {
    if (currentStep < tourSteps.length - 1) setCurrentStep(currentStep + 1);
    else handleComplete();
  };

  const handlePrevious = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  const handleComplete = () => {
    setIsVisible(false);
    setTimeout(() => onComplete(), 300);
  };

  const handleSkip = () => {
    setIsVisible(false);
    setTimeout(() => onSkip(), 300);
  };

  if (!targetElement) return null;

  const targetRect = targetElement.getBoundingClientRect();
  const progress = ((currentStep + 1) / tourSteps.length) * 100;
  const isLast = currentStep === tourSteps.length - 1;

  return (
    <>
      {/* Dark overlay */}
      <div
        className={`fixed inset-0 transition-opacity duration-300 z-[9998] pointer-events-none ${isVisible ? 'opacity-100' : 'opacity-0'}`}
        style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      />

      {/* Spotlight ring */}
      <div
        className={`fixed z-[9999] pointer-events-none transition-all duration-300 rounded-xl ${isVisible ? 'opacity-100' : 'opacity-0'}`}
        style={{
          top: targetRect.top - 6,
          left: targetRect.left - 6,
          width: targetRect.width + 12,
          height: targetRect.height + 12,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.55), 0 0 0 2px rgba(59,130,246,0.8), 0 0 24px rgba(59,130,246,0.4)',
        }}
      />

      {/* Tooltip card */}
      <div
        className={`fixed z-[10000] transition-all duration-300 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
        style={{ top: tooltipPosition.top, left: tooltipPosition.left, width: 440 }}
      >
        <div className="rounded-2xl overflow-hidden shadow-2xl bg-card border border-border dark:shadow-black/40">

          {/* ── Header gradient ── */}
          <div className="relative px-5 pt-4 pb-5 bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-600 dark:from-blue-700 dark:via-blue-600 dark:to-indigo-700 overflow-hidden">
            {/* decorative circles */}
            <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/10 rounded-full" />
            <div className="absolute -bottom-6 -left-4 w-20 h-20 bg-white/5 rounded-full" />

            <div className="relative flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                {/* icon bubble */}
                <div className="mt-0.5 flex-shrink-0 w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-white">
                  {currentTourStep.icon}
                </div>
                <div>
                  <span className="inline-block text-xs font-semibold text-blue-100 bg-white/15 px-2 py-0.5 rounded-full mb-1.5">
                    Etapa {currentStep + 1} de {tourSteps.length}
                  </span>
                  <h3 className="text-base font-bold text-white leading-snug">
                    {currentTourStep.title}
                  </h3>
                </div>
              </div>
              <button
                onClick={handleSkip}
                className="flex-shrink-0 mt-0.5 p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/20 transition-colors"
                title="Pular tour"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* ── Body ── */}
          <div className="px-5 pt-4 pb-5 space-y-3">
            <p className="text-sm leading-relaxed text-muted-foreground">
              {currentTourStep.description}
            </p>

            {currentTourStep.tip && (
              <div className="flex gap-2 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 rounded-lg px-3 py-2.5">
                <span className="text-blue-500 dark:text-blue-400 flex-shrink-0 mt-px text-xs">💡</span>
                <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">{currentTourStep.tip}</p>
              </div>
            )}

            {/* Progress bar */}
            <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePrevious}
                disabled={currentStep === 0}
                className="gap-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
                Voltar
              </Button>

              <span className="text-xs text-muted-foreground tabular-nums">
                {currentStep + 1} / {tourSteps.length}
              </span>

              {isLast ? (
                <Button
                  size="sm"
                  onClick={handleComplete}
                  className="gap-1.5 bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 text-white border-0"
                >
                  <Check className="w-4 h-4" />
                  Começar agora
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleNext}
                  className="gap-1.5 bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 text-white border-0"
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


