// Notifications System - LeadsFlow API
import * as kv from './kv_store.tsx';

// ============================================
// TIPOS DE NOTIFICAÇÃO
// ============================================

export type NotificationType = 
  | 'lead_new'           // 👤 Novo lead
  | 'lead_removed'       // 🗑️ Lead removido
  | 'lead_converted'     // 🎉 Lead convertido
  | 'lead_moved'         // 📊 Lead movido no funil
  | 'plan_expiring'      // ⚠️ Plano expirando
  | 'plan_limit'         // 📈 Limite atingido
  | 'task_overdue'       // ⏰ Tarefa atrasada
  | 'task_reminder'      // 📞 Lembrete follow-up
  | 'welcome'            // 👋 Bem-vindo
  | 'tour'               // 🎯 Tour disponível
  | 'system_update';     // ✨ Atualização

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  actionLabel?: string;
  actionUrl?: string;
  metadata?: any;
  leadId?: string;
  taskId?: string;
}

// ============================================
// CRUD DE NOTIFICAÇÕES
// ============================================

/**
 * Criar uma nova notificação
 */
export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  options?: {
    actionLabel?: string;
    actionUrl?: string;
    metadata?: any;
    leadId?: string;
    taskId?: string;
  }
): Promise<Notification> {
  const notificationId = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const notification: Notification = {
    id: notificationId,
    userId,
    type,
    title,
    message,
    timestamp: new Date().toISOString(),
    read: false,
    actionLabel: options?.actionLabel,
    actionUrl: options?.actionUrl,
    metadata: options?.metadata,
    leadId: options?.leadId,
    taskId: options?.taskId,
  };

  await kv.set(`notification:${userId}:${notificationId}`, notification);
  
  console.log(`[Notification] ✅ Created notification ${type} for user ${userId}`);
  
  return notification;
}

/**
 * Buscar todas as notificações de um usuário
 */
export async function getUserNotifications(userId: string): Promise<Notification[]> {
  try {
    const notifications = await kv.getByPrefix(`notification:${userId}:`);
    
    if (!notifications || notifications.length === 0) {
      return [];
    }

    // Ordenar por timestamp (mais recente primeiro)
    return notifications.sort((a: Notification, b: Notification) => {
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
  } catch (error) {
    console.error('[Notification] Error fetching notifications:', error);
    return [];
  }
}

/**
 * Marcar notificação como lida
 */
export async function markNotificationAsRead(userId: string, notificationId: string): Promise<boolean> {
  try {
    const notification = await kv.get(`notification:${userId}:${notificationId}`);
    
    if (!notification) {
      console.error('[Notification] Notification not found:', notificationId);
      return false;
    }

    notification.read = true;
    await kv.set(`notification:${userId}:${notificationId}`, notification);
    
    console.log(`[Notification] ✅ Marked as read: ${notificationId}`);
    return true;
  } catch (error) {
    console.error('[Notification] Error marking as read:', error);
    return false;
  }
}

/**
 * Marcar todas as notificações como lidas
 */
export async function markAllNotificationsAsRead(userId: string): Promise<number> {
  try {
    const notifications = await getUserNotifications(userId);
    let count = 0;

    for (const notification of notifications) {
      if (!notification.read) {
        notification.read = true;
        await kv.set(`notification:${userId}:${notification.id}`, notification);
        count++;
      }
    }

    console.log(`[Notification] ✅ Marked ${count} notifications as read`);
    return count;
  } catch (error) {
    console.error('[Notification] Error marking all as read:', error);
    return 0;
  }
}

/**
 * Deletar uma notificação
 */
export async function deleteNotification(userId: string, notificationId: string): Promise<boolean> {
  try {
    await kv.del(`notification:${userId}:${notificationId}`);
    console.log(`[Notification] ✅ Deleted notification: ${notificationId}`);
    return true;
  } catch (error) {
    console.error('[Notification] Error deleting notification:', error);
    return false;
  }
}

/**
 * Limpar todas as notificações de um usuário
 */
export async function clearAllNotifications(userId: string): Promise<number> {
  try {
    const notifications = await getUserNotifications(userId);
    const notificationIds = notifications.map(n => `notification:${userId}:${n.id}`);
    
    if (notificationIds.length > 0) {
      await kv.mdel(notificationIds);
    }

    console.log(`[Notification] ✅ Cleared ${notificationIds.length} notifications`);
    return notificationIds.length;
  } catch (error) {
    console.error('[Notification] Error clearing notifications:', error);
    return 0;
  }
}

// ============================================
// NOTIFICAÇÕES AUTOMÁTICAS
// ============================================

/**
 * Criar notificação de novo lead
 */
export async function notifyNewLead(userId: string, leadId: string, leadName: string, source?: string) {
  const sourceText = source ? ` via ${source}` : '';
  
  await createNotification(
    userId,
    'lead_new',
    'Novo lead cadastrado',
    `${leadName} foi adicionado${sourceText}`,
    {
      actionLabel: 'Ver lead',
      actionUrl: `/leads`,
      leadId,
      metadata: { source }
    }
  );
}

/**
 * Criar notificação de lead convertido
 */
export async function notifyLeadConverted(userId: string, leadId: string, leadName: string, value?: number) {
  const valueText = value ? ` no valor de R$ ${value.toLocaleString('pt-BR')}` : '';
  
  await createNotification(
    userId,
    'lead_converted',
    'Lead convertido! 🎉',
    `${leadName} fechou negócio${valueText}`,
    {
      actionLabel: 'Ver deal',
      actionUrl: `/leads`,
      leadId,
      metadata: { value }
    }
  );
}

/**
 * Criar notificação de lead movido no funil
 */
export async function notifyLeadMoved(userId: string, leadId: string, leadName: string, fromStatus: string, toStatus: string) {
  await createNotification(
    userId,
    'lead_moved',
    `Lead em ${toStatus}`,
    `${leadName} moveu de ${fromStatus} para ${toStatus}`,
    {
      actionLabel: 'Ver funil',
      actionUrl: `/funnel`,
      leadId,
      metadata: { fromStatus, toStatus }
    }
  );
}

/**
 * Criar notificação de tarefa atrasada
 */
export async function notifyTaskOverdue(userId: string, taskId: string, taskTitle: string, daysOverdue: number) {
  await createNotification(
    userId,
    'task_overdue',
    'Tarefa atrasada',
    `${taskTitle} (atrasada há ${daysOverdue} ${daysOverdue === 1 ? 'dia' : 'dias'})`,
    {
      actionLabel: 'Ver tarefa',
      actionUrl: `/tasks`,
      taskId,
      metadata: { daysOverdue }
    }
  );
}

/**
 * Criar notificação de lembrete de follow-up
 */
export async function notifyTaskReminder(userId: string, taskId: string, taskTitle: string, scheduledTime: string) {
  await createNotification(
    userId,
    'task_reminder',
    'Follow-up agendado',
    taskTitle,
    {
      actionLabel: 'Marcar como feito',
      actionUrl: `/tasks`,
      taskId,
      metadata: { scheduledTime }
    }
  );
}

/**
 * Criar notificação de plano expirando
 */
export async function notifyPlanExpiring(userId: string, planName: string, expirationDate: string, daysRemaining: number) {
  await createNotification(
    userId,
    'plan_expiring',
    `Plano expira em ${daysRemaining} ${daysRemaining === 1 ? 'dia' : 'dias'}`,
    `Seu plano ${planName} expira em ${new Date(expirationDate).toLocaleDateString('pt-BR')}. Renove agora para continuar usando todas as funcionalidades.`,
    {
      actionLabel: 'Renovar',
      actionUrl: `/plan`,
      metadata: { planName, expirationDate, daysRemaining }
    }
  );
}

/**
 * Criar notificação de limite de leads atingido
 */
export async function notifyPlanLimit(userId: string, currentCount: number, maxCount: number, planName: string) {
  const percentage = Math.round((currentCount / maxCount) * 100);
  
  await createNotification(
    userId,
    'plan_limit',
    'Limite de leads atingido',
    `Você atingiu ${percentage}% do limite do seu plano (${currentCount}/${maxCount}). Considere fazer upgrade.`,
    {
      actionLabel: 'Upgrade',
      actionUrl: `/plan`,
      metadata: { currentCount, maxCount, planName, percentage }
    }
  );
}

/**
 * Criar notificação de boas-vindas
 */
export async function notifyWelcome(userId: string, userName: string) {
  await createNotification(
    userId,
    'welcome',
    `Bem-vindo ao LeadsFlow, ${userName}! 👋`,
    'Comece importando seus leads ou conectando suas integrações.',
    {
      actionLabel: 'Começar tour',
      actionUrl: `/dashboard`,
      metadata: { userName }
    }
  );
}

// ============================================
// VERIFICAÇÕES AUTOMÁTICAS (CRON)
// ============================================

/**
 * Verificar planos expirando e criar notificações
 * Executar diariamente
 */
export async function checkExpiringPlans() {
  try {
    console.log('[Notification] 🔍 Checking for expiring plans...');
    
    const users = await kv.getByPrefix('user:');
    let notificationCount = 0;

    for (const user of users) {
      if (!user?.planExpiration) continue;

      const expirationDate = new Date(user.planExpiration);
      const now = new Date();
      const daysRemaining = Math.ceil((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      // Notificar em 7, 3 e 1 dia antes
      if (daysRemaining === 7 || daysRemaining === 3 || daysRemaining === 1) {
        await notifyPlanExpiring(user.id, user.plan || 'Free', user.planExpiration, daysRemaining);
        notificationCount++;
      }
    }

    console.log(`[Notification] ✅ Created ${notificationCount} expiration notifications`);
    return notificationCount;
  } catch (error) {
    console.error('[Notification] Error checking expiring plans:', error);
    return 0;
  }
}

/**
 * Verificar limites de leads e criar notificações
 * Executar ao adicionar leads
 */
export async function checkLeadLimits(userId: string) {
  try {
    const user = await kv.get(`user:${userId}`);
    if (!user) return;

    const planLimits: Record<string, number> = {
      'Free': 100,
      'Business': 1000,
      'Enterprise': 10000
    };

    const maxLeads = planLimits[user.plan] || 100;
    const currentLeads = user.leadCount || 0;
    const percentage = (currentLeads / maxLeads) * 100;

    // Notificar em 90%, 95% e 100%
    if (percentage >= 90 && percentage < 95) {
      // Verificar se já notificou em 90%
      const existingNotif = await kv.get(`notification_sent:${userId}:limit_90`);
      if (!existingNotif) {
        await notifyPlanLimit(userId, currentLeads, maxLeads, user.plan);
        await kv.set(`notification_sent:${userId}:limit_90`, true);
      }
    } else if (percentage >= 95 && percentage < 100) {
      const existingNotif = await kv.get(`notification_sent:${userId}:limit_95`);
      if (!existingNotif) {
        await notifyPlanLimit(userId, currentLeads, maxLeads, user.plan);
        await kv.set(`notification_sent:${userId}:limit_95`, true);
      }
    } else if (percentage >= 100) {
      const existingNotif = await kv.get(`notification_sent:${userId}:limit_100`);
      if (!existingNotif) {
        await notifyPlanLimit(userId, currentLeads, maxLeads, user.plan);
        await kv.set(`notification_sent:${userId}:limit_100`, true);
      }
    }
  } catch (error) {
    console.error('[Notification] Error checking lead limits:', error);
  }
}
