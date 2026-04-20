import { useState, useEffect, useCallback } from 'react';
import { 
  Bell, X, Check, Trash2, UserPlus, UserMinus, TrendingUp, 
  AlertTriangle, Crown, PartyPopper, Target, Calendar, 
  Sparkles, Rocket, CheckCircle2, XCircle, Clock, CreditCard, ShieldOff
} from 'lucide-react';
import { Button } from '../ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../ui/popover';
import { Badge } from '../ui/badge';
import { apiRequest } from '../../utils/api';
import { ScrollArea } from '../ui/scroll-area';
import { cn } from '../ui/utils';

// ✅ TIPOS DE NOTIFICAÇÃO RELEVANTES AO CRM
type NotificationType = 
  | 'lead_new'           // 👤 Novo lead
  | 'lead_removed'       // 🗑️ Lead removido
  | 'lead_converted'     // 🎉 Lead convertido
  | 'lead_moved'         // 📊 Lead movido no funil
  | 'campaign_sent'      // 📣 Resultado de campanha
  | 'plan_expiring'      // ⚠️ Plano expirando
  | 'plan_limit'         // 📈 Limite atingido
  | 'task_overdue'       // ⏰ Tarefa atrasada
  | 'task_reminder'      // 📞 Lembrete follow-up
  | 'welcome'            // 👋 Bem-vindo
  | 'tour'               // 🎯 Tour disponível
  | 'system_update'      // ✨ Atualização
  | 'admin_new_user'     // 👤 Admin: novo usuário
  | 'admin_plan_upgrade' // 📈 Admin: upgrade de plano
  | 'admin_payment_received' // 💳 Admin: pagamento
  | 'admin_user_suspended';  // 🚫 Admin: conta suspensa

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  actionLabel?: string;
  actionUrl?: string;
  metadata?: any;
  leadId?: string;  // ID do lead relacionado
  taskId?: string;  // ID da tarefa relacionada
}

interface NotificationConfig {
  icon: any;
  color: string;
  bgColor: string;
  borderColor: string;
}

// ✅ CONFIGURAÇÃO VISUAL POR TIPO
const notificationConfig: Record<NotificationType, NotificationConfig> = {
  lead_new: {
    icon: UserPlus,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50/80 dark:bg-blue-950/30',
    borderColor: 'border-blue-200/50 dark:border-blue-800/50',
  },
  lead_removed: {
    icon: UserMinus,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted/80',
    borderColor: 'border-border/50',
  },
  lead_converted: {
    icon: PartyPopper,
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-50/80 dark:bg-green-950/30',
    borderColor: 'border-green-200/50 dark:border-green-800/50',
  },
  lead_moved: {
    icon: TrendingUp,
    color: 'text-primary',
    bgColor: 'bg-primary/5',
    borderColor: 'border-primary/20',
  },
  campaign_sent: {
    icon: CheckCircle2,
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50/80 dark:bg-emerald-950/30',
    borderColor: 'border-emerald-200/50 dark:border-emerald-800/50',
  },
  plan_expiring: {
    icon: AlertTriangle,
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-50/80 dark:bg-orange-950/30',
    borderColor: 'border-orange-200/50 dark:border-orange-800/50',
  },
  plan_limit: {
    icon: Crown,
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-50/80 dark:bg-yellow-950/30',
    borderColor: 'border-yellow-200/50 dark:border-yellow-800/50',
  },
  task_overdue: {
    icon: Clock,
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50/80 dark:bg-red-950/30',
    borderColor: 'border-red-200/50 dark:border-red-800/50',
  },
  task_reminder: {
    icon: Calendar,
    color: 'text-cyan-600 dark:text-cyan-400',
    bgColor: 'bg-cyan-50/80 dark:bg-cyan-950/30',
    borderColor: 'border-cyan-200/50 dark:border-cyan-800/50',
  },
  welcome: {
    icon: Rocket,
    color: 'text-indigo-600 dark:text-indigo-400',
    bgColor: 'bg-indigo-50/80 dark:bg-indigo-950/30',
    borderColor: 'border-indigo-200/50 dark:border-indigo-800/50',
  },
  tour: {
    icon: Target,
    color: 'text-violet-600 dark:text-violet-400',
    bgColor: 'bg-violet-50/80 dark:bg-violet-950/30',
    borderColor: 'border-violet-200/50 dark:border-violet-800/50',
  },
  system_update: {
    icon: Sparkles,
    color: 'text-pink-600 dark:text-pink-400',
    bgColor: 'bg-pink-50/80 dark:bg-pink-950/30',
    borderColor: 'border-pink-200/50 dark:border-pink-800/50',
  },
  admin_new_user: {
    icon: UserPlus,
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50/80 dark:bg-emerald-950/30',
    borderColor: 'border-emerald-200/50 dark:border-emerald-800/50',
  },
  admin_plan_upgrade: {
    icon: TrendingUp,
    color: 'text-primary',
    bgColor: 'bg-primary/5',
    borderColor: 'border-primary/20',
  },
  admin_payment_received: {
    icon: CreditCard,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50/80 dark:bg-blue-950/30',
    borderColor: 'border-blue-200/50 dark:border-blue-800/50',
  },
  admin_user_suspended: {
    icon: ShieldOff,
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50/80 dark:bg-red-950/30',
    borderColor: 'border-red-200/50 dark:border-red-800/50',
  },
};

// ✅ PRIORIDADE DAS NOTIFICAÇÕES (ordem de exibição)
const notificationPriority: Record<NotificationType, number> = {
  task_overdue: 1,      // ⚠️ Mais urgente
  plan_expiring: 2,
  admin_plan_upgrade: 3,
  admin_payment_received: 3,
  admin_new_user: 4,
  admin_user_suspended: 4,
  task_reminder: 5,
  campaign_sent: 6,
  lead_new: 6,
  lead_converted: 7,
  lead_moved: 8,
  plan_limit: 9,
  lead_removed: 10,
  welcome: 11,
  tour: 12,
  system_update: 13,    // Menos urgente
};

interface NotificationBellProps {
  onNavigate?: (page: string) => void;
  onStartTour?: () => void;
}

export function NotificationBell({ onNavigate, onStartTour }: NotificationBellProps = {}) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [dismissedReady, setDismissedReady] = useState(false);

  const DISMISSED_KEY = 'leadflow_dismissed_notifications';

  useEffect(() => {
    try {
      const stored = localStorage.getItem(DISMISSED_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setDismissedIds(parsed);
        }
      }
    } catch (error) {
      console.warn('[Notifications] Failed to load dismissed notifications:', error);
    } finally {
      setDismissedReady(true);
    }
  }, []);

  const addDismissed = (ids: string[]) => {
    if (!ids.length) return;
    setDismissedIds(prev => {
      const merged = new Set(prev);
      ids.forEach(id => merged.add(id));
      const result = Array.from(merged);
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(result));
      return result;
    });
  };

  const loadNotifications = useCallback(async () => {
    const dismissedSet = new Set(dismissedIds);
    const token = localStorage.getItem('leadflow_access_token');
    if (!token) {
      setNotifications([]);
      return;
    }

    try {
      setLoading(true);
      const data = await apiRequest('/notifications', 'GET');
      if (data.notifications) {
        // Map API response to component interface (createdAt -> timestamp)
        const mappedNotifications = data.notifications.map((n: any) => ({
          ...n,
          timestamp: n.createdAt || n.timestamp,
          type: n.type || 'system_update',
          message: n.description || n.message,
          read: n.isRead || n.read,
        }));
        
        // Ordenar por prioridade e timestamp
        const sorted = mappedNotifications.sort((a: Notification, b: Notification) => {
          const priorityDiff = (notificationPriority[a.type] || 99) - (notificationPriority[b.type] || 99);
          if (priorityDiff !== 0) return priorityDiff;
          return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        });
        const filtered = sorted.filter((notification: Notification) => !dismissedSet.has(notification.id));
        setNotifications(filtered);
      }
    } catch (error: any) {
      if (!error.message?.includes('authentication token')) {
        console.error('Failed to load notifications:', error);
      }
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [dismissedIds]);

  useEffect(() => {
    if (!dismissedReady) return;
    const token = localStorage.getItem('leadflow_access_token');
    if (token) {
      void loadNotifications();
      const interval = setInterval(() => {
        void loadNotifications();
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [dismissedReady, loadNotifications]);

  // Refresh when the bell panel is opened
  useEffect(() => {
    if (open) {
      void loadNotifications();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const markAsRead = async (notificationId: string, closePanel = false) => {
    try {
      await apiRequest(`/notifications/${notificationId}/read`, 'PUT');
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      );
      
      if (closePanel) {
        setOpen(false);
      }
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await apiRequest('/notifications/mark-all-read', 'PUT');
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const removeNotification = async (notificationId: string, withAnimation = true) => {
    try {
      // Adicionar animação de saída
      if (withAnimation) {
        const element = document.getElementById(`notification-${notificationId}`);
        if (element) {
          element.classList.add('notification-removing');
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      
      await apiRequest(`/notifications/${notificationId}`, 'DELETE');
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
      addDismissed([notificationId]);
    } catch (error) {
      console.error('Failed to remove notification:', error);
    }
  };

  const clearAll = async () => {
    try {
      const currentIds = notifications.map((n) => n.id);
      await apiRequest('/notifications/clear-all', 'DELETE');
      setNotifications([]);
      addDismissed(currentIds);
      setShowClearConfirm(false);
    } catch (error) {
      console.error('Failed to clear notifications:', error);
    }
  };

  const handleAction = (notification: Notification, closePanel = true) => {
    // Marcar como lida
    if (!notification.read) {
      markAsRead(notification.id, false);
    }
    
    // Executar ação
    if (notification.actionUrl) {
      // Handle tour action specially
      if (notification.actionUrl === '/tour' || notification.type === 'tour') {
        if (onStartTour) {
          console.log('[Tour] Starting tour from notification');
          onStartTour();
        }
      } else if (onNavigate) {
        // Remove a barra inicial se existir (ex: /funnel -> funnel)
        const cleanUrl = notification.actionUrl.startsWith('/') 
          ? notification.actionUrl.substring(1) 
          : notification.actionUrl;
        
        console.log('[Navigation] Navigating to:', cleanUrl);
        onNavigate(cleanUrl);
      } else {
        console.log('Navigate to:', notification.actionUrl);
      }
    }
    
    // Fechar painel
    if (closePanel) {
      setOpen(false);
    }
  };
  
  // Marcar como lida sem fechar o painel
  const handleMarkAsReadOnly = async (e: React.MouseEvent, notificationId: string) => {
    e.stopPropagation();
    await markAsRead(notificationId, false);
  };

  const createTestNotification = async () => {
    try {
      await apiRequest('/notifications/test', 'POST');
      await loadNotifications();
    } catch (error) {
      console.error('Failed to create test notification:', error);
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'agora';
    if (minutes < 60) return `${minutes}min atrás`;
    if (hours < 24) return `${hours}h atrás`;
    if (days === 1) return 'ontem';
    if (days < 7) return `${days}d atrás`;
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  };

  // ✅ AGRUPAMENTO POR DATA
  const groupNotifications = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const lastWeek = new Date(today.getTime() - 7 * 86400000);

    const groups: { title: string; items: Notification[] }[] = [
      { title: 'Hoje', items: [] },
      { title: 'Ontem', items: [] },
      { title: 'Últimos 7 dias', items: [] },
      { title: 'Mais antigas', items: [] },
    ];

    notifications.forEach((n) => {
      const date = new Date(n.timestamp);
      if (date >= today) {
        groups[0].items.push(n);
      } else if (date >= yesterday) {
        groups[1].items.push(n);
      } else if (date >= lastWeek) {
        groups[2].items.push(n);
      } else {
        groups[3].items.push(n);
      }
    });

    return groups.filter(g => g.items.length > 0);
  };

  const groupedNotifications = groupNotifications();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="relative p-2 rounded-lg hover:bg-muted dark:hover:bg-muted transition-colors"
        >
          <Bell className="h-5 w-5 text-muted-foreground" />
          {unreadCount > 0 && (
            <Badge
              className="absolute -top-0.5 -right-0.5 h-4 w-4 flex items-center justify-center p-0 text-[10px] bg-red-500 border-none hover:bg-red-500"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      
      {/* ✅ PAINEL RESPONSIVO - Desktop: 420px | Mobile: otimizado */}
      <PopoverContent 
        className={cn(
          'w-[95vw] sm:w-[420px] p-0 max-h-[calc(100vh-80px)] sm:max-h-[min(600px,calc(100vh-100px))] overflow-hidden flex flex-col modal-panel shadow-2xl border border-border',
        )}
        align="end"
        sideOffset={8}
      >
        {/* ✅ HEADER FIXO */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3 flex-shrink-0 bg-[hsl(var(--card))]">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-base">🔔 Notificações</h3>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="h-5 px-2 text-xs">
                {unreadCount}
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 -mr-2"
            onClick={() => setOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* ✅ ACTIONS BAR FIXO */}
        {notifications.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-[hsl(var(--muted))/0.35] flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={markAllAsRead}
              disabled={unreadCount === 0}
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              Marcar todas como lidas
            </Button>
            
            {!showClearConfirm ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-destructive"
                onClick={() => setShowClearConfirm(true)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Limpar
              </Button>
            ) : (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-destructive"
                  onClick={clearAll}
                >
                  Confirmar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setShowClearConfirm(false)}
                >
                  Cancelar
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ✅ LISTA DE NOTIFICAÇÕES - Scroll interno controlado */}
        <div 
          className="overflow-y-auto flex-1 notifications-scroll px-1" 
          style={{ maxHeight: 'calc(100vh - 200px)' }}
        >
          {loading && notifications.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="w-20 h-20 rounded-full bg-[hsl(var(--muted))/0.4] flex items-center justify-center mb-4">
                <Bell className="h-10 w-10 text-muted-foreground/60" />
              </div>
              <p className="text-base font-semibold text-foreground mb-2">
                Nenhuma notificação ainda
              </p>
              <p className="text-sm text-muted-foreground max-w-[260px] leading-relaxed">
                Você será notificado sobre atividades importantes aqui
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {groupedNotifications.map((group) => (
                <div key={group.title}>
                  {/* Group Header */}
                  <div className="px-4 py-2 bg-muted/20">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {group.title}
                    </p>
                  </div>
                  
                  {/* Group Items */}
                  {group.items.map((notification) => {
                    const config = notificationConfig[notification.type] || notificationConfig.welcome;
                    const Icon = config?.icon || Bell;
                    
                    return (
                      <div
                        id={`notification-${notification.id}`}
                        key={notification.id}
                        className={cn(
                          'relative p-4 hover:bg-muted/50 transition-all duration-200 group',
                          !notification.read && 'bg-muted/30'
                        )}
                      >
                        {/* ✅ CARD LAYOUT */}
                        <div className="flex items-start gap-3">
                          {/* Icon */}
                          <div className={cn(
                            'flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center',
                            config.bgColor,
                            'border',
                            config.borderColor
                          )}>
                            <Icon className={cn('h-4 w-4', config.color)} />
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0 space-y-1">
                            {/* Title + Unread Badge */}
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-foreground line-clamp-1">
                                {notification.title}
                              </p>
                              {!notification.read && (
                                <div className="flex-shrink-0 w-2 h-2 rounded-full bg-[#8B5CF6]" />
                              )}
                            </div>

                            {/* Message */}
                            <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                              {notification.message}
                            </p>

                            {/* Footer: Time */}
                            <div className="flex items-center gap-2 pt-1">
                              <span className="text-xs text-muted-foreground">
                                {formatTimestamp(notification.timestamp)}
                              </span>
                            </div>

                            {/* ✅ BOTÕES DE AÇÃO - Sempre visíveis */}
                            <div className="flex items-center gap-2 pt-2 notification-actions-mobile transition-opacity duration-200">
                              {/* Botão principal (Ver Lead, Ver Tarefa, etc) */}
                              {notification.actionLabel && notification.actionUrl && (
                                <Button
                                  variant="default"
                                  size="sm"
                                  className="h-7 text-xs px-3 bg-primary hover:bg-primary/90"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAction(notification, true);
                                  }}
                                >
                                  {notification.actionLabel}
                                </Button>
                              )}
                              
                              {/* Botão Marcar como lida */}
                              {!notification.read && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 hover:bg-muted"
                                  title="Marcar como lida"
                                  onClick={(e) => handleMarkAsReadOnly(e, notification.id)}
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              
                              {/* Botão Remover */}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                                title="Remover notificação"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeNotification(notification.id, true);
                                }}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}


