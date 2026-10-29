import type { ReactNode } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { cn } from '../ui/utils';

type AppModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

const SIZE_CLASS: Record<AppModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  '2xl': 'max-w-5xl',
};

interface AppModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  description?: ReactNode;
  /** Logótipo do que se está a configurar (LogoBox), à esquerda do título */
  logo?: ReactNode;
  size?: AppModalSize;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Classes extra para a área com scroll (corpo) */
  bodyClassName?: string;
}

/**
 * Envolve o `Dialog` existente (src/app/components/ui/dialog.tsx — Radix
 * Dialog, com portal/focus-trap próprios) em vez de o recriar em MUI:
 * preserva foco/teclado/portal e só acrescenta convenções de
 * header/body/footer/tamanho.
 *
 * Layout fixo, igual em todos os modais: cabeçalho e barra de botões ficam
 * sempre visíveis (com separadores) e só o corpo faz scroll. Modais que passam
 * `p-0` tratam o espaçamento do corpo eles próprios; os restantes recebem-no aqui.
 */
export function AppModal({
  open,
  onOpenChange,
  title,
  description,
  logo,
  size = 'md',
  footer,
  children,
  className,
  bodyClassName,
}: AppModalProps) {
  const cls = className || '';
  // Modal com padding próprio (ex.: p-8) mantém o layout simples de sempre
  const hasOwnPadding = /(^|\s)p-(?!0(\s|$))\S+/.test(cls);
  const bodyHandlesPadding = hasOwnPadding || /(^|\s)p-0(\s|$)/.test(cls);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          !hasOwnPadding && 'p-0 sm:p-0 gap-0 overflow-hidden',
          SIZE_CLASS[size],
          cls,
        )}
      >
        {(title || description) && (
          <DialogHeader className="shrink-0 px-5 pt-5 pb-4 sm:px-6 border-b border-border">
            {logo ? (
              <div className="flex items-center gap-3 min-w-0 pr-8 text-left">
                {logo}
                <div className="min-w-0 space-y-1">
                  {title && <DialogTitle>{title}</DialogTitle>}
                  {description && <DialogDescription>{description}</DialogDescription>}
                </div>
              </div>
            ) : (
              <>
                {title && <DialogTitle>{title}</DialogTitle>}
                {description && <DialogDescription>{description}</DialogDescription>}
              </>
            )}
          </DialogHeader>
        )}

        <div
          className={cn(
            'flex-1 min-h-0 overflow-y-auto overscroll-contain',
            !bodyHandlesPadding && 'px-5 py-5 sm:px-6',
            bodyClassName,
          )}
        >
          {children}
        </div>

        {footer && (
          <DialogFooter
            className="shrink-0 px-5 py-3.5 sm:px-6 border-t border-border bg-muted/30 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:pb-3.5"
          >
            {footer}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
