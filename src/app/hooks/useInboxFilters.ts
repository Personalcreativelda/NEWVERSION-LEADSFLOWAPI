// INBOX: Hook centralizado para gerenciamento de filtros do Inbox
import { useCallback, useMemo, useSyncExternalStore } from 'react';

// Tipos de filtro suportados
export type InboxFilterType = 'all' | 'mentions' | 'unattended';

export interface InboxFilters {
    type: InboxFilterType;
    channel?: string;
    status?: string;
}

// Estado padrão (sem filtros)
const DEFAULT_FILTERS: InboxFilters = {
    type: 'all',
    channel: undefined,
    status: undefined,
};

// Store global para filtros - usando class para melhor encapsulamento
class InboxFiltersStore {
    private filters: InboxFilters;
    private listeners: Set<() => void> = new Set();

    constructor() {
        // Inicializar com filtros da URL
        this.filters = this.readFiltersFromUrl();
    }

    private readFiltersFromUrl(): InboxFilters {
        if (typeof window === 'undefined') return { ...DEFAULT_FILTERS };
        
        const params = new URLSearchParams(window.location.search);
        
        return {
            type: (params.get('filter') as InboxFilterType) || 'all',
            channel: params.get('channel') || undefined,
            status: params.get('status') || undefined,
        };
    }

    private syncFiltersToUrl(): void {
        if (typeof window === 'undefined') return;

        const params = new URLSearchParams();
        
        if (this.filters.type !== 'all') {
            params.set('filter', this.filters.type);
        }
        if (this.filters.channel) {
            params.set('channel', this.filters.channel);
        }
        if (this.filters.status) {
            params.set('status', this.filters.status);
        }
        
        const queryString = params.toString();
        const newUrl = queryString 
            ? `${window.location.pathname}?${queryString}`
            : window.location.pathname;
        
        window.history.replaceState({}, '', newUrl);
    }

    // Para useSyncExternalStore - retorna snapshot imutável
    getSnapshot = (): InboxFilters => {
        return this.filters;
    };

    // Para useSyncExternalStore - subscrição
    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };

    private emitChange(): void {
        // Criar novo objeto para garantir que React detecte mudança
        this.filters = { ...this.filters };
        this.syncFiltersToUrl();
        this.listeners.forEach(listener => listener());
    }

    setFilters(newFilters: Partial<InboxFilters>): void {
        this.filters = { ...this.filters, ...newFilters };
        this.emitChange();
    }

    setFilterType(type: InboxFilterType): void {
        this.filters = { ...this.filters, type };
        this.emitChange();
    }

    setChannelFilter(channel?: string): void {
        this.filters = { ...this.filters, channel };
        this.emitChange();
    }

    setStatusFilter(status?: string): void {
        this.filters = { ...this.filters, status };
        this.emitChange();
    }

    clearFilters(): void {
        this.filters = { ...DEFAULT_FILTERS };
        this.emitChange();
    }
}

// Instância singleton do store
const filtersStore = new InboxFiltersStore();

export function useInboxFilters() {
    // useSyncExternalStore garante sincronização correta com React 18+
    const filters = useSyncExternalStore(
        filtersStore.subscribe,
        filtersStore.getSnapshot,
        filtersStore.getSnapshot // getServerSnapshot para SSR
    );
    
    const setFilters = useCallback((newFilters: Partial<InboxFilters>) => {
        filtersStore.setFilters(newFilters);
    }, []);
    
    const clearFilters = useCallback(() => {
        filtersStore.clearFilters();
    }, []);
    
    const setFilterType = useCallback((type: InboxFilterType) => {
        filtersStore.setFilterType(type);
    }, []);
    
    const setChannelFilter = useCallback((channel?: string) => {
        filtersStore.setChannelFilter(channel);
    }, []);
    
    const setStatusFilter = useCallback((status?: string) => {
        filtersStore.setStatusFilter(status);
    }, []);
    
    const hasActiveFilters = useMemo(() => {
        return filters.type !== 'all' || 
               !!filters.channel || 
               !!filters.status;
    }, [filters]);
    
    const getActiveFiltersDescription = useCallback(() => {
        const parts: string[] = [];
        
        if (filters.type === 'mentions') {
            parts.push('Menções');
        } else if (filters.type === 'unattended') {
            parts.push('Não atendidas');
        }
        
        if (filters.channel) {
            parts.push('Canal selecionado');
        }
        
        if (filters.status) {
            const statusLabel = filters.status.charAt(0).toUpperCase() + filters.status.slice(1);
            parts.push(statusLabel);
        }
        
        return parts.length > 0 ? parts.join(' • ') : 'Todas as conversas';
    }, [filters]);
    
    return {
        filters,
        setFilters,
        clearFilters,
        setFilterType,
        setChannelFilter,
        setStatusFilter,
        hasActiveFilters,
        getActiveFiltersDescription,
    };
}

// Exportar funções utilitárias para uso fora de componentes React
export const inboxFiltersUtils = {
    getFilters: () => filtersStore.getSnapshot(),
    setFilters: (filters: Partial<InboxFilters>) => filtersStore.setFilters(filters),
    clearFilters: () => filtersStore.clearFilters(),
};
