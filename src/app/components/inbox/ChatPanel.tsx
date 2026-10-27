// INBOX: Painel de Chat modernizado
import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { ChatHeader } from './ChatHeader';
import { ChatBackground } from './ChatBackground';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { ForwardMessageModal } from './ForwardMessageModal';
import type { ConversationWithDetails, MessageWithSender } from '../../types/inbox';
import { SkeletonMessageBubble } from '../ui/skeletons';
import { getLocale } from '../../utils/format';

type Row =
    | { kind: 'day'; key: string; label: string }
    | { kind: 'msg'; message: MessageWithSender; isFirstInGroup: boolean; isLastInGroup: boolean; isGrouped: boolean };

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Separador de dia como no WhatsApp: Hoje, Ontem, dia da semana (última semana) ou a data */
function dayLabel(d: Date): string {
    const diff = Math.round((dayStart(new Date()) - dayStart(d)) / 864e5);
    if (diff === 0) return 'Hoje';
    if (diff === 1) return 'Ontem';
    const text = diff > 1 && diff < 7
        ? d.toLocaleDateString(getLocale(), { weekday: 'long' })
        : d.toLocaleDateString(getLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
    return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Linhas do chat (mensagens + separadores de dia), da mais recente para a mais antiga (flex-col-reverse) */
function buildRows(messages: MessageWithSender[]): Row[] {
    const rows: Row[] = [];
    const days = messages.map((m) => {
        const d = new Date(m.created_at);
        return isNaN(d.getTime()) ? null : dayStart(d);
    });
    messages.forEach((message, i) => {
        const day = days[i];
        const newDay = day != null && (i === 0 || days[i - 1] !== day);
        if (newDay) rows.push({ kind: 'day', key: 'day_' + day, label: dayLabel(new Date(day)) });
        const prev = messages[i - 1];
        const next = messages[i + 1];
        const nextNewDay = next != null && days[i + 1] != null && days[i + 1] !== day;
        const isFirstInGroup = newDay || !prev || prev.direction !== message.direction;
        const isLastInGroup = nextNewDay || !next || next.direction !== message.direction;
        rows.push({ kind: 'msg', message, isFirstInGroup, isLastInGroup, isGrouped: !isFirstInGroup || !isLastInGroup });
    });
    return rows.reverse();
}

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
    /** Mensagens anteriores (ao chegar ao topo do chat) */
    onLoadOlder?: () => void;
    hasMore?: boolean;
    loadingOlder?: boolean;
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
    onLoadOlder,
    hasMore = false,
    loadingOlder = false,
}: ChatPanelProps) {
    const [isTyping, setIsTyping] = useState(false);
    const [forwardTarget, setForwardTarget] = useState<MessageWithSender | null>(null);
    const internalEndRef = useRef<HTMLDivElement>(null);

    const messages        = externalMessages || [];
    const messagesLoading = externalMessagesLoading ?? false;
    const messagesError   = externalMessagesError ?? null;
    const sending         = externalSending ?? false;
    const messagesEndRef  = externalMessagesEndRef || internalEndRef;

    const handleTyping = (typing: boolean) => { setIsTyping(typing); };

    const rows = useMemo(() => buildRows(messages), [messages]);

    // Contentor do scroll: guardado aqui (carregar antigas, botão para o fim) e no ref do pai
    const [scrollEl, setScrollElState] = useState<HTMLDivElement | null>(null);
    const setScrollEl = useCallback((el: HTMLDivElement | null) => {
        setScrollElState(el);
        if (scrollContainerRef) (scrollContainerRef as React.MutableRefObject<HTMLElement | null>).current = el;
    }, [scrollContainerRef]);

    // Ao aproximar-se do topo, carregar as mensagens anteriores (antes de lá chegar)
    const topSentinelRef = useRef<HTMLDivElement>(null);
    const loadOlderRef = useRef(onLoadOlder);
    loadOlderRef.current = onLoadOlder;
    useEffect(() => {
        const target = topSentinelRef.current;
        if (!scrollEl || !target || !hasMore) return;
        const observer = new IntersectionObserver(
            (entries) => { if (entries[0]?.isIntersecting) loadOlderRef.current?.(); },
            { root: scrollEl, rootMargin: '600px 0px 0px 0px' },
        );
        observer.observe(target);
        return () => observer.disconnect();
    }, [scrollEl, hasMore, conversation.id, messages.length > 0]);

    // Botão para voltar à última mensagem quando se sobe no chat (no column-reverse o fundo é scrollTop 0)
    const [awayFromBottom, setAwayFromBottom] = useState(false);
    useEffect(() => {
        if (!scrollEl) return;
        const onScroll = () => setAwayFromBottom(Math.abs(scrollEl.scrollTop) > 400);
        onScroll();
        scrollEl.addEventListener('scroll', onScroll, { passive: true });
        return () => scrollEl.removeEventListener('scroll', onScroll);
    }, [scrollEl]);
    // Cada conversa abre na última mensagem
    useEffect(() => {
        setAwayFromBottom(false);
        if (scrollEl) scrollEl.scrollTop = 0;
    }, [conversation.id, scrollEl]);

    const handleReply = useCallback((_msg: MessageWithSender) => {
        // Future: integrate reply quote into MessageInput
    }, []);

    const handleSearchInChat = useCallback((_query: string) => {
        // TODO: implement in-chat message search highlight
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
            {/* O próprio contentor do scroll é column-reverse: abre na última mensagem e fica lá
                quando chegam novas, sem saltos (como no WhatsApp) */}
            <ChatBackground scrollRef={setScrollEl} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col-reverse">
                <div className="px-4 sm:px-6 py-4 flex flex-col-reverse">
                    <div ref={messagesEndRef} />

                    {rows.map((row) =>
                        row.kind === 'day' ? (
                            <div key={row.key} className="flex justify-center my-3">
                                <span className="px-3 py-1 rounded-lg text-xs font-medium bg-card/90 text-muted-foreground shadow-sm">
                                    {row.label}
                                </span>
                            </div>
                        ) : (
                            <MessageBubble
                                key={row.message.id}
                                message={row.message}
                                isFirstInGroup={row.isFirstInGroup}
                                isLastInGroup={row.isLastInGroup}
                                isGrouped={row.isGrouped}
                                onDelete={onDeleteMessage}
                                onForward={setForwardTarget}
                                onReply={handleReply}
                            />
                        ),
                    )}

                    {/* Topo: ao chegar aqui carregam-se as mensagens anteriores */}
                    {messages.length > 0 && hasMore && (
                        <div ref={topSentinelRef} className="flex justify-center py-3 min-h-8">
                            {loadingOlder && (
                                <span className="w-5 h-5 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
                            )}
                        </div>
                    )}

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

            {awayFromBottom && (
                <button
                    type="button"
                    onClick={() => scrollEl?.scrollTo({ top: 0, behavior: 'smooth' })}
                    className="absolute right-4 bottom-24 z-10 w-10 h-10 rounded-full bg-card border border-border shadow-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                    title="Ir para a última mensagem"
                >
                    <ChevronDown size={20} />
                </button>
            )}

            {/* Typing Indicator */}
            {isTyping && (
                <div className="px-4 py-2 text-xs italic text-muted-foreground">
                    A escrever...
                </div>
            )}

            {/* Input Area */}
            <div className="flex-shrink-0 px-2 py-2 sm:p-3 border-t transition-colors bg-card border-border">
                <MessageInput
                    onSendMessage={onSendMessage || (async () => {})}
                    onSendAudio={onSendAudio}
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
