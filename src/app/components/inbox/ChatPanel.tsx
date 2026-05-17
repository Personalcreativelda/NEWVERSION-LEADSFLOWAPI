// INBOX: Painel de Chat modernizado
import React, { useState, useCallback, useRef } from 'react';
import { ChatHeader } from './ChatHeader';
import { ChatBackground } from './ChatBackground';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { ForwardMessageModal } from './ForwardMessageModal';
import type { ConversationWithDetails, MessageWithSender } from '../../types/inbox';
import { SkeletonMessageBubble } from '../ui/skeletons';

interface ChatPanelProps {
    conversation: ConversationWithDetails;
    onBack?: () => void;
    onEditLead?: () => void;
    onDeleteConversation?: () => void;
    onResolve?: () => void;
    onStatusChange?: (status: 'open' | 'pending' | 'resolved') => void;
    // Props de mensagens do parent (useInbox com WebSocket)
    messages?: MessageWithSender[];
    messagesLoading?: boolean;
    messagesError?: string | null;
    sending?: boolean;
    messagesEndRef?: React.RefObject<HTMLDivElement>;
    onSendMessage?: (content: string, mediaUrl?: string, mediaType?: string, replaceTempId?: string) => Promise<void>;
    onSendAudio?: (audioBlob: Blob) => Promise<void>;
    onAddLocalMessage?: (message: MessageWithSender) => void;
    onUpdateLocalMessageProgress?: (tempId: string, progress: number) => void;
    onFailLocalMessage?: (tempId: string) => void;
    onDeleteMessage?: (messageId: string) => void;
    onForwardMessage?: (message: MessageWithSender, targetIds: string[]) => Promise<void>;
    /** List of all conversations — needed for the forward modal */
    conversations?: ConversationWithDetails[];
    /** Optional layout control buttons rendered inside the chat header */
    layoutControls?: React.ReactNode;
    /** Ref to attach to the scroll container for position save/restore */
    scrollContainerRef?: React.RefObject<HTMLElement | null>;
}

export function ChatPanel({
    conversation,
    onBack,
    onEditLead,
    onDeleteConversation,
    onResolve,
    onStatusChange,
    messages: externalMessages,
    messagesLoading: externalMessagesLoading,
    messagesError: externalMessagesError,
    sending: externalSending,
    messagesEndRef: externalMessagesEndRef,
    onSendMessage,
    layoutControls,
    onSendAudio,
    scrollContainerRef,
    onAddLocalMessage,
    onUpdateLocalMessageProgress,
    onFailLocalMessage,
    onDeleteMessage,
    onForwardMessage,
    conversations = [],
}: ChatPanelProps) {
    const [isTyping, setIsTyping] = useState(false);
    const [searchHighlight, setSearchHighlight] = useState<string>('');
    const [forwardTarget, setForwardTarget] = useState<MessageWithSender | null>(null);
    const internalEndRef = useRef<HTMLDivElement>(null);

    const messages        = externalMessages || [];
    const messagesLoading = externalMessagesLoading ?? false;
    const messagesError   = externalMessagesError ?? null;
    const sending         = externalSending ?? false;
    const messagesEndRef  = externalMessagesEndRef || internalEndRef;

    const handleTyping = (typing: boolean) => { setIsTyping(typing); };

    const handleSearchInChat = useCallback((query: string) => {
        setSearchHighlight(query);
    }, []);

    const handleForwardDone = useCallback(
        async (targetIds: string[]) => {
            if (forwardTarget && onForwardMessage) {
                await onForwardMessage(forwardTarget, targetIds);
            }
        },
        [forwardTarget, onForwardMessage],
    );

    return (
        <div className="flex flex-col h-full max-h-full relative overflow-hidden bg-background">

            {/* Header */}
            <div className="flex-shrink-0">
                <ChatHeader
                    conversation={conversation}
                    onBack={onBack}
                    onEditLead={onEditLead}
                    onDeleteConversation={onDeleteConversation}
                    onSearchInChat={handleSearchInChat}
                    onResolve={onResolve}
                    onStatusChange={onStatusChange}
                    layoutControls={layoutControls}
                />
            </div>

            {/* Messages List */}
            <ChatBackground scrollRef={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                <div className="px-4 sm:px-6 py-4 flex flex-col-reverse min-h-full">
                    <div ref={messagesEndRef} />

                    {(() => {
                        const reversed = [...messages].reverse();
                        return reversed.map((message, i) => {
                            const prevMsg       = reversed[i + 1];
                            const nextMsg       = reversed[i - 1];
                            const isFirstInGroup = !prevMsg || prevMsg.direction !== message.direction;
                            const isLastInGroup  = !nextMsg || nextMsg.direction !== message.direction;
                            const isGrouped      = !isFirstInGroup || !isLastInGroup;
                            return (
                                <MessageBubble
                                    key={message.id}
                                    message={message}
                                    isFirstInGroup={isFirstInGroup}
                                    isLastInGroup={isLastInGroup}
                                    isGrouped={isGrouped}
                                    onDelete={onDeleteMessage}
                                    onForward={setForwardTarget}
                                    onReply={(msg) => {
                                        // Future: integrate reply quote into MessageInput
                                        console.log('[ChatPanel] Reply to:', msg.id);
                                    }}
                                />
                            );
                        });
                    })()}

                    {messagesLoading && messages.length === 0 && (
                        <div className="flex flex-col py-4">
                            <SkeletonMessageBubble isOut={false} width="lg" />
                            <SkeletonMessageBubble isOut={true} width="md" />
                            <SkeletonMessageBubble isOut={false} width="sm" />
                            <SkeletonMessageBubble isOut={true} width="lg" />
                            <SkeletonMessageBubble isOut={false} width="md" />
                        </div>
                    )}

                    {!messagesLoading && messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-20 opacity-60">
                            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
                                <svg className="w-10 h-10 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                            </div>
                            <p className="text-sm font-semibold text-foreground">Nenhuma mensagem ainda</p>
                            <p className="text-xs mt-1 text-muted-foreground">Envie a primeira mensagem para iniciar a conversa</p>
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
                <div className="px-4 py-2 text-xs italic text-muted-foreground">
                    Digitando...
                </div>
            )}

            {/* Input Area */}
            <div className="flex-shrink-0 p-3 border-t transition-colors bg-[#f0f2f5] border-[rgba(17,27,33,0.08)] dark:bg-[#202c33] dark:border-[rgba(233,237,239,0.08)]">
                <MessageInput
                    onSendMessage={onSendMessage || (async () => {})}
                    onSendAudio={onSendAudio}
                    disabled={messagesLoading || !!messagesError}
                    onTyping={handleTyping}
                    isSending={sending}
                    conversationId={conversation.id}
                    onAddLocalMessage={onAddLocalMessage}
                    onUpdateLocalMessageProgress={onUpdateLocalMessageProgress}
                    onFailLocalMessage={onFailLocalMessage}
                />
            </div>

            {/* Forward Modal */}
            {forwardTarget && (
                <ForwardMessageModal
                    message={forwardTarget}
                    conversations={conversations}
                    currentConversationId={conversation.id}
                    onForward={handleForwardDone}
                    onClose={() => setForwardTarget(null)}
                />
            )}
        </div>
    );
}
