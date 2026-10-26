// INBOX: Lista e gestão de canais com UI Moderna inspirada no Chatwoot
import { useState, useEffect } from 'react';
import { channelsApi } from '../../../services/api/inbox';
import { ChannelRow, ChannelDetailSheet, AddChannelSheet } from './ChannelRows';
import { MetaPagesSheet, readMetaReturn, startInstagramConnect, startMetaConnect, startWhatsAppConnect, type MetaProduct } from './MetaConnect';
import { EmptyState } from '../../base/EmptyState';
import { WhatsAppConnect } from './WhatsAppConnect';
import { WhatsAppCloudConnect } from './WhatsAppCloudConnect';
import { TelegramConnect } from './TelegramConnect';
import { FacebookConnect } from './FacebookConnect';
import { InstagramConnect } from './InstagramConnect';
import { WebsiteWidgetConnect } from './WebsiteWidgetConnect';
import { EmailConnect } from './EmailConnect';
import { TwilioSMSConnect } from './TwilioSMSConnect';
import type { Channel } from '../../../types/inbox';
import { toast } from 'sonner';
import { SkeletonChannelGrid } from '../../ui/skeletons';
import { brandIcon } from '../../base/BrandIcon';
import {
    Globe,
    Smartphone,
    Mail,
    Code,
    MessageSquare,
    Plus} from 'lucide-react';

// Configuração dos canais disponíveis para conexão
// Ordem: WhatsApp primeiro, depois Facebook, Instagram, Telegram e outros
const AVAILABLE_CHANNELS = [
    {
        // Ligação por código QR: só aparece para contas que já a usam (ver pickableChannels)
        id: 'whatsapp',
        name: 'WhatsApp (código QR)',
        description: 'Ligação pelo telemóvel',
        icon: brandIcon('whatsapp'),
        color: 'text-green-500',
        available: true,
        provider: 'evolution_api'
    },
    {
        id: 'whatsapp_cloud',
        name: 'WhatsApp Business',
        description: 'Ligue o número da sua empresa',
        icon: brandIcon('whatsapp'),
        color: 'text-green-600',
        available: true,
        provider: 'cloud_api'
    },
    {
        id: 'facebook',
        name: 'Facebook Messenger',
        description: 'Ligue a sua página do Facebook',
        icon: brandIcon('messenger'),
        color: 'text-blue-600',
        available: true
    },
    {
        id: 'instagram',
        name: 'Instagram',
        description: 'Ligue a sua conta do Instagram',
        icon: brandIcon('instagram'),
        color: 'text-pink-600',
        available: true
    },
    {
        id: 'telegram',
        name: 'Telegram',
        description: 'Ligue o seu bot do Telegram',
        icon: brandIcon('telegram'),
        color: 'text-blue-400',
        available: true
    },
    {
        id: 'website',
        name: 'Chat do site',
        description: 'Janela de conversa no seu site',
        icon: Globe,
        color: 'text-violet-500',
        available: true
    },
    {
        id: 'email',
        name: 'Email',
        description: 'Receba emails na caixa de entrada',
        icon: Mail,
        color: 'text-cyan-500',
        available: true
    },
    {
        id: 'sms',
        name: 'SMS',
        description: 'Mensagens SMS através do Twilio',
        icon: Smartphone,
        color: 'text-teal-500',
        available: true
    },
    {
        id: 'api',
        name: 'API',
        description: 'Crie um canal personalizado',
        icon: Code,
        color: 'text-muted-foreground',
        available: false
    }
];

export function ChannelsList() {
    const [channels, setChannels] = useState<Channel[]>([]);
    // O WhatsApp por código QR deixa de ser oferecido a contas novas; quem já o tem ligado
    // continua a vê-lo (para ligar outro número ou voltar a ligar)
    const pickableChannels = AVAILABLE_CHANNELS.filter(
        (c) => c.id !== 'whatsapp' || channels.some((ch) => ch.type === 'whatsapp'),
    );
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [cloudModalOpen, setCloudModalOpen] = useState(false);
    const [telegramModalOpen, setTelegramModalOpen] = useState(false);
    const [facebookModalOpen, setFacebookModalOpen] = useState(false);
    const [instagramModalOpen, setInstagramModalOpen] = useState(false);
    const [websiteModalOpen, setWebsiteModalOpen] = useState(false);
    const [emailModalOpen, setEmailModalOpen] = useState(false);
    const [smsModalOpen, setSmsModalOpen] = useState(false);
    const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
    const [detailChannel, setDetailChannel] = useState<Channel | null>(null);
    const [addOpen, setAddOpen] = useState(false);
    const [metaSession, setMetaSession] = useState<string | null>(null);

    // Facebook/Instagram: login da Meta; sem a app Meta configurada no servidor, formulário manual
    const connectMeta = async (product: MetaProduct, fallback: () => void) => {
        const started = await startMetaConnect(product);
        if (!started) fallback();
    };

    // Regresso do Facebook (?meta_session no URL; no app chega pelo evento do deep link)
    useEffect(() => {
        const handleReturn = () => {
            const ret = readMetaReturn();
            if (ret?.session) setMetaSession(ret.session);
            else if (ret?.whatsapp) {
                loadChannels();
                toast.success(`WhatsApp ${ret.whatsapp} ligado`, {
                    description: 'As mensagens começam a chegar à caixa de entrada.',
                    action: {
                        label: 'Ligar assistente',
                        onClick: () => {
                            window.history.pushState({ dashboardPage: true }, '', '/dashboard/inbox/ai-assistants');
                            window.dispatchEvent(new PopStateEvent('popstate'));
                        },
                    },
                });
            }
            else if (ret?.error) toast.error(ret.error);
        };
        handleReturn();
        window.addEventListener('meta-oauth-return', handleReturn);
        return () => window.removeEventListener('meta-oauth-return', handleReturn);
    }, []);

    const onMetaConnected = (result: { connected: { name: string }[]; failed: unknown[] }) => {
        loadChannels();
        if (!result.connected.length) return;
        if (!result.failed.length) setMetaSession(null);
        const names = result.connected.map((c) => c.name).join(', ');
        toast.success(result.connected.length === 1 ? `${names} ligado` : `Ligados: ${names}`, {
            description: 'As mensagens começam a chegar à caixa de entrada.',
            action: {
                label: 'Ligar assistente',
                onClick: () => {
                    window.history.pushState({ dashboardPage: true }, '', '/dashboard/inbox/ai-assistants');
                    window.dispatchEvent(new PopStateEvent('popstate'));
                },
            },
        });
    };

    // Abrir modal de edição para qualquer tipo de canal
    const openEditModal = (channel: Channel) => {
        setEditingChannel(channel);
        switch (channel.type) {
            case 'whatsapp': setModalOpen(true); break;
            case 'whatsapp_cloud': void startWhatsAppConnect().then((ok) => { if (!ok) setCloudModalOpen(true); }); break;
            case 'telegram': setTelegramModalOpen(true); break;
            case 'facebook': void connectMeta('facebook', () => setFacebookModalOpen(true)); break;
            case 'instagram': void startInstagramConnect().then((ok) => { if (!ok) setInstagramModalOpen(true); }); break;
            case 'website': setWebsiteModalOpen(true); break;
            case 'email': setEmailModalOpen(true); break;
            case 'twilio_sms': setSmsModalOpen(true); break;
            case 'sms': setSmsModalOpen(true); break;
        }
    };

    const closeModalAndResetEditing = (setModalFn: (value: boolean) => void) => {
        setModalFn(false);
        setEditingChannel(null);
    };

    useEffect(() => {
        loadChannels();
    }, []);

    const loadChannels = async () => {
        try {
            setLoading(true);
            const data = await channelsApi.getAll();
            setChannels(data);
        } catch (error) {
            console.error('Error loading channels:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleConnect = (channelId: string) => {
        setEditingChannel(null); // Criar novo, não editar
        if (channelId === 'whatsapp') {
            setModalOpen(true);
        } else if (channelId === 'whatsapp_cloud') {
            void startWhatsAppConnect().then((ok) => { if (!ok) setCloudModalOpen(true); });
        } else if (channelId === 'telegram') {
            setTelegramModalOpen(true);
        } else if (channelId === 'facebook') {
            void connectMeta('facebook', () => setFacebookModalOpen(true));
        } else if (channelId === 'instagram') {
            void startInstagramConnect().then((ok) => { if (!ok) setInstagramModalOpen(true); });
        } else if (channelId === 'website') {
            setWebsiteModalOpen(true);
        } else if (channelId === 'email') {
            setEmailModalOpen(true);
        } else if (channelId === 'sms') {
            setSmsModalOpen(true);
        } else {
            toast.info('Integração em breve!', {
                description: 'Estamos finalizando os últimos ajustes deste canal.'
            });
        }
    };

    const handleDelete = async (channel: Channel) => {
        if (!confirm(`Desligar o canal ${channel.name || ''}? As conversas antigas mantêm-se.`)) return;
        try {
            await channelsApi.delete(channel.id);
            setChannels(prev => prev.filter(c => c.id !== channel.id));
            toast.success('Canal removido');
        } catch (error) {
            toast.error('Erro ao remover canal');
        }
    };
    const handleRename = async (channel: Channel, newName: string) => {
        try {
            await channelsApi.update(channel.id, { name: newName });
            setChannels(prev => prev.map(c =>
                c.id === channel.id ? { ...c, name: newName } : c
            ));
            toast.success('Nome do canal atualizado');
        } catch (error: any) {
            console.error('Erro ao renomear canal:', error);
            toast.error(error?.response?.data?.error || 'Erro ao renomear canal');
        }
    };

    return (
        <div className="min-w-0">
            {/* Canais ligados: lista nativa; toque abre o detalhe */}
            <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-[15px] font-semibold text-foreground">Canais ligados</h2>
                {channels.length > 0 && (
                    <button
                        type="button"
                        onClick={() => setAddOpen(true)}
                        className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
                    >
                        Adicionar canal
                    </button>
                )}
            </div>

            {loading && channels.length === 0 ? (
                <SkeletonChannelGrid count={4} />
            ) : channels.length === 0 ? (
                <EmptyState
                    icon={MessageSquare}
                    title="Ainda não tem canais ligados"
                    description="Ligue o WhatsApp, o chat do site ou outro canal para receber conversas."
                    action={
                        <button
                            type="button"
                            onClick={() => setAddOpen(true)}
                            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                        >
                            Adicionar canal
                        </button>
                    }
                />
            ) : (
                <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                    {channels.map(channel => (
                        <ChannelRow key={channel.id} channel={channel} onOpen={setDetailChannel} />
                    ))}
                </ul>
            )}

            <ChannelDetailSheet
                channel={detailChannel}
                onClose={() => setDetailChannel(null)}
                onRename={async (channel, name) => {
                    await handleRename(channel, name);
                    setDetailChannel(prev => (prev && prev.id === channel.id ? { ...prev, name } : prev));
                }}
                onOpenSettings={(channel) => {
                    setDetailChannel(null);
                    openEditModal(channel);
                }}
                onDisconnect={async (channel) => {
                    await handleDelete(channel);
                    setDetailChannel(null);
                }}
                onSynced={() => loadChannels()}
            />

            <AddChannelSheet
                open={addOpen}
                onClose={() => setAddOpen(false)}
                channels={pickableChannels}
                onPick={handleConnect}
            />

            <MetaPagesSheet
                sessionId={metaSession}
                onClose={() => setMetaSession(null)}
                onConnected={onMetaConnected}
            />

            <WhatsAppConnect
                isOpen={modalOpen}
                onClose={() => closeModalAndResetEditing(setModalOpen)}
                onSuccess={() => {
                    closeModalAndResetEditing(setModalOpen);
                    loadChannels();
                    toast.success('Canal ligado!');
                }}
                editingChannel={editingChannel?.type === 'whatsapp' ? editingChannel : undefined}
            />

            <WhatsAppCloudConnect
                isOpen={cloudModalOpen}
                onClose={() => closeModalAndResetEditing(setCloudModalOpen)}
                onSuccess={() => {
                    closeModalAndResetEditing(setCloudModalOpen);
                    loadChannels();
                    toast.success('WhatsApp Business ligado');
                }}
                editingChannel={editingChannel?.type === 'whatsapp_cloud' ? editingChannel : undefined}
            />

            <TelegramConnect
                isOpen={telegramModalOpen}
                onClose={() => closeModalAndResetEditing(setTelegramModalOpen)}
                onSuccess={() => {
                    closeModalAndResetEditing(setTelegramModalOpen);
                    loadChannels();
                    toast.success('Telegram ligado!');
                }}
                editingChannel={editingChannel?.type === 'telegram' ? editingChannel : undefined}
            />

            <FacebookConnect
                isOpen={facebookModalOpen}
                onClose={() => closeModalAndResetEditing(setFacebookModalOpen)}
                onSuccess={() => {
                    closeModalAndResetEditing(setFacebookModalOpen);
                    loadChannels();
                    toast.success('Facebook Messenger ligado!');
                }}
                editingChannel={editingChannel?.type === 'facebook' ? editingChannel : undefined}
            />

            <InstagramConnect
                isOpen={instagramModalOpen}
                onClose={() => closeModalAndResetEditing(setInstagramModalOpen)}
                onSuccess={() => {
                    closeModalAndResetEditing(setInstagramModalOpen);
                    loadChannels();
                    toast.success('Instagram ligado!');
                }}
                editingChannel={editingChannel?.type === 'instagram' ? editingChannel : undefined}
            />

            <WebsiteWidgetConnect
                isOpen={websiteModalOpen}
                onClose={() => closeModalAndResetEditing(setWebsiteModalOpen)}
                onSuccess={() => {
                    closeModalAndResetEditing(setWebsiteModalOpen);
                    loadChannels();
                    toast.success('Chat do site configurado!');
                }}
                editingChannel={editingChannel?.type === 'website' ? editingChannel : undefined}
            />

            <EmailConnect
                isOpen={emailModalOpen}
                onClose={() => closeModalAndResetEditing(setEmailModalOpen)}
                onSuccess={() => {
                    closeModalAndResetEditing(setEmailModalOpen);
                    loadChannels();
                    toast.success('Canal de email criado!');
                }}
                editingChannel={editingChannel?.type === 'email' ? editingChannel : undefined}
            />
            <TwilioSMSConnect
                isOpen={smsModalOpen}
                onClose={() => closeModalAndResetEditing(setSmsModalOpen)}
                onSuccess={() => {
                    closeModalAndResetEditing(setSmsModalOpen);
                    loadChannels();
                    toast.success('Canal SMS configurado!');
                }}
                editingChannel={editingChannel?.type === 'twilio_sms' ? editingChannel : undefined}
            />        </div>
    );
}
