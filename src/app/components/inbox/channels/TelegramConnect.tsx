// INBOX: Modal de Conexão Telegram via Bot Token
import React, { useState, useEffect } from 'react';
import { channelsApi } from '../../../services/api/inbox';
import { toast } from 'sonner';
import { Send, Check, AlertCircle, Loader2, ExternalLink, Info, CheckCircle } from 'lucide-react';

interface TelegramConnectProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

type ConnectionStatus = 'idle' | 'validating' | 'connected' | 'error';

export function TelegramConnect({ isOpen, onClose, onSuccess }: TelegramConnectProps) {
    const [step, setStep] = useState<'form' | 'success'>('form');
    const [botToken, setBotToken] = useState('');
    const [botName, setBotName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
    const [botInfo, setBotInfo] = useState<{ username?: string; first_name?: string } | null>(null);

    // Reset state when modal closes
    useEffect(() => {
        if (!isOpen) {
            setStep('form');
            setBotToken('');
            setBotName('');
            setError(null);
            setLoading(false);
            setConnectionStatus('idle');
            setBotInfo(null);
        }
    }, [isOpen]);

    // Validate bot token
    const validateToken = async () => {
        if (!botToken.trim()) {
            setError('Informe o token do bot');
            return;
        }

        setLoading(true);
        setError(null);
        setConnectionStatus('validating');

        try {
            // Validate with Telegram API
            const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
            const data = await response.json();

            if (!data.ok) {
                throw new Error('Token inválido. Verifique o token do seu bot.');
            }

            setBotInfo(data.result);
            setBotName(data.result.first_name || data.result.username);

            // Create channel in our system using channelsApi
            await channelsApi.create({
                type: 'telegram',
                name: data.result.first_name || data.result.username || 'Telegram Bot',
                status: 'active',
                credentials: {
                    bot_token: botToken,
                    bot_username: data.result.username,
                    bot_id: data.result.id
                }
            });

            setConnectionStatus('connected');
            setStep('success');
            toast.success('Telegram conectado com sucesso!');
            
            setTimeout(() => {
                onSuccess();
                onClose();
            }, 2000);

        } catch (err: any) {
            console.error('[Telegram] Error:', err);
            setError(err.response?.data?.message || err.message || 'Erro ao conectar com Telegram');
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
                        <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                            <Send className="w-5 h-5 text-blue-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                                Conectar Telegram
                            </h2>
                            <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                Configure seu bot do Telegram
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
                                    <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                                    <div className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                        <p className="font-medium mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                                            Como obter o token do bot:
                                        </p>
                                        <ol className="list-decimal list-inside space-y-1">
                                            <li>Abra o Telegram e pesquise por <strong>@BotFather</strong></li>
                                            <li>Envie o comando <code className="px-1 py-0.5 rounded bg-gray-700">/newbot</code></li>
                                            <li>Siga as instruções para criar seu bot</li>
                                            <li>Copie o token gerado e cole abaixo</li>
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
                                    Token do Bot
                                </label>
                                <input
                                    type="text"
                                    value={botToken}
                                    onChange={(e) => setBotToken(e.target.value)}
                                    placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                                    className="w-full px-4 py-3 rounded-lg border text-sm font-mono"
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

                            {/* Bot Info Preview */}
                            {botInfo && (
                                <div 
                                    className="p-4 rounded-lg border flex items-center gap-3"
                                    style={{ 
                                        backgroundColor: 'hsl(var(--muted))',
                                        borderColor: 'hsl(var(--border))'
                                    }}
                                >
                                    <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white text-xl">
                                        🤖
                                    </div>
                                    <div>
                                        <p className="font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                                            {botInfo.first_name}
                                        </p>
                                        <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                            @{botInfo.username}
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
                                    disabled={loading || !botToken.trim()}
                                    className="flex-1 px-4 py-3 rounded-lg text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
                                href="https://core.telegram.org/bots#how-do-i-create-a-bot"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-2 text-sm text-blue-400 hover:underline"
                            >
                                <ExternalLink className="w-4 h-4" />
                                Documentação oficial do Telegram
                            </a>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="text-center py-8">
                            <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                                <CheckCircle className="w-10 h-10 text-green-500" />
                            </div>
                            <h3 className="text-xl font-semibold mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                                Telegram Conectado!
                            </h3>
                            <p className="text-sm mb-4" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                Seu bot <strong>@{botInfo?.username}</strong> está pronto para receber mensagens.
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
