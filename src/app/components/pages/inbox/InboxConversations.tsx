import React, { useState, useMemo } from 'react';
import { ConversationList } from '../../inbox/ConversationList';
import { useInbox } from '../../../hooks/useInbox';
import { useInboxFilters } from '../../../hooks/useInboxFilters';
import { conversationsApi, contactsApi } from '../../../services/api/inbox';
import { Settings, Search, Filter, Plus, X, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { ChatPanel } from '../../inbox/ChatPanel';
import { EmptyState } from '../../inbox/EmptyState';
import { ContactDetailsPanel } from '../../inbox/ContactDetailsPanel';
import { NewConversationModal } from '../../inbox/NewConversationModal';

interface InboxConversationsProps {
    onNavigate?: (page: string) => void;
}

export default function InboxConversations({ onNavigate }: InboxConversationsProps) {
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
            selectConversation(null as any);
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
            const isGroup = jid.includes('@g.us');

            // Excluir grupos
            if (isGroup) return false;

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
            
            // Filtrar por status do lead
            if (filters.status) {
                const convStatus = conv.contact?.status?.toLowerCase() || '';
                if (convStatus !== filters.status.toLowerCase()) return false;
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
    }, [conversations, filters, searchQuery]);

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
                className={`w-full md:w-80 lg:w-[300px] xl:w-[320px] flex-shrink-0 flex flex-col border-r ${selectedConversation ? 'hidden md:flex' : 'flex'}`}
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

            {/* Contact Details Panel - Only visible on larger screens when a conversation is selected */}
            {selectedConversation && showContactDetails && (
                <div 
                    className="hidden xl:flex w-[320px] 2xl:w-[350px] flex-shrink-0 h-full overflow-hidden border-l transition-all duration-300" 
                    style={{ borderColor: 'hsl(var(--border))' }}
                >
                    <ContactDetailsPanel 
                        conversation={selectedConversation}
                        onClose={() => setShowContactDetails(false)}
                        isEditingExternal={isEditingLead}
                        onEditingChange={setIsEditingLead}
                    />
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
