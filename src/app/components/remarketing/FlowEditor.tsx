// Editor de um fluxo de remarketing: gatilho, passos (mensagens, áudios, ações no painel) e regras.
import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { AppModal } from '../base/AppModal';
import { AppButton } from '../base/AppButton';
import { Switch } from '../ui/switch';
import { inboxApi } from '../../services/api/inbox';
import { whatsappBusinessApi, type WaTemplate } from '../../services/api/whatsapp-business';
import {
  CHANNEL_OPTIONS, CONDITION_OPTIONS, DEFAULT_AUTO_REPLY, MESSAGE_VARIABLES, STEP_GROUPS, STEP_NAMES, TRIGGER_OPTIONS, stepSummary,
  type ActionType, type FlowSettings, type FlowStep, type RemarketingFlow, type TriggerType,
} from './flowTypes';
import { STEP_COLORS, STEP_ICONS } from './flowVisuals';

interface FlowEditorProps {
  flow: RemarketingFlow;
  isNew?: boolean;
  onSave: (updated: RemarketingFlow) => void;
  onClose: () => void;
  funnelStages: { value: string; label: string }[];
}

const labelCls = 'text-sm font-medium text-foreground';
const fieldLabelCls = 'text-xs font-medium text-muted-foreground';

/** Texto com as variáveis por baixo: tocar numa acrescenta-a ao fim */
function MessageField({ value, onChange, placeholder, rows = 3 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <div className="space-y-1.5">
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        translate="no"
        className="w-full resize-y"
      />
      <div className="flex flex-wrap gap-1">
        {MESSAGE_VARIABLES.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => onChange(`${value}${value && !value.endsWith(' ') ? ' ' : ''}${v.key}`)}
            className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Áudio: voz gerada a partir do texto (com o nome do lead) ou gravado por quem usa o painel */
function AudioField({ config, onChange }: { config: Record<string, any>; onChange: (patch: Record<string, any>) => void }) {
  const [mode, setMode] = useState<'voice' | 'recorded'>(config.audio_url ? 'recorded' : 'voice');
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      recorder.stop();
    }
    recorder?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const uploaded = await inboxApi.uploadFile(file);
      onChange({ audio_url: uploaded.url });
    } catch {
      toast.error('Não foi possível guardar o áudio');
    } finally {
      setUploading(false);
    }
  };

  const toggleRecording = async () => {
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = recorder.mimeType.includes('ogg') ? 'audio/ogg' : 'audio/webm';
        void upload(new File(chunks, `voz.${type === 'audio/ogg' ? 'ogg' : 'webm'}`, { type }));
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      toast.error('Sem acesso ao microfone');
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {([['voice', 'Voz gerada'], ['recorded', 'Gravar ou enviar']] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={`h-9 flex-1 rounded-lg border text-sm transition-colors ${mode === value ? 'border-foreground/25 bg-muted font-medium text-foreground' : 'border-border text-muted-foreground hover:bg-muted/50'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'voice' ? (
        <MessageField
          value={config.text ?? ''}
          onChange={(text) => onChange({ text, audio_url: undefined })}
          placeholder="O que a voz vai dizer"
        />
      ) : (
        <div className="space-y-2">
          {config.audio_url ? (
            <audio controls src={config.audio_url} className="h-10 w-full" />
          ) : null}
          <div className="flex gap-2">
            <AppButton type="button" size="sm" variant={recording ? 'destructive' : 'outline'} disabled={uploading} onClick={toggleRecording} className="flex-1">
              {recording ? 'Parar' : config.audio_url ? 'Gravar de novo' : 'Gravar'}
            </AppButton>
            <AppButton type="button" size="sm" variant="outline" disabled={uploading || recording} loading={uploading} onClick={() => fileRef.current?.click()} className="flex-1">
              Enviar ficheiro
            </AppButton>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="audio/mpeg,audio/ogg,audio/wav,audio/webm,audio/mp4,.m4a,.mp3,.ogg,.wav"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = '';
            }}
          />
          <div className="space-y-1">
            <label className={fieldLabelCls}>Texto se o áudio não puder ser enviado</label>
            <textarea
              rows={2}
              value={config.fallback_text ?? ''}
              onChange={(e) => onChange({ fallback_text: e.target.value })}
              translate="no"
              className="w-full resize-y"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function FlowEditor({ flow, isNew = false, onSave, onClose, funnelStages }: FlowEditorProps) {
  const [name, setName] = useState(flow.name);
  const [description, setDescription] = useState(flow.description);
  const [trigger, setTrigger] = useState<TriggerType>(flow.trigger);
  const [steps, setSteps] = useState<FlowStep[]>(flow.steps.map((s) => ({ ...s, config: s.config ?? {} })));
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const [settings, setSettings] = useState<FlowSettings>({
    stop_on_reply: true,
    personalize: true,
    on_reply: { notify: true },
    channel: 'any',
    window_start: 8,
    window_end: 20,
    reentry_days: 30,
    ...flow.settings,
  });
  const [waTemplates, setWaTemplates] = useState<WaTemplate[]>([]);

  const number = flow.triggerLabel.match(/\+\s*(\d+)/)?.[1];
  const [triggerStage, setTriggerStage] = useState<string>(() => {
    if (flow.trigger !== 'funnel_stage') return funnelStages[0]?.value ?? 'novo';
    const raw = flow.triggerLabel.split(' +')[0].trim().toLowerCase();
    return funnelStages.find((s) => s.value === raw || s.label.toLowerCase() === raw)?.value ?? funnelStages[0]?.value ?? 'novo';
  });
  const [triggerDays, setTriggerDays] = useState<string>(number ?? (flow.trigger === 'inactivity' ? '7' : '3'));
  const [triggerHours, setTriggerHours] = useState<string>(flow.trigger === 'conversation_idle' ? (number ?? '2') : '2');
  const [triggerTag, setTriggerTag] = useState<string>(() => flow.triggerLabel.match(/Tag:\s*(.+)/i)?.[1]?.trim() ?? '');
  const [triggerScore, setTriggerScore] = useState<string>(() => (flow.trigger === 'lead_score' ? flow.triggerLabel.match(/(\d+)/)?.[1] : null) ?? '80');

  // Modelos aprovados do WhatsApp Business (quem não tem o canal não vê este campo)
  useEffect(() => {
    let cancelled = false;
    whatsappBusinessApi.channels()
      .then((channels) => {
        const channel = channels.find((c) => c.has_account);
        return channel ? whatsappBusinessApi.templates(channel.id) : [];
      })
      .then((list) => { if (!cancelled) setWaTemplates(list.filter((t) => t.status === 'APPROVED')); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // O funil guarda o valor da etapa ("negociacao +3 dias"): é por ele que o servidor encontra o fluxo
  const computedTriggerLabel = (): string => {
    switch (trigger) {
      case 'funnel_stage': return `${triggerStage} +${triggerDays || '0'} dias`;
      case 'inactivity': return `Inatividade +${triggerDays || '7'} dias`;
      case 'conversation_idle': return `Conversa parada +${triggerHours || '2'} horas`;
      case 'tag': return triggerTag.trim() ? `Tag: ${triggerTag.trim()}` : 'Tag aplicada';
      case 'lead_score': return `Score ≥ ${triggerScore || '80'}`;
      case 'purchase': return 'Compra realizada';
      default: return trigger;
    }
  };

  const handleChangeTrigger = (val: TriggerType) => {
    setTrigger(val);
    if (val === 'inactivity') setTriggerDays('7');
    if (val === 'funnel_stage') setTriggerDays('3');
  };

  const addStep = () => {
    const id = `s-${Date.now()}`;
    setSteps((prev) => [...prev, { id, type: 'message', label: '', config: {} }]);
    setExpandedStepId(id);
  };
  const removeStep = (id: string) => setSteps((prev) => prev.filter((s) => s.id !== id));
  const moveStep = (index: number, delta: number) => setSteps((prev) => {
    const target = index + delta;
    if (target < 0 || target >= prev.length) return prev;
    const next = [...prev];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
  const updateStepType = (id: string, type: ActionType) => setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, type, config: {} } : s)));
  const patchConfig = (id: string, patch: Record<string, any>) => setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, config: { ...(s.config ?? {}), ...patch } } : s)));
  const patchSettings = (patch: Partial<FlowSettings>) => setSettings((prev) => ({ ...prev, ...patch }));
  const patchOnReply = (patch: NonNullable<FlowSettings['on_reply']>) => setSettings((prev) => ({ ...prev, on_reply: { ...prev.on_reply, ...patch } }));

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      ...flow,
      name: name.trim(),
      description,
      trigger,
      triggerLabel: computedTriggerLabel(),
      steps: steps.map((s) => ({ ...s, label: stepSummary(s.type, s.config, funnelStages) })),
      // Fuso de quem configura: é nele que conta o horário de envio
      settings: { ...settings, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    });
  };

  const stageSelect = (value: string, onChange: (v: string) => void, withEmpty = false) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full">
      {withEmpty && <option value="">Não mover</option>}
      {funnelStages.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
    </select>
  );

  const routeSelect = (value: string | undefined, onChange: (v: string) => void, currentId: string) => (
    <select value={value || 'continue'} onChange={(e) => onChange(e.target.value)} className="w-full">
      <option value="continue">Continuar</option>
      <option value="end">Terminar o fluxo</option>
      {steps.map((s, i) => (s.id === currentId ? null : (
        <option key={s.id} value={s.id}>{`Ir para o passo ${i + 1}: ${STEP_NAMES[s.type]}`}</option>
      )))}
    </select>
  );

  const renderStepConfig = (step: FlowStep) => {
    const cfg = step.config ?? {};
    switch (step.type) {
      case 'message': case 'whatsapp': case 'facebook': case 'instagram': case 'telegram': {
        const usesTemplate = waTemplates.length > 0 || cfg.requires_template;
        return (
          <div className="space-y-2">
            <MessageField value={cfg.message ?? ''} onChange={(message) => patchConfig(step.id, { message })} placeholder="Escreva a mensagem" />
            {usesTemplate && (step.type === 'message' || step.type === 'whatsapp') && (
              <div className="space-y-1">
                <label className={fieldLabelCls}>Modelo do WhatsApp Business (fora das 24 horas)</label>
                {waTemplates.length > 0 ? (
                  <select
                    value={cfg.wa_template?.name ?? ''}
                    onChange={(e) => {
                      const t = waTemplates.find((x) => x.name === e.target.value);
                      const body = t?.components?.find((c: any) => c.type === 'BODY') as any;
                      const params = new Set(String(body?.text || '').match(/\{\{\d+\}\}/g) || []).size;
                      patchConfig(step.id, { wa_template: t ? { name: t.name, language: t.language, params } : undefined });
                    }}
                    className="w-full"
                  >
                    <option value="">Nenhum</option>
                    {waTemplates.map((t) => <option key={t.id} value={t.name}>{`${t.name} (${t.language})`}</option>)}
                  </select>
                ) : (
                  <p className="text-xs text-muted-foreground">Crie um modelo em Definições → WhatsApp Business.</p>
                )}
              </div>
            )}
          </div>
        );
      }
      case 'dynamic_audio':
        return <AudioField config={cfg} onChange={(patch) => patchConfig(step.id, patch)} />;
      case 'ab_test':
        return (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className={fieldLabelCls}>Versão A</label>
              <MessageField value={cfg.messageA ?? ''} onChange={(messageA) => patchConfig(step.id, { messageA })} />
            </div>
            <div className="space-y-1">
              <label className={fieldLabelCls}>Versão B</label>
              <MessageField value={cfg.messageB ?? ''} onChange={(messageB) => patchConfig(step.id, { messageB })} />
            </div>
          </div>
        );
      case 'email':
        return (
          <div className="space-y-2">
            <input value={cfg.subject ?? ''} onChange={(e) => patchConfig(step.id, { subject: e.target.value })} placeholder="Assunto" className="w-full" translate="no" />
            <MessageField value={cfg.body ?? ''} onChange={(body) => patchConfig(step.id, { body })} placeholder="Texto do email" rows={4} />
          </div>
        );
      case 'wait':
        return (
          <div className="flex items-center gap-2">
            <input type="number" min="1" value={cfg.duration ?? ''} onChange={(e) => patchConfig(step.id, { duration: e.target.value })} placeholder="1" className="w-24" />
            <select value={cfg.unit ?? 'dias'} onChange={(e) => patchConfig(step.id, { unit: e.target.value })} className="flex-1">
              <option value="minutos">minutos</option>
              <option value="horas">horas</option>
              <option value="dias">dias</option>
              <option value="semanas">semanas</option>
            </select>
          </div>
        );
      case 'condition': {
        const needsStage = cfg.check === 'stage' || cfg.check === 'not_stage';
        const needsTag = cfg.check === 'tag' || cfg.check === 'not_tag';
        return (
          <div className="space-y-2">
            <select value={cfg.check ?? ''} onChange={(e) => patchConfig(step.id, { check: e.target.value, value: '' })} className="w-full">
              <option value="">Escolher condição</option>
              {CONDITION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {needsStage && stageSelect(cfg.value ?? '', (value) => patchConfig(step.id, { value }))}
            {needsTag && <input value={cfg.value ?? ''} onChange={(e) => patchConfig(step.id, { value: e.target.value })} placeholder="Nome da tag" className="w-full" />}
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <label className={fieldLabelCls}>Se sim</label>
                {routeSelect(cfg.if_true, (if_true) => patchConfig(step.id, { if_true }), step.id)}
              </div>
              <div className="space-y-1">
                <label className={fieldLabelCls}>Se não</label>
                {routeSelect(cfg.if_false, (if_false) => patchConfig(step.id, { if_false }), step.id)}
              </div>
            </div>
          </div>
        );
      }
      case 'move_stage':
        return stageSelect(cfg.stage ?? '', (stage) => patchConfig(step.id, { stage }), false);
      case 'tag': case 'remove_tag':
        return <input value={cfg.tag ?? ''} onChange={(e) => patchConfig(step.id, { tag: e.target.value })} placeholder="Nome da tag" className="w-full" />;
      case 'create_task':
        return (
          <div className="space-y-2">
            <MessageField value={cfg.title ?? ''} onChange={(title) => patchConfig(step.id, { title })} placeholder="Título da tarefa" rows={1} />
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Para daqui a</span>
              <input type="number" min="1" value={cfg.due_hours ?? '24'} onChange={(e) => patchConfig(step.id, { due_hours: e.target.value })} className="w-20" />
              <span className="text-sm text-muted-foreground">horas</span>
            </div>
          </div>
        );
      case 'add_note':
        return <MessageField value={cfg.text ?? ''} onChange={(text) => patchConfig(step.id, { text })} placeholder="Texto da nota" rows={2} />;
      case 'notify':
        return <MessageField value={cfg.title ?? ''} onChange={(title) => patchConfig(step.id, { title })} placeholder="Texto do aviso" rows={1} />;
      case 'score':
        return (
          <div className="flex items-center gap-2">
            <input type="number" value={cfg.points ?? ''} onChange={(e) => patchConfig(step.id, { points: e.target.value })} placeholder="10" className="w-24" />
            <span className="text-sm text-muted-foreground">pontos (negativo para tirar)</span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <AppModal
      open
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      title={isNew ? 'Novo fluxo' : 'Editar fluxo'}
      footer={(
        <>
          <AppButton variant="outline" onClick={onClose}>Cancelar</AppButton>
          <AppButton onClick={handleSave} disabled={!name.trim()}>Guardar</AppButton>
        </>
      )}
    >
      <div className="space-y-5 [&_input]:px-3 [&_select]:px-3 [&_textarea]:px-3 [&_textarea]:py-2">
        <div className="space-y-1.5">
          <label className={labelCls}>Nome do fluxo</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full" />
        </div>

        <div className="space-y-1.5">
          <label className={labelCls}>Descrição</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full resize-none" />
        </div>

        {/* Gatilho */}
        <div className="space-y-2">
          <label className={labelCls}>Gatilho</label>
          <select value={trigger} onChange={(e) => handleChangeTrigger(e.target.value as TriggerType)} className="w-full">
            {TRIGGER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <p className="text-xs text-muted-foreground">{TRIGGER_OPTIONS.find((o) => o.value === trigger)?.description}</p>

          {trigger === 'funnel_stage' && (
            <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
              {stageSelect(triggerStage, setTriggerStage)}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">parado há</span>
                <input type="number" min="0" value={triggerDays} onChange={(e) => setTriggerDays(e.target.value)} className="w-20 text-center" />
                <span className="text-sm text-muted-foreground">dias</span>
              </div>
            </div>
          )}
          {trigger === 'inactivity' && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Sem mensagens há</span>
              <input type="number" min="1" value={triggerDays} onChange={(e) => setTriggerDays(e.target.value)} className="w-20 text-center" />
              <span className="text-sm text-muted-foreground">dias</span>
            </div>
          )}
          {trigger === 'conversation_idle' && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Parada há</span>
              <input type="number" min="1" max="22" value={triggerHours} onChange={(e) => setTriggerHours(e.target.value)} className="w-20 text-center" />
              <span className="text-sm text-muted-foreground">horas</span>
            </div>
          )}
          {trigger === 'tag' && (
            <input value={triggerTag} onChange={(e) => setTriggerTag(e.target.value)} placeholder="Nome da tag" className="w-full" />
          )}
          {trigger === 'lead_score' && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Pontuação a partir de</span>
              <input type="number" min="1" max="100" value={triggerScore} onChange={(e) => setTriggerScore(e.target.value)} className="w-20 text-center" />
            </div>
          )}
        </div>

        {/* Passos */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className={labelCls}>Passos</label>
            <button type="button" onClick={addStep} className="flex items-center gap-1 text-sm font-medium text-primary hover:opacity-80">
              <Plus className="h-4 w-4" /> Adicionar passo
            </button>
          </div>
          {steps.map((step, index) => {
            const StepIcon = STEP_ICONS[step.type] ?? STEP_ICONS.message;
            const isExpanded = expandedStepId === step.id;
            return (
              <div key={step.id} className={`rounded-lg border transition-colors ${isExpanded ? 'border-foreground/25' : 'border-border'}`}>
                <div className="flex items-center gap-2.5 p-2.5">
                  <button
                    type="button"
                    onClick={() => setExpandedStepId(isExpanded ? null : step.id)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${STEP_COLORS[step.type] ?? ''}`}>
                      <StepIcon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground">{`${index + 1}. ${STEP_NAMES[step.type] ?? step.type}`}</span>
                      {!isExpanded && (
                        <span className="block truncate text-xs text-muted-foreground" translate="no">{stepSummary(step.type, step.config, funnelStages)}</span>
                      )}
                    </span>
                  </button>
                  <button type="button" aria-label="Subir" disabled={index === 0} onClick={() => moveStep(index, -1)} className="hidden rounded-md p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30 sm:block">
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button type="button" aria-label="Descer" disabled={index === steps.length - 1} onClick={() => moveStep(index, 1)} className="hidden rounded-md p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30 sm:block">
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button type="button" aria-label="Remover passo" onClick={() => removeStep(step.id)} className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {isExpanded && (
                  <div className="space-y-3 border-t border-border p-3">
                    <select value={step.type} onChange={(e) => updateStepType(step.id, e.target.value as ActionType)} className="w-full">
                      {STEP_GROUPS.map((group) => (
                        <optgroup key={group.label} label={group.label}>
                          {group.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </optgroup>
                      ))}
                    </select>
                    {renderStepConfig(step)}
                    {/* No telemóvel as setas ficam aqui, para o cabeçalho caber */}
                    <div className="flex gap-2 sm:hidden">
                      <AppButton type="button" size="sm" variant="outline" className="flex-1" disabled={index === 0} onClick={() => moveStep(index, -1)}>Subir</AppButton>
                      <AppButton type="button" size="sm" variant="outline" className="flex-1" disabled={index === steps.length - 1} onClick={() => moveStep(index, 1)}>Descer</AppButton>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Regras */}
        <details className="rounded-lg border border-border">
          <summary className="cursor-pointer select-none px-3 py-2.5 text-sm font-medium text-foreground">Regras do fluxo</summary>
          <div className="space-y-4 border-t border-border p-3">
            <div className="space-y-1">
              <label className={fieldLabelCls}>Canal</label>
              <select value={settings.channel ?? 'any'} onChange={(e) => patchSettings({ channel: e.target.value })} className="w-full">
                {CHANNEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div className="space-y-1">
              <label className={fieldLabelCls}>O seu negócio nas mensagens</label>
              <input
                value={settings.business_name ?? ''}
                onChange={(e) => patchSettings({ business_name: e.target.value })}
                placeholder="Nome do seu negócio"
                translate="no"
                className="w-full"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-foreground">Adaptar as mensagens à conversa</span>
              <Switch checked={settings.personalize === true} onCheckedChange={(personalize) => patchSettings({ personalize })} />
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-foreground">Parar quando o lead responder</span>
              <Switch checked={settings.stop_on_reply !== false} onCheckedChange={(stop_on_reply) => patchSettings({ stop_on_reply })} />
            </div>

            <div className="space-y-1">
              <label className={fieldLabelCls}>Resposta automática se ninguém estiver disponível</label>
              <MessageField
                value={settings.on_reply?.auto_reply ?? DEFAULT_AUTO_REPLY}
                onChange={(auto_reply) => patchOnReply({ auto_reply })}
                rows={2}
              />
            </div>

            {settings.stop_on_reply !== false && (
              <div className="space-y-3 rounded-lg bg-muted/40 p-3">
                <div className="space-y-1">
                  <label className={fieldLabelCls}>Quando responder, mover para</label>
                  {stageSelect(settings.on_reply?.stage ?? '', (stage) => patchOnReply({ stage: stage || undefined }), true)}
                </div>
                <div className="space-y-1">
                  <label className={fieldLabelCls}>Quando responder, aplicar a tag</label>
                  <input value={settings.on_reply?.tag ?? ''} onChange={(e) => patchOnReply({ tag: e.target.value || undefined })} className="w-full" />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-foreground">Criar tarefa para responder</span>
                  <Switch checked={settings.on_reply?.task !== false} onCheckedChange={(task) => patchOnReply({ task })} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-foreground">Avisar-me quando responder</span>
                  <Switch checked={settings.on_reply?.notify !== false} onCheckedChange={(notify) => patchOnReply({ notify })} />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className={fieldLabelCls}>Horário de envio</label>
              <div className="flex items-center gap-2">
                <input type="number" min="0" max="23" value={settings.window_start ?? 8} onChange={(e) => patchSettings({ window_start: Number(e.target.value) })} className="w-20 text-center" />
                <span className="text-sm text-muted-foreground">às</span>
                <input type="number" min="1" max="24" value={settings.window_end ?? 20} onChange={(e) => patchSettings({ window_end: Number(e.target.value) })} className="w-20 text-center" />
                <span className="text-sm text-muted-foreground">horas</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-foreground">Só em dias úteis</span>
              <Switch checked={settings.weekdays_only === true} onCheckedChange={(weekdays_only) => patchSettings({ weekdays_only })} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className={fieldLabelCls}>Repetir o mesmo lead após (dias)</label>
                <input type="number" min="1" value={settings.reentry_days ?? 30} onChange={(e) => patchSettings({ reentry_days: Number(e.target.value) })} className="w-full" />
              </div>
              <div className="space-y-1">
                <label className={fieldLabelCls}>Máximo de envios por dia</label>
                <input type="number" min="1" value={settings.daily_limit ?? 200} onChange={(e) => patchSettings({ daily_limit: Number(e.target.value) })} className="w-full" />
              </div>
            </div>
          </div>
        </details>
      </div>
    </AppModal>
  );
}
