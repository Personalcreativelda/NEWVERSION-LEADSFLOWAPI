# 🔧 Correção: Assistentes não funcionam no Evolution API

## Problema Identificado

O assistente de IA não estava respondendo mensagens no canal WhatsApp criado via **Evolution API**, embora funcionasse corretamente em outros canais.

### Causa Raiz

Quando o assistente era **conectado SEM selecionar canais específicos**, o sistema salvava:
- `channel_ids` = `[]` (array vazio)
- `channel_id` = `null`

Quando uma mensagem chegava via Evolution API, o webhook tentava buscar um assistente ativo usando:
```sql
AND ($2 = ANY(ua.channel_ids) OR ua.channel_id = $2)
```

Como o `channel_ids` estava vazio e `channel_id` era null, **nenhum assistente era encontrado**.

## Soluções Implementadas

### 1. ✅ Conexão Automática a Todos os Canais

**Arquivo**: `api/src/services/assistants.service.ts`

Quando o assistente é conectado **sem selecionar canais específicos**, o sistema agora:
1. Busca todos os canais ativos do usuário
2. Conecta o assistente a todos eles automaticamente
3. Mostra logs detalhados do que foi feito

```typescript
if (channelIdsArray.length === 0) {
    // Buscar todos os canais ativos e conectar a eles
    const channelsResult = await query(
        `SELECT id FROM channels WHERE user_id = $1 AND status IN ('active', 'connected')`,
        [userId]
    );
    channelIdsArray = channelsResult.rows.map((row: any) => row.id);
}
```

### 2. 🔍 Logs de Debug Detalhados

**Arquivo**: `api/src/services/assistant-processor.service.ts`

Quando uma mensagem chega, o sistema agora loga:
- Qual canal está sendo procurado
- Quais assistentes o usuário tem
- Por que o assistente foi (ou não) encontrado

Exemplo de log:
```
[AssistantProcessor] 🔍 Buscando assistente ativo para canal=abc123, userId=user456
[AssistantProcessor] DEBUG: Usuário tem 2 assistente(s):
  - ChatBot (ativo=true, channel_ids=["abc123","def456"], channel_id=abc123)
  - Support (ativo=false, channel_ids=[], channel_id=null)
```

**Arquivo**: `api/src/routes/webhooks.routes.ts`

Adicionado logs no webhook Evolution API:
```
[Evolution Webhook] 🤖 Acionando processador de assistente IA...
[Evolution Webhook]   - channelId: abc123
[Evolution Webhook]   - userId: user456
[Evolution Webhook]   - conversationId: conv789
```

### 3. 💡 Interface Melhorada

**Arquivo**: `src/app/components/pages/AssistantsPage.tsx`

Agora a interface mostra:
- Um aviso explicando o comportamento automático
- O botão de conectar mostra claramente "Conectar a todos os canais" quando nenhum é selecionado
- Mais claro para o usuário entender o que está acontecendo

## Como Usar

### Para Conectar um Novo Assistente

1. **Opção 1 (Recomendado)**: Deixe os canais em branco
   - O assistente será automaticamente conectado a TODOS os seus canais ativos
   - Se você criar um novo canal depois, reconecte o assistente

2. **Opção 2**: Selecione canais específicos
   - O assistente funcionará apenas nesses canais
   - Clique para selecionar os canais desejados

### Para Diagnosticar Problemas

1. **Verifique os logs** do servidor com o prefixo `[AssistantProcessor]`
2. **Verifique se o assistente está ativo**:
   - Vá para "Meus Assistentes"
   - O assistente deve aparecer como "ativo"
3. **Verifique os canais**:
   - Vá para "Canais"
   - O canal Evolution API deve estar com status "active" ou "connected"

## Checklist de Resolução

- [x] Identificar causa do problema
- [x] Adicionar logs de debug detalhados
- [x] Implementar conexão automática a todos os canais
- [x] Melhorar interface do usuário
- [x] Documentar a solução

## Próximas Melhorias Sugeridas

- [ ] Adicionar opção de reconectar automaticamente quando novo canal é criado
- [ ] Adicionar endpoint para reconectar assistente a canais específicos
- [ ] Interface para gerenciar quais canais cada assistente está conectado
- [ ] Notificação visual quando assistente fica sem canais ativos

## Referências

- **Assistentes**: `api/src/services/assistants.service.ts`
- **Processador de Mensagens**: `api/src/services/assistant-processor.service.ts`
- **Webhook Evolution**: `api/src/routes/webhooks.routes.ts` (linhas ~1000)
- **Interface**: `src/app/components/pages/AssistantsPage.tsx`

## Suporte

Se o assistente ainda não estiver funcionando:

1. **Verifique os logs** do servidor:
   ```
   grep -i "AssistantProcessor" server.log
   ```

2. **Verifique se o assistente está conectado**:
   - Base de dados: `SELECT * FROM user_assistants WHERE is_active = true`

3. **Verifique o canal**:
   - Base de dados: `SELECT * FROM channels WHERE type = 'whatsapp'`

4. **Teste com uma mensagem simples**:
   - Envie uma mensagem para o WhatsApp Evolution API
   - Verifique os logs para entender por que o assistente não respondeu
