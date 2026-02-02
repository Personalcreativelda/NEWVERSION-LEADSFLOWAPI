import { User, Edit, Trash2, MessageCircle, Mail } from 'lucide-react';
import type { Lead } from '../../types';

interface RecentLeadsSectionProps {
  leads: Lead[];
  onEdit?: (leadId: string) => void;
  onDelete?: (leadId: string) => void;
  onChat?: (leadId: string) => void;
  onSendEmail?: (leadId: string) => void;
  isDark?: boolean;
}

export default function RecentLeadsSection({
  leads,
  onEdit,
  onDelete,
  onChat,
  onSendEmail,
  isDark = false,
}: RecentLeadsSectionProps) {
  // Pegar os últimos 5 leads (ordenados por data)
  const recentLeads = [...leads]
    .sort((a, b) => {
      const dateA = new Date(a.data || '').getTime();
      const dateB = new Date(b.data || '').getTime();
      return dateB - dateA;
    })
    .slice(0, 5);

  // Mapear status para cores e texto
  const getStatusStyle = (status?: string): { bg: string; text: string; label: string } => {
    if (!status) return { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Sem status' };

    const statusLower = status.toLowerCase().replace(/_/g, ' ');

    if (statusLower === 'novo' || statusLower === 'new') {
      return { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Novo' };
    } else if (statusLower === 'convertido' || statusLower === 'converted' || statusLower === 'fechado') {
      return { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Fechado' };
    } else if (statusLower.includes('negociacao') || statusLower.includes('negotiation')) {
      return { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Negociação' };
    } else if (statusLower.includes('qualificado') || statusLower.includes('qualified') || statusLower.includes('aguardando') || statusLower.includes('contato')) {
      return { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Contato' };
    } else if (statusLower === 'perdido' || statusLower === 'lost') {
      return { bg: 'bg-red-100', text: 'text-red-700', label: 'Perdido' };
    }

    return { bg: 'bg-gray-100', text: 'text-gray-700', label: status };
  };

  // Cores de avatar (vão rotacionando)
  const avatarColors = [
    'bg-blue-100 text-blue-600',
    'bg-purple-100 text-purple-600',
    'bg-orange-100 text-orange-600',
    'bg-green-100 text-green-600',
    'bg-pink-100 text-pink-600',
  ];

  // Formatar tempo desde o lead
  const formatTempo = (dateString?: string): string => {
    if (!dateString) return 'Sem data';

    const date = new Date(dateString);
    const hoje = new Date();
    const diffMs = hoje.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) {
      return 'Agora';
    } else if (diffHours < 24) {
      return `${diffHours}h atrás`;
    } else if (diffDays === 1) {
      return 'Ontem';
    } else if (diffDays < 7) {
      return `${diffDays}d atrás`;
    } else {
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    }
  };

  if (recentLeads.length === 0) {
    return (
      <div className="bg-card dark:bg-card rounded-2xl p-6 border border-border dark:border-border shadow-sm">
        <h3 className="text-foreground dark:text-foreground mb-6">
          Leads Recentes
        </h3>

        <div className="text-center py-8">
          <p className="text-gray-500 dark:text-gray-500 dark:text-gray-400">
            Nenhum lead cadastrado ainda
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card dark:bg-card rounded-2xl p-6 border border-border dark:border-border shadow-sm">
      <h3 className="text-foreground dark:text-foreground font-semibold text-lg mb-6">
        Leads Recentes
      </h3>

      <div className="space-y-3">
        {recentLeads.map((lead) => {
          const statusStyle = getStatusStyle(lead.status);
          // Encontrar o índice do lead no array original
          const originalIndex = leads.findIndex(l => l.id === lead.id);
          const avatarColor = avatarColors[originalIndex % avatarColors.length];

          return (
            <div
              key={lead.id}
              className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-3 rounded-xl hover:bg-muted dark:hover:bg-muted/50 transition-colors"
            >
              {/* Avatar + Info */}
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {/* Avatar circular - com imagem ou iniciais */}
                {lead.avatarUrl ? (
                  <img
                    src={lead.avatarUrl}
                    alt={lead.nome || 'Lead'}
                    className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                    onError={(e) => {
                      // Fallback para ícone se imagem falhar
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      target.nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                ) : null}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${avatarColor} ${lead.avatarUrl ? 'hidden' : ''}`}>
                  <User className="w-5 h-5" />
                </div>

                {/* Nome e Origem/Tempo */}
                <div className="flex-1 min-w-0">
                  <p className="text-foreground dark:text-foreground font-medium truncate">
                    {lead.name || (lead as any).nome || lead.email || lead.phone || 'Lead sem nome'}
                  </p>
                  <p className="text-sm text-muted-foreground dark:text-muted-foreground truncate">
                    {lead.origem || (lead as any).source || lead.status || 'Sem origem'} • {formatTempo(lead.data || (lead as any).created_at)}
                  </p>
                </div>
              </div>

              {/* Badge de Status */}
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <span className={`px-3 py-1 rounded-lg text-sm font-medium flex-shrink-0 ${statusStyle.bg} ${statusStyle.text}`}>
                  {statusStyle.label}
                </span>
              </div>

              {/* Botões de Ação */}
              <div className="flex flex-wrap gap-1 self-stretch sm:ml-2">
                {onEdit && (
                  <button
                    className="p-2 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 transition-colors flex-shrink-0"
                    onClick={() => onEdit(lead.id)}
                    title="Editar lead"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                )}
                {onChat && (
                  <button
                    className="p-2 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400 transition-colors flex-shrink-0"
                    onClick={() => onChat(lead.id)}
                    title="Chat WhatsApp"
                  >
                    <MessageCircle className="w-4 h-4" />
                  </button>
                )}
                {onSendEmail && lead.email && (
                  <button
                    className="p-2 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/30 text-purple-600 dark:text-purple-400 transition-colors flex-shrink-0"
                    onClick={() => onSendEmail(lead.id)}
                    title="Enviar e-mail"
                  >
                    <Mail className="w-4 h-4" />
                  </button>
                )}
                {onDelete && (
                  <button
                    className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 transition-colors flex-shrink-0"
                    onClick={() => onDelete(lead.id)}
                    title="Excluir lead"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

