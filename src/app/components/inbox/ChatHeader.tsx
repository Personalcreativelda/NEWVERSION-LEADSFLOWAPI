// INBOX: Cabeçalho do Chat modernizado
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
    X
} from 'lucide-react';

interface ChatHeaderProps {
    conversation: ConversationWithDetails;
    onBack?: () => void;
    onEditLead?: () => void;
    onDeleteConversation?: () => void;
    onSearchInChat?: (query: string) => void;
}

export function ChatHeader({ conversation, onBack, onEditLead, onDeleteConversation, onSearchInChat }: ChatHeaderProps) {
    const [showMenu, setShowMenu] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const menuRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    
    const contactName = conversation.contact?.name || conversation.contact?.phone || 'Contato';
    const isOnline = true; // TODO: Implementar real status
    const channelType = conversation.channel?.type || 'whatsapp';

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setShowMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Focus search input when opened
    useEffect(() => {
        if (showSearch && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [showSearch]);

    // Handle search submit
    const handleSearchSubmit = () => {
        if (searchQuery.trim() && onSearchInChat) {
            onSearchInChat(searchQuery.trim());
        }
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

    return (
        <div 
            className="flex items-center justify-between px-4 py-3 border-b transition-colors"
            style={{ 
                backgroundColor: 'hsl(var(--card))',
                borderColor: 'hsl(var(--border))'
            }}
        >

            {/* Contact Info */}
            <div className="flex items-center gap-3">
                {onBack && (
                    <button
                        onClick={onBack}
                        className="md:hidden p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
                        style={{ color: 'hsl(var(--muted-foreground))' }}
                    >
                        <ChevronLeft size={20} />
                    </button>
                )}

                <div className="relative">
                    <div 
                        className={`w-10 h-10 rounded-full flex items-center justify-center overflow-hidden ${
                            conversation.contact?.avatar_url ? '' : getAvatarColor(contactName)
                        }`}
                    >
                        {conversation.contact?.avatar_url ? (
                            <img 
                                src={conversation.contact.avatar_url} 
                                alt={contactName} 
                                className="w-full h-full object-cover" 
                            />
                        ) : (
                            <span className="font-semibold text-white">
                                {contactName.charAt(0).toUpperCase()}
                            </span>
                        )}
                    </div>
                    {isOnline && (
                        <div 
                            className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 rounded-full"
                            style={{ borderColor: 'hsl(var(--card))' }}
                        />
                    )}
                </div>

                <div>
                    <h2 
                        className="text-sm md:text-base font-semibold truncate max-w-[150px] md:max-w-xs flex items-center gap-1.5"
                        style={{ color: 'hsl(var(--foreground))' }}
                    >
                        {contactName}
                    </h2>
                    <div className="flex items-center gap-1.5 text-[11px]">
                        {/* Channel Badge */}
                        {channelType === 'whatsapp' && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                                <MessageCircle size={10} />
                                WhatsApp
                            </span>
                        )}
                        <span className="text-green-500 dark:text-green-400 font-medium">
                            {isOnline ? 'Online' : 'Offline'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1">
                {showSearch ? (
                    <div className="flex items-center gap-2 px-2 py-1 rounded-full border" style={{ borderColor: 'hsl(var(--border))' }}>
                        <input
                            ref={searchInputRef}
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()}
                            placeholder="Buscar na conversa..."
                            className="w-32 sm:w-48 bg-transparent text-sm outline-none"
                            style={{ color: 'hsl(var(--foreground))' }}
                        />
                        <button 
                            onClick={() => { setShowSearch(false); setSearchQuery(''); }}
                            className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
                            style={{ color: 'hsl(var(--muted-foreground))' }}
                        >
                            <X size={16} />
                        </button>
                    </div>
                ) : (
                    <>
                        <button 
                            className="hidden sm:flex p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
                            style={{ color: 'hsl(var(--muted-foreground))' }}
                            title="Ligar"
                        >
                            <Phone size={18} />
                        </button>
                        <button 
                            onClick={() => setShowSearch(true)}
                            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
                            style={{ color: 'hsl(var(--muted-foreground))' }}
                            title="Buscar"
                        >
                            <Search size={18} />
                        </button>
                    </>
                )}
                
                {/* More Options Menu */}
                <div className="relative" ref={menuRef}>
                    <button 
                        onClick={() => setShowMenu(!showMenu)}
                        className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
                        style={{ color: 'hsl(var(--muted-foreground))' }}
                        title="Mais opções"
                    >
                        <MoreVertical size={18} />
                    </button>
                    
                    {showMenu && (
                        <div 
                            className="absolute top-full right-0 mt-1 w-48 rounded-lg border shadow-lg overflow-hidden z-50"
                            style={{
                                backgroundColor: 'hsl(var(--card))',
                                borderColor: 'hsl(var(--border))'
                            }}
                        >
                            <button
                                onClick={() => { onEditLead?.(); setShowMenu(false); }}
                                className="w-full px-4 py-3 flex items-center gap-3 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                style={{ color: 'hsl(var(--foreground))' }}
                            >
                                <Edit2 className="w-4 h-4" />
                                Editar Lead
                            </button>
                            <div className="border-t" style={{ borderColor: 'hsl(var(--border))' }} />
                            <button
                                onClick={() => {
                                    if (window.confirm('Tem certeza que deseja apagar esta conversa? Todas as mensagens serão removidas.')) {
                                        onDeleteConversation?.();
                                    }
                                    setShowMenu(false);
                                }}
                                className="w-full px-4 py-3 flex items-center gap-3 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-red-600 dark:text-red-400"
                            >
                                <Trash2 className="w-4 h-4" />
                                Apagar conversa
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
