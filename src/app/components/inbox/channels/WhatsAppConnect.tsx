// INBOX: Modal de Conexão WhatsApp via Evolution API (QR Code)
// Usa a mesma lógica da página de integrações
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { channelsApi } from '../../../services/api/inbox';
import { toast } from 'sonner';
import { QrCode, Smartphone, Check, AlertCircle, RefreshCw, Loader2, Wifi, XCircle, CheckCircle } from 'lucide-react';

// API URL
const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000';

interface WhatsAppConnectProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

type ConnectionStatus = 'idle' | 'creating' | 'waiting_qr' | 'connecting' | 'connected' | 'error';

export function WhatsAppConnect({ isOpen, onClose, onSuccess }: WhatsAppConnectProps) {
    const [step, setStep] = useState<'form' | 'qr' | 'success'>('form');
    const [instanceName, setInstanceName] = useState('');
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
    const [profileInfo, setProfileInfo] = useState<{ name?: string; picture?: string } | null>(null);
    const [fullInstanceName, setFullInstanceName] = useState<string>('');
    
    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const connectingStartRef = useRef<number>(0);

    // Auth headers
    const getAuthHeaders = useCallback(() => {
        const token = localStorage.getItem('leadflow_access_token');
        return {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        };
    }, []);

    // Get user ID for instance naming
    const getUserId = useCallback(() => {
        try {
            const userStr = localStorage.getItem('leadflow_user');
            if (userStr) {
                const user = JSON.parse(userStr);
                return user.id;
            }
        } catch (e) {
            console.error('Error getting user ID:', e);
        }
        return null;
    }, []);

    // Generate instance name
    const generateInstanceName = useCallback((customName: string) => {
        const userId = getUserId();
        if (!userId) {
            throw new Error('Usuário não encontrado. Faça login novamente.');
        }
        // Format: leadflow_{userId}_{customName}
        const sanitizedName = customName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        return `leadflow_${userId.replace(/[^a-zA-Z0-9]/g, '_')}_${sanitizedName}`;
    }, [getUserId]);

    // Reset state when modal closes
    useEffect(() => {
        if (!isOpen) {
            setStep('form');
            setInstanceName('');
            setQrCode(null);
            setError(null);
            setLoading(false);
            setConnectionStatus('idle');
            setProfileInfo(null);
            setFullInstanceName('');
            connectingStartRef.current = 0;
            
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
            }
        }
    }, [isOpen]);

    // Check connection status via Evolution API
    const checkStatus = useCallback(async (instName: string) => {
        try {
            const response = await fetch(
                `${API_URL}/api/whatsapp/status/${instName}`,
                {
                    method: 'GET',
                    headers: getAuthHeaders(),
                }
            );

            if (!response.ok) {
                if (response.status === 404) {
                    return { state: 'close', connected: false };
                }
                throw new Error('Falha ao verificar status');
            }

            const data = await response.json();
            console.log('[WhatsApp Channel] Status check:', data);
            return data;
        } catch (err) {
            console.error('[WhatsApp Channel] Status check error:', err);
            return null;
        }
    }, [getAuthHeaders]);

    // Poll for connection status
    useEffect(() => {
        if (step === 'qr' && connectionStatus === 'waiting_qr' && fullInstanceName) {
            console.log('[WhatsApp Channel] Starting status polling for:', fullInstanceName);
            
            pollIntervalRef.current = setInterval(async () => {
                const status = await checkStatus(fullInstanceName);
                
                if (status) {
                    // Check various connection indicators
                    const isConnected = 
                        status.state === 'open' || 
                        status.connected === true ||
                        status.state === 'connected' ||
                        (status.instance?.state === 'open') ||
                        (status.instance?.status === 'open');
                    
                    const isConnecting = status.state === 'connecting' && !isConnected;

                    console.log('[WhatsApp Channel] Connection state:', { 
                        state: status.state, 
                        connected: status.connected, 
                        isConnected, 
                        isConnecting,
                        instanceState: status.instance?.state
                    });

                    if (isConnected) {
                        console.log('[WhatsApp Channel] ✅ Connected!');
                        setConnectionStatus('connected');
                        setProfileInfo({
                            name: status.profileName,
                            picture: status.profilePictureUrl
                        });
                        
                        // Save to channels database
                        try {
                            await channelsApi.create({
                                type: 'whatsapp',
                                name: instanceName,
                                provider: 'evolution_api',
                                status: 'active',
                                credentials: {
                                    instance_id: fullInstanceName,
                                    instance_name: instanceName,
                                    phone_number: status.profileName || undefined
                                }
                            });
                        } catch (e) {
                            console.warn('[WhatsApp Channel] Error saving to channels:', e);
                        }

                        // Save to user settings (same as Integrações page)
                        try {
                            await fetch(`${API_URL}/api/users/settings`, {
                                method: 'PUT',
                                headers: getAuthHeaders(),
                                body: JSON.stringify({
                                    whatsapp_connected: true,
                                    whatsapp_instance_name: fullInstanceName,
                                    whatsapp_profile_name: status.profileName || null,
                                    whatsapp_connected_at: new Date().toISOString(),
                                }),
                            });
                        } catch (e) {
                            console.warn('[WhatsApp Channel] Error saving settings:', e);
                        }

                        // Dispatch event for other components
                        window.dispatchEvent(new Event('whatsapp-connected'));
                        
                        // Stop polling and go to success
                        if (pollIntervalRef.current) {
                            clearInterval(pollIntervalRef.current);
                            pollIntervalRef.current = null;
                        }
                        
                        setStep('success');
                        toast.success('WhatsApp conectado com sucesso! 🎉');
                    } else if (isConnecting) {
                        setConnectionStatus('connecting');
                        
                        // Track connecting time
                        if (connectingStartRef.current === 0) {
                            connectingStartRef.current = Date.now();
                        } else {
                            const connectingTime = Date.now() - connectingStartRef.current;
                            
                            // If in connecting state for more than 8 seconds, assume connected
                            // Evolution API sometimes stays in "connecting" even after sync
                            if (connectingTime > 8000) {
                                console.log('[WhatsApp Channel] ✅ Assuming connected after 8s in connecting state');
                                setConnectionStatus('connected');
                                setProfileInfo({
                                    name: status.profileName,
                                    picture: status.profilePictureUrl
                                });
                                
                                // Save to channels database
                                try {
                                    await channelsApi.create({
                                        type: 'whatsapp',
                                        name: instanceName,
                                        provider: 'evolution_api',
                                        status: 'active',
                                        credentials: {
                                            instance_id: fullInstanceName,
                                            instance_name: instanceName,
                                            phone_number: status.profileName || undefined
                                        }
                                    });
                                } catch (e) {
                                    console.warn('[WhatsApp Channel] Error saving to channels:', e);
                                }

                                // Save to user settings
                                try {
                                    await fetch(`${API_URL}/api/users/settings`, {
                                        method: 'PUT',
                                        headers: getAuthHeaders(),
                                        body: JSON.stringify({
                                            whatsapp_connected: true,
                                            whatsapp_instance_name: fullInstanceName,
                                            whatsapp_profile_name: status.profileName || null,
                                            whatsapp_connected_at: new Date().toISOString(),
                                        }),
                                    });
                                } catch (e) {
                                    console.warn('[WhatsApp Channel] Error saving settings:', e);
                                }

                                window.dispatchEvent(new Event('whatsapp-connected'));
                                
                                if (pollIntervalRef.current) {
                                    clearInterval(pollIntervalRef.current);
                                    pollIntervalRef.current = null;
                                }
                                
                                setStep('success');
                                toast.success('WhatsApp conectado com sucesso! 🎉');
                                connectingStartRef.current = 0;
                                return;
                            }
                            
                            // Timeout after 60 seconds
                            if (connectingTime > 60000) {
                                console.warn('[WhatsApp Channel] Connection timeout');
                                setError('Tempo esgotado. Tente escanear o QR Code novamente.');
                                setConnectionStatus('error');
                                connectingStartRef.current = 0;
                            }
                        }
                    }
                }
            }, 3000);
        }

        return () => {
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
            }
        };
    }, [step, connectionStatus, fullInstanceName, instanceName, checkStatus, getAuthHeaders]);

    // Auto-close modal when connection succeeds
    useEffect(() => {
        if (step === 'success') {
            // Auto-close after 2 seconds
            const timer = setTimeout(() => {
                onSuccess();
                onClose();
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [step, onSuccess, onClose]);

    // Create instance and get QR code via Evolution API
    const handleCreateInstance = async () => {
        if (!instanceName.trim()) {
            setError('Digite um nome para a conexão');
            return;
        }

        try {
            setLoading(true);
            setError(null);
            setConnectionStatus('creating');

            const generatedName = generateInstanceName(instanceName);
            setFullInstanceName(generatedName);
            console.log('[WhatsApp Channel] Creating instance:', generatedName);

            let instanceExists = false;

            // Step 1: Create instance via Evolution API
            const createResponse = await fetch(
                `${API_URL}/api/whatsapp/instance`,
                {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({ instanceName: generatedName }),
                }
            );

            if (!createResponse.ok) {
                const errorData = await createResponse.json().catch(() => ({}));
                console.error('[WhatsApp Channel] Create instance error:', createResponse.status, errorData);
                
                // Check if instance already exists and is connected
                if (errorData.message?.includes('already exists') && errorData.state === 'open') {
                    toast.success('WhatsApp já está conectado!');
                    setStep('success');
                    setConnectionStatus('connected');
                    onSuccess();
                    return;
                }

                // If instance exists but not connected, we can still get QR
                if (errorData.message?.includes('already exists')) {
                    console.log('[WhatsApp Channel] Instance exists, will fetch QR...');
                    instanceExists = true;
                } else {
                    if (createResponse.status === 403) {
                        throw new Error('Sem permissão. Verifique se está logado corretamente.');
                    }
                    if (createResponse.status >= 500) {
                        throw new Error('Erro no servidor. Verifique se a Evolution API está online e configurada.');
                    }

                    throw new Error(errorData.message || errorData.error || 'Falha ao criar instância WhatsApp');
                }
            }

            if (!instanceExists) {
                const instanceData = await createResponse.json();
                console.log('[WhatsApp Channel] Instance created:', instanceData);

                // Check if already connected
                if (instanceData.state === 'open') {
                    toast.success('WhatsApp já está conectado!');
                    setStep('success');
                    setConnectionStatus('connected');
                    onSuccess();
                    return;
                }
            }

            // Step 2: Get QR Code from Evolution API
            console.log('[WhatsApp Channel] Fetching QR Code for:', generatedName);
            const qrResponse = await fetch(
                `${API_URL}/api/whatsapp/qr/${generatedName}`,
                {
                    method: 'GET',
                    headers: getAuthHeaders(),
                }
            );

            if (!qrResponse.ok) {
                const errorData = await qrResponse.json().catch(() => ({}));
                console.error('[WhatsApp Channel] QR Code error:', qrResponse.status, errorData);
                
                if (qrResponse.status === 403) {
                    throw new Error('Sem permissão para acessar esta instância.');
                }
                if (qrResponse.status === 404) {
                    throw new Error('Instância não encontrada. Tente novamente.');
                }
                if (qrResponse.status >= 500) {
                    throw new Error('Erro no servidor Evolution API. Verifique se está online.');
                }
                throw new Error(errorData.message || errorData.error || 'Falha ao obter QR Code');
            }

            const qrData = await qrResponse.json();
            console.log('[WhatsApp Channel] QR response:', qrData);

            // Try multiple possible QR code fields
            const qrCodeData = qrData.base64 || qrData.code || qrData.qrcode?.base64 || qrData.qrcode?.code || qrData.qr;
            
            if (qrCodeData) {
                console.log('[WhatsApp Channel] QR Code found, length:', qrCodeData.length);
                setQrCode(qrCodeData.startsWith('data:') ? qrCodeData : `data:image/png;base64,${qrCodeData}`);
                setStep('qr');
                setConnectionStatus('waiting_qr');
                connectingStartRef.current = 0;

                toast.info('QR Code gerado!', {
                    description: 'Escaneie o código com seu WhatsApp',
                });
            } else {
                console.error('[WhatsApp Channel] No QR code found in response:', Object.keys(qrData));
                
                // If QR not available and instance exists, try to delete and recreate
                if (instanceExists) {
                    console.log('[WhatsApp Channel] QR not available for existing instance, recreating...');
                    
                    // Delete instance
                    try {
                        await fetch(`${API_URL}/api/whatsapp/disconnect/${generatedName}`, {
                            method: 'POST',
                            headers: getAuthHeaders(),
                        });
                        console.log('[WhatsApp Channel] Instance deleted, waiting before recreating...');
                    } catch (e) {
                        console.warn('[WhatsApp Channel] Error deleting:', e);
                    }
                    
                    await new Promise(r => setTimeout(r, 2000));
                    
                    // Recreate
                    const recreateResponse = await fetch(`${API_URL}/api/whatsapp/instance`, {
                        method: 'POST',
                        headers: getAuthHeaders(),
                        body: JSON.stringify({ instanceName: generatedName }),
                    });
                    
                    if (recreateResponse.ok) {
                        const recreateData = await recreateResponse.json();
                        console.log('[WhatsApp Channel] Instance recreated:', recreateData);
                        
                        // Wait a moment then get QR
                        await new Promise(r => setTimeout(r, 1000));
                        
                        const retryQrResponse = await fetch(`${API_URL}/api/whatsapp/qr/${generatedName}`, {
                            method: 'GET',
                            headers: getAuthHeaders(),
                        });
                        
                        if (retryQrResponse.ok) {
                            const retryQrData = await retryQrResponse.json();
                            const retryQrCode = retryQrData.base64 || retryQrData.code;
                            
                            if (retryQrCode) {
                                console.log('[WhatsApp Channel] QR Code obtained after recreation');
                                setQrCode(retryQrCode.startsWith('data:') ? retryQrCode : `data:image/png;base64,${retryQrCode}`);
                                setStep('qr');
                                setConnectionStatus('waiting_qr');
                                connectingStartRef.current = 0;
                                toast.info('QR Code gerado!', { description: 'Escaneie o código com seu WhatsApp' });
                                return;
                            }
                        }
                    }
                }
                
                throw new Error('QR Code não retornado pela API. Tente usar um nome diferente ou aguarde alguns minutos.');
            }
        } catch (err: any) {
            console.error('[WhatsApp Channel] Error:', err);
            setError(err.message || 'Erro ao criar instância');
            setConnectionStatus('error');
            toast.error('Erro ao conectar', { description: err.message });
        } finally {
            setLoading(false);
        }
    };

    // Refresh QR code via Evolution API
    const handleRefreshQR = async () => {
        if (!fullInstanceName) return;
        
        try {
            setLoading(true);
            setError(null);

            // First try to get QR directly
            const qrResponse = await fetch(
                `${API_URL}/api/whatsapp/qr/${fullInstanceName}`,
                {
                    method: 'GET',
                    headers: getAuthHeaders(),
                }
            );

            if (!qrResponse.ok) {
                const errorData = await qrResponse.json().catch(() => ({}));
                console.error('[WhatsApp Channel] QR refresh error:', errorData);
                
                // If QR not available, try to delete and recreate instance
                if (errorData.error?.includes('not available')) {
                    console.log('[WhatsApp Channel] QR not available, attempting to recreate instance...');
                    
                    // Delete instance first
                    try {
                        await fetch(`${API_URL}/api/whatsapp/disconnect/${fullInstanceName}`, {
                            method: 'POST',
                            headers: getAuthHeaders(),
                        });
                    } catch (e) {
                        console.warn('[WhatsApp Channel] Error deleting instance:', e);
                    }
                    
                    // Wait a bit and recreate
                    await new Promise(r => setTimeout(r, 1000));
                    
                    // Recreate instance
                    const createResponse = await fetch(`${API_URL}/api/whatsapp/instance`, {
                        method: 'POST',
                        headers: getAuthHeaders(),
                        body: JSON.stringify({ instanceName: fullInstanceName }),
                    });
                    
                    if (createResponse.ok) {
                        // Now get new QR
                        const newQrResponse = await fetch(`${API_URL}/api/whatsapp/qr/${fullInstanceName}`, {
                            method: 'GET',
                            headers: getAuthHeaders(),
                        });
                        
                        if (newQrResponse.ok) {
                            const qrData = await newQrResponse.json();
                            const qrCodeData = qrData.base64 || qrData.code;
                            if (qrCodeData) {
                                setQrCode(qrCodeData.startsWith('data:') ? qrCodeData : `data:image/png;base64,${qrCodeData}`);
                                connectingStartRef.current = 0;
                                setConnectionStatus('waiting_qr');
                                toast.success('QR Code atualizado!');
                                return;
                            }
                        }
                    }
                }
                
                throw new Error('Falha ao atualizar QR Code');
            }

            const qrData = await qrResponse.json();
            const qrCodeData = qrData.base64 || qrData.code;
            if (qrCodeData) {
                setQrCode(qrCodeData.startsWith('data:') ? qrCodeData : `data:image/png;base64,${qrCodeData}`);
                connectingStartRef.current = 0;
                setConnectionStatus('waiting_qr');
                setError(null);
                toast.success('QR Code atualizado!');
            } else {
                throw new Error('QR Code não disponível');
            }
        } catch (err: any) {
            toast.error('Erro ao atualizar QR Code');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
            <div
                className="rounded-xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all relative z-[100000]"
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
                        <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
                            <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                                WhatsApp
                            </h3>
                            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                Evolution API
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
                <div className="p-6">
                    {step === 'form' && (
                        <div className="space-y-5 animate-fadeIn">
                            <div 
                                className="p-4 rounded-lg border flex items-start gap-3"
                                style={{ 
                                    backgroundColor: 'hsl(var(--muted))',
                                    borderColor: 'hsl(var(--border))'
                                }}
                            >
                                <Smartphone className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                                <div className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                    <p className="font-medium mb-1" style={{ color: 'hsl(var(--foreground))' }}>Como funciona?</p>
                                    <p>Conecte seu WhatsApp escaneando o QR Code, assim como no WhatsApp Web. Suas mensagens serão sincronizadas automaticamente.</p>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                                    Nome da Conexão
                                </label>
                                <input
                                    type="text"
                                    value={instanceName}
                                    onChange={(e) => setInstanceName(e.target.value)}
                                    placeholder="Ex: Comercial, Suporte, Vendas..."
                                    className="w-full px-4 py-3 rounded-lg border focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all"
                                    style={{ 
                                        backgroundColor: 'hsl(var(--background))',
                                        borderColor: 'hsl(var(--border))',
                                        color: 'hsl(var(--foreground))'
                                    }}
                                />
                                <p className="mt-2 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                    Um nome para identificar este número no sistema.
                                </p>
                            </div>

                            {error && (
                                <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg flex items-start gap-2">
                                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                                    <span>{error}</span>
                                </div>
                            )}

                            <button
                                onClick={handleCreateInstance}
                                disabled={loading || !instanceName.trim()}
                                className={`w-full py-3 px-4 rounded-lg font-medium text-white shadow-lg transition-all transform active:scale-95 flex items-center justify-center gap-2
                                    ${loading || !instanceName.trim()
                                        ? 'bg-gray-400 cursor-not-allowed opacity-70'
                                        : 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700'
                                    }`}
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        <span>
                                            {connectionStatus === 'creating' ? 'Criando instância...' : 'Gerando QR Code...'}
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <QrCode className="w-5 h-5" />
                                        <span>Gerar QR Code</span>
                                    </>
                                )}
                            </button>
                        </div>
                    )}

                    {step === 'qr' && (
                        <div className="flex flex-col items-center animate-fadeIn">
                            <div className="text-center mb-6">
                                <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                    Abra o WhatsApp no celular, vá em
                                </p>
                                <p className="font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                                    Aparelhos Conectados → Conectar Aparelho
                                </p>
                            </div>

                            <div 
                                className="p-4 rounded-xl shadow-inner mb-4 border relative bg-white"
                                style={{ borderColor: 'hsl(var(--border))' }}
                            >
                                {qrCode ? (
                                    <img src={qrCode} alt="QR Code" className="w-64 h-64 object-contain" />
                                ) : (
                                    <div className="w-64 h-64 flex flex-col items-center justify-center">
                                        <Loader2 className="w-12 h-12 animate-spin text-green-500 mb-3" />
                                        <span className="text-sm text-gray-500">Carregando QR Code...</span>
                                    </div>
                                )}
                            </div>

                            {/* Status indicator */}
                            <div className="mb-4 w-full">
                                {connectionStatus === 'waiting_qr' && (
                                    <div className="flex items-center justify-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400">
                                        <Wifi className="w-4 h-4" />
                                        Aguardando leitura do QR Code...
                                    </div>
                                )}
                                {connectionStatus === 'connecting' && (
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="flex items-center justify-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            QR Code escaneado! Conectando...
                                        </div>
                                        <p className="text-xs text-center" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                            Sincronizando... isso pode levar alguns segundos.
                                        </p>
                                    </div>
                                )}
                                {connectionStatus === 'error' && (
                                    <div className="flex items-center justify-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                                        <XCircle className="w-4 h-4" />
                                        {error || 'Erro na conexão'}
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-3 w-full">
                                {connectionStatus === 'connecting' ? (
                                    <button
                                        onClick={async () => {
                                            // Force complete connection
                                            setConnectionStatus('connected');
                                            try {
                                                await channelsApi.create({
                                                    type: 'whatsapp',
                                                    name: instanceName,
                                                    provider: 'evolution_api',
                                                    status: 'active',
                                                    credentials: {
                                                        instance_id: fullInstanceName,
                                                        instance_name: instanceName
                                                    }
                                                });
                                            } catch (e) {
                                                console.warn('[WhatsApp Channel] Error saving:', e);
                                            }
                                            try {
                                                await fetch(`${API_URL}/api/users/settings`, {
                                                    method: 'PUT',
                                                    headers: getAuthHeaders(),
                                                    body: JSON.stringify({
                                                        whatsapp_connected: true,
                                                        whatsapp_instance_name: fullInstanceName,
                                                        whatsapp_connected_at: new Date().toISOString(),
                                                    }),
                                                });
                                            } catch (e) {}
                                            window.dispatchEvent(new Event('whatsapp-connected'));
                                            if (pollIntervalRef.current) {
                                                clearInterval(pollIntervalRef.current);
                                                pollIntervalRef.current = null;
                                            }
                                            setStep('success');
                                            toast.success('WhatsApp conectado com sucesso! 🎉');
                                        }}
                                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 transition-colors"
                                    >
                                        <CheckCircle className="w-4 h-4" />
                                        Concluir Conexão
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleRefreshQR}
                                        disabled={loading}
                                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                                        style={{ 
                                            borderColor: 'hsl(var(--border))',
                                            color: 'hsl(var(--foreground))'
                                        }}
                                    >
                                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                                        Atualizar QR
                                    </button>
                                )}
                                <button
                                    onClick={onClose}
                                    className="flex-1 py-2.5 border rounded-lg text-sm font-medium transition-colors"
                                    style={{ 
                                        borderColor: 'hsl(var(--border))',
                                        color: 'hsl(var(--muted-foreground))'
                                    }}
                                >
                                    Cancelar
                                </button>
                            </div>

                            <p className="text-xs mt-4 text-center" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                O status é verificado automaticamente a cada 3 segundos.
                            </p>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="text-center py-8 animate-fadeIn">
                            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Check className="w-8 h-8" strokeWidth={3} />
                            </div>
                            <h4 className="text-xl font-bold mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                                Conectado!
                            </h4>
                            {profileInfo?.name && (
                                <p className="text-sm mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                                    {profileInfo.name}
                                </p>
                            )}
                            <p className="mb-8 max-w-xs mx-auto" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                Seu WhatsApp foi vinculado. As mensagens recebidas aparecerão no Inbox automaticamente.
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

