import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line, Area, AreaChart } from 'recharts';
import type { Lead } from '../../types';
import FilterBar from './FilterBar';
import { useMemo, useState } from 'react';
import { MessageCircle, Cloud, Mail, Instagram, Facebook, Send, Globe, Megaphone, Webhook, Phone, Search, Link, Hash, Smartphone, Users } from 'lucide-react';

interface ChartsSectionProps {
  leads: Lead[];
  origens?: string[];
  status?: string[];
  onFilterChange?: (filtros: { origem: string; status: string; busca: string }) => void;
  isDark?: boolean;
}

export default function ChartsSection({ leads, origens = [], status = [], onFilterChange, isDark = false }: ChartsSectionProps) {
  // Extrair origens e status únicos caso não sejam passados
  const origensDisponiveis = useMemo(() => {
    if (origens.length > 0) return origens;
    return Array.from(new Set(leads.map((l) => l.origem).filter(Boolean)));
  }, [leads, origens]);

  const statusDisponiveis = useMemo(() => {
    if (status.length > 0) return status;
    return Array.from(new Set(leads.map((l) => l.status).filter(Boolean)));
  }, [leads, status]);

  // Cores EXATAS para os gráficos - Paleta LeadsFlow
  const barColors = ['#B794F6', '#5B9FED', '#00D9A3', '#FFA26B', '#FF6B9D', '#FFD93D', '#B794F6', '#5B9FED', '#00D9A3', '#FFA26B'];
  const pieColors = ['#B794F6', '#00D9A3', '#FFA26B', '#FF6B9D', '#5B9FED', '#FFD93D'];

  // Normalizar origens que não representam canais reais
  // 'inbox' e 'unknown' são genéricos e devem ser mapeados para 'whatsapp' (canal principal)
  const normalizeOrigem = (origem: string): string => {
    const norm = origem.toLowerCase();
    if (norm === 'inbox' || norm === 'unknown' || norm === 'manual') return 'whatsapp';
    if (norm === 'messenger') return 'facebook';
    return norm;
  };

  // Mapeamento de nomes de origem para exibição
  const origemLabels: Record<string, string> = {
    'whatsapp': 'WhatsApp',
    'whatsapp_cloud': 'WhatsApp Cloud',
    'facebook': 'Facebook',
    'instagram': 'Instagram',
    'telegram': 'Telegram',
    'email': 'Email',
    'website': 'Site',
    'site': 'Site',
    'twilio': 'Twilio (SMS)',
    'twilio_sms': 'Twilio (SMS)',
    'sms': 'Twilio (SMS)',
    'indicacao': 'Indicação',
    'campaign': 'Campanha',
    'n8n': 'Automação (N8N)',
    'google': 'Google',
    'linkedin': 'LinkedIn',
    'telefone': 'Telefone',
    'outros': 'Outros',
  };

  // Mapeamento de ícones por origem
  const origemIcons: Record<string, any> = {
    'whatsapp': MessageCircle,
    'whatsapp_cloud': Cloud,
    'facebook': Facebook,
    'instagram': Instagram,
    'telegram': Send,
    'email': Mail,
    'website': Globe,
    'site': Globe,
    'twilio': Smartphone,
    'twilio_sms': Smartphone,
    'sms': Smartphone,
    'indicacao': Users,
    'campaign': Megaphone,
    'n8n': Webhook,
    'google': Search,
    'linkedin': Link,
    'telefone': Phone,
  };

  // Mapeamento de cores específicas por origem (canais)
  const origemColors: Record<string, string> = {
    'whatsapp': '#25D366',     // Verde WhatsApp
    'whatsapp_cloud': '#128C7E', // Verde escuro WhatsApp Cloud
    'facebook': '#1877F2',     // Azul Facebook
    'instagram': '#E4405F',    // Rosa Instagram
    'telegram': '#0088CC',     // Azul Telegram
    'email': '#06B6D4',        // Ciano
    'website': '#8B5CF6',      // Roxo
    'site': '#8B5CF6',         // Roxo
    'twilio': '#F22F46',       // Vermelho Twilio
    'twilio_sms': '#F22F46',   // Vermelho Twilio
    'sms': '#F22F46',          // Vermelho Twilio
    'indicacao': '#FFA26B',    // Laranja
    'campaign': '#F59E0B',     // Amarelo/Laranja
    'n8n': '#FF6D5A',          // Laranja N8N
    'google': '#FFD93D',       // Amarelo
    'linkedin': '#0A66C2',     // Azul LinkedIn
    'telefone': '#10B981',     // Verde
    'outros': '#A0A0B2',       // Cinza
  };

  // ✅ Processar dados para gráfico de origem com useMemo
  const origemChartData = useMemo(() => {
    // Agrupar origens normalizadas (inbox/unknown/manual → whatsapp, messenger → facebook)
    const origemData = leads.reduce((acc: Record<string, number>, lead) => {
      if (lead.origem) {
        const normalized = normalizeOrigem(lead.origem);
        acc[normalized] = (acc[normalized] || 0) + 1;
      }
      return acc;
    }, {});

    const chartData = Object.entries(origemData)
      .map(([name, value]) => {
        return {
          name: origemLabels[name] || name,
          value,
          color: origemColors[name] || barColors[0],
          fullName: origemLabels[name] || name,
          icon: origemIcons[name] || Hash,
          key: name,
        };
      })
      .sort((a, b) => b.value - a.value);

    console.log('📊 [ChartsSection] Dados do gráfico de origem:', chartData);
    console.log('📊 [ChartsSection] Dados RAW de origem:', origemData);
    console.log('📊 [ChartsSection] Total de leads:', leads.length);
    console.log('📊 [ChartsSection] Leads com origem:', leads.filter(l => l.origem).length);
    console.log('📊 [ChartsSection] Leads sem origem:', leads.filter(l => !l.origem).length);
    
    return chartData;
  }, [leads]);

  // ✅ Processar dados para gráfico de status com useMemo
  const statusChartData = useMemo(() => {
    // Status normalization map (same as backend)
    const statusNormalize: Record<string, string> = {
      'new': 'novo', 'novos': 'novo',
      'contacted': 'contatado', 'contatados': 'contatado',
      'qualified': 'qualificado', 'qualificados': 'qualificado', 'qualificacao': 'qualificado',
      'negotiation': 'negociacao', 'in_negotiation': 'negociacao',
      'converted': 'convertido', 'convertidos': 'convertido',
      'lost': 'perdido', 'perdidos': 'perdido', 'rejected': 'perdido', 'discarded': 'perdido',
      'ganho': 'convertido',
    };

    const statusLabels: Record<string, string> = {
      novo: 'Novos', contatado: 'Contatados', qualificado: 'Qualificados',
      negociacao: 'Negociação', convertido: 'Convertidos', perdido: 'Perdidos',
    };

    const statusColors: Record<string, string> = {
      novo: '#06B6D4', contatado: '#A855F7', qualificado: '#EAB308',
      negociacao: '#F97316', convertido: '#22C55E', perdido: '#EF4444',
    };

    const statusOrder: Record<string, number> = {
      novo: 1, contatado: 2, qualificado: 3, negociacao: 4, convertido: 5, perdido: 6,
    };

    const statusData: Record<string, number> = {};
    leads.forEach(lead => {
      if (lead.status) {
        const raw = lead.status.toLowerCase().trim();
        const normalized = statusNormalize[raw] || raw;
        statusData[normalized] = (statusData[normalized] || 0) + 1;
      }
    });

    return Object.entries(statusData)
      .sort(([a], [b]) => (statusOrder[a] || 99) - (statusOrder[b] || 99))
      .map(([name, value]) => ({
        name: statusLabels[name] || name,
        value,
        color: statusColors[name] || '#6B7280',
      }));
  }, [leads]);

  // Estado para alternar entre 7 e 30 dias
  const [chartDays, setChartDays] = useState<7 | 30>(7);

  // ✅ Dados para evolução de leads com useMemo
  const evolutionData = useMemo(() => {
    const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const today = new Date();
    const data = [];
    
    for (let i = chartDays - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dayName = chartDays <= 7 
        ? days[date.getDay()] 
        : `${date.getDate()}/${months[date.getMonth()]}`;
      const dateStr = date.toISOString().split('T')[0];
      
      const leadsCount = leads.filter(lead => {
        const leadDate = lead.capturedAt || lead.createdAt || lead.data || '';
        return leadDate.startsWith(dateStr);
      }).length;
      
      data.push({
        name: dayName,
        leads: leadsCount,
        date: dateStr,
      });
    }
    
    return data;
  }, [leads, chartDays]);

  // Dados simulados para engajamento em campanhas
  const engajamentoData = [
    { name: 'Entregues', value: 5234, color: '#10b981' },
    { name: 'Abertas', value: 4123, color: '#3b82f6' },
    { name: 'Respostas', value: 2045, color: '#a855f7' },
    { name: 'Cliques', value: 892, color: '#f59e0b' },
  ];

  // Custom Tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      const total = leads.length;
      const percentage = total > 0 ? ((data.value / total) * 100).toFixed(1) : '0';
      
      return (
        <div className="bg-card dark:bg-card border border-border dark:border-border rounded-xl p-4 shadow-md">
          <p className="font-semibold text-foreground mb-1">
            {data.payload.fullName || data.payload.name}
          </p>
          <p className="text-sm text-muted-foreground dark:text-muted-foreground">
            {data.value} lead{data.value !== 1 ? 's' : ''} ({percentage}%)
          </p>
        </div>
      );
    }
    return null;
  };

  // ✨ CustomLabel para mostrar valores ao lado das barras
  const CustomLabel = (props: any) => {
    const { x, y, width, height, value } = props;
    const total = leads.length;
    const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
    
    return (
      <text 
        x={x + width + 8} 
        y={y + height / 2} 
        fill="#6B7280" 
        textAnchor="start" 
        dominantBaseline="middle"
        className="text-xs font-medium"
      >
        {value} ({percentage}%)
      </text>
    );
  };

  const LineTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card dark:bg-card border border-border dark:border-border rounded-xl p-4 shadow-md">
          <p className="font-semibold text-foreground mb-1">
            {payload[0].payload.name}
          </p>
          <p className="text-sm text-blue-600 dark:text-blue-400">
            {payload[0].value} leads
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Barra de Filtros */}
      {onFilterChange && (
        <FilterBar
          origens={origensDisponiveis}
          status={statusDisponiveis}
          onFilterChange={onFilterChange}
        />
      )}
      
      {/* Primeira linha - 2 gráficos */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2 lg:gap-5">
        
        {/* Gráfico de Origem - HORIZONTAL como Engajamento */}
        <div className="bg-card dark:bg-card rounded-xl sm:rounded-2xl p-3 sm:p-4 lg:p-6 border border-border dark:border-border shadow-sm hover:shadow-md transition-all duration-300">
          <div className="flex items-center justify-between mb-3 sm:mb-4 lg:mb-6">
            <h3 className="text-sm sm:text-base lg:text-lg font-semibold text-foreground dark:text-foreground">
              Leads por Origem
            </h3>
            
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#B794F6]"></div>
              <span className="text-[10px] sm:text-xs text-muted-foreground dark:text-muted-foreground">
                Total: {leads.length}
              </span>
            </div>
          </div>
          
          {origemChartData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={origemChartData} layout="vertical" margin={{ top: 10, right: 60, left: 50, bottom: 10 }} barSize={24} barCategoryGap="15%">
                  <XAxis 
                    type="number"
                    tick={{ fill: '#9ca3af', fontSize: 10 }}
                    stroke="#e5e7eb"
                    className="dark:stroke-neutral-700"
                  />
                  <YAxis 
                    type="category"
                    dataKey="name"
                    tick={{ fill: '#9ca3af', fontSize: 11 }}
                    stroke="#e5e7eb"
                    className="dark:stroke-gray-700"
                    width={55}
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: 'var(--tooltip-bg, white)',
                      border: '1px solid #e5e7eb',
                      borderRadius: '12px',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                      padding: '12px',
                    }}
                    cursor={{ fill: 'rgba(99, 102, 241, 0.1)' }}
                  />
                  <Bar 
                    dataKey="value" 
                    radius={[0, 8, 8, 0]}
                    minPointSize={15}
                    label={<CustomLabel />}
                  >
                    {origemChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              
              {/* Tabela com ícones de canal, valores e percentuais */}
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="space-y-1">
                  {origemChartData.map((item, index) => {
                    const percentage = leads.length > 0 ? ((item.value / leads.length) * 100).toFixed(1) : '0';
                    const IconComponent = item.icon;
                    return (
                      <div key={`row-${index}`} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted transition-colors">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: `${item.color}18` }}
                          >
                            <IconComponent className="w-3.5 h-3.5" style={{ color: item.color }} />
                          </div>
                          <span className="text-sm font-medium text-foreground">
                            {item.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold text-foreground">
                            {item.value}
                          </span>
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full min-w-[45px] text-center"
                            style={{ backgroundColor: `${item.color}18`, color: item.color }}
                          >
                            {percentage}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-[350px] text-gray-400 dark:text-gray-600 dark:text-gray-400">
              <div className="text-center">
                <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <p className="font-medium">Nenhum lead cadastrado</p>
              </div>
            </div>
          )}
        </div>

        {/* Evolução de Leads (Linha) */}
        <div className="bg-card dark:bg-card rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-border dark:border-border shadow-sm hover:shadow-md transition-all duration-300">
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <h3 className="text-base sm:text-lg font-semibold text-foreground dark:text-foreground">
              Evolução de Leads
            </h3>
            <div className="flex gap-1 sm:gap-2">
              <button 
                onClick={() => setChartDays(7)}
                className={`px-2 sm:px-3 py-1 text-[10px] sm:text-xs font-medium rounded-lg transition-colors ${chartDays === 7 ? 'bg-[#5B9FED]/10 text-[#5B9FED]' : 'text-muted-foreground dark:text-muted-foreground hover:bg-muted dark:hover:bg-muted'}`}
              >
                7 dias
              </button>
              <button 
                onClick={() => setChartDays(30)}
                className={`px-2 sm:px-3 py-1 text-[10px] sm:text-xs font-medium rounded-lg transition-colors ${chartDays === 30 ? 'bg-[#5B9FED]/10 text-[#5B9FED]' : 'text-muted-foreground dark:text-muted-foreground hover:bg-muted dark:hover:bg-muted'}`}
              >
                30 dias
              </button>
            </div>
          </div>
          
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={evolutionData} margin={{ top: 10, right: 10, left: -10, bottom: 10 }}>
              <defs>
                <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="name" 
                tick={{ fill: '#9ca3af', fontSize: 12 }}
                stroke="#e5e7eb"
                className="dark:stroke-gray-700"
              />
              <YAxis 
                tick={{ fill: '#9ca3af', fontSize: 12 }}
                stroke="#e5e7eb"
                className="dark:stroke-gray-700"
                allowDecimals={false}
              />
              <Tooltip content={<LineTooltip />} />
              <Area 
                type="monotone" 
                dataKey="leads" 
                stroke="#6366f1" 
                strokeWidth={3}
                fillOpacity={1} 
                fill="url(#colorLeads)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Segunda linha - 2 gráficos */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2 lg:gap-5">
        
        {/* Status dos Leads (Pizza) */}
        <div className="bg-card dark:bg-card rounded-xl sm:rounded-2xl p-3 sm:p-4 lg:p-6 border border-border dark:border-border shadow-sm hover:shadow-md transition-all duration-300">
          <div className="flex items-center justify-between mb-3 sm:mb-4 lg:mb-6">
            <h3 className="text-sm sm:text-base lg:text-lg font-semibold text-foreground dark:text-foreground">
              Status dos Leads
            </h3>
          </div>
          
          {statusChartData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={statusChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={4}
                    dataKey="value"
                    label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {statusChartData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.color}
                      />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: 'var(--tooltip-bg, white)',
                      border: '1px solid #e5e7eb',
                      borderRadius: '12px',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                      padding: '12px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              
              {/* Legenda Customizada - LIMPA E ORGANIZADA */}
              <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="grid grid-cols-3 gap-x-4 gap-y-3">
                  {statusChartData.map((entry, index) => (
                    <div key={`legend-${index}`} className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full flex-shrink-0" 
                        style={{ backgroundColor: entry.color }}
                      />
                      <span className="text-sm text-muted-foreground truncate">
                        {entry.name} <span className="text-muted-foreground/70">({entry.value})</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-[350px] text-gray-400 dark:text-gray-600 dark:text-gray-400">
              <div className="text-center">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                  </svg>
                </div>
                <p className="font-medium">Nenhum status definido</p>
              </div>
            </div>
          )}
        </div>

        {/* Engajamento em Campanhas (Barras horizontais) */}
        <div className="bg-card dark:bg-card rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-border dark:border-border shadow-sm hover:shadow-md transition-all duration-300">
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <h3 className="text-base sm:text-lg font-semibold text-foreground dark:text-foreground">
              Engajamento em Campanhas
            </h3>
          </div>
          
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={engajamentoData} layout="vertical" margin={{ top: 10, right: 20, left: 60, bottom: 10 }} barSize={28} barCategoryGap="15%">
              <XAxis 
                type="number"
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                stroke="#e5e7eb"
                className="dark:stroke-gray-700"
              />
              <YAxis 
                type="category"
                dataKey="name"
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                stroke="#e5e7eb"
                className="dark:stroke-gray-700"
                width={55}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'var(--tooltip-bg, white)',
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                  padding: '12px',
                }}
                cursor={{ fill: 'rgba(99, 102, 241, 0.1)' }}
              />
              <Bar 
                dataKey="value" 
                radius={[0, 8, 8, 0]}
              >
                {engajamentoData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

