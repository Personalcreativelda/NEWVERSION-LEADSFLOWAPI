// INBOX: Card de canal de comunicação
import { useState } from 'react';
import type { Channel } from '../../../types/inbox';
import { channelsApi } from '../../../services/api/inbox';
import { toast } from 'sonner';
import { RefreshCw, Trash2, CheckCircle2, XCircle, Loader2, MessageCircle, Pencil, X, Check, Send, Facebook, Instagram, Mail, Globe, Cloud, Smartphone, Settings } from 'lucide-react';
import { getLocale } from '../../../utils/format';
import { BrandIcon } from '../../base/BrandIcon';

interface ChannelCardProps {
    channel: Channel;
    onEdit: (channel: Channel) => void;
    onDelete: (channel: Channel) => void;
    onSync: (channel: Channel) => void;
    onLinkInstance?: (channel: Channel, newInstanceId: string) => void;
    onRename?: (channel: Channel, newName: string) => void;
    loading?: boolean;
}

export function ChannelCard({ channel, onEdit, onDelete, onSync, onLinkInstance, onRename, loading }: ChannelCardProps) {
    const [syncing, setSyncing] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editInstance, setEditInstance] = useState(channel.credentials?.instance_name || channel.credentials?.instance_id || '');
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState(channel.name);

    const getIcon = (type: string) => {
        switch (type) {
            case 'whatsapp':
            case 'whatsapp_cloud':
                return <BrandIcon brand="whatsapp" className="w-5 h-5" />;
            case 'facebook':
                return <BrandIcon brand="messenger" className="w-5 h-5" />;
            case 'instagram':
                return <BrandIcon brand="instagram" className="w-5 h-5" />;
            case 'telegram':
                return <BrandIcon brand="telegram" className="w-5 h-5" />;
            case 'email':
                return <Mail className="w-5 h-5" />;
            case 'website':
                return <Globe className="w-5 h-5" />;
            case 'twilio_sms':
                return <Smartphone className="w-5 h-5" />;
            default:
                return <MessageCircle className="w-5 h-5" />;
        }
    };

    const getProviderLabel = () => {
        switch (channel.type) {
            case 'whatsapp_cloud': return 'Cloud API (Meta)';
            case 'whatsapp': return 'API não oficial';
            case 'telegram': return 'Telegram Bot';
            case 'facebook': return 'Facebook Messenger';
            case 'instagram': return 'Instagram Direct';
            case 'email': {
                const provider = channel.credentials?.provider;
                if (provider === 'gmail') return 'Gmail (SMTP/IMAP)';
                if (provider === 'outlook') return 'Microsoft (SMTP/IMAP)';
                if (provider === 'yahoo') return 'Yahoo (SMTP/IMAP)';
                return 'Email (SMTP/IMAP)';
            }
            case 'website': return 'Chat Widget';
            case 'twilio_sms': return 'Twilio SMS';
            default: return null;
        }
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
            case 'email':
                return 'bg-cyan-500 text-white';
            case 'website':
                return 'bg-purple-500 text-white';            case 'twilio_sms':
                return 'bg-teal-500 text-white';            default:
                return 'bg-muted-foreground text-white';
        }
    };

    // Cor da borda ativa por tipo de canal
    const getActiveBorderColor = (type: string) => {
        switch (type) {
            case 'whatsapp':
            case 'whatsapp_cloud':
                return '#22c55e'; // green
            case 'telegram':
                return '#3b82f6'; // blue
            case 'facebook':
                return '#2563eb'; // blue-600
            case 'instagram':
                return '#ec4899'; // pink
            case 'email':
                return '#06b6d4'; // cyan
            case 'website':
                return '#a855f7'; // purple
            default:
                return '#6b7280'; // gray
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'active': return 'bg-green-500';
            case 'inactive': return 'bg-muted-foreground/70';
            case 'error': return 'bg-red-500';
            case 'connecting': return 'bg-yellow-500';
            default: return 'bg-muted-foreground/70';
        }
    };

    const getStatusText = (status: string) => {
        switch (status) {
            case 'active': return 'Ligado';
            case 'inactive': return 'Desligado';
            case 'error': return 'Erro';
            case 'connecting': return 'A ligar';
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

    const handleDisconnect = () => {
        if (!confirm('Deseja realmente desligar este canal?')) return;
        onDelete(channel);
    };

    const activeBorderColor = getActiveBorderColor(channel.type);

    return (
        <div
            className="border rounded-xl overflow-hidden transition-shadow hover:shadow-lg"
            style={{
                backgroundColor: 'hsl(var(--card))',
                borderColor: channel.status === 'active' ? activeBorderColor : 'hsl(var(--border))'
            }}
        >
            {/* Header */}
            <div
                className="px-5 py-4 flex items-center justify-between"
                style={{ backgroundColor: 'hsl(var(--card))' }}
            >
                <div 
                    className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                    onClick={() => setExpanded(!expanded)}
                >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${getIconBgColor(channel.type)}`}>
                        {getIcon(channel.type)}
                    </div>
                    <div className="min-w-0 flex-1">
                        {isRenaming ? (
                            <div className="flex items-center gap-1">
                                <input
                                    type="text"
                                    value={renameValue}
                                    onChange={(e) => setRenameValue(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="px-1.5 py-0.5 text-sm rounded border w-full min-w-0"
                                    style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--background))', color: 'hsl(var(--foreground))' }}
                                    autoFocus
                                />
                                <button
                                    onClick={(e) => { e.stopPropagation(); if (onRename && renameValue.trim()) onRename(channel, renameValue.trim()); setIsRenaming(false); }}
                                    className="p-1 hover:bg-green-100 dark:hover:bg-green-900/30 rounded text-green-600 flex-shrink-0"
                                >
                                    <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setRenameValue(channel.name); setIsRenaming(false); }}
                                    className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-600 flex-shrink-0"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ) : (
                            <h4 className="font-semibold leading-tight flex items-center gap-2" style={{ color: 'hsl(var(--foreground))' }}>
                                <span className="truncate">{channel.name}</span>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setRenameValue(channel.name); setIsRenaming(true); }}
                                    className="p-0.5 hover:bg-muted/50 rounded flex-shrink-0"
                                    title="Editar nome do canal"
                                >
                                    <Pencil className="w-3 h-3" style={{ color: 'hsl(var(--muted-foreground))' }} />
                                </button>
                                {channel.status === 'active' && (
                                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: activeBorderColor }} />
                                )}
                            </h4>
                        )}
                        <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                            {getProviderLabel() || channel.type}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Botão de Configurações - SEMPRE VISÍVEL (exceto WhatsApp Evolution API) */}
                    {channel.type !== 'whatsapp' && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onEdit(channel);
                            }}
                            className="p-2 rounded-lg hover:bg-muted/50 transition-colors"
                            title="Definições do canal"
                        >
                            <Settings className="w-4 h-4" style={{ color: 'hsl(var(--muted-foreground))' }} />
                        </button>
                    )}

                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs whitespace-nowrap" style={{
                        backgroundColor: channel.status === 'active' ? `${activeBorderColor}1A` : 'hsl(var(--muted))',
                        color: channel.status === 'active' ? activeBorderColor : 'hsl(var(--muted-foreground))'
                    }}>
                        <div className={`w-2 h-2 rounded-full ${getStatusColor(channel.status)}`} />
                        <span>{getStatusText(channel.status)}</span>
                    </div>
                    
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="p-1"
                    >
                        <svg
                            className={`w-5 h-5 transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            style={{ color: 'hsl(var(--muted-foreground))' }}
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
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
                        {/* WhatsApp API não oficial */}
                        {channel.type === 'whatsapp' && (
                            <>
                                <div className="flex items-center gap-2 text-sm">
                                    <MessageCircle className="w-4 h-4" style={{ color: 'hsl(var(--muted-foreground))' }} />
                                    <span style={{ color: 'hsl(var(--muted-foreground))' }}>API não oficial</span>
                                </div>
                                {channel.credentials.instance_name && (
                                    <div className="text-xs flex items-center gap-2 min-w-0" style={{ color: 'hsl(var(--foreground))' }}>
                                        <span className="flex-shrink-0" style={{ color: 'hsl(var(--muted-foreground))' }}>Instância: </span>
                                        {isEditing ? (
                                            <div className="flex items-center gap-1 min-w-0 flex-1">
                                                <input
                                                    type="text"
                                                    value={editInstance}
                                                    onChange={(e) => setEditInstance(e.target.value)}
                                                    className="px-2 py-1 text-xs rounded border font-mono flex-1 min-w-0"
                                                    style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--background))' }}
                                                    autoFocus
                                                />
                                                <button onClick={() => { if (onLinkInstance && editInstance.trim()) onLinkInstance(channel, editInstance.trim()); setIsEditing(false); }}
                                                    className="p-1 hover:bg-green-100 dark:hover:bg-green-900/30 rounded text-green-600 flex-shrink-0">
                                                    <Check className="w-3 h-3" />
                                                </button>
                                                <button onClick={() => { setEditInstance(channel.credentials?.instance_name || channel.credentials?.instance_id || ''); setIsEditing(false); }}
                                                    className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-600 flex-shrink-0">
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1 min-w-0 flex-1">
                                                <code className="font-mono truncate min-w-0 flex-1">{channel.credentials.instance_name || channel.credentials.instance_id}</code>
                                                <button onClick={() => { setEditInstance(channel.credentials?.instance_name || channel.credentials?.instance_id || ''); setIsEditing(true); }} className="p-1 hover:bg-muted/50 rounded flex-shrink-0" title="Editar instância">
                                                    <Pencil className="w-3 h-3" style={{ color: 'hsl(var(--muted-foreground))' }} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        )}

                        {/* Cloud API */}
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
                            </>
                        )}

                        {/* Telegram */}
                        {channel.type === 'telegram' && (
                            <>
                                <div className="flex items-center gap-2 text-sm">
                                    <Send className="w-4 h-4" style={{ color: 'hsl(var(--muted-foreground))' }} />
                                    <span style={{ color: 'hsl(var(--muted-foreground))' }}>Telegram Bot API</span>
                                </div>
                                {channel.credentials?.bot_username && (
                                    <div className="text-xs" style={{ color: 'hsl(var(--foreground))' }}>
                                        <span style={{ color: 'hsl(var(--muted-foreground))' }}>Bot: </span>
                                        <code className="font-mono">@{channel.credentials.bot_username}</code>
                                    </div>
                                )}
                            </>
                        )}

                        {/* Email */}
                        {channel.type === 'email' && (
                            <>
                                <div className="flex items-center gap-2 text-sm">
                                    <Mail className="w-4 h-4" style={{ color: 'hsl(var(--muted-foreground))' }} />
                                    <span style={{ color: 'hsl(var(--muted-foreground))' }}>
                                        {channel.credentials?.provider === 'gmail' ? 'Gmail' :
                                         channel.credentials?.provider === 'outlook' ? 'Microsoft' :
                                         channel.credentials?.provider === 'yahoo' ? 'Yahoo' : 'Email SMTP/IMAP'}
                                    </span>
                                </div>
                                {channel.credentials?.email && (
                                    <div className="text-xs" style={{ color: 'hsl(var(--foreground))' }}>
                                        <span style={{ color: 'hsl(var(--muted-foreground))' }}>Email: </span>
                                        <code className="font-mono">{channel.credentials.email}</code>
                                    </div>
                                )}
                                {channel.credentials?.smtp?.host && (
                                    <div className="text-xs" style={{ color: 'hsl(var(--foreground))' }}>
                                        <span style={{ color: 'hsl(var(--muted-foreground))' }}>SMTP: </span>
                                        <code className="font-mono">{channel.credentials.smtp.host}:{channel.credentials.smtp.port}</code>
                                    </div>
                                )}
                                {channel.credentials?.imap?.host && (
                                    <div className="text-xs" style={{ color: 'hsl(var(--foreground))' }}>
                                        <span style={{ color: 'hsl(var(--muted-foreground))' }}>IMAP: </span>
                                        <code className="font-mono">{channel.credentials.imap.host}:{channel.credentials.imap.port}</code>
                                    </div>
                                )}
                            </>
                        )}

                        {/* Twilio SMS */}
                        {channel.type === 'twilio_sms' && (
                            <>
                                <div className="flex items-center gap-2 text-sm">
                                    <Smartphone className="w-4 h-4" style={{ color: 'hsl(var(--muted-foreground))' }} />
                                    <span style={{ color: 'hsl(var(--muted-foreground))' }}>Twilio SMS/MMS</span>
                                </div>
                                {channel.credentials?.phoneNumber && (
                                    <div className="text-xs" style={{ color: 'hsl(var(--foreground))' }}>
                                        <span style={{ color: 'hsl(var(--muted-foreground))' }}>Número: </span>
                                        <code className="font-mono">{channel.credentials.phoneNumber}</code>
                                    </div>
                                )}
                                {channel.credentials?.accountSid && (
                                    <div className="text-xs" style={{ color: 'hsl(var(--foreground))' }}>
                                        <span style={{ color: 'hsl(var(--muted-foreground))' }}>Account SID: </span>
                                        <code className="font-mono">{channel.credentials.accountSid}</code>
                                    </div>
                                )}
                            </>
                        )}

                        {/* Phone number */}
                        {channel.credentials?.phone_number && (
                            <div className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
                                <span className="text-lg"></span>
                                <div>
                                    <span className="font-semibold" style={{ color: 'hsl(var(--foreground))' }}>{channel.credentials.phone_number}</span>
                                    <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Canal ligado e pronto para enviar mensagens.</p>
                                </div>
                            </div>
                        )}

                        {channel.last_sync_at && (
                            <div className="text-xs pt-2" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                Última sincronização: {new Date(channel.last_sync_at).toLocaleString(getLocale())}
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex gap-2">
                            <button onClick={handleSync} disabled={syncing || loading}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors hover:bg-muted/50"
                                style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}>
                                {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                {syncing ? 'A sincronizar...' : 'Sincronizar'}
                            </button>

                            {(channel.status === 'error' || channel.status === 'inactive') && channel.type === 'whatsapp' && (
                                <button onClick={() => onEdit(channel)} disabled={loading}
                                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-white bg-green-600 hover:bg-green-700 transition-colors">
                                    Reconectar
                                </button>
                            )}
                        </div>

                        <div className="flex gap-2">
                            <button onClick={() => onDelete(channel)} disabled={loading}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                                <Trash2 className="w-4 h-4" />
                                Apagar
                            </button>

                            <button onClick={handleDisconnect} disabled={loading}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors">
                                <XCircle className="w-4 h-4" />
                                Desligar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
