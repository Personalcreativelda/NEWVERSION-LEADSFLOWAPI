import { useState, useEffect } from 'react';
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Alert, AlertDescription } from './ui/alert';
import { QrCode, CheckCircle, Loader2, XCircle, RefreshCw, Smartphone } from 'lucide-react';

interface WhatsAppStatus {
  status: 'disconnected' | 'pending' | 'connecting' | 'connected';
  connected: boolean;
  instanceName?: string;
  profileName?: string;
  profilePictureUrl?: string;
}

export function WhatsAppConnection() {
  const [status, setStatus] = useState<WhatsAppStatus>({
    status: 'disconnected',
    connected: false,
  });
  const [loading, setLoading] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    checkStatus();
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    
    // Start polling when QR modal is open OR when status is pending/connecting
    if (showQrModal || status.status === 'pending' || status.status === 'connecting') {
      console.log('[WhatsApp Polling] Starting aggressive polling - Modal open:', showQrModal, 'Status:', status.status);
      
      // Poll every 2 seconds for faster detection
      interval = setInterval(() => {
        console.log('[WhatsApp Polling] Polling status check...');
        checkStatus();
      }, 2000);
    }

    return () => {
      if (interval) {
        console.log('[WhatsApp Polling] Stopping polling');
        clearInterval(interval);
      }
    };
  }, [showQrModal, status.status]);

  const getApiUrl = () => {
    return import.meta.env.VITE_API_URL || 'http://localhost:4000';
  };

  const getAuthHeaders = () => {
    const token = localStorage.getItem('leadflow_access_token');
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  };

  const getUserInstanceName = (): string => {
    try {
      const userStr = localStorage.getItem('leadflow_user');
      if (userStr) {
        const user = JSON.parse(userStr);
        // CRITICAL: Use user ID to ensure each user has their own instance
        const userId = user.id;
        if (!userId) {
          console.error('[WhatsApp] User ID not found in localStorage!');
          throw new Error('User ID not found');
        }
        const instanceName = `leadflow_${userId.replace(/[^a-zA-Z0-9]/g, '_')}`;
        console.log('[WhatsApp] Instance name for user:', instanceName);
        return instanceName;
      }
    } catch (e) {
      console.error('[WhatsApp] Error getting user for instance name:', e);
    }
    console.error('[WhatsApp] Failed to get instance name, using default (THIS IS BAD!)');
    return 'leadflow_default';
  };

  const checkStatus = async () => {
    try {
      const token = localStorage.getItem('leadflow_access_token');
      if (!token) {
        console.log('WhatsApp: No token available, skipping status check');
        return;
      }

      const instanceName = getUserInstanceName();
      console.log('[WhatsApp Status Check] Checking status for instance:', instanceName);

      // STEP 1: First, check saved state from database (user-specific)
      let savedConnected = false;
      try {
        const settingsResponse = await fetch(
          `${getApiUrl()}/api/users/settings`,
          {
            method: 'GET',
            headers: getAuthHeaders(),
          }
        );

        if (settingsResponse.ok) {
          const settingsData = await settingsResponse.json();
          const settings = settingsData?.settings || {};

          // Parse JSON strings if needed
          Object.keys(settings).forEach(key => {
            if (typeof settings[key] === 'string' && (settings[key].startsWith('{') || settings[key].startsWith('['))) {
              try {
                settings[key] = JSON.parse(settings[key]);
              } catch (e) {
                // Not JSON, keep as string
              }
            }
          });

          savedConnected = settings.whatsapp_connected === true || settings.whatsapp_connected === 'true';
          console.log('[WhatsApp Status Check] Saved state from database:', savedConnected ? 'CONNECTED' : 'DISCONNECTED');
        }
      } catch (dbError) {
        console.warn('[WhatsApp Status Check] Could not fetch saved state:', dbError);
      }

      // STEP 2: Now check Evolution API for real-time status
      const response = await fetch(
        `${getApiUrl()}/api/whatsapp/status/${instanceName}`,
        {
          method: 'GET',
          headers: getAuthHeaders(),
        }
      );

      if (!response.ok) {
        console.error('[WhatsApp Status Check] Failed - Response:', response.status);

        // Instance doesn't exist - set as disconnected
        if (response.status === 404 || response.status === 400) {
          console.log('[WhatsApp Status Check] Instance does not exist - setting as disconnected');
          setStatus({
            status: 'disconnected',
            connected: false,
          });
        }

        return;
      }

      const data = await response.json();
      console.log('[WhatsApp Status Check] Response:', data);

      // Backend normalizes response: { state: 'open'/'close'/'connecting', connected: boolean }
      const isConnected = data.state === 'open' || data.connected === true;
      const isConnecting = data.state === 'connecting';
      const isDisconnected = data.state === 'close' || data.state === 'disconnected' || (!isConnected && !isConnecting);

      const wasNotConnected = !status.connected;
      const wasConnecting = status.status === 'connecting';

      // CRITICAL: If stuck in "connecting" for too long, treat as disconnected
      // Evolution API sometimes gets stuck in "connecting" state
      if (isConnecting && wasConnecting) {
        const now = Date.now();
        const connectingStartTime = parseInt(localStorage.getItem('whatsapp_connecting_start') || '0');

        if (connectingStartTime > 0 && (now - connectingStartTime) > 30000) {
          // Stuck in connecting for more than 30 seconds
          console.warn('[WhatsApp Status Check] ⚠️ Stuck in connecting state for >30s, resetting...');
          localStorage.removeItem('whatsapp_connecting_start');

          setStatus({
            status: 'disconnected',
            connected: false,
          });

          setShowQrModal(false);
          setQrCode(null);

          toast.error('Tempo esgotado ao conectar WhatsApp. Tente novamente.', {
            description: 'Escaneie o QR Code mais rapidamente.',
          });

          return;
        }
      } else if (isConnecting && !wasConnecting) {
        // Just entered connecting state, save timestamp
        localStorage.setItem('whatsapp_connecting_start', Date.now().toString());
      } else if (isConnected || isDisconnected) {
        // Clear connecting timestamp
        localStorage.removeItem('whatsapp_connecting_start');
      }

      setStatus({
        status: isConnected ? 'connected' : isConnecting ? 'connecting' : 'disconnected',
        connected: isConnected,
        instanceName: instanceName,
        profileName: data.profileName,
        profilePictureUrl: data.profilePictureUrl,
      });

      // Note: Instance name is generated dynamically from user ID
      // No need to save to localStorage as it would be shared between users

      // Show feedback when connecting
      if (isConnecting && !isConnected && showQrModal) {
        toast.info('Conectando WhatsApp...', {
          description: 'QR Code escaneado! Aguarde a confirmação.',
          duration: 2000,
        });
      }

      // If just connected, close modal and show success
      if (isConnected && wasNotConnected) {
        console.log('[WhatsApp Status Check] ✅ WhatsApp CONNECTED!');

        if (showQrModal) {
          setShowQrModal(false);
        }

        setQrCode(null);
        setError(null);

        // Save connection state to database
        try {
          await fetch(`${getApiUrl()}/api/users/settings`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({
              whatsapp_connected: true,
              whatsapp_instance_name: instanceName,
              whatsapp_profile_name: data.profileName || null,
              whatsapp_connected_at: new Date().toISOString(),
            }),
          });
          console.log('[WhatsApp Status Check] Connection state saved to database');
        } catch (saveError) {
          console.error('[WhatsApp Status Check] Failed to save state:', saveError);
        }

        window.dispatchEvent(new Event('whatsapp-connected'));

        toast.success('WhatsApp conectado com sucesso! 🎉', {
          description: 'Agora você pode enviar mensagens para seus leads.',
          duration: 5000,
        });
      }
    } catch (err) {
      console.error('[WhatsApp Status Check] Error:', err);
    }
  };

  const connectWhatsApp = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('[WhatsApp Connect] Initiating connection...');

      const instanceName = getUserInstanceName();

      // First, check current status
      await checkStatus();

      // If already connected, just show message
      if (status.connected) {
        toast.success('WhatsApp já está conectado!');
        setLoading(false);
        return;
      }

      // Try to create/get instance
      const createResponse = await fetch(
        `${getApiUrl()}/api/whatsapp/instance`,
        {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ instanceName }),
        }
      );

      if (!createResponse.ok) {
        const errorData = await createResponse.json().catch(() => ({}));

        // If it's a network error or server error, show more helpful message
        if (createResponse.status >= 500) {
          throw new Error('Erro no servidor. Verifique se a Evolution API está configurada corretamente.');
        }

        throw new Error(errorData.message || errorData.error || 'Falha ao criar instância WhatsApp');
      }

      const instanceData = await createResponse.json();
      console.log('[WhatsApp Connect] Instance response:', instanceData);

      // If instance already exists and is connected, update status
      if (instanceData.message?.includes('already exists') && instanceData.state === 'open') {
        console.log('[WhatsApp Connect] Instance already connected');
        await checkStatus();
        toast.success('WhatsApp já está conectado!');
        setLoading(false);
        return;
      }

      // Get QR code
      const qrResponse = await fetch(
        `${getApiUrl()}/api/whatsapp/qr/${instanceName}`,
        {
          method: 'GET',
          headers: getAuthHeaders(),
        }
      );

      if (!qrResponse.ok) {
        const errorData = await qrResponse.json().catch(() => ({}));
        throw new Error(errorData.message || 'Falha ao obter QR Code');
      }

      const data = await qrResponse.json();
      console.log('[WhatsApp Connect] QR Code response received');

      // Evolution API returns { code, base64, count }
      if (data.base64 || data.code) {
        const qrCodeData = data.base64 || data.code;
        setQrCode(qrCodeData.startsWith('data:') ? qrCodeData : `data:image/png;base64,${qrCodeData}`);
        setShowQrModal(true);
        setStatus({ status: 'pending', connected: false, instanceName });

        // Start polling for connection
        setTimeout(() => {
          checkStatus();
        }, 2000);

        toast.info('QR Code gerado!', {
          description: 'Escaneie o código com seu WhatsApp',
        });
      } else {
        throw new Error('QR Code não retornado pela API');
      }
    } catch (err: any) {
      console.error('Connect error:', err);
      setError(err.message || 'Erro ao conectar WhatsApp');
      toast.error('Erro ao conectar WhatsApp', {
        description: err.message || 'Tente novamente em alguns instantes.',
      });
    } finally {
      setLoading(false);
    }
  };

  const disconnectWhatsApp = async () => {
    if (!confirm('Tem certeza que deseja desconectar o WhatsApp?')) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const instanceName = getUserInstanceName();

      const response = await fetch(
        `${getApiUrl()}/api/whatsapp/disconnect/${instanceName}`,
        {
          method: 'POST',
          headers: getAuthHeaders(),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Falha ao desconectar WhatsApp');
      }

      setStatus({
        status: 'disconnected',
        connected: false,
      });

      // Save disconnection state to database
      try {
        await fetch(`${getApiUrl()}/api/users/settings`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            whatsapp_connected: false,
            whatsapp_disconnected_at: new Date().toISOString(),
          }),
        });
        console.log('[WhatsApp Disconnect] Disconnection state saved to database');
      } catch (saveError) {
        console.error('[WhatsApp Disconnect] Failed to save state:', saveError);
      }

      // Clean up connecting timestamp
      localStorage.removeItem('whatsapp_connecting_start');

      toast.success('WhatsApp desconectado com sucesso');
    } catch (err: any) {
      console.error('Disconnect error:', err);
      setError(err.message || 'Erro ao desconectar WhatsApp');
      toast.error('Erro ao desconectar WhatsApp', {
        description: err.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-6 max-w-full overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
          <div className="flex items-start space-x-3 sm:space-x-4 flex-1 min-w-0">
            <div className="p-2 sm:p-3 bg-green-100 dark:bg-green-900/20 rounded-lg flex-shrink-0">
              <Smartphone className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 dark:text-green-500" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold mb-1 text-sm sm:text-base">WhatsApp</h3>
              <div className="flex items-center gap-2 mb-2">
                {status.connected ? (
                  <>
                    <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-600 flex-shrink-0" />
                    <span className="text-green-600 text-xs sm:text-sm">Conectado</span>
                  </>
                ) : status.status === 'connecting' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 animate-spin flex-shrink-0" />
                    <span className="text-blue-600 text-xs sm:text-sm">Conectando...</span>
                  </>
                ) : status.status === 'pending' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-yellow-600 animate-spin flex-shrink-0" />
                    <span className="text-yellow-600 text-xs sm:text-sm">Aguardando QR Code...</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                    <span className="text-gray-600 dark:text-gray-400 text-xs sm:text-sm">Desconectado</span>
                  </>
                )}
              </div>
              {status.profileName && (
                <p className="text-xs sm:text-sm text-muted-foreground truncate">
                  Conta: {status.profileName}
                </p>
              )}
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                {status.connected
                  ? 'Seu WhatsApp está conectado e pronto para enviar mensagens.'
                  : status.status === 'connecting'
                  ? 'QR Code escaneado! Finalizando conexão...'
                  : status.status === 'pending'
                  ? 'Escaneie o QR Code para conectar.'
                  : 'Conecte seu WhatsApp para enviar mensagens aos seus leads.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto flex-shrink-0">
            {status.connected ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={disconnectWhatsApp}
                disabled={loading}
                className="flex-1 sm:flex-initial text-xs sm:text-sm"
              >
                {loading ? (
                  <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                ) : (
                  'Desconectar'
                )}
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={connectWhatsApp}
                disabled={loading || status.status === 'connecting'}
                className="flex-1 sm:flex-initial text-xs sm:text-sm"
              >
                {loading ? (
                  <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                ) : (
                  <>
                    <QrCode className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2 flex-shrink-0" />
                    <span className="hidden sm:inline">Conectar WhatsApp</span>
                    <span className="sm:hidden">Conectar</span>
                  </>
                )}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={checkStatus}
              disabled={polling}
              className="flex-shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${polling ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </Card>

      {/* QR Code Modal */}
      <Dialog open={showQrModal} onOpenChange={setShowQrModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5" />
              Conectar WhatsApp
            </DialogTitle>
            <DialogDescription>
              Escaneie o QR Code abaixo com seu WhatsApp para conectar sua conta
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <ol className="text-sm text-muted-foreground space-y-1 ml-4 list-decimal">
              <li>Abra o WhatsApp no seu celular</li>
              <li>Toque em Mais opções (⋮) &gt; Aparelhos conectados</li>
              <li>Toque em "Conectar um aparelho"</li>
              <li>Aponte seu celular para esta tela para escanear o código</li>
            </ol>

            {qrCode ? (
              <div className="flex flex-col items-center justify-center p-4 bg-white rounded-lg">
                <img
                  src={qrCode}
                  alt="QR Code"
                  className="w-64 h-64"
                />
                {status.status === 'connecting' ? (
                  <div className="flex items-center gap-2 text-sm text-blue-600 mt-4">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Conectando... Aguarde!</span>
                  </div>
                ) : (
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-4">
                    Aguardando escaneamento...
                  </p>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-16 bg-gray-50 rounded-lg">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400 mb-2" />
                <p className="text-sm text-gray-700 dark:text-gray-300">Gerando QR Code...</p>
              </div>
            )}

            <Alert>
              <AlertDescription className="text-xs">
                O QR Code expira após alguns minutos. Se não conseguir conectar,
                feche esta janela e tente novamente.
              </AlertDescription>
            </Alert>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

