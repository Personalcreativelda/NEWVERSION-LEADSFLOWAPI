// INBOX: neutral chat thread background (Minimal Kit style — flat surface, no wallpaper pattern)
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
            className={`relative bg-[#ECE5DD] dark:bg-[#0B141A] ${className}`}
        >
            {children}
        </div>
    );
}
