import { useState } from 'react';
import { AlertTriangle, XCircle, Clock, Zap, X } from 'lucide-react';
import { plansApi } from '../../utils/api';
import { toast } from 'sonner';
import UpgradeModal from './UpgradeModal';

interface PlanEnforcementModalProps {
  /** One of PLAN_EXPIRED | PAYMENT_OVERDUE | LEAD_LIMIT_EXCEEDED (null = hidden) */
  code: string | null;
  message: string | null;
  currentPlan: string;
  onClose: () => void;
  onUpgradeSuccess: (updatedUser: any) => void;
}

const TITLES: Record<string, string> = {
  PLAN_EXPIRED: 'Plano Expirado',
  PAYMENT_OVERDUE: 'Pagamento em Atraso',
  LEAD_LIMIT_EXCEEDED: 'Limite de Leads Atingido',
  MESSAGE_LIMIT_EXCEEDED: 'Limite de Mensagens Atingido',
  MASS_MESSAGE_LIMIT_EXCEEDED: 'Limite de Campanhas Atingido',
};

export default function PlanEnforcementModal({
  code,
  message,
  currentPlan,
  onClose,
  onUpgradeSuccess,
}: PlanEnforcementModalProps) {
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [loadingPortal, setLoadingPortal] = useState(false);

  if (!code) return null;

  const isExpiredOrOverdue = code === 'PLAN_EXPIRED' || code === 'PAYMENT_OVERDUE';
  const isLimitExceeded = code === 'LEAD_LIMIT_EXCEEDED' || code === 'MESSAGE_LIMIT_EXCEEDED' || code === 'MASS_MESSAGE_LIMIT_EXCEEDED';
  const hasPaidPlan = currentPlan !== 'free';

  const handlePortal = async () => {
    setLoadingPortal(true);
    try {
      const result = await plansApi.createPortalSession();
      if (result?.url) {
        window.location.href = result.url;
      } else {
        setShowUpgrade(true);
      }
    } catch {
      toast.error('Não foi possível abrir o portal. Tente selecionar um plano abaixo.');
      setShowUpgrade(true);
    } finally {
      setLoadingPortal(false);
    }
  };

  const Icon = isLimitExceeded
    ? AlertTriangle
    : code === 'PAYMENT_OVERDUE'
    ? Clock
    : XCircle;

  const iconColor = isLimitExceeded
    ? 'text-amber-400'
    : 'text-red-500';

  const iconBg = isLimitExceeded
    ? 'bg-amber-500/10 border border-amber-500/20'
    : 'bg-red-500/10 border border-red-500/20';

  return (
    <>
      {/* Full-screen dimmed overlay — dismissible */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" onClick={onClose}>
        <div className="bg-[#0f0f0f] border border-[#1e1e1e] rounded-2xl shadow-2xl p-8 max-w-md w-full text-center relative" onClick={e => e.stopPropagation()}>

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-600 hover:text-gray-300 transition-colors"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Icon */}
          <div className={`w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center ${iconBg}`}>
            <Icon className={`w-9 h-9 ${iconColor}`} />
          </div>

          {/* Title */}
          <h2 className="text-2xl font-bold text-white mb-3">
            {TITLES[code] ?? 'Acesso Bloqueado'}
          </h2>

          {/* Message */}
          <p className="text-gray-400 mb-8 leading-relaxed text-sm">
            {message ?? 'Faça upgrade do seu plano para continuar usando a plataforma.'}
          </p>

          {/* CTA buttons */}
          <div className="flex flex-col gap-3">
            {/* Primary: renew via portal (expired/overdue with paid plan) OR upgrade */}
            {isExpiredOrOverdue && hasPaidPlan ? (
              <button
                onClick={handlePortal}
                disabled={loadingPortal}
                className="w-full py-3 bg-[#00C48C] hover:bg-[#00aa7a] active:bg-[#009068] text-white font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loadingPortal ? (
                  <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <Zap className="w-4 h-4" />
                )}
                {loadingPortal ? 'Carregando...' : 'Renovar Assinatura'}
              </button>
            ) : (
              <button
                onClick={() => setShowUpgrade(true)}
                className="w-full py-3 bg-[#00C48C] hover:bg-[#00aa7a] active:bg-[#009068] text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <Zap className="w-4 h-4" />
                Fazer Upgrade
              </button>
            )}

            {/* Secondary: see plans (show when renew portal is primary) */}
            {isExpiredOrOverdue && hasPaidPlan && (
              <button
                onClick={() => setShowUpgrade(true)}
                className="w-full py-2.5 border border-[#2a2a2a] hover:border-[#3a3a3a] text-gray-400 hover:text-gray-200 text-sm font-medium rounded-xl transition-colors"
              >
                Ver outros planos
              </button>
            )}
          </div>

          {/* Fine print */}
          <p className="mt-6 text-xs text-gray-600">
            Você ainda pode visualizar seus dados. Para criar ou editar, renove seu plano.
          </p>
        </div>
      </div>
      {showUpgrade && (
        <UpgradeModal
          isOpen={showUpgrade}
          onClose={() => setShowUpgrade(false)}
          currentPlan={currentPlan}
          onUpgradeSuccess={(updatedUser) => {
            setShowUpgrade(false);
            onUpgradeSuccess(updatedUser);
          }}
        />
      )}
    </>
  );
}
