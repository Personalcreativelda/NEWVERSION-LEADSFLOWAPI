import React, { useState, useEffect } from 'react';
import { X, Phone, User, Loader2, Search, UserCircle } from 'lucide-react';
import { leadsApi } from '../../utils/api';

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
            setError('Digite o nome do contato');
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
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        const leadName = (lead.name || lead.nome || '').toLowerCase();
        const leadPhone = (lead.phone || lead.telefone || '').toLowerCase();
        const leadEmail = (lead.email || '').toLowerCase();
        return leadName.includes(query) || leadPhone.includes(query) || leadEmail.includes(query);
    });

    return (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
            {/* Overlay */}
            <div 
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div 
                className="relative w-full max-w-md rounded-xl shadow-2xl border overflow-hidden"
                style={{
                    backgroundColor: 'hsl(var(--card))',
                    borderColor: 'hsl(var(--border))'
                }}
            >
                {/* Header */}
                <div 
                    className="flex items-center justify-between px-6 py-4 border-b"
                    style={{ borderColor: 'hsl(var(--border))' }}
                >
                    <h2 
                        className="text-lg font-semibold"
                        style={{ color: 'hsl(var(--foreground))' }}
                    >
                        Nova Conversa
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
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
                                ? 'border-b-2 border-[#00C48C]' 
                                : 'border-b-2 border-transparent'
                        }`}
                        style={{ 
                            color: mode === 'new' ? '#00C48C' : 'hsl(var(--muted-foreground))',
                        }}
                    >
                        Novo Número
                    </button>
                    <button
                        onClick={() => setMode('existing')}
                        className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                            mode === 'existing' 
                                ? 'border-b-2 border-[#00C48C]' 
                                : 'border-b-2 border-transparent'
                        }`}
                        style={{ 
                            color: mode === 'existing' ? '#00C48C' : 'hsl(var(--muted-foreground))',
                        }}
                    >
                        Lead Existente
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
                                Nome do Contato *
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
                                Número de Telefone *
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
                                    placeholder="5511987654321"
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
                                Digite com código do país (Ex: 5511987654321 para Brasil, 258846070380 para Moçambique)
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
                                className="flex-1 px-4 py-2.5 rounded-lg border font-medium transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
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
                                className="flex-1 px-4 py-2.5 rounded-lg bg-[#00C48C] text-white font-medium transition-all hover:bg-[#00B07D] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Criando...
                                    </>
                                ) : (
                                    'Iniciar Conversa'
                                )}
                            </button>
                        </div>
                    </form>
                ) : (
                    <div className="max-h-[500px] flex flex-col">
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
                                    placeholder="Buscar por nome, telefone ou email..."
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
                                    <Loader2 className="w-6 h-6 animate-spin text-[#00C48C]" />
                                </div>
                            ) : filteredLeads.length === 0 ? (
                                <div className="text-center py-12">
                                    <UserCircle className="w-12 h-12 mx-auto mb-3 opacity-30" style={{ color: 'hsl(var(--muted-foreground))' }} />
                                    <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                        {searchQuery ? 'Nenhum lead encontrado' : 'Nenhum lead cadastrado'}
                                    </p>
                                </div>
                            ) : (
                                filteredLeads.map((lead) => (
                                    <button
                                        key={lead.id}
                                        onClick={() => handleSelectLead(lead)}
                                        className="w-full p-4 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors border-b"
                                        style={{ borderColor: 'hsl(var(--border))' }}
                                    >
                                        {lead.avatar_url ? (
                                            <img
                                                src={lead.avatar_url}
                                                alt={lead.name || lead.nome}
                                                className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                                            />
                                        ) : (
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center flex-shrink-0">
                                                <span className="text-white font-semibold text-sm">
                                                    {(lead.name || lead.nome || '?').charAt(0).toUpperCase()}
                                                </span>
                                            </div>
                                        )}
                                        <div className="flex-1 text-left min-w-0">
                                            <p className="font-medium truncate text-sm" style={{ color: 'hsl(var(--foreground))' }}>
                                                {lead.name || lead.nome || 'Sem nome'}
                                            </p>
                                            <p className="text-xs truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                                {lead.phone || lead.telefone || lead.email || 'Sem contato'}
                                            </p>
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
