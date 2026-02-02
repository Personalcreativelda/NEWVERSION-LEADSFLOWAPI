// INBOX: Tela vazia (sem conversa selecionada) modernizada
import React from 'react';
import { MessageSquare, Settings } from 'lucide-react';

interface EmptyStateProps {
    onOpenSettings?: () => void;
}

export function EmptyState({ onOpenSettings }: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center p-8 text-center animate-fadeIn group">
            <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-[#00D9A3]/10 flex items-center justify-center mb-10 relative transition-transform duration-500 group-hover:scale-110">
                <div className="absolute inset-0 bg-[#00D9A3]/20 rounded-full animate-ping opacity-20"></div>
                <MessageSquare size={56} className="text-[#00D9A3] relative z-10" />
            </div>

            <h3 
                className="text-2xl md:text-3xl font-bold mb-4 tracking-tight"
                style={{ color: 'hsl(var(--foreground))' }}
            >
                Bem-vindo ao seu Inbox
            </h3>

            <p 
                className="max-w-md mx-auto mb-10 leading-relaxed text-lg"
                style={{ color: 'hsl(var(--muted-foreground))' }}
            >
                Selecione uma conversa à esquerda para começar ou configure seus canais.
            </p>

            <button
                onClick={onOpenSettings}
                className="flex items-center gap-2 px-6 py-3 bg-[#00D9A3] hover:bg-[#00C090] text-white rounded-xl font-semibold shadow-lg shadow-[#00D9A3]/20 transition-all active:scale-95 group/btn"
            >
                <Settings size={18} className="group-hover/btn:rotate-90 transition-transform duration-500" />
                Configurar Canais
            </button>

            <div className="mt-12 grid grid-cols-3 gap-6 opacity-30 grayscale hover:grayscale-0 transition-all duration-700">
                <div className="flex flex-col items-center">
                    <span className="text-xs font-bold uppercase tracking-widest mb-2">WhatsApp</span>
                    <div className="w-1 h-1 bg-green-500 rounded-full"></div>
                </div>
                <div className="flex flex-col items-center">
                    <span className="text-xs font-bold uppercase tracking-widest mb-2">Instagram</span>
                    <div className="w-1 h-1 bg-pink-500 rounded-full"></div>
                </div>
                <div className="flex flex-col items-center">
                    <span className="text-xs font-bold uppercase tracking-widest mb-2">Facebook</span>
                    <div className="w-1 h-1 bg-blue-600 rounded-full"></div>
                </div>
            </div>
        </div>
    );
}
