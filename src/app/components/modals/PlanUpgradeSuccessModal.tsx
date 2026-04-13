import { useEffect, useRef } from 'react';
import { X, CheckCircle, Zap, Crown, Rocket, Infinity } from 'lucide-react';

interface PlanUpgradeSuccessModalProps {
  isOpen: boolean;
  plan: string;
  onClose: () => void;
}

const PLAN_CONFIG: Record<string, {
  label: string;
  icon: React.ComponentType<any>;
  color: string;
  gradientFrom: string;
  gradientTo: string;
  badgeBg: string;
  badgeText: string;
  ringColor: string;
  features: string[];
}> = {
  business: {
    label: 'Business',
    icon: Zap,
    color: 'text-blue-400',
    gradientFrom: 'from-blue-600/20',
    gradientTo: 'to-purple-600/20',
    badgeBg: 'bg-blue-500/20 border border-blue-500/40',
    badgeText: 'text-blue-300',
    ringColor: 'ring-blue-500/30',
    features: ['2.000 leads', '1.000 mensagens individuais', '5.000 campanhas em massa'],
  },
  enterprise: {
    label: 'Enterprise',
    icon: Crown,
    color: 'text-amber-400',
    gradientFrom: 'from-amber-600/20',
    gradientTo: 'to-orange-600/20',
    badgeBg: 'bg-amber-500/20 border border-amber-500/40',
    badgeText: 'text-amber-300',
    ringColor: 'ring-amber-500/30',
    features: ['Leads ilimitados', 'Mensagens ilimitadas', 'Envios em massa ilimitados'],
  },
  pro: {
    label: 'Pro',
    icon: Rocket,
    color: 'text-violet-400',
    gradientFrom: 'from-violet-600/20',
    gradientTo: 'to-pink-600/20',
    badgeBg: 'bg-violet-500/20 border border-violet-500/40',
    badgeText: 'text-violet-300',
    ringColor: 'ring-violet-500/30',
    features: ['Recursos avançados', 'Suporte prioritário', 'Integrações ilimitadas'],
  },
};

const DEFAULT_CONFIG = {
  label: 'Premium',
  icon: Rocket,
  color: 'text-emerald-400',
  gradientFrom: 'from-emerald-600/20',
  gradientTo: 'to-teal-600/20',
  badgeBg: 'bg-emerald-500/20 border border-emerald-500/40',
  badgeText: 'text-emerald-300',
  ringColor: 'ring-emerald-500/30',
  features: ['Todos os recursos desbloqueados', 'Suporte prioritário', 'Sem limitações'],
};

export default function PlanUpgradeSuccessModal({ isOpen, plan, onClose }: PlanUpgradeSuccessModalProps) {
  const config = PLAN_CONFIG[plan?.toLowerCase()] ?? DEFAULT_CONFIG;
  const PlanIcon = config.icon;
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Auto-close after 10s
  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(onClose, 10000);
    return () => clearTimeout(t);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Plano atualizado com sucesso"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" />

      {/* Panel — full-width bottom sheet on mobile, centered card on ≥sm */}
      <div className={`
        relative w-full sm:max-w-md
        bg-[#111111] border border-white/10
        rounded-t-3xl sm:rounded-2xl
        shadow-2xl ring-1 ${config.ringColor}
        animate-slide-up sm:animate-scale-in
        overflow-hidden
      `}>
        {/* Top gradient strip */}
        <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${config.gradientFrom.replace('/20', '')} ${config.gradientTo.replace('/20', '')}`} />

        {/* Mobile drag handle */}
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Fechar"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="px-6 pt-6 pb-8 sm:px-8 sm:pt-8">
          {/* Icon + sparkle */}
          <div className="flex justify-center mb-5">
            <div className="relative">
              <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${config.gradientFrom} ${config.gradientTo} border border-white/10 flex items-center justify-center`}>
                <PlanIcon className={`w-10 h-10 ${config.color}`} />
              </div>
              {/* Success badge */}
              <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center ring-2 ring-[#111111]">
                <CheckCircle className="w-4 h-4 text-white" />
              </div>
            </div>
          </div>

          {/* Title */}
          <div className="text-center mb-2">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-widest ${config.badgeBg} ${config.badgeText} mb-3`}>
              <PlanIcon className="w-3 h-3" />
              {config.label}
            </span>
            <h2 className="text-white text-2xl sm:text-3xl font-bold leading-tight">
              Parabéns! 🎉
            </h2>
            <p className="text-white/60 text-sm sm:text-base mt-1">
              Seu plano foi atualizado para{' '}
              <span className={`font-semibold ${config.color}`}>{config.label}</span>
              {' '}com sucesso!
            </p>
          </div>

          {/* Divider */}
          <div className="my-5 border-t border-white/8" />

          {/* Features unlocked */}
          <p className="text-white/40 text-xs font-medium uppercase tracking-wider mb-3">
            O que você desbloqueou
          </p>
          <ul className="space-y-2.5 mb-6">
            {config.features.map((feat) => (
              <li key={feat} className="flex items-center gap-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <CheckCircle className="w-3 h-3 text-emerald-400" />
                </span>
                <span className="text-white/80 text-sm">{feat}</span>
                {feat.toLowerCase().includes('ilimitad') && (
                  <Infinity className="w-3.5 h-3.5 text-emerald-400 ml-auto flex-shrink-0" />
                )}
              </li>
            ))}
          </ul>

          {/* CTA */}
          <button
            onClick={onClose}
            className={`
              w-full py-3 px-6 rounded-xl font-semibold text-sm
              bg-gradient-to-r ${config.gradientFrom.replace('/20', '/80')} ${config.gradientTo.replace('/20', '/80')}
              border border-white/20 text-white
              hover:brightness-110 active:scale-95
              transition-all duration-150
            `}
          >
            Começar a usar agora
          </button>

          {/* Auto-close hint */}
          <p className="text-center text-white/25 text-xs mt-3">
            Fecha automaticamente em alguns segundos
          </p>
        </div>
      </div>
    </div>
  );
}
