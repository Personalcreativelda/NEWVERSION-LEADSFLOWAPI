import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ConversationList } from '../../inbox/ConversationList';
import { useInbox } from '../../../hooks/useInbox';
import { useInboxFilters } from '../../../hooks/useInboxFilters';
import { conversationsApi, contactsApi, groupsApi } from '../../../services/api/inbox';
import { Settings, Search, Filter, Plus, X, Wifi, WifiOff, RefreshCw, Users, MessageSquare, MessagesSquare } from 'lucide-react';
import { ChatPanel } from '../../inbox/ChatPanel';
import { EmptyState } from '../../inbox/EmptyState';
import { ContactDetailsPanel } from '../../inbox/ContactDetailsPanel';
import { NewConversationModal } from '../../inbox/NewConversationModal';
import { GroupDetailsPanel } from '../../inbox/GroupDetailsPanel';

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
        sendMessage,
        sendAudio,
        wsConnected,
        lastUpdate
    } = useInbox();

    // Hook centralizado de filtros
    const { filters, clearFilters, hasActiveFilters, getActiveFiltersDescription } = useInboxFilters();

    const [showContactDetails, setShowContactDetails] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showNewConversationModal, setShowNewConversationModal] = useState(false);
    const [isCreatingConversation, setIsCreatingConversation] = useState(false);
    const [isEditingLead, setIsEditingLead] = useState(false);
    // Chat type filter: 'all' | 'chats' | 'groups'
    const [chatTypeFilter, setChatTypeFilter] = useState<'all' | 'chats' | 'groups'>('all');
    const groupsSyncedRef = useRef(false);

    // Auto-sync groups the first time the groups tab is opened in this session
    useEffect(() => {
        if (chatTypeFilter === 'groups' && !groupsSyncedRef.current) {
            groupsSyncedRef.current = true;
            groupsApi.sync().then(() => refreshConversations()).catch(() => {});
        }
    }, [chatTypeFilter, refreshConversations]);

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
            selectConversation(null);
            await refreshConversations();
        } catch (error) {
            console.error('Erro ao deletar conversa:', error);
            alert('Erro ao apagar conversa. Tente novamente.');
        }
    };

    const handleClearConversation = async () => {
        if (!selectedConversation) return;
        try {
            await conversationsApi.clearMessages(selectedConversation.id);
            await refreshConversations();
        } catch (error) {
            console.error('Erro ao limpar conversa:', error);
            alert('Erro ao limpar conversa. Tente novamente.');
        }
    };

    const handleCloseConversation = () => {
        selectConversation(null);
    };

    const handleShowDetails = () => {
        setShowContactDetails(true);
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

    // Unread counts per tab
    const tabUnreadCounts = useMemo(() => {
        let all = 0, chats = 0, groups = 0;
        conversations.forEach(conv => {
            const jid = conv.metadata?.jid || conv.remote_jid || '';
            const isGroup = conv.is_group || conv.metadata?.is_group || jid.includes('@g.us');
            const u = conv.unread_count || 0;
            all += u;
            if (isGroup) groups += u;
            else chats += u;
        });
        return { all, chats, groups };
    }, [conversations]);

    // Filtrar conversas baseado nos filtros aplicados
    const filteredConversations = useMemo(() => {
        return conversations.filter(conv => {
            const jid = conv.metadata?.jid || conv.remote_jid || '';
            const channelType = conv.channel?.type || '';
            const isGroup = conv.is_group || conv.metadata?.is_group || jid.includes('@g.us');

            // Chat type filter: all / chats / groups
            if (chatTypeFilter === 'chats' && isGroup) return false;
            if (chatTypeFilter === 'groups' && !isGroup) return false;

            // Para chats individuais, validar contato
            if (!isGroup) {
                const isWhatsAppContact = jid.includes('@lid') || jid.includes('@s.whatsapp.net');
                const isNonWhatsAppChannel = ['telegram', 'instagram', 'facebook', 'email', 'whatsapp_cloud', 'website'].includes(channelType);
                const isValidContact = isWhatsAppContact || isNonWhatsAppChannel || /^\d+$/.test(jid);
                if (!isValidContact) return false;
            }
            
            // Filtrar por tipo (mentions, unattended)
            if (filters.type === 'mentions') {
                // Conversas com menção explícita OU com mensagens não lidas em grupos
                const hasMention = conv.metadata?.hasMention || (conv as any).has_mention;
                const hasUnreadInGroup = isGroup && (conv.unread_count || 0) > 0;
                if (!hasMention && !hasUnreadInGroup) return false;
            } else if (filters.type === 'unattended') {
                // Não atendidas = última mensagem é RECEBIDA (direction 'in') OU tem mensagens não lidas
                const lastMsgDir = conv.last_message?.direction;
                const hasUnread = (conv.unread_count || 0) > 0;
                const waitingForReply = lastMsgDir === 'in' || (!lastMsgDir && hasUnread);
                if (!waitingForReply) return false;
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
    }, [conversations, filters, searchQuery, chatTypeFilter]);

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

    return (
        <div className="flex w-full h-full max-h-full overflow-hidden transition-all duration-300" style={{ backgroundColor: 'hsl(var(--background))' }}>

            {/* Sidebar de Conversas */}
            <div 
                className={`w-full md:w-[340px] lg:w-[380px] xl:w-[400px] flex-shrink-0 flex flex-col border-r ${selectedConversation ? 'hidden md:flex' : 'flex'}`}
                style={{ 
                    backgroundColor: 'hsl(var(--card))',
                    borderColor: 'hsl(var(--border))'
                }}
            >

                {/* Sidebar Header - Design similar à imagem */}
                <div 
                    className="p-4 border-b"
                    style={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        borderColor: 'hsl(var(--border))' 
                    }}
                >
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <h1
                                className="text-lg font-bold"
                                style={{ color: 'hsl(var(--foreground))' }}
                            >
                                Inbox
                            </h1>
                            {unreadCount > 0 && (
                                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold bg-blue-600 text-white">
                                    {unreadCount}
                                </span>
                            )}
                            {/* Connection Status Indicator */}
                            <div
                                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs cursor-pointer transition-colors ${
                                    wsConnected
                                        ? 'bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20'
                                        : 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/20'
                                }`}
                                title={wsConnected
                                    ? 'Tempo real ativo - mensagens aparecem instantaneamente'
                                    : 'Modo polling - atualização automática a cada 30s. Clique em atualizar para forçar.'}
                                onClick={() => !wsConnected && refreshConversations()}
                            >
                                {wsConnected ? (
                                    <>
                                        <Wifi size={12} />
                                        <span className="hidden sm:inline">Ao vivo</span>
                                    </>
                                ) : (
                                    <>
                                        <WifiOff size={12} />
                                        <span className="hidden sm:inline">Polling</span>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            {/* Botão Atualizar */}
                            <button
                                onClick={refreshConversations}
                                className="p-2 rounded-lg hover:bg-muted transition-all"
                                style={{ color: 'hsl(var(--muted-foreground))' }}
                                title={`Atualizar conversas (última: ${lastUpdate ? new Date(lastUpdate).toLocaleTimeString() : 'nunca'})`}
                            >
                                <RefreshCw size={18} className={conversationsLoading ? 'animate-spin' : ''} />
                            </button>
                            <button
                                className="p-2 rounded-lg hover:bg-muted transition-all"
                                style={{ color: 'hsl(var(--muted-foreground))' }}
                                title="Filtrar"
                            >
                                <Filter size={18} />
                            </button>

                            {/* Botão Nova Conversa */}
                            <button
                                onClick={() => setShowNewConversationModal(true)}
                                className="p-2 rounded-lg hover:bg-muted transition-all"
                                style={{ color: 'hsl(var(--muted-foreground))' }}
                                title="Nova conversa"
                            >
                                <Plus size={18} />
                            </button>
                        </div>
                    </div>

                    {/* Search Bar */}
                    <div className="relative">
                        <Search 
                            className="absolute left-3 top-1/2 -translate-y-1/2 transition-colors" 
                            size={16} 
                            style={{ color: 'hsl(var(--muted-foreground))' }} 
                        />
                        <input
                            type="text"
                            value={searchQuery}
                            placeholder="Buscar conversas..."
                            className="w-full rounded-lg py-2 pl-9 pr-4 text-sm focus:ring-2 focus:ring-blue-500/30 transition-all outline-none border"
                            style={{ 
                                backgroundColor: 'hsl(var(--muted))',
                                color: 'hsl(var(--foreground))',
                                borderColor: 'transparent'
                            }}
                            onChange={(e) => handleSearch(e.target.value)}
                        />
                    </div>

                    {/* Chat Type Tabs: Todos / Chats / Grupos */}
                    <div className="flex items-center gap-1 mt-3">
                        {([
                            { key: 'all' as const, label: 'Todos', icon: MessagesSquare, badge: tabUnreadCounts.all },
                            { key: 'chats' as const, label: 'Chats', icon: MessageSquare, badge: tabUnreadCounts.chats },
                            { key: 'groups' as const, label: 'Grupos', icon: Users, badge: tabUnreadCounts.groups },
                        ]).map(({ key, label, icon: Icon, badge }) => (
                            <button
                                key={key}
                                onClick={() => setChatTypeFilter(key)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                    chatTypeFilter === key
                                        ? 'bg-blue-600 text-white'
                                        : 'hover:bg-muted'
                                }`}
                                style={chatTypeFilter !== key ? { color: 'hsl(var(--muted-foreground))' } : undefined}
                            >
                                <Icon size={14} />
                                {label}
                                {badge > 0 && (
                                    <span className={`inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold leading-none ${
                                        chatTypeFilter === key ? 'bg-white text-blue-600' : 'bg-green-500 text-white'
                                    }`}>
                                        {badge > 99 ? '99+' : badge}
                                    </span>
                                )}
                            </button>
                        ))}

                    </div>

                    {/* Indicador de filtros ativos */}
                    {hasActiveFilters && (
                        <div className="flex items-center gap-2 mt-3 px-1">
                            <div 
                                className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
                                style={{ 
                                    backgroundColor: 'hsl(var(--primary) / 0.1)',
                                    color: 'hsl(var(--primary))'
                                }}
                            >
                                <Filter size={12} />
                                <span className="truncate font-medium">{getActiveFiltersDescription()}</span>
                            </div>
                            <button
                                onClick={clearFilters}
                                className="p-1.5 rounded-lg hover:bg-muted transition-all"
                                style={{ color: 'hsl(var(--muted-foreground))' }}
                                title="Limpar filtros"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    )}
                </div>

                {/* List Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <ConversationList
                        conversations={filteredConversations}
                        selectedId={selectedConversation?.id || null}
                        onSelect={selectConversation}
                        loading={conversationsLoading}
                    />
                </div>
            </div>

            {/* Main Content Area (Chat or Empty) */}
            <div 
                className={`flex-1 w-full min-w-0 flex flex-col relative overflow-hidden ${!selectedConversation ? 'hidden md:flex' : 'flex'}`}
                style={{ backgroundColor: 'hsl(var(--background))' }}
            >
                {selectedConversation ? (
                    <ChatPanel
                        conversation={selectedConversation}
                        onBack={handleBack}
                        onEditLead={handleEditLead}
                        onDeleteConversation={handleDeleteConversation}
                        onClearConversation={handleClearConversation}
                        onCloseConversation={handleCloseConversation}
                        onShowDetails={handleShowDetails}
                        messages={messages}
                        messagesLoading={messagesLoading}
                        messagesError={messagesError}
                        sending={sending}
                        messagesEndRef={messagesEndRef}
                        onSendMessage={sendMessage}
                        onSendAudio={sendAudio}
                    />
                ) : (
                    <div 
                        className="flex-1 flex items-center justify-center p-8 h-full"
                        style={{ backgroundColor: 'hsl(var(--background))' }}
                    >
                        <EmptyState onOpenSettings={handleOpenSettings} />
                    </div>
                )}
            </div>

            {/* Contact/Group Details Panel - Only visible on larger screens when a conversation is selected */}
            {selectedConversation && showContactDetails && (
                <div 
                    className="hidden xl:flex w-[320px] 2xl:w-[350px] flex-shrink-0 h-full overflow-hidden border-l transition-all duration-300" 
                    style={{ borderColor: 'hsl(var(--border))' }}
                >
                    {(selectedConversation.is_group || selectedConversation.metadata?.is_group || selectedConversation.remote_jid?.includes('@g.us')) ? (
                        <GroupDetailsPanel
                            conversation={selectedConversation}
                            onClose={() => setShowContactDetails(false)}
                        />
                    ) : (
                        <ContactDetailsPanel 
                            conversation={selectedConversation}
                            onClose={() => setShowContactDetails(false)}
                            isEditingExternal={isEditingLead}
                            onEditingChange={setIsEditingLead}
                        />
                    )}
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
