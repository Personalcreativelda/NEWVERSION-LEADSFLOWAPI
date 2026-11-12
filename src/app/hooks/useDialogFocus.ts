import { useEffect, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Foco dos modais feitos à mão (os do Radix já o fazem): ao abrir, o foco vai para o
 * próprio modal (não para um campo — no telemóvel abria o teclado); o Tab fica dentro
 * dele; ao fechar, volta ao botão que o abriu. O elemento precisa de `tabIndex={-1}`.
 */
export function useDialogFocus(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    const previous = document.activeElement as HTMLElement | null;
    if (!box.contains(document.activeElement)) box.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      // Com um modal por cima de outro, só o de cima trata o Tab
      const open = document.querySelectorAll('[aria-modal="true"]');
      if (open[open.length - 1] !== box) return;
      const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === box)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (active === last || !box.contains(active))) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [ref]);
}
