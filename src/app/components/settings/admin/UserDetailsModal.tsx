// Detalhes de uma conta para a administração: resumo e consumo, assistentes (e quanto responderam),
// segurança (entradas, tentativas falhadas, alertas), atividade no sistema e envio de mensagens
// de marketing (email ou WhatsApp a partir do número da administração).
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Bot, Globe, KeyRound, Mail, MessageSquare, ShieldCheck, Smartphone } from 'lucide-react';
import { AppModal } from '../../base/AppModal';
import { LogoBox } from '../../base/LogoBox';
import { brandForChannel } from '../../base/BrandIcon';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Switch } from '../../ui/switch';
import { cn } from '../../ui/utils';
import { apiRequest } from '../../../utils/api';
import { formatNumber, formatRelativeDay, getLocale } from '../../../utils/format';
import { TEMPLATE_OPTIONS, TEXT_TEMPLATES, type TemplateKey } from './AdminMarketingTab';

interface UsageItem { used: number; limit: number }

interface SecurityEvent { type: string; ip: string | null; country: string | null; user_agent: string | null; detail: string | null; created_at: string }

interface Details {
  user: {
    id: string; email: string; name: string; avatar_url?: string | null; role?: string; is_active: boolean;
    email_verified: boolean; two_factor_enabled: boolean; plan: string; plan_expires_at?: string | null;
    created_at: string; last_active_at?: string | null; allow_whatsapp_qr: boolean;
  };
  usage: {
    leads: UsageItem; messages: UsageItem; mass_messages: UsageItem;
    campaigns: { total: number; active: number }; conversations: number; received_30d: number;
    ai_replies: { total: number; last_30d: number };
  };
  channels: Array<{ id: string; name: string; type: string; status: string; number: string | null }>;
  deleted_channels: number;
  assistants: Array<{
    id: string; name: string; is_custom: boolean; is_active: boolean; is_configured: boolean; channels: string[];
    replies_total: number; replies_30d: number; errors_30d: number; last_reply_at: string | null;
  }>;
  api_tokens: { active: number; last_used_at: string | null };
  security: {
    stats: { failures_24h: number; failures_7d: number; logins_30d: number; ips_30d: number; countries_30d: number };
    last_login: SecurityEvent | null;
    alerts: Array<{ level: 'high' | 'medium'; message: string }>;
    events: SecurityEvent[];
  };
  activity: {
    recent: Array<{ type: string; description: string; created_at: string }>;
    features: Array<{ feature: string; n: number; last_at: string }>;
    presence: Array<{ description: string; path: string | null; ip: string | null; country: string | null; created_at: string }>;
  };
  send_from: Array<{ id: string; name: string; type: string; number: string | null }>;
  contact_number: string | null;
}

type Tab = 'summary' | 'assistants' | 'security' | 'activity' | 'message';

const TABS: Array<{ key: Tab; label: string; short: string }> = [
  { key: 'summary', label: 'Resumo', short: 'Resumo' },
  { key: 'assistants', label: 'Assistentes', short: 'IA' },
  { key: 'security', label: 'Segurança', short: 'Acessos' },
  { key: 'activity', label: 'Atividade', short: 'Atividade' },
  { key: 'message', label: 'Enviar mensagem', short: 'Enviar' },
];

const EVENT_LABELS: Record<string, string> = {
  login_success: 'Entrou com email',
  login_google: 'Entrou com a Google',
  login_failure: 'Tentativa de entrada falhada',
  two_factor_success: 'Verificação em dois passos',
  two_factor_failure: 'Código de verificação errado',
  password_reset_request: 'Pediu nova palavra-passe',
  password_reset_done: 'Recuperou a palavra-passe',
  password_changed: 'Mudou a palavra-passe',
};
const BAD_EVENTS = new Set(['login_failure', 'two_factor_failure']);

const FEATURE_LABELS: Record<string, string> = {
  inbox: 'Caixa de entrada', leads: 'Leads', campaigns: 'Campanhas', dashboard: 'Início', settings: 'Definições',
  auth: 'Autenticação', funnel: 'Funil', remarketing: 'Remarketing', assistants: 'Assistentes', reports: 'Relatórios',
  analytics: 'Relatórios', tasks: 'Tarefas', channels: 'Canais', admin: 'Administração', outro: 'Outro',
};

const CHANNEL_STATUS: Record<string, string> = {
  active: 'Ligado', connected: 'Ligado', inactive: 'Desligado', disconnected: 'Desligado', pending: 'Pendente', error: 'Com erro',
};

const PLAN_LABELS: Record<string, string> = { free: 'Grátis', business: 'Business', enterprise: 'Enterprise' };

/** Navegador e sistema a partir do user agent (o suficiente para reconhecer um aparelho) */
function deviceLabel(ua?: string | null): string {
  if (!ua) return '';
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iOS/i.test(ua) ? 'iPhone' : /Windows/i.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : '';
  const app = /\bwv\b|LeadsFlow/i.test(ua) ? 'App LeadsFlow' : '';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /curl|python|axios|node|postman/i.test(ua) ? 'Script / API' : '';
  return [app || browser, os].filter(Boolean).join(' · ');
}

function countryName(code?: string | null): string {
  if (!code) return '';
  if (code === 'XX') return 'Desconhecido';
  if (code === 'T1') return 'Rede Tor';
  try {
    return new Intl.DisplayNames([getLocale()], { type: 'region' }).of(code) || code;
  } catch {
    return code;
  }
}

const dateTime = (v?: string | null) => (v ? new Date(v).toLocaleString(getLocale(), { dateStyle: 'short', timeStyle: 'short' }) : '—');

function UsageCard({ label, item, extra }: { label: string; item?: UsageItem; extra?: ReactNode }) {
  const unlimited = !item || item.limit === -1;
  const pct = !unlimited && item!.limit > 0 ? Math.min(100, Math.round((item!.used / item!.limit) * 100)) : 0;
  const full = !unlimited && item!.used >= item!.limit;
  return (
    <div className={cn('rounded-xl border p-3', full ? 'border-red-500/40 bg-red-500/5' : 'border-border bg-muted/20')}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-lg font-semibold tabular-nums', full ? 'text-red-500' : 'text-foreground')}>
        {extra ?? (
          <>
            {formatNumber(item?.used ?? 0)}
            <span className="text-sm font-normal text-muted-foreground"> / {unlimited ? '∞' : formatNumber(item!.limit)}</span>
          </>
        )}
      </p>
      {!extra && !unlimited && (
        <div className="mt-2 h-1.5 rounded-full bg-muted">
          <div className={cn('h-1.5 rounded-full', full ? 'bg-red-500' : 'bg-primary')} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        {aside && <span className="text-xs text-muted-foreground">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

const listClass = 'divide-y divide-border rounded-xl border border-border';
const rowClass = 'flex items-center gap-3 px-4 py-2.5';

export function UserDetailsModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [details, setDetails] = useState<Details | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('summary');
  const [savingQr, setSavingQr] = useState(false);

  // Mensagem
  const [via, setVia] = useState<'email' | 'whatsapp'>('email');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [phone, setPhone] = useState('');
  const [fromChannel, setFromChannel] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest(`/admin/users/${userId}/details`, 'GET');
      if (!res?.success) throw new Error();
      setDetails(res);
      setPhone(res.contact_number || '');
      setFromChannel(res.send_from?.[0]?.id || '');
    } catch {
      toast.error('Não foi possível carregar a conta');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  const toggleQr = async (enabled: boolean) => {
    if (!details) return;
    setSavingQr(true);
    setDetails({ ...details, user: { ...details.user, allow_whatsapp_qr: enabled } });
    try {
      const res = await apiRequest(`/admin/users/${userId}/whatsapp-qr`, 'POST', { enabled });
      if (!res?.success) throw new Error();
      toast.success(enabled ? 'WhatsApp por código QR disponível nesta conta' : 'WhatsApp por código QR escondido nesta conta');
    } catch {
      setDetails({ ...details, user: { ...details.user, allow_whatsapp_qr: !enabled } });
      toast.error('Não foi possível guardar');
    } finally {
      setSavingQr(false);
    }
  };

  const applyTemplate = (key: TemplateKey) => {
    const t = TEXT_TEMPLATES[key];
    if (!t) return;
    setSubject(t.subject);
    setMessage(t.message);
  };

  const send = async () => {
    if (!details) return;
    if (!message.trim() || (via === 'email' && !subject.trim()) || (via === 'whatsapp' && !phone.trim())) {
      toast.error(via === 'email' ? 'Escreva o assunto e a mensagem' : 'Indique o número e a mensagem');
      return;
    }
    const firstName = (details.user.name || '').trim().split(/\s+/)[0] || '';
    setSending(true);
    try {
      const res = via === 'email'
        ? await apiRequest(`/admin/users/${userId}/send-email`, 'POST', {
          subject, message: message.replace(/\{\{?\s*(name|nome)\s*\}?\}/gi, firstName),
        })
        : await apiRequest(`/admin/users/${userId}/send-whatsapp`, 'POST', { phone, message, channel_id: fromChannel || undefined });
      if (res?.success === false || res?.error) throw new Error(res?.error);
      toast.success(via === 'email' ? `Email enviado para ${details.user.email}` : 'Mensagem enviada');
      setMessage('');
      setSubject('');
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível enviar');
    } finally {
      setSending(false);
    }
  };

  const d = details;
  const alerts = d?.security.alerts || [];

  return (
    <AppModal
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      size="lg"
      title="Detalhes do utilizador"
      bodyClassName="p-0"
    >
      {loading || !d ? (
        <div className="space-y-3 p-5" aria-busy="true">
          <div className="h-16 rounded-xl skeleton-shimmer" />
          <div className="h-10 rounded-xl skeleton-shimmer" />
          <div className="grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl skeleton-shimmer" />)}</div>
        </div>
      ) : (
        <div>
          {/* Conta */}
          <div className="flex items-start gap-3 px-5 pt-5">
            {d.user.avatar_url ? (
              <img src={d.user.avatar_url} alt="" className="h-12 w-12 flex-shrink-0 rounded-full object-cover" />
            ) : (
              <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-muted text-base font-semibold text-muted-foreground">
                {(d.user.name || d.user.email).slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-base font-semibold text-foreground" translate="no">{d.user.name || d.user.email}</p>
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', d.user.is_active ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600')}>
                  {d.user.is_active ? 'Ativa' : 'Suspensa'}
                </span>
              </div>
              <p className="truncate text-sm text-muted-foreground" translate="no">{d.user.email}</p>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>Plano: <strong className="text-foreground">{PLAN_LABELS[d.user.plan] || d.user.plan}</strong></span>
                {d.user.plan_expires_at && <span>Expira {new Date(d.user.plan_expires_at).toLocaleDateString(getLocale())}</span>}
                <span>Registo {new Date(d.user.created_at).toLocaleDateString(getLocale())}</span>
                <span>Último acesso {d.user.last_active_at ? formatRelativeDay(d.user.last_active_at, 'time') : '—'}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]', d.user.two_factor_enabled ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground')}>
                  <ShieldCheck className="h-3 w-3" />{d.user.two_factor_enabled ? 'Verificação em dois passos' : 'Sem verificação em dois passos'}
                </span>
                {!d.user.email_verified && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-600">Email por confirmar</span>}
              </div>
            </div>
          </div>

          {/* Alertas de segurança: sempre à vista */}
          {alerts.length > 0 && (
            <div className="mx-5 mt-4 space-y-1 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3">
              {alerts.map((a) => (
                <p key={a.message} className={cn('flex items-start gap-2 text-sm', a.level === 'high' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400')}>
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />{a.message}
                </p>
              ))}
            </div>
          )}

          {/* Separadores */}
          <div className="mt-4 flex border-b border-border px-1 sm:gap-1 sm:px-4">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn('relative flex h-11 min-w-0 flex-1 items-center justify-center px-1 text-[13px] font-medium transition-colors sm:flex-none sm:px-3 sm:text-sm', tab === t.key ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}
              >
                <span className="sm:hidden">{t.short}</span>
                <span className="hidden sm:inline">{t.label}</span>
                {t.key === 'security' && d.security.stats.failures_24h > 0 && (
                  <span className="ml-1.5 rounded-full bg-red-500/15 px-1.5 text-[11px] font-semibold tabular-nums text-red-600">{d.security.stats.failures_24h}</span>
                )}
                {tab === t.key && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary" />}
              </button>
            ))}
          </div>

          <div className="space-y-5 p-5">
            {tab === 'summary' && (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <UsageCard label="Leads" item={d.usage.leads} />
                  <UsageCard label="Mensagens no período" item={d.usage.messages} />
                  <UsageCard label="Mensagens em massa" item={d.usage.mass_messages} />
                  <UsageCard label="Respostas da IA (30 dias)" extra={formatNumber(d.usage.ai_replies.last_30d)} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatNumber(d.usage.conversations)} conversas · {formatNumber(d.usage.received_30d)} mensagens recebidas em 30 dias ·{' '}
                  {formatNumber(d.usage.campaigns.total)} campanhas ({formatNumber(d.usage.campaigns.active)} em curso)
                </p>

                <div className="flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-3">
                  <label htmlFor="admin-whatsapp-qr" className="text-sm font-medium text-foreground">WhatsApp por código QR</label>
                  <Switch id="admin-whatsapp-qr" checked={d.user.allow_whatsapp_qr} disabled={savingQr} onCheckedChange={toggleQr} />
                </div>

                <Section title="Canais" aside={d.deleted_channels > 0 ? `${d.deleted_channels} apagados` : undefined}>
                  {d.channels.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum canal ligado</p>
                  ) : (
                    <ul className={listClass}>
                      {d.channels.map((c) => {
                        const brand = brandForChannel(c.type);
                        const on = c.status === 'active' || c.status === 'connected';
                        return (
                          <li key={c.id} className={rowClass}>
                            <LogoBox brand={brand || undefined} icon={brand ? undefined : Globe} className="h-9 w-9" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm text-foreground" translate="no">{c.name}</p>
                              {c.number && <p className="truncate text-xs text-muted-foreground" translate="no">{c.number}</p>}
                            </div>
                            <span className={cn('flex-shrink-0 text-xs', on ? 'text-emerald-600' : 'text-muted-foreground')}>
                              {CHANNEL_STATUS[c.status] || c.status}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Section>

                <div className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
                  <KeyRound className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <p className="min-w-0 flex-1 text-sm text-foreground">Tokens de API</p>
                  <span className="text-xs text-muted-foreground">
                    {d.api_tokens.active === 0 ? 'Nenhum' : `${formatNumber(d.api_tokens.active)} ativos`}
                    {d.api_tokens.last_used_at && ` · usado ${formatRelativeDay(d.api_tokens.last_used_at, 'time')}`}
                  </span>
                </div>
              </>
            )}

            {tab === 'assistants' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <UsageCard label="Respostas da IA (30 dias)" extra={formatNumber(d.usage.ai_replies.last_30d)} />
                  <UsageCard label="Respostas da IA (total)" extra={formatNumber(d.usage.ai_replies.total)} />
                </div>
                {d.assistants.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum assistente</p>
                ) : (
                  <ul className={listClass}>
                    {d.assistants.map((a) => (
                      <li key={a.id} className="space-y-1.5 px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-muted"><Bot className="h-4 w-4 text-muted-foreground" /></span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground" translate="no">{a.name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {a.channels.length > 0 ? <span translate="no">{a.channels.join(', ')}</span> : 'Sem canal'}
                              {a.is_custom && ' · personalizado'}
                            </p>
                          </div>
                          <span className={cn('flex-shrink-0 text-xs', a.is_active && a.channels.length > 0 ? 'text-emerald-600' : 'text-muted-foreground')}>
                            {!a.is_active ? 'Desativado' : a.channels.length === 0 ? 'Sem canal' : 'Ativo'}
                          </span>
                        </div>
                        <p className="pl-12 text-xs text-muted-foreground">
                          {formatNumber(a.replies_30d)} respostas em 30 dias · {formatNumber(a.replies_total)} no total
                          {a.errors_30d > 0 && <span className="text-red-500"> · {formatNumber(a.errors_30d)} erros</span>}
                          {a.last_reply_at && ` · última ${formatRelativeDay(a.last_reply_at, 'time')}`}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {tab === 'security' && (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <UsageCard label="Falhas (24 horas)" extra={<span className={d.security.stats.failures_24h > 0 ? 'text-red-500' : ''}>{formatNumber(d.security.stats.failures_24h)}</span>} />
                  <UsageCard label="Falhas (7 dias)" extra={formatNumber(d.security.stats.failures_7d)} />
                  <UsageCard label="Entradas (30 dias)" extra={formatNumber(d.security.stats.logins_30d)} />
                  <UsageCard label="IPs · países (30 dias)" extra={`${formatNumber(d.security.stats.ips_30d)} · ${formatNumber(d.security.stats.countries_30d)}`} />
                </div>
                {d.security.last_login && (
                  <div className="rounded-xl border border-border px-4 py-3 text-sm">
                    <p className="text-xs text-muted-foreground">Última entrada</p>
                    <p className="mt-0.5 text-foreground">
                      {dateTime(d.security.last_login.created_at)}
                      <span className="text-muted-foreground"> · <span translate="no">{d.security.last_login.ip || '—'}</span>
                        {d.security.last_login.country && ` · ${countryName(d.security.last_login.country)}`}
                        {deviceLabel(d.security.last_login.user_agent) && ` · ${deviceLabel(d.security.last_login.user_agent)}`}</span>
                    </p>
                  </div>
                )}
                <Section title="Entradas e tentativas">
                  {d.security.events.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Ainda sem registos</p>
                  ) : (
                    <ul className={listClass}>
                      {d.security.events.map((e, i) => (
                        <li key={i} className={rowClass}>
                          <span className={cn('h-2 w-2 flex-shrink-0 rounded-full', BAD_EVENTS.has(e.type) ? 'bg-red-500' : 'bg-emerald-500')} />
                          <div className="min-w-0 flex-1">
                            <p className={cn('truncate text-sm', BAD_EVENTS.has(e.type) ? 'text-red-600 dark:text-red-400' : 'text-foreground')}>{EVENT_LABELS[e.type] || e.type}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              <span translate="no">{e.ip || '—'}</span>
                              {e.country && ` · ${countryName(e.country)}`}
                              {deviceLabel(e.user_agent) && ` · ${deviceLabel(e.user_agent)}`}
                            </p>
                          </div>
                          <span className="flex-shrink-0 text-xs text-muted-foreground">{formatRelativeDay(e.created_at, 'time')}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              </>
            )}

            {tab === 'activity' && (
              <>
                <Section title="Áreas mais usadas" aside="7 dias">
                  {d.activity.features.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem atividade nos últimos 7 dias</p>
                  ) : (
                    <ul className="space-y-2">
                      {d.activity.features.map((f) => {
                        const max = d.activity.features[0]?.n || 1;
                        return (
                          <li key={f.feature} className="flex items-center gap-3">
                            <span className="w-32 flex-shrink-0 truncate text-sm text-foreground">{FEATURE_LABELS[f.feature] || f.feature}</span>
                            <span className="h-2 min-w-0 flex-1 rounded-full bg-muted">
                              <span className="block h-2 rounded-full bg-primary" style={{ width: `${Math.max(4, Math.round((f.n / max) * 100))}%` }} />
                            </span>
                            <span className="w-10 flex-shrink-0 text-right text-xs tabular-nums text-muted-foreground">{formatNumber(f.n)}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Section>
                <Section title="Ações">
                  {d.activity.recent.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem ações registadas</p>
                  ) : (
                    <ul className={listClass}>
                      {d.activity.recent.map((a, i) => (
                        <li key={i} className={rowClass}>
                          <p className="min-w-0 flex-1 truncate text-sm text-foreground" translate="no">{a.description}</p>
                          <span className="flex-shrink-0 text-xs text-muted-foreground">{formatRelativeDay(a.created_at, 'time')}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
                <Section title="Últimos acessos">
                  {d.activity.presence.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem acessos registados</p>
                  ) : (
                    <ul className={listClass}>
                      {d.activity.presence.map((p, i) => (
                        <li key={i} className={rowClass}>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm text-foreground">{p.description}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              <span translate="no">{p.ip || '—'}</span>{p.country && ` · ${countryName(p.country)}`}
                            </p>
                          </div>
                          <span className="flex-shrink-0 text-xs text-muted-foreground">{formatRelativeDay(p.created_at, 'time')}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              </>
            )}

            {tab === 'message' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ['email', 'Email', Mail],
                    ['whatsapp', 'WhatsApp', MessageSquare],
                  ] as const).map(([key, label, Icon]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setVia(key)}
                      className={cn('flex h-10 items-center justify-center gap-2 rounded-lg border text-sm transition-colors', via === key ? 'border-foreground/25 bg-muted font-medium text-foreground' : 'border-border text-muted-foreground hover:text-foreground')}
                    >
                      <Icon className="h-4 w-4" />{label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  {TEMPLATE_OPTIONS.map((t) => (
                    <button key={t.key} type="button" onClick={() => applyTemplate(t.key)} className="h-8 rounded-full border border-border px-3 text-xs text-muted-foreground hover:text-foreground">
                      {t.label}
                    </button>
                  ))}
                </div>

                {via === 'email' ? (
                  <>
                    <p className="text-xs text-muted-foreground">Para <span translate="no">{d.user.email}</span></p>
                    <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Assunto" aria-label="Assunto" />
                  </>
                ) : d.send_from.length === 0 ? (
                  <p className="rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground">
                    Ligue um WhatsApp na sua conta de administrador para enviar mensagens aos utilizadores.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="min-w-0 space-y-1.5">
                      <label htmlFor="admin-msg-from" className="flex items-center gap-1.5 text-xs text-muted-foreground"><Smartphone className="h-3.5 w-3.5" />Enviar de</label>
                      <select id="admin-msg-from" value={fromChannel} onChange={(e) => setFromChannel(e.target.value)} className="w-full text-sm">
                        {d.send_from.map((c) => <option key={c.id} value={c.id}>{c.name}{c.number ? ` · ${c.number}` : ''}</option>)}
                      </select>
                    </div>
                    <div className="min-w-0 space-y-1.5">
                      <label htmlFor="admin-msg-to" className="text-xs text-muted-foreground">Número do utilizador</label>
                      <Input id="admin-msg-to" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="258840000000" />
                    </div>
                  </div>
                )}

                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={7}
                  placeholder="Mensagem ({{name}} é trocado pelo primeiro nome)"
                  aria-label="Mensagem"
                  className="w-full resize-y text-sm"
                />

                <div className="flex justify-end">
                  <Button onClick={send} disabled={sending || (via === 'whatsapp' && d.send_from.length === 0)} className="w-full sm:w-auto">
                    {sending ? 'A enviar…' : via === 'email' ? 'Enviar email' : 'Enviar WhatsApp'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </AppModal>
  );
}
