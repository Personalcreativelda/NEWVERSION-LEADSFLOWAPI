// INBOX: Modal de Conexão Facebook Messenger - Fluxo step-by-step
// Passo 1: Mostrar Callback URL + Verify Token para configurar no Meta
// Passo 2: Colar o Page Access Token gerado após webhook configurado
import { useState, useEffect } from 'react';
import { channelsApi } from '../../../services/api/inbox';
import type { Channel } from '../../../types/inbox';
import { toast } from 'sonner';
import { Check, AlertCircle, Loader2, ExternalLink, Info, CheckCircle, Copy, ChevronRight, ArrowLeft } from 'lucide-react';
import { BrandIcon } from '../../base/BrandIcon';
import { OverlayModal } from '../../base/OverlayModal';
import { LogoBox } from '../../base/LogoBox';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.leadsflowapi.com';

interface FacebookConnectProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    editingChannel?: Channel;
}

type Step = 'webhook' | 'token' | 'success';
type ConnectionStatus = 'idle' | 'validating' | 'connected' | 'error';

export function FacebookConnect({ isOpen, onClose, onSuccess, editingChannel }: FacebookConnectProps) {
    const isEditing = !!editingChannel;
    const [step, setStep] = useState<Step>(isEditing ? 'token' : 'webhook');
    const [pageAccessToken, setPageAccessToken] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [, setConnectionStatus] = useState<ConnectionStatus>('idle');
    const [pageInfo, setPageInfo] = useState<{ name?: string; id?: string; picture?: string } | null>(null);

    // URLs para configuração do webhook
    const webhookUrl = `${API_URL}/api/webhooks/facebook`;
    const verifyToken = 'leadsflow_verify_token';

    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        toast.success(`${label} copiado!`);
    };

    // Preencher dados quando for edição
    useEffect(() => {
        if (isEditing && editingChannel) {
            setPageAccessToken(''); // o token guardado não vem para o app
            setPageInfo({
                name: editingChannel.credentials?.page_name || editingChannel.name,
                id: editingChannel.credentials?.page_id,
                picture: editingChannel.credentials?.page_picture
            });
            setStep('token');
        }
    }, [isEditing, editingChannel]);

    // Reset state when modal closes
    useEffect(() => {
        if (!isOpen) {
            if (!isEditing) {
                setStep('webhook');
                setPageAccessToken('');
                setPageInfo(null);
            }
            setError(null);
            setLoading(false);
            setConnectionStatus('idle');
        }
    }, [isOpen, isEditing]);

    // Validate token and create channel
    const validateAndConnect = async () => {
        // Ao editar, o token guardado não vem para o app: campo vazio = manter o atual
        const keepStoredToken = isEditing && !!editingChannel && !pageAccessToken.trim();
        if (!pageAccessToken.trim() && !keepStoredToken) {
            setError('Indique o token de acesso da página');
            return;
        }

        setLoading(true);
        setError(null);
        setConnectionStatus('validating');

        try {
            if (keepStoredToken && editingChannel) {
                // O servidor volta a confirmar o token guardado junto da Meta
                await channelsApi.update(editingChannel.id, { status: 'active', credentials: {} });
                toast.success('Ligação ao Facebook confirmada');
                setConnectionStatus('connected');
                setStep('success');
                setTimeout(() => { onSuccess(); onClose(); }, 2500);
                return;
            }

            // Validar token com Facebook Graph API
            const response = await fetch(
                `https://graph.facebook.com/v21.0/me?fields=id,name,picture&access_token=${pageAccessToken}`
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

            // Criar ou atualizar canal no sistema
            if (isEditing && editingChannel) {
                await channelsApi.update(editingChannel.id, {
                    type: 'facebook',
                    name: data.name || 'Facebook Messenger',
                    status: 'active',
                    credentials: {
                        page_id: data.id,
                        page_access_token: pageAccessToken,
                        page_name: data.name,
                        page_picture: data.picture?.data?.url
                    }
                });
                toast.success('Canal Facebook atualizado com sucesso!');
            } else {
                await channelsApi.create({
                    type: 'facebook',
                    name: data.name || 'Facebook Messenger',
                    status: 'active',
                    credentials: {
                        page_id: data.id,
                        page_access_token: pageAccessToken,
                        page_name: data.name,
                        page_picture: data.picture?.data?.url
                    }
                });
                toast.success('Facebook Messenger ligado com sucesso!');
            }

            setConnectionStatus('connected');
            setStep('success');

            setTimeout(() => {
                onSuccess();
                onClose();
            }, 2500);

        } catch (err: any) {
            console.error('[Facebook] Error:', err);
            setError(err.response?.data?.message || err.message || 'Erro ao ligar com Facebook');
            setConnectionStatus('error');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <OverlayModal onClose={onClose} stickyEdges={false} className="max-w-2xl overflow-hidden flex flex-col">
                {/* Header */}
                <div
                    className="px-4 sm:px-6 py-3 sm:py-4 border-b flex items-center justify-between flex-shrink-0"
                    style={{ borderColor: 'hsl(var(--border))' }}
                >
                    <div className="flex items-center gap-3">
                        <LogoBox brand="messenger" />
                        <div>
                            <h2 className="text-lg font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                                {isEditing ? 'Editar Canal Facebook' : 'Ligar Facebook Messenger'}
                            </h2>
                            <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                {isEditing ? 'Atualize o token de acesso' : step === 'webhook' ? 'Passo 1 de 2 — Configurar Webhook' : step === 'token' ? 'Passo 2 de 2 — Token de Acesso' : 'Ligado!'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                        <span className="text-xl" style={{ color: 'hsl(var(--muted-foreground))' }}>×</span>
                    </button>
                </div>

                {/* Step Indicator */}
                {step !== 'success' && (
                    <div className="px-6 pt-4 flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                                step === 'webhook' ? 'bg-blue-600 text-white' : 'bg-green-500 text-white'
                            }`}>
                                {step === 'webhook' ? '1' : <Check className="w-4 h-4" />}
                            </div>
                            <div className={`flex-1 h-1 rounded ${
                                step === 'token' ? 'bg-blue-600' : 'bg-muted '
                            }`} />
                            <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                                step === 'token' ? 'bg-blue-600 text-white' : 'bg-muted  text-muted-foreground'
                            }`}>
                                2
                            </div>
                        </div>
                    </div>
                )}

                {/* Content */}
                <div className="p-4 sm:p-6 overflow-y-auto flex-1"
                    style={{
                        maxHeight: 'calc(90vh - 160px)'
                    }}
                >
                    {/* ═══ STEP 1: WEBHOOK CONFIGURATION ═══ */}
                    {step === 'webhook' && (
                        <div className="space-y-5">
                            {/* Intro */}
                            <div className="p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10">
                                <div className="flex items-start gap-3">
                                    <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                                    <div className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                        <p className="font-medium mb-1" style={{ color: 'hsl(var(--foreground))' }}>
                                            Antes de gerar o token, configure o webhook na Meta:
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Webhook URL & Verify Token */}
                            <div className="p-4 rounded-lg border border-blue-500/30 bg-blue-500/10">
                                <div className="flex items-start gap-3">
                                    <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                                    <div className="text-sm w-full" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                        <p className="font-medium mb-3" style={{ color: 'hsl(var(--foreground))' }}>
                                            Copie e cole no Meta for Developers:
                                        </p>

                                        <div className="space-y-3">
                                            <div>
                                                <span className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--foreground))' }}>
                                                    Callback URL:
                                                </span>
                                                <div
                                                    className="flex items-center justify-between rounded-lg px-3 py-2 border"
                                                    style={{
                                                        backgroundColor: 'hsl(var(--background))',
                                                        borderColor: 'hsl(var(--border))'
                                                    }}
                                                >
                                                    <code className="text-xs font-mono break-all" style={{ color: 'hsl(var(--foreground))' }}>
                                                        {webhookUrl}
                                                    </code>
                                                    <button
                                                        onClick={() => copyToClipboard(webhookUrl, 'Callback URL')}
                                                        className="ml-2 p-1.5 hover:bg-blue-500/20 rounded flex-shrink-0 transition-colors"
                                                        title="Copiar"
                                                    >
                                                        <Copy className="w-4 h-4 text-blue-400" />
                                                    </button>
                                                </div>
                                            </div>

                                            <div>
                                                <span className="text-xs font-medium block mb-1" style={{ color: 'hsl(var(--foreground))' }}>
                                                    Verify Token:
                                                </span>
                                                <div
                                                    className="flex items-center justify-between rounded-lg px-3 py-2 border"
                                                    style={{
                                                        backgroundColor: 'hsl(var(--background))',
                                                        borderColor: 'hsl(var(--border))'
                                                    }}
                                                >
                                                    <code className="text-xs font-mono" style={{ color: 'hsl(var(--foreground))' }}>
                                                        {verifyToken}
                                                    </code>
                                                    <button
                                                        onClick={() => copyToClipboard(verifyToken, 'Verify Token')}
                                                        className="ml-2 p-1.5 hover:bg-blue-500/20 rounded flex-shrink-0 transition-colors"
                                                        title="Copiar"
                                                    >
                                                        <Copy className="w-4 h-4 text-blue-400" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Step-by-step Instructions */}
                            <div
                                className="p-4 rounded-lg border"
                                style={{
                                    backgroundColor: 'hsl(var(--muted))',
                                    borderColor: 'hsl(var(--border))'
                                }}
                            >
                                <details>
                                <summary className="cursor-pointer select-none font-medium text-foreground">Passo a passo</summary>
                                <ol className="mt-2 list-decimal list-inside space-y-2 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                    <li>
                                        Acesse o{' '}
                                        <a
                                            href="https://developers.facebook.com/apps"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-400 hover:underline inline-flex items-center gap-1"
                                        >
                                            Meta for Developers <ExternalLink className="w-3 h-3" />
                                        </a>
                                    </li>
                                    <li>Selecione ou crie seu aplicativo (tipo: <strong>Business</strong>)</li>
                                    <li>No menu lateral, vá em <strong>Messenger</strong> &gt; <strong>Definições</strong></li>
                                    <li>Na seção <strong>Webhooks</strong>, clique em <strong>Adicionar Callback URL</strong></li>
                                    <li>Cole a <strong>Callback URL</strong> e o <strong>Verify Token</strong> acima</li>
                                    <li>Clique em <strong>Verificar e guardar</strong></li>
                                    <li>Marque os campos: <strong>messages</strong> e <strong>messaging_postbacks</strong></li>
                                </ol>
                                </details>
                            </div>

                            {/* Actions */}
                            <div className="flex flex-col sm:flex-row gap-3">
                                <button
                                    onClick={onClose}
                                    className="flex-1 w-full sm:w-auto px-4 h-10 rounded-lg border text-sm font-medium transition-colors hover:bg-muted/50"
                                    style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={() => setStep('token')}
                                    className="flex-1 w-full sm:w-auto px-4 py-3 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                                >
                                    Webhook Configurado
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ═══ STEP 2: PAGE ACCESS TOKEN ═══ */}
                    {step === 'token' && (
                        <div className="space-y-5">
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
                                        <details>
                                        <summary className="cursor-pointer select-none font-medium text-foreground">Como gerar o token de acesso</summary>
                                        <ol className="mt-2 list-decimal list-inside space-y-1">
                                            <li>No <strong>Meta for Developers</strong>, vá em <strong>Messenger</strong> &gt; <strong>Definições</strong></li>
                                            <li>Na seção <strong>Token de Acesso</strong>, selecione sua página</li>
                                            <li>Clique em <strong>Gerar Token</strong></li>
                                            <li>Copie o token gerado e cole abaixo</li>
                                        </ol>
                                        </details>
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
                                    onChange={(e) => {
                                        setPageAccessToken(e.target.value);
                                        setError(null);
                                    }}
                                    placeholder={isEditing ? 'Deixe em branco para manter o token atual' : 'EAAxxxxxx...'}
                                    rows={3}
                                    className="w-full px-4 py-3 rounded-lg border text-sm font-mono resize-none"
                                    style={{
                                        backgroundColor: 'hsl(var(--background))',
                                        borderColor: error ? 'hsl(0 84% 60%)' : 'hsl(var(--border))',
                                        color: 'hsl(var(--foreground))'
                                    }}
                                />
                            </div>

                            {/* Error */}
                            {error && (
                                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-2">
                                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
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
                                            <BrandIcon brand="facebook" mono className="w-6 h-6" />
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
                            <div className="flex flex-col sm:flex-row gap-3">
                                {!isEditing && (
                                    <button
                                        onClick={() => {
                                            setStep('webhook');
                                            setError(null);
                                        }}
                                        className="px-4 py-3 rounded-lg border text-sm font-medium transition-colors hover:bg-muted/50 flex items-center justify-center gap-2"
                                        style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                                    >
                                        <ArrowLeft className="w-4 h-4" />
                                        Voltar
                                    </button>
                                )}
                                <button
                                    onClick={validateAndConnect}
                                    disabled={loading || (!pageAccessToken.trim() && !isEditing)}
                                    className="flex-1 w-full sm:w-auto px-4 h-10 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            {isEditing ? 'A atualizar...' : 'A validar...'}
                                        </>
                                    ) : (
                                        <>
                                            <Check className="w-4 h-4" />
                                            {isEditing ? 'Atualizar Canal' : 'Ligar'}
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

                    {/* ═══ STEP 3: SUCCESS ═══ */}
                    {step === 'success' && (
                        <div className="text-center py-8">
                            <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                                <CheckCircle className="w-10 h-10 text-green-500" />
                            </div>
                            <h3 className="text-xl font-semibold mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                                Facebook Messenger Ligado!
                            </h3>
                            <p className="text-sm mb-4" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                Sua página <strong>{pageInfo?.name}</strong> está pronta para receber mensagens.
                            </p>
                            <p className="text-xs mb-2" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                As mensagens do Messenger aparecerão automaticamente na sua inbox.
                            </p>
                            <div className="animate-pulse text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                A redirecionar...
                            </div>
                        </div>
                    )}
                </div>
            </OverlayModal>
    );
}
