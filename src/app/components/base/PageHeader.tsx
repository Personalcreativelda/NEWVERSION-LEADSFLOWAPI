import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Plus, type LucideIcon } from 'lucide-react';
import { cn } from '../ui/utils';

interface PageCreateAction {
  label: string;
  onClick: () => void;
  icon?: LucideIcon;
  disabled?: boolean;
}

interface PageHeaderProps {
  /** Título da página — mostrado no cabeçalho do app (RefactoredHeader), não aqui */
  title: string;
  /** Frase curta: só no desktop, por baixo do cabeçalho */
  description?: string;
  icon?: LucideIcon;
  /** Ações secundárias (PageAction) — vão para o cabeçalho, ao lado do título */
  actions?: ReactNode;
  /** Ação de criar da página — botão redondo (FAB) no canto inferior direito */
  create?: PageCreateAction;
  className?: string;
}

/**
 * Cabeçalho de todas as páginas do painel. O título aparece uma só vez, no cabeçalho
 * do app; as ações secundárias são desenhadas lá (slot #page-header-actions) e a ação
 * de criar é o FAB, igual em toda a app. Na página fica só a descrição (desktop).
 */
export function PageHeader({ description, actions, create, className }: PageHeaderProps) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setSlot(document.getElementById('page-header-actions'));
  }, []);

  return (
    <>
      {description && (
        <p className={cn('mb-5 hidden text-sm text-muted-foreground sm:mb-6 lg:block', className)}>{description}</p>
      )}
      {actions && (slot ? createPortal(actions, slot) : <div className="mb-5 flex justify-end gap-2">{actions}</div>)}
      {create && <PageFab {...create} />}
    </>
  );
}

/**
 * Botão de criar (FAB): redondo, canto inferior direito, acima da barra inferior no
 * telemóvel e acima do botão do chat de suporte no desktop. Um só padrão em toda a app.
 */
export function PageFab({ label, onClick, icon: Icon = Plus, disabled }: PageCreateAction) {
  return createPortal(
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="fixed right-4 z-[44] flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-[transform,filter] duration-150 hover:brightness-110 active:scale-95 disabled:opacity-50 bottom-[calc(5rem+env(safe-area-inset-bottom))] lg:right-6 lg:bottom-24 animate-in fade-in zoom-in-75 duration-200"
    >
      <Icon className="h-6 w-6" strokeWidth={2.25} aria-hidden />
    </button>,
    document.body,
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

/** Botão de ação: secundária no cabeçalho (só ícone no telemóvel) ou primária com texto (estados vazios). */
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
        'inline-flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-[color,background-color,border-color,transform] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50',
        primary
          // Primária (ex.: botão de um estado vazio): sempre com texto
          ? 'px-4 bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:bg-primary/80'
          // Secundária (cabeçalho): só o ícone no telemóvel, com texto no desktop
          : 'w-10 sm:w-auto sm:px-3 text-foreground hover:bg-muted active:bg-muted',
        className,
      )}
    >
      <Icon className="h-[18px] w-[18px] flex-shrink-0" aria-hidden />
      <span className={primary ? undefined : 'hidden sm:inline'}>{label}</span>
    </button>
  );
}
