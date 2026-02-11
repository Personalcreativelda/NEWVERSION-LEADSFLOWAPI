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
                        {message.media_type === 'image' || message.media_type === 'sticker' ? (
                            <img
                                src={message.media_url}
                                alt="Mídia"
                                className="rounded-md w-full max-h-64 object-cover cursor-pointer hover:opacity-95 transition-opacity"
                                onClick={() => window.open(message.media_url, '_blank')}
                                onError={(e) => {
                                    // Fallback para imagens que falharam ao carregar
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                    const fallback = document.createElement('div');
                                    fallback.className = `flex items-center gap-2 p-3 rounded ${isOut ? 'bg-teal-700' : 'bg-gray-100 dark:bg-gray-700'}`;
                                    fallback.innerHTML = `<svg class="w-5 h-5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg><span class="text-xs opacity-60">Imagem indisponível</span>`;
                                    target.parentElement?.appendChild(fallback);
                                }}
                            />
                        ) : message.media_type === 'audio' ? (
                            <audio
                                controls
                                src={message.media_url}
                                className="w-full max-w-[280px] h-10"
                                preload="metadata"
                            >
                                <a href={message.media_url} target="_blank" rel="noopener noreferrer">
                                    Ouvir áudio
                                </a>
                            </audio>
                        ) : message.media_type === 'video' ? (
                            <video
                                controls
                                src={message.media_url}
                                className="rounded-md w-full max-h-64"
                                preload="metadata"
                            />
                        ) : (
                            <a
                                href={message.media_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`flex items-center gap-2 p-2 rounded ${isOut ? 'bg-teal-700 text-white' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'}`}
                            >
                                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                                <span className="truncate text-sm">Documento ({message.media_type})</span>
                                <svg className="w-4 h-4 flex-shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                            </a>
                        )}
                    </div>
                )}

                {/* Text Content - não mostrar placeholder de mídia quando tem mídia real */}
                {message.content && message.content !== '[Mídia]' && message.content !== '[Imagem]' && message.content !== '[Vídeo]' && message.content !== '[Áudio]' && message.content !== '[Documento]' && message.content !== '[Sticker]' && (
                    <div className="whitespace-pre-wrap break-words">
                        {message.content}
                    </div>
                )}

                {/* Metadata */}
                <div className={`flex justify-end items-center gap-1 mt-1 text-[10px] ${isOut ? 'text-blue-100' : 'text-gray-400'}`}>
                    <span>{formatTime(message.created_at)}</span>
                    {isOut && <StatusIcon status={message.status} />}
                </div>
            </div>
        </div>
    );
}
