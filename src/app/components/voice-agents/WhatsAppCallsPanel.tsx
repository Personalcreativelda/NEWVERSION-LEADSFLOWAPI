// Chamadas do WhatsApp Business atendidas por um agente de voz.
// Só aparece quando o servidor tem a funcionalidade ligada (available) e há números WhatsApp Business.
import { useCallback, useEffect, useState } from 'react';
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

export function WhatsAppCallsPanel({ refreshKey }: { refreshKey?: number }) {
  const [state, setState] = useState<WhatsAppCallsState | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [openCall, setOpenCall] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setState(await voiceAgentsApi.getWhatsAppCalls());
    } catch {
      setState(null); // rota indisponível: a secção não aparece
    }
  }, []);

  useEffect(() => { void load(); }, [load, refreshKey]);

  if (!state?.available || state.channels.length === 0) return null;
  const readyAgents = state.agents.filter((a) => a.ready);

  const save = async (channelId: string, enabled: boolean, voiceAgentId: string | null) => {
    if (enabled && !voiceAgentId) {
      toast.error('Escolha o agente');
      return;
    }
    setSaving(channelId);
    try {
      await voiceAgentsApi.setWhatsAppCalls(channelId, { enabled, voice_agent_id: voiceAgentId });
      toast.success(enabled ? 'Chamadas ativadas' : 'Chamadas desativadas');
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Não foi possível guardar');
    } finally {
      setSaving(null);
    }
  };

  return (
    <section className="px-3 pb-8 sm:px-6 lg:px-10">
      <h2 className="mb-3 text-base font-semibold text-foreground">Chamadas do WhatsApp</h2>

      <div className="divide-y divide-border rounded-lg border border-border bg-card">
        {state.channels.map((ch) => (
          <div key={ch.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{ch.name}</p>
              {ch.phone && <p className="text-xs text-muted-foreground" translate="no">{ch.phone}</p>}
            </div>
            <select
              value={ch.voice_agent_id || ''}
              disabled={saving === ch.id || readyAgents.length === 0}
              onChange={(e) => void save(ch.id, ch.enabled, e.target.value || null)}
              className="sm:w-56"
              aria-label="Agente"
            >
              <option value="">{readyAgents.length ? 'Escolher agente' : 'Sem agentes prontos'}</option>
              {readyAgents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Switch
                checked={ch.enabled}
                disabled={saving === ch.id}
                onCheckedChange={(v) => void save(ch.id, v, ch.voice_agent_id)}
              />
              Atender
            </label>
          </div>
        ))}
      </div>

      {state.calls.length > 0 && (
        <div className="mt-4 divide-y divide-border rounded-lg border border-border bg-card">
          {state.calls.map((c) => (
            <div key={c.id} className="p-4">
              <button
                type="button"
                onClick={() => setOpenCall(openCall === c.id ? null : c.id)}
                className="flex w-full items-center gap-3 text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground" translate="no">
                    {c.caller_name || c.phone_number}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(c.started_at || '').toLocaleString()} · {c.agent_name || '—'}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">{STATUS[c.status] || c.status}</span>
                <span className="w-12 text-right text-sm tabular-nums text-foreground">{fmtDuration(c.duration_seconds)}</span>
              </button>
              {openCall === c.id && c.transcript && (
                <p className="mt-3 whitespace-pre-wrap rounded-md bg-muted p-3 text-sm text-foreground" translate="no">
                  {c.transcript}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
