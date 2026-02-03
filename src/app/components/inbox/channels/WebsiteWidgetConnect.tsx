// INBOX: Modal de Conexão Website Widget (Chat embed para sites)
import React, { useState, useEffect } from 'react';
import { channelsApi } from '../../../services/api/inbox';
import { toast } from 'sonner';
import { Globe, Check, AlertCircle, Loader2, Copy, Code, ExternalLink, CheckCircle } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.leadsflowapi.com';

interface WebsiteWidgetConnectProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export function WebsiteWidgetConnect({ isOpen, onClose, onSuccess }: WebsiteWidgetConnectProps) {
    const [step, setStep] = useState<'form' | 'code' | 'success'>('form');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [channelId, setChannelId] = useState('');

    const [formData, setFormData] = useState({
        name: '',
        websiteUrl: '',
        primaryColor: '#8B5CF6',
        welcomeMessage: 'Olá! Como posso ajudar?',
        position: 'bottom-right' as 'bottom-right' | 'bottom-left'
    });

    useEffect(() => {
        if (!isOpen) {
            setStep('form');
            setFormData({
                name: '',
                websiteUrl: '',
                primaryColor: '#8B5CF6',
                welcomeMessage: 'Olá! Como posso ajudar?',
                position: 'bottom-right'
            });
            setError(null);
            setLoading(false);
            setChannelId('');
        }
    }, [isOpen]);

    const handleSubmit = async () => {
        if (!formData.name.trim()) {
            setError('Informe o nome do canal');
            return;
        }

        try {
            setLoading(true);
            setError(null);

            const channel = await channelsApi.create({
                type: 'website',
                name: formData.name,
                status: 'active',
                credentials: {
                    website_url: formData.websiteUrl
                },
                settings: {
                    primary_color: formData.primaryColor,
                    welcome_message: formData.welcomeMessage,
                    position: formData.position
                }
            });

            if (channel) {
                setChannelId(channel.id);
                setStep('code');
                toast.success('Canal criado com sucesso!');
            }
        } catch (err: any) {
            console.error('Failed to create website channel:', err);
            setError(err.message || 'Erro ao criar canal.');
        } finally {
            setLoading(false);
        }
    };

    const getWidgetCode = () => {
        return `<!-- LeadsFlow Chat Widget -->
<script>
  (function(w,d,s,o,f,js,fjs){
    w['LeadsFlowWidget']=o;w[o]=w[o]||function(){(w[o].q=w[o].q||[]).push(arguments)};
    js=d.createElement(s),fjs=d.getElementsByTagName(s)[0];
    js.id=o;js.src=f;js.async=1;fjs.parentNode.insertBefore(js,fjs);
  }(window,document,'script','lfw','${API_URL}/widget.js'));
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
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            <div
                className="relative w-full max-w-lg mx-4 rounded-2xl border shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
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
                                Chat do Site
                            </h2>
                            <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                Widget de chat para seu website
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
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

                            {error && (
                                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-2">
                                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                                    <span className="text-sm text-red-500">{error}</span>
                                </div>
                            )}

                            <div className="flex gap-3">
                                <button
                                    onClick={onClose}
                                    className="flex-1 px-4 py-3 rounded-lg border text-sm font-medium transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                                    style={{ borderColor: 'hsl(var(--border))' }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSubmit}
                                    disabled={loading || !formData.name.trim()}
                                    className="flex-1 px-4 py-3 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Criando...
                                        </>
                                    ) : (
                                        <>
                                            <Check className="w-4 h-4" />
                                            Criar Canal
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

                            <div
                                className="p-4 rounded-lg border border-blue-500/30 bg-blue-500/10"
                            >
                                <p className="text-sm text-blue-200">
                                    <strong>Webhook URL:</strong><br />
                                    <code className="text-xs">{API_URL}/api/webhooks/website/{channelId}</code>
                                </p>
                            </div>

                            <button
                                onClick={() => { setStep('success'); }}
                                className="w-full px-4 py-3 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 transition-colors"
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
