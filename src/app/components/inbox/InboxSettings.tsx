// INBOX: Tela de configurações do Inbox
import React, { useState } from 'react';
import { ChannelsList } from './channels/ChannelsList';
import { AssistantsList } from './ai-assistants/AssistantsList';

interface InboxSettingsProps {
    onBack: () => void;
}

export function InboxSettings({ onBack }: InboxSettingsProps) {
    const [activeTab, setActiveTab] = useState<'channels' | 'assistants'>('channels');

    return (
        <div 
            className="h-full flex flex-col overflow-hidden"
            style={{ backgroundColor: 'hsl(var(--card))' }}
        >
            {/* Header */}
            <div 
                className="px-6 py-4 border-b flex items-center gap-4"
                style={{ 
                    backgroundColor: 'hsl(var(--card))',
                    borderColor: 'hsl(var(--border))'
                }}
            >
                <button
                    onClick={onBack}
                    className="p-1 rounded-full transition-colors"
                    style={{ color: 'hsl(var(--muted-foreground))' }}
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                </button>
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
                        className={`py-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'channels'
                                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                                : 'border-transparent'
                            }`}
                        style={activeTab !== 'channels' ? { color: 'hsl(var(--muted-foreground))' } : undefined}
                    >
                        Canais de Comunicação
                    </button>
                    <button
                        onClick={() => setActiveTab('assistants')}
                        className={`py-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'assistants'
                                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                                : 'border-transparent'
                            }`}
                        style={activeTab !== 'assistants' ? { color: 'hsl(var(--muted-foreground))' } : undefined}
                    >
                        Assistentes Virtuais (IA)
                    </button>
                </div>
            </div>

            {/* Content */}
            <div 
                className="flex-1 overflow-hidden"
                style={{ backgroundColor: 'hsl(var(--background))' }}
            >
                {activeTab === 'channels' ? <ChannelsList /> : <AssistantsList />}
            </div>
        </div>
    );
}
