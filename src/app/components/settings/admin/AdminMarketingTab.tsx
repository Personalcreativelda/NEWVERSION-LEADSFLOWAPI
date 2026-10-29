import { matchesSearch } from '../../../utils/search';
import React, { useState, useMemo } from 'react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { FormField } from '../../base/FormField';
import { ChoiceList, CheckList } from '../../base/ChoiceList';
import { SearchInput } from '../../base/SearchInput';
import { useConfirm } from '../../ui/ConfirmDialog';
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

type Target = 'all' | 'free' | 'business' | 'enterprise' | 'specific';
type TemplateKey = 'welcome' | 'upgrade' | 'renewal' | 'promo';

interface BroadcastResult {
  sent: number;
  total: number;
  errors: string[];
}

// ── Modelos de email ─────────────────────────────────────────────────────────

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

const HTML_TEMPLATES: Record<TemplateKey, { subject: string; message: string }> = {
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

const TEXT_TEMPLATES: Record<TemplateKey, { subject: string; message: string }> = {
  welcome: {
    subject: 'Bem-vindo à LeadsFlow API! 🚀',
    message: `Olá {{name}},\n\nSeja bem-vindo à LeadsFlow API! Estamos felizes em ter você conosco.\n\nCom a nossa plataforma você pode:\n• Gerir leads de forma inteligente\n• Enviar campanhas de WhatsApp\n• Automatizar seu atendimento com IA\n\nQualquer dúvida, estamos aqui para ajudar!\n\nAtenciosamente,\nEquipe LeadsFlow API`,
  },
  renewal: {
    subject: '⏰ Seu plano está próximo do vencimento',
    message: `Olá {{name}},\n\nGostaríamos de informar que seu plano na LeadsFlow API está próximo do vencimento.\n\nRenove agora e continue aproveitando todos os recursos sem interrupções.\n\nAcesse sua conta em: https://app.leadsflowapi.com\n\nAtenciosamente,\nEquipe LeadsFlow API`,
  },
  promo: {
    subject: '🎉 Oferta especial para você!',
    message: `Olá {{name}},\n\nTemos uma oferta especial exclusiva para você!\n\nFaça upgrade para o plano Business ou Enterprise e tenha acesso a:\n• Leads ilimitados\n• Campanhas em massa\n• Assistentes de IA\n• Suporte prioritário\n\nAproveite agora mesmo em: https://app.leadsflowapi.com/planos\n\nAtenciosamente,\nEquipe LeadsFlow API`,
  },
  upgrade: {
    subject: '🎊 Parabéns pelo upgrade! Bem-vindo ao novo plano',
    message: `Olá {{name}},\n\nParabéns! O seu upgrade foi realizado com sucesso e você já tem acesso a todos os recursos do seu novo plano.\n\n O que você agora tem acesso:\n• Mais leads e mensagens\n• Campanhas em massa avançadas\n• Assistentes de IA personalizados\n• Canais ilimitados\n• Suporte prioritário\n\nComece a explorar agora: https://app.leadsflowapi.com\n\nObrigado pela confiança!\nEquipe LeadsFlow API`,
  },
};

const TEMPLATE_OPTIONS: { key: TemplateKey; label: string }[] = [
  { key: 'welcome', label: 'Boas-vindas' },
  { key: 'upgrade', label: 'Upgrade de plano' },
  { key: 'renewal', label: 'Renovação' },
  { key: 'promo', label: 'Promoção' },
];

const sectionTitle = 'mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground';

export const AdminMarketingTab: React.FC<AdminMarketingTabProps> = ({
  totalUsers, freeCount, businessCount, enterpriseCount, users,
}) => {
  const confirm = useConfirm();
  const [target, setTarget] = useState<Target>('all');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isHtml, setIsHtml] = useState(false);
  const [template, setTemplate] = useState<TemplateKey | ''>('');
  const [showPreview, setShowPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<BroadcastResult | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const counts: Record<Exclude<Target, 'specific'>, number> = {
    all: totalUsers, free: freeCount, business: businessCount, enterprise: enterpriseCount,
  };
  const recipients = target === 'specific' ? selectedIds.length : counts[target];

  // Escolhidos primeiro, depois os que correspondem à pesquisa
  const userRows = useMemo(() => {
    const chosen = users.filter((u) => selectedIds.includes(u.id));
    const matches = userSearch.trim()
      ? users.filter((u) => !selectedIds.includes(u.id) && matchesSearch(userSearch, u.name, u.email)).slice(0, 8)
      : [];
    return [...chosen, ...matches].map((u) => ({
      value: u.id,
      label: <span translate="no">{u.name || u.email}</span>,
      meta: <span translate="no" className="hidden sm:inline">{u.email}</span>,
    }));
  }, [users, selectedIds, userSearch]);

  const applyTemplate = (key: TemplateKey | '', html = isHtml) => {
    setTemplate(key);
    if (!key) return;
    const t = (html ? HTML_TEMPLATES : TEXT_TEMPLATES)[key];
    setSubject(t.subject);
    setMessage(t.message);
  };

  const changeFormat = (html: boolean) => {
    setIsHtml(html);
    setShowPreview(false);
    // O modelo escolhido passa para o outro formato; sem modelo, a mensagem começa vazia
    if (template) applyTemplate(template, html);
    else setMessage('');
  };

  const handleSend = async () => {
    if (!subject.trim() || !message.trim()) {
      toast.error('Preencha o assunto e a mensagem');
      return;
    }
    if (recipients === 0) {
      toast.error(target === 'specific' ? 'Escolha pelo menos um utilizador' : 'Nenhum utilizador neste grupo');
      return;
    }
    const ok = await confirm(`Enviar este email para ${recipients} utilizador(es)?`, {
      title: 'Enviar email',
      confirmLabel: 'Enviar',
      variant: 'info',
    });
    if (!ok) return;

    setSending(true);
    setResult(null);
    try {
      const res = await apiRequest('/admin/broadcast/email', 'POST', {
        subject,
        message,
        is_html: isHtml,
        target: target === 'specific' ? selectedIds : target,
      });
      if (res.success) {
        setResult({ sent: res.sent, total: res.total, errors: res.errors || [] });
        toast.success(`Email enviado para ${res.sent} de ${res.total} utilizadores`);
        setSubject('');
        setMessage('');
        setTemplate('');
      }
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível enviar');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-8">
      <section>
        <h3 className={sectionTitle}>Destinatários</h3>
        <ChoiceList
          value={target}
          onChange={setTarget}
          options={[
            { value: 'all', label: 'Todos os utilizadores', meta: totalUsers },
            { value: 'free', label: 'Plano Grátis', meta: freeCount },
            { value: 'business', label: 'Plano Business', meta: businessCount },
            { value: 'enterprise', label: 'Plano Enterprise', meta: enterpriseCount },
            {
              value: 'specific',
              label: 'Utilizadores específicos',
              meta: selectedIds.length,
              children: (
                <div className="space-y-2">
                  <SearchInput value={userSearch} onChange={setUserSearch} placeholder="Pesquisar por nome ou email" />
                  <CheckList
                    items={userRows}
                    selected={selectedIds}
                    onToggle={(id) => setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))}
                    empty={userSearch.trim() ? 'Nenhum resultado' : null}
                  />
                </div>
              ),
            },
          ]}
        />
      </section>

      <section>
        <h3 className={sectionTitle}>Email</h3>
        <div className="space-y-4 rounded-xl border border-border bg-card p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Modelo" htmlFor="mk-template">
              <select id="mk-template" value={template} onChange={(e) => applyTemplate(e.target.value as TemplateKey | '')}>
                <option value="">Sem modelo</option>
                {TEMPLATE_OPTIONS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </FormField>
            <FormField label="Formato" htmlFor="mk-format">
              <select id="mk-format" value={isHtml ? 'html' : 'text'} onChange={(e) => changeFormat(e.target.value === 'html')}>
                <option value="text">Texto</option>
                <option value="html">HTML</option>
              </select>
            </FormField>
          </div>

          <FormField label="Assunto" htmlFor="mk-subject">
            <Input id="mk-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </FormField>

          <FormField
            label={isHtml ? 'Código HTML' : 'Mensagem'}
            htmlFor="mk-message"
            hint="{{name}} e {{email}} são trocados pelo nome e email de cada utilizador"
          >
            {isHtml && showPreview ? (
              <div className="h-[420px] overflow-hidden rounded-lg border border-border bg-white">
                <iframe srcDoc={message} title="Pré-visualização" className="h-full w-full" sandbox="" />
              </div>
            ) : (
              <textarea
                id="mk-message"
                rows={isHtml ? 14 : 10}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className={`w-full resize-y ${isHtml ? 'font-mono text-xs leading-relaxed' : ''}`}
              />
            )}
          </FormField>

          <div className="flex gap-2 [&>*]:flex-1 sm:[&>*]:flex-none sm:justify-end">
            {isHtml && (
              <Button variant="outline" onClick={() => setShowPreview((v) => !v)} disabled={!message.trim()}>
                {showPreview ? 'Editar' : 'Pré-visualizar'}
              </Button>
            )}
            <Button onClick={() => void handleSend()} disabled={sending || !subject.trim() || !message.trim() || recipients === 0}>
              {sending ? 'A enviar…' : `Enviar para ${recipients}`}
            </Button>
          </div>
        </div>

        {result && (
          <div className="mt-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
            <p className="text-foreground">Enviado para {result.sent} de {result.total}</p>
            {result.errors.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                {result.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
