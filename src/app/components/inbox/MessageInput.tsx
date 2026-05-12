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
    AlertCircle
} from 'lucide-react';
import { inboxApi } from '../../services/api/inbox';
import { useUploadQueue } from '../../hooks/useUploadQueue';
import { AttachmentPreviewCard } from './AttachmentPreviewCard';

interface MessageInputProps {
    onSendMessage: (content: string, mediaUrl?: string, mediaType?: string) => Promise<void>;
    onTyping: (isTyping: boolean) => void;
    onSendAudio?: (audioBlob: Blob) => Promise<void>;
    conversationId?: string;
    disabled?: boolean;
    isSending?: boolean;
}

export function MessageInput({ onSendMessage, onTyping, onSendAudio, conversationId, disabled, isSending }: MessageInputProps) {
    const [content, setContent] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const [uploadWarning, setUploadWarning] = useState(false);
    const [isSendingAudio, setIsSendingAudio] = useState(false);

    const {
        attachments,
        addFiles,
        removeAttachment,
        retryUpload,
        clearAttachments,
        allUploadsCompleted,
        isUploading,
    } = useUploadQueue();
    const [recordingTime, setRecordingTime] = useState(0);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [isGeneratingReply, setIsGeneratingReply] = useState(false);
    
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3200';
    
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const emojiPickerRef = useRef<HTMLDivElement>(null);

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
                const actualMime = mediaRecorder.mimeType || mimeType;
                const blob = new Blob(audioChunksRef.current, { type: actualMime });
                setAudioBlob(blob);
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start(100);
            setIsRecording(true);
            setRecordingTime(0);

            recordingIntervalRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);

        } catch (error) {
            console.error('Failed to start recording:', error);
            alert('Não foi possível acessar o microfone. Verifique as permissões.');
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
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
        }
        setIsRecording(false);
        setAudioBlob(null);
        setRecordingTime(0);
        if (recordingIntervalRef.current) {
            clearInterval(recordingIntervalRef.current);
            recordingIntervalRef.current = null;
        }
        // Stop tracks
        if (mediaRecorderRef.current?.stream) {
            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
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
            alert('Erro ao enviar áudio. Tente novamente.');
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

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleSend = async () => {
        if (!content.trim() || disabled || isSending) return;

        const messageToSend = content;
        setContent('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';

        try {
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            onTyping(false);
            await onSendMessage(messageToSend);
        } catch (error) {
            setContent(messageToSend); // Restore if failed
            console.error('Failed to send', error);
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
                alert('Erro ao gerar resposta com IA.');
            }
        } catch (err) {
            alert('Erro ao comunicar com o servidor.');
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

    // Send message (text + any uploaded attachments)
    const handleSendWithFile = async () => {
        const hasText = content.trim();
        const hasAttachments = attachments.length > 0;
        if (!hasText && !hasAttachments) return;
        if (disabled || isSending) return;

        // Guard: don't send while files are still uploading (failed/canceled do not block)
        if (isUploading) {
            setUploadWarning(true);
            setTimeout(() => setUploadWarning(false), 3000);
            return;
        }

        const messageToSend = content.trim();
        const uploadedAttachments = attachments.filter((a) => a.status === 'uploaded');

        setContent('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
        clearAttachments();

        try {
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            onTyping(false);

            if (uploadedAttachments.length === 0) {
                // Text-only message
                await onSendMessage(messageToSend);
            } else {
                // First attachment carries the caption text
                await onSendMessage(
                    messageToSend,
                    uploadedAttachments[0].uploadedUrl,
                    uploadedAttachments[0].uploadedMediaType,
                );
                // Remaining attachments sent without caption
                for (let i = 1; i < uploadedAttachments.length; i++) {
                    await onSendMessage(
                        '',
                        uploadedAttachments[i].uploadedUrl,
                        uploadedAttachments[i].uploadedMediaType,
                    );
                }
            }
        } catch (error) {
            if (messageToSend) setContent(messageToSend);
            console.error('Failed to send', error);
        }
    };

    const canSend = content.trim() || attachments.length > 0;
    const isBusy = isSending || isSendingAudio || (isUploading && attachments.length > 0);
    const showRecordingMode = isRecording || audioBlob;

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
                                    Gravando...
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
            {attachments.length > 0 && (
                <div className="mx-2 mb-2 space-y-1.5">
                    {/* Upload warning */}
                    {uploadWarning && (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-medium">
                            <AlertCircle size={13} />
                            Aguarde o upload terminar antes de enviar.
                        </div>
                    )}

                    {/* Scrollable horizontal card list */}
                    <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                        {attachments.map((att) => (
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

            {/* Input row */}
            <div className="flex items-end gap-2">
                {/* Action Buttons */}
                <div className="flex items-center gap-1 mb-1">
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={disabled || isSending || showRecordingMode}
                        className="p-2 rounded-lg transition-all duration-150 disabled:opacity-50 hover:bg-muted text-muted-foreground"
                        title="Anexar arquivo"
                    >
                        <Paperclip size={18} />
                    </button>
                    <button
                        onClick={() => imageInputRef.current?.click()}
                        disabled={disabled || isSending || showRecordingMode}
                        className="p-2 rounded-lg transition-all duration-150 disabled:opacity-50 hover:bg-muted text-muted-foreground"
                        title="Enviar imagem"
                    >
                        <ImageIcon size={18} />
                    </button>
                </div>

                {/* Input Container */}
                <div className="flex-1 min-w-0 rounded-2xl border border-border bg-muted focus-within:border-primary/40 focus-within:ring-4 focus-within:ring-primary/5 transition-all duration-150 flex items-center px-4 py-1.5 relative">
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
                        placeholder={attachments.length > 0 ? "Adicione uma legenda (opcional)..." : showRecordingMode ? "Gravando áudio..." : "Escreva sua mensagem..."}
                        rows={1}
                        className="w-full bg-transparent border-none focus:ring-0 text-sm text-foreground resize-none max-h-[120px] py-1.5 scrollbar-none outline-none overflow-y-auto"
                    />
                    
                    {/* Emoji and AI Buttons */}
                    <div className="relative flex-shrink-0 flex items-center gap-1" ref={emojiPickerRef}>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDraftReply();
                            }}
                            disabled={disabled || showRecordingMode || isGeneratingReply}
                            className={`p-1.5 rounded-full transition-colors disabled:opacity-50 ${isGeneratingReply ? 'text-purple-500 animate-pulse' : 'text-purple-500 hover:bg-purple-100 dark:hover:bg-purple-900/20'}`}
                            title="Gerar resposta com IA"
                            type="button"
                        >
                            <Sparkles size={20} />
                        </button>
                        
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowEmojiPicker(!showEmojiPicker);
                            }}
                            disabled={disabled || showRecordingMode}
                            className="p-1.5 text-muted-foreground/70 hover:text-yellow-500 rounded-full transition-colors disabled:opacity-50"
                            type="button"
                        >
                            <Smile size={20} />
                        </button>
                        
                        {/* Emoji Picker Dropdown */}
                        {showEmojiPicker && (
                            <div 
                                className="absolute bottom-full right-0 mb-2 p-3 rounded-xl border border-border shadow-xl bg-card z-[100] w-[280px]"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="grid grid-cols-8 gap-1">
                                    {popularEmojis.map((emoji, index) => (
                                        <button
                                            key={index}
                                            onClick={() => insertEmoji(emoji)}
                                            type="button"
                                            className="p-2 hover:bg-muted/50 rounded-lg text-xl transition-colors flex items-center justify-center"
                                        >
                                            {emoji}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Send/Voice Button */}
                <div className="mb-1">
                    {canSend && !showRecordingMode ? (
                        <button
                            onClick={handleSendWithFile}
                            disabled={disabled || isSending}
                            title={isUploading ? 'Aguarde o upload terminar' : undefined}
                            className={`p-2.5 rounded-xl text-white transition-all active:scale-95 flex items-center justify-center
                                ${(disabled || isSending) ? 'opacity-50 cursor-not-allowed bg-blue-400' : isUploading ? 'bg-blue-400 cursor-wait' : 'bg-blue-600 hover:bg-blue-700'}
                            `}
                        >
                            {isSending ? (
                                <Loader2 size={20} className="animate-spin" />
                            ) : isUploading ? (
                                <Loader2 size={20} className="animate-spin opacity-70" />
                            ) : (
                                <Send size={20} className="ml-0.5" />
                            )}
                        </button>
                    ) : !showRecordingMode && (
                        <button
                            onClick={startRecording}
                            disabled={disabled}
                            className="p-2.5 rounded-xl transition-all duration-150 active:scale-95 hover:bg-blue-50 dark:hover:bg-blue-900/20 bg-muted text-muted-foreground"
                            title="Gravar áudio"
                        >
                            <Mic size={20} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
