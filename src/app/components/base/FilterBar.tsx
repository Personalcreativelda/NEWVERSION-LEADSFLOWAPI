import type { ReactNode } from 'react';
import { X } from 'lucide-react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { SearchInput } from './SearchInput';
import { cn } from '../ui/utils';

export interface FilterBarOption {
  value: string;
  label: string;
}

export interface FilterBarFilter {
  key: string;
  placeholder: string;
  value: string;
  options: FilterBarOption[];
  onChange: (value: string) => void;
}

interface FilterBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: FilterBarFilter[];
  onClearAll?: () => void;
  /** Slot extra do lado direito (ex.: botão de ação) */
  trailing?: ReactNode;
  className?: string;
}

/**
 * Barra de filtros genérica e reutilizável (pesquisa + selects + limpar),
 * composta a partir de SearchInput + ui/select.tsx. Distinta do
 * `dashboard/FilterBar.tsx` específico da página de leads, que fica
 * intocado nesta fase.
 */
export function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  filters = [],
  onClearAll,
  trailing,
  className,
}: FilterBarProps) {
  const hasActiveFilters = Boolean(searchValue) || filters.some((f) => f.value);

  return (
    <div className={cn('flex flex-wrap items-center gap-3', className)}>
      <SearchInput
        value={searchValue}
        onChange={onSearchChange}
        placeholder={searchPlaceholder}
        containerClassName="min-w-[220px] flex-1"
      />

      {filters.map((filter) => (
        <Select key={filter.key} value={filter.value || undefined} onValueChange={filter.onChange}>
          <SelectTrigger className="w-auto min-w-[140px]">
            <SelectValue placeholder={filter.placeholder} />
          </SelectTrigger>
          <SelectContent>
            {filter.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}

      {hasActiveFilters && onClearAll && (
        <button
          type="button"
          onClick={onClearAll}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="size-3.5" />
          Limpar filtros
        </button>
      )}

      {trailing}
    </div>
  );
}
