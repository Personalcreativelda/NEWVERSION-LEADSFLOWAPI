import { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { XCircle, Loader2, ExternalLink, Copy, CheckCircle } from 'lucide-react';
import { Button } from './ui/button';
import { getApiBaseUrl } from '../utils/api-client';

const resolveHealthEndpoint = () => {
  const baseUrl = getApiBaseUrl() || (typeof window !== 'undefined' ? window.location.origin : '');
  return baseUrl ? `${baseUrl}/api/health` : '/api/health';
};

export default function ConnectionStatus() {
  const [status, setStatus] = useState<'checking' | 'connected' | 'disconnected' | 'hidden'>('checking');
  const [showDetails, setShowDetails] = useState(false);
  const [healthEndpoint, setHealthEndpoint] = useState(resolveHealthEndpoint());
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');

  useEffect(() => {
    setHealthEndpoint(resolveHealthEndpoint());
    checkConnection();
  }, []);

  const checkConnection = async () => {
    setStatus('checking');
    const endpoint = resolveHealthEndpoint();
    setHealthEndpoint(endpoint);
    
    try {
      const response = await fetch(endpoint, { method: 'GET' });
      if (response.ok) {
        setStatus('hidden');
        return;
      }
      setStatus('disconnected');
    } catch (error) {
      console.error('Connection check error:', error);
      setStatus('disconnected');
    }
  };

  const handleCopyEndpoint = async () => {
    try {
      await navigator.clipboard.writeText(healthEndpoint);
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2000);
    } catch (error) {
      console.error('Failed to copy endpoint:', error);
    }
  };

  if (status === 'hidden') return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)]">
      {status === 'checking' && (
        <Alert className="border-blue-500 bg-blue-50 dark:bg-blue-950">
          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
          <AlertTitle className="text-blue-900 dark:text-blue-100">
            Verificando conexão...
          </AlertTitle>
          <AlertDescription className="text-blue-700 dark:text-blue-300">
            Aguarde enquanto verificamos o backend.
          </AlertDescription>
        </Alert>
      )}

      {status === 'disconnected' && (
        <Alert className="border-red-500 bg-red-50 dark:bg-red-950 shadow-lg">
          <XCircle className="h-5 w-5 text-red-600" />
          <AlertTitle className="text-red-900 dark:text-red-100 font-semibold text-base">
            ⚠️ API do LeadFlow está offline
          </AlertTitle>
          <AlertDescription className="text-red-700 dark:text-red-300 space-y-3">
            <p className="text-sm font-medium">
              O backend Node/Express + Postgres não respondeu ao health check. Suba o container ou execute o deploy.
            </p>
            
            <div className="bg-white dark:bg-gray-900 rounded p-3 border border-red-200 dark:border-red-800">
              <p className="font-semibold mb-2 text-sm">⚡ Reiniciar backend local:</p>
              
              <div className="space-y-2 text-xs">
                <div>
                  <p className="font-medium mb-1">Docker Compose:</p>
                  <code className="block bg-gray-100 dark:bg-gray-800 p-2 rounded">
                    docker compose --profile backend up -d
                  </code>
                </div>
                
                <div>
                  <p className="font-medium mb-1">Script de deploy:</p>
                  <code className="block bg-gray-100 dark:bg-gray-800 p-2 rounded">
                    chmod +x deploy-backend.sh && ./deploy-backend.sh
                  </code>
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowDetails(!showDetails)}
                className="text-xs"
              >
                {showDetails ? 'Ocultar detalhes' : 'Ver detalhes'}
              </Button>
              
              <Button
                size="sm"
                variant="outline"
                onClick={checkConnection}
                className="text-xs"
              >
                Testar novamente
              </Button>
              
              <Button
                size="sm"
                variant="default"
                onClick={() => window.open('/DEPLOY_NOW.md', '_blank')}
                className="text-xs"
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Guia rápido
              </Button>
            </div>

            {showDetails && (
              <div className="mt-3 p-3 bg-white dark:bg-gray-900 rounded border border-red-200 dark:border-red-800 text-xs">
                <p className="font-semibold mb-2">🩺 Endpoint monitorado:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded break-all">{healthEndpoint}</code>
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={handleCopyEndpoint}>
                    {copyStatus === 'copied' ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                <p className="font-semibold mt-3 mb-2">📖 Arquivos de ajuda:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li><code>BACKEND_DEPLOY_QUICK.md</code> - Passo a passo de deploy</li>
                  <li><code>FIX_BACKEND_OFFLINE.md</code> - Guia de diagnóstico</li>
                  <li><code>deploy-backend.sh</code> - Script Linux/macOS</li>
                  <li><code>deploy-backend.ps1</code> - Script Windows</li>
                </ul>
                
                <p className="font-semibold mt-3 mb-1">✅ Check-list:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>API respondendo em {healthEndpoint}</li>
                  <li>Containers <code>backend</code> e <code>db</code> ativos</li>
                  <li>Variável <code>VITE_API_URL</code> configurada no dashboard</li>
                </ol>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

