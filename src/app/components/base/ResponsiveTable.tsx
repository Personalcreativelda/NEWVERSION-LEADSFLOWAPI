import type { ReactNode } from 'react';
import { useEffect, useMemo } from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { Checkbox } from '../ui/checkbox';
import { Skeleton } from '../ui/skeleton';
import { cn } from '../ui/utils';
import { EmptyState } from './EmptyState';
import { useResponsiveTable, getComparator, getPageButtons } from './useResponsiveTable';

export interface ResponsiveTableColumn<Row> {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
  render?: (row: Row) => ReactNode;
  /** Valor usado para ordenar; por omissão lê `row[key]`. */
  sortAccessor?: (row: Row) => string | number;
  /** Rótulo mostrado na vista em cartão (mobile); por omissão usa `label`. */
  cardLabel?: string;
  /** Linha sem valor: no cartão (mobile) a linha não aparece, em vez de mostrar "-". */
  isEmpty?: (row: Row) => boolean;
}

interface ResponsiveTableProps<Row> {
  columns: ResponsiveTableColumn<Row>[];
  rows: Row[];
  getRowId: (row: Row) => string;
  loading?: boolean;
  skeletonRows?: number;
  selectable?: boolean;
  selected?: string[];
  onSelectionChange?: (ids: string[]) => void;
  emptyState?: ReactNode;
  onRowClick?: (row: Row) => void;
  defaultOrderBy?: string;
  className?: string;
  /** Ativa paginação interna (por omissão desligada — sem impacto nos usos já existentes). */
  pagination?: boolean;
  rowsPerPage?: number;
  /** Cabeçalho fixo com scroll interno até `maxHeight`. */
  stickyHeader?: boolean;
  maxHeight?: number | string;
  /** Classe extra por linha (ex.: realçar por um campo dos dados). */
  rowClassName?: (row: Row) => string | undefined;
}

/**
 * Motor de tabela genérico e reutilizável — inspirado em
 * COPIA/src/components/table (cabeçalho ordenável, seleção em massa,
 * paginação, cabeçalho fixo, estado vazio/skeleton), construído sobre
 * ui/table.tsx + ui/checkbox.tsx (sem Radix composto de risco). Abaixo do
 * breakpoint `sm`, as linhas colapsam em cartões empilhados em vez de
 * scroll horizontal.
 */
export function ResponsiveTable<Row>({
  columns,
  rows,
  getRowId,
  loading = false,
  skeletonRows = 5,
  selectable = false,
  selected = [],
  onSelectionChange,
  emptyState,
  onRowClick,
  defaultOrderBy,
  className,
  pagination = false,
  rowsPerPage = 10,
  stickyHeader = false,
  maxHeight,
  rowClassName,
}: ResponsiveTableProps<Row>) {
  const { order, orderBy, onSort, page, onChangePage } = useResponsiveTable({
    defaultOrderBy: defaultOrderBy ?? columns[0]?.key ?? '',
    defaultRowsPerPage: rowsPerPage,
  });

  const sortedRows = useMemo(() => {
    if (!orderBy) return rows;
    const column = columns.find((c) => c.key === orderBy);
    if (!column?.sortable) return rows;
    return [...rows].sort(getComparator<Row>(order, orderBy, column.sortAccessor));
  }, [rows, order, orderBy, columns]);

  const totalPages = pagination ? Math.max(1, Math.ceil(sortedRows.length / rowsPerPage)) : 1;

  // Se os dados encolherem (ex.: após eliminar), volta para dentro do intervalo válido.
  useEffect(() => {
    if (pagination && page > totalPages - 1) {
      onChangePage(Math.max(0, totalPages - 1));
    }
  }, [pagination, page, totalPages, onChangePage]);

  const pagedRows = useMemo(() => {
    if (!pagination) return sortedRows;
    const start = page * rowsPerPage;
    return sortedRows.slice(start, start + rowsPerPage);
  }, [pagination, sortedRows, page, rowsPerPage]);

  // "Selecionar todos" opera sobre a página visível, não o conjunto completo.
  const visibleIds = useMemo(() => pagedRows.map(getRowId), [pagedRows, getRowId]);
  const allSelected = selectable && visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));
  const someSelected = selectable && visibleIds.some((id) => selected.includes(id)) && !allSelected;

  if (loading) {
    return (
      <div className={cn('flex flex-col gap-2', className)}>
        {Array.from({ length: skeletonRows }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return emptyState ?? <EmptyState title="Sem resultados" />;
  }

  const renderCell = (column: ResponsiveTableColumn<Row>, row: Row) =>
    column.render ? column.render(row) : String((row as Record<string, unknown>)[column.key] ?? '');

  const tableHeader = (
    <TableHeader className={stickyHeader ? 'sticky top-0 z-10 bg-card' : undefined}>
      <TableRow>
        {selectable && (
          <TableHead className="w-10">
            <Checkbox
              checked={allSelected ? true : someSelected ? 'indeterminate' : false}
              onCheckedChange={(checked) => {
                const next = checked
                  ? Array.from(new Set([...selected, ...visibleIds]))
                  : selected.filter((id) => !visibleIds.includes(id));
                onSelectionChange?.(next);
              }}
            />
          </TableHead>
        )}
        {columns.map((column) => (
          <TableHead
            key={column.key}
            className={cn(
              column.align === 'right' && 'text-right',
              column.align === 'center' && 'text-center',
            )}
          >
            {column.sortable ? (
              <button
                type="button"
                onClick={() => onSort(column.key)}
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                {column.label}
                {orderBy === column.key &&
                  (order === 'asc' ? (
                    <ChevronUp className="size-3.5" />
                  ) : (
                    <ChevronDown className="size-3.5" />
                  ))}
              </button>
            ) : (
              column.label
            )}
          </TableHead>
        ))}
      </TableRow>
    </TableHeader>
  );

  return (
    <div className={className}>
      {/* Vista em tabela — sm e acima */}
      <div className="hidden sm:block">
        <div className={stickyHeader ? 'overflow-y-auto' : undefined} style={stickyHeader ? { maxHeight } : undefined}>
          <Table>
            {tableHeader}
            <TableBody>
              {pagedRows.map((row) => {
                const id = getRowId(row);
                return (
                  <TableRow
                    key={id}
                    data-state={selected.includes(id) ? 'selected' : undefined}
                    onClick={() => onRowClick?.(row)}
                    className={cn(onRowClick && 'cursor-pointer', rowClassName?.(row))}
                  >
                    {selectable && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selected.includes(id)}
                          onCheckedChange={(checked) => {
                            const next = checked
                              ? [...selected, id]
                              : selected.filter((rowId) => rowId !== id);
                            onSelectionChange?.(next);
                          }}
                        />
                      </TableCell>
                    )}
                    {columns.map((column) => (
                      <TableCell
                        key={column.key}
                        className={cn(
                          column.align === 'right' && 'text-right',
                          column.align === 'center' && 'text-center',
                        )}
                      >
                        {renderCell(column, row)}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Vista em cartões empilhados — abaixo de sm */}
      <div className="flex flex-col gap-3 sm:hidden">
        {pagedRows.map((row) => {
          const id = getRowId(row);
          return (
            <div
              key={id}
              onClick={() => onRowClick?.(row)}
              className={cn(
                'rounded-lg border border-border bg-card p-3 flex flex-col gap-1.5',
                onRowClick && 'cursor-pointer',
                rowClassName?.(row),
              )}
            >
              {columns.filter((column) => !column.isEmpty?.(row)).map((column) => (
                <div key={column.key} className="flex items-center justify-between gap-3 text-sm min-w-0">
                  <span className="text-muted-foreground flex-shrink-0">{column.cardLabel ?? column.label}</span>
                  <span className="text-foreground text-right min-w-0 truncate">{renderCell(column, row)}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Paginação */}
      {pagination && totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 mt-4 border-t border-border text-sm text-muted-foreground">
          <span>
            Mostrando {page * rowsPerPage + 1} a {Math.min((page + 1) * rowsPerPage, sortedRows.length)} de{' '}
            {sortedRows.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onChangePage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="p-1.5 rounded-md hover:bg-muted disabled:opacity-40 disabled:pointer-events-none"
              aria-label="Página anterior"
            >
              <ChevronLeft className="size-4" />
            </button>
            {getPageButtons(page + 1, totalPages).map((btn, i) =>
              btn === 'ellipsis' ? (
                <span key={`ellipsis-${i}`} className="px-1.5 text-muted-foreground">
                  <MoreHorizontal className="size-4" />
                </span>
              ) : (
                <button
                  key={btn}
                  type="button"
                  onClick={() => onChangePage(btn - 1)}
                  className={cn(
                    'min-w-8 h-8 px-2 rounded-md text-sm font-medium transition-colors',
                    btn - 1 === page ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-foreground',
                  )}
                >
                  {btn}
                </button>
              ),
            )}
            <button
              type="button"
              onClick={() => onChangePage(Math.min(totalPages - 1, page + 1))}
              disabled={page === totalPages - 1}
              className="p-1.5 rounded-md hover:bg-muted disabled:opacity-40 disabled:pointer-events-none"
              aria-label="Próxima página"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
