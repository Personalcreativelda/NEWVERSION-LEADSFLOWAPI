# Configuração de Agentes de Voz com Wavoip

## Visão Geral

Os Agentes de Voz do LeadFlow integram:
- **ElevenLabs**: Para síntese de voz realista (IA de geração de fala)
- **Wavoip**: Para efetuar chamadas telefônicas automáticas
- **OpenAI/Claude/Google Gemini**: Para processamento de IA adicional (opcional)

## Pré-requisitos

1. **Conta ElevenLabs** (obrigatório)
   - Visite https://elevenlabs.io
   - Crie uma conta gratuita ou profissional
   - Obtenha sua API Key em https://elevenlabs.io/app/settings/api-keys

2. **Conta Wavoip** (obrigatório para fazer chamadas)
   - Visite https://wavoip.co ou https://www.wavoip.com
   - Crie uma conta e faça login
   - Gere uma API Key no seu dashboard
   - Adicione fundos à sua conta (chamadas têm custo por minuto)

3. **Números de Telefone** (obrigatório)
   - Números de origem verificados no Wavoip (números que farão as chamadas)
   - Números de destino em formato E.164

## Configuração Passo a Passo

### Etapa 1: Salvar API Keys

1. Acesse **Agentes de Voz** → **Configurações**
2. Adicione suas chaves de API:
   - **ElevenLabs API Key**: Obtenha em https://elevenlabs.io/app/settings/api-keys
   - **Wavoip API Key**: Obtenha no seu dashboard Wavoip
   - (Opcional) OpenAI, Anthropic, ou Google API Keys

3. Defina qual modelo de IA usar como padrão
4. Clique em **Salvar Configurações**

### Etapa 2: Criar um Agente de Voz

1. Clique em **Criar Agente**
2. Preencha os seguintes campos:

   **Informações Básicas:**
   - Nome do Agente (ex: "Vendedor Automático")
   - Descrição (opcional)

   **Configuração de Voz:**
   - Selecione um modelo de voz ElevenLabs
   - Ajuste estabilidade (0.0-1.0): mais alto = mais consistente
   - Ajuste boost (0.0-1.0): mais alto = mais entusiasta

   **Configuração de Chamadas (Wavoip):**
   - **Wavoip API Key**: Sua chave de API do Wavoip
   - **Número de Origem**: Seu número verificado no Wavoip
     - **IMPORTANTE**: Deve estar em formato E.164: **+CCNNNNNNNNN**
     - Brasil exemplo: +5511999999999
     - EUA exemplo: +14155552671

   **Comportamento do Agente:**
   - Mensagem de Saudação (ex: "Olá! Como posso ajudá-lo?")
   - Instruções (comportamento esperado do agente)
   - Idioma (padrão: pt-BR para português)

3. Clique em **Criar Agente**

### Etapa 3: Testar a Chamada

1. Na lista de agentes, clique em **Testar Chamada** para o agente desejado
2. Digite o número de destino em formato E.164 (ex: +5511988887777)
3. A chamada será iniciada

**Importante**: Teste com números pessoais primeiro!

## Formato de Telefone (E.164)

O formato E.164 é o padrão internacional para números de telefone:

```
+[Código do País][Número]
```

### Exemplos:

| País | Exemplo | Explicação |
|------|---------|-----------|
| 🇧🇷 Brasil | +5511999999999 | CC: 55, Área: 11, Número: 999999999 |
| 🇺🇸 EUA | +14155552671 | CC: 1, Área: 415, Número: 5552671 |
| 🇬🇧 UK | +442071838750 | CC: 44, Área: 20, Número: 71838750 |
| 🇲🇽 México | +525541234567 | CC: 52, Área: 55, Número: 41234567 |

**Para encontrar o código do país**: Visite https://countrycode.org

## Solução de Problemas

### ❌ Erro: "Invalid phone number format"
**Causa**: Número não está em formato E.164
**Solução**: Use +CCNNNNNNNNN (ex: +5511999999999)

### ❌ Erro: "Wavoip API key not configured"
**Causa**: Campo de API key do Wavoip vazio no agente
**Solução**: 
1. Vá para Configurações e salve sua chave Wavoip
2. Crie um novo agente ou edite o existente
3. Preencha o campo "Wavoip API Key"

### ❌ Erro: "Origin phone number not configured"
**Causa**: Campo "Número de Origem" vazio
**Solução**: 
1. Edite o agente
2. Preencha o campo "Número de Origem" com seu número verificado no Wavoip
3. Use formato E.164: +CCNNNNNNNNN

### ❌ Chamada não conecta / Erro 401
**Causa**: Credenciais Wavoip inválidas ou expiradas
**Solução**:
1. Verifique se sua API Key do Wavoip está correta
2. Verifique se seu número de origem está verificado no Wavoip
3. Verifique se tem saldo na conta Wavoip

### ❌ Wavoip retorna erro HTTP 400/422
**Causa**: Dados de configuração da chamada incorretos
**Solução**:
1. Verifique números em formato E.164: +CCNNNNNNNNN
2. Verifique Número de Origem está verificado no Wavoip
3. Verifique se tem saldo para fazer chamadas

## Modelos de IA Suportados

### ElevenLabs (Voz)
- **Obrigatório** para síntese de voz
- Vozes de alta qualidade em múltiplos idiomas
- Preço: A partir de $0.30/1000 caracteres

### OpenAI (Opcional)
- Modelos: GPT-4, GPT-3.5
- Para processamento de linguagem natural
- Preço: Varia por modelo

### Anthropic Claude (Opcional)
- Modelo Claude 3 (Haiku, Sonnet, Opus)
- Para geração de respostas inteligentes
- Preço: Varia por modelo

### Google Gemini (Opcional)
- Modelo Gemini Pro
- Para análise e processamento
- Preço: A partir de $0.00075/1000 tokens

## Custos Estimados

| Serviço | Custo | Observações |
|---------|-------|------------|
| ElevenLabs | $0.30/1000 caracteres | ~100 caracteres/minuto = $0.003/minuto |
| Wavoip | $0.05-0.15/minuto | Varia por país e tipo de número |
| OpenAI | $0.03/1K prompts | Gpt-3.5-turbo |

### Exemplo de Custo por Chamada (1 minuto):
- ElevenLabs: ~$0.003
- Wavoip: ~$0.10
- **Total**: ~$0.103 por minuto (~$6 por hora)

## FAQ

### ❓ Posso usar múltiplos números de origem?
Sim! Crie múltiplos agentes com diferentes números de origem. Isso permite distribuir volume de chamadas.

### ❓ Qual é o limite de chamadas?
Sem limite técnico, mas limitado pelo saldo da conta Wavoip e pela sua taxa de requisições API.

### ❓ Posso gravar as chamadas?
Sim, o Wavoip suporta gravação. Configure a gravação nas preferências do seu número no Wavoip.

### ❓ Existem agendamentos disponíveis?
Atualmente não, mas você pode programar agentes via API ou webhooks.

### ❓ Qual é o melhor horário para fazer chamadas?
- **Comercial**: Segunda-sexta, 9h-18h
- **Vendas B2B**: Segunda-quinta, 10h-16h
- Evite: Noites, finais de semana, feriados

## Suporte

- **Wavoip Docs**: https://docs.wavoip.co
- **ElevenLabs Docs**: https://elevenlabs.io/docs
- **LeadFlow Support**: Abra um ticket no suporte

## Segurança

⚠️ **Importante**:
- Nunca compartilhe suas API Keys
- Use API Keys diferentes para cada ambiente (dev, prod)
- Monitore o uso de suas chaves no dashboard de serviços
- Revogue chaves comprometidas imediatamente
