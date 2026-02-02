// Tasks & Reminders System - LeadsFlow API
import * as kv from './kv_store.tsx';
import * as notifications from './notifications.tsx';

// ============================================
// TIPOS DE TAREFAS
// ============================================

export type TaskType = 
  | 'follow_up'      // 📞 Follow-up com lead
  | 'meeting'        // 🤝 Reunião agendada
  | 'call'           // ☎️ Ligar para lead
  | 'email'          // ✉️ Enviar email
  | 'whatsapp'       // 💬 Enviar WhatsApp
  | 'proposal'       // 📄 Enviar proposta
  | 'general';       // 📋 Tarefa geral

export type TaskStatus = 'pending' | 'completed' | 'cancelled';

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Task {
  id: string;
  userId: string;
  leadId?: string;           // Lead relacionado (opcional)
  type: TaskType;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;           // ISO timestamp
  completedAt?: string;      // ISO timestamp
  createdAt: string;         // ISO timestamp
  updatedAt: string;         // ISO timestamp
  reminderSent?: boolean;    // Flag se já enviou lembrete
  overdueNotificationSent?: boolean;  // Flag se já notificou atraso
  metadata?: any;
}

// ============================================
// CRUD DE TAREFAS
// ============================================

/**
 * Criar uma nova tarefa
 */
export async function createTask(
  userId: string,
  taskData: {
    leadId?: string;
    type: TaskType;
    title: string;
    description?: string;
    priority: TaskPriority;
    dueDate: string;
    metadata?: any;
  }
): Promise<Task> {
  const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date().toISOString();
  
  const task: Task = {
    id: taskId,
    userId,
    leadId: taskData.leadId,
    type: taskData.type,
    title: taskData.title,
    description: taskData.description,
    status: 'pending',
    priority: taskData.priority,
    dueDate: taskData.dueDate,
    createdAt: now,
    updatedAt: now,
    reminderSent: false,
    overdueNotificationSent: false,
    metadata: taskData.metadata,
  };

  await kv.set(`task:${userId}:${taskId}`, task);
  
  console.log(`[Task] ✅ Created task ${taskId} for user ${userId}`);
  
  return task;
}

/**
 * Buscar todas as tarefas de um usuário
 */
export async function getUserTasks(
  userId: string,
  filters?: {
    status?: TaskStatus;
    leadId?: string;
    includeCompleted?: boolean;
  }
): Promise<Task[]> {
  try {
    const tasks = await kv.getByPrefix(`task:${userId}:`);
    
    if (!tasks || tasks.length === 0) {
      return [];
    }

    let filtered = tasks;

    // Filtrar por status
    if (filters?.status) {
      filtered = filtered.filter((t: Task) => t.status === filters.status);
    } else if (!filters?.includeCompleted) {
      // Por padrão, não incluir completadas
      filtered = filtered.filter((t: Task) => t.status !== 'completed');
    }

    // Filtrar por lead
    if (filters?.leadId) {
      filtered = filtered.filter((t: Task) => t.leadId === filters.leadId);
    }

    // Ordenar por data de vencimento (mais próximas primeiro)
    return filtered.sort((a: Task, b: Task) => {
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });
  } catch (error) {
    console.error('[Task] Error fetching tasks:', error);
    return [];
  }
}

/**
 * Buscar uma tarefa específica
 */
export async function getTask(userId: string, taskId: string): Promise<Task | null> {
  try {
    const task = await kv.get(`task:${userId}:${taskId}`);
    return task || null;
  } catch (error) {
    console.error('[Task] Error fetching task:', error);
    return null;
  }
}

/**
 * Atualizar uma tarefa
 */
export async function updateTask(
  userId: string,
  taskId: string,
  updates: Partial<Task>
): Promise<Task | null> {
  try {
    const task = await getTask(userId, taskId);
    
    if (!task) {
      console.error('[Task] Task not found:', taskId);
      return null;
    }

    const updatedTask: Task = {
      ...task,
      ...updates,
      id: taskId,           // Preserve ID
      userId,               // Preserve user ID
      updatedAt: new Date().toISOString(),
    };

    // Se completou a tarefa, marcar timestamp
    if (updates.status === 'completed' && task.status !== 'completed') {
      updatedTask.completedAt = new Date().toISOString();
    }

    await kv.set(`task:${userId}:${taskId}`, updatedTask);
    
    console.log(`[Task] ✅ Updated task ${taskId}`);
    
    return updatedTask;
  } catch (error) {
    console.error('[Task] Error updating task:', error);
    return null;
  }
}

/**
 * Deletar uma tarefa
 */
export async function deleteTask(userId: string, taskId: string): Promise<boolean> {
  try {
    await kv.del(`task:${userId}:${taskId}`);
    console.log(`[Task] ✅ Deleted task ${taskId}`);
    return true;
  } catch (error) {
    console.error('[Task] Error deleting task:', error);
    return false;
  }
}

/**
 * Marcar tarefa como completa
 */
export async function completeTask(userId: string, taskId: string): Promise<Task | null> {
  return await updateTask(userId, taskId, { 
    status: 'completed',
    completedAt: new Date().toISOString()
  });
}

// ============================================
// VERIFICAÇÕES AUTOMÁTICAS (CRON)
// ============================================

/**
 * Verificar tarefas atrasadas e enviar notificações
 * Executar diariamente ou a cada hora
 */
export async function checkOverdueTasks(): Promise<number> {
  try {
    console.log('[Task] 🔍 Checking for overdue tasks...');
    
    const users = await kv.getByPrefix('user:');
    let notificationCount = 0;
    const now = new Date();

    for (const user of users) {
      if (!user?.id) continue;

      // Buscar tarefas pendentes do usuário
      const tasks = await getUserTasks(user.id, { status: 'pending' });

      for (const task of tasks) {
        const dueDate = new Date(task.dueDate);
        
        // Se a tarefa está atrasada e ainda não notificou
        if (dueDate < now && !task.overdueNotificationSent) {
          const daysOverdue = Math.ceil((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
          
          // Criar notificação
          await notifications.notifyTaskOverdue(
            user.id,
            task.id,
            task.title,
            daysOverdue
          );

          // Marcar como notificado para não duplicar
          await updateTask(user.id, task.id, { overdueNotificationSent: true });
          
          notificationCount++;
          console.log(`[Task] ⚠️ Notified overdue task: ${task.id} (${daysOverdue} days overdue)`);
        }
      }
    }

    console.log(`[Task] ✅ Created ${notificationCount} overdue notifications`);
    return notificationCount;
  } catch (error) {
    console.error('[Task] Error checking overdue tasks:', error);
    return 0;
  }
}

/**
 * Verificar tarefas com vencimento próximo e enviar lembretes
 * Executar várias vezes ao dia (ex: a cada 1 hora)
 */
export async function checkUpcomingTasks(): Promise<number> {
  try {
    console.log('[Task] 🔍 Checking for upcoming tasks...');
    
    const users = await kv.getByPrefix('user:');
    let notificationCount = 0;
    const now = new Date();
    
    // Lembretes para tarefas nas próximas 24 horas
    const reminderWindow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    for (const user of users) {
      if (!user?.id) continue;

      const tasks = await getUserTasks(user.id, { status: 'pending' });

      for (const task of tasks) {
        const dueDate = new Date(task.dueDate);
        
        // Se a tarefa vence nas próximas 24h e ainda não enviou lembrete
        if (dueDate > now && dueDate <= reminderWindow && !task.reminderSent) {
          // Criar notificação de lembrete
          await notifications.notifyTaskReminder(
            user.id,
            task.id,
            task.title,
            task.dueDate
          );

          // Marcar como lembrete enviado
          await updateTask(user.id, task.id, { reminderSent: true });
          
          notificationCount++;
          console.log(`[Task] 📞 Sent reminder for task: ${task.id}`);
        }
      }
    }

    console.log(`[Task] ✅ Created ${notificationCount} reminder notifications`);
    return notificationCount;
  } catch (error) {
    console.error('[Task] Error checking upcoming tasks:', error);
    return 0;
  }
}

/**
 * Buscar tarefas atrasadas de um usuário específico
 */
export async function getOverdueTasks(userId: string): Promise<Task[]> {
  const tasks = await getUserTasks(userId, { status: 'pending' });
  const now = new Date();
  
  return tasks.filter(task => new Date(task.dueDate) < now);
}

/**
 * Buscar tarefas do dia de um usuário
 */
export async function getTodayTasks(userId: string): Promise<Task[]> {
  const tasks = await getUserTasks(userId, { status: 'pending' });
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  
  return tasks.filter(task => {
    const dueDate = new Date(task.dueDate);
    return dueDate >= today && dueDate < tomorrow;
  });
}

/**
 * Estatísticas de tarefas de um usuário
 */
export async function getTaskStats(userId: string): Promise<{
  total: number;
  pending: number;
  completed: number;
  overdue: number;
  today: number;
}> {
  const allTasks = await kv.getByPrefix(`task:${userId}:`);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

  const pending = allTasks.filter((t: Task) => t.status === 'pending');
  const completed = allTasks.filter((t: Task) => t.status === 'completed');
  const overdue = pending.filter((t: Task) => new Date(t.dueDate) < now);
  const todayTasks = pending.filter((t: Task) => {
    const dueDate = new Date(t.dueDate);
    return dueDate >= today && dueDate < tomorrow;
  });

  return {
    total: allTasks.length,
    pending: pending.length,
    completed: completed.length,
    overdue: overdue.length,
    today: todayTasks.length,
  };
}
