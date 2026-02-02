import React from 'react';
import { ChannelsList } from '../../inbox/channels/ChannelsList'; // Adjust import path if needed

export default function InboxSettings() {
    return (
        <div className="h-full p-4 md:p-6 overflow-hidden flex flex-col">
            <div className="mb-6 flex-shrink-0">
                <h1 className="text-2xl font-bold mb-2" style={{ color: 'hsl(var(--foreground))' }}>Configurações do Inbox</h1>
                <p style={{ color: 'hsl(var(--muted-foreground))' }}>Gerencie seus canais de comunicação e preferências.</p>
            </div>

            <div className="flex-1 min-h-0">
                <ChannelsList />
            </div>
        </div>
    );
}
