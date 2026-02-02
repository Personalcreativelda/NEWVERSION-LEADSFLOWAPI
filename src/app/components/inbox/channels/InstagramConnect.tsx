// INBOX: Modal de Conexão Instagram via Instagram Business API
import React, { useState, useEffect } from 'react';
import { channelsApi } from '../../../services/api/inbox';
import { toast } from 'sonner';
import { Instagram, Check, AlertCircle, Loader2, ExternalLink, Info, CheckCircle } from 'lucide-react';

interface InstagramConnectProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

type ConnectionStatus = 'idle' | 'validating' | 'connected' | 'error';

export function InstagramConnect({ isOpen, onClose, onSuccess }: InstagramConnectProps) {
    const [step, setStep] = useState<'form' | 'success'>('form');
    const [accessToken, setAccessToken] = useState('');
    const [instagramId, setInstagramId] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
    const [accountInfo, setAccountInfo] = useState<{ username?: string; name?: string; profile_picture_url?: string } | null>(null);

    // Reset state when modal closes
    useEffect(() => {
        if (!isOpen) {
            setStep('form');
            setAccessToken('');
            setInstagramId('');
            setError(null);
            setLoading(false);
            setConnectionStatus('idle');
            setAccountInfo(null);
        }
    }, [isOpen]);

    // Validate access token
    const validateToken = async () => {
        if (!accessToken.trim()) {
            setError('Informe o token de acesso');
            return;
        }

        setLoading(true);
        setError(null);
        setConnectionStatus('validating');

        try {
            // First get the Instagram Business Account ID from the page
            const pageResponse = await fetch(
                `https://graph.facebook.com/v18.0/me/accounts?fields=instagram_business_account{id,username,name,profile_picture_url}&access_token=${accessToken}`
            );
            const pageData = await pageResponse.json();

            if (pageData.error) {
                throw new Error(pageData.error.message || 'Token inválido');
            }

            // Find the Instagram business account
            let igAccount = null;
            for (const page of pageData.data || []) {
                if (page.instagram_business_account) {
                    igAccount = page.instagram_business_account;
                    break;
                }
            }

            if (!igAccount) {
                throw new Error('Nenhuma conta Instagram Business encontrada. Verifique se sua página do Facebook está vinculada a uma conta profissional do Instagram.');
            }

            setAccountInfo({
                username: igAccount.username,
                name: igAccount.name,
                profile_picture_url: igAccount.profile_picture_url
            });
            setInstagramId(igAccount.id);

            // Create channel in our system using channelsApi
            await channelsApi.create({
                type: 'instagram',
                name: igAccount.username || igAccount.name || 'Instagram',
                status: 'active',
                credentials: {
                    instagram_id: igAccount.id,
                    access_token: accessToken,
                    username: igAccount.username
                }
            });

            setConnectionStatus('connected');
            setStep('success');
            toast.success('Instagram conectado com sucesso!');
            
            setTimeout(() => {
                onSuccess();
                onClose();
            }, 2000);

        } catch (err: any) {
            console.error('[Instagram] Error:', err);
            setError(err.response?.data?.message || err.message || 'Erro ao conectar com Instagram');
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
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 flex items-center justify-center">
                            <Instagram className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                                Conectar Instagram
                            </h2>
                            <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                Configure sua conta profissional do Instagram
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
                            {/* Requirements Notice */}
                            <div 
                                className="p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10"
                            >
                                <div className="flex items-start gap-3">
                                    <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                                    <div className="text-sm text-yellow-200">
                                        <p className="font-medium mb-1">Requisitos:</p>
                                        <ul className="list-disc list-inside space-y-0.5 text-yellow-300/80">
                                            <li>Conta do Instagram deve ser <strong>Profissional</strong> (Business ou Creator)</li>
                                            <li>Conta deve estar vinculada a uma <strong>Página do Facebook</strong></li>
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            {/* Instructions */}
                            <div 
                                className="p-4 rounded-lg border"
                                style={{ 
                                    backgroundColor: 'hsl(var(--muted))',
                                    borderColor: 'hsl(var(--border))'
                                }}
                            >
                                <div className="flex items-start gap-3">
                                    <Info className="w-5 h-5 text-pink-500 flex-shrink-0 mt-0.5" />
                                    <div className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                        <p className="font-medium mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                                            Como obter o token de acesso:
                                        </p>
                                        <ol className="list-decimal list-inside space-y-1">
                                            <li>Acesse o <strong>Meta Business Suite</strong></li>
                                            <li>Vá em <strong>Configurações &gt; Contas do Instagram</strong></li>
                                            <li>Vincule sua conta do Instagram à página</li>
                                            <li>No <strong>Meta for Developers</strong>, gere um token com permissões do Instagram</li>
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
                                    Token de Acesso
                                </label>
                                <textarea
                                    value={accessToken}
                                    onChange={(e) => setAccessToken(e.target.value)}
                                    placeholder="EAAxxxxxx..."
                                    rows={3}
                                    className="w-full px-4 py-3 rounded-lg border text-sm font-mono resize-none"
                                    style={{ 
                                        backgroundColor: 'hsl(var(--background))',
                                        borderColor: 'hsl(var(--border))',
                                        color: 'hsl(var(--foreground))'
                                    }}
                                />
                                <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                    Use o mesmo token da sua página do Facebook que está vinculada ao Instagram
                                </p>
                            </div>

                            {/* Error */}
                            {error && (
                                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-2">
                                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                                    <span className="text-sm text-red-500">{error}</span>
                                </div>
                            )}

                            {/* Account Info Preview */}
                            {accountInfo && (
                                <div 
                                    className="p-4 rounded-lg border flex items-center gap-3"
                                    style={{ 
                                        backgroundColor: 'hsl(var(--muted))',
                                        borderColor: 'hsl(var(--border))'
                                    }}
                                >
                                    {accountInfo.profile_picture_url ? (
                                        <img 
                                            src={accountInfo.profile_picture_url} 
                                            alt={accountInfo.username} 
                                            className="w-12 h-12 rounded-full"
                                        />
                                    ) : (
                                        <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 flex items-center justify-center text-white">
                                            <Instagram className="w-6 h-6" />
                                        </div>
                                    )}
                                    <div>
                                        <p className="font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                                            @{accountInfo.username}
                                        </p>
                                        {accountInfo.name && (
                                            <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                                {accountInfo.name}
                                            </p>
                                        )}
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
                                    disabled={loading || !accessToken.trim()}
                                    className="flex-1 px-4 py-3 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
                                href="https://developers.facebook.com/docs/instagram-api/getting-started"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-2 text-sm text-pink-400 hover:underline"
                            >
                                <ExternalLink className="w-4 h-4" />
                                Documentação da Instagram API
                            </a>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="text-center py-8">
                            <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                                <CheckCircle className="w-10 h-10 text-green-500" />
                            </div>
                            <h3 className="text-xl font-semibold mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                                Instagram Conectado!
                            </h3>
                            <p className="text-sm mb-4" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                Sua conta <strong>@{accountInfo?.username}</strong> está pronta para receber mensagens.
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
