import { useRef, useState } from 'react';
import { MessageCircle, Trash2, User } from 'lucide-react';
import type { Lead } from '../../types';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { formatRelativeDay } from '../../utils/format';
import { formatLeadStatus, formatPhone, getOriginInfo, leadDisplayName, leadStatusClass } from './leadDisplay';
import { haptic } from '../../../native';

interface LeadListRowProps {
  lead: Lead;
  onOpen: (lead: Lead) => void;
  onMessage?: (lead: Lead) => void;
  onDelete?: (lead: Lead) => void;
}

const ACTION_WIDTH = 76; // px por ação revelada

const AVATAR_COLORS = ['bg-orange-500', 'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500', 'bg-teal-500', 'bg-indigo-500', 'bg-amber-500'];
function avatarColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function initials(name: string) {
  const words = name.replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  return (words[0][0] + (words[1]?.[0] || '')).toUpperCase();
}

/**
 * Linha de lead (lista nativa): avatar, nome, telefone formatado, chip de estado,
 * ícone da origem e data relativa. Toque abre o detalhe; deslizar para a esquerda
 * mostra Mensagem e Eliminar.
 */
export function LeadListRow({ lead, onOpen, onMessage, onDelete }: LeadListRowProps) {
  const actions = [onMessage && 'message', onDelete && 'delete'].filter(Boolean) as string[];
  const maxOffset = actions.length * ACTION_WIDTH;
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; base: number; horizontal: boolean | null } | null>(null);
  const moved = useRef(false);

  const name = leadDisplayName(lead);
  const phone = formatPhone(lead.telefone || lead.phone);
  const showPhone = phone && phone !== name;
  const origin = getOriginInfo(lead.origem, lead.channelSource);
  const OriginIcon = origin.Icon;
  const date = formatRelativeDay(lead.data || lead.createdAt || lead.capturedAt);

  const onTouchStart = (e: React.TouchEvent) => {
    if (!maxOffset) return;
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, base: offset, horizontal: null };
    moved.current = false;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const s = start.current;
    if (!s) return;
    const dx = e.touches[0].clientX - s.x;
    const dy = e.touches[0].clientY - s.y;
    if (s.horizontal === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) s.horizontal = Math.abs(dx) > Math.abs(dy);
    if (!s.horizontal) return;
    moved.current = true;
    setDragging(true);
    setOffset(Math.min(0, Math.max(-maxOffset - 24, s.base + dx)));
  };
  const onTouchEnd = () => {
    const s = start.current;
    start.current = null;
    setDragging(false);
    if (!s?.horizontal) return;
    const open = offset < -maxOffset / 2;
    if (open && s.base === 0) haptic();
    setOffset(open ? -maxOffset : 0);
  };

  return (
    <li className="relative overflow-hidden bg-card">
      {/* Ações reveladas ao deslizar */}
      {/* Só existem enquanto a linha está deslizada: com a linha parada, um toque (fundo
          de toque) deixava-as ver por trás do conteúdo */}
      {maxOffset > 0 && (offset < 0 || dragging) && (
        <div className="absolute inset-y-0 right-0 flex" style={{ width: maxOffset }} aria-hidden={offset === 0}>
          {onMessage && (
            <button
              type="button"
              onClick={() => { setOffset(0); onMessage(lead); }}
              className="flex flex-1 flex-col items-center justify-center gap-1 bg-emerald-600 text-xs font-medium text-white"
            >
              <MessageCircle className="h-5 w-5" />
              Mensagem
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => { setOffset(0); onDelete(lead); }}
              className="flex flex-1 flex-col items-center justify-center gap-1 bg-red-600 text-xs font-medium text-white"
            >
              <Trash2 className="h-5 w-5" />
              Eliminar
            </button>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          if (moved.current) return;
          if (offset !== 0) { setOffset(0); return; }
          onOpen(lead);
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ transform: `translateX(${offset}px)`, transition: dragging ? 'none' : 'transform 220ms cubic-bezier(0.2,0,0,1)' }}
        className="relative flex w-full items-center gap-3 bg-card px-4 py-3 text-left active:bg-muted"
      >
        <Avatar className="h-11 w-11 flex-shrink-0">
          {lead.avatarUrl ? <AvatarImage src={lead.avatarUrl} alt="" /> : null}
          <AvatarFallback className={`${avatarColor(name)} text-sm font-semibold text-white`}>
            {/* Sem letras no nome (ex.: só o telefone): ícone de pessoa */}
            {initials(name) || <User className="h-5 w-5" />}
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-foreground">{name}</span>
            <span className="flex-shrink-0 text-xs text-muted-foreground">{date}</span>
          </span>
          <span className="mt-1 flex items-center gap-2">
            <span className={`flex-shrink-0 ${origin.color}`} title={origin.label}>
              <OriginIcon className="h-4 w-4" />
            </span>
            {showPhone && <span className="min-w-0 truncate text-[13px] text-muted-foreground tabular-nums">{phone}</span>}
            <span className={`ml-auto flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${leadStatusClass(lead.status)}`}>
              {formatLeadStatus(lead.status)}
            </span>
          </span>
        </span>
      </button>
    </li>
  );
}
