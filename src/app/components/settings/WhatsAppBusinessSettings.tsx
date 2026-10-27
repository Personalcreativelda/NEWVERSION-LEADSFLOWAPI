import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { MessageCircle, Plus, RefreshCw } from 'lucide-react';
import { AppModal } from '../base/AppModal';
import { EmptyState } from '../base/EmptyState';
import { ChoiceList } from '../base/ChoiceList';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { useConfirm } from '../ui/ConfirmDialog';
import { cn } from '../ui/utils';
import { matchesSearch } from '../../utils/search';
import {
  whatsappBusinessApi as waApi,
  type NewTemplate,
  type WaChannel,
  type WaOverview,
  type WaPhoneNumber,
  type WaProfile,
  type WaTemplate,
} from '../../services/api/whatsapp-business';

/**
 * Definições → WhatsApp Business: a conta oficial (Cloud API) ligada a um canal
 * whatsapp_cloud — números (verificar, ativar, escolher o do canal), perfil da empresa e
 * modelos de mensagem (ver estado, criar, apagar). API: /api/whatsapp-business.
 */

type Tab = 'account' | 'profile' | 'templates';

const TEMPLATE_STATUS: Record<string, { label: string; className: string }> = {
  APPROVED: { label: 'Aprovado', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  PENDING: { label: 'Em análise', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  REJECTED: { label: 'Rejeitado', className: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  PAUSED: { label: 'Pausado', className: 'bg-muted text-muted-foreground' },
  DISABLED: { label: 'Desativado', className: 'bg-muted text-muted-foreground' },
};
const CATEGORY_LABEL: Record<string, string> = { MARKETING: 'Marketing', UTILITY: 'Utilidade', AUTHENTICATION: 'Autenticação' };
const LANGUAGES: { value: string; label: string }[] = [
  { value: 'pt_PT', label: 'Português (Portugal)' },
  { value: 'pt_BR', label: 'Português (Brasil)' },
  { value: 'en_US', label: 'Inglês (EUA)' },
  { value: 'en_GB', label: 'Inglês (Reino Unido)' },
  { value: 'es', label: 'Espanhol' },
  { value: 'fr', label: 'Francês' },
];
const QUALITY: Record<string, string> = { GREEN: 'Alta', YELLOW: 'Média', RED: 'Baixa' };
const LIMIT: Record<string, string> = {
  TIER_50: '50 conversas/dia',
  TIER_250: '250 conversas/dia',
  TIER_1K: '1 000 conversas/dia',
  TIER_10K: '10 000 conversas/dia',
  TIER_100K: '100 000 conversas/dia',
  TIER_UNLIMITED: 'Sem limite',
};
const VERTICALS: { value: string; label: string }[] = [
  { value: 'UNDEFINED', label: 'Sem categoria' },
  { value: 'PROF_SERVICES', label: 'Serviços profissionais' },
  { value: 'RETAIL', label: 'Comércio' },
  { value: 'APPAREL', label: 'Moda e vestuário' },
  { value: 'BEAUTY', label: 'Beleza e bem-estar' },
  { value: 'EDU', label: 'Educação' },
  { value: 'ENTERTAIN', label: 'Entretenimento' },
  { value: 'EVENT_PLAN', label: 'Eventos' },
  { value: 'FINANCE', label: 'Finanças' },
  { value: 'GROCERY', label: 'Mercearia' },
  { value: 'HEALTH', label: 'Saúde' },
  { value: 'HOTEL', label: 'Alojamento' },
  { value: 'RESTAURANT', label: 'Restauração' },
  { value: 'TRAVEL', label: 'Viagens' },
  { value: 'AUTO', label: 'Automóvel' },
  { value: 'NONPROFIT', label: 'Sem fins lucrativos' },
  { value: 'GOVT', label: 'Serviços públicos' },
  { value: 'OTHER', label: 'Outra' },
];

function Chip({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={cn('inline-flex flex-shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium', className)}>{children}</span>;
}

/** Estado de um número, em palavras do utilizador */
function numberState(n: WaPhoneNumber): { label: string; className: string; next: 'verify' | 'register' | null } {
  if (n.platform === 'CLOUD_API') return { label: 'Ativo', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', next: null };
  if (n.verification === 'VERIFIED') return { label: 'Por ativar', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', next: 'register' };
  return { label: 'Por verificar', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', next: 'verify' };
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : 'Não foi possível concluir.');

export default function WhatsAppBusinessSettings({ onOpenChannels }: { onOpenChannels?: () => void }) {
  const [channels, setChannels] = useState<WaChannel[] | null>(null);
  const [channelId, setChannelId] = useState('');
  const [tab, setTab] = useState<Tab>('account');

  useEffect(() => {
    waApi.channels()
      .then((list) => {
        setChannels(list);
        setChannelId((current) => current || list.find((c) => c.status === 'active')?.id || list[0]?.id || '');
      })
      .catch((error) => { setChannels([]); toast.error(errorText(error)); });
  }, []);

  if (channels === null) return <p className="py-10 text-center text-sm text-muted-foreground">A carregar…</p>;

  if (channels.length === 0) {
    return (
      <EmptyState
        icon={MessageCircle}
        title="Ainda não tem um WhatsApp Business ligado"
        description="Ligue o número da sua empresa para gerir aqui a conta e os modelos de mensagem."
        action={onOpenChannels ? <Button onClick={onOpenChannels}>Ligar WhatsApp Business</Button> : undefined}
      />
    );
  }

  return (
    <div className="space-y-5">
      {channels.length > 1 && (
        <select value={channelId} onChange={(e) => setChannelId(e.target.value)} className="w-full px-3 text-sm" aria-label="Canal">
          {channels.map((c) => <option key={c.id} value={c.id}>{c.phone ? `${c.name} · ${c.phone}` : c.name}</option>)}
        </select>
      )}

      {/* Separadores sublinhados, como no resto do app */}
      <div className="flex gap-5 border-b border-border">
        {([['account', 'Conta e números'], ['profile', 'Perfil'], ['templates', 'Modelos']] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              '-mb-px h-10 border-b-2 text-sm font-medium transition-colors',
              tab === id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {channelId && tab === 'account' && <AccountTab key={channelId} channelId={channelId} />}
      {channelId && tab === 'profile' && <ProfileTab key={channelId} channelId={channelId} />}
      {channelId && tab === 'templates' && <TemplatesTab key={channelId} channelId={channelId} />}
    </div>
  );
}

// ── Conta e números ───────────────────────────────────────────────────────────

function AccountTab({ channelId }: { channelId: string }) {
  const [data, setData] = useState<WaOverview | null>(null);
  const [error, setError] = useState('');
  const [action, setAction] = useState<{ number: WaPhoneNumber; kind: 'verify' | 'register' } | null>(null);

  const load = useCallback(() => {
    setError('');
    waApi.overview(channelId).then(setData).catch((e) => setError(errorText(e)));
  }, [channelId]);
  useEffect(load, [load]);

  const useNumber = async (number: WaPhoneNumber) => {
    try {
      await waApi.useNumber(channelId, number.id);
      toast.success(`O canal passou a usar ${number.display_phone_number}`);
      load();
    } catch (e) { toast.error(errorText(e)); }
  };

  if (error) return <ErrorRetry message={error} onRetry={load} />;
  if (!data) return <p className="py-10 text-center text-sm text-muted-foreground">A carregar…</p>;

  const verified = data.account.business_verification === 'verified';
  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conta</h3>
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          <InfoRow label="Nome" value={data.account.name} />
          <InfoRow
            label="Empresa"
            value={<Chip className={verified ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}>{verified ? 'Verificada' : 'Por verificar'}</Chip>}
          />
          <InfoRow
            label="Estado da conta"
            value={data.account.review_status === 'APPROVED' ? 'Aprovada' : data.account.review_status === 'REJECTED' ? 'Rejeitada' : 'Em análise'}
          />
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between px-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Números</h3>
          <Button variant="ghost" size="icon" onClick={load} aria-label="Atualizar"><RefreshCw className="h-4 w-4" /></Button>
        </div>
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {data.phone_numbers.map((n) => {
            const state = numberState(n);
            return (
              <li key={n.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base text-foreground tabular-nums">{n.display_phone_number}</span>
                    <Chip className={state.className}>{state.label}</Chip>
                    {n.in_use && <Chip className="bg-primary/10 text-primary">Neste canal</Chip>}
                  </div>
                  {/* Cada parte no seu próprio elemento: o tradutor do ecrã troca texto a texto */}
                  <p className="truncate text-sm text-muted-foreground">
                    {[
                      n.verified_name ? <span translate="no">{n.verified_name}</span> : null,
                      n.quality_rating && QUALITY[n.quality_rating] ? <><span>Qualidade</span> <span>{QUALITY[n.quality_rating].toLowerCase()}</span></> : null,
                      n.messaging_limit && LIMIT[n.messaging_limit] ? <span>{LIMIT[n.messaging_limit]}</span> : null,
                    ].filter(Boolean).map((part, i) => <Fragment key={i}>{i > 0 && ' · '}{part}</Fragment>)}
                  </p>
                </div>
                {state.next === 'verify' && <Button size="sm" variant="outline" onClick={() => setAction({ number: n, kind: 'verify' })}>Verificar</Button>}
                {state.next === 'register' && <Button size="sm" variant="outline" onClick={() => setAction({ number: n, kind: 'register' })}>Ativar</Button>}
                {!state.next && !n.in_use && <Button size="sm" variant="outline" onClick={() => void useNumber(n)}>Usar neste canal</Button>}
              </li>
            );
          })}
          {data.phone_numbers.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">Esta conta ainda não tem números.</li>}
        </ul>
      </section>

      {action && (
        <NumberSetupModal
          channelId={channelId}
          number={action.number}
          startAt={action.kind}
          onClose={() => setAction(null)}
          onDone={() => { setAction(null); load(); }}
        />
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-h-[52px] items-center justify-between gap-3 px-4 py-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right text-foreground">{value}</span>
    </div>
  );
}

function ErrorRetry({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-8 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" className="mt-4" onClick={onRetry}>Tentar de novo</Button>
    </div>
  );
}

/** Verificar o número (código por SMS/chamada) e ativá-lo na Cloud API (PIN) */
function NumberSetupModal({ channelId, number, startAt, onClose, onDone }: {
  channelId: string;
  number: WaPhoneNumber;
  startAt: 'verify' | 'register';
  onClose: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState<'request' | 'code' | 'pin'>(startAt === 'verify' ? 'request' : 'pin');
  const [method, setMethod] = useState<'SMS' | 'VOICE'>('SMS');
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>, next?: () => void) => {
    setBusy(true);
    try { await fn(); next?.(); } catch (e) { toast.error(errorText(e)); } finally { setBusy(false); }
  };

  const footer = step === 'request' ? (
    <>
      <Button variant="outline" onClick={onClose}>Cancelar</Button>
      <Button disabled={busy} onClick={() => void run(() => waApi.requestCode(channelId, number.id, method), () => setStep('code'))}>
        {busy ? 'A enviar…' : 'Enviar código'}
      </Button>
    </>
  ) : step === 'code' ? (
    <>
      <Button variant="outline" onClick={() => setStep('request')}>Voltar</Button>
      <Button disabled={busy || code.length !== 6} onClick={() => void run(() => waApi.verifyCode(channelId, number.id, code), () => setStep('pin'))}>
        {busy ? 'A confirmar…' : 'Confirmar'}
      </Button>
    </>
  ) : (
    <>
      <Button variant="outline" onClick={onClose}>Cancelar</Button>
      <Button disabled={busy || pin.length !== 6} onClick={() => void run(() => waApi.register(channelId, number.id, pin), () => { toast.success('Número ativo'); onDone(); })}>
        {busy ? 'A ativar…' : 'Ativar número'}
      </Button>
    </>
  );

  return (
    <AppModal
      open
      onOpenChange={(open) => { if (!open && !busy) onClose(); }}
      size="sm"
      title={step === 'pin' ? 'Ativar número' : 'Verificar número'}
      description={number.display_phone_number}
      footer={footer}
    >
      {step === 'request' && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Como quer receber o código de 6 dígitos?</p>
          <ChoiceList
            value={method}
            onChange={setMethod}
            options={[{ value: 'SMS', label: 'Por SMS' }, { value: 'VOICE', label: 'Por chamada' }]}
          />
        </div>
      )}
      {step === 'code' && (
        <div className="space-y-2">
          <label htmlFor="wa-code" className="text-sm font-medium">Código recebido</label>
          <Input id="wa-code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" />
        </div>
      )}
      {step === 'pin' && (
        <div className="space-y-2">
          <label htmlFor="wa-pin" className="text-sm font-medium">PIN de 6 dígitos</label>
          <Input id="wa-pin" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="000000" />
          <p className="text-sm text-muted-foreground">É o PIN da verificação em dois passos do número. Se ainda não tem um, escolha agora.</p>
        </div>
      )}
    </AppModal>
  );
}

// ── Perfil da empresa ────────────────────────────────────────────────────────

function ProfileTab({ channelId }: { channelId: string }) {
  const [profile, setProfile] = useState<WaProfile | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setError('');
    waApi.profile(channelId).then((p) => setProfile({ ...p, websites: p.websites || [] })).catch((e) => setError(errorText(e)));
  }, [channelId]);
  useEffect(load, [load]);

  if (error) return <ErrorRetry message={error} onRetry={load} />;
  if (!profile) return <p className="py-10 text-center text-sm text-muted-foreground">A carregar…</p>;

  const set = (patch: Partial<WaProfile>) => setProfile((p) => ({ ...p!, ...patch }));
  const websites = [...(profile.websites || []), '', ''].slice(0, 2);

  const save = async () => {
    setSaving(true);
    try {
      const saved = await waApi.updateProfile(channelId, {
        about: profile.about || '',
        description: profile.description || '',
        address: profile.address || '',
        email: profile.email || '',
        websites: (profile.websites || []).filter(Boolean),
        vertical: profile.vertical || 'UNDEFINED',
      });
      setProfile({ ...saved, websites: saved.websites || [] });
      toast.success('Perfil guardado');
    } catch (e) { toast.error(errorText(e)); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      {profile.profile_picture_url && (
        <img src={profile.profile_picture_url} alt="" className="h-16 w-16 rounded-full border border-border object-cover" />
      )}
      <Field label="Sobre" hint={`${(profile.about || '').length}/139`}>
        <Input maxLength={139} value={profile.about || ''} onChange={(e) => set({ about: e.target.value })} />
      </Field>
      <Field label="Descrição" hint={`${(profile.description || '').length}/512`}>
        <Textarea maxLength={512} rows={4} value={profile.description || ''} onChange={(e) => set({ description: e.target.value })} />
      </Field>
      <Field label="Categoria">
        <select value={profile.vertical || 'UNDEFINED'} onChange={(e) => set({ vertical: e.target.value })} className="w-full px-3 text-sm">
          {VERTICALS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
        </select>
      </Field>
      <Field label="Morada">
        <Input value={profile.address || ''} onChange={(e) => set({ address: e.target.value })} />
      </Field>
      <Field label="Email">
        <Input type="email" value={profile.email || ''} onChange={(e) => set({ email: e.target.value })} />
      </Field>
      <Field label="Sites">
        <div className="space-y-2">
          {websites.map((site, i) => (
            <Input
              key={i}
              type="url"
              placeholder="https://"
              value={site}
              onChange={(e) => { const next = [...websites]; next[i] = e.target.value; set({ websites: next }); }}
            />
          ))}
        </div>
      </Field>
      <div className="flex justify-end">
        <Button onClick={() => void save()} disabled={saving}>{saving ? 'A guardar…' : 'Guardar'}</Button>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {hint && <span className="text-xs text-muted-foreground tabular-nums">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

// ── Modelos de mensagem ──────────────────────────────────────────────────────

function TemplatesTab({ channelId }: { channelId: string }) {
  const confirm = useConfirm();
  const [templates, setTemplates] = useState<WaTemplate[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'APPROVED' | 'PENDING' | 'REJECTED'>('all');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<WaTemplate | null>(null);

  const load = useCallback(() => {
    setError('');
    waApi.templates(channelId).then(setTemplates).catch((e) => setError(errorText(e)));
  }, [channelId]);
  useEffect(load, [load]);

  const shown = useMemo(
    () => (templates || []).filter((t) => (filter === 'all' || t.status === filter) && (!search || matchesSearch(`${t.name} ${bodyOf(t)}`, search))),
    [templates, filter, search],
  );
  const count = (status: string) => (templates || []).filter((t) => t.status === status).length;

  const remove = async (template: WaTemplate) => {
    const ok = await confirm(`Apagar o modelo "${template.name}" (${template.language})? As campanhas que o usam deixam de o poder enviar.`, {
      title: 'Apagar modelo',
      variant: 'danger',
      confirmLabel: 'Apagar',
    });
    if (!ok) return;
    try {
      await waApi.deleteTemplate(channelId, template.name, template.id);
      setViewing(null);
      setTemplates((list) => (list || []).filter((t) => t.id !== template.id));
      toast.success('Modelo apagado');
    } catch (e) { toast.error(errorText(e)); }
  };

  if (error) return <ErrorRetry message={error} onRetry={load} />;
  if (!templates) return <p className="py-10 text-center text-sm text-muted-foreground">A carregar…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input placeholder="Pesquisar modelos" value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1" />
        <Button variant="ghost" size="icon" onClick={load} aria-label="Atualizar"><RefreshCw className="h-4 w-4" /></Button>
        <Button onClick={() => setCreating(true)}>Novo modelo</Button>
      </div>

      <div className="scrollbar-none flex gap-1.5 overflow-x-auto">
        {([['all', `Todos ${templates.length}`], ['APPROVED', `Aprovados ${count('APPROVED')}`], ['PENDING', `Em análise ${count('PENDING')}`], ['REJECTED', `Rejeitados ${count('REJECTED')}`]] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={cn('h-8 whitespace-nowrap rounded-full border px-3 text-sm transition-colors', filter === id ? 'border-foreground/25 bg-muted text-foreground' : 'border-border text-muted-foreground hover:text-foreground')}
          >
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={Plus}
          title={templates.length ? 'Nenhum modelo com este filtro' : 'Ainda não tem modelos'}
          description={templates.length ? undefined : 'Os modelos aprovados pela Meta servem para iniciar conversas fora das 24 horas.'}
          action={templates.length ? undefined : <Button onClick={() => setCreating(true)}>Criar modelo</Button>}
        />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {shown.map((t) => {
            const status = TEMPLATE_STATUS[t.status] || { label: t.status, className: 'bg-muted text-muted-foreground' };
            return (
              <li key={t.id}>
                <button type="button" onClick={() => setViewing(t)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-sm text-foreground">{t.name}</p>
                    <p className="truncate text-sm text-muted-foreground">{bodyOf(t)}</p>
                    <p className="text-xs text-muted-foreground">{CATEGORY_LABEL[t.category] || t.category} · {t.language}</p>
                  </div>
                  <Chip className={status.className}>{status.label}</Chip>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {creating && (
        <NewTemplateModal
          channelId={channelId}
          onClose={() => setCreating(false)}
          onCreated={(t) => { setCreating(false); setTemplates((list) => [t, ...(list || [])]); setFilter('all'); }}
        />
      )}
      {viewing && <TemplateModal template={viewing} onClose={() => setViewing(null)} onDelete={() => void remove(viewing)} />}
    </div>
  );
}

function bodyOf(t: WaTemplate) {
  return t.components.find((c) => c.type === 'BODY')?.text || '';
}

/** Pré-visualização em forma de mensagem do WhatsApp */
function TemplatePreview({ header, body, footer, buttons }: { header?: string; body: string; footer?: string; buttons?: { text: string }[] }) {
  return (
    <div className="rounded-xl bg-[#e7ddd3] p-3 dark:bg-[#0b141a]">
      <div className="max-w-[90%] rounded-lg rounded-tl-none bg-white px-3 py-2 text-[14px] leading-snug text-[#111b21] shadow-sm dark:bg-[#202c33] dark:text-[#e9edef]">
        {header && <p className="mb-1 font-semibold">{header}</p>}
        <p className="whitespace-pre-wrap break-words">{body || 'O texto da mensagem aparece aqui.'}</p>
        {footer && <p className="mt-1 text-xs text-[#667781] dark:text-[#8696a0]">{footer}</p>}
      </div>
      {buttons?.filter((b) => b.text).map((b, i) => (
        <div key={i} className="mt-1 max-w-[90%] rounded-lg bg-white py-2 text-center text-[14px] text-[#027eb5] shadow-sm dark:bg-[#202c33] dark:text-[#53bdeb]">{b.text}</div>
      ))}
    </div>
  );
}

function TemplateModal({ template, onClose, onDelete }: { template: WaTemplate; onClose: () => void; onDelete: () => void }) {
  const header = template.components.find((c) => c.type === 'HEADER');
  const footer = template.components.find((c) => c.type === 'FOOTER');
  const buttons = template.components.find((c) => c.type === 'BUTTONS')?.buttons || [];
  const status = TEMPLATE_STATUS[template.status] || { label: template.status, className: 'bg-muted text-muted-foreground' };
  return (
    <AppModal
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      size="sm"
      title={<span className="font-mono">{template.name}</span>}
      description={`${CATEGORY_LABEL[template.category] || template.category} · ${template.language}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          <Button variant="destructive" onClick={onDelete}>Apagar</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Chip className={status.className}>{status.label}</Chip>
          {template.quality && QUALITY[template.quality] && <Chip className="bg-muted text-muted-foreground">Qualidade {QUALITY[template.quality].toLowerCase()}</Chip>}
        </div>
        {template.rejected_reason && <p className="text-sm text-red-600 dark:text-red-400">Motivo da rejeição: {template.rejected_reason}</p>}
        <TemplatePreview
          header={header?.format === 'TEXT' || !header?.format ? header?.text : `[${header?.format?.toLowerCase()}]`}
          body={bodyOf(template)}
          footer={footer?.text}
          buttons={buttons}
        />
      </div>
    </AppModal>
  );
}

function NewTemplateModal({ channelId, onClose, onCreated }: { channelId: string; onClose: () => void; onCreated: (t: WaTemplate) => void }) {
  const [form, setForm] = useState<NewTemplate>({ name: '', category: 'UTILITY', language: 'pt_PT', header: '', body: '', footer: '', examples: [], buttons: [] });
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<NewTemplate>) => setForm((f) => ({ ...f, ...patch }));

  // Variáveis {{1}}, {{2}}… usadas no texto: cada uma pede um exemplo
  const variables = useMemo(() => [...new Set([...form.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])))].sort((a, b) => a - b), [form.body]);
  const addVariable = () => set({ body: `${form.body}{{${(variables[variables.length - 1] || 0) + 1}}}` });
  const buttons = form.buttons || [];
  const setButton = (i: number, patch: Partial<NonNullable<NewTemplate['buttons']>[number]>) =>
    set({ buttons: buttons.map((b, j) => (j === i ? { ...b, ...patch } : b)) });

  const submit = async () => {
    setSaving(true);
    try {
      const created = await waApi.createTemplate(channelId, form);
      toast.success('Modelo enviado para aprovação da Meta');
      onCreated({
        ...created,
        components: [
          ...(form.header ? [{ type: 'HEADER' as const, format: 'TEXT', text: form.header }] : []),
          { type: 'BODY' as const, text: form.body },
          ...(form.footer ? [{ type: 'FOOTER' as const, text: form.footer }] : []),
          ...(buttons.length ? [{ type: 'BUTTONS' as const, buttons: buttons.map((b) => ({ type: b.type, text: b.text })) }] : []),
        ],
        rejected_reason: null,
        quality: null,
      });
    } catch (e) { toast.error(errorText(e)); } finally { setSaving(false); }
  };

  return (
    <AppModal
      open
      onOpenChange={(open) => { if (!open && !saving) onClose(); }}
      size="lg"
      title="Novo modelo"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={() => void submit()} disabled={saving || !form.name.trim() || !form.body.trim()}>
            {saving ? 'A enviar…' : 'Enviar para aprovação'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Nome" hint="minúsculas, números e _">
          <Input
            value={form.name}
            onChange={(e) => set({ name: e.target.value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '') })}
            placeholder="confirmacao_pedido"
            className="font-mono"
          />
        </Field>

        <div className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Categoria</span>
          <ChoiceList
            value={form.category}
            onChange={(category) => set({ category })}
            options={[
              { value: 'UTILITY', label: 'Utilidade', meta: 'pedidos, marcações, avisos' },
              { value: 'MARKETING', label: 'Marketing', meta: 'promoções, novidades' },
              { value: 'AUTHENTICATION', label: 'Autenticação', meta: 'códigos de acesso' },
            ]}
          />
        </div>

        <Field label="Idioma">
          <select value={form.language} onChange={(e) => set({ language: e.target.value })} className="w-full px-3 text-sm">
            {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </Field>

        <Field label="Título (opcional)" hint={`${(form.header || '').length}/60`}>
          <Input maxLength={60} value={form.header} onChange={(e) => set({ header: e.target.value })} />
        </Field>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-foreground">Mensagem</span>
            <button type="button" onClick={addVariable} className="text-sm font-medium text-primary">Inserir variável</button>
          </div>
          <Textarea
            rows={5}
            maxLength={1024}
            value={form.body}
            onChange={(e) => set({ body: e.target.value })}
            placeholder={'Olá {{1}}, o seu pedido {{2}} já está pronto.'}
          />
        </div>

        {variables.length > 0 && (
          <div className="space-y-2">
            <span className="text-sm font-medium text-foreground">Exemplos das variáveis</span>
            {variables.map((n, i) => (
              <div key={n} className="flex items-center gap-2">
                <code className="w-12 flex-shrink-0 text-sm text-muted-foreground">{`{{${n}}}`}</code>
                <Input
                  value={form.examples?.[i] || ''}
                  onChange={(e) => { const ex = [...(form.examples || [])]; ex[i] = e.target.value; set({ examples: ex }); }}
                  placeholder={i === 0 ? 'Ana' : 'Exemplo'}
                />
              </div>
            ))}
          </div>
        )}

        <Field label="Rodapé (opcional)" hint={`${(form.footer || '').length}/60`}>
          <Input maxLength={60} value={form.footer} onChange={(e) => set({ footer: e.target.value })} />
        </Field>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-foreground">Botões (opcional)</span>
            {buttons.length < 3 && (
              <button type="button" onClick={() => set({ buttons: [...buttons, { type: 'QUICK_REPLY', text: '' }] })} className="text-sm font-medium text-primary">
                Adicionar botão
              </button>
            )}
          </div>
          {buttons.map((b, i) => (
            <div key={i} className="space-y-2 rounded-xl border border-border p-3">
              <div className="flex flex-wrap gap-2">
                <select value={b.type} onChange={(e) => setButton(i, { type: e.target.value as typeof b.type })} className="w-full px-3 text-sm sm:w-40 sm:flex-shrink-0">
                  <option value="QUICK_REPLY">Resposta rápida</option>
                  <option value="URL">Abrir link</option>
                  <option value="PHONE_NUMBER">Ligar</option>
                </select>
                <Input maxLength={25} value={b.text} onChange={(e) => setButton(i, { text: e.target.value })} placeholder="Texto do botão" className="min-w-0 flex-1" />
                <Button variant="ghost" size="icon" aria-label="Remover botão" onClick={() => set({ buttons: buttons.filter((_, j) => j !== i) })}>×</Button>
              </div>
              {b.type === 'URL' && <Input type="url" value={b.url || ''} onChange={(e) => setButton(i, { url: e.target.value })} placeholder="https://" />}
              {b.type === 'PHONE_NUMBER' && <Input type="tel" value={b.phone || ''} onChange={(e) => setButton(i, { phone: e.target.value })} placeholder="+258 84 000 0000" />}
            </div>
          ))}
        </div>

        <div className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Pré-visualização</span>
          {/* Com os exemplos no lugar das variáveis, como o cliente vai ver */}
          <TemplatePreview
            header={form.header}
            body={form.body.replace(/\{\{(\d+)\}\}/g, (m, n) => form.examples?.[variables.indexOf(Number(n))] || m)}
            footer={form.footer}
            buttons={buttons}
          />
        </div>
      </div>
    </AppModal>
  );
}
