# 🔔 Sistema de Notificações - LeadsFlow API

## 📋 Visão Geral

Sistema completo de notificações em tempo real para o LeadsFlow API. As notificações são criadas automaticamente baseadas em eventos do sistema e exibidas no sino de notificações no header.

---

## 🎯 Tipos de Notificações

| Tipo | Descrição | Ícone | Trigger Automático |
|------|-----------|-------|-------------------|
| `lead_new` | Novo lead cadastrado | 👤 | ✅ Ao criar lead |
| `lead_converted` | Lead convertido/ganho | 🎉 | ✅ Ao mudar status para "convertido" |
| `lead_moved` | Lead mudou de status | 📊 | ✅ Ao mudar status |
| `task_overdue` | Tarefa atrasada | ⏰ | ✅ CRON diário |
| `task_reminder` | Lembrete de follow-up | 📞 | ✅ CRON a cada hora |
| `plan_expiring` | Plano expirando | ⚠️ | ✅ CRON diário (7, 3, 1 dia antes) |
| `plan_limit` | Limite atingido | 📈 | ✅ Ao adicionar lead (90%, 95%, 100%) |
| `welcome` | Boas-vindas | 👋 | ✅ No signup |
| `system_update` | Atualizações do sistema | ✨ | Manual |

---

## 🚀 Endpoints Disponíveis

### **1. Buscar Notificações**
```http
GET /make-server-4be966ab/notifications
Authorization: Bearer {access_token}
```

**Response:**
```json
{
  "success": true,
  "notifications": [
    {
      "id": "notif_123",
      "userId": "user_123",
      "type": "lead_new",
      "title": "Novo lead cadastrado",
      "message": "João Silva foi adicionado via WhatsApp",
      "timestamp": "2025-01-15T10:30:00Z",
      "read": false,
      "actionLabel": "Ver lead",
      "actionUrl": "/leads",
      "leadId": "lead_456"
    }
  ],
  "count": 5,
  "unreadCount": 2
}
```

---

### **2. Marcar Como Lida**
```http
PUT /make-server-4be966ab/notifications/{notificationId}/read
Authorization: Bearer {access_token}
```

---

### **3. Marcar Todas Como Lidas**
```http
PUT /make-server-4be966ab/notifications/mark-all-read
Authorization: Bearer {access_token}
```

---

### **4. Deletar Notificação**
```http
DELETE /make-server-4be966ab/notifications/{notificationId}
Authorization: Bearer {access_token}
```

---

### **5. Limpar Todas**
```http
DELETE /make-server-4be966ab/notifications/clear-all
Authorization: Bearer {access_token}
```

---

### **6. Verificar Planos Expirando (CRON)**
```http
POST /make-server-4be966ab/notifications/check-expiring-plans
```

**Uso:** Executar diariamente via cron job para verificar planos que expiram em 7, 3 ou 1 dia.

**Response:**
```json
{
  "success": true,
  "message": "Checked expiring plans, created 3 notifications",
  "count": 3
}
```

---

### **7. Criar Notificação de Teste**
```http
POST /make-server-4be966ab/notifications/test
Authorization: Bearer {access_token}
```

**Uso:** Para testar se o sistema está funcionando.

---

## 🔄 Notificações Automáticas Implementadas

### ✅ **1. Novo Lead (ATIVO)**
**Trigger:** Ao criar um novo lead via `POST /leads`
**Função:** `notifications.notifyNewLead(userId, leadId, leadName, source)`

```typescript
// Exemplo de uso (já implementado)
await notifications.notifyNewLead(
  user.id, 
  leadId, 
  'João Silva',
  'WhatsApp'
);
```

---

### ✅ **2. Lead Convertido (ATIVO)**
**Trigger:** Ao atualizar lead com `status: "convertido"` ou `status: "ganho"`
**Função:** `notifications.notifyLeadConverted(userId, leadId, leadName, value)`

```typescript
// Exemplo de uso (já implementado)
await notifications.notifyLeadConverted(
  user.id,
  leadId,
  'Maria Costa',
  5000 // R$ 5.000
);
```

---

### ✅ **3. Lead Movido no Funil (ATIVO)**
**Trigger:** Ao atualizar status do lead
**Função:** `notifications.notifyLeadMoved(userId, leadId, leadName, fromStatus, toStatus)`

```typescript
// Exemplo de uso (já implementado)
await notifications.notifyLeadMoved(
  user.id,
  leadId,
  'Pedro Lima',
  'Contato Inicial',
  'Negociação'
);
```

---

### ✅ **4. Limite de Leads (ATIVO)**
**Trigger:** Ao criar lead, verifica se atingiu 90%, 95% ou 100% do limite
**Função:** `notifications.checkLeadLimits(userId)`

```typescript
// Exemplo de uso (já implementado)
await notifications.checkLeadLimits(user.id);
```

---

### ✅ **5. Boas-vindas (ATIVO)**
**Trigger:** No signup de novo usuário
**Função:** `notifications.notifyWelcome(userId, userName)`

```typescript
// Exemplo de uso (já implementado)
await notifications.notifyWelcome(userId, 'João Silva');
```

---

### ✅ **6. Plano Expirando (ATIVO via CRON)**
**Trigger:** Cron diário executando `checkExpiringPlans()`
**Função:** `notifications.notifyPlanExpiring(userId, planName, expirationDate, daysRemaining)`

**Setup do Cron:**
```bash
# Adicionar ao cron (executar diariamente às 8h)
0 8 * * * curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/make-server-4be966ab/notifications/check-expiring-plans
```

---

## ✅ Notificações de Tarefas (IMPLEMENTADO)

### **1. Tarefa Atrasada (ATIVO)**
**Trigger:** CRON diário executando `POST /tasks/check-overdue`
**Função:** `notifications.notifyTaskOverdue(userId, taskId, taskTitle, daysOverdue)`

O sistema automaticamente:
1. Busca todas as tarefas pendentes com `dueDate < now`
2. Calcula quantos dias está atrasada
3. Cria notificação de alerta
4. Marca flag `overdueNotificationSent = true` para não duplicar

**Setup do Cron:**
```bash
# Executar diariamente às 8h
0 8 * * * curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/make-server-4be966ab/tasks/check-overdue
```

**Exemplo de notificação criada:**
```typescript
{
  type: 'task_overdue',
  title: 'Tarefa atrasada',
  message: 'Follow-up João Silva (atrasada há 2 dias)',
  actionLabel: 'Ver tarefa',
  actionUrl: '/tasks',
  taskId: 'task_123'
}
```

---

### **2. Lembrete de Follow-up (ATIVO)**
**Trigger:** CRON a cada hora executando `POST /tasks/check-upcoming`
**Função:** `notifications.notifyTaskReminder(userId, taskId, taskTitle, scheduledTime)`

O sistema automaticamente:
1. Busca todas as tarefas que vencem nas próximas 24 horas
2. Envia lembrete antecipado
3. Marca flag `reminderSent = true` para não duplicar

**Setup do Cron:**
```bash
# Executar a cada hora
0 * * * * curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/make-server-4be966ab/tasks/check-upcoming
```

**Exemplo de notificação criada:**
```typescript
{
  type: 'task_reminder',
  title: 'Follow-up agendado',
  message: 'Follow-up João Silva',
  actionLabel: 'Marcar como feito',
  actionUrl: '/tasks',
  taskId: 'task_123'
}
```

**📖 Documentação Completa:** Ver `/supabase/functions/server/TASKS_README.md`

---

## 🎨 Frontend - NotificationBell Component

O componente `NotificationBell.tsx` já está totalmente integrado:

**Features:**
- ✅ Auto-refresh a cada 30 segundos
- ✅ Badge com contador de não lidas
- ✅ Agrupamento por data (Hoje, Ontem, Últimos 7 dias, Mais antigas)
- ✅ Priorização por tipo (tarefas atrasadas primeiro)
- ✅ Cores e ícones por tipo
- ✅ Navegação ao clicar (vai para a página correta)
- ✅ Ações rápidas (ver, marcar como lida, remover)
- ✅ Tema claro/escuro automático

**Uso:**
```tsx
import { NotificationBell } from './components/dashboard/NotificationBell';

<NotificationBell onNavigate={(url) => navigate(url)} />
```

---

## 📊 Estrutura de Dados

### **Notification Object:**
```typescript
interface Notification {
  id: string;              // notif_timestamp_random
  userId: string;          // user ID
  type: NotificationType;  // Tipo da notificação
  title: string;           // Título curto
  message: string;         // Mensagem descritiva
  timestamp: string;       // ISO timestamp
  read: boolean;           // Lida ou não
  actionLabel?: string;    // Texto do botão (ex: "Ver lead")
  actionUrl?: string;      // URL para navegar (ex: "/leads")
  metadata?: any;          // Dados extras
  leadId?: string;         // ID do lead relacionado
  taskId?: string;         // ID da tarefa relacionada
}
```

### **Armazenamento KV:**
```
notification:{userId}:{notificationId} → Notification object
notification_sent:{userId}:limit_{90|95|100} → true (flag para não duplicar)
```

---

## 🧪 Testando o Sistema

### **1. Criar Notificação de Teste:**
```bash
curl -X POST \
  https://YOUR_PROJECT.supabase.co/functions/v1/make-server-4be966ab/notifications/test \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### **2. Criar Novo Lead (trigger automático):**
```bash
curl -X POST \
  https://YOUR_PROJECT.supabase.co/functions/v1/make-server-4be966ab/leads \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"nome": "João Teste", "email": "joao@test.com", "telefone": "+5511999999999"}'
```

### **3. Converter Lead (trigger automático):**
```bash
curl -X PUT \
  https://YOUR_PROJECT.supabase.co/functions/v1/make-server-4be966ab/leads/{leadId} \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "convertido", "valor": 5000}'
```

### **4. Verificar Planos Expirando:**
```bash
curl -X POST \
  https://YOUR_PROJECT.supabase.co/functions/v1/make-server-4be966ab/notifications/check-expiring-plans
```

---

## 🔧 Próximos Passos

### **Totalmente Implementado:**
1. ✅ Sistema base implementado
2. ✅ Notificações de leads (novo, convertido, movido)
3. ✅ Notificações de limites
4. ✅ Notificação de boas-vindas
5. ✅ **Sistema completo de tarefas** (`/tasks`)
6. ✅ **Notificações de tarefas atrasadas** (via CRON)
7. ✅ **Lembretes de follow-up** (via CRON)

### **Melhorias Futuras:**
- [ ] Notificações push (web push API)
- [ ] Notificações por email
- [ ] Preferências de notificações (quais tipos receber)
- [ ] Notificações em tempo real (WebSocket)
- [ ] Histórico de notificações antigas (arquivo)
- [ ] Tarefas recorrentes

---

## 🎯 Resumo

**Status:** ✅ **SISTEMA 100% COMPLETO E FUNCIONAL**

**O que está funcionando:**
- ✅ Criação automática de notificações nos eventos principais
- ✅ Notificações de novo lead
- ✅ Notificações de conversão de lead
- ✅ Notificações de mudança de status
- ✅ Notificações de limites (90%, 95%, 100%)
- ✅ Notificação de boas-vindas no signup
- ✅ Verificação de planos expirando (via cron)
- ✅ **Sistema completo de tarefas e lembretes**
- ✅ **Notificações de tarefas atrasadas (via cron)**
- ✅ **Lembretes automáticos de tarefas próximas (via cron)**
- ✅ Frontend completo com auto-refresh
- ✅ Navegação funcional
- ✅ Todas as rotas de CRUD

**CRON Jobs a configurar:**
1. ⚙️ `/notifications/check-expiring-plans` - Diariamente às 8h
2. ⚙️ `/tasks/check-overdue` - Diariamente às 8h
3. ⚙️ `/tasks/check-upcoming` - A cada hora

**Documentação Adicional:**
- 📖 Sistema de Tarefas: `/supabase/functions/server/TASKS_README.md`

---

**Desenvolvido para LeadsFlow API** 🚀