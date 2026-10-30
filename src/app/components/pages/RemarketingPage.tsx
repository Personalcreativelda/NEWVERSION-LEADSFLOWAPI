import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../../../lib/api';
import { toast } from 'sonner';
import {
  GitBranch, Plus, Zap, Mail, Clock, Filter,
  ChevronRight, Play, Pause, Copy, Trash2, BarChart3, ArrowRight,
  Tag, ShoppingCart, UserCheck, 
  Layers, Repeat2, Target, Pencil, X, Info,
  Split, Mic, UploadCloud, MoreHorizontal,
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { PageHeader, PageAction } from '../base/PageHeader';
import { EmptyState } from '../base/EmptyState';
import { Button } from '../ui/button';
import { SkeletonFlowCard, UpdatingBadge } from '../ui/skeletons';
import { AppModal } from '../base/AppModal';
import { AppButton } from '../base/AppButton';
import { DashboardCard } from '../base/DashboardCard';
import { StatusBadge } from '../base/StatusBadge';
import { formatNumber, formatPercent } from '../../utils/format';
import { brandIcon } from '../base/BrandIcon';
import { useConfirm } from '../ui/ConfirmDialog';

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
type ActionType = 'whatsapp' | 'facebook' | 'instagram' | 'telegram' | 'email' | 'wait' | 'tag' | 'move_stage' | 'condition' | 'ab_test' | 'dynamic_audio';

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
      { id: 's5', type: 'whatsapp' as ActionType, label: 'NPS + oferta de melhorar o plano' },
    ],
  },
  {
    id: 'hot-lead',
    name: 'Lead Quente',
    description: 'Notifica a equipa e age rapidamente quando um lead atinge score alto.',
    icon: Target,
    color: 'text-orange-500',
    bg: 'bg-orange-500/10',
    trigger: 'lead_score' as TriggerType,
    triggerLabel: 'Score ≥ 80',
    steps: [
      { id: 's1', type: 'tag' as ActionType, label: 'Tag: quente' },
      { id: 's2', type: 'move_stage' as ActionType, label: 'Mover para "Proposta"' },
      { id: 's3', type: 'whatsapp' as ActionType, label: 'Contacto imediato pelo vendedor' },
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
  whatsapp: brandIcon('whatsapp'),
  email: Mail,
  wait: Clock,
  tag: Tag,
  move_stage: GitBranch,
  condition: Filter,
  facebook: brandIcon('messenger'),
  instagram: brandIcon('instagram'),
  telegram: brandIcon('telegram'),
  ab_test: Split,
  dynamic_audio: Mic,
};

// Nome curto de cada passo (o ícone sozinho não diz o canal)
const STEP_NAMES: Record<ActionType, string> = {
  whatsapp: 'WhatsApp',
  email: 'Email',
  wait: 'Aguardar',
  tag: 'Tag',
  move_stage: 'Mover etapa',
  condition: 'Condição',
  facebook: 'Facebook',
  instagram: 'Instagram',
  telegram: 'Telegram',
  ab_test: 'Teste A/B',
  dynamic_audio: 'Áudio',
};

// Abaixo disto a taxa de conversão não diz nada
const MIN_ENROLLED_FOR_RATE = 10;

const STEP_COLORS: Record<ActionType, string> = {
  whatsapp: 'text-emerald-500 bg-emerald-500/10',
  facebook: 'text-blue-600 bg-blue-600/10',
  instagram: 'text-pink-500 bg-pink-500/10',
  telegram: 'text-sky-500 bg-sky-500/10',
  email: 'text-blue-500 bg-blue-500/10',
  wait: 'text-amber-500 bg-amber-500/10',
  tag: 'text-violet-500 bg-violet-500/10',
  move_stage: 'text-cyan-500 bg-cyan-500/10',
  condition: 'text-orange-500 bg-orange-500/10',
  ab_test: 'text-rose-500 bg-rose-500/10',
  dynamic_audio: 'text-purple-500 bg-purple-500/10',
};

const TRIGGER_OPTIONS: { value: TriggerType; label: string; description: string }[] = [
  { value: 'funnel_stage', label: 'Etapa do funil', description: 'Dispara quando o lead é movido para a etapa escolhida.' },
  { value: 'tag', label: 'Tag aplicada', description: 'Dispara quando a tag especificada é adicionada ao lead.' },
  { value: 'inactivity', label: 'Inatividade', description: 'Quando o lead fica X dias sem contacto.' },
  { value: 'purchase', label: 'Compra realizada', description: 'Dispara quando o lead é marcado como Convertido no funil.' },
  { value: 'lead_score', label: 'Assistente de vendas IA', description: 'Dispara quando o Assistente de vendas IA calcula um score ≥ X ao analisar os leads.' },
];

const ACTION_OPTIONS: { value: ActionType; label: string }[] = [
  { value: 'whatsapp', label: 'Mensagem WhatsApp' },
  { value: 'facebook', label: 'Mensagem Facebook' },
  { value: 'instagram', label: 'Mensagem Instagram' },
  { value: 'telegram', label: 'Mensagem Telegram' },
  { value: 'email', label: 'Enviar email' },
  { value: 'wait', label: 'Aguardar' },
  { value: 'tag', label: 'Aplicar Tag' },
  { value: 'move_stage', label: 'Mover Etapa' },
  { value: 'condition', label: 'Condição (bifurcação)' },
  { value: 'ab_test', label: 'Teste A/B (Mensagens)' },
  { value: 'dynamic_audio', label: 'Áudio Mágico' },
];

// ─── Funnel stages fallback (used when API is unavailable) ──────────────────

const DEFAULT_FUNNEL_STAGES = [
  { value: 'novo',        label: 'Novo lead' },
  { value: 'contatado',   label: 'Contactado' },
  { value: 'qualificado', label: 'Qualificado' },
  { value: 'negociacao',  label: 'Em Negociação' },
  { value: 'convertido',  label: 'Convertido' },
  { value: 'perdido',     label: 'Perdido' },
];

// Keep a module-level alias so non-component helpers can still resolve labels
let FUNNEL_STAGES = DEFAULT_FUNNEL_STAGES;

// Auto-generate step label from its config
function stepLabel(type: ActionType, config: Record<string, any> = {}): string {
  switch (type) {
    case 'whatsapp': return config.message ? config.message.slice(0, 45) + (config.message.length > 45 ? '…' : '') : 'Mensagem WhatsApp';
    case 'facebook': return config.message ? config.message.slice(0, 45) + (config.message.length > 45 ? '…' : '') : 'Mensagem Facebook';
    case 'instagram': return config.message ? config.message.slice(0, 45) + (config.message.length > 45 ? '…' : '') : 'Mensagem Instagram';
    case 'telegram': return config.message ? config.message.slice(0, 45) + (config.message.length > 45 ? '…' : '') : 'Mensagem Telegram';
    case 'email': return config.subject ? `Email: ${config.subject}` : 'Enviar email';
    case 'wait': return config.duration ? `Aguardar ${config.duration} ${config.unit ?? 'dia(s)'}` : 'Aguardar';
    case 'tag': return config.tag ? `Tag: ${config.tag}` : 'Aplicar Tag';
    case 'move_stage': return config.stage ? `Mover para "${FUNNEL_STAGES.find(s => s.value === config.stage)?.label ?? config.stage}"` : 'Mover Etapa';
    case 'condition': return config.condition ? `${config.condition}?` : 'Condição';
    case 'ab_test': return 'Teste A/B (50/50)';
    case 'dynamic_audio': return config.text ? `Áudio IA: ${config.text.slice(0, 30)}...` : 'Áudio Mágico IA';
    default: return 'Ação';
  }
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

interface EditModalProps {
  flow: RemarketingFlow;
  isNew?: boolean;
  onSave: (updated: RemarketingFlow) => void;
  onClose: () => void;
  /** Live funnel stages fetched from the API */
  funnelStages: { value: string; label: string }[];
}

function EditModal({ flow, isNew = false, onSave, onClose, funnelStages }: EditModalProps) {
  const [name, setName] = useState(flow.name);
  const [description, setDescription] = useState(flow.description);
  const [trigger, setTrigger] = useState<TriggerType>(flow.trigger);
  const [steps, setSteps] = useState<FlowStep[]>(flow.steps.map(s => ({ ...s, config: s.config ?? {} })));
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);

  // Trigger-specific config state (parsed from existing triggerLabel on first render)
  const [triggerStage, setTriggerStage] = useState<string>(() => {
    if (flow.trigger !== 'funnel_stage') return funnelStages[0]?.value ?? 'novo';
    // Match by raw value first (new format: 'negociacao +3 dias')
    const byValue = funnelStages.find(s => flow.triggerLabel.toLowerCase().startsWith(s.value.toLowerCase()));
    if (byValue) return byValue.value;
    // Match by label (old format: 'Em Negociação +3 dias')
    const byLabel = funnelStages.find(s => flow.triggerLabel.toLowerCase().includes(s.label.toLowerCase()));
    return byLabel?.value ?? funnelStages[0]?.value ?? 'novo';
  });
  const [triggerDays, setTriggerDays] = useState<string>(() => {
    const m = flow.triggerLabel.match(/\+(\d+)/);
    return m ? m[1] : '3';
  });
  const [triggerTag, setTriggerTag] = useState<string>(() => {
    const m = flow.triggerLabel.match(/Tag:\s*(.+)/i);
    return m ? m[1].trim() : '';
  });
  const [triggerScore, setTriggerScore] = useState<string>(() => {
    const m = flow.triggerLabel.match(/(\d+)/);
    return m ? m[1] : '80';
  });

  // Derive triggerLabel from structured config.
  // IMPORTANT: for funnel_stage we store the RAW DB value (e.g. 'negociacao +3 dias')
  // so the backend can match it with a simple ILIKE comparison.
  // The display helper normalizeTriggerLabel() converts it to human-readable.
  const computedTriggerLabel = (): string => {
    switch (trigger) {
      case 'funnel_stage':
        // store raw value: 'negociacao +3 dias'
        return `${triggerStage} +${triggerDays || '3'} dias`;
      case 'inactivity': return `Inatividade +${triggerDays || '7'} dias`;
      case 'tag': return triggerTag ? `Tag: ${triggerTag}` : 'Tag aplicada';
      case 'lead_score': return `Score ≥ ${triggerScore || '80'}`;
      case 'purchase': return 'Compra realizada';
      default: return trigger;
    }
  };

  const handleChangeTrigger = (val: TriggerType) => {
    setTrigger(val);
    // reset days to sensible default per type
    if (val === 'inactivity') setTriggerDays('7');
    if (val === 'funnel_stage') setTriggerDays('3');
  };

  // ── Step helpers ──────────────────────────────────────────────────────────
  const addStep = () => {
    const id = `s-${Date.now()}`;
    setSteps(prev => [...prev, { id, type: 'whatsapp', label: 'Mensagem WhatsApp', config: {} }]);
    setExpandedStepId(id);
  };

  const removeStep = (id: string) => setSteps(prev => prev.filter(s => s.id !== id));

  const updateStepType = (id: string, type: ActionType) => {
    setSteps(prev => prev.map(s => {
      if (s.id !== id) return s;
      const config = {};
      return { ...s, type, config, label: stepLabel(type, config) };
    }));
  };

  const updateStepConfig = (id: string, key: string, value: string) => {
    setSteps(prev => prev.map(s => {
      if (s.id !== id) return s;
      const config = { ...(s.config ?? {}), [key]: value };
      return { ...s, config, label: stepLabel(s.type, config) };
    }));
  };

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({ ...flow, name: name.trim(), description, trigger, triggerLabel: computedTriggerLabel(), steps });
  };

  const inputCls = 'flex-1 h-8 px-2 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary';
  const selectCls = 'h-8 px-2 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary';

  return (
    <AppModal
      open
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      className="p-0 gap-0 max-h-[90vh] flex flex-col"
      title={
        <div className="flex items-center gap-2">
          <span>{isNew ? 'Novo fluxo' : 'Editar fluxo'}</span>
        </div>
      }
      footer={
        <>
          <AppButton variant="outline" onClick={onClose}>Cancelar</AppButton>
          <AppButton onClick={handleSave} disabled={!name.trim()}>Guardar</AppButton>
        </>
      }
    >
        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Nome do fluxo</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Nome do fluxo"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Descrição</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              placeholder="Descreva o objetivo do fluxo"
            />
          </div>

          {/* Trigger */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Gatilho</label>
            <select
              value={trigger}
              onChange={e => handleChangeTrigger(e.target.value as TriggerType)}
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {TRIGGER_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            {/* Trigger description */}
            <p className="text-[11px] text-muted-foreground flex items-start gap-1">
              <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
              {TRIGGER_OPTIONS.find(o => o.value === trigger)?.description}
            </p>

            {/* Context-aware trigger detail */}
            {trigger === 'funnel_stage' && (
              <div className="flex gap-2 items-center">
                <select
                  value={triggerStage}
                  onChange={e => setTriggerStage(e.target.value)}
                  className="flex-1 h-9 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {funnelStages.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-xs text-muted-foreground">parado há +</span>
                  <input
                    type="number" min="1" value={triggerDays}
                    onChange={e => setTriggerDays(e.target.value)}
                    className="w-14 h-9 px-2 rounded-lg border border-border bg-background text-sm text-center text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <span className="text-xs text-muted-foreground">dias</span>
                </div>
              </div>
            )}
            {trigger === 'inactivity' && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Lead inativo há mais de</span>
                <input
                  type="number" min="1" value={triggerDays}
                  onChange={e => setTriggerDays(e.target.value)}
                  className="w-16 h-8 px-2 rounded-lg border border-border bg-background text-sm text-center text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="text-xs text-muted-foreground">dias</span>
              </div>
            )}
            {trigger === 'tag' && (
              <input
                value={triggerTag}
                onChange={e => setTriggerTag(e.target.value)}
                placeholder="Nome da tag (ex: cliente-vip)"
                className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            )}
            {trigger === 'lead_score' && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Score mínimo ≥</span>
                <input
                  type="number" min="1" max="100" value={triggerScore}
                  onChange={e => setTriggerScore(e.target.value)}
                  className="w-20 h-8 px-2 rounded-lg border border-border bg-background text-sm text-center text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="text-xs text-muted-foreground">pontos (0–100)</span>
              </div>
            )}
            {trigger === 'purchase' && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <Info className="w-3 h-3" />
                Dispara automaticamente quando marcar o lead como <strong>Convertido</strong> no Kanban ou no perfil do lead.
              </p>
            )}
          </div>

          {/* Steps */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">Passos da sequência</label>
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
            {steps.map((step) => {
              const StepIcon = STEP_ICONS[step.type];
              const colorClass = STEP_COLORS[step.type];
              const cfg = step.config ?? {};
              const isExpanded = expandedStepId === step.id;
              const stepTypeLabel = ACTION_OPTIONS.find(o => o.value === step.type)?.label || 'Ação';

              return (
                <div key={step.id} className={`flex flex-col rounded-lg border transition-all ${isExpanded ? 'border-primary ring-1 ring-primary/20 shadow-sm' : 'border-border hover:border-primary/50'}`}>
                  {/* Header (Click to expand) */}
                  <div 
                    className="flex items-center gap-3 p-2.5 cursor-pointer"
                    onClick={() => setExpandedStepId(isExpanded ? null : step.id)}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                      <StepIcon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <div className="text-sm font-medium text-foreground leading-tight">{stepTypeLabel}</div>
                      {!isExpanded && (
                        <div className="text-xs text-muted-foreground truncate mt-0.5">
                          {stepLabel(step.type, cfg)}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeStep(step.id); }}
                      className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors flex-shrink-0 p-1.5 rounded-md"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Expanded Body */}
                  {isExpanded && (
                    <div className="p-3 pt-0 border-t border-border/50 bg-muted/10 flex flex-col gap-3 rounded-b-lg mt-1">
                      <div className="pt-3">
                        <select
                          value={step.type}
                          onChange={e => updateStepType(step.id, e.target.value as ActionType)}
                          className={`${selectCls} w-full`}
                        >
                          {ACTION_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>

                      {/* Type-specific config */}
                      {(step.type === 'whatsapp' || step.type === 'facebook' || step.type === 'instagram' || step.type === 'telegram') && (
                        <textarea
                          rows={2}
                          value={cfg.message ?? ''}
                          onChange={e => updateStepConfig(step.id, 'message', e.target.value)}
                          placeholder={`Digite a mensagem ${step.type === 'facebook' ? 'Facebook' :
                              step.type === 'instagram' ? 'Instagram' :
                                step.type === 'telegram' ? 'Telegram' : 'WhatsApp'
                            }…`}
                          className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                        />
                      )}
                      {step.type === 'ab_test' && (
                        <div className="flex flex-col gap-2">
                          <textarea
                            rows={2}
                            value={cfg.messageA ?? ''}
                            onChange={e => updateStepConfig(step.id, 'messageA', e.target.value)}
                            placeholder="Variante A (50% dos leads)..."
                            className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                          />
                          <textarea
                            rows={2}
                            value={cfg.messageB ?? ''}
                            onChange={e => updateStepConfig(step.id, 'messageB', e.target.value)}
                            placeholder="Variante B (50% dos leads)..."
                            className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                          />
                        </div>
                      )}
                      {step.type === 'dynamic_audio' && (
                        <div className="flex flex-col gap-2">
                          <textarea
                            rows={2}
                            value={cfg.text ?? ''}
                            onChange={e => updateStepConfig(step.id, 'text', e.target.value)}
                            placeholder="Digite o texto que a IA vai falar (use {{nome}} para personalizar)..."
                            className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                          />
                        </div>
                      )}
                      {step.type === 'email' && (
                        <input
                          value={cfg.subject ?? ''}
                          onChange={e => updateStepConfig(step.id, 'subject', e.target.value)}
                          placeholder="Assunto do email"
                          className={`${inputCls} w-full`}
                        />
                      )}
                      {step.type === 'wait' && (
                        <div className="flex items-center gap-2">
                          <input
                            type="number" min="1"
                            value={cfg.duration ?? ''}
                            onChange={e => updateStepConfig(step.id, 'duration', e.target.value)}
                            placeholder="1"
                            className={`${selectCls} w-20`}
                          />
                          <select
                            value={cfg.unit ?? 'dias'}
                            onChange={e => updateStepConfig(step.id, 'unit', e.target.value)}
                            className={selectCls}
                          >
                            <option value="minutos">minutos</option>
                            <option value="horas">horas</option>
                            <option value="dias">dias</option>
                            <option value="semanas">semanas</option>
                          </select>
                        </div>
                      )}
                      {step.type === 'tag' && (
                        <input
                          value={cfg.tag ?? ''}
                          onChange={e => updateStepConfig(step.id, 'tag', e.target.value)}
                          placeholder="Nome da tag (ex: cliente-vip)"
                          className={`${inputCls} w-full`}
                        />
                      )}
                      {step.type === 'move_stage' && (
                        <select
                          value={cfg.stage ?? 'negociacao'}
                          onChange={e => updateStepConfig(step.id, 'stage', e.target.value)}
                          className={`${selectCls} w-full`}
                        >
                          {FUNNEL_STAGES.map(s => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                      )}
                      {step.type === 'condition' && (
                        <input
                          value={cfg.condition ?? ''}
                          onChange={e => updateStepConfig(step.id, 'condition', e.target.value)}
                          placeholder="Ex: Respondeu a mensagem"
                          className={`${inputCls} w-full`}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
    </AppModal>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RemarketingPage() {
  const [flows, setFlows] = useState<RemarketingFlow[]>([]);
  const [activeTab, setActiveTab] = useState<'flows' | 'templates'>('flows');
  const [selectedTemplate, setSelectedTemplate] = useState<typeof TEMPLATES[0] | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingFlow, setEditingFlow] = useState<RemarketingFlow | null>(null);
  const [analysisFlow, setAnalysisFlow] = useState<RemarketingFlow | null>(null);

  // ── Dynamic funnel stages from the real leads table ───────────────────────
  const [funnelStages, setFunnelStages] = useState<{ value: string; label: string }[]>(DEFAULT_FUNNEL_STAGES);

  useEffect(() => {
    api.leads.funnelStages()
      .then(rows => {
        const LABEL_MAP: Record<string, string> = {
          novo: 'Novo lead',
          contatado: 'Contatado',
          qualificado: 'Qualificado',
          negociacao: 'Em Negociação',
          convertido: 'Convertido',
          perdido: 'Perdido',
        };

        // Start with all defaults, then add any custom stages from the API not already in defaults
        const defaultValues = new Set(DEFAULT_FUNNEL_STAGES.map(s => s.value));
        const extra = (rows || [])
          .filter(r => !defaultValues.has(r.value))
          .map(r => ({
            value: r.value,
            label: LABEL_MAP[r.value] ?? (r.value.charAt(0).toUpperCase() + r.value.slice(1)),
          }));

        const merged = [...DEFAULT_FUNNEL_STAGES, ...extra];
        setFunnelStages(merged);
        FUNNEL_STAGES = merged;
      })
      .catch(() => { /* keep defaults */ });
  }, []);

  // ── Persist helper — keeps localStorage in sync with every state update ──
  const updateFlows = useCallback((updater: (prev: RemarketingFlow[]) => RemarketingFlow[]) => {
    setFlows(prev => {
      const next = updater(prev);
      saveLocal(next);
      return next;
    });
  }, []);

  // Eliminados nesta sessão: uma atualização já a caminho não os traz de volta
  const deletedIdsRef = useRef(new Set<string>());
  const confirm = useConfirm();

  // ── Load on mount: try API, fall back to localStorage ────────────────────
  const fetchFlows = useCallback(async (silent = false) => {
    try {
      const data = await api.remarketing.list();
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
      const local = loadLocal();
      // O servidor manda: da cópia local só ficam os fluxos que ainda não chegaram lá (id
      // temporário). Antes, com o servidor vazio, voltavam os fluxos já eliminados.
      const merged = [
        ...local.filter(f => f.id.startsWith('flow-')),
        ...mapped.filter(f => !deletedIdsRef.current.has(f.id)),
      ];
      setFlows(merged);
      saveLocal(merged);
      return { mapped, local };
    } catch {
      if (!silent) setFlows(loadLocal());
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchFlows();
      if (cancelled) return;

      // Sync local-only flows (temp ids) to backend
      if (result && result.mapped.length === 0 && result.local.length > 0) {
        for (const f of result.local) {
          if (!f.id.startsWith('flow-')) continue;
          try {
            const created = await api.remarketing.create({
              name: f.name,
              description: f.description,
              status: f.status,
              trigger_type: f.trigger,
              trigger_label: f.triggerLabel,
              steps: f.steps,
              template_id: f.templateId,
            });
            setFlows(prev => {
              const next = prev.map(x => x.id === f.id ? { ...x, id: created.id, createdAt: created.created_at } : x);
              saveLocal(next);
              return next;
            });
          } catch { /* keep local id */ }
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [fetchFlows]);

  // ── Auto-refresh stats (enrolled_leads / conversions) every 30s ──────────
  useEffect(() => {
    const id = setInterval(() => { fetchFlows(true); }, 30_000);
    return () => clearInterval(id);
  }, [fetchFlows]);

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

  const handleDelete = async (flow: RemarketingFlow) => {
    const ok = await confirm(`Eliminar "${flow.name || 'Sem nome'}"?`, { title: 'Eliminar fluxo', variant: 'danger', confirmLabel: 'Eliminar' });
    if (!ok) return;
    deletedIdsRef.current.add(flow.id);
    updateFlows(prev => prev.filter(f => f.id !== flow.id));
    // Ainda só existe neste aparelho
    if (flow.id.startsWith('flow-')) return;
    try {
      await api.remarketing.delete(flow.id);
      toast.success('Fluxo eliminado');
    } catch (err: any) {
      // Já não existe no servidor (eliminado noutro aparelho): está feito
      if (/not found/i.test(err?.message || '')) return;
      deletedIdsRef.current.delete(flow.id);
      updateFlows(prev => [flow, ...prev]);
      toast.error('Não foi possível eliminar o fluxo');
    }
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

  const handleCreateBlank = () => {
    const blank: RemarketingFlow = {
      id: `flow-${Date.now()}`,
      name: '',
      description: '',
      status: 'draft',
      trigger: 'inactivity',
      triggerLabel: '',
      steps: [],
      enrolledLeads: 0,
      conversions: 0,
      createdAt: new Date().toISOString(),
    };
    setEditingFlow(blank);
  };

  const handleSaveEdit = async (updated: RemarketingFlow) => {
    // New flow (created blank) — add to list
    const isNew = !flows.some(f => f.id === updated.id);
    if (isNew) {
      updateFlows(prev => [updated, ...prev]);
      setActiveTab('flows');
      setEditingFlow(null);
      try {
        const created = await api.remarketing.create({
          name: updated.name,
          description: updated.description,
          status: updated.status,
          trigger_type: updated.trigger,
          trigger_label: updated.triggerLabel,
          steps: updated.steps,
        });
        updateFlows(prev => prev.map(f =>
          f.id === updated.id ? { ...f, id: created.id, createdAt: created.created_at } : f
        ));
      } catch (err: any) {
        console.error('[Remarketing] ❌ Falha ao salvar flow na API:', err);
        // Show the real error so we can diagnose it
        const msg = err?.message || JSON.stringify(err);
        toast.error(`Fluxo guardado localmente. Erro da API: ${msg}`);
      }
      return;
    }
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
    } catch (err: any) {
      console.error('[Remarketing] ❌ Falha ao atualizar flow na API:', err);
      const msg = err?.message || JSON.stringify(err);
      toast.error(`Erro ao guardar no servidor: ${msg}`);
    }
  };

  // ── Force-sync localStorage flows → DB ───────────────────────────────────
  const [syncing, setSyncing] = useState(false);
  const syncToDB = async () => {
    setSyncing(true);
    let ok = 0, fail = 0;
    for (const f of flows) {
      // Only push flows that still have a local temp ID
      if (!f.id.startsWith('flow-')) continue;
      try {
        const created = await api.remarketing.create({
          name: f.name,
          description: f.description,
          status: f.status,
          trigger_type: f.trigger,
          trigger_label: f.triggerLabel,
          steps: f.steps,
        });
        updateFlows(prev => prev.map(x =>
          x.id === f.id ? { ...x, id: created.id, createdAt: created.created_at } : x
        ));
        ok++;
      } catch (err: any) {
        console.error('[Remarketing] Sync error for flow', f.name, err);
        fail++;
      }
    }
    setSyncing(false);
    if (ok > 0) toast.success(`${ok} fluxo(s) sincronizados com o servidor!`);
    if (fail > 0) toast.error(`${fail} fluxo(s) falharam — veja o console para detalhes.`);
    if (ok === 0 && fail === 0) toast.info('Todos os fluxos já estão no servidor.');
    fetchFlows(true);
  };

  return (
    <>
      <div className="w-full">
        <main className="space-y-6">

          <PageHeader
            title="Remarketing"
            description="Fluxos automáticos para reativar leads"
            icon={Repeat2}
            actions={<PageAction icon={UploadCloud} label={syncing ? 'A sincronizar…' : 'Sincronizar'} onClick={syncToDB} disabled={syncing} />}
            create={{ label: 'Novo fluxo', onClick: handleCreateBlank }}
          />


          {/* Tabs */}
          <div className="flex gap-1 border-b border-border">
            {(['flows', 'templates'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${activeTab === tab
                    ? 'border-foreground text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
              >
                {tab === 'flows' && `Os meus fluxos (${flows.length})`}
                {tab === 'templates' && 'Modelos'}
              </button>
            ))}
          </div>

          {/* ── FLOWS TAB ── */}
          {activeTab === 'flows' && (
            <>
              {loading && flows.length === 0 ? (
                <div className="grid gap-4">
                  {Array.from({ length: 3 }).map((_, i) => <SkeletonFlowCard key={i} />)}
                </div>
              ) : flows.length === 0 ? (
                <EmptyState
                  icon={GitBranch}
                  title="Ainda sem fluxos"
                  description="Comece por um modelo ou crie um fluxo do zero."
                  action={<PageAction variant="primary" icon={Layers} label="Ver modelos" onClick={() => setActiveTab('templates')} />}
                />
              ) : (
                <>
                  {loading && (
                    <div className="flex items-center justify-end mb-2">
                      <UpdatingBadge />
                    </div>
                  )}
                <div className="grid gap-4">
                  {flows.map(flow => {
                    const convRate = flow.enrolledLeads >= MIN_ENROLLED_FOR_RATE
                      ? Math.round((Math.min(flow.conversions, flow.enrolledLeads) / flow.enrolledLeads) * 100)
                      : null;
                    return (
                      <DashboardCard key={flow.id} disableContentPadding className="hover:border-border/80 transition-all">
                        <div className="p-5">
                        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                          {/* Left */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="font-semibold text-foreground text-sm">{flow.name}</span>
                              <StatusBadge
                                label={flow.status === 'active' ? 'Ativo' : flow.status === 'paused' ? 'Pausado' : 'Rascunho'}
                                tone={flow.status === 'active' ? 'success' : flow.status === 'paused' ? 'warning' : 'default'}
                              />
                            </div>
                            

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
                                      <span>{STEP_NAMES[step.type] || step.label.split(':')[0]}</span>
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
                              {convRate === null ? (
                                <>
                                  <p className="text-lg font-semibold text-muted-foreground">—</p>
                                  <p className="text-[11px] text-muted-foreground">dados insuficientes</p>
                                </>
                              ) : (
                                <p className="text-lg font-semibold text-foreground">{convRate}%</p>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border">
                          <AppButton
                            size="sm"
                            variant="outline"
                            onClick={() => handleToggleStatus(flow.id)}
                          >
                            {flow.status === 'active'
                              ? <><Pause className="w-3.5 h-3.5" /> Pausar</>
                              : <><Play className="w-3.5 h-3.5" /> Ativar</>
                            }
                          </AppButton>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <AppButton size="sm" variant="ghost" className="ml-auto" aria-label="Mais ações">
                                <MoreHorizontal className="w-4 h-4" />
                              </AppButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setEditingFlow(flow)}>
                                <Pencil className="w-4 h-4 mr-2" /> Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDuplicate(flow)}>
                                <Copy className="w-4 h-4 mr-2" /> Duplicar
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setAnalysisFlow(flow)}>
                                <BarChart3 className="w-4 h-4 mr-2" /> Ver análise
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <AppButton
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            aria-label="Eliminar fluxo"
                            title="Eliminar fluxo"
                            onClick={() => handleDelete(flow)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </AppButton>
                        </div>
                        </div>
                      </DashboardCard>
                    );
                  })}
                </div>
                </>
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
                        Usar Modelo
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Edit modal */}
      <AppModal
        open={!!analysisFlow}
        onOpenChange={(o) => !o && setAnalysisFlow(null)}
        size="sm"
        title="Análise do fluxo"
        description={analysisFlow?.name}
      >
        {analysisFlow && (
          <dl className="divide-y divide-border">
            <div className="flex items-center justify-between py-3">
              <dt className="text-sm text-muted-foreground">Leads inscritos</dt>
              <dd className="text-sm font-semibold tabular-nums text-foreground">{formatNumber(analysisFlow.enrolledLeads)}</dd>
            </div>
            <div className="flex items-center justify-between py-3">
              <dt className="text-sm text-muted-foreground">Convertidos</dt>
              <dd className="text-sm font-semibold tabular-nums text-foreground">{formatNumber(Math.min(analysisFlow.conversions, analysisFlow.enrolledLeads))}</dd>
            </div>
            <div className="flex items-center justify-between py-3">
              <dt className="text-sm text-muted-foreground">Taxa de conversão</dt>
              <dd className="text-sm font-semibold tabular-nums text-foreground">
                {analysisFlow.enrolledLeads >= MIN_ENROLLED_FOR_RATE
                  ? formatPercent((Math.min(analysisFlow.conversions, analysisFlow.enrolledLeads) / analysisFlow.enrolledLeads) * 100)
                  : <span className="font-normal text-muted-foreground">— dados insuficientes</span>}
              </dd>
            </div>
          </dl>
        )}
      </AppModal>

      {editingFlow && (
        <EditModal
          flow={editingFlow}
          isNew={!flows.some(f => f.id === editingFlow.id)}
          onSave={handleSaveEdit}
          onClose={() => setEditingFlow(null)}
          funnelStages={funnelStages}
        />
      )}
    </>
  );
}
