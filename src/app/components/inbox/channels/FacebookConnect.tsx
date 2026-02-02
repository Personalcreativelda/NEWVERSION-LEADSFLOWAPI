// INBOX: Modal de Conexão Facebook Messenger via Page Access Token
import React, { useState, useEffect } from 'react';
import { channelsApi } from '../../../services/api/inbox';
import { toast } from 'sonner';
import { Facebook, Check, AlertCircle, Loader2, ExternalLink, Info, CheckCircle } from 'lucide-react';

interface FacebookConnectProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

type ConnectionStatus = 'idle' | 'validating' | 'connected' | 'error';

export function FacebookConnect({ isOpen, onClose, onSuccess }: FacebookConnectProps) {
    const [step, setStep] = useState<'form' | 'success'>('form');
    const [pageId, setPageId] = useState('');
    const [pageAccessToken, setPageAccessToken] = useState('');
    const [pageName, setPageName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
    const [pageInfo, setPageInfo] = useState<{ name?: string; id?: string; picture?: string } | null>(null);

    // Reset state when modal closes
    useEffect(() => {
        if (!isOpen) {
            setStep('form');
            setPageId('');
            setPageAccessToken('');
            setPageName('');
            setError(null);
            setLoading(false);
            setConnectionStatus('idle');
            setPageInfo(null);
        }
    }, [isOpen]);

    // Validate page token
    const validateToken = async () => {
        if (!pageAccessToken.trim()) {
            setError('Informe o token de acesso da página');
            return;
        }

        setLoading(true);
        setError(null);
        setConnectionStatus('validating');

        try {
            // Validate with Facebook Graph API
            const response = await fetch(
                `https://graph.facebook.com/v18.0/me?fields=id,name,picture&access_token=${pageAccessToken}`
            );
            const data = await response.json();

            if (data.error) {
                throw new Error(data.error.message || 'Token inválido');
            }

            setPageInfo({
                name: data.name,
                id: data.id,
                picture: data.picture?.data?.url
            });
            setPageName(data.name);
            setPageId(data.id);

            // Create channel in our system using channelsApi
            await channelsApi.create({
                type: 'facebook',
                name: data.name || 'Página do Facebook',
                status: 'active',
                credentials: {
                    page_id: data.id,
                    page_access_token: pageAccessToken,
                    page_name: data.name
                }
            });

            setConnectionStatus('connected');
            setStep('success');
            toast.success('Facebook conectado com sucesso!');
            
            setTimeout(() => {
                onSuccess();
                onClose();
            }, 2000);

        } catch (err: any) {
            console.error('[Facebook] Error:', err);
            setError(err.response?.data?.message || err.message || 'Erro ao conectar com Facebook');
            setConnectionStatus('error');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
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
                        <div className="w-10 h-10 rounded-full bg-blue-600/10 flex items-center justify-center">
                            <Facebook className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                                Conectar Facebook Messenger
                            </h2>
                            <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                Configure sua página do Facebook
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
                <div className="p-6">
                    {step === 'form' && (
                        <div className="space-y-6">
                            {/* Instructions */}
                            <div 
                                className="p-4 rounded-lg border"
                                style={{ 
                                    backgroundColor: 'hsl(var(--muted))',
                                    borderColor: 'hsl(var(--border))'
                                }}
                            >
                                <div className="flex items-start gap-3">
                                    <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                                    <div className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                        <p className="font-medium mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                                            Como obter o token de acesso:
                                        </p>
                                        <ol className="list-decimal list-inside space-y-1">
                                            <li>Acesse o <strong>Meta Business Suite</strong></li>
                                            <li>Vá em <strong>Configurações &gt; Contas &gt; Páginas</strong></li>
                                            <li>Selecione sua página e vá em <strong>Configurações da Página</strong></li>
                                            <li>Em <strong>Messenger Platform</strong>, gere um token de acesso</li>
                                            <li>Copie o token e cole abaixo</li>
                                        </ol>
                                    </div>
                                </div>
                            </div>

                            {/* Token Input */}
                            <div>
                                <label 
                                    className="block text-sm font-medium mb-2"
                                    style={{ color: 'hsl(var(--foreground))' }}
                                >
                                    Token de Acesso da Página
                                </label>
                                <textarea
                                    value={pageAccessToken}
                                    onChange={(e) => setPageAccessToken(e.target.value)}
                                    placeholder="EAAxxxxxx..."
                                    rows={3}
                                    className="w-full px-4 py-3 rounded-lg border text-sm font-mono resize-none"
                                    style={{ 
                                        backgroundColor: 'hsl(var(--background))',
                                        borderColor: 'hsl(var(--border))',
                                        color: 'hsl(var(--foreground))'
                                    }}
                                />
                            </div>

                            {/* Error */}
                            {error && (
                                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4 text-red-500" />
                                    <span className="text-sm text-red-500">{error}</span>
                                </div>
                            )}

                            {/* Page Info Preview */}
                            {pageInfo && (
                                <div 
                                    className="p-4 rounded-lg border flex items-center gap-3"
                                    style={{ 
                                        backgroundColor: 'hsl(var(--muted))',
                                        borderColor: 'hsl(var(--border))'
                                    }}
                                >
                                    {pageInfo.picture ? (
                                        <img 
                                            src={pageInfo.picture} 
                                            alt={pageInfo.name} 
                                            className="w-12 h-12 rounded-full"
                                        />
                                    ) : (
                                        <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white text-xl">
                                            <Facebook className="w-6 h-6" />
                                        </div>
                                    )}
                                    <div>
                                        <p className="font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                                            {pageInfo.name}
                                        </p>
                                        <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                            ID: {pageInfo.id}
                                        </p>
                                    </div>
                                    <CheckCircle className="w-5 h-5 text-green-500 ml-auto" />
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex gap-3">
                                <button
                                    onClick={onClose}
                                    className="flex-1 px-4 py-3 rounded-lg border text-sm font-medium transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                                    style={{ borderColor: 'hsl(var(--border))' }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={validateToken}
                                    disabled={loading || !pageAccessToken.trim()}
                                    className="flex-1 px-4 py-3 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Validando...
                                        </>
                                    ) : (
                                        <>
                                            <Check className="w-4 h-4" />
                                            Conectar
                                        </>
                                    )}
                                </button>
                            </div>

                            {/* Help Link */}
                            <a
                                href="https://developers.facebook.com/docs/messenger-platform/getting-started"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-2 text-sm text-blue-500 hover:underline"
                            >
                                <ExternalLink className="w-4 h-4" />
                                Documentação do Messenger Platform
                            </a>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="text-center py-8">
                            <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                                <CheckCircle className="w-10 h-10 text-green-500" />
                            </div>
                            <h3 className="text-xl font-semibold mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                                Facebook Conectado!
                            </h3>
                            <p className="text-sm mb-4" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                Sua página <strong>{pageInfo?.name}</strong> está pronta para receber mensagens.
                            </p>
                            <div className="animate-pulse text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                Redirecionando...
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
