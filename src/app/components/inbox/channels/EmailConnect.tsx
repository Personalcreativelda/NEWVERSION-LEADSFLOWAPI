// INBOX: Modal de Conexão Email
import React, { useState, useEffect } from 'react';
import { channelsApi } from '../../../services/api/inbox';
import { toast } from 'sonner';
import { Mail, Check, AlertCircle, Loader2, Copy, CheckCircle, Info, ExternalLink } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.leadsflowapi.com';

interface EmailConnectProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export function EmailConnect({ isOpen, onClose, onSuccess }: EmailConnectProps) {
    const [step, setStep] = useState<'form' | 'webhook' | 'success'>('form');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [channelId, setChannelId] = useState('');

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        forwardingEmail: ''
    });

    useEffect(() => {
        if (!isOpen) {
            setStep('form');
            setFormData({
                name: '',
                email: '',
                forwardingEmail: ''
            });
            setError(null);
            setLoading(false);
            setChannelId('');
        }
    }, [isOpen]);

    const handleSubmit = async () => {
        if (!formData.name.trim() || !formData.email.trim()) {
            setError('Informe o nome e email do canal');
            return;
        }

        try {
            setLoading(true);
            setError(null);

            const channel = await channelsApi.create({
                type: 'email',
                name: formData.name,
                status: 'active',
                credentials: {
                    email: formData.email,
                    forwarding_email: formData.forwardingEmail
                }
            });

            if (channel) {
                setChannelId(channel.id);
                setStep('webhook');
                toast.success('Canal de email criado!');
            }
        } catch (err: any) {
            console.error('Failed to create email channel:', err);
            setError(err.message || 'Erro ao criar canal.');
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success('Copiado!');
    };

    const webhookUrl = `${API_URL}/api/webhooks/email/${channelId}`;

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
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-500 to-cyan-500 flex items-center justify-center">
                            <Mail className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                                Caixa de Email
                            </h2>
                            <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                Receba emails na sua caixa de entrada
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
                            {/* Info */}
                            <div className="p-4 rounded-lg border border-blue-500/30 bg-blue-500/10">
                                <div className="flex items-start gap-3">
                                    <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                                    <div className="text-sm text-blue-200">
                                        <p className="font-medium mb-1">Como funciona:</p>
                                        <ul className="list-disc list-inside space-y-1 text-blue-300/80">
                                            <li>Configure o encaminhamento de emails para nosso webhook</li>
                                            <li>Emails recebidos aparecerão na sua caixa de entrada</li>
                                            <li>Responda diretamente pelo LeadsFlow</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                                    Nome do Canal *
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="Ex: Suporte, Vendas, Contato"
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
                                    Email de Origem *
                                </label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                                    placeholder="contato@suaempresa.com"
                                    className="w-full px-4 py-3 rounded-lg border text-sm"
                                    style={{
                                        backgroundColor: 'hsl(var(--background))',
                                        borderColor: 'hsl(var(--border))',
                                        color: 'hsl(var(--foreground))'
                                    }}
                                />
                                <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                    O email que receberá as mensagens
                                </p>
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
                                    disabled={loading || !formData.name.trim() || !formData.email.trim()}
                                    className="flex-1 px-4 py-3 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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

                    {step === 'webhook' && (
                        <div className="space-y-6">
                            <div className="text-center">
                                <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
                                    <Mail className="w-8 h-8 text-blue-500" />
                                </div>
                                <h3 className="text-lg font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                                    Configure o Encaminhamento
                                </h3>
                                <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                    Configure seu provedor de email para encaminhar mensagens
                                </p>
                            </div>

                            <div
                                className="p-4 rounded-lg border"
                                style={{
                                    backgroundColor: 'hsl(var(--muted))',
                                    borderColor: 'hsl(var(--border))'
                                }}
                            >
                                <label className="block text-xs font-medium mb-2 uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                    Webhook URL (para encaminhamento)
                                </label>
                                <div className="flex items-center gap-2">
                                    <code
                                        className="flex-1 px-3 py-2 rounded-lg text-xs break-all"
                                        style={{
                                            backgroundColor: 'hsl(var(--background))',
                                            color: 'hsl(var(--foreground))'
                                        }}
                                    >
                                        {webhookUrl}
                                    </code>
                                    <button
                                        onClick={() => copyToClipboard(webhookUrl)}
                                        className="p-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                                    >
                                        <Copy className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>
                                    Opções de Integração:
                                </p>

                                <div className="p-3 rounded-lg border" style={{ borderColor: 'hsl(var(--border))' }}>
                                    <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>
                                        Zapier / Make / N8N
                                    </p>
                                    <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                        Configure um gatilho de email e envie para o webhook acima
                                    </p>
                                </div>

                                <div className="p-3 rounded-lg border" style={{ borderColor: 'hsl(var(--border))' }}>
                                    <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>
                                        SendGrid / Mailgun Inbound Parse
                                    </p>
                                    <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                        Configure o webhook de recebimento para a URL acima
                                    </p>
                                </div>

                                <div className="p-3 rounded-lg border" style={{ borderColor: 'hsl(var(--border))' }}>
                                    <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>
                                        Gmail / Outlook via API
                                    </p>
                                    <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                        Use APIs de terceiros como Nylas ou diretamente via N8N
                                    </p>
                                </div>
                            </div>

                            <button
                                onClick={() => setStep('success')}
                                className="w-full px-4 py-3 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 transition-colors"
                            >
                                Concluir Configuração
                            </button>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="text-center py-8">
                            <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                                <CheckCircle className="w-10 h-10 text-green-500" />
                            </div>
                            <h3 className="text-xl font-semibold mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                                Canal de Email Criado!
                            </h3>
                            <p className="text-sm mb-6" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                Configure o encaminhamento no seu provedor de email para começar a receber mensagens.
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
