import type { ReactElement, ReactNode } from 'react';
import { Children, cloneElement, isValidElement, useId } from 'react';

import { Label } from '../ui/label';
import { cn } from '../ui/utils';

interface FormFieldProps {
  label?: string;
  htmlFor?: string;
  /** Texto de ajuda (mostrado quando não há erro) */
  hint?: string;
  /** Mensagem de erro (substitui o hint quando presente) */
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Wrapper label + controlo + texto de ajuda/erro, sobre os primitivos
 * `ui/label.tsx`/`ui/input.tsx`/`ui/textarea.tsx` já existentes. Compatível
 * com o padrão atual dos formulários do LeadFlow (`useState` controlado,
 * sem react-hook-form) — o controlo é passado como children.
 */
export function FormField({ label, htmlFor, hint, error, required, className, children }: FormFieldProps) {
  const generatedId = useId();
  const only = Children.count(children) === 1 ? Children.only(children) : null;
  const linkable = isValidElement(only) && (typeof only.type === 'function' || typeof only.type === 'object' || ['input', 'select', 'textarea'].includes(only.type as string)) ? (only as ReactElement<Record<string, unknown>>) : null;
  const fieldId = htmlFor ?? (linkable?.props.id as string | undefined) ?? generatedId;
  const noteId = `${fieldId}-nota`;
  const note = error || hint;

  // Liga o rótulo, a ajuda e o erro ao campo: antes o rótulo apontava para um id que o
  // campo não tinha (tocar no rótulo não focava o campo e o leitor de ecrã não o lia)
  let control = children;
  if (linkable) {
    const el = linkable;
    control = cloneElement(el, {
      id: el.props.id ?? fieldId,
      'aria-invalid': el.props['aria-invalid'] ?? (error ? true : undefined),
      'aria-describedby': [el.props['aria-describedby'], note && noteId].filter(Boolean).join(' ') || undefined,
    });
  }

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <Label htmlFor={fieldId}>
          {label}
          {required && <span className="text-destructive">*</span>}
        </Label>
      )}

      {control}

      {error ? (
        <p id={noteId} aria-live="polite" className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p id={noteId} className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
