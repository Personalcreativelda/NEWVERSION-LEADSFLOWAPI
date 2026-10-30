import { matchesSearch } from '../../../utils/search';
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useConfirm } from '../../ui/ConfirmDialog';
import { ConversationList } from '../../inbox/ConversationList';
import { useInbox } from '../../../hooks/useInbox';
import { useInboxFilters } from '../../../hooks/useInboxFilters';
import { useInboxLayout } from '../../../hooks/useInboxLayout';
import { conversationsApi, contactsApi, groupsApi, teamApi, channelsApi } from '../../../services/api/inbox';
import { WifiOff, PanelLeftOpen, PanelRightOpen, MessageSquarePlus } from 'lucide-react';
import { useServerStatus } from '../../../lib/serverStatus';
import { useOnlineStatus } from '../../../hooks/useOnlineStatus';
import { ConversationListHeader, type QuickFilter } from '../../inbox/ConversationListHeader';
import { ChatPanel } from '../../inbox/ChatPanel';
import { EmptyState } from '../../inbox/EmptyState';
import { ContactDetailsPanel } from '../../inbox/ContactDetailsPanel';
import { NewConversationModal } from '../../inbox/NewConversationModal';
import { ResizeHandle } from '../../inbox/ResizeHandle';
import { PageFab } from '../../base/PageHeader';
import type { TeamMember } from '../../../types/inbox';

interface ConversasConversationsProps {
    onNavigate?: (page: string) => void;
    conversationIdToOpen?: string | null;
    onConversationOpened?: () => void;
}

export default function ConversasConversations({ 
    onNavigate,
    conversationIdToOpen,
    onConversationOpened
}: ConversasConversationsProps) {
    const {
        conversations,
        selectedConversation,
        selectConversation,
        conversationsLoading,
        conversationsRefreshing,
        unreadCount,
        search,
        refreshConversations,
        messages,
        messagesLoading,
        messagesError,
        sending,
        messagesEndRef,
        scrollContainerRef,
        sendMessage,
        sendAudio,
        addLocalMessage,
        updateLocalMessageProgress,
        failLocalMessage,
        deleteMessage,
        forwardMessage,
        wsConnected,
        loadOlderMessages,
        hasMoreMessages,
        loadingOlderMessages,
    } = useInbox();

    const confirm = useConfirm();
    const { filters, setFilters, setChannelFilter } = useInboxFilters();
    // Filtros que vêm de fora da lista (menções, não atendidas, etiqueta): um chip que se tira
    const externalFilter = filters.type === 'mentions' ? 'Menções'
        : filters.type === 'unattended' ? 'Não atendidas'
        : filters.tag ? 'Etiqueta' : null;
    const {
        layout,
        startResizeConversationList,
        startResizeDetailsPanel,
        toggleConversationList,
        toggleDetailsPanel,
    } = useInboxLayout();

    const [searchQuery, setSearchQuery] = useState('');
    const [showNewConversationModal, setShowNewConversationModal] = useState(false);
    const [, setIsCreatingConversation] = useState(false);
    const [isEditingLead, setIsEditingLead] = useState(false);
    const [isSelectMode, setIsSelectMode] = useState(false);
    const [selectedConvIds, setSelectedConvIds] = useState<Set<string>>(new Set());

    // Team members for assignee dropdown/filters
    const [, setTeamMembers] = useState<TeamMember[]>([]);
    useEffect(() => {
        teamApi.getMembers().then(setTeamMembers).catch(() => {});
    }, []);

    // Channels for channel filter
    const [channels, setChannels] = useState<any[]>([]);
    useEffect(() => {
        channelsApi.getAll().then(list => setChannels(list.filter((c: any) => c.status !== 'deleted'))).catch(() => {});
    }, []);

    // Current user id (for 'mine' filter)
    const currentUserId = useMemo(() => {
        try { return JSON.parse(atob((localStorage.getItem('leadflow_access_token') || '').split('.')[1] || 'e30=')).sub || ''; }
        catch { return ''; }
    }, []);

    const [isSyncingGroups, setIsSyncingGroups] = useState(false);

    const syncGroupsFromEvolution = useCallback(async () => {
        if (isSyncingGroups) return;
        setIsSyncingGroups(true);
        try {
            const result = await groupsApi.sync();
            await refreshConversations();
            console.log('[Inbox] Grupos sincronizados:', result.total_synced);
        } catch (error) {
            console.error('[Inbox] Erro ao sincronizar grupos:', error);
        } finally {
            setIsSyncingGroups(false);
        }
    }, [isSyncingGroups, refreshConversations]);

    const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');

    // Detect mobile breakpoint
    const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
    useEffect(() => {
        const handle = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handle, { passive: true });
        return () => window.removeEventListener('resize', handle);
    }, []);

    // Detect medium breakpoint (tablet)
    const [isTablet, setIsTablet] = useState(() => window.innerWidth < 1280);
    useEffect(() => {
        const handle = () => setIsTablet(window.innerWidth < 1280);
        window.addEventListener('resize', handle, { passive: true });
        return () => window.removeEventListener('resize', handle);
    }, []);

    // Auto-select conversation when conversationIdToOpen is provided
    useEffect(() => {
        if (conversationIdToOpen && conversations.length > 0) {
            console.log('[ConversasConversations] Auto-selecting conversation:', conversationIdToOpen);
            const convToOpen = conversations.find((c: any) => c.id === conversationIdToOpen);
            if (convToOpen) {
                selectConversation(convToOpen);
                onConversationOpened?.(); // Notify parent that conversation was opened
                console.log('[ConversasConversations] Conversation auto-selected:', convToOpen.id);
            } else {
                console.warn('[ConversasConversations] Conversation not found:', conversationIdToOpen);
            }
        }
    }, [conversationIdToOpen, conversations, selectConversation, onConversationOpened]);

    // Handle conversation creation from phone number
    const handleCreateConversation = async (phone: string, name: string) => {
        setIsCreatingConversation(true);
        try {
            // 1. Create or find contact with this phone number
            const contact = await contactsApi.createOrFind(phone, name);

            // Garantir que tem um ID (pode ser 'id' ou 'fid')
            const contactId = contact?.id || contact?.fid;
            if (!contactId) {
                throw new Error('Contato não foi criado corretamente. Tente novamente.');
            }

            // 2. Create conversation for this contact
            const conversation = await conversationsApi.create({
                contactId: contactId,
                channelType: 'whatsapp' // Default to WhatsApp
            });

            // 3. Refresh conversations and select the new one
            await refreshConversations();
            selectConversation(conversation);
            
            // Close modal
            setShowNewConversationModal(false);
        } catch (error) {
            console.error('Error creating conversation:', error);
            alert(error instanceof Error ? error.message : 'Erro ao criar conversa. Tente novamente.');
        } finally {
            setIsCreatingConversation(false);
        }
    };

    const handleEditLead = () => {
        setIsEditingLead(true);
    };

    const handleDeleteConversation = async () => {
        if (!selectedConversation) return;
        const ok = await confirm('Tem certeza que deseja apagar esta conversa? Todas as mensagens serão removidas.');
        if (!ok) return;
        try {
            await conversationsApi.delete(selectedConversation.id);
            selectConversation(null);
            await refreshConversations();
        } catch (error) {
            console.error('Erro ao deletar conversa:', error);
            alert('Erro ao apagar conversa. Tente novamente.');
        }
    };

    const handleChangeStatus = async (newStatus: 'open' | 'pending' | 'resolved') => {
        if (!selectedConversation) return;
        try {
            await teamApi.setStatus(selectedConversation.id, { status: newStatus });
            selectConversation({ ...selectedConversation, status: newStatus as any });
            await refreshConversations();
        } catch (error) {
            console.error('Erro ao alterar status da conversa:', error);
        }
    };

    const handleResolveConversation = async () => {
        if (!selectedConversation) return;
        const isResolved = selectedConversation.status === 'resolved';
        await handleChangeStatus(isResolved ? 'open' : 'resolved');
    };

    // Sem rede ou sem servidor o aviso geral (ServerStatusBanner) já diz tudo: este só aparece
    // quando o resto funciona e só a ligação em tempo real falhou
    const { down: serverDown } = useServerStatus();
    const isOnline = useOnlineStatus();
    const [showWsBanner, setShowWsBanner] = useState(false);
    useEffect(() => {
        if (wsConnected || serverDown || !isOnline) {
            setShowWsBanner(false);
            return;
        }
        const t = setTimeout(() => setShowWsBanner(true), 6000);
        return () => clearTimeout(t);
    }, [wsConnected, serverDown, isOnline]);

    const toggleSelectMode = () => {
        setIsSelectMode(prev => !prev);
        setSelectedConvIds(new Set());
    };

    // Toque longo numa conversa: entra em seleção já com ela marcada
    const startSelectionWith = (id: string) => {
        setIsSelectMode(true);
        setSelectedConvIds(prev => new Set(prev).add(id));
    };

    const toggleSelectConv = (id: string) => {
        setSelectedConvIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedConvIds.size === filteredConversations.length) {
            setSelectedConvIds(new Set());
        } else {
            setSelectedConvIds(new Set(filteredConversations.map(c => c.id)));
        }
    };

    const handleDeleteSelected = async () => {
        if (selectedConvIds.size === 0) return;
        const count = selectedConvIds.size;
        if (!window.confirm(`Tem certeza que deseja apagar ${count} conversa(s) selecionada(s)? Esta ação não pode ser desfeita.`)) return;
        const ids = Array.from(selectedConvIds);
        for (const id of ids) {
            try { await conversationsApi.delete(id); } catch (e) { console.error('Erro ao deletar conversa:', id, e); }
        }
        if (selectedConversation && selectedConvIds.has(selectedConversation.id)) {
            selectConversation(null);
        }
        setSelectedConvIds(new Set());
        setIsSelectMode(false);
        await refreshConversations();
    };

    const handleSelectLead = async (lead: any) => {
        // Find existing conversation or create a real one
        const existingConv = conversations.find(conv => {
            const convLeadId = conv.lead_id || conv.metadata?.leadId || (conv.contact as any)?.leadId;
            return convLeadId === lead.id;
        });

        if (existingConv) {
            selectConversation(existingConv);
        } else {
            // Create a real conversation for the lead
            setIsCreatingConversation(true);
            try {
                const phone = (lead.whatsapp || lead.phone || lead.telefone || '').replace(/\D/g, '');
                
                if (!phone || phone.length < 8) {
                    alert('Este lead não possui número de WhatsApp válido configurado. Por favor, adicione um número de WhatsApp ao lead primeiro.');
                    return;
                }

                console.log('[ConversasConversations] Creating conversation for lead:', lead.id, 'with phone:', phone);

                // 1. Create or find contact with this lead's phone
                const contact = await contactsApi.createOrFind(phone, lead.name || lead.nome || 'Sem nome');
                console.log('[ConversasConversations] Contact created/found:', contact);
                
                // Garantir que tem um ID (pode ser 'id' ou 'fid')
                const contactId = contact?.id || contact?.fid;
                if (!contactId) {
                    throw new Error('Contato não foi criado corretamente. Tente novamente.');
                }

                // 2. Create conversation for this contact
                const conversation = await conversationsApi.create({
                    contactId: contactId,
                    channelType: 'whatsapp'
                });

                // 3. Refresh conversations and select the new one
                await refreshConversations();
                selectConversation(conversation);
            } catch (error) {
                console.error('Error creating conversation for lead:', error);
                alert(error instanceof Error ? error.message : 'Erro ao criar conversa. Tente novamente.');
            } finally {
                setIsCreatingConversation(false);
            }
        }
    };

    // Filtrar conversas baseado nos filtros aplicados
    const filteredConversations = useMemo(() => {
        return conversations.filter(conv => {
            const jid = conv.metadata?.jid || conv.remote_jid || '';
            const channelType = conv.channel?.type || '';
            const isGroup = jid.includes('@g.us') || (conv as any).is_group || conv.metadata?.is_group || conv.contact?.is_group;

            // ── Quick filter tab logic ──
            if (quickFilter === 'groups') {
                // Only show groups
                if (!isGroup) return false;
            } else if (quickFilter === 'unread') {
                // Only show unread (exclude groups by default)
                if (isGroup) return false;
                if (!conv.unread_count || conv.unread_count <= 0) return false;
            } else if (quickFilter === 'tags') {
                // Show only conversations with tags
                if (isGroup) return false;
                const leadStatus = (conv.contact as any)?.status || conv.metadata?.lead_status;
                const leadTags: string[] = (conv.contact as any)?.tags || conv.metadata?.tags || [];
                const convTags = (conv as any).conversation_tags || [];
                const hasTags = (leadStatus && leadStatus !== 'novo' && leadStatus !== 'new') || leadTags.length > 0 || convTags.length > 0;
                if (!hasTags) return false;
            } else if (quickFilter === 'mine') {
                if (isGroup) return false;
                if ((conv as any).assignee_id !== currentUserId) return false;
            } else if (quickFilter === 'unassigned') {
                if (isGroup) return false;
                const hasAssignee = !!(conv as any).assignee_id;
                if (hasAssignee) return false;
                // Only show open/pending (not resolved/closed)
                const s = conv.status;
                if (s === 'resolved' || s === 'closed') return false;
            } else if (quickFilter === 'pending') {
                if (isGroup) return false;
                if (conv.status !== 'pending') return false;
            } else if (quickFilter === 'resolved') {
                if (isGroup) return false;
                if (conv.status !== 'resolved') return false;
            } else {
                // 'all' — exclude groups (keep original behavior)
                if (isGroup) return false;
            }

            // Verificar se é um contato válido:
            // - WhatsApp individual: @lid ou @s.whatsapp.net
            // - WhatsApp grupo: @g.us
            // - Telegram/Instagram/Facebook/Email: sempre válidos (usam IDs numéricos)
            const isWhatsAppContact = jid.includes('@lid') || jid.includes('@s.whatsapp.net');
            const isGroupJid = jid.includes('@g.us');
            const isNonWhatsAppChannel = ['telegram', 'instagram', 'facebook', 'email', 'whatsapp_cloud', 'website'].includes(channelType);
            const isValidContact = isWhatsAppContact || isGroupJid || isNonWhatsAppChannel || /^\d+$/.test(jid);

            if (!isValidContact) return false;
            
            // Filtrar por tipo (mentions, unattended)
            if (filters.type === 'mentions') {
                // Mostrar apenas conversas onde o usuário foi mencionado
                const hasMention = conv.metadata?.hasMention || (conv as any).has_mention || false;
                if (!hasMention) return false;
            } else if (filters.type === 'unattended') {
                // Mostrar apenas conversas não atendidas (sem responsável ou sem resposta)
                const hasAssignee = conv.assignee_id || conv.metadata?.assigneeId;
                const hasOutgoingMessage = conv.last_message?.direction === 'out';
                // Não atendida = sem responsável OU última mensagem foi recebida (não respondida)
                if (hasAssignee && hasOutgoingMessage) return false;
            }
            
            // Filtrar por canal (channel) - usando channel_id
            if (filters.channel) {
                const convChannelId = conv.channel_id || conv.channel?.id;
                if (convChannelId !== filters.channel) return false;
            }
            
            // Filtrar por etiqueta (suporta funnel:status, lead_tag:tag, ou conversation tag ID)
            if (filters.tag) {
                if (filters.tag.startsWith('funnel:')) {
                    // Filtrar por status do lead (etapa do funil)
                    const funnelStatus = filters.tag.replace('funnel:', '');
                    const leadStatus = (conv.contact as any)?.status || conv.metadata?.lead_status;
                    if (leadStatus !== funnelStatus) return false;
                } else if (filters.tag.startsWith('lead_tag:')) {
                    // Filtrar por tag do lead
                    const tagName = filters.tag.replace('lead_tag:', '');
                    const leadTags: string[] = (conv.contact as any)?.tags || conv.metadata?.tags || [];
                    if (!leadTags.includes(tagName)) return false;
                } else {
                    // Filtrar por conversation tag (UUID)
                    const convTags = (conv as any).conversation_tags || [];
                    const hasConvTag = convTags.some((t: any) => t.id === filters.tag);
                    if (!hasConvTag) return false;
                }
            }
            
            // Filtrar por busca
            if (searchQuery) {
                const lastMessage = (conv as any).last_message;
                return matchesSearch(
                    searchQuery,
                    conv.contact?.name,
                    conv.contact?.phone,
                    (conv.contact as any)?.email,
                    typeof lastMessage === 'string' ? lastMessage : lastMessage?.content
                );
            }
            
            return true;
        });
    }, [conversations, filters, searchQuery, quickFilter]);

    // Conversas por ler (não grupos) — o número de conversas, não de mensagens, como no WhatsApp
    const unreadChats = useMemo(() => conversations.filter((c) => {
        const jid = c.metadata?.jid || c.remote_jid || '';
        return !jid.includes('@g.us') && (c.unread_count || 0) > 0;
    }).length, [conversations]);

    const handleOpenSettings = () => {
        if (onNavigate) {
            onNavigate('inbox-settings');
        }
    };

    const handleBack = () => {
        selectConversation(null);
    };

    const handleSearch = (value: string) => {
        setSearchQuery(value);
        search(value);
    };

    // ── Computed visibility ──────────────────────────────────────────
    // On mobile: show list OR chat (not both). Details never shown.
    // On tablet: conversation list + chat. Details hidden unless explicitly opened.
    // On desktop: all three panels, respecting layout state.
    const showDetailsPanel = !isMobile && !isTablet && !layout.detailsPanelCollapsed && !layout.focusMode && !!selectedConversation;
    const convListWidth = layout.conversationListWidth;
    const detailsWidth = layout.detailsPanelWidth;

    // Collapsed stub width (icon-only strip)
    const COLLAPSED_STUB = 40;

    // Ligação em tempo real em baixo: aviso discreto (as conversas continuam a atualizar por consulta)
    const wsBanner = showWsBanner ? (
        <div role="status" className="flex items-center gap-2 px-4 py-2 text-xs font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 border-b border-amber-500/20 flex-shrink-0">
            <WifiOff size={14} className="flex-shrink-0" />
            <span className="flex-1">Ligação em tempo real interrompida. A tentar ligar de novo…</span>
            <button onClick={() => refreshConversations()} className="font-semibold underline-offset-2 hover:underline">Atualizar</button>
        </div>
    ) : null;

    return (
        <div className="flex w-full min-w-0 h-full max-h-full overflow-hidden bg-background relative">

            {/* ── Conversation List Panel ─────────────────────────────── */}
            {!isMobile && !layout.focusMode && (
                <>
                    <div
                        className="flex-shrink-0 flex flex-col border-r border-border bg-card overflow-hidden transition-all duration-200"
                        style={{
                            width: layout.conversationListCollapsed ? COLLAPSED_STUB : convListWidth,
                            minWidth: layout.conversationListCollapsed ? COLLAPSED_STUB : undefined,
                        }}
                    >
                        {layout.conversationListCollapsed ? (
                            /* ── Collapsed stub ── */
                            <div className="flex flex-col items-center py-3 gap-2 h-full">
                                <button
                                    onClick={toggleConversationList}
                                    className="p-2 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
                                    title="Expandir lista de conversas"
                                >
                                    <PanelLeftOpen size={16} />
                                </button>
                                {unreadCount > 0 && (
                                    <span className="w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold bg-primary text-white">
                                        {unreadCount > 9 ? '9+' : unreadCount}
                                    </span>
                                )}
                            </div>
                        ) : (
                            /* ── Expanded list ── */
                            <>
                                {wsBanner}
                                <ConversationListHeader
                                    isMobile={false}
                                    searchQuery={searchQuery}
                                    onSearch={handleSearch}
                                    quickFilter={quickFilter}
                                    onQuickFilter={setQuickFilter}
                                    unreadChats={unreadChats}
                                    channels={channels}
                                    channelFilter={filters.channel}
                                    onChannelFilter={setChannelFilter}
                                    externalFilter={externalFilter}
                                    onClearExternalFilter={() => setFilters({ type: 'all', tag: undefined })}
                                    onNewConversation={() => setShowNewConversationModal(true)}
                                    onCollapse={toggleConversationList}
                                    onSyncGroups={quickFilter === 'groups' ? syncGroupsFromEvolution : undefined}
                                    syncingGroups={isSyncingGroups}
                                    isSelectMode={isSelectMode}
                                    selectedCount={selectedConvIds.size}
                                    allSelected={selectedConvIds.size === filteredConversations.length && filteredConversations.length > 0}
                                    onStartSelect={() => { setIsSelectMode(true); setSelectedConvIds(new Set()); }}
                                    onToggleSelectAll={toggleSelectAll}
                                    onDeleteSelected={handleDeleteSelected}
                                    onExitSelect={toggleSelectMode}
                                />

                                {/* List */}
                                <div className="flex-1 overflow-y-auto custom-scrollbar">
                                    <ConversationList
                                        conversations={filteredConversations}
                                        selectedId={selectedConversation?.id || null}
                                        onSelect={selectConversation}
                                        loading={conversationsLoading}
                                        isSelectMode={isSelectMode}
                                        selectedIds={selectedConvIds}
                                        onToggleSelect={toggleSelectConv}
                                        onLongPress={startSelectionWith}
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    {/* Resize handle after conv list (only when expanded) */}
                    {!layout.conversationListCollapsed && (
                        <ResizeHandle onMouseDown={startResizeConversationList} />
                    )}
                </>
            )}

            {/* Mobile: Conversation List (full width, hidden when chat open) */}
            {isMobile && !selectedConversation && (
                <div className="flex flex-col w-full h-full bg-card">
                    {wsBanner}
                    {/* Nova conversa: FAB (padrão de criar da app), só com a lista visível */}
                    <PageFab label="Nova conversa" icon={MessageSquarePlus} onClick={() => setShowNewConversationModal(true)} />
                    <ConversationListHeader
                        isMobile={true}
                        searchQuery={searchQuery}
                        onSearch={handleSearch}
                        quickFilter={quickFilter}
                        onQuickFilter={setQuickFilter}
                        unreadChats={unreadChats}
                        channels={channels}
                        channelFilter={filters.channel}
                        onChannelFilter={setChannelFilter}
                        externalFilter={externalFilter}
                        onClearExternalFilter={() => setFilters({ type: 'all', tag: undefined })}
                        onSyncGroups={quickFilter === 'groups' ? syncGroupsFromEvolution : undefined}
                        syncingGroups={isSyncingGroups}
                        isSelectMode={isSelectMode}
                        selectedCount={selectedConvIds.size}
                        allSelected={selectedConvIds.size === filteredConversations.length && filteredConversations.length > 0}
                        onStartSelect={() => { setIsSelectMode(true); setSelectedConvIds(new Set()); }}
                        onToggleSelectAll={toggleSelectAll}
                        onDeleteSelected={handleDeleteSelected}
                        onExitSelect={toggleSelectMode}
                                />
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <ConversationList
                            conversations={filteredConversations}
                            selectedId={selectedConversation?.id || null}
                            onSelect={selectConversation}
                            loading={conversationsLoading}
                            isSelectMode={isSelectMode}
                            selectedIds={selectedConvIds}
                            onToggleSelect={toggleSelectConv}
                            onLongPress={startSelectionWith}
                        />
                    </div>
                </div>
            )}

            {/* ── Chat Panel ──────────────────────────────────────────── */}
            <div className={`flex-1 min-w-0 flex flex-col relative overflow-hidden bg-background ${isMobile && !selectedConversation ? 'hidden' : 'flex'}`}>
                {selectedConversation ? (
                    <ChatPanel
                        conversation={selectedConversation}
                        onBack={isMobile ? handleBack : undefined}
                        onEditLead={handleEditLead}
                        onDeleteConversation={handleDeleteConversation}
                        onResolve={handleResolveConversation}
                        onStatusChange={handleChangeStatus}
                        messages={messages}
                        messagesLoading={messagesLoading}
                        messagesError={messagesError}
                        sending={sending}
                        messagesEndRef={messagesEndRef}
                        scrollContainerRef={scrollContainerRef}
                        onSendMessage={sendMessage}
                        onSendAudio={sendAudio}
                        onAddLocalMessage={addLocalMessage}
                        onUpdateLocalMessageProgress={updateLocalMessageProgress}
                        onFailLocalMessage={failLocalMessage}
                        onDeleteMessage={deleteMessage}
                        onForwardMessage={forwardMessage}
                        conversations={conversations}
                        /* layout control buttons passed as slot */
                        onLoadOlder={loadOlderMessages}
                        hasMore={hasMoreMessages}
                        loadingOlder={loadingOlderMessages}
                        /* Só aparece com o painel do contacto fechado: fecha-se no X do próprio painel */
                        layoutControls={
                            !isMobile && layout.detailsPanelCollapsed ? (
                                <button
                                    onClick={toggleDetailsPanel}
                                    className="p-1.5 rounded-md text-muted-foreground hover:bg-muted transition-colors"
                                    title="Mostrar detalhes"
                                >
                                    <PanelRightOpen size={15} />
                                </button>
                            ) : undefined
                        }
                    />
                ) : (
                    <div className="flex-1 flex items-center justify-center p-8 h-full bg-background">
                        <EmptyState onOpenSettings={handleOpenSettings} />
                    </div>
                )}
            </div>

            {/* ── Details Panel ───────────────────────────────────────── */}
            {showDetailsPanel && (
                <>
                    {/* Resize handle before details panel */}
                    <ResizeHandle onMouseDown={startResizeDetailsPanel} />

                    <div
                        className="flex-shrink-0 flex flex-col h-full overflow-hidden border-l border-border transition-all duration-200"
                        style={{ width: detailsWidth }}
                    >
                        <ContactDetailsPanel
                            conversation={selectedConversation! as any}
                            onClose={toggleDetailsPanel}
                            isEditingExternal={isEditingLead}
                            onEditingChange={setIsEditingLead}
                            onSendMessage={sendMessage}
                        />
                    </div>
                </>
            )}

            {/* Tablet: Details panel as overlay sheet */}
            {!isMobile && isTablet && selectedConversation && !layout.detailsPanelCollapsed && !layout.focusMode && (
                <>
                    {/* Dim overlay */}
                    <div
                        className="absolute inset-0 z-20 bg-black/30"
                        onClick={toggleDetailsPanel}
                    />
                    <div
                        className="absolute right-0 top-0 bottom-0 z-30 flex flex-col h-full border-l border-border bg-card shadow-2xl transition-transform duration-200"
                        style={{ width: Math.min(detailsWidth, 340) }}
                    >
                        <ContactDetailsPanel
                            conversation={selectedConversation as any}
                            onClose={toggleDetailsPanel}
                            isEditingExternal={isEditingLead}
                            onEditingChange={setIsEditingLead}
                            onSendMessage={sendMessage}
                        />
                    </div>
                </>
            )}

            {/* New Conversation Modal */}
            <NewConversationModal
                isOpen={showNewConversationModal}
                onClose={() => setShowNewConversationModal(false)}
                onCreateConversation={handleCreateConversation}
                onSelectLead={handleSelectLead}
            />
        </div>
    );
}
