import React, { useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Users, DollarSign, TrendingUp, Activity, Rocket, Crown } from 'lucide-react';

interface User {
  id: string;
  email: string;
  name: string;
  plan: string;
  subscription_plan?: string;
  planExpiresAt?: string;
  createdAt: string;
  status?: 'active' | 'suspended';
}

interface AdminDashboardTabProps {
  users: User[];
  totalMRR: number;
  totalARR: number;
}

export const AdminDashboardTab: React.FC<AdminDashboardTabProps> = ({
  users,
  totalMRR,
  totalARR,
}) => {
  // Detect dark mode from html element class
  const isDark = document.documentElement.classList.contains('dark');
  const gridColor = isDark ? '#374151' : '#e5e7eb';
  const axisColor = isDark ? '#6b7280' : '#9ca3af';
  const tooltipStyle = isDark
    ? { background: '#1f2937', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12 }
    : { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, color: '#111827', fontSize: 12 };
  const freeCount = users.filter(u => u.plan === 'free').length;
  const businessCount = users.filter(u => u.plan === 'business').length;
  const enterpriseCount = users.filter(u => u.plan === 'enterprise').length;
  const activeCount = users.filter(u => u.status !== 'suspended').length;

  const stats = [
    {
      label: 'Total Usuários',
      value: users.length,
      sub: `${activeCount} ativos`,
      icon: Users,
      color: 'bg-blue-500',
    },
    {
      label: 'MRR Total',
      value: `$${totalMRR.toFixed(2)}`,
      sub: 'receita mensal recorrente',
      icon: DollarSign,
      color: 'bg-green-500',
    },
    {
      label: 'ARR Total',
      value: `$${totalARR.toFixed(2)}`,
      sub: 'receita anual recorrente',
      icon: TrendingUp,
      color: 'bg-purple-500',
    },
    {
      label: 'Usuários Pagantes',
      value: businessCount + enterpriseCount,
      sub: `${freeCount} no plano free`,
      icon: Activity,
      color: 'bg-orange-500',
    },
  ];

  // Pie chart: distribuição de planos
  const planData = useMemo(() => [
    { name: 'Free', value: freeCount || 0, color: '#94a3b8' },
    { name: 'Business', value: businessCount || 0, color: '#3b82f6' },
    { name: 'Enterprise', value: enterpriseCount || 0, color: '#8b5cf6' },
  ].filter(d => d.value > 0), [freeCount, businessCount, enterpriseCount]);

  // Bar chart: usuários por mês de cadastro (últimos 6 meses)
  const usersByMonth = useMemo(() => {
    const now = new Date();
    const months: { month: string; total: number; pagantes: number }[] = [];

    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthLabel = date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      const monthStart = date;
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);

      const inMonth = users.filter(u => {
        const created = new Date(u.createdAt);
        return created >= monthStart && created <= monthEnd;
      });

      months.push({
        month: monthLabel,
        total: inMonth.length,
        pagantes: inMonth.filter(u => u.plan !== 'free').length,
      });
    }
    return months;
  }, [users]);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h2 className="text-3xl font-semibold text-foreground">Financeiro</h2>
        <p className="text-muted-foreground mt-1">Visão geral das finanças</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="bg-card rounded-xl p-6 shadow-sm border border-border"
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`${stat.color} w-12 h-12 rounded-lg flex items-center justify-center text-white`}>
                  <Icon size={24} />
                </div>
              </div>
              <h3 className="text-2xl font-semibold text-foreground">{stat.value}</h3>
              <p className="text-muted-foreground text-sm mt-1">{stat.label}</p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">{stat.sub}</p>
            </div>
          );
        })}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Bar chart: novos usuários por mês */}
        <div className="bg-card rounded-xl p-6 shadow-sm border border-border">
          <h3 className="text-lg font-semibold text-foreground mb-4">
            Novos Usuários por Mês
          </h3>
          {usersByMonth.some(m => m.total > 0) ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={usersByMonth}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="month" stroke={axisColor} tick={{ fontSize: 12 }} />
                <YAxis stroke={axisColor} tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                <Bar dataKey="total" fill="#3b82f6" name="Total" radius={[4, 4, 0, 0]} />
                <Bar dataKey="pagantes" fill="#8b5cf6" name="Pagantes" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
              Nenhum dado disponível ainda
            </div>
          )}
        </div>

        {/* Pie chart: distribuição de planos */}
        <div className="bg-card rounded-xl p-6 shadow-sm border border-border">
          <h3 className="text-lg font-semibold text-foreground mb-4">
            Distribuição de Planos
          </h3>
          {planData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={planData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) =>
                    percent > 0.05 ? `${name} ${(percent * 100).toFixed(0)}%` : ''
                  }
                  outerRadius={100}
                  dataKey="value"
                >
                  {planData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
              Nenhum usuário cadastrado ainda
            </div>
          )}
        </div>
      </div>

      {/* Plan summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card rounded-xl p-5 shadow-sm border border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
              <Users className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Plano Free</p>
              <p className="text-2xl font-bold text-foreground">{freeCount}</p>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-xl p-5 shadow-sm border border-blue-200 dark:border-blue-900/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
              <Rocket className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Business</p>
              <p className="text-2xl font-bold text-foreground">{businessCount}</p>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-xl p-5 shadow-sm border border-purple-200 dark:border-purple-900/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center">
              <Crown className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Enterprise</p>
              <p className="text-2xl font-bold text-foreground">{enterpriseCount}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
