// INBOX: Input de mensagem modernizado com suporte a upload de arquivos, áudio e stickers
import React, { useState, useRef, useEffect } from 'react';
import {
    Send,
    Paperclip,
    Smile,
    Image as ImageIcon,
    Loader2,
    Mic,
    Square,
    Trash2,
    Sparkles,
    AlertCircle,
    Plus
} from 'lucide-react';
import { toast } from 'sonner';
import { inboxApi } from '../../services/api/inbox';
import { apiErrorMessage } from '../../lib/apiError';
import { useConversationUploadQueue } from '../../context/UploadQueueContext';
import { AttachmentPreviewCard } from './AttachmentPreviewCard';
import type { MessageWithSender } from '../../types/inbox';

interface MessageInputProps {
    onSendMessage: (content: string, mediaUrl?: string, mediaType?: string, replaceTempId?: string) => Promise<void>;
    onTyping: (isTyping: boolean) => void;
    onSendAudio?: (audioBlob: Blob) => Promise<void>;
    conversationId: string;
    disabled?: boolean;
    isSending?: boolean;
    onAddLocalMessage?: (message: MessageWithSender) => void;
    onUpdateLocalMessageProgress?: (tempId: string, progress: number) => void;
    onFailLocalMessage?: (tempId: string) => void;
}

export function MessageInput({ onSendMessage, onTyping, onSendAudio, conversationId, disabled, isSending, onAddLocalMessage, onUpdateLocalMessageProgress, onFailLocalMessage }: MessageInputProps) {
    const [content, setContent] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const [uploadWarning] = useState(false);
    const [isSendingAudio, setIsSendingAudio] = useState(false);

    // Tracks attachment IDs that have been "sent" as in-chat bubbles (detached from composer)
    const detachedIdsRef = useRef<Set<string>>(new Set());
    // Maps attachment ID → { tempId (bubble ID), caption }
    const pendingSendsRef = useRef<Map<string, { tempId: string; caption: string }>>(new Map());

    const {
        attachments,
        addFiles,
        removeAttachment,
        retryUpload,
    } = useConversationUploadQueue(conversationId);
    const [recordingTime, setRecordingTime] = useState(0);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [pickerTab, setPickerTab] = useState<'emoji' | 'stickers'>('emoji');
    const [stickers, setStickers] = useState<string[] | null>(null);
    const [sendingSticker, setSendingSticker] = useState(false);
    const stickerInputRef = useRef<HTMLInputElement>(null);
    const [isGeneratingReply, setIsGeneratingReply] = useState(false);
    
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3200';
    
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const recordingCancelledRef = useRef(false);
    const emojiPickerRef = useRef<HTMLDivElement>(null);

    // ── Watch attachment progress → update in-chat bubbles (WhatsApp style) ──
    useEffect(() => {
        for (const att of attachments) {
            const pending = pendingSendsRef.current.get(att.id);
            if (!pending) continue;

            if (att.status === 'uploading' && att.uploadProgress !== undefined) {
                onUpdateLocalMessageProgress?.(pending.tempId, att.uploadProgress);
            } else if (att.status === 'uploaded' && att.uploadedUrl) {
                // Upload done → fire the real API call and clean up
                const { tempId, caption } = pending;
                pendingSendsRef.current.delete(att.id);
                detachedIdsRef.current.delete(att.id);
                removeAttachment(att.id);
                onSendMessage(caption, att.uploadedUrl, att.uploadedMediaType ?? undefined, tempId).catch(() => {
                    onFailLocalMessage?.(tempId);
                });
            } else if (att.status === 'failed' || att.status === 'canceled') {
                const { tempId } = pending;
                pendingSendsRef.current.delete(att.id);
                detachedIdsRef.current.delete(att.id);
                removeAttachment(att.id);
                onFailLocalMessage?.(tempId);
            }
        }
    }, [attachments]); // eslint-disable-line react-hooks/exhaustive-deps

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
        }
    }, [content]);

    // Click outside handler for emoji picker
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
                setShowEmojiPicker(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        };
    }, []);

    // Cresce com o texto até 5 linhas, como no WhatsApp (também com emoji ou resposta da IA)
    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }, [content]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setContent(e.target.value);

        // Typing indicator logic
        onTyping(true);
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }
        typingTimeoutRef.current = setTimeout(() => {
            onTyping(false);
        }, 2000);
    };

    // ==================== AUDIO RECORDING ====================
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Preferir OGG Opus (suportado pelo WhatsApp Cloud API), fallback para WebM
            let mimeType = 'audio/webm';
            if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
                mimeType = 'audio/ogg;codecs=opus';
            } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
                mimeType = 'audio/ogg';
            } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                mimeType = 'audio/webm;codecs=opus';
            }

            const mediaRecorder = new MediaRecorder(stream, { mimeType });
            
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                stream.getTracks().forEach(track => track.stop());
                if (recordingCancelledRef.current) return;
                const actualMime = mediaRecorder.mimeType || mimeType;
                const blob = new Blob(audioChunksRef.current, { type: actualMime });
                setAudioBlob(blob);
            };

            recordingCancelledRef.current = false;
            mediaRecorder.start(100);
            setIsRecording(true);
            setRecordingTime(0);

            recordingIntervalRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);

        } catch (error) {
            console.error('Failed to start recording:', error);
            toast.error('Não foi possível acessar o microfone. Verifique as permissões.');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            if (recordingIntervalRef.current) {
                clearInterval(recordingIntervalRef.current);
                recordingIntervalRef.current = null;
            }
        }
    };

    const cancelRecording = () => {
        recordingCancelledRef.current = true;
        if (mediaRecorderRef.current && (isRecording || mediaRecorderRef.current.state !== 'inactive')) {
            mediaRecorderRef.current.stop();
        }
        setIsRecording(false);
        setAudioBlob(null);
        setRecordingTime(0);
        audioChunksRef.current = [];
        if (recordingIntervalRef.current) {
            clearInterval(recordingIntervalRef.current);
            recordingIntervalRef.current = null;
        }
    };

    const sendAudioMessage = async () => {
        if (!audioBlob) return;
        
        // Se não temos onSendAudio nem conversationId, não podemos enviar
        if (!onSendAudio && !conversationId) {
            console.error('Cannot send audio: no handler or conversation ID');
            return;
        }
        
        setIsSendingAudio(true);
        try {
            if (onSendAudio) {
                await onSendAudio(audioBlob);
            } else if (conversationId) {
                await inboxApi.sendAudio(conversationId, audioBlob);
            }
            setAudioBlob(null);
            setRecordingTime(0);
        } catch (error) {
            console.error('Failed to send audio:', error);
            toast.error(apiErrorMessage(error, 'Erro ao enviar áudio. Tente novamente.'));
        } finally {
            setIsSendingAudio(false);
        }
    };

    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // ==================== EMOJIS ====================
    const popularEmojis = ['😊', '😂', '❤️', '👍', '🔥', '😍', '🎉', '👋', '🙏', '💪', '✨', '😎', '🤔', '👀', '💯', '🚀'];
    
    const insertEmoji = (emoji: string) => {
        setContent(prev => prev + emoji);
        setShowEmojiPicker(false);
        textareaRef.current?.focus();
    };

    // ==================== FIGURINHAS ====================
    // As recebidas nas conversas ficam à mão para reenviar; "+" transforma uma imagem em figurinha
    useEffect(() => {
        if (!showEmojiPicker || pickerTab !== 'stickers' || stickers !== null) return;
        inboxApi.getRecentStickers().then(setStickers).catch(() => setStickers([]));
    }, [showEmojiPicker, pickerTab, stickers]);

    const sendSticker = async (url: string) => {
        if (!conversationId || sendingSticker) return;
        setSendingSticker(true);
        try {
            const message = await inboxApi.sendSticker(conversationId, url);
            if (message) onAddLocalMessage?.(message as unknown as MessageWithSender);
            setShowEmojiPicker(false);
        } catch (error) {
            toast.error(apiErrorMessage(error, 'Não foi possível enviar a figurinha. Tente de novo.'));
        } finally {
            setSendingSticker(false);
        }
    };

    const handleStickerFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setSendingSticker(true);
        try {
            const uploaded = await inboxApi.uploadFile(file);
            setSendingSticker(false);
            setStickers(prev => [uploaded.url, ...(prev || []).filter(u => u !== uploaded.url)]);
            await sendSticker(uploaded.url);
        } catch (error) {
            setSendingSticker(false);
            toast.error(apiErrorMessage(error, 'Não foi possível carregar a imagem. Tente de novo.'));
        }
    };

    const handleDraftReply = async () => {
        if (!conversationId || disabled || isSending) return;
        setIsGeneratingReply(true);
        try {
            const res = await fetch(`${API_URL}/api/inbox/conversations/${conversationId}/draft-reply`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('leadflow_access_token')}` }
            });
            if (res.ok) {
                const data = await res.json();
                setContent(data.suggested_reply);
                
                // Dispatch event to update sentiment in ContactDetailsPanel if needed
                if (data.sentiment) {
                    window.dispatchEvent(new CustomEvent('ai-sentiment-updated', { detail: { conversationId, sentiment: data.sentiment } }));
                }
            } else {
                toast.error('Erro ao gerar resposta com IA.');
            }
        } catch (err) {
            toast.error('Erro ao comunicar com o servidor.');
        } finally {
            setIsGeneratingReply(false);
        }
    };

    // Handle file selection — feeds files straight into the upload queue
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            addFiles(files);
        }
        // Reset input so the same file can be selected again
        e.target.value = '';
    };

    // Send message (text + any uploaded/uploading attachments)
    const handleSendWithFile = async () => {
        const hasText = content.trim();
        const hasAttachments = attachments.length > 0;
        if (!hasText && !hasAttachments) return;
        if (disabled || isSending) return;

        const caption = content.trim();

        // Separate already-uploaded vs still-uploading attachments
        const uploadedNow = attachments.filter((a) => a.status === 'uploaded' && !detachedIdsRef.current.has(a.id));
        const uploadingNow = attachments.filter((a) => (a.status === 'uploading' || a.status === 'pending') && !detachedIdsRef.current.has(a.id));

        // ── Detach uploading attachments → inject in-chat bubbles ──
        if (uploadingNow.length > 0 && onAddLocalMessage) {
            // Only first one gets the caption; rest are silent
            uploadingNow.forEach((att, i) => {
                const tempId = `temp_upload_${att.id}_${Date.now()}`;
                const bubbleCaption = i === 0 ? caption : '';
                pendingSendsRef.current.set(att.id, { tempId, caption: bubbleCaption });
                detachedIdsRef.current.add(att.id);

                // Determine preview src and media type
                const localPreviewUrl = att.previewUrl ?? undefined;
                const mediaType = att.fileType === 'image' ? 'image'
                    : att.fileType === 'video' ? 'video'
                    : att.fileType === 'audio' ? 'audio'
                    : 'document';

                onAddLocalMessage({
                    id: tempId,
                    user_id: '',
                    conversation_id: conversationId,
                    lead_id: null,
                    contact_id: null,
                    campaign_id: null,
                    direction: 'out',
                    channel: 'whatsapp',
                    content: bubbleCaption || '',
                    status: 'pending',
                    sent_at: new Date().toISOString(),
                    media_url: undefined,
                    media_type: mediaType as 'audio' | 'video' | 'image' | 'document',
                    metadata: {},
                    created_at: new Date().toISOString(),
                    localPreviewUrl,
                    uploadProgress: att.uploadProgress ?? 0,
                });
            });

            // Clear text input; the cards will disappear from composer via filter below
            setContent('');
            if (textareaRef.current) textareaRef.current.style.height = 'auto';
        }

        // ── Send already-uploaded attachments immediately ──
        if (uploadedNow.length > 0) {
            const captionForUploaded = uploadingNow.length === 0 ? caption : '';
            setContent('');
            if (textareaRef.current) textareaRef.current.style.height = 'auto';
            // Remove uploaded ones from queue
            uploadedNow.forEach((a) => removeAttachment(a.id));

            try {
                if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                onTyping(false);
                await onSendMessage(
                    captionForUploaded,
                    uploadedNow[0].uploadedUrl,
                    uploadedNow[0].uploadedMediaType ?? undefined,
                );
                for (let i = 1; i < uploadedNow.length; i++) {
                    await onSendMessage('', uploadedNow[i].uploadedUrl, uploadedNow[i].uploadedMediaType ?? undefined);
                }
            } catch (error) {
                if (captionForUploaded) setContent(captionForUploaded);
                console.error('Failed to send', error);
            }
            return;
        }

        // ── Text-only send (no attachments ready) ──
        if (!hasAttachments || uploadingNow.length > 0) {
            // If we only had uploading attachments (already detached above) and no text beyond that, done
            if (!hasText || uploadingNow.length > 0) return;

            const messageToSend = caption;
            setContent('');
            if (textareaRef.current) textareaRef.current.style.height = 'auto';
            try {
                if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                onTyping(false);
                await onSendMessage(messageToSend);
            } catch (error) {
                setContent(messageToSend);
                console.error('Failed to send', error);
            }
        }
    };

    const canSend = content.trim() || attachments.some(a => !detachedIdsRef.current.has(a.id));
    const composerAttachments = attachments.filter(a => !detachedIdsRef.current.has(a.id));
    const isBusy = isSending || isSendingAudio;
    const showRecordingMode = isRecording || !!audioBlob;

    return (
        <div className="transition-colors bg-card">
            {/* Hidden file inputs */}
            <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,image/*,video/*,audio/*"
                onChange={handleFileSelect}
                multiple
            />
            <input
                ref={imageInputRef}
                type="file"
                className="hidden"
                accept="image/*"
                onChange={handleFileSelect}
                multiple
            />
            <input
                ref={stickerInputRef}
                type="file"
                className="hidden"
                accept="image/*"
                onChange={handleStickerFile}
            />

            {/* Recording Mode UI */}
            {showRecordingMode && (
                <div 
                    className={`mx-2 mb-2 p-3 rounded-xl border flex items-center gap-3 ${isRecording ? 'bg-destructive/10 border-destructive/30' : 'bg-muted border-border'}`}
                >
                    {isRecording ? (
                        <>
                            {/* Recording indicator */}
                            <div className="flex items-center gap-2 flex-1">
                                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                                <span className="text-sm font-medium text-foreground">
                                    A gravar...
                                </span>
                                <span className="text-sm font-mono text-muted-foreground">
                                    {formatTime(recordingTime)}
                                </span>
                            </div>
                            {/* Cancel button */}
                            <button
                                onClick={cancelRecording}
                                className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-full transition-colors"
                                title="Cancelar"
                            >
                                <Trash2 size={18} />
                            </button>
                            {/* Stop button */}
                            <button
                                onClick={stopRecording}
                                className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors"
                                title="Parar gravação"
                            >
                                <Square size={16} fill="white" />
                            </button>
                        </>
                    ) : audioBlob && (
                        <>
                            {/* Audio preview */}
                            <div className="flex items-center gap-2 flex-1">
                                <Mic size={20} className="text-blue-500" />
                                <span className="text-sm font-medium text-foreground">
                                    Áudio gravado
                                </span>
                                <span className="text-sm font-mono text-muted-foreground">
                                    {formatTime(recordingTime)}
                                </span>
                            </div>
                            {/* Delete button */}
                            <button
                                onClick={cancelRecording}
                                className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-full transition-colors"
                                title="Descartar"
                            >
                                <Trash2 size={18} />
                            </button>
                            {/* Send button */}
                            <button
                                onClick={sendAudioMessage}
                                disabled={isBusy}
                                className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full transition-colors flex items-center justify-center"
                                title="Enviar áudio"
                            >
                                {isBusy ? (
                                    <Loader2 size={18} className="animate-spin" />
                                ) : (
                                    <Send size={18} />
                                )}
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* ── Attachment queue (WhatsApp-style cards) ── */}
            {composerAttachments.length > 0 && (
                <div className="mx-2 mb-2 space-y-1.5">
                    {/* Upload warning */}
                    {uploadWarning && (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-medium">
                            <AlertCircle size={13} />
                            Escreva uma legenda ou aguarde o upload para enviar o ficheiro.
                        </div>
                    )}

                    {/* Scrollable horizontal card list */}
                    <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                        {composerAttachments.map((att) => (
                            <AttachmentPreviewCard
                                key={att.id}
                                attachment={att}
                                onRemove={removeAttachment}
                                onRetry={retryUpload}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Linha de escrita ao estilo WhatsApp: uma pílula fina com emoji, texto e
                anexos lá dentro, e um botão redondo que alterna entre microfone e enviar */}
            <div className="flex items-end gap-1.5 sm:gap-2">
                <div className="flex-1 min-w-0 min-h-[44px] rounded-[22px] border border-border bg-muted focus-within:border-primary/40 transition-colors duration-150 flex items-end px-1 relative">
                    {/* Emoji */}
                    <div className="relative flex-shrink-0" ref={emojiPickerRef}>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowEmojiPicker(!showEmojiPicker);
                            }}
                            disabled={disabled || showRecordingMode}
                            className="h-[42px] w-9 flex items-center justify-center text-muted-foreground hover:text-yellow-500 rounded-full transition-colors disabled:opacity-50"
                            title="Emoji"
                            type="button"
                        >
                            <Smile size={21} />
                        </button>

                        {/* Emoji Picker Dropdown */}
                        {showEmojiPicker && (
                            <div
                                className="absolute bottom-full left-0 mb-2 p-3 rounded-xl border border-border shadow-xl bg-card z-[100] w-[280px] max-w-[calc(100vw-24px)]"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="mb-2 flex gap-1">
                                    {([['emoji', 'Emoji'], ['stickers', 'Figurinhas']] as const).map(([id, label]) => (
                                        <button
                                            key={id}
                                            type="button"
                                            onClick={() => setPickerTab(id)}
                                            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${pickerTab === id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                                {pickerTab === 'emoji' ? (
                                    <div className="grid grid-cols-8 gap-1">
                                        {popularEmojis.map((emoji, index) => (
                                            <button
                                                key={index}
                                                onClick={() => insertEmoji(emoji)}
                                                type="button"
                                                className="p-1.5 hover:bg-muted/50 rounded-lg text-xl transition-colors flex items-center justify-center"
                                            >
                                                {emoji}
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="grid max-h-64 grid-cols-4 gap-1.5 overflow-y-auto">
                                        <button
                                            type="button"
                                            onClick={() => stickerInputRef.current?.click()}
                                            disabled={sendingSticker}
                                            className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-foreground/25 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                                            title="Criar figurinha"
                                        >
                                            {sendingSticker ? <Loader2 size={18} className="animate-spin" /> : <Plus size={20} />}
                                        </button>
                                        {stickers === null && (
                                            <div className="col-span-3 flex items-center justify-center text-muted-foreground">
                                                <Loader2 size={16} className="animate-spin" />
                                            </div>
                                        )}
                                        {stickers?.map((url) => (
                                            <button
                                                key={url}
                                                type="button"
                                                onClick={() => void sendSticker(url)}
                                                disabled={sendingSticker}
                                                className="aspect-square rounded-lg p-1 transition-colors hover:bg-muted/50 disabled:opacity-50"
                                            >
                                                <img src={url} alt="" loading="lazy" className="h-full w-full object-contain" />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <textarea
                        ref={textareaRef}
                        value={content}
                        onChange={handleChange}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSendWithFile();
                            }
                        }}
                        disabled={disabled || isSending || showRecordingMode}
                        placeholder={attachments.length > 0 ? "Legenda (opcional)" : showRecordingMode ? "A gravar áudio..." : "Mensagem"}
                        rows={1}
                        className="flex-1 min-w-0 bg-transparent border-none focus:ring-0 text-[15px] sm:text-sm leading-5 text-foreground placeholder:text-muted-foreground resize-none max-h-[120px] py-[11px] px-1 scrollbar-none outline-none overflow-y-auto"
                    />

                    {/* IA e anexos dentro da pílula */}
                    <div className="flex-shrink-0 flex items-center">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDraftReply();
                            }}
                            disabled={disabled || showRecordingMode || isGeneratingReply}
                            className={`h-[42px] w-9 flex items-center justify-center rounded-full transition-colors disabled:opacity-50 text-purple-500 ${isGeneratingReply ? 'animate-pulse' : 'hover:text-purple-600'}`}
                            title="Gerar resposta com IA"
                            type="button"
                        >
                            <Sparkles size={19} />
                        </button>
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={disabled || isSending || showRecordingMode}
                            className="h-[42px] w-9 flex items-center justify-center rounded-full transition-colors disabled:opacity-50 text-muted-foreground hover:text-foreground"
                            title="Anexar ficheiro"
                        >
                            <Paperclip size={19} />
                        </button>
                        {!content.trim() && (
                            <button
                                type="button"
                                onClick={() => imageInputRef.current?.click()}
                                disabled={disabled || isSending || showRecordingMode}
                                className="h-[42px] w-9 flex items-center justify-center rounded-full transition-colors disabled:opacity-50 text-muted-foreground hover:text-foreground"
                                title="Enviar imagem"
                            >
                                <ImageIcon size={19} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Enviar / gravar áudio */}
                {canSend && !showRecordingMode ? (
                    <button
                        onClick={handleSendWithFile}
                        disabled={disabled || isSending}
                        className="h-11 w-11 flex-shrink-0 rounded-full bg-primary text-primary-foreground shadow-sm transition-all active:scale-90 hover:brightness-110 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Enviar"
                    >
                        {isSending ? (
                            <Loader2 size={20} className="animate-spin" />
                        ) : (
                            <Send size={19} className="ml-0.5" />
                        )}
                    </button>
                ) : !showRecordingMode && (
                    <button
                        onClick={startRecording}
                        disabled={disabled}
                        className="h-11 w-11 flex-shrink-0 rounded-full bg-primary text-primary-foreground shadow-sm transition-all active:scale-90 hover:brightness-110 flex items-center justify-center disabled:opacity-50"
                        title="Gravar áudio"
                    >
                        <Mic size={20} />
                    </button>
                )}
            </div>
        </div>
    );
}
