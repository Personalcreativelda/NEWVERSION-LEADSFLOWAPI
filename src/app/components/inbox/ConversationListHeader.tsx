// Topo da lista de conversas ao estilo do WhatsApp: título com ações, pesquisa e filtros
// em "chips" só com texto. O mesmo componente no computador e no telemóvel.
import { Search, X, MessageSquarePlus, MoreVertical, ChevronDown, Check, CheckSquare, Square, PanelLeftClose, RefreshCw, MessageCircle } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { BrandIcon, brandForChannel } from '../base/BrandIcon';
import { cn } from '../ui/utils';

export type QuickFilter = 'all' | 'unread' | 'mine' | 'groups' | 'unassigned' | 'pending' | 'resolved' | 'tags';

/** Filtros principais (chips) e os restantes no "Mais" */
const PRIMARY: { id: QuickFilter; label: string }[] = [
  { id: 'all', label: 'Tudo' },
  { id: 'unread', label: 'Não lidas' },
  { id: 'mine', label: 'Minhas' },
  { id: 'groups', label: 'Grupos' },
];
const MORE: { id: QuickFilter; label: string }[] = [
  { id: 'unassigned', label: 'Não atribuídas' },
  { id: 'pending', label: 'Pendentes' },
  { id: 'resolved', label: 'Resolvidas' },
  { id: 'tags', label: 'Com etiqueta' },
];

interface ChannelOption { id: string; name: string; type: string }

interface ConversationListHeaderProps {
  isMobile: boolean;
  searchQuery: string;
  onSearch: (value: string) => void;
  quickFilter: QuickFilter;
  onQuickFilter: (f: QuickFilter) => void;
  unreadChats: number;
  channels: ChannelOption[];
  channelFilter?: string;
  onChannelFilter: (id?: string) => void;
  /** Filtro vindo de fora (menções, não atendidas, etiqueta escolhida) */
  externalFilter?: string | null;
  onClearExternalFilter?: () => void;
  onNewConversation?: () => void;
  onCollapse?: () => void;
  onSyncGroups?: () => void;
  syncingGroups?: boolean;
  // Seleção múltipla
  isSelectMode: boolean;
  selectedCount: number;
  allSelected: boolean;
  onStartSelect: () => void;
  onToggleSelectAll: () => void;
  onDeleteSelected: () => void;
  onExitSelect: () => void;
}

const iconBtn = 'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground';

function Chip({ active, onClick, children }: { active: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-8 flex-shrink-0 items-center gap-1 rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors',
        active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

export function ConversationListHeader(props: ConversationListHeaderProps) {
  const {
    isMobile, searchQuery, onSearch, quickFilter, onQuickFilter, unreadChats,
    channels, channelFilter, onChannelFilter, externalFilter, onClearExternalFilter,
    onNewConversation, onCollapse, onSyncGroups, syncingGroups,
    isSelectMode, selectedCount, allSelected, onStartSelect, onToggleSelectAll, onDeleteSelected, onExitSelect,
  } = props;

  const moreActive = MORE.find((m) => m.id === quickFilter);
  const activeChannel = channels.find((c) => c.id === channelFilter);
  const moreLabel = moreActive?.label || activeChannel?.name || 'Mais';

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={iconBtn} aria-label="Mais opções" title="Mais opções">
          <MoreVertical className="h-[18px] w-[18px]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[220px]">
        <DropdownMenuItem onSelect={onStartSelect}>
          <CheckSquare className="text-muted-foreground" /> Selecionar conversas
        </DropdownMenuItem>
        {onSyncGroups && (
          <DropdownMenuItem onSelect={onSyncGroups} disabled={syncingGroups}>
            <RefreshCw className={cn('text-muted-foreground', syncingGroups && 'animate-spin')} /> Sincronizar grupos
          </DropdownMenuItem>
        )}
        {onCollapse && (
          <DropdownMenuItem onSelect={onCollapse}>
            <PanelLeftClose className="text-muted-foreground" /> Recolher lista
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (isSelectMode) {
    return (
      <div className="flex h-14 flex-shrink-0 items-center gap-2 border-b border-border px-2">
        <button type="button" className={iconBtn} onClick={onExitSelect} aria-label="Cancelar" title="Cancelar">
          <X className="h-5 w-5" />
        </button>
        <span className="flex-1 text-sm font-medium text-foreground">
          {selectedCount > 0 ? `${selectedCount} selecionada(s)` : 'Selecionar conversas'}
        </span>
        <button type="button" className={iconBtn} onClick={onToggleSelectAll} aria-label="Selecionar todas" title={allSelected ? 'Desmarcar todas' : 'Selecionar todas'}>
          {allSelected ? <CheckSquare className="h-5 w-5 text-primary" /> : <Square className="h-5 w-5" />}
        </button>
        <button
          type="button"
          onClick={onDeleteSelected}
          disabled={selectedCount === 0}
          className="h-9 rounded-full px-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-500/10 disabled:opacity-40 dark:text-red-400"
        >
          Apagar
        </button>
      </div>
    );
  }

  return (
    <div className="flex-shrink-0 space-y-2.5 border-b border-border px-3 pb-3 pt-2">
      {!isMobile && (
        <div className="flex h-10 items-center gap-1">
          <h1 className="flex-1 truncate pl-1 text-base font-semibold text-foreground">Conversas</h1>
          {menu}
          {onNewConversation && (
            <button
              type="button"
              onClick={onNewConversation}
              aria-label="Nova conversa"
              title="Nova conversa"
              className="ml-1 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-[filter,transform] hover:brightness-110 active:scale-95"
            >
              <MessageSquarePlus className="h-[18px] w-[18px]" />
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-1">
        <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-muted px-3.5 focus-within:ring-2 focus-within:ring-primary/20">
          <Search className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <input
            data-bare
            type="text"
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Pesquisar"
            className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          {searchQuery && (
            <button type="button" onClick={() => onSearch('')} className="text-muted-foreground hover:text-foreground" aria-label="Limpar pesquisa">
              <X className="h-4 w-4" />
            </button>
          )}
        </label>
        {isMobile && menu}
      </div>

      <div
        className="-mx-3 flex gap-2 overflow-x-auto px-3 scrollbar-none"
        // Esbate a margem direita para indicar que há mais filtros
        style={{ maskImage: 'linear-gradient(to right, black calc(100% - 24px), transparent)', WebkitMaskImage: 'linear-gradient(to right, black calc(100% - 24px), transparent)' }}
      >
        {externalFilter && (
          <Chip active onClick={onClearExternalFilter}>
            {externalFilter} <X className="h-3.5 w-3.5" />
          </Chip>
        )}
        {PRIMARY.map((f) => (
          <Chip key={f.id} active={quickFilter === f.id} onClick={() => onQuickFilter(f.id)}>
            {f.label}
            {f.id === 'unread' && unreadChats > 0 && (
              <span className="tabular-nums opacity-80" translate="no">{unreadChats > 99 ? '99+' : unreadChats}</span>
            )}
          </Chip>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'inline-flex h-8 flex-shrink-0 items-center gap-1 rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors',
                moreActive || activeChannel ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              <span className="max-w-[140px] truncate">{moreLabel}</span>
              {moreActive && activeChannel && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[220px] max-h-[60vh]">
            {MORE.map((m) => (
              <DropdownMenuItem key={m.id} onSelect={() => onQuickFilter(quickFilter === m.id ? 'all' : m.id)}>
                <span className="flex-1">{m.label}</span>
                {quickFilter === m.id && <Check className="text-primary" />}
              </DropdownMenuItem>
            ))}
            {channels.length > 1 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Canal</DropdownMenuLabel>
                {channels.map((ch) => {
                  const brand = brandForChannel(ch.type);
                  return (
                    <DropdownMenuItem key={ch.id} onSelect={() => onChannelFilter(channelFilter === ch.id ? undefined : ch.id)}>
                      {brand ? <BrandIcon brand={brand} className="h-4 w-4" /> : <MessageCircle className="text-muted-foreground" />}
                      <span className="flex-1 truncate" translate="no">{ch.name}</span>
                      {channelFilter === ch.id && <Check className="text-primary" />}
                    </DropdownMenuItem>
                  );
                })}
              </>
            )}
            {(moreActive || activeChannel) && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => { onChannelFilter(undefined); if (moreActive) onQuickFilter('all'); }}>
                  <X className="text-muted-foreground" /> Limpar filtros
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
