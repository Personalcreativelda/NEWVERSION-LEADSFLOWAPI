import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../ui/utils';

interface EmptyStateProps {
  title: string;
  description?: string;
  /** Ícone num quadrado (preferível). Sem ícone usa-se a imagem imgSrc. */
  icon?: LucideIcon;
  /** Caminho da imagem (ver public/assets/icons/empty/) */
  imgSrc?: string;
  action?: ReactNode;
  className?: string;
}

const DEFAULT_IMG = '/assets/icons/empty/ic_content.svg';

/**
 * Estado vazio (sem resultados, lista sem itens) do sistema de design:
 * ícone/imagem + título + uma frase de orientação + ação (o próximo passo).
 */
export function EmptyState({
  title,
  description,
  icon: Icon,
  imgSrc = DEFAULT_IMG,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('flex w-full flex-col items-center justify-center px-4 py-12 text-center sm:py-16', className)}>
      {Icon ? (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="h-7 w-7" aria-hidden />
        </div>
      ) : (
        <img src={imgSrc} alt="" aria-hidden className="mb-4 w-full max-w-[120px] sm:max-w-[160px]" />
      )}

      <h3 className="text-base font-semibold text-foreground">{title}</h3>

      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}

      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
