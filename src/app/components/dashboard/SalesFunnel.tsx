import { useState, useMemo, useCallback, useEffect, memo } from 'react';
import type { UIEvent } from 'react';
import { DndContext, DragEndEvent, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors, useDroppable, DragStartEvent, useDraggable, DragOverEvent, KeyboardSensor } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, horizontalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Phone, Mail, MessageCircle, Trash2, Edit2, MoreVertical, ChevronDown, BarChart3, Clock, CheckCircle2, TrendingUp, GripVertical, DollarSign, StickyNote, Calendar, MessageSquare, Settings, Plus, X, RotateCcw, Globe, Flag, AlertTriangle, AlertCircle, Minus, Briefcase, Home, ShoppingCart, Wrench, Monitor, Users2, Instagram, Send, Megaphone, MoveRight, type LucideIcon } from 'lucide-react';
import type { TabKey } from '../modals/LeadDetailModal';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { Badge } from '../ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';

// Currency configurations
export type CurrencyCode = 'USD' | 'MZN' | 'BRL';

const CURRENCY_CONFIG: Record<CurrencyCode, { locale: string; symbol: string }> = {
  USD: { locale: 'en-US', symbol: '$' },
  MZN: { locale: 'pt-MZ', symbol: 'MT' },
  BRL: { locale: 'pt-BR', symbol: 'R$' },
};

// Default funnel stages with colors
const DEFAULT_FUNNEL_STAGES = [
  { id: 'novo', label: 'Novos', color: 'bg-cyan-500', borderColor: 'border-l-cyan-500', glowColor: 'shadow-cyan-500/20', iconColor: 'text-cyan-400', badgeBg: 'bg-cyan-500/10', badgeText: 'text-cyan-400' },
  { id: 'contatado', label: 'Contatados', color: 'bg-purple-500', borderColor: 'border-l-purple-500', glowColor: 'shadow-purple-500/20', iconColor: 'text-purple-400', badgeBg: 'bg-purple-500/10', badgeText: 'text-purple-400' },
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
      { id: 'contato', label: 'Primeiro Contato', color: 'bg-cyan-500', borderColor: 'border-l-cyan-500', glowColor: 'shadow-cyan-500/20', iconColor: 'text-cyan-400', badgeBg: 'bg-cyan-500/10', badgeText: 'text-cyan-400' },
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
}

// Priority configurations
const PRIORITY_CONFIG = {
  baixa: { label: 'Baixa', color: 'text-gray-400', bgColor: 'bg-gray-500/10', icon: Minus },
  media: { label: 'Média', color: 'text-blue-400', bgColor: 'bg-blue-500/10', icon: Flag },
  alta: { label: 'Alta', color: 'text-orange-400', bgColor: 'bg-orange-500/10', icon: AlertCircle },
  urgente: { label: 'Urgente', color: 'text-red-400', bgColor: 'bg-red-500/10', icon: AlertTriangle },
};

// Common origins for display with Lucide icons
const ORIGIN_CONFIG: Record<string, { icon: LucideIcon; color: string; label: string }> = {
  whatsapp: { icon: MessageCircle, color: 'text-green-500', label: 'WhatsApp' },
  instagram: { icon: Instagram, color: 'text-pink-500', label: 'Instagram' },
  facebook: { icon: Users2, color: 'text-blue-500', label: 'Facebook' },
  website: { icon: Globe, color: 'text-cyan-500', label: 'Website' },
  email: { icon: Mail, color: 'text-orange-500', label: 'Email' },
  telefone: { icon: Phone, color: 'text-blue-400', label: 'Telefone' },
  indicacao: { icon: Users2, color: 'text-purple-500', label: 'Indicação' },
  evento: { icon: Calendar, color: 'text-yellow-500', label: 'Evento' },
  anuncio: { icon: Megaphone, color: 'text-red-500', label: 'Anúncio' },
  organico: { icon: TrendingUp, color: 'text-green-400', label: 'Orgânico' },
  telegram: { icon: Send, color: 'text-blue-400', label: 'Telegram' },
};

// Format currency with proper NaN handling
const formatCurrency = (value: number | undefined | null, currency: CurrencyCode = 'USD') => {
  const numValue = typeof value === 'number' && !isNaN(value) ? value : 0;
  const config = CURRENCY_CONFIG[currency];

  try {
    return new Intl.NumberFormat(config.locale, {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numValue);
  } catch {
    // Fallback for MZN which might not be supported in all browsers
    if (currency === 'MZN') {
      return `${config.symbol} ${numValue.toLocaleString(config.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `${config.symbol} ${numValue.toFixed(2)}`;
  }
};

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
const LeadCard = memo(({ lead, isDark, stage, onEdit, onDelete, onResetToInitial, onEmail, onWhatsApp, onCall, onViewDetails, currency = 'USD' as CurrencyCode, stages = [], onMoveToStage }: any) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
    data: { lead }
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  // Cores dos avatares vibrantes
  const avatarColors = [
    'bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-green-500',
    'bg-yellow-500', 'bg-red-500', 'bg-indigo-500', 'bg-orange-500'
  ];
  const avatarColor = avatarColors[lead.nome.length % avatarColors.length];

  // Check if lead has deal value - use Number() to ensure proper comparison
  const numDealValue = Number(lead.deal_value) || 0;
  const numValor = Number(lead.valor) || 0;
  const dealValue = numDealValue > 0 ? numDealValue : numValor;
  const hasDealValue = dealValue > 0;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`group relative rounded-2xl p-3 mb-3 cursor-move transition-all duration-200 border ${isDragging ? 'opacity-50 scale-95 shadow-2xl z-50 ring-2 ring-white/10' : 'opacity-100'
        } ${isDark
          ? 'hover:brightness-110 border-white/5 shadow-lg shadow-black/20'
          : 'hover:bg-gray-50 border-gray-100 shadow-sm hover:shadow-md'
        }`}
      style={{
        ...style,
        backgroundColor: isDark ? '#1A1A1A' : 'hsl(var(--card))'
      }}
    >
      {/* Header: Avatar + Nome + Menu */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          <Avatar className="h-9 w-9 flex-shrink-0 ring-2 ring-white/10">
            {lead.avatarUrl ? (
              <AvatarImage src={lead.avatarUrl} alt={lead.nome} />
            ) : null}
            <AvatarFallback className={`${avatarColor} text-white text-xs font-bold`}>
              {lead.nome.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className={`font-bold text-sm truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {lead.nome}
            </p>
            {lead.empresa && (
              <p className={`text-[10px] uppercase tracking-wide truncate ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                {lead.empresa}
              </p>
            )}
          </div>
        </div>

        {/* Menu de 3 pontos */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={`h-7 w-7 p-0 flex-shrink-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity ${isDark ? 'hover:bg-white/10 text-gray-400' : 'hover:bg-gray-100 text-gray-400'
                }`}
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className={isDark ? 'bg-[#1A1A1A] border-white/10' : ''}>
            <DropdownMenuItem
              onClick={(e) => { e.stopPropagation(); onEdit?.(lead); }}
              className={isDark ? 'text-white hover:bg-white/10' : ''}
            >
              <Edit2 className="h-3.5 w-3.5 mr-2" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => { e.stopPropagation(); onResetToInitial?.(lead.id); }}
              className="text-orange-400"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-2" />
              Voltar ao Início
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => { e.stopPropagation(); onDelete?.(lead.id); }}
              className="text-red-400"
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Excluir Lead
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Origin + Priority badges */}
      {(lead.origem || lead.prioridade) && (
        <div className="flex items-center gap-1.5 mb-2 px-1 flex-wrap">
          {lead.origem && (() => {
            const originKey = lead.origem.toLowerCase();
            const originConfig = ORIGIN_CONFIG[originKey];
            const OriginIcon = originConfig?.icon || Globe;
            const iconColor = originConfig?.color || 'text-gray-400';
            const originLabel = originConfig?.label || lead.origem;
            return (
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${isDark ? 'bg-white/5 text-gray-400' : 'bg-gray-100 text-gray-600'}`}
                title={`Origem: ${originLabel}`}
              >
                <OriginIcon className={`h-3 w-3 ${iconColor}`} />
                <span className="truncate max-w-[60px]">{originLabel}</span>
              </span>
            );
          })()}
          {lead.prioridade && PRIORITY_CONFIG[lead.prioridade] && (
            <span
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${PRIORITY_CONFIG[lead.prioridade].bgColor} ${PRIORITY_CONFIG[lead.prioridade].color}`}
              title={`Prioridade: ${PRIORITY_CONFIG[lead.prioridade].label}`}
            >
              {(() => {
                const PriorityIcon = PRIORITY_CONFIG[lead.prioridade].icon;
                return <PriorityIcon className="h-3 w-3" />;
              })()}
              <span>{PRIORITY_CONFIG[lead.prioridade].label}</span>
            </span>
          )}
        </div>
      )}

      {/* Telefone + Valor do negócio */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-1.5 min-w-0">
          {lead.telefone && (
            <span className={`text-xs truncate ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              {lead.telefone}
            </span>
          )}
        </div>
        {hasDealValue && (
          <Badge variant="outline" className={`px-1.5 py-0 h-5 text-[10px] font-bold border-0 ${isDark ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
            }`}>
            {formatCurrency(dealValue, currency)}
          </Badge>
        )}
      </div>

      {/* Ícones de ação - Separados e Justificados */}
      <div className={`flex items-center justify-between gap-1 pt-2 border-t border-dashed ${isDark ? 'border-white/10' : 'border-gray-100'}`}>
        {/* Chamada */}
        <button
          onClick={(e) => { e.stopPropagation(); onCall?.(lead); }}
          className={`flex items-center justify-center h-8 w-8 rounded-lg transition-colors ${isDark ? 'hover:bg-white/10 text-gray-500 hover:text-blue-400' : 'hover:bg-blue-50 text-gray-400 hover:text-blue-600'
            }`}
          title="Ligar"
        >
          <Phone className="h-3.5 w-3.5" />
        </button>

        {/* WhatsApp */}
        <button
          onClick={(e) => { e.stopPropagation(); onWhatsApp?.(lead); }}
          className={`flex items-center justify-center h-8 w-8 rounded-lg transition-colors ${isDark ? 'hover:bg-white/10 text-gray-500 hover:text-green-400' : 'hover:bg-green-50 text-gray-400 hover:text-green-600'
            }`}
          title="WhatsApp"
        >
          <MessageCircle className="h-3.5 w-3.5" />
        </button>

        {/* Notas */}
        <button
          onClick={(e) => { e.stopPropagation(); onViewDetails?.(lead, 'notas'); }}
          className={`flex items-center justify-center h-8 w-8 rounded-lg transition-colors ${isDark ? 'hover:bg-white/10 text-gray-500 hover:text-yellow-400' : 'hover:bg-yellow-50 text-gray-400 hover:text-yellow-600'
            }`}
          title="Notas"
        >
          <StickyNote className="h-3.5 w-3.5" />
        </button>

        {/* Agendamentos */}
        <button
          onClick={(e) => { e.stopPropagation(); onViewDetails?.(lead, 'agendamentos'); }}
          className={`flex items-center justify-center h-8 w-8 rounded-lg transition-colors ${isDark ? 'hover:bg-white/10 text-gray-500 hover:text-purple-400' : 'hover:bg-purple-50 text-gray-400 hover:text-purple-600'
            }`}
          title="Agendamentos"
        >
          <Calendar className="h-3.5 w-3.5" />
        </button>

        {/* Histórico */}
        <button
          onClick={(e) => { e.stopPropagation(); onViewDetails?.(lead, 'historico'); }}
          className={`flex items-center justify-center h-8 w-8 rounded-lg transition-colors ${isDark ? 'hover:bg-white/10 text-gray-500 hover:text-orange-400' : 'hover:bg-orange-50 text-gray-400 hover:text-orange-600'
            }`}
          title="Histórico"
        >
          <MessageSquare className="h-3.5 w-3.5" />
        </button>

        {/* Valor - destacado se tem valor */}
        <button
          onClick={(e) => { e.stopPropagation(); onViewDetails?.(lead, 'valor'); }}
          className={`flex items-center justify-center h-8 w-8 rounded-lg transition-colors ${hasDealValue
            ? 'text-emerald-400 bg-emerald-500/20'
            : isDark ? 'hover:bg-white/10 text-gray-500' : 'hover:bg-emerald-50 text-gray-400'
            }`}
          title="Valor do negócio"
        >
          <DollarSign className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Mobile Dropdown - Mover para outro estágio */}
      {stages.length > 0 && onMoveToStage && (
        <div className="md:hidden mt-3 pt-2 border-t border-dashed" style={{borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}}>
          <div className="flex items-center gap-2">
            <MoveRight className={`h-3.5 w-3.5 flex-shrink-0 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
            <select
              value={stage.id}
              onChange={(e) => {
                e.stopPropagation();
                const newStageId = e.target.value;
                if (newStageId !== stage.id) {
                  onMoveToStage(lead.id, newStageId);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className={`flex-1 text-xs px-2 py-1 rounded-lg border transition-colors ${
                isDark 
                  ? 'bg-slate-800 border-slate-600 text-white hover:border-slate-500' 
                  : 'bg-white border-gray-300 text-gray-900 hover:border-gray-400'
              }`}
            >
              {stages.map((s: FunnelStage) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
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
  currency = 'USD' as CurrencyCode,
  stages = [],
  onMoveToStage,
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
        className={`rounded-xl transition-all duration-300 flex flex-col h-[calc(100vh-140px)] min-h-[600px] ${isOver ? `ring-2 ${stage.color} ring-opacity-50` : ''
          } ${isExpanded ? 'w-full' : 'w-[50px] shadow-sm'
          } border-0`}
        style={{
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'hsl(var(--card))',
          borderColor: isDark ? 'hsl(var(--border))' : 'hsl(var(--border))'
        }}
      >
        {isExpanded ? (
          <>
            {/* Header da coluna - Modernizado e Compacto */}
            <div 
              className="flex items-center justify-between px-3 py-3 mb-1 flex-shrink-0 border-b rounded-t-xl h-[60px]"
              style={{
                backgroundColor: isDark ? 'transparent' : 'hsl(var(--card))',
                borderColor: isDark ? 'hsl(var(--border))' : 'hsl(var(--border))'
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
                  >
                    <Settings className="h-3.5 w-3.5" />
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
              className="flex-1 overflow-y-auto px-2 pb-3"
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
                  />
                ))
              ) : (
                <div 
                  className="flex flex-col items-center justify-center h-32 rounded-lg border-2 border-dashed"
                  style={{
                    borderColor: 'hsl(var(--border))',
                    color: 'hsl(var(--muted-foreground))'
                  }}
                >
                  <BarChart3 className="h-5 w-5 mb-1" />
                  <p className="text-xs">Nenhum lead</p>
                </div>
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
  currency = 'USD',
  customStages,
  onStagesChange,
}: SalesFunnelProps) {
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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
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

  // Calcular quantas colunas estão expandidas
  const expandedCount = useMemo(() => {
    return stages.filter(stage => expandedColumns[stage.id] ?? true).length;
  }, [stages, expandedColumns]);

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

  const activeLead = useMemo(() =>
    activeId ? localLeads.find(l => l.id === activeId) : null,
    [activeId, localLeads]
  );

  const stageIds = useMemo(() => stages.map(s => s.id), [stages]);

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Top Header Section */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>
              Funil de Vendas
            </h1>
            <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Gerencie seus leads com drag & drop entre os estágios do funil
            </p>
          </div>

          <button
            onClick={() => setShowStageEditor(true)}
            className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border"
            style={{ 
              borderColor: 'hsl(var(--border))', 
              color: 'hsl(var(--muted-foreground))'
            }}
          >
            <Settings className="w-4 h-4" />
            <span>Personalizar</span>
          </button>
        </div>

        {/* Cards de Estatísticas */}
        <div className="flex-1 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 mb-6 md:mb-8">
          {/* Total de Leads */}
          <div className="group rounded-xl p-6 border shadow-lg hover:shadow-md transition-all duration-300 hover:-translate-y-1" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider font-semibold mb-2" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Total de Leads
                </p>
                <p className="text-3xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>
                  {stats.total.toLocaleString('pt-BR')}
                </p>
              </div>
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 ${isDark ? 'bg-purple-500/10 group-hover:bg-purple-500/20' : 'bg-purple-100 group-hover:bg-purple-200'
                }`}>
                <BarChart3 className={`w-7 h-7 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
              </div>
            </div>
          </div>

          {/* Em Progresso */}
          <div className="group rounded-xl p-6 border shadow-lg hover:shadow-md transition-all duration-300 hover:-translate-y-1" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider font-semibold mb-2" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Em Progresso
                </p>
                <p className="text-3xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>
                  {stats.inProgress.toLocaleString('pt-BR')}
                </p>
              </div>
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 ${isDark ? 'bg-yellow-500/10 group-hover:bg-yellow-500/20' : 'bg-yellow-100 group-hover:bg-yellow-200'
                }`}>
                <Clock className={`w-7 h-7 ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`} />
              </div>
            </div>
          </div>

          {/* Convertidos */}
          <div className="group rounded-xl p-6 border shadow-lg hover:shadow-md transition-all duration-300 hover:-translate-y-1" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider font-semibold mb-2" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Convertidos
                </p>
                <p className="text-3xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>
                  {stats.converted.toLocaleString('pt-BR')}
                </p>
              </div>
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 ${isDark ? 'bg-green-500/10 group-hover:bg-green-500/20' : 'bg-green-100 group-hover:bg-green-200'
                }`}>
                <CheckCircle2 className={`w-7 h-7 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
              </div>
            </div>
          </div>

          {/* Taxa de Conversão */}
          <div className="group rounded-xl p-6 border shadow-lg hover:shadow-md transition-all duration-300 hover:-translate-y-1" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider font-semibold mb-2" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Taxa de Conversão
                </p>
                <p className="text-3xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>
                  {stats.conversionRate}%
                </p>
              </div>
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 ${isDark ? 'bg-orange-500/10 group-hover:bg-orange-500/20' : 'bg-orange-100 group-hover:bg-orange-200'
                }`}>
                <TrendingUp className={`w-7 h-7 ${isDark ? 'text-orange-400' : 'text-orange-600'}`} />
              </div>
            </div>
          </div>

          {/* Valor do Pipeline */}
          <div className="group rounded-xl p-6 border shadow-lg hover:shadow-md transition-all duration-300 hover:-translate-y-1" style={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider font-semibold mb-2" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Valor Pipeline
                </p>
                <p className="text-2xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>
                  {formatCurrency(stats.pipelineValue, currency)}
                </p>
              </div>
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 ${isDark ? 'bg-emerald-500/10 group-hover:bg-emerald-500/20' : 'bg-emerald-100 group-hover:bg-emerald-200'
                }`}>
                <DollarSign className={`w-7 h-7 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
              </div>
            </div>
          </div>
        </div>

        {/* Stage Editor Modal */}
        {showStageEditor && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className={`w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-2xl shadow-2xl m-4 ${isDark ? 'bg-slate-900 border border-slate-700' : 'bg-white border border-gray-200'}`}>
              <div className={`sticky top-0 z-10 flex items-center justify-between p-4 border-b ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'}`}>
                <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Personalizar Etapas do Funil
                </h3>
                <button
                  onClick={() => setShowStageEditor(false)}
                  className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 space-y-4">
                {/* Template Selector */}
                <div className={`p-4 rounded-xl border ${isDark ? 'bg-slate-800/30 border-slate-700' : 'bg-gray-50/50 border-gray-200'}`}>
                  <h4 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    <Settings className="w-4 h-4" />
                    Templates Prontos
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Object.entries(FUNNEL_TEMPLATES).map(([key, template]) => {
                      const TemplateIcon = template.icon;
                      return (
                        <button
                          key={key}
                          onClick={() => {
                            if (confirm(`Aplicar template "${template.name}"? Isso substituirá suas etapas atuais.`)) {
                              setStages(template.stages);
                            }
                          }}
                          className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-center transition-all hover:scale-105 ${isDark
                            ? 'bg-slate-800/50 border-slate-600 hover:border-slate-500 hover:bg-slate-700/50'
                            : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                            }`}
                        >
                          <TemplateIcon className={`w-6 h-6 ${template.iconColor}`} />
                          <span className={`text-xs font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                            {template.name}
                          </span>
                          <span className={`text-[10px] ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            {template.stages.length} etapas
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Divider */}
                <div className={`flex items-center gap-3 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  <div className="flex-1 h-px bg-current opacity-20" />
                  <span className="text-xs font-medium">ou personalize</span>
                  <div className="flex-1 h-px bg-current opacity-20" />
                </div>

                {/* Individual Stage Editing */}
                <div className="space-y-3">
                {stages.map((stage, index) => (
                  <div
                    key={stage.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border ${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-gray-50 border-gray-200'}`}
                  >
                    <div className={`w-4 h-4 rounded-full ${stage.color}`} />
                    <input
                      type="text"
                      value={stage.label}
                      onChange={(e) => {
                        const newStages = [...stages];
                        newStages[index] = { ...stage, label: e.target.value };
                        setStages(newStages);
                      }}
                      className={`flex-1 px-3 py-2 rounded-lg border text-sm ${isDark
                        ? 'bg-slate-700 border-slate-600 text-white'
                        : 'bg-white border-gray-300 text-gray-900'
                        }`}
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
                      className={`px-3 py-2 rounded-lg border text-sm ${isDark
                        ? 'bg-slate-700 border-slate-600 text-white'
                        : 'bg-white border-gray-300 text-gray-900'
                        }`}
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
                        className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-red-900/30 text-red-400' : 'hover:bg-red-50 text-red-500'}`}
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
                  className={`w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed transition-colors ${isDark
                    ? 'border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300'
                    : 'border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-500'
                    }`}
                >
                  <Plus className="w-4 h-4" />
                  Adicionar Etapa
                </button>
              </div>

              <div className={`sticky bottom-0 flex items-center justify-between p-4 border-t ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'}`}>
                <button
                  onClick={() => {
                    setStages(DEFAULT_FUNNEL_STAGES);
                    localStorage.removeItem('funnelStages');
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isDark
                    ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                    }`}
                >
                  Restaurar Padrão
                </button>
                <button
                  onClick={() => setShowStageEditor(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Single Stage Edit Modal */}
        {editingStage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className={`w-full max-w-md rounded-2xl shadow-2xl m-4 ${isDark ? 'bg-slate-900 border border-slate-700' : 'bg-white border border-gray-200'}`}>
              <div className={`flex items-center justify-between p-4 border-b ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'}`}>
                <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Editar Etapa
                </h3>
                <button
                  onClick={() => setEditingStage(null)}
                  className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 space-y-4">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                    Nome da Etapa
                  </label>
                  <input
                    type="text"
                    value={editingStage.label}
                    onChange={(e) => setEditingStage({ ...editingStage, label: e.target.value })}
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${isDark
                      ? 'bg-slate-700 border-slate-600 text-white'
                      : 'bg-white border-gray-300 text-gray-900'
                      }`}
                  />
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                    Cor
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {STAGE_COLORS.map(colorConfig => (
                      <button
                        key={colorConfig.color}
                        onClick={() => setEditingStage({ ...editingStage, ...colorConfig })}
                        className={`flex items-center gap-2 p-2 rounded-lg border-2 transition-all ${editingStage.color === colorConfig.color
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : isDark ? 'border-slate-600 hover:border-slate-500' : 'border-gray-200 hover:border-gray-300'
                          }`}
                      >
                        <div className={`w-4 h-4 rounded-full ${colorConfig.color}`}></div>
                        <span className={`text-xs ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                          {colorConfig.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className={`flex items-center justify-end gap-2 p-4 border-t ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'}`}>
                <button
                  onClick={() => setEditingStage(null)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isDark
                    ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                    }`}
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleSaveStage(editingStage)}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Funil de Vendas - Layout Responsivo */}
        <Card className={`rounded-xl border overflow-hidden flex-1 ${isDark ? 'bg-transparent border-slate-700/30' : 'bg-transparent border-gray-200'}`}>

          <div
            className={`relative w-full p-6 h-full ${isDark ? 'bg-transparent' : 'bg-transparent'}`}
          >
            {/* Container com scroll horizontal responsivo */}
            <div
              className="overflow-x-auto overflow-y-hidden smooth-scroll snap-container h-full"
              style={{
                scrollbarWidth: 'thin',
                scrollbarColor: isDark ? '#475569 #1e293b' : '#cbd5e1 #f1f5f9',
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
                          onMoveToStage={(leadId: string, newStageId: string) => {
                            const lead = localLeads.find(l => l.id === leadId);
                            const newStage = stages.find(s => s.id === newStageId);
                            if (lead && newStage) {
                              // Atualização otimista
                              setLocalLeads(prev => 
                                prev.map(l => l.id === leadId ? { ...l, status: newStage.label } : l)
                              );
                              // Chamar API
                              onUpdateLeadStatus(leadId, newStage.label).catch(() => {
                                // Reverter em caso de erro
                                setLocalLeads(leads);
                              });
                            }
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </SortableContext>

                <DragOverlay dropAnimation={null}>
                  {activeLead ? (
                    <div className={`rounded-xl p-4 shadow-lg opacity-95 max-w-[280px] rotate-3 border-2 border-blue-500 backdrop-blur-sm ${isDark ? 'bg-[#1E293B]' : 'bg-white'
                      }`}>
                      <p className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>
                        {activeLead.nome}
                      </p>
                      {activeLead.empresa && (
                        <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-gray-600 dark:text-gray-400'}`}>
                          {activeLead.empresa}
                        </p>
                      )}
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
