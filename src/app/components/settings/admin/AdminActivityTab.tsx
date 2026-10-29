import React from 'react';
import AdminActivityFeed, { UserAvatar } from '../AdminActivityFeed';
import { getLocale } from '../../../utils/format';

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
  users?: UserInfo[];
}

/** "agora", "há 4 minutos" — no idioma do app */
function minutesAgo(value?: string): string {
  if (!value) return '';
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  return new Intl.RelativeTimeFormat(getLocale(), { numeric: 'auto' }).format(-minutes, 'minute');
}

export const AdminActivityTab: React.FC<ActivityTabProps> = ({
  activities,
  activeUsers,
  activitiesLoading,
  users = [],
}) => {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Online agora</h2>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground" translate="no">
            <span className={`w-1.5 h-1.5 rounded-full ${activeUsers.length > 0 ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
            {activeUsers.length}
          </span>
        </div>

        {activeUsers.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Ninguém online
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {activeUsers.map((user) => {
              const name = user.name || user.email?.split('@')[0] || 'Utilizador';
              const last = user.recent_activities?.[0];
              return (
                <div key={user.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 min-w-0">
                  <UserAvatar name={name} avatarUrl={user.avatar_url} online />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate" title={user.email} translate="no">{name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      <span>{last?.description || 'Ativo na plataforma'}</span>
                    </p>
                  </div>
                  <span className="flex-shrink-0 text-xs text-muted-foreground">
                    {minutesAgo(user.last_active_at || last?.created_at)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Atividade recente</h2>
        <AdminActivityFeed activities={activities} users={users} loading={activitiesLoading} />
      </section>
    </div>
  );
};
