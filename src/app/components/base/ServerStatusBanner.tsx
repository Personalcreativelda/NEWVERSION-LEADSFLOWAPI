import { useState } from 'react';
import { CloudOff, RefreshCw, WifiOff } from 'lucide-react';
import { haptic } from '../../../native';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { checkServerNow, useServerStatus } from '../../lib/serverStatus';
import { useOutboxCount } from '../../lib/outbox';
import { formatRelativeDay } from '../../utils/format';

/** "às 10:32" hoje, "de ontem", "de terça", "de 21/10" */
function savedWhen(timestamp: number): string {
  const label = formatRelativeDay(timestamp, 'time');
  return /^\d/.test(label) && label.includes(':') ? `às ${label}` : `de ${label.toLowerCase()}`;
}

/**
 * Faixa no topo do painel quando o aparelho está sem internet ou o servidor não responde.
 * O conteúdo continua visível com as cópias guardadas no aparelho; quando o servidor
 * volta, o painel recarrega sozinho (SERVER_BACK_EVENT) e a faixa desaparece.
 */
export function ServerStatusBanner() {
  const isOnline = useOnlineStatus();
  const { down, staleSince } = useServerStatus();
  const queued = useOutboxCount();
  const [checking, setChecking] = useState(false);

  if (isOnline && !down) return null;

  const retry = async () => {
    haptic();
    setChecking(true);
    await checkServerNow();
    setChecking(false);
  };

  const Icon = isOnline ? CloudOff : WifiOff;
  const title = isOnline ? 'Servidor indisponível' : 'Sem ligação à internet';
  const shown = staleSince ? `A mostrar dados guardados ${savedWhen(staleSince)}.` : 'A mostrar os dados guardados neste aparelho.';
  const detail = `${shown} Mensagens, notas e alterações de leads ficam na fila até a ligação voltar.`;

  return (
    <div role="status" aria-live="polite" className="bg-amber-500/10 border-b border-amber-500/30 px-4 sm:px-6 py-2.5">
      <div className="max-w-[1720px] mx-auto flex items-center gap-3">
        <Icon aria-hidden className="w-5 h-5 flex-shrink-0 text-amber-500" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {title}
            {queued > 0 && (
              <span className="ml-2 inline-flex items-center rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                {queued} na fila
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">{detail}</p>
        </div>
        {isOnline && (
          <button
            type="button"
            onClick={retry}
            disabled={checking}
            className="flex-shrink-0 inline-flex h-9 items-center gap-1.5 px-3 rounded-lg text-sm font-medium bg-amber-500 text-white active:bg-amber-600 transition-colors disabled:opacity-70"
          >
            <RefreshCw aria-hidden className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Tentar de novo</span>
          </button>
        )}
      </div>
    </div>
  );
}
