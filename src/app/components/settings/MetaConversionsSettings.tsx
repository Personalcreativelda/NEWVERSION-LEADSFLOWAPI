// Ligação à API de Conversões da Meta: as etapas do funil saem do servidor para os anúncios
// (lead, lead qualificado, compra com o valor). Também mostra os últimos eventos enviados.
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../../lib/api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { formatNumber, formatRelativeDay } from '../../utils/format';
import { cn } from '../ui/utils';

const DEFAULT_STAGES = [
  { id: 'novo', label: 'Novos' },
  { id: 'contatado', label: 'Contatados' },
  { id: 'qualificado', label: 'Qualificados' },
  { id: 'negociacao', label: 'Negociação' },
  { id: 'convertido', label: 'Convertidos' },
  { id: 'perdido', label: 'Perdidos' },
];

// Eventos oficiais da API de Conversões para mensagens (Lead vai como LeadSubmitted)
const EVENT_LABELS: Record<string, string> = {
  Lead: 'Lead',
  QualifiedLead: 'Lead qualificado',
  AddToCart: 'Adicionou ao carrinho',
  InitiateCheckout: 'Iniciou o pagamento',
  OrderCreated: 'Encomenda criada',
  Purchase: 'Compra',
  OrderDelivered: 'Encomenda entregue',
};

const SOURCE_LABELS: Record<string, string> = {
  stage: 'funil', assistant: 'assistente', automation: 'automação', manual: 'teste',
};

const CHECK_LABELS: Record<string, string> = {
  dataset: 'Conjunto de dados',
  token: 'Acesso à Meta',
  'perm:whatsapp_business_management': 'Permissão whatsapp_business_management',
  'perm:whatsapp_business_manage_events': 'Permissão whatsapp_business_manage_events',
  enabled: 'Envio ativo',
  mapping: 'Etapas com evento',
  ads: 'Leads vindos de anúncios (30 dias)',
};

type StatusFilter = '' | 'sent' | 'pending' | 'failed';

const CURRENCIES = ['MZN', 'EUR', 'USD', 'BRL', 'AOA', 'ZAR', 'CVE'];
const COUNTRIES: Array<[string, string]> = [
  ['MZ', 'Moçambique'], ['PT', 'Portugal'], ['BR', 'Brasil'], ['AO', 'Angola'], ['ZA', 'África do Sul'],
  ['CV', 'Cabo Verde'], ['GW', 'Guiné-Bissau'], ['ST', 'São Tomé e Príncipe'], ['TL', 'Timor-Leste'], ['US', 'Estados Unidos'],
];

function funnelStages(): Array<{ id: string; label: string }> {
  try {
    const saved = localStorage.getItem('funnelStages');
    if (saved) return JSON.parse(saved).map((s: any) => ({ id: String(s.id), label: String(s.label) }));
  } catch { /* lista por omissão */ }
  return DEFAULT_STAGES;
}

interface Config {
  enabled: boolean;
  dataset_id: string;
  has_token: boolean;
  test_event_code: string;
  currency: string;
  country: string;
  mapping: Record<string, string>;
  source?: 'manual' | 'whatsapp';
  waba_id?: string;
  assistant_events?: string[];
}

export function MetaConversionsSettings({ initialDatasetId, onConfigured }: {
  initialDatasetId?: string;
  onConfigured?: (configured: boolean) => void;
}) {
  const [config, setConfig] = useState<Config | null>(null);
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [totals, setTotals] = useState<{ sent: number; via_ad: number; failed: number; pending: number } | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('');
  const [connecting, setConnecting] = useState(false);
  const [checks, setChecks] = useState<{ key: string; ok: boolean; detail?: string }[] | null>(null);
  const [checking, setChecking] = useState(false);
  const stages = funnelStages();

  const loadEvents = useCallback((status: StatusFilter = '') => {
    api.metaConversions.events(status || undefined).then((r) => { setEvents(r.events || []); setTotals(r.totals || null); }).catch(() => {});
  }, []);

  useEffect(() => {
    api.metaConversions.config()
      .then((c) => {
        setConfig({ ...c, dataset_id: c.dataset_id || initialDatasetId || '' });
        onConfigured?.(!!c.enabled);
      })
      .catch(() => setConfig({
        enabled: false, dataset_id: initialDatasetId || '', has_token: false, test_event_code: '',
        currency: 'MZN', country: 'MZ', mapping: { novo: 'Lead', qualificado: 'QualifiedLead', convertido: 'Purchase' },
      }));
    loadEvents();
  }, [initialDatasetId, loadEvents, onConfigured]);

  if (!config) {
    return <div className="h-40 rounded-xl skeleton-shimmer" aria-busy="true" />;
  }

  const set = (patch: Partial<Config>) => setConfig({ ...config, ...patch });
  const setStage = (stage: string, event: string) => {
    const mapping = { ...config.mapping };
    if (event) mapping[stage] = event; else delete mapping[stage];
    set({ mapping });
  };

  const connectWhatsApp = async () => {
    setConnecting(true);
    try {
      const saved = await api.metaConversions.auto();
      setConfig({ ...config, ...saved });
      onConfigured?.(!!saved.enabled);
      toast.success('Ligado pelo WhatsApp Business');
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível ligar');
    } finally {
      setConnecting(false);
    }
  };

  const runDiagnose = async () => {
    setChecking(true);
    try {
      setChecks((await api.metaConversions.diagnose()).checks);
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível verificar');
    } finally {
      setChecking(false);
    }
  };

  const toggleAssistantEvent = (event: string, on: boolean) => {
    const list = new Set(config.assistant_events || []);
    if (on) list.add(event); else list.delete(event);
    set({ assistant_events: Array.from(list) });
  };

  const save = async (enabled = config.enabled) => {
    setSaving(true);
    try {
      const saved = await api.metaConversions.save({
        enabled,
        dataset_id: config.dataset_id,
        ...(token.trim() ? { access_token: token.trim() } : {}),
        test_event_code: config.test_event_code,
        currency: config.currency,
        country: config.country,
        mapping: config.mapping,
        assistant_events: config.assistant_events || [],
      });
      setConfig({ ...config, ...saved });
      setToken('');
      onConfigured?.(!!saved.enabled);
      toast.success(saved.enabled ? 'Ligação à Meta ativa' : 'Guardado');
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível guardar');
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const r = await api.metaConversions.test();
      if (!r.test_event) toast.success('Ligação confirmada');
      else if (r.events_received > 0) toast.success(`A Meta recebeu o evento de teste (${r.test_event_code})`);
      else toast.error('A Meta não aceitou o evento de teste');
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível ligar à Meta');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="meta-enabled" className="text-sm font-medium text-foreground">Enviar o funil para a Meta</Label>
        <Switch
          id="meta-enabled"
          checked={config.enabled}
          disabled={saving}
          onCheckedChange={(v) => { set({ enabled: v }); void save(v); }}
        />
      </div>

      <div className="rounded-xl border border-border px-4 py-3">
        {config.source === 'whatsapp' ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Ligado pelo WhatsApp Business</p>
              <p className="truncate text-xs text-muted-foreground" translate="no">Conjunto de dados {config.dataset_id}</p>
            </div>
            <Button variant="outline" onClick={connectWhatsApp} disabled={connecting}>{connecting ? 'A ligar…' : 'Ligar de novo'}</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-foreground">Sem tokens nem píxeis: usa o número WhatsApp Business ligado.</p>
            <Button onClick={connectWhatsApp} disabled={connecting}>{connecting ? 'A ligar…' : 'Ligar pelo WhatsApp Business'}</Button>
          </div>
        )}
      </div>

      <div className={cn('grid gap-4 sm:grid-cols-2', config.source === 'whatsapp' && 'hidden')}>
        <div className="space-y-1.5 min-w-0">
          <Label htmlFor="meta-dataset" className="text-sm text-foreground">ID do conjunto de dados (pixel)</Label>
          <Input
            id="meta-dataset"
            inputMode="numeric"
            value={config.dataset_id}
            onChange={(e) => set({ dataset_id: e.target.value })}
            placeholder="123456789012345"
            className="font-mono"
          />
        </div>
        <div className="space-y-1.5 min-w-0">
          <Label htmlFor="meta-token" className="text-sm text-foreground">Token de acesso</Label>
          <Input
            id="meta-token"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={config.has_token ? 'Guardado' : 'EAA…'}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 min-w-0">
          <Label htmlFor="meta-currency" className="text-sm text-foreground">Moeda</Label>
          <select id="meta-currency" value={config.currency} onChange={(e) => set({ currency: e.target.value })} className="w-full">
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="space-y-1.5 min-w-0">
          <Label htmlFor="meta-country" className="text-sm text-foreground">País dos clientes</Label>
          <select id="meta-country" value={config.country} onChange={(e) => set({ country: e.target.value })} className="w-full">
            {COUNTRIES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Eventos do funil</p>
        <div className="divide-y divide-border rounded-xl border border-border">
          {stages.map((stage) => (
            <div key={stage.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="min-w-0 truncate text-sm text-foreground">{stage.label}</span>
              <select
                value={config.mapping[stage.id] || ''}
                onChange={(e) => setStage(stage.id, e.target.value)}
                aria-label={stage.label}
                className="w-[9.5rem] flex-shrink-0 text-sm sm:w-44"
              >
                <option value="">Nenhum</option>
                {Object.entries(EVENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Eventos que os assistentes podem enviar</p>
        <div className="divide-y divide-border rounded-xl border border-border">
          {Object.entries(EVENT_LABELS).map(([value, label]) => (
            <label key={value} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="text-sm text-foreground">{label}</span>
              <Switch
                checked={(config.assistant_events || []).includes(value)}
                onCheckedChange={(v) => toggleAssistantEvent(value, v)}
                aria-label={label}
              />
            </label>
          ))}
        </div>
      </div>

      <details className={cn('rounded-xl border border-border px-4 py-3', config.source === 'whatsapp' && 'hidden')}>
        <summary className="cursor-pointer select-none text-sm font-medium text-foreground">Como obter o ID e o token</summary>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>No Gestor de Eventos da Meta, abra o seu conjunto de dados (pixel) e copie o ID.</li>
          <li>Em Definições → API de Conversões, carregue em "Gerar token de acesso" e copie-o.</li>
          <li>Para confirmar, copie o código de teste do separador "Testar eventos" para aqui e carregue em "Testar ligação".</li>
          <li>Nos anúncios "Enviar mensagem" do WhatsApp, use este mesmo conjunto de dados para medir as compras.</li>
        </ol>
        <div className="mt-3 space-y-1.5">
          <Label htmlFor="meta-test-code" className="text-sm text-foreground">Código de teste</Label>
          <Input
            id="meta-test-code"
            value={config.test_event_code}
            onChange={(e) => set({ test_event_code: e.target.value })}
            placeholder="TEST12345"
            className="font-mono"
          />
        </div>
      </details>

      <div className="flex gap-2 [&>*]:flex-1 sm:[&>*]:flex-none sm:justify-end">
        <Button variant="outline" onClick={runDiagnose} disabled={checking}>
          {checking ? 'A verificar…' : 'Diagnóstico'}
        </Button>
        <Button variant="outline" onClick={test} disabled={testing || saving || !(config.has_token || config.source === 'whatsapp')}>
          {testing ? 'A testar…' : 'Testar ligação'}
        </Button>
        <Button onClick={() => save()} disabled={saving}>
          {saving ? 'A guardar…' : 'Guardar'}
        </Button>
      </div>

      {checks && (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {checks.map((c) => (
            <li key={c.key} className="flex items-center gap-3 px-4 py-2.5">
              <span className={cn('h-2 w-2 flex-shrink-0 rounded-full', c.ok ? 'bg-emerald-500' : 'bg-red-500')} />
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{CHECK_LABELS[c.key] || c.key}</span>
              <span className="flex-shrink-0 text-xs text-muted-foreground" translate="no">{c.detail || (c.ok ? 'OK' : 'Em falta')}</span>
            </li>
          ))}
        </ul>
      )}

      {(events.length > 0 || totals) && (
        <div className="space-y-2">
          <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
            <p className="text-sm font-medium text-foreground">Eventos enviados</p>
            {totals && (
              <p className="text-xs text-muted-foreground">
                {formatNumber(totals.sent)} em 30 dias · {formatNumber(totals.via_ad)} de anúncios
              </p>
            )}
          </div>
          {totals && (
            <div className="flex flex-wrap gap-1.5">
              {([['', 'Todos'], ['sent', 'Enviados ' + formatNumber(totals.sent)], ['pending', 'Pendentes ' + formatNumber(totals.pending || 0)], ['failed', 'Falhados ' + formatNumber(totals.failed)]] as [StatusFilter, string][]).map(([value, label]) => (
                <button
                  key={value || 'all'}
                  type="button"
                  onClick={() => { setFilter(value); loadEvents(value); }}
                  className={cn('h-9 rounded-full border px-3 text-sm', filter === value
                    ? 'border-foreground/25 bg-muted font-medium text-foreground'
                    : 'border-border text-muted-foreground hover:bg-muted/50')}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {events.length > 0 && (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {events.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className={cn('h-2 w-2 flex-shrink-0 rounded-full', e.status === 'sent' ? 'bg-emerald-500' : e.status === 'failed' ? 'bg-red-500' : 'bg-amber-500')} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">
                      <span translate="no">{e.lead_name}</span> · {EVENT_LABELS[e.event_name] || e.event_name}
                      {e.via_ad && <span className="text-muted-foreground"> · anúncio</span>}
                      {e.source && SOURCE_LABELS[e.source] && <span className="text-muted-foreground"> · {SOURCE_LABELS[e.source]}</span>}
                      {Number(e.value) > 0 && <span className="text-muted-foreground"> · {formatNumber(Number(e.value))} {e.currency || config.currency}</span>}
                    </p>
                    {e.status === 'failed' && e.error && <p className="truncate text-xs text-red-500" translate="no">{e.error}</p>}
                  </div>
                  <span className="flex-shrink-0 text-xs text-muted-foreground">{formatRelativeDay(e.sent_at || e.updated_at, 'time')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
