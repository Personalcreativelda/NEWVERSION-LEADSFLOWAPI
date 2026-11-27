// Peças do agente de voz: foto (ou iniciais), agenda, ações e o cartão dos agentes prontos.
import { useRef, useState } from 'react';
import { Crown } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { CheckList } from '../base/ChoiceList';
import { cn } from '../ui/utils';
import { voiceAgentsApi } from '../../services/api/voice-agents';
import { AGENT_ACTIONS, DEFAULT_AGENDA, type AgentAgenda, type AgentPlan, type AgentTemplate } from './agentTemplates';

// Cores das iniciais (sem foto): sempre a mesma para o mesmo nome
const TONES = [
  'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
];
const toneFor = (name: string) => TONES[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % TONES.length];
// Só letras ("Sofia · Receção" → SR)
const initials = (name: string) =>
  name.replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

export function AgentAvatar({ name, url, size = 40 }: { name: string; url?: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size };
  if (url && !broken) {
    return <img src={url} alt="" style={style} className="shrink-0 rounded-full object-cover" onError={() => setBroken(true)} />;
  }
  return (
    <span
      style={style}
      className={cn('flex shrink-0 items-center justify-center rounded-full text-sm font-semibold', toneFor(name || '?'))}
      aria-hidden
      translate="no"
    >
      {initials(name)}
    </span>
  );
}

/** Foto do agente: escolher uma imagem ou tirar (ficam as iniciais) */
export function AvatarPicker({ name, url, onChange }: { name: string; url?: string | null; onChange: (url: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file?: File) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('A imagem tem de ter até 2 MB');
      return;
    }
    setBusy(true);
    try {
      onChange(await voiceAgentsApi.uploadAgentAvatar(file));
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Não foi possível carregar a foto');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="flex items-center gap-3">
      <AgentAvatar name={name} url={url} size={56} />
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
      <Button variant="outline" onClick={() => input.current?.click()} disabled={busy}>
        {busy ? 'A carregar…' : url ? 'Mudar foto' : 'Escolher foto'}
      </Button>
      {url && !busy && (
        <button type="button" onClick={() => onChange(null)} className="h-10 px-2 text-sm text-muted-foreground hover:text-foreground">
          Tirar
        </button>
      )}
    </div>
  );
}

const DAYS = [
  { value: '1', label: 'Segunda' }, { value: '2', label: 'Terça' }, { value: '3', label: 'Quarta' },
  { value: '4', label: 'Quinta' }, { value: '5', label: 'Sexta' }, { value: '6', label: 'Sábado' }, { value: '0', label: 'Domingo' },
];
const DURATIONS = [15, 20, 30, 45, 60, 90, 120];

/** Horário em que o agente pode marcar */
export function AgendaFields({ value, onChange }: { value?: AgentAgenda; onChange: (v: AgentAgenda) => void }) {
  const v = value || DEFAULT_AGENDA;
  const toggleDay = (d: string) => {
    const n = Number(d);
    const days = v.business_days.includes(n) ? v.business_days.filter((x) => x !== n) : [...v.business_days, n];
    onChange({ ...v, business_days: days.sort() });
  };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="agenda-start" className="mb-1.5 block">Abre</Label>
          <Input id="agenda-start" type="time" value={v.business_hours_start} onChange={(e) => onChange({ ...v, business_hours_start: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="agenda-end" className="mb-1.5 block">Fecha</Label>
          <Input id="agenda-end" type="time" value={v.business_hours_end} onChange={(e) => onChange({ ...v, business_hours_end: e.target.value })} />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <Label htmlFor="agenda-duration" className="mb-1.5 block">Cada marcação</Label>
          <select
            id="agenda-duration"
            value={v.appointment_minutes}
            onChange={(e) => onChange({ ...v, appointment_minutes: Number(e.target.value) })}
            className="w-full"
          >
            {DURATIONS.map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : m === 60 ? '1 hora' : `${m / 60} horas`}</option>)}
          </select>
        </div>
      </div>
      <div>
        <Label className="mb-1.5 block">Dias</Label>
        <CheckList items={DAYS} selected={v.business_days.map(String)} onToggle={toggleDay} />
      </div>
    </div>
  );
}

/** O que o agente pode fazer no LeadsFlow durante a chamada */
export function ActionsField({ value, onChange }: { value?: string[]; onChange: (v: string[]) => void }) {
  const selected = value || AGENT_ACTIONS.map((a) => a.value);
  const toggle = (a: string) => onChange(selected.includes(a) ? selected.filter((x) => x !== a) : [...selected, a]);
  return <CheckList items={AGENT_ACTIONS} selected={selected} onToggle={toggle} />;
}

const PLAN_LABEL: Record<AgentPlan, string> = { business: 'Business', enterprise: 'Enterprise' };

/** Agente pronto: livre, ou com o plano de que precisa (abre o upgrade) */
export function TemplateCard({ template, locked, onClick, className }: {
  template: AgentTemplate; locked: boolean; onClick: () => void; className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(className, 'text-left transition-colors hover:border-foreground/25 hover:bg-muted/40')}
      aria-label={locked ? `${template.name} (${PLAN_LABEL[template.plan]})` : template.name}
    >
      <span className="flex items-start gap-3">
        <AgentAvatar name={template.name} size={40} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className={cn('truncate text-sm font-semibold', locked ? 'text-muted-foreground' : 'text-foreground')}>{template.name}</span>
            {locked && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                <Crown className="h-3 w-3" aria-hidden />
                {PLAN_LABEL[template.plan]}
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{template.summary}</span>
        </span>
      </span>
    </button>
  );
}
