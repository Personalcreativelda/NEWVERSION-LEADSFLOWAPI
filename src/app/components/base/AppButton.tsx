import * as React from 'react';
import { Loader2 } from 'lucide-react';

import { Button, type buttonVariants } from '../ui/button';
import type { VariantProps } from 'class-variance-authority';

interface AppButtonProps
  extends React.ComponentProps<'button'>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
}

/**
 * Envolve o `Button` existente (src/app/components/ui/button.tsx —
 * Radix `Slot`/`asChild`) em vez de o recriar em MUI: preserva o padrão
 * `asChild` e todos os usos atuais, só acrescenta estado de loading e
 * slots de ícone.
 */
export const AppButton = React.forwardRef<HTMLButtonElement, AppButtonProps>(
  ({ loading, disabled, startIcon, endIcon, asChild, children, ...props }, ref) => {
    // `asChild` faz o Button renderizar um Radix Slot, que exige exatamente
    // um filho — não decoramos com ícones/loading nesse caso, o consumidor
    // fica responsável por isso no elemento que passar.
    if (asChild) {
      return (
        <Button ref={ref} asChild disabled={disabled || loading} {...props}>
          {children}
        </Button>
      );
    }

    return (
      <Button ref={ref} disabled={disabled || loading} {...props}>
        {loading ? <Loader2 className="size-4 animate-spin" /> : startIcon}
        {children}
        {!loading && endIcon}
      </Button>
    );
  },
);

AppButton.displayName = 'AppButton';
