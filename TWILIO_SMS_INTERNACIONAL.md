# 🌍 Twilio SMS - Suporte Internacional

## ✅ Correções Implementadas

### 1. Banco de Dados
**Status:** ⚠️ Requer execução manual

### 2. Validação Internacional E.164
**Status:** ✅ Implementado

## 📋 Passo a Passo

### 1️⃣ Aplicar Migração no Banco de Dados

Conecte-se ao seu PostgreSQL e execute:

```sql
-- Drop constraint antigo
ALTER TABLE channels DROP CONSTRAINT IF EXISTS channels_type_check;

-- Adiciona constraint com 'twilio_sms'
ALTER TABLE channels ADD CONSTRAINT channels_type_check
    CHECK (type IN ('whatsapp', 'whatsapp_cloud', 'facebook', 'instagram', 'telegram', 'email', 'website', 'twilio_sms'));
```

**Opções para executar:**

**A. Via psql (linha de comando):**
```bash
psql -h seu-host -U seu-usuario -d leadsflow -c "ALTER TABLE channels DROP CONSTRAINT IF EXISTS channels_type_check; ALTER TABLE channels ADD CONSTRAINT channels_type_check CHECK (type IN ('whatsapp', 'whatsapp_cloud', 'facebook', 'instagram', 'telegram', 'email', 'website', 'twilio_sms'));"
```

**B. Via PgAdmin / DBeaver:**
1. Conecte-se ao banco
2. Abra o SQL Editor
3. Cole o SQL acima
4. Execute (F5)

**C. Via Docker (se usando docker-compose):**
```bash
docker-compose exec -T db psql -U postgres -d leadsflow < api/src/database/migrations/007_add_twilio_sms_channel_type.sql
```

### 2️⃣ Reiniciar Backend

Após aplicar a migração, reinicie o backend para recarregar as validações:

```bash
# Se rodando via npm
npm run dev

# Se rodando via docker
docker-compose restart api
```

## 🌎 Formato de Números Internacionais (E.164)

### ✅ Formato Correto
O sistema agora aceita números de **QUALQUER PAÍS** no formato E.164:
- **Formato:** `+[código do país][número]`
- **Tamanho:** Entre 8 e 15 dígitos (incluindo código do país)

### 📞 Exemplos por País

#### América do Norte
```
+12566241358        # Estados Unidos
+15551234567        # EUA (outro exemplo)
+16473334444        # Canadá
```

#### América Latina
```
+5511999999999      # Brasil (São Paulo)
+5521987654321      # Brasil (Rio de Janeiro)
+5215512345678      # México
+5491112345678      # Argentina
+56912345678        # Chile
+573001234567       # Colômbia
+51987654321        # Peru
+584241234567       # Venezuela
```

#### Europa
```
+351912345678       # Portugal
+351961234567       # Portugal (móvel)
+4915123456789      # Alemanha
+442012345678       # Reino Unido
+33612345678        # França
+34612345678        # Espanha
+3912345678         # Itália
```

#### África (Países Lusófonos)
```
+244923456789       # Angola
+258823456789       # Moçambique
+2389876543         # Cabo Verde
+2459876543         # Guiné-Bissau
+23990123456        # São Tomé e Príncipe
```

#### Ásia & Oceania
```
+81312345678        # Japão
+8613912345678      # China
+919876543210       # Índia
+61412345678        # Austrália
+64211234567        # Nova Zelândia
```

#### Outros
```
+27821234567        # África do Sul
+79161234567        # Rússia
```

## ❌ Formatos Inválidos (NÃO aceitos)

```
❌ 12566241358          # Faltando o símbolo +
❌ +0 11 99999-9999     # Código de país não pode começar com 0
❌ +55 (11) 99999-9999  # Não pode ter parênteses/espaços/hífens
❌ 011 99999-9999       # Formato local (sem código do país)
❌ +1-256-624-1358      # Não pode ter hífens
```

## 🔧 Configuração no Dashboard

1. Acesse **Configurações → Canais**
2. Clique em **+ Adicionar Canal → Twilio SMS**
3. Preencha:
   - **Account SID:** (do Twilio Console)
   - **Auth Token:** (do Twilio Console)
   - **Número Twilio:** No formato E.164 (ex: `+12566241358`)
4. Clique em **Salvar**

## 🔍 Validação Automática

O sistema agora valida automaticamente:
- ✅ Começa com `+`
- ✅ Código do país (1-3 dígitos, não pode ser 0)
- ✅ Número completo (8-15 dígitos total)
- ✅ Apenas dígitos após o `+`

## 💡 Dicas

### Como Pegar Seu Número no Twilio

1. Acesse [Twilio Console](https://console.twilio.com)
2. Vá em **Phone Numbers → Manage → Active numbers**
3. Copie o número **exatamente como aparece** (já vem em formato E.164)
4. Exemplo: `+1 256 624 1358` → Cole como `+12566241358`

### Normalização Automática

Se precisar converter números locais, use a função utilitária:

```typescript
import { normalizeToE164 } from './src/utils/phone-validation';

// Brasil
normalizeToE164('11999999999', '55');  // → +5511999999999

// Portugal
normalizeToE164('912345678', '351');   // → +351912345678

// EUA (já tem +1)
normalizeToE164('+12566241358');       // → +12566241358
```

## 🎯 Resultado

Após aplicar a migração e reiniciar:
- ✅ Você pode criar canais Twilio SMS
- ✅ Números de qualquer país são aceitos
- ✅ Validação automática previne erros
- ✅ Sistema pronto para SaaS multi-país

## ⚡ Troubleshooting

### Erro: "violates check constraint channels_type_check"
**Solução:** A migração do banco ainda não foi aplicada. Execute o SQL do passo 1️⃣.

### Erro: "phoneNumber must be in E.164 format"
**Solução:** 
1. Certifique-se que o número começa com `+`
2. Remova espaços, parênteses e hífens
3. Exemplo correto: `+5511999999999`

### Erro: "Cannot find module 'twilio'"
**Solução:** Instale as dependências:
```bash
cd api
npm install
```

## 📚 Referências

- [Formato E.164 (Wikipedia)](https://en.wikipedia.org/wiki/E.164)
- [Twilio Phone Number Formatting](https://www.twilio.com/docs/glossary/what-e164)
- [Lista de Códigos de País](https://countrycode.org/)
