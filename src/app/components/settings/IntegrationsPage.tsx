import { useState, useEffect } from 'react';
import { Webhook, Mail, ChevronRight, Sheet, BarChart3, Eye, Loader2, CheckCircle2, MessageSquare, Save, Trash2, Plug } from 'lucide-react';
import { PageHeader } from '../base/PageHeader';
import { SubpageBack } from '../base/SubpageBack';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from "sonner";
import { userApi } from '../../utils/api';
import { brandIcon } from '../base/BrandIcon';

interface IntegrationsPageProps {
  user: any;
}

type IntegrationType = 'webhook' | 'smtp' | 'n8n' | 'meta-pixel' | 'google-analytics' | null;

export default function IntegrationsPage({ user }: IntegrationsPageProps) {
  const [expandedSection, setExpandedSection] = useState<IntegrationType>(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpFromEmail, setSmtpFromEmail] = useState('');
  const [smtpFromName, setSmtpFromName] = useState('');
  const [smtpSaveState, setSmtpSaveState] = useState<'idle' | 'loading' | 'saved'>('idle');
  const [n8nWebhookUrl, setN8nWebhookUrl] = useState('');
  const [n8nWhatsAppImportUrl, setN8nWhatsAppImportUrl] = useState('');
  const [isN8nConfigured, setIsN8nConfigured] = useState(false);
  const [isN8nWhatsAppImportConfigured, setIsN8nWhatsAppImportConfigured] = useState(false);
  const [metaPixelId, setMetaPixelId] = useState('');
  const [isMetaPixelConfigured, setIsMetaPixelConfigured] = useState(false);
  const [googleAnalyticsId, setGoogleAnalyticsId] = useState('');
  const [isGoogleAnalyticsConfigured, setIsGoogleAnalyticsConfigured] = useState(false);
  const [dashboardPixelEnv, setDashboardPixelEnv] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let isMounted = true;

    const applyStringSetting = (
      value: string | null | undefined,
      setter: (next: string) => void,
      flagSetter?: (next: boolean) => void
    ) => {
      if (!isMounted || value === undefined || value === null) {
        return;
      }

      const trimmed = value.trim();
      setter(trimmed);

      if (flagSetter) {
        flagSetter(trimmed.length > 0);
      }
    };

    const hydrateFromLocalStorage = () => {
      applyStringSetting(localStorage.getItem('n8n_webhook_url'), setN8nWebhookUrl, setIsN8nConfigured);
      applyStringSetting(localStorage.getItem('n8n_whatsapp_import_url'), setN8nWhatsAppImportUrl, setIsN8nWhatsAppImportConfigured);
      applyStringSetting(localStorage.getItem('meta_pixel_id'), setMetaPixelId, setIsMetaPixelConfigured);
      applyStringSetting(localStorage.getItem('google_analytics_id'), setGoogleAnalyticsId, setIsGoogleAnalyticsConfigured);
      applyStringSetting(localStorage.getItem('smtp_host'), setSmtpHost);
      applyStringSetting(localStorage.getItem('smtp_port'), setSmtpPort);
      applyStringSetting(localStorage.getItem('smtp_user'), setSmtpUser);
      applyStringSetting(localStorage.getItem('smtp_password'), setSmtpPassword);
      applyStringSetting(localStorage.getItem('smtp_from_email'), setSmtpFromEmail);
      applyStringSetting(localStorage.getItem('smtp_from_name'), setSmtpFromName);
    };

    const hydrateFromBackend = async () => {
      try {
        const settings = await userApi.getSettings();
        if (!isMounted || !settings) {
          return;
        }

        applyStringSetting(settings.n8n_webhook_url, setN8nWebhookUrl, setIsN8nConfigured);
        applyStringSetting(settings.n8n_whatsapp_import_url, setN8nWhatsAppImportUrl, setIsN8nWhatsAppImportConfigured);
        applyStringSetting(settings.meta_pixel_id, setMetaPixelId, setIsMetaPixelConfigured);
        applyStringSetting(settings.google_analytics_id, setGoogleAnalyticsId, setIsGoogleAnalyticsConfigured);
        applyStringSetting(settings.smtp_host, setSmtpHost);
        applyStringSetting(settings.smtp_port, setSmtpPort);
        applyStringSetting(settings.smtp_user, setSmtpUser);
        applyStringSetting(settings.smtp_password, setSmtpPassword);
        applyStringSetting(settings.smtp_from_email, setSmtpFromEmail);
        applyStringSetting(settings.smtp_from_name, setSmtpFromName);

        const envOverrides = (settings?.env_overrides || settings?.env || null) as Record<string, string> | null;
        if (envOverrides) {
          applyStringSetting(envOverrides.dashboard_meta_pixel_id, setDashboardPixelEnv);
        }

        if (!envOverrides?.dashboard_meta_pixel_id) {
          applyStringSetting((settings as any)?.dashboard_meta_pixel_id, setDashboardPixelEnv);
        }
      } catch (error) {
        console.error('[IntegrationsPage] Failed to load settings:', error);
      } finally {
        // noop
      }
    };

    hydrateFromLocalStorage();
    hydrateFromBackend();

    return () => {
      isMounted = false;
    };
  }, [user?.id]);
  // Verificar se o usuário tem plano Business ou Enterprise
  const userPlan = user?.plan || user?.subscription_plan || 'free';
  const hasHttpAccess = true; // Habilitado para todos os planos
  const hasTrackingAccess = userPlan === 'business' || userPlan === 'enterprise'; // Meta Pixel e Google Analytics apenas Business+

  // Debug log
  console.log('IntegrationsPage - User Plan:', userPlan);
  console.log('IntegrationsPage - Has HTTP Access:', hasHttpAccess);
  console.log('IntegrationsPage - Has Tracking Access:', hasTrackingAccess);

  const handleToggleSection = (section: IntegrationType) => {
    if (section) window.history.pushState({ subpage: true, integration: section }, '');
    setExpandedSection(section);
  };
  // Fechar a subpágina: seta do cabeçalho / botão voltar do Android (history.back → popstate)
  useEffect(() => {
    const onPop = () => setExpandedSection((window.history.state?.integration as IntegrationType) || null);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const handleSaveWebhook = () => {
    toast.success('Webhook configurado com sucesso!');
  };

  const handleSaveSmtp = async () => {
    // Validações detalhadas
    const errors: string[] = [];

    if (!smtpHost.trim()) {
      errors.push('Host SMTP é obrigatório');
    }

    if (!smtpPort) {
      errors.push('Porta é obrigatória');
    } else {
      const port = parseInt(smtpPort);
      if (isNaN(port) || port < 1 || port > 65535) {
        errors.push('Porta inválida (deve estar entre 1-65535)');
      }
    }

    if (!smtpUser.trim()) {
      errors.push('Usuário/Email é obrigatório');
    }

    if (!smtpPassword.trim()) {
      errors.push('Senha é obrigatória');
    } else if (smtpPassword.length < 6) {
      errors.push('Senha muito curta (mínimo 6 caracteres)');
    }

    // Mostrar erros de validação
    if (errors.length > 0) {
      toast.error(`Erro de validação:\n${errors.join('\n')}`);
      return;
    }

    // Iniciar loading
    setSmtpSaveState('loading');

    try {
      // ✅ SALVAR NO BACKEND (fonte da verdade)
      await userApi.saveSettings({
        smtp_host: smtpHost,
        smtp_port: smtpPort,
        smtp_user: smtpUser,
        smtp_password: smtpPassword,
        smtp_from_email: smtpFromEmail,
        smtp_from_name: smtpFromName
      });

      // Sync com localStorage para backward compatibility
      localStorage.setItem('smtp_host', smtpHost);
      localStorage.setItem('smtp_port', smtpPort);
      localStorage.setItem('smtp_user', smtpUser);
      localStorage.setItem('smtp_password', smtpPassword);
      localStorage.setItem('smtp_from_email', smtpFromEmail);
      localStorage.setItem('smtp_from_name', smtpFromName);

      // Sucesso!
      setSmtpSaveState('saved');
      toast.success('Definições SMTP guardadas com sucesso!', {
        description: `Host: ${smtpHost}\nEmail: ${smtpUser}`,
        duration: 4000,
      });

      // Voltar ao estado normal após 2 segundos
      setTimeout(() => {
        setSmtpSaveState('idle');
      }, 2000);

    } catch (error: any) {
      console.error('Erro ao salvar SMTP:', error);
      setSmtpSaveState('idle');

      // Mensagem de erro mais específica
      const errorMessage = error?.message || 'Erro desconhecido';
      toast.error('Erro ao guardar definições SMTP', {
        description: errorMessage,
        duration: 5000,
      });
    }
  };
  const handleSaveN8nWebhook = async () => {
    if (!n8nWebhookUrl) {
      toast.error('Por favor, insira a URL do webhook N8N');
      return;
    }

    // Validar URL
    try {
      new URL(n8nWebhookUrl);
    } catch (e) {
      toast.error('URL inválida. Certifique-se de incluir http:// ou https://');
      return;
    }

    try {
      // ✅ SALVAR NO BACKEND (fonte da verdade)
      await userApi.saveSettings({ n8n_webhook_url: n8nWebhookUrl });

      // Sync com localStorage para backward compatibility
      localStorage.setItem('n8n_webhook_url', n8nWebhookUrl);
      setIsN8nConfigured(true);
      toast.success('Webhook N8N configurado com sucesso!');

      console.log('[N8N Save] URL salva no backend:', n8nWebhookUrl);
    } catch (error) {
      console.error('[N8N Save] Error:', error);
      toast.error('Erro ao guardar webhook. Tente novamente.');
    }
  };

  const handleClearN8nWebhook = async () => {
    try {
      // ✅ LIMPAR NO BACKEND
      await userApi.saveSettings({ n8n_webhook_url: '' });

      // Sync com localStorage
      localStorage.removeItem('n8n_webhook_url');
      setN8nWebhookUrl('');
      setIsN8nConfigured(false);
      toast.success('Configuração do webhook N8N removida');
      console.log('[N8N] Configuration cleared from backend');
    } catch (error) {
      console.error('[N8N Clear] Error:', error);
      toast.error('Erro ao remover configuração');
    }
  };

  const handleSaveN8nWhatsAppImportUrl = async () => {
    if (!n8nWhatsAppImportUrl) {
      toast.error('Por favor, insira a URL do webhook N8N de importação de contactos');
      return;
    }

    // Validar URL
    try {
      new URL(n8nWhatsAppImportUrl);
    } catch (e) {
      toast.error('URL inválida. Certifique-se de incluir http:// ou https://');
      return;
    }

    try {
      // ✅ SALVAR NO BACKEND
      await userApi.saveSettings({ n8n_whatsapp_import_url: n8nWhatsAppImportUrl });

      // Sync com localStorage
      localStorage.setItem('n8n_whatsapp_import_url', n8nWhatsAppImportUrl);
      setIsN8nWhatsAppImportConfigured(true);
      toast.success('URL de importação de contactos configurada com sucesso!');

      console.log('[N8N WhatsApp Import] URL salva no backend:', n8nWhatsAppImportUrl);
    } catch (error) {
      console.error('[N8N WhatsApp Import] Error:', error);
      toast.error('Erro ao guardar URL. Tente novamente.');
    }
  };

  const handleClearN8nWhatsAppImportUrl = async () => {
    try {
      // ✅ LIMPAR NO BACKEND
      await userApi.saveSettings({ n8n_whatsapp_import_url: '' });

      // Sync com localStorage
      localStorage.removeItem('n8n_whatsapp_import_url');
      setN8nWhatsAppImportUrl('');
      setIsN8nWhatsAppImportConfigured(false);
      toast.success('Configuração de importação de contactos removida');
      console.log('[N8N WhatsApp Import] Configuration cleared from backend');
    } catch (error) {
      console.error('[N8N WhatsApp Import Clear] Error:', error);
      toast.error('Erro ao remover configuração');
    }
  };
  const handleSaveMetaPixel = async () => {
    if (!metaPixelId) {
      toast.error('Por favor, insira o ID do Meta Pixel');
      return;
    }

    try {
      // ✅ SALVAR NO BACKEND
      await userApi.saveSettings({ meta_pixel_id: metaPixelId });

      // Sync com localStorage
      localStorage.setItem('meta_pixel_id', metaPixelId);
      setIsMetaPixelConfigured(true);
      toast.success('Meta Pixel configurado com sucesso!');
    } catch (error) {
      console.error('[Meta Pixel Save] Error:', error);
      toast.error('Erro ao guardar Meta Pixel');
    }
  };

  const handleSaveGoogleAnalytics = async () => {
    if (!googleAnalyticsId) {
      toast.error('Por favor, insira o ID do Google Analytics');
      return;
    }

    try {
      // ✅ SALVAR NO BACKEND
      await userApi.saveSettings({ google_analytics_id: googleAnalyticsId });

      // Sync com localStorage
      localStorage.setItem('google_analytics_id', googleAnalyticsId);
      setIsGoogleAnalyticsConfigured(true);
      toast.success('Google Analytics configurado com sucesso!');
    } catch (error) {
      console.error('[Google Analytics Save] Error:', error);
      toast.error('Erro ao guardar Google Analytics');
    }
  };

  const integrationInputClass =
    "mt-1.5 h-11 text-sm rounded-lg border border-border !bg-card !text-foreground dark:shadow-none shadow-sm focus-visible:border-primary focus-visible:ring-primary/15";
    const infoBlockClass =
    "rounded-lg border border-border bg-muted p-4";
  const currentUrlBannerClass =
    "px-3 py-2 rounded-md border border-border bg-muted text-xs text-muted-foreground break-all font-mono";
  const n8nInputClass =
    "mt-1.5 h-11 text-sm rounded-lg border border-border dark:shadow-none shadow-sm !bg-card !text-foreground placeholder:text-muted-foreground focus-visible:border-cyan-500 focus-visible:ring-cyan-500/15";

  const integrations = [
    {
      id: 'n8n' as IntegrationType,
      name: 'Google Sheets (via n8n)',
      description: 'Envie os leads para uma folha do Google Sheets em tempo real',
      icon: brandIcon('googlesheets'),
      color: 'text-cyan-600 dark:text-cyan-400',
      borderColor: 'border-cyan-200 dark:border-cyan-800',
      configured: isN8nConfigured || isN8nWhatsAppImportConfigured,
    },
    {
      id: 'webhook' as IntegrationType,
      name: 'Webhooks',
      description: 'Receba notificações em tempo real',
      icon: Webhook,
      configured: !!webhookUrl.trim(),
      color: 'text-blue-600 dark:text-blue-400',
      borderColor: 'border-blue-200 dark:border-blue-800',
    },
    {
      id: 'smtp' as IntegrationType,
      name: 'Email (SMTP)',
      description: 'Configure o seu servidor de email',
      configured: !!smtpHost.trim(),
      icon: Mail,
      color: 'text-purple-600 dark:text-purple-400',
      borderColor: 'border-purple-200 dark:border-purple-800',
    },
    {
      id: 'meta-pixel' as IntegrationType,
      name: 'Meta Pixel (Facebook)',
      description: 'Rastreie eventos de conversão de leads no Meta Ads',
      icon: brandIcon('meta'),
      color: 'text-indigo-600 dark:text-indigo-400',
      borderColor: 'border-indigo-200 dark:border-indigo-800',
      configured: isMetaPixelConfigured,
    },
    {
      id: 'google-analytics' as IntegrationType,
      name: 'Google Analytics',
      description: 'Envie eventos de conversão para o Google Analytics',
      icon: brandIcon('googleanalytics'),
      color: 'text-orange-600 dark:text-orange-400',
      borderColor: 'border-orange-200 dark:border-orange-800',
      configured: isGoogleAnalyticsConfigured,
    },
  ];

  return (
    <div>
      <PageHeader title="Integrações" description="Serviços externos ligados à sua conta" icon={Plug} />

      {/* Lista (cada linha abre a sua subpágina) */}
      <div className={expandedSection ? '' : 'overflow-hidden rounded-xl border border-border bg-card divide-y divide-border'}>
        {integrations.map((integration) => {
          const Icon = integration.icon;
          const isExpanded = expandedSection === integration.id;
          if (expandedSection && !isExpanded) return null;

          if (!expandedSection) {
            return (
              <button
                key={integration.id}
                type="button"
                onClick={() => handleToggleSection(integration.id)}
                className="flex w-full min-h-[64px] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 active:bg-muted"
              >
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-muted">
                  <Icon className={`h-7 w-7 ${integration.color}`} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base text-foreground">{integration.name}</span>
                  <span className="block text-sm text-muted-foreground">{integration.configured ? 'Ligado' : 'Não configurado'}</span>
                </span>
                <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              </button>
            );
          }

          return (
            <div key={integration.id}>
              {/* Subpágina: voltar (no telemóvel é a seta do cabeçalho) + nome */}
              <SubpageBack label="Integrações" onClose={() => setExpandedSection(null)} />
              <div className="mb-5 flex items-center gap-3">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-muted">
                  <Icon className={`h-7 w-7 ${integration.color}`} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold text-foreground">{integration.name}</h2>
                </div>
              </div>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="relative rounded-xl border border-border bg-card p-4 sm:p-6">

                  {/* Webhook Content */}
                  {integration.id === 'webhook' && (
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="webhook-url" className="text-sm text-foreground">URL do Webhook</Label>
                        <Input
                          id="webhook-url"
                          type="url"
                          value={webhookUrl}
                          onChange={(e) => setWebhookUrl(e.target.value)}
                          placeholder="https://seu-dominio.com/webhook"
                          className={integrationInputClass}
                        />
                      </div>
                      <div className="flex justify-end">
                        <Button
                          onClick={handleSaveWebhook}
                          className="bg-primary hover:bg-primary/90 text-primary-foreground"
                        >
                          Guardar webhook
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* SMTP Content */}
                  {integration.id === 'smtp' && (
                    <div className="space-y-4">
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="smtp-host" className="text-sm">
                            Host SMTP <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            id="smtp-host"
                            type="text"
                            value={smtpHost}
                            onChange={(e) => setSmtpHost(e.target.value)}
                            placeholder="smtp.gmail.com"
                            className="mt-1.5"
                          />
                        </div>
                        <div>
                          <Label htmlFor="smtp-port" className="text-sm">
                            Porta <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            id="smtp-port"
                            type="text"
                            value={smtpPort}
                            onChange={(e) => setSmtpPort(e.target.value)}
                            placeholder="587"
                            className="mt-1.5"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            587 (TLS) ou 465 (SSL)
                          </p>
                        </div>
                        <div>
                          <Label htmlFor="smtp-user" className="text-sm">
                            Utilizador ou email <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            id="smtp-user"
                            type="email"
                            value={smtpUser}
                            onChange={(e) => setSmtpUser(e.target.value)}
                            placeholder="seu@email.com"
                            className="mt-1.5"
                          />
                        </div>
                        <div>
                          <Label htmlFor="smtp-password" className="text-sm">
                            Palavra-passe <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            id="smtp-password"
                            type="password"
                            value={smtpPassword}
                            onChange={(e) => setSmtpPassword(e.target.value)}
                            placeholder="••••••••"
                            className="mt-1.5"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            No Gmail, use uma palavra-passe de aplicação
                          </p>
                        </div>
                        <div>
                          <Label htmlFor="smtp-from-email" className="text-sm font-medium">
                            Email do remetente <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            id="smtp-from-email"
                            type="email"
                            value={smtpFromEmail}
                            onChange={(e) => setSmtpFromEmail(e.target.value)}
                            placeholder="contacto@seudominio.com"
                            className="mt-1.5"
                          />
                        </div>
                        <div>
                          <Label htmlFor="smtp-from-name" className="text-sm font-medium">
                            Nome do remetente
                          </Label>
                          <Input
                            id="smtp-from-name"
                            type="text"
                            value={smtpFromName}
                            onChange={(e) => setSmtpFromName(e.target.value)}
                            placeholder="Sua Empresa"
                            className="mt-1.5"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div />

                        <Button
                          onClick={handleSaveSmtp}
                          disabled={smtpSaveState !== 'idle'}
                          className={`text-primary-foreground transition-all duration-300 ${smtpSaveState === 'saved'
                            ? 'bg-green-600 hover:bg-green-700'
                            : 'bg-primary hover:opacity-90'
                            }`}
                        >
                          {smtpSaveState === 'loading' && (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              A guardar...
                            </>
                          )}
                          {smtpSaveState === 'saved' && (
                            <>
                              <CheckCircle2 className="w-4 h-4 mr-2" />
                              Guardado!
                            </>
                          )}
                          {smtpSaveState === 'idle' && 'Guardar'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Meta Pixel Content */}
                  {integration.id === 'meta-pixel' && (
                    <div className="space-y-6">

                      <div className="space-y-2">
                        <Label htmlFor="meta-pixel-id" className="text-sm flex items-center gap-2 text-foreground">
                          <BarChart3 className="w-4 h-4 text-muted-foreground" />
                          Meta Pixel ID
                        </Label>
                        <Input
                          id="meta-pixel-id"
                          type="text"
                          value={metaPixelId}
                          onChange={(e) => setMetaPixelId(e.target.value)}
                          placeholder="123456789012345"
                          className={`${integrationInputClass} font-mono`}
                        />
                        <p className="text-xs text-muted-foreground">
                          No Gestor de Eventos da Meta
                        </p>
                      </div>


                      <div className="flex justify-end">
                        <Button
                          onClick={handleSaveMetaPixel}
                          className="bg-primary hover:bg-primary/90 text-primary-foreground"
                        >
                          Guardar
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Google Analytics Content */}
                  {integration.id === 'google-analytics' && (
                    <div className="space-y-6">

                      <div className="space-y-2">
                        <Label htmlFor="google-analytics-id" className="text-sm flex items-center gap-2 text-foreground">
                          <Eye className="w-4 h-4 text-muted-foreground" />
                          Google Analytics Measurement ID
                        </Label>
                        <Input
                          id="google-analytics-id"
                          type="text"
                          value={googleAnalyticsId}
                          onChange={(e) => setGoogleAnalyticsId(e.target.value)}
                          placeholder="G-XXXXXXXXXX"
                          className={`${integrationInputClass} font-mono`}
                        />
                        <p className="text-xs text-muted-foreground">
                          Admin → Fluxos de dados
                        </p>
                      </div>


                      <div className="flex justify-end">
                        <Button
                          onClick={handleSaveGoogleAnalytics}
                          className="bg-primary hover:bg-primary/90 text-primary-foreground"
                        >
                          Guardar
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* N8N Content */}
                  {integration.id === 'n8n' && (
                    <div className="space-y-4">

                      {/* Webhook - Cadastrar Novo Lead */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <Label htmlFor="n8n-webhook-url" className="text-sm flex items-center gap-2">
                            <Webhook className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                            Registar leads
                          </Label>
                          {isN8nConfigured && (
                            <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                              ✓ Configurado
                            </span>
                          )}
                        </div>

                        {/* Mostrar URL salva se houver */}
                        {isN8nConfigured && n8nWebhookUrl && (
                          <div className="mb-2 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
                            <p className="text-xs text-green-800 dark:text-green-200 break-all">
                              <strong>URL atual:</strong> {n8nWebhookUrl}
                            </p>
                          </div>
                        )}

                        <Input
                          id="n8n-webhook-url"
                          type="url"
                          value={n8nWebhookUrl}
                          onChange={(e) => setN8nWebhookUrl(e.target.value)}
                          placeholder="https://seu-n8n.com/webhook/listar-leads"
                          className={n8nInputClass}
                        />
                      </div>

                      {/* Webhook - Importação de Contatos WhatsApp */}
                      <div className="border-t border-cyan-200 dark:border-cyan-700 pt-4">
                        <div className="flex items-center justify-between mb-1.5">
                          <Label htmlFor="n8n-whatsapp-import-url" className="text-sm flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-green-600 dark:text-green-400" />
                            Importar contactos do WhatsApp
                          </Label>
                          {isN8nWhatsAppImportConfigured && (
                            <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                              ✓ Configurado
                            </span>
                          )}
                        </div>

                        {isN8nWhatsAppImportConfigured && n8nWhatsAppImportUrl && (
                          <div className="mb-2 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
                            <p className="text-xs text-green-800 dark:text-green-200 break-all">
                              <strong>URL atual:</strong> {n8nWhatsAppImportUrl}
                            </p>
                          </div>
                        )}

                        <Input
                          id="n8n-whatsapp-import-url"
                          type="url"
                          value={n8nWhatsAppImportUrl}
                          onChange={(e) => setN8nWhatsAppImportUrl(e.target.value)}
                          placeholder="https://seu-n8n.com/webhook/importar-whatsapp"
                          className={n8nInputClass}
                        />
                      </div>

                      <div className="flex gap-2 justify-end">
                        <Button
                          onClick={() => {
                            handleSaveN8nWebhook();
                            handleSaveN8nWhatsAppImportUrl();
                          }}
                        >
                          <Save className="w-4 h-4 mr-2" />
                          Guardar tudo
                        </Button>
                        {(isN8nConfigured || isN8nWhatsAppImportConfigured) && (
                          <Button
                            onClick={() => {
                              handleClearN8nWebhook();
                              handleClearN8nWhatsAppImportUrl();
                            }}
                            variant="outline"
                            className="border-red-600 text-red-600 hover:bg-red-50 dark:border-red-500 dark:text-red-400 dark:hover:bg-red-900/20"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Limpar tudo
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

