// INBOX: Lista de conversas - ManyChat-style
import React from 'react';
import { ConversationItem } from './ConversationItem';
import type { ConversationWithDetails } from '../../types/inbox';
import { Loader2, Inbox } from 'lucide-react';

interface ConversationListProps {
    conversations: ConversationWithDetails[];
    selectedId: string | null;
    onSelect: (conversation: ConversationWithDetails) => void;
    loading: boolean;
}

export function ConversationList({
    conversations,
    selectedId,
    onSelect,
    loading
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
                <ConversationItem
                    key={conversation.id}
                    conversation={conversation}
                    isSelected={selectedId === conversation.id}
                    onClick={() => onSelect(conversation)}
                />
            ))}

            {loading && conversations.length > 0 && (
                <div className="p-3 flex justify-center">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                </div>
            )}
        </div>
    );
}
