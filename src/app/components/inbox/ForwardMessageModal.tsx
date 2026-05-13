/**
 * Modal para Reencaminhar Mensagem (WhatsApp-style)
 * Mostra lista de conversas para selecionar destino.
 */
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { X, Search, Forward, Check } from 'lucide-react';
import type { ConversationWithDetails, MessageWithSender } from '../../types/inbox';

interface ForwardMessageModalProps {
    message: MessageWithSender;
    conversations: ConversationWithDetails[];
    currentConversationId: string;
    onForward: (targetConversationIds: string[]) => Promise<void>;
    onClose: () => void;
}

export function ForwardMessageModal({
    message,
    conversations,
    currentConversationId,
    onForward,
    onClose,
}: ForwardMessageModalProps) {
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [forwarding, setForwarding] = useState(false);
    const searchRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        searchRef.current?.focus();
    }, []);

    // Fechar com Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    const filtered = useMemo(() => {
        const q = search.toLowerCase().trim();
        return conversations
            .filter((c) => c.id !== currentConversationId)
            .filter((c) => {
                if (!q) return true;
                const name = (c.contact?.name || c.lead?.name || c.contact?.phone || '').toLowerCase();
                return name.includes(q);
            });
    }, [conversations, currentConversationId, search]);

    const toggle = (id: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleForward = async () => {
        if (selected.size === 0 || forwarding) return;
        setForwarding(true);
        try {
            await onForward(Array.from(selected));
            onClose();
        } finally {
            setForwarding(false);
        }
    };

    // Preview do conteúdo da mensagem
    const previewText = message.content && message.content.length > 60
        ? message.content.slice(0, 60) + '…'
        : message.content || (message.media_type ? `[${message.media_type}]` : '');

    const getContactName = (c: ConversationWithDetails) =>
        c.contact?.name || c.lead?.name || c.contact?.phone || c.lead?.phone || 'Contacto';

    const getInitials = (name: string) =>
        name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="bg-white dark:bg-[#202c33] rounded-2xl shadow-2xl w-full max-w-sm mx-4 flex flex-col overflow-hidden"
                style={{ maxHeight: '80vh' }}>

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-black/8 dark:border-white/8">
                    <div className="flex items-center gap-2">
                        <Forward className="w-5 h-5 text-[#00a884]" />
                        <h2 className="font-semibold text-[15px]">Reencaminhar mensagem</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/8 dark:hover:bg-white/8 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Message preview */}
                <div className="px-5 py-3 bg-[#f0f2f5] dark:bg-[#111b21] border-b border-black/5 dark:border-white/5">
                    <div className="flex items-start gap-2 text-xs text-[rgba(17,27,33,0.55)] dark:text-[rgba(233,237,239,0.55)]">
                        <Forward className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        <span className="italic truncate">{previewText || '(mensagem sem texto)'}</span>
                    </div>
                </div>

                {/* Search */}
                <div className="px-4 py-3 border-b border-black/5 dark:border-white/5">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                            ref={searchRef}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Pesquisar conversa..."
                            className="w-full pl-9 pr-3 py-2 text-sm bg-[#f0f2f5] dark:bg-[#2a3942] rounded-lg border-none outline-none placeholder:text-muted-foreground"
                        />
                    </div>
                </div>

                {/* Conversation list */}
                <div className="flex-1 overflow-y-auto">
                    {filtered.length === 0 ? (
                        <div className="py-10 text-center text-sm text-muted-foreground">
                            Nenhuma conversa encontrada
                        </div>
                    ) : (
                        filtered.map((conv) => {
                            const name    = getContactName(conv);
                            const isSelected = selected.has(conv.id);
                            return (
                                <button
                                    key={conv.id}
                                    onClick={() => toggle(conv.id)}
                                    className={`w-full flex items-center gap-3 px-5 py-3 hover:bg-[#f0f2f5] dark:hover:bg-[#2a3942] transition-colors text-left ${isSelected ? 'bg-[#e9fde4] dark:bg-[#003d33]' : ''}`}
                                >
                                    {/* Avatar */}
                                    <div className="relative flex-shrink-0">
                                        <div className="w-10 h-10 rounded-full bg-[#00a884]/20 flex items-center justify-center text-[#00a884] text-sm font-semibold">
                                            {getInitials(name)}
                                        </div>
                                        {isSelected && (
                                            <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[#00a884] flex items-center justify-center">
                                                <Check className="w-3 h-3 text-white" />
                                            </div>
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{name}</p>
                                        {conv.last_message?.content && (
                                            <p className="text-xs text-muted-foreground truncate">
                                                {conv.last_message.content}
                                            </p>
                                        )}
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-black/8 dark:border-white/8">
                    {selected.size > 0 && (
                        <p className="text-xs text-center text-muted-foreground mb-3">
                            {selected.size} conversa{selected.size > 1 ? 's' : ''} selecionada{selected.size > 1 ? 's' : ''}
                        </p>
                    )}
                    <button
                        onClick={handleForward}
                        disabled={selected.size === 0 || forwarding}
                        className="w-full py-2.5 rounded-xl bg-[#00a884] text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#008f72] transition-colors flex items-center justify-center gap-2"
                    >
                        {forwarding ? (
                            <>
                                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                Enviando...
                            </>
                        ) : (
                            <>
                                <Forward className="w-4 h-4" />
                                Reencaminhar
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
