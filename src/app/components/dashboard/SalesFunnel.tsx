import { useState, useMemo, useCallback, useEffect, useRef, memo, useContext } from 'react';
import { formatMoney } from '../../utils/format';
import { OverlayModal } from '../base/OverlayModal';
import { AppModal } from '../base/AppModal';
import { getOriginInfo, leadDisplayName } from './leadDisplay';
import type { UIEvent } from 'react';
import { DndContext, DragEndEvent, DragOverlay, closestCenter, MouseSensor, TouchSensor, useSensor, useSensors, useDroppable, DragStartEvent, useDraggable, DragOverEvent, KeyboardSensor } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, horizontalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Trash2, Edit2, MoreVertical, ChevronDown, GripVertical, Settings, Plus, X, RotateCcw, Briefcase, Home, ShoppingCart, Wrench, Monitor, Users2, MoveRight, Workflow, CalendarClock, type LucideIcon, MoreHorizontal } from 'lucide-react';
import { PageHeader, PageAction } from '../base/PageHeader';
import { haptic } from '../../../native';
import type { TabKey } from '../modals/LeadDetailModal';
import { FunnelReminders, LeadRemindersContext, useLeadReminders, reminderLabel, isOverdue } from './FunnelReminders';
import { Button } from '../ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';

// Moedas suportadas; por omissão usa-se a moeda da conta (utils/format.ts)
export type CurrencyCode = 'USD' | 'MZN' | 'BRL';

// Default funnel stages with colors
const DEFAULT_FUNNEL_STAGES = [
  { id: 'novo', label: 'Novos', color: 'bg-cyan-500', borderColor: 'border-l-cyan-500', glowColor: 'shadow-cyan-500/20', iconColor: 'text-cyan-400', badgeBg: 'bg-cyan-500/10', badgeText: 'text-cyan-400' },
  { id: 'contatado', label: 'Contactados', color: 'bg-purple-500', borderColor: 'border-l-purple-500', glowColor: 'shadow-purple-500/20', iconColor: 'text-purple-400', badgeBg: 'bg-purple-500/10', badgeText: 'text-purple-400' },
  { id: 'qualificado', label: 'Qualificados', color: 'bg-yellow-500', borderColor: 'border-l-yellow-500', glowColor: 'shadow-yellow-500/20', iconColor: 'text-yellow-400', badgeBg: 'bg-yellow-500/10', badgeText: 'text-yellow-400' },
  { id: 'negociacao', label: 'Negociação', color: 'bg-orange-500', borderColor: 'border-l-orange-500', glowColor: 'shadow-orange-500/20', iconColor: 'text-orange-400', badgeBg: 'bg-orange-500/10', badgeText: 'text-orange-400' },
  { id: 'convertido', label: 'Convertidos', color: 'bg-green-500', borderColor: 'border-l-green-500', glowColor: 'shadow-green-500/20', iconColor: 'text-green-400', badgeBg: 'bg-green-500/10', badgeText: 'text-green-400' },
  { id: 'perdido', label: 'Perdidos', color: 'bg-red-500', borderColor: 'border-l-red-500', glowColor: 'shadow-red-500/20', iconColor: 'text-red-400', badgeBg: 'bg-red-500/10', badgeText: 'text-red-400' },
];

// Pre-configured funnel templates
export const FUNNEL_TEMPLATES: Record<string, { name: string; description: string; icon: LucideIcon; iconColor: string; stages: FunnelStage[] }> = {
  vendas: {
    name: 'Vendas B2B',
    description: 'Funil clássico para vendas corporativas',
    icon: Briefcase,
    iconColor: 'text-amber-500',
    stages: [
      { id: 'lead', label: 'Leads', color: 'bg-cyan-500', borderColor: 'border-l-cyan-500', glowColor: 'shadow-cyan-500/20', iconColor: 'text-cyan-400', badgeBg: 'bg-cyan-500/10', badgeText: 'text-cyan-400' },
      { id: 'qualificacao', label: 'Qualificação', color: 'bg-purple-500', borderColor: 'border-l-purple-500', glowColor: 'shadow-purple-500/20', iconColor: 'text-purple-400', badgeBg: 'bg-purple-500/10', badgeText: 'text-purple-400' },
      { id: 'proposta', label: 'Proposta', color: 'bg-yellow-500', borderColor: 'border-l-yellow-500', glowColor: 'shadow-yellow-500/20', iconColor: 'text-yellow-400', badgeBg: 'bg-yellow-500/10', badgeText: 'text-yellow-400' },
      { id: 'negociacao', label: 'Negociação', color: 'bg-orange-500', borderColor: 'border-l-orange-500', glowColor: 'shadow-orange-500/20', iconColor: 'text-orange-400', badgeBg: 'bg-orange-500/10', badgeText: 'text-orange-400' },
      { id: 'fechamento', label: 'Fechamento', color: 'bg-green-500', borderColor: 'border-l-green-500', glowColor: 'shadow-green-500/20', iconColor: 'text-green-400', badgeBg: 'bg-green-500/10', badgeText: 'text-green-400' },
      { id: 'perdido', label: 'Perdidos', color: 'bg-red-500', borderColor: 'border-l-red-500', glowColor: 'shadow-red-500/20', iconColor: 'text-red-400', badgeBg: 'bg-red-500/10', badgeText: 'text-red-400' },
    ]
  },
  imobiliario: {
    name: 'Imobiliário',
    description: 'Ideal para corretores e imobiliárias',
    icon: Home,
    iconColor: 'text-orange-500',
    stages: [
      { id: 'interessado', label: 'Interessados', color: 'bg-cyan-500', borderColor: 'border-l-cyan-500', glowColor: 'shadow-cyan-500/20', iconColor: 'text-cyan-400', badgeBg: 'bg-cyan-500/10', badgeText: 'text-cyan-400' },
      { id: 'visita', label: 'Visita Agendada', color: 'bg-purple-500', borderColor: 'border-l-purple-500', glowColor: 'shadow-purple-500/20', iconColor: 'text-purple-400', badgeBg: 'bg-purple-500/10', badgeText: 'text-purple-400' },
      { id: 'analise', label: 'Análise Crédito', color: 'bg-yellow-500', borderColor: 'border-l-yellow-500', glowColor: 'shadow-yellow-500/20', iconColor: 'text-yellow-400', badgeBg: 'bg-yellow-500/10', badgeText: 'text-yellow-400' },
      { id: 'documentacao', label: 'Documentação', color: 'bg-orange-500', borderColor: 'border-l-orange-500', glowColor: 'shadow-orange-500/20', iconColor: 'text-orange-400', badgeBg: 'bg-orange-500/10', badgeText: 'text-orange-400' },
      { id: 'contrato', label: 'Contrato', color: 'bg-indigo-500', borderColor: 'border-l-indigo-500', glowColor: 'shadow-indigo-500/20', iconColor: 'text-indigo-400', badgeBg: 'bg-indigo-500/10', badgeText: 'text-indigo-400' },
      { id: 'vendido', label: 'Vendido', color: 'bg-green-500', borderColor: 'border-l-green-500', glowColor: 'shadow-green-500/20', iconColor: 'text-green-400', badgeBg: 'bg-green-500/10', badgeText: 'text-green-400' },
    ]
  },
  ecommerce: {
    name: 'E-commerce',
    description: 'Para lojas online e dropshipping',
    icon: ShoppingCart,
    iconColor: 'text-blue-500',
    stages: [
      { id: 'visitante', label: 'Visitantes', color: 'bg-cyan-500', borderColor: 'border-l-cyan-500', glowColor: 'shadow-cyan-500/20', iconColor: 'text-cyan-400', badgeBg: 'bg-cyan-500/10', badgeText: 'text-cyan-400' },
      { id: 'carrinho', label: 'Carrinho', color: 'bg-purple-500', borderColor: 'border-l-purple-500', glowColor: 'shadow-purple-500/20', iconColor: 'text-purple-400', badgeBg: 'bg-purple-500/10', badgeText: 'text-purple-400' },
      { id: 'checkout', label: 'Checkout', color: 'bg-yellow-500', borderColor: 'border-l-yellow-500', glowColor: 'shadow-yellow-500/20', iconColor: 'text-yellow-400', badgeBg: 'bg-yellow-500/10', badgeText: 'text-yellow-400' },
      { id: 'pagamento', label: 'Pagamento', color: 'bg-orange-500', borderColor: 'border-l-orange-500', glowColor: 'shadow-orange-500/20', iconColor: 'text-orange-400', badgeBg: 'bg-orange-500/10', badgeText: 'text-orange-400' },
      { id: 'enviado', label: 'Enviado', color: 'bg-indigo-500', borderColor: 'border-l-indigo-500', glowColor: 'shadow-indigo-500/20', iconColor: 'text-indigo-400', badgeBg: 'bg-indigo-500/10', badgeText: 'text-indigo-400' },
      { id: 'entregue', label: 'Entregue', color: 'bg-green-500', borderColor: 'border-l-green-500', glowColor: 'shadow-green-500/20', iconColor: 'text-green-400', badgeBg: 'bg-green-500/10', badgeText: 'text-green-400' },
    ]
  },
  servicos: {
    name: 'Serviços',
    description: 'Para prestadores de serviços',
    icon: Wrench,
    iconColor: 'text-gray-400',
    stages: [
      { id: 'contato', label: 'Primeiro Contacto', color: 'bg-cyan-500', borderColor: 'border-l-cyan-500', glowColor: 'shadow-cyan-500/20', iconColor: 'text-cyan-400', badgeBg: 'bg-cyan-500/10', badgeText: 'text-cyan-400' },
      { id: 'orcamento', label: 'Orçamento', color: 'bg-purple-500', borderColor: 'border-l-purple-500', glowColor: 'shadow-purple-500/20', iconColor: 'text-purple-400', badgeBg: 'bg-purple-500/10', badgeText: 'text-purple-400' },
      { id: 'aprovado', label: 'Aprovado', color: 'bg-yellow-500', borderColor: 'border-l-yellow-500', glowColor: 'shadow-yellow-500/20', iconColor: 'text-yellow-400', badgeBg: 'bg-yellow-500/10', badgeText: 'text-yellow-400' },
      { id: 'execucao', label: 'Em Execução', color: 'bg-orange-500', borderColor: 'border-l-orange-500', glowColor: 'shadow-orange-500/20', iconColor: 'text-orange-400', badgeBg: 'bg-orange-500/10', badgeText: 'text-orange-400' },
      { id: 'concluido', label: 'Concluído', color: 'bg-green-500', borderColor: 'border-l-green-500', glowColor: 'shadow-green-500/20', iconColor: 'text-green-400', badgeBg: 'bg-green-500/10', badgeText: 'text-green-400' },
    ]
  },
  saas: {
    name: 'SaaS / Software',
    description: 'Para empresas de software e SaaS',
    icon: Monitor,
    iconColor: 'text-cyan-500',
    stages: [
      { id: 'trial', label: 'Trial', color: 'bg-cyan-500', borderColor: 'border-l-cyan-500', glowColor: 'shadow-cyan-500/20', iconColor: 'text-cyan-400', badgeBg: 'bg-cyan-500/10', badgeText: 'text-cyan-400' },
      { id: 'onboarding', label: 'Onboarding', color: 'bg-purple-500', borderColor: 'border-l-purple-500', glowColor: 'shadow-purple-500/20', iconColor: 'text-purple-400', badgeBg: 'bg-purple-500/10', badgeText: 'text-purple-400' },
      { id: 'ativo', label: 'Ativo', color: 'bg-green-500', borderColor: 'border-l-green-500', glowColor: 'shadow-green-500/20', iconColor: 'text-green-400', badgeBg: 'bg-green-500/10', badgeText: 'text-green-400' },
      { id: 'upsell', label: 'Upsell', color: 'bg-yellow-500', borderColor: 'border-l-yellow-500', glowColor: 'shadow-yellow-500/20', iconColor: 'text-yellow-400', badgeBg: 'bg-yellow-500/10', badgeText: 'text-yellow-400' },
      { id: 'churn', label: 'Em Risco', color: 'bg-orange-500', borderColor: 'border-l-orange-500', glowColor: 'shadow-orange-500/20', iconColor: 'text-orange-400', badgeBg: 'bg-orange-500/10', badgeText: 'text-orange-400' },
      { id: 'cancelado', label: 'Cancelado', color: 'bg-red-500', borderColor: 'border-l-red-500', glowColor: 'shadow-red-500/20', iconColor: 'text-red-400', badgeBg: 'bg-red-500/10', badgeText: 'text-red-400' },
    ]
  },
  recrutamento: {
    name: 'Recrutamento',
    description: 'Para RH e agências de recrutamento',
    icon: Users2,
    iconColor: 'text-purple-500',
    stages: [
      { id: 'candidato', label: 'Candidatos', color: 'bg-cyan-500', borderColor: 'border-l-cyan-500', glowColor: 'shadow-cyan-500/20', iconColor: 'text-cyan-400', badgeBg: 'bg-cyan-500/10', badgeText: 'text-cyan-400' },
      { id: 'triagem', label: 'Triagem', color: 'bg-purple-500', borderColor: 'border-l-purple-500', glowColor: 'shadow-purple-500/20', iconColor: 'text-purple-400', badgeBg: 'bg-purple-500/10', badgeText: 'text-purple-400' },
      { id: 'entrevista', label: 'Entrevista', color: 'bg-yellow-500', borderColor: 'border-l-yellow-500', glowColor: 'shadow-yellow-500/20', iconColor: 'text-yellow-400', badgeBg: 'bg-yellow-500/10', badgeText: 'text-yellow-400' },
      { id: 'teste', label: 'Teste Técnico', color: 'bg-orange-500', borderColor: 'border-l-orange-500', glowColor: 'shadow-orange-500/20', iconColor: 'text-orange-400', badgeBg: 'bg-orange-500/10', badgeText: 'text-orange-400' },
      { id: 'proposta', label: 'Proposta', color: 'bg-indigo-500', borderColor: 'border-l-indigo-500', glowColor: 'shadow-indigo-500/20', iconColor: 'text-indigo-400', badgeBg: 'bg-indigo-500/10', badgeText: 'text-indigo-400' },
      { id: 'contratado', label: 'Contratado', color: 'bg-green-500', borderColor: 'border-l-green-500', glowColor: 'shadow-green-500/20', iconColor: 'text-green-400', badgeBg: 'bg-green-500/10', badgeText: 'text-green-400' },
    ]
  },
};

// Available colors for custom stages
const STAGE_COLORS = [
  { name: 'Ciano', color: 'bg-cyan-500', borderColor: 'border-l-cyan-500', glowColor: 'shadow-cyan-500/20', iconColor: 'text-cyan-400', badgeBg: 'bg-cyan-500/10', badgeText: 'text-cyan-400' },
  { name: 'Roxo', color: 'bg-purple-500', borderColor: 'border-l-purple-500', glowColor: 'shadow-purple-500/20', iconColor: 'text-purple-400', badgeBg: 'bg-purple-500/10', badgeText: 'text-purple-400' },
  { name: 'Amarelo', color: 'bg-yellow-500', borderColor: 'border-l-yellow-500', glowColor: 'shadow-yellow-500/20', iconColor: 'text-yellow-400', badgeBg: 'bg-yellow-500/10', badgeText: 'text-yellow-400' },
  { name: 'Laranja', color: 'bg-orange-500', borderColor: 'border-l-orange-500', glowColor: 'shadow-orange-500/20', iconColor: 'text-orange-400', badgeBg: 'bg-orange-500/10', badgeText: 'text-orange-400' },
  { name: 'Verde', color: 'bg-green-500', borderColor: 'border-l-green-500', glowColor: 'shadow-green-500/20', iconColor: 'text-green-400', badgeBg: 'bg-green-500/10', badgeText: 'text-green-400' },
  { name: 'Vermelho', color: 'bg-red-500', borderColor: 'border-l-red-500', glowColor: 'shadow-red-500/20', iconColor: 'text-red-400', badgeBg: 'bg-red-500/10', badgeText: 'text-red-400' },
  { name: 'Rosa', color: 'bg-pink-500', borderColor: 'border-l-pink-500', glowColor: 'shadow-pink-500/20', iconColor: 'text-pink-400', badgeBg: 'bg-pink-500/10', badgeText: 'text-pink-400' },
  { name: 'Indigo', color: 'bg-indigo-500', borderColor: 'border-l-indigo-500', glowColor: 'shadow-indigo-500/20', iconColor: 'text-indigo-400', badgeBg: 'bg-indigo-500/10', badgeText: 'text-indigo-400' },
  { name: 'Teal', color: 'bg-teal-500', borderColor: 'border-l-teal-500', glowColor: 'shadow-teal-500/20', iconColor: 'text-teal-400', badgeBg: 'bg-teal-500/10', badgeText: 'text-teal-400' },
];

export interface FunnelStage {
  id: string;
  label: string;
  color: string;
  borderColor: string;
  glowColor: string;
  iconColor: string;
  badgeBg: string;
  badgeText: string;
}

interface Lead {
  id: string;
  nome: string;
  email?: string;
  telefone?: string;
  empresa?: string;
  status?: string;
  data?: string;
  observacoes?: string;
  avatarUrl?: string | null;
  valor?: number;
  deal_value?: number;
  origem?: string;
  prioridade?: 'baixa' | 'media' | 'alta' | 'urgente';
  lead_score?: number;
}

// Format currency with proper NaN handling
// Moeda da conta (MZN → "1 500,00 MT") no locale ativo — ver utils/format.ts
const formatCurrency = (value: number | undefined | null, currency?: CurrencyCode) => formatMoney(value ?? 0, currency);

interface SalesFunnelProps {
  leads: Lead[];
  onUpdateLeadStatus: (leadId: string, newStatus: string) => Promise<void>;
  onEditLead?: (lead: Lead) => void;
  onDeleteLead?: (leadId: string) => void;
  onResetLeadToInitial?: (leadId: string) => Promise<void>;
  onCallLead?: (lead: Lead) => void;
  onEmailLead?: (lead: Lead) => void;
  onWhatsAppLead?: (lead: Lead) => void;
  onViewLeadDetails?: (lead: Lead, initialTab?: TabKey) => void;
  isDark?: boolean;
  currency?: CurrencyCode;
  customStages?: FunnelStage[];
  onStagesChange?: (stages: FunnelStage[]) => void;
}

// Card do Lead - design limpo e moderno
// Cartão do lead (kanban): avatar, nome, origem e valor. Toque abre o detalhe; mudar de
// etapa por arrastar (tablet/desktop) ou pelo menu ⋯ → "Mover para…".
const LeadCard = memo(({ lead, onEdit, onDelete, onResetToInitial, onViewDetails, currency, onRequestMove }: any) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id, data: { lead } });
  const origin = getOriginInfo(lead.origem, lead.channelSource);
  const OriginIcon = origin.Icon;
  const name = leadDisplayName(lead);
  const dealValue = (Number(lead.deal_value) || 0) > 0 ? Number(lead.deal_value) : Number(lead.valor) || 0;
  const reminder = useContext(LeadRemindersContext).get(lead.id);

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => onViewDetails?.(lead, 'notas')}
      className={`group relative mb-2 flex items-center gap-3 rounded-xl border p-3 cursor-grab active:cursor-grabbing select-none transition-[opacity,box-shadow] duration-200 bg-card ${isDragging ? 'opacity-40 border-dashed border-primary/40' : 'border-border shadow-sm hover:shadow-md'}`}
    >
      <Avatar className="h-9 w-9 flex-shrink-0">
        {lead.avatarUrl ? <AvatarImage src={lead.avatarUrl} alt="" /> : null}
        <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
          {(name.match(/\p{L}/gu) || []).slice(0, 2).join('').toUpperCase() || '#'}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{name}</p>
        <p className={`mt-0.5 flex items-center gap-1 text-xs ${origin.color}`}>
          <OriginIcon className="h-3 w-3" />
          <span className="truncate">{origin.label}</span>
        </p>
        {reminder && (
          <p
            className={`mt-0.5 flex items-center gap-1 text-xs ${isOverdue(reminder.scheduled_at) ? 'font-medium text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}
            title={reminder.title}
          >
            <CalendarClock className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{reminderLabel(reminder.scheduled_at)}</span>
          </p>
        )}
      </div>
      {dealValue > 0 && (
        <span className="flex-shrink-0 text-xs font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(dealValue, currency)}</span>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Mais ações"
            className="h-7 w-7 p-0 flex-shrink-0 rounded-full text-muted-foreground"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-card border-border">
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onRequestMove?.(lead); }} className="text-foreground">
            <MoveRight className="h-3.5 w-3.5 mr-2" />
            Mover para…
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit?.(lead); }} className="text-foreground">
            <Edit2 className="h-3.5 w-3.5 mr-2" />
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onResetToInitial?.(lead.id); }} className="text-foreground">
            <RotateCcw className="h-3.5 w-3.5 mr-2" />
            Voltar à primeira etapa
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDelete?.(lead.id); }} className="text-red-500">
            <Trash2 className="h-3.5 w-3.5 mr-2" />
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});

LeadCard.displayName = 'LeadCard';

// Coluna do funil - design limpo
const FunnelColumn = memo(({
  stage,
  leads,
  isDark,
  isOver,
  expandedColumns,
  toggleExpanded,
  onEdit,
  onDelete,
  onRemoveStage,
  onEditStage, // Added prop
  onResetToInitial,
  onCall,
  onEmail,
  onWhatsApp,
  onViewDetails,
  visibleCount,
  onLoadMore,
  currency,
  stages = [],
  onMoveToStage,
  onRequestMove,
}: any) => {
  const { setNodeRef: setDroppableRef } = useDroppable({ id: stage.id });
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const setNodeRef = useCallback((node: HTMLElement | null) => {
    setDroppableRef(node);
    setSortableRef(node);
  }, [setDroppableRef, setSortableRef]);

  const isExpanded = expandedColumns[stage.id] ?? true;
  const visibleLeads = useMemo(() => leads.slice(0, visibleCount), [leads, visibleCount]);
  const hasMore = leads.length > visibleCount;

  const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    if (!hasMore) return;
    const target = event.currentTarget;
    if (target.scrollTop + target.clientHeight >= target.scrollHeight - 200) {
      onLoadMore(stage.id, leads.length);
    }
  }, [hasMore, onLoadMore, stage.id, leads.length]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`transition-all duration-300 ${isDragging ? 'opacity-50' : ''} ${isExpanded ? '' : 'flex-shrink-0'
        }`}
    >
      <div
        className={`rounded-xl transition-all duration-300 flex flex-col min-h-[240px] ${isOver ? `ring-2 ${stage.color} ring-opacity-50` : ''
          } ${isExpanded ? 'w-full' : 'w-[50px] shadow-sm'
          } border-0`}
        style={{
          backgroundColor: 'hsl(var(--card))',
          borderColor: 'hsl(var(--border))'
        }}
      >
        {isExpanded ? (
          <>
            {/* Header da coluna - Modernizado e Compacto */}
            <div 
              className="flex items-center justify-between px-3 py-3 mb-1 flex-shrink-0 border-b rounded-t-xl h-[60px]"
              style={{
                backgroundColor: 'hsl(var(--card))',
                borderColor: 'hsl(var(--border))'
              }}
            >
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                <div
                  {...attributes}
                  {...listeners}
                  className="cursor-move p-1 rounded-md transition-colors flex-shrink-0 opacity-50 hover:opacity-100 hover:bg-[hsl(var(--muted))]"
                  title="Arraste para reorganizar"
                >
                  <GripVertical className="h-4 w-4" style={{ color: 'hsl(var(--muted-foreground))' }} />
                </div>
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${stage.color}`}></div>
                <h3 
                  className="font-bold text-base truncate tracking-tight"
                  style={{ color: 'hsl(var(--foreground))' }}
                >
                  {stage.label}
                </h3>
                <span 
                  className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: 'hsl(var(--muted))',
                    color: 'hsl(var(--muted-foreground))'
                  }}
                >
                  {leads.length}
                </span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 rounded flex-shrink-0 hover:bg-[hsl(var(--muted))]"
                    style={{ color: 'hsl(var(--muted-foreground))' }}
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Opções da etapa"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent 
                  align="end" 
                  style={{
                    backgroundColor: 'hsl(var(--card))',
                    borderColor: 'hsl(var(--border))'
                  }}
                >
                  <DropdownMenuItem
                    onClick={(e) => { e.stopPropagation(); onEditStage?.(stage); }}
                    className="cursor-pointer flex items-center"
                    style={{ color: 'hsl(var(--foreground))' }}
                  >
                    <Edit2 className="h-3.5 w-3.5 mr-2" />
                    Editar coluna
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => { e.stopPropagation(); toggleExpanded(stage.id); }}
                    className="cursor-pointer flex items-center"
                    style={{ color: 'hsl(var(--foreground))' }}
                  >
                    <ChevronDown className="h-3.5 w-3.5 mr-2" />
                    Recolher coluna
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveStage?.(stage.id);
                    }}
                    className="text-red-500 hover:text-red-600 focus:text-red-600 cursor-pointer flex items-center"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                    Remover coluna
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Área de leads */}
            <div
              // Sem scroll próprio: a coluna cresce e quem faz scroll é a página
              className="flex-1 px-2 pb-3"
              style={{
                scrollbarWidth: 'thin',
                scrollbarColor: 'hsl(var(--muted-foreground)) transparent'
              }}
              onScroll={handleScroll}
            >
              {visibleLeads.length > 0 ? (
                visibleLeads.map((lead: Lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    isDark={isDark}
                    stage={stage}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onResetToInitial={onResetToInitial}
                    onCall={onCall}
                    onEmail={onEmail}
                    onWhatsApp={onWhatsApp}
                    onViewDetails={onViewDetails}
                    currency={currency}
                    stages={stages}
                    onMoveToStage={onMoveToStage}
                    onRequestMove={onRequestMove}
                  />
                ))
              ) : (
                <p className="py-6 text-center text-xs text-muted-foreground">Sem leads nesta etapa</p>
              )}

              {leads.length > 0 && (
                <p 
                  className="mt-2 text-center text-[11px]"
                  style={{ color: 'hsl(var(--muted-foreground))' }}
                >
                  Mostrando {Math.min(visibleCount, leads.length)} de {leads.length}
                </p>
              )}

              {hasMore && (
                <div className="mt-3 flex justify-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-4 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground"
                    onClick={(event) => {
                      event.stopPropagation();
                      onLoadMore(stage.id, leads.length);
                    }}
                  >
                    Carregar mais leads
                  </Button>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Coluna colapsada */}
            <div className="flex flex-col items-center justify-between h-full py-3 px-2">
              <div className="flex flex-col items-center space-y-3 flex-1">
                <div
                  {...attributes}
                  {...listeners}
                  className="cursor-move p-1 rounded transition-colors hover:bg-[hsl(var(--muted))]"
                >
                  <GripVertical className="h-4 w-4" style={{ color: 'hsl(var(--muted-foreground))' }} />
                </div>

                <div className={`w-2 h-2 rounded-full ${stage.color}`}></div>

                {/* Nome rotacionado */}
                <div className="flex-1 flex items-center justify-center">
                  <h3
                    className="font-bold text-sm tracking-wide whitespace-nowrap"
                    style={{
                      writingMode: 'vertical-rl',
                      textOrientation: 'mixed',
                      transform: 'rotate(180deg)',
                      color: 'hsl(var(--foreground))'
                    }}
                  >
                    {stage.label}
                  </h3>
                </div>

                <span 
                  className="text-[10px] px-1 py-0.5 rounded"
                  style={{
                    backgroundColor: 'hsl(var(--muted))',
                    color: 'hsl(var(--muted-foreground))'
                  }}
                >
                  {leads.length}
                </span>
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 rounded hover:bg-[hsl(var(--muted))]"
                style={{ color: 'hsl(var(--muted-foreground))' }}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpanded(stage.id);
                }}
              >
                <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
});

FunnelColumn.displayName = 'FunnelColumn';

const DEFAULT_VISIBLE_PER_STAGE = 50;
const LOAD_MORE_STEP = 40;

// Etapa do lead (o id da etapa onde aparece agrupado)
function stageOfLead(lead: Lead, leadsByStatus: Record<string, Lead[]>) {
  return Object.keys(leadsByStatus).find(id => leadsByStatus[id].some(l => l.id === lead.id));
}

// Telemóvel: chips deslizáveis com as etapas e o número de leads; toque mostra a lista.
const MobileFunnel = ({ stages, leadsByStatus, currency, onOpen, onRequestMove }: any) => {
  const firstWithLeads = stages.find((st: FunnelStage) => (leadsByStatus[st.id] || []).length > 0)?.id || stages[0]?.id;
  const [selected, setSelected] = useState<string>(firstWithLeads);
  useEffect(() => {
    if (!stages.some((st: FunnelStage) => st.id === selected)) setSelected(firstWithLeads);
  }, [stages, selected, firstWithLeads]);
  const list: Lead[] = leadsByStatus[selected] || [];
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  return (
    <div className="-mx-1">
      <div
        className="flex gap-2 overflow-x-auto scrollbar-none px-1 pb-3 pr-6"
        style={{ maskImage: 'linear-gradient(to right, black calc(100% - 24px), transparent)', WebkitMaskImage: 'linear-gradient(to right, black calc(100% - 24px), transparent)' }}
      >
        {stages.map((st: FunnelStage) => {
          const count = (leadsByStatus[st.id] || []).length;
          const active = st.id === selected;
          return (
            <button
              key={st.id}
              type="button"
              onClick={() => setSelected(st.id)}
              className={`flex flex-shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors ${active ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground'}`}
            >
              <span className={`h-2 w-2 rounded-full ${st.color}`} />
              {st.label}
              <span className={`tabular-nums ${active ? 'text-primary' : 'text-foreground'}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {list.length === 0 ? (
        <p className="px-1 py-10 text-center text-sm text-muted-foreground">Sem leads nesta etapa</p>
      ) : (
        <ul className="mx-1 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {list.map((lead) => {
            const origin = getOriginInfo(lead.origem, (lead as any).channelSource);
            const OriginIcon = origin.Icon;
            const name = leadDisplayName(lead);
            const value = (Number(lead.deal_value) || 0) > 0 ? Number(lead.deal_value) : Number(lead.valor) || 0;
            return (
              <li key={lead.id} className="flex items-center gap-2 pr-2">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left active:bg-muted/60 select-none"
                  onClick={() => {
                    if (longPressed.current) { longPressed.current = false; return; }
                    onOpen(lead);
                  }}
                  onTouchStart={() => {
                    longPressed.current = false;
                    pressTimer.current = setTimeout(() => { longPressed.current = true; haptic('medium'); onRequestMove(lead); }, 500);
                  }}
                  onTouchMove={() => pressTimer.current && clearTimeout(pressTimer.current)}
                  onTouchEnd={() => pressTimer.current && clearTimeout(pressTimer.current)}
                >
                  <Avatar className="h-10 w-10 flex-shrink-0">
                    {lead.avatarUrl ? <AvatarImage src={lead.avatarUrl} alt="" /> : null}
                    <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
                      {(name.match(/\p{L}/gu) || []).slice(0, 2).join('').toUpperCase() || '#'}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-foreground">{name}</span>
                    <span className={`mt-0.5 flex items-center gap-1 text-xs ${origin.color}`}>
                      <OriginIcon className="h-3 w-3" />
                      {origin.label}
                      {value > 0 && <span className="ml-auto font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(value, currency)}</span>}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onRequestMove(lead)}
                  className="flex-shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground active:bg-muted"
                >
                  Mover
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

// Folha com as etapas para mudar o lead de etapa
const MoveLeadSheet = ({ lead, stages, leadsByStatus, onClose, onMove }: any) => {
  if (!lead) return null;
  const current = stageOfLead(lead, leadsByStatus);
  return (
    <AppModal open={!!lead} onOpenChange={(o) => !o && onClose()} size="sm" title="Mover para…" description={leadDisplayName(lead)}>
      <ul className="-mx-1 space-y-1">
        {stages.map((st: FunnelStage) => (
          <li key={st.id}>
            <button
              type="button"
              disabled={st.id === current}
              onClick={() => onMove(st.id)}
              className="flex w-full min-h-[48px] items-center gap-3 rounded-lg px-3 text-left text-[15px] text-foreground hover:bg-muted active:bg-muted disabled:opacity-60"
            >
              <span className={`h-2.5 w-2.5 rounded-full ${st.color}`} />
              <span className="flex-1">{st.label}</span>
              {st.id === current && <span className="text-xs text-muted-foreground">Etapa atual</span>}
            </button>
          </li>
        ))}
      </ul>
    </AppModal>
  );
};

export default function SalesFunnel({
  leads,
  onUpdateLeadStatus,
  onEditLead,
  onDeleteLead,
  onResetLeadToInitial,
  onCallLead,
  onEmailLead,
  onWhatsAppLead,
  onViewLeadDetails,
  isDark = false,
  currency,
  customStages,
  onStagesChange,
}: SalesFunnelProps) {
  const { reminders, byLead } = useLeadReminders();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [expandedColumns, setExpandedColumns] = useState<Record<string, boolean>>({});

  // Local state for optimistic updates - synced with prop
  const [localLeads, setLocalLeads] = useState<Lead[]>(leads);

  // Sync local leads with prop (when external changes happen)
  useEffect(() => {
    setLocalLeads(leads);
  }, [leads]);

  const [stages, setStages] = useState<FunnelStage[]>(() => {
    // Try to load from localStorage first
    const saved = localStorage.getItem('funnelStages');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // ignore
      }
    }
    return customStages || DEFAULT_FUNNEL_STAGES;
  });
  const [showStageEditor, setShowStageEditor] = useState(false);
  const [editingStage, setEditingStage] = useState<FunnelStage | null>(null); // State for single stage editing

  const handleSaveStage = useCallback((updatedStage: FunnelStage) => {
    setStages(prev => prev.map(s => s.id === updatedStage.id ? updatedStage : s));
    setEditingStage(null);
  }, []);

  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    (customStages || DEFAULT_FUNNEL_STAGES).forEach(stage => {
      initial[stage.id] = DEFAULT_VISIBLE_PER_STAGE;
    });
    return initial;
  });

  // Save stages to localStorage when they change
  useEffect(() => {
    localStorage.setItem('funnelStages', JSON.stringify(stages));
    onStagesChange?.(stages);
  }, [stages, onStagesChange]);

  useEffect(() => {
    setVisibleCounts(prev => {
      const next: Record<string, number> = {};
      let changed = false;

      stages.forEach(stage => {
        const existing = prev[stage.id];
        next[stage.id] = existing ?? DEFAULT_VISIBLE_PER_STAGE;
        if (existing === undefined) {
          changed = true;
        }
      });

      if (Object.keys(prev).length !== Object.keys(next).length) {
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [stages]);

  // Rato: arrasta após 8px. Toque: toque longo (200ms) — com o PointerSensor o browser
  // tratava o movimento como scroll e cancelava o gesto, e o arrastar nunca começava no
  // telemóvel. Assim o deslizar normal continua a fazer scroll das colunas.
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const toggleExpanded = useCallback((stageId: string) => {
    setExpandedColumns(prev => ({
      ...prev,
      [stageId]: !(prev[stageId] ?? true)
    }));
  }, []);

  const handleLoadMore = useCallback((stageId: string, total: number) => {
    setVisibleCounts(prev => {
      const current = prev[stageId] ?? DEFAULT_VISIBLE_PER_STAGE;
      if (current >= total) {
        return prev;
      }
      return {
        ...prev,
        [stageId]: Math.min(current + LOAD_MORE_STEP, total),
      };
    });
  }, []);



  const leadsByStatus = useMemo(() => {
    const grouped: Record<string, Lead[]> = {};
    const statusToStageId: Record<string, string> = {};

    stages.forEach(stage => {
      grouped[stage.id] = [];
      statusToStageId[stage.id.toLowerCase()] = stage.id;
      statusToStageId[stage.label.toLowerCase()] = stage.id;
    });

    for (const lead of localLeads) {
      const normalized = (lead.status || '').toLowerCase();

      const targetStageId = statusToStageId[normalized];

      if (targetStageId && grouped[targetStageId]) {
        grouped[targetStageId].push(lead);
      } else {
        // Fallback to the first available stage if the specific status stage doesn't exist
        // This ensures leads never expire/disappear even if "novo" stage is deleted
        const firstStageId = stages[0]?.id;
        if (firstStageId && grouped[firstStageId]) {
          grouped[firstStageId].push(lead);
        }
      }
    }

    return grouped;
  }, [localLeads, stages]);

  const stats = useMemo(() => {
    const total = localLeads.length;

    // Dynamically find special stages to be robust against ID changes or custom stages
    // We look for 'convertido' ID or label 'Convertidos' (case insensitive)
    const convertedStage = stages.find(s => s.id === 'convertido' || s.label.toLowerCase() === 'convertidos') || stages.find(s => s.color.includes('green'));
    const convertedId = convertedStage?.id || 'convertido';

    // Similarly for lost leads
    const lostStage = stages.find(s => s.id === 'perdido' || s.label.toLowerCase() === 'perdidos') || stages.find(s => s.color.includes('red'));
    const lostId = lostStage?.id || 'perdido';

    const converted = leadsByStatus[convertedId]?.length || 0;
    const lost = leadsByStatus[lostId]?.length || 0;

    // In progress is everything that is NOT converted and NOT lost
    const inProgress = Math.max(0, total - converted - lost);

    const conversionRate = total > 0 ? ((converted / total) * 100).toFixed(1) : '0.0';

    // Calculate pipeline value with proper NaN handling
    const pipelineValue = localLeads.reduce((sum, l) => {
      const value = Number(l.deal_value) || Number(l.valor) || 0;
      return sum + (isNaN(value) ? 0 : value);
    }, 0);

    return { total, inProgress, converted, conversionRate, pipelineValue };
  }, [localLeads, leadsByStatus]);

  const handleRemoveStage = useCallback((stageId: string) => {
    // Prevent removing the last stage if desired, or just allow it
    if (stages.length <= 1) {
      // Optional: Add a toast notification or alert here if you had one
      return;
    }
    setStages(prev => prev.filter(s => s.id !== stageId));
  }, [stages.length]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    setActiveId(active.id as string);
    haptic('light');
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event;
    setOverId(over ? over.id as string : null);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setOverId(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Verificar se está arrastando uma coluna (stage)
    const activeStageIndex = stages.findIndex(s => s.id === activeId);
    const overStageIndex = stages.findIndex(s => s.id === overId);

    if (activeStageIndex !== -1 && overStageIndex !== -1) {
      // Reorganizar colunas
      setStages(arrayMove(stages, activeStageIndex, overStageIndex));
      return;
    }

    // Caso contrário, está arrastando um lead
    const lead = localLeads.find(l => l.id === activeId);
    if (!lead) return;

    const targetStage = stages.find(s => s.id === overId);
    if (targetStage) {
      const currentStatus = (lead.status || 'novo').toLowerCase();

      // Fix for custom stages: Use Label (Name) instead of ID if it's a generated ID (starts with 'stage_')
      // This ensures the backend receives the actual name of the tab as expected by the user
      const newStatusValue = targetStage.id.startsWith('stage_') ? targetStage.label : targetStage.id;
      const normalizedNewStatus = newStatusValue.toLowerCase();

      if (normalizedNewStatus !== currentStatus) {
        haptic('medium');
        // Optimistic update
        setLocalLeads(prev =>
          prev.map(l => l.id === activeId ? { ...l, status: newStatusValue } : l)
        );

        // Sync with API
        onUpdateLeadStatus(activeId, newStatusValue).catch((error) => {
          console.error('[SalesFunnel] Failed to update lead status:', error);
          // Revert optimistic update
          setLocalLeads(prev =>
            prev.map(l => l.id === activeId ? { ...l, status: lead.status || 'novo' } : l) // reverting to original lead status
          );
        });
      }
    }
  }, [localLeads, onUpdateLeadStatus, stages]);

  // Mudar de etapa (menu "Mover para…", botão Mover e toque longo no telemóvel)
  const [moveLead, setMoveLead] = useState<Lead | null>(null);
  const moveLeadToStage = useCallback((leadId: string, newStageId: string) => {
    const newStage = stages.find(s => s.id === newStageId);
    if (!newStage || !localLeads.some(l => l.id === leadId)) return;
    // Mesmo valor que o arrastar: id da etapa (ou o nome, nas etapas personalizadas)
    const newStatus = newStage.id.startsWith('stage_') ? newStage.label : newStage.id;
    haptic('medium');
    setLocalLeads(prev => prev.map(l => (l.id === leadId ? { ...l, status: newStatus } : l)));
    onUpdateLeadStatus(leadId, newStatus).catch(() => setLocalLeads(leads));
  }, [stages, localLeads, onUpdateLeadStatus, leads]);

  // Telemóvel: chips de etapas + lista (sem arrastar)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const activeLead = useMemo(() =>
    activeId ? localLeads.find(l => l.id === activeId) : null,
    [activeId, localLeads]
  );

  const stageIds = useMemo(() => stages.map(s => s.id), [stages]);

  return (
    <LeadRemindersContext.Provider value={byLead}>
      <div className="flex flex-col h-full">
        <PageHeader
          title="Funil de Vendas"
          description="Arraste os leads entre as etapas do funil"
          icon={Workflow}
          actions={<PageAction icon={Settings} label="Personalizar etapas" onClick={() => setShowStageEditor(true)} />}
        />

        {/* Total, convertidos e taxa vivem no Início/Relatórios; aqui só o valor em
            negociação, que é exclusivo do funil */}
        <p className="mb-4 text-sm text-muted-foreground">
          Valor do funil:{' '}
          <span className="font-semibold text-foreground tabular-nums">{formatCurrency(stats.pipelineValue, currency)}</span>
        </p>

        {/* Agendamentos pendentes dos leads: ao entrar no funil vê-se logo o que está marcado */}
        <FunnelReminders reminders={reminders} leads={localLeads} onOpen={(l) => onViewLeadDetails?.(l, 'agendamentos')} />

        {/* Stage Editor Modal */}
        {showStageEditor && (
          <OverlayModal onClose={() => setShowStageEditor(false)} className="max-w-2xl">
              <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b bg-card border-border">
                <h3 className="text-lg font-semibold text-foreground">
                  Personalizar Etapas do Funil
                </h3>
                <button
                  onClick={() => setShowStageEditor(false)}
                  className="p-2 rounded-lg transition-colors hover:bg-muted/50 text-muted-foreground"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 space-y-4">
                {/* Template Selector */}
                <div className="p-4 rounded-xl border bg-muted/50 border-border">
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2 text-foreground">
                    <Settings className="w-4 h-4" />
                    Modelos Prontos
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Object.entries(FUNNEL_TEMPLATES).map(([key, template]) => {
                      const TemplateIcon = template.icon;
                      return (
                        <button
                          key={key}
                          onClick={async () => {
                            const confirmed = confirm(`Aplicar modelo "${template.name}"? Isso substituirá suas etapas atuais.`);
                            if (confirmed) {
                              setStages(template.stages);
                            }
                          }}
                          className="flex flex-col items-center gap-1 p-3 rounded-xl border text-center transition-all hover:scale-105 bg-card border-border hover:bg-muted/50"
                        >
                          <TemplateIcon className={`w-6 h-6 ${template.iconColor}`} />
                          <span className="text-xs font-medium text-foreground">
                            {template.name}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {template.stages.length} etapas
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3 text-muted-foreground">
                  <div className="flex-1 h-px bg-current opacity-20" />
                  <span className="text-xs font-medium">ou personalize</span>
                  <div className="flex-1 h-px bg-current opacity-20" />
                </div>

                {/* Individual Stage Editing */}
                <div className="space-y-3">
                {stages.map((stage, index) => (
                  <div
                    key={stage.id}
                    className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-xl border bg-muted/50 border-border"
                  >
                    <div className={`w-3.5 h-3.5 shrink-0 rounded-full ${stage.color}`} />
                    <input
                      type="text"
                      value={stage.label}
                      onChange={(e) => {
                        const newStages = [...stages];
                        newStages[index] = { ...stage, label: e.target.value };
                        setStages(newStages);
                      }}
                      className="flex-1 min-w-0 px-3 py-2 rounded-lg border text-sm bg-card border-border text-foreground"
                    />
                    <select
                      value={stage.color}
                      onChange={(e) => {
                        const colorConfig = STAGE_COLORS.find(c => c.color === e.target.value);
                        if (colorConfig) {
                          const newStages = [...stages];
                          newStages[index] = {
                            ...stage,
                            ...colorConfig,
                          };
                          setStages(newStages);
                        }
                      }}
                      className="w-[6.5rem] sm:w-32 shrink-0 px-2 sm:px-3 py-2 rounded-lg border text-sm bg-card border-border text-foreground"
                      aria-label="Cor da etapa"
                    >
                      {STAGE_COLORS.map(color => (
                        <option key={color.color} value={color.color}>
                          {color.name}
                        </option>
                      ))}
                    </select>
                    {stages.length > 2 && (
                      <button
                        onClick={() => {
                          const newStages = stages.filter((_, i) => i !== index);
                          setStages(newStages);
                        }}
                        className="p-2 shrink-0 rounded-lg transition-colors hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500 dark:text-red-400"
                        aria-label="Apagar etapa"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                </div>

                {/* Add new stage button */}
                <button
                  onClick={() => {
                    const newId = `stage_${Date.now()}`;
                    const defaultColor = STAGE_COLORS[stages.length % STAGE_COLORS.length];
                    setStages([
                      ...stages,
                      {
                        id: newId,
                        label: 'Nova Etapa',
                        ...defaultColor,
                      },
                    ]);
                  }}
                  className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed transition-colors border-border text-muted-foreground/70 hover:text-muted-foreground"
                >
                  <Plus className="w-4 h-4" />
                  Adicionar Etapa
                </button>
              </div>

              <div className="sticky bottom-0 flex items-center justify-between p-4 border-t bg-card border-border">
                <button
                  onClick={() => {
                    setStages(DEFAULT_FUNNEL_STAGES);
                    localStorage.removeItem('funnelStages');
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-colors text-muted-foreground hover:text-foreground hover:bg-muted/50"
                >
                  Restaurar Padrão
                </button>
                <button
                  onClick={() => setShowStageEditor(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-all duration-150"
                >
                  Fechar
                </button>
              </div>
          </OverlayModal>
        )}

        {/* Single Stage Edit Modal */}
        {editingStage && (
          <OverlayModal onClose={() => setEditingStage(null)} className="max-w-md">
              <div className="flex items-center justify-between p-4 border-b bg-card border-border">
                <h3 className="text-lg font-semibold text-foreground">
                  Editar Etapa
                </h3>
                <button
                  onClick={() => setEditingStage(null)}
                  className="p-2 rounded-lg transition-colors hover:bg-muted/50 text-muted-foreground"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-foreground/80">
                    Nome da Etapa
                  </label>
                  <input
                    type="text"
                    value={editingStage.label}
                    onChange={(e) => setEditingStage({ ...editingStage, label: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border text-sm bg-card border-border text-foreground"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-foreground/80">
                    Cor
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {STAGE_COLORS.map(colorConfig => (
                      <button
                        key={colorConfig.color}
                        onClick={() => setEditingStage({ ...editingStage, ...colorConfig })}
                        className={`flex items-center gap-2 p-2 rounded-lg border-2 transition-all ${editingStage.color === colorConfig.color
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-border'
                          }`}
                      >
                        <div className={`w-4 h-4 rounded-full ${colorConfig.color}`}></div>
                        <span className="text-xs text-foreground/80">
                          {colorConfig.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2 [&>*]:flex-1 sm:[&>*]:flex-none sm:justify-end items-center p-4 border-t bg-card border-border">
                <button
                  onClick={() => setEditingStage(null)}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-colors text-muted-foreground hover:text-foreground hover:bg-muted/50"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleSaveStage(editingStage)}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  Guardar
                </button>
              </div>
          </OverlayModal>
        )}

        {isMobile && (
          <MobileFunnel
            stages={stages}
            leadsByStatus={leadsByStatus}
            currency={currency}
            onOpen={(lead: Lead) => onViewLeadDetails?.(lead, 'notas')}
            onRequestMove={setMoveLead}
          />
        )}

        <MoveLeadSheet
          lead={moveLead}
          stages={stages}
          leadsByStatus={leadsByStatus}
          onClose={() => setMoveLead(null)}
          onMove={(stageId: string) => {
            if (moveLead?.id) moveLeadToStage(moveLead.id, stageId);
            setMoveLead(null);
          }}
        />

        {/* Funil de Vendas - Layout Responsivo (tablet/desktop: kanban com arrastar) */}
        {/* Sem cartão à volta das colunas (as colunas já são cartões) */}
        <div className={isMobile ? 'hidden' : 'flex-1'}>

          <div
            className="relative w-full h-full bg-transparent"
          >
            {/* Container com scroll horizontal responsivo */}
            <div
              className="overflow-x-auto overflow-y-hidden smooth-scroll snap-container h-full"
              style={{
                scrollbarWidth: 'thin',
                scrollbarColor: '#94a3b8 #e2e8f0',
                WebkitOverflowScrolling: 'touch'
              }}
            >
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={stageIds} strategy={horizontalListSortingStrategy}>
                  {/* Container de colunas responsivo com espaçamento generoso */}
                  <div className="flex gap-4 pb-4 px-1 w-full h-full items-start">
                    {stages.map(stage => (
                      <div
                        key={stage.id}
                        className={`snap-start h-full transition-all duration-300 ${expandedColumns[stage.id] === false
                          ? 'w-[60px] flex-none'
                          : 'w-[320px] flex-none'
                          }`}
                      >
                        <FunnelColumn
                          stage={stage}
                          leads={leadsByStatus[stage.id] || []}
                          isDark={isDark}
                          isOver={overId === stage.id}
                          expandedColumns={expandedColumns}
                          toggleExpanded={toggleExpanded}
                          onEdit={onEditLead}
                          onDelete={onDeleteLead}
                          onRemoveStage={handleRemoveStage}
                          onEditStage={setEditingStage}
                          onResetToInitial={onResetLeadToInitial}
                          onCall={onCallLead}
                          onEmail={onEmailLead}
                          onWhatsApp={onWhatsAppLead}
                          onViewDetails={onViewLeadDetails}
                          visibleCount={visibleCounts[stage.id] ?? DEFAULT_VISIBLE_PER_STAGE}
                          onLoadMore={handleLoadMore}
                          currency={currency}
                          stages={stages}
                          onMoveToStage={moveLeadToStage}
                          onRequestMove={setMoveLead}
                        />
                      </div>
                    ))}
                  </div>
                </SortableContext>

                <DragOverlay dropAnimation={null}>
                  {activeLead ? (
                    <div className="rounded-xl p-4 shadow-2xl max-w-[280px] rotate-2 scale-105 border-2 border-primary bg-card cursor-grabbing">
                      <p className="text-sm font-semibold text-foreground">
                        {activeLead.nome}
                      </p>
                      {activeLead.empresa && (
                        <p className="text-xs mt-1 text-muted-foreground">
                          {activeLead.empresa}
                        </p>
                      )}
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            </div>
          </div>
        </div>
      </div>
    </LeadRemindersContext.Provider>
  );
}
