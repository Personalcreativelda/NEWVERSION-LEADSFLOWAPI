import { flushSync } from 'react-dom';

/** forward = abrir uma página; back = voltar; tab = trocar de separador (barra inferior) */
export type PageDirection = 'forward' | 'back' | 'tab';

type ViewTransitionDoc = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

/**
 * Troca de página com transição de app (View Transitions API do WebView): a página nova
 * desliza da direita ao abrir, da esquerda ao voltar, e cruza com a anterior entre separadores.
 * Cabeçalho, barra inferior e botão flutuante ficam parados (view-transition-name em
 * globals.css). Só no telemóvel; no desktop, sem a API ou com "reduzir movimento" a troca
 * é imediata, como antes.
 */
export function withPageTransition(update: () => void, direction: PageDirection) {
  const doc = document as ViewTransitionDoc;
  const animate =
    typeof doc.startViewTransition === 'function' &&
    window.matchMedia('(max-width: 767px)').matches &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!animate) {
    update();
    return;
  }
  const root = document.documentElement;
  root.dataset.pageDir = direction;
  try {
    const transition = doc.startViewTransition!(() => flushSync(update));
    transition.finished.finally(() => {
      if (root.dataset.pageDir === direction) delete root.dataset.pageDir;
    });
  } catch {
    delete root.dataset.pageDir;
    update();
  }
}
