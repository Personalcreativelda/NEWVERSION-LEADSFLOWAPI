// INBOX: Conversation item - ManyChat-style
import React from 'react';
import type { ConversationWithDetails, ConversationTagInfo } from '../../types/inbox';
import { formatRelativeDay } from '../../utils/format';
import { usableImageUrl } from '../../utils/media-url';
import {
    MessageCircle,
    Users,
    Check,
    CheckCheck,
    Mail,
    Globe,
    Smartphone,
    Tag,
    UserCheck,
    AlertCircle
} from 'lucide-react';
import { BrandIcon } from '../base/BrandIcon';

interface ConversationItemProps {
    conversation: ConversationWithDetails;
    isSelected: boolean;
    onClick: (conversation: ConversationWithDetails) => void;
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

const CHANNEL_COLORS: Record<string, string> = {
    whatsapp: '#25D366',
    whatsapp_cloud: '#25D366',
    telegram: '#0088cc',
    facebook: '#1877F2',
    instagram: '#E4405F',
    email: '#0891b2',
    email_gmail: '#EA4335',
    email_outlook: '#0078D4',
    email_yahoo: '#6001D2',
    website: '#7c3aed',
    twilio_sms: '#0d9488',
    sms: '#0d9488',
    twilio: '#0d9488',
};


// Outlook icon
const OutlookIcon = ({ size = 10 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="white">
        <rect x="2" y="4" width="13" height="16" rx="1.5" fill="white" fillOpacity="0.3" stroke="white" strokeWidth="1.5"/>
        <rect x="9" y="7" width="13" height="10" rx="1" fill="white" fillOpacity="0.5" stroke="white" strokeWidth="1.5"/>
        <circle cx="15.5" cy="12" r="2.5" fill="white"/>
    </svg>
);

function ChannelIcon({ type, provider, size = 10 }: { type: string; provider?: string | null; size?: number }) {
    const cls = 'text-white';
    if (type === 'email') {
        if (provider === 'gmail') return <BrandIcon brand="gmail" mono className={cls} style={{ width: size, height: size }} />;
        if (provider === 'outlook') return <OutlookIcon size={size} />;
        return <Mail size={size} className={cls} />;
    }
    switch (type) {
        case 'whatsapp':
        case 'whatsapp_cloud':
            return <BrandIcon brand="whatsapp" mono className="text-white" style={{ width: size, height: size }} />;
        case 'instagram':
            return <BrandIcon brand="instagram" mono className={cls} style={{ width: size, height: size }} />;
        case 'facebook':
            return <BrandIcon brand="messenger" mono className={cls} style={{ width: size, height: size }} />;
        case 'telegram':
            return <BrandIcon brand="telegram" mono className={cls} style={{ width: size, height: size }} />;
        case 'website':
            return <Globe size={size} className={cls} />;
        case 'sms':
        case 'twilio_sms':
        case 'twilio':
            return <Smartphone size={size} className={cls} />;
        default:
            return <MessageCircle size={size} className={cls} />;
    }
}

/**
 * Texto da pré-visualização: sem o negrito "**assunto**" dos emails nem regras de CSS que
 * emails antigos trazem no texto ("#outlook a{padding:0}"), numa só linha.
 */
function previewText(text: string): string {
    // Email ("**assunto**\n\ntexto"): mostra o assunto, como no Gmail
    const subject = text.match(/^\s*\*\*([^*]+)\*\*/);
    if (subject) return subject[1].trim();
    return text
        .replace(/[#.@]?[\w\-:>*[\]=]*\s*\{[^{}]*:[^{}]*\}/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function ConversationItemView({ conversation, isSelected, onClick }: ConversationItemProps) {
    const contact = conversation.contact;
    const lastMessage = conversation.last_message;
    const channel = conversation.channel;
    const isGroup = (conversation as any).is_group || conversation.metadata?.is_group || contact?.is_group;
    const avatarUrl = usableImageUrl(isGroup
        ? (conversation.metadata?.group_picture || conversation.metadata?.profile_picture || contact?.avatar_url || null)
        : (contact?.avatar_url || null));
    const displayName = isGroup
        ? (conversation.metadata?.group_name || contact?.name || 'Grupo WhatsApp')
        : (contact?.name || contact?.phone || 'Desconhecido');

    const leadStatus = (contact as any)?.status || conversation.metadata?.lead_status;
    const leadTags: string[] = (contact as any)?.tags || conversation.metadata?.tags || [];
    const conversationTags: ConversationTagInfo[] = (conversation as any).conversation_tags || [];

    // Hoje → hora; "Ontem"; dia da semana nesta semana; 21/10 para mais antigas (locale ativo)
    const formatDate = (dateString?: string) => formatRelativeDay(dateString, 'time');


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

    const emailProvider = channel?.type === 'email' ? (channel?.provider || null) : null;
    const channelColorKey = emailProvider ? `email_${emailProvider}` : (channel?.type || '');
    const channelColor = CHANNEL_COLORS[channelColorKey] || CHANNEL_COLORS[channel?.type || ''] || '#6b7280';

    const messagePreview = lastMessage ? (() => {
        const senderName = isGroup && lastMessage.direction === 'in'
            ? ((lastMessage as any).sender_name || (lastMessage as any).contact_name || null)
            : null;
        const content = lastMessage.media_type
            ? (lastMessage.media_type.startsWith('image') ? 'Imagem' : lastMessage.media_type.startsWith('video') ? 'Vídeo' : lastMessage.media_type.startsWith('audio') ? 'Áudio' : 'Ficheiro')
            : previewText(lastMessage.content || '');
        return senderName ? `~ ${senderName}: ${content}` : content;
    })() : 'Nenhuma mensagem...';

    const hasUnread = conversation.unread_count > 0;

    return (
        <div
            onClick={() => onClick(conversation)}
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

                {/* Channel icon badge (bottom-right) */}
                <div
                    className="absolute -bottom-0.5 -right-0.5 w-[18px] h-[18px] rounded-full border-2 border-card flex items-center justify-center"
                    style={{ backgroundColor: channelColor }}
                >
                    <ChannelIcon type={channel?.type || ''} provider={channel?.provider} size={9} />
                </div>
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

                {/* Row 2: Message preview + badges */}
                <div className="flex items-center gap-2">
                    {/* Pending escalation badge */}
                    {conversation.status === 'pending' && !hasUnread && (
                        <span className="flex-shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                            <AlertCircle size={8} />
                            Pendente
                        </span>
                    )}
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
                        <span
                            className="flex-shrink-0 min-w-[22px] h-[22px] px-1.5 text-[11px] font-bold rounded-full flex items-center justify-center bg-primary text-primary-foreground"
                        >
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

                        {/* Assignee badge */}
                        {(conversation as any).assignee && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 ml-auto">
                                <UserCheck size={8} />
                                {((conversation as any).assignee.name || '').split(' ')[0]}
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// Só redesenha a conversa que mudou (nova mensagem, lida…), não a lista inteira
export const ConversationItem = React.memo(ConversationItemView);
