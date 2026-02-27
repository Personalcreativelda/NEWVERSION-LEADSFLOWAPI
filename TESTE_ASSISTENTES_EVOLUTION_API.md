# ✅ Guia de Testes: Assistentes no Evolution API

## Resumo das Correções

Foram implementadas as seguintes correções:

1. ✅ **Conexão automática a todos os canais** quando assistente é conectado sem seleção específica
2. ✅ **Logs de debug detalhados** para diagnosticar problemas
3. ✅ **Interface melhorada** mostrando claramente o comportamento
4. ✅ **Reconexão automática** quando novo canal é criado
5. ✅ **Documentação completa** do problema e solução

---

## Teste 1: Conexão Automática (Recomendado)

### Passos:
1. Vá para **Assistentes de IA** → **Marketplace**
2. Selecione um assistente qualquer (ex: "Atendente de Suporte")
3. Clique em **"Conectar"**
4. **NÃO selecione nenhum canal** (deixe a lista vazia)
5. Clique em **"Conectar a todos os canais"**

### Resultado Esperado:
- Assistente aparecer em **"Meus Assistentes"** com status ativo
- Nos logs do servidor, ver:
  ```
  [Assistants] ℹ️ Nenhum canal especificado - conectando a TODOS os canais ativos do usuário
  [Assistants] ✅ Conectando a X canal(is) ativo(s)
  ```

### Teste de Funcionamento:
1. Abra uma conversa WhatsApp Evolution no **Inbox**
2. Envie uma mensagem para o bot
3. Verifique nos logs:
   ```
   [Evolution Webhook] 🤖 Acionando processador de assistente IA...
   [AssistantProcessor] 🔍 Buscando assistente ativo para canal=abc123...
   [AssistantProcessor] ✅ Assistente encontrado: {nome do assistente}
   ```
4. Se configurado corretamente, o assistente deve responder automaticamente

---

## Teste 2: Conexão Seletiva

### Passos:
1. Vá para **Assistentes de IA** → **Marketplace**
2. Selecione outro assistente
3. Clique em **"Conectar"**
4. **SELECIONE canais específicos** (ex: apenas WhatsApp Evolution)
5. Clique em **"Conectar a X canais"**

### Resultado Esperado:
- Assistente só funcionará nos canais selecionados
- Não funcionará em outros canais

---

## Teste 3: Novo Canal (Reconexão Automática)

### Passos:
1. Crie um assistente sem selecionar canais (Teste 1)
2. Vá para **Canais** e crie um novo canal WhatsApp
3. Confira nos logs:
   ```
   [Channels] 🤖 Reconectando assistentes ao novo canal: {channel_id}
   [Channels] ✅ Assistente "{nome}" reconectado ao novo canal
   ```

### Resultado Esperado:
- Assistente agora funcionará no novo canal automaticamente
- Sem precisar reconectar manualmente

---

## Teste 4: Diagnosticar Problemas

Se o assistente não estiver respondendo:

### Passo 1: Verificar Logs do Servidor
```bash
# No seu backend, busque por [AssistantProcessor]
grep -i "AssistantProcessor" /var/log/seu-app.log
```

Você deve ver uma das mensagens:
- ✅ `✅ Assistente encontrado: {nome}` → Assistente está vinculado
- ❌ `⚠️ Nenhum assistente encontrado` → Assistente não está vinculado a este canal
- ❌ `DEBUG: Usuário não tem nenhum assistente` → Nenhum assistente conectado

### Passo 2: Verificar Banco de Dados
```sql
-- Verificar assistentes conectados
SELECT ua.id, a.name, ua.is_active, ua.channel_ids
FROM user_assistants ua
LEFT JOIN assistants a ON ua.assistant_id = a.id
WHERE ua.user_id = 'seu-user-id';
```

Você deve ver:
- ✅ `is_active = true`
- ✅ `channel_ids` contém o ID do seu canal

### Passo 3: Verificar Canais
```sql
-- Verificar canais do usuário
SELECT id, type, name, status
FROM channels
WHERE user_id = 'seu-user-id' AND type = 'whatsapp';
```

Você deve ver:
- ✅ `status = 'active'` ou `'connected'`
- ✅ O canal está listado

---

## Teste 5: Múltiplos Assistentes

### Objetivo:
Verificar se múltiplos assistentes funcionam corretamente

### Passos:
1. Conecte **2 assistentes diferentes** ao mesmo canal (com seleção específica)
2. Nos logs, apenas **UM** deve responder (o primeiro encontrado)
3. Verifique em **Meus Assistentes** que ambos aparecem como ativos

### Resultado Esperado:
- Mais assistentes podem ser conectados
- Sistema seleciona o primeiro ativo encontrado para responder

---

## Troubleshooting

### Problema: "Assistente não está respondendo"

**Verificar:**
1. ✅ Assistente está em **"Meus Assistentes"**?
2. ✅ Assistente está **ativo** (toggle ligado)?
3. ✅ Canal está em status **"active"**?
4. ✅ Logs mostram "Assistente encontrado"?
5. ✅ API key da IA está configurada?

**Se todos os itens estão OK:**
- Verificar logs de errors: `grep -i "AssistantProcessor" erro`
- Verificar conexão com API de IA (OpenAI/Gemini)
- Verificar logs da IA em resp

### Problema: "Assistente desapareceu"

**Causa comum:**
- Foi desconectado acidentalmente
- Falha ao conectar a todos os canais

**Solução:**
- Reconecte o assistente
- Se ainda houver problema, verifique os logs da conexão

### Problema: "Conectando demorou muito"

**Normal se:**
- Usuário tem muitos canais (5+)
- First-time setup

**Não é um erro**, apenas demora alguns segundos

---

## Checklist de Validação

- [ ] Assistente conectado sem canais apareça em "Meus Assistentes"
- [ ] Botão mostra "Conectar a todos os canais" quando nada selecionado
- [ ] Assistente responde em Evolution API WhatsApp
- [ ] Novo canal reconecta automaticamente aos assistentes
- [ ] Logs mostram mensagens de debug corretas
- [ ] Múltiplos assistentes podem ser conectados
- [ ] Interface é clara e intuitiva

---

## Próximos Passos (Opcional)

1. **Interface para gerenciar canais por assistente**
   - Permitir desconectar de canais específicos
   - Permitir reconectar a diferentes canais

2. **Dashboard de status**
   - Mostrar quais assistentes estão respondendo
   - Mostrar número de respostas por assistente

3. **Notificações**
   - Alertar quando assistente fica sem canais
   - Alertar quando assistente falha em responder

---

## Suporte

Se encontrar algum erro não mencionado aqui:

1. **Colete os logs:**
   ```bash
   grep -i "AssistantProcessor\|Assistants\|Evolution Webhook" app.log > debug.log
   ```

2. **Verificar BD:**
   ```sql
   SELECT * FROM user_assistants WHERE user_id = 'seu-id';
   SELECT * FROM channels WHERE user_id = 'seu-id';
   ```

3. **Abra uma issue** com:
   - Os logs coletados
   - O resultado da query do BD
   - Passo a passo de como reproduzir o problema
