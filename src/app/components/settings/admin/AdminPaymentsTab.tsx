import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Check, Copy, CreditCard } from 'lucide-react';
import { Switch } from '../../ui/switch';
import { Input } from '../../ui/input';
import { Button } from '../../ui/button';
import { FormField } from '../../base/FormField';
import { EmptyState } from '../../base/EmptyState';
import { AppModal } from '../../base/AppModal';
import { useConfirm } from '../../ui/ConfirmDialog';
import { apiRequest, apiUpload } from '../../../utils/api';
import { getApiBaseUrl } from '../../../utils/api-client';
import { formatMoney, formatDateTime } from '../../../utils/format';
import { MobileMoneyLogo } from '../../payments/MobileMoneyLogo';
import { MOBILE_METHOD_LABEL, type MobileMethod } from '../../../utils/mobileMoney';

/**
 * Admin → Pagamentos: M-Pesa / e-Mola no checkout dos planos.
 * Pagamentos a confirmar, dados do comerciante, preços em MT e reencaminhamento das SMS
 * (SMS Forwarder). API: /api/payments/mobile/admin/* (services/mobile-payments.service.ts).
 */
interface MethodCfg {
  id: MobileMethod;
  label: string;
  enabled: boolean;
  merchantCode: string;
  merchantName: string;
  ussd: string;
  logoUrl: string;
}
interface Config {
  methods: MethodCfg[];
  planPrices: Record<string, { monthly?: number | null; annual?: number | null }>;
  smsEnabled: boolean;
  smsSecret: string | null;
}
interface PaymentRow {
  id: string;
  plan_id: string;
  billing_cycle: 'monthly' | 'annual';
  method: MobileMethod;
  amount: string | number;
  transaction_id: string;
  status: 'pending' | 'paid' | 'rejected';
  rejected_reason: string | null;
  confirmed_by: string | null;
  created_at: string;
  user_name: string | null;
  user_email: string;
  sms_amount: string | number | null;
}
interface SmsRow {
  id: number;
  transaction_id: string;
  amount: string | number | null;
  received_at: string;
  payment_id: string | null;
}
interface PlanInfo { id: string; name: string }

type Filter = 'pending' | 'paid' | 'rejected';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'pending', label: 'A confirmar' },
  { id: 'paid', label: 'Pagos' },
  { id: 'rejected', label: 'Rejeitados' },
];

const sectionTitle ='mb-2 px-1 text-xs font-medium text-muted-foreground';
const priceStr = (v: number | null | undefined) => (v ? String(v) : '');

function CopyField({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <Input readOnly value={value} aria-label={label} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
      <button
        type="button"
        aria-label={`Copiar ${label.toLowerCase()}`}
        onClick={async () => {
          try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1800); } catch { /* sem área de transferência */ }
        }}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-muted"
      >
        {done ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}

export const AdminPaymentsTab: React.FC = () => {
  const confirm = useConfirm();
  const [config, setConfig] = useState<Config | null>(null);
  const [saved, setSaved] = useState<string>('');
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [sms, setSms] = useState<SmsRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<Filter>('pending');
  const [payments, setPayments] = useState<PaymentRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<PaymentRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [uploading, setUploading] = useState<MobileMethod | null>(null);
  const fileRefs = useRef<Partial<Record<MobileMethod, HTMLInputElement | null>>>({});

  const loadConfig = useCallback(async () => {
    try {
      const [cfg, pl] = await Promise.all([
        apiRequest('/payments/mobile/admin/config', 'GET'),
        apiRequest('/plans', 'GET'),
      ]);
      if (cfg?.success) {
        setConfig(cfg.config);
        setSaved(JSON.stringify(cfg.config));
        setSms(cfg.sms || []);
      }
      setPlans((pl?.plans || []).filter((p: any) => p.id !== 'free').map((p: any) => ({ id: p.id, name: p.name })));
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível carregar os pagamentos');
    }
  }, []);

  const loadPayments = useCallback(async (f: Filter) => {
    setPayments(null);
    try {
      const res = await apiRequest(`/payments/mobile/admin/payments?status=${f}`, 'GET');
      setPayments(res?.payments || []);
    } catch {
      setPayments([]);
    }
  }, []);

  useEffect(() => { void loadConfig(); }, [loadConfig]);
  useEffect(() => { void loadPayments(filter); }, [filter, loadPayments]);

  const dirty = !!config && JSON.stringify(config) !== saved;

  const updateMethod = (id: MobileMethod, patch: Partial<MethodCfg>) =>
    setConfig((c) => c && { ...c, methods: c.methods.map((m) => (m.id === id ? { ...m, ...patch } : m)) });

  const updatePrice = (planId: string, cycle: 'monthly' | 'annual', value: string) =>
    setConfig((c) => {
      if (!c) return c;
      const n = value.trim() === '' ? null : Number(value.replace(',', '.'));
      return { ...c, planPrices: { ...c.planPrices, [planId]: { ...c.planPrices[planId], [cycle]: Number.isFinite(n as number) ? n : null } } };
    });

  const save = async (next: Config = config!) => {
    const missing = next.methods.find((m) => m.enabled && !m.merchantCode);
    if (missing) {
      toast.error(`Falta o código do comerciante ${missing.label}`);
      return false;
    }
    setSaving(true);
    try {
      const res = await apiRequest('/payments/mobile/admin/config', 'PUT', next);
      setConfig(res.config);
      setSaved(JSON.stringify(res.config));
      toast.success('Guardado');
      return true;
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível guardar');
      return false;
    } finally {
      setSaving(false);
    }
  };

  // O interruptor das SMS guarda logo (cria o endereço na primeira vez)
  const toggleSms = async (on: boolean) => {
    if (!config) return;
    await save({ ...config, smsEnabled: on });
  };

  const newSmsAddress = async () => {
    const ok = await confirm('O endereço atual deixa de funcionar. Terá de colar o novo na app do telemóvel.', {
      title: 'Gerar novo endereço',
      confirmLabel: 'Gerar',
    });
    if (!ok) return;
    try {
      const res = await apiRequest('/payments/mobile/admin/sms-secret', 'POST');
      setConfig((c) => c && { ...c, smsSecret: res.config.smsSecret });
      setSaved((s) => { try { return JSON.stringify({ ...JSON.parse(s), smsSecret: res.config.smsSecret }); } catch { return s; } });
      toast.success('Novo endereço criado');
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível gerar o endereço');
    }
  };

  // O logótipo guarda logo (não precisa de "Guardar"); o resto do formulário fica como estava
  const applyLogo = (method: MobileMethod, logoUrl: string) => {
    setConfig((c) => c && { ...c, methods: c.methods.map((m) => (m.id === method ? { ...m, logoUrl } : m)) });
    setSaved((s) => {
      try {
        const o = JSON.parse(s);
        o.methods = o.methods.map((m: MethodCfg) => (m.id === method ? { ...m, logoUrl } : m));
        return JSON.stringify(o);
      } catch { return s; }
    });
  };

  const uploadLogo = async (method: MobileMethod, file?: File) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      toast.error('Use uma imagem PNG, JPG ou WebP');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('A imagem tem de ter até 2 MB');
      return;
    }
    setUploading(method);
    try {
      const form = new FormData();
      form.append('logo', file);
      const res = await apiUpload(`/payments/mobile/admin/logo/${method}`, form);
      const url = res?.config?.methods?.find((m: MethodCfg) => m.id === method)?.logoUrl || '';
      applyLogo(method, url);
      toast.success('Logótipo guardado');
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível carregar o logótipo');
    } finally {
      setUploading(null);
    }
  };

  const removeLogo = async (method: MobileMethod) => {
    setUploading(method);
    try {
      await apiRequest(`/payments/mobile/admin/logo/${method}`, 'DELETE');
      applyLogo(method, '');
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível remover o logótipo');
    } finally {
      setUploading(null);
    }
  };

  const confirmPayment = async (p: PaymentRow) => {
    const ok = await confirm(`Ativar o plano ${p.plan_id} de ${p.user_name || p.user_email}?`, {
      title: 'Confirmar pagamento',
      detail: `${MOBILE_METHOD_LABEL[p.method]} · ${formatMoney(p.amount, 'MZN')} · ${p.transaction_id}`,
      confirmLabel: 'Confirmar',
    });
    if (!ok) return;
    setBusyId(p.id);
    try {
      await apiRequest(`/payments/mobile/admin/payments/${p.id}/confirm`, 'POST');
      toast.success('Pagamento confirmado e plano ativo');
      void loadPayments(filter);
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível confirmar');
    } finally {
      setBusyId(null);
    }
  };

  const rejectPayment = async () => {
    if (!rejecting) return;
    setBusyId(rejecting.id);
    try {
      await apiRequest(`/payments/mobile/admin/payments/${rejecting.id}/reject`, 'POST', { reason: rejectReason.trim() || null });
      toast.success('Pagamento rejeitado');
      setRejecting(null);
      setRejectReason('');
      void loadPayments(filter);
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível rejeitar');
    } finally {
      setBusyId(null);
    }
  };

  const smsUrl = config?.smsSecret ? `${getApiBaseUrl()}/api/payments/mobile/sms/${config.smsSecret}` : '';

  return (
    <div className="max-w-2xl space-y-8">
      {/* ── Pagamentos ─────────────────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex gap-1 rounded-xl bg-muted p-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`h-9 flex-1 rounded-lg text-sm font-medium transition-colors ${filter === f.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {payments === null ? (
          <div className="h-24 animate-pulse rounded-xl border border-border bg-card" />
        ) : payments.length === 0 ? (
          <EmptyState icon={CreditCard} title={filter === 'pending' ? 'Nenhum pagamento a confirmar' : 'Sem pagamentos'} />
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {payments.map((p) => (
              <div key={p.id} className="space-y-3 px-4 py-3">
                <div className="flex items-start gap-3">
                  <MobileMoneyLogo method={p.method} logoUrl={config?.methods.find((m) => m.id === p.method)?.logoUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{p.user_name || p.user_email}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {p.plan_id} · {p.billing_cycle === 'annual' ? 'anual' : 'mensal'} · {formatMoney(p.amount, 'MZN')}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      <span className="font-mono" translate="no">{p.transaction_id}</span> · {formatDateTime(p.created_at)}
                    </p>
                    {p.status === 'pending' && p.sms_amount != null && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">SMS recebida: {formatMoney(p.sms_amount, 'MZN')}</p>
                    )}
                    {p.status === 'paid' && (
                      <p className="text-xs text-muted-foreground">{p.confirmed_by === 'auto:sms' ? 'Confirmado pela SMS' : 'Confirmado à mão'}</p>
                    )}
                    {p.status === 'rejected' && p.rejected_reason && (
                      <p className="text-xs text-muted-foreground">{p.rejected_reason}</p>
                    )}
                  </div>
                </div>
                {p.status === 'pending' && (
                  <div className="flex gap-2 [&>*]:flex-1 sm:[&>*]:flex-none sm:justify-end">
                    <Button variant="outline" disabled={busyId === p.id} onClick={() => { setRejecting(p); setRejectReason(''); }}>Rejeitar</Button>
                    <Button disabled={busyId === p.id} onClick={() => void confirmPayment(p)}>Confirmar</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {config && (
        <>
          {/* ── Métodos ──────────────────────────────────────────────────── */}
          <section>
            <h3 className={sectionTitle}>Métodos</h3>
            <div className="space-y-3">
              {config.methods.map((m) => (
                <div key={m.id} className="space-y-4 rounded-xl border border-border bg-card p-4">
                  <label className="flex cursor-pointer items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-3">
                      <MobileMoneyLogo method={m.id} logoUrl={m.logoUrl} />
                      <span className="min-w-0">
                        <span className="block font-medium text-foreground" translate="no">{m.label}</span>
                        <span className="block text-xs text-muted-foreground">{m.enabled ? 'Ativo' : 'Desativado'}</span>
                      </span>
                    </span>
                    <Switch checked={m.enabled} onCheckedChange={(v) => updateMethod(m.id, { enabled: v })} />
                  </label>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <FormField label="Código do comerciante" htmlFor={`mc-${m.id}`}>
                      <Input
                        id={`mc-${m.id}`}
                        inputMode="numeric"
                        value={m.merchantCode}
                        onChange={(e) => {
                          const code = e.target.value.replace(/\s+/g, '');
                          // Ao escrever o código pela primeira vez o método fica ativo
                          updateMethod(m.id, !m.merchantCode && code && !m.enabled ? { merchantCode: code, enabled: true } : { merchantCode: code });
                        }}
                      />
                    </FormField>
                    <FormField label="Nome" htmlFor={`mn-${m.id}`}>
                      <Input id={`mn-${m.id}`} value={m.merchantName} onChange={(e) => updateMethod(m.id, { merchantName: e.target.value })} />
                    </FormField>
                    <FormField label="USSD" htmlFor={`mu-${m.id}`}>
                      <Input id={`mu-${m.id}`} value={m.ussd} onChange={(e) => updateMethod(m.id, { ussd: e.target.value.trim() })} />
                    </FormField>
                  </div>
                  <div className="flex gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
                    <input
                      ref={(el) => { fileRefs.current[m.id] = el; }}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => { void uploadLogo(m.id, e.target.files?.[0]); e.target.value = ''; }}
                    />
                    <Button variant="outline" disabled={uploading === m.id} onClick={() => fileRefs.current[m.id]?.click()}>
                      {uploading === m.id ? 'A carregar…' : m.logoUrl ? 'Trocar logótipo' : 'Carregar logótipo'}
                    </Button>
                    {m.logoUrl && (
                      <Button variant="outline" disabled={uploading === m.id} onClick={() => void removeLogo(m.id)}>
                        Remover logótipo
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── Preços em MT ─────────────────────────────────────────────── */}
          <section>
            <h3 className={sectionTitle}>Preços em MT</h3>
            <div className="divide-y divide-border rounded-xl border border-border bg-card">
              {plans.map((pl) => (
                <div key={pl.id} className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-[1fr_10rem_10rem] sm:items-end">
                  <p className="col-span-2 font-medium text-foreground sm:col-span-1 sm:pb-2.5">{pl.name}</p>
                  <FormField label="Mensal" htmlFor={`pm-${pl.id}`}>
                    <Input id={`pm-${pl.id}`} inputMode="decimal" value={priceStr(config.planPrices[pl.id]?.monthly)} onChange={(e) => updatePrice(pl.id, 'monthly', e.target.value)} />
                  </FormField>
                  <FormField label="Anual" htmlFor={`pa-${pl.id}`}>
                    <Input id={`pa-${pl.id}`} inputMode="decimal" value={priceStr(config.planPrices[pl.id]?.annual)} onChange={(e) => updatePrice(pl.id, 'annual', e.target.value)} />
                  </FormField>
                </div>
              ))}
            </div>
          </section>

          <div className="flex justify-end">
            <Button className="w-full sm:w-auto" onClick={() => void save()} disabled={saving || !dirty}>
              {saving ? 'A guardar…' : 'Guardar'}
            </Button>
          </div>

          {/* ── SMS Forwarder ────────────────────────────────────────────── */}
          <section>
            <h3 className={sectionTitle}>SMS Forwarder</h3>
            <div className="space-y-4 rounded-xl border border-border bg-card p-4">
              <label className="flex cursor-pointer items-center justify-between gap-4">
                <span className="text-sm text-foreground">Confirmar pelas SMS</span>
                <Switch checked={config.smsEnabled} disabled={saving} onCheckedChange={(v) => void toggleSms(v)} />
              </label>
              {config.smsEnabled && smsUrl && (
                <>
                  <FormField label="Endereço" htmlFor="sms-url">
                    <CopyField value={smsUrl} label="Endereço" />
                  </FormField>
                  <details className="text-sm text-muted-foreground">
                    <summary className="cursor-pointer select-none text-foreground">Configurar no telemóvel</summary>
                    <ol className="mt-2 list-decimal space-y-1.5 pl-5">
                      <li>No telemóvel que recebe as SMS do M-Pesa e do e-Mola, instale o SMS Forwarder.</li>
                      <li>Crie uma regra para os remetentes <span className="font-mono" translate="no">M-Pesa</span> e <span className="font-mono" translate="no">e-Mola</span>.</li>
                      <li>Envio por webhook (GET ou POST) para o endereço acima, com <span className="font-mono" translate="no">?text={'{msg}'}&amp;from={'{from}'}</span> ou JSON <span className="font-mono" translate="no">{'{"text": "...", "from": "..."}'}</span>.</li>
                      <li>Quando a SMS e o código enviado pelo cliente coincidem, o plano fica ativo sozinho.</li>
                    </ol>
                  </details>
                  <div className="flex justify-end">
                    <Button variant="outline" className="w-full sm:w-auto" onClick={() => void newSmsAddress()}>Gerar novo endereço</Button>
                  </div>
                  {sms.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-muted-foreground">Últimas SMS</p>
                      <ul className="divide-y divide-border rounded-lg border border-border text-sm">
                        {sms.map((s) => (
                          <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                            <span className="min-w-0 truncate font-mono text-xs" translate="no">{s.transaction_id}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {s.amount != null ? formatMoney(s.amount, 'MZN') : '—'} · {s.payment_id ? 'Associada' : 'Sem pedido'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        </>
      )}

      <AppModal
        open={!!rejecting}
        onOpenChange={(open) => { if (!open && !busyId) setRejecting(null); }}
        size="sm"
        title="Rejeitar pagamento"
        footer={(
          <>
            <Button variant="outline" onClick={() => setRejecting(null)} disabled={!!busyId}>Cancelar</Button>
            <Button variant="destructive" onClick={() => void rejectPayment()} disabled={!!busyId}>Rejeitar</Button>
          </>
        )}
      >
        <FormField label="Motivo" htmlFor="reject-reason">
          <Input
            id="reject-reason"
            placeholder="Pagamento não encontrado"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
        </FormField>
      </AppModal>
    </div>
  );
};

export default AdminPaymentsTab;
