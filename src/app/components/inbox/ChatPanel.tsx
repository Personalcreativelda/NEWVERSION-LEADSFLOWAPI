// INBOX: Painel de Chat modernizado
import React, { useState, useCallback } from 'react';
import { ChatHeader } from './ChatHeader';
import { ChatBackground } from './ChatBackground';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { useMessages } from '../../hooks/useMessages';
import type { ConversationWithDetails } from '../../types/inbox';
import { Loader2 } from 'lucide-react';

interface ChatPanelProps {
    conversation: ConversationWithDetails;
    onBack?: () => void;
    onEditLead?: () => void;
}

export function ChatPanel({ conversation, onBack, onEditLead }: ChatPanelProps) {
    const [isTyping, setIsTyping] = useState(false);
    const [searchHighlight, setSearchHighlight] = useState<string>('');
    
    // Use useMessages directly with the conversation ID
    const {
        messages,
        loading: messagesLoading,
        error: messagesError,
        sending,
        messagesEndRef,
        sendMessage,
        sendAudio,
    } = useMessages(conversation?.id || null);
    
    const handleTyping = (typing: boolean) => {
        setIsTyping(typing);
        // Could send typing status via WebSocket here
    };

    const handleSearchInChat = useCallback((query: string) => {
        setSearchHighlight(query);
        // TODO: Implement scroll to first match and highlight
    }, []);

    return (
        <div 
            className="flex flex-col h-full max-h-full relative overflow-hidden"
            style={{ backgroundColor: 'hsl(var(--background))', height: '100%', maxHeight: '100%' }}
        >

            {/* Header - Fixed */}
            <div className="flex-shrink-0">
                <ChatHeader 
                    conversation={conversation} 
                    onBack={onBack} 
                    onEditLead={onEditLead}
                    onSearchInChat={handleSearchInChat}
                />
            </div>

            {/* Messages List - Scrollable with WhatsApp-like background */}
            <ChatBackground className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                <div className="px-4 py-6 space-y-1 flex flex-col-reverse min-h-full">
                    <div ref={messagesEndRef} />

                    {[...messages].reverse().map((message) => (
                        <MessageBubble key={message.id} message={message} />
                    ))}

                    {messagesLoading && (
                        <div className="flex items-center justify-center py-10">
                            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                        </div>
                    )}

                    {!messagesLoading && messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-20 opacity-60">
                            <div 
                                className="w-20 h-20 rounded-full flex items-center justify-center mb-4"
                                style={{ backgroundColor: 'hsl(var(--muted))' }}
                            >
                                <svg 
                                    className="w-10 h-10" 
                                    style={{ color: 'hsl(var(--muted-foreground))' }}
                                    fill="none" 
                                    stroke="currentColor" 
                                    viewBox="0 0 24 24"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                            </div>
                            <p className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>Nenhuma mensagem ainda</p>
                            <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Envie a primeira mensagem para iniciar a conversa</p>
                        </div>
                    )}

                    {messagesError && (
                        <div className="px-4 py-2 mx-auto mt-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs rounded-full border border-red-100 dark:border-red-800">
                            Erro ao carregar mensagens. Tente novamente.
                        </div>
                    )}
                </div>
            </ChatBackground>

            {/* Typing Indicator */}
            {isTyping && (
                <div className="px-4 py-2 text-xs italic" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    Digitando...
                </div>
            )}

            {/* Input Area - Fixed */}
            <div 
                className="flex-shrink-0 p-3 border-t transition-colors"
                style={{ 
                    backgroundColor: 'hsl(var(--card))',
                    borderColor: 'hsl(var(--border))'
                }}
            >
                <MessageInput
                    onSendMessage={sendMessage}
                    onSendAudio={sendAudio}
                    disabled={messagesLoading || !!messagesError}
                    onTyping={handleTyping}
                    isSending={sending}
                    conversationId={conversation?.id}
                />
            </div>
        </div>
    );
}
