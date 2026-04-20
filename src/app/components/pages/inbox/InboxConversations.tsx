import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { ConversationList } from '../../inbox/ConversationList';
import { useInbox } from '../../../hooks/useInbox';
import { useInboxFilters } from '../../../hooks/useInboxFilters';
import { useInboxLayout } from '../../../hooks/useInboxLayout';
import { conversationsApi, contactsApi } from '../../../services/api/inbox';
import {
    Search, Filter, Plus, X, Wifi, WifiOff, RefreshCw,
    PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen,
    Maximize2, Minimize2, ChevronLeft, ChevronRight,
    Tag, Users, Settings2
} from 'lucide-react';
import { ChatPanel } from '../../inbox/ChatPanel';
import { EmptyState } from '../../inbox/EmptyState';
import { ContactDetailsPanel } from '../../inbox/ContactDetailsPanel';
import { NewConversationModal } from '../../inbox/NewConversationModal';
import { ResizeHandle } from '../../inbox/ResizeHandle';

interface InboxConversationsProps {
    onNavigate?: (page: string) => void;
    conversationIdToOpen?: string | null;
    onConversationOpened?: () => void;
}

export default function InboxConversations({ 
    onNavigate,
    conversationIdToOpen,
    onConversationOpened
}: InboxConversationsProps) {
    const {
        conversations,
        selectedConversation,
        selectConversation,
        conversationsLoading,
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
        wsConnected,
        lastUpdate
    } = useInbox();

    const { filters, clearFilters, hasActiveFilters, getActiveFiltersDescription } = useInboxFilters();
    const {
        layout,
        startResizeConversationList,
        startResizeDetailsPanel,
        toggleConversationList,
        toggleDetailsPanel,
        toggleFocusMode,
    } = useInboxLayout();

    const [searchQuery, setSearchQuery] = useState('');
    const [showNewConversationModal, setShowNewConversationModal] = useState(false);
    const [isCreatingConversation, setIsCreatingConversation] = useState(false);
    const [isEditingLead, setIsEditingLead] = useState(false);

    // ── WhatsApp-style quick filter tabs ──────────────────────
    type QuickFilter = 'all' | 'unread' | 'tags' | 'groups';

    // All available filter options
    const ALL_FILTER_OPTIONS: { id: QuickFilter; label: string; icon?: React.ReactNode }[] = [
        { id: 'all', label: 'Tudo' },
        { id: 'unread', label: 'Não lidas' },
        { id: 'tags', label: 'Etiquetas', icon: <Tag size={11} /> },
        { id: 'groups', label: 'Grupos', icon: <Users size={11} /> },
    ];

    // Persisted user-selected visible filters (localStorage)
    const STORAGE_KEY = 'inbox_visible_filters';
    const [visibleFilterIds, setVisibleFilterIds] = useState<QuickFilter[]>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) return JSON.parse(saved);
        } catch {}
        return ['all', 'unread', 'tags', 'groups']; // default: show all
    });
    const [showFilterConfig, setShowFilterConfig] = useState(false);

    const toggleFilterVisibility = useCallback((id: QuickFilter) => {
        setVisibleFilterIds(prev => {
            const next = prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id];
            // 'all' is always visible
            const final = next.includes('all') ? next : ['all' as QuickFilter, ...next];
            localStorage.setItem(STORAGE_KEY, JSON.stringify(final));
            return final;
        });
    }, []);

    const visibleFilters = ALL_FILTER_OPTIONS.filter(f => visibleFilterIds.includes(f.id));

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
            console.log('[InboxConversations] Auto-selecting conversation:', conversationIdToOpen);
            const convToOpen = conversations.find((c: any) => c.id === conversationIdToOpen);
            if (convToOpen) {
                selectConversation(convToOpen);
                onConversationOpened?.(); // Notify parent that conversation was opened
                console.log('[InboxConversations] Conversation auto-selected:', convToOpen.id);
            } else {
                console.warn('[InboxConversations] Conversation not found:', conversationIdToOpen);
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
        try {
            await conversationsApi.delete(selectedConversation.id);
            // Limpar conversa selecionada primeiro para fechar o painel de chat
            selectConversation(null);
            await refreshConversations();
        } catch (error) {
            console.error('Erro ao deletar conversa:', error);
            alert('Erro ao apagar conversa. Tente novamente.');
        }
    };

    const handleSelectLead = async (lead: any) => {
        // Find existing conversation or create a real one
        const existingConv = conversations.find(conv => {
            const convLeadId = conv.lead_id || conv.metadata?.leadId || conv.contact?.leadId;
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

                console.log('[InboxConversations] Creating conversation for lead:', lead.id, 'with phone:', phone);

                // 1. Create or find contact with this lead's phone
                const contact = await contactsApi.createOrFind(phone, lead.name || lead.nome || 'Sem nome');
                console.log('[InboxConversations] Contact created/found:', contact);
                
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
            } else {
                // 'all' — exclude groups (keep original behavior)
                if (isGroup) return false;
            }

            // Verificar se é um contato válido:
            // - WhatsApp: @lid ou @s.whatsapp.net
            // - Telegram/Instagram/Facebook/Email: sempre válidos (usam IDs numéricos)
            const isWhatsAppContact = jid.includes('@lid') || jid.includes('@s.whatsapp.net');
            const isNonWhatsAppChannel = ['telegram', 'instagram', 'facebook', 'email', 'whatsapp_cloud', 'website'].includes(channelType);
            const isValidContact = isWhatsAppContact || isNonWhatsAppChannel || /^\d+$/.test(jid);

            if (!isValidContact) return false;
            
            // Filtrar por tipo (mentions, unattended)
            if (filters.type === 'mentions') {
                // Mostrar apenas conversas onde o usuário foi mencionado
                const hasMention = conv.metadata?.hasMention || conv.has_mention || false;
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
                const query = searchQuery.toLowerCase();
                const name = conv.contact?.name?.toLowerCase() || '';
                const phone = conv.contact?.phone?.toLowerCase() || '';
                return name.includes(query) || phone.includes(query);
            }
            
            return true;
        });
    }, [conversations, filters, searchQuery, quickFilter]);

    // Count unreads for the tab badge (non-group only)
    const totalUnread = useMemo(() => {
        return conversations.reduce((sum, c) => {
            const jid = c.metadata?.jid || c.remote_jid || '';
            if (jid.includes('@g.us')) return sum;
            return sum + (c.unread_count || 0);
        }, 0);
    }, [conversations]);

    // Count groups
    const groupCount = useMemo(() => {
        return conversations.filter(c => {
            const jid = c.metadata?.jid || c.remote_jid || '';
            return jid.includes('@g.us') || (c as any).is_group || c.metadata?.is_group;
        }).length;
    }, [conversations]);

    const handleOpenSettings = () => {
        if (onNavigate) {
            onNavigate('inbox-settings');
        }
    };

    const handleBack = () => {
        selectConversation(null as any);
    };

    const handleSearch = (value: string) => {
        setSearchQuery(value);
        search(value);
    };

    // ── Computed visibility ──────────────────────────────────────────
    // On mobile: show list OR chat (not both). Details never shown.
    // On tablet: conversation list + chat. Details hidden unless explicitly opened.
    // On desktop: all three panels, respecting layout state.
    const showConvList = isMobile ? !selectedConversation : !layout.conversationListCollapsed && !layout.focusMode;
    const showDetailsPanel = !isMobile && !isTablet && !layout.detailsPanelCollapsed && !layout.focusMode && !!selectedConversation;
    const convListWidth = layout.conversationListWidth;
    const detailsWidth = layout.detailsPanelWidth;

    // Collapsed stub width (icon-only strip)
    const COLLAPSED_STUB = 40;

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
                                {/* Header */}
                                <div className="p-3 border-b border-border bg-card/95 backdrop-blur-sm flex-shrink-0">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <h1 className="text-sm font-semibold text-foreground truncate">Inbox</h1>
                                            {unreadCount > 0 && (
                                                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-primary text-white">
                                                    {unreadCount}
                                                </span>
                                            )}
                                            <div
                                                className={`hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] cursor-pointer transition-colors ${
                                                    wsConnected
                                                        ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                                                        : 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
                                                }`}
                                                onClick={() => !wsConnected && refreshConversations()}
                                                title={wsConnected ? 'Tempo real ativo' : 'Polling ativo'}
                                            >
                                                {wsConnected ? <Wifi size={10} /> : <WifiOff size={10} />}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-0.5 flex-shrink-0">
                                            <button
                                                onClick={refreshConversations}
                                                className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
                                                title="Atualizar"
                                            >
                                                <RefreshCw size={14} className={conversationsLoading ? 'animate-spin' : ''} />
                                            </button>
                                            <button
                                                onClick={() => setShowNewConversationModal(true)}
                                                className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
                                                title="Nova conversa"
                                            >
                                                <Plus size={14} />
                                            </button>
                                            <button
                                                onClick={toggleConversationList}
                                                className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
                                                title="Recolher lista"
                                            >
                                                <PanelLeftClose size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Search */}
                                    <div className="relative">
                                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={13} />
                                        <input
                                            type="text"
                                            value={searchQuery}
                                            placeholder="Buscar conversas..."
                                            className="w-full rounded-lg py-1.5 pl-8 pr-3 text-xs bg-muted/60 text-foreground border border-border/50 focus:border-primary/40 focus:ring-1 focus:ring-primary/10 transition-all outline-none placeholder:text-muted-foreground/60"
                                            onChange={(e) => handleSearch(e.target.value)}
                                        />
                                    </div>

                                    {/* WhatsApp-style quick filter pill tabs */}
                                    <div className="flex items-center gap-1.5 mt-2.5 overflow-x-auto scrollbar-none relative">
                                        {visibleFilters.map(f => {
                                            const isActive = quickFilter === f.id;
                                            const badge = f.id === 'unread' && totalUnread > 0
                                                ? totalUnread > 99 ? '99+' : String(totalUnread)
                                                : f.id === 'groups' && groupCount > 0
                                                    ? String(groupCount)
                                                    : null;
                                            return (
                                                <button
                                                    key={f.id}
                                                    onClick={() => setQuickFilter(f.id)}
                                                    className={`flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${
                                                        isActive
                                                            ? 'bg-primary/15 text-primary dark:bg-primary/25 dark:text-primary'
                                                            : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                                                    }`}
                                                >
                                                    {f.icon}
                                                    {f.label}
                                                    {badge && (
                                                        <span className={`ml-0.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
                                                            isActive ? 'bg-primary text-white' : 'bg-muted-foreground/20 text-muted-foreground'
                                                        }`}>
                                                            {badge}
                                                        </span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                        {/* + button to customize filters */}
                                        <button
                                            onClick={() => setShowFilterConfig(!showFilterConfig)}
                                            className="flex items-center justify-center w-6 h-6 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors flex-shrink-0"
                                            title="Personalizar filtros"
                                        >
                                            <Plus size={13} />
                                        </button>
                                    </div>

                                    {/* Filter customization dropdown */}
                                    {showFilterConfig && (
                                        <div className="mt-2 p-2 rounded-lg border border-border bg-card shadow-lg">
                                            <div className="flex items-center gap-1.5 mb-2 px-1">
                                                <Settings2 size={11} className="text-muted-foreground" />
                                                <span className="text-[11px] font-medium text-muted-foreground">Personalizar filtros</span>
                                            </div>
                                            {ALL_FILTER_OPTIONS.filter(f => f.id !== 'all').map(f => (
                                                <label
                                                    key={f.id}
                                                    className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer transition-colors"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={visibleFilterIds.includes(f.id)}
                                                        onChange={() => toggleFilterVisibility(f.id)}
                                                        className="w-3.5 h-3.5 rounded border-border text-primary focus:ring-primary/30 accent-primary"
                                                    />
                                                    <span className="text-[12px] text-foreground flex items-center gap-1">
                                                        {f.icon}
                                                        {f.label}
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                    )}

                                    {hasActiveFilters && (
                                        <div className="flex items-center gap-1.5 mt-2">
                                            <div className="flex-1 flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] bg-primary/10 text-primary overflow-hidden">
                                                <Filter size={10} />
                                                <span className="truncate font-medium">{getActiveFiltersDescription()}</span>
                                            </div>
                                            <button
                                                onClick={clearFilters}
                                                className="p-1 rounded-md text-muted-foreground hover:bg-muted transition-colors"
                                                title="Limpar filtros"
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* List */}
                                <div className="flex-1 overflow-y-auto custom-scrollbar">
                                    <ConversationList
                                        conversations={filteredConversations}
                                        selectedId={selectedConversation?.id || null}
                                        onSelect={selectConversation}
                                        loading={conversationsLoading}
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
                    {/* Mobile Header */}
                    <div className="p-4 border-b border-border bg-card/95 backdrop-blur-sm flex-shrink-0">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <h1 className="text-lg font-semibold text-foreground">Inbox</h1>
                                {unreadCount > 0 && (
                                    <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold bg-primary text-white">
                                        {unreadCount}
                                    </span>
                                )}
                                <div
                                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs cursor-pointer ${
                                        wsConnected
                                            ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                                            : 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
                                    }`}
                                    onClick={() => !wsConnected && refreshConversations()}
                                >
                                    {wsConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <button onClick={refreshConversations} className="p-2 rounded-lg text-muted-foreground hover:bg-muted transition-colors">
                                    <RefreshCw size={18} className={conversationsLoading ? 'animate-spin' : ''} />
                                </button>
                                <button onClick={() => setShowNewConversationModal(true)} className="p-2 rounded-lg text-muted-foreground hover:bg-muted transition-colors">
                                    <Plus size={18} />
                                </button>
                            </div>
                        </div>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                            <input
                                type="text"
                                value={searchQuery}
                                placeholder="Buscar conversas..."
                                className="w-full rounded-xl py-2 pl-9 pr-4 text-sm bg-muted/50 text-foreground border border-border/60 focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all outline-none placeholder:text-muted-foreground/60"
                                onChange={(e) => handleSearch(e.target.value)}
                            />
                        </div>

                        {/* Mobile: WhatsApp-style quick filter tabs */}
                        <div className="flex items-center gap-2 mt-3 overflow-x-auto scrollbar-none">
                            {visibleFilters.map(f => {
                                const isActive = quickFilter === f.id;
                                const badge = f.id === 'unread' && totalUnread > 0
                                    ? totalUnread > 99 ? '99+' : String(totalUnread)
                                    : f.id === 'groups' && groupCount > 0
                                        ? String(groupCount)
                                        : null;
                                return (
                                    <button
                                        key={f.id}
                                        onClick={() => setQuickFilter(f.id)}
                                        className={`flex items-center gap-1 px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                                            isActive
                                                ? 'bg-primary/15 text-primary dark:bg-primary/25 dark:text-primary'
                                                : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                                        }`}
                                    >
                                        {f.icon}
                                        {f.label}
                                        {badge && (
                                            <span className={`ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
                                                isActive ? 'bg-primary text-white' : 'bg-muted-foreground/20 text-muted-foreground'
                                            }`}>
                                                {badge}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                            <button
                                onClick={() => setShowFilterConfig(!showFilterConfig)}
                                className="flex items-center justify-center w-7 h-7 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors flex-shrink-0"
                                title="Personalizar filtros"
                            >
                                <Plus size={14} />
                            </button>
                        </div>

                        {showFilterConfig && (
                            <div className="mt-2 p-2.5 rounded-lg border border-border bg-card shadow-lg">
                                <div className="flex items-center gap-1.5 mb-2 px-1">
                                    <Settings2 size={12} className="text-muted-foreground" />
                                    <span className="text-xs font-medium text-muted-foreground">Personalizar filtros</span>
                                </div>
                                {ALL_FILTER_OPTIONS.filter(f => f.id !== 'all').map(f => (
                                    <label
                                        key={f.id}
                                        className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-muted cursor-pointer transition-colors"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={visibleFilterIds.includes(f.id)}
                                            onChange={() => toggleFilterVisibility(f.id)}
                                            className="w-4 h-4 rounded border-border text-primary focus:ring-primary/30 accent-primary"
                                        />
                                        <span className="text-sm text-foreground flex items-center gap-1">
                                            {f.icon}
                                            {f.label}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        )}

                        {hasActiveFilters && (
                            <div className="flex items-center gap-2 mt-2">
                                <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs bg-primary/10 text-primary">
                                    <Filter size={12} />
                                    <span className="truncate font-medium">{getActiveFiltersDescription()}</span>
                                </div>
                                <button onClick={clearFilters} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors">
                                    <X size={14} />
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <ConversationList
                            conversations={filteredConversations}
                            selectedId={selectedConversation?.id || null}
                            onSelect={selectConversation}
                            loading={conversationsLoading}
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
                        messages={messages}
                        messagesLoading={messagesLoading}
                        messagesError={messagesError}
                        sending={sending}
                        messagesEndRef={messagesEndRef}
                        scrollContainerRef={scrollContainerRef}
                        onSendMessage={sendMessage}
                        onSendAudio={sendAudio}
                        /* layout control buttons passed as slot */
                        layoutControls={
                            !isMobile ? (
                                <div className="flex items-center gap-0.5">
                                    {/* Toggle conversation list */}
                                    <button
                                        onClick={toggleConversationList}
                                        className="p-1.5 rounded-md text-muted-foreground hover:bg-muted transition-colors"
                                        title={layout.conversationListCollapsed ? 'Mostrar lista' : 'Ocultar lista'}
                                    >
                                        {layout.conversationListCollapsed
                                            ? <PanelLeftOpen size={15} />
                                            : <PanelLeftClose size={15} />
                                        }
                                    </button>

                                    {/* Focus mode */}
                                    <button
                                        onClick={toggleFocusMode}
                                        className={`p-1.5 rounded-md transition-colors ${
                                            layout.focusMode
                                                ? 'text-primary bg-primary/10'
                                                : 'text-muted-foreground hover:bg-muted'
                                        }`}
                                        title={layout.focusMode ? 'Sair do modo foco' : 'Modo foco'}
                                    >
                                        {layout.focusMode ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                                    </button>

                                    {/* Toggle details panel */}
                                    {!isTablet && (
                                        <button
                                            onClick={toggleDetailsPanel}
                                            className="p-1.5 rounded-md text-muted-foreground hover:bg-muted transition-colors"
                                            title={layout.detailsPanelCollapsed ? 'Mostrar detalhes' : 'Ocultar detalhes'}
                                        >
                                            {layout.detailsPanelCollapsed
                                                ? <PanelRightOpen size={15} />
                                                : <PanelRightClose size={15} />
                                            }
                                        </button>
                                    )}
                                </div>
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
                            conversation={selectedConversation!}
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
                            conversation={selectedConversation}
                            onClose={toggleDetailsPanel}
                            isEditingExternal={isEditingLead}
                            onEditingChange={setIsEditingLead}
                            onSendMessage={sendMessage}
                        />
                    </div>
                </>
            )}

            {/* ── Focus mode: re-open panels bar ──────────────────────── */}
            {layout.focusMode && !isMobile && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-card/90 backdrop-blur-md shadow-lg">
                    <button
                        onClick={toggleConversationList}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                        <PanelLeftOpen size={13} />
                        Lista
                    </button>
                    <div className="w-px h-4 bg-border" />
                    <button
                        onClick={toggleFocusMode}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-primary hover:bg-primary/10 transition-colors font-medium"
                    >
                        <Minimize2 size={13} />
                        Sair do modo foco
                    </button>
                    <div className="w-px h-4 bg-border" />
                    <button
                        onClick={toggleDetailsPanel}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                        <PanelRightOpen size={13} />
                        Detalhes
                    </button>
                </div>
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
