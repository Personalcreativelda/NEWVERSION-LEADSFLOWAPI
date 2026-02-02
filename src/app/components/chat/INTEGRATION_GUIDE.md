# 🚀 Guia de Integração Rápida - Chat Assistant N8N

## ⚡ Setup em 5 Minutos

### **Passo 1: Importar Workflow no N8N**

1. Acesse seu N8N: `https://n8n.seudominio.com`
2. Clique em **Workflows** → **Import from File**
3. Selecione o arquivo `n8n-workflow-example.json`
4. Workflow "LeadsFlow - Chat Assistant" será criado

---

### **Passo 2: Configurar OpenAI (Opcional)**

Se quiser respostas inteligentes:

1. No N8N, vá em **Credentials** → **Add Credential**
2. Selecione **OpenAI API**
3. Cole sua API Key da OpenAI
4. Salve

**Sem OpenAI?** Remova o nó "OpenAI GPT-4" do workflow.

---

### **Passo 3: Ativar Webhook**

1. Abra o workflow importado
2. Clique no nó "Webhook"
3. Clique em **Test Workflow**
4. Copie a URL gerada (ex: `https://n8n.seudominio.com/webhook/chat-message`)

---

### **Passo 4: Configurar URL no Frontend**

Em `/components/chat/ChatWidget.tsx`, linha ~95:

```tsx
// ANTES:
const response = await fetch('https://YOUR_N8N_WEBHOOK_URL/webhook/chat-message', {

// DEPOIS:
const response = await fetch('https://n8n.seudominio.com/webhook/chat-message', {
```

---

### **Passo 5: Testar**

1. Abra sua aplicação LeadsFlow
2. Clique no botão do chat (canto inferior direito)
3. Digite: "Como adiciono leads?"
4. Aguarde resposta do bot

✅ Se funcionar, parabéns! Seu chat está integrado com N8N!

---

## 🔧 Configurações Avançadas

### **Adicionar Autenticação ao Webhook**

#### **No N8N:**

1. Abra o workflow
2. Clique no nó "Webhook"
3. Em **Authentication**, selecione **Header Auth**
4. Defina:
   - **Name:** `Authorization`
   - **Value:** `Bearer SEU_TOKEN_SECRETO`

#### **No Frontend:**

```tsx
const response = await fetch('https://n8n.seudominio.com/webhook/chat-message', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer SEU_TOKEN_SECRETO' // ⬅️ Adicione isto
  },
  body: JSON.stringify({ ... })
});
```

---

### **Customizar Respostas**

#### **Editar Respostas Pré-definidas:**

1. No workflow, clique no nó "Response - Leads"
2. Edite o campo `response`
3. Edite o array `quickReplies`
4. Salve o workflow

Exemplo:
```json
{
  "response": "Sua resposta customizada aqui",
  "quickReplies": [
    {
      "text": "Botão 1",
      "action": "navigate:/pagina1"
    },
    {
      "text": "Botão 2",
      "action": "navigate:/pagina2"
    }
  ],
  "showSatisfaction": false
}
```

---

### **Adicionar Novas Intenções**

1. Adicione um novo nó **IF** após "Is About Support?"
2. Configure a condição (ex: mensagem contém "integração")
3. Adicione nó **Set** com a resposta
4. Conecte ao "Respond to Webhook"

Exemplo:
```
Is About Integration?
  ↓ TRUE
Response - Integration
  ↓
Respond to Webhook
```

---

### **Integrar com Banco de Dados**

Para salvar conversas:

1. Adicione nó **MySQL/PostgreSQL/MongoDB**
2. Insira após o "Webhook"
3. Configure:
   - **Operation:** Insert
   - **Table:** `chat_messages`
   - **Columns:** `user_id`, `message`, `timestamp`, `session_id`

```sql
CREATE TABLE chat_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(255),
  message TEXT,
  timestamp DATETIME,
  session_id VARCHAR(255)
);
```

---

### **Enviar Notificação para Equipe**

Quando usuário pede suporte humano:

1. Após "Response - Support", adicione nó **Send Email**
2. Configure:
   - **To:** `suporte@leadsflow.com`
   - **Subject:** `Novo ticket de suporte - {{$json.userName}}`
   - **Body:** 
     ```
     Usuário: {{$json.userName}}
     Mensagem: {{$json.message}}
     Sessão: {{$json.sessionId}}
     ```

Ou use **Slack/Telegram/Discord** em vez de email.

---

## 🎯 Casos de Uso Práticos

### **1. Detectar Urgência**

```javascript
// Nó "Function" após Webhook
const message = $input.item.json.message.toLowerCase();
const urgentWords = ['urgente', 'rápido', 'imediato', 'agora'];
const isUrgent = urgentWords.some(word => message.includes(word));

return {
  json: {
    ...$input.item.json,
    priority: isUrgent ? 'high' : 'normal'
  }
};
```

Se urgente, envie notificação push para equipe.

---

### **2. Rastrear Conversões**

```javascript
// Quando usuário clica em "Upgrade de Plano"
// Nó "Function":
const conversationData = {
  userId: $json.userId,
  intent: 'upgrade_plan',
  timestamp: new Date()
};

// Salvar no banco ou enviar para analytics
return { json: conversationData };
```

---

### **3. Personalizar por Plano**

```javascript
// Nó "Switch" baseado em plano
const userPlan = $json.context.userPlan;

switch(userPlan) {
  case 'free':
    return [{ json: { route: 'show_upgrade_message' } }];
  case 'professional':
    return [{ json: { route: 'show_professional_features' } }];
  case 'enterprise':
    return [{ json: { route: 'show_enterprise_support' } }];
}
```

---

### **4. Horário de Atendimento**

```javascript
// Nó "Function":
const now = new Date();
const hour = now.getHours();
const day = now.getDay(); // 0 = Sunday, 6 = Saturday

const isBusinessHours = (
  day >= 1 && day <= 5 && // Monday to Friday
  hour >= 9 && hour < 18   // 9 AM to 6 PM
);

return {
  json: {
    ...$input.item.json,
    isBusinessHours
  }
};
```

Se fora do horário:
```
"Nosso horário de atendimento é de segunda a sexta, das 9h às 18h.
Deixe sua mensagem que retornaremos em breve."
```

---

### **5. Limitar Taxa de Mensagens**

```javascript
// Nó "Function":
const userId = $json.userId;
const now = Date.now();

// Buscar último timestamp do usuário (do banco ou cache)
const lastMessage = await getLastMessageTime(userId);

if (lastMessage && (now - lastMessage < 1000)) {
  return {
    json: {
      response: "Por favor, aguarde 1 segundo antes de enviar outra mensagem.",
      quickReplies: []
    }
  };
}

// Salvar novo timestamp
await setLastMessageTime(userId, now);

return { json: $input.item.json };
```

---

## 🐛 Troubleshooting

### **Erro: "Failed to send message"**

**Causa:** URL do webhook incorreta ou N8N offline

**Solução:**
1. Verifique URL no `ChatWidget.tsx`
2. Teste o webhook diretamente:
   ```bash
   curl -X POST https://n8n.seudominio.com/webhook/chat-message \
     -H "Content-Type: application/json" \
     -d '{"userId":"test","message":"Olá"}'
   ```

---

### **Erro: CORS**

**Causa:** N8N bloqueando requisições do frontend

**Solução:**

No N8N, adicione headers CORS:

1. Adicione nó **Set** antes do "Respond to Webhook"
2. Configure:
   - **Add Field:** `headers`
   - **Value:**
     ```json
     {
       "Access-Control-Allow-Origin": "*",
       "Access-Control-Allow-Methods": "POST, OPTIONS",
       "Access-Control-Allow-Headers": "Content-Type, Authorization"
     }
     ```

---

### **Bot não responde**

**Causa:** Workflow não está ativo

**Solução:**
1. Abra o workflow no N8N
2. Clique em **Activate** (toggle no canto superior direito)
3. Certifique-se que está verde (ativo)

---

### **Respostas lentas**

**Causa:** OpenAI GPT-4 demora ~3-5 segundos

**Solução:**
1. Use GPT-3.5-turbo (mais rápido)
2. Ou adicione respostas pré-definidas para perguntas comuns

---

## 📊 Monitoramento

### **Ver Logs do N8N:**

1. Acesse **Executions** no N8N
2. Filtre por workflow "LeadsFlow - Chat Assistant"
3. Veja todas as execuções (sucesso/erro)

---

### **Dashboard de Métricas:**

Crie workflow separado para analytics:

```
[Webhook Chat Message]
  ↓
[Save to Database]
  ↓
[Google Sheets/Airtable]
```

Métricas úteis:
- Total de mensagens por dia
- Tempo médio de resposta
- Intenções mais comuns
- Taxa de satisfação
- Conversões (upgrades solicitados)

---

## 🎉 Pronto!

Seu chat está totalmente funcional e integrado com N8N.

**Próximos passos:**
1. ✅ Testar todas as funcionalidades
2. ✅ Personalizar respostas
3. ✅ Adicionar logo do bot
4. ✅ Configurar analytics
5. ✅ Treinar equipe de suporte

---

**Precisa de ajuda?** Consulte a documentação completa em `README.md`

**Desenvolvido para LeadsFlow API** 🚀
