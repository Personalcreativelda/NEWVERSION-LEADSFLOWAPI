import { useCallback, useSyncExternalStore } from 'react';

/**
 * Se a media query corresponde agora (atualiza ao rodar o ecrã ou redimensionar).
 * Para desenhar só a versão visível (telemóvel OU desktop) em vez das duas com
 * `hidden md:block`, que montava as duas listas inteiras.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const mql = window.matchMedia(query);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}

/** Mesmo limite do `md:` do Tailwind (768px) */
export const useIsDesktop = () => useMediaQuery('(min-width: 768px)');
