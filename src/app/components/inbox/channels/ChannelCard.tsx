// INBOX: Card de canal de comunicação
import React, { useState } from 'react';
import type { Channel } from '../../../types/inbox';
import { channelsApi } from '../../../services/api/inbox';
import { toast } from 'sonner';
import { RefreshCw, Trash2, Settings, CheckCircle2, XCircle, Loader2, MessageCircle, ExternalLink, Pencil, X, Check, Send, Facebook, Instagram } from 'lucide-react';

interface ChannelCardProps {
    channel: Channel;
    onEdit: (channel: Channel) => void;
    onDelete: (channel: Channel) => void;
    onSync: (channel: Channel) => void;
    onRename?: (channel: Channel, newName: string) => void;
    loading?: boolean;
}

export function ChannelCard({ channel, onEdit, onDelete, onSync, onRename, loading }: ChannelCardProps) {
    const [syncing, setSyncing] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(channel.name);

    const getIcon = (type: string) => {
        switch (type) {
            case 'whatsapp': 
            case 'whatsapp_cloud':
                return (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                );
            case 'facebook': 
                return <Facebook className="w-5 h-5" />;
            case 'instagram': 
                return <Instagram className="w-5 h-5" />;
            case 'telegram': 
                return <Send className="w-5 h-5" />;
            default: 
                return <MessageCircle className="w-5 h-5" />;
        }
    };

    const getProviderLabel = () => {
        if (channel.type === 'whatsapp_cloud') {
            return 'Cloud API (Meta)';
        } else if (channel.type === 'whatsapp') {
            return 'API não oficial';
        } else if (channel.type === 'telegram') {
            return 'Telegram Bot';
        } else if (channel.type === 'facebook') {
            return 'Facebook Messenger';
        } else if (channel.type === 'instagram') {
            return 'Instagram Direct';
        }
        return null;
    };

    const getIconBgColor = (type: string) => {
        switch (type) {
            case 'whatsapp':
            case 'whatsapp_cloud':
                return 'bg-green-500 text-white';
            case 'telegram':
                return 'bg-blue-500 text-white';
            case 'facebook':
                return 'bg-blue-600 text-white';
            case 'instagram':
                return 'bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 text-white';
            default:
                return 'bg-gray-500 text-white';
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'active': return 'bg-green-500';
            case 'inactive': return 'bg-gray-400';
            case 'error': return 'bg-red-500';
            case 'connecting': return 'bg-yellow-500';
            default: return 'bg-gray-400';
        }
    };

    const getStatusText = (status: string) => {
        switch (status) {
            case 'active': return 'Conectado';
            case 'inactive': return 'Desconectado';
            case 'error': return 'Erro';
            case 'connecting': return 'Conectando';
            default: return status;
        }
    };

    const handleSync = async () => {
        try {
            setSyncing(true);
            await channelsApi.sync(channel.id);
            toast.success('Canal sincronizado!');
            onSync(channel);
        } catch (error) {
            toast.error('Erro ao sincronizar');
        } finally {
            setSyncing(false);
        }
    };

    const handleDisconnect = async () => {
        if (!confirm('Deseja realmente desconectar este canal?')) return;
        try {
            await channelsApi.delete(channel.id);
            toast.success('Canal desconectado');
            onDelete(channel);
        } catch (error) {
            toast.error('Erro ao desconectar');
        }
    };

    return (
        <div 
            className="border rounded-xl overflow-hidden transition-shadow hover:shadow-lg"
            style={{ 
                backgroundColor: 'hsl(var(--card))',
                borderColor: channel.status === 'active' ? 'hsl(142 76% 36%)' : 'hsl(var(--border))'
            }}
        >
            {/* Header */}
            <div 
                className="px-5 py-4 flex items-center justify-between cursor-pointer"
                onClick={() => setExpanded(!expanded)}
                style={{ backgroundColor: 'hsl(var(--card))' }}
            >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div 
                        className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${getIconBgColor(channel.type)}`}
                    >
                        {getIcon(channel.type)}
                    </div>
                    <div className="min-w-0 flex-1">
                        <h4 className="font-semibold leading-tight flex items-center gap-2 truncate" style={{ color: 'hsl(var(--foreground))' }}>
                            <span className="truncate">{channel.name}</span>
                            {channel.status === 'active' && (
                                <CheckCircle2 className="w-4 h-4 text-green-500" />
                            )}
                        </h4>
                        <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                            {getProviderLabel() || channel.type}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs whitespace-nowrap" style={{ 
                        backgroundColor: channel.status === 'active' ? 'hsl(142 76% 36% / 0.15)' : 'hsl(var(--muted))',
                        color: channel.status === 'active' ? 'hsl(142 76% 36%)' : 'hsl(var(--muted-foreground))'
                    }}>
                        <div className={`w-2 h-2 rounded-full ${getStatusColor(channel.status)}`} />
                        <span>{getStatusText(channel.status)}</span>
                    </div>
                    <svg 
                        className={`w-5 h-5 transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`} 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                        style={{ color: 'hsl(var(--muted-foreground))' }}
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </div>

            {/* Expanded Content */}
            {expanded && (
                <div 
                    className="px-5 pb-5 pt-2 border-t animate-fadeIn"
                    style={{ borderColor: 'hsl(var(--border))' }}
                >
                    {/* Channel Details */}
                    <div 
                        className="p-4 rounded-lg mb-4 space-y-2"
                        style={{ backgroundColor: 'hsl(var(--muted))' }}
                    >
                        {/* API não oficial details */}
                        {channel.type === 'whatsapp' && (
                            <>
                                <div className="flex items-center gap-2 text-sm">
                                    <MessageCircle className="w-4 h-4" style={{ color: 'hsl(var(--muted-foreground))' }} />
                                    <span style={{ color: 'hsl(var(--muted-foreground))' }}>API não oficial</span>
                                </div>
                                {channel.credentials.instance_name && (
                                    <div className="text-xs flex items-center gap-2" style={{ color: 'hsl(var(--foreground))' }}>
                                        <span style={{ color: 'hsl(var(--muted-foreground))' }}>Instância: </span>
                                        {isEditing ? (
                                            <div className="flex items-center gap-1">
                                                <input
                                                    type="text"
                                                    value={editName}
                                                    onChange={(e) => setEditName(e.target.value)}
                                                    className="px-2 py-1 text-xs rounded border font-mono"
                                                    style={{ 
                                                        borderColor: 'hsl(var(--border))',
                                                        backgroundColor: 'hsl(var(--background))'
                                                    }}
                                                    autoFocus
                                                />
                                                <button
                                                    onClick={() => {
                                                        if (onRename && editName.trim()) {
                                                            onRename(channel, editName.trim());
                                                        }
                                                        setIsEditing(false);
                                                    }}
                                                    className="p-1 hover:bg-green-100 dark:hover:bg-green-900/30 rounded text-green-600"
                                                >
                                                    <Check className="w-3 h-3" />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setEditName(channel.name);
                                                        setIsEditing(false);
                                                    }}
                                                    className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-600"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1">
                                                <code className="font-mono">{channel.credentials.instance_name || channel.credentials.instance_id}</code>
                                                <button
                                                    onClick={() => setIsEditing(true)}
                                                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                                                    title="Editar nome"
                                                >
                                                    <Pencil className="w-3 h-3" style={{ color: 'hsl(var(--muted-foreground))' }} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        )}

                        {/* Cloud API details */}
                        {channel.type === 'whatsapp_cloud' && (
                            <>
                                <div className="flex items-center gap-2 text-sm">
                                    <svg className="w-4 h-4" style={{ color: 'hsl(var(--muted-foreground))' }} viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                                    </svg>
                                    <span style={{ color: 'hsl(var(--muted-foreground))' }}>WhatsApp Cloud API (Oficial)</span>
                                </div>
                                {channel.credentials.phone_number_id && (
                                    <div className="text-xs" style={{ color: 'hsl(var(--foreground))' }}>
                                        <span style={{ color: 'hsl(var(--muted-foreground))' }}>Phone Number ID: </span>
                                        <code className="font-mono">{channel.credentials.phone_number_id}</code>
                                    </div>
                                )}
                                {channel.credentials.waba_id && (
                                    <div className="text-xs" style={{ color: 'hsl(var(--foreground))' }}>
                                        <span style={{ color: 'hsl(var(--muted-foreground))' }}>WABA ID: </span>
                                        <code className="font-mono">{channel.credentials.waba_id}</code>
                                    </div>
                                )}
                            </>
                        )}

                        {/* Phone number if available */}
                        {channel.credentials.phone_number && (
                            <div className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
                                <span className="text-lg">📱</span>
                                <div>
                                    <span className="font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                                        {channel.credentials.phone_number}
                                    </span>
                                    <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                        Seu WhatsApp está conectado e pronto para enviar mensagens.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Last sync */}
                        {channel.last_sync_at && (
                            <div className="text-xs pt-2" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                Última sincronização: {new Date(channel.last_sync_at).toLocaleString('pt-BR')}
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between">
                        <div className="flex gap-2">
                            <button
                                onClick={handleSync}
                                disabled={syncing || loading}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                                style={{ 
                                    borderColor: 'hsl(var(--border))',
                                    color: 'hsl(var(--foreground))'
                                }}
                            >
                                {syncing ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <RefreshCw className="w-4 h-4" />
                                )}
                                {syncing ? 'Sincronizando...' : 'Sincronizar'}
                            </button>

                            {/* Show Reconnect button for error/inactive status */}
                            {(channel.status === 'error' || channel.status === 'inactive') && channel.type === 'whatsapp' && (
                                <button
                                    onClick={() => onEdit(channel)}
                                    disabled={loading}
                                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-white bg-green-600 hover:bg-green-700 transition-colors"
                                >
                                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                    </svg>
                                    Reconectar
                                </button>
                            )}
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={() => onDelete(channel)}
                                disabled={loading}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            >
                                <Trash2 className="w-4 h-4" />
                                Apagar Instância
                            </button>
                            
                            <button
                                onClick={handleDisconnect}
                                disabled={loading}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
                            >
                                <XCircle className="w-4 h-4" />
                                Desconectar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
