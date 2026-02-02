import { useEffect, useRef } from 'react';

interface UseLeadsAutoRefreshProps {
  onRefresh: () => void;
  enabled?: boolean;
  interval?: number; // em milissegundos
}

/**
 * Hook que faz polling para detectar novos leads e atualizar automaticamente.
 * Usado para sincronizar leads quando o N8N envia via webhook.
 */
export function useLeadsAutoRefresh({
  onRefresh,
  enabled = true,
  interval = 15000,
}: UseLeadsAutoRefreshProps) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!enabled) {
      // Limpar intervalo se desabilitado
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Configurar polling para recarregar leads periodicamente
    intervalRef.current = setInterval(() => {
      onRefresh();
    }, interval);

    // Cleanup ao desmontar
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, interval, onRefresh]);

  // Função para forçar refresh manual
  const refreshNow = () => {
    onRefresh();
  };

  return {
    refreshNow,
  };
}
