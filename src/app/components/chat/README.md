# 🤖 Chat Assistente Virtual - LeadsFlow API

## 📋 Visão Geral

Sistema de chat profissional e moderno com design minimalista, preparado para integração com automação AI via N8N.

---

## ✨ Features Implementadas

### **1. Design Profissional**
- ✅ Header sem gradiente chamativo (background sólido #1E293B / #FFFFFF)
- ✅ Status online com tempo médio de resposta
- ✅ Botões de expandir/minimizar e limpar conversa
- ✅ Tema claro/escuro automático

### **2. Área de Mensagens**
- ✅ Mensagens do bot: fundo cinza claro, avatar do robô, alinhadas à esquerda
- ✅ Mensagens do usuário: fundo roxo/azul, sem avatar, alinhadas à direita
- ✅ Timestamp em todas as mensagens
- ✅ Indicadores de status (enviando, enviado, erro)
- ✅ Auto-scroll suave ao receber novas mensagens

### **3. Quick Replies / Sugestões**
- ✅ Botões de ação rápida após respostas do bot
- ✅ Navegação automática ao clicar (ex: "Ver Dashboard" → `/dashboard`)
- ✅ Ícones + texto
- ✅ Hover effect elegante

### **4. Input de Mensagem**
- ✅ Textarea auto-resize (até 120px de altura)
- ✅ Placeholder claro
- ✅ Botão anexar arquivo [📎]
- ✅ Botão gravar áudio [🎤] (preparado para implementação)
- ✅ Botão enviar [↗] (ativo só quando há texto)
- ✅ Enter para enviar, Shift+Enter para quebra de linha
- ✅ Contador de caracteres
- ✅ Hints visuais de atalhos de teclado

### **5. Estados e Feedback**
- ✅ Indicador "digitando..." com animação
- ✅ Mensagens com status de erro + botão reenviar
- ✅ Tratamento de falhas de conexão
- ✅ Feedback visual em todos os estados

### **6. Histórico de Conversas**
- ✅ Salva últimas 50 mensagens no localStorage
- ✅ Botão "Limpar conversa" com confirmação
- ✅ Scroll para ver conversas antigas
- ✅ Mensagem de boas-vindas ao iniciar

### **7. Satisfação (NPS)**
- ✅ Widget de avaliação com 5 emojis (😀 😊 😐 😕 😞)
- ✅ Aparece após determinados atendimentos
- ✅ Feedback visual ao selecionar
- ✅ Mensagem de agradecimento

### **8. Responsividade**
- ✅ Desktop: Widget 380x600px (canto inferior direito)
- ✅ Desktop expandido: 450x700px
- ✅ Mobile: Full-screen ao abrir
- ✅ Header fixo no topo, input fixo embaixo
- ✅ Área de mensagens scrollável

### **9. Acessibilidade**
- ✅ Navegação por teclado (Tab, Enter, Esc)
- ✅ ARIA labels em todos os botões
- ✅ Contraste adequado (WCAG AA)
- ✅ Foco visível nos elementos interativos

### **10. Integração N8N (Preparado)**
- ✅ Estrutura de dados pronta para webhook
- ✅ Context awareness (página atual, plano do usuário, etc.)
- ✅ Session ID único
- ✅ Tratamento de respostas do N8N
- ✅ Suporte a quick replies dinâmicas

---

## 🚀 Como Usar

### **Importar no App:**

```tsx
import { ChatWidget } from './components/chat/ChatWidget';

function App() {
  const navigate = useNavigate();
  
  return (
    <>
      {/* Seu conteúdo */}
      
      <ChatWidget 
        onNavigate={(url) => navigate(url)}
        userId={user?.id}
        userName={user?.name}
        userPlan={user?.planName}
        currentPage={location.pathname}
      />
    </>
  );
}
```

---

## 📂 Estrutura de Arquivos

```
/components/chat/
├── ChatWidget.tsx          # Componente principal
├── ChatMessage.tsx         # Mensagem individual (bot/user)
├── ChatInput.tsx           # Input com anexo/áudio/enviar
├── TypingIndicator.tsx     # Indicador "digitando..."
├── QuickReplies.tsx        # Botões de ação rápida
├── SatisfactionRating.tsx  # Widget de avaliação NPS
└── README.md               # Este arquivo
```

---

## 🔗 Integração com N8N

### **1. Criar Webhook no N8N**

No N8N, crie um workflow com:

**Trigger:** Webhook
- **HTTP Method:** POST
- **Path:** `/webhook/chat-message`
- **Authentication:** None (ou adicionar Bearer token)

---

### **2. Payload Enviado pelo Chat**

```json
{
  "userId": "user_123",
  "userName": "Ekson Cuamba",
  "message": "Como adiciono leads?",
  "timestamp": "2025-02-03T14:24:00Z",
  "sessionId": "session_abc123",
  "context": {
    "currentPage": "/dashboard",
    "userPlan": "enterprise"
  }
}
```

---

### **3. Resposta Esperada do N8N**

```json
{
  "response": "Para adicionar leads, você pode...",
  "quickReplies": [
    {
      "text": "Ver tutorial",
      "action": "navigate:/help/tutorial"
    },
    {
      "text": "Adicionar agora",
      "action": "navigate:/leads"
    }
  ],
  "showSatisfaction": false
}
```

**Campos:**
- `response` (string, obrigatório): Resposta do bot
- `quickReplies` (array, opcional): Botões de ação rápida
- `showSatisfaction` (boolean, opcional): Mostrar widget de NPS após esta mensagem

---

### **4. Configurar URL do Webhook**

Em `ChatWidget.tsx`, linha ~95, altere:

```tsx
const response = await fetch('https://YOUR_N8N_URL/webhook/chat-message', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ ... })
});
```

Para:
```tsx
const response = await fetch('https://n8n.seudominio.com/webhook/chat-message', {
  // ...
});
```

---

### **5. Exemplo de Workflow N8N**

```
[Webhook] 
  ↓
[Function: Processar Mensagem]
  ↓
[Switch: Detectar Intenção]
  ├─ "leads" → [Resposta: Como adicionar leads]
  ├─ "planos" → [Resposta: Informações de planos]
  ├─ "suporte" → [Resposta: Transferir para humano]
  └─ default → [OpenAI GPT-4] → [Resposta inteligente]
  ↓
[Function: Formatar Resposta]
  ↓
[Respond to Webhook]
```

---

### **6. Integração com OpenAI (Opcional)**

Para respostas inteligentes, adicione nó do OpenAI:

```javascript
// No N8N, nó "Function":
const userMessage = $input.item.json.message;
const context = $input.item.json.context;

return {
  json: {
    prompt: `
      Você é o assistente virtual do LeadsFlow, um CRM de gestão de leads.
      
      Contexto do usuário:
      - Página atual: ${context.currentPage}
      - Plano: ${context.userPlan}
      
      Pergunta do usuário: ${userMessage}
      
      Responda de forma profissional e objetiva.
    `
  }
};
```

---

## 🎨 Personalização

### **Mudar Cores:**

Em `ChatWidget.tsx`:

```tsx
// Header
className="bg-slate-800" // Altere para bg-purple-800, bg-blue-900, etc.

// Mensagens do usuário
className="bg-purple-600" // Altere para bg-blue-600, bg-green-600, etc.

// Botão principal
className="bg-purple-600" // Altere conforme a cor do tema
```

---

### **Mudar Tamanhos:**

```tsx
// Desktop normal
'bottom-6 right-6 w-[380px] h-[600px] rounded-2xl'

// Desktop expandido
'bottom-6 right-6 w-[450px] h-[700px] rounded-2xl'
```

---

### **Adicionar Logo do Bot:**

Substitua o ícone `MessageCircle` por uma imagem:

```tsx
// Em ChatWidget.tsx e ChatMessage.tsx:
<img src="/logo-bot.png" alt="Bot" className="h-8 w-8 rounded-full" />
```

---

## 🧪 Respostas Mock (Desenvolvimento)

O sistema já vem com respostas mock para testar sem N8N:

**Gatilhos:**
- Mensagem contém "lead" ou "adicionar" → Instruções sobre leads
- Mensagem contém "plano" ou "upgrade" → Informações de planos
- Mensagem contém "suporte" ou "humano" → Transferir para atendente
- Qualquer outra mensagem → Resposta genérica

**Para remover mock e usar N8N:**

Em `ChatWidget.tsx`, linha ~138, comente:

```tsx
// REMOVER ESTAS LINHAS:
// await new Promise(resolve => setTimeout(resolve, 1500));
// const botResponse = getMockResponse(content);

// E DESCOMENTAR:
const response = await sendToN8N(content);
const botResponse = response;
```

---

## 🔒 Segurança

### **1. Rate Limiting**

Adicione rate limiting para evitar spam:

```tsx
const [lastMessageTime, setLastMessageTime] = useState(0);

const handleSendMessage = async (content: string) => {
  const now = Date.now();
  if (now - lastMessageTime < 1000) {
    alert('Aguarde 1 segundo antes de enviar outra mensagem');
    return;
  }
  setLastMessageTime(now);
  
  // ... resto do código
};
```

---

### **2. Sanitização de Input**

Para produção, adicione sanitização:

```bash
npm install dompurify
```

```tsx
import DOMPurify from 'dompurify';

const sanitized = DOMPurify.sanitize(content);
```

---

### **3. Autenticação do Webhook**

No N8N, adicione autenticação:

```tsx
const response = await fetch('https://n8n.seudominio.com/webhook/chat-message', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer SEU_TOKEN_SECRETO'
  },
  body: JSON.stringify({ ... })
});
```

---

## 📊 Analytics e Tracking

### **Rastrear Mensagens:**

```tsx
const handleSendMessage = async (content: string) => {
  // Analytics
  if (window.gtag) {
    window.gtag('event', 'chat_message_sent', {
      message_length: content.length,
      user_id: userId
    });
  }
  
  // ... resto do código
};
```

---

### **Rastrear Satisfação:**

```tsx
const handleSatisfactionRating = (rating: number) => {
  // Analytics
  if (window.gtag) {
    window.gtag('event', 'chat_satisfaction_rating', {
      rating: rating,
      user_id: userId
    });
  }
  
  console.log('User rated satisfaction:', rating);
  setShowSatisfaction(false);
};
```

---

## 🐛 Troubleshooting

### **Chat não abre:**
- Verifique se `ChatWidget` está importado no componente principal
- Verifique console do navegador por erros

### **Mensagens não enviam:**
- Verifique URL do webhook N8N
- Verifique CORS no N8N (deve permitir origem do frontend)
- Veja logs no console

### **Histórico não salva:**
- Verifique se localStorage está habilitado
- Limpe cache do navegador

### **Quick replies não navegam:**
- Verifique se `onNavigate` está passado como prop
- Verifique se a função de navegação está correta

---

## 🎯 Roadmap

### **Próximas Features:**
- [ ] Anexo de arquivos funcional
- [ ] Gravação de áudio funcional
- [ ] Notificação de nova mensagem (quando chat fechado)
- [ ] Histórico de conversas no servidor
- [ ] Chat em grupo (transferir para equipe)
- [ ] Typing indicator real-time (WebSocket)
- [ ] Tradução automática
- [ ] Modo offline com queue

---

## 📖 Exemplos de Uso

### **1. Navegação Automática:**

```tsx
<ChatWidget 
  onNavigate={(url) => {
    if (url.startsWith('http')) {
      window.open(url, '_blank');
    } else {
      navigate(url);
    }
  }}
/>
```

---

### **2. Contexto Dinâmico:**

```tsx
const [currentLead, setCurrentLead] = useState(null);

<ChatWidget 
  currentPage={location.pathname}
  userId={user?.id}
  userName={user?.name}
  userPlan={user?.planName}
  // Passar lead atual como contexto extra
  metadata={{ currentLead }}
/>
```

No N8N, você receberá:
```json
{
  "context": {
    "currentPage": "/leads/123",
    "userPlan": "enterprise",
    "metadata": {
      "currentLead": { "id": "123", "name": "João Silva" }
    }
  }
}
```

---

### **3. Iniciar Conversa Programaticamente:**

```tsx
// Adicione ref ao ChatWidget
const chatRef = useRef();

// Abrir chat e enviar mensagem
const openChatWithMessage = (message: string) => {
  chatRef.current?.open();
  chatRef.current?.sendMessage(message);
};

// Uso:
<button onClick={() => openChatWithMessage('Preciso de ajuda com leads')}>
  Ajuda Rápida
</button>
```

---

## 🎉 Conclusão

Chat totalmente funcional e pronto para integração com N8N. Design profissional, responsivo e acessível.

**Próximo passo:** Configurar webhook no N8N e conectar à URL.

---

**Desenvolvido para LeadsFlow API** 🚀
