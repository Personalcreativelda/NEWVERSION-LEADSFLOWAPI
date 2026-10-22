import { matchesSearch } from '../../utils/search';
import { Edit, Trash2, MessageCircle, RefreshCw, Download, Upload, Mail, Megaphone, Instagram, Facebook, Send, Smartphone, Search, Plus, CopyX } from 'lucide-react';
import { useState } from 'react';
import type { Lead } from '../../types';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { useConfirm } from '../ui/ConfirmDialog';
import { SkeletonLeadRow } from '../ui/skeletons';
import { DashboardCard } from '../base/DashboardCard';
import { AppButton } from '../base/AppButton';
import { StatusBadge, type StatusTone } from '../base/StatusBadge';
import { EmptyState } from '../base/EmptyState';
import { ResponsiveTable, type ResponsiveTableColumn } from '../base/ResponsiveTable';

const LEADS_POR_PAGINA = 50;

// Ícone do WhatsApp
const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
  </svg>
);

// Helper para renderizar origem com ícone apropriado
const renderOriginWithIcon = (origem: string | undefined, channelSource?: string) => {
  const rawChannel = channelSource || origem || '';
  const channel = rawChannel.toLowerCase().trim();

  if (!channel || channel === '-') {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="text-sm">unknown</span>
      </div>
    );
  }

  let icon = null;
  let label = '';
  let colorClass = 'text-muted-foreground';

  if (channel.includes('whatsapp') || channel.includes('wpp')) {
    icon = <WhatsAppIcon className="w-4 h-4" />;
    colorClass = 'text-green-600 dark:text-green-400';
    label = 'WhatsApp';
  } else if (channel.includes('instagram') || channel.includes('ig') || channel.includes('insta')) {
    icon = <Instagram className="w-4 h-4" />;
    colorClass = 'text-pink-600 dark:text-pink-400';
    label = 'Instagram';
  } else if (channel.includes('facebook') || channel.includes('messenger') || channel.includes('fb')) {
    icon = <Facebook className="w-4 h-4" />;
    colorClass = 'text-blue-600 dark:text-blue-400';
    label = 'Facebook';
  } else if (channel.includes('telegram') || channel.includes('tg')) {
    icon = <Send className="w-4 h-4" />;
    colorClass = 'text-sky-600 dark:text-sky-400';
    label = 'Telegram';
  } else if (channel.includes('sms') || channel.includes('twilio')) {
    icon = <Smartphone className="w-4 h-4" />;
    colorClass = 'text-teal-600 dark:text-teal-400';
    label = 'SMS';
  } else if (channel.includes('email') || channel.includes('mail') || channel.includes('@')) {
    icon = <Mail className="w-4 h-4" />;
    colorClass = 'text-primary';
    label = 'Email';
  } else {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <MessageCircle className="w-4 h-4" />
        <span className="text-sm capitalize">{rawChannel}</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${colorClass}`}>
      {icon}
      <span className="text-sm">{label}</span>
    </div>
  );
};

// Cores de avatar baseadas no nome
const AVATAR_COLORS = [
  { bg: 'bg-orange-500', text: 'text-white' },
  { bg: 'bg-blue-500', text: 'text-white' },
  { bg: 'bg-green-500', text: 'text-white' },
  { bg: 'bg-purple-500', text: 'text-white' },
  { bg: 'bg-pink-500', text: 'text-white' },
  { bg: 'bg-yellow-500', text: 'text-white' },
  { bg: 'bg-red-500', text: 'text-white' },
  { bg: 'bg-indigo-500', text: 'text-white' },
  { bg: 'bg-teal-500', text: 'text-white' },
  { bg: 'bg-cyan-500', text: 'text-white' },
];

const getInitials = (name: string): string => {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
};

const getAvatarColor = (name: string): { bg: string; text: string } => {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

const formatDate = (dateStr?: string) => {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString('pt-BR');
    }
    return dateStr;
  } catch {
    return dateStr;
  }
};

// Tom do StatusBadge por status — mesma classificação semântica que a
// tabela já tinha (novo/qualificado azul, negociação âmbar, fechado
// verde, perdido vermelho, resto = tom neutro).
const getStatusTone = (status: string): StatusTone => {
  const s = status.toLowerCase();
  if (s.includes('novo') || s.includes('qualificado')) return 'info';
  if (s.includes('negociacao') || s.includes('aguardando')) return 'warning';
  if (s.includes('fechado') || s.includes('convertido')) return 'success';
  if (s.includes('perdido')) return 'error';
  return 'secondary';
};

interface LeadsTableProps {
  leads: Lead[];
  onEdit: (leadId: string) => void;
  onDelete: (leadId: string) => void;
  onChat: (leadId: string) => void;
  onRefresh: () => void;
  onExport: () => void;
  onImport: () => void;
  onImportWhatsApp?: () => void;
  /** Remover leads duplicados (fica na barra da tabela, junto das outras ações) */
  onRemoveDuplicates?: () => void;
  onToggleEmailMarketing?: (leadId: string) => void;
  onSendEmail?: (leadId: string) => void;
  onNovoLead?: () => void;
  onCampaigns?: () => void;
  onDeleteMultiple?: (leadIds: string[]) => void;
  userPlan?: 'free' | 'business' | 'enterprise';
  planExpired?: boolean;
  limitReached?: boolean;
  leadsLimitReached?: boolean;
  campaignsLimitReached?: boolean;
  loading?: boolean;
}

export default function LeadsTable({
  leads,
  onEdit,
  onDelete,
  onChat,
  onRefresh,
  onExport,
  onImport,
  onImportWhatsApp,
  onRemoveDuplicates,
  onNovoLead,
  onCampaigns,
  onDeleteMultiple,
  planExpired,
  leadsLimitReached,
  campaignsLimitReached,
  loading,
}: LeadsTableProps) {
  const confirm = useConfirm();
  const [busca, setBusca] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Filtrar leads pela busca
  const leadsFiltrados = leads.filter((lead) => {
    return matchesSearch(busca, lead.nome, lead.telefone, lead.email, lead.interesse, lead.origem, lead.status, (lead as any).empresa);
  });

  const handleBuscaChange = (valor: string) => setBusca(valor);

  // "Todos selecionados" no sentido do conjunto filtrado inteiro — quando
  // verdadeiro, a ação em massa oferece "Apagar Todos" em vez de "Deletar
  // Selecionados" (mesmo espírito do atalho que já existia).
  const allFilteredSelected = selectedIds.length > 0 && selectedIds.length === leadsFiltrados.length;

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    const confirmed = await confirm(`Tem certeza que deseja deletar ${selectedIds.length} lead(s) selecionado(s)?`, {
      title: 'Excluir leads selecionados',
      confirmLabel: 'Excluir',
      variant: 'danger',
    });
    if (!confirmed) return;
    if (onDeleteMultiple) {
      onDeleteMultiple(selectedIds);
      setSelectedIds([]);
    }
  };

  const handleDeleteAll = async () => {
    if (leads.length === 0) return;
    const confirmed = await confirm(`Tem certeza que deseja apagar TODOS os ${leads.length} contatos? Esta ação não pode ser desfeita.`, {
      title: 'Apagar todos os contatos',
      confirmLabel: 'Apagar Todos',
      variant: 'danger',
    });
    if (!confirmed) return;
    if (onDeleteMultiple) {
      const allIds = leads.map((l) => l.id).filter(Boolean);
      onDeleteMultiple(allIds);
      setSelectedIds([]);
    }
  };

  const isExpired = planExpired === true;
  const isAdicionarBlocked = isExpired;
  const isCampaignsBlocked = isExpired || campaignsLimitReached === true;
  const isBlocked = isExpired;

  const handleNovoLeadClick = () => {
    if (isAdicionarBlocked) return;
    if (leadsLimitReached) {
      window.dispatchEvent(new CustomEvent('leadflow:show-upgrade'));
      return;
    }
    onNovoLead?.();
  };

  const columns: ResponsiveTableColumn<Lead>[] = [
    {
      key: 'data',
      label: 'Data',
      render: (lead) => <span className="text-sm text-muted-foreground">{formatDate(lead.data)}</span>,
    },
    {
      key: 'nome',
      label: 'Nome',
      sortable: true,
      sortAccessor: (lead) => lead.nome || '',
      render: (lead) => (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8 flex-shrink-0">
            {lead.avatarUrl ? <AvatarImage src={lead.avatarUrl} alt={lead.nome} /> : null}
            <AvatarFallback className={`${getAvatarColor(lead.nome).bg} ${getAvatarColor(lead.nome).text} text-xs font-semibold`}>
              {getInitials(lead.nome)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="font-medium text-sm text-foreground">{lead.nome || '-'}</span>
            {lead.marcado_email && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full text-xs w-fit">
                <Mail className="w-3 h-3" />
                Email
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'email',
      label: 'Email',
      render: (lead) =>
        lead.email ? (
          <a href={`mailto:${lead.email}`} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
            {lead.email}
          </a>
        ) : (
          <span className="text-sm text-muted-foreground">-</span>
        ),
    },
    {
      key: 'telefone',
      label: 'Telefone',
      render: (lead) => <span className="text-sm text-muted-foreground">{lead.telefone || '-'}</span>,
    },
    {
      key: 'interesse',
      label: 'Interesse',
      render: (lead) => <span className="text-sm text-muted-foreground">{lead.interesse || '-'}</span>,
    },
    {
      key: 'origem',
      label: 'Origem',
      render: (lead) => renderOriginWithIcon(lead.origem, lead.channelSource),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      sortAccessor: (lead) => lead.status || '',
      render: (lead) => <StatusBadge label={lead.status} tone={getStatusTone(lead.status)} />,
    },
    {
      key: 'acoes',
      label: 'Ações',
      align: 'right',
      cardLabel: 'Ações',
      render: (lead) => (
        <div className="flex gap-1.5 justify-end">
          <button
            onClick={() => onChat(lead.id)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-green-600 dark:hover:text-green-400 hover:bg-green-500/10 transition-all duration-150"
            title="WhatsApp"
          >
            <MessageCircle className="w-4 h-4" />
          </button>
          <button
            onClick={() => onEdit(lead.id)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-500/10 transition-all duration-150"
            title="Editar"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(lead.id)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 transition-all duration-150"
            title="Deletar"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <DashboardCard disableContentPadding>
      {/* Header da Tabela */}
      <div className="px-4 md:px-5 py-4 border-b border-border">
        {/* Layout Mobile */}
        <div className="block md:hidden space-y-3">
          <h3 className="text-foreground font-semibold">Tabela de Leads</h3>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={busca}
              onChange={(e) => handleBuscaChange(e.target.value)}
              placeholder="Buscar leads..."
              className="w-full pl-9 pr-4 py-2 border border-border rounded-lg bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all duration-150"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {onNovoLead && (
              <AppButton
                size="icon"
                onClick={handleNovoLeadClick}
                disabled={isAdicionarBlocked}
                title={isAdicionarBlocked ? 'Plano bloqueado' : leadsLimitReached ? 'Limite de leads atingido — clique para fazer upgrade' : 'Adicionar Leads'}
              >
                <Plus />
              </AppButton>
            )}
            {onRefresh && (
              <AppButton size="icon" variant="outline" onClick={onRefresh} disabled={loading} title="Atualizar">
                <RefreshCw className={loading ? 'animate-spin' : ''} />
              </AppButton>
            )}
            {onExport && (
              <AppButton size="icon" variant="outline" onClick={onExport} title="Exportar">
                <Download />
              </AppButton>
            )}
            {onImport && (
              <AppButton size="icon" variant="outline" onClick={() => onImport?.()} disabled={isBlocked} title={isBlocked ? 'Plano bloqueado' : 'Importar'}>
                <Upload />
              </AppButton>
            )}
            {onImportWhatsApp && (
              <AppButton size="icon" variant="outline" onClick={() => onImportWhatsApp?.()} disabled={isBlocked} title={isBlocked ? 'Plano bloqueado' : 'Importar do WhatsApp'}>
                <WhatsAppIcon className="w-4 h-4" />
              </AppButton>
            )}
            {onRemoveDuplicates && (
              <AppButton size="icon" variant="outline" onClick={onRemoveDuplicates} title="Remover duplicados" aria-label="Remover duplicados">
                <CopyX />
              </AppButton>
            )}
            {onCampaigns && (
              <AppButton
                size="icon"
                onClick={() => onCampaigns?.()}
                disabled={isCampaignsBlocked}
                title={isCampaignsBlocked ? (campaignsLimitReached ? 'Limite de campanhas atingido' : 'Plano bloqueado') : 'Campanhas'}
              >
                <Megaphone />
              </AppButton>
            )}
            {selectedIds.length > 0 && onDeleteMultiple && (
              <AppButton
                size="icon"
                variant="destructive"
                onClick={allFilteredSelected ? handleDeleteAll : handleDeleteSelected}
                title={allFilteredSelected ? `Apagar Todos (${leads.length})` : `Deletar Selecionados (${selectedIds.length})`}
              >
                <Trash2 />
              </AppButton>
            )}
          </div>
        </div>

        {/* Layout Desktop */}
        <div className="hidden md:block">
          <div className="flex justify-between items-center gap-4 mb-3">
            <h3 className="text-foreground font-semibold">Tabela de Leads</h3>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={busca}
                onChange={(e) => handleBuscaChange(e.target.value)}
                placeholder="Buscar leads..."
                className="pl-9 pr-4 py-2 border border-border rounded-lg bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all duration-150"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {onNovoLead && (
              <AppButton
                onClick={handleNovoLeadClick}
                disabled={isAdicionarBlocked}
                title={isAdicionarBlocked ? 'Plano bloqueado' : leadsLimitReached ? 'Limite de leads atingido — clique para fazer upgrade' : undefined}
              >
                <Plus />
                Adicionar Leads
              </AppButton>
            )}

            {selectedIds.length > 0 && onDeleteMultiple && (
              <>
                <AppButton variant="destructive" onClick={allFilteredSelected ? handleDeleteAll : handleDeleteSelected}>
                  {allFilteredSelected ? `Apagar Todos (${leads.length})` : `Deletar Selecionados (${selectedIds.length})`}
                </AppButton>
                <AppButton variant="outline" onClick={() => setSelectedIds([])}>
                  Limpar Seleção
                </AppButton>
              </>
            )}

            {onRefresh && (
              <AppButton variant="outline" onClick={onRefresh} disabled={loading}>
                <RefreshCw className={loading ? 'animate-spin' : ''} />
                Atualizar
              </AppButton>
            )}

            {onExport && (
              <AppButton variant="outline" onClick={onExport}>
                <Download />
                Exportar
              </AppButton>
            )}

            {onImport && (
              <AppButton variant="outline" onClick={() => onImport?.()} disabled={isBlocked}>
                <Upload />
                Importar
              </AppButton>
            )}

            {onImportWhatsApp && (
              <AppButton variant="outline" onClick={() => onImportWhatsApp?.()} disabled={isBlocked}>
                <WhatsAppIcon className="w-4 h-4" />
                Importar do WhatsApp
              </AppButton>
            )}

            {onRemoveDuplicates && (
              <AppButton variant="outline" onClick={onRemoveDuplicates}>
                <CopyX />
                Remover duplicados
              </AppButton>
            )}

            {onCampaigns && (
              <AppButton onClick={() => onCampaigns?.()} disabled={isCampaignsBlocked}>
                <Megaphone />
                Campanhas
              </AppButton>
            )}
          </div>
        </div>
      </div>

      {/* Tabela */}
      {loading && leads.length === 0 ? (
        <div className="p-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <SkeletonLeadRow key={i} />
          ))}
        </div>
      ) : (
        <div className="p-4 md:p-5">
          <ResponsiveTable
            columns={columns}
            rows={leadsFiltrados}
            getRowId={(lead) => lead.id}
            selectable
            selected={selectedIds}
            onSelectionChange={setSelectedIds}
            pagination
            rowsPerPage={LEADS_POR_PAGINA}
            stickyHeader
            maxHeight="600px"
            rowClassName={(lead) => (lead.marcado_email ? 'bg-primary/5 hover:bg-primary/10' : undefined)}
            emptyState={<EmptyState title="Nenhum lead encontrado. Adicione seu primeiro lead!" imgSrc="/assets/icons/empty/ic_content.svg" />}
          />
        </div>
      )}
    </DashboardCard>
  );
}
