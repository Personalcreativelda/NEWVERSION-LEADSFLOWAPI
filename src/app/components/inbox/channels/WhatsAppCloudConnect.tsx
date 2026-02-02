// INBOX: Modal de Conexão WhatsApp Cloud API (Oficial Meta)
import React, { useState, useEffect } from 'react';
import { channelsApi } from '../../../services/api/inbox';
import { toast } from 'sonner';
import { ExternalLink, Copy, Check, Shield, Zap, Globe, AlertCircle } from 'lucide-react';

// API URL for webhook generation
const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000';

interface WhatsAppCloudConnectProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export function WhatsAppCloudConnect({ isOpen, onClose, onSuccess }: WhatsAppCloudConnectProps) {
    const [step, setStep] = useState<'info' | 'form' | 'webhook' | 'success'>('info');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    // Form fields
    const [formData, setFormData] = useState({
        name: '',
        phoneNumberId: '',
        wabaId: '',
        accessToken: '',
        verifyToken: ''
    });

    // Generated webhook URL
    const [webhookUrl, setWebhookUrl] = useState('');

    useEffect(() => {
        if (!isOpen) {
            setStep('info');
            setFormData({
                name: '',
                phoneNumberId: '',
                wabaId: '',
                accessToken: '',
                verifyToken: ''
            });
            setError(null);
            setLoading(false);
            setCopied(false);
        }
    }, [isOpen]);

    const generateVerifyToken = () => {
        const token = 'lf_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        setFormData(prev => ({ ...prev, verifyToken: token }));
    };

    const handleSubmit = async () => {
        if (!formData.name.trim() || !formData.phoneNumberId.trim() || !formData.accessToken.trim()) {
            setError('Preencha todos os campos obrigatórios.');
            return;
        }

        try {
            setLoading(true);
            setError(null);

            const channel = await channelsApi.create({
                type: 'whatsapp_cloud',
                name: formData.name,
                provider: 'cloud_api',
                credentials: {
                    phone_number_id: formData.phoneNumberId,
                    waba_id: formData.wabaId,
                    access_token: formData.accessToken,
                    verify_token: formData.verifyToken || 'leadflow_verify'
                }
            });

            if (channel) {
                // Generate webhook URL based on API URL
                setWebhookUrl(`${API_URL}/api/webhooks/whatsapp-cloud/${channel.id}`);
                setStep('webhook');
            }
        } catch (err: any) {
            console.error('Failed to create WhatsApp Cloud channel:', err);
            if (err.response?.status === 401) {
                setError('Sessão expirada. Recarregue a página e tente novamente.');
            } else if (err.response?.status === 400) {
                setError('Dados inválidos. Verifique as credenciais.');
            } else {
                setError(err.message || 'Erro ao criar canal.');
            }
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
            toast.success('Copiado!');
        } catch (err) {
            toast.error('Erro ao copiar');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
            <div
                className="rounded-xl shadow-2xl w-full max-w-lg overflow-hidden transform transition-all relative z-[100000]"
                style={{ backgroundColor: 'hsl(var(--card))' }}
                role="dialog"
            >
                {/* Header */}
                <div 
                    className="px-6 py-4 border-b flex justify-between items-center"
                    style={{ 
                        borderColor: 'hsl(var(--border))',
                        backgroundColor: 'hsl(var(--muted))'
                    }}
                >
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
                            <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                                WhatsApp Cloud API
                            </h3>
                            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                API Oficial da Meta
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="transition-colors p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
                        style={{ color: 'hsl(var(--muted-foreground))' }}
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 max-h-[70vh] overflow-y-auto">
                    
                    {/* Step: Info */}
                    {step === 'info' && (
                        <div className="space-y-6 animate-fadeIn">
                            <div 
                                className="p-4 rounded-lg border"
                                style={{ 
                                    backgroundColor: 'hsl(var(--muted))',
                                    borderColor: 'hsl(var(--border))'
                                }}
                            >
                                <h4 className="font-semibold mb-3 flex items-center gap-2" style={{ color: 'hsl(var(--foreground))' }}>
                                    <Shield className="w-5 h-5 text-green-500" />
                                    Sobre a API Oficial
                                </h4>
                                <ul className="space-y-2 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                    <li className="flex items-start gap-2">
                                        <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                                        <span>Conexão oficial e aprovada pela Meta</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                                        <span>Suporte a mensagens de template e sessão</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                                        <span>Alta disponibilidade e escalabilidade</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                                        <span>Ideal para empresas com alto volume</span>
                                    </li>
                                </ul>
                            </div>

                            <div 
                                className="p-4 rounded-lg border border-yellow-200 dark:border-yellow-900/50 bg-yellow-50 dark:bg-yellow-900/20"
                            >
                                <h4 className="font-semibold mb-2 flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
                                    <AlertCircle className="w-5 h-5" />
                                    Pré-requisitos
                                </h4>
                                <ul className="space-y-1 text-sm text-yellow-600 dark:text-yellow-300">
                                    <li>• Conta no Meta Business Suite</li>
                                    <li>• WhatsApp Business Account (WABA) criada</li>
                                    <li>• Número de telefone verificado</li>
                                    <li>• Access Token do sistema</li>
                                </ul>
                            </div>

                            <a 
                                href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started" 
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                            >
                                <ExternalLink className="w-4 h-4" />
                                Ver documentação oficial da Meta
                            </a>

                            <button
                                onClick={() => setStep('form')}
                                className="w-full py-3 px-4 rounded-lg font-medium text-white shadow-lg transition-all bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800"
                            >
                                Continuar Configuração
                            </button>
                        </div>
                    )}

                    {/* Step: Form */}
                    {step === 'form' && (
                        <div className="space-y-4 animate-fadeIn">
                            <div>
                                <label className="block text-sm font-medium mb-1" style={{ color: 'hsl(var(--foreground))' }}>
                                    Nome do Canal *
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="Ex: WhatsApp Comercial"
                                    className="w-full px-4 py-2.5 rounded-lg border focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all"
                                    style={{ 
                                        backgroundColor: 'hsl(var(--background))',
                                        borderColor: 'hsl(var(--border))',
                                        color: 'hsl(var(--foreground))'
                                    }}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1" style={{ color: 'hsl(var(--foreground))' }}>
                                    Phone Number ID *
                                </label>
                                <input
                                    type="text"
                                    value={formData.phoneNumberId}
                                    onChange={(e) => setFormData(prev => ({ ...prev, phoneNumberId: e.target.value }))}
                                    placeholder="Ex: 123456789012345"
                                    className="w-full px-4 py-2.5 rounded-lg border focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all font-mono text-sm"
                                    style={{ 
                                        backgroundColor: 'hsl(var(--background))',
                                        borderColor: 'hsl(var(--border))',
                                        color: 'hsl(var(--foreground))'
                                    }}
                                />
                                <p className="mt-1 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                    Encontre em: Meta Business Suite → WhatsApp → Configurações da API
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1" style={{ color: 'hsl(var(--foreground))' }}>
                                    WhatsApp Business Account ID
                                </label>
                                <input
                                    type="text"
                                    value={formData.wabaId}
                                    onChange={(e) => setFormData(prev => ({ ...prev, wabaId: e.target.value }))}
                                    placeholder="Ex: 123456789012345"
                                    className="w-full px-4 py-2.5 rounded-lg border focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all font-mono text-sm"
                                    style={{ 
                                        backgroundColor: 'hsl(var(--background))',
                                        borderColor: 'hsl(var(--border))',
                                        color: 'hsl(var(--foreground))'
                                    }}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1" style={{ color: 'hsl(var(--foreground))' }}>
                                    Access Token Permanente *
                                </label>
                                <textarea
                                    value={formData.accessToken}
                                    onChange={(e) => setFormData(prev => ({ ...prev, accessToken: e.target.value }))}
                                    placeholder="Cole seu token aqui..."
                                    rows={3}
                                    className="w-full px-4 py-2.5 rounded-lg border focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all font-mono text-xs"
                                    style={{ 
                                        backgroundColor: 'hsl(var(--background))',
                                        borderColor: 'hsl(var(--border))',
                                        color: 'hsl(var(--foreground))'
                                    }}
                                />
                                <p className="mt-1 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                    Crie um System User Token em: Business Settings → System Users
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1" style={{ color: 'hsl(var(--foreground))' }}>
                                    Verify Token (para webhook)
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={formData.verifyToken}
                                        onChange={(e) => setFormData(prev => ({ ...prev, verifyToken: e.target.value }))}
                                        placeholder="Token de verificação"
                                        className="flex-1 px-4 py-2.5 rounded-lg border focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all font-mono text-sm"
                                        style={{ 
                                            backgroundColor: 'hsl(var(--background))',
                                            borderColor: 'hsl(var(--border))',
                                            color: 'hsl(var(--foreground))'
                                        }}
                                    />
                                    <button
                                        onClick={generateVerifyToken}
                                        type="button"
                                        className="px-3 py-2 rounded-lg border text-sm font-medium transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                                        style={{ 
                                            borderColor: 'hsl(var(--border))',
                                            color: 'hsl(var(--foreground))'
                                        }}
                                    >
                                        Gerar
                                    </button>
                                </div>
                            </div>

                            {error && (
                                <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg flex items-start gap-2">
                                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                                    <span>{error}</span>
                                </div>
                            )}

                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => setStep('info')}
                                    className="flex-1 py-2.5 px-4 rounded-lg font-medium border transition-colors"
                                    style={{ 
                                        borderColor: 'hsl(var(--border))',
                                        color: 'hsl(var(--foreground))'
                                    }}
                                >
                                    Voltar
                                </button>
                                <button
                                    onClick={handleSubmit}
                                    disabled={loading || !formData.name.trim() || !formData.phoneNumberId.trim() || !formData.accessToken.trim()}
                                    className={`flex-1 py-2.5 px-4 rounded-lg font-medium text-white shadow-lg transition-all flex items-center justify-center gap-2
                                        ${loading || !formData.name.trim() || !formData.phoneNumberId.trim() || !formData.accessToken.trim()
                                            ? 'bg-gray-400 cursor-not-allowed opacity-70'
                                            : 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800'
                                        }`}
                                >
                                    {loading ? (
                                        <>
                                            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            <span>Salvando...</span>
                                        </>
                                    ) : (
                                        'Salvar e Continuar'
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step: Webhook */}
                    {step === 'webhook' && (
                        <div className="space-y-6 animate-fadeIn">
                            <div className="text-center mb-4">
                                <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Globe className="w-8 h-8" />
                                </div>
                                <h4 className="text-lg font-bold" style={{ color: 'hsl(var(--foreground))' }}>
                                    Configure o Webhook
                                </h4>
                                <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                    Adicione essas informações no Meta Business Suite
                                </p>
                            </div>

                            <div 
                                className="p-4 rounded-lg border space-y-4"
                                style={{ 
                                    backgroundColor: 'hsl(var(--muted))',
                                    borderColor: 'hsl(var(--border))'
                                }}
                            >
                                <div>
                                    <label className="block text-xs font-medium mb-2 uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                        Callback URL
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
                                            className="p-2 rounded-lg border transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                                            style={{ borderColor: 'hsl(var(--border))' }}
                                        >
                                            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" style={{ color: 'hsl(var(--muted-foreground))' }} />}
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-medium mb-2 uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                        Verify Token
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <code 
                                            className="flex-1 px-3 py-2 rounded-lg text-xs"
                                            style={{ 
                                                backgroundColor: 'hsl(var(--background))',
                                                color: 'hsl(var(--foreground))'
                                            }}
                                        >
                                            {formData.verifyToken || 'leadflow_verify'}
                                        </code>
                                        <button
                                            onClick={() => copyToClipboard(formData.verifyToken || 'leadflow_verify')}
                                            className="p-2 rounded-lg border transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                                            style={{ borderColor: 'hsl(var(--border))' }}
                                        >
                                            <Copy className="w-4 h-4" style={{ color: 'hsl(var(--muted-foreground))' }} />
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-medium mb-2 uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                        Webhook Fields (Selecione)
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        {['messages', 'messaging_postbacks', 'message_deliveries', 'message_reads'].map(field => (
                                            <span 
                                                key={field}
                                                className="px-2 py-1 rounded text-xs font-mono"
                                                style={{ 
                                                    backgroundColor: 'hsl(var(--background))',
                                                    color: 'hsl(var(--foreground))'
                                                }}
                                            >
                                                {field}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div 
                                className="p-4 rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-900/20"
                            >
                                <p className="text-sm text-blue-700 dark:text-blue-300">
                                    <strong>Importante:</strong> Após configurar o webhook no Meta Business Suite, 
                                    clique em "Verificar e Salvar" para testar a conexão.
                                </p>
                            </div>

                            <button
                                onClick={() => setStep('success')}
                                className="w-full py-3 px-4 rounded-lg font-medium text-white shadow-lg transition-all bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800"
                            >
                                Concluir Configuração
                            </button>
                        </div>
                    )}

                    {/* Step: Success */}
                    {step === 'success' && (
                        <div className="text-center py-8 animate-fadeIn">
                            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Check className="w-8 h-8" strokeWidth={3} />
                            </div>
                            <h4 className="text-xl font-bold mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                                Configuração Concluída!
                            </h4>
                            <p className="mb-8 max-w-xs mx-auto" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                Seu WhatsApp Cloud API está configurado. As mensagens começarão a aparecer assim que o webhook estiver ativo.
                            </p>
                            <button
                                onClick={() => { onSuccess(); onClose(); }}
                                className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold shadow-lg transition-colors"
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
