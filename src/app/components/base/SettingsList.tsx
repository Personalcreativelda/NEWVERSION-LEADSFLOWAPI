// Listas de definições ao estilo dos apps nativos (Claude, iOS): grupos com título pequeno
// e um cartão com linhas separadas. Mesmo aspeto do Group/Row das Definições
// (settings/SettingsHub.tsx) — usar isto em vez de caixas, ícones coloridos e interruptores
// feitos à mão.
import type { ReactNode } from 'react';
import { Switch } from '../ui/switch';
import { cn } from '../ui/utils';

/** Grupo: título em maiúsculas pequenas + cartão com as linhas */
export function SettingsGroup({ title, action, children, className }: {
  title?: string;
  /** Algo curto à direita do título (ex.: contador) */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      {(title || action) && (
        <div className="mb-2 flex min-h-5 items-center justify-between gap-3 px-1">
          {title && <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>}
          {action}
        </div>
      )}
      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">{children}</div>
    </section>
  );
}

/** Texto da linha: rótulo (text-base) e, se houver, um valor/resumo curto por baixo */
function RowText({ label, hint }: { label: ReactNode; hint?: ReactNode }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block text-base text-foreground">{label}</span>
      {hint && <span className="mt-0.5 block text-sm text-muted-foreground">{hint}</span>}
    </span>
  );
}

/** Linha com interruptor (a linha toda é tocável) */
export function SettingsToggle({ label, hint, checked, onChange, disabled }: {
  label: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={cn('flex min-h-[56px] cursor-pointer items-center gap-4 px-4 py-3', disabled && 'cursor-not-allowed opacity-60')}>
      <RowText label={label} hint={hint} />
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </label>
  );
}

/** Linha com rótulo e um controlo à direita (select pequeno, valor) */
export function SettingsItem({ label, hint, children, icon }: {
  label: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex min-h-[56px] items-center gap-4 px-4 py-3">
      {icon && <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center text-foreground">{icon}</span>}
      <RowText label={label} hint={hint} />
      {children && <div className="flex flex-shrink-0 items-center gap-1">{children}</div>}
    </div>
  );
}

/** Campo dentro do cartão: rótulo por cima e o campo em largura total */
export function SettingsField({ label, htmlFor, hint, children }: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2 px-4 py-3">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">{label}</label>
      {children}
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Linha de ação (ex.: "Adicionar documento") com ícone à esquerda, cor primária */
export function SettingsAction({ icon, label, onClick, disabled, children }: {
  icon?: ReactNode;
  label: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  /** Para envolver um <input type="file"> escondido: a linha passa a ser um <label> */
  children?: ReactNode;
}) {
  const cls = cn(
    'flex min-h-[52px] w-full items-center gap-4 px-4 py-3 text-left text-base text-primary transition-colors hover:bg-muted/60 active:bg-muted',
    disabled ? 'pointer-events-none opacity-60' : 'cursor-pointer',
  );
  const inner = (
    <>
      {icon && <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </>
  );
  if (children) return <label className={cls}>{inner}{children}</label>;
  return <button type="button" onClick={onClick} disabled={disabled} className={cls}>{inner}</button>;
}
