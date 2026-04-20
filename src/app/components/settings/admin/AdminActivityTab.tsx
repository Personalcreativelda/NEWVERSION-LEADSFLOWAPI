import React from 'react';
import { RefreshCw, Zap, Users } from 'lucide-react';
import { Button } from '../../ui/button';
import AdminActivityFeed from '../AdminActivityFeed';

interface UserInfo {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
}

interface ActivityTabProps {
  activities: any[];
  activeUsers: any[];
  activitiesLoading: boolean;
  onRefreshActivities: () => void;
  users?: UserInfo[];
}

export const AdminActivityTab: React.FC<ActivityTabProps> = ({
  activities,
  activeUsers,
  activitiesLoading,
  onRefreshActivities,
  users = [],
}) => {
  return (
    <div className="space-y-8">
      {/* Active Users - above the activity feed */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-500 fill-yellow-500" />
            <h2 className="text-xl font-bold text-foreground">Online Agora</h2>
          </div>
          {activeUsers.length > 0 && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-green-500/10 text-green-600 dark:text-green-400 text-xs font-semibold border border-green-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              {activeUsers.length}
            </span>
          )}
        </div>

        {/* Online users in a table/card grid matching the style */}
        {activeUsers.length === 0 ? (
          <div className="p-8 rounded-xl border border-dashed border-border flex flex-col items-center justify-center text-center">
            <p className="text-muted-foreground text-sm">Nenhum usuário ativo nos últimos 15 min</p>
          </div>
        ) : (
          <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted">
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Usuário
                    </th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Última Atividade
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {activeUsers.map(user => {
                    const displayName = user.name || user.email?.split('@')[0] || 'Usuário';
                    const initials = displayName.split(' ').length >= 2
                      ? (displayName.split(' ')[0][0] + displayName.split(' ')[1][0]).toUpperCase()
                      : displayName.substring(0, 2).toUpperCase();
                    return (
                      <tr key={user.id} className="hover:bg-muted/50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className="relative flex-shrink-0">
                              <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center overflow-hidden border border-border">
                                {user.avatar_url ? (
                                  <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-sm font-semibold text-blue-500">{initials}</span>
                                )}
                              </div>
                              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-card" />
                            </div>
                            <div>
                              <p className="font-medium text-foreground">{displayName}</p>
                              <p className="text-sm text-muted-foreground">{user.email || ''}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                            Online
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-foreground/80 font-medium truncate max-w-[300px]">
                            {user.recent_activities?.[0]?.description || 'Ativo na plataforma'}
                          </p>
                          {user.recent_activities && user.recent_activities.length > 1 && (() => {
                            const seen = new Set<string>();
                            seen.add(user.recent_activities[0]?.description || '');
                            const unique = user.recent_activities.slice(1).filter((act: any) => {
                              if (seen.has(act.description)) return false;
                              seen.add(act.description);
                              return true;
                            }).slice(0, 2);
                            if (unique.length === 0) return null;
                            return (
                              <div className="flex flex-col gap-0.5 mt-1">
                                {unique.map((act: any, idx: number) => (
                                  <p key={idx} className="text-[11px] text-muted-foreground truncate max-w-[300px]">
                                    • {act.description}
                                  </p>
                                ))}
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Activity Feed - below online users */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-blue-500" />
            <h2 className="text-xl font-bold text-foreground">Atividades Recentes</h2>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefreshActivities}
            disabled={activitiesLoading}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${activitiesLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
        <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
          <AdminActivityFeed activities={activities} users={users} loading={activitiesLoading} />
        </div>
      </div>
    </div>
  );
};
