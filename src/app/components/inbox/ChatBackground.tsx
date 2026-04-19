// INBOX: WhatsApp Web-style chat background
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
            className={`relative bg-[#efeae2] dark:bg-[#0b141a] ${className}`}
        >
            {/* WhatsApp-style doodle pattern overlay */}
            <div 
                className="absolute inset-0 pointer-events-none opacity-[0.06] dark:opacity-[0.04]"
                style={{
                    backgroundImage: [
                        `radial-gradient(circle, rgba(17,27,33,0.8) 0.8px, transparent 0.8px)`,
                        `radial-gradient(circle, rgba(17,27,33,0.5) 0.5px, transparent 0.5px)`,
                    ].join(', '),
                    backgroundSize: '32px 32px, 48px 48px',
                    backgroundPosition: '0 0, 16px 16px',
                }}
            />
            {/* Dark-mode pattern (light dots on dark bg) */}
            <div 
                className="absolute inset-0 pointer-events-none hidden dark:block opacity-[0.04]"
                style={{
                    backgroundImage: [
                        `radial-gradient(circle, rgba(233,237,239,0.9) 0.8px, transparent 0.8px)`,
                        `radial-gradient(circle, rgba(233,237,239,0.6) 0.5px, transparent 0.5px)`,
                    ].join(', '),
                    backgroundSize: '32px 32px, 48px 48px',
                    backgroundPosition: '0 0, 16px 16px',
                }}
            />
            
            {/* Content */}
            <div className="relative z-10 h-full">
                {children}
            </div>
        </div>
    );
}
