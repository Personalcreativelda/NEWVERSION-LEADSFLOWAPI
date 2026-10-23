import { matchesSearch } from '../../utils/search';
/**
 * Modal para Reencaminhar Mensagem (WhatsApp-style)
 * Mostra lista de conversas para selecionar destino.
 */
import { useState, useMemo, useEffect, useRef } from 'react';
import { Search, Forward, Check } from 'lucide-react';
import type { ConversationWithDetails, MessageWithSender } from '../../types/inbox';
import { AppModal } from '../base/AppModal';
import { AppButton } from '../base/AppButton';

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

    const filtered = useMemo(() => {
        return conversations
            .filter((c) => c.id !== currentConversationId)
            .filter((c) => {
                // Exclude groups
                const jid = (c.metadata as any)?.jid || (c as any).remote_jid || '';
                if (jid.includes('@g.us')) return false;
                if ((c as any).is_group || (c.metadata as any)?.is_group || c.contact?.is_group) return false;
                return true;
            })
            .filter((c) => matchesSearch(search, c.contact?.name, (c as any).lead?.name, c.contact?.phone));
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
        <AppModal
            open
            onOpenChange={(open) => !open && onClose()}
            size="sm"
            className="p-0 gap-0 flex flex-col"
            title={
                <div className="flex items-center gap-2">
                    <Forward className="w-5 h-5 text-primary" />
                    <span>Reencaminhar mensagem</span>
                </div>
            }
        >
            <div className="flex flex-col overflow-hidden" style={{ maxHeight: '65vh' }}>

                {/* Message preview */}
                <div className="px-5 py-3 bg-muted border-b border-border">
                    <div className="flex items-start gap-2 text-xs text-muted-foreground">
                        <Forward className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        <span className="italic truncate">{previewText || '(mensagem sem texto)'}</span>
                    </div>
                </div>

                {/* Search */}
                <div className="px-4 py-3 border-b border-border">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                            ref={searchRef}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Pesquisar conversa..."
                            className="w-full pl-9 pr-3 py-2 text-sm bg-muted rounded-lg border-none outline-none placeholder:text-muted-foreground"
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
                                    className={`w-full flex items-center gap-3 px-5 py-3 hover:bg-muted transition-colors text-left ${isSelected ? 'bg-primary/10' : ''}`}
                                >
                                    {/* Avatar */}
                                    <div className="relative flex-shrink-0">
                                        <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center text-primary text-sm font-semibold">
                                            {getInitials(name)}
                                        </div>
                                        {isSelected && (
                                            <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                                                <Check className="w-3 h-3 text-primary-foreground" />
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
                    <AppButton
                        onClick={handleForward}
                        disabled={selected.size === 0}
                        loading={forwarding}
                        className="w-full"
                    >
                        {!forwarding && <Forward className="w-4 h-4" />}
                        {forwarding ? 'A enviar...' : 'Reencaminhar'}
                    </AppButton>
                </div>
            </div>
        </AppModal>
    );
}
