// INBOX: Modal de Conexão Instagram via Instagram Business API
import React, { useState, useEffect, useMemo } from 'react';
import { channelsApi } from '../../../services/api/inbox';
import type { Channel } from '../../../types/inbox';
import { toast } from 'sonner';
import { Instagram, Check, AlertCircle, Loader2, ExternalLink, Info, CheckCircle, Copy, AlertTriangle } from 'lucide-react';

// URL base da API (pegar do env ou usar padrão)
const API_URL = import.meta.env.VITE_API_URL || 'https://api.leadsflowapi.com';

interface InstagramConnectProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    editingChannel?: Channel;
}

type ConnectionStatus = 'idle' | 'validating' | 'connected' | 'error';

export function InstagramConnect({ isOpen, onClose, onSuccess, editingChannel }: InstagramConnectProps) {
    const isEditing = !!editingChannel;
    const [step, setStep] = useState<'form' | 'success'>('form');
    const [accessToken, setAccessToken] = useState('');
    const [instagramId, setInstagramId] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
    const [accountInfo, setAccountInfo] = useState<{ username?: string; name?: string; profile_picture_url?: string } | null>(null);

    // Detectar tipo de token em tempo real
    const tokenType = useMemo(() => {
        const token = accessToken.trim();
        if (token.startsWith('IGAA') || token.startsWith('IGA')) return 'instagram';
        // EAA = Page/App Token, EAF = System User Token (permanente - ideal para SaaS)
        if (token.startsWith('EAA') || token.startsWith('EAF')) return 'facebook';
        return null;
    }, [accessToken]);

    // URLs do webhook
    const webhookUrl = `${API_URL}/api/webhooks/instagram`;
    const verifyToken = 'leadsflow_verify_token';

    // Copiar para clipboard
    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        toast.success(`${label} copiado!`);
    };

    // Preencher dados quando for edição
    useEffect(() => {
        if (isEditing && editingChannel) {
            setAccessToken(editingChannel.credentials?.access_token || '');
            setInstagramId(editingChannel.credentials?.instagram_id || '');
            setAccountInfo({
                username: editingChannel.credentials?.username || editingChannel.name,
                name: editingChannel.credentials?.name,
                profile_picture_url: editingChannel.credentials?.profile_picture_url
            });
        }
    }, [isEditing, editingChannel]);

    // Reset state when modal closes
    useEffect(() => {
        if (!isOpen) {
            if (!isEditing) {
                setStep('form');
                setAccessToken('');
                setInstagramId('');
                setAccountInfo(null);
            }
            setError(null);
            setLoading(false);
            setConnectionStatus('idle');
        }
    }, [isOpen, isEditing]);

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
            let igAccount = null;
            const token = accessToken.trim();

            // Detectar tipo de token baseado no prefixo
            // IGAA... = Instagram User Token (da Instagram Basic Display API ou Instagram Graph API)
            // EAA... = Facebook Page Token (da Facebook Graph API)
            const isInstagramToken = token.startsWith('IGAA') || token.startsWith('IGA');

            if (isInstagramToken) {
                // Token do Instagram - usar Instagram Graph API diretamente
                console.log('[Instagram] Detectado token do Instagram (IGAA/IGA), usando Instagram Graph API');

                const igResponse = await fetch(
                    `https://graph.instagram.com/me?fields=id,username,account_type,name&access_token=${token}`
                );
                const igData = await igResponse.json();

                if (igData.error) {
                    console.error('[Instagram] Error:', igData.error);
                    throw new Error(igData.error.message || 'Token do Instagram inválido');
                }

                igAccount = {
                    id: igData.id,
                    username: igData.username,
                    name: igData.name || igData.username
                };

                console.log('[Instagram] Conta encontrada:', igAccount);

            } else {
                // Token do Facebook/Meta - buscar Instagram Business Account via Pages
                const isSystemUserToken = token.startsWith('EAF');
                console.log(`[Instagram] Detectado token ${isSystemUserToken ? 'System User (EAF)' : 'Page (EAA)'}, usando Facebook Graph API`);

                let pages: any[] = [];
                let igAccountDirect: any = null; // Para busca direta via business

                // 1. Tentar /me/accounts primeiro (funciona para Page tokens e System User com pages_show_list)
                try {
                    const pageResponse = await fetch(
                        `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}&access_token=${token}`
                    );
                    const pageData = await pageResponse.json();

                    if (!pageData.error) {
                        pages = pageData.data || [];
                        console.log('[Instagram] /me/accounts - Páginas encontradas:', pages.length);
                    } else {
                        console.warn('[Instagram] /me/accounts erro:', pageData.error.message);
                    }
                } catch (err) {
                    console.warn('[Instagram] /me/accounts falhou:', err);
                }

                // 2. Se 0 páginas e é System User token, tentar via Business Manager
                if (pages.length === 0 && isSystemUserToken) {
                    console.log('[Instagram] System User token sem páginas em /me/accounts, tentando via Business Manager...');

                    // 2a. Buscar business ID do System User
                    let businessId = null;
                    try {
                        const bizResponse = await fetch(
                            `https://graph.facebook.com/v21.0/me?fields=id,name,business&access_token=${token}`
                        );
                        const bizData = await bizResponse.json();
                        console.log('[Instagram] System User info:', JSON.stringify(bizData));
                        businessId = bizData?.business?.id;
                    } catch (err) {
                        console.warn('[Instagram] /me?fields=business falhou:', err);
                    }

                    // 2b. Se não encontrou business via /me, tentar /me/businesses
                    if (!businessId) {
                        try {
                            const bizsResponse = await fetch(
                                `https://graph.facebook.com/v21.0/me/businesses?fields=id,name&access_token=${token}`
                            );
                            const bizsData = await bizsResponse.json();
                            console.log('[Instagram] /me/businesses:', JSON.stringify(bizsData));
                            if (bizsData.data && bizsData.data.length > 0) {
                                businessId = bizsData.data[0].id;
                            }
                        } catch (err) {
                            console.warn('[Instagram] /me/businesses falhou:', err);
                        }
                    }

                    console.log('[Instagram] Business ID encontrado:', businessId || 'nenhum');

                    if (businessId) {
                        // 2c. Tentar owned_pages do business
                        try {
                            const bizPagesResponse = await fetch(
                                `https://graph.facebook.com/v21.0/${businessId}/owned_pages?fields=id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}&access_token=${token}`
                            );
                            const bizPagesData = await bizPagesResponse.json();
                            console.log('[Instagram] owned_pages:', bizPagesData.data?.length || 0, 'páginas');

                            if (bizPagesData.data && bizPagesData.data.length > 0) {
                                pages = bizPagesData.data;
                            }
                        } catch (err) {
                            console.warn('[Instagram] owned_pages falhou:', err);
                        }

                        // 2d. Se ainda 0, tentar client_pages
                        if (pages.length === 0) {
                            try {
                                const clientPagesResponse = await fetch(
                                    `https://graph.facebook.com/v21.0/${businessId}/client_pages?fields=id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}&access_token=${token}`
                                );
                                const clientPagesData = await clientPagesResponse.json();
                                console.log('[Instagram] client_pages:', clientPagesData.data?.length || 0, 'páginas');

                                if (clientPagesData.data && clientPagesData.data.length > 0) {
                                    pages = clientPagesData.data;
                                }
                            } catch (err) {
                                console.warn('[Instagram] client_pages falhou:', err);
                            }
                        }

                        // 2e. Se ainda sem páginas com IG, tentar buscar IG accounts diretamente do business
                        if (pages.length === 0 || !pages.some((p: any) => p.instagram_business_account)) {
                            try {
                                const igAccResponse = await fetch(
                                    `https://graph.facebook.com/v21.0/${businessId}/instagram_accounts?fields=id,username,name,profile_picture_url&access_token=${token}`
                                );
                                const igAccData = await igAccResponse.json();
                                console.log('[Instagram] business/instagram_accounts:', JSON.stringify(igAccData));

                                if (igAccData.data && igAccData.data.length > 0) {
                                    igAccountDirect = igAccData.data[0];
                                    console.log('[Instagram] IG account encontrada via business:', igAccountDirect.username);
                                }
                            } catch (err) {
                                console.warn('[Instagram] instagram_accounts falhou:', err);
                            }
                        }
                    }

                    // 2f. Última tentativa: buscar pages atribuídas ao System User via /me/assigned_pages
                    if (pages.length === 0 && !igAccountDirect) {
                        try {
                            const assignedResponse = await fetch(
                                `https://graph.facebook.com/v21.0/me/assigned_pages?fields=id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}&access_token=${token}`
                            );
                            const assignedData = await assignedResponse.json();
                            console.log('[Instagram] assigned_pages:', JSON.stringify(assignedData));

                            if (assignedData.data && assignedData.data.length > 0) {
                                pages = assignedData.data;
                            }
                        } catch (err) {
                            console.warn('[Instagram] assigned_pages falhou:', err);
                        }
                    }
                }

                // 3. Encontrar a página com Instagram Business Account
                let selectedPage = null;
                for (const page of pages) {
                    console.log('[Instagram] Verificando página:', page.name, 'IG Account:', !!page.instagram_business_account);
                    if (page.instagram_business_account) {
                        igAccount = page.instagram_business_account;
                        selectedPage = page;
                        break;
                    }
                }

                // 4. Se não encontrou via páginas mas encontrou IG account direta
                if (!igAccount && igAccountDirect) {
                    console.log('[Instagram] Usando IG account encontrada diretamente via business');
                    igAccount = igAccountDirect;

                    // Tentar pegar a primeira página disponível para o page_id
                    if (pages.length > 0) {
                        selectedPage = pages[0];
                    }
                }

                if (!igAccount) {
                    const permissionHint = isSystemUserToken
                        ? '\n\nVerifique no Meta Business Suite:\n1. Usuários do Sistema > seu System User > Adicionar Ativos\n2. Atribua a Página E a Conta do Instagram\n3. Ao gerar o token, inclua as permissões: pages_show_list, pages_read_engagement, instagram_manage_messages'
                        : '\nGere o token a partir de uma Página do Facebook que esteja vinculada ao Instagram.';

                    throw new Error(
                        (pages.length === 0
                            ? 'Nenhuma página encontrada.'
                            : 'Páginas encontradas, mas nenhuma tem Instagram Business vinculado.')
                        + permissionHint
                    );
                }

                console.log('[Instagram] Conta Instagram encontrada:', igAccount.username || igAccount.id);
                if (selectedPage) {
                    console.log('[Instagram] Página Facebook:', selectedPage.name, 'ID:', selectedPage.id);
                }

                // Salvar informações da página
                igAccount.page_id = selectedPage?.id;
                igAccount.page_name = selectedPage?.name;
                igAccount.page_access_token = selectedPage?.access_token || token;
            }

            setAccountInfo({
                username: igAccount.username,
                name: igAccount.name,
                profile_picture_url: igAccount.profile_picture_url
            });
            setInstagramId(igAccount.id);

            // Criar ou atualizar canal
            let channel;
            if (isEditing && editingChannel) {
                channel = await channelsApi.update(editingChannel.id, {
                    type: 'instagram',
                    name: igAccount.username || igAccount.name || 'Instagram',
                    status: 'active',
                    credentials: {
                        instagram_id: igAccount.id,
                        access_token: token,
                        username: igAccount.username,
                        name: igAccount.name,
                        profile_picture_url: igAccount.profile_picture_url,
                        token_type: isInstagramToken ? 'instagram' : 'facebook',
                        page_id: igAccount.page_id,
                        page_name: igAccount.page_name,
                        page_access_token: igAccount.page_access_token
                    }
                });
                toast.success('Canal Instagram atualizado com sucesso!');
            } else {
                channel = await channelsApi.create({
                    type: 'instagram',
                    name: igAccount.username || igAccount.name || 'Instagram',
                    status: 'active',
                    credentials: {
                        instagram_id: igAccount.id,
                        access_token: token,
                        username: igAccount.username,
                        name: igAccount.name,
                        profile_picture_url: igAccount.profile_picture_url,
                        token_type: isInstagramToken ? 'instagram' : 'facebook',
                        page_id: igAccount.page_id,
                        page_name: igAccount.page_name,
                        page_access_token: igAccount.page_access_token
                    }
                });
                toast.success('Instagram conectado com sucesso!');
            }

            setConnectionStatus('connected');
            setStep('success');

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
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div 
                className="relative w-[95vw] max-w-3xl mx-2 sm:mx-4 rounded-2xl border shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col"
                style={{ 
                    backgroundColor: 'hsl(var(--card))',
                    borderColor: 'hsl(var(--border))'
                }}
            >
                {/* Header */}
                <div 
                    className="px-4 sm:px-6 py-3 sm:py-4 border-b flex items-center justify-between flex-shrink-0"
                    style={{ borderColor: 'hsl(var(--border))' }}
                >
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 flex items-center justify-center">
                            <Instagram className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                                {isEditing ? 'Editar Canal Instagram' : 'Conectar Instagram'}
                            </h2>
                            <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                {isEditing ? 'Atualize o token de acesso' : 'Configure sua conta profissional do Instagram'}
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
                <div className="p-4 sm:p-6 overflow-y-auto flex-1"
                    style={{
                        maxHeight: 'calc(90vh - 80px)'
                    }}
                >
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

                            {/* Webhook Configuration */}
                            <div
                                className="p-4 rounded-lg border border-blue-500/30 bg-blue-500/10"
                            >
                                <div className="flex items-start gap-3">
                                    <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                                    <div className="text-sm text-blue-200 w-full">
                                        <p className="font-medium mb-2">Configuração do Webhook no Meta:</p>

                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between bg-black/20 rounded px-2 py-1">
                                                <span className="text-xs text-blue-300">Callback URL:</span>
                                                <div className="flex items-center gap-1">
                                                    <code className="text-xs font-mono text-blue-100">{webhookUrl}</code>
                                                    <button
                                                        onClick={() => copyToClipboard(webhookUrl, 'URL')}
                                                        className="p-1 hover:bg-blue-500/20 rounded"
                                                    >
                                                        <Copy className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between bg-black/20 rounded px-2 py-1">
                                                <span className="text-xs text-blue-300">Verify Token:</span>
                                                <div className="flex items-center gap-1">
                                                    <code className="text-xs font-mono text-blue-100">{verifyToken}</code>
                                                    <button
                                                        onClick={() => copyToClipboard(verifyToken, 'Token')}
                                                        className="p-1 hover:bg-blue-500/20 rounded"
                                                    >
                                                        <Copy className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        <a
                                            href="https://developers.facebook.com/apps"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 mt-2 text-xs text-blue-300 hover:text-blue-200"
                                        >
                                            <ExternalLink className="w-3 h-3" />
                                            Configurar no Meta for Developers
                                        </a>
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
                                            <li>Acesse o <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" className="text-pink-400 hover:underline">Meta for Developers</a></li>
                                            <li>Selecione seu app e vá em <strong>Messenger &gt; Configurações</strong></li>
                                            <li>Em <strong>Webhooks</strong>, adicione a URL acima</li>
                                            <li>Conecte sua <strong>Página do Facebook</strong> vinculada ao Instagram</li>
                                            <li>Gere um <strong>Page Access Token</strong> (EAA...) ou <strong>System User Token</strong> (EAF... - permanente)</li>
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
                                    placeholder="EAAxxxxxx... ou EAFxxxxxx..."
                                    rows={3}
                                    className="w-full px-4 py-3 rounded-lg border text-sm font-mono resize-none"
                                    style={{
                                        backgroundColor: 'hsl(var(--background))',
                                        borderColor: tokenType === 'instagram' ? 'rgb(234, 179, 8)' : 'hsl(var(--border))',
                                        color: 'hsl(var(--foreground))'
                                    }}
                                />

                                {/* Token Type Indicator */}
                                {tokenType === 'facebook' && accessToken.trim().startsWith('EAF') && (
                                    <div className="flex items-center gap-2 mt-2 text-xs text-green-400">
                                        <CheckCircle className="w-3 h-3" />
                                        System User Token (EAF) - Permanente, ideal para integração
                                    </div>
                                )}
                                {tokenType === 'facebook' && accessToken.trim().startsWith('EAA') && (
                                    <div className="flex items-center gap-2 mt-2 text-xs text-green-400">
                                        <CheckCircle className="w-3 h-3" />
                                        Token de Página Facebook (EAA) - Suporta receber mensagens DM
                                    </div>
                                )}

                                {tokenType === 'instagram' && (
                                    <div className="mt-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                                        <div className="flex items-start gap-2">
                                            <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                                            <div className="text-xs text-yellow-200">
                                                <p className="font-medium text-yellow-400 mb-1">
                                                    Token IGAA detectado - NÃO suporta DMs!
                                                </p>
                                                <p className="text-yellow-300/80">
                                                    Tokens <code className="bg-black/30 px-1 rounded">IGAA...</code> são da Instagram Basic Display API
                                                    e <strong>não recebem mensagens diretas</strong>.
                                                </p>
                                                <p className="mt-1 text-yellow-300/80">
                                                    Para receber DMs, você precisa de um <strong>Page Access Token</strong> (EAA...)
                                                    da sua Página do Facebook vinculada ao Instagram.
                                                </p>
                                                <a
                                                    href="https://developers.facebook.com/docs/instagram-api/overview#instagram-messaging-api"
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 mt-2 text-yellow-400 hover:text-yellow-300"
                                                >
                                                    <ExternalLink className="w-3 h-3" />
                                                    Ver documentação da Instagram Messaging API
                                                </a>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {!tokenType && accessToken.trim() && (
                                    <p className="text-xs mt-1 text-orange-400">
                                        Token não reconhecido. Use EAA... (Page Token), EAF... (System User Token) ou IGAA... (Instagram)
                                    </p>
                                )}
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
                            <div className="flex flex-col sm:flex-row gap-3">
                                <button
                                    onClick={onClose}
                                    className="flex-1 w-full sm:w-auto px-4 py-3 rounded-lg border text-sm font-medium transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                                    style={{ borderColor: 'hsl(var(--border))' }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={validateToken}
                                    disabled={loading || !accessToken.trim()}
                                    className="flex-1 w-full sm:w-auto px-4 py-3 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            {isEditing ? 'Atualizando...' : 'Validando...'}
                                        </>
                                    ) : (
                                        <>
                                            <Check className="w-4 h-4" />
                                            {isEditing ? 'Atualizar Canal' : 'Conectar'}
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
