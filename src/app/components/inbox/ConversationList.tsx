// INBOX: Lista de conversas modernizada
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
            <div className="flex flex-col items-center justify-center p-12 space-y-4">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                <p className="text-sm font-medium italic" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    Sincronizando conversas...
                </p>
            </div>
        );
    }

    if (!loading && conversations.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center opacity-40">
                <div 
                    className="w-16 h-16 rounded-full flex items-center justify-center mb-4 transition-transform hover:scale-110"
                    style={{ backgroundColor: 'hsl(var(--muted))' }}
                >
                    <Inbox className="w-8 h-8" style={{ color: 'hsl(var(--muted-foreground))' }} />
                </div>
                <p className="text-sm font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    Nenhuma conversa por aqui.
                </p>
                <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    Seu histórico aparecerá aqui.
                </p>
            </div>
        );
    }

    return (
        <div 
            className="overflow-x-hidden"
            style={{ borderColor: 'hsl(var(--border))' }}
        >
            {conversations.map((conversation) => (
                <ConversationItem
                    key={conversation.id}
                    conversation={conversation}
                    isSelected={selectedId === conversation.id}
                    onClick={() => onSelect(conversation)}
                />
            ))}

            {loading && conversations.length > 0 && (
                <div className="p-4 flex justify-center">
                    <Loader2 className="w-5 h-5 text-blue-500 animate-spin opacity-50" />
                </div>
            )}
        </div>
    );
}
