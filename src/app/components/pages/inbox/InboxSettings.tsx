import React, { useState } from 'react';
import { ChannelsList } from '../../inbox/channels/ChannelsList';
import TagsList from '../../inbox/tags/TagsList';

export default function InboxSettings() {
    const [activeTab, setActiveTab] = useState<'channels' | 'tags'>('channels');

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
            </div>

            {/* Tabs */}
            <div
                className="px-6 border-b"
                style={{
                    backgroundColor: 'hsl(var(--card))',
                    borderColor: 'hsl(var(--border))'
                }}
            >
                <div className="flex gap-8">
                    <button
                        onClick={() => setActiveTab('channels')}
                        className={`py-4 text-sm font-medium border-b-2 transition-colors ${
                            activeTab === 'channels'
                                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                                : 'border-transparent'
                        }`}
                        style={activeTab !== 'channels' ? { color: 'hsl(var(--muted-foreground))' } : undefined}
                    >
                        Canais de Comunicação
                    </button>
                    <button
                        onClick={() => setActiveTab('tags')}
                        className={`py-4 text-sm font-medium border-b-2 transition-colors ${
                            activeTab === 'tags'
                                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                                : 'border-transparent'
                        }`}
                        style={activeTab !== 'tags' ? { color: 'hsl(var(--muted-foreground))' } : undefined}
                    >
                        Etiquetas
                    </button>
                </div>
            </div>

            {/* Content */}
            <div
                className="flex-1 overflow-auto"
                style={{ backgroundColor: 'hsl(var(--background))' }}
            >
                {activeTab === 'channels' ? (
                    <ChannelsList />
                ) : (
                    <div className="p-4 md:p-6">
                        <div className="mb-6">
                            <h3 className="text-xl font-bold mb-1" style={{ color: 'hsl(var(--foreground))' }}>
                                Gerenciar Etiquetas
                            </h3>
                            <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                Crie e organize etiquetas para categorizar suas conversas.
                            </p>
                        </div>
                        <TagsList />
                    </div>
                )}
            </div>
        </div>
    );
}
