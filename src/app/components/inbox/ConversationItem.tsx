// INBOX: Item da lista de conversas modernizado
import React from 'react';
import type { ConversationWithDetails, ConversationTagInfo } from '../../types/inbox';
import {
    MessageCircle,
    Facebook,
    Instagram,
    Send,
    User,
    Users,
    Clock,
    Check,
    CheckCheck,
    Mail,
    Globe,
    Smartphone,
    Cloud,
    Tag
} from 'lucide-react';

interface ConversationItemProps {
    conversation: ConversationWithDetails;
    isSelected: boolean;
    onClick: () => void;
}

// Mapa de cores para etiquetas do funil de vendas
const FUNNEL_STAGE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    novo: { bg: 'bg-cyan-100 dark:bg-cyan-900/30', text: 'text-cyan-700 dark:text-cyan-400', border: 'border-cyan-300 dark:border-cyan-700' },
    new: { bg: 'bg-cyan-100 dark:bg-cyan-900/30', text: 'text-cyan-700 dark:text-cyan-400', border: 'border-cyan-300 dark:border-cyan-700' },
    contatado: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-400', border: 'border-purple-300 dark:border-purple-700' },
    qualificado: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-400', border: 'border-yellow-300 dark:border-yellow-700' },
    negociacao: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400', border: 'border-orange-300 dark:border-orange-700' },
    convertido: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', border: 'border-green-300 dark:border-green-700' },
    perdido: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', border: 'border-red-300 dark:border-red-700' },
};

const FUNNEL_STAGE_LABELS: Record<string, string> = {
    novo: 'Novo', new: 'Novo', contatado: 'Contatado', qualificado: 'Qualificado',
    negociacao: 'Negociação', convertido: 'Convertido', perdido: 'Perdido',
};

export function ConversationItem({ conversation, isSelected, onClick }: ConversationItemProps) {
    const contact = conversation.contact;
    const lastMessage = conversation.last_message;
    const channel = conversation.channel;
    const isGroup = (conversation as any).is_group || conversation.metadata?.is_group || contact?.is_group;

    // Coletar todas as etiquetas para exibição
    const leadStatus = (contact as any)?.status || conversation.metadata?.lead_status;
    const leadTags: string[] = (contact as any)?.tags || conversation.metadata?.tags || [];
    const conversationTags: ConversationTagInfo[] = (conversation as any).conversation_tags || [];

    // Formatar data
    const formatDate = (dateString?: string) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        const now = new Date();

        if (date.toDateString() === now.toDateString()) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        if (date.toDateString() === yesterday.toDateString()) {
            return 'Ontem';
        }
        
        return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
    };

    // Gerar cor de avatar baseada no nome
    const getAvatarColor = (name: string) => {
        const colors = [
            'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500', 
            'bg-indigo-500', 'bg-cyan-500', 'bg-orange-500', 'bg-teal-500'
        ];
        const index = name.charCodeAt(0) % colors.length;
        return colors[index];
    };

    const ChannelBadge = () => {
        switch (channel?.type) {
            case 'whatsapp':
                return (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                        <MessageCircle size={10} />
                        WhatsApp
                    </span>
                );
            case 'whatsapp_cloud':
                return (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                        <Cloud size={10} />
                        WhatsApp Cloud
                    </span>
                );
            case 'telegram':
                return (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400">
                        <Send size={10} />
                        Telegram
                    </span>
                );
            case 'facebook':
                return (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                        <Facebook size={10} />
                        Facebook
                    </span>
                );
            case 'instagram':
                return (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400">
                        <Instagram size={10} />
                        Instagram
                    </span>
                );
            case 'email':
                return (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400">
                        <Mail size={10} />
                        Email
                    </span>
                );
            case 'website':
                return (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">
                        <Globe size={10} />
                        Website
                    </span>
                );
            case 'twilio_sms':
            case 'sms':
            case 'twilio':
                return (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400">
                        <Smartphone size={10} />
                        SMS
                    </span>
                );
            default:
                return null;
        }
    };

    return (
        <div
            onClick={onClick}
            className={`
                relative flex items-center gap-3 px-4 py-3 cursor-pointer transition-all duration-150
                ${isSelected
                    ? 'bg-blue-50 dark:bg-blue-950/40'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                }
            `}
            style={{ borderBottomWidth: '1px', borderBottomColor: 'hsl(var(--border))' }}
        >
            {/* Avatar */}
            <div className="relative flex-shrink-0">
                <div 
                    className={`w-11 h-11 rounded-full flex items-center justify-center overflow-hidden ${
                        contact?.avatar_url ? '' : getAvatarColor(contact?.name || '?')
                    }`}
                >
                    {contact?.avatar_url ? (
                        <img 
                            src={contact.avatar_url} 
                            alt={contact.name} 
                            className="w-full h-full object-cover"
                            onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                                (e.target as HTMLImageElement).parentElement!.innerHTML = `
                                    <span class="font-semibold text-lg text-white">
                                        ${(contact?.name || '?').charAt(0).toUpperCase()}
                                    </span>
                                `;
                            }}
                        />
                    ) : isGroup ? (
                        <Users size={18} className="text-white" />
                    ) : (
                        <span className="font-semibold text-lg text-white">
                            {(contact?.name || '?').charAt(0).toUpperCase()}
                        </span>
                    )}
                </div>

                {/* Online indicator */}
                <div 
                    className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 rounded-full"
                    style={{ borderColor: isSelected ? 'hsl(210 40% 96.1%)' : 'hsl(var(--card))' }}
                />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-0.5">
                    <h4 
                        className={`text-sm font-semibold truncate ${conversation.unread_count > 0 ? 'font-bold' : ''}`}
                        style={{ color: 'hsl(var(--foreground))' }}
                    >
                        {contact?.name || contact?.phone || 'Desconhecido'}
                    </h4>
                    <span 
                        className={`text-[11px] whitespace-nowrap ml-2 ${conversation.unread_count > 0 ? 'text-blue-600 dark:text-blue-400 font-semibold' : ''}`}
                        style={conversation.unread_count === 0 ? { color: 'hsl(var(--muted-foreground))' } : undefined}
                    >
                        {formatDate(conversation.last_message_at)}
                    </span>
                </div>

                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                    <ChannelBadge />
                    {isGroup && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 font-medium">
                            Grupo
                        </span>
                    )}
                    {/* Etiqueta do funil de vendas (status do lead) */}
                    {leadStatus && leadStatus !== 'novo' && leadStatus !== 'new' && (
                        <span 
                            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium border ${
                                FUNNEL_STAGE_COLORS[leadStatus]?.bg || 'bg-gray-100 dark:bg-gray-800'
                            } ${
                                FUNNEL_STAGE_COLORS[leadStatus]?.text || 'text-gray-600 dark:text-gray-400'
                            } ${
                                FUNNEL_STAGE_COLORS[leadStatus]?.border || 'border-gray-300 dark:border-gray-600'
                            }`}
                        >
                            {FUNNEL_STAGE_LABELS[leadStatus] || leadStatus}
                        </span>
                    )}
                    {/* Etiquetas do lead (tags criadas na dashboard) */}
                    {leadTags.slice(0, 2).map((tag, idx) => (
                        <span 
                            key={`lt-${idx}`}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800"
                        >
                            <Tag size={8} />
                            {tag}
                        </span>
                    ))}
                    {/* Etiquetas da conversa (conversation_tags) */}
                    {conversationTags.slice(0, 2).map((tag) => (
                        <span 
                            key={`ct-${tag.id}`}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium border"
                            style={{
                                backgroundColor: `${tag.color}15`,
                                color: tag.color,
                                borderColor: `${tag.color}40`,
                            }}
                        >
                            {tag.icon && <span className="text-[8px]">{tag.icon}</span>}
                            {tag.name}
                        </span>
                    ))}
                    {/* Indicador de mais etiquetas */}
                    {(leadTags.length + conversationTags.length) > 4 && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                            +{(leadTags.length + conversationTags.length) - 4}
                        </span>
                    )}
                </div>

                <div className="flex justify-between items-center gap-2">
                    <p 
                        className={`text-xs truncate flex-1 ${conversation.unread_count > 0 ? 'font-medium' : ''}`}
                        style={{ color: conversation.unread_count > 0 ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))' }}
                    >
                        {lastMessage?.direction === 'out' && (
                            <span className="inline-block mr-1 align-middle">
                                {lastMessage.status === 'read' ? (
                                    <CheckCheck size={14} className="text-blue-500 inline" />
                                ) : lastMessage.status === 'delivered' ? (
                                    <CheckCheck size={14} className="inline opacity-60" />
                                ) : (
                                    <Check size={14} className="inline opacity-60" />
                                )}
                            </span>
                        )}
                        {lastMessage?.content || 'Nenhuma mensagem...'}
                    </p>

                    {conversation.unread_count > 0 && (
                        <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                            {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
