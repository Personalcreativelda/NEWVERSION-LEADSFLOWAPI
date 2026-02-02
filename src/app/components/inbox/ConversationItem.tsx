// INBOX: Item da lista de conversas modernizado
import React from 'react';
import type { ConversationWithDetails } from '../../types/inbox';
import {
    MessageCircle,
    Facebook,
    Instagram,
    Send,
    User,
    Users,
    Clock,
    Check,
    CheckCheck
} from 'lucide-react';

interface ConversationItemProps {
    conversation: ConversationWithDetails;
    isSelected: boolean;
    onClick: () => void;
}

export function ConversationItem({ conversation, isSelected, onClick }: ConversationItemProps) {
    const contact = conversation.contact;
    const lastMessage = conversation.last_message;
    const channel = conversation.channel;
    const isGroup = (conversation as any).is_group || conversation.metadata?.is_group || contact?.is_group;

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

                <div className="flex items-center gap-2 mb-1">
                    <ChannelBadge />
                    {isGroup && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 font-medium">
                            Grupo
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
