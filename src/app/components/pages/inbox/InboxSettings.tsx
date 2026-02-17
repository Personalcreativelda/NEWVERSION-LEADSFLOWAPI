import React from 'react';
import TagsList from '../../inbox/tags/TagsList';

export default function InboxSettings() {
    return (
        <div className="h-full p-4 md:p-6 overflow-auto">
            <div className="mb-6">
                <h1 className="text-2xl font-bold mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                    Gerenciar Etiquetas
                </h1>
                <p style={{ color: 'hsl(var(--muted-foreground))' }}>
                    Crie e organize etiquetas para categorizar suas conversas.
                </p>
            </div>

            <TagsList />
        </div>
    );
}
