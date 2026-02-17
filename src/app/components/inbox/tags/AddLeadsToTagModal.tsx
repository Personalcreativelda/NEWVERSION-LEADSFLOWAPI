import React, { useState, useEffect, useCallback } from 'react';
import { X, Search, Check, Loader, UserPlus, Users } from 'lucide-react';
import { api } from '../../../../lib/api';

interface Lead {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    status?: string;
    tags?: string[];
}

interface AddLeadsToTagModalProps {
    tagName: string;
    tagType: 'funnel' | 'lead_tag' | 'conversation';
    tagColor?: string;
    /** The raw status value for funnel tags (e.g. 'novo', 'contatado') */
    statusValue?: string;
    onClose: () => void;
    onLeadsAdded: () => void;
}

export default function AddLeadsToTagModal({
    tagName,
    tagType,
    tagColor,
    statusValue,
    onClose,
    onLeadsAdded,
}: AddLeadsToTagModalProps) {
    const [search, setSearch] = useState('');
    const [leads, setLeads] = useState<Lead[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [searchTimer, setSearchTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

    const searchLeads = useCallback(async (query: string) => {
        setLoading(true);
        try {
            const result: any = await api.leads.searchSimple(query, 30);
            setLeads(result?.data || []);
        } catch (err) {
            console.error('Error searching leads:', err);
            setLeads([]);
        } finally {
            setLoading(false);
        }
    }, []);

    // Initial load
    useEffect(() => {
        searchLeads('');
    }, [searchLeads]);

    // Debounced search
    useEffect(() => {
        if (searchTimer) clearTimeout(searchTimer);
        const timer = setTimeout(() => {
            searchLeads(search);
        }, 300);
        setSearchTimer(timer);
        return () => clearTimeout(timer);
    }, [search]);

    const toggleLead = (leadId: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(leadId)) {
                next.delete(leadId);
            } else {
                next.add(leadId);
            }
            return next;
        });
    };

    const selectAll = () => {
        if (selectedIds.size === leads.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(leads.map(l => l.id)));
        }
    };

    const handleSubmit = async () => {
        if (selectedIds.size === 0) return;

        setSubmitting(true);
        try {
            const leadIds: string[] = Array.from(selectedIds);

            if (tagType === 'funnel') {
                // Add leads to funnel stage by setting their status
                const status = statusValue || tagName;
                await api.leads.addLeadsToFunnelStage(status, leadIds);
            } else if (tagType === 'lead_tag') {
                // Add tag to leads
                await api.leads.addLeadsToTag(tagName, leadIds);
            }

            onLeadsAdded();
            onClose();
        } catch (err) {
            console.error('Error adding leads:', err);
            alert('Erro ao adicionar leads. Tente novamente.');
        } finally {
            setSubmitting(false);
        }
    };

    // Check if a lead already belongs to this tag/stage
    const isLeadAlreadyInTag = (lead: Lead): boolean => {
        if (tagType === 'funnel') {
            const status = statusValue || tagName;
            return lead.status?.toLowerCase() === status.toLowerCase();
        }
        if (tagType === 'lead_tag') {
            return lead.tags?.includes(tagName) || false;
        }
        return false;
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div
                className="w-full max-w-lg rounded-lg shadow-lg flex flex-col"
                style={{ backgroundColor: 'hsl(var(--background))', maxHeight: '80vh' }}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
                    <div className="flex items-center gap-3">
                        <div
                            className="w-8 h-8 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: tagColor || '#3B82F6' }}
                        >
                            <UserPlus className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold" style={{ color: 'hsl(var(--foreground))' }}>
                                Adicionar Leads
                            </h2>
                            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                {tagType === 'funnel' ? 'Etapa: ' : 'Tag: '}
                                <span className="font-medium">{tagName}</span>
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Search */}
                <div className="p-4 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'hsl(var(--muted-foreground))' }} />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Buscar por nome, email ou telefone..."
                            className="w-full pl-10 pr-3 py-2 rounded-md border focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            style={{
                                borderColor: 'hsl(var(--border))',
                                backgroundColor: 'hsl(var(--input))',
                                color: 'hsl(var(--foreground))',
                            }}
                            autoFocus
                        />
                    </div>
                    {leads.length > 0 && (
                        <div className="flex items-center justify-between mt-2">
                            <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                {leads.length} lead{leads.length !== 1 ? 's' : ''} encontrado{leads.length !== 1 ? 's' : ''}
                            </span>
                            <button
                                onClick={selectAll}
                                className="text-xs text-blue-500 hover:text-blue-600 font-medium"
                            >
                                {selectedIds.size === leads.length ? 'Desmarcar todos' : 'Selecionar todos'}
                            </button>
                        </div>
                    )}
                </div>

                {/* Leads list */}
                <div className="flex-1 overflow-y-auto p-2" style={{ minHeight: '200px', maxHeight: '400px' }}>
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader className="w-6 h-6 animate-spin" style={{ color: 'hsl(var(--muted-foreground))' }} />
                        </div>
                    ) : leads.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8" style={{ color: 'hsl(var(--muted-foreground))' }}>
                            <Users className="w-10 h-10 mb-2 opacity-50" />
                            <p className="text-sm">Nenhum lead encontrado</p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {leads.map((lead) => {
                                const isSelected = selectedIds.has(lead.id);
                                const alreadyInTag = isLeadAlreadyInTag(lead);

                                return (
                                    <button
                                        key={lead.id}
                                        onClick={() => !alreadyInTag && toggleLead(lead.id)}
                                        disabled={alreadyInTag}
                                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors ${
                                            alreadyInTag
                                                ? 'opacity-50 cursor-not-allowed'
                                                : isSelected
                                                ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                                                : 'hover:bg-gray-100 dark:hover:bg-gray-800/50 border border-transparent'
                                        }`}
                                    >
                                        {/* Checkbox */}
                                        <div
                                            className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                                isSelected || alreadyInTag
                                                    ? 'bg-blue-500 border-blue-500'
                                                    : 'border-gray-300 dark:border-gray-600'
                                            }`}
                                        >
                                            {(isSelected || alreadyInTag) && <Check className="w-3 h-3 text-white" />}
                                        </div>

                                        {/* Lead info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium truncate" style={{ color: 'hsl(var(--foreground))' }}>
                                                    {lead.name || 'Sem nome'}
                                                </span>
                                                {alreadyInTag && (
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 flex-shrink-0">
                                                        já incluído
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                                {lead.email && <span className="truncate">{lead.email}</span>}
                                                {lead.email && lead.phone && <span>•</span>}
                                                {lead.phone && <span>{lead.phone}</span>}
                                            </div>
                                        </div>

                                        {/* Status badge */}
                                        {lead.status && (
                                            <span
                                                className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
                                                style={{
                                                    backgroundColor: 'hsl(var(--muted))',
                                                    color: 'hsl(var(--muted-foreground))',
                                                }}
                                            >
                                                {lead.status}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t flex items-center justify-between" style={{ borderColor: 'hsl(var(--border))' }}>
                    <span className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''}
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 rounded-md text-sm font-medium transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                            style={{ color: 'hsl(var(--foreground))' }}
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={selectedIds.size === 0 || submitting}
                            className="px-4 py-2 rounded-md text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ backgroundColor: tagColor || '#3B82F6' }}
                        >
                            {submitting ? (
                                <Loader className="w-4 h-4 animate-spin" />
                            ) : (
                                `Adicionar ${selectedIds.size > 0 ? `(${selectedIds.size})` : ''}`
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
