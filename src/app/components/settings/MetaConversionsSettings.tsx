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

const EVENT_LABELS: Record<string, string> = {
  Lead: 'Lead',
  QualifiedLead: 'Lead qualificado',
  Purchase: 'Compra',
};

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
  const [totals, setTotals] = useState<{ sent: number; via_ad: number; failed: number } | null>(null);
  const stages = funnelStages();

  const loadEvents = useCallback(() => {
    api.metaConversions.events().then((r) => { setEvents(r.events || []); setTotals(r.totals || null); }).catch(() => {});
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

      <div className="grid gap-4 sm:grid-cols-2">
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

      <details className="rounded-xl border border-border px-4 py-3">
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
        <Button variant="outline" onClick={test} disabled={testing || saving || !config.has_token}>
          {testing ? 'A testar…' : 'Testar ligação'}
        </Button>
        <Button onClick={() => save()} disabled={saving}>
          {saving ? 'A guardar…' : 'Guardar'}
        </Button>
      </div>

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
          {events.length > 0 && (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {events.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className={cn('h-2 w-2 flex-shrink-0 rounded-full', e.status === 'sent' ? 'bg-emerald-500' : e.status === 'failed' ? 'bg-red-500' : 'bg-amber-500')} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">
                      <span translate="no">{e.lead_name}</span> · {EVENT_LABELS[e.event_name] || e.event_name}
                      {e.via_ad && <span className="text-muted-foreground"> · anúncio</span>}
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
