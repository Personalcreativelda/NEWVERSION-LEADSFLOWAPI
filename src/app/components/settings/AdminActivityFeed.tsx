import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  User, Mail, Clock, Activity, MessageSquare, 
  UserPlus, Settings, Shield, AlertCircle, Info,
  Smartphone, Monitor, Globe, CheckCircle
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

interface AdminActivityFeedProps {
  activities: ActivityItem[];
  loading?: boolean;
}

const getActivityIcon = (type: string) => {
  switch (type.toLowerCase()) {
    case 'login': return <Shield className="w-4 h-4 text-blue-500" />;
    case 'message_sent': return <MessageSquare className="w-4 h-4 text-green-500" />;
    case 'lead_created': return <UserPlus className="w-4 h-4 text-purple-500" />;
    case 'settings_updated': return <Settings className="w-4 h-4 text-orange-500" />;
    case 'error': return <AlertCircle className="w-4 h-4 text-red-500" />;
    default: return <Activity className="w-4 h-4 text-slate-500" />;
  }
};

export default function AdminActivityFeed({ activities, loading }: AdminActivityFeedProps) {
  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex gap-4 p-4 rounded-xl border border-border/50 bg-muted/20">
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

  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mb-4">
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
    <div className="space-y-4">
      {activities.map((activity) => (
        <div 
          key={activity.id} 
          className="group flex gap-4 p-4 rounded-xl border border-border/50 bg-card hover:bg-muted/30 transition-all duration-200"
        >
          <div className="flex-shrink-0">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
              {getActivityIcon(activity.type)}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground truncate">
                  {activity.user_name || activity.user_email?.split('@')[0] || 'Usuário'}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/50">
                  {activity.type.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
                <Clock className="w-3.5 h-3.5" />
                {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true, locale: ptBR })}
              </div>
            </div>

            <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
              {activity.description}
            </p>

            {/* Metadata Preview */}
            {activity.metadata && Object.keys(activity.metadata).length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {activity.metadata.browser && (
                  <div className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider text-muted-foreground/70 bg-muted/50 px-1.5 py-0.5 rounded">
                    <Globe className="w-3 h-3" />
                    {activity.metadata.browser}
                  </div>
                )}
                {activity.metadata.os && (
                  <div className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider text-muted-foreground/70 bg-muted/50 px-1.5 py-0.5 rounded">
                    <Monitor className="w-3 h-3" />
                    {activity.metadata.os}
                  </div>
                )}
                {/* IP removed as per user request */}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
