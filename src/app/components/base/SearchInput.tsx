import * as React from 'react';
import { Search, X } from 'lucide-react';

import { Input } from '../ui/input';
import { cn } from '../ui/utils';

interface SearchInputProps extends Omit<React.ComponentProps<'input'>, 'value' | 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  containerClassName?: string;
}

/** Campo de pesquisa com ícone e botão de limpar, sobre `ui/input.tsx`. */
export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ value, onChange, onClear, containerClassName, className, placeholder = 'Pesquisar…', ...props }, ref) => {
    return (
      <div className={cn('relative flex items-center', containerClassName)}>
        <Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
        <Input
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn('pl-9', value && 'pr-9', className)}
          {...props}
        />
        {value && (
          <button
            type="button"
            aria-label="Limpar pesquisa"
            onClick={() => (onClear ? onClear() : onChange(''))}
            className="absolute right-3 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
    );
  },
);

SearchInput.displayName = 'SearchInput';
