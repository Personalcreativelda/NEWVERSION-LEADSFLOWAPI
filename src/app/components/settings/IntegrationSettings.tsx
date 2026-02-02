import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Copy, Check, Webhook, BarChart3, Facebook, RefreshCw, Sheet } from 'lucide-react';
import { toast } from 'sonner';
import { projectId } from '../../utils/supabase/info';
import { canUseFeature } from '../../utils/planUtils';

interface IntegrationSettingsProps {
  user: any;
  onUpgrade?: () => void;
}

export default function IntegrationSettings({ user, onUpgrade }: IntegrationSettingsProps) {
  const [metaPixelId, setMetaPixelId] = useState('');
  const [googleAnalyticsId, setGoogleAnalyticsId] = useState('');
  const [n8nMassWebhook, setN8nMassWebhook] = useState('');
  const [n8nLeadsWebhook, setN8nLeadsWebhook] = useState('');
  const [n8nWhatsAppImportWebhook, setN8nWhatsAppImportWebhook] = useState('');
  const [googleSheetsWebhook, setGoogleSheetsWebhook] = useState('');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);
  const [copiedN8NEndpoint, setCopiedN8NEndpoint] = useState(false);
  const [syncingSheets, setSyncingSheets] = useState(false);
  const [lastSyncDate, setLastSyncDate] = useState<string | null>(null);

  // HTTP Endpoint - available during trial or for Business+ plans
  const canUseHttpEndpoint = canUseFeature(user, 'http_endpoint');

  // N8N Mass WhatsApp - available ONLY for Enterprise plan
  const canUseN8NMass = user?.plan === 'enterprise';

  const httpEndpoint = canUseHttpEndpoint
    ? `https://${window.location.hostname}/api/leads/external/${user?.id}`
    : null;

  // N8N Webhook Endpoint para importação automática de leads - TODOS OS PLANOS
  const n8nLeadsEndpoint = user?.id
    ? `https://${window.location.hostname}/api/webhook/n8n-leads/${user?.id}`
    : null;

  useEffect(() => {
    loadSettings();
  }, [user]);

  const loadSettings = async () => {
    try {
      const token = localStorage.getItem('leadflow_access_token');

      // If no token, skip loading (user might be using mock mode)
      if (!token) {
        console.log('[Integration Settings] No token available - skipping settings load');
        return;
      }

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-4be966ab/webhooks/settings`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.webhookSettings) {
          setMetaPixelId(data.webhookSettings.metaPixelId || '');
          setGoogleAnalyticsId(data.webhookSettings.googleAnalyticsId || '');
          setN8nMassWebhook(data.webhookSettings.n8nMassWebhook || '');
          setN8nLeadsWebhook(data.webhookSettings.n8nLeadsWebhook || '');
          setN8nWhatsAppImportWebhook(data.webhookSettings.n8nWhatsAppImportWebhook || '');
          setGoogleSheetsWebhook(data.webhookSettings.googleSheetsWebhook || '');

          // Save N8N webhooks to localStorage for easy access
          if (data.webhookSettings.n8nMassWebhook) {
            localStorage.setItem('n8n_mass_webhook_url', data.webhookSettings.n8nMassWebhook);
          }
          if (data.webhookSettings.n8nWhatsAppImportWebhook) {
            localStorage.setItem('n8n_import_whatsapp_webhook', data.webhookSettings.n8nWhatsAppImportWebhook);
          }
        }
      } else if (response.status === 401) {
        // Token expirado ou inválido - modo silencioso
        console.log('[Integration Settings] Authentication failed - user may need to re-login');
      } else {
        console.log('[Integration Settings] Failed to load settings:', response.status);
      }
    } catch (error) {
      // Silently fail - settings will use default values
      console.log('[Integration Settings] Error loading settings (using defaults):', error);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('leadflow_access_token');
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-4be966ab/webhooks/settings`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            metaPixelId,
            googleAnalyticsId,
            n8nMassWebhook,
            n8nLeadsWebhook,
            n8nWhatsAppImportWebhook,
            googleSheetsWebhook,
          }),
        }
      );

      if (response.ok) {
        // Save N8N webhooks to localStorage for easy access
        if (n8nMassWebhook) {
          localStorage.setItem('n8n_mass_webhook_url', n8nMassWebhook);
        } else {
          localStorage.removeItem('n8n_mass_webhook_url');
        }

        if (n8nWhatsAppImportWebhook) {
          localStorage.setItem('n8n_import_whatsapp_webhook', n8nWhatsAppImportWebhook);
        } else {
          localStorage.removeItem('n8n_import_whatsapp_webhook');
        }

        setSaved(true);
        toast.success('Configurações salvas com sucesso!');
        setTimeout(() => setSaved(false), 3000);
      } else {
        toast.error('Erro ao salvar configurações');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Erro ao salvar configurações');
    } finally {
      setLoading(false);
    }
  };

  const copyEndpoint = () => {
    if (httpEndpoint) {
      navigator.clipboard.writeText(httpEndpoint);
      setCopiedEndpoint(true);
      toast.success('Endpoint copiado!');
      setTimeout(() => setCopiedEndpoint(false), 2000);
    }
  };

  const copyN8NEndpoint = () => {
    if (n8nLeadsEndpoint) {
      navigator.clipboard.writeText(n8nLeadsEndpoint);
      setCopiedN8NEndpoint(true);
      toast.success('Endpoint N8N copiado!');
      setTimeout(() => setCopiedN8NEndpoint(false), 2000);
    }
  };

  const handleSyncGoogleSheets = async () => {
    if (!googleSheetsWebhook || googleSheetsWebhook.trim() === '') {
      toast.error('Configure a URL do Webhook do Google Sheets primeiro!');
      return;
    }

    setSyncingSheets(true);
    try {
      // Fazer requisição GET para o webhook N8N
      const response = await fetch(googleSheetsWebhook, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error('Erro ao buscar dados do Google Sheets');
      }

      const data = await response.json();

      // Espera que o webhook retorne um objeto com propriedade "leads"
      if (!data.leads || !Array.isArray(data.leads)) {
        throw new Error('Formato de resposta inválido');
      }

      // Agora vamos enviar os leads para o CRM
      const token = localStorage.getItem('leadflow_access_token');
      const importResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-4be966ab/leads/import-from-sheets`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ leads: data.leads }),
        }
      );

      if (!importResponse.ok) {
        throw new Error('Erro ao importar leads para o CRM');
      }

      const importResult = await importResponse.json();

      setLastSyncDate(new Date().toLocaleString('pt-BR'));
      toast.success(`✅ ${importResult.count || data.leads.length} leads sincronizados com sucesso!`);

      // Disparar evento para recarregar leads no dashboard
      window.dispatchEvent(new CustomEvent('leads-updated'));

    } catch (error: any) {
      console.error('Error syncing Google Sheets:', error);
      toast.error('❌ Erro ao sincronizar: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setSyncingSheets(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
        <h3 className="text-gray-900 dark:text-gray-100 mb-6">Integrações Externas</h3>

        <div className="space-y-6">
          {/* HTTP Endpoint para receber leads */}
          {canUseHttpEndpoint && (
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Webhook className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg text-gray-900 dark:text-white mb-2">
                    HTTP Endpoint para Captura de Leads
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Use este endpoint para receber leads de integrações externas como N8N, Facebook Leads Ads, Google Ads, etc.
                  </p>

                  <div className="relative">
                    <Input
                      value={httpEndpoint || ''}
                      readOnly
                      className="pr-24 font-mono text-sm !bg-white dark:!bg-gray-800 !text-gray-900 dark:!text-gray-100 !border-gray-200 dark:!border-gray-700"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={copyEndpoint}
                      className="absolute right-1 top-1"
                    >
                      {copiedEndpoint ? (
                        <>
                          <Check className="w-4 h-4 mr-1" />
                          Copiado
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 mr-1" />
                          Copiar
                        </>
                      )}
                    </Button>
                  </div>

                  <div className="mt-4 bg-card rounded-lg p-4 border border-border">
                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                      <strong>📋 Exemplo de requisição POST:</strong>
                    </p>
                    <pre className="bg-gray-50 dark:bg-gray-900 p-3 rounded text-xs overflow-x-auto">
                      {`{
  "nome": "João Silva",
  "email": "joao@email.com",
  "telefone": "+5511999999999",
  "interesse": "Produto X",
  "origem": "Facebook Ads",
  "status": "Novo"
}`}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!canUseHttpEndpoint && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-amber-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Webhook className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg text-gray-900 dark:text-white mb-2">
                    HTTP Endpoint - Recurso Premium
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-500 dark:text-gray-400">
                    O endpoint HTTP para captura automática de leads está disponível apenas nos planos <strong>Business</strong> e <strong>Enterprise</strong>.
                  </p>
                  <Button className="mt-4" size="sm" onClick={onUpgrade}>
                    Fazer Upgrade
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* N8N Mass WhatsApp */}
          {canUseN8NMass && (
            <div className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 border border-purple-200 dark:border-purple-700 rounded-lg p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Webhook className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                    N8N Webhook - Envio em Massa WhatsApp
                    <span className="px-2 py-0.5 text-xs bg-amber-500 text-white rounded-full">Enterprise</span>
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Configure o webhook do seu workflow N8N para automatizar envios em massa via Evolution API
                  </p>

                  <div className="space-y-3">
                    <Input
                      value={n8nMassWebhook}
                      onChange={(e) => setN8nMassWebhook(e.target.value)}
                      placeholder="https://seu-n8n.com/webhook/whatsapp-massa"
                      className="w-full font-mono text-sm !bg-white dark:!bg-gray-800 !text-gray-900 dark:!text-gray-100 !border-gray-200 dark:!border-gray-700"
                    />

                    <div className="bg-card rounded-lg p-4 border border-border">
                      <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                        <strong>📋 Dados enviados pelo CRM:</strong>
                      </p>
                      <pre className="bg-gray-50 dark:bg-gray-900 p-3 rounded text-xs overflow-x-auto">
                        {`{
  "leads": [
    {
      "id": "lead-123",
      "name": "João Silva",
      "phone": "+5511999999999",
      "email": "joao@email.com"
    }
  ],
  "message": "Sua mensagem aqui",
  "timestamp": "2025-11-14T10:30:00Z",
  "source": "LeadsFlow CRM"
}`}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* N8N Webhook - Importação de Contatos do WhatsApp */}
          <div className="bg-gradient-to-br from-green-50 to-teal-50 dark:from-green-900/20 dark:to-teal-900/20 border border-green-200 dark:border-green-700 rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-green-600 to-teal-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <Webhook className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                  N8N Webhook - Importação de Contatos do WhatsApp
                  <span className="px-2 py-0.5 text-xs bg-green-500 text-white rounded-full">Todos os planos</span>
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Configure o webhook do seu workflow N8N para importar contatos do WhatsApp via Evolution API
                </p>

                <div className="space-y-3">
                  <Input
                    value={n8nWhatsAppImportWebhook}
                    onChange={(e) => setN8nWhatsAppImportWebhook(e.target.value)}
                    placeholder="https://seu-n8n.com/webhook/importar-whatsapp"
                    className="w-full font-mono text-sm !bg-white dark:!bg-gray-800 !text-gray-900 dark:!text-gray-100 !border-gray-200 dark:!border-gray-700"
                  />

                  <div className="bg-card rounded-lg p-4 border border-border">
                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                      <strong>📋 Dados enviados pelo CRM:</strong>
                    </p>
                    <pre className="bg-gray-50 dark:bg-gray-900 p-3 rounded text-xs overflow-x-auto">
                      {`{
  "acao": "importar_contatos_whatsapp",
  "instancia": "nome_da_instancia_evolution",
  "usuarioId": "user-123"
}`}
                    </pre>

                    <p className="text-sm text-gray-700 dark:text-gray-300 mt-3 mb-2">
                      <strong>📤 Resposta esperada do N8N:</strong>
                    </p>
                    <pre className="bg-gray-50 dark:bg-gray-900 p-3 rounded text-xs overflow-x-auto">
                      {`{
  "sucesso": true,
  "contatos": [
    {
      "nome": "João Silva",
      "numero": "5511999999999",
      "avatar": "https://cdn.evolutionapi.com/.../avatar.jpg"
    }
  ]
}`}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* N8N Webhook para Importação Automática de Leads */}
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-700 rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-green-600 to-emerald-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <Webhook className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                  Webhook N8N - Importação Automática de Leads
                  <span className="px-2 py-0.5 text-xs bg-green-500 text-white rounded-full">Todos os planos</span>
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Configure este endpoint no seu workflow N8N. Quando novos leads aparecerem na planilha, o N8N enviará automaticamente para o CRM
                </p>

                <div className="space-y-4">
                  {/* Endpoint do CRM para copiar */}
                  <div>
                    <Label className="text-sm text-gray-700 dark:text-gray-300 mb-2 block">
                      <strong>🔗 Endpoint do CRM (Cole no N8N)</strong>
                    </Label>
                    <div className="relative">
                      <Input
                        value={n8nLeadsEndpoint || ''}
                        readOnly
                        className="pr-24 font-mono text-sm !bg-white dark:!bg-gray-800 !text-gray-900 dark:!text-gray-100 !border-gray-200 dark:!border-gray-700"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={copyN8NEndpoint}
                        className="absolute right-1 top-1"
                      >
                        {copiedN8NEndpoint ? (
                          <>
                            <Check className="w-4 h-4 mr-1" />
                            Copiado
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4 mr-1" />
                            Copiar
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="bg-card rounded-lg p-4 border border-border">
                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                      <strong>🔄 Como funciona:</strong>
                    </p>
                    <ol className="text-xs text-gray-600 dark:text-gray-400 space-y-1.5 ml-4 list-decimal">
                      <li>Copie o endpoint acima</li>
                      <li>No seu workflow N8N, adicione um nó HTTP Request</li>
                      <li>Configure o método como <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">POST</code></li>
                      <li>Cole o endpoint na URL</li>
                      <li>Quando novos leads aparecerem na planilha, o N8N envia automaticamente para o CRM</li>
                      <li>Os leads aparecem instantaneamente no dashboard!</li>
                    </ol>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                      <strong>📋 Formato JSON que o N8N deve enviar:</strong>
                    </p>
                    <pre className="bg-gray-50 dark:bg-gray-900 p-3 rounded text-xs overflow-x-auto">
                      {`{
  "leads": [
    {
      "nome": "Maria Santos",
      "email": "maria@email.com",
      "telefone": "+5511988887777",
      "interesse": "Consultoria",
      "origem": "Google Sheets",
      "status": "Novo"
    }
  ]
}`}
                    </pre>
                  </div>

                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3">
                    <p className="text-xs text-amber-800 dark:text-amber-200">
                      💡 <strong>Dica:</strong> Configure o trigger do N8N para "Watch Changes" no Google Sheets. Assim, cada vez que uma nova linha for adicionada, o N8N detecta e envia automaticamente para o CRM!
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Google Sheets - Atualizar Lista de Leads */}
          <div className="bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-teal-900/20 dark:to-cyan-900/20 border border-teal-200 dark:border-teal-700 rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-teal-600 to-cyan-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <Sheet className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                  Atualizar Lista de Leads - Google Sheets
                  <span className="px-2 py-0.5 text-xs bg-teal-500 text-white rounded-full">Todos os planos</span>
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Configure um webhook N8N que retorna os dados do Google Sheets. Clique em "Atualizar" para sincronizar manualmente os leads
                </p>

                <div className="space-y-4">
                  {/* URL do Webhook */}
                  <div>
                    <Label className="text-sm text-gray-700 dark:text-gray-300 mb-2 block">
                      <strong>🔗 URL do Webhook N8N (GET)</strong>
                    </Label>
                    <Input
                      value={googleSheetsWebhook}
                      onChange={(e) => setGoogleSheetsWebhook(e.target.value)}
                      placeholder="https://seu-n8n.com/webhook/google-sheets"
                      className="w-full font-mono text-sm !bg-white dark:!bg-gray-800 !text-gray-900 dark:!text-gray-100 !border-gray-200 dark:!border-gray-700"
                    />
                  </div>

                  {/* Botão Atualizar */}
                  <div className="flex items-center justify-between bg-card rounded-lg p-4 border border-border">
                    <div>
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        <strong>📊 Sincronizar Leads</strong>
                      </p>
                      {lastSyncDate && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Última sincronização: {lastSyncDate}
                        </p>
                      )}
                    </div>
                    <Button
                      onClick={handleSyncGoogleSheets}
                      disabled={syncingSheets || !googleSheetsWebhook}
                      className="bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700"
                    >
                      {syncingSheets ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Sincronizando...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Atualizar
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Como funciona */}
                  <div className="bg-card rounded-lg p-4 border border-border">
                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                      <strong>🔄 Como configurar o webhook N8N:</strong>
                    </p>
                    <ol className="text-xs text-gray-600 dark:text-gray-400 space-y-1.5 ml-4 list-decimal">
                      <li>Crie um workflow N8N com trigger "Webhook"</li>
                      <li>Adicione um nó "Google Sheets" para ler os dados</li>
                      <li>Formate os dados no formato JSON esperado (veja abaixo)</li>
                      <li>Configure o webhook para aceitar método GET</li>
                      <li>Copie a URL do webhook e cole acima</li>
                      <li>Clique em "Atualizar" sempre que quiser sincronizar</li>
                    </ol>
                  </div>

                  {/* Formato esperado */}
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                      <strong>📋 Formato JSON que o webhook deve retornar:</strong>
                    </p>
                    <pre className="bg-gray-50 dark:bg-gray-900 p-3 rounded text-xs overflow-x-auto">
                      {`{
  "leads": [
    {
      "nome": "Carlos Mendes",
      "email": "carlos@email.com",
      "telefone": "+5511977776666",
      "interesse": "Produto Premium",
      "origem": "Google Sheets",
      "status": "Novo"
    },
    {
      "nome": "Ana Silva",
      "email": "ana@email.com",
      "telefone": "+5511966665555",
      "interesse": "Serviço VIP",
      "origem": "Google Sheets",
      "status": "Novo"
    }
  ]
}`}
                    </pre>
                  </div>

                  {/* Dica */}
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3">
                    <p className="text-xs text-amber-800 dark:text-amber-200">
                      💡 <strong>Dica:</strong> Configure o webhook com método GET para buscar todos os leads da planilha. O CRM irá detectar automaticamente leads duplicados e evitar duplicações!
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Meta Pixel */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Facebook className="w-5 h-5 text-blue-600" />
              <Label className="text-gray-700 dark:text-gray-300">Meta Pixel ID</Label>
            </div>
            <Input
              value={metaPixelId}
              onChange={(e) => setMetaPixelId(e.target.value)}
              placeholder="Ex: 1234567890123456"
              className="w-full"
            />
            <p className="text-xs text-gray-500 dark:text-gray-500 dark:text-gray-400">
              Integre o Meta Pixel para rastrear conversões no Facebook e Instagram
            </p>
          </div>

          {/* Google Analytics */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-orange-600" />
              <Label className="text-gray-700 dark:text-gray-300">Google Analytics ID</Label>
            </div>
            <Input
              value={googleAnalyticsId}
              onChange={(e) => setGoogleAnalyticsId(e.target.value)}
              placeholder="Ex: G-XXXXXXXXXX ou UA-XXXXXXXXX"
              className="w-full"
            />
            <p className="text-xs text-gray-500 dark:text-gray-500 dark:text-gray-400">
              Adicione o Google Analytics para rastrear o comportamento dos visitantes
            </p>
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={loading}
              className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Salvando...
                </>
              ) : saved ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Salvo!
                </>
              ) : (
                'Salvar Integrações'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

