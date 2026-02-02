import { useMemo } from 'react';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { TrendingUp, TrendingDown, Users, Target, DollarSign, Clock, Activity, Zap, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, LineChart, Line, Legend, AreaChart, Area } from 'recharts';

interface Lead {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  origem: string;
  status: string;
  interesse?: string;
  valor?: number;
  data?: string; // Data de cadastro (YYYY-MM-DD)
  createdAt?: string; // ISO timestamp de criação
  updatedAt?: string; // ISO timestamp de última atualização
  convertedAt?: string; // ✅ ISO timestamp de conversão (preenchido automaticamente ao converter)
  data_cadastro?: string; // Compatibilidade
  data_ultima_atualizacao?: string; // Compatibilidade
}

interface AdvancedAnalyticsProps {
  leads: Lead[];
  isDark?: boolean;
}

// Cores para cada status do funil - versão dinâmica
const STATUS_COLORS: Record<string, string> = {
  'novo': '#3B82F6',        // Azul
  'new': '#3B82F6',         // Azul (inglês)
  'contato': '#8B5CF6',     // Roxo
  'contatado': '#8B5CF6',   // Roxo
  'qualificado': '#F59E0B', // Amarelo
  'negociacao': '#F97316',  // Laranja
  'negociação': '#F97316',  // Laranja (com acento)
  'convertido': '#10B981',  // Verde
  'perdido': '#EF4444',     // Vermelho
  'aguardando': '#6366F1',  // Indigo
  'em andamento': '#14B8A6',// Teal
  'proposta': '#EC4899',    // Pink
  'fechado': '#10B981',     // Verde
  'cancelado': '#EF4444',   // Vermelho
};

// Cores extras para status personalizados não mapeados
const EXTRA_COLORS = [
  '#06B6D4', // Cyan
  '#8B5CF6', // Violet
  '#F472B6', // Pink
  '#A78BFA', // Purple
  '#34D399', // Emerald
  '#FBBF24', // Amber
  '#FB7185', // Rose
  '#60A5FA', // Blue
  '#4ADE80', // Green
  '#C084FC', // Purple
];

// Função para obter cor do status (com fallback para cores extras)
const getStatusColor = (status: string, index: number = 0): string => {
  const normalizedStatus = status.toLowerCase().trim();
  return STATUS_COLORS[normalizedStatus] || EXTRA_COLORS[index % EXTRA_COLORS.length];
};

// Cores antigas para outros gráficos (manter compatibilidade)
const PIE_COLORS = ['#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#10B981', '#EC4899'];

// ✅ MAPEAMENTO DE CORES ESPECÍFICAS POR ORIGEM
const ORIGEM_COLORS: Record<string, string> = {
  'whatsapp': '#00D9A3',     // Verde turquesa
  'indicacao': '#FFA26B',    // Laranja
  'instagram': '#FF6B9D',    // Rosa
  'facebook': '#5B9FED',     // Azul
  'site': '#B794F6',         // Roxo
  'google': '#FFD93D',       // Amarelo
  'linkedin': '#5B9FED',     // Azul
  'email': '#B794F6',        // Roxo
  'telefone': '#00D9A3',     // Verde
  'outros': '#A0A0B2',       // Cinza
};

// ✅ LABELS AMIGÁVEIS PARA ORIGENS
const ORIGEM_LABELS: Record<string, string> = {
  'whatsapp': 'WhatsApp',
  'indicacao': 'Indicação',
  'instagram': 'Instagram',
  'facebook': 'Facebook',
  'site': 'Site',
  'google': 'Google',
  'linkedin': 'LinkedIn',
  'email': 'Email',
  'telefone': 'Telefone',
  'outros': 'Outros',
};

export default function AdvancedAnalytics({ leads, isDark = false }: AdvancedAnalyticsProps) {
  // ✅ FUNÇÃO HELPER - Obter data do lead (prioriza createdAt, depois data)
  const getLeadDate = (lead: Lead): Date | null => {
    if (lead.createdAt) {
      return new Date(lead.createdAt);
    }
    if (lead.data_cadastro) {
      return new Date(lead.data_cadastro);
    }
    if (lead.data) {
      return new Date(lead.data);
    }
    return null;
  };

  // Análise de leads por origem - COM CORES E LABELS
  const leadsByOrigin = useMemo(() => {
    const origins: Record<string, number> = {};
    leads.forEach(lead => {
      const origin = (lead.origem || 'outros').toLowerCase();
      origins[origin] = (origins[origin] || 0) + 1;
    });

    return Object.entries(origins)
      .map(([name, value]) => {
        const normalizedName = name.toLowerCase();
        return {
          name: ORIGEM_LABELS[normalizedName] || name,
          value,
          color: ORIGEM_COLORS[normalizedName] || ORIGEM_COLORS['outros'],
          rawName: normalizedName,
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [leads]);

  // Análise de conversão por status com labels amigáveis
  const conversionByStatus = useMemo(() => {
    const statusLabels: Record<string, string> = {
      'novo': 'Novo',
      'contato': 'Contato',
      'qualificado': 'Qualificado',
      'negociacao': 'Negociação',
      'convertido': 'Convertido',
      'perdido': 'Perdido'
    };

    const statuses: Record<string, number> = {};
    leads.forEach(lead => {
      const status = (lead.status || 'novo').toLowerCase();
      statuses[status] = (statuses[status] || 0) + 1;
    });

    return Object.entries(statuses).map(([name, value]) => ({
      name: statusLabels[name] || name,
      value
    }));
  }, [leads]);

  // Análise temporal (últimos 7 dias)
  const temporalAnalysis = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i));
      return date.toISOString().split('T')[0];
    });

    const dataByDay = last7Days.map(date => {
      const count = leads.filter(lead => {
        const leadDate = getLeadDate(lead);
        if (!leadDate) return false;
        const leadDateStr = leadDate.toISOString().split('T')[0];
        return leadDateStr === date;
      }).length;

      const dayName = new Date(date).toLocaleDateString('pt-BR', { weekday: 'short' });
      return {
        date: dayName.charAt(0).toUpperCase() + dayName.slice(1),
        leads: count,
      };
    });

    return dataByDay;
  }, [leads]);

  // Métricas de performance - Dinâmico para todos os status
  const metrics = useMemo(() => {
    const total = leads.length;
    
    // ✅ Calcular contagem para TODOS os status únicos dinamicamente
    const statusCounts: Record<string, number> = {};
    leads.forEach(lead => {
      const status = (lead.status || 'Sem status').trim();
      const normalizedStatus = status.toLowerCase();
      // Usar o status original (com a caixa correta) como chave, mas normalizado para contagem
      const displayStatus = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
      statusCounts[displayStatus] = (statusCounts[displayStatus] || 0) + 1;
    });

    // Ordenar por quantidade (maior primeiro), mas mantendo Convertido e Perdido no final
    const sortedStatuses = Object.entries(statusCounts)
      .sort((a, b) => {
        const aLower = a[0].toLowerCase();
        const bLower = b[0].toLowerCase();
        // Convertido sempre por último, Perdido penúltimo
        if (aLower === 'convertido') return 1;
        if (bLower === 'convertido') return -1;
        if (aLower === 'perdido') return 1;
        if (bLower === 'perdido') return -1;
        return b[1] - a[1]; // Ordenar por quantidade
      });

    // Compatibilidade com métricas antigas
    const converted = leads.filter(l => (l.status || '').toLowerCase() === 'convertido').length;
    const lost = leads.filter(l => (l.status || '').toLowerCase() === 'perdido').length;
    const inNegotiation = leads.filter(l => (l.status || '').toLowerCase() === 'negociacao').length;
    const qualified = leads.filter(l => (l.status || '').toLowerCase() === 'qualificado').length;

    const conversionRate = total > 0 ? ((converted / total) * 100).toFixed(1) : '0';
    const lostRate = total > 0 ? ((lost / total) * 100).toFixed(1) : '0';
    const qualificationRate = total > 0 ? ((qualified / total) * 100).toFixed(1) : '0';

    // ✅ CALCULAR VALOR MÉDIO REAL - Usar campo 'valor' dos leads convertidos
    const convertedLeads = leads.filter(l =>
      (l.status || '').toLowerCase() === 'convertido' && (l.valor || 0) > 0
    );
    const totalConvertedValue = convertedLeads.reduce((sum, lead) => sum + (lead.valor || 0), 0);
    const avgValue = convertedLeads.length > 0 ? totalConvertedValue / convertedLeads.length : 0;

    // Valor médio do período anterior (últimos 30 dias vs 30-60 dias atrás)
    const now = new Date();
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const last60Days = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const recentConvertedLeads = convertedLeads.filter(l => {
      const leadDate = getLeadDate(l);
      return leadDate && leadDate >= last30Days;
    });

    const previousConvertedLeads = convertedLeads.filter(l => {
      const leadDate = getLeadDate(l);
      return leadDate && leadDate >= last60Days && leadDate < last30Days;
    });

    const recentAvgValue = recentConvertedLeads.length > 0
      ? recentConvertedLeads.reduce((sum, l) => sum + (l.valor || 0), 0) / recentConvertedLeads.length
      : 0;

    const previousAvgValue = previousConvertedLeads.length > 0
      ? previousConvertedLeads.reduce((sum, l) => sum + (l.valor || 0), 0) / previousConvertedLeads.length
      : 0;

    const avgValueChange = previousAvgValue > 0
      ? ((recentAvgValue - previousAvgValue) / previousAvgValue * 100).toFixed(1)
      : '0';

    // ✅ CALCULAR TEMPO MÉDIO REAL - Do cadastro até conversão
    console.log('[Analytics] 🔍 DEBUG Tempo Médio - Leads convertidos:',
      leads.filter(l => (l.status || '').toLowerCase() === 'convertido').length
    );

    const convertedLeadsWithDates = leads.filter(l => {
      const isConverted = (l.status || '').toLowerCase() === 'convertido';
      const hasCreatedDate = l.createdAt || l.data_cadastro || l.data;
      const hasConvertedDate = l.convertedAt; // ✅ Usar convertedAt específico

      if (isConverted) {
        console.log('[Analytics] 🔍 Lead convertido encontrado:', {
          id: l.id,
          nome: l.nome,
          status: l.status,
          createdAt: l.createdAt,
          convertedAt: l.convertedAt, // ✅ Campo específico de conversão
          updatedAt: l.updatedAt,
          data: l.data,
          hasCreatedDate,
          hasConvertedDate,
          passouNoFiltro: isConverted && hasCreatedDate && hasConvertedDate
        });
      }

      // ✅ Precisa de data de criação E data de conversão
      return isConverted && hasCreatedDate && hasConvertedDate;
    });

    console.log('[Analytics] 🔍 Leads convertidos COM datas válidas:', convertedLeadsWithDates.length);

    let avgTimeInFunnel = 0;
    let avgTimeChange = '0';

    if (convertedLeadsWithDates.length > 0) {
      const times = convertedLeadsWithDates.map(lead => {
        const created = new Date(lead.createdAt || lead.data_cadastro || lead.data || '');
        const converted = new Date(lead.convertedAt || ''); // ✅ Usar convertedAt

        const diffMs = converted.getTime() - created.getTime();
        const diffDays = Math.max(0, diffMs / (1000 * 60 * 60 * 24)); // Garante que não seja negativo

        console.log('[Analytics] 📊 Tempo calculado:', {
          lead: lead.nome,
          created: created.toISOString(),
          converted: converted.toISOString(),
          diffDays: diffDays.toFixed(2)
        });

        return diffDays;
      });

      avgTimeInFunnel = times.reduce((sum, t) => sum + t, 0) / times.length;

      // Comparar com período anterior (baseado na data de conversão)
      const recentTimes = convertedLeadsWithDates
        .filter(l => {
          const convertedDate = new Date(l.convertedAt || '');
          return convertedDate >= last30Days;
        })
        .map(lead => {
          const created = new Date(lead.createdAt || lead.data_cadastro || lead.data || '');
          const converted = new Date(lead.convertedAt || '');
          return (converted.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
        });

      const previousTimes = convertedLeadsWithDates
        .filter(l => {
          const convertedDate = new Date(l.convertedAt || '');
          return convertedDate >= last60Days && convertedDate < last30Days;
        })
        .map(lead => {
          const created = new Date(lead.createdAt || lead.data_cadastro || lead.data || '');
          const converted = new Date(lead.convertedAt || '');
          return (converted.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
        });

      if (recentTimes.length > 0 && previousTimes.length > 0) {
        const recentAvg = recentTimes.reduce((sum, t) => sum + t, 0) / recentTimes.length;
        const previousAvg = previousTimes.reduce((sum, t) => sum + t, 0) / previousTimes.length;
        avgTimeChange = ((recentAvg - previousAvg) / previousAvg * 100).toFixed(1);
      }
    }

    // ✅ CALCULAR CRESCIMENTO REAL - Últimos 7 dias vs 7 dias anteriores
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last14Days = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    console.log('[Analytics] 📊 Calculando crescimento:');
    console.log('[Analytics] 📅 Hoje:', now.toISOString());
    console.log('[Analytics] 📅 Últimos 7 dias desde:', last7Days.toISOString());
    console.log('[Analytics] 📅 14 dias atrás:', last14Days.toISOString());

    const recentLeads = leads.filter(lead => {
      const leadDate = getLeadDate(lead);
      if (!leadDate) return false;
      const isRecent = leadDate >= last7Days;
      if (isRecent) {
        console.log('[Analytics] ✅ Lead recente:', lead.nome, 'Data:', leadDate.toISOString());
      }
      return isRecent;
    }).length;

    const previousWeekLeads = leads.filter(lead => {
      const leadDate = getLeadDate(lead);
      if (!leadDate) return false;
      return leadDate >= last14Days && leadDate < last7Days;
    }).length;

    console.log('[Analytics] 📊 Leads últimos 7 dias:', recentLeads);
    console.log('[Analytics] 📊 Leads 7-14 dias atrás:', previousWeekLeads);

    const absoluteGrowth = recentLeads - previousWeekLeads;
    const growthRate = previousWeekLeads > 0
      ? ((absoluteGrowth / previousWeekLeads) * 100).toFixed(1)
      : recentLeads > 0 ? '100' : '0';

    return {
      total,
      converted,
      lost,
      inNegotiation,
      qualified,
      conversionRate,
      lostRate,
      qualificationRate,
      totalValue: totalConvertedValue,
      avgValue,
      avgValueChange,
      avgTimeInFunnel: Math.round(avgTimeInFunnel),
      avgTimeChange,
      recentLeads,
      previousWeekLeads,
      absoluteGrowth,
      growthRate,
      // ✅ NOVO: Status dinâmicos com contagem
      dynamicStatuses: sortedStatuses.map(([status, count], index) => ({
        status,
        count,
        percentage: total > 0 ? ((count / total) * 100).toFixed(1) : '0',
        color: getStatusColor(status, index),
      })),
    };
  }, [leads]);

  // Top 5 origens
  const topOrigins = leadsByOrigin.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* KPIs Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Taxa de Conversão */}
        <Card className="p-5 bg-card border-border">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-4 h-4 text-green-600" />
                <p className="text-sm text-muted-foreground">Taxa de Conversão</p>
              </div>
              <p className={`text-3xl mb-1 text-green-600`}>{metrics.conversionRate}%</p>
              <div className="flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3 text-green-600" />
                <span className="text-xs text-green-600">+2.3% vs mês anterior</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </Card>

        {/* Valor Médio */}
        <Card className="p-5 bg-card border-border">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-blue-600" />
                <p className="text-sm text-muted-foreground">Valor Médio</p>
              </div>
              <p className={`text-3xl mb-1 text-blue-600`}>
                {metrics.avgValue > 0
                  ? `R$ ${metrics.avgValue.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                  : '-'}
              </p>
              <div className="flex items-center gap-1">
                {metrics.avgValue > 0 ? (
                  <>
                    {parseFloat(metrics.avgValueChange) >= 0 ? (
                      <ArrowUpRight className="w-3 h-3 text-green-600" />
                    ) : (
                      <ArrowDownRight className="w-3 h-3 text-red-600" />
                    )}
                    <span className={`text-xs ${parseFloat(metrics.avgValueChange) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {parseFloat(metrics.avgValueChange) >= 0 ? '+' : ''}{metrics.avgValueChange}% vs mês anterior
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-gray-600 dark:text-gray-400">Aguardando conversões</span>
                )}
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </Card>

        {/* Tempo Médio no Funil */}
        <Card className="p-5 bg-card border-border">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-purple-600" />
                <p className="text-sm text-muted-foreground">Tempo Médio</p>
              </div>
              <p className={`text-3xl mb-1 text-purple-600`}>
                {metrics.avgTimeInFunnel > 0
                  ? metrics.avgTimeInFunnel < 1
                    ? `${Math.round(metrics.avgTimeInFunnel * 24)}h`
                    : metrics.avgTimeInFunnel < 30
                      ? `${metrics.avgTimeInFunnel}d`
                      : `${Math.round(metrics.avgTimeInFunnel / 30)}m`
                  : '-'}
              </p>
              <div className="flex items-center gap-1">
                {metrics.avgTimeInFunnel > 0 && parseFloat(metrics.avgTimeChange) !== 0 ? (
                  <>
                    {parseFloat(metrics.avgTimeChange) < 0 ? (
                      <ArrowDownRight className="w-3 h-3 text-green-600" />
                    ) : (
                      <ArrowUpRight className="w-3 h-3 text-red-600" />
                    )}
                    <span className={`text-xs ${parseFloat(metrics.avgTimeChange) < 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {parseFloat(metrics.avgTimeChange) < 0 ? '↓ ' : '↑ '}
                      {Math.abs(parseFloat(metrics.avgTimeChange))}% vs mês anterior
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-gray-600 dark:text-gray-400">Aguardando conversões</span>
                )}
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <Clock className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </Card>

        {/* Taxa de Crescimento */}
        <Card className="p-5 bg-card border-border">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-4 h-4 text-orange-600" />
                <p className="text-sm text-muted-foreground">Crescimento</p>
              </div>
              <p className={`text-3xl mb-1 ${metrics.absoluteGrowth >= 0 ? 'text-orange-600' : 'text-red-600'}`}>
                {metrics.absoluteGrowth >= 0 ? '+' : ''}{metrics.absoluteGrowth}
              </p>
              <div className="flex items-center gap-1">
                {metrics.absoluteGrowth >= 0 ? (
                  <ArrowUpRight className="w-3 h-3 text-green-600" />
                ) : (
                  <ArrowDownRight className="w-3 h-3 text-red-600" />
                )}
                <span className={`text-xs ${metrics.absoluteGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {parseFloat(metrics.growthRate) >= 0 ? '+' : ''}{metrics.growthRate}% últimos 7 dias
                </span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
              <Zap className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </Card>
      </div>

      {/* Gráficos de Análise */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico de Tendência (Últimos 7 dias) */}
        <Card className="p-6 bg-card border-border">
          <div className="mb-4">
            <h3 className="text-lg text-foreground">
              Tendência de Leads
            </h3>
            <p className="text-sm text-muted-foreground">
              Últimos 7 dias
            </p>
          </div>
          <ResponsiveContainer width="100%" height={380}>
            <AreaChart data={temporalAnalysis}>
              <defs>
                <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={STATUS_COLORS['Novo']} stopOpacity={0.8} />
                  <stop offset="95%" stopColor={STATUS_COLORS['Novo']} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#374151' : '#E5E7EB'} />
              <XAxis dataKey="date" stroke={isDark ? '#9CA3AF' : '#6B7280'} />
              <YAxis stroke={isDark ? '#9CA3AF' : '#6B7280'} />
              <Tooltip
                contentStyle={{
                  backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
                  border: `1px solid ${isDark ? '#374151' : '#E5E7EB'}`,
                  borderRadius: '8px',
                }}
                labelStyle={{ color: isDark ? '#F3F4F6' : '#111827' }}
              />
              <Area type="monotone" dataKey="leads" stroke={STATUS_COLORS['Novo']} fillOpacity={1} fill="url(#colorLeads)" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        {/* Distribuição por Status */}
        <Card className="p-6 bg-card border-border">
          <div className="mb-4">
            <h3 className="text-lg text-foreground">
              Distribuição por Status
            </h3>
            <p className="text-sm text-muted-foreground">
              Leads por estágio do funil
            </p>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={conversionByStatus}
                cx="50%"
                cy="50%"
                labelLine={false}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
                label={({ percent }) => `${(percent * 100).toFixed(1)}%`}
              >
                {conversionByStatus.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.name] || PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
                  border: `1px solid ${isDark ? '#374151' : '#E5E7EB'}`,
                  borderRadius: '8px',
                }}
                labelStyle={{ color: isDark ? '#F3F4F6' : '#111827' }}
              />
            </PieChart>
          </ResponsiveContainer>

          {/* Legenda Customizada - LIMPA E ORGANIZADA */}
          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="grid grid-cols-3 gap-x-4 gap-y-3">
              {conversionByStatus.map((entry, index) => (
                <div key={`legend-${index}`} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: STATUS_COLORS[entry.name] || PIE_COLORS[index % PIE_COLORS.length] }}
                  />
                  <span className="text-sm text-muted-foreground">
                    {entry.name} <span className="text-muted-foreground/70">({entry.value})</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Top 5 Origens */}
        <Card className="p-6 bg-card border-border">
          <div className="mb-4">
            <h3 className="text-lg text-foreground">
              Top 5 Origens de Leads
            </h3>
            <p className="text-sm text-muted-foreground">
              Fontes mais produtivas
            </p>
          </div>
          <ResponsiveContainer width="100%" height={380}>
            <BarChart data={topOrigins} layout="vertical" margin={{ top: 10, right: 60, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#374151' : '#E5E7EB'} />
              <XAxis type="number" stroke={isDark ? '#9CA3AF' : '#6B7280'} />
              <YAxis dataKey="name" type="category" width={100} stroke={isDark ? '#9CA3AF' : '#6B7280'} />
              <Tooltip
                contentStyle={{
                  backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
                  border: `1px solid ${isDark ? '#374151' : '#E5E7EB'}`,
                  borderRadius: '8px',
                }}
                labelStyle={{ color: isDark ? '#F3F4F6' : '#111827' }}
              />
              <Bar
                dataKey="value"
                radius={[0, 8, 8, 0]}
                minPointSize={15}
                label={{ position: 'right', fill: isDark ? '#9CA3AF' : '#6B7280', fontSize: 12 }}
              >
                {topOrigins.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Performance Metrics */}
        <Card className="p-6 bg-card border-border">
          <div className="mb-4">
            <h3 className="text-lg text-foreground">
              Métricas de Performance
            </h3>
            <p className="text-sm text-muted-foreground">
              Indicadores por status do funil
            </p>
          </div>
          <div className="space-y-3 max-h-[320px] overflow-y-auto pr-2">
            {/* ✅ Renderização dinâmica de TODOS os status */}
            {metrics.dynamicStatuses.map((statusItem, index) => (
              <div key={statusItem.status} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-2 h-2 rounded-full" 
                    style={{ backgroundColor: statusItem.color }}
                  ></div>
                  <span className="text-sm text-muted-foreground">
                    {statusItem.status}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {statusItem.count}
                  </span>
                  <Badge 
                    variant="secondary" 
                    className="border-0 min-w-[50px] justify-center"
                    style={{ 
                      backgroundColor: `${statusItem.color}20`, 
                      color: statusItem.color 
                    }}
                  >
                    {statusItem.percentage}%
                  </Badge>
                </div>
              </div>
            ))}

            <div className={`pt-4 mt-4 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Users className="w-4 h-4 text-blue-600" />
                  <span className="text-sm text-muted-foreground">
                    Total de Leads
                  </span>
                </div>
                <span className={`text-xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {metrics.total}
                </span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Insights e Recomendações */}
      <Card className="p-6 bg-card border-border">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center flex-shrink-0">
            <span className="text-2xl">💡</span>
          </div>
          <div className="flex-1">
            <h3 className={`text-lg mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Insights e Recomendações
            </h3>
            <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
              <li className="flex items-start gap-2">
                <span className="text-green-600 dark:text-green-400">✓</span>
                <span>Sua taxa de conversão de {metrics.conversionRate}% está {parseFloat(metrics.conversionRate) > 20 ? 'acima' : 'abaixo'} da média do mercado (20%)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 dark:text-blue-400">→</span>
                <span>A origem "{topOrigins[0]?.name || 'N/A'}" é sua melhor fonte com {topOrigins[0]?.value || 0} leads - considere investir mais nesse canal</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-600 dark:text-orange-400">⚠</span>
                <span>Você tem {metrics.inNegotiation} leads em negociação - priorize o follow-up para fechar mais vendas</span>
              </li>
              {parseFloat(metrics.lostRate) > 30 && (
                <li className="flex items-start gap-2">
                  <span className="text-red-600 dark:text-red-400">!</span>
                  <span>Alta taxa de perda ({metrics.lostRate}%) - revise seu processo de qualificação</span>
                </li>
              )}
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}

