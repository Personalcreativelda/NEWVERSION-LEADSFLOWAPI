import type { Lead } from '../../types';

interface RecentLeadsProps {
  leads: Lead[];
}

export default function RecentLeads({ leads }: RecentLeadsProps) {
  // Pegar últimos 5 leads
  const recentLeads = leads.slice(-5).reverse();

  // Cores dos avatares
  const avatarColors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#14b8a6'];

  // Formatar data
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Data não informada';
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

  return (
    <div className="bg-card rounded-2xl p-6 border border-border shadow-sm">
      <h3 className="text-foreground mb-6">Leads Recentes</h3>

      {recentLeads.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          Nenhum lead cadastrado ainda
        </div>
      ) : (
        <div className="space-y-0">
          {recentLeads.map((lead, index) => {
            const inicial = (lead.nome || '?').charAt(0).toUpperCase();
            const cor = avatarColors[index % avatarColors.length];

            return (
              <div
                key={index}
                className="flex justify-between items-center py-4 border-b border-gray-100 last:border-b-0"
              >
                <div className="flex items-center gap-3 flex-1">
                  {/* Avatar */}
                  {lead.avatarUrl ? (
                    <img
                      src={lead.avatarUrl}
                      alt={lead.nome}
                      className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                      onError={(e) => {
                        // Fallback para inicial se imagem falhar
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        target.nextElementSibling?.classList.remove('hidden');
                      }}
                    />
                  ) : null}
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm flex-shrink-0 ${lead.avatarUrl ? 'hidden' : ''}`}
                    style={{ backgroundColor: cor }}
                  >
                    {inicial}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-foreground truncate">
                      {lead.nome || 'Sem nome'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {lead.origem || 'Origem desconhecida'} • {formatDate(lead.data)}
                    </div>
                  </div>
                </div>

                {/* Status Badge */}
                {getStatusBadge(lead.status)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

