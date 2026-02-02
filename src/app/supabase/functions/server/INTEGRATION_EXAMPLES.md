# 🔗 Exemplos de Integração - LeadsFlow API

## 📋 Visão Geral

Este guia mostra exemplos práticos de como integrar o sistema de notificações e tarefas em diferentes cenários do LeadsFlow.

---

## 🎯 Caso de Uso 1: Novo Lead com Follow-up Automático

### **Cenário:**
Quando um novo lead é cadastrado, criar automaticamente:
1. Notificação de novo lead
2. Tarefa de follow-up para 3 dias depois
3. Segunda tarefa de follow-up para 7 dias depois

### **Implementação:**

#### **No Backend (adicionar após criar o lead):**

```typescript
// Em: POST /make-server-4be966ab/leads
// Após linha: await kv.set(`lead:${user.id}:${leadId}`, lead);

// 1. Criar notificação de novo lead
await notifications.notifyNewLead(
  user.id,
  leadId,
  lead.nome || lead.name,
  lead.origem || lead.source
);

// 2. Criar tarefa de follow-up para 3 dias
const followUp3Days = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
await tasks.createTask(user.id, {
  leadId: leadId,
  type: 'follow_up',
  title: `Follow-up inicial - ${lead.nome}`,
  description: 'Fazer primeiro contato e verificar interesse',
  priority: 'high',
  dueDate: followUp3Days
});

// 3. Criar tarefa de follow-up para 7 dias
const followUp7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
await tasks.createTask(user.id, {
  leadId: leadId,
  type: 'follow_up',
  title: `Follow-up secundário - ${lead.nome}`,
  description: 'Se não respondeu ao primeiro contato, tentar novamente',
  priority: 'medium',
  dueDate: followUp7Days
});

console.log('[Lead] ✅ Created lead with automatic follow-up tasks');
```

---

## 🎯 Caso de Uso 2: Lead Frio → Reativar Automaticamente

### **Cenário:**
Se um lead fica 30 dias sem interação, criar notificação e tarefa de reativação.

### **Implementação:**

#### **Criar CRON Job Adicional:**
```typescript
// Em: /supabase/functions/server/tasks.tsx
// Adicionar nova função:

export async function checkInactiveLeads(): Promise<number> {
  try {
    console.log('[Task] 🔍 Checking for inactive leads...');
    
    const users = await kv.getByPrefix('user:');
    let taskCount = 0;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    for (const user of users) {
      if (!user?.id) continue;

      // Buscar leads do usuário
      const leads = await kv.getByPrefix(`lead:${user.id}:`);

      for (const lead of leads) {
        // Se lead não foi atualizado há 30 dias e não está convertido
        if (lead.status !== 'convertido' && lead.status !== 'perdido') {
          const lastUpdate = new Date(lead.updatedAt || lead.createdAt);
          
          if (lastUpdate < thirtyDaysAgo) {
            // Criar tarefa de reativação
            await createTask(user.id, {
              leadId: lead.id,
              type: 'follow_up',
              title: `Reativar lead: ${lead.nome}`,
              description: 'Lead inativo há 30 dias. Tentar reativar contato.',
              priority: 'low',
              dueDate: now.toISOString()
            });

            // Criar notificação
            await notifications.createNotification(
              user.id,
              'lead_moved',
              'Lead inativo detectado',
              `${lead.nome} está inativo há 30 dias. Tarefa de reativação criada.`,
              {
                actionLabel: 'Ver tarefa',
                actionUrl: '/tasks',
                leadId: lead.id
              }
            );

            taskCount++;
          }
        }
      }
    }

    console.log(`[Task] ✅ Created ${taskCount} reactivation tasks`);
    return taskCount;
  } catch (error) {
    console.error('[Task] Error checking inactive leads:', error);
    return 0;
  }
}
```

#### **Adicionar Rota:**
```typescript
// Em: /supabase/functions/server/index.tsx
// Adicionar junto com outras rotas de CRON:

app.post('/make-server-4be966ab/tasks/check-inactive-leads', async (c) => {
  try {
    console.log('[Tasks] 🕐 Running inactive leads check...');
    const count = await tasks.checkInactiveLeads();
    return c.json({ 
      success: true, 
      message: `Checked inactive leads, created ${count} reactivation tasks`,
      count 
    });
  } catch (error: any) {
    console.error('[Tasks] ❌ Error checking inactive leads:', error);
    return c.json({ 
      success: false, 
      error: error.message || 'Failed to check inactive leads' 
    }, 500);
  }
});
```

#### **Configurar CRON (semanal):**
```bash
# Executar toda segunda-feira às 9h
0 9 * * 1 curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/make-server-4be966ab/tasks/check-inactive-leads
```

---

## 🎯 Caso de Uso 3: Pipeline de Vendas com Tarefas Automáticas

### **Cenário:**
Ao mover lead para "Negociação", criar automaticamente:
1. Tarefa para enviar proposta (hoje)
2. Tarefa para follow-up da proposta (3 dias)
3. Tarefa para segunda tentativa (7 dias)

### **Implementação:**

#### **No Backend (ao atualizar lead):**
```typescript
// Em: PUT /make-server-4be966ab/leads/:leadId
// Após detectar mudança de status:

if (updates.status === 'negociacao' && existingLead.status !== 'negociacao') {
  // Lead entrou em negociação
  
  // 1. Tarefa imediata: enviar proposta
  await tasks.createTask(user.id, {
    leadId: leadId,
    type: 'proposal',
    title: `Enviar proposta para ${updatedLead.nome}`,
    description: 'Preparar e enviar proposta comercial personalizada',
    priority: 'urgent',
    dueDate: new Date().toISOString() // Hoje
  });

  // 2. Tarefa de follow-up (3 dias)
  const followUp3 = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  await tasks.createTask(user.id, {
    leadId: leadId,
    type: 'follow_up',
    title: `Follow-up proposta - ${updatedLead.nome}`,
    description: 'Verificar se recebeu a proposta e se tem dúvidas',
    priority: 'high',
    dueDate: followUp3.toISOString()
  });

  // 3. Tarefa de segunda tentativa (7 dias)
  const followUp7 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await tasks.createTask(user.id, {
    leadId: leadId,
    type: 'call',
    title: `Ligar para ${updatedLead.nome}`,
    description: 'Se não respondeu aos emails, tentar contato telefônico',
    priority: 'medium',
    dueDate: followUp7.toISOString()
  });

  console.log('[Lead] ✅ Created negotiation pipeline tasks');
}
```

---

## 🎯 Caso de Uso 4: Widget de Dashboard com Tarefas de Hoje

### **Cenário:**
Mostrar no dashboard as tarefas de hoje com prioridade visual.

### **Implementação Frontend:**

```tsx
// TodayTasks.tsx
import { useState, useEffect } from 'react';
import { apiRequest } from '../../utils/api';
import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';

interface Task {
  id: string;
  title: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  type: string;
  leadId?: string;
}

export function TodayTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTodayTasks();
  }, []);

  const loadTodayTasks = async () => {
    try {
      const data = await apiRequest('/tasks/today', 'GET');
      setTasks(data.tasks || []);
    } catch (error) {
      console.error('Failed to load today tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const completeTask = async (taskId: string) => {
    try {
      await apiRequest(`/tasks/${taskId}/complete`, 'PUT');
      await loadTodayTasks();
    } catch (error) {
      console.error('Failed to complete task:', error);
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'high':
        return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      case 'medium':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  if (loading) {
    return <div className="animate-pulse">Carregando tarefas...</div>;
  }

  if (tasks.length === 0) {
    return (
      <div className="text-center py-8">
        <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-2" />
        <p className="text-sm text-gray-600">
          Nenhuma tarefa para hoje! 🎉
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-lg font-semibold mb-4">
        📋 Tarefas de Hoje ({tasks.length})
      </h3>
      
      {tasks.map((task) => (
        <div
          key={task.id}
          className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 hover:shadow-md transition-shadow"
        >
          {getPriorityIcon(task.priority)}
          
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">
              {task.title}
            </p>
            <p className="text-xs text-gray-500">
              {task.type.replace('_', ' ').toUpperCase()}
            </p>
          </div>

          <button
            onClick={() => completeTask(task.id)}
            className="px-3 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600"
          >
            Concluir
          </button>
        </div>
      ))}
    </div>
  );
}
```

#### **Uso no Dashboard:**
```tsx
// Dashboard.tsx
import { TodayTasks } from './components/TodayTasks';

export function Dashboard() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Outras métricas */}
      
      <div className="col-span-1">
        <TodayTasks />
      </div>
    </div>
  );
}
```

---

## 🎯 Caso de Uso 5: Estatísticas de Produtividade

### **Cenário:**
Mostrar estatísticas de tarefas completadas vs pendentes.

### **Implementação Frontend:**

```tsx
// TaskStats.tsx
import { useState, useEffect } from 'react';
import { apiRequest } from '../../utils/api';
import { CheckCircle, Clock, AlertCircle, Calendar } from 'lucide-react';

interface Stats {
  total: number;
  pending: number;
  completed: number;
  overdue: number;
  today: number;
}

export function TaskStats() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const data = await apiRequest('/tasks/stats', 'GET');
      setStats(data.stats);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  if (!stats) return <div>Carregando...</div>;

  const completionRate = stats.total > 0 
    ? Math.round((stats.completed / stats.total) * 100) 
    : 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold mb-4">📊 Estatísticas de Tarefas</h3>
      
      <div className="grid grid-cols-2 gap-4">
        {/* Total */}
        <div className="flex items-center gap-3">
          <Calendar className="h-8 w-8 text-blue-500" />
          <div>
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-gray-500">Total</p>
          </div>
        </div>

        {/* Pendentes */}
        <div className="flex items-center gap-3">
          <Clock className="h-8 w-8 text-yellow-500" />
          <div>
            <p className="text-2xl font-bold">{stats.pending}</p>
            <p className="text-xs text-gray-500">Pendentes</p>
          </div>
        </div>

        {/* Completadas */}
        <div className="flex items-center gap-3">
          <CheckCircle className="h-8 w-8 text-green-500" />
          <div>
            <p className="text-2xl font-bold">{stats.completed}</p>
            <p className="text-xs text-gray-500">Completadas</p>
          </div>
        </div>

        {/* Atrasadas */}
        <div className="flex items-center gap-3">
          <AlertCircle className="h-8 w-8 text-red-500" />
          <div>
            <p className="text-2xl font-bold">{stats.overdue}</p>
            <p className="text-xs text-gray-500">Atrasadas</p>
          </div>
        </div>
      </div>

      {/* Barra de progresso */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600">Taxa de conclusão</span>
          <span className="text-sm font-bold text-gray-900">{completionRate}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-green-500 h-2 rounded-full transition-all"
            style={{ width: `${completionRate}%` }}
          />
        </div>
      </div>

      {/* Tarefas de hoje */}
      {stats.today > 0 && (
        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-800">
            📅 <strong>{stats.today}</strong> tarefa{stats.today > 1 ? 's' : ''} para hoje
          </p>
        </div>
      )}
    </div>
  );
}
```

---

## 🎯 Caso de Uso 6: Notificações em Tempo Real

### **Cenário:**
Atualizar notificações automaticamente quando eventos ocorrem.

### **Implementação:**

#### **Opção 1: Polling (já implementado):**
```tsx
// NotificationBell.tsx já tem auto-refresh a cada 30s
useEffect(() => {
  const interval = setInterval(loadNotifications, 30000);
  return () => clearInterval(interval);
}, []);
```

#### **Opção 2: Server-Sent Events (SSE):**
```typescript
// Backend: /supabase/functions/server/index.tsx
// Adicionar rota de SSE:

app.get('/make-server-4be966ab/notifications/stream', authMiddleware, async (c) => {
  const user = c.get('user');
  
  const stream = new ReadableStream({
    start(controller) {
      // Enviar notificações a cada 5 segundos
      const interval = setInterval(async () => {
        try {
          const notifications = await notifications.getUserNotifications(user.id);
          const unreadCount = notifications.filter(n => !n.read).length;
          
          controller.enqueue(
            `data: ${JSON.stringify({ unreadCount, notifications })}\n\n`
          );
        } catch (error) {
          console.error('SSE error:', error);
        }
      }, 5000);

      // Limpar ao desconectar
      return () => clearInterval(interval);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
});
```

#### **Frontend com SSE:**
```tsx
// useNotifications.ts
import { useState, useEffect } from 'react';

export function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem('leadflow_access_token');
    if (!token) return;

    // Conectar ao SSE
    const eventSource = new EventSource(
      `https://YOUR_PROJECT.supabase.co/functions/v1/make-server-4be966ab/notifications/stream`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    };

    eventSource.onerror = () => {
      console.error('SSE connection error');
      eventSource.close();
    };

    return () => eventSource.close();
  }, []);

  return { notifications, unreadCount };
}
```

---

## 🎯 Caso de Uso 7: Email de Resumo Diário

### **Cenário:**
Enviar email diário com resumo de tarefas pendentes.

### **Implementação:**

```typescript
// Em: /supabase/functions/server/tasks.tsx
// Adicionar função:

export async function sendDailySummary(): Promise<number> {
  try {
    console.log('[Task] 📧 Sending daily summary emails...');
    
    const users = await kv.getByPrefix('user:');
    let emailCount = 0;

    for (const user of users) {
      if (!user?.id || !user?.email) continue;

      // Buscar tarefas do dia
      const todayTasks = await getTodayTasks(user.id);
      const overdueTasks = await getOverdueTasks(user.id);

      if (todayTasks.length === 0 && overdueTasks.length === 0) {
        continue; // Não enviar email se não há tarefas
      }

      // Montar email
      const emailHtml = `
        <h2>📋 Resumo Diário - LeadsFlow</h2>
        <p>Olá ${user.name || 'usuário'},</p>
        
        ${overdueTasks.length > 0 ? `
          <h3>⚠️ Tarefas Atrasadas (${overdueTasks.length})</h3>
          <ul>
            ${overdueTasks.map(t => `<li>${t.title}</li>`).join('')}
          </ul>
        ` : ''}
        
        ${todayTasks.length > 0 ? `
          <h3>📅 Tarefas de Hoje (${todayTasks.length})</h3>
          <ul>
            ${todayTasks.map(t => `<li>${t.title}</li>`).join('')}
          </ul>
        ` : ''}
        
        <p><a href="https://YOUR_APP_URL/tasks">Ver todas as tarefas →</a></p>
      `;

      // Enviar email (usando serviço de email como SendGrid, AWS SES, etc.)
      // await sendEmail(user.email, 'Resumo Diário - LeadsFlow', emailHtml);
      
      emailCount++;
    }

    console.log(`[Task] ✅ Sent ${emailCount} daily summary emails`);
    return emailCount;
  } catch (error) {
    console.error('[Task] Error sending daily summary:', error);
    return 0;
  }
}
```

#### **CRON (diariamente às 7h):**
```bash
0 7 * * * curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/make-server-4be966ab/tasks/send-daily-summary
```

---

## 🎯 Conclusão

Estes exemplos mostram como integrar o sistema de notificações e tarefas em diversos cenários do LeadsFlow. Use como base e adapte conforme suas necessidades específicas.

### **Mais Exemplos:**
- Notificações de WhatsApp via Evolution API
- Integração com Google Calendar
- Dashboard de analytics
- Relatórios automatizados

---

**Desenvolvido para LeadsFlow API** 🚀
