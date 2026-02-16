// INBOX: Input de mensagem modernizado com suporte a upload de arquivos, áudio e stickers
import React, { useState, useRef, useEffect } from 'react';
import {
    Send,
    Paperclip,
    Smile,
    Image as ImageIcon,
    Loader2,
    Mic,
    X,
    File,
    Video,
    Music,
    Square,
    Trash2
} from 'lucide-react';
import { inboxApi, UploadResponse } from '../../services/api/inbox';

interface MessageInputProps {
    onSendMessage: (content: string, mediaUrl?: string, mediaType?: string) => Promise<void>;
    onTyping: (isTyping: boolean) => void;
    onSendAudio?: (audioBlob: Blob) => Promise<void>;
    conversationId?: string;
    disabled?: boolean;
    isSending?: boolean;
}

interface SelectedFile {
    file: File;
    preview: string | null;
    type: 'image' | 'video' | 'audio' | 'document';
}

export function MessageInput({ onSendMessage, onTyping, onSendAudio, conversationId, disabled, isSending }: MessageInputProps) {
    const [content, setContent] = useState('');
    const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    
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
        
        setIsUploading(true);
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
            setIsUploading(false);
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

    // Handle file selection
    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, isImageOnly: boolean = false) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Determine file type
        let type: SelectedFile['type'] = 'document';
        if (file.type.startsWith('image/')) {
            type = 'image';
        } else if (file.type.startsWith('video/')) {
            type = 'video';
        } else if (file.type.startsWith('audio/')) {
            type = 'audio';
        }

        // Create preview for images and videos
        let preview: string | null = null;
        if (type === 'image' || type === 'video') {
            preview = URL.createObjectURL(file);
        }

        setSelectedFile({ file, preview, type });

        // Clear the input
        e.target.value = '';
    };

    // Clear selected file
    const clearSelectedFile = () => {
        if (selectedFile?.preview) {
            URL.revokeObjectURL(selectedFile.preview);
        }
        setSelectedFile(null);
    };

    // Upload file and send message
    const handleSendWithFile = async () => {
        if (!selectedFile && !content.trim()) return;
        if (disabled || isSending || isUploading) return;

        // Só enviar texto se o usuário digitou algo (legenda opcional)
        const messageToSend = content.trim();
        const fileToUpload = selectedFile;

        setContent('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';

        try {
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            onTyping(false);

            let mediaUrl: string | undefined;
            let mediaType: string | undefined;

            // Upload file if present
            if (fileToUpload) {
                setIsUploading(true);
                try {
                    const uploadResult = await inboxApi.uploadFile(fileToUpload.file);
                    mediaUrl = uploadResult.url;
                    mediaType = uploadResult.media_type;
                    console.log('[MessageInput] File uploaded:', uploadResult);
                } catch (uploadError) {
                    console.error('[MessageInput] Upload failed:', uploadError);
                    throw new Error('Falha ao fazer upload do arquivo');
                } finally {
                    setIsUploading(false);
                }
            }

            // Clear file selection
            clearSelectedFile();

            // Send message with media
            await onSendMessage(messageToSend, mediaUrl, mediaType);
        } catch (error) {
            // Restore content only if there was content
            if (messageToSend) {
                setContent(messageToSend);
            }
            console.error('Failed to send', error);
        }
    };

    // Get file icon based on type
    const getFileIcon = (type: SelectedFile['type']) => {
        switch (type) {
            case 'image': return <ImageIcon size={24} />;
            case 'video': return <Video size={24} />;
            case 'audio': return <Music size={24} />;
            default: return <File size={24} />;
        }
    };

    // Format file size
    const formatFileSize = (bytes: number): string => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const canSend = content.trim() || selectedFile;
    const isBusy = isSending || isUploading;
    const showRecordingMode = isRecording || audioBlob;

    return (
        <div className="transition-colors" style={{ backgroundColor: 'hsl(var(--card))' }}>
            {/* Hidden file inputs */}
            <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,image/*,video/*,audio/*"
                onChange={(e) => handleFileSelect(e, false)}
            />
            <input
                ref={imageInputRef}
                type="file"
                className="hidden"
                accept="image/*"
                onChange={(e) => handleFileSelect(e, true)}
            />

            {/* Recording Mode UI */}
            {showRecordingMode && (
                <div 
                    className="mx-2 mb-2 p-3 rounded-xl border flex items-center gap-3"
                    style={{ 
                        backgroundColor: isRecording ? 'hsl(var(--destructive)/0.1)' : 'hsl(var(--muted))',
                        borderColor: isRecording ? 'hsl(var(--destructive)/0.3)' : 'hsl(var(--border))'
                    }}
                >
                    {isRecording ? (
                        <>
                            {/* Recording indicator */}
                            <div className="flex items-center gap-2 flex-1">
                                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                                <span className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>
                                    Gravando...
                                </span>
                                <span className="text-sm font-mono" style={{ color: 'hsl(var(--muted-foreground))' }}>
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
                                <span className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>
                                    Áudio gravado
                                </span>
                                <span className="text-sm font-mono" style={{ color: 'hsl(var(--muted-foreground))' }}>
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

            {/* File preview */}
            {selectedFile && (
                <div 
                    className="mx-2 mb-2 p-3 rounded-xl border flex items-center gap-3"
                    style={{ 
                        backgroundColor: 'hsl(var(--muted))',
                        borderColor: 'hsl(var(--border))'
                    }}
                >
                    {/* Preview or icon */}
                    <div className="flex-shrink-0">
                        {selectedFile.preview && selectedFile.type === 'image' ? (
                            <img 
                                src={selectedFile.preview} 
                                alt="Preview" 
                                className="w-16 h-16 object-cover rounded-lg"
                            />
                        ) : selectedFile.preview && selectedFile.type === 'video' ? (
                            <video 
                                src={selectedFile.preview} 
                                className="w-16 h-16 object-cover rounded-lg"
                            />
                        ) : (
                            <div 
                                className="w-16 h-16 flex items-center justify-center rounded-lg"
                                style={{ backgroundColor: 'hsl(var(--primary)/0.1)' }}
                            >
                                {getFileIcon(selectedFile.type)}
                            </div>
                        )}
                    </div>

                    {/* File info */}
                    <div className="flex-1 min-w-0">
                        <p 
                            className="font-medium text-sm truncate"
                            style={{ color: 'hsl(var(--foreground))' }}
                        >
                            {selectedFile.file.name}
                        </p>
                        <p 
                            className="text-xs"
                            style={{ color: 'hsl(var(--muted-foreground))' }}
                        >
                            {formatFileSize(selectedFile.file.size)} • {selectedFile.type.toUpperCase()}
                        </p>
                    </div>

                    {/* Remove button */}
                    <button
                        onClick={clearSelectedFile}
                        disabled={isBusy}
                        className="p-1.5 rounded-full hover:bg-red-100 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>
            )}

            {/* Input row */}
            <div className="flex items-end gap-2">
                {/* Action Buttons */}
                <div className="flex items-center gap-1 mb-1">
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={disabled || isBusy || showRecordingMode}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all disabled:opacity-50"
                        title="Anexar arquivo"
                    >
                        <Paperclip size={20} />
                    </button>
                    <button
                        onClick={() => imageInputRef.current?.click()}
                        disabled={disabled || isBusy || showRecordingMode}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all disabled:opacity-50"
                        title="Enviar imagem"
                    >
                        <ImageIcon size={20} />
                    </button>
                </div>

                {/* Input Container */}
                <div 
                    className="flex-1 min-w-0 rounded-2xl border focus-within:border-blue-500/50 focus-within:ring-4 focus-within:ring-blue-500/5 transition-all flex items-center px-4 py-1.5 relative"
                    style={{ 
                        backgroundColor: 'hsl(var(--muted))',
                        borderColor: 'hsl(var(--border))'
                    }}
                >
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
                        disabled={disabled || isBusy || showRecordingMode}
                        placeholder={selectedFile ? "Adicione uma legenda (opcional)..." : showRecordingMode ? "Gravando áudio..." : "Escreva sua mensagem..."}
                        rows={1}
                        className="w-full bg-transparent border-none focus:ring-0 text-sm resize-none max-h-[120px] py-1.5 scrollbar-none outline-none overflow-y-auto"
                        style={{ color: 'hsl(var(--foreground))' }}
                    />
                    
                    {/* Emoji Button with Picker */}
                    <div className="relative flex-shrink-0" ref={emojiPickerRef}>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowEmojiPicker(!showEmojiPicker);
                            }}
                            disabled={disabled || showRecordingMode}
                            className="p-1.5 text-gray-400 hover:text-yellow-500 rounded-full transition-colors disabled:opacity-50"
                            type="button"
                        >
                            <Smile size={20} />
                        </button>
                        
                        {/* Emoji Picker Dropdown */}
                        {showEmojiPicker && (
                            <div 
                                className="absolute bottom-full right-0 mb-2 p-3 rounded-xl border shadow-xl z-[100] w-[280px]"
                                style={{ 
                                    backgroundColor: 'hsl(var(--card))',
                                    borderColor: 'hsl(var(--border))'
                                }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="grid grid-cols-8 gap-1">
                                    {popularEmojis.map((emoji, index) => (
                                        <button
                                            key={index}
                                            onClick={() => insertEmoji(emoji)}
                                            type="button"
                                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-xl transition-colors flex items-center justify-center"
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
                            disabled={disabled || isBusy}
                            className={`p-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 transition-all active:scale-95 flex items-center justify-center
                                ${(disabled || isBusy) ? 'opacity-50 cursor-not-allowed' : ''}
                            `}
                        >
                            {isBusy ? (
                                <Loader2 size={20} className="animate-spin" />
                            ) : (
                                <Send size={20} className="ml-0.5" />
                            )}
                        </button>
                    ) : !showRecordingMode && (
                        <button
                            onClick={startRecording}
                            disabled={disabled}
                            className="p-2.5 rounded-xl transition-all active:scale-95 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                            style={{ 
                                backgroundColor: 'hsl(var(--muted))',
                                color: 'hsl(var(--muted-foreground))'
                            }}
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
