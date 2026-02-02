/**
 * ✅ NOTIFICATION HELPERS
 * 
 * Funções para criar notificações relevantes ao funcionamento do CRM
 * Usar no backend quando eventos importantes acontecerem
 */

import { apiRequest } from './api';

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

interface CreateNotificationParams {
  type: NotificationType;
  title: string;
  message: string;
  actionLabel?: string;
  actionUrl?: string;
  metadata?: any;
}

/**
 * Criar notificação genérica
 */
export async function createNotification(params: CreateNotificationParams) {
  try {
    await apiRequest('/notifications', 'POST', params);
  } catch (error) {
    console.error('Failed to create notification:', error);
  }
}

/**
 * ✅ NOTIFICAÇÕES DE LEADS
 */

export async function notifyNewLead(leadName: string, source: string) {
  await createNotification({
    type: 'lead_new',
    title: 'Novo lead cadastrado',
    message: `${leadName} foi adicionado via ${source}`,
    actionLabel: 'Ver lead',
    actionUrl: '/leads',
  });
}

export async function notifyLeadRemoved(leadName: string, canUndo: boolean = false) {
  await createNotification({
    type: 'lead_removed',
    title: 'Lead removido',
    message: `${leadName} foi removido do sistema`,
    actionLabel: canUndo ? 'Desfazer' : undefined,
    actionUrl: canUndo ? '/leads?action=undo' : undefined,
  });
}

export async function notifyLeadConverted(leadName: string, value?: number) {
  const valueText = value ? ` no valor de R$ ${value.toLocaleString('pt-BR')}` : '';
  await createNotification({
    type: 'lead_converted',
    title: 'Lead convertido! 🎉',
    message: `${leadName} fechou negócio${valueText}`,
    actionLabel: 'Ver deal',
    actionUrl: '/leads?filter=converted',
  });
}

export async function notifyLeadMoved(leadName: string, stage: string) {
  await createNotification({
    type: 'lead_moved',
    title: `Lead em ${stage}`,
    message: `${leadName} moveu para ${stage}`,
    actionLabel: 'Ver funil',
    actionUrl: '/funnel',
  });
}

/**
 * ✅ NOTIFICAÇÕES DE PLANO
 */

export async function notifyPlanExpiring(daysLeft: number, planName: string) {
  await createNotification({
    type: 'plan_expiring',
    title: `Plano expira em ${daysLeft} dias`,
    message: `Seu plano ${planName} expira em breve. Renove agora para continuar usando todas as funcionalidades.`,
    actionLabel: 'Renovar',
    actionUrl: '/plan',
  });
}

export async function notifyPlanLimit(currentCount: number, limit: number, resource: string) {
  const percentage = Math.round((currentCount / limit) * 100);
  await createNotification({
    type: 'plan_limit',
    title: `Limite de ${resource} atingido`,
    message: `Você atingiu ${percentage}% do limite do seu plano (${currentCount}/${limit}). Considere fazer upgrade.`,
    actionLabel: 'Upgrade',
    actionUrl: '/plan',
  });
}

/**
 * ✅ NOTIFICAÇÕES DE TAREFAS
 */

export async function notifyTaskOverdue(taskName: string, leadName: string, daysOverdue: number) {
  await createNotification({
    type: 'task_overdue',
    title: 'Tarefa atrasada',
    message: `${taskName} para ${leadName} (atrasada há ${daysOverdue} dias)`,
    actionLabel: 'Ver tarefa',
    actionUrl: '/tasks',
  });
}

export async function notifyTaskReminder(taskName: string, leadName: string, time: string) {
  await createNotification({
    type: 'task_reminder',
    title: 'Follow-up agendado',
    message: `${taskName} para ${leadName} às ${time}`,
    actionLabel: 'Marcar como feito',
    actionUrl: '/tasks',
  });
}

/**
 * ✅ NOTIFICAÇÕES DO SISTEMA
 */

export async function notifyWelcome() {
  await createNotification({
    type: 'welcome',
    title: 'Bem-vindo ao LeadsFlow! 👋',
    message: 'Comece importando seus leads ou conectando suas integrações.',
    actionLabel: 'Começar tour',
    actionUrl: '/tour',
  });
}

export async function notifyTourAvailable() {
  await createNotification({
    type: 'tour',
    title: 'Tour guiado disponível',
    message: 'Conheça todas as funcionalidades da plataforma em 5 minutos.',
    actionLabel: 'Iniciar tour',
    actionUrl: '/tour',
  });
}

export async function notifySystemUpdate(version: string, features: string[]) {
  await createNotification({
    type: 'system_update',
    title: `Novidades v${version}`,
    message: features.join('\n• '),
    actionLabel: 'Ver novidades',
    actionUrl: '/changelog',
  });
}

/**
 * ✅ NOTIFICAÇÕES EM LOTE (Batch)
 * Para criar múltiplas notificações de uma vez
 */

export async function createBatchNotifications(notifications: CreateNotificationParams[]) {
  try {
    await apiRequest('/notifications/batch', 'POST', { notifications });
  } catch (error) {
    console.error('Failed to create batch notifications:', error);
  }
}

/**
 * ✅ EXEMPLOS DE USO
 * 
 * // Quando um novo lead for criado:
 * notifyNewLead('João Silva', 'WhatsApp');
 * 
 * // Quando um lead converter:
 * notifyLeadConverted('Maria Santos', 5000);
 * 
 * // Quando faltar 7 dias para expirar:
 * notifyPlanExpiring(7, 'Enterprise');
 * 
 * // Quando atingir 95% do limite:
 * notifyPlanLimit(950, 1000, 'leads');
 * 
 * // Tarefa atrasada:
 * notifyTaskOverdue('Ligar para cliente', 'Carlos Silva', 2);
 * 
 * // Bem-vindo (na criação da conta):
 * notifyWelcome();
 */
