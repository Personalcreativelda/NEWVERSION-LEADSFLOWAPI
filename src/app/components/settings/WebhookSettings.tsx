import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { toast } from 'sonner';
import { apiRequest } from '../../utils/api';
import { Webhook, Copy, CheckCircle, AlertCircle } from 'lucide-react';
import { WhatsAppConnection } from '../WhatsAppConnection';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

export function WebhookSettings() {
  const [n8nWebhookUrl, setN8nWebhookUrl] = useState('');
  const [metaPixelId, setMetaPixelId] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const data = await apiRequest('/webhooks/settings', 'GET');
      if (data.webhookSettings) {
        setN8nWebhookUrl(data.webhookSettings.n8nWebhookUrl || '');
        setMetaPixelId(data.webhookSettings.metaPixelId || '');
      }
    } catch (error) {
      console.error('Failed to load webhook settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await apiRequest('/webhooks/settings', 'PUT', {
        n8nWebhookUrl,
        metaPixelId,
      });
      toast.success('Configurações de webhook salvas com sucesso!');
    } catch (error) {
      console.error('Failed to save webhook settings:', error);
      toast.error('Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  const copyWebhookUrl = (type: 'leads' | 'messages') => {
    const baseUrl = window.location.origin;
    const url = `${baseUrl}/functions/v1/make-server-4be966ab/webhooks/n8n/${type}`;
    navigator.clipboard.writeText(url);
    toast.success('URL copiada para área de transferência!');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 max-w-full px-2 sm:px-0">
      {/* WhatsApp Connection */}
      <WhatsAppConnection />

      {/* N8N Webhook Configuration */}
      <Card className="max-w-full overflow-hidden">
        <CardHeader className="px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Webhook className="h-5 w-5" />
            <CardTitle>Integração N8N</CardTitle>
          </div>
          <CardDescription>
            Configure webhooks para automatizar importação de leads e tracking de mensagens
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-4 sm:px-6">
          <div className="space-y-2">
            <Label htmlFor="n8n-webhook" className="text-sm sm:text-base">URL do Webhook N8N (Notificações)</Label>
            <Input
              id="n8n-webhook"
              placeholder="https://sua-instancia.n8n.cloud/webhook..."
              value={n8nWebhookUrl}
              onChange={(e) => setN8nWebhookUrl(e.target.value)}
              className="text-sm sm:text-base"
            />
            <p className="text-sm text-muted-foreground">
              Esta URL será chamada quando eventos importantes ocorrerem (leads importados, limites atingidos, etc.)
            </p>
          </div>

          <div className="rounded-lg border bg-muted/50 p-3 sm:p-4 space-y-3">
            <h4 className="font-medium flex items-center gap-2 text-sm sm:text-base">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>URLs dos Webhooks LeadFlow</span>
            </h4>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Use estas URLs em suas automações N8N:
            </p>
            
            <div className="space-y-3">
              <div>
                <Label className="text-xs sm:text-sm">Importação de Leads (POST)</Label>
                <div className="flex gap-2 mt-1.5">
                  <div className="flex-1 min-w-0 relative">
                    <Input
                      value={`${window.location.origin}/functions/v1/make-server-4be966ab/webhooks/n8n/leads`}
                      readOnly
                      className="font-mono text-[10px] sm:text-xs w-full pr-2 overflow-x-auto"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyWebhookUrl('leads')}
                    className="flex-shrink-0"
                  >
                    <Copy className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Envie: {`{ "userId": "seu-id", "leads": [...] }`}
                </p>
              </div>

              <div>
                <Label className="text-xs sm:text-sm">Tracking de Mensagens (POST)</Label>
                <div className="flex gap-2 mt-1.5">
                  <div className="flex-1 min-w-0 relative">
                    <Input
                      value={`${window.location.origin}/functions/v1/make-server-4be966ab/webhooks/n8n/messages`}
                      readOnly
                      className="font-mono text-[10px] sm:text-xs w-full pr-2 overflow-x-auto"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyWebhookUrl('messages')}
                    className="flex-shrink-0"
                  >
                    <Copy className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Envie: {`{ "userId": "seu-id", "messageCount": 1 }`}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Meta Pixel Configuration */}
      <Card className="max-w-full overflow-hidden">
        <CardHeader className="px-4 sm:px-6">
          <CardTitle>Meta Pixel</CardTitle>
          <CardDescription>
            Configure o ID do seu Meta Pixel para rastreamento de eventos
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-4 sm:px-6">
          <div className="space-y-2">
            <Label htmlFor="meta-pixel" className="text-sm sm:text-base">Meta Pixel ID</Label>
            <Input
              id="meta-pixel"
              placeholder="123456789012345"
              value={metaPixelId}
              onChange={(e) => setMetaPixelId(e.target.value)}
              className="text-sm sm:text-base"
            />
            <p className="text-sm text-muted-foreground">
              Encontre seu Pixel ID no Gerenciador de Eventos do Facebook
            </p>
          </div>

          {metaPixelId && (
            <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900 p-3">
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-green-900 dark:text-green-100">
                    Meta Pixel configurado
                  </p>
                  <p className="text-green-700 dark:text-green-300 mt-1">
                    Os seguintes eventos estão sendo rastreados: PageView, Lead, AddToCart, Purchase, CompleteRegistration
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end px-2 sm:px-0">
        <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto text-sm sm:text-base">
          {saving ? 'Salvando...' : 'Salvar Configurações'}
        </Button>
      </div>
    </div>
  );
}

