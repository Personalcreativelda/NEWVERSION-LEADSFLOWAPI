import React from 'react';
import { MessageSquare } from 'lucide-react';

export default function InboxChannels() {
    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-4 flex items-center gap-2" style={{ color: 'hsl(var(--foreground))' }}>
                <MessageSquare className="w-6 h-6 text-blue-500" />
                Canais de Comunicação
            </h1>
            <p style={{ color: 'hsl(var(--muted-foreground))' }}>Gerencie seus canais de atendimento (WhatsApp, Instagram, Webchat).</p>
        </div>
    );
}
