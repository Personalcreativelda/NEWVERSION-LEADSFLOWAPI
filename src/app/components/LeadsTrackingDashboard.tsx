import React, { useState, useEffect } from 'react';
import { MessageCircle, Send, TrendingUp, Clock, CheckCircle, AlertCircle } from 'lucide-react';

interface Lead {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  status: string;
  channel_source: string;
  captured_at: string;
  channel_type: string;
  channel_name: string;
  hour_captured: number;
  interaction_count: number;
}

interface ChannelStats {
  channel: string;
  total: number;
  today: number;
  byStatus: Record<string, number>;
  lastCaptured?: string;
  avgHoursOld: number;
}

export default function LeadsTrackingDashboard() {
  const [leadsToday, setLeadsToday] = useState<Lead[]>([]);
  const [channelStats, setChannelStats] = useState<ChannelStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    loadData();
    // Auto-refresh a cada 30 segundos
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      // Carregar leads capturados hoje
      const todasResponse = await fetch('/api/leads-tracking/captured-today?limit=50');
      const todayData = await todasResponse.json();
      setLeadsToday(todayData.data || []);

      // Carregar estatísticas por canal
      const statsResponse = await fetch('/api/leads-tracking/stats/by-channel?days=7');
      const statsData = await statsResponse.json();
      setChannelStats(statsData.data || []);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const getChannelIcon = (channel: string) => {
    const icons: Record<string, React.ReactNode> = {
      whatsapp: '📱',
      whatsapp_cloud: '☁️',
      telegram: '✈️',
      instagram: '📸',
      facebook: '👤',
      email: '📧',
      website: '🌐',
      site: '🌐',
      campaign: '📢',
      n8n: '🔗',
      manual: '✏️',
      twilio: '📲',
      twilio_sms: '📲',
      sms: '📲',
      default: '💬'
    };
    return icons[channel?.toLowerCase()] || icons.default;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      novo: 'bg-blue-100 text-blue-800',
      new: 'bg-blue-100 text-blue-800',
      contacted: 'bg-purple-100 text-purple-800',
      contatado: 'bg-purple-100 text-purple-800',
      interested: 'bg-green-100 text-green-800',
      interessado: 'bg-green-100 text-green-800',
      qualified: 'bg-amber-100 text-amber-800',
      qualificado: 'bg-amber-100 text-amber-800',
      converted: 'bg-emerald-100 text-emerald-800',
      convertido: 'bg-emerald-100 text-emerald-800',
      lost: 'bg-red-100 text-red-800',
      perdido: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const formatTime = (isoDate: string) => {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Agora';
    if (diffMins < 60) return `${diffMins}m atrás`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h atrás`;
    return date.toLocaleDateString('pt-BR');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin mb-4">
            <MessageCircle className="w-8 h-8 mx-auto text-blue-500" />
          </div>
          <p>Carregando dados de rastreamento...</p>
        </div>
      </div>
    );
  }

  const totalToday = leadsToday.length;
  const totalInteractions = leadsToday.reduce((sum, lead) => sum + lead.interaction_count, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">📊 Rastreamento de Leads</h1>
          <p className="text-slate-600">Monitore leads capturados de múltiplos canais em tempo real</p>
        </div>

        {/* Estatísticas Rápidas */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-blue-500">
            <div className="flex items-center">
              <MessageCircle className="w-8 h-8 text-blue-500 mr-3" />
              <div>
                <p className="text-sm text-slate-500">Leads Hoje</p>
                <p className="text-2xl font-bold text-slate-900">{totalToday}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-purple-500">
            <div className="flex items-center">
              <Send className="w-8 h-8 text-purple-500 mr-3" />
              <div>
                <p className="text-sm text-slate-500">Interações</p>
                <p className="text-2xl font-bold text-slate-900">{totalInteractions}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-green-500">
            <div className="flex items-center">
              <CheckCircle className="w-8 h-8 text-green-500 mr-3" />
              <div>
                <p className="text-sm text-slate-500">Canais Ativos</p>
                <p className="text-2xl font-bold text-slate-900">{channelStats.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-orange-500">
            <div className="flex items-center">
              <TrendingUp className="w-8 h-8 text-orange-500 mr-3" />
              <div>
                <p className="text-sm text-slate-500">Média/Canal</p>
                <p className="text-2xl font-bold text-slate-900">
                  {channelStats.length > 0 ? Math.round(totalToday / channelStats.length) : 0}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Estatísticas por Canal */}
        {channelStats.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">📈 Desempenho por Canal</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {channelStats.map((stat, idx) => (
                <div key={idx} className="border rounded-lg p-4 hover:shadow-md transition">
                  <div className="text-3xl mb-2">{getChannelIcon(stat.channel)}</div>
                  <h3 className="font-semibold text-slate-900 capitalize">{stat.channel}</h3>
                  <div className="mt-3 space-y-1 text-sm">
                    <p className="flex justify-between">
                      <span className="text-slate-600">Total (7 dias):</span>
                      <span className="font-semibold text-slate-900">{stat.total}</span>
                    </p>
                    <p className="flex justify-between">
                      <span className="text-slate-600">Hoje:</span>
                      <span className="font-semibold text-blue-600">{stat.today}</span>
                    </p>
                    <p className="flex justify-between">
                      <span className="text-slate-600">Idade média:</span>
                      <span className="text-slate-900">{stat.avgHoursOld}h</span>
                    </p>
                  </div>
                  {Object.entries(stat.byStatus).length > 0 && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs text-slate-600 font-semibold mb-2">Por Status:</p>
                      <div className="space-y-1 text-xs">
                        {Object.entries(stat.byStatus).map(([status, count]) => (
                          <p key={status} className="flex justify-between">
                            <span className="capitalize text-slate-600">{status}</span>
                            <span className="font-semibold">{count}</span>
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Lista de Leads Capturados Hoje */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold text-slate-900">🎯 Leads Capturados Hoje</h2>
          </div>
          
          {leadsToday.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>Nenhum lead capturado ainda hoje</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Canal</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Nome/Contato</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Email/Telefone</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Horário</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Interações</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {leadsToday.map((lead) => (
                    <tr key={lead.id} className="hover:bg-slate-50 transition">
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-2">
                          <span className="text-2xl">{getChannelIcon(lead.channel_source)}</span>
                          <span className="text-sm font-medium text-slate-900 capitalize">{lead.channel_source}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-medium text-slate-900">{lead.name}</p>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {lead.email && <p>{lead.email}</p>}
                        {lead.phone && <p>{lead.phone}</p>}
                        {!lead.email && !lead.phone && <p className="text-slate-400">-</p>}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(lead.status)}`}>
                          {lead.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        <div className="flex items-center">
                          <Clock className="w-4 h-4 mr-1" />
                          {formatTime(lead.captured_at)}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-50 text-blue-700">
                          {lead.interaction_count}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => {
                            setSelectedLead(lead);
                            setShowDetails(true);
                          }}
                          className="text-blue-600 hover:text-blue-800 font-medium text-sm"
                        >
                          Ver Detalhes
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal de Detalhes */}
        {showDetails && selectedLead && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6">
              <div className="flex items-start justify-between mb-4">
                <h2 className="text-2xl font-bold text-slate-900">{selectedLead.name}</h2>
                <button
                  onClick={() => setShowDetails(false)}
                  className="text-slate-500 hover:text-slate-700"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex items-center">
                  <span className="text-2xl mr-2">{getChannelIcon(selectedLead.channel_source)}</span>
                  <div>
                    <p className="text-xs text-slate-600 uppercase">Canal</p>
                    <p className="font-medium text-slate-900 capitalize">{selectedLead.channel_source}</p>
                  </div>
                </div>

                {selectedLead.email && (
                  <div>
                    <p className="text-xs text-slate-600 uppercase">Email</p>
                    <p className="font-medium text-slate-900">{selectedLead.email}</p>
                  </div>
                )}

                {selectedLead.phone && (
                  <div>
                    <p className="text-xs text-slate-600 uppercase">Telefone</p>
                    <p className="font-medium text-slate-900">{selectedLead.phone}</p>
                  </div>
                )}

                <div>
                  <p className="text-xs text-slate-600 uppercase">Status</p>
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(selectedLead.status)}`}>
                    {selectedLead.status}
                  </span>
                </div>

                <div>
                  <p className="text-xs text-slate-600 uppercase">Capturado</p>
                  <p className="font-medium text-slate-900">{formatTime(selectedLead.captured_at)}</p>
                </div>

                <div>
                  <p className="text-xs text-slate-600 uppercase">Interações</p>
                  <p className="font-medium text-slate-900">{selectedLead.interaction_count} mensagens</p>
                </div>
              </div>

              <button
                onClick={() => setShowDetails(false)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition"
              >
                Fechar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
