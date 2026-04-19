import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  Clock, Activity, MessageSquare, 
  UserPlus, Settings, Shield, AlertCircle, Info,
  Monitor, Globe, BarChart2, Users, Bot,
  CreditCard, Plug, Megaphone, GitBranch
} from 'lucide-react';

interface ActivityItem {
  id: string;
  user_id: string;
  type: string;
  description: string;
  metadata: any;
  created_at: string;
  user_email?: string;
  user_name?: string;
}

interface UserInfo {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
}

interface AdminActivityFeedProps {
  activities: ActivityItem[];
  users?: UserInfo[];
  loading?: boolean;
}

interface FeatureInfo {
  icon: React.ReactNode;
  iconColorClass: string;
  badgeColorClass: string;
  label: string;
}

const getFeatureInfo = (activity: ActivityItem): FeatureInfo => {
  const feature = activity.metadata?.feature || '';
  const path = (activity.metadata?.path || '').toLowerCase();

  if (feature === 'leads' || path.includes('/leads'))
    return { icon: <UserPlus className="w-4 h-4" />, iconColorClass: 'text-blue-500', badgeColorClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20', label: 'Leads' };
  if (feature === 'contacts' || path.includes('/contacts'))
    return { icon: <Users className="w-4 h-4" />, iconColorClass: 'text-purple-500', badgeColorClass: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20', label: 'Contatos' };
  if (feature === 'inbox' || path.includes('/inbox') || path.includes('/messages') || path.includes('/conversations'))
    return { icon: <MessageSquare className="w-4 h-4" />, iconColorClass: 'text-green-500', badgeColorClass: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20', label: 'Inbox' };
  if (feature === 'campaigns' || path.includes('/campaigns'))
    return { icon: <Megaphone className="w-4 h-4" />, iconColorClass: 'text-orange-500', badgeColorClass: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20', label: 'Campanhas' };
  if (feature === 'analytics' || path.includes('/analytics'))
    return { icon: <BarChart2 className="w-4 h-4" />, iconColorClass: 'text-cyan-500', badgeColorClass: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20', label: 'Analytics' };
  if (feature === 'channels' || path.includes('/channels'))
    return { icon: <GitBranch className="w-4 h-4" />, iconColorClass: 'text-pink-500', badgeColorClass: 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20', label: 'Canais' };
  if (feature === 'assistants' || path.includes('/assistants'))
    return { icon: <Bot className="w-4 h-4" />, iconColorClass: 'text-violet-500', badgeColorClass: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20', label: 'IA' };
  if (feature === 'billing' || path.includes('/plans'))
    return { icon: <CreditCard className="w-4 h-4" />, iconColorClass: 'text-emerald-500', badgeColorClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20', label: 'Planos' };
  if (feature === 'integrations' || path.includes('/integrations'))
    return { icon: <Plug className="w-4 h-4" />, iconColorClass: 'text-yellow-500', badgeColorClass: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20', label: 'Integrações' };
  if (feature === 'admin' || path.includes('/admin'))
    return { icon: <Shield className="w-4 h-4" />, iconColorClass: 'text-red-500', badgeColorClass: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20', label: 'Admin' };
  if (feature === 'settings' || path.includes('/settings'))
    return { icon: <Settings className="w-4 h-4" />, iconColorClass: 'text-slate-500', badgeColorClass: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20', label: 'Config' };
  if (feature === 'auth' || activity.type === 'login' || path.includes('/auth'))
    return { icon: <Shield className="w-4 h-4" />, iconColorClass: 'text-blue-500', badgeColorClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20', label: 'Auth' };
  if (activity.type === 'error')
    return { icon: <AlertCircle className="w-4 h-4" />, iconColorClass: 'text-red-500', badgeColorClass: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20', label: 'Erro' };

  return { icon: <Activity className="w-4 h-4" />, iconColorClass: 'text-slate-400', badgeColorClass: 'bg-muted text-muted-foreground border-border/50', label: 'Geral' };
};

// Remove duplicates by user_id, description, and within 2 minutes window
function dedupeActivities(activities: ActivityItem[]) {
  const seen = new Map<string, number>(); // key -> last timestamp (ms)
  return activities.filter((a) => {
    const key = `${a.user_id}|${a.description}`;
    const ts = new Date(a.created_at).getTime();
    if (seen.has(key)) {
      const lastTs = seen.get(key)!;
      // If within 2 minutes (120000 ms), skip
      if (Math.abs(ts - lastTs) < 120000) return false;
    }
    seen.set(key, ts);
    return true;
  });
}

export default function AdminActivityFeed({ activities, users = [], loading }: AdminActivityFeedProps) {
  // Remove duplicates
  const filtered = dedupeActivities(activities);
  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex gap-4 p-4 rounded-xl border border-border bg-muted/50">
            <div className="w-10 h-10 rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-muted rounded w-1/4" />
              <div className="h-3 bg-muted rounded w-3/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <Info className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium text-foreground">Nenhuma atividade recente</h3>
        <p className="text-muted-foreground max-w-sm">
          As atividades dos usuários aparecerão aqui assim que começarem a interagir com a plataforma.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="px-6 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Usuário
              </th>
              <th className="px-6 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Módulo
              </th>
              <th className="px-6 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Atividade
              </th>
              <th className="px-6 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Endpoint
              </th>
              <th className="px-6 py-3.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Quando
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {filtered.map((activity) => {
              const fi = getFeatureInfo(activity);
              const pathLabel = activity.metadata?.path
                ? activity.metadata.path.replace(/\/api\//, '/').replace(/\/$/, '')
                : null;

              // Find user info by user_id
              const user = users.find(u => u.id === activity.user_id);
              const userName = user?.name || activity.user_name || user?.email?.split('@')[0] || activity.user_email?.split('@')[0] || 'Usuário';
              const userEmail = user?.email || activity.user_email || '';
              const avatarUrl = activity.avatar_url || user?.avatar_url;
              const initials = userName.split(' ').length >= 2
                ? (userName.split(' ')[0][0] + userName.split(' ')[1][0]).toUpperCase()
                : userName.substring(0, 2).toUpperCase();

              return (
                <tr key={activity.id} className="hover:bg-muted/50 transition-colors">
                  {/* User */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt={userName}
                          className="w-10 h-10 rounded-full object-cover border border-border"
                          onError={e => { e.currentTarget.style.display = 'none'; }}
                        />
                      ) : (
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center border bg-muted border-border ${fi.iconColorClass}`}> 
                          <span className="text-sm font-semibold">{initials}</span>
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-foreground">{userName}</p>
                        <p className="text-sm text-muted-foreground">{userEmail}</p>
                      </div>
                    </div>
                  </td>
                  {/* Module badge */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-md border font-medium ${fi.badgeColorClass}`}>
                      {fi.icon}
                      {fi.label}
                    </span>
                  </td>
                  {/* Activity description */}
                  <td className="px-6 py-4">
                    <p className="text-sm text-foreground/80 font-medium truncate max-w-[280px]">
                      {activity.description}
                    </p>
                  </td>
                  {/* Endpoint */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    {pathLabel ? (
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded w-fit max-w-[200px] overflow-hidden">
                        <span className="truncate">{pathLabel}</span>
                        {activity.metadata?.method && (
                          <span className="ml-1 text-[10px] uppercase font-bold tracking-wider text-muted-foreground/70">
                            [{activity.metadata.method}]
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  {/* Time */}
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
                      <Clock className="w-3.5 h-3.5" />
                      {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true, locale: ptBR })}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
