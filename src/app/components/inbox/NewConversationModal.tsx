import { matchesSearch } from '../../utils/search';
import React, { useState, useEffect } from 'react';
import { X, Phone, User, Loader2, Search, UserCircle } from 'lucide-react';
import { leadsApi } from '../../utils/api';
import { OverlayModal } from '../base/OverlayModal';
import { formatPhone } from '../dashboard/leadDisplay';

interface NewConversationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreateConversation: (phone: string, name: string) => Promise<void>;
    onSelectLead?: (lead: any) => void;
}

export function NewConversationModal({ isOpen, onClose, onCreateConversation, onSelectLead }: NewConversationModalProps) {
    const [mode, setMode] = useState<'new' | 'existing'>('new');
    const [phone, setPhone] = useState('');
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    
    // Para modo de leads existentes
    const [leads, setLeads] = useState<any[]>([]);
    const [loadingLeads, setLoadingLeads] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        if (isOpen && mode === 'existing') {
            fetchLeads();
        }
    }, [isOpen, mode]);

    const fetchLeads = async () => {
        setLoadingLeads(true);
        try {
            const data = await leadsApi.getAll();
            setLeads(Array.isArray(data) ? data : data.leads || []);
        } catch (err) {
            console.error('Error fetching leads:', err);
        } finally {
            setLoadingLeads(false);
        }
    };

    if (!isOpen) return null;

    const validatePhone = (phone: string): boolean => {
        // Aceita qualquer número com pelo menos 8 dígitos
        const numbers = phone.replace(/\D/g, '');
        return numbers.length >= 8 && numbers.length <= 20;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        const cleanPhone = phone.replace(/\D/g, '');

        if (!validatePhone(cleanPhone)) {
            setError('Número inválido. Digite pelo menos 8 dígitos (com código do país).');
            return;
        }

        if (!name.trim()) {
            setError('Digite o nome do contacto');
            return;
        }

        setLoading(true);
        try {
            await onCreateConversation(cleanPhone, name.trim());
            setPhone('');
            setName('');
            onClose();
        } catch (err: any) {
            setError(err.message || 'Erro ao criar conversa. Tente novamente.');
        } finally {
            setLoading(false);
        }
    };

    const handleSelectLead = (lead: any) => {
        if (onSelectLead) {
            onSelectLead(lead);
            onClose();
        }
    };

    const handlePhoneChange = (value: string) => {
        setPhone(value);
        setError('');
    };

    const filteredLeads = leads.filter(lead => {
        return matchesSearch(searchQuery, lead.name, lead.nome, lead.phone, lead.telefone, lead.email);
    });

    return (
        <OverlayModal onClose={onClose} stickyEdges={false} className="max-w-md flex flex-col overflow-hidden">
                {/* Header */}
                <div 
                    className="flex items-center justify-between px-6 py-4 border-b"
                    style={{ borderColor: 'hsl(var(--border))' }}
                >
                    <h2 
                        className="text-lg font-semibold"
                        style={{ color: 'hsl(var(--foreground))' }}
                    >
                        Nova conversa
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-lg hover:bg-muted/50 transition-colors"
                        disabled={loading}
                    >
                        <X className="w-5 h-5" style={{ color: 'hsl(var(--muted-foreground))' }} />
                    </button>
                </div>

                {/* Mode Tabs */}
                <div className="flex border-b" style={{ borderColor: 'hsl(var(--border))' }}>
                    <button
                        onClick={() => setMode('new')}
                        className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                            mode === 'new' 
                                ? 'border-b-2 border-primary' 
                                : 'border-b-2 border-transparent'
                        }`}
                        style={{ 
                            color: mode === 'new' ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                        }}
                    >
                        Novo número
                    </button>
                    <button
                        onClick={() => setMode('existing')}
                        className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                            mode === 'existing' 
                                ? 'border-b-2 border-primary' 
                                : 'border-b-2 border-transparent'
                        }`}
                        style={{ 
                            color: mode === 'existing' ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                        }}
                    >
                        Lead existente
                    </button>
                </div>

                {/* Content */}
                {mode === 'new' ? (
                    <form onSubmit={handleSubmit} className="p-6 space-y-4">
                        {/* Nome */}
                        <div>
                            <label 
                                className="block text-sm font-medium mb-2"
                                style={{ color: 'hsl(var(--foreground))' }}
                            >
                                Nome *
                            </label>
                            <div className="relative">
                                <User 
                                    className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5"
                                    style={{ color: 'hsl(var(--muted-foreground))' }}
                                />
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Ex: João Silva"
                                    disabled={loading}
                                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
                                    style={{
                                        backgroundColor: 'hsl(var(--background))',
                                        borderColor: 'hsl(var(--border))',
                                        color: 'hsl(var(--foreground))'
                                    }}
                                />
                            </div>
                        </div>

                        {/* Telefone */}
                        <div>
                            <label 
                                className="block text-sm font-medium mb-2"
                                style={{ color: 'hsl(var(--foreground))' }}
                            >
                                Telefone *
                            </label>
                            <div className="relative">
                                <Phone 
                                    className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5"
                                    style={{ color: 'hsl(var(--muted-foreground))' }}
                                />
                                <input
                                    type="tel"
                                    value={phone}
                                    onChange={(e) => handlePhoneChange(e.target.value)}
                                    placeholder="258840000000"
                                    disabled={loading}
                                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
                                    style={{
                                        backgroundColor: 'hsl(var(--background))',
                                        borderColor: 'hsl(var(--border))',
                                        color: 'hsl(var(--foreground))'
                                    }}
                                />
                            </div>
                            <p className="mt-1.5 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                Com o código do país (ex.: 258)
                            </p>
                        </div>

                        {/* Error Message */}
                        {error && (
                            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={loading}
                                className="flex-1 px-4 h-10 rounded-lg border font-medium transition-colors hover:bg-muted/50"
                                style={{
                                    borderColor: 'hsl(var(--border))',
                                    color: 'hsl(var(--foreground))'
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={loading || !phone.trim() || !name.trim()}
                                className="flex-1 px-4 h-10 rounded-lg bg-primary text-primary-foreground font-medium transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        A criar...
                                    </>
                                ) : (
                                    'Iniciar Conversa'
                                )}
                            </button>
                        </div>
                    </form>
                ) : (
                    <div className="flex min-h-0 flex-1 flex-col">
                        {/* Search */}
                        <div className="p-4 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
                            <div className="relative">
                                <Search 
                                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                                    style={{ color: 'hsl(var(--muted-foreground))' }}
                                />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Pesquisar leads"
                                    className="w-full pl-9 pr-4 py-2 rounded-lg border outline-none focus:ring-2 focus:ring-blue-500/30 text-sm"
                                    style={{
                                        backgroundColor: 'hsl(var(--background))',
                                        borderColor: 'hsl(var(--border))',
                                        color: 'hsl(var(--foreground))'
                                    }}
                                />
                            </div>
                        </div>

                        {/* Leads List */}
                        <div className="flex-1 overflow-y-auto">
                            {loadingLeads ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                                </div>
                            ) : filteredLeads.length === 0 ? (
                                <div className="text-center py-12">
                                    <UserCircle className="w-12 h-12 mx-auto mb-3 opacity-30" style={{ color: 'hsl(var(--muted-foreground))' }} />
                                    <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                        {searchQuery ? 'Nenhum lead encontrado' : 'Nenhum lead registado'}
                                    </p>
                                </div>
                            ) : (
                                filteredLeads.map((lead) => (
                                    <button
                                        key={lead.id}
                                        onClick={() => handleSelectLead(lead)}
                                        className="w-full min-w-0 px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors border-b"
                                        style={{ borderColor: 'hsl(var(--border))' }}
                                    >
                                        {(lead.avatarUrl || lead.avatar_url) ? (
                                            <img
                                                src={lead.avatarUrl || lead.avatar_url}
                                                alt={lead.name || lead.nome}
                                                className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                                                onError={(e) => {
                                                    const el = e.currentTarget;
                                                    el.style.display = 'none';
                                                    const fallback = el.nextElementSibling as HTMLElement | null;
                                                    if (fallback) fallback.style.display = 'flex';
                                                }}
                                            />
                                        ) : null}
                                        <div
                                            className="w-10 h-10 rounded-full bg-muted items-center justify-center flex-shrink-0"
                                            style={{ display: (lead.avatarUrl || lead.avatar_url) ? 'none' : 'flex' }}
                                        >
                                            <span className="text-foreground font-semibold text-sm">
                                                {(lead.name || lead.nome || '?').charAt(0).toUpperCase()}
                                            </span>
                                        </div>
                                        <div className="flex-1 text-left min-w-0">
                                            <p className="font-medium truncate text-sm" style={{ color: 'hsl(var(--foreground))' }}>
                                                {lead.name || lead.nome || 'Sem nome'}
                                            </p>
                                            <p className="text-xs truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                                {formatPhone(lead.phone || lead.telefone) || lead.email || 'Sem contacto'}
                                            </p>
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </OverlayModal>
    );
}
