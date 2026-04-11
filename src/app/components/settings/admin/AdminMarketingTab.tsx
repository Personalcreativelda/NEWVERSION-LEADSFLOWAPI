import React, { useState, useMemo } from 'react';
import { Mail, MessageSquare, Send, Loader2, Users, Rocket, Crown, 
  Info, CheckCircle, Search, X, UserCheck, Code2, Eye, Type } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { apiRequest } from '../../../utils/api';
import { toast } from 'sonner';

interface SimpleUser {
  id: string;
  name: string;
  email: string;
  plan: string;
}

interface AdminMarketingTabProps {
  totalUsers: number;
  freeCount: number;
  businessCount: number;
  enterpriseCount: number;
  users: SimpleUser[];
}

type Channel = 'email';
type Target = 'all' | 'free' | 'business' | 'enterprise' | 'specific';

interface BroadcastResult {
  sent: number;
  total: number;
  errors: string[];
}

export const AdminMarketingTab: React.FC<AdminMarketingTabProps> = ({
  totalUsers, freeCount, businessCount, enterpriseCount, users,
}) => {
  const [channel, setChannel] = useState<Channel>('email');
  const [target, setTarget] = useState<Target>('all');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<BroadcastResult | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<SimpleUser[]>([]);
  const [isHtml, setIsHtml] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const targetOptions: { value: Target; label: string; count: number; icon: React.ReactNode }[] = [
    { value: 'all', label: 'Todos os usuários', count: totalUsers, icon: <Users className="w-4 h-4" /> },
    { value: 'free', label: 'Plano Free', count: freeCount, icon: <Users className="w-4 h-4 text-muted-foreground" /> },
    { value: 'business', label: 'Plano Business', count: businessCount, icon: <Rocket className="w-4 h-4 text-primary" /> },
    { value: 'enterprise', label: 'Plano Enterprise', count: enterpriseCount, icon: <Crown className="w-4 h-4 text-violet-500" /> },
    { value: 'specific', label: 'Usuários específicos', count: selectedUsers.length, icon: <UserCheck className="w-4 h-4 text-teal-500" /> },
  ];

  const selectedTarget = targetOptions.find(t => t.value === target)!;

  const searchResults = useMemo(() => {
    if (!userSearch.trim() || target !== 'specific') return [];
    const q = userSearch.toLowerCase();
    return users
      .filter(u =>
        !selectedUsers.find(s => s.id === u.id) &&
        (u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      )
      .slice(0, 8);
  }, [userSearch, users, selectedUsers, target]);

  const handleSend = async () => {
    if (!subject.trim() || !message.trim()) {
      toast.error('Preencha o assunto e a mensagem');
      return;
    }
    if (target === 'specific' && selectedUsers.length === 0) {
      toast.error('Selecione pelo menos um usuário');
      return;
    }
    if (target !== 'specific' && selectedTarget.count === 0) {
      toast.error('Nenhum usuário no segmento selecionado');
      return;
    }
    const count = target === 'specific' ? selectedUsers.length : selectedTarget.count;
    if (!confirm(`Enviar para ${count} usuário(s)?`)) return;

    setSending(true);
    setResult(null);
    try {
      const payload: any = { subject, message, is_html: isHtml };
      if (target === 'specific') {
        payload.target = selectedUsers.map(u => u.id);
      } else {
        payload.target = target;
      }
      const res = await apiRequest('/admin/broadcast/email', 'POST', payload);
      if (res.success) {
        setResult({ sent: res.sent, total: res.total, errors: res.errors || [] });
        toast.success(`Email enviado para ${res.sent} de ${res.total} usuários!`);
        setSubject('');
        setMessage('');
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar broadcast');
    } finally {
      setSending(false);
    }
  };

  const BASE_HTML = (headerColor: string, emoji: string, title: string, body: string) => `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.10)">
<tr><td style="background:${headerColor};padding:44px 40px 36px;text-align:center">
  <div style="font-size:44px;margin-bottom:12px">${emoji}</div>
  <h1 style="color:#fff;margin:0;font-size:26px;font-weight:800;letter-spacing:-0.5px">LeadsFlow API</h1>
  <p style="color:rgba(255,255,255,0.75);margin:8px 0 0;font-size:14px">Sua plataforma de automação de leads</p>
</td></tr>
<tr><td style="padding:40px">
${body}
</td></tr>
<tr><td style="background:#f8fafc;padding:24px 40px;text-align:center;border-top:1px solid #e2e8f0">
  <p style="color:#94a3b8;font-size:12px;margin:0 0 4px">LeadsFlow API — Plataforma de automação</p>
  <p style="color:#cbd5e1;font-size:11px;margin:0">Para cancelar o recebimento de emails, acesse as configurações da sua conta.</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  const htmlTemplates: Record<string, { subject: string; message: string }> = {
    welcome: {
      subject: 'Bem-vindo à LeadsFlow API! 🚀',
      message: BASE_HTML(
        'linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%)',
        '🚀',
        'Bem-vindo',
        `<h2 style="color:#1e293b;margin:0 0 12px;font-size:22px;font-weight:700">Olá, {{name}}! Seja bem-vindo 👋</h2>
<p style="color:#475569;line-height:1.8;margin:0 0 28px;font-size:15px">Estamos felizes em ter você conosco! Com a LeadsFlow API você tem tudo o que precisa para automatizar seu atendimento.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px">
<tr><td style="padding:14px 18px;background:#f0f4ff;border-radius:12px;border-left:4px solid #6366f1;margin-bottom:10px">
  <strong style="color:#4338ca">📊 Gestão de Leads</strong><br>
  <span style="color:#64748b;font-size:14px">Organize e acompanhe todos os seus leads em um só lugar</span>
</td></tr><tr><td style="height:8px"></td></tr>
<tr><td style="padding:14px 18px;background:#f0fdf4;border-radius:12px;border-left:4px solid #22c55e">
  <strong style="color:#15803d">📣 Campanhas em massa</strong><br>
  <span style="color:#64748b;font-size:14px">Envie mensagens para centenas de leads com um clique</span>
</td></tr><tr><td style="height:8px"></td></tr>
<tr><td style="padding:14px 18px;background:#fdf4ff;border-radius:12px;border-left:4px solid #a855f7">
  <strong style="color:#7e22ce">🤖 Assistentes de IA</strong><br>
  <span style="color:#64748b;font-size:14px">Automatize respostas com inteligência artificial</span>
</td></tr></table>
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center">
  <a href="https://app.leadsflowapi.com" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;padding:14px 40px;border-radius:50px;font-weight:700;font-size:15px">Começar agora →</a>
</td></tr></table>`
      ),
    },
    upgrade: {
      subject: '🎊 Parabéns pelo upgrade! Bem-vindo ao novo plano',
      message: BASE_HTML(
        'linear-gradient(135deg,#f59e0b 0%,#ef4444 100%)',
        '🏆',
        'Upgrade realizado',
        `<h2 style="color:#1e293b;margin:0 0 12px;font-size:22px;font-weight:700">Parabéns, {{name}}! 🎉</h2>
<p style="color:#475569;line-height:1.8;margin:0 0 24px;font-size:15px">Seu upgrade foi realizado com sucesso. Você já tem acesso a todos os recursos do seu novo plano!</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;background:#fffbeb;border-radius:14px;padding:20px">
<tr><td><p style="color:#92400e;font-weight:700;margin:0 0 12px;font-size:15px">✅ O que você agora tem acesso:</p>
<p style="color:#78350f;margin:6px 0;font-size:14px">🚀 Mais leads e mensagens por mês</p>
<p style="color:#78350f;margin:6px 0;font-size:14px">📣 Campanhas em massa avançadas</p>
<p style="color:#78350f;margin:6px 0;font-size:14px">🤖 Assistentes de IA personalizados</p>
<p style="color:#78350f;margin:6px 0;font-size:14px">📡 Canais ilimitados</p>
<p style="color:#78350f;margin:6px 0;font-size:14px">🎯 Suporte prioritário</p>
</td></tr></table>
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center">
  <a href="https://app.leadsflowapi.com" style="display:inline-block;background:linear-gradient(135deg,#f59e0b,#ef4444);color:#fff;text-decoration:none;padding:14px 40px;border-radius:50px;font-weight:700;font-size:15px">Explorar meu plano →</a>
</td></tr></table>`
      ),
    },
    renewal: {
      subject: '⏰ Seu plano está próximo do vencimento',
      message: BASE_HTML(
        'linear-gradient(135deg,#0ea5e9 0%,#6366f1 100%)',
        '⏰',
        'Renovação de plano',
        `<h2 style="color:#1e293b;margin:0 0 12px;font-size:22px;font-weight:700">Olá, {{name}}!</h2>
<p style="color:#475569;line-height:1.8;margin:0 0 20px;font-size:15px">Seu plano na LeadsFlow API está próximo do vencimento. Renove agora para não perder o acesso aos recursos.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px">
<tr><td style="background:#eff6ff;border-radius:14px;padding:20px;border:1px solid #bfdbfe">
  <p style="color:#1e40af;font-weight:700;margin:0 0 8px">⚡ Renove e continue aproveitando:</p>
  <p style="color:#3b82f6;margin:6px 0;font-size:14px">✓ Todos os seus canais conectados</p>
  <p style="color:#3b82f6;margin:6px 0;font-size:14px">✓ Histórico de conversas e leads</p>
  <p style="color:#3b82f6;margin:6px 0;font-size:14px">✓ Campanhas e automações ativas</p>
  <p style="color:#3b82f6;margin:6px 0;font-size:14px">✓ Assistentes de IA configurados</p>
</td></tr></table>
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center">
  <a href="https://app.leadsflowapi.com/planos" style="display:inline-block;background:linear-gradient(135deg,#0ea5e9,#6366f1);color:#fff;text-decoration:none;padding:14px 40px;border-radius:50px;font-weight:700;font-size:15px">Renovar plano →</a>
</td></tr></table>`
      ),
    },
    promo: {
      subject: '🎉 Oferta especial para você!',
      message: BASE_HTML(
        'linear-gradient(135deg,#10b981 0%,#0ea5e9 100%)',
        '🎁',
        'Oferta especial',
        `<h2 style="color:#1e293b;margin:0 0 12px;font-size:22px;font-weight:700">Uma oferta exclusiva para você, {{name}}!</h2>
<p style="color:#475569;line-height:1.8;margin:0 0 20px;font-size:15px">Temos uma promoção especial que pode transformar o seu negócio. Não perca essa oportunidade!</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px">
<tr><td style="background:linear-gradient(135deg,#ecfdf5,#eff6ff);border-radius:14px;padding:24px;border:1px solid #a7f3d0">
  <p style="color:#065f46;font-size:18px;font-weight:800;margin:0 0 16px;text-align:center">🚀 Faça upgrade para Business ou Enterprise</p>
  <p style="color:#047857;margin:8px 0;font-size:14px">✅ Leads ilimitados</p>
  <p style="color:#047857;margin:8px 0;font-size:14px">✅ Campanhas em massa sem limite</p>
  <p style="color:#047857;margin:8px 0;font-size:14px">✅ Assistentes de IA com GPT-4</p>
  <p style="color:#047857;margin:8px 0;font-size:14px">✅ Suporte prioritário 24/7</p>
  <p style="color:#047857;margin:8px 0;font-size:14px">✅ Relatórios avançados de analytics</p>
</td></tr></table>
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center">
  <a href="https://app.leadsflowapi.com/planos" style="display:inline-block;background:linear-gradient(135deg,#10b981,#0ea5e9);color:#fff;text-decoration:none;padding:14px 40px;border-radius:50px;font-weight:700;font-size:15px">Ver oferta especial →</a>
</td></tr></table>`
      ),
    },
  };

  const insertTemplate = (type: 'welcome' | 'renewal' | 'promo' | 'upgrade') => {
    if (isHtml) {
      setSubject(htmlTemplates[type].subject);
      setMessage(htmlTemplates[type].message);
    } else {
      const textTemplates: Record<string, { subject: string; message: string }> = {
        welcome: {
          subject: 'Bem-vindo à LeadsFlow API! 🚀',
          message: `Olá {{name}},\n\nSeja bem-vindo à LeadsFlow API! Estamos felizes em ter você conosco.\n\nCom a nossa plataforma você pode:\n• Gerenciar leads de forma inteligente\n• Enviar campanhas de WhatsApp\n• Automatizar seu atendimento com IA\n\nQualquer dúvida, estamos aqui para ajudar!\n\nAtenciosamente,\nEquipe LeadsFlow API`,
        },
        renewal: {
          subject: '⏰ Seu plano está próximo do vencimento',
          message: `Olá {{name}},\n\nGostaríamos de informar que seu plano na LeadsFlow API está próximo do vencimento.\n\nRenove agora e continue aproveitando todos os recursos sem interrupções.\n\nAcesse sua conta em: https://app.leadsflowapi.com\n\nAtenciosamente,\nEquipe LeadsFlow API`,
        },
        promo: {
          subject: '🎉 Oferta especial para você!',
          message: `Olá {{name}},\n\nTemos uma oferta especial exclusiva para você!\n\n🚀 Faça upgrade para o plano Business ou Enterprise e tenha acesso a:\n• Leads ilimitados\n• Campanhas em massa\n• Assistentes de IA\n• Suporte prioritário\n\nAproveite agora mesmo em: https://app.leadsflowapi.com/planos\n\nAtenciosamente,\nEquipe LeadsFlow API`,
        },
        upgrade: {
          subject: '🎊 Parabéns pelo upgrade! Bem-vindo ao novo plano',
          message: `Olá {{name}},\n\nParabéns! Seu upgrade foi realizado com sucesso e você já tem acesso a todos os recursos do seu novo plano.\n\n✅ O que você agora tem acesso:\n• Mais leads e mensagens\n• Campanhas em massa avançadas\n• Assistentes de IA personalizados\n• Canais ilimitados\n• Suporte prioritário\n\nComeçe a explorar agora: https://app.leadsflowapi.com\n\nObrigado pela confiança!\nEquipe LeadsFlow API`,
        },
      };
      setSubject(textTemplates[type].subject);
      setMessage(textTemplates[type].message);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Marketing para Usuários</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Envie emails para segmentos de usuários diretamente pela plataforma
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Composer */}
        <div className="lg:col-span-2 space-y-5">
          {/* Channel selector + mode toggle */}
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div className="flex gap-2">
              <button
                onClick={() => setChannel('email')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                  channel === 'email'
                    ? 'bg-primary/10 border-primary/30 text-primary'
                    : 'border-border text-muted-foreground hover:bg-muted/30'
                }`}
              >
                <Mail className="w-4 h-4" />
                Email
              </button>
              <button
                disabled
                title="Em breve"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground/40 cursor-not-allowed"
              >
                <MessageSquare className="w-4 h-4" />
                WhatsApp
                <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full">Em breve</span>
              </button>
            </div>
            {/* HTML / Texto mode toggle */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/40 border border-border">
              <button
                onClick={() => { setIsHtml(false); setShowPreview(false); setMessage(''); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  !isHtml ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Type className="w-3.5 h-3.5" /> Texto
              </button>
              <button
                onClick={() => { setIsHtml(true); setShowPreview(false); setMessage(''); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isHtml ? 'bg-card shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" /> HTML
              </button>
            </div>
          </div>

          {/* Target selector */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Destinatários</label>
            <div className="grid grid-cols-2 gap-2">
              {targetOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setTarget(opt.value)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                    target === opt.value
                      ? 'bg-primary/10 border-primary/40 text-primary'
                      : 'bg-card border-border text-foreground hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {opt.icon}
                    <span className="truncate text-xs">{opt.label}</span>
                  </div>
                  <span className={`text-xs font-bold ml-2 flex-shrink-0 ${
                    target === opt.value ? 'text-primary' : 'text-muted-foreground'
                  }`}>{opt.count}</span>
                </button>
              ))}
            </div>

            {/* Specific user search */}
            {target === 'specific' && (
              <div className="mt-3 space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Pesquisar por nome ou email..."
                    value={userSearch}
                    onChange={e => setUserSearch(e.target.value)}
                    className="w-full pl-8 pr-4 py-2 rounded-lg border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>

                {/* Search results dropdown */}
                {searchResults.length > 0 && (
                  <div className="rounded-lg border border-border bg-card overflow-hidden">
                    {searchResults.map(u => (
                      <button
                        key={u.id}
                        onClick={() => { setSelectedUsers(prev => [...prev, u]); setUserSearch(''); }}
                        className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/40 transition-colors border-b border-border/50 last:border-0"
                      >
                        <div className="text-left">
                          <p className="font-medium text-foreground">{u.name}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">{u.plan}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Selected users chips */}
                {selectedUsers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedUsers.map(u => (
                      <span
                        key={u.id}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary"
                      >
                        {u.name}
                        <button onClick={() => setSelectedUsers(prev => prev.filter(x => x.id !== u.id))}>
                          <X className="w-3 h-3 hover:text-destructive transition-colors" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Subject */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Assunto</label>
            <Input
              placeholder="Assunto do email..."
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="text-sm"
            />
          </div>

          {/* Message */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-muted-foreground">
                {isHtml ? 'Código HTML' : 'Mensagem'}
              </label>
              <div className="flex items-center gap-2">
                {isHtml && (
                  <button
                    onClick={() => setShowPreview(p => !p)}
                    className={`flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg border transition-colors ${
                      showPreview
                        ? 'bg-primary/10 border-primary/30 text-primary'
                        : 'border-border text-muted-foreground hover:bg-muted/30'
                    }`}
                  >
                    {showPreview ? <Code2 className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    {showPreview ? 'Código' : 'Preview'}
                  </button>
                )}
                <span className="text-[10px] text-muted-foreground/60 bg-muted px-2 py-0.5 rounded">
                  Use {'{{name}}'} e {'{{email}}'} para personalizar
                </span>
              </div>
            </div>
            {isHtml && showPreview ? (
              <div className="rounded-xl border border-border overflow-hidden" style={{ height: '320px' }}>
                <iframe
                  srcDoc={message}
                  title="Email preview"
                  className="w-full h-full"
                  sandbox="allow-same-origin"
                />
              </div>
            ) : (
              <textarea
                rows={isHtml ? 14 : 10}
                placeholder={isHtml ? '<!DOCTYPE html>\n<html>...\n</html>' : 'Digite sua mensagem aqui...'}
                value={message}
                onChange={e => setMessage(e.target.value)}
                className={`w-full resize-none rounded-xl border border-border bg-card text-foreground px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                  isHtml ? 'font-mono text-xs leading-relaxed' : ''
                }`}
              />
            )}
          </div>

          {/* Send button */}
          <Button
            onClick={handleSend}
            disabled={sending || !subject.trim() || !message.trim() || (target === 'specific' && selectedUsers.length === 0)}
            className="w-full gap-2 h-11 text-base"
          >
            {sending ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Enviando...</>
            ) : (
              <><Send className="w-5 h-5" /> Enviar para {target === 'specific' ? selectedUsers.length : selectedTarget.count} usuário(s)</>
            )}
          </Button>

          {/* Result */}
          {result && (
            <div className={`flex items-start gap-3 p-4 rounded-xl border ${
              result.errors.length === 0
                ? 'bg-green-500/10 border-green-500/20'
                : 'bg-orange-500/10 border-orange-500/20'
            }`}>
              <CheckCircle className={`w-5 h-5 mt-0.5 flex-shrink-0 ${result.errors.length === 0 ? 'text-green-500' : 'text-orange-500'}`} />
              <div className="text-sm">
                <p className="font-medium text-foreground">
                  Enviado para {result.sent} de {result.total} usuários
                </p>
                {result.errors.length > 0 && (
                  <div className="mt-1 space-y-0.5 text-muted-foreground text-xs">
                    <p>{result.errors.length} erro(s):</p>
                    {result.errors.slice(0, 5).map((e, i) => <p key={i}>• {e}</p>)}
                  </div>
                )}
              </div>
            </div>
          )}


        </div>

        {/* Sidebar: Templates & Stats */}
        <div className="space-y-5">
          {/* Audience stats */}
          <div className="p-4 rounded-xl border border-border bg-card space-y-3">
            <h3 className="font-semibold text-sm text-foreground">Audiência Selecionada</h3>
            <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/10">
              <div className="flex items-center gap-2">
                {selectedTarget.icon}
                <span className="text-sm font-medium text-foreground">{selectedTarget.label}</span>
              </div>
              <span className="text-2xl font-bold text-primary">{selectedTarget.count}</span>
            </div>
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>Apenas usuários ativos receberão o email.</span>
            </div>
          </div>

          {/* Templates */}
          <div className="p-4 rounded-xl border border-border bg-card space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm text-foreground">Templates Rápidos</h3>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                isHtml ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
              }`}>{isHtml ? 'HTML' : 'Texto'}</span>
            </div>
            <div className="space-y-2">
              {[
                { key: 'welcome' as const, label: '👋 Boas-vindas', desc: 'Mensagem de boas-vindas à plataforma' },
                { key: 'upgrade' as const, label: '🎊 Upgrade realizado', desc: 'Parabéns pelo upgrade de plano' },
                { key: 'renewal' as const, label: '⏰ Renovação', desc: 'Lembrete de vencimento de plano' },
                { key: 'promo' as const, label: '🎉 Promoção', desc: 'Oferta de upgrade de plano' },
              ].map(t => (
                <button
                  key={t.key}
                  onClick={() => insertTemplate(t.key)}
                  className="w-full text-left p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors group"
                >
                  <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{t.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Tips */}
          <div className="p-4 rounded-xl border border-border/50 bg-muted/20 space-y-2">
            <h3 className="font-semibold text-sm text-foreground">Dicas</h3>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li className="flex items-start gap-1.5"><span className="text-primary mt-0.5">•</span> Use {'{{name}}'} para personalizar com o nome do usuário</li>
              <li className="flex items-start gap-1.5"><span className="text-primary mt-0.5">•</span> Use {'{{email}}'} para incluir o email na mensagem</li>
              {isHtml && <li className="flex items-start gap-1.5"><span className="text-primary mt-0.5">•</span> Clique em <strong>Preview</strong> para visualizar o email renderizado</li>}
              {isHtml && <li className="flex items-start gap-1.5"><span className="text-primary mt-0.5">•</span> Use estilos inline para compatibilidade máxima com clientes de email</li>}
              <li className="flex items-start gap-1.5"><span className="text-primary mt-0.5">•</span> Emails são enviados via SMTP configurado no servidor</li>
              <li className="flex items-start gap-1.5"><span className="text-primary mt-0.5">•</span> Segmente por plano para campanhas mais eficientes</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
