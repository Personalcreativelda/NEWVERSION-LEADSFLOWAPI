# Migração 013 - Voice Settings (Produção)

## ⚠️ IMPORTANTE
A migração 013 precisa ser aplicada no banco de dados de **PRODUÇÃO** (`api.leadsflowapi.com`)

## 🔧 Como Aplicar

### Opção 1: Via pgAdmin (Recomendado)

1. Abra o **pgAdmin**
2. Conecte-se ao banco de dados de **PRODUÇÃO**
3. Clique com botão direito no banco → **Query Tool**
4. Copie e cole o conteúdo de `api/src/database/migrations/013_user_voice_settings.sql`
5. Execute o script (F5)

### Opção 2: Via SSH + psql

```bash
# Conecte-se ao servidor de produção via SSH
ssh usuario@api.leadsflowapi.com

# Entre na pasta da API
cd /caminho/para/api

# Execute a migração
psql -U postgres -d leadflowdb -f api/src/database/migrations/013_user_voice_settings.sql
```

### Opção 3: Via API Deploy

Se você tem um sistema de deploy automatizado:

```bash
# Suba o código atualizado
git push production main

# Execute as migrações pendentes
npm run migrate
```

## 📝 Conteúdo da Migração

O script adiciona as seguintes colunas na tabela `users`:

- `elevenlabs_api_key` (TEXT) - Armazena a API key do ElevenLabs de cada usuário
- `voice_settings` (JSONB) - Configurações adicionais de voz (JSON)
- Índice para performance

## ✅ Como Verificar se Funcionou

Após aplicar a migração, teste:

1. Abra o navegador → Console (F12)
2. Acesse a página de Voice Agents
3. Clique no botão **Settings** (engrenagem)
4. **Não deve mais aparecer erro 400** no console
5. O modal deve abrir normalmente

## 🔍 Verificação Manual

Execute no banco de produção:

```sql
-- Verificar se as colunas foram criadas
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' 
  AND column_name IN ('elevenlabs_api_key', 'voice_settings');

-- Deve retornar 2 linhas:
-- elevenlabs_api_key | text
-- voice_settings     | jsonb
```

## 🚨 Depois da Migração

1. Faça o deploy do código frontend e backend atualizado
2. Teste o fluxo completo:
   - Abrir Settings
   - Adicionar API key do ElevenLabs
   - Salvar
   - Verificar se as vozes carregam
   - Criar um agente de voz

---

**Status Atual**: ❌ Migração NÃO aplicada em produção  
**Arquivo SQL**: `api/src/database/migrations/013_user_voice_settings.sql`
