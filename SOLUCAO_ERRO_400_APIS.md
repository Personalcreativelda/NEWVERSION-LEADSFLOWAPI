# Solução: Erro 400 ao Salvar APIs - Voice Agents

## ❌ Problema
Quando você tenta salvar as configurações das APIs (ElevenLabs, OpenAI, etc), recebe um erro `400 Bad Request` e as chaves não são salvas.

---

## 🔍 Causa Raiz
A migração **014_add_ai_models_support.sql** não foi aplicada ao banco de dados. Esta migração cria as colunas necessárias na tabela `users`:
- `openai_api_key`
- `anthropic_api_key`  
- `google_api_key`
- `preferred_ai_model`

Sem estas colunas, o backend não consegue atualizar o perfil do usuário.

---

## ✅ Solução (3 Passos)

### Passo 1: Verificar se a migração foi aplicada
Abra **pgAdmin** e execute este SQL na sua database:

```sql
-- Verificar quais colunas existem na tabela users
SELECT column_name, data_type
FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name IN ('elevenlabs_api_key', 'openai_api_key', 'anthropic_api_key', 'google_api_key', 'preferred_ai_model', 'voice_settings')
ORDER BY column_name;
```

**Resultado esperado:**
- Se ver 6 linhas (todas as colunas) ✅ - Migração foi aplicada
- Se ver menos de 6 linhas ❌ - Falta aplicar a migração
- Se ver 0 linhas ❌ - Migração não foi aplicada

---

### Passo 2: Aplicar a Migração 014

**Caminho do arquivo:**
```
api/src/database/migrations/014_add_ai_models_support.sql
```

**Como executar:**

#### Opção A: Via pgAdmin (Recomendado)
1. Abra **pgAdmin** → Seu banco de dados
2. Clique em **Tools** → **Query Tool**  
3. Copie o conteúdo de `014_add_ai_models_support.sql`
4. Cole na Query Tool
5. Clique em **Execute** (Ctrl + Enter)
6. Deve vir a mensagem: `Rows affected: Success`

#### Opção B: Via linha de comando (psql)
```bash
# Conecte ao seu banco de dados
psql -U seu_usuario -d seu_database -h localhost

# Execute o script
\i api/src/database/migrations/014_add_ai_models_support.sql

# Saia
\q
```

#### Opção C: Via Docker
```bash
# Se está usando Docker
docker exec seu_container_postgres psql -U seu_usuario -d seu_database -f /caminho/ate/014_add_ai_models_support.sql
```

---

### Passo 3: Testar a Solução

#### Verificar se as colunas foram criadas
Execute novamente o SQL do **Passo 1**. Agora deve retornar 6 colunas.

#### Testar no app
1. Abra **Voice Agents** → **Configurações**
2. Preencha uma chave de API (ex: ElevenLabs)
3. Clique em **Salvar Configurações**
4. Deve aparecer: ✅ "Configurações salvas com sucesso!"
5. Feche o modal
6. Os agentes devem permanecer visíveis com o badge "✓ Salvo"

---

## 🛠️ Debugging se Continuar com Erro

### 1. Verifique o Console do Navegador (F12)
Procure por logs como:

**Se tiver sucesso:**
```
[VoiceAgentsPage] 🔄 Saving API keys...
[VoiceAgentsPage] ✅ Settings saved
[VoiceAgentsPage] 🔄 Reloading all data...
[VoiceAgentsPage] ✅ Fresh data loaded
```

**Se tiver erro:**
```
[VoiceAgentsPage] ❌ Error saving settings: AxiosError...
[VoiceAgentsPage] Error details: { status: 400, ... }
```

### 2. Verifique o Console do Backend (onde a API está rodando)

Procure por logs do PUT /settings como:
```
[VoiceAgents] 🔧 PUT /settings called for user abc123
[VoiceAgents] Request body received: { elevenlabs_api_key: "sk_...", ... }
[VoiceAgents] Parsed fields: { hasElevenLabs: true, hasOpenAI: false, ... }
[VoiceAgents] Total updates to apply: 1
[VoiceAgents] Executing query: UPDATE users SET elevenlabs_api_key = $1, ...
[VoiceAgents] ✅ Query executed successfully
```

Se vir erro tipo:
```
[VoiceAgents] ❌ Database query error: column "openai_api_key" does not exist
[VoiceAgents] ERROR: Column not found. Migration 014 may not have been applied.
```

Então **aplique a migração 014** (Passo 2 acima).

### 3. Verificar Diagnóstico Automático

Quando há erro, o app tenta rodar diagnóstico automaticamente. Procure no console por:
```
[VoiceAgentsPage] 🔍 Running diagnosis...
[VoiceAgentsPage] Diagnosis result: { 
  status: 'ok',
  diagnosis: {
    allColumnsExist: false,
    missingColumns: ['openai_api_key', 'anthropic_api_key', ...]
  }
}
```

### 4. Executar Diagnóstico Manual

Se quiser testar via API:

```bash
# Curl
curl -H "Authorization: Bearer seu_token" \
     http://localhost:4000/api/voice-agents/diagnose

# Deve retornar algo como:
{
  "status": "ok",
  "diagnosis": {
    "allColumnsExist": true,  # ou false
    "existingColumns": ["elevenlabs_api_key", "voice_settings"],
    "missingColumns": [] # ou lista das que faltam
  }
}
```

---

## 📋 Checklist de Solução

- [ ] Executou o SQL de verificação (Passo 1)?
- [ ] Viu que faltam as colunas na tabela `users`?
- [ ] Aplicou a migração 014 (Passo 2)?
- [ ] Executou novamente o SQL de verificação e agora vê 6 colunas?
- [ ] Testou salvar uma API key no app?
- [ ] Viu a mensagem de sucesso "✅ Configurações salvas"?
- [ ] Os agentes permaneceram visíveis après salvar?

Se todos os itens estão checked ✅, o problema foi resolvido!

---

## ⚠️ Ainda com Problema?

Se ainda tiver erro após aplicar a migração, proceda assim:

1. **Colete os logs:**
   - F12 → Console (navegador)
   - Console do backend (terminal)
   - Screenshot do erro exato

2. **Verifique database:**
   ```sql
   -- Verificar que as colunas realmente existem
   SELECT * FROM information_schema.columns 
   WHERE table_name = 'users' AND column_name LIKE '%api_key%';
   
   -- Verificar um user específico
   SELECT id, elevenlabs_api_key, openai_api_key, anthropic_api_key, google_api_key 
   FROM users LIMIT 1;
   ```

3. **Reinicie a API:**
   Se alterou o código ou banco, reinicie o servidor backend:
   ```bash
   # Ctrl+C para parar
   # Depois:
   npm run dev
   ```

4. **Limpe cache do navegador:**
   - Ctrl+Shift+Delete (ou Cmd+Shift+Delete no Mac)
   - Limpe cookies/cache do site
   - Recarregue a página

---

## 📞 Suporte

Se nenhuma das soluções acima funcionou:
- Verifique que tem acesso admin ao banco de dados
- Confirme que está usando a senha correta para o PostgreSQL
- Verifique se a conexão com o banco está ativa
- Tente criar outra coluna de teste para confirmar que o PostgreSQL está respondendo

---

## 🎯 Resumo Rápido

```bash
# 1. Conecte ao banco
psql -U seu_usuario -d seu_database

# 2. Execute o arquivo de migração
\i api/src/database/migrations/014_add_ai_models_support.sql

# 3. Verifique
SELECT COUNT(*) FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name IN ('openai_api_key', 'anthropic_api_key', 'google_api_key');

# Deve retornar: 3 (se ok) ou menos (se ainda falta)

# 4. Saia
\q
```

---

**Status:** ✅ Problema identificado e solução testada  
**Última atualização:** 2025-02-19  
**Versão:** 1.0
