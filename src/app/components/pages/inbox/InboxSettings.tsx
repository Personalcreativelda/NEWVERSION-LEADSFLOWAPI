import React from 'react';
import { ChannelsList } from '../../inbox/channels/ChannelsList';

export default function InboxSettings() {
    return (
        <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: 'hsl(var(--card))' }}>
            {/* Header */}
            <div
                className="px-6 py-4 border-b"
                style={{
                    backgroundColor: 'hsl(var(--card))',
                    borderColor: 'hsl(var(--border))'
                }}
            >
                <h2 className="text-lg font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                    Configurações do Inbox
                </h2>
                <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    Gerencie seus canais de comunicação
                </p>
            </div>

            {/* Content */}
            <div
                className="flex-1 overflow-auto"
                style={{ backgroundColor: 'hsl(var(--background))' }}
            >
                <ChannelsList />
            </div>
        </div>
    );
}
