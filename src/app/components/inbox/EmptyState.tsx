// INBOX: Empty state - modern ManyChat-style
import React from 'react';
import { MessageSquare, Settings, Zap } from 'lucide-react';

interface EmptyStateProps {
    onOpenSettings?: () => void;
}

export function EmptyState({ onOpenSettings }: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                <MessageSquare size={36} className="text-primary" />
            </div>

            <h3 className="text-xl font-semibold mb-2 text-foreground">
                Selecione uma conversa
            </h3>

            <p className="text-sm mb-8 leading-relaxed text-muted-foreground">
                Escolha uma conversa à esquerda para começar a interagir com seus leads.
            </p>

            <button
                onClick={onOpenSettings}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 hover:opacity-90 active:scale-[0.97] bg-primary text-primary-foreground"
            >
                <Settings size={16} />
                Configurar Canais
            </button>

            <div className="mt-10 flex items-center gap-6 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                    WhatsApp
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-pink-500 rounded-full" />
                    Instagram
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-blue-500 rounded-full" />
                    Facebook
                </div>
            </div>
        </div>
    );
}
