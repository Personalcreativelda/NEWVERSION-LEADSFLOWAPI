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
            className={`relative chat-wallpaper ${className}`}
        >
            {children}
        </div>
    );
}
