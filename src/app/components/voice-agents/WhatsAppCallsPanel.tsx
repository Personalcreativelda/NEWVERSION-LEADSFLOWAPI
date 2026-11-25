// Números WhatsApp Business (que agente atende) e histórico das chamadas atendidas.
import { useState } from 'react';
import { toast } from 'sonner';
import { Switch } from '../ui/switch';
import { voiceAgentsApi, type WhatsAppCallsState } from '../../services/api/voice-agents';

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
};

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
                {c.started_at ? new Date(c.started_at).toLocaleString() : ''} · {c.agent_name || '—'}
              </p>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">{STATUS[c.status] || c.status}</span>
            <span className="w-12 shrink-0 text-right text-sm tabular-nums text-foreground">{fmtDuration(c.duration_seconds)}</span>
          </button>
          {open === c.id && (
            <p className="mt-3 whitespace-pre-wrap rounded-md bg-muted p-3 text-sm text-foreground" translate="no">
              {c.transcript || 'Sem transcrição.'}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
