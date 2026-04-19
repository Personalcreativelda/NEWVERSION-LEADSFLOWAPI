// INBOX: Conversation item - ManyChat-style
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

// Mapa de cores para etiquetas do funil de vendas - simplified with opacity pattern
const FUNNEL_STAGE_COLORS: Record<string, { bg: string; text: string }> = {
    novo: { bg: 'bg-cyan-500/10', text: 'text-cyan-600 dark:text-cyan-400' },
    new: { bg: 'bg-cyan-500/10', text: 'text-cyan-600 dark:text-cyan-400' },
    contatado: { bg: 'bg-purple-500/10', text: 'text-purple-600 dark:text-purple-400' },
    qualificado: { bg: 'bg-yellow-500/10', text: 'text-yellow-600 dark:text-yellow-400' },
    negociacao: { bg: 'bg-orange-500/10', text: 'text-orange-600 dark:text-orange-400' },
    convertido: { bg: 'bg-green-500/10', text: 'text-green-600 dark:text-green-400' },
    perdido: { bg: 'bg-red-500/10', text: 'text-red-600 dark:text-red-400' },
};

const FUNNEL_STAGE_LABELS: Record<string, string> = {
    novo: 'Novo', new: 'Novo', contatado: 'Contatado', qualificado: 'Qualificado',
    negociacao: 'Negociação', convertido: 'Convertido', perdido: 'Perdido',
};

// Channel icon colors (small colored dot instead of full badge in list)
const CHANNEL_COLORS: Record<string, string> = {
    whatsapp: '#25D366',
    whatsapp_cloud: '#25D366',
    telegram: '#0088cc',
    facebook: '#1877F2',
    instagram: '#E4405F',
    email: '#0891b2',
    website: '#7c3aed',
    twilio_sms: '#0d9488',
    sms: '#0d9488',
    twilio: '#0d9488',
};

export function ConversationItem({ conversation, isSelected, onClick }: ConversationItemProps) {
    const contact = conversation.contact;
    const lastMessage = conversation.last_message;
    const channel = conversation.channel;
    const isGroup = (conversation as any).is_group || conversation.metadata?.is_group || contact?.is_group;
    const avatarUrl = isGroup
        ? (conversation.metadata?.group_picture || conversation.metadata?.profile_picture || contact?.avatar_url || null)
        : (contact?.avatar_url || null);
    const displayName = isGroup
        ? (conversation.metadata?.group_name || contact?.name || 'Grupo WhatsApp')
        : (contact?.name || contact?.phone || 'Desconhecido');

    const leadStatus = (contact as any)?.status || conversation.metadata?.lead_status;
    const leadTags: string[] = (contact as any)?.tags || conversation.metadata?.tags || [];
    const conversationTags: ConversationTagInfo[] = (conversation as any).conversation_tags || [];

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

    const getAvatarColor = (name: string) => {
        const colors = [
            'from-blue-500 to-blue-600', 'from-emerald-500 to-emerald-600', 
            'from-violet-500 to-violet-600', 'from-pink-500 to-pink-600', 
            'from-indigo-500 to-indigo-600', 'from-cyan-500 to-cyan-600', 
            'from-amber-500 to-amber-600', 'from-teal-500 to-teal-600'
        ];
        const index = name.charCodeAt(0) % colors.length;
        return colors[index];
    };

    const channelColor = CHANNEL_COLORS[channel?.type || ''] || '#6b7280';

    const messagePreview = lastMessage ? (() => {
        const senderName = isGroup && lastMessage.direction === 'in'
            ? ((lastMessage as any).sender_name || (lastMessage as any).contact_name || null)
            : null;
        const content = lastMessage.media_type
            ? (lastMessage.media_type.startsWith('image') ? '📷 Imagem' : lastMessage.media_type.startsWith('video') ? '🎥 Vídeo' : lastMessage.media_type.startsWith('audio') ? '🎤 Áudio' : '📎 Arquivo')
            : (lastMessage.content || '');
        return senderName ? `~ ${senderName}: ${content}` : content;
    })() : 'Nenhuma mensagem...';

    const hasUnread = conversation.unread_count > 0;

    return (
        <div
            onClick={onClick}
            className={`
                group relative flex items-start gap-3 px-4 py-4 cursor-pointer border-b border-border/50
                transition-colors duration-150
                ${isSelected
                    ? 'bg-primary/[0.07] dark:bg-primary/[0.12]'
                    : 'hover:bg-muted/60 active:bg-muted/80'
                }
            `}
        >
            {/* Blue left accent bar for selected */}
            {isSelected && (
                <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-primary" />
            )}

            {/* Avatar */}
            <div className="relative flex-shrink-0">
                <div 
                    className={`w-12 h-12 rounded-full flex items-center justify-center overflow-hidden ${
                        avatarUrl ? '' : `bg-gradient-to-br ${getAvatarColor(displayName || '?')}`
                    }`}
                >
                    {avatarUrl ? (
                        <img 
                            src={avatarUrl} 
                            alt={displayName} 
                            className="w-full h-full object-cover"
                            onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                                (e.target as HTMLImageElement).parentElement!.innerHTML = isGroup
                                    ? `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`
                                    : `<span class="font-semibold text-base text-white">${(displayName || '?').charAt(0).toUpperCase()}</span>`;
                            }}
                        />
                    ) : isGroup ? (
                        <Users size={18} className="text-white" />
                    ) : (
                        <span className="font-semibold text-base text-white">
                            {(displayName || '?').charAt(0).toUpperCase()}
                        </span>
                    )}
                </div>

                {/* Channel color indicator (bottom-right dot) */}
                <div 
                    className="absolute -bottom-0 -right-0 w-4 h-4 rounded-full border-2 border-card"
                    style={{ backgroundColor: channelColor }}
                />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pt-0.5">
                {/* Row 1: Name + Time */}
                <div className="flex justify-between items-center gap-2 mb-0.5">
                    <h4 
                        className={`text-[14px] truncate text-foreground ${hasUnread ? 'font-bold' : 'font-medium'}`}
                    >
                        {displayName}
                    </h4>
                    <span 
                        className={`text-[11px] whitespace-nowrap flex-shrink-0 ${hasUnread ? 'font-semibold text-primary' : 'text-muted-foreground'}`}
                    >
                        {formatDate(conversation.last_message_at)}
                    </span>
                </div>

                {/* Row 2: Message preview + unread badge */}
                <div className="flex items-center gap-2">
                    <p 
                        className={`text-[13px] truncate flex-1 leading-relaxed ${hasUnread ? 'font-medium text-foreground/80' : 'text-muted-foreground'}`}
                    >
                        {lastMessage?.direction === 'out' && (
                            <span className="inline-block mr-1 align-middle">
                                {lastMessage.status === 'read' ? (
                                    <CheckCheck size={13} className="text-blue-500 inline" />
                                ) : lastMessage.status === 'delivered' ? (
                                    <CheckCheck size={13} className="inline opacity-50" />
                                ) : (
                                    <Check size={13} className="inline opacity-50" />
                                )}
                            </span>
                        )}
                        {messagePreview}
                    </p>

                    {hasUnread && (
                        <span className="flex-shrink-0 min-w-[22px] h-[22px] px-1.5 text-[11px] font-bold rounded-full flex items-center justify-center text-white bg-primary shadow-sm">
                            {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
                        </span>
                    )}
                </div>

                {/* Row 3: Tags (compact) */}
                {((leadStatus && leadStatus !== 'novo' && leadStatus !== 'new') || leadTags.length > 0 || conversationTags.length > 0) && (
                    <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                        {leadStatus && leadStatus !== 'novo' && leadStatus !== 'new' && (
                            <span 
                                className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium ${
                                    FUNNEL_STAGE_COLORS[leadStatus]?.bg || 'bg-muted'
                                } ${
                                    FUNNEL_STAGE_COLORS[leadStatus]?.text || 'text-muted-foreground'
                                }`}
                            >
                                {FUNNEL_STAGE_LABELS[leadStatus] || leadStatus}
                            </span>
                        )}
                        {leadTags.slice(0, 2).map((tag, idx) => (
                            <span 
                                key={`lt-${idx}`}
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-primary/10 text-primary dark:text-blue-400"
                            >
                                <Tag size={7} />
                                {tag}
                            </span>
                        ))}
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
                    </div>
                )}
            </div>
        </div>
    );
}
