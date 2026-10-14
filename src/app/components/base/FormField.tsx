import type { ReactNode } from 'react';
import { useId } from 'react';

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
  const fieldId = htmlFor ?? generatedId;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <Label htmlFor={fieldId}>
          {label}
          {required && <span className="text-destructive">*</span>}
        </Label>
      )}

      {children}

      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
