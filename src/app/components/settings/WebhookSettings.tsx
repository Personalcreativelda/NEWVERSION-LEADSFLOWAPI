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
    <div className="space-y-6">
      {/* WhatsApp Connection */}
      <WhatsAppConnection />

      {/* N8N Webhook Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Webhook className="h-5 w-5" />
            <CardTitle>Integração N8N</CardTitle>
          </div>
          <CardDescription>
            Configure webhooks para automatizar importação de leads e tracking de mensagens
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="n8n-webhook">URL do Webhook N8N (Notificações)</Label>
            <Input
              id="n8n-webhook"
              placeholder="https://sua-instancia.n8n.cloud/webhook/..."
              value={n8nWebhookUrl}
              onChange={(e) => setN8nWebhookUrl(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              Esta URL será chamada quando eventos importantes ocorrerem (leads importados, limites atingidos, etc.)
            </p>
          </div>

          <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
            <h4 className="font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              URLs dos Webhooks LeadFlow
            </h4>
            <p className="text-sm text-muted-foreground">
              Use estas URLs em suas automações N8N:
            </p>
            
            <div className="space-y-2">
              <div>
                <Label className="text-xs">Importação de Leads (POST)</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={`${window.location.origin}/functions/v1/make-server-4be966ab/webhooks/n8n/leads`}
                    readOnly
                    className="font-mono text-xs"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyWebhookUrl('leads')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Envie: {`{ "userId": "seu-id", "leads": [...] }`}
                </p>
              </div>

              <div>
                <Label className="text-xs">Tracking de Mensagens (POST)</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={`${window.location.origin}/functions/v1/make-server-4be966ab/webhooks/n8n/messages`}
                    readOnly
                    className="font-mono text-xs"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyWebhookUrl('messages')}
                  >
                    <Copy className="h-4 w-4" />
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
      <Card>
        <CardHeader>
          <CardTitle>Meta Pixel</CardTitle>
          <CardDescription>
            Configure o ID do seu Meta Pixel para rastreamento de eventos
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="meta-pixel">Meta Pixel ID</Label>
            <Input
              id="meta-pixel"
              placeholder="123456789012345"
              value={metaPixelId}
              onChange={(e) => setMetaPixelId(e.target.value)}
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

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar Configurações'}
        </Button>
      </div>
    </div>
  );
}

