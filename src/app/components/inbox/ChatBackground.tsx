// INBOX: neutral chat thread background (Minimal Kit style — flat surface, no wallpaper pattern)
import React from 'react';

interface ChatBackgroundProps {
    children: React.ReactNode;
    className?: string;
    scrollRef?: React.RefObject<HTMLElement | null>;
}

export function ChatBackground({ children, className = '', scrollRef }: ChatBackgroundProps) {
    return (
        <div
            ref={scrollRef as React.RefObject<HTMLDivElement>}
            className={`relative bg-background ${className}`}
        >
            <div className="relative h-full">
                {children}
            </div>
        </div>
    );
}
