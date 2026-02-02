# 📋 Sistema de Tarefas e Lembretes - LeadsFlow API

## 📋 Visão Geral

Sistema completo de gerenciamento de tarefas e lembretes integrado com notificações automáticas. Ideal para acompanhamento de follow-ups, reuniões e atividades relacionadas aos leads.

---

## 🎯 Tipos de Tarefas

| Tipo | Descrição | Ícone |
|------|-----------|-------|
| `follow_up` | Follow-up com lead | 📞 |
| `meeting` | Reunião agendada | 🤝 |
| `call` | Ligar para lead | ☎️ |
| `email` | Enviar email | ✉️ |
| `whatsapp` | Enviar WhatsApp | 💬 |
| `proposal` | Enviar proposta | 📄 |
| `general` | Tarefa geral | 📋 |

---

## 🏷️ Status de Tarefas

| Status | Descrição |
|--------|-----------|
| `pending` | Pendente (padrão) |
| `completed` | Concluída |
| `cancelled` | Cancelada |

---

## ⚡ Prioridades

| Prioridade | Descrição |
|------------|-----------|
| `urgent` | 🔴 Urgente |
| `high` | 🟠 Alta |
| `medium` | 🟡 Média |
| `low` | 🟢 Baixa |

---

## 🚀 Endpoints Disponíveis

### **1. Buscar Todas as Tarefas**
```http
GET /make-server-4be966ab/tasks?status=pending&leadId=lead_123&includeCompleted=false
Authorization: Bearer {access_token}
```

**Query Params:**
- `status` (opcional): `pending` | `completed` | `cancelled`
- `leadId` (opcional): Filtrar por lead específico
- `includeCompleted` (opcional): `true` | `false` (padrão: `false`)

**Response:**
```json
{
  "success": true,
  "tasks": [
    {
      "id": "task_123",
      "userId": "user_123",
      "leadId": "lead_456",
      "type": "follow_up",
      "title": "Ligar para João Silva",
      "description": "Fazer follow-up da proposta enviada",
      "status": "pending",
      "priority": "high",
      "dueDate": "2025-01-20T10:00:00Z",
      "createdAt": "2025-01-15T08:00:00Z",
      "updatedAt": "2025-01-15T08:00:00Z",
      "reminderSent": false,
      "overdueNotificationSent": false
    }
  ],
  "count": 1
}
```

---

### **2. Buscar Estatísticas**
```http
GET /make-server-4be966ab/tasks/stats
Authorization: Bearer {access_token}
```

**Response:**
```json
{
  "success": true,
  "stats": {
    "total": 25,
    "pending": 10,
    "completed": 14,
    "overdue": 3,
    "today": 5
  }
}
```

---

### **3. Buscar Tarefas Atrasadas**
```http
GET /make-server-4be966ab/tasks/overdue
Authorization: Bearer {access_token}
```

**Response:**
```json
{
  "success": true,
  "tasks": [...],
  "count": 3
}
```

---

### **4. Buscar Tarefas de Hoje**
```http
GET /make-server-4be966ab/tasks/today
Authorization: Bearer {access_token}
```

**Response:**
```json
{
  "success": true,
  "tasks": [...],
  "count": 5
}
```

---

### **5. Buscar Tarefa Específica**
```http
GET /make-server-4be966ab/tasks/{taskId}
Authorization: Bearer {access_token}
```

---

### **6. Criar Nova Tarefa**
```http
POST /make-server-4be966ab/tasks
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "leadId": "lead_456",
  "type": "follow_up",
  "title": "Ligar para João Silva",
  "description": "Fazer follow-up da proposta enviada",
  "priority": "high",
  "dueDate": "2025-01-20T10:00:00Z"
}
```

**Campos Obrigatórios:**
- `title` (string)
- `type` (TaskType)
- `priority` (TaskPriority)
- `dueDate` (ISO timestamp)

**Campos Opcionais:**
- `leadId` (string)
- `description` (string)
- `metadata` (any)

**Response:**
```json
{
  "success": true,
  "task": { ... }
}
```

---

### **7. Atualizar Tarefa**
```http
PUT /make-server-4be966ab/tasks/{taskId}
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "title": "Novo título",
  "priority": "urgent",
  "dueDate": "2025-01-21T10:00:00Z"
}
```

---

### **8. Completar Tarefa**
```http
PUT /make-server-4be966ab/tasks/{taskId}/complete
Authorization: Bearer {access_token}
```

**Response:**
```json
{
  "success": true,
  "message": "Task completed",
  "task": { ... }
}
```

---

### **9. Deletar Tarefa**
```http
DELETE /make-server-4be966ab/tasks/{taskId}
Authorization: Bearer {access_token}
```

---

### **10. Verificar Tarefas Atrasadas (CRON)**
```http
POST /make-server-4be966ab/tasks/check-overdue
```

**Uso:** Executar diariamente via cron job para criar notificações de tarefas atrasadas.

**Response:**
```json
{
  "success": true,
  "message": "Checked overdue tasks, created 5 notifications",
  "count": 5
}
```

---

### **11. Verificar Lembretes (CRON)**
```http
POST /make-server-4be966ab/tasks/check-upcoming
```

**Uso:** Executar a cada hora para enviar lembretes de tarefas que vencem nas próximas 24h.

**Response:**
```json
{
  "success": true,
  "message": "Checked upcoming tasks, created 3 reminder notifications",
  "count": 3
}
```

---

## 🔔 Integração com Notificações

### **Notificações Automáticas:**

#### **1. Tarefa Atrasada**
- **Trigger:** CRON diário executando `/tasks/check-overdue`
- **Quando:** Tarefa passou da data de vencimento e ainda está `pending`
- **Frequência:** Uma vez por tarefa (flag `overdueNotificationSent`)

```typescript
// Notificação criada automaticamente
{
  type: 'task_overdue',
  title: 'Tarefa atrasada',
  message: 'Ligar para João Silva (atrasada há 2 dias)',
  actionLabel: 'Ver tarefa',
  actionUrl: '/tasks',
  taskId: 'task_123'
}
```

---

#### **2. Lembrete de Tarefa**
- **Trigger:** CRON a cada hora executando `/tasks/check-upcoming`
- **Quando:** Tarefa vence nas próximas 24 horas
- **Frequência:** Uma vez por tarefa (flag `reminderSent`)

```typescript
// Notificação criada automaticamente
{
  type: 'task_reminder',
  title: 'Follow-up agendado',
  message: 'Ligar para João Silva',
  actionLabel: 'Marcar como feito',
  actionUrl: '/tasks',
  taskId: 'task_123'
}
```

---

## ⚙️ Configuração de CRON Jobs

### **1. Verificar Tarefas Atrasadas (Diariamente às 8h)**

No Supabase Dashboard:
```
Schedule: 0 8 * * *
URL: /make-server-4be966ab/tasks/check-overdue
Method: POST
```

Ou via curl:
```bash
# Adicionar ao cron (executar diariamente às 8h)
0 8 * * * curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/make-server-4be966ab/tasks/check-overdue
```

---

### **2. Verificar Lembretes (A cada hora)**

No Supabase Dashboard:
```
Schedule: 0 * * * *
URL: /make-server-4be966ab/tasks/check-upcoming
Method: POST
```

Ou via curl:
```bash
# Adicionar ao cron (executar a cada hora)
0 * * * * curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/make-server-4be966ab/tasks/check-upcoming
```

---

## 📊 Estrutura de Dados

### **Task Object:**
```typescript
interface Task {
  id: string;                       // task_timestamp_random
  userId: string;                   // User ID
  leadId?: string;                  // Lead relacionado (opcional)
  type: TaskType;                   // Tipo da tarefa
  title: string;                    // Título da tarefa
  description?: string;             // Descrição detalhada
  status: TaskStatus;               // Status atual
  priority: TaskPriority;           // Prioridade
  dueDate: string;                  // Data de vencimento (ISO)
  completedAt?: string;             // Data de conclusão (ISO)
  createdAt: string;                // Data de criação (ISO)
  updatedAt: string;                // Data de atualização (ISO)
  reminderSent?: boolean;           // Flag: lembrete enviado?
  overdueNotificationSent?: boolean;// Flag: notificação de atraso enviada?
  metadata?: any;                   // Metadados extras
}
```

### **Armazenamento KV:**
```
task:{userId}:{taskId} → Task object
```

---

## 🧪 Exemplos de Uso

### **1. Criar Tarefa de Follow-up**
```bash
curl -X POST \
  https://YOUR_PROJECT.supabase.co/functions/v1/make-server-4be966ab/tasks \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "leadId": "lead_123",
    "type": "follow_up",
    "title": "Follow-up com João Silva",
    "description": "Verificar interesse na proposta enviada",
    "priority": "high",
    "dueDate": "2025-01-20T14:00:00Z"
  }'
```

---

### **2. Listar Tarefas Pendentes**
```bash
curl -X GET \
  "https://YOUR_PROJECT.supabase.co/functions/v1/make-server-4be966ab/tasks?status=pending" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

### **3. Completar Tarefa**
```bash
curl -X PUT \
  https://YOUR_PROJECT.supabase.co/functions/v1/make-server-4be966ab/tasks/task_123/complete \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

### **4. Buscar Tarefas Atrasadas**
```bash
curl -X GET \
  https://YOUR_PROJECT.supabase.co/functions/v1/make-server-4be966ab/tasks/overdue \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

### **5. Ver Estatísticas**
```bash
curl -X GET \
  https://YOUR_PROJECT.supabase.co/functions/v1/make-server-4be966ab/tasks/stats \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## 💡 Casos de Uso

### **1. Follow-up Automático**
```typescript
// Ao criar um lead, agendar follow-up automático para 3 dias depois
const lead = await createLead({ ... });

await createTask(userId, {
  leadId: lead.id,
  type: 'follow_up',
  title: `Follow-up com ${lead.nome}`,
  priority: 'medium',
  dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
});
```

---

### **2. Sequência de Follow-ups**
```typescript
// Criar sequência de 3 follow-ups (dia 3, 7 e 14)
const followUpDays = [3, 7, 14];

for (const days of followUpDays) {
  await createTask(userId, {
    leadId: lead.id,
    type: 'follow_up',
    title: `Follow-up ${days} dias - ${lead.nome}`,
    priority: days <= 7 ? 'high' : 'medium',
    dueDate: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
  });
}
```

---

### **3. Lembrete de Reunião**
```typescript
// Criar lembrete de reunião
await createTask(userId, {
  leadId: lead.id,
  type: 'meeting',
  title: `Reunião com ${lead.nome}`,
  description: 'Apresentar proposta comercial',
  priority: 'urgent',
  dueDate: '2025-01-25T15:00:00Z',
  metadata: {
    meetingLink: 'https://meet.google.com/abc-defg-hij',
    participants: ['joao@empresa.com', 'maria@empresa.com']
  }
});
```

---

## 🎯 Workflow Completo

### **1. Usuário cria tarefa:**
```
POST /tasks → Task criada e salva no KV
```

---

### **2. CRON verifica lembretes (a cada hora):**
```
POST /tasks/check-upcoming
  → Busca tarefas que vencem em 24h
  → Envia notificação de lembrete
  → Marca reminderSent = true
```

---

### **3. Usuário vê notificação:**
```
GET /notifications
  → Notificação type: 'task_reminder'
  → Clica e navega para /tasks
```

---

### **4. Se tarefa atrasa, CRON notifica (diariamente):**
```
POST /tasks/check-overdue
  → Busca tarefas com dueDate < now e status = pending
  → Envia notificação de atraso
  → Marca overdueNotificationSent = true
```

---

### **5. Usuário completa tarefa:**
```
PUT /tasks/{id}/complete
  → Status = 'completed'
  → completedAt = now
```

---

## 📈 Dashboard Widgets (Sugestões)

### **Widget 1: Tarefas de Hoje**
```typescript
const todayTasks = await apiRequest('/tasks/today');
// Mostrar lista de tarefas do dia
```

---

### **Widget 2: Tarefas Atrasadas**
```typescript
const overdueTasks = await apiRequest('/tasks/overdue');
// Mostrar alerta vermelho se houver tarefas atrasadas
```

---

### **Widget 3: Estatísticas**
```typescript
const stats = await apiRequest('/tasks/stats');
// Mostrar cards: {pending} pendentes, {overdue} atrasadas, {completed} concluídas
```

---

## 🎨 UI Sugerida (Frontend)

### **Lista de Tarefas:**
```tsx
- [ ] 🔴 URGENTE - Follow-up João Silva (atrasada 2 dias)
- [ ] 🟠 ALTA - Reunião Maria Costa (hoje 15h)
- [ ] 🟡 MÉDIA - Enviar proposta Pedro Lima (amanhã)
- [x] ✅ CONCLUÍDA - Ligar para Ana Santos
```

---

### **Filtros:**
```
[Todas] [Hoje] [Atrasadas] [Por Lead] [Por Prioridade]
```

---

### **Formulário de Criação:**
```
Título: _______________________
Tipo: [Follow-up ▼]
Prioridade: [Alta ▼]
Data: [20/01/2025 10:00]
Lead: [João Silva ▼] (opcional)
Descrição: ___________________
```

---

## 🚀 Próximos Passos

### **Já Implementado:**
- ✅ CRUD completo de tarefas
- ✅ Sistema de notificações automáticas
- ✅ Verificação de tarefas atrasadas
- ✅ Lembretes de tarefas próximas
- ✅ Estatísticas e filtros
- ✅ Integração com leads

### **Melhorias Futuras:**
- [ ] Tarefas recorrentes (ex: follow-up semanal)
- [ ] Subtarefas / checklist
- [ ] Atribuição de tarefas para equipe
- [ ] Integração com Google Calendar
- [ ] Notificações push para tarefas urgentes
- [ ] Relatórios de produtividade

---

## 🎯 Resumo

**Status:** ✅ **SISTEMA TOTALMENTE FUNCIONAL**

**O que está funcionando:**
- ✅ Criação, edição e exclusão de tarefas
- ✅ Filtros por status, lead, data
- ✅ Estatísticas completas
- ✅ Notificações de tarefas atrasadas (via CRON)
- ✅ Lembretes de tarefas próximas (via CRON)
- ✅ Integração total com sistema de notificações
- ✅ Todas as rotas de API funcionando

**Para configurar:**
- ⚙️ Adicionar CRON jobs no Supabase (instruções acima)
- 🎨 Criar UI no frontend (opcional, mas recomendado)

---

**Desenvolvido para LeadsFlow API** 🚀
