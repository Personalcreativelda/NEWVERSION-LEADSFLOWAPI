/**
 * TanStack Query hook for Campaigns.
 *
 * Replaces the old useCampaigns.ts which had:
 *  - Fresh fetch on every mount (no caching)
 *  - localStorage as a fallback (now replaced by IDB-backed TanStack cache)
 *
 * New behaviour:
 *  - staleTime: 5 min — campaigns data doesn't change second-to-second
 *  - gcTime: 24 h — survives page reload via IndexedDB persister
 *  - refetchOnMount: false — uses cache if still fresh
 *  - Mutations (save/update/delete) do optimistic cache updates
 *
 * The returned API is a superset of the old hook so existing callers
 * (Dashboard, CampaignProgress, etc.) need no changes.
 */
import { useCallback } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabaseEdgeFunctionUrl, publicAnonKey } from '../../utils/supabase/info.tsx';
import { STALE, GC } from '../../lib/queryClient';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Campaign {
    id:               string;
    userId:           string;
    name:             string;
    type:             'whatsapp' | 'email' | 'sms';
    status:           'active' | 'completed' | 'paused' | 'scheduled';
    totalRecipients:  number;
    sent:             number;
    delivered:        number;
    read:             number;
    failed?:          number;
    progress:         number;
    deliveryRate:     number;
    estimatedTime?:   number;
    scheduledDate?:   string;
    completedDate?:   string;
    createdAt:        string;
    updatedAt:        string;
}

// ── Query key ─────────────────────────────────────────────────────────────────

export const campaignsQueryKey = (userId: string) =>
    ['campaigns', userId] as const;

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useCampaignsQuery(userId: string | null) {
    const qc = useQueryClient();

    const baseUrl = supabaseEdgeFunctionUrl
        ? `${supabaseEdgeFunctionUrl}/campaigns`
        : '';

    // ── Fetch ────────────────────────────────────────────────────────────────

    const { data: campaigns = [], isLoading: loading, error: queryError } = useQuery({
        queryKey:     userId ? campaignsQueryKey(userId) : ['campaigns-disabled'],
        enabled:      !!userId && !!baseUrl,
        staleTime:    STALE.campaigns,
        gcTime:       GC.campaigns,
        refetchOnMount:       false,
        refetchOnWindowFocus: false,
        queryFn:      async () => {
            const res = await fetch(`${baseUrl}/${userId}`, {
                headers: {
                    Authorization: `Bearer ${publicAnonKey}`,
                    'Content-Type': 'application/json',
                },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Erro ao carregar campanhas');
            return data.campaigns as Campaign[];
        },
    });

    const error = queryError ? (queryError as Error).message : null;

    // ── Helpers ───────────────────────────────────────────────────────────────

    const updateCache = useCallback(
        (updater: (prev: Campaign[]) => Campaign[]) => {
            if (!userId) return;
            qc.setQueryData<Campaign[]>(campaignsQueryKey(userId), (prev) =>
                prev ? updater(prev) : prev,
            );
        },
        [qc, userId],
    );

    // ── Save ─────────────────────────────────────────────────────────────────

    const { mutateAsync: saveCampaign } = useMutation({
        mutationFn: async (campaign: Campaign) => {
            if (!userId) throw new Error('userId required');
            const res = await fetch(baseUrl, {
                method:  'POST',
                headers: {
                    Authorization:  `Bearer ${publicAnonKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ userId, campaign }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Erro ao salvar campanha');
            return data.campaign as Campaign;
        },
        onSuccess: (saved) => {
            updateCache((prev) => {
                const idx = prev.findIndex((c) => c.id === saved.id);
                if (idx >= 0) {
                    const next = [...prev];
                    next[idx] = saved;
                    return next;
                }
                return [saved, ...prev];
            });
        },
    });

    // ── Update ───────────────────────────────────────────────────────────────

    const { mutateAsync: updateCampaign } = useMutation({
        mutationFn: async ({ campaignId, updates }: { campaignId: string; updates: Partial<Campaign> }) => {
            if (!userId) throw new Error('userId required');
            const res = await fetch(`${baseUrl}/${userId}/${campaignId}`, {
                method:  'PATCH',
                headers: {
                    Authorization:  `Bearer ${publicAnonKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(updates),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Erro ao atualizar campanha');
            return data.campaign as Campaign;
        },
        // Optimistic update
        onMutate: ({ campaignId, updates }) => {
            const snapshot = qc.getQueryData<Campaign[]>(userId ? campaignsQueryKey(userId) : ['campaigns-disabled']);
            updateCache((prev) =>
                prev.map((c) => (c.id === campaignId ? { ...c, ...updates } : c)),
            );
            return { snapshot };
        },
        onError: (_err, _vars, ctx: any) => {
            if (ctx?.snapshot && userId) {
                qc.setQueryData(campaignsQueryKey(userId), ctx.snapshot);
            }
        },
        onSuccess: (updated) => {
            updateCache((prev) =>
                prev.map((c) => (c.id === updated.id ? updated : c)),
            );
        },
    });

    // ── Delete ───────────────────────────────────────────────────────────────

    const { mutateAsync: deleteCampaign } = useMutation({
        mutationFn: async (campaignId: string) => {
            if (!userId) throw new Error('userId required');
            const res = await fetch(`${baseUrl}/${userId}/${campaignId}`, {
                method:  'DELETE',
                headers: {
                    Authorization:  `Bearer ${publicAnonKey}`,
                    'Content-Type': 'application/json',
                },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Erro ao deletar campanha');
            return campaignId;
        },
        onMutate: (campaignId) => {
            const snapshot = userId
                ? qc.getQueryData<Campaign[]>(campaignsQueryKey(userId))
                : undefined;
            updateCache((prev) => prev.filter((c) => c.id !== campaignId));
            return { snapshot };
        },
        onError: (_err, _vars, ctx: any) => {
            if (ctx?.snapshot && userId) {
                qc.setQueryData(campaignsQueryKey(userId), ctx.snapshot);
            }
        },
    });

    // ── Wrappers matching the old hook's boolean-return API ───────────────────

    const save = useCallback(
        async (campaign: Campaign) => {
            try { await saveCampaign(campaign); return true; }
            catch { return false; }
        },
        [saveCampaign],
    );

    const update = useCallback(
        async (campaignId: string, updates: Partial<Campaign>) => {
            try { await updateCampaign({ campaignId, updates }); return true; }
            catch { return false; }
        },
        [updateCampaign],
    );

    const remove = useCallback(
        async (campaignId: string) => {
            try { await deleteCampaign(campaignId); return true; }
            catch { return false; }
        },
        [deleteCampaign],
    );

    const reloadCampaigns = useCallback(() => {
        if (userId) qc.invalidateQueries({ queryKey: campaignsQueryKey(userId) });
    }, [qc, userId]);

    return {
        campaigns,
        loading,
        error,
        saveCampaign:     save,
        updateCampaign:   update,
        deleteCampaign:   remove,
        reloadCampaigns,
    };
}
