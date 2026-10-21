import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../ui/utils';

interface PageHeaderProps {
  title: string;
  /** Uma frase curta — no telemóvel mostra-se só a primeira linha */
  description?: string;
  icon?: LucideIcon;
  /** Botões à direita (primário por último). Use PageAction para ações secundárias. */
  actions?: ReactNode;
  className?: string;
}

/**
 * Cabeçalho único de todas as páginas do painel (sistema de design do app):
 * título 20px (telemóvel) / 24px, descrição numa linha, ícone num quadrado
 * primary/10 e ações com 40px de altura. As margens laterais vêm do contentor
 * da página (PageContainer no Dashboard) — a página não deve somar as suas.
 */
export function PageHeader({ title, description, icon: Icon, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between', className)}>
      <div className="flex min-w-0 items-center gap-3">
        {Icon && (
          <div className="hidden h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex">
            <Icon className="h-5 w-5" aria-hidden />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{title}</h1>
          {description && (
            <p className="mt-1 line-clamp-1 text-sm text-muted-foreground sm:line-clamp-2">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

interface PageActionProps {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  /** primary = ação principal da página (no máximo uma) */
  variant?: 'primary' | 'secondary';
  /** Ações secundárias ficam só com o ícone no telemóvel */
  className?: string;
}

/** Botão de ação do PageHeader: 40px de altura; secundárias só com ícone no telemóvel. */
export function PageAction({ icon: Icon, label, onClick, disabled, variant = 'secondary', className }: PageActionProps) {
  const primary = variant === 'primary';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 sm:px-4',
        primary
          ? 'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80'
          : 'border border-border bg-card text-foreground hover:bg-muted active:bg-muted',
        className,
      )}
    >
      <Icon className="h-4 w-4 flex-shrink-0" aria-hidden />
      <span className={primary ? undefined : 'hidden sm:inline'}>{label}</span>
    </button>
  );
}
