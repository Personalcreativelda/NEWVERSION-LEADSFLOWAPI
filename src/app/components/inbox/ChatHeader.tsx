// INBOX: Chat header - ManyChat-style with channel badge & resolve
import React, { useState, useRef, useEffect } from 'react';
import type { ConversationWithDetails } from '../../types/inbox';
import {
    MoreVertical,
    Phone,
    Video,
    User,
    ChevronLeft,
    Search,
    CheckCircle2,
    MessageCircle,
    Edit2,
    Trash2,
    X,
    Cloud,
    Send,
    Facebook,
    Instagram,
    Mail,
    Globe,
    Smartphone
} from 'lucide-react';

interface ChatHeaderProps {
    conversation: ConversationWithDetails;
    onBack?: () => void;
    onEditLead?: () => void;
    onDeleteConversation?: () => void;
    onSearchInChat?: (query: string) => void;
    layoutControls?: React.ReactNode;
}

// Channel display config
const CHANNEL_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    whatsapp: { label: 'WhatsApp', color: '#25D366', icon: MessageCircle },
    whatsapp_cloud: { label: 'WA Cloud', color: '#25D366', icon: Cloud },
    telegram: { label: 'Telegram', color: '#0088cc', icon: Send },
    facebook: { label: 'Facebook', color: '#1877F2', icon: Facebook },
    instagram: { label: 'Instagram', color: '#E4405F', icon: Instagram },
    email: { label: 'Email', color: '#0891b2', icon: Mail },
    website: { label: 'Website', color: '#7c3aed', icon: Globe },
    twilio_sms: { label: 'SMS', color: '#0d9488', icon: Smartphone },
    sms: { label: 'SMS', color: '#0d9488', icon: Smartphone },
    twilio: { label: 'SMS', color: '#0d9488', icon: Smartphone },
};

export function ChatHeader({ conversation, onBack, onEditLead, onDeleteConversation, onSearchInChat, layoutControls }: ChatHeaderProps) {
    const [showMenu, setShowMenu] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const menuRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    
    const contactName = conversation.contact?.name || conversation.contact?.phone || 'Contato';
    const isOnline = true;
    const channelType = conversation.channel?.type || 'whatsapp';
    const channelInfo = CHANNEL_CONFIG[channelType];
    const ChannelIcon = channelInfo?.icon || MessageCircle;

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setShowMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (showSearch && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [showSearch]);

    const handleSearchSubmit = () => {
        if (searchQuery.trim() && onSearchInChat) {
            onSearchInChat(searchQuery.trim());
        }
    };

    const getAvatarColor = (name: string) => {
        const colors = [
            'from-blue-500 to-blue-600', 'from-emerald-500 to-emerald-600', 
            'from-violet-500 to-violet-600', 'from-pink-500 to-pink-600', 
            'from-indigo-500 to-indigo-600', 'from-cyan-500 to-cyan-600'
        ];
        const index = name.charCodeAt(0) % colors.length;
        return colors[index];
    };

    return (
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shadow-sm">

            {/* Left: Contact Info */}
            <div className="flex items-center gap-3 min-w-0">
                {onBack && (
                    <button
                        onClick={onBack}
                        className="md:hidden p-1.5 -ml-1 rounded-lg text-muted-foreground hover:bg-muted/50 transition-all"
                    >
                        <ChevronLeft size={20} />
                    </button>
                )}

                {/* Avatar */}
                <div className="relative flex-shrink-0">
                    <div 
                        className={`w-9 h-9 rounded-full flex items-center justify-center overflow-hidden ${
                            conversation.contact?.avatar_url ? '' : `bg-gradient-to-br ${getAvatarColor(contactName)}`
                        }`}
                    >
                        {conversation.contact?.avatar_url ? (
                            <img 
                                src={conversation.contact.avatar_url} 
                                alt={contactName} 
                                className="w-full h-full object-cover" 
                            />
                        ) : (
                            <span className="font-semibold text-sm text-white">
                                {contactName.charAt(0).toUpperCase()}
                            </span>
                        )}
                    </div>
                    {isOnline && (
                        <div 
                            className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-card rounded-full"
                        />
                    )}
                </div>

                {/* Name & status */}
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <h2 className="text-[14px] font-semibold truncate text-foreground">
                            {contactName}
                        </h2>
                        {/* Online dot */}
                        {isOnline && (
                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full flex-shrink-0" />
                        )}
                    </div>
                </div>

                {/* Channel Badge (ManyChat-style pill) */}
                {channelInfo && (
                    <span 
                        className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border"
                        style={{
                            color: channelInfo.color,
                            borderColor: `${channelInfo.color}30`,
                            backgroundColor: `${channelInfo.color}10`,
                        }}
                    >
                        <ChannelIcon size={12} />
                        {channelInfo.label}
                    </span>
                )}
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
                {/* Layout controls slot */}
                {layoutControls && (
                    <div className="flex items-center border-r border-border/60 pr-1.5 mr-0.5">
                        {layoutControls}
                    </div>
                )}
                {showSearch ? (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-muted">
                        <Search size={14} className="text-muted-foreground" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()}
                            placeholder="Buscar..."
                            className="w-32 sm:w-40 bg-transparent text-sm text-foreground outline-none"
                        />
                        <button 
                            onClick={() => { setShowSearch(false); setSearchQuery(''); }}
                            className="p-0.5 rounded text-muted-foreground hover:bg-muted"
                        >
                            <X size={14} />
                        </button>
                    </div>
                ) : (
                    <>
                        {/* Resolve button (ManyChat-style) */}
                        <button 
                            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-muted-foreground transition-all duration-150 hover:bg-muted hover:text-foreground hover:border-border/80"
                            title="Resolver conversa"
                        >
                            <CheckCircle2 size={14} />
                            Resolve
                        </button>

                        <button 
                            onClick={() => setShowSearch(true)}
                            className="p-2 rounded-lg text-muted-foreground hover:bg-muted/50 transition-all"
                            title="Buscar"
                        >
                            <Search size={16} />
                        </button>
                    </>
                )}
                
                {/* More Options Menu */}
                <div className="relative" ref={menuRef}>
                    <button 
                        onClick={() => setShowMenu(!showMenu)}
                        className="p-2 rounded-lg text-muted-foreground hover:bg-muted/50 transition-all"
                        title="Mais opções"
                    >
                        <MoreVertical size={16} />
                    </button>
                    
                    {showMenu && (
                        <div 
                            className="absolute top-full right-0 mt-1 w-48 rounded-lg border border-border shadow-lg bg-card overflow-hidden z-50"
                        >
                            <button
                                onClick={() => { onEditLead?.(); setShowMenu(false); }}
                                className="w-full px-3 py-2.5 flex items-center gap-2.5 text-sm text-foreground hover:bg-muted/50 transition-colors"
                            >
                                <Edit2 className="w-3.5 h-3.5" />
                                Editar Lead
                            </button>
                            <div className="border-t border-border" />
                            <button
                                onClick={() => {
                                    if (window.confirm('Tem certeza que deseja apagar esta conversa? Todas as mensagens serão removidas.')) {
                                        onDeleteConversation?.();
                                    }
                                    setShowMenu(false);
                                }}
                                className="w-full px-3 py-2.5 flex items-center gap-2.5 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-red-600 dark:text-red-400"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                Apagar conversa
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
