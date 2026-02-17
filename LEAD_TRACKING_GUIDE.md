# 📊 Sistema de Rastreamento de Leads em Tempo Real

## 🎯 O Que Foi Implementado

Um sistema completo de rastreamento de leads que captura contatos de múltiplos canais (Telegram, WhatsApp Cloud, Instagram, WhatsApp) e permite acompanhar:

✅ **Captura de Leads** - Data e hora exata quando cada lead chega
✅ **Historico de Status** - Rastreamento completo de movimentações de leads
✅ **Rastreamento de Interações** - Cada mensagem e comunicação registrada
✅ **Estatísticas por Canal** - Desempenho de cada plataforma
✅ **Dashboard em Tempo Real** - Visualização dos leads capturados hoje

---

## 📁 Arquivos Criados/Modificados

### 1. **Migration de Banco de Dados**
```
api/src/database/migrations/010_lead_tracking.sql
```
Cria:
- Colunas em `leads`: `captured_at`, `channel_source`, `captured_by_channel_id`, `tracking_metadata`
- Tabela `lead_status_history` - histórico de mudanças de status
- Tabela `lead_interactions` - registro de todas as interações
- Views úteis para relatórios

### 2. **Serviço de Rastreamento**
```
api/src/services/lead-tracking.service.ts
```
Métodos principais:
- `recordLeadCapture()` - Registra quando um lead é capturado
- `recordStatusChange()` - Registra mudanças de status com histórico
- `recordInteraction()` - Registra mensagens, chamadas, emails, etc
- `getLeadsCapturedToday()` - Lista leads do dia
- `getLeadsStatsByChannel()` - Estatísticas por canal
- `getStatusHistory()` - Histórico de movimentações
- `getLeadInteractions()` - Todas as interações de um lead
- `getLeadMovementSummary()` - Resumo completo

### 3. **Rotas de Rastreamento**
```
api/src/routes/leads-tracking.routes.ts
```
Endpoints disponíveis:
- `GET /api/leads-tracking/captured-today` - Leads capturados hoje
- `GET /api/leads-tracking/stats/by-channel` - Estatísticas por canal
- `GET /api/leads-tracking/:leadId/history` - Histórico de status
- `GET /api/leads-tracking/:leadId/interactions` - Interações do lead
- `GET /api/leads-tracking/:leadId/summary` - Resumo completo

### 4. **Webhooks para Novos Canais**
```
api/src/routes/webhooks.routes.ts
```
Adicionado suporte para:
- **Telegram** (`/api/webhooks/telegram/messages`)
- **Instagram DM** (`/api/webhooks/instagram/messages`)
- **WhatsApp Cloud API** (`/api/webhooks/whatsapp-cloud/messages`)
- Cada webhook cria automaticamente leads e registra interações

### 5. **Atualização de Leads Existentes**
```
api/src/routes/leads.routes.ts
```
- Modificado: Auto-registra mudanças de status
- Ao atualizar um lead, o sistema registra no histórico automaticamente

### 6. **Dashboard React**
```
src/app/components/LeadsTrackingDashboard.tsx
```
Componente com:
- Cards de estatísticas rápidas
- Tabela com leads capturados hoje
- Desempenho por canal
- Modal com detalhes do lead
- Auto-refresh a cada 30 segundos

---

## 🚀 Como Usar

### Via API - Leads Capturados Hoje

```bash
# Obter todos os leads capturados hoje
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://seu-api.com/api/leads-tracking/captured-today

# Com filtros
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "https://seu-api.com/api/leads-tracking/captured-today?channelSource=whatsapp&status=novo"
```

### Via API - Estatísticas por Canal

```bash
# Últimos 7 dias (padrão)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://seu-api.com/api/leads-tracking/stats/by-channel

# Últimos 30 dias
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://seu-api.com/api/leads-tracking/stats/by-channel?days=30
```

### Via API - Histórico de Status de um Lead

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://seu-api.com/api/leads-tracking/LEAD_ID/history
```

Resposta:
```json
{
  "success": true,
  "count": 3,
  "data": [
    {
      "id": "uuid",
      "lead_id": "uuid",
      "old_status": "novo",
      "new_status": "contatado",
      "reason": "Manual update via API",
      "created_at": "2025-02-16T10:30:00Z"
    },
    ...
  ]
}
```

### Via API - Interações de um Lead

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://seu-api.com/api/leads-tracking/LEAD_ID/interactions
```

### Via API - Resumo Completo

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://seu-api.com/api/leads-tracking/LEAD_ID/summary
```

Resposta:
```json
{
  "success": true,
  "data": {
    "lead": {
      "id": "uuid",
      "status": "contatado",
      "capturedAt": "2025-02-16T09:15:00Z",
      "channelSource": "whatsapp"
    },
    "statusHistory": [...],
    "interactions": [...],
    "summary": {
      "totalStatusChanges": 2,
      "totalInteractions": 5,
      "messagesSent": 2,
      "messagesReceived": 3,
      "daysActive": 1
    }
  }
}
```

### No Dashboard React

1. Importe o componente:
```tsx
import LeadsTrackingDashboard from './components/LeadsTrackingDashboard';

// Use em alguma página
export default function TrackingPage() {
  return <LeadsTrackingDashboard />;
}
```

2. O dashboard mostrará:
   - 📊 Cards com métricas rápidas
   - 📈 Desempenho por canal
   - 🎯 Lista de leads capturados hoje
   - 💬 Contador de interações
   - ⏰ Horário de captura

---

## 🔧 Configuração de Webhooks

### Telegram Bot

Um webhook pode receber mensagens do seu Telegram Bot:

```bash
curl -X POST https://seu-api.com/api/webhooks/telegram/messages \
  -H "Content-Type: application/json" \
  -H "X-Internal-User-Id: USER_ID_DA_APP" \
  -d '{
    "message": {
      "message_id": 123,
      "chat": {"id": 456},
      "text": "Olá",
      "from": {
        "id": 789,
        "first_name": "João"
      }
    }
  }'
```

### Instagram DM

```bash
curl -X POST https://seu-api.com/api/webhooks/instagram/messages \
  -H "Content-Type: application/json" \
  -H "X-Internal-User-Id: USER_ID_DA_APP" \
  -d '{
    "sender": {
      "id": "instagram_user_id",
      "name": "Maria Silva"
    },
    "message": {
      "text": "Oi, tudo bem?",
      "id": "msg_123"
    }
  }'
```

### WhatsApp Cloud API

Já suportado nativamente! O webhook automático em Evolution API já cria leads.

Para WhatsApp Cloud (não Evolution):

```bash
curl -X POST https://seu-api.com/api/webhooks/whatsapp-cloud/messages \
  -H "Content-Type: application/json" \
  -H "X-Internal-User-Id: USER_ID_DA_APP" \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "metadata": {
            "phone_number_id": "123"
          },
          "messages": [{
            "from": "5511999999999",
            "text": {"body": "Mensagem"},
            "id": "msg_id"
          }],
          "contacts": [{
            "profile": {"name": "Cliente"}
          }]
        }
      }]
    }]
  }'
```

---

## 📊 Exemplos de Casos de Uso

### 1. Relatório Diário de Capturas
```typescript
const today = await fetch('/api/leads-tracking/captured-today');
const data = await today.json();

console.log(`Leads capturados hoje: ${data.count}`);
data.data.forEach(lead => {
  console.log(`- ${lead.name} via ${lead.channel_source}`);
});
```

### 2. Monitorar Lead Específico
```typescript
const summary = await fetch('/api/leads-tracking/LEAD_ID/summary');
const data = await summary.json();

console.log(`Status: ${data.data.lead.status}`);
console.log(`Mensagens: ${data.data.summary.totalInteractions}`);
console.log(`Ativo há: ${data.data.summary.daysActive} dias`);
```

### 3. Analisar Desempenho de Canais
```typescript
const stats = await fetch('/api/leads-tracking/stats/by-channel?days=30');
const data = await stats.json();

data.data.forEach(channel => {
  const conversionRate = (channel.byStatus.convertido / channel.total * 100).toFixed(1);
  console.log(`${channel.channel}: ${conversionRate}% conversão`);
});
```

### 4. Integração com Automação
```typescript
// Quando um lead chega via Telegram
await fetch('/api/leads-tracking/LEAD_ID/interactions', {
  method: 'POST',
  body: JSON.stringify({
    type: 'message_received',
    content: 'Olá, tudo bem?',
    details: { platform: 'telegram' }
  })
});

// Sistema pode enviar notificação automática
// Dispara automação no N8N
// Cria task no seu CRM
```

---

## 🔍 Campos de Rastreamento

### Tabela `lead_status_history`
- `id` - UUID único
- `lead_id` - Referência ao lead
- `user_id` - Proprietário
- `old_status` - Status anterior
- `new_status` - Novo status
- `reason` - Por que mudou
- `metadata` - JSON com detalhes
- `created_at` - Quando mudou

### Tabela `lead_interactions`
- `id` - UUID único
- `lead_id` - Referência ao lead
- `conversation_id` - Parte de qual conversa
- `channel_id` - Qual canal
- `interaction_type` - Tipo (message_received, message_sent, status_changed, call, email, etc)
- `direction` - in/out
- `content` - Texto da interação
- `details` - JSON com metadados
- `created_at` - Quando ocorreu

### Adições em `leads`
- `captured_at` - Quando o lead chegou (hoje para novos)
- `channel_source` - Canal específico (whatsapp, telegram, instagram, etc)
- `captured_by_channel_id` - ID do channel que capturou
- `tracking_metadata` - JSON com detalhes da captura
- `first_status_change_at` - Quando mudou de status pela primeira vez

---

## 📱 Canais Suportados

| Canal | Tipo | Webhook | Automático | Status |
|-------|------|---------|-----------|---------|
| WhatsApp | Evolution API | ✅ Nativo | ✅ Sim | ✅ Ativo |
| WhatsApp Cloud | Cloud API | ✅ Custom | ⭕ Configurável | ✅ Ativo |
| Telegram | Bot API | ✅ Custom | ⭕ Configurável | ✅ Ativo |
| Instagram | Graph API | ✅ Custom | ⭕ Configurável | ✅ Ativo |
| Email | SMTP/API | ✅ Custom | ⭕ Configurável | ✅ Planejado |

---

## 🎯 Próximos Passos Sugeridos

1. **Configurar Webhooks** nos seus canais (Telegram Bot, Instagram Graph API, etc)
2. **Criar Automações** que disparam quando leads chegam de canais específicos
3. **Enviar Notificações** em tempo real quando novo lead chega
4. **Integrar com N8N/Make** para ações automáticas
5. **Criar Relatórios** personalizados com os dados de rastreamento

---

## 💡 Dicas de Performance

1. A tabela `lead_interactions` pode crescer rapidamente - considere índices em `created_at` e `interaction_type`
2. Use `limit` e `offset` ao buscar leads para grandes volumes
3. O dashboard auto-refresh a cada 30s - ajuste ao seu gosto
4. Considere arquivar interações antigas periodicamente

---

## 🆘 Troubleshooting

**Leads não aparecem como "capturados hoje"**
- Verifique se `captured_at` está sendo definido corretamente
- Confirme que o timezone está correto no banco de dados

**Webhooks não recebem mensagens**
- Valide que a `X-Internal-User-Id` é enviada corretamente
- Verifique logs do servidor para erros

**Status não aparece no histórico**
- Confirme que há mudança real de status
- Verifique se `old_status != new_status`

---

Implementado com ❤️ para rastreamento profissional de leads!
