import React, { useMemo, useState } from 'react';
import {
  Activity, MessageSquare,
  UserPlus, Settings, Shield, AlertCircle,
  BarChart2, Users, Bot,
  CreditCard, Plug, Megaphone, GitBranch, SearchX,
} from 'lucide-react';
import { SearchInput } from '../base/SearchInput';
import { EmptyState } from '../base/EmptyState';
import { Button } from '../ui/button';
import { formatRelativeDay, formatTime } from '../../utils/format';
import { matchesSearch } from '../../utils/search';

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
  key: string;
  icon: React.ElementType;
  iconColorClass: string;
  label: string;
}

const getFeatureInfo = (activity: ActivityItem): FeatureInfo => {
  const feature = activity.metadata?.feature || '';
  const path = (activity.metadata?.path || '').toLowerCase();

  if (feature === 'leads' || path.includes('/leads'))
    return { key: 'leads', icon: UserPlus, iconColorClass: 'text-blue-500', label: 'Leads' };
  if (feature === 'contacts' || path.includes('/contacts'))
    return { key: 'contacts', icon: Users, iconColorClass: 'text-purple-500', label: 'Contactos' };
  if (feature === 'inbox' || path.includes('/inbox') || path.includes('/messages') || path.includes('/conversations'))
    return { key: 'inbox', icon: MessageSquare, iconColorClass: 'text-green-500', label: 'Inbox' };
  if (feature === 'campaigns' || path.includes('/campaigns'))
    return { key: 'campaigns', icon: Megaphone, iconColorClass: 'text-orange-500', label: 'Campanhas' };
  if (feature === 'analytics' || path.includes('/analytics'))
    return { key: 'analytics', icon: BarChart2, iconColorClass: 'text-cyan-500', label: 'Relatórios' };
  if (feature === 'channels' || path.includes('/channels'))
    return { key: 'channels', icon: GitBranch, iconColorClass: 'text-pink-500', label: 'Canais' };
  if (feature === 'assistants' || path.includes('/assistants'))
    return { key: 'assistants', icon: Bot, iconColorClass: 'text-violet-500', label: 'IA' };
  if (feature === 'billing' || path.includes('/plans'))
    return { key: 'billing', icon: CreditCard, iconColorClass: 'text-emerald-500', label: 'Planos' };
  if (feature === 'integrations' || path.includes('/integrations'))
    return { key: 'integrations', icon: Plug, iconColorClass: 'text-yellow-500', label: 'Integrações' };
  if (feature === 'admin' || path.includes('/admin'))
    return { key: 'admin', icon: Shield, iconColorClass: 'text-red-500', label: 'Admin' };
  if (feature === 'settings' || path.includes('/settings'))
    return { key: 'settings', icon: Settings, iconColorClass: 'text-slate-500', label: 'Definições' };
  if (feature === 'auth' || activity.type === 'login' || path.includes('/auth'))
    return { key: 'auth', icon: Shield, iconColorClass: 'text-blue-500', label: 'Sessão' };
  if (activity.type === 'error')
    return { key: 'error', icon: AlertCircle, iconColorClass: 'text-red-500', label: 'Erro' };

  return { key: 'general', icon: Activity, iconColorClass: 'text-muted-foreground', label: 'Geral' };
};

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}

/** Avatar redondo (foto ou iniciais), com ponto verde opcional de "online" */
export function UserAvatar({ name, avatarUrl, online, size = 'md' }: { name: string; avatarUrl?: string; online?: boolean; size?: 'sm' | 'md' }) {
  const [broken, setBroken] = useState(false);
  const box = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm';
  return (
    <div className="relative flex-shrink-0">
      <div className={`${box} rounded-full bg-muted border border-border flex items-center justify-center overflow-hidden font-semibold text-muted-foreground`}>
        {avatarUrl && !broken ? (
          <img src={avatarUrl} alt="" className="w-full h-full object-cover" onError={() => setBroken(true)} />
        ) : (
          <span translate="no">{initialsOf(name)}</span>
        )}
      </div>
      {online && <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-card" />}
    </div>
  );
}

interface Row {
  activity: ActivityItem;
  count: number;
  /** Hora da ação mais antiga juntada nesta linha */
  oldestAt: number;
  feature: FeatureInfo;
  userName: string;
  userEmail: string;
  avatarUrl?: string;
}

/** A mesma ação do mesmo utilizador, seguida e com menos de 30 min de intervalo, fica numa só linha (×N) */
const GROUP_WINDOW_MS = 30 * 60_000;
const PAGE = 40;

export default function AdminActivityFeed({ activities, users = [], loading }: AdminActivityFeedProps) {
  const [search, setSearch] = useState('');
  const [module, setModule] = useState('all');
  const [visible, setVisible] = useState(PAGE);

  const rows = useMemo<Row[]>(() => {
    const byId = new Map(users.map((u) => [u.id, u]));
    const sorted = [...activities].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const out: Row[] = [];
    for (const activity of sorted) {
      const at = new Date(activity.created_at).getTime();
      const last = out[out.length - 1];
      if (
        last &&
        last.activity.user_id === activity.user_id &&
        last.activity.description === activity.description &&
        last.oldestAt - at < GROUP_WINDOW_MS
      ) {
        last.count++;
        last.oldestAt = at;
        continue;
      }
      const user = byId.get(activity.user_id);
      out.push({
        activity,
        count: 1,
        oldestAt: at,
        feature: getFeatureInfo(activity),
        userName: user?.name || activity.user_name || user?.email?.split('@')[0] || activity.user_email?.split('@')[0] || 'Utilizador',
        userEmail: user?.email || activity.user_email || '',
        avatarUrl: user?.avatar_url,
      });
    }
    return out;
  }, [activities, users]);

  const modules = useMemo(() => {
    const seen = new Map<string, string>();
    rows.forEach((r) => seen.set(r.feature.key, r.feature.label));
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filtered = useMemo(
    () => rows.filter((r) =>
      (module === 'all' || r.feature.key === module) &&
      (!search || matchesSearch(search, r.userName, r.userEmail, r.activity.description, r.feature.label))),
    [rows, module, search],
  );

  // Agrupadas por dia (Hoje, Ontem, …)
  const days = useMemo(() => {
    const groups: { label: string; rows: Row[] }[] = [];
    for (const row of filtered.slice(0, visible)) {
      const label = formatRelativeDay(row.activity.created_at);
      if (groups[groups.length - 1]?.label !== label) groups.push({ label, rows: [] });
      groups[groups.length - 1].rows.push(row);
    }
    return groups;
  }, [filtered, visible]);

  const toolbar = (
    <div className="flex flex-col gap-2 sm:flex-row">
      <SearchInput
        value={search}
        onChange={(v) => { setSearch(v); setVisible(PAGE); }}
        placeholder="Pesquisar"
        containerClassName="w-full sm:w-64"
      />
      <select
        value={module}
        onChange={(e) => { setModule(e.target.value); setVisible(PAGE); }}
        className="w-full sm:w-48"
      >
        <option value="all">Todos os módulos</option>
        {modules.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </div>
  );

  if (loading && activities.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card divide-y divide-border animate-pulse">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <div className="w-8 h-8 rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-muted rounded w-1/4" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return <EmptyState icon={Activity} title="Sem atividade" className="rounded-xl border border-dashed border-border" />;
  }

  return (
    <div className="space-y-3">
      {toolbar}

      {filtered.length === 0 ? (
        <EmptyState icon={SearchX} title="Nenhum resultado" className="rounded-xl border border-dashed border-border" />
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {days.map((day) => (
            <div key={day.label}>
              <div className="px-4 py-2 text-xs font-medium text-muted-foreground bg-muted/40 border-b border-border">
                {day.label}
              </div>
              <div className="divide-y divide-border">
                {day.rows.map(({ activity, count, feature, userName, userEmail, avatarUrl }) => {
                  const Icon = feature.icon;
                  const endpoint = activity.metadata?.path
                    ? `${activity.metadata?.method || ''} ${String(activity.metadata.path).replace(/^\/api/, '')}`.trim()
                    : undefined;
                  return (
                    <div key={activity.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors" title={endpoint}>
                      <UserAvatar name={userName} avatarUrl={avatarUrl} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate" title={userEmail} translate="no">{userName}</p>
                          {count > 1 && (
                            <span className="flex-shrink-0 text-xs text-muted-foreground" translate="no">×{count}</span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          <span>{activity.description}</span>
                        </p>
                      </div>
                      <span className="hidden sm:inline-flex flex-shrink-0 items-center gap-1.5 text-xs text-muted-foreground w-32">
                        <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${feature.iconColorClass}`} />
                        <span className="truncate">{feature.label}</span>
                      </span>
                      <span className="flex-shrink-0 text-xs text-muted-foreground tabular-nums w-11 text-right">
                        {formatTime(activity.created_at)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {filtered.length > visible && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => setVisible((v) => v + PAGE)}>
            Ver mais
          </Button>
        </div>
      )}
    </div>
  );
}
