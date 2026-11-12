import { useCallback, useState } from 'react';

const PREFIX = 'leadsflow_recent_search_';
const MAX = 5;

function read(key: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(PREFIX + key) || '[]');
    return Array.isArray(v) ? v.filter((s) => typeof s === 'string').slice(0, MAX) : [];
  } catch {
    return [];
  }
}

/** Apaga as pesquisas recentes de todas as listas (logout: são do utilizador que sai) */
export function clearRecentSearches() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k));
  } catch {
    // sem armazenamento: nada a apagar
  }
}

/**
 * Pesquisas recentes de uma lista (leads, conversas, funil), só neste aparelho.
 * `remember` guarda a pesquisa (ao sair do campo); a mais recente fica à frente.
 */
export function useRecentSearches(key: string) {
  const [items, setItems] = useState(() => read(key));
  const remember = useCallback((query: string) => {
    const q = query.trim();
    if (q.length < 2) return;
    const next = [q, ...read(key).filter((s) => s.toLowerCase() !== q.toLowerCase())].slice(0, MAX);
    setItems(next);
    try { localStorage.setItem(PREFIX + key, JSON.stringify(next)); } catch { /* sem armazenamento */ }
  }, [key]);
  return { items, remember };
}

/**
 * Chips com as pesquisas recentes, por baixo do campo enquanto está focado e vazio:
 * a pesquisa nunca abre em branco. `onMouseDown` evita tirar o foco do campo antes do toque.
 */
export function RecentSearchChips({ items, visible, onPick }: { items: string[]; visible: boolean; onPick: (q: string) => void }) {
  if (!visible || items.length === 0) return null;
  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-none pt-2" role="list" aria-label="Pesquisas recentes">
      {items.map((q) => (
        <button
          key={q}
          type="button"
          role="listitem"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(q)}
          className="flex h-8 flex-shrink-0 items-center rounded-full border border-border bg-card px-3 text-[13px] text-foreground hover:bg-muted"
        >
          <span className="max-w-[160px] truncate" translate="no">{q}</span>
        </button>
      ))}
    </div>
  );
}
