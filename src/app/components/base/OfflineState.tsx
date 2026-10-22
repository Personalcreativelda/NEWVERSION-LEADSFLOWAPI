import { useState } from 'react';
import { RefreshCw, WifiOff } from 'lucide-react';
import { haptic } from '../../../native';

interface OfflineStateProps {
  /** Chamado quando a ligação já voltou e o utilizador toca em "Tentar novamente" */
  onRetry: () => void;
}

/**
 * Ecrã sem internet (no lugar dos esqueletos de carregamento, que ficavam para sempre).
 * Quando a ligação volta o painel recarrega sozinho; o botão serve para tentar já.
 */
export function OfflineState({ onRetry }: OfflineStateProps) {
  const [checking, setChecking] = useState(false);

  const retry = () => {
    setChecking(true);
    haptic();
    setTimeout(() => {
      setChecking(false);
      if (navigator.onLine) onRetry();
    }, 700);
  };

  return (
    <div role="status" aria-live="polite" className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-16 text-center animate-in fade-in duration-300">
      <div className="relative mb-6">
        <span className="absolute inset-0 rounded-full bg-amber-500/15 animate-ping [animation-duration:2.4s]" />
        <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/12 text-amber-500">
          <WifiOff className="h-7 w-7" strokeWidth={2} />
        </span>
      </div>
      <h2 className="text-lg font-semibold tracking-tight text-foreground">Sem ligação à internet</h2>
      <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground">
        Verifique o Wi-Fi ou os dados móveis. Assim que a ligação voltar, o LeadsFlow atualiza sozinho.
      </p>
      <button
        type="button"
        onClick={retry}
        disabled={checking}
        className="mt-6 inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted active:scale-[0.98] disabled:opacity-60"
      >
        <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
        Tentar novamente
      </button>
    </div>
  );
}

/** Faixa fina no topo para os ecrãs fora do painel (login, registo) */
export function OfflineBanner() {
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[9997] flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-[13px] font-medium text-white shadow-md animate-in slide-in-from-top duration-300"
      style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
    >
      <WifiOff className="h-4 w-4" />
      Sem ligação à internet
    </div>
  );
}
