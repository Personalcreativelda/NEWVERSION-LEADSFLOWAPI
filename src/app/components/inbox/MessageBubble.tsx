// INBOX: Componente de mensagem individual
import React from 'react';
import type { MessageWithSender } from '../../types/inbox';

interface MessageBubbleProps {
    message: MessageWithSender;
}

export function MessageBubble({ message }: MessageBubbleProps) {
    const isOut = message.direction === 'out';

    const formatTime = (dateString: string | number) => {
        if (!dateString && dateString !== 0) return '';
        try {
            let date: Date;
            const strValue = String(dateString);
            
            // Check if it's a Unix timestamp in seconds (10 digits) - like 1769767959
            if (/^\d{10}$/.test(strValue)) {
                date = new Date(parseInt(strValue) * 1000);
            } else if (/^\d{13}$/.test(strValue)) {
                // Unix timestamp in milliseconds
                date = new Date(parseInt(strValue));
            } else if (typeof dateString === 'number') {
                // If it's a number, assume seconds if small, otherwise milliseconds
                date = dateString > 9999999999 ? new Date(dateString) : new Date(dateString * 1000);
            } else {
                // ISO string or other date format
                date = new Date(dateString);
            }
            
            if (isNaN(date.getTime())) {
                console.log('[MessageBubble] Invalid date:', dateString);
                return '';
            }
            return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        } catch (err) {
            console.log('[MessageBubble] Error parsing date:', dateString, err);
            return '';
        }
    };

    const StatusIcon = ({ status }: { status: string }) => {
        switch (status) {
            case 'pending':
                return (
                    <svg className="w-3 h-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                );
            case 'sent':
                return (
                    <svg className="w-3 h-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                );
            case 'delivered':
                return (
                    <div className="flex -space-x-1">
                        <svg className="w-3 h-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <svg className="w-3 h-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                );
            case 'read':
                return (
                    <div className="flex -space-x-1">
                        <svg className="w-3 h-3 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <svg className="w-3 h-3 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                );
            case 'failed':
                return (
                    <svg className="w-3 h-3 text-red-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                );
            default:
                return null;
        }
    };

    return (
        <div className={`flex w-full mb-2 px-4 ${isOut ? 'justify-end' : 'justify-start'}`}>
            <div
                className={`relative max-w-[75%] min-w-[100px] rounded-lg px-3 py-2 shadow-sm text-sm leading-relaxed
          ${isOut
                        ? 'bg-teal-600 dark:bg-teal-700 text-white rounded-br-none'
                        : 'rounded-bl-none border'
                    }`}
                style={!isOut ? { 
                    backgroundColor: 'hsl(var(--card))',
                    borderColor: 'hsl(var(--border))',
                    color: 'hsl(var(--foreground))'
                } : undefined}
            >
                {/* Media Content */}
                {message.media_url && (
                    <div className="mb-2">
                        {message.media_type === 'image' ? (
                            <img
                                src={message.media_url}
                                alt="Mídia"
                                className="rounded-md w-full max-h-64 object-cover cursor-pointer hover:opacity-95 transition-opacity"
                                onClick={() => window.open(message.media_url, '_blank')}
                            />
                        ) : (
                            <a
                                href={message.media_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`flex items-center gap-2 p-2 rounded bg-opacity-10 ${isOut ? 'bg-white text-white' : 'bg-blue-50 text-blue-600'}`}
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                </svg>
                                <span className="truncate">Anexo ({message.media_type})</span>
                            </a>
                        )}
                    </div>
                )}

                {/* Text Content */}
                <div className="whitespace-pre-wrap break-words">
                    {message.content}
                </div>

                {/* Metadata */}
                <div className={`flex justify-end items-center gap-1 mt-1 text-[10px] ${isOut ? 'text-blue-100' : 'text-gray-400'}`}>
                    <span>{formatTime(message.created_at)}</span>
                    {isOut && <StatusIcon status={message.status} />}
                </div>
            </div>
        </div>
    );
}
