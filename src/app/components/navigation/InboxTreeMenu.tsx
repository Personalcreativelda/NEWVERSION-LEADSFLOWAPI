import React, { useState, useEffect } from 'react';
import {
    ChevronRight, ChevronDown, Inbox, Hash, Tag, AtSign, Bell, Settings, Bot, Zap,
    MessageCircle, Instagram, Facebook, Send, Mail, Cloud, Globe, Plus
} from 'lucide-react';
import { channelsApi, conversationTagsApi } from '../../services/api/inbox';
import { useInboxFilters, type InboxFilterType } from '../../hooks/useInboxFilters';

interface InboxTreeMenuProps {
    currentPage: string;
    onNavigate: (page: string, queryParams?: Record<string, string>) => void;
    isExpanded: boolean;
    translations: any;
}

// Interface para tipos de tags
interface TagItem {
    id: string;
    name: string;
    color?: string;
    icon?: string;
    order_index?: number;
    type?: string; // 'conversation' | 'funnel' | 'lead_tag'
    count?: number;
}

export default function InboxTreeMenu({ currentPage, onNavigate, isExpanded, translations: t }: InboxTreeMenuProps) {
    const [showChannels, setShowChannels] = useState(false);
    const [showTags, setShowTags] = useState(false);
    const [channels, setChannels] = useState<any[]>([]);
    const [tags, setTags] = useState<TagItem[]>([]);
    const [loadingChannels, setLoadingChannels] = useState(false);
    const [loadingTags, setLoadingTags] = useState(false);
    
    // Usar hook centralizado de filtros
    const { filters, setFilterType, setChannelFilter, setTagFilter, clearFilters } = useInboxFilters();
    
    // Determinar estado ativo baseado nos filtros
    const isInboxActive = currentPage === 'inbox' || currentPage === 'inbox-conversations';
    const isAllConversationsActive = isInboxActive && filters.type === 'all' && !filters.channel && !filters.tag;
    const isMentionsActive = isInboxActive && filters.type === 'mentions';
    const isUnattendedActive = isInboxActive && filters.type === 'unattended';

    // Helper para retornar ícone por tipo de canal
    const getChannelIcon = (type: string) => {
        switch(type?.toLowerCase()) {
            case 'whatsapp':
                return MessageCircle;
            case 'whatsapp_cloud':
                return Cloud;
            case 'instagram':
                return Instagram;
            case 'facebook':
            case 'messenger':
                return Facebook;
            case 'telegram':
                return Send;
            case 'email':
                return Mail;
            case 'website':
                return Globe;
            default:
                return Hash;
        }
    };

    // Helper para retornar cor por tipo de canal
    const getChannelColor = (type: string) => {
        switch(type?.toLowerCase()) {
            case 'whatsapp':
                return 'text-green-500';
            case 'whatsapp_cloud':
                return 'text-green-600';
            case 'instagram':
                return 'text-pink-500';
            case 'facebook':
            case 'messenger':
                return 'text-blue-600';
            case 'telegram':
                return 'text-sky-500';
            case 'email':
                return 'text-cyan-500';
            case 'website':
                return 'text-purple-500';
            default:
                return 'text-gray-500';
        }
    };

    // Fetch channels and tags when expanding
    useEffect(() => {
        if (showChannels && channels.length === 0) {
            loadChannels();
        }
    }, [showChannels]);

    useEffect(() => {
        if (showTags) {
            loadTags();
        }
    }, [showTags]);

    const loadChannels = async () => {
        setLoadingChannels(true);
        try {
            const data = await channelsApi.getAll();
            setChannels(data || []);
        } catch (err) {
            console.error('Error loading channels:', err);
        } finally {
            setLoadingChannels(false);
        }
    };

    const loadTags = async () => {
        setLoadingTags(true);
        try {
            const combined = await conversationTagsApi.getCombinedTags();
            const allTags: TagItem[] = [
                ...combined.funnel_stages.map((t: any) => ({ ...t, type: 'funnel' })),
                ...combined.lead_tags.map((t: any) => ({ ...t, type: 'lead_tag' })),
                ...combined.conversation_tags.map((t: any) => ({ ...t, type: 'conversation' })),
            ];
            setTags(allTags);
        } catch (err) {
            console.error('Error loading tags:', err);
        } finally {
            setLoadingTags(false);
        }
    };

    const handleConversationsClick = () => {
        // Limpar todos os filtros para mostrar todas as conversas
        clearFilters();
        onNavigate('inbox');
    };

    const handleMentionsClick = () => {
        setFilterType('mentions');
        onNavigate('inbox', { filter: 'mentions' });
    };

    const handleUnattendedClick = () => {
        setFilterType('unattended');
        onNavigate('inbox', { filter: 'unattended' });
    };

    const handleChannelClick = (channelId: string) => {
        // Definir filtro de canal por ID (mantém outros filtros)
        setChannelFilter(channelId);
        onNavigate('inbox', { channel: channelId });
    };

    const handleTagClick = (tagId: string) => {
        // Definir filtro de tag (mantém outros filtros)
        setTagFilter(tagId);
        onNavigate('inbox', { tag: tagId });
    };

    if (!isExpanded) return null;

    return (
        <div className="ml-2 mt-1 space-y-1">
            {/* 1. Todas as conversas */}
            <button
                onClick={handleConversationsClick}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                    isAllConversationsActive
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                        : 'hover:bg-white/10'
                }`}
                style={!isAllConversationsActive ? { color: 'hsl(var(--sidebar-foreground) / 0.8)' } : {}}
            >
                <Inbox className="w-5 h-5" />
                <span className="flex-1 text-left font-medium">{t.conversas || 'Conversas'}</span>
            </button>

            {/* 2. Menções */}
            <button
                onClick={handleMentionsClick}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                    isMentionsActive
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                        : 'hover:bg-white/10'
                }`}
                style={!isMentionsActive ? { color: 'hsl(var(--sidebar-foreground) / 0.8)' } : {}}
            >
                <AtSign className="w-5 h-5" />
                <span className="flex-1 text-left font-medium">{t.mentions || 'Menções'}</span>
            </button>

            {/* 3. Não atendidas */}
            <button
                onClick={handleUnattendedClick}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                    isUnattendedActive
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                        : 'hover:bg-white/10'
                }`}
                style={!isUnattendedActive ? { color: 'hsl(var(--sidebar-foreground) / 0.8)' } : {}}
            >
                <Bell className="w-5 h-5" />
                <span className="flex-1 text-left font-medium">{t.unattended || 'Não atendidas'}</span>
            </button>

            {/* 4. Canais - Dropdown */}
            <div>
                <button
                    onClick={() => setShowChannels(!showChannels)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                        filters.channel ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
                    } hover:bg-white/10`}
                    style={{ color: 'hsl(var(--sidebar-foreground) / 0.8)' }}
                >
                    {showChannels ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <Hash className="w-5 h-5" />
                    <span className="flex-1 text-left font-medium">{t.canais || 'Canais'}</span>
                    {filters.channel && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-500">1</span>
                    )}
                </button>

                {showChannels && (
                    <div className="ml-6 mt-1 space-y-0.5 relative">
                        {/* Linha vertical para os itens do dropdown Canais */}
                        {channels.length > 0 && (
                            <div 
                                className="absolute left-[7px] top-0 bottom-0 w-[1px] opacity-20"
                                style={{ backgroundColor: 'hsl(var(--sidebar-foreground))' }}
                            />
                        )}
                        {loadingChannels ? (
                            <div className="px-3 py-2 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                Carregando...
                            </div>
                        ) : channels.length === 0 ? (
                            <div className="px-3 py-2 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                Nenhum canal conectado
                            </div>
                        ) : (
                            channels.map((channel, index) => {
                                const ChannelIcon = getChannelIcon(channel.type);
                                const channelColor = getChannelColor(channel.type);
                                const isChannelActive = filters.channel === channel.id;
                                return (
                                    <div key={channel.id} className="relative flex items-center">
                                        {/* Linha horizontal conectando ao item */}
                                        <div
                                            className="absolute left-[7px] w-[8px] h-[1px] opacity-20"
                                            style={{ backgroundColor: 'hsl(var(--sidebar-foreground))' }}
                                        />
                                        <button
                                            onClick={() => handleChannelClick(channel.id)}
                                            className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ml-4 ${
                                                isChannelActive
                                                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                                                    : 'hover:bg-white/10'
                                            }`}
                                            style={!isChannelActive ? { color: 'hsl(var(--sidebar-foreground) / 0.7)' } : {}}
                                        >
                                            <ChannelIcon className={`w-4 h-4 flex-shrink-0 ${channelColor}`} />
                                            <span className="truncate">{channel.name || channel.type}</span>
                                        </button>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}
            </div>

            {/* 5. Etiquetas - Dropdown */}
            <div>
                <button
                    onClick={() => setShowTags(!showTags)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                        filters.tag ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
                    } hover:bg-white/10`}
                    style={{ color: 'hsl(var(--sidebar-foreground) / 0.8)' }}
                >
                    {showTags ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <Tag className="w-5 h-5" />
                    <span className="flex-1 text-left font-medium">{t.tags || 'Etiquetas'}</span>
                    {filters.tag && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-500">1</span>
                    )}
                </button>

                {showTags && (
                    <div className="ml-6 mt-1 space-y-0.5 relative">
                        {/* Linha vertical para os itens do dropdown Etiquetas */}
                        {tags.length > 0 && (
                            <div 
                                className="absolute left-[7px] top-0 bottom-0 w-[1px] opacity-20"
                                style={{ backgroundColor: 'hsl(var(--sidebar-foreground))' }}
                            />
                        )}
                        {loadingTags ? (
                            <div className="px-3 py-2 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                Carregando...
                            </div>
                        ) : tags.length === 0 ? (
                            <div className="px-3 py-2 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                Nenhuma etiqueta criada
                            </div>
                        ) : (
                            <>
                                {/* Etapas do Funil */}
                                {tags.filter(t => t.type === 'funnel').length > 0 && (
                                    <>
                                        <div className="px-3 pt-1 pb-0.5 text-[9px] font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                            Funil de Vendas
                                        </div>
                                        {tags.filter(t => t.type === 'funnel').map((tag) => {
                                            const isTagActive = filters.tag === tag.id;
                                            return (
                                                <div key={tag.id} className="relative flex items-center">
                                                    <div className="absolute left-[7px] w-[8px] h-[1px] opacity-20" style={{ backgroundColor: 'hsl(var(--sidebar-foreground))' }} />
                                                    <button
                                                        onClick={() => handleTagClick(tag.id)}
                                                        className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ml-4 ${
                                                            isTagActive ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'hover:bg-white/10'
                                                        }`}
                                                        style={!isTagActive ? { color: 'hsl(var(--sidebar-foreground) / 0.7)' } : {}}
                                                    >
                                                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color || '#6B7280' }} />
                                                        <span className="truncate">{tag.name}</span>
                                                        {tag.count !== undefined && (
                                                            <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${tag.color || '#6B7280'}20`, color: tag.color || '#6B7280' }}>
                                                                {tag.count}
                                                            </span>
                                                        )}
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </>
                                )}

                                {/* Tags dos Leads */}
                                {tags.filter(t => t.type === 'lead_tag').length > 0 && (
                                    <>
                                        <div className="px-3 pt-2 pb-0.5 text-[9px] font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                            Tags dos Leads
                                        </div>
                                        {tags.filter(t => t.type === 'lead_tag').map((tag) => {
                                            const isTagActive = filters.tag === tag.id;
                                            return (
                                                <div key={tag.id} className="relative flex items-center">
                                                    <div className="absolute left-[7px] w-[8px] h-[1px] opacity-20" style={{ backgroundColor: 'hsl(var(--sidebar-foreground))' }} />
                                                    <button
                                                        onClick={() => handleTagClick(tag.id)}
                                                        className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ml-4 ${
                                                            isTagActive ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'hover:bg-white/10'
                                                        }`}
                                                        style={!isTagActive ? { color: 'hsl(var(--sidebar-foreground) / 0.7)' } : {}}
                                                    >
                                                        <Tag className="w-3 h-3 flex-shrink-0" style={{ color: tag.color || '#3B82F6' }} />
                                                        <span className="truncate">{tag.name}</span>
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </>
                                )}

                                {/* Etiquetas da Conversa */}
                                {tags.filter(t => t.type === 'conversation').length > 0 && (
                                    <>
                                        <div className="px-3 pt-2 pb-0.5 text-[9px] font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                            Etiquetas de Conversa
                                        </div>
                                        {tags.filter(t => t.type === 'conversation').map((tag) => {
                                            const isTagActive = filters.tag === tag.id;
                                            return (
                                                <div key={tag.id} className="relative flex items-center">
                                                    <div className="absolute left-[7px] w-[8px] h-[1px] opacity-20" style={{ backgroundColor: 'hsl(var(--sidebar-foreground))' }} />
                                                    <button
                                                        onClick={() => handleTagClick(tag.id)}
                                                        className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ml-4 ${
                                                            isTagActive ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'hover:bg-white/10'
                                                        }`}
                                                        style={!isTagActive ? { color: 'hsl(var(--sidebar-foreground) / 0.7)' } : {}}
                                                    >
                                                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color || '#3B82F6' }} />
                                                        {tag.icon && <span className="text-xs">{tag.icon}</span>}
                                                        <span className="truncate">{tag.name}</span>
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </>
                                )}
                            </>
                        )}
                        {/* Botão para criar nova etiqueta */}
                        <div className="relative flex items-center px-1 pt-1">
                            {/* Linha horizontal conectando ao item */}
                            <div
                                className="absolute left-[7px] w-[8px] h-[1px] opacity-20"
                                style={{ backgroundColor: 'hsl(var(--sidebar-foreground))' }}
                            />
                            <button
                                onClick={() => onNavigate('inbox-settings')}
                                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ml-4 hover:bg-white/10 text-blue-500"
                            >
                                <Plus className="w-4 h-4 flex-shrink-0" />
                                <span className="truncate text-xs">{t.newTag || 'Nova Etiqueta'}</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* 6. Configurações */}
            <button
                onClick={() => onNavigate('inbox-settings')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                    currentPage === 'inbox-settings'
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                        : 'hover:bg-white/10'
                }`}
                style={currentPage !== 'inbox-settings' ? { color: 'hsl(var(--sidebar-foreground) / 0.8)' } : {}}
            >
                <Settings className="w-5 h-5" />
                <span className="flex-1 text-left font-medium">{t.inboxSettings || 'Configurações'}</span>
            </button>

            {/* 7. Assistentes IA */}
            <button
                onClick={() => onNavigate('ai-assistants')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                    currentPage === 'ai-assistants'
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                        : 'hover:bg-white/10'
                }`}
                style={currentPage !== 'ai-assistants' ? { color: 'hsl(var(--sidebar-foreground) / 0.8)' } : {}}
            >
                <Bot className="w-5 h-5" />
                <span className="flex-1 text-left font-medium">{t.aiAssistants || 'Assistentes IA'}</span>
            </button>

            {/* 8. Automação */}
            <button
                onClick={() => onNavigate('automations')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                    currentPage === 'automations'
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                        : 'hover:bg-white/10'
                }`}
                style={currentPage !== 'automations' ? { color: 'hsl(var(--sidebar-foreground) / 0.8)' } : {}}
            >
                <Zap className="w-5 h-5" />
                <span className="flex-1 text-left font-medium">{t.automations || 'Automação'}</span>
            </button>
        </div>
    );
}
