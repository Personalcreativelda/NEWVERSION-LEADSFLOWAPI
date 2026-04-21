// INBOX: Lista de conversas - ManyChat-style
import React from 'react';
import { ConversationItem } from './ConversationItem';
import type { ConversationWithDetails } from '../../types/inbox';
import { Loader2, Inbox, CheckSquare, Square } from 'lucide-react';

interface ConversationListProps {
    conversations: ConversationWithDetails[];
    selectedId: string | null;
    onSelect: (conversation: ConversationWithDetails) => void;
    loading: boolean;
    isSelectMode?: boolean;
    selectedIds?: Set<string>;
    onToggleSelect?: (id: string) => void;
}

export function ConversationList({
    conversations,
    selectedId,
    onSelect,
    loading,
    isSelectMode = false,
    selectedIds = new Set(),
    onToggleSelect,
}: ConversationListProps) {

    if (loading && conversations.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-10 space-y-3">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <p className="text-xs font-medium text-muted-foreground">
                    Sincronizando conversas...
                </p>
            </div>
        );
    }

    if (!loading && conversations.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-10 text-center">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3 bg-muted">
                    <Inbox className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">
                    Nenhuma conversa
                </p>
                <p className="text-xs mt-1 text-muted-foreground/70">
                    Seu histórico aparecerá aqui.
                </p>
            </div>
        );
    }

    return (
        <div className="overflow-x-hidden">
            {conversations.map((conversation) => (
                <div key={conversation.id} className="relative flex items-center">
                    {isSelectMode && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onToggleSelect?.(conversation.id); }}
                            className="absolute left-2 z-10 p-1 rounded transition-colors text-muted-foreground hover:text-primary"
                        >
                            {selectedIds.has(conversation.id)
                                ? <CheckSquare size={16} className="text-primary" />
                                : <Square size={16} />
                            }
                        </button>
                    )}
                    <div
                        className={`flex-1 min-w-0 transition-all duration-150 ${isSelectMode ? 'pl-8' : ''} ${isSelectMode && selectedIds.has(conversation.id) ? 'bg-primary/5' : ''}`}
                    >
                        <ConversationItem
                            conversation={conversation}
                            isSelected={!isSelectMode && selectedId === conversation.id}
                            onClick={() => {
                                if (isSelectMode) {
                                    onToggleSelect?.(conversation.id);
                                } else {
                                    onSelect(conversation);
                                }
                            }}
                        />
                    </div>
                </div>
            ))}

            {loading && conversations.length > 0 && (
                <div className="p-3 flex justify-center">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                </div>
            )}
        </div>
    );
}
