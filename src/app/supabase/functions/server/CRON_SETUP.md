# ⏰ Configuração de CRON Jobs - LeadsFlow API

## 📋 Visão Geral

O sistema de notificações e tarefas do LeadsFlow requer 3 CRON jobs para funcionar completamente. Este guia mostra como configurá-los.

---

## 🚀 CRON Jobs Necessários

### **1. Verificar Planos Expirando** 
**Frequência:** 1x por dia (08:00)  
**Endpoint:** `POST /make-server-4be966ab/notifications/check-expiring-plans`  
**Função:** Notifica usuários 7, 3 e 1 dia antes do plano expirar

---

### **2. Verificar Tarefas Atrasadas**
**Frequência:** 1x por dia (08:00)  
**Endpoint:** `POST /make-server-4be966ab/tasks/check-overdue`  
**Função:** Cria notificações para tarefas que passaram do prazo

---

### **3. Verificar Lembretes de Tarefas**
**Frequência:** A cada hora (0 * * * *)  
**Endpoint:** `POST /make-server-4be966ab/tasks/check-upcoming`  
**Função:** Envia lembretes para tarefas que vencem nas próximas 24h

---

## ⚙️ Opção 1: Via Supabase Dashboard (Recomendado)

### **Passo 1: Acessar Edge Functions**
1. Acesse o [Supabase Dashboard](https://supabase.com/dashboard)
2. Selecione seu projeto
3. Vá em **Edge Functions** → **Cron Jobs**

---

### **Passo 2: Criar CRON de Planos Expirando**

**Configuração:**
```
Name: check-expiring-plans
Schedule: 0 8 * * *
URL: /functions/v1/make-server-4be966ab/notifications/check-expiring-plans
Method: POST
Headers: (vazio)
Body: (vazio)
```

**Explicação do Schedule:**
- `0` - Minuto 0
- `8` - Hora 8 (8h da manhã)
- `*` - Todos os dias
- `*` - Todos os meses
- `*` - Todos os dias da semana

---

### **Passo 3: Criar CRON de Tarefas Atrasadas**

**Configuração:**
```
Name: check-overdue-tasks
Schedule: 0 8 * * *
URL: /functions/v1/make-server-4be966ab/tasks/check-overdue
Method: POST
Headers: (vazio)
Body: (vazio)
```

---

### **Passo 4: Criar CRON de Lembretes**

**Configuração:**
```
Name: check-upcoming-tasks
Schedule: 0 * * * *
URL: /functions/v1/make-server-4be966ab/tasks/check-upcoming
Method: POST
Headers: (vazio)
Body: (vazio)
```

**Explicação do Schedule:**
- `0` - Minuto 0
- `*` - Toda hora
- `*` - Todos os dias
- `*` - Todos os meses
- `*` - Todos os dias da semana

---

## ⚙️ Opção 2: Via Serviço Externo (cron-job.org)

Se o Supabase não tiver CRON integrado, use um serviço externo:

### **1. Criar conta em [cron-job.org](https://cron-job.org)**

---

### **2. Adicionar Job 1: Planos Expirando**

```
Title: LeadsFlow - Check Expiring Plans
URL: https://YOUR_PROJECT_ID.supabase.co/functions/v1/make-server-4be966ab/notifications/check-expiring-plans
Schedule: Diariamente às 8:00
Method: POST
Save responses: Sim
Notification: Email on failure
```

---

### **3. Adicionar Job 2: Tarefas Atrasadas**

```
Title: LeadsFlow - Check Overdue Tasks
URL: https://YOUR_PROJECT_ID.supabase.co/functions/v1/make-server-4be966ab/tasks/check-overdue
Schedule: Diariamente às 8:00
Method: POST
Save responses: Sim
Notification: Email on failure
```

---

### **4. Adicionar Job 3: Lembretes**

```
Title: LeadsFlow - Check Upcoming Tasks
URL: https://YOUR_PROJECT_ID.supabase.co/functions/v1/make-server-4be966ab/tasks/check-upcoming
Schedule: A cada hora (no minuto 0)
Method: POST
Save responses: Sim
Notification: Email on failure
```

---

## ⚙️ Opção 3: Via Servidor Linux (crontab)

Se você tem um servidor Linux, adicione ao crontab:

### **1. Editar crontab:**
```bash
crontab -e
```

---

### **2. Adicionar os 3 jobs:**

```bash
# LeadsFlow API - Verificar planos expirando (diariamente às 8h)
0 8 * * * curl -X POST https://YOUR_PROJECT_ID.supabase.co/functions/v1/make-server-4be966ab/notifications/check-expiring-plans

# LeadsFlow API - Verificar tarefas atrasadas (diariamente às 8h)
0 8 * * * curl -X POST https://YOUR_PROJECT_ID.supabase.co/functions/v1/make-server-4be966ab/tasks/check-overdue

# LeadsFlow API - Verificar lembretes (a cada hora)
0 * * * * curl -X POST https://YOUR_PROJECT_ID.supabase.co/functions/v1/make-server-4be966ab/tasks/check-upcoming
```

---

### **3. Salvar e verificar:**
```bash
# Listar cron jobs
crontab -l

# Ver logs do cron
grep CRON /var/log/syslog
```

---

## 🧪 Testar os CRON Jobs

Antes de ativar, teste manualmente cada endpoint:

### **1. Testar Planos Expirando:**
```bash
curl -X POST https://YOUR_PROJECT_ID.supabase.co/functions/v1/make-server-4be966ab/notifications/check-expiring-plans
```

**Response esperada:**
```json
{
  "success": true,
  "message": "Checked expiring plans, created 0 notifications",
  "count": 0
}
```

---

### **2. Testar Tarefas Atrasadas:**
```bash
curl -X POST https://YOUR_PROJECT_ID.supabase.co/functions/v1/make-server-4be966ab/tasks/check-overdue
```

**Response esperada:**
```json
{
  "success": true,
  "message": "Checked overdue tasks, created 0 notifications",
  "count": 0
}
```

---

### **3. Testar Lembretes:**
```bash
curl -X POST https://YOUR_PROJECT_ID.supabase.co/functions/v1/make-server-4be966ab/tasks/check-upcoming
```

**Response esperada:**
```json
{
  "success": true,
  "message": "Checked upcoming tasks, created 0 reminder notifications",
  "count": 0
}
```

---

## 📊 Monitorar os CRON Jobs

### **Ver Logs no Supabase:**
1. Acesse **Edge Functions** → **Logs**
2. Filtre por função: `make-server-4be966ab`
3. Busque por:
   - `[Notification] 🕐 Running expiring plans check...`
   - `[Task] 🕐 Running overdue tasks check...`
   - `[Task] 🕐 Running upcoming tasks check...`

---

### **Monitorar via API:**
```bash
# Ver últimas notificações criadas
curl -X GET \
  https://YOUR_PROJECT_ID.supabase.co/functions/v1/make-server-4be966ab/notifications \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## 🔔 Como Saber se Está Funcionando?

### **1. Criar Plano que Expira em 7 Dias:**
```bash
# Editar usuário manualmente no KV store
# Definir planExpiresAt para 7 dias no futuro
```

Resultado: No próximo CRON (8h da manhã), deve criar notificação de plano expirando.

---

### **2. Criar Tarefa Atrasada:**
```bash
curl -X POST \
  https://YOUR_PROJECT_ID.supabase.co/functions/v1/make-server-4be966ab/tasks \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "follow_up",
    "title": "Teste Tarefa Atrasada",
    "priority": "high",
    "dueDate": "2025-01-01T10:00:00Z"
  }'
```

Resultado: No próximo CRON (8h da manhã), deve criar notificação de tarefa atrasada.

---

### **3. Criar Tarefa para Hoje:**
```bash
# Criar tarefa que vence em 2 horas
const in2Hours = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

curl -X POST \
  https://YOUR_PROJECT_ID.supabase.co/functions/v1/make-server-4be966ab/tasks \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"type\": \"meeting\",
    \"title\": \"Reunião Importante\",
    \"priority\": \"urgent\",
    \"dueDate\": \"${in2Hours}\"
  }"
```

Resultado: Na próxima hora cheia, deve criar notificação de lembrete.

---

## 🎯 Resumo da Configuração

### **Checklist:**
- [ ] CRON 1: Planos expirando (diariamente 8h) - CONFIGURADO
- [ ] CRON 2: Tarefas atrasadas (diariamente 8h) - CONFIGURADO
- [ ] CRON 3: Lembretes (a cada hora) - CONFIGURADO
- [ ] Teste manual dos 3 endpoints - PASSOU
- [ ] Criar dados de teste para validar - CRIADO
- [ ] Aguardar próximo CRON e verificar notificações - VALIDADO

---

## 🚨 Troubleshooting

### **CRON não está executando:**
1. Verificar se a URL está correta (incluir `/functions/v1/`)
2. Verificar se o método é `POST`
3. Verificar logs do Edge Function
4. Testar manualmente o endpoint

---

### **CRON executa mas não cria notificações:**
1. Verificar se existem dados para notificar (planos expirando, tarefas atrasadas, etc.)
2. Ver logs detalhados no console
3. Verificar se as flags anti-duplicação não estão bloqueando

---

### **Notificações duplicadas:**
1. As flags `overdueNotificationSent` e `reminderSent` devem estar funcionando
2. Verificar se não há múltiplos CRON configurados
3. Verificar frequência do CRON (não deve ser mais que 1x por dia para tarefas atrasadas)

---

## 📖 Documentação Relacionada

- **Notificações:** `/supabase/functions/server/NOTIFICATIONS_README.md`
- **Tarefas:** `/supabase/functions/server/TASKS_README.md`

---

**Desenvolvido para LeadsFlow API** 🚀
