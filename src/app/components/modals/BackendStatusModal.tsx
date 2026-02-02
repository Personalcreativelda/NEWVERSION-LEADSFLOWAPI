import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { AlertCircle, CheckCircle2, Loader2, X, WifiOff, Wifi } from 'lucide-react';
import { Alert, AlertDescription } from '../ui/alert';
import { supabaseEdgeFunctionUrl } from '../../utils/supabase/info';

interface BackendStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function BackendStatusModal({ isOpen, onClose }: BackendStatusModalProps) {
  const [status, setStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [leadsCount, setLeadsCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasAuth, setHasAuth] = useState(false);

  useEffect(() => {
    if (isOpen) {
      checkBackendStatus();
    }
  }, [isOpen]);

  const checkBackendStatus = async () => {
    setStatus('checking');
    setError(null);
    
    try {
      // Check auth token
      const token = localStorage.getItem('leadflow_access_token');
      setHasAuth(!!token);
      
      if (!token) {
        setError('❌ Não autenticado - Token não encontrado');
        setStatus('offline');
        return;
      }

      // Try to fetch leads
      if (!supabaseEdgeFunctionUrl) {
        setError('❌ VITE_SUPABASE_URL não configurada');
        setStatus('offline');
        return;
      }

      const response = await fetch(
        `${supabaseEdgeFunctionUrl}/leads`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      console.log('Backend status check:', response.status, response.statusText);

      if (response.ok) {
        const data = await response.json();
        setLeadsCount(Array.isArray(data) ? data.length : 0);
        setStatus('online');
        console.log('✅ Backend ONLINE - Leads encontrados:', data.length);
      } else {
        const errorData = await response.json();
        setError(`❌ Backend respondeu com erro: ${errorData.error || response.statusText}`);
        setStatus('offline');
        console.error('❌ Backend offline:', errorData);
      }
    } catch (err: any) {
      setError(`❌ Backend inacessível: ${err.message}`);
      setStatus('offline');
      console.error('❌ Backend check failed:', err);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-white rounded-2xl max-w-lg w-full shadow-lg">
        <DialogHeader className="px-5 py-4 border-b border-gray-200 flex justify-between items-center">
          <div className="flex items-center gap-3">
            {status === 'online' ? (
              <Wifi className="w-5 h-5 text-green-600" />
            ) : status === 'offline' ? (
              <WifiOff className="w-5 h-5 text-red-600" />
            ) : (
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
            )}
            <DialogTitle className="text-lg text-gray-900">
              Status do Backend
            </DialogTitle>
          </div>
          <DialogDescription className="sr-only">
            Verificação de conexão com o backend Supabase e status da autenticação
          </DialogDescription>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </button>
        </DialogHeader>

        <div className="px-5 py-4 space-y-4">
          {/* Status Card */}
          <div className={`p-4 rounded-xl border-2 ${
            status === 'online' 
              ? 'bg-green-50 border-green-200'
              : status === 'offline'
              ? 'bg-red-50 border-red-200'
              : 'bg-blue-50 border-blue-200'
          }`}>
            <div className="flex items-center gap-3">
              {status === 'checking' ? (
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
              ) : status === 'online' ? (
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              ) : (
                <AlertCircle className="w-8 h-8 text-red-600" />
              )}
              <div>
                <h3 className="font-semibold text-gray-900">
                  {status === 'checking' && 'Verificando conexão...'}
                  {status === 'online' && '✅ Backend Online'}
                  {status === 'offline' && '❌ Backend Offline'}
                </h3>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {status === 'checking' && 'Aguarde...'}
                  {status === 'online' && `${leadsCount} leads encontrados no banco de dados`}
                  {status === 'offline' && 'Não foi possível conectar ao servidor'}
                </p>
              </div>
            </div>
          </div>

          {/* Auth Status */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700 dark:text-gray-300">Token de autenticação:</span>
              <span className={`text-sm font-medium ${hasAuth ? 'text-green-600' : 'text-red-600'}`}>
                {hasAuth ? '✅ Presente' : '❌ Ausente'}
              </span>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                {error}
              </AlertDescription>
            </Alert>
          )}

          {/* Info Box */}
          <div className={`p-4 border rounded-lg ${
            status === 'online' 
              ? 'bg-blue-50 border-blue-200' 
              : 'bg-orange-50 border-orange-200'
          }`}>
            <p className={`text-xs ${status === 'online' ? 'text-blue-900' : 'text-orange-900'}`}>
              <strong>💡 O que isso significa:</strong><br/>
              {status === 'online' && '• Seu backend Supabase está funcionando corretamente'}
              {status === 'online' && <><br/>• Todos os dados estão sendo salvos no banco de dados real</>}
              {status === 'offline' && '• O backend Supabase não está respondendo'}
              {status === 'offline' && <><br/>• Os dados estão sendo simulados (modo mock)</>}
              {status === 'offline' && <><br/>• ⚠️ Importações e exclusões NÃO estão funcionando</>}
              {status === 'offline' && <><br/><br/><strong>🚀 Como resolver:</strong></>}
              {status === 'offline' && <><br/>1. Abra o terminal na pasta do projeto</>}
              {status === 'offline' && <><br/>2. Execute: <code className="bg-orange-100 px-1 rounded">chmod +x deploy-backend.sh && ./deploy-backend.sh</code></>}
              {status === 'offline' && <><br/>3. Aguarde o deploy completar</>}
              {status === 'offline' && <><br/>4. Clique em "Verificar Novamente"</>}
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              onClick={checkBackendStatus}
              variant="outline"
              className="flex-1"
              disabled={status === 'checking'}
            >
              {status === 'checking' ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verificando...
                </>
              ) : (
                'Verificar Novamente'
              )}
            </Button>
            <Button
              onClick={onClose}
              className="flex-1"
            >
              Fechar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}



