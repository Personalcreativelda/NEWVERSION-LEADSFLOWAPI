// INBOX: Componente de mensagem individual com menu de contexto WhatsApp-style
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { MessageWithSender } from '../../types/inbox';
import { UploadProgressIndicator } from './UploadProgressIndicator';
import { ChevronDown, Forward, Trash2, Reply, Paperclip, ChevronDown as CollapseIcon } from 'lucide-react';
import { toast } from 'sonner';
import DOMPurify from 'dompurify';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.leadsflowapi.com';

interface MessageBubbleProps {
    message: MessageWithSender;
    isFirstInGroup?: boolean;
    isLastInGroup?: boolean;
    isGrouped?: boolean;
    onDelete?: (messageId: string) => void;
    onForward?: (message: MessageWithSender) => void;
    onReply?: (message: MessageWithSender) => void;
}

// ── Context menu ──────────────────────────────────────────────────────────────

interface ContextMenuProps {
    isOut:     boolean;
    onDelete:  () => void;
    onForward: () => void;
    onReply:   () => void;
    onClose:   () => void;
    anchorRef: React.RefObject<HTMLElement>;
}

function MessageContextMenu({ isOut, onDelete, onForward, onReply, onClose, anchorRef }: ContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handle = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
                anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('mousedown', handle);
        document.addEventListener('keydown', handleKey);
        return () => {
            document.removeEventListener('mousedown', handle);
            document.removeEventListener('keydown', handleKey);
        };
    }, [onClose, anchorRef]);

    const items = [
        { icon: <Reply className="w-4 h-4" />,   label: 'Responder',     action: () => { onReply();   onClose(); }, danger: false },
        { icon: <Forward className="w-4 h-4" />, label: 'Reencaminhar',  action: () => { onForward(); onClose(); }, danger: false },
        { icon: <Trash2 className="w-4 h-4" />,  label: 'Eliminar',      action: () => { onDelete();  onClose(); }, danger: true  },
    ];

    return (
        <div
            ref={menuRef}
            className={`absolute z-50 top-6 ${isOut ? 'right-0' : 'left-0'} min-w-[180px] bg-white dark:bg-[#233138] rounded-xl shadow-xl border border-black/8 dark:border-white/8 overflow-hidden py-1`}
        >
            {items.map((item) => (
                <button
                    key={item.label}
                    onClick={item.action}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-[13.5px] font-medium text-left transition-colors
                        ${item.danger
                            ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                            : 'text-[#111b21] dark:text-[#e9edef] hover:bg-[#f0f2f5] dark:hover:bg-[#2a3942]'
                        }`}
                >
                    {item.icon}
                    {item.label}
                </button>
            ))}
        </div>
    );
}

// ── Email HTML body (collapsible, sanitized) ──────────────────────────────────

function EmailHtmlBody({ html }: { html: string }) {
    const [expanded, setExpanded] = useState(false);
    const PREVIEW_HEIGHT = 200;

    return (
        <div className="relative">
            <div
                className={`overflow-hidden transition-all duration-200 ${expanded ? '' : `max-h-[${PREVIEW_HEIGHT}px]`}`}
                style={expanded ? undefined : { maxHeight: PREVIEW_HEIGHT }}
            >
                <div
                    className="email-html-body prose prose-sm max-w-none text-[13px] leading-relaxed"
                    style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                    dangerouslySetInnerHTML={{ __html: html }}
                />
            </div>
            {/* Fade + toggle button */}
            <div className={`flex items-center justify-center mt-1 ${!expanded ? 'relative' : ''}`}>
                {!expanded && (
                    <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white dark:from-[#202c33] to-transparent pointer-events-none" />
                )}
                <button
                    onClick={() => setExpanded(v => !v)}
                    className="relative z-10 flex items-center gap-1 px-3 py-0.5 rounded-full text-[11px] font-medium bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 transition-colors mt-1"
                >
                    <CollapseIcon className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    {expanded ? 'Recolher' : 'Ver mais'}
                </button>
            </div>
        </div>
    );
}

// ── Transcribe button ─────────────────────────────────────────────────────────

function TranscribeButton({ messageId, apiUrl, isOut, onTranscribed }: {
    messageId: string;
    apiUrl: string;
    isOut: boolean;
    onTranscribed: (text: string) => void;
}) {
    const [isLoading, setIsLoading] = useState(false);

    const handleClick = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`${apiUrl}/api/inbox/messages/${messageId}/transcribe`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('leadflow_access_token')}` }
            });
            if (!res.ok) throw new Error('transcribe_failed');
            const data = await res.json();
            onTranscribed(data.text);
        } catch {
            toast.error('Erro ao transcrever áudio.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <button
            onClick={handleClick}
            disabled={isLoading}
            className={`text-xs px-2 py-1 rounded border flex items-center gap-1 transition-colors disabled:opacity-60 ${isOut ? 'border-green-600/30 text-green-800 dark:text-green-200 hover:bg-green-600/10' : 'border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
        >
            {isLoading ? (
                <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
            ) : (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
            )}
            {isLoading ? 'Transcrevendo...' : 'Transcrever Áudio'}
        </button>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MessageBubble({
    message,
    isFirstInGroup = true,
    isLastInGroup = true,
    isGrouped = false,
    onDelete,
    onForward,
    onReply,
}: MessageBubbleProps) {
    const isOut = message.direction === 'out';
    const [imageError, setImageError]       = useState(false);
    const [useProxy, setUseProxy]           = useState(false);
    const [menuOpen, setMenuOpen]           = useState(false);
    const [hovered, setHovered]             = useState(false);
    const [transcription, setTranscription] = useState<string | null>(
        (message.metadata as any)?.transcription ?? null
    );
    const chevronRef = useRef<HTMLButtonElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);

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
        } catch { return ''; }
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
                        {[0, 1].map((i) => (
                            <svg key={i} className="w-3 h-3 text-[rgba(17,27,33,0.35)] dark:text-[rgba(233,237,239,0.45)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        ))}
                    </div>
                );
            case 'read':
                return (
                    <div className="flex -space-x-1">
                        {[0, 1].map((i) => (
                            <svg key={i} className="w-3 h-3 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        ))}
                    </div>
                );
            case 'failed':
                return (
                    <svg className="w-3 h-3 text-red-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                );
            default: return null;
        }
    };

    const isValidMediaUrl = (url: string | undefined): boolean => {
        if (!url) return false;
        return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:');
    };

    const hasValidMedia = isValidMediaUrl(message.media_url);
    const isUploading   = message.uploadProgress !== undefined;
    const displayUrl    = isUploading && message.localPreviewUrl ? message.localPreviewUrl : null;

    const imageUrl = useMemo(() => {
        if (!message.media_url) return '';
        if (useProxy && message.media_url.startsWith('http')) {
            return `${API_URL}/api/inbox/media-proxy?url=${encodeURIComponent(message.media_url)}`;
        }
        return message.media_url;
    }, [message.media_url, useProxy]);

    const handleImageError = () => {
        if (!useProxy && message.media_url?.startsWith('http')) {
            setUseProxy(true);
        } else {
            setImageError(true);
        }
    };

    const isDocumentImage = useMemo(() => {
        if (message.media_type !== 'document' || !message.media_url) return false;
        const url = message.media_url.toLowerCase();
        if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(url)) return true;
        if (url.startsWith('data:image/')) return true;
        const mimetype = (message.metadata as any)?.mimetype || '';
        return typeof mimetype === 'string' && mimetype.startsWith('image/');
    }, [message.media_type, message.media_url, message.metadata]);

    const effectiveMediaType: string = isDocumentImage ? 'image' : (message.media_type ?? '');

    const fileName = useMemo(() => {
        const meta = message.metadata as any;
        return meta?.fileName || meta?.original_name || null;
    }, [message.metadata]);

    const mediaPlaceholders = ['[Mídia]', '[Imagem]', '[Vídeo]', '[Áudio]', '[Documento]', '[Sticker]', '[image]', '[video]', '[audio]', '[document]', '[sticker]'];
    const isMediaPlaceholder = mediaPlaceholders.includes(message.content || '');
    const isAutomated        = (message.metadata as any)?.automated === true || (message.metadata as any)?.source === 'ai_assistant';

    // ── Email-specific metadata ───────────────────────────────────────────────
    const isEmail = message.channel === 'email';
    const emailMeta = isEmail ? (message.metadata as any) : null;
    const emailHtml = emailMeta?.html_body
        ? DOMPurify.sanitize(emailMeta.html_body, { FORCE_BODY: true, ADD_ATTR: ['target'] })
        : null;
    const emailAttachments: { url: string; name: string; contentType: string; mediaType: string }[] =
        emailMeta?.attachment_urls || [];
    const emailSubject: string | null = emailMeta?.subject || null;

    // For email with HTML: don't show raw text (it would be noise)
    const showTextContent = message.content && (!isMediaPlaceholder || !hasValidMedia) && !(isEmail && emailHtml);

    const bubbleRounding = isOut ? 'rounded-lg rounded-br-[4px]' : 'rounded-lg rounded-bl-[4px]';

    // Don't show menu for temp/uploading messages
    const canShowMenu = !message.id.startsWith('temp_') && !isUploading;

    return (
        <div
            ref={wrapperRef}
            className={`flex w-full ${isOut ? 'justify-end' : 'justify-start'} ${isLastInGroup ? 'mb-[6px]' : 'mb-[2px]'}`}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => { setHovered(false); }}
        >
            {/* Bubble */}
            <div
                style={{ maxWidth: isEmail ? '85%' : '65%', minWidth: 80, padding: '6px 10px 8px', fontSize: '14.2px', lineHeight: '1.35' }}
                className={`relative ${bubbleRounding} shadow-sm ${
                    isOut
                        ? 'bg-[#d9fdd3] text-[#111b21] dark:bg-[#005c4b] dark:text-[#e9edef]'
                        : 'bg-white text-[#111b21] dark:bg-[#202c33] dark:text-[#e9edef]'
                }`}
            >
                {/* Hover chevron overlay for outgoing (inside bubble) */}
                {canShowMenu && isOut && (hovered || menuOpen) && (
                    <div className="absolute top-1 right-1 z-10">
                        <div className="relative">
                            <button
                                ref={chevronRef as any}
                                onClick={() => setMenuOpen((v) => !v)}
                                className="w-6 h-6 rounded-full bg-[#d9fdd3] dark:bg-[#005c4b] hover:bg-[#c8f2c2] dark:hover:bg-[#004336] flex items-center justify-center transition-colors"
                            >
                                <ChevronDown className="w-3.5 h-3.5 text-[#667781]" />
                            </button>
                            {menuOpen && isOut && (
                                <MessageContextMenu
                                    isOut={true}
                                    onDelete={() => onDelete?.(message.id)}
                                    onForward={() => onForward?.(message)}
                                    onReply={() => onReply?.(message)}
                                    onClose={() => setMenuOpen(false)}
                                    anchorRef={chevronRef as any}
                                />
                            )}
                        </div>
                    </div>
                )}

                {/* Upload-in-progress preview */}
                {isUploading && (
                    <div className="mb-2">
                        <div className="relative rounded-md overflow-hidden">
                            {displayUrl && message.media_type !== 'audio' && message.media_type !== 'document' ? (
                                message.media_type === 'video' ? (
                                    <video src={displayUrl} className="w-full max-h-64 object-cover" muted preload="metadata" />
                                ) : (
                                    <img src={displayUrl} alt="Enviando..." className="w-full max-h-64 object-cover" />
                                )
                            ) : (
                                <div className="w-full h-32 bg-muted/60 rounded-md flex items-center justify-center">
                                    <svg className="w-8 h-8 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                    </svg>
                                </div>
                            )}
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-md">
                                <UploadProgressIndicator progress={message.uploadProgress ?? 0} size={48} strokeWidth={3.5} />
                            </div>
                        </div>
                    </div>
                )}

                {/* Expired attachment */}
                {(message.metadata as any)?.media_expired && !isUploading && (
                    <div className={`mb-2 flex items-center gap-2 p-3 rounded-xl text-sm opacity-60
                        ${isOut ? 'bg-[#c5f0c0] dark:bg-[#04493e]' : 'bg-gray-100 dark:bg-[#182229]'}`}>
                        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>Este anexo já não está disponível.</span>
                    </div>
                )}

                {/* Media Content */}
                {hasValidMedia && !isUploading && !(message.metadata as any)?.media_expired && (
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
                            <a href={message.media_url} target="_blank" rel="noopener noreferrer"
                                className={`flex items-center gap-2 p-3 rounded-xl cursor-pointer ${isOut ? 'bg-[#c5f0c0] hover:bg-[#b4e4af] dark:bg-[#04493e] dark:hover:bg-[#03392f]' : 'bg-gray-100 hover:bg-gray-200 dark:bg-[#182229] dark:hover:opacity-80'}`}>
                                <svg className="w-5 h-5 opacity-60 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <span className="text-xs opacity-60">Abrir imagem</span>
                            </a>
                        ) : effectiveMediaType === 'audio' ? (
                            <audio controls src={message.media_url} className="w-full max-w-[280px] h-10" preload="metadata">
                                <a href={message.media_url} target="_blank" rel="noopener noreferrer">Ouvir áudio</a>
                            </audio>
                        ) : effectiveMediaType === 'video' ? (
                            <video controls src={message.media_url} className="rounded-md w-full max-h-64" preload="metadata" />
                        ) : (
                            <a href={message.media_url} target="_blank" rel="noopener noreferrer" download={fileName || undefined}
                                className={`flex items-center gap-2 p-2.5 rounded-xl ${isOut ? 'bg-[#c5f0c0] text-[#111b21] dark:bg-[#04493e] dark:text-[#e9edef]' : 'bg-gray-100 text-[#111b21] dark:bg-[#182229] dark:text-[#e9edef]'}`}>
                                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                                <span className="truncate text-sm">{fileName || 'Documento'}</span>
                                <svg className="w-4 h-4 flex-shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                            </a>
                        )}

                        {effectiveMediaType === 'audio' && message.id && (
                            <div className="mt-2">
                                {transcription ? (
                                    <div className={`text-sm italic p-2 rounded-md ${isOut ? 'bg-[rgba(255,255,255,0.4)] dark:bg-[rgba(0,0,0,0.2)]' : 'bg-gray-50 dark:bg-[#182229]'} border-l-2 ${isOut ? 'border-green-600' : 'border-blue-500'}`}>
                                        <span className="text-xs font-semibold not-italic mb-1 flex items-center gap-1 opacity-70">
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" /></svg>
                                            Transcrição IA:
                                        </span>
                                        "{transcription}"
                                    </div>
                                ) : (
                                    <TranscribeButton
                                        messageId={message.id}
                                        apiUrl={API_URL}
                                        isOut={isOut}
                                        onTranscribed={setTranscription}
                                    />
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Email: subject + HTML body + attachments */}
                {isEmail && (
                    <div className="mb-1">
                        {emailSubject && (
                            <div className="font-semibold text-[13px] mb-1.5 pb-1.5 border-b border-black/10 dark:border-white/10 truncate">
                                {emailSubject}
                            </div>
                        )}
                        {emailHtml ? (
                            <EmailHtmlBody html={emailHtml} />
                        ) : (
                            <div className="whitespace-pre-wrap break-words text-sm">{message.content}</div>
                        )}
                        {emailAttachments.length > 0 && (
                            <div className="mt-2 flex flex-col gap-1">
                                {emailAttachments.map((att, idx) => (
                                    <a
                                        key={idx}
                                        href={att.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        download={att.name}
                                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors
                                            ${isOut
                                                ? 'bg-[#c5f0c0] hover:bg-[#b4e4af] dark:bg-[#04493e] dark:hover:bg-[#03392f] text-[#111b21] dark:text-[#e9edef]'
                                                : 'bg-gray-100 hover:bg-gray-200 dark:bg-[#182229] dark:hover:opacity-80 text-[#111b21] dark:text-[#e9edef]'
                                            }`}
                                    >
                                        <Paperclip className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />
                                        <span className="truncate max-w-[200px]">{att.name}</span>
                                        <svg className="w-3.5 h-3.5 flex-shrink-0 opacity-50 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                        </svg>
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Text Content (non-email) */}
                {showTextContent && (
                    <div className="whitespace-pre-wrap break-words">{message.content}</div>
                )}

                {/* Metadata row */}
                <div className="flex justify-end items-center gap-1 mt-1 text-[11px] text-[rgba(17,27,33,0.45)] dark:text-[rgba(233,237,239,0.55)]">
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

            {/* Hover chevron for incoming messages (right side of bubble) */}
            {canShowMenu && !isOut && (
                <div className={`flex items-center self-end mb-1 mx-1 transition-opacity ${(hovered || menuOpen) ? 'opacity-100' : 'opacity-0'}`}>
                    <div className="relative">
                        <button
                            ref={chevronRef as any}
                            onClick={() => setMenuOpen((v) => !v)}
                            className="w-7 h-7 rounded-full bg-white dark:bg-[#233138] shadow flex items-center justify-center hover:bg-[#f0f2f5] dark:hover:bg-[#2a3942] transition-colors"
                        >
                            <ChevronDown className="w-4 h-4 text-[#667781]" />
                        </button>
                        {menuOpen && !isOut && (
                            <MessageContextMenu
                                isOut={false}
                                onDelete={() => onDelete?.(message.id)}
                                onForward={() => onForward?.(message)}
                                onReply={() => onReply?.(message)}
                                onClose={() => setMenuOpen(false)}
                                anchorRef={chevronRef as any}
                            />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
