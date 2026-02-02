import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Save, CheckCircle, Mail, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { apiRequest } from '../../utils/api';
import { Switch } from '../ui/switch';

interface SMTPSettingsProps {
  user: any;
}

export default function SMTPSettings({ user }: SMTPSettingsProps) {
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [smtpConfig, setSmtpConfig] = useState({
    host: '',
    port: '587',
    user: '',
    password: '',
    fromEmail: '',
    fromName: '',
    secure: false,
  });

  useEffect(() => {
    loadSMTPSettings();
  }, []);

  const loadSMTPSettings = async () => {
    try {
      const response = await apiRequest('/smtp/settings', 'GET');
      if (response.success && response.settings) {
        setSmtpConfig({
          host: response.settings.host || '',
          port: response.settings.port || '587',
          user: response.settings.user || '',
          password: '', // Não carregar senha por segurança
          fromEmail: response.settings.fromEmail || '',
          fromName: response.settings.fromName || '',
          secure: response.settings.secure || false,
        });
      }
    } catch (error) {
      console.error('Failed to load SMTP settings:', error);
    }
  };

  const handleSave = async () => {
    if (!smtpConfig.host || !smtpConfig.user || !smtpConfig.fromEmail) {
      alert('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    setLoading(true);
    try {
      const response = await apiRequest('/smtp/settings', 'POST', smtpConfig);
      if (response.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (error) {
      console.error('Error saving SMTP settings:', error);
      alert('Erro ao salvar configurações SMTP. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleTestEmail = async () => {
    if (!smtpConfig.host || !smtpConfig.user || !smtpConfig.fromEmail) {
      alert('Por favor, configure e salve as configurações SMTP primeiro.');
      return;
    }

    setLoading(true);
    try {
      const response = await apiRequest('/smtp/test', 'POST', {
        toEmail: user?.email,
      });

      if (response.success) {
        alert(`✅ Email de teste enviado para ${user?.email}!`);
      } else {
        alert('❌ Falha ao enviar email de teste. Verifique as configurações.');
      }
    } catch (error: any) {
      console.error('Error sending test email:', error);
      alert(`❌ Erro ao enviar email de teste: ${error.message || 'Erro desconhecido'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-card dark:bg-card rounded-xl shadow-sm border border-border dark:border-border p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center">
          <Mail className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="text-foreground dark:text-foreground">Configurações SMTP</h3>
          <p className="text-sm text-muted-foreground dark:text-muted-foreground">
            Configure seu servidor SMTP para envio de email marketing
          </p>
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800 dark:text-blue-200">
            <p className="font-medium mb-1">Provedores SMTP recomendados:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Gmail: smtp.gmail.com (porta 587)</li>
              <li>SendGrid: smtp.sendgrid.net (porta 587)</li>
              <li>Mailgun: smtp.mailgun.org (porta 587)</li>
              <li>Amazon SES: email-smtp.us-east-1.amazonaws.com (porta 587)</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="smtp-host">
              Servidor SMTP <span className="text-red-500">*</span>
            </Label>
            <Input
              id="smtp-host"
              value={smtpConfig.host}
              onChange={(e) => setSmtpConfig({ ...smtpConfig, host: e.target.value })}
              placeholder="smtp.gmail.com"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="smtp-port">
              Porta <span className="text-red-500">*</span>
            </Label>
            <Input
              id="smtp-port"
              value={smtpConfig.port}
              onChange={(e) => setSmtpConfig({ ...smtpConfig, port: e.target.value })}
              placeholder="587"
              type="number"
              className="mt-1"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="smtp-user">
            Usuário SMTP <span className="text-red-500">*</span>
          </Label>
          <Input
            id="smtp-user"
            value={smtpConfig.user}
            onChange={(e) => setSmtpConfig({ ...smtpConfig, user: e.target.value })}
            placeholder="seu-email@gmail.com"
            type="email"
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="smtp-password">
            Senha SMTP <span className="text-red-500">*</span>
          </Label>
          <div className="relative mt-1">
            <Input
              id="smtp-password"
              value={smtpConfig.password}
              onChange={(e) => setSmtpConfig({ ...smtpConfig, password: e.target.value })}
              placeholder="••••••••"
              type={showPassword ? 'text' : 'password'}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:text-gray-300"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Para Gmail, use uma senha de aplicativo. Não use sua senha principal.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="from-email">
              From Address (Email Remetente) <span className="text-red-500">*</span>
            </Label>
            <Input
              id="from-email"
              value={smtpConfig.fromEmail}
              onChange={(e) => setSmtpConfig({ ...smtpConfig, fromEmail: e.target.value })}
              placeholder="noreply@seudominio.com"
              type="email"
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Este endereço será usado como remetente nas campanhas de email marketing
            </p>
          </div>

          <div>
            <Label htmlFor="from-name">Nome do remetente</Label>
            <Input
              id="from-name"
              value={smtpConfig.fromName}
              onChange={(e) => setSmtpConfig({ ...smtpConfig, fromName: e.target.value })}
              placeholder="LeadFlow CRM"
              className="mt-1"
            />
          </div>
        </div>

        <div className="flex items-center space-x-2 pt-2">
          <Switch
            id="smtp-secure"
            checked={smtpConfig.secure}
            onCheckedChange={(checked) => setSmtpConfig({ ...smtpConfig, secure: checked })}
          />
          <Label htmlFor="smtp-secure" className="cursor-pointer">
            Usar TLS/SSL (recomendado)
          </Label>
        </div>

        <div className="flex items-center gap-3 pt-4">
          <Button
            onClick={handleSave}
            disabled={loading}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            {loading ? (
              'Salvando...'
            ) : saved ? (
              <>
                <CheckCircle className="w-4 h-4 mr-2" />
                Salvo!
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Salvar configurações
              </>
            )}
          </Button>

          <Button
            onClick={handleTestEmail}
            disabled={loading || !smtpConfig.host || !smtpConfig.user}
            variant="outline"
          >
            <Mail className="w-4 h-4 mr-2" />
            Enviar email de teste
          </Button>
        </div>
      </div>

      <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
        <p className="text-sm text-amber-800 dark:text-amber-200">
          <strong>Nota:</strong> As configurações SMTP são necessárias para o envio de email marketing em massa.
          Certifique-se de usar credenciais válidas de um provedor SMTP confiável.
        </p>
      </div>
    </div>
  );
}

