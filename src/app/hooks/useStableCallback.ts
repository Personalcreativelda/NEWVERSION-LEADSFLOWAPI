import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * Função com identidade fixa que chama sempre a versão mais recente de `fn`.
 * Para callbacks que chegam do pai criados em cada render (inline): passados assim a
 * linhas/cartões memorizados (`memo`), estes deixam de se redesenhar todos a cada render.
 * Não usar durante o render, só em eventos.
 */
export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R;
export function useStableCallback<A extends unknown[], R>(fn: ((...args: A) => R) | undefined): ((...args: A) => R) | undefined;
export function useStableCallback<A extends unknown[], R>(fn: ((...args: A) => R) | undefined) {
  const ref = useRef(fn);
  useLayoutEffect(() => { ref.current = fn; });
  const stable = useCallback((...args: A) => ref.current!(...args), []);
  // Mantém o "não existe" (alguns filhos escondem a ação quando o callback falta)
  return fn ? stable : undefined;
}
