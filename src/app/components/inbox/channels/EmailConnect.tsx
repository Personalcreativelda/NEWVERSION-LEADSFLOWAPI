// INBOX: Modal de Conexão Email com SMTP/IMAP
import React, { useState, useEffect } from 'react';
import { channelsApi } from '../../../services/api/inbox';
import { toast } from 'sonner';
import { Mail, Check, AlertCircle, Loader2, Info, CheckCircle, Eye, EyeOff, ChevronRight } from 'lucide-react';

interface EmailConnectProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

// Presets de provedores populares
const EMAIL_PROVIDERS = [
    {
        id: 'gmail',
        name: 'Gmail',
        icon: '📧',
        color: 'from-red-500 to-orange-500',
        smtp: { host: 'smtp.gmail.com', port: '587', secure: false },
        imap: { host: 'imap.gmail.com', port: '993', secure: true },
        note: 'Use uma Senha de App (não sua senha normal). Ative em: Google > Segurança > Senhas de App.'
    },
    {
        id: 'outlook',
        name: 'Microsoft / Outlook',
        icon: '📨',
        color: 'from-blue-500 to-blue-700',
        smtp: { host: 'smtp.office365.com', port: '587', secure: false },
        imap: { host: 'outlook.office365.com', port: '993', secure: true },
        note: 'Use sua senha normal ou uma Senha de App se tiver 2FA ativo.'
    },
    {
        id: 'yahoo',
        name: 'Yahoo Mail',
        icon: '💜',
        color: 'from-purple-500 to-purple-700',
        smtp: { host: 'smtp.mail.yahoo.com', port: '587', secure: false },
        imap: { host: 'imap.mail.yahoo.com', port: '993', secure: true },
        note: 'Gere uma Senha de App em: Yahoo > Segurança da Conta > Gerar Senha de App.'
    },
    {
        id: 'custom',
        name: 'Outro Provedor (SMTP)',
        icon: '⚙️',
        color: 'from-gray-500 to-gray-700',
        smtp: { host: '', port: '587', secure: false },
        imap: { host: '', port: '993', secure: true },
        note: 'Configure manualmente os dados do seu servidor SMTP/IMAP.'
    }
];

export function EmailConnect({ isOpen, onClose, onSuccess }: EmailConnectProps) {
    const [step, setStep] = useState<'provider' | 'config' | 'success'>('provider');
    const [selectedProvider, setSelectedProvider] = useState<typeof EMAIL_PROVIDERS[0] | null>(null);
    const [loading, setLoading] = useState(false);
    const [testingConnection, setTestingConnection] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        smtp_host: '',
        smtp_port: '587',
        smtp_secure: false,
        imap_host: '',
        imap_port: '993',
        imap_secure: true,
        from_name: ''
    });

    useEffect(() => {
        if (!isOpen) {
            setStep('provider');
            setSelectedProvider(null);
            setFormData({
                name: '', email: '', password: '',
                smtp_host: '', smtp_port: '587', smtp_secure: false,
                imap_host: '', imap_port: '993', imap_secure: true,
                from_name: ''
            });
            setError(null);
            setLoading(false);
            setShowPassword(false);
        }
    }, [isOpen]);

    const handleSelectProvider = (provider: typeof EMAIL_PROVIDERS[0]) => {
        setSelectedProvider(provider);
        setFormData(prev => ({
            ...prev,
            smtp_host: provider.smtp.host,
            smtp_port: provider.smtp.port,
            smtp_secure: provider.smtp.secure,
            imap_host: provider.imap.host,
            imap_port: provider.imap.port,
            imap_secure: provider.imap.secure,
        }));
        setStep('config');
    };

    const handleSubmit = async () => {
        if (!formData.name.trim() || !formData.email.trim() || !formData.password.trim()) {
            setError('Preencha todos os campos obrigatórios');
            return;
        }
        if (!formData.smtp_host.trim()) {
            setError('Informe o servidor SMTP');
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
                    password: formData.password,
                    provider: selectedProvider?.id || 'custom',
                    from_name: formData.from_name || formData.name,
                    smtp: {
                        host: formData.smtp_host,
                        port: parseInt(formData.smtp_port),
                        secure: formData.smtp_secure,
                        auth: {
                            user: formData.email,
                            pass: formData.password
                        }
                    },
                    imap: {
                        host: formData.imap_host,
                        port: parseInt(formData.imap_port),
                        secure: formData.imap_secure,
                        auth: {
                            user: formData.email,
                            pass: formData.password
                        }
                    }
                }
            });

            if (channel) {
                setStep('success');
                toast.success('Canal de email conectado!');
            }
        } catch (err: any) {
            console.error('Failed to create email channel:', err);
            setError(err.message || 'Erro ao criar canal de email.');
        } finally {
            setLoading(false);
        }
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
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-500 to-cyan-500 flex items-center justify-center">
                            <Mail className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                                {step === 'provider' ? 'Conectar Email' : step === 'config' ? (selectedProvider?.name || 'Configurar Email') : 'Sucesso!'}
                            </h2>
                            <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                {step === 'provider' ? 'Escolha seu provedor de email' : step === 'config' ? 'Configure SMTP e IMAP' : 'Canal criado com sucesso'}
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
                    {/* Step 1: Provider Selection */}
                    {step === 'provider' && (
                        <div className="space-y-3">
                            {EMAIL_PROVIDERS.map(provider => (
                                <button
                                    key={provider.id}
                                    onClick={() => handleSelectProvider(provider)}
                                    className="w-full flex items-center gap-4 p-4 rounded-xl border transition-all hover:shadow-md group"
                                    style={{
                                        borderColor: 'hsl(var(--border))',
                                        backgroundColor: 'hsl(var(--background))'
                                    }}
                                >
                                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${provider.color} flex items-center justify-center text-2xl flex-shrink-0`}>
                                        {provider.icon}
                                    </div>
                                    <div className="flex-1 text-left">
                                        <h3 className="font-semibold text-sm" style={{ color: 'hsl(var(--foreground))' }}>
                                            {provider.name}
                                        </h3>
                                        <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                            SMTP: {provider.smtp.host || 'Configurar manualmente'}
                                        </p>
                                    </div>
                                    <ChevronRight className="w-5 h-5 opacity-30 group-hover:opacity-70 transition-opacity" style={{ color: 'hsl(var(--foreground))' }} />
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Step 2: SMTP/IMAP Configuration */}
                    {step === 'config' && selectedProvider && (
                        <div className="space-y-5">
                            {/* Provider Note */}
                            {selectedProvider.note && (
                                <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10">
                                    <div className="flex items-start gap-2">
                                        <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                                        <p className="text-xs" style={{ color: 'hsl(var(--foreground))' }}>{selectedProvider.note}</p>
                                    </div>
                                </div>
                            )}

                            {/* Basic Info */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--foreground))' }}>
                                        Nome do Canal *
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                        placeholder="Ex: Suporte, Vendas"
                                        className="w-full px-3 py-2.5 rounded-lg border text-sm"
                                        style={{
                                            backgroundColor: 'hsl(var(--background))',
                                            borderColor: 'hsl(var(--border))',
                                            color: 'hsl(var(--foreground))'
                                        }}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--foreground))' }}>
                                        Nome do Remetente
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.from_name}
                                        onChange={(e) => setFormData(prev => ({ ...prev, from_name: e.target.value }))}
                                        placeholder="Minha Empresa"
                                        className="w-full px-3 py-2.5 rounded-lg border text-sm"
                                        style={{
                                            backgroundColor: 'hsl(var(--background))',
                                            borderColor: 'hsl(var(--border))',
                                            color: 'hsl(var(--foreground))'
                                        }}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--foreground))' }}>
                                    Email *
                                </label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                                    placeholder="seu@email.com"
                                    className="w-full px-3 py-2.5 rounded-lg border text-sm"
                                    style={{
                                        backgroundColor: 'hsl(var(--background))',
                                        borderColor: 'hsl(var(--border))',
                                        color: 'hsl(var(--foreground))'
                                    }}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--foreground))' }}>
                                    Senha / Senha de App *
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={formData.password}
                                        onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                                        placeholder="Senha do email ou App Password"
                                        className="w-full px-3 py-2.5 pr-10 rounded-lg border text-sm"
                                        style={{
                                            backgroundColor: 'hsl(var(--background))',
                                            borderColor: 'hsl(var(--border))',
                                            color: 'hsl(var(--foreground))'
                                        }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" style={{ color: 'hsl(var(--muted-foreground))' }} /> : <Eye className="w-4 h-4" style={{ color: 'hsl(var(--muted-foreground))' }} />}
                                    </button>
                                </div>
                            </div>

                            {/* SMTP Config */}
                            <div className="pt-2 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
                                <h4 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                    Servidor SMTP (Envio)
                                </h4>
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="col-span-2">
                                        <label className="block text-xs mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Host</label>
                                        <input
                                            type="text"
                                            value={formData.smtp_host}
                                            onChange={(e) => setFormData(prev => ({ ...prev, smtp_host: e.target.value }))}
                                            placeholder="smtp.exemplo.com"
                                            className="w-full px-3 py-2 rounded-lg border text-sm font-mono"
                                            style={{
                                                backgroundColor: 'hsl(var(--background))',
                                                borderColor: 'hsl(var(--border))',
                                                color: 'hsl(var(--foreground))'
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Porta</label>
                                        <input
                                            type="text"
                                            value={formData.smtp_port}
                                            onChange={(e) => setFormData(prev => ({ ...prev, smtp_port: e.target.value }))}
                                            className="w-full px-3 py-2 rounded-lg border text-sm font-mono"
                                            style={{
                                                backgroundColor: 'hsl(var(--background))',
                                                borderColor: 'hsl(var(--border))',
                                                color: 'hsl(var(--foreground))'
                                            }}
                                        />
                                    </div>
                                </div>
                                <label className="flex items-center gap-2 mt-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.smtp_secure}
                                        onChange={(e) => setFormData(prev => ({ ...prev, smtp_secure: e.target.checked }))}
                                        className="rounded border-gray-300"
                                    />
                                    <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>SSL/TLS</span>
                                </label>
                            </div>

                            {/* IMAP Config */}
                            <div className="pt-2 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
                                <h4 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                    Servidor IMAP (Recebimento)
                                </h4>
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="col-span-2">
                                        <label className="block text-xs mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Host</label>
                                        <input
                                            type="text"
                                            value={formData.imap_host}
                                            onChange={(e) => setFormData(prev => ({ ...prev, imap_host: e.target.value }))}
                                            placeholder="imap.exemplo.com"
                                            className="w-full px-3 py-2 rounded-lg border text-sm font-mono"
                                            style={{
                                                backgroundColor: 'hsl(var(--background))',
                                                borderColor: 'hsl(var(--border))',
                                                color: 'hsl(var(--foreground))'
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Porta</label>
                                        <input
                                            type="text"
                                            value={formData.imap_port}
                                            onChange={(e) => setFormData(prev => ({ ...prev, imap_port: e.target.value }))}
                                            className="w-full px-3 py-2 rounded-lg border text-sm font-mono"
                                            style={{
                                                backgroundColor: 'hsl(var(--background))',
                                                borderColor: 'hsl(var(--border))',
                                                color: 'hsl(var(--foreground))'
                                            }}
                                        />
                                    </div>
                                </div>
                                <label className="flex items-center gap-2 mt-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.imap_secure}
                                        onChange={(e) => setFormData(prev => ({ ...prev, imap_secure: e.target.checked }))}
                                        className="rounded border-gray-300"
                                    />
                                    <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>SSL/TLS</span>
                                </label>
                            </div>

                            {error && (
                                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-2">
                                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                                    <span className="text-sm text-red-500">{error}</span>
                                </div>
                            )}

                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => { setStep('provider'); setError(null); }}
                                    className="px-4 py-3 rounded-lg border text-sm font-medium transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                                    style={{ borderColor: 'hsl(var(--border))' }}
                                >
                                    Voltar
                                </button>
                                <button
                                    onClick={handleSubmit}
                                    disabled={loading || !formData.name.trim() || !formData.email.trim() || !formData.password.trim() || !formData.smtp_host.trim()}
                                    className="flex-1 px-4 py-3 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Conectando...
                                        </>
                                    ) : (
                                        <>
                                            <Check className="w-4 h-4" />
                                            Conectar Email
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Success */}
                    {step === 'success' && (
                        <div className="text-center py-8">
                            <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                                <CheckCircle className="w-10 h-10 text-green-500" />
                            </div>
                            <h3 className="text-xl font-semibold mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                                Canal de Email Conectado!
                            </h3>
                            <p className="text-sm mb-6" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                Seu email foi configurado via SMTP/IMAP. As mensagens começarão a aparecer na sua caixa de entrada.
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
