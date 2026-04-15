// INBOX: Cabeçalho do Chat modernizado
import React, { useState, useRef, useEffect } from 'react';
import type { ConversationWithDetails } from '../../types/inbox';
import {
    MoreVertical,
    Phone,
    User,
    ChevronLeft,
    Search,
    MessageCircle,
    X,
    LogOut,
    Trash2,
    Eraser,
    Info
} from 'lucide-react';
import { useConfirm } from '../ui/ConfirmDialog';

interface ChatHeaderProps {
    conversation: ConversationWithDetails;
    onBack?: () => void;
    onEditLead?: () => void;
    onDeleteConversation?: () => void;
    onClearConversation?: () => void;
    onCloseConversation?: () => void;
    onShowDetails?: () => void;
    onSearchInChat?: (query: string) => void;
}

export function ChatHeader({ conversation, onBack, onEditLead, onDeleteConversation, onClearConversation, onCloseConversation, onShowDetails, onSearchInChat }: ChatHeaderProps) {
    const [showMenu, setShowMenu] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const menuRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const confirm = useConfirm();
    
    const isGroup = (conversation as any).is_group || conversation.metadata?.is_group;
    const contactName = isGroup
        ? (conversation.metadata?.group_name || conversation.contact?.name || 'Grupo WhatsApp')
        : (conversation.contact?.name || conversation.contact?.phone || 'Contato');
    const contactAvatar = isGroup
        ? (conversation.metadata?.group_picture || conversation.metadata?.profile_picture || conversation.contact?.avatar_url || null)
        : (conversation.contact?.avatar_url || null);
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
                            contactAvatar ? '' : getAvatarColor(contactName)
                        }`}
                    >
                        {contactAvatar ? (
                            <img 
                                src={contactAvatar} 
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
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-white" style={{ backgroundColor: '#16a34a' }}>
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
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border" style={{ borderColor: 'hsl(var(--border))' }}>
                        <input
                            ref={searchInputRef}
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()}
                            placeholder="Buscar na conversa..."
                            className="w-36 sm:w-52 bg-transparent text-sm outline-none"
                            style={{ color: 'hsl(var(--foreground))' }}
                        />
                        <button 
                            onClick={() => { setShowSearch(false); setSearchQuery(''); onSearchInChat?.(''); }}
                            className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
                            style={{ color: 'hsl(var(--muted-foreground))' }}
                        >
                            <X size={15} />
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
                            title="Buscar na conversa"
                        >
                            <Search size={18} />
                        </button>
                    </>
                )}
                
                {/* More Options Menu */}
                <div className="relative" ref={menuRef}>
                    <button 
                        onClick={() => setShowMenu(!showMenu)}
                        className={`p-2 rounded-full transition-all ${showMenu ? 'bg-gray-100 dark:bg-gray-800' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                        style={{ color: 'hsl(var(--muted-foreground))' }}
                        title="Mais opções"
                    >
                        <MoreVertical size={18} />
                    </button>
                    
                    {showMenu && (
                        <div 
                            className="absolute top-full right-0 mt-1 w-52 rounded-xl border shadow-xl overflow-hidden z-50 py-1"
                            style={{
                                backgroundColor: 'hsl(var(--card))',
                                borderColor: 'hsl(var(--border))'
                            }}
                        >
                            {/* Detalhes */}
                            <button
                                onClick={() => { onShowDetails?.(); setShowMenu(false); }}
                                className="w-full px-4 py-2.5 flex items-center gap-3 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                style={{ color: 'hsl(var(--foreground))' }}
                            >
                                <Info size={16} style={{ color: 'hsl(var(--muted-foreground))' }} />
                                Detalhes do contato
                            </button>

                            {/* Buscar */}
                            <button
                                onClick={() => { setShowSearch(true); setShowMenu(false); }}
                                className="w-full px-4 py-2.5 flex items-center gap-3 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                style={{ color: 'hsl(var(--foreground))' }}
                            >
                                <Search size={16} style={{ color: 'hsl(var(--muted-foreground))' }} />
                                Buscar na conversa
                            </button>

                            <div className="my-1 border-t" style={{ borderColor: 'hsl(var(--border))' }} />

                            {/* Fechar */}
                            <button
                                onClick={() => { onCloseConversation?.(); setShowMenu(false); }}
                                className="w-full px-4 py-2.5 flex items-center gap-3 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                style={{ color: 'hsl(var(--foreground))' }}
                            >
                                <LogOut size={16} style={{ color: 'hsl(var(--muted-foreground))' }} />
                                Fechar conversa
                            </button>

                            <div className="my-1 border-t" style={{ borderColor: 'hsl(var(--border))' }} />

                            {/* Limpar */}
                            <button
                                onClick={async () => {
                                    setShowMenu(false);
                                    const ok = await confirm('Todas as mensagens serão apagadas do histórico, mas a conversa continuará existindo.', {
                                        title: 'Limpar conversa',
                                        confirmLabel: 'Limpar',
                                        variant: 'danger',
                                    });
                                    if (ok) onClearConversation?.();
                                }}
                                className="w-full px-4 py-2.5 flex items-center gap-3 text-sm hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors text-orange-600 dark:text-orange-400"
                            >
                                <Eraser size={16} />
                                Limpar conversa
                            </button>

                            {/* Eliminar */}
                            <button
                                onClick={async () => {
                                    setShowMenu(false);
                                    const ok = await confirm('A conversa e todas as mensagens serão eliminadas permanentemente.', {
                                        title: 'Eliminar conversa',
                                        confirmLabel: 'Eliminar',
                                        variant: 'danger',
                                    });
                                    if (ok) onDeleteConversation?.();
                                }}
                                className="w-full px-4 py-2.5 flex items-center gap-3 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-red-600 dark:text-red-400"
                            >
                                <Trash2 size={16} />
                                Eliminar conversa
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
