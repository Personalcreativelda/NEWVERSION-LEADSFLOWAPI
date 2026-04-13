import { useState, useEffect } from 'react';
import { Webhook, Mail, ChevronDown, ChevronUp, Copy, Check, Sheet, BarChart3, Eye, Crown, Lock, Loader2, CheckCircle2, MessageSquare, Save, Trash2, FlaskConical } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from "sonner";
import { userApi } from '../../utils/api';

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
  const [whatsappToken, setWhatsappToken] = useState('');
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [smtpSaveState, setSmtpSaveState] = useState<'idle' | 'loading' | 'saved'>('idle');
  const [n8nWebhookUrl, setN8nWebhookUrl] = useState('');
  const [n8nBulkSendUrl, setN8nBulkSendUrl] = useState('');
  const [n8nWhatsAppImportUrl, setN8nWhatsAppImportUrl] = useState('');
  const [isN8nConfigured, setIsN8nConfigured] = useState(false);
  const [isN8nBulkSendConfigured, setIsN8nBulkSendConfigured] = useState(false);
  const [isN8nWhatsAppImportConfigured, setIsN8nWhatsAppImportConfigured] = useState(false);
  const [metaPixelId, setMetaPixelId] = useState('');
  const [isMetaPixelConfigured, setIsMetaPixelConfigured] = useState(false);
  const [googleAnalyticsId, setGoogleAnalyticsId] = useState('');
  const [isGoogleAnalyticsConfigured, setIsGoogleAnalyticsConfigured] = useState(false);
  const [chatWebhookUrl, setChatWebhookUrl] = useState('');
  const [chatType, setChatType] = useState<'n8n' | 'supabase' | 'custom'>('n8n');
  const [isChatConfigured, setIsChatConfigured] = useState(false);
  const [evolutionApiUrl, setEvolutionApiUrl] = useState('');
  const [evolutionInstanceName, setEvolutionInstanceName] = useState('');
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
      applyStringSetting(localStorage.getItem('n8n_bulk_send_url'), setN8nBulkSendUrl, setIsN8nBulkSendConfigured);
      applyStringSetting(localStorage.getItem('n8n_whatsapp_import_url'), setN8nWhatsAppImportUrl, setIsN8nWhatsAppImportConfigured);
      applyStringSetting(localStorage.getItem('meta_pixel_id'), setMetaPixelId, setIsMetaPixelConfigured);
      applyStringSetting(localStorage.getItem('google_analytics_id'), setGoogleAnalyticsId, setIsGoogleAnalyticsConfigured);
      applyStringSetting(localStorage.getItem('chat_webhook_url'), setChatWebhookUrl, setIsChatConfigured);
      applyStringSetting(localStorage.getItem('smtp_host'), setSmtpHost);
      applyStringSetting(localStorage.getItem('smtp_port'), setSmtpPort);
      applyStringSetting(localStorage.getItem('smtp_user'), setSmtpUser);
      applyStringSetting(localStorage.getItem('smtp_password'), setSmtpPassword);
      applyStringSetting(localStorage.getItem('smtp_from_email'), setSmtpFromEmail);
      applyStringSetting(localStorage.getItem('smtp_from_name'), setSmtpFromName);
      applyStringSetting(localStorage.getItem('evolution_instance_name'), setEvolutionInstanceName);

      const storedChatType = localStorage.getItem('chat_type') as 'n8n' | 'supabase' | 'custom' | null;
      if (storedChatType && (['n8n', 'supabase', 'custom'] as const).includes(storedChatType)) {
        setChatType(storedChatType);
      }
    };

    const hydrateFromBackend = async () => {
      try {
        const settings = await userApi.getSettings();
        if (!isMounted || !settings) {
          return;
        }

        applyStringSetting(settings.n8n_webhook_url, setN8nWebhookUrl, setIsN8nConfigured);
        applyStringSetting(settings.n8n_bulk_send_url, setN8nBulkSendUrl, setIsN8nBulkSendConfigured);
        applyStringSetting(settings.n8n_whatsapp_import_url, setN8nWhatsAppImportUrl, setIsN8nWhatsAppImportConfigured);
        applyStringSetting(settings.meta_pixel_id, setMetaPixelId, setIsMetaPixelConfigured);
        applyStringSetting(settings.google_analytics_id, setGoogleAnalyticsId, setIsGoogleAnalyticsConfigured);
        applyStringSetting(settings.chat_webhook_url, setChatWebhookUrl, setIsChatConfigured);
        applyStringSetting(settings.smtp_host, setSmtpHost);
        applyStringSetting(settings.smtp_port, setSmtpPort);
        applyStringSetting(settings.smtp_user, setSmtpUser);
        applyStringSetting(settings.smtp_password, setSmtpPassword);
        applyStringSetting(settings.smtp_from_email, setSmtpFromEmail);
        applyStringSetting(settings.smtp_from_name, setSmtpFromName);
        applyStringSetting(settings.evolution_instance_name, setEvolutionInstanceName);
        applyStringSetting(settings.evolution_api_url, setEvolutionApiUrl);

        const envOverrides = (settings?.env_overrides || settings?.env || null) as Record<string, string> | null;
        if (envOverrides) {
          applyStringSetting(envOverrides.evolution_api_url, setEvolutionApiUrl);
          applyStringSetting(envOverrides.evolution_instance_name, setEvolutionInstanceName);
          applyStringSetting(envOverrides.dashboard_meta_pixel_id, setDashboardPixelEnv);
        }

        if (!envOverrides?.dashboard_meta_pixel_id) {
          applyStringSetting((settings as any)?.dashboard_meta_pixel_id, setDashboardPixelEnv);
        }

        if (settings.chat_type && (['n8n', 'supabase', 'custom'] as const).includes(settings.chat_type)) {
          setChatType(settings.chat_type);
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

  // Gerar URL do webhook de entrada para receber leads
  const incomingWebhookUrl = user?.id
    ? `${window.location.origin}/api/webhook/leads/${user.id}`
    : '';

  const handleCopyWebhookUrl = async () => {
    try {
      await navigator.clipboard.writeText(incomingWebhookUrl);
      setCopiedWebhook(true);
      toast.success('URL copiada para a área de transferência!');
      setTimeout(() => setCopiedWebhook(false), 2000);
    } catch (err) {
      toast.error('Erro ao copiar URL');
    }
  };

  const handleToggleSection = (section: IntegrationType) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

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
      toast.error(`❌ Erro de validação:\n${errors.join('\n')}`);
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
      toast.success('✅ Configurações SMTP salvas com sucesso!', {
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
      toast.error('❌ Erro ao salvar configurações SMTP', {
        description: errorMessage,
        duration: 5000,
      });
    }
  };

  const handleSaveWhatsApp = () => {
    toast.success('WhatsApp API configurado com sucesso!');
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
      toast.success('✅ Webhook N8N configurado com sucesso!');

      console.log('[N8N Save] URL salva no backend:', n8nWebhookUrl);
    } catch (error) {
      console.error('[N8N Save] Error:', error);
      toast.error('Erro ao salvar webhook. Tente novamente.');
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
      toast.success('🗑️ Configuração do webhook N8N removida');
      console.log('[N8N] Configuration cleared from backend');
    } catch (error) {
      console.error('[N8N Clear] Error:', error);
      toast.error('Erro ao remover configuração');
    }
  };

  const handleTestWebhook = async () => {
    try {
      toast.info('🧪 Testando webhook N8N...');
      console.log('[Test Webhook] Starting test...');

      const token = localStorage.getItem('leadflow_access_token');
      const response = await fetch(`https://${(await import('../../utils/supabase/info')).projectId}.supabase.co/functions/v1/make-server-4be966ab/test-webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();
      console.log('[Test Webhook] Response:', data);

      if (response.ok && data.success) {
        toast.success(
          `✅ Webhook testado com sucesso!\\n\\n` +
          `URL: ${data.webhookUrl}\\n` +
          `Instance: ${data.instanceName || 'N/A'}\\n\\n` +
          `Verifique seu workflow N8N!`,
          { duration: 8000 }
        );
      } else {
        toast.error(
          `❌ Teste falhou: ${data.error || 'Erro desconhecido'}\\n\\n` +
          (data.help || 'Verifique a configuração'),
          { duration: 6000 }
        );
      }
    } catch (error: any) {
      console.error('[Test Webhook] Error:', error);
      toast.error(`❌ Erro ao testar webhook: ${error.message}`);
    }
  };

  const handleSaveN8nBulkSendUrl = async () => {
    if (!n8nBulkSendUrl) {
      toast.error('Por favor, insira a URL do webhook N8N de envio em massa');
      return;
    }

    // Validar URL
    try {
      new URL(n8nBulkSendUrl);
    } catch (e) {
      toast.error('URL inválida. Certifique-se de incluir http:// ou https://');
      return;
    }

    try {
      // ✅ SALVAR NO BACKEND
      await userApi.saveSettings({ n8n_bulk_send_url: n8nBulkSendUrl });

      // Sync com localStorage
      localStorage.setItem('n8n_bulk_send_url', n8nBulkSendUrl);
      setIsN8nBulkSendConfigured(true);
      toast.success('✅ URL de envio em massa configurada com sucesso!');

      console.log('[N8N Bulk Send] URL salva no backend:', n8nBulkSendUrl);
    } catch (error) {
      console.error('[N8N Bulk Send] Error:', error);
      toast.error('Erro ao salvar URL. Tente novamente.');
    }
  };

  const handleClearN8nBulkSendUrl = async () => {
    try {
      // ✅ LIMPAR NO BACKEND
      await userApi.saveSettings({ n8n_bulk_send_url: '' });

      // Sync com localStorage
      localStorage.removeItem('n8n_bulk_send_url');
      setN8nBulkSendUrl('');
      setIsN8nBulkSendConfigured(false);
      toast.success('🗑️ Configuração de envio em massa removida');
      console.log('[N8N Bulk Send] Configuration cleared from backend');
    } catch (error) {
      console.error('[N8N Bulk Send Clear] Error:', error);
      toast.error('Erro ao remover configuração');
    }
  };

  const handleSaveN8nWhatsAppImportUrl = async () => {
    if (!n8nWhatsAppImportUrl) {
      toast.error('Por favor, insira a URL do webhook N8N de importação de contatos');
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
      toast.success('✅ URL de importação de contatos configurada com sucesso!');

      console.log('[N8N WhatsApp Import] URL salva no backend:', n8nWhatsAppImportUrl);
    } catch (error) {
      console.error('[N8N WhatsApp Import] Error:', error);
      toast.error('Erro ao salvar URL. Tente novamente.');
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
      toast.success('🗑️ Configuração de importação de contatos removida');
      console.log('[N8N WhatsApp Import] Configuration cleared from backend');
    } catch (error) {
      console.error('[N8N WhatsApp Import Clear] Error:', error);
      toast.error('Erro ao remover configuração');
    }
  };

  const handleTestN8nWebhook = async () => {
    if (!n8nWebhookUrl) {
      toast.error('Configure o webhook N8N primeiro');
      return;
    }

    toast.info('🔍 Testando conexão com webhook N8N...');

    try {
      console.log('[N8N Test] Testing URL:', n8nWebhookUrl);

      // Tentar GET primeiro (para listar leads)
      let response = await fetch(n8nWebhookUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      console.log('[N8N Test] GET Response status:', response.status);

      // Se GET retornar 404 ou 405, tentar POST
      if (response.status === 404 || response.status === 405) {
        console.log('[N8N Test] GET not supported, trying POST...');
        toast.info('⚠️ Endpoint não suporta GET. Testando com POST...');

        // Fazer teste com POST
        response = await fetch(n8nWebhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            test: true,
            action: 'list_all',
            message: 'Teste de conexão LeadsFlow API'
          }),
        });

        console.log('[N8N Test] POST Response status:', response.status);

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          console.error('[N8N Test] POST error:', errorText);
          toast.error(`❌ POST retornou erro: ${response.status} ${response.statusText}`);
          return;
        }

        // POST funcionou
        toast.success('✅ Conexão OK! Webhook responde a requisições POST.');

        // Tentar parsear a resposta
        try {
          const data = await response.json();
          console.log('[N8N Test] POST response:', data);

          // Verificar se há leads na resposta
          const leadsArray = Array.isArray(data) ? data : (data.leads || data.rows || data.data || data.items || []);
          if (Array.isArray(leadsArray) && leadsArray.length > 0) {
            toast.success(`✅ Encontrados ${leadsArray.length} lead(s) na resposta!`);
          }
        } catch (e) {
          console.log('[N8N Test] POST response is not JSON (OK)');
        }

        return;
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error('[N8N Test] GET error:', errorText);
        toast.error(`❌ Webhook retornou erro: ${response.status} ${response.statusText}`);
        return;
      }

      // Se GET funcionou, tentar parsear a resposta
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        toast.success('✅ Conexão OK! Webhook está respondendo.');
        console.log('[N8N Test] Webhook responding but not JSON');
        return;
      }

      const data = await response.json();
      const leadsArray = Array.isArray(data) ? data : (data.leads || data.rows || data.data || data.items || []);

      if (!Array.isArray(leadsArray)) {
        toast.warning('⚠️ Webhook está funcionando, mas formato de resposta não reconhecido.');
        console.log('[N8N Test] Response data:', data);
        return;
      }

      if (leadsArray.length === 0) {
        toast.success('✅ Conexão OK! Webhook está funcionando (nenhum lead encontrado).');
      } else {
        toast.success(`✅ Conexão OK! Encontrados ${leadsArray.length} lead(s) na planilha.`);
      }

      console.log('[N8N Test] Sample lead:', leadsArray[0]);
    } catch (error: any) {
      console.error('[N8N Test] Error:', error);

      if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
        toast.error('❌ Erro de conexão. Verifique:\n• URL está correta?\n• Workflow está ativo no N8N?\n• CORS está configurado?');
      } else {
        toast.error(`❌ Erro ao conectar: ${error.message}`);
      }
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
      toast.success('✅ Meta Pixel configurado com sucesso!');
    } catch (error) {
      console.error('[Meta Pixel Save] Error:', error);
      toast.error('Erro ao salvar Meta Pixel');
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
      toast.success('✅ Google Analytics configurado com sucesso!');
    } catch (error) {
      console.error('[Google Analytics Save] Error:', error);
      toast.error('Erro ao salvar Google Analytics');
    }
  };

  const handleSaveChatWebhook = async () => {
    if (!chatWebhookUrl) {
      toast.error('Por favor, insira a URL do webhook de chat');
      return;
    }

    // Validar URL
    try {
      new URL(chatWebhookUrl);
    } catch (e) {
      toast.error('URL inválida. Certifique-se de incluir http:// ou https://');
      return;
    }

    try {
      // ✅ SALVAR NO BACKEND
      await userApi.saveSettings({
        chat_webhook_url: chatWebhookUrl,
        chat_type: chatType
      });

      // Sync com localStorage
      localStorage.setItem('chat_webhook_url', chatWebhookUrl);
      setIsChatConfigured(true);
      toast.success('✅ Webhook de chat configurado com sucesso!');

      console.log('[Chat Save] URL salva no backend:', chatWebhookUrl);
    } catch (error) {
      console.error('[Chat Save] Error:', error);
      toast.error('Erro ao salvar webhook de chat');
    }
  };

  const handleClearChatWebhook = async () => {
    try {
      // ✅ LIMPAR NO BACKEND
      await userApi.saveSettings({ chat_webhook_url: '', chat_type: 'n8n' });

      // Sync com localStorage
      localStorage.removeItem('chat_webhook_url');
      setChatWebhookUrl('');
      setIsChatConfigured(false);
      toast.success('🗑️ Configuração do webhook de chat removida');
      console.log('[Chat] Configuration cleared from backend');
    } catch (error) {
      console.error('[Chat Clear] Error:', error);
      toast.error('Erro ao remover configuração');
    }
  };

  const handleTestChatWebhook = async () => {
    if (!chatWebhookUrl) {
      toast.error('Configure o webhook de chat primeiro');
      return;
    }

    toast.info('🔍 Testando conexão com webhook de chat...');

    try {
      console.log('[Chat Test] Testing URL:', chatWebhookUrl);

      // Tentar GET primeiro (para listar leads)
      let response = await fetch(chatWebhookUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      console.log('[Chat Test] GET Response status:', response.status);

      // Se GET retornar 404 ou 405, tentar POST
      if (response.status === 404 || response.status === 405) {
        console.log('[Chat Test] GET not supported, trying POST...');
        toast.info('⚠️ Endpoint não suporta GET. Testando com POST...');

        // Fazer teste com POST
        response = await fetch(chatWebhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            test: true,
            action: 'list_all',
            message: 'Teste de conexão LeadsFlow API'
          }),
        });

        console.log('[Chat Test] POST Response status:', response.status);

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          console.error('[Chat Test] POST error:', errorText);
          toast.error(`❌ POST retornou erro: ${response.status} ${response.statusText}`);
          return;
        }

        // POST funcionou
        toast.success('✅ Conexão OK! Webhook responde a requisições POST.');

        // Tentar parsear a resposta
        try {
          const data = await response.json();
          console.log('[Chat Test] POST response:', data);

          // Verificar se há leads na resposta
          const leadsArray = Array.isArray(data) ? data : (data.leads || data.rows || data.data || data.items || []);
          if (Array.isArray(leadsArray) && leadsArray.length > 0) {
            toast.success(`✅ Encontrados ${leadsArray.length} lead(s) na resposta!`);
          }
        } catch (e) {
          console.log('[Chat Test] POST response is not JSON (OK)');
        }

        return;
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error('[Chat Test] GET error:', errorText);
        toast.error(`❌ Webhook retornou erro: ${response.status} ${response.statusText}`);
        return;
      }

      // Se GET funcionou, tentar parsear a resposta
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        toast.success('✅ Conexão OK! Webhook está respondendo.');
        console.log('[Chat Test] Webhook responding but not JSON');
        return;
      }

      const data = await response.json();
      const leadsArray = Array.isArray(data) ? data : (data.leads || data.rows || data.data || data.items || []);

      if (!Array.isArray(leadsArray)) {
        toast.warning('⚠️ Webhook está funcionando, mas formato de resposta não reconhecido.');
        console.log('[Chat Test] Response data:', data);
        return;
      }

      if (leadsArray.length === 0) {
        toast.success('✅ Conexão OK! Webhook está funcionando (nenhum lead encontrado).');
      } else {
        toast.success(`✅ Conexão OK! Encontrados ${leadsArray.length} lead(s) na planilha.`);
      }

      console.log('[Chat Test] Sample lead:', leadsArray[0]);
    } catch (error: any) {
      console.error('[Chat Test] Error:', error);

      if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
        toast.error('❌ Erro de conexão. Verifique:\n• URL está correta?\n• Workflow está ativo no N8N?\n• CORS está configurado?');
      } else {
        toast.error(`❌ Erro ao conectar: ${error.message}`);
      }
    }
  };

  const integrationInputClass =
    "mt-1.5 h-11 text-sm rounded-lg border border-gray-200 dark:border-gray-800 !bg-white dark:!bg-white !text-gray-900 dark:!text-gray-900 dark:shadow-none shadow-sm focus-visible:border-primary focus-visible:ring-primary/15";
  const integrationIconClass =
    "w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 bg-muted border border-border";
  const infoBlockClass =
    "rounded-lg border border-border bg-muted p-4";
  const currentUrlBannerClass =
    "px-3 py-2 rounded-md border border-border bg-muted text-xs text-muted-foreground break-all font-mono";
  const n8nInputClass =
    "mt-1.5 h-11 text-sm rounded-lg border border-gray-200 dark:border-gray-800 dark:shadow-none shadow-sm !bg-white dark:!bg-white !text-gray-900 dark:!text-gray-900 placeholder:text-gray-500 focus-visible:border-cyan-500 focus-visible:ring-cyan-500/15 dark:placeholder:text-gray-400";

  const integrations = [
    {
      id: 'n8n' as IntegrationType,
      name: 'Webhooks N8N',
      description: 'Integração com planilha Google Sheets em tempo real',
      icon: Sheet,
      color: 'text-cyan-600 dark:text-cyan-400',
      borderColor: 'border-cyan-200 dark:border-cyan-800',
      badge: isN8nConfigured ? '✓ Configurado' : null,
    },
    {
      id: 'webhook' as IntegrationType,
      name: 'Webhooks',
      description: 'Receba notificações em tempo real',
      icon: Webhook,
      color: 'text-blue-600 dark:text-blue-400',
      borderColor: 'border-blue-200 dark:border-blue-800',
    },
    {
      id: 'smtp' as IntegrationType,
      name: 'SMTP',
      description: 'Configure seu servidor de email',
      icon: Mail,
      color: 'text-purple-600 dark:text-purple-400',
      borderColor: 'border-purple-200 dark:border-purple-800',
    },
    {
      id: 'meta-pixel' as IntegrationType,
      name: 'Meta Pixel (Facebook)',
      description: 'Rastreie eventos de conversão de leads no Meta Ads',
      icon: BarChart3,
      color: 'text-indigo-600 dark:text-indigo-400',
      borderColor: 'border-indigo-200 dark:border-indigo-800',
      badge: isMetaPixelConfigured ? '✓ Configurado' : null,
    },
    {
      id: 'google-analytics' as IntegrationType,
      name: 'Google Analytics',
      description: 'Envie eventos de conversão para o Google Analytics',
      icon: Eye,
      color: 'text-orange-600 dark:text-orange-400',
      borderColor: 'border-orange-200 dark:border-orange-800',
      badge: isGoogleAnalyticsConfigured ? '✓ Configurado' : null,
    },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-0">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground dark:text-foreground mb-2">
          Integrações
        </h1>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground">
          Configure suas integrações e serviços externos
        </p>
      </div>

      {/* Integration Cards */}
      <div className="space-y-4">
        {integrations.map((integration) => {
          const Icon = integration.icon;
          const isExpanded = expandedSection === integration.id;

          return (
            <div
              key={integration.id}
              className="bg-card dark:bg-card rounded-xl border border-border dark:border-border transition-all"
            >
              {/* Card Header - Clickable */}
              <button
                onClick={() => handleToggleSection(integration.id)}
                className="w-full p-6 flex items-center justify-between text-left hover:bg-muted dark:hover:bg-muted/50 transition-colors rounded-t-xl"
              >
                <div className="flex items-center gap-4 flex-1">
                  <div className={integrationIconClass}>
                    <Icon className={`w-6 h-6 ${integration.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground dark:text-foreground">
                        {integration.name}
                      </h3>
                      {'badge' in integration && integration.badge && (
                        <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-muted text-foreground">
                          {integration.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-300">
                      {integration.description}
                    </p>
                  </div>
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                )}
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="px-6 pb-6 border-t border-gray-200 dark:border-gray-800 pt-6 relative">

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
                        <p className="text-xs text-muted-foreground mt-2">
                          Cole a URL onde deseja receber as notificações via webhook
                        </p>
                      </div>
                      <div className="flex justify-end">
                        <Button
                          onClick={handleSaveWebhook}
                          className="bg-primary hover:bg-primary/90 text-primary-foreground"
                        >
                          Salvar Webhook
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
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Ex: smtp.gmail.com, smtp.hostinger.com
                          </p>
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
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Comum: 587 (TLS), 465 (SSL), 25 (Padrão)
                          </p>
                        </div>
                        <div>
                          <Label htmlFor="smtp-user" className="text-sm">
                            Usuário/Email <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            id="smtp-user"
                            type="email"
                            value={smtpUser}
                            onChange={(e) => setSmtpUser(e.target.value)}
                            placeholder="seu@email.com"
                            className="mt-1.5"
                          />
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Email usado para autenticação SMTP
                          </p>
                        </div>
                        <div>
                          <Label htmlFor="smtp-password" className="text-sm">
                            Senha <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            id="smtp-password"
                            type="password"
                            value={smtpPassword}
                            onChange={(e) => setSmtpPassword(e.target.value)}
                            placeholder="••••••••"
                            className="mt-1.5"
                          />
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Senha do email ou senha de aplicativo
                          </p>
                        </div>
                        <div>
                          <Label htmlFor="smtp-from-email" className="text-sm font-medium">
                            Email Remetente (Campanhas) <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            id="smtp-from-email"
                            type="email"
                            value={smtpFromEmail}
                            onChange={(e) => setSmtpFromEmail(e.target.value)}
                            placeholder="contato@seudominio.com"
                            className="mt-1.5"
                          />
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Este email aparecerá como o remetente das campanhas
                          </p>
                        </div>
                        <div>
                          <Label htmlFor="smtp-from-name" className="text-sm font-medium">
                            Nome do Remetente
                          </Label>
                          <Input
                            id="smtp-from-name"
                            type="text"
                            value={smtpFromName}
                            onChange={(e) => setSmtpFromName(e.target.value)}
                            placeholder="Sua Empresa"
                            className="mt-1.5"
                          />
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Nome que aparecerá na caixa de entrada do cliente
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-gray-500 dark:text-gray-500 dark:text-gray-400">
                          {smtpHost && smtpPort && smtpUser && smtpPassword ? (
                            <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Todos os campos preenchidos
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <span className="text-amber-600 dark:text-amber-400">⚠️</span>
                              Preencha todos os campos obrigatórios
                            </span>
                          )}
                        </div>

                        <Button
                          onClick={handleSaveSmtp}
                          disabled={smtpSaveState !== 'idle'}
                          className={`${smtpSaveState === 'saved'
                            ? 'bg-green-600 hover:bg-green-700'
                            : 'bg-purple-600 hover:bg-purple-700'
                            } text-white transition-all duration-300`}
                        >
                          {smtpSaveState === 'loading' && (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Salvando...
                            </>
                          )}
                          {smtpSaveState === 'saved' && (
                            <>
                              <CheckCircle2 className="w-4 h-4 mr-2" />
                              Salvo!
                            </>
                          )}
                          {smtpSaveState === 'idle' && 'Salvar SMTP'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Meta Pixel Content */}
                  {integration.id === 'meta-pixel' && (
                    <div className="space-y-6">
                      <div className={`${infoBlockClass} space-y-2`}>
                        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                          <BarChart3 className="w-4 h-4 text-primary" />
                          📊 Rastreie Conversões no Meta Ads
                        </h4>
                        <p className="text-xs text-muted-foreground dark:text-gray-300">
                          Configure o Meta Pixel (Facebook Pixel) para rastrear eventos de conversão quando um lead for marcado como "Convertido" na sua CRM.
                        </p>
                        <p className="text-xs text-muted-foreground dark:text-gray-300">
                          Evento disparado automaticamente:
                          <code className="ml-2 bg-card px-1.5 py-0.5 rounded text-xs font-semibold text-foreground">Lead</code>
                        </p>
                      </div>

                      {dashboardPixelEnv && (
                        <div className={`${infoBlockClass} space-y-1`}>
                          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <BarChart3 className="w-4 h-4 text-primary" />
                            Pixel padrão do dashboard
                          </h4>
                          <div className={currentUrlBannerClass}>{dashboardPixelEnv}</div>
                          <p className="text-xs text-muted-foreground dark:text-gray-300">
                            Definido via variável de ambiente. Atualize aqui apenas o pixel específico do usuário.
                          </p>
                        </div>
                      )}

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
                        <p className="text-xs text-muted-foreground dark:text-gray-300">
                          Encontre seu Pixel ID no Gerenciador de Eventos do Meta Business Suite
                        </p>
                      </div>

                      <div className={`${infoBlockClass} space-y-1.5`}>
                        <h4 className="text-sm font-semibold text-foreground">
                          ℹ️ Como funciona
                        </h4>
                        <ul className="text-xs text-muted-foreground dark:text-gray-300 space-y-1.5">
                          <li>• Quando você marcar um lead como "Convertido", o pixel dispara automaticamente</li>
                          <li>• O evento "Lead" é enviado para o Meta com os dados do lead</li>
                          <li>• Você pode ver as conversões no Gerenciador de Anúncios</li>
                          <li>• Otimize suas campanhas com base em conversões reais</li>
                        </ul>
                      </div>

                      <div className="flex justify-end">
                        <Button
                          onClick={handleSaveMetaPixel}
                          className="bg-primary hover:bg-primary/90 text-primary-foreground"
                        >
                          Salvar Meta Pixel
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Google Analytics Content */}
                  {integration.id === 'google-analytics' && (
                    <div className="space-y-6">
                      <div className={`${infoBlockClass} space-y-2`}>
                        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                          <Eye className="w-4 h-4 text-primary" />
                          📈 Rastreie Conversões no Google Analytics
                        </h4>
                        <p className="text-xs text-muted-foreground dark:text-gray-300">
                          Configure o Google Analytics 4 (GA4) para rastrear eventos de conversão quando um lead for marcado como "Convertido" na sua CRM.
                        </p>
                        <p className="text-xs text-muted-foreground dark:text-gray-300">
                          Evento disparado automaticamente:
                          <code className="ml-2 bg-card px-1.5 py-0.5 rounded text-xs font-semibold text-foreground">generate_lead</code>
                        </p>
                      </div>

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
                        <p className="text-xs text-muted-foreground dark:text-gray-300">
                          Encontre seu Measurement ID no Google Analytics (Admin → Data Streams)
                        </p>
                      </div>

                      <div className={`${infoBlockClass} space-y-1.5`}>
                        <h4 className="text-sm font-semibold text-foreground">
                          ℹ️ Como funciona
                        </h4>
                        <ul className="text-xs text-muted-foreground dark:text-gray-300 space-y-1.5">
                          <li>• Quando você marcar um lead como "Convertido", o evento é disparado automaticamente</li>
                          <li>• O evento "generate_lead" é enviado para o GA4 com os dados do lead</li>
                          <li>• Você pode ver as conversões em Relatórios → Eventos no GA4</li>
                          <li>• Configure o evento como conversão no GA4 para otimizar suas campanhas</li>
                        </ul>
                      </div>

                      <div className="flex justify-end">
                        <Button
                          onClick={handleSaveGoogleAnalytics}
                          className="bg-primary hover:bg-primary/90 text-primary-foreground"
                        >
                          Salvar Google Analytics
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* N8N Content */}
                  {integration.id === 'n8n' && (
                    <div className="space-y-4">
                      {/* Info Box */}
                      <div className="bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800 rounded-lg p-4">
                        <h4 className="text-sm font-semibold text-cyan-900 dark:text-cyan-100 mb-2 flex items-center gap-2">
                          <Sheet className="w-4 h-4" />
                          Configure as URLs dos webhooks do N8N para integração com sua planilha Google Sheets.
                        </h4>
                        <p className="text-xs text-cyan-800 dark:text-cyan-200">
                          As URLs devem ter o formato: <code className="bg-white dark:bg-gray-950 px-1.5 py-0.5 rounded text-cyan-900 dark:text-cyan-100">https://seu-n8n.com/webhook/nome</code>
                        </p>
                      </div>

                      {/* Webhook - Cadastrar Novo Lead */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <Label htmlFor="n8n-webhook-url" className="text-sm flex items-center gap-2">
                            <Webhook className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                            Webhook - Cadastrar Novo Lead
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
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                          Endpoint GET/POST para listar ou criar leads na planilha
                        </p>
                      </div>

                      {/* Webhook - Envio em Massa WhatsApp */}
                      <div className="border-t border-cyan-200 dark:border-cyan-700 pt-4">
                        <div className="flex items-center justify-between mb-1.5">
                          <Label htmlFor="n8n-bulk-send-url" className="text-sm flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-green-600 dark:text-green-400" />
                            Webhook - Envio em Massa WhatsApp
                          </Label>
                          {isN8nBulkSendConfigured && (
                            <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                              ✓ Configurado
                            </span>
                          )}
                        </div>

                        {/* Mostrar URL salva se houver */}
                        {isN8nBulkSendConfigured && n8nBulkSendUrl && (
                          <div className="mb-2 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
                            <p className="text-xs text-green-800 dark:text-green-200 break-all">
                              <strong>URL atual:</strong> {n8nBulkSendUrl}
                            </p>
                          </div>
                        )}

                        <Input
                          id="n8n-bulk-send-url"
                          type="url"
                          value={n8nBulkSendUrl}
                          onChange={(e) => setN8nBulkSendUrl(e.target.value)}
                          placeholder="https://seu-n8n.com/webhook/envio-massa-whatsapp"
                          className={n8nInputClass}
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                          Endpoint POST para enviar mensagens em massa via WhatsApp através das Campanhas
                        </p>
                      </div>

                      {/* Webhook - Importação de Contatos WhatsApp */}
                      <div className="border-t border-cyan-200 dark:border-cyan-700 pt-4">
                        <div className="flex items-center justify-between mb-1.5">
                          <Label htmlFor="n8n-whatsapp-import-url" className="text-sm flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-green-600 dark:text-green-400" />
                            Webhook - Importação de Contatos WhatsApp
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
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                          Endpoint POST para importar contatos do WhatsApp. Envia: {`{ "instancia": "leadflow_userId", "userId": "id", "action": "listar-contatos" }`}
                        </p>
                      </div>

                      <div className="flex gap-2 justify-end">
                        <Button
                          onClick={() => {
                            handleSaveN8nWebhook();
                            handleSaveN8nBulkSendUrl();
                            handleSaveN8nWhatsAppImportUrl();
                          }}
                          className="bg-cyan-600 hover:bg-cyan-700 text-white"
                        >
                          <Save className="w-4 h-4 mr-2" />
                          Salvar Todos
                        </Button>
                        {isN8nConfigured && (
                          <Button
                            onClick={handleTestWebhook}
                            variant="outline"
                            className="border-green-600 text-green-600 hover:bg-green-50 dark:border-green-500 dark:text-green-400 dark:hover:bg-green-900/20"
                          >
                            <FlaskConical className="w-4 h-4 mr-2" />
                            Testar Webhook
                          </Button>
                        )}
                        {(isN8nConfigured || isN8nBulkSendConfigured || isN8nWhatsAppImportConfigured) && (
                          <Button
                            onClick={() => {
                              handleClearN8nWebhook();
                              handleClearN8nBulkSendUrl();
                              handleClearN8nWhatsAppImportUrl();
                            }}
                            variant="outline"
                            className="border-red-600 text-red-600 hover:bg-red-50 dark:border-red-500 dark:text-red-400 dark:hover:bg-red-900/20"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Limpar Tudo
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

