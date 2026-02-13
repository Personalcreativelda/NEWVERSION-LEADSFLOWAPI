import React, { useState, useEffect } from 'react';
import {
    ChevronRight, ChevronDown, Inbox, Hash, Tag, AtSign, Bell, Settings, Bot, Zap,
    MessageCircle, Instagram, Facebook, Send, Mail, Cloud, Globe
} from 'lucide-react';
import { channelsApi } from '../../services/api/inbox';
import { useInboxFilters, type InboxFilterType } from '../../hooks/useInboxFilters';

interface InboxTreeMenuProps {
    currentPage: string;
    onNavigate: (page: string, queryParams?: Record<string, string>) => void;
    isExpanded: boolean;
    translations: any;
}

// Status fixos da aplicação
const STATUS_OPTIONS = [
    { value: 'novo', label: 'Novo', color: 'text-cyan-500' },
    { value: 'contatado', label: 'Contactado', color: 'text-purple-500' },
    { value: 'qualificado', label: 'Qualificado', color: 'text-yellow-500' },
    { value: 'negociacao', label: 'Negociação', color: 'text-orange-500' },
    { value: 'convertido', label: 'Convertido', color: 'text-green-500' },
    { value: 'perdido', label: 'Perdido', color: 'text-red-500' },
];

export default function InboxTreeMenu({ currentPage, onNavigate, isExpanded, translations: t }: InboxTreeMenuProps) {
    const [showChannels, setShowChannels] = useState(false);
    const [showStatus, setShowStatus] = useState(false);
    const [channels, setChannels] = useState<any[]>([]);
    const [loadingChannels, setLoadingChannels] = useState(false);
    
    // Usar hook centralizado de filtros
    const { filters, setFilterType, setChannelFilter, setStatusFilter, clearFilters } = useInboxFilters();
    
    // Determinar estado ativo baseado nos filtros
    const isInboxActive = currentPage === 'inbox' || currentPage === 'inbox-conversations';
    const isAllConversationsActive = isInboxActive && filters.type === 'all' && !filters.channel && !filters.status;
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

    // Fetch channels when expanding
    useEffect(() => {
        if (showChannels && channels.length === 0) {
            loadChannels();
        }
    }, [showChannels]);

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

    const handleStatusClick = (status: string) => {
        // Definir filtro de status (mantém outros filtros)
        setStatusFilter(status);
        onNavigate('inbox', { status });
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

            {/* 5. Status - Dropdown */}
            <div>
                <button
                    onClick={() => setShowStatus(!showStatus)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                        filters.status ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
                    } hover:bg-white/10`}
                    style={{ color: 'hsl(var(--sidebar-foreground) / 0.8)' }}
                >
                    {showStatus ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <Tag className="w-5 h-5" />
                    <span className="flex-1 text-left font-medium">{t.status || 'Status'}</span>
                    {filters.status && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-500">1</span>
                    )}
                </button>

                {showStatus && (
                    <div className="ml-6 mt-1 space-y-0.5 relative">
                        {/* Linha vertical para os itens do dropdown Status */}
                        <div 
                            className="absolute left-[7px] top-0 bottom-0 w-[1px] opacity-20"
                            style={{ backgroundColor: 'hsl(var(--sidebar-foreground))' }}
                        />
                        {STATUS_OPTIONS.map((status) => {
                            const isStatusActive = filters.status === status.value;
                            return (
                                <div key={status.value} className="relative flex items-center">
                                    {/* Linha horizontal conectando ao item */}
                                    <div
                                        className="absolute left-[7px] w-[8px] h-[1px] opacity-20"
                                        style={{ backgroundColor: 'hsl(var(--sidebar-foreground))' }}
                                    />
                                    <button
                                        onClick={() => handleStatusClick(status.value)}
                                        className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ml-4 ${
                                            isStatusActive
                                                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                                                : 'hover:bg-white/10'
                                        }`}
                                        style={!isStatusActive ? { color: 'hsl(var(--sidebar-foreground) / 0.7)' } : {}}
                                    >
                                        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${status.color.replace('text-', 'bg-')}`} />
                                        <span className="truncate">{status.label}</span>
                                    </button>
                                </div>
                            );
                        })}
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
