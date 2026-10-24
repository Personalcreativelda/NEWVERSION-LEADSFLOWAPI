import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '../ui/utils';

/**
 * Escolhas dos formulários (destinatários, envio agora/agendado…): um só padrão nos
 * modais de campanha (WhatsApp, email, SMS). Escolha única em linhas com um círculo; a
 * opção escolhida pode abrir por baixo o seu conteúdo (segmentos, lista, data), sem
 * scroll dentro de scroll.
 */
export interface ChoiceOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Valor curto à direita (ex.: número de leads) */
  meta?: ReactNode;
  /** Conteúdo mostrado por baixo quando esta opção está escolhida */
  children?: ReactNode;
  disabled?: boolean;
}

export function ChoiceList<T extends string>({ value, onChange, options, className }: {
  value: T;
  onChange: (value: NoInfer<T>) => void;
  // NoInfer: o tipo vem do value (ex.: union do estado), não das strings das opções
  options: ChoiceOption<NoInfer<T>>[];
  className?: string;
}) {
  return (
    <div role="radiogroup" className={cn('divide-y divide-border overflow-hidden rounded-xl border border-border bg-card', className)}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <div key={option.value}>
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={option.disabled}
              onClick={() => onChange(option.value)}
              className="flex w-full min-h-[48px] items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 disabled:opacity-50"
            >
              <span
                className={cn(
                  'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                  selected ? 'border-primary' : 'border-muted-foreground/40',
                )}
              >
                {selected && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
              </span>
              <span className="min-w-0 flex-1 text-[15px] text-foreground">{option.label}</span>
              {option.meta != null && <span className="flex-shrink-0 text-sm text-muted-foreground tabular-nums">{option.meta}</span>}
            </button>
            {selected && option.children && <div className="px-4 pb-4 pt-1">{option.children}</div>}
          </div>
        );
      })}
    </div>
  );
}

/** Escolha múltipla (segmentos, grupos): linhas com caixa de seleção e um valor à direita */
export function CheckList({ items, selected, onToggle, empty }: {
  items: { value: string; label: ReactNode; meta?: ReactNode }[];
  selected: string[];
  onToggle: (value: string) => void;
  empty?: ReactNode;
}) {
  if (items.length === 0) return <p className="py-2 text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="divide-y divide-border rounded-lg border border-border">
      {items.map((item) => {
        const checked = selected.includes(item.value);
        return (
          <button
            key={item.value}
            type="button"
            role="checkbox"
            aria-checked={checked}
            onClick={() => onToggle(item.value)}
            className="flex w-full min-h-[44px] items-center gap-3 px-3 py-2 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50"
          >
            <span
              className={cn(
                'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2 transition-colors',
                checked ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40',
              )}
            >
              {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">{item.label}</span>
            {item.meta != null && <span className="flex-shrink-0 text-sm text-muted-foreground tabular-nums">{item.meta}</span>}
          </button>
        );
      })}
    </div>
  );
}
