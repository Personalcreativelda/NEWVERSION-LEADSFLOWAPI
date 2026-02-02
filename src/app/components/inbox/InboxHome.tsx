import React from 'react';
import { ChatPanel } from './ChatPanel';
import { EmptyState } from './EmptyState';
import { useInbox } from '../../hooks/useInbox';

interface InboxHomeProps {
    onNavigate?: (page: string) => void;
}

export default function InboxHome({ onNavigate }: InboxHomeProps) {
    const { selectedConversation, selectConversation } = useInbox();

    const handleOpenSettings = () => {
        if (onNavigate) {
            onNavigate('inbox-settings');
        }
    };

    if (selectedConversation) {
        return (
            <ChatPanel
                conversation={selectedConversation}
                onBack={() => selectConversation({} as any)}
            />
        );
    }

    return (
        <div 
            className="flex-1 flex items-center justify-center p-8 h-full"
            style={{ backgroundColor: 'hsl(var(--background))' }}
        >
            <EmptyState onOpenSettings={handleOpenSettings} />
        </div>
    );
}
