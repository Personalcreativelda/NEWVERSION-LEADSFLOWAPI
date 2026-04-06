import React from 'react';
import { RefreshCw, Zap, Users } from 'lucide-react';
import { Button } from '../../ui/button';
import AdminActivityFeed from '../AdminActivityFeed';

interface ActivityTabProps {
  activities: any[];
  activeUsers: any[];
  activitiesLoading: boolean;
  onRefreshActivities: () => void;
}

export const AdminActivityTab: React.FC<ActivityTabProps> = ({
  activities,
  activeUsers,
  activitiesLoading,
  onRefreshActivities,
}) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
      {/* Recent Activity Feed */}
      <div className="lg:col-span-2 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-foreground">Fluxo de Atividade</h2>
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
        <div className="max-h-[800px] overflow-y-auto pr-2 custom-scrollbar">
          <AdminActivityFeed activities={activities} loading={activitiesLoading} />
        </div>
      </div>

      {/* Active Users Sidebar */}
      <div className="space-y-6">
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
        <div className="space-y-3">
          {activeUsers.length === 0 ? (
            <div className="p-8 rounded-xl border border-dashed border-border flex flex-col items-center justify-center text-center">
              <p className="text-muted-foreground text-sm">Nenhum usuário ativo nos últimos 15 min</p>
            </div>
          ) : (
            activeUsers.map(user => (
              <div key={user.id} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border/50 hover:bg-muted/30 transition-colors">
                <div className="relative flex-shrink-0">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden border border-border">
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Users className="w-5 h-5 text-primary" />
                    )}
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-background" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-foreground truncate">{user.name || user.email.split('@')[0]}</p>
                  
                  {/* Show latest activity as primary status */}
                  <p className="text-[11px] text-green-600 dark:text-green-400 font-medium truncate mt-0.5">
                    {user.recent_activities?.[0]?.description || 'Ativo agora'}
                  </p>

                  {/* Show small history of last 5 activities */}
                  {user.recent_activities && user.recent_activities.length > 1 && (
                    <div className="mt-1.5 pt-1.5 border-t border-border/30">
                      <div className="flex flex-col gap-1">
                        {user.recent_activities.slice(1, 4).map((act: any, idx: number) => (
                          <div key={idx} className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
                            <div className="w-1 h-1 rounded-full bg-muted-foreground/40" />
                            <span className="truncate">{act.description}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
