import { Edit, Trash2, MessageCircle, RefreshCw, Download, Upload, Mail, CheckSquare, Search, Plus, Megaphone, Square } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { Lead } from '../../types';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';

// Ícone do WhatsApp
const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
  </svg>
);

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

// Obter iniciais do nome
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

// Obter cor do avatar baseada no nome (consistente)
const getAvatarColor = (name: string): { bg: string; text: string } => {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
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
  onToggleEmailMarketing?: (leadId: string) => void;
  onSendEmail?: (leadId: string) => void;
  onNovoLead?: () => void;
  onCampaigns?: () => void;
  onDeleteMultiple?: (leadIds: string[]) => void; // ✅ MUDADO: Recebe IDs ao invés de índices
  userPlan?: 'free' | 'business' | 'enterprise';
  planExpired?: boolean;
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
  onToggleEmailMarketing,
  onSendEmail,
  onNovoLead,
  onCampaigns,
  onDeleteMultiple,
  userPlan,
  planExpired,
  loading
}: LeadsTableProps) {
  const [busca, setBusca] = useState('');
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [selectedLeads, setSelectedLeads] = useState<Set<number>>(new Set());
  const LEADS_POR_PAGINA = 50; // ✅ AUMENTADO: 10 → 50 leads por página

  // Filtrar leads pela busca
  const leadsFiltrados = leads.filter((lead) => {
    if (!busca) return true;

    const buscaLower = busca.toLowerCase();
    return (
      lead.nome?.toLowerCase().includes(buscaLower) ||
      lead.telefone?.includes(busca) ||
      lead.email?.toLowerCase().includes(buscaLower) ||
      lead.interesse?.toLowerCase().includes(buscaLower) ||
      lead.origem?.toLowerCase().includes(buscaLower) ||
      lead.status?.toLowerCase().includes(buscaLower)
    );
  });

  // Calcular paginação
  const totalPaginas = Math.ceil(leadsFiltrados.length / LEADS_POR_PAGINA);
  const indexInicio = (paginaAtual - 1) * LEADS_POR_PAGINA;
  const indexFim = indexInicio + LEADS_POR_PAGINA;
  const leadsExibidos = leadsFiltrados.slice(indexInicio, indexFim);

  // Resetar página ao filtrar
  const handleBuscaChange = (valor: string) => {
    setBusca(valor);
    setPaginaAtual(1);
  };

  // ✅ Ajustar página atual se ficar fora do range após deletar leads
  useEffect(() => {
    if (totalPaginas > 0 && paginaAtual > totalPaginas) {
      setPaginaAtual(totalPaginas);
    }
  }, [totalPaginas, paginaAtual]);

  // Funções de seleção múltipla
  const toggleSelectLead = (index: number) => {
    const newSelected = new Set(selectedLeads);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedLeads(newSelected);
  };

  const toggleSelectAll = () => {
    // ✅ MUDANÇA: Selecionar apenas os leads EXIBIDOS na página atual (não todos)
    if (selectedLeads.size === leadsExibidos.length) {
      setSelectedLeads(new Set());
    } else {
      // ✅ Mapear apenas os leads da página atual
      const currentPageIndices = leadsExibidos.map((lead) => {
        return leads.findIndex(l => l.id === lead.id);
      });
      setSelectedLeads(new Set(currentPageIndices));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedLeads.size === 0) return;

    if (!confirm(`Tem certeza que deseja deletar ${selectedLeads.size} lead(s) selecionado(s)?`)) {
      return;
    }

    if (onDeleteMultiple) {
      const leadIds = Array.from(selectedLeads).map(index => leads[index]?.id).filter(Boolean);
      console.log('[LeadsTable] Sending lead IDs to delete:', leadIds);
      onDeleteMultiple(leadIds);
      setSelectedLeads(new Set());
    }
  };

  const allSelected = leadsExibidos.length > 0 && selectedLeads.size === leadsExibidos.length;

  // Funções de navegação
  const irParaPagina = (pagina: number) => {
    setPaginaAtual(Math.max(1, Math.min(pagina, totalPaginas)));
  };

  // Gerar botões de paginação
  const gerarBotoesPaginacao = () => {
    const botoes: (number | string)[] = [];
    const maxBotoes = 5;

    if (totalPaginas <= maxBotoes) {
      for (let i = 1; i <= totalPaginas; i++) {
        botoes.push(i);
      }
    } else {
      if (paginaAtual <= 3) {
        botoes.push(1, 2, 3, 4, '...', totalPaginas);
      } else if (paginaAtual >= totalPaginas - 2) {
        botoes.push(1, '...', totalPaginas - 3, totalPaginas - 2, totalPaginas - 1, totalPaginas);
      } else {
        botoes.push(1, '...', paginaAtual - 1, paginaAtual, paginaAtual + 1, '...', totalPaginas);
      }
    }

    return botoes;
  };

  // Formatar data
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

  // Badge de status
  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();

    const statusStyles: Record<string, string> = {
      novo: 'bg-blue-100 text-blue-700',
      qualificado: 'bg-blue-100 text-blue-600',
      'em negociacao': 'bg-amber-100 text-amber-700',
      'em_negociacao': 'bg-amber-100 text-amber-700',
      aguardando: 'bg-amber-100 text-amber-700',
      'aguardando_resposta': 'bg-amber-100 text-amber-700',
      fechado: 'bg-green-100 text-green-700',
      convertido: 'bg-green-100 text-green-700',
      perdido: 'bg-red-100 text-red-700',
    };

    let className = 'bg-indigo-100 text-indigo-700';

    for (const [key, value] of Object.entries(statusStyles)) {
      if (s.includes(key)) {
        className = value;
        break;
      }
    }

    return (
      <span className={`inline-block px-3 py-1 rounded-md text-xs ${className}`}>
        {status}
      </span>
    );
  };

  // Verificar se pode importar - HABILITADO PARA TODOS OS PLANOS
  const canImport = true; // Todos os planos podem importar, o limite é controlado na importação
  const isExpired = planExpired === true;

  return (
    <div className="bg-card dark:bg-card rounded-2xl border border-border dark:border-border shadow-[0_2px_8px_-4px_rgba(15,23,42,0.12)] dark:shadow-[0_2px_8px_-4px_rgba(15,23,42,0.4)] overflow-hidden">

      {/* Header da Tabela - Desktop e Mobile com layouts diferentes */}
      <div className="px-4 md:px-6 py-4 border-b border-border dark:border-border bg-card dark:bg-card">

        {/* Layout Mobile */}
        <div className="block md:hidden space-y-3">
          {/* Título */}
          <h3 className="text-foreground dark:text-foreground">Tabela de Leads</h3>

          {/* Campo de Busca */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500 dark:text-gray-400" />
            <input
              type="text"
              value={busca}
              onChange={(e) => handleBuscaChange(e.target.value)}
              placeholder="Buscar leads..."
              className="w-full pl-9 pr-4 py-2 border border-input dark:border-input rounded-lg bg-card dark:bg-card text-foreground dark:text-foreground placeholder-muted-foreground focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 transition-colors"
            />
          </div>

          {/* Botões de Ação - Mobile (apenas ícones) */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {onNovoLead && (
              <button
                onClick={isExpired ? () => alert('⚠️ Seu plano expirou!\n\nPara continuar usando o LeadsFlowAPI, você precisa renovar seu plano.\n\nClique em "Upgrade de Plano" para escolher um pacote.') : onNovoLead}
                disabled={isExpired}
                className={`flex items-center justify-center min-w-[40px] h-10 px-3 rounded-lg transition-colors shadow-sm ${isExpired
                    ? 'bg-muted dark:bg-muted text-muted-foreground dark:text-muted-foreground cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                title={isExpired ? "Plano expirado" : "Adicionar Leads"}
              >
                <Plus className="w-5 h-5" />
              </button>
            )}

            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={loading}
                className="flex items-center justify-center min-w-[40px] h-10 px-3 bg-card dark:bg-card border border-border dark:border-border hover:bg-muted dark:hover:bg-muted text-foreground dark:text-foreground rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                title="Atualizar"
              >
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            )}

            {onExport && (
              <button
                onClick={onExport}
                className="flex items-center justify-center min-w-[40px] h-10 px-3 bg-card dark:bg-card border border-border dark:border-border hover:bg-emerald-50 dark:hover:bg-emerald-900/30 hover:border-emerald-500 text-foreground dark:text-foreground hover:text-emerald-600 dark:hover:text-emerald-400 rounded-lg transition-colors shadow-sm"
                title="Exportar"
              >
                <Download className="w-5 h-5" />
              </button>
            )}

            {onImport && (
              <button
                onClick={isExpired ? () => alert('⚠️ Seu plano expirou!\n\nPara continuar usando o LeadsFlowAPI, você precisa renovar seu plano.\n\nClique em "Upgrade de Plano" para escolher um pacote.') : onImport}
                disabled={isExpired}
                className={`flex items-center justify-center min-w-[40px] h-10 px-3 rounded-lg transition-colors shadow-sm ${isExpired
                    ? 'bg-muted dark:bg-muted text-muted-foreground dark:text-muted-foreground cursor-not-allowed border border-border dark:border-border'
                    : 'bg-card dark:bg-card border border-border dark:border-border hover:bg-muted dark:hover:bg-muted/50 hover:border-blue-500 text-foreground dark:text-foreground hover:text-blue-600 dark:hover:text-blue-400'
                  }`}
                title={isExpired ? "Plano expirado" : "Importar"}
              >
                <Upload className="w-5 h-5" />
              </button>
            )}

            {onImportWhatsApp && (
              <button
                onClick={isExpired ? () => alert('⚠️ Seu plano expirou!\n\nPara continuar usando o LeadsFlowAPI, você precisa renovar seu plano.\n\nClique em "Upgrade de Plano" para escolher um pacote.') : onImportWhatsApp}
                disabled={isExpired}
                className={`flex items-center justify-center min-w-[40px] h-10 px-3 rounded-lg transition-colors shadow-sm ${isExpired
                    ? 'bg-muted dark:bg-muted text-muted-foreground dark:text-muted-foreground cursor-not-allowed border border-border dark:border-border'
                    : 'bg-card dark:bg-card border border-border dark:border-border hover:bg-muted dark:hover:bg-muted/50 hover:border-green-500 text-foreground dark:text-foreground hover:text-green-600 dark:hover:text-green-400'
                  }`}
                title={isExpired ? "Plano expirado" : "Importar do WhatsApp"}
              >
                <WhatsAppIcon className="w-5 h-5" />
              </button>
            )}

            {onCampaigns && (
              <button
                onClick={isExpired ? () => alert('⚠️ Seu plano expirou!\n\nPara continuar usando o LeadsFlowAPI, você precisa renovar seu plano.\n\nClique em "Upgrade de Plano" para escolher um pacote.') : onCampaigns}
                disabled={isExpired}
                className={`flex items-center justify-center min-w-[40px] h-10 px-3 rounded-lg transition-colors shadow-sm ${isExpired
                    ? 'bg-muted dark:bg-muted text-muted-foreground dark:text-muted-foreground cursor-not-allowed'
                    : 'bg-purple-600 hover:bg-purple-700 text-white'
                  }`}
                title={isExpired ? "Plano expirado" : "Campanhas"}
              >
                <Megaphone className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Layout Desktop */}
        <div className="hidden md:block">
          <div className="flex justify-between items-center gap-4 mb-3">
            <h3 className="text-foreground dark:text-foreground font-semibold">Tabela de Leads</h3>

            {/* Campo de Busca */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500 dark:text-gray-400" />
              <input
                type="text"
                value={busca}
                onChange={(e) => handleBuscaChange(e.target.value)}
                placeholder="Buscar leads..."
                className="pl-9 pr-4 py-2 border border-border dark:border-border rounded-lg bg-card dark:bg-card text-foreground dark:text-foreground placeholder-muted-foreground focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 transition-colors"
              />
            </div>
          </div>

          {/* Botões de Ação - Desktop (com texto) */}
          <div className="flex flex-wrap gap-2">
            {onNovoLead && (
              <button
                onClick={isExpired ? () => alert('⚠️ Seu plano expirou!\n\nPara continuar usando o LeadsFlowAPI, você precisa renovar seu plano.\n\nClique em "Upgrade de Plano" para escolher um pacote.') : onNovoLead}
                disabled={isExpired}
                className={`inline-flex items-center gap-2 px-4 py-2 ${isExpired
                    ? 'bg-muted dark:bg-muted text-muted-foreground dark:text-muted-foreground cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                  } rounded-lg transition-colors shadow-sm`}
              >
                <Plus className="w-4 h-4" />
                <span>Adicionar Leads</span>
              </button>
            )}

            {selectedLeads.size > 0 && onDeleteMultiple && (
              <button
                onClick={handleDeleteSelected}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors shadow-sm"
              >
                <Trash2 className="w-4 h-4" />
                <span>Deletar Selecionados ({selectedLeads.size})</span>
              </button>
            )}

            {selectedLeads.size > 0 && (
              <button
                onClick={() => setSelectedLeads(new Set())}
                className="inline-flex items-center gap-2 px-4 py-2 bg-card dark:bg-card border border-border dark:border-border hover:bg-muted dark:hover:bg-muted text-foreground dark:text-foreground rounded-lg transition-colors shadow-sm"
              >
                <Square className="w-4 h-4" />
                <span>Limpar Seleção</span>
              </button>
            )}

            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={loading}
                className="inline-flex items-center gap-2 px-4 py-2 bg-card dark:bg-card border border-border dark:border-border hover:bg-muted dark:hover:bg-muted text-foreground dark:text-foreground rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span>Atualizar</span>
              </button>
            )}

            {onExport && (
              <button
                onClick={onExport}
                className="inline-flex items-center gap-2 px-4 py-2 bg-card dark:bg-card border border-border dark:border-border hover:bg-emerald-50 dark:hover:bg-emerald-900/30 hover:border-emerald-500 text-foreground dark:text-foreground hover:text-emerald-600 dark:hover:text-emerald-400 rounded-lg transition-colors shadow-sm"
              >
                <Download className="w-4 h-4" />
                <span>Exportar</span>
              </button>
            )}

            {onImport && (
              <button
                onClick={isExpired ? () => alert('⚠️ Seu plano expirou!\n\nPara continuar usando o LeadsFlowAPI, você precisa renovar seu plano.\n\nClique em "Upgrade de Plano" para escolher um pacote.') : onImport}
                disabled={isExpired}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg transition-colors shadow-sm ${isExpired
                    ? 'bg-muted dark:bg-muted text-muted-foreground dark:text-muted-foreground cursor-not-allowed border border-border dark:border-border'
                    : 'bg-card dark:bg-card border border-border dark:border-border hover:bg-muted dark:hover:bg-muted/50 hover:border-blue-500 text-foreground dark:text-foreground hover:text-blue-600 dark:hover:text-blue-400'
                  }`}
              >
                <Upload className="w-4 h-4" />
                <span>Importar</span>
              </button>
            )}

            {onImportWhatsApp && (
              <button
                onClick={isExpired ? () => alert('⚠️ Seu plano expirou!\n\nPara continuar usando o LeadsFlowAPI, você precisa renovar seu plano.\n\nClique em "Upgrade de Plano" para escolher um pacote.') : onImportWhatsApp}
                disabled={isExpired}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg transition-colors shadow-sm ${isExpired
                    ? 'bg-muted dark:bg-muted text-muted-foreground dark:text-muted-foreground cursor-not-allowed border border-border dark:border-border'
                    : 'bg-card dark:bg-card border border-border dark:border-border hover:bg-muted dark:hover:bg-muted/50 hover:border-green-500 text-foreground dark:text-foreground hover:text-green-600 dark:hover:text-green-400'
                  }`}
              >
                <WhatsAppIcon className="w-4 h-4" />
                <span>Importar do WhatsApp</span>
              </button>
            )}

            {onCampaigns && (
              <button
                onClick={isExpired ? () => alert('⚠️ Seu plano expirou!\n\nPara continuar usando o LeadsFlowAPI, você precisa renovar seu plano.\n\nClique em "Upgrade de Plano" para escolher um pacote.') : onCampaigns}
                disabled={isExpired}
                className={`inline-flex items-center gap-2 px-4 py-2 ${isExpired
                    ? 'bg-muted dark:bg-muted text-muted-foreground dark:text-muted-foreground cursor-not-allowed'
                    : 'bg-purple-600 hover:bg-purple-700 text-white'
                  } rounded-lg transition-colors shadow-sm`}
              >
                <Megaphone className="w-4 h-4" />
                <span>Campanhas</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Wrapper da Tabela */}
      <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
        <table className="w-full min-w-[900px]">
          <thead
            className="sticky top-0 z-10 shadow-[0_1px_4px_rgba(15,23,42,0.05)] dark:shadow-[0_1px_4px_rgba(15,23,42,0.3)]"
            style={{ backgroundColor: 'hsl(var(--card))' }}
          >
            <tr className="border-b-2 border-border dark:border-border">
              <th className="px-4 py-4 text-left" style={{ width: '50px' }}>
                <button
                  onClick={toggleSelectAll}
                  className="p-1 rounded hover:bg-muted dark:hover:bg-muted transition-colors"
                  title={allSelected ? 'Desmarcar todos' : 'Selecionar todos'}
                >
                  {allSelected ? (
                    <CheckSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  ) : (
                    <Square className="w-5 h-5 text-muted-foreground" />
                  )}
                </button>
              </th>
              <th className="px-6 py-4 text-left text-xs uppercase tracking-wider text-muted-foreground dark:text-muted-foreground">
                Data
              </th>
              <th className="px-6 py-4 text-left text-xs uppercase tracking-wider text-muted-foreground dark:text-muted-foreground">
                Nome
              </th>
              <th className="px-6 py-4 text-left text-xs uppercase tracking-wider text-muted-foreground dark:text-muted-foreground">
                Email
              </th>
              <th className="px-6 py-4 text-left text-xs uppercase tracking-wider text-muted-foreground dark:text-muted-foreground">
                Telefone
              </th>
              <th className="px-6 py-4 text-left text-xs uppercase tracking-wider text-muted-foreground dark:text-muted-foreground">
                Interesse
              </th>
              <th className="px-6 py-4 text-left text-xs uppercase tracking-wider text-muted-foreground dark:text-muted-foreground">
                Origem
              </th>
              <th className="px-6 py-4 text-left text-xs uppercase tracking-wider text-muted-foreground dark:text-muted-foreground">
                Status
              </th>
              <th className="px-6 py-4 text-left text-xs uppercase tracking-wider text-muted-foreground dark:text-muted-foreground" style={{ width: '140px' }}>
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {leadsExibidos.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-6 py-12 text-center text-gray-500 dark:text-gray-500 dark:text-gray-400">
                  Nenhum lead encontrado. Adicione seu primeiro lead!
                </td>
              </tr>
            ) : (
              leadsExibidos.map((lead, displayIndex) => {
                const leadIndex = leads.findIndex(l => l.id === lead.id);
                const isSelected = selectedLeads.has(leadIndex);

                return (
                  <tr
                    key={displayIndex}
                    className={`border-b border-border dark:border-border transition-colors ${isSelected
                        ? 'bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30'
                        : lead.marcado_email
                          ? 'bg-purple-50 dark:bg-purple-900/10 hover:bg-purple-100 dark:hover:bg-purple-900/20'
                          : 'hover:bg-muted dark:hover:bg-muted/50'
                      }`}
                    onMouseEnter={() => setHoveredRow(displayIndex)}
                    onMouseLeave={() => setHoveredRow(null)}
                  >
                    <td className="px-4 py-4">
                      <button
                        onClick={() => toggleSelectLead(leadIndex)}
                        className="p-1 rounded hover:bg-muted dark:hover:bg-muted transition-colors"
                        title={isSelected ? 'Desmarcar' : 'Selecionar'}
                      >
                        {isSelected ? (
                          <CheckSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        ) : (
                          <Square className="w-5 h-5 text-muted-foreground" />
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground dark:text-muted-foreground">
                      {formatDate(lead.data)}
                    </td>
                    <td className="px-6 py-4 text-sm text-foreground dark:text-foreground">
                      <div className="flex items-center gap-3">
                        {/* Avatar colorido com iniciais */}
                        <Avatar className="h-8 w-8 flex-shrink-0">
                          {lead.avatarUrl ? (
                            <AvatarImage src={lead.avatarUrl} alt={lead.nome} />
                          ) : null}
                          <AvatarFallback
                            className={`${getAvatarColor(lead.nome).bg} ${getAvatarColor(lead.nome).text} text-xs font-semibold`}
                          >
                            {getInitials(lead.nome)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="font-medium">{lead.nome || '-'}</span>
                          {lead.marcado_email && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded text-xs w-fit">
                              <Mail className="w-3 h-3" />
                              Email
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground dark:text-muted-foreground">
                      {lead.email ? (
                        <a href={`mailto:${lead.email}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                          {lead.email}
                        </a>
                      ) : (
                        <span className="text-muted-foreground dark:text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground dark:text-muted-foreground">
                      {lead.telefone || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground dark:text-muted-foreground">
                      {lead.interesse || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground dark:text-muted-foreground">
                      {lead.origem || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {getStatusBadge(lead.status)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        {/* Botão de enviar email individual (aparece no hover se tiver email) */}
                        {lead.email && hoveredRow === displayIndex && onSendEmail && (
                          <button
                            onClick={() => onSendEmail(lead.id)}
                            className="p-2 border border-border dark:border-border rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/30 hover:border-purple-500 hover:text-purple-600 dark:hover:text-purple-400 transition-all"
                            title="Enviar Email"
                          >
                            <Mail className="w-4 h-4" />
                          </button>
                        )}
                        {/* Botão de marcar para email marketing em massa */}
                        {lead.email && hoveredRow === displayIndex && onToggleEmailMarketing && (
                          <button
                            onClick={() => onToggleEmailMarketing(lead.id)}
                            className={`p-2 border rounded-lg transition-all ${lead.marcado_email
                                ? 'bg-blue-100 dark:bg-blue-900/50 border-blue-500 dark:border-blue-600 text-blue-600 dark:text-blue-400'
                                : 'border-border dark:border-border hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400'
                              }`}
                            title={lead.marcado_email ? 'Remover da lista de envio em massa' : 'Marcar para envio em massa'}
                          >
                            <CheckSquare className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => onChat(lead.id)}
                          className="p-2 border border-border dark:border-border rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30 hover:border-green-500 hover:text-green-600 dark:hover:text-green-400 transition-all"
                          title="WhatsApp"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onEdit(lead.id)}
                          className="p-2 border border-border dark:border-border rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/30 hover:border-amber-500 hover:text-amber-600 dark:hover:text-amber-400 transition-all"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onDelete(lead.id)}
                          className="p-2 border border-border dark:border-border rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 hover:border-red-500 hover:text-red-600 dark:hover:text-red-400 transition-all"
                          title="Deletar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {totalPaginas > 1 && (
        <div className="px-6 py-4 border-t border-border dark:border-border flex items-center justify-between">
          <div className="text-sm text-muted-foreground dark:text-muted-foreground">
            Mostrando {indexInicio + 1} a {Math.min(indexFim, leadsFiltrados.length)} de {leadsFiltrados.length} leads
          </div>

          <div className="flex gap-1">
            <button
              onClick={() => irParaPagina(paginaAtual - 1)}
              disabled={paginaAtual === 1}
              className="px-3 py-1 rounded-lg border border-border dark:border-border bg-card dark:bg-card text-foreground dark:text-foreground hover:bg-muted dark:hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              ‹
            </button>

            {gerarBotoesPaginacao().map((botao, index) => (
              <button
                key={index}
                onClick={() => typeof botao === 'number' && irParaPagina(botao)}
                disabled={botao === '...'}
                className={`px-3 py-1 rounded-lg border transition-colors ${botao === paginaAtual
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : botao === '...'
                      ? 'border-transparent text-muted-foreground dark:text-muted-foreground cursor-default'
                      : 'border-border dark:border-border bg-card dark:bg-card text-foreground dark:text-foreground hover:bg-muted dark:hover:bg-muted'
                  }`}
              >
                {botao}
              </button>
            ))}

            <button
              onClick={() => irParaPagina(paginaAtual + 1)}
              disabled={paginaAtual === totalPaginas}
              className="px-3 py-1 rounded-lg border border-border dark:border-border bg-card dark:bg-card text-foreground dark:text-foreground hover:bg-muted dark:hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

