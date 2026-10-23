import { WifiOff } from 'lucide-react';

// No painel, a falta de ligação é avisada pelo ServerStatusBanner (com os dados guardados visíveis)

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
