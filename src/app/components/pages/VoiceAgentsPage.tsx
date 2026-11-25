// Agentes de voz: atendem as chamadas do WhatsApp Business.
// O cliente só cria o agente (nome, instruções, primeira frase, voz) e escolhe que número ele atende;
// chaves e contas do ElevenLabs ficam do lado da plataforma (api/src/routes/whatsapp-calls.routes.ts).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Pencil, PhoneCall, Play, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '../base/PageHeader';
import { EmptyState } from '../base/EmptyState';
import { AppModal } from '../base/AppModal';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { useConfirm } from '../ui/ConfirmDialog';
import { SkeletonVoiceAgentGrid } from '../ui/skeletons';
import { CallHistory, WhatsAppNumbers } from '../voice-agents/WhatsAppCallsPanel';
import {
  voiceAgentsApi, type CallAgent, type CallAgentInput, type CallVoice, type WhatsAppCallsState,
} from '../../services/api/voice-agents';

interface VoiceAgentsPageProps {
  isDark?: boolean;
}

const LANGUAGES = [
  { value: 'pt', label: 'Português' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
];

const EMPTY: CallAgentInput = { name: '', instructions: '', greeting: '', voice_id: '', language: 'pt' };

export default function VoiceAgentsPage(_props: VoiceAgentsPageProps) {
  const confirm = useConfirm();
  const [state, setState] = useState<WhatsAppCallsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [voices, setVoices] = useState<CallVoice[]>([]);
  const [editing, setEditing] = useState<CallAgent | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CallAgentInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const load = useCallback(async () => {
    try {
      setState(await voiceAgentsApi.getWhatsAppCalls());
    } catch {
      setState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const loadVoices = async () => {
    if (voices.length) return;
    try {
      setVoices(await voiceAgentsApi.getCallVoices());
    } catch {
      toast.error('Não foi possível carregar as vozes');
    }
  };

  const limit = state?.limit ?? 0;
  const atLimit = limit !== -1 && (state?.agents.length ?? 0) >= limit;

  const openCreate = () => {
    if (atLimit) {
      toast.error(limit === 0 ? 'O seu plano não inclui agentes de voz' : 'Chegou ao limite de agentes do seu plano');
      return;
    }
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
    void loadVoices();
  };

  const openEdit = (agent: CallAgent) => {
    setEditing(agent);
    setForm({ name: agent.name, instructions: agent.instructions, greeting: agent.greeting, voice_id: agent.voice_id, language: agent.language || 'pt' });
    setOpen(true);
    void loadVoices();
  };

  const stopPreview = () => {
    audioRef.current?.pause();
    setPlaying(null);
  };

  const preview = (voice: CallVoice | undefined) => {
    if (!voice?.preview_url) return;
    if (playing === voice.voice_id) return stopPreview();
    audioRef.current?.pause();
    const audio = new Audio(voice.preview_url);
    audio.onended = () => setPlaying(null);
    audioRef.current = audio;
    setPlaying(voice.voice_id);
    audio.play().catch(() => setPlaying(null));
  };

  const save = async () => {
    setSaving(true);
    try {
      await voiceAgentsApi.saveCallAgent(editing?.id || null, form);
      toast.success(editing ? 'Agente guardado' : 'Agente criado');
      stopPreview();
      setOpen(false);
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Não foi possível guardar');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (agent: CallAgent) => {
    const ok = await confirm(`O agente "${agent.name}" deixa de atender as chamadas.`, {
      title: 'Apagar agente',
      confirmLabel: 'Apagar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await voiceAgentsApi.deleteCallAgent(agent.id);
      toast.success('Agente apagado');
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Não foi possível apagar');
    }
  };

  const voiceName = (id: string) => voices.find((v) => v.voice_id === id)?.name;
  const usedOn = (agentId: string) => state?.channels.filter((c) => c.voice_agent_id === agentId && c.enabled) || [];
  const selectedVoice = voices.find((v) => v.voice_id === form.voice_id);
  const canSave = form.name.trim() && form.instructions.trim() && form.greeting.trim() && form.voice_id;

  return (
    <div className="w-full h-full overflow-y-auto">
      <div className="px-3 pt-4 sm:px-6 sm:pt-6 lg:px-10 lg:pt-8">
        <PageHeader
          title="Agentes de voz"
          description="Atendem as chamadas do WhatsApp"
          icon={PhoneCall}
          create={state?.available ? { label: 'Criar agente', onClick: openCreate } : undefined}
        />
      </div>

      <div className="space-y-8 px-3 py-6 sm:px-6 lg:px-10">
        {loading ? (
          <SkeletonVoiceAgentGrid count={3} />
        ) : !state?.available ? (
          <EmptyState icon={PhoneCall} title="Disponível em breve" description="Os agentes de voz ainda não estão ativos." />
        ) : (
          <>
            <section>
              <h2 className="mb-3 text-base font-semibold text-foreground">Agentes</h2>
              {state.agents.length === 0 ? (
                <EmptyState
                  icon={PhoneCall}
                  title="Ainda sem agentes"
                  description={limit === 0 ? 'O seu plano não inclui agentes de voz.' : 'Crie um agente para atender as chamadas.'}
                  action={limit === 0 ? undefined : <Button onClick={openCreate}>Criar agente</Button>}
                />
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {state.agents.map((agent) => {
                    const numbers = usedOn(agent.id);
                    return (
                      <div key={agent.id} className="flex flex-col rounded-lg border border-border bg-card p-4">
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate font-semibold text-foreground">{agent.name}</h3>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {numbers.length
                                ? `Atende ${numbers.map((n) => n.phone || n.name).join(', ')}`
                                : agent.ready ? 'Sem número' : 'Por concluir'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => openEdit(agent)}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-label="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void remove(agent)}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-red-600"
                            aria-label="Apagar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        {agent.greeting && (
                          <p className="mt-3 line-clamp-2 text-sm text-muted-foreground" translate="no">“{agent.greeting}”</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section>
              <h2 className="mb-3 text-base font-semibold text-foreground">Números</h2>
              <WhatsAppNumbers state={state} onChanged={() => void load()} />
            </section>

            <section>
              <h2 className="mb-3 text-base font-semibold text-foreground">Chamadas</h2>
              <CallHistory calls={state.calls} />
            </section>
          </>
        )}
      </div>

      <AppModal
        open={open}
        onOpenChange={(v) => { if (!saving) { if (!v) stopPreview(); setOpen(v); } }}
        size="md"
        title={editing ? 'Editar agente' : 'Novo agente'}
        footer={(
          <>
            <Button variant="outline" onClick={() => { stopPreview(); setOpen(false); }} disabled={saving}>Cancelar</Button>
            <Button onClick={save} disabled={saving || !canSave}>{saving ? 'A guardar…' : 'Guardar'}</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="va-name" className="mb-1.5 block">Nome</Label>
            <Input id="va-name" value={form.name} maxLength={100} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Receção" />
          </div>

          <div>
            <Label htmlFor="va-greeting" className="mb-1.5 block">Primeira frase</Label>
            <Input
              id="va-greeting"
              value={form.greeting}
              maxLength={500}
              onChange={(e) => setForm({ ...form, greeting: e.target.value })}
              placeholder="Olá, em que posso ajudar?"
            />
          </div>

          <div>
            <Label htmlFor="va-instructions" className="mb-1.5 block">Instruções</Label>
            <Textarea
              id="va-instructions"
              value={form.instructions}
              maxLength={8000}
              rows={7}
              onChange={(e) => setForm({ ...form, instructions: e.target.value })}
              placeholder="Quem é, o que vende, horários, preços e o que deve fazer em cada caso."
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="va-voice" className="mb-1.5 block">Voz</Label>
              <div className="flex gap-2">
                <select
                  id="va-voice"
                  value={form.voice_id}
                  onChange={(e) => { stopPreview(); setForm({ ...form, voice_id: e.target.value }); }}
                  className="min-w-0 flex-1 text-sm"
                >
                  <option value="">{voices.length ? 'Escolher voz' : 'A carregar…'}</option>
                  {form.voice_id && !voiceName(form.voice_id) && voices.length > 0 && <option value={form.voice_id}>Voz atual</option>}
                  {voices.map((v) => (
                    <option key={v.voice_id} value={v.voice_id}>
                      {v.name}{v.gender ? ` · ${v.gender === 'female' ? 'feminina' : v.gender === 'male' ? 'masculina' : v.gender}` : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => preview(selectedVoice)}
                  disabled={!selectedVoice?.preview_url}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border text-foreground hover:bg-muted disabled:opacity-40"
                  aria-label={playing ? 'Parar' : 'Ouvir'}
                >
                  {playing && playing === form.voice_id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <Label htmlFor="va-lang" className="mb-1.5 block">Idioma</Label>
              <select
                id="va-lang"
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value })}
                className="w-full text-sm"
                translate="no"
              >
                {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
          </div>
        </div>
      </AppModal>
    </div>
  );
}
