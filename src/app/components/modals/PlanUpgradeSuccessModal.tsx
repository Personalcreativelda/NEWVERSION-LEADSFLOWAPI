import { useEffect } from 'react';
import { OverlayModal } from '../base/OverlayModal';
import { Button } from '../ui/button';
import { X, Check, Zap, Crown, Rocket } from 'lucide-react';

interface PlanUpgradeSuccessModalProps {
  isOpen: boolean;
  plan: string;
  onClose: () => void;
}

// O que cada plano inclui (o mesmo que a página de planos mostra)
const PLAN_CONFIG: Record<string, { label: string; icon: React.ComponentType<any>; features: string[] }> = {
  business: {
    label: 'Business',
    icon: Zap,
    features: ['2.000 leads', '1.000 mensagens individuais', '5.000 campanhas em massa'],
  },
  enterprise: {
    label: 'Enterprise',
    icon: Crown,
    features: ['Leads ilimitados', 'Mensagens ilimitadas', 'Envios em massa ilimitados'],
  },
  pro: {
    label: 'Pro',
    icon: Rocket,
    features: ['Recursos avançados', 'Suporte prioritário', 'Integrações ilimitadas'],
  },
};

const DEFAULT_CONFIG = {
  label: 'Premium',
  icon: Rocket,
  features: ['Todos os recursos', 'Suporte prioritário', 'Sem limites'],
};

export default function PlanUpgradeSuccessModal({ isOpen, plan, onClose }: PlanUpgradeSuccessModalProps) {
  const config = PLAN_CONFIG[plan?.toLowerCase()] ?? DEFAULT_CONFIG;
  const PlanIcon = config.icon;

  // Fecha sozinho ao fim de 10 s
  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(onClose, 10000);
    return () => clearTimeout(t);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <OverlayModal onClose={onClose} stickyEdges={false} className="max-w-md">
      {/* Pega da folha no telemóvel */}
      <div className="flex justify-center pt-3 sm:hidden">
        <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
      </div>

      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label="Fechar"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="px-6 pt-6 pb-6 sm:px-8 sm:pt-8 sm:pb-8">
        <div className="flex justify-center mb-5">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl border border-border bg-muted flex items-center justify-center">
              <PlanIcon className="w-7 h-7 text-foreground" strokeWidth={1.5} />
            </div>
            <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center ring-2 ring-card">
              <Check className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
            </div>
          </div>
        </div>

        <h2 className="font-serif text-center text-2xl font-medium text-foreground">
          {`Plano ${config.label} ativo`}
        </h2>

        <div className="my-6 border-t border-border" />

        <p className="text-sm text-muted-foreground mb-3">Incluído no plano</p>
        <ul className="space-y-2.5 mb-6">
          {config.features.map((feat) => (
            <li key={feat} className="flex items-center gap-3">
              <Check className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
              <span className="text-sm text-foreground">{feat}</span>
            </li>
          ))}
        </ul>

        <Button onClick={onClose} className="w-full">Começar a usar</Button>
      </div>
    </OverlayModal>
  );
}
