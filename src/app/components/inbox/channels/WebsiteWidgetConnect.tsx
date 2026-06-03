// INBOX: Modal de Conexão Website Widget (Chat embed para sites)
import React, { useState, useEffect } from 'react';
import { channelsApi } from '../../../services/api/inbox';
import type { Channel } from '../../../types/inbox';
import { toast } from 'sonner';
import { Globe, Check, AlertCircle, Loader2, Copy, Code, ExternalLink, CheckCircle } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.leadsflowapi.com';

interface WebsiteWidgetConnectProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    editingChannel?: Channel;
}

export function WebsiteWidgetConnect({ isOpen, onClose, onSuccess, editingChannel }: WebsiteWidgetConnectProps) {
    const isEditing = !!editingChannel;
    const [step, setStep] = useState<'form' | 'code' | 'success'>('form');
    const [showCode, setShowCode] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [channelId, setChannelId] = useState('');

    const DAYS = [
        { key: 'monday', label: 'Seg' }, { key: 'tuesday', label: 'Ter' },
        { key: 'wednesday', label: 'Qua' }, { key: 'thursday', label: 'Qui' },
        { key: 'friday', label: 'Sex' }, { key: 'saturday', label: 'Sáb' },
        { key: 'sunday', label: 'Dom' },
    ] as const;
    type DayKey = typeof DAYS[number]['key'];

    const defaultSchedule = (): Record<DayKey, { open: string; close: string } | null> => ({
        monday: { open: '08:00', close: '18:00' }, tuesday: { open: '08:00', close: '18:00' },
        wednesday: { open: '08:00', close: '18:00' }, thursday: { open: '08:00', close: '18:00' },
        friday: { open: '08:00', close: '18:00' }, saturday: null, sunday: null,
    });

    const [formData, setFormData] = useState({
        name: '',
        websiteUrl: '',
        primaryColor: '#8B5CF6',
        welcomeMessage: 'Olá! Como posso ajudar?',
        position: 'bottom-right' as 'bottom-right' | 'bottom-left',
        businessHoursEnabled: false,
        timezone: 'America/Maputo',
        offlineMessage: 'Estamos fora do horário de atendimento. Deixe sua mensagem e retornaremos em breve.',
        schedule: defaultSchedule(),
    });

    // Preencher dados quando for edição
    useEffect(() => {
        if (isEditing && editingChannel) {
            setChannelId(editingChannel.id);
            const bh = editingChannel.settings?.business_hours;
            setFormData({
                name: editingChannel.name || '',
                websiteUrl: editingChannel.credentials?.website_url || '',
                primaryColor: editingChannel.settings?.primary_color || '#8B5CF6',
                welcomeMessage: editingChannel.settings?.welcome_message || 'Olá! Como posso ajudar?',
                position: (editingChannel.settings?.position as 'bottom-right' | 'bottom-left') || 'bottom-right',
                businessHoursEnabled: !!bh?.enabled,
                timezone: bh?.timezone || 'America/Maputo',
                offlineMessage: bh?.offlineMessage || 'Estamos fora do horário de atendimento. Deixe sua mensagem e retornaremos em breve.',
                schedule: bh?.schedule || defaultSchedule(),
            });
        }
    }, [isEditing, editingChannel]);

    useEffect(() => {
        if (!isOpen) {
            if (!isEditing) {
                setStep('form');
                setFormData({
                    name: '',
                    websiteUrl: '',
                    primaryColor: '#8B5CF6',
                    welcomeMessage: 'Olá! Como posso ajudar?',
                    position: 'bottom-right',
                    businessHoursEnabled: false,
                    timezone: 'America/Maputo',
                    offlineMessage: 'Estamos fora do horário de atendimento. Deixe sua mensagem e retornaremos em breve.',
                    schedule: defaultSchedule(),
                });
                setChannelId('');
            }
            setError(null);
            setLoading(false);
        }
    }, [isOpen, isEditing]);

    const handleSubmit = async () => {
        if (!formData.name.trim()) {
            setError('Informe o nome do canal');
            return;
        }

        try {
            setLoading(true);
            setError(null);

            const channelData = {
                type: 'website' as const,
                name: formData.name,
                status: 'active' as const,
                credentials: {
                    website_url: formData.websiteUrl
                },
                settings: {
                    primary_color: formData.primaryColor,
                    welcome_message: formData.welcomeMessage,
                    position: formData.position,
                    business_hours: {
                        enabled: formData.businessHoursEnabled,
                        timezone: formData.timezone,
                        offlineMessage: formData.offlineMessage,
                        schedule: formData.schedule,
                    }
                }
            };

            let channel;
            if (isEditing && editingChannel) {
                channel = await channelsApi.update(editingChannel.id, channelData);
                toast.success('Canal Website atualizado com sucesso!');
                onSuccess();
                // Stay open so user can copy the widget code
                setStep('code');
            } else {
                channel = await channelsApi.create(channelData);
                if (channel) {
                    setChannelId(channel.id);
                    setStep('code');
                    toast.success('Canal criado com sucesso!');
                }
            }
        } catch (err: any) {
            console.error('Failed to save website channel:', err);
            setError(err.message || `Erro ao ${isEditing ? 'atualizar' : 'criar'} canal.`);
        } finally {
            setLoading(false);
        }
    };

    const WIDGET_URL = `${API_URL}/w`;
    const WEBHOOK_URL = `${API_URL}/api/webhooks/website/${channelId}`;

    const getWidgetCode = () => {
        return `<!-- LeadsFlow Chat Widget -->
<script>
  (function(w,d,s,o,f,js,fjs){
    w['LeadsFlowWidget']=o;w[o]=w[o]||function(){(w[o].q=w[o].q||[]).push(arguments)};
    js=d.createElement(s),fjs=d.getElementsByTagName(s)[0];
    js.id=o;js.src=f;js.async=1;fjs.parentNode.insertBefore(js,fjs);
  }(window,document,'script','lfw','${WIDGET_URL}'));
  lfw('init', {
    channelId: '${channelId}',
    primaryColor: '${formData.primaryColor}',
    welcomeMessage: '${formData.welcomeMessage}',
    position: '${formData.position}'
  });
</script>`;
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success('Código copiado!');
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
            <div
                className="relative w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden animate-fadeIn"
                style={{
                    backgroundColor: 'hsl(var(--card))',
                    borderColor: 'hsl(var(--border))'
                }}
            >
                {/* Header */}
                <div
                    className="px-6 py-4 border-b flex items-center justify-between"
                    style={{ borderColor: 'hsl(var(--border))' }}
                >
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-violet-500 to-purple-600 flex items-center justify-center">
                            <Globe className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                                {isEditing ? 'Editar Canal Website' : 'Chat do Site'}
                            </h2>
                            <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                {isEditing ? 'Atualize as configurações do widget' : 'Widget de chat para seu website'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                        <span className="text-xl">×</span>
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 max-h-[70vh] overflow-y-auto">
                    {step === 'form' && (
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                                    Nome do Canal *
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="Ex: Chat do Site Principal"
                                    className="w-full px-4 py-3 rounded-lg border text-sm"
                                    style={{
                                        backgroundColor: 'hsl(var(--background))',
                                        borderColor: 'hsl(var(--border))',
                                        color: 'hsl(var(--foreground))'
                                    }}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                                    URL do Site (opcional)
                                </label>
                                <input
                                    type="url"
                                    value={formData.websiteUrl}
                                    onChange={(e) => setFormData(prev => ({ ...prev, websiteUrl: e.target.value }))}
                                    placeholder="https://seusite.com.br"
                                    className="w-full px-4 py-3 rounded-lg border text-sm"
                                    style={{
                                        backgroundColor: 'hsl(var(--background))',
                                        borderColor: 'hsl(var(--border))',
                                        color: 'hsl(var(--foreground))'
                                    }}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                                    Cor Principal
                                </label>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="color"
                                        value={formData.primaryColor}
                                        onChange={(e) => setFormData(prev => ({ ...prev, primaryColor: e.target.value }))}
                                        className="w-12 h-12 rounded-lg border cursor-pointer"
                                        style={{ borderColor: 'hsl(var(--border))' }}
                                    />
                                    <input
                                        type="text"
                                        value={formData.primaryColor}
                                        onChange={(e) => setFormData(prev => ({ ...prev, primaryColor: e.target.value }))}
                                        className="flex-1 px-4 py-3 rounded-lg border text-sm font-mono"
                                        style={{
                                            backgroundColor: 'hsl(var(--background))',
                                            borderColor: 'hsl(var(--border))',
                                            color: 'hsl(var(--foreground))'
                                        }}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                                    Mensagem de Boas-vindas
                                </label>
                                <textarea
                                    value={formData.welcomeMessage}
                                    onChange={(e) => setFormData(prev => ({ ...prev, welcomeMessage: e.target.value }))}
                                    rows={2}
                                    className="w-full px-4 py-3 rounded-lg border text-sm resize-none"
                                    style={{
                                        backgroundColor: 'hsl(var(--background))',
                                        borderColor: 'hsl(var(--border))',
                                        color: 'hsl(var(--foreground))'
                                    }}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                                    Posição do Widget
                                </label>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setFormData(prev => ({ ...prev, position: 'bottom-right' }))}
                                        className={`flex-1 px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                                            formData.position === 'bottom-right'
                                                ? 'bg-violet-500/10 border-violet-500 text-violet-500'
                                                : ''
                                        }`}
                                        style={{ borderColor: formData.position === 'bottom-right' ? undefined : 'hsl(var(--border))' }}
                                    >
                                        Direita
                                    </button>
                                    <button
                                        onClick={() => setFormData(prev => ({ ...prev, position: 'bottom-left' }))}
                                        className={`flex-1 px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                                            formData.position === 'bottom-left'
                                                ? 'bg-violet-500/10 border-violet-500 text-violet-500'
                                                : ''
                                        }`}
                                        style={{ borderColor: formData.position === 'bottom-left' ? undefined : 'hsl(var(--border))' }}
                                    >
                                        Esquerda
                                    </button>
                                </div>
                            </div>

                            {/* Business Hours */}
                            <div className="border rounded-lg overflow-hidden" style={{ borderColor: 'hsl(var(--border))' }}>
                                <div
                                    className="flex items-center justify-between px-4 py-3 cursor-pointer"
                                    style={{ backgroundColor: 'hsl(var(--muted)/0.4)' }}
                                    onClick={() => setFormData(prev => ({ ...prev, businessHoursEnabled: !prev.businessHoursEnabled }))}
                                >
                                    <div>
                                        <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>Horário de Funcionamento</p>
                                        <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Mostra mensagem de indisponibilidade fora do horário</p>
                                    </div>
                                    <div
                                        className="w-10 h-5 rounded-full transition-colors relative flex-shrink-0"
                                        style={{ backgroundColor: formData.businessHoursEnabled ? '#8B5CF6' : 'hsl(var(--muted))' }}
                                    >
                                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${formData.businessHoursEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                    </div>
                                </div>

                                {formData.businessHoursEnabled && (
                                    <div className="px-4 py-3 space-y-3 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
                                        {/* Timezone */}
                                        <div>
                                            <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Fuso horário</label>
                                            <select
                                                value={formData.timezone}
                                                onChange={e => setFormData(prev => ({ ...prev, timezone: e.target.value }))}
                                                className="w-full px-3 py-2 rounded-lg border text-sm"
                                                style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                                            >
                                                {['Africa/Maputo','Africa/Luanda','Africa/Nairobi','Europe/Lisbon','America/Sao_Paulo','America/New_York','Europe/London','Asia/Dubai','UTC'].map(tz => (
                                                    <option key={tz} value={tz}>{tz}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Schedule per day */}
                                        <div className="space-y-1.5">
                                            {DAYS.map(({ key, label }) => {
                                                const slot = formData.schedule[key];
                                                return (
                                                    <div key={key} className="flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => setFormData(prev => ({
                                                                ...prev,
                                                                schedule: { ...prev.schedule, [key]: slot ? null : { open: '08:00', close: '18:00' } }
                                                            }))}
                                                            className={`w-10 text-xs font-semibold py-1 rounded transition-colors ${slot ? 'bg-violet-500 text-white' : 'bg-muted text-muted-foreground'}`}
                                                        >{label}</button>
                                                        {slot ? (
                                                            <>
                                                                <input type="time" value={slot.open}
                                                                    onChange={e => setFormData(prev => ({ ...prev, schedule: { ...prev.schedule, [key]: { ...slot, open: e.target.value } } }))}
                                                                    className="flex-1 px-2 py-1 rounded border text-xs"
                                                                    style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                                                                />
                                                                <span className="text-xs text-muted-foreground">–</span>
                                                                <input type="time" value={slot.close}
                                                                    onChange={e => setFormData(prev => ({ ...prev, schedule: { ...prev.schedule, [key]: { ...slot, close: e.target.value } } }))}
                                                                    className="flex-1 px-2 py-1 rounded border text-xs"
                                                                    style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                                                                />
                                                            </>
                                                        ) : (
                                                            <span className="text-xs text-muted-foreground italic">Fechado</span>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Offline message */}
                                        <div>
                                            <label className="block text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Mensagem fora do horário</label>
                                            <textarea
                                                value={formData.offlineMessage}
                                                onChange={e => setFormData(prev => ({ ...prev, offlineMessage: e.target.value }))}
                                                rows={2}
                                                className="w-full px-3 py-2 rounded-lg border text-xs resize-none"
                                                style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Widget code — available immediately when editing */}
                            {isEditing && channelId && (
                                <div>
                                    <button
                                        type="button"
                                        onClick={() => setShowCode(v => !v)}
                                        className="w-full flex items-center justify-between px-4 py-3 rounded-lg border text-sm font-medium transition-colors hover:bg-muted/50"
                                        style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                                    >
                                        <span className="flex items-center gap-2"><Code className="w-4 h-4 text-violet-400" />Código de Instalação do Widget</span>
                                        <span className="text-xs text-muted-foreground">{showCode ? 'Ocultar' : 'Ver'}</span>
                                    </button>
                                    {showCode && (
                                        <div className="mt-2 relative">
                                            <pre
                                                className="p-4 rounded-lg border text-xs overflow-x-auto"
                                                style={{ backgroundColor: 'hsl(var(--muted))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                                            >{getWidgetCode()}</pre>
                                            <button
                                                onClick={() => copyToClipboard(getWidgetCode())}
                                                className="absolute top-2 right-2 p-2 rounded-lg bg-violet-500 text-white hover:bg-violet-600 transition-colors"
                                                title="Copiar código"
                                            >
                                                <Copy className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {error && (
                                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-2">
                                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                                    <span className="text-sm text-red-500">{error}</span>
                                </div>
                            )}

                            <div className="flex gap-3">
                                <button
                                    onClick={onClose}
                                    className="flex-1 px-4 py-3 rounded-lg border text-sm font-medium transition-colors hover:bg-muted/50"
                                    style={{ borderColor: 'hsl(var(--border))' }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSubmit}
                                    disabled={loading || !formData.name.trim()}
                                    className="flex-1 px-4 py-3 rounded-lg text-sm font-medium text-white bg-primary text-primary-foreground hover:opacity-90 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            {isEditing ? 'Atualizando...' : 'Criando...'}
                                        </>
                                    ) : (
                                        <>
                                            <Check className="w-4 h-4" />
                                            {isEditing ? 'Atualizar Canal' : 'Criar Canal'}
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'code' && (
                        <div className="space-y-6">
                            <div className="text-center">
                                <div className="w-16 h-16 rounded-full bg-violet-500/10 flex items-center justify-center mx-auto mb-4">
                                    <Code className="w-8 h-8 text-violet-500" />
                                </div>
                                <h3 className="text-lg font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                                    Instale o Widget
                                </h3>
                                <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                    Copie o código abaixo e cole antes do &lt;/body&gt; do seu site
                                </p>
                            </div>

                            <div className="relative">
                                <pre
                                    className="p-4 rounded-lg border text-xs overflow-x-auto"
                                    style={{
                                        backgroundColor: 'hsl(var(--muted))',
                                        borderColor: 'hsl(var(--border))',
                                        color: 'hsl(var(--foreground))'
                                    }}
                                >
                                    {getWidgetCode()}
                                </pre>
                                <button
                                    onClick={() => copyToClipboard(getWidgetCode())}
                                    className="absolute top-2 right-2 p-2 rounded-lg bg-violet-500 text-white hover:bg-violet-600 transition-colors"
                                >
                                    <Copy className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="space-y-2">
                                <div className="p-3 rounded-lg border border-blue-500/30 bg-blue-500/10 flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="text-xs font-semibold text-blue-300 mb-0.5">Webhook URL</p>
                                        <code className="text-xs text-blue-200 break-all">{WEBHOOK_URL}</code>
                                    </div>
                                    <button
                                        onClick={() => copyToClipboard(WEBHOOK_URL)}
                                        className="p-1.5 rounded flex-shrink-0 hover:bg-blue-500/20 transition-colors"
                                        title="Copiar"
                                    >
                                        <Copy className="w-3.5 h-3.5 text-blue-300" />
                                    </button>
                                </div>
                                <div className="p-3 rounded-lg border border-violet-500/20 bg-violet-500/5">
                                    <p className="text-xs font-semibold text-violet-300 mb-0.5">Widget JS</p>
                                    <code className="text-xs text-violet-200 break-all">{WIDGET_URL}</code>
                                </div>
                            </div>

                            <button
                                onClick={() => { setStep('success'); }}
                                className="w-full px-4 py-3 rounded-lg text-sm font-medium text-white bg-primary text-primary-foreground hover:opacity-90 transition-all duration-150"
                            >
                                Concluir
                            </button>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="text-center py-8">
                            <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                                <CheckCircle className="w-10 h-10 text-green-500" />
                            </div>
                            <h3 className="text-xl font-semibold mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                                Widget Configurado!
                            </h3>
                            <p className="text-sm mb-6" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                Seu chat está pronto. As mensagens aparecerão na caixa de entrada.
                            </p>
                            <button
                                onClick={() => { onSuccess(); onClose(); }}
                                className="px-6 py-3 rounded-lg text-sm font-medium text-white bg-green-500 hover:bg-green-600 transition-colors"
                            >
                                Ir para Inbox
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
