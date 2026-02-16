// INBOX: Componente de mensagem individual
import React, { useState, useMemo } from 'react';
import type { MessageWithSender } from '../../types/inbox';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.leadsflowapi.com';

interface MessageBubbleProps {
    message: MessageWithSender;
}

export function MessageBubble({ message }: MessageBubbleProps) {
    const isOut = message.direction === 'out';
    const [imageError, setImageError] = useState(false);
    const [useProxy, setUseProxy] = useState(false);

    const formatTime = (dateString: string | number) => {
        if (!dateString && dateString !== 0) return '';
        try {
            let date: Date;
            const strValue = String(dateString);

            if (/^\d{10}$/.test(strValue)) {
                date = new Date(parseInt(strValue) * 1000);
            } else if (/^\d{13}$/.test(strValue)) {
                date = new Date(parseInt(strValue));
            } else if (typeof dateString === 'number') {
                date = dateString > 9999999999 ? new Date(dateString) : new Date(dateString * 1000);
            } else {
                date = new Date(dateString);
            }

            if (isNaN(date.getTime())) return '';
            return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        } catch {
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

    // Verificar se a URL é válida
    const isValidMediaUrl = (url: string | undefined): boolean => {
        if (!url) return false;
        if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return true;
        return false;
    };

    const hasValidMedia = isValidMediaUrl(message.media_url);

    // URL da imagem: tentar original primeiro, depois proxy
    const imageUrl = useMemo(() => {
        if (!message.media_url) return '';
        if (useProxy && message.media_url.startsWith('http')) {
            return `${API_URL}/api/inbox/media-proxy?url=${encodeURIComponent(message.media_url)}`;
        }
        return message.media_url;
    }, [message.media_url, useProxy]);

    // Handler de erro: primeiro tenta via proxy, depois desiste
    const handleImageError = () => {
        if (!useProxy && message.media_url?.startsWith('http')) {
            // Primeira falha: tentar via proxy da API
            console.log('[MessageBubble] Imagem falhou, tentando via proxy:', message.media_url?.substring(0, 80));
            setUseProxy(true);
        } else {
            // Proxy também falhou: mostrar fallback
            setImageError(true);
        }
    };

    // Detectar se um "document" é na verdade uma imagem pelo URL ou metadata
    const isDocumentImage = useMemo(() => {
        if (message.media_type !== 'document' || !message.media_url) return false;
        const url = message.media_url.toLowerCase();
        // Verificar extensão na URL
        if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(url)) return true;
        // Verificar data URI de imagem
        if (url.startsWith('data:image/')) return true;
        // Verificar mimetype nos metadados
        const mimetype = (message.metadata as any)?.mimetype || '';
        if (typeof mimetype === 'string' && mimetype.startsWith('image/')) return true;
        return false;
    }, [message.media_type, message.media_url, message.metadata]);

    // Tipo efetivo de mídia (document que é imagem → tratar como image)
    const effectiveMediaType = isDocumentImage ? 'image' : message.media_type;

    // Extrair nome do arquivo dos metadados
    const fileName = useMemo(() => {
        const meta = message.metadata as any;
        return meta?.fileName || meta?.original_name || null;
    }, [message.metadata]);

    // Placeholders de mídia
    const mediaPlaceholders = ['[Mídia]', '[Imagem]', '[Vídeo]', '[Áudio]', '[Documento]', '[Sticker]', '[image]', '[video]', '[audio]', '[document]', '[sticker]'];
    const isMediaPlaceholder = mediaPlaceholders.includes(message.content || '');
    const showTextContent = message.content && (!isMediaPlaceholder || !hasValidMedia);

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
                {hasValidMedia && (
                    <div className="mb-2">
                        {(effectiveMediaType === 'image' || effectiveMediaType === 'sticker') && !imageError ? (
                            <img
                                src={imageUrl}
                                alt="Mídia"
                                className="rounded-md w-full max-h-64 object-cover cursor-pointer hover:opacity-95 transition-opacity"
                                onClick={() => window.open(imageUrl, '_blank')}
                                onError={handleImageError}
                            />
                        ) : (effectiveMediaType === 'image' || effectiveMediaType === 'sticker') && imageError ? (
                            <a
                                href={message.media_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`flex items-center gap-2 p-3 rounded cursor-pointer ${isOut ? 'bg-teal-700 hover:bg-teal-800' : 'bg-gray-100 dark:bg-gray-700 hover:opacity-80'}`}
                            >
                                <svg className="w-5 h-5 opacity-60 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <span className="text-xs opacity-60">Abrir imagem</span>
                                <svg className="w-4 h-4 opacity-40 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                            </a>
                        ) : effectiveMediaType === 'audio' ? (
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
                        ) : effectiveMediaType === 'video' ? (
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
                                download={fileName || undefined}
                                className={`flex items-center gap-2 p-2 rounded ${isOut ? 'bg-teal-700 text-white' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'}`}
                            >
                                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                                <span className="truncate text-sm">{fileName || 'Documento'}</span>
                                <svg className="w-4 h-4 flex-shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                            </a>
                        )}
                    </div>
                )}

                {/* Text Content */}
                {showTextContent && (
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
