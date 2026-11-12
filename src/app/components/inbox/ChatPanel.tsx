// INBOX: Painel de Chat modernizado
import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { quoteOf } from './quote';
import { AppModal } from '../base/AppModal';
import { Button } from '../ui/button';
import { useConfirm } from '../ui/ConfirmDialog';
import { toast } from 'sonner';
import { apiErrorMessage } from '../../lib/apiError';
import { ChatHeader } from './ChatHeader';
import { ChatBackground } from './ChatBackground';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { useConversationUploadQueue } from '../../context/UploadQueueContext';
import { filesFrom, hasFiles } from './droppedFiles';
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
    onSendMessage?: (content: string, mediaUrl?: string, mediaType?: string, replaceTempId?: string, replyTo?: MessageWithSender | null) => Promise<void>;
    /** Reagir a uma mensagem (WhatsApp) */
    onReactMessage?: (message: MessageWithSender, emoji: string) => void;
    /** Fixar/desafixar a conversa */
    onTogglePin?: () => void;
    /** Editar / apagar para todos as minhas mensagens (WhatsApp por QR) */
    onEditMessage?: (message: MessageWithSender, content: string) => Promise<void>;
    onRevokeMessage?: (message: MessageWithSender) => Promise<void>;
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
    /** Abrir os dados do contacto (toque na foto/nome do cabeçalho) */
    onOpenContact?: () => void;
    /** Avisar que o agente está a escrever (o widget do site mostra-o ao visitante) */
    onTyping?: (typing: boolean) => void;
    /** Telemóvel: o chat entra a deslizar da direita ao abrir */
    slideIn?: boolean;
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
    onOpenContact,
    onTyping,
    slideIn = false,
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
    onReactMessage,
    onTogglePin,
    onEditMessage,
    onRevokeMessage,
}: ChatPanelProps) {
    // Arrastar ficheiros para a conversa: mesma fila de anexos do campo de mensagem
    const { addFiles: addDroppedFiles } = useConversationUploadQueue(conversation.id);
    const [draggingFiles, setDraggingFiles] = useState(false);
    const dragDepth = useRef(0);
    const [forwardTarget, setForwardTarget] = useState<MessageWithSender | null>(null);
    // Mensagem a que se está a responder (barra por cima da caixa de texto)
    const [replyTo, setReplyTo] = useState<MessageWithSender | null>(null);
    const inputAreaRef = useRef<HTMLDivElement>(null);
    const contactName = conversation.contact?.name || conversation.metadata?.contact_name || conversation.contact?.phone || 'Contacto';
    const canReact = conversation.channel?.type === 'whatsapp' || conversation.channel?.type === 'whatsapp_cloud';
    // Editar e apagar para todos: só o WhatsApp por código QR o permite
    const canChangeSent = conversation.channel?.type === 'whatsapp';
    const confirm = useConfirm();
    const [editing, setEditing] = useState<MessageWithSender | null>(null);
    const [editText, setEditText] = useState('');
    const [savingEdit, setSavingEdit] = useState(false);

    const startEdit = useCallback((msg: MessageWithSender) => {
        setEditing(msg);
        setEditText(msg.content || '');
    }, []);

    const saveEdit = async () => {
        if (!editing || !onEditMessage) return;
        const text = editText.trim();
        if (!text) return;
        setSavingEdit(true);
        try {
            await onEditMessage(editing, text);
            setEditing(null);
        } catch (err) {
            toast.error(apiErrorMessage(err, 'Não foi possível editar a mensagem.'));
        } finally {
            setSavingEdit(false);
        }
    };

    const handleRevoke = useCallback(async (msg: MessageWithSender) => {
        if (!onRevokeMessage) return;
        const ok = await confirm('A mensagem é apagada também no WhatsApp do contacto.', {
            title: 'Apagar para todos?',
            confirmLabel: 'Apagar',
            variant: 'danger',
        });
        if (ok) await onRevokeMessage(msg);
    }, [confirm, onRevokeMessage]);
    const internalEndRef = useRef<HTMLDivElement>(null);

    const messages        = externalMessages || [];
    const messagesLoading = externalMessagesLoading ?? false;
    const messagesError   = externalMessagesError ?? null;
    const sending         = externalSending ?? false;
    const messagesEndRef  = externalMessagesEndRef || internalEndRef;

    const handleTyping = (typing: boolean) => { onTyping?.(typing); };

    const rows = useMemo(() => buildRows(messages), [messages]);

    // Só as mensagens que chegam (ou se enviam) com a conversa aberta entram animadas — as que
    // já estavam e as antigas carregadas ao subir aparecem logo
    const seenIdsRef = useRef<{ convId: string; ids: Set<string>; ready: boolean }>({ convId: '', ids: new Set(), ready: false });
    if (seenIdsRef.current.convId !== conversation.id) {
        seenIdsRef.current = { convId: conversation.id, ids: new Set(), ready: false };
    }
    const seen = seenIdsRef.current;
    const newestIds = useMemo(() => new Set(messages.slice(-3).map((m) => m.id)), [messages]);
    // A mensagem confirmada pela API troca o id temporário pelo real: o client_id liga as duas
    const shouldAnimate = (m: MessageWithSender) => {
        const clientId = (m.metadata as any)?.client_id as string | undefined;
        return seen.ready && newestIds.has(m.id) && !seen.ids.has(m.id) && !(clientId && seen.ids.has(clientId));
    };
    useEffect(() => {
        for (const m of messages) seen.ids.add(m.id);
        if (messages.length > 0) seen.ready = true;
    });

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

    // Outra conversa: a resposta em curso não passa para lá
    useEffect(() => { setReplyTo(null); }, [conversation.id]);

    const handleReply = useCallback((msg: MessageWithSender) => {
        setReplyTo(msg);
        // Como no WhatsApp: o cursor vai para a caixa de texto
        setTimeout(() => inputAreaRef.current?.querySelector('textarea')?.focus(), 30);
    }, []);

    const handleSend = useCallback(
        async (content: string, mediaUrl?: string, mediaType?: string, replaceTempId?: string) => {
            const reply = replyTo;
            setReplyTo(null);
            await onSendMessage?.(content, mediaUrl, mediaType, replaceTempId, reply);
        },
        [replyTo, onSendMessage],
    );

    // Toque na citação: vai até à mensagem original e destaca-a
    const jumpToMessage = useCallback((id: string) => {
        const el = scrollEl?.querySelector<HTMLElement>(`[data-msg-id="${id}"]`);
        if (!el) return;
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.animate?.([{ backgroundColor: 'hsl(var(--primary) / 0.18)' }, { backgroundColor: 'transparent' }], { duration: 1400, easing: 'ease-out' });
    }, [scrollEl]);

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
        <div
            className={`flex flex-col h-full max-h-full relative overflow-hidden bg-background ${slideIn ? 'animate-in fade-in slide-in-from-right-8 duration-200' : ''}`}
            onDragEnter={(e) => {
                if (!hasFiles(e.dataTransfer)) return;
                e.preventDefault();
                dragDepth.current += 1;
                setDraggingFiles(true);
            }}
            onDragOver={(e) => {
                if (!hasFiles(e.dataTransfer)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
            }}
            onDragLeave={() => {
                dragDepth.current = Math.max(0, dragDepth.current - 1);
                if (dragDepth.current === 0) setDraggingFiles(false);
            }}
            onDrop={(e) => {
                if (!hasFiles(e.dataTransfer)) return;
                e.preventDefault();
                dragDepth.current = 0;
                setDraggingFiles(false);
                const files = filesFrom(e.dataTransfer);
                if (files.length > 0) addDroppedFiles(files);
            }}
        >
            {/* Largar ficheiros em qualquer ponto da conversa (como no WhatsApp Web) */}
            {draggingFiles && (
                <div className="pointer-events-none absolute inset-2 z-40 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary/50 bg-background/90">
                    <p className="text-sm font-medium text-foreground">Largue para enviar</p>
                </div>
            )}

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
                    onOpenContact={onOpenContact}
                    onTogglePin={onTogglePin}
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
                                animateIn={shouldAnimate(row.message)}
                                onDelete={onDeleteMessage}
                                onForward={setForwardTarget}
                                onReply={handleReply}
                                onReact={canReact ? onReactMessage : undefined}
                                onEdit={canChangeSent && onEditMessage ? startEdit : undefined}
                                onRevoke={canChangeSent && onRevokeMessage ? handleRevoke : undefined}
                                onJumpTo={jumpToMessage}
                                contactName={contactName}
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

            {/* Input Area */}
            <div ref={inputAreaRef} className="flex-shrink-0 px-2 py-2 sm:p-3 border-t transition-colors bg-card border-border">
                {replyTo && (
                    <div className="mb-2 flex items-center gap-2 rounded-lg bg-muted/60 py-1.5 pl-2 pr-1">
                        <div className={`min-w-0 flex-1 border-l-[3px] pl-2 ${replyTo.direction === 'out' ? 'border-primary' : 'border-sky-500'}`}>
                            <div className={`truncate text-xs font-semibold ${replyTo.direction === 'out' ? 'text-primary' : 'text-sky-600 dark:text-sky-400'}`}>
                                {replyTo.direction === 'out' ? 'Você' : <span translate="no">{contactName}</span>}
                            </div>
                            <div translate="no" className="truncate text-[13px] text-muted-foreground">{quoteOf(replyTo).content}</div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setReplyTo(null)}
                            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                            title="Cancelar resposta"
                        >
                            <X size={16} />
                        </button>
                    </div>
                )}
                <MessageInput
                    onSendMessage={handleSend}
                    onSendAudio={onSendAudio}
                    onTyping={handleTyping}
                    isSending={sending}
                    conversationId={conversation.id}
                    onAddLocalMessage={onAddLocalMessage}
                    onUpdateLocalMessageProgress={onUpdateLocalMessageProgress}
                    onFailLocalMessage={onFailLocalMessage}
                />
            </div>

            {/* Editar mensagem enviada */}
            <AppModal
                open={!!editing}
                onOpenChange={(open) => { if (!open && !savingEdit) setEditing(null); }}
                title="Editar mensagem"
                size="sm"
                footer={
                    <>
                        <Button variant="outline" onClick={() => setEditing(null)} disabled={savingEdit}>Cancelar</Button>
                        <Button onClick={() => void saveEdit()} disabled={savingEdit || !editText.trim() || editText.trim() === (editing?.content || '').trim()}>
                            {savingEdit ? 'A guardar…' : 'Guardar'}
                        </Button>
                    </>
                }
            >
                <textarea
                    translate="no"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={4}
                    maxLength={4096}
                    className="w-full resize-none"
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void saveEdit(); } }}
                />
            </AppModal>

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
