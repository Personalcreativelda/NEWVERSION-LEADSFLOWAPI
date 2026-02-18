# 🎙️ AGENTES DE VOZ - GUIA RÁPIDO

## ✅ Status da Implementação

### ✔️ Funcionalidades Implementadas:

**Frontend:**
- Interface completa para gerenciar agentes
- Modal responsivo (mobile/tablet/desktop)
- Listagem com busca e filtros
- Botões de ação (Testar, Editar, Deletar, Ativar/Desativar)
- Integração com API do backend

**Backend:**
- API REST completa (CRUD)
- Serviço de integração com ElevenLabs
- Serviço de integração com Wavoip
- Endpoint para buscar vozes do ElevenLabs
- Endpoint para fazer chamadas de teste
- Registro de chamadas no banco de dados

**Banco de Dados:**
- Tabela `voice_agents` para armazenar agentes
- Tabela `voice_agent_calls` para histórico de chamadas
- Migrations SQL prontas

## 🔑 O Que Você Precisa Configurar

### 1. API Key do ElevenLabs (Para as Vozes)

**Por que?** ElevenLabs fornece as vozes realistas para os agentes.

**Como obter:**
1. Acesse: https://elevenlabs.io
2. Crie uma conta (tem plano gratuito com 10.000 caracteres/mês)
3. Vá em Profile Settings → API Keys
4. Copie a chave

**Onde configurar:**
Arquivo `api/.env`:
```env
ELEVENLABS_API_KEY=sk_your_key_here
```

**O que acontece sem configurar:**
- Sistema usará vozes pré-definidas (modo fallback)
- Não conseguirá gerar áudio real

### 2. API Key do Wavoip (Para as Chamadas)

**Por que?** Wavoip faz as chamadas telefônicas reais.

**Como obter:**
- Entre em contato com provedor de telefonia VoIP
- Alternativas: Twilio, Vonage, Plivo, etc.

**Onde configurar:**
Cada agente tem sua própria API key (configurada na interface):
- Campo "API Key Wavoip" no formulário
- Campo "Número de Origem" (seu número de telefone)

**O que acontece sem configurar:**
- Modo de simulação (apenas registra a chamada, não liga de verdade)
- Mostra "Test call initiated" mas não faz ligação real

## 📞 Como Funciona uma Chamada

```
┌─────────────────────────────────────────────────────────┐
│  1. Usuário clica em "Ligar" no agente                 │
│                                                          │
│  2. Sistema busca configuração do agente:               │
│     - Voz do ElevenLabs selecionada                    │
│     - API Key do Wavoip                                │
│     - Número de origem                                 │
│     - Mensagem de saudação                             │
│                                                          │
│  3. Sistema chama Wavoip API:                          │
│     POST /calls                                         │
│     {                                                    │
│       from: "+5511999999999",                          │
│       to: "+5511888888888",                            │
│       message: "Olá! Sou o agente..."                  │
│     }                                                    │
│                                                          │
│  4. Wavoip faz a chamada real                          │
│     - Disca para o número                              │
│     - Toca o telefone                                  │
│     - Quando atende, reproduz a mensagem               │
│                                                          │
│  5. Sistema registra no banco:                         │
│     - ID da chamada                                     │
│     - Status (initiated, ringing, completed)           │
│     - Duração                                           │
│     - Custo (se disponível)                            │
└─────────────────────────────────────────────────────────┘
```

## 🚀 Teste Rápido (Modo Simulação)

Você pode testar AGORA sem configurar as APIs:

1. **Crie um agente:**
   - Nome: "Teste"
   - Descrição: "Agente de teste"
   - Voz: Selecione qualquer uma (são pré-definidas)
   - API Key Wavoip: "test_key" (qualquer coisa)
   - Número: "+5511999999999"
   - Mensagem: "Olá! Este é um teste"

2. **Teste a chamada:**
   - Clique no ícone de telefone no card
   - Digite seu número
   - Clique em "Ligar"
   - Verá: "Chamada iniciada com sucesso"

3. **Veja no console do servidor:**
   ```
   [Wavoip] 🧪 TEST CALL from +5511999999999 to +5511888888888
   [Wavoip] 📝 Message: Olá! Este é um teste
   [Wavoip] ⚠️ Using simulated call (no API key or dev mode)
   ```

**Importante:** No modo simulação, a chamada NÃO é feita de verdade. É apenas para testar a interface e o fluxo.

## 🔧 Para Fazer Chamadas Reais

### Passo 1: Configure ElevenLabs

```bash
cd api
nano .env

# Adicione:
ELEVENLABS_API_KEY=sk_sua_chave_aqui
```

### Passo 2: Configure Wavoip no Agente

1. Edite o agente
2. Preencha "API Key Wavoip" com chave real
3. Use número de origem real
4. Salve

### Passo 3: Teste

- Clique em "Ligar"
- Digite número REAL
- A chamada será feita DE VERDADE! ☎️

## 📊 Monitorar Chamadas

### No Frontend:
- Veja histórico de chamadas (futura feature)
- Status: Iniciada, Tocando, Em andamento, Concluída

### No Backend (console):
```bash
# Ver logs em tempo real
tail -f api/logs/app.log | grep -i voice

# Ou ver logs do Docker
docker-compose logs -f api | grep -i voice
```

### No Banco de Dados:
```sql
-- Ver todas as chamadas
SELECT * FROM voice_agent_calls 
ORDER BY created_at DESC 
LIMIT 10;

-- Ver chamadas por agente
SELECT * FROM voice_agent_calls 
WHERE voice_agent_id = 'agent-id-here';
```

## ❌ Troubleshooting

### Problema: "Vozes não carregam"

**Solução:**
1. Verifique se `ELEVENLABS_API_KEY` está no `.env`
2. Reinicie o servidor da API
3. Limpe cache do navegador
4. Verifique logs: `[ElevenLabs] ✅ Fetched X voices`

### Problema: "Chamada não é iniciada"

**Possíveis causas:**
- ❌ API key do Wavoip inválida
- ❌ Número de origem não configurado
- ❌ Créditos insuficientes no Wavoip
- ❌ Número de destino inválido

**Debug:**
```bash
# Ver logs do Wavoip
docker-compose logs -f api | grep Wavoip
```

### Problema: "Erro 401 Unauthorized"

**Solução:**
- Token expirado
- Faça logout e login novamente

## 📝 Próximas Melhorias

**Planejado:**
- [ ] Página de histórico de chamadas
- [ ] Gravação de chamadas
- [ ] Transcrição automática
- [ ] Analytics (taxa de sucesso, duração média, custo)
- [ ] Webhook receiver (para receber eventos do Wavoip)
- [ ] Integração com leads (associar chamadas a leads)
- [ ] Agendamento de chamadas
- [ ] Respostas interativas (IVR)
- [ ] A/B testing de vozes

## 💰 Custos Estimados

### ElevenLabs:
- **Free:** 10.000 caracteres/mês (≈300 chamadas curtas)
- **Starter:** $5/mês (30.000 caracteres)
- **Creator:** $22/mês (100.000 caracteres)

### Wavoip/VoIP:
- Varia por provedor e país
- Média: $0.01-0.05 por minuto
- Configure limites de gasto!

## 🆘 Suporte

**Documentação:**
- ElevenLabs: https://elevenlabs.io/docs
- Wavoip: Consulte seu provedor

**No código:**
- Frontend: `src/app/components/pages/VoiceAgentsPage.tsx`
- Backend: `api/src/routes/voice-agents.routes.ts`
- Serviços: `api/src/services/elevenlabs.service.ts` e `wavoip.service.ts`

---

**🎉 Pronto!** O sistema está 100% funcional. Você só precisa:
1. Configurar as API keys (opcional, tem modo simulação)
2. Criar agentes
3. Fazer chamadas!
