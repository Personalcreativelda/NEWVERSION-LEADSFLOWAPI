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
    // Ações sempre à direita do título, também no telemóvel (numa linha própria por
    // baixo, um só botão ocupava uma linha inteira de ecrã)
    <header className={cn('mb-5 flex items-start justify-between gap-3 sm:mb-6 sm:items-center', className)}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {Icon && (
          <div className="hidden h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex">
            <Icon className="h-5 w-5" aria-hidden />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{title}</h1>
          {description && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
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

/** Botão de ação do PageHeader: 40px de altura; no telemóvel só com o ícone (o texto fica no aria-label). */
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
        // Telemóvel: só o ícone (40×40), para o título ao lado ter espaço; desktop com texto
        'inline-flex h-10 w-10 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-[color,background-color,border-color,transform] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 sm:w-auto sm:px-4',
        primary
          ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:bg-primary/80'
          : 'border border-border bg-card text-foreground hover:bg-muted active:bg-muted',
        className,
      )}
    >
      <Icon className={cn('flex-shrink-0', primary ? 'h-5 w-5 sm:h-4 sm:w-4' : 'h-4 w-4')} aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
