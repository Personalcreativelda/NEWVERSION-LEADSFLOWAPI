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
    Tag,
    UserCheck
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

// WhatsApp SVG icon (not in lucide-react)
const WhatsAppIcon = ({ size = 10 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="white">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
        <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.126 1.533 5.859L.057 23.428a.75.75 0 0 0 .921.921l5.569-1.476A11.942 11.942 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75c-1.9 0-3.685-.513-5.218-1.408l-.374-.22-3.878 1.027 1.027-3.878-.22-.374A9.716 9.716 0 0 1 2.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/>
    </svg>
);

// Gmail M icon
const GmailIcon = ({ size = 10 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M2 6l10 7L22 6" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
        <path d="M2 6v12h20V6L12 13 2 6z" fill="white" fillOpacity="0.3" stroke="white" strokeWidth="1.5"/>
    </svg>
);

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
        if (provider === 'gmail') return <GmailIcon size={size} />;
        if (provider === 'outlook') return <OutlookIcon size={size} />;
        return <Mail size={size} className={cls} />;
    }
    switch (type) {
        case 'whatsapp':
        case 'whatsapp_cloud':
            return <WhatsAppIcon size={size} />;
        case 'instagram':
            return <Instagram size={size} className={cls} />;
        case 'facebook':
            return <Facebook size={size} className={cls} />;
        case 'telegram':
            return <Send size={size} className={cls} />;
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

    const emailProvider = channel?.type === 'email' ? (channel?.provider || null) : null;
    const channelColorKey = emailProvider ? `email_${emailProvider}` : (channel?.type || '');
    const channelColor = CHANNEL_COLORS[channelColorKey] || CHANNEL_COLORS[channel?.type || ''] || '#6b7280';

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
                        <span
                            className="flex-shrink-0 min-w-[22px] h-[22px] px-1.5 text-[11px] font-bold rounded-full flex items-center justify-center text-white shadow-sm"
                            style={{ backgroundColor: channelColor }}
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
