import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../../lib/api';
import {
  GitBranch, Plus, Zap, Mail, MessageSquare, Clock, Filter,
  ChevronRight, Play, Pause, Copy, Trash2, BarChart3, ArrowRight,
  Tag, ShoppingCart, UserCheck, AlertCircle,
  Layers, Repeat2, Target, Pencil, X, GripVertical, Info,
} from 'lucide-react';
import { Button } from '../ui/button';

// ─── localStorage helpers ────────────────────────────────────────────────────

const LS_KEY = 'remarketing_flows_local';
function loadLocal(): RemarketingFlow[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}
function saveLocal(flows: RemarketingFlow[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(flows)); } catch { /* ignore */ }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type FlowStatus = 'active' | 'paused' | 'draft';
type TriggerType = 'funnel_stage' | 'tag' | 'inactivity' | 'purchase' | 'lead_score';
type ActionType = 'whatsapp' | 'email' | 'wait' | 'tag' | 'move_stage' | 'condition';

interface FlowStep {
  id: string;
  type: ActionType;
  label: string;
  config?: Record<string, any>;
}

interface RemarketingFlow {
  id: string;
  name: string;
  description: string;
  status: FlowStatus;
  trigger: TriggerType;
  triggerLabel: string;
  steps: FlowStep[];
  enrolledLeads: number;
  conversions: number;
  createdAt: string;
  templateId?: string;
}

// ─── Template definitions ─────────────────────────────────────────────────────

const TEMPLATES = [
  {
    id: 'abandoned-lead',
    name: 'Lead Inativo',
    description: 'Re-engaja leads que pararam de interagir há mais de 7 dias.',
    icon: Repeat2,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    trigger: 'inactivity' as TriggerType,
    triggerLabel: 'Inatividade +7 dias',
    steps: [
      { id: 's1', type: 'wait' as ActionType, label: 'Aguardar 7 dias' },
      { id: 's2', type: 'whatsapp' as ActionType, label: 'Mensagem WhatsApp: "Ei, temos novidades..."' },
      { id: 's3', type: 'condition' as ActionType, label: 'Respondeu?' },
      { id: 's4', type: 'tag' as ActionType, label: 'Tag: frio' },
    ],
  },
  {
    id: 'funnel-stalled',
    name: 'Travado no Funil',
    description: 'Empurra leads presos em uma etapa do funil por mais de 3 dias.',
    icon: GitBranch,
    color: 'text-violet-500',
    bg: 'bg-violet-500/10',
    trigger: 'funnel_stage' as TriggerType,
    triggerLabel: 'Etapa do funil +3 dias',
    steps: [
      { id: 's1', type: 'wait' as ActionType, label: 'Aguardar 3 dias sem mudança' },
      { id: 's2', type: 'whatsapp' as ActionType, label: 'Mensagem de follow-up personalizada' },
      { id: 's3', type: 'email' as ActionType, label: 'Email: Proposta especial' },
      { id: 's4', type: 'move_stage' as ActionType, label: 'Mover para "Em negociação"' },
    ],
  },
  {
    id: 'post-purchase',
    name: 'Pós-Venda',
    description: 'Sequência de upsell e NPS para clientes após a compra.',
    icon: ShoppingCart,
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    trigger: 'purchase' as TriggerType,
    triggerLabel: 'Compra realizada',
    steps: [
      { id: 's1', type: 'whatsapp' as ActionType, label: 'Boas-vindas + onboarding' },
      { id: 's2', type: 'wait' as ActionType, label: 'Aguardar 3 dias' },
      { id: 's3', type: 'email' as ActionType, label: 'Email: Dicas de uso do produto' },
      { id: 's4', type: 'wait' as ActionType, label: 'Aguardar 7 dias' },
      { id: 's5', type: 'whatsapp' as ActionType, label: 'NPS + oferta de upgrade' },
    ],
  },
  {
    id: 'hot-lead',
    name: 'Lead Quente',
    description: 'Notifica a equipe e age rapidamente quando um lead atinge score alto.',
    icon: Target,
    color: 'text-orange-500',
    bg: 'bg-orange-500/10',
    trigger: 'lead_score' as TriggerType,
    triggerLabel: 'Score ≥ 80',
    steps: [
      { id: 's1', type: 'tag' as ActionType, label: 'Tag: quente' },
      { id: 's2', type: 'move_stage' as ActionType, label: 'Mover para "Proposta"' },
      { id: 's3', type: 'whatsapp' as ActionType, label: 'Contato imediato pelo vendedor' },
    ],
  },
  {
    id: 'winback',
    name: 'Recuperação',
    description: 'Tenta resgatar clientes que cancelaram ou deixaram de comprar.',
    icon: UserCheck,
    color: 'text-pink-500',
    bg: 'bg-pink-500/10',
    trigger: 'tag' as TriggerType,
    triggerLabel: 'Tag: churn',
    steps: [
      { id: 's1', type: 'wait' as ActionType, label: 'Aguardar 5 dias' },
      { id: 's2', type: 'email' as ActionType, label: 'Email: "Sentimos sua falta"' },
      { id: 's3', type: 'wait' as ActionType, label: 'Aguardar 3 dias' },
      { id: 's4', type: 'whatsapp' as ActionType, label: 'Oferta exclusiva de reativação' },
      { id: 's5', type: 'condition' as ActionType, label: 'Aceitou oferta?' },
    ],
  },
  {
    id: 'nurture',
    name: 'Nutrição de Leads',
    description: 'Educar leads frios com conteúdo de valor antes de uma abordagem comercial.',
    icon: Layers,
    color: 'text-cyan-500',
    bg: 'bg-cyan-500/10',
    trigger: 'tag' as TriggerType,
    triggerLabel: 'Tag: novo-lead',
    steps: [
      { id: 's1', type: 'email' as ActionType, label: 'Email: Conteúdo educativo #1' },
      { id: 's2', type: 'wait' as ActionType, label: 'Aguardar 2 dias' },
      { id: 's3', type: 'email' as ActionType, label: 'Email: Conteúdo educativo #2' },
      { id: 's4', type: 'wait' as ActionType, label: 'Aguardar 2 dias' },
      { id: 's5', type: 'whatsapp' as ActionType, label: 'Abordagem comercial personalizada' },
    ],
  },
];

// ─── Step icon helper ─────────────────────────────────────────────────────────

const STEP_ICONS: Record<ActionType, React.ElementType> = {
  whatsapp: MessageSquare,
  email: Mail,
  wait: Clock,
  tag: Tag,
  move_stage: GitBranch,
  condition: Filter,
};

const STEP_COLORS: Record<ActionType, string> = {
  whatsapp: 'text-emerald-500 bg-emerald-500/10',
  email: 'text-blue-500 bg-blue-500/10',
  wait: 'text-amber-500 bg-amber-500/10',
  tag: 'text-violet-500 bg-violet-500/10',
  move_stage: 'text-cyan-500 bg-cyan-500/10',
  condition: 'text-orange-500 bg-orange-500/10',
};

const TRIGGER_OPTIONS: { value: TriggerType; label: string }[] = [
  { value: 'inactivity',   label: 'Inatividade' },
  { value: 'funnel_stage', label: 'Etapa do funil' },
  { value: 'tag',          label: 'Tag aplicada' },
  { value: 'purchase',     label: 'Compra realizada' },
  { value: 'lead_score',   label: 'Lead score' },
];

const ACTION_OPTIONS: { value: ActionType; label: string }[] = [
  { value: 'whatsapp',   label: 'Mensagem WhatsApp' },
  { value: 'email',      label: 'Enviar Email' },
  { value: 'wait',       label: 'Aguardar' },
  { value: 'tag',        label: 'Aplicar Tag' },
  { value: 'move_stage', label: 'Mover Etapa' },
  { value: 'condition',  label: 'Condição (bifurcação)' },
];

// ─── Edit Modal ───────────────────────────────────────────────────────────────

interface EditModalProps {
  flow: RemarketingFlow;
  onSave: (updated: RemarketingFlow) => void;
  onClose: () => void;
}

function EditModal({ flow, onSave, onClose }: EditModalProps) {
  const [name, setName] = useState(flow.name);
  const [description, setDescription] = useState(flow.description);
  const [trigger, setTrigger] = useState<TriggerType>(flow.trigger);
  const [triggerLabel, setTriggerLabel] = useState(flow.triggerLabel);
  const [steps, setSteps] = useState<FlowStep[]>(flow.steps.map(s => ({ ...s })));

  const addStep = () => {
    setSteps(prev => [...prev, { id: `s-${Date.now()}`, type: 'whatsapp', label: 'Nova ação' }]);
  };

  const removeStep = (id: string) => setSteps(prev => prev.filter(s => s.id !== id));

  const updateStep = (id: string, field: keyof FlowStep, value: string) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({ ...flow, name: name.trim(), description, trigger, triggerLabel, steps });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Pencil className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-foreground text-sm">Editar Flow</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Nome do Flow</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Nome do flow"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Descrição</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              placeholder="Descreva o objetivo do flow"
            />
          </div>

          {/* Trigger */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Gatilho</label>
            <div className="flex gap-2">
              <select
                value={trigger}
                onChange={e => {
                  const val = e.target.value as TriggerType;
                  setTrigger(val);
                  setTriggerLabel(TRIGGER_OPTIONS.find(o => o.value === val)?.label ?? val);
                }}
                className="flex-1 h-9 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {TRIGGER_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <input
                value={triggerLabel}
                onChange={e => setTriggerLabel(e.target.value)}
                className="w-36 h-9 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Ex: +7 dias"
              />
            </div>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Info className="w-3 h-3" /> O detalhe à direita é o rótulo exibido no card (ex: "+7 dias", "≥ 80").
            </p>
          </div>

          {/* Steps */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-foreground">Passos da Sequência</label>
              <button
                onClick={addStep}
                className="text-[11px] text-primary hover:opacity-80 transition-opacity flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Adicionar passo
              </button>
            </div>
            {steps.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-3">Nenhum passo. Adicione acima.</p>
            )}
            {steps.map((step, i) => {
              const StepIcon = STEP_ICONS[step.type];
              const colorClass = STEP_COLORS[step.type];
              return (
                <div key={step.id} className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                    <StepIcon className="w-3.5 h-3.5" />
                  </div>
                  <select
                    value={step.type}
                    onChange={e => updateStep(step.id, 'type', e.target.value)}
                    className="w-40 h-8 px-2 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {ACTION_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <input
                    value={step.label}
                    onChange={e => updateStep(step.id, 'label', e.target.value)}
                    className="flex-1 h-8 px-2 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="Descrição da ação"
                  />
                  <button
                    onClick={() => removeStep(step.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={!name.trim()}>Salvar</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RemarketingPage() {
  const [flows, setFlows] = useState<RemarketingFlow[]>([]);
  const [activeTab, setActiveTab] = useState<'flows' | 'templates'>('flows');
  const [selectedTemplate, setSelectedTemplate] = useState<typeof TEMPLATES[0] | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingFlow, setEditingFlow] = useState<RemarketingFlow | null>(null);

  // ── Persist helper — keeps localStorage in sync with every state update ──
  const updateFlows = useCallback((updater: (prev: RemarketingFlow[]) => RemarketingFlow[]) => {
    setFlows(prev => {
      const next = updater(prev);
      saveLocal(next);
      return next;
    });
  }, []);

  // ── Load on mount: try API, fall back to localStorage ────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.remarketing.list();
        if (cancelled) return;
        const mapped: RemarketingFlow[] = data.map((r: any) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          status: r.status,
          trigger: r.trigger_type,
          triggerLabel: r.trigger_label,
          steps: Array.isArray(r.steps) ? r.steps : [],
          enrolledLeads: r.enrolled_leads ?? 0,
          conversions: r.conversions ?? 0,
          createdAt: r.created_at,
          templateId: r.template_id,
        }));
        setFlows(mapped);
        saveLocal(mapped);
      } catch {
        // Backend unavailable — load from localStorage
        if (!cancelled) setFlows(loadLocal());
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleUseTemplate = async (template: typeof TEMPLATES[0]) => {
    const newFlow: RemarketingFlow = {
      id: `flow-${Date.now()}`,
      name: template.name,
      description: template.description,
      status: 'draft',
      trigger: template.trigger,
      triggerLabel: template.triggerLabel,
      steps: template.steps,
      enrolledLeads: 0,
      conversions: 0,
      createdAt: new Date().toISOString(),
      templateId: template.id,
    };

    // Optimistically add to local state + localStorage immediately
    updateFlows(prev => [newFlow, ...prev]);
    setActiveTab('flows');

    // Best-effort sync to API (silently ignored if backend is not ready)
    try {
      const created = await api.remarketing.create({
        name: newFlow.name,
        description: newFlow.description,
        status: newFlow.status,
        trigger_type: newFlow.trigger,
        trigger_label: newFlow.triggerLabel,
        steps: newFlow.steps,
        template_id: newFlow.templateId,
      });
      // Replace local temp id with DB id
      updateFlows(prev => prev.map(f =>
        f.id === newFlow.id
          ? { ...f, id: created.id, createdAt: created.created_at }
          : f
      ));
    } catch { /* table not yet created — local version persists */ }
  };

  const handleToggleStatus = async (id: string) => {
    // Optimistic update
    updateFlows(prev => prev.map(f =>
      f.id === id
        ? { ...f, status: f.status === 'active' ? 'paused' : 'active' }
        : f
    ));
    try {
      const updated = await api.remarketing.toggle(id);
      updateFlows(prev => prev.map(f => f.id === id ? { ...f, status: updated.status } : f));
    } catch { /* keep optimistic */ }
  };

  const handleDelete = async (id: string) => {
    updateFlows(prev => prev.filter(f => f.id !== id));
    try { await api.remarketing.delete(id); } catch { /* ok */ }
  };

  const handleDuplicate = async (flow: RemarketingFlow) => {
    const copy: RemarketingFlow = {
      ...flow,
      id: `flow-${Date.now()}`,
      name: `${flow.name} (Cópia)`,
      status: 'draft',
      enrolledLeads: 0,
      conversions: 0,
      createdAt: new Date().toISOString(),
    };
    updateFlows(prev => [copy, ...prev]);
    try {
      const created = await api.remarketing.duplicate(flow.id);
      updateFlows(prev => prev.map(f =>
        f.id === copy.id
          ? { ...f, id: created.id, createdAt: created.created_at }
          : f
      ));
    } catch { /* keep local copy */ }
  };

  const handleSaveEdit = async (updated: RemarketingFlow) => {
    updateFlows(prev => prev.map(f => f.id === updated.id ? updated : f));
    setEditingFlow(null);
    try {
      await api.remarketing.update(updated.id, {
        name: updated.name,
        description: updated.description,
        trigger_type: updated.trigger,
        trigger_label: updated.triggerLabel,
        steps: updated.steps,
      });
    } catch { /* persisted locally */ }
  };

  return (
    <>
    <div className="min-h-screen bg-background">
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-semibold text-foreground tracking-tight flex items-center gap-2.5">
              <Repeat2 className="w-6 h-6 text-muted-foreground" />
              Remarketing
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Crie flows automáticos que re-engajam leads com base no comportamento no funil
            </p>
          </div>
          <Button onClick={() => setActiveTab('templates')} className="gap-2 flex-shrink-0">
            <Plus className="w-4 h-4" />
            Novo Flow
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {(['flows', 'templates'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
                activeTab === tab
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab === 'flows' && `Meus Flows (${flows.length})`}
              {tab === 'templates' && 'Templates'}
            </button>
          ))}
        </div>

        {/* ── FLOWS TAB ── */}
        {activeTab === 'flows' && (
          <>
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : flows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
                  <GitBranch className="w-7 h-7 text-muted-foreground" />
                </div>
                <h3 className="text-base font-semibold text-foreground mb-1">Nenhum flow criado</h3>
                <p className="text-sm text-muted-foreground mb-5 max-w-xs">
                  Crie seu primeiro flow de remarketing a partir de um template ou do zero.
                </p>
                <Button onClick={() => setActiveTab('templates')} className="gap-2">
                  <Plus className="w-4 h-4" />
                  Explorar Templates
                </Button>
              </div>
            ) : (
              <div className="grid gap-4">
                {flows.map(flow => {
                  const convRate = flow.enrolledLeads > 0
                    ? Math.round((flow.conversions / flow.enrolledLeads) * 100)
                    : 0;
                  return (
                    <div key={flow.id} className="bg-card border border-border rounded-xl p-5 hover:border-border/80 transition-all">
                      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                        {/* Left */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-semibold text-foreground text-sm">{flow.name}</span>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                              flow.status === 'active' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                              flow.status === 'paused' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' :
                              'bg-muted text-muted-foreground'
                            }`}>
                              <div className={`w-1.5 h-1.5 rounded-full ${
                                flow.status === 'active' ? 'bg-emerald-500 animate-pulse' :
                                flow.status === 'paused' ? 'bg-amber-500' : 'bg-muted-foreground'
                              }`} />
                              {flow.status === 'active' ? 'Ativo' : flow.status === 'paused' ? 'Pausado' : 'Rascunho'}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mb-3">{flow.description}</p>

                          {/* Trigger pill */}
                          <div className="flex items-center gap-1.5 mb-3">
                            <Zap className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">Gatilho:</span>
                            <span className="text-xs font-medium text-foreground">{flow.triggerLabel}</span>
                          </div>

                          {/* Step trail */}
                          <div className="flex items-center gap-1 flex-wrap">
                            {flow.steps.map((step, i) => {
                              const StepIcon = STEP_ICONS[step.type];
                              const colorClass = STEP_COLORS[step.type];
                              return (
                                <React.Fragment key={step.id}>
                                  <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium ${colorClass}`}>
                                    <StepIcon className="w-3 h-3" />
                                    <span className="hidden sm:inline">{step.label.split(':')[0]}</span>
                                  </div>
                                  {i < flow.steps.length - 1 && (
                                    <ArrowRight className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="flex sm:flex-col gap-4 sm:gap-2 sm:items-end flex-shrink-0">
                          <div className="text-center sm:text-right">
                            <p className="text-xs text-muted-foreground">Inscritos</p>
                            <p className="text-lg font-semibold text-foreground">{flow.enrolledLeads}</p>
                          </div>
                          <div className="text-center sm:text-right">
                            <p className="text-xs text-muted-foreground">Conversão</p>
                            <p className="text-lg font-semibold text-foreground">{convRate}%</p>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => handleToggleStatus(flow.id)}
                        >
                          {flow.status === 'active'
                            ? <><Pause className="w-3.5 h-3.5" /> Pausar</>
                            : <><Play className="w-3.5 h-3.5" /> Ativar</>
                          }
                        </Button>
                        <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setEditingFlow(flow)}>
                          <Pencil className="w-3.5 h-3.5" />
                          <span className="text-xs">Editar</span>
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDuplicate(flow)}>
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(flow.id)}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                        <div className="ml-auto">
                          <Button size="sm" variant="ghost" className="gap-1.5 text-xs text-muted-foreground">
                            <BarChart3 className="w-3.5 h-3.5" />
                            Análise
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── TEMPLATES TAB ── */}
        {activeTab === 'templates' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {TEMPLATES.map(template => {
                const Icon = template.icon;
                return (
                  <div
                    key={template.id}
                    className="bg-card border border-border rounded-xl p-5 flex flex-col hover:border-foreground/20 hover:shadow-sm transition-all cursor-pointer group"
                    onClick={() => setSelectedTemplate(template)}
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${template.bg}`}>
                        <Icon className={`w-5 h-5 ${template.color}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground text-sm">{template.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{template.description}</p>
                      </div>
                    </div>

                    {/* Trigger */}
                    <div className="flex items-center gap-1.5 mb-3">
                      <Zap className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[11px] text-muted-foreground">{template.triggerLabel}</span>
                    </div>

                    {/* Step count */}
                    <div className="flex items-center gap-1 mb-4 flex-wrap">
                      {template.steps.map((step, i) => {
                        const StepIcon = STEP_ICONS[step.type];
                        const colorClass = STEP_COLORS[step.type];
                        return (
                          <React.Fragment key={step.id}>
                            <div className={`w-6 h-6 rounded-md flex items-center justify-center ${colorClass}`}>
                              <StepIcon className="w-3 h-3" />
                            </div>
                            {i < template.steps.length - 1 && (
                              <ChevronRight className="w-3 h-3 text-muted-foreground/30" />
                            )}
                          </React.Fragment>
                        );
                      })}
                      <span className="text-[11px] text-muted-foreground ml-1">{template.steps.length} etapas</span>
                    </div>

                    <Button
                      size="sm"
                      className="mt-auto gap-1.5 w-full"
                      onClick={(e) => { e.stopPropagation(); handleUseTemplate(template); }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Usar Template
                    </Button>
                  </div>
                );
              })}
            </div>

            {/* Coming soon notice */}
            <div className="rounded-xl border border-border bg-muted/30 p-5 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">Editor visual em breve</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Estamos desenvolvendo um construtor visual drag-and-drop ao estilo ManyChat, com condições, delays, A/B testing e integração direta com o funil de vendas.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>

    {/* Edit modal */}
    {editingFlow && (
      <EditModal
        flow={editingFlow}
        onSave={handleSaveEdit}
        onClose={() => setEditingFlow(null)}
      />
    )}
    </>
  );
}
