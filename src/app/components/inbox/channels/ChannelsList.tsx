// INBOX: Lista e gestão de canais com UI Moderna inspirada no Chatwoot
import React, { useState, useEffect } from 'react';
import { channelsApi } from '../../../services/api/inbox';
import { ChannelCard } from './ChannelCard';
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
import {
    Globe,
    Facebook,
    MessageCircle,
    Cloud,
    Smartphone,
    Mail,
    Code,
    Send,
    Instagram,
    MessageSquare,
    Search,
    Plus,
    Settings,
    ChevronDown,
    ChevronRight
} from 'lucide-react';

// Configuração dos canais disponíveis para conexão
// Ordem: WhatsApp primeiro, depois Facebook, Instagram, Telegram e outros
const AVAILABLE_CHANNELS = [
    {
        id: 'whatsapp',
        name: 'WhatsApp',
        description: 'API não oficial',
        icon: MessageCircle,
        color: 'text-green-500',
        available: true,
        provider: 'evolution_api'
    },
    {
        id: 'whatsapp_cloud',
        name: 'WhatsApp Cloud',
        description: 'API Oficial da Meta',
        icon: Cloud,
        color: 'text-green-600',
        available: true,
        provider: 'cloud_api'
    },
    {
        id: 'facebook',
        name: 'Facebook',
        description: 'Conectar sua página do Facebook',
        icon: Facebook,
        color: 'text-blue-600',
        available: true
    },
    {
        id: 'instagram',
        name: 'Instagram',
        description: 'Conecte sua conta do Instagram',
        icon: Instagram,
        color: 'text-pink-600',
        available: true
    },
    {
        id: 'telegram',
        name: 'Telegram',
        description: 'Conecte seu bot do Telegram',
        icon: Send,
        color: 'text-blue-400',
        available: true
    },
    {
        id: 'website',
        name: 'Chat do Site',
        description: 'Widget de chat para seu website',
        icon: Globe,
        color: 'text-violet-500',
        available: true
    },
    {
        id: 'email',
        name: 'E-Mail',
        description: 'Receba emails na caixa de entrada',
        icon: Mail,
        color: 'text-cyan-500',
        available: true
    },
    {
        id: 'sms',
        name: 'SMS',
        description: 'Integrar canal SMS (Twilio)',
        icon: Smartphone,
        color: 'text-teal-500',
        available: true
    },
    {
        id: 'api',
        name: 'API',
        description: 'Crie um canal personalizado',
        icon: Code,
        color: 'text-gray-500',
        available: false
    }
];

export function ChannelsList() {
    const [channels, setChannels] = useState<Channel[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [cloudModalOpen, setCloudModalOpen] = useState(false);
    const [telegramModalOpen, setTelegramModalOpen] = useState(false);
    const [facebookModalOpen, setFacebookModalOpen] = useState(false);
    const [instagramModalOpen, setInstagramModalOpen] = useState(false);
    const [websiteModalOpen, setWebsiteModalOpen] = useState(false);
    const [emailModalOpen, setEmailModalOpen] = useState(false);
    const [smsModalOpen, setSmsModalOpen] = useState(false);
    const [activeStep, setActiveStep] = useState(1);
    const [sidebarExpanded, setSidebarExpanded] = useState(true);
    const [channelsExpanded, setChannelsExpanded] = useState(true);

    // Abrir modal de edição para qualquer tipo de canal
    const openEditModal = (channelType: string) => {
        switch (channelType) {
            case 'whatsapp': setModalOpen(true); break;
            case 'whatsapp_cloud': setCloudModalOpen(true); break;
            case 'telegram': setTelegramModalOpen(true); break;
            case 'facebook': setFacebookModalOpen(true); break;
            case 'instagram': setInstagramModalOpen(true); break;
            case 'website': setWebsiteModalOpen(true); break;
            case 'email': setEmailModalOpen(true); break;
            case 'sms': setSmsModalOpen(true); break;
        }
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
        if (channelId === 'whatsapp') {
            setModalOpen(true);
        } else if (channelId === 'whatsapp_cloud') {
            setCloudModalOpen(true);
        } else if (channelId === 'telegram') {
            setTelegramModalOpen(true);
        } else if (channelId === 'facebook') {
            setFacebookModalOpen(true);
        } else if (channelId === 'instagram') {
            setInstagramModalOpen(true);
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
        if (!confirm(`Remover canal ${channel.name}?`)) return;
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
            toast.success('Nome atualizado com sucesso');
        } catch (error) {
            console.error('Erro ao renomear canal:', error);
            toast.error('Erro ao renomear canal');
        }
    };

    return (
        <div
            className="h-full flex flex-col md:flex-row rounded-xl border overflow-hidden"
            style={{
                backgroundColor: 'hsl(var(--background))',
                borderColor: 'hsl(var(--border))'
            }}
        >

            {/* Sidebar Stepper (Visual) - Hidden on mobile */}
            <div
                className="hidden md:block w-64 border-r p-6 flex-shrink-0"
                style={{
                    backgroundColor: 'hsl(var(--card))',
                    borderColor: 'hsl(var(--border))'
                }}
            >
                {/* Caixas de Entrada - Dropdown colapsável */}
                <button
                    onClick={() => setSidebarExpanded(!sidebarExpanded)}
                    className="flex items-center justify-between w-full text-lg font-bold mb-4 hover:opacity-80 transition-opacity"
                    style={{ color: 'hsl(var(--foreground))' }}
                >
                    <span>Caixas de Entrada</span>
                    {sidebarExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                </button>

                {sidebarExpanded && (
                    <div className="relative space-y-8 mb-8">
                        <div className="absolute left-[15px] top-8 bottom-8 w-0.5 -z-10" style={{ backgroundColor: 'hsl(var(--border))' }}></div>
                        <div className="flex gap-4">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 transition-colors ${activeStep >= 1 ? 'bg-blue-600 text-white' : ''}`} style={activeStep >= 1 ? {} : { backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}>1</div>
                            <div>
                                <h3 className={`font-medium text-sm ${activeStep === 1 ? 'text-blue-600 dark:text-blue-400' : ''}`} style={activeStep === 1 ? {} : { color: 'hsl(var(--foreground))' }}>Escolha o Canal</h3>
                                <p className="text-xs mt-1 leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>Escolha o provedor que deseja integrar.</p>
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 transition-colors ${activeStep >= 2 ? 'bg-blue-600 text-white' : ''}`} style={activeStep >= 2 ? {} : { backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}>2</div>
                            <div>
                                <h3 className="font-medium text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>Configuração</h3>
                                <p className="text-xs mt-1 leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>Autentique e configure a caixa de entrada.</p>
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 transition-colors ${activeStep >= 3 ? 'bg-blue-600 text-white' : ''}`} style={activeStep >= 3 ? {} : { backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}>3</div>
                            <div>
                                <h3 className="font-medium text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>Pronto!</h3>
                                <p className="text-xs mt-1 leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>Comece a atender seus leads.</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Seus Canais Ativos - com engrenagem de configurações */}
                <div className="pt-4 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
                    <button
                        onClick={() => setChannelsExpanded(!channelsExpanded)}
                        className="flex items-center justify-between w-full mb-3 hover:opacity-80 transition-opacity"
                    >
                        <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
                            Seus Canais Ativos
                        </h4>
                        {channelsExpanded ? <ChevronDown className="w-4 h-4" style={{ color: 'hsl(var(--muted-foreground))' }} /> : <ChevronRight className="w-4 h-4" style={{ color: 'hsl(var(--muted-foreground))' }} />}
                    </button>
                    {channelsExpanded && (
                        <div className="space-y-1">
                            {channels.length > 0 ? channels.map(c => {
                                const channelConfig = AVAILABLE_CHANNELS.find(
                                    ac => ac.id === c.type || (c.type === 'whatsapp' && ac.id === 'whatsapp')
                                );
                                const ChannelIcon = channelConfig?.icon || MessageSquare;
                                const iconColor = channelConfig?.color || 'text-gray-500';

                                return (
                                    <div key={c.id} className="flex items-center gap-2 text-sm group py-1.5 px-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" style={{ color: 'hsl(var(--foreground))' }}>
                                        <ChannelIcon className={`w-4 h-4 flex-shrink-0 ${iconColor}`} />
                                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.status === 'active' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                        <span className="truncate flex-1">{c.name}</span>
                                        <button
                                            onClick={() => openEditModal(c.type)}
                                            className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
                                            title="Configurações do canal"
                                        >
                                            <Settings className="w-3.5 h-3.5" style={{ color: 'hsl(var(--muted-foreground))' }} />
                                        </button>
                                    </div>
                                );
                            }) : (
                                <p className="text-xs italic px-2" style={{ color: 'hsl(var(--muted-foreground))' }}>Nenhum canal ativo</p>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Main Content: Channel Grid */}
            <div className="flex-1 overflow-y-auto p-6 md:p-10">

                {/* Seção de Canais Ativos (Cards completos) */}
                {channels.length > 0 && (
                    <div className="mb-10">
                        <h2 className="text-xl font-bold mb-6 flex items-center gap-2" style={{ color: 'hsl(var(--foreground))' }}>
                            <span className="w-1.5 h-6 bg-green-500 rounded-full"></span>
                            Canais Conectados
                        </h2>
                        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                            {channels.map(channel => (
                                <ChannelCard
                                    key={channel.id}
                                    channel={channel}
                                    onDelete={handleDelete}
                                    onRename={handleRename}
                                    onEdit={(ch) => openEditModal(ch.type)}
                                    onSync={() => loadChannels()}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* Grid de Seleção (Estilo Chatwoot) */}
                <div>
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2" style={{ color: 'hsl(var(--foreground))' }}>
                        <span className="w-1.5 h-6 bg-blue-500 rounded-full"></span>
                        Adicionar Novo Canal
                    </h2>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {AVAILABLE_CHANNELS.map((item) => {
                            const Icon = item.icon;
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => handleConnect(item.id)}
                                    className="group flex flex-col items-start p-6 border rounded-xl hover:border-blue-500 hover:shadow-md transition-all text-left"
                                    style={{ 
                                        backgroundColor: 'hsl(var(--card))',
                                        borderColor: 'hsl(var(--border))'
                                    }}
                                >
                                    <div 
                                        className={`p-3 rounded-lg mb-4 group-hover:scale-110 transition-transform ${item.color}`}
                                        style={{ backgroundColor: 'hsl(var(--muted))' }}
                                    >
                                        <Icon size={24} />
                                    </div>
                                    <h3 className="font-bold mb-1" style={{ color: 'hsl(var(--foreground))' }}>
                                        {item.name}
                                    </h3>
                                    <p className="text-xs leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                        {item.description}
                                    </p>
                                </button>
                            )
                        })}

                        {/* Coming Soon Card */}
                        <div 
                            className="flex flex-col items-start p-6 border border-dashed rounded-xl opacity-60"
                            style={{ borderColor: 'hsl(var(--border))' }}
                        >
                            <div 
                                className="p-3 rounded-lg mb-4"
                                style={{ backgroundColor: 'hsl(var(--muted))' }}
                            >
                                <Plus size={24} style={{ color: 'hsl(var(--muted-foreground))' }} />
                            </div>
                            <h3 className="font-bold mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                Em breve! 🚀
                            </h3>
                            <p className="text-xs leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                Mais canais serão adicionados futuramente.
                            </p>
                        </div>
                    </div>
                </div>

            </div>

            <WhatsAppConnect
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                onSuccess={() => {
                    setModalOpen(false);
                    loadChannels();
                    toast.success('Canal conectado!');
                }}
            />

            <WhatsAppCloudConnect
                isOpen={cloudModalOpen}
                onClose={() => setCloudModalOpen(false)}
                onSuccess={() => {
                    setCloudModalOpen(false);
                    loadChannels();
                    toast.success('WhatsApp Cloud API conectada!');
                }}
            />

            <TelegramConnect
                isOpen={telegramModalOpen}
                onClose={() => setTelegramModalOpen(false)}
                onSuccess={() => {
                    setTelegramModalOpen(false);
                    loadChannels();
                    toast.success('Telegram conectado!');
                }}
            />

            <FacebookConnect
                isOpen={facebookModalOpen}
                onClose={() => setFacebookModalOpen(false)}
                onSuccess={() => {
                    setFacebookModalOpen(false);
                    loadChannels();
                    toast.success('Facebook Messenger conectado!');
                }}
            />

            <InstagramConnect
                isOpen={instagramModalOpen}
                onClose={() => setInstagramModalOpen(false)}
                onSuccess={() => {
                    setInstagramModalOpen(false);
                    loadChannels();
                    toast.success('Instagram conectado!');
                }}
            />

            <WebsiteWidgetConnect
                isOpen={websiteModalOpen}
                onClose={() => setWebsiteModalOpen(false)}
                onSuccess={() => {
                    setWebsiteModalOpen(false);
                    loadChannels();
                    toast.success('Chat do site configurado!');
                }}
            />

            <EmailConnect
                isOpen={emailModalOpen}
                onClose={() => setEmailModalOpen(false)}
                onSuccess={() => {
                    setEmailModalOpen(false);
                    loadChannels();
                    toast.success('Canal de email criado!');
                }}
            />
            <TwilioSMSConnect
                isOpen={smsModalOpen}
                onClose={() => setSmsModalOpen(false)}
                onSuccess={() => {
                    setSmsModalOpen(false);
                    loadChannels();
                    toast.success('Canal SMS configurado!');
                }}
            />        </div>
    );
}
