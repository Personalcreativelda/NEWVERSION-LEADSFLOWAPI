// INBOX: fundo das conversas — papel de parede com desenhos (.chat-wallpaper em globals.css)
import React from 'react';

interface ChatBackgroundProps {
    children: React.ReactNode;
    className?: string;
    scrollRef?: React.Ref<HTMLDivElement>;
}

export function ChatBackground({ children, className = '', scrollRef }: ChatBackgroundProps) {
    return (
        <div
            ref={scrollRef}
            // Dentro do chat, arrastar é para ler mensagens antigas, nunca para recarregar a página
            data-no-pull-refresh=""
            className={`relative chat-wallpaper ${className}`}
        >
            {children}
        </div>
    );
}
