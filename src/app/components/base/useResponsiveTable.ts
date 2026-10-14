import { useCallback, useMemo, useState } from 'react';

export type TableOrder = 'asc' | 'desc';

interface UseResponsiveTableOptions {
  defaultOrderBy?: string;
  defaultOrder?: TableOrder;
  defaultRowsPerPage?: number;
}

/**
 * Estado local de UI de uma tabela (ordem, página, seleção) — sem fetching
 * de dados, tal como o `use-table.ts` do Minimal Kit. Os dados continuam a
 * vir de onde já vêm hoje (React Query/props); este hook só gere a
 * apresentação.
 */
export function useResponsiveTable({
  defaultOrderBy = '',
  defaultOrder = 'asc',
  defaultRowsPerPage = 10,
}: UseResponsiveTableOptions = {}) {
  const [order, setOrder] = useState<TableOrder>(defaultOrder);
  const [orderBy, setOrderBy] = useState(defaultOrderBy);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(defaultRowsPerPage);
  const [selected, setSelected] = useState<string[]>([]);

  const onSort = useCallback(
    (property: string) => {
      const isAsc = orderBy === property && order === 'asc';
      setOrder(isAsc ? 'desc' : 'asc');
      setOrderBy(property);
    },
    [order, orderBy],
  );

  const onChangePage = useCallback((newPage: number) => setPage(newPage), []);

  const onChangeRowsPerPage = useCallback((value: number) => {
    setRowsPerPage(value);
    setPage(0);
  }, []);

  const onSelectRow = useCallback((id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((rowId) => rowId !== id) : [...prev, id]));
  }, []);

  const onSelectAllRows = useCallback((checked: boolean, ids: string[]) => {
    setSelected(checked ? ids : []);
  }, []);

  const onResetSelection = useCallback(() => setSelected([]), []);

  return useMemo(
    () => ({
      order,
      orderBy,
      page,
      rowsPerPage,
      selected,
      onSort,
      onChangePage,
      onChangeRowsPerPage,
      onSelectRow,
      onSelectAllRows,
      onResetSelection,
    }),
    [order, orderBy, page, rowsPerPage, selected, onSort, onChangePage, onChangeRowsPerPage, onSelectRow, onSelectAllRows, onResetSelection],
  );
}

export function getComparator<Row>(
  order: TableOrder,
  orderBy: string,
  accessor: (row: Row) => string | number = (row) => (row as Record<string, unknown>)[orderBy] as string | number,
) {
  return (a: Row, b: Row) => {
    const aValue = accessor(a);
    const bValue = accessor(b);
    if (bValue < aValue) return order === 'asc' ? 1 : -1;
    if (bValue > aValue) return order === 'asc' ? -1 : 1;
    return 0;
  };
}

/**
 * Números de página a mostrar (máx. 5 + reticências), mesma lógica visual
 * que `gerarBotoesPaginacao()` já tinha em `LeadsTable.tsx` — 1-based.
 */
export function getPageButtons(currentPage: number, totalPages: number): (number | 'ellipsis')[] {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const buttons: (number | 'ellipsis')[] = [1];

  if (currentPage > 3) buttons.push('ellipsis');

  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);
  for (let i = start; i <= end; i++) buttons.push(i);

  if (currentPage < totalPages - 2) buttons.push('ellipsis');

  buttons.push(totalPages);

  return buttons;
}
