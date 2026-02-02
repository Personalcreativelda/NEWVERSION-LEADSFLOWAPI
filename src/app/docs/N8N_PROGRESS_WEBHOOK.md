# 📡 Configuração do Webhook de Progresso - N8N

## 🎯 Objetivo
Este webhook permite o rastreamento em tempo real do progresso de campanhas WhatsApp, retornando dados sobre mensagens enviadas, entregues, visualizadas e falhadas.

## 🔧 Configuração no N8N

### 1. Criar Workflow de Progresso

Crie um novo workflow no N8N com os seguintes nodes:

#### Node 1: Webhook Trigger
- **Tipo**: Webhook
- **Método**: GET
- **Path**: `/campaign-progress`
- **Response Mode**: Last Node
- **Response Code**: 200

#### Node 2: Get Campaign ID
```javascript
// Extrair campaignId dos query parameters
const campaignId = $('Webhook').item.json.query.campaignId;

if (!campaignId) {
  return {
    error: 'Campaign ID not provided'
  };
}

return {
  campaignId: campaignId
};
```

#### Node 3: Query Database (ou Storage)
- Consultar banco de dados ou arquivo de storage
- Buscar status da campanha pelo `campaignId`
- Exemplo de query SQL:
```sql
SELECT 
  campaign_id,
  total_recipients,
  sent_count,
  delivered_count,
  read_count,
  failed_count,
  pending_count,
  status,
  updated_at
FROM campaign_progress
WHERE campaign_id = :campaignId
```

#### Node 4: Calculate Progress
```javascript
const data = $('Query Database').item.json;

const sent = data.sent_count || 0;
const delivered = data.delivered_count || 0;
const read = data.read_count || 0;
const failed = data.failed_count || 0;
const pending = data.pending_count || 0;
const total = data.total_recipients || 0;

const progress = total > 0 ? Math.floor((sent / total) * 100) : 0;
const deliveryRate = sent > 0 ? Math.floor((delivered / sent) * 100) : 0;
const readRate = delivered > 0 ? Math.floor((read / delivered) * 100) : 0;

return {
  campaignId: data.campaign_id,
  totalRecipients: total,
  sent: sent,
  delivered: delivered,
  read: read,
  failed: failed,
  pending: pending,
  progress: progress,
  deliveryRate: deliveryRate,
  readRate: readRate,
  status: progress >= 100 ? 'completed' : data.status || 'active',
  lastUpdate: data.updated_at
};
```

#### Node 5: Return Response
- **Tipo**: Respond to Webhook
- **Response Body**: JSON do Node 4

### 2. Formato da Resposta

O webhook deve retornar um JSON no seguinte formato:

```json
{
  "campaignId": "campaign_1234567890",
  "totalRecipients": 100,
  "sent": 45,
  "delivered": 42,
  "read": 15,
  "failed": 3,
  "pending": 55,
  "progress": 45,
  "deliveryRate": 93,
  "readRate": 35,
  "status": "active",
  "lastUpdate": "2024-12-04T10:30:00Z"
}
```

### 3. Armazenar Progresso Durante o Envio

No workflow de envio em massa, adicione um node para atualizar o progresso:

```javascript
// Após cada mensagem enviada
const campaignId = $('Split In Batches').item.json.id;
const batchIndex = $('Split In Batches').context.batchIndex;

// Incrementar contador de enviadas
// UPDATE campaign_progress 
// SET sent_count = sent_count + 1,
//     updated_at = NOW()
// WHERE campaign_id = :campaignId
```

### 4. Rastrear Entregas e Visualizações

Configure webhooks da Evolution API para receber callbacks:

#### Webhook de Entrega
```json
{
  "event": "messages.update",
  "data": {
    "messageId": "msg_123",
    "status": "delivered",
    "campaignId": "campaign_1234567890"
  }
}
```

#### Webhook de Visualização
```json
{
  "event": "messages.update",
  "data": {
    "messageId": "msg_123",
    "status": "read",
    "campaignId": "campaign_1234567890"
  }
}
```

## 🔐 Configuração no LeadsFlow

1. Acesse **Configurações > Integrações > N8N**
2. Adicione a URL do webhook de progresso:
   ```
   https://seu-n8n.com/webhook/campaign-progress
   ```
3. Salve no localStorage como `n8n_progress_url`

## 📊 Como Funciona

1. **Simulação Local**: Se o webhook não estiver configurado, o sistema usa simulação baseada no tempo estimado
2. **Dados Reais**: Quando configurado, consulta o webhook a cada 10 segundos
3. **Atualização Automática**: A barra de progresso e os cards são atualizados em tempo real
4. **Conclusão Automática**: Quando `progress >= 100%`, a campanha é marcada como concluída

## 🎯 Vantagens

- ✅ **Rastreamento preciso** baseado em dados reais da Evolution API
- ✅ **Fallback inteligente** com simulação local quando API não disponível
- ✅ **Atualização em tempo real** sem refresh manual
- ✅ **Conclusão automática** quando todas as mensagens são enviadas
- ✅ **Dados de entrega** e visualização em tempo real

## 🔄 Exemplo de Fluxo Completo

1. Usuário cria campanha e clica em "Enviar Agora"
2. Campanha vai para status "active" com progress: 0%
3. N8N começa a enviar mensagens em lote
4. A cada mensagem enviada, atualiza `campaign_progress` table
5. LeadsFlow consulta `/campaign-progress?campaignId=xxx` a cada 10s
6. UI atualiza automaticamente: barra de progresso, enviadas, entregues, visualizadas
7. Quando `sent >= totalRecipients`, status muda para "completed"
8. Campanha aparece na seção "Campanhas Concluídas"

## 🐛 Troubleshooting

### Progresso não atualiza
- Verifique se a URL está salva em `localStorage.getItem('n8n_progress_url')`
- Teste o webhook manualmente: `GET https://seu-n8n.com/webhook/campaign-progress?campaignId=xxx`
- Veja os logs no console: `[CampaignsPage]`

### Dados inconsistentes
- Certifique-se de que o N8N está atualizando a tabela `campaign_progress`
- Verifique se o `campaignId` está sendo passado corretamente

### Campanha não conclui
- Verifique se o webhook retorna `progress: 100` quando concluído
- Ou se `sent + failed >= totalRecipients`
