// Números WhatsApp Business (que agente atende) e histórico das chamadas atendidas.
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { saveFile } from '../../lib/saveFile';
import { voiceAgentsApi, type VoiceUsage, type WhatsAppCallsState } from '../../services/api/voice-agents';

const fmtDuration = (s: number | null) => {
  const n = Number(s) || 0;
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
};

const STATUS: Record<string, string> = {
  ringing: 'A tocar',
  answered: 'Em curso',
  completed: 'Atendida',
  'no-answer': 'Não atendida',
  failed: 'Falhou',
  initiated: 'A ligar',
  rejected: 'Recusada',
};

// Porque é que a chamada recebida foi recusada (voice-usage.service)
const REJECT_REASON: Record<string, string> = {
  NO_MINUTES: 'Sem minutos',
  PLAN: 'Fora do plano',
  CALLER_LIMIT: 'Demasiadas chamadas deste número',
};

/** Minutos de chamadas usados neste período (recebidas + feitas) */
export function VoiceUsageCard({ usage }: { usage: VoiceUsage }) {
  const used = Math.ceil(usage.used_seconds / 60);
  const unlimited = usage.minutes_limit === -1;
  const pct = unlimited ? 0 : Math.min(100, (usage.used_seconds / Math.max(1, usage.minutes_limit * 60)) * 100);
  const out = !unlimited && usage.remaining_seconds < 30;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-foreground">Minutos de chamadas</p>
        <p className="text-sm tabular-nums text-foreground">
          {unlimited ? `${used} min` : `${used} de ${usage.minutes_limit} min`}
        </p>
      </div>
      {!unlimited && (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full ${out ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-primary'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {`Até ${usage.call_max_minutes} min por chamada · recebidas e feitas`}
        </p>
        {out && (
          <Button onClick={() => window.dispatchEvent(new CustomEvent('leadflow:show-upgrade'))}>Melhorar plano</Button>
        )}
      </div>
    </div>
  );
}

export function WhatsAppNumbers({ state, onChanged }: { state: WhatsAppCallsState; onChanged: () => void }) {
  const [saving, setSaving] = useState<string | null>(null);
  const readyAgents = state.agents.filter((a) => a.ready);

  const save = async (channelId: string, enabled: boolean, voiceAgentId: string | null) => {
    if (enabled && !voiceAgentId) {
      toast.error('Escolha o agente');
      return;
    }
    setSaving(channelId);
    try {
      await voiceAgentsApi.setWhatsAppCalls(channelId, { enabled, voice_agent_id: voiceAgentId });
      toast.success(enabled ? 'Chamadas ativadas' : 'Guardado');
      onChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Não foi possível guardar');
    } finally {
      setSaving(null);
    }
  };

  if (state.channels.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        Ligue um número WhatsApp Business na caixa de entrada.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border rounded-lg border border-border bg-card">
      {state.channels.map((ch) => (
        <div key={ch.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{ch.name}</p>
            {ch.phone && <p className="text-xs text-muted-foreground" translate="no">{ch.phone}</p>}
          </div>
          <div className="flex items-center gap-3">
            <select
              value={ch.voice_agent_id || ''}
              disabled={saving === ch.id || readyAgents.length === 0}
              // Trocar de agente mantém o estado; escolher um agente num número desligado não liga sozinho
              onChange={(e) => void save(ch.id, ch.enabled && !!e.target.value, e.target.value || null)}
              className="min-w-0 flex-1 sm:w-56 sm:flex-none"
              aria-label="Agente"
            >
              <option value="">{readyAgents.length ? 'Escolher agente' : 'Crie um agente primeiro'}</option>
              {readyAgents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <label className="flex shrink-0 items-center gap-2 text-sm text-foreground">
              <Switch
                checked={ch.enabled}
                disabled={saving === ch.id || !ch.voice_agent_id}
                onCheckedChange={(v) => void save(ch.id, v, ch.voice_agent_id)}
              />
              Atender
            </label>
          </div>
        </div>
      ))}
    </div>
  );
}

type Call = WhatsAppCallsState['calls'][number];

/** Gravação da chamada: descarrega só quando a pessoa carrega em "Ouvir chamada" */
function CallRecording({ call }: { call: Call }) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [missing, setMissing] = useState(false);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const load = async () => {
    setLoading(true);
    try {
      const b = await voiceAgentsApi.getCallRecording(call.id);
      setBlob(b);
      setUrl(URL.createObjectURL(b));
    } catch (err: any) {
      if (err?.response?.status === 404) setMissing(true);
      else toast.error('Não foi possível carregar a gravação');
    } finally {
      setLoading(false);
    }
  };

  if (!call.has_audio || missing) return <p className="text-xs text-muted-foreground">Sem gravação.</p>;
  if (!url) {
    return (
      <Button variant="outline" onClick={() => void load()} disabled={loading}>
        {loading ? 'A carregar…' : 'Ouvir chamada'}
      </Button>
    );
  }
  const date = call.started_at ? new Date(call.started_at).toISOString().slice(0, 16).replace(/[T:]/g, '-') : call.id;
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <audio controls autoPlay src={url} className="h-10 w-full min-w-0 sm:flex-1" />
      <Button
        variant="outline"
        onClick={() => blob && void saveFile(`chamada-${date}.mp3`, blob, blob.type || 'audio/mpeg')}
      >
        Descarregar
      </Button>
    </div>
  );
}

export function CallHistory({ calls }: { calls: WhatsAppCallsState['calls'] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (calls.length === 0) {
    return <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">Ainda sem chamadas.</p>;
  }
  return (
    <div className="divide-y divide-border rounded-lg border border-border bg-card">
      {calls.map((c) => (
        <div key={c.id} className="p-4">
          <button
            type="button"
            onClick={() => setOpen(open === c.id ? null : c.id)}
            className="flex w-full items-center gap-3 text-left"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground" translate="no">{c.caller_name || c.phone_number}</p>
              <p className="truncate text-xs text-muted-foreground">
                {c.direction === 'outbound' ? 'Feita' : 'Recebida'} · {c.started_at ? new Date(c.started_at).toLocaleString() : ''} · {c.agent_name || '—'}
              </p>
            </div>
            <span className="shrink-0 text-right text-xs text-muted-foreground">
              {STATUS[c.status] || c.status}
              {c.status === 'rejected' && c.reject_reason && REJECT_REASON[c.reject_reason] && (
                <span className="block">{REJECT_REASON[c.reject_reason]}</span>
              )}
            </span>
            <span className="w-12 shrink-0 text-right text-sm tabular-nums text-foreground">{fmtDuration(c.duration_seconds)}</span>
          </button>
          {open === c.id && (
            <div className="mt-3 space-y-3">
              {c.purpose && <p className="text-sm text-muted-foreground" translate="no">Objetivo: {c.purpose}</p>}
              <CallRecording call={c} />
              <p className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm text-foreground" translate="no">
                {c.transcript || 'Sem transcrição.'}
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
