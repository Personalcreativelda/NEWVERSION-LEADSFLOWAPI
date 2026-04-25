// INBOX: Componente de mensagem individual
import React, { useState, useMemo } from 'react';
import type { MessageWithSender } from '../../types/inbox';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.leadsflowapi.com';

interface MessageBubbleProps {
    message: MessageWithSender;
    /** First message in a consecutive same-direction group (topmost visually) */
    isFirstInGroup?: boolean;
    /** Last message in a consecutive same-direction group (bottommost visually, closest to input) */
    isLastInGroup?: boolean;
    /** Message is part of a multi-message group */
    isGrouped?: boolean;
}

export function MessageBubble({ message, isFirstInGroup = true, isLastInGroup = true, isGrouped = false }: MessageBubbleProps) {
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
                    <svg className="w-3 h-3 text-[rgba(17,27,33,0.35)] dark:text-[rgba(233,237,239,0.45)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                );
            case 'sent':
                return (
                    <svg className="w-3 h-3 text-[rgba(17,27,33,0.35)] dark:text-[rgba(233,237,239,0.45)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                );
            case 'delivered':
                return (
                    <div className="flex -space-x-1">
                        <svg className="w-3 h-3 text-[rgba(17,27,33,0.35)] dark:text-[rgba(233,237,239,0.45)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <svg className="w-3 h-3 text-[rgba(17,27,33,0.35)] dark:text-[rgba(233,237,239,0.45)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                );
            case 'read':
                return (
                    <div className="flex -space-x-1">
                        <svg className="w-3 h-3 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <svg className="w-3 h-3 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

    // Detectar se é mensagem automática (AI assistant)
    const isAutomated = (message.metadata as any)?.automated === true || (message.metadata as any)?.source === 'ai_assistant';

    // Bubble corner rounding: grouped messages get tighter corners on the grouping side
    const bubbleRounding = isGrouped && !isLastInGroup
        ? isOut ? 'rounded-lg rounded-br-[4px]' : 'rounded-lg rounded-bl-[4px]'
        : isOut ? 'rounded-lg rounded-br-[4px]' : 'rounded-lg rounded-bl-[4px]';

    return (
        <div className={`flex w-full ${isOut ? 'justify-end' : 'justify-start'} ${isLastInGroup ? 'mb-[6px]' : 'mb-[2px]'}`}>
            <div
                style={{
                    maxWidth: '65%',
                    minWidth: 80,
                    padding: '6px 10px 8px',
                    fontSize: '14.2px',
                    lineHeight: '1.35',
                }}
                className={`relative ${bubbleRounding} shadow-sm ${
                    isOut
                        ? 'bg-[#d9fdd3] text-[#111b21] dark:bg-[#005c4b] dark:text-[#e9edef]'
                        : 'bg-white text-[#111b21] dark:bg-[#202c33] dark:text-[#e9edef]'
                }`}
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
                                className={`flex items-center gap-2 p-3 rounded-xl cursor-pointer ${isOut ? 'bg-[#c5f0c0] hover:bg-[#b4e4af] dark:bg-[#04493e] dark:hover:bg-[#03392f]' : 'bg-gray-100 hover:bg-gray-200 dark:bg-[#182229] dark:hover:opacity-80'}`}
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
                                className={`flex items-center gap-2 p-2.5 rounded-xl ${isOut ? 'bg-[#c5f0c0] text-[#111b21] dark:bg-[#04493e] dark:text-[#e9edef]' : 'bg-gray-100 text-[#111b21] dark:bg-[#182229] dark:text-[#e9edef]'}`}
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
                        
                        {/* Audio Transcription */}
                        {effectiveMediaType === 'audio' && message.id && (
                            <div className="mt-2">
                                {(message.metadata as any)?.transcription ? (
                                    <div className={`text-sm italic p-2 rounded-md ${isOut ? 'bg-[rgba(255,255,255,0.4)] dark:bg-[rgba(0,0,0,0.2)]' : 'bg-gray-50 dark:bg-[#182229]'} border-l-2 ${isOut ? 'border-green-600' : 'border-blue-500'}`}>
                                        <span className="text-xs font-semibold not-italic mb-1 flex items-center gap-1 opacity-70">
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" /></svg>
                                            Transcrição IA:
                                        </span>
                                        "{(message.metadata as any).transcription}"
                                    </div>
                                ) : (
                                    <button 
                                        onClick={async (e) => {
                                            const btn = e.currentTarget;
                                            btn.disabled = true;
                                            const originalText = btn.innerHTML;
                                            btn.innerHTML = '<span class="flex items-center gap-1"><svg class="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Transcrevendo...</span>';
                                            try {
                                                const res = await fetch(`${API_URL}/api/inbox/messages/${message.id}/transcribe`, {
                                                    method: 'POST',
                                                    headers: { 'Authorization': `Bearer ${localStorage.getItem('leadflow_access_token')}` }
                                                });
                                                if (res.ok) {
                                                    const data = await res.json();
                                                    if (!message.metadata) message.metadata = {};
                                                    (message.metadata as any).transcription = data.text;
                                                    // Trigger re-render by dispatching event or relying on polling
                                                    window.dispatchEvent(new CustomEvent('inbox-refresh-requested'));
                                                } else {
                                                    throw new Error();
                                                }
                                            } catch (err) {
                                                alert('Erro ao transcrever áudio.');
                                                btn.disabled = false;
                                                btn.innerHTML = originalText;
                                            }
                                        }}
                                        className={`text-xs px-2 py-1 rounded border flex items-center gap-1 transition-colors ${isOut ? 'border-green-600/30 text-green-800 dark:text-green-200 hover:bg-green-600/10' : 'border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                                    >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                        </svg>
                                        Transcrever Áudio
                                    </button>
                                )}
                            </div>
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
                <div className={`flex justify-end items-center gap-1 mt-1 text-[11px] text-[rgba(17,27,33,0.45)] dark:text-[rgba(233,237,239,0.55)]`}>
                    {isAutomated && (
                        <span className="flex items-center gap-0.5 opacity-70">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
                            </svg>
                            <span>IA</span>
                        </span>
                    )}
                    <span>{formatTime(message.created_at)}</span>
                    {isOut && <StatusIcon status={message.status} />}
                </div>
            </div>
        </div>
    );
}
