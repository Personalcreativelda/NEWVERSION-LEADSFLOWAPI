import { useState } from 'react';
import { CloudOff, RefreshCw, WifiOff } from 'lucide-react';
import { haptic } from '../../../native';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { checkServerNow, useServerStatus } from '../../lib/serverStatus';

/**
 * Faixa no topo do painel quando o aparelho está sem internet ou o servidor não responde.
 * O conteúdo continua visível com as cópias guardadas no aparelho; quando o servidor
 * volta, o painel recarrega sozinho (SERVER_BACK_EVENT) e a faixa desaparece.
 * Só diz o estado da ligação — o funcionamento offline fica invisível para o utilizador.
 */
export function ServerStatusBanner() {
  const isOnline = useOnlineStatus();
  const { down } = useServerStatus();
  const [checking, setChecking] = useState(false);

  if (isOnline && !down) return null;

  const retry = async () => {
    haptic();
    setChecking(true);
    await checkServerNow();
    setChecking(false);
  };

  const Icon = isOnline ? CloudOff : WifiOff;
  const title = isOnline ? 'Sem ligação ao servidor' : 'Sem ligação à internet';

  return (
    <div role="status" aria-live="polite" className="bg-amber-500/10 border-b border-amber-500/30 px-4 sm:px-6 py-2">
      <div className="max-w-[1720px] mx-auto flex items-center gap-3">
        <Icon aria-hidden className="w-5 h-5 flex-shrink-0 text-amber-500" />
        <p className="flex-1 min-w-0 text-sm font-semibold text-foreground">{title}</p>
        {isOnline && (
          <button
            type="button"
            onClick={retry}
            disabled={checking}
            aria-label="Tentar de novo"
            className="flex-shrink-0 inline-flex h-8 items-center gap-1.5 px-3 rounded-lg text-sm font-medium bg-amber-500 text-white active:bg-amber-600 transition-colors disabled:opacity-70"
          >
            <RefreshCw aria-hidden className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Tentar de novo</span>
          </button>
        )}
      </div>
    </div>
  );
}
