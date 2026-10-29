// INBOX: Modal de Conexão WhatsApp Cloud API (Oficial Meta)
import { useState, useEffect } from 'react';
import { channelsApi } from '../../../services/api/inbox';
import { toast } from 'sonner';
import { ExternalLink, Copy, Check, Shield, Globe, AlertCircle } from 'lucide-react';
import { OverlayModal } from '../../base/OverlayModal';
import { LogoBox } from '../../base/LogoBox';

// API URL for webhook generation
const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000';

interface WhatsAppCloudConnectProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    editingChannel?: any;
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
        <OverlayModal onClose={onClose} stickyEdges={false} className="max-w-lg">
                {/* Header */}
                <div
                    className="px-6 py-4 border-b flex justify-between items-center"
                    style={{
                        borderColor: 'hsl(var(--border))',
                        backgroundColor: 'hsl(var(--muted))'
                    }}
                >
                    <div className="flex items-center gap-3">
                        <LogoBox brand="whatsapp" />
                        <div>
                            <h3 className="text-lg font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                                WhatsApp Business
                            </h3>
                            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                API Oficial da Meta
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="transition-colors p-1 rounded-full hover:bg-muted/50"
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
                                <details>
                                    <summary className="cursor-pointer select-none font-medium text-foreground">O que precisa</summary>
                                    <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                                        <li>• Conta no Meta Business Suite</li>
                                        <li>• Conta WhatsApp Business (WABA)</li>
                                        <li>• Número de telefone verificado</li>
                                        <li>• Token de acesso do sistema</li>
                                    </ul>
                                </details>
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
                                className="w-full py-3 px-4 rounded-lg font-medium text-white shadow-sm transition-all bg-green-600 hover:bg-green-700"
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
                                    Encontre em: Meta Business Suite → WhatsApp → Definições da API
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
                                        className="inline-flex items-center justify-center px-3 h-10 rounded-lg border text-sm font-medium transition-colors hover:bg-muted/50"
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
                                            ? 'bg-muted-foreground/70 cursor-not-allowed opacity-70'
                                            : 'bg-green-600 text-white hover:bg-green-700 transition-all duration-150'
                                        }`}
                                >
                                    {loading ? (
                                        <>
                                            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            <span>A guardar...</span>
                                        </>
                                    ) : (
                                        'Guardar e Continuar'
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
                                            className="p-2 rounded-lg border transition-colors hover:bg-muted/50"
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
                                            className="p-2 rounded-lg border transition-colors hover:bg-muted/50"
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


                            <button
                                onClick={() => setStep('success')}
                                className="w-full py-3 px-4 rounded-lg font-medium text-white shadow-sm transition-all bg-green-600 hover:bg-green-700"
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
                                O seu WhatsApp Business está configurado. As mensagens começarão a aparecer assim que o webhook estiver ativo.
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
            </OverlayModal>
    );
}
