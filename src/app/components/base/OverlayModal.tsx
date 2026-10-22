import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../ui/utils';

interface OverlayModalProps {
  onClose: () => void;
  children: ReactNode;
  /** Largura e extras do painel (ex.: "max-w-md") */
  className?: string;
  /**
   * O painel tem cabeçalho (1.º filho) e barra de botões (último filho): ficam fixos
   * e só o meio faz scroll, como no AppModal.
   */
  stickyEdges?: boolean;
}

/**
 * Casca comum para os modais feitos à mão (sem Radix): desenhada no <body>, acima de
 * cabeçalho, sidebar e barra inferior; folha que sobe do fundo no telemóvel e cartão
 * centrado no desktop; fecha com Esc e ao tocar fora; bloqueia o scroll da página.
 */
export function OverlayModal({ onClose, children, className, stickyEdges = true }: OverlayModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onNativeBack = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    window.addEventListener('native-back', onNativeBack);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('native-back', onNativeBack);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-[2px] sm:p-6 animate-in fade-in duration-200"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative flex flex-col w-full max-w-lg bg-card text-card-foreground border border-border shadow-2xl',
          'rounded-t-2xl rounded-b-none sm:rounded-2xl',
          'max-h-[92dvh] sm:max-h-[min(88dvh,820px)] overflow-y-auto overscroll-contain',
          'animate-in fade-in slide-in-from-bottom-10 sm:slide-in-from-bottom-2 sm:zoom-in-[0.97] duration-200',
          stickyEdges && [
            '[&>*:first-child]:sticky [&>*:first-child]:top-0 [&>*:first-child]:z-10 [&>*:first-child]:bg-card',
            '[&>*:last-child]:sticky [&>*:last-child]:bottom-0 [&>*:last-child]:z-10 [&>*:last-child]:bg-card',
            '[&>*:last-child]:pb-[max(1rem,env(safe-area-inset-bottom))] sm:[&>*:last-child]:pb-4',
          ],
          className,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
