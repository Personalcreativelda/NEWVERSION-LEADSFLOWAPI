/**
 * Zustand store for Campaigns UI state.
 *
 * Persists filter, sort, and pagination state across page navigations and
 * refreshes so the user always lands back in the same view.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

type CampaignStatus = 'all' | 'active' | 'completed' | 'paused' | 'scheduled';
type CampaignType   = 'all' | 'whatsapp' | 'email' | 'sms';
type SortField      = 'createdAt' | 'name' | 'status' | 'progress';
type SortOrder      = 'asc' | 'desc';

interface CampaignsState {
    // Filters
    statusFilter: CampaignStatus;
    typeFilter:   CampaignType;
    searchQuery:  string;

    // Pagination
    currentPage:  number;
    pageSize:     number;

    // Sort
    sortField:    SortField;
    sortOrder:    SortOrder;

    // Actions
    setStatusFilter:  (s: CampaignStatus) => void;
    setTypeFilter:    (t: CampaignType)   => void;
    setSearchQuery:   (q: string)         => void;
    setCurrentPage:   (p: number)         => void;
    setPageSize:      (n: number)         => void;
    setSortField:     (f: SortField)      => void;
    setSortOrder:     (o: SortOrder)      => void;
    resetFilters:     ()                  => void;
}

const DEFAULTS = {
    statusFilter: 'all' as CampaignStatus,
    typeFilter:   'all' as CampaignType,
    searchQuery:  '',
    currentPage:  1,
    pageSize:     20,
    sortField:    'createdAt' as SortField,
    sortOrder:    'desc' as SortOrder,
};

export const useCampaignsStore = create<CampaignsState>()(
    persist(
        (set) => ({
            ...DEFAULTS,

            setStatusFilter:  (s) => set({ statusFilter: s, currentPage: 1 }),
            setTypeFilter:    (t) => set({ typeFilter:   t, currentPage: 1 }),
            setSearchQuery:   (q) => set({ searchQuery:  q, currentPage: 1 }),
            setCurrentPage:   (p) => set({ currentPage:  p }),
            setPageSize:      (n) => set({ pageSize:     n, currentPage: 1 }),
            setSortField:     (f) => set({ sortField:    f }),
            setSortOrder:     (o) => set({ sortOrder:    o }),
            resetFilters:     ()  => set(DEFAULTS),
        }),
        {
            name:    'leadflow-campaigns-ui',
            storage: createJSONStorage(() => localStorage),
        },
    ),
);
