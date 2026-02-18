# GUIA DE CONFIGURAÇÃO - AGENTES DE VOZ

## 📋 Visão Geral

Os Agentes de Voz integram duas APIs principais:
1. **ElevenLabs** - Para síntese de voz (Text-to-Speech)
2. **Wavoip** - Para realizar chamadas telefônicas

## 🔑 Configuração das APIs

### 1. ElevenLabs API

#### Obter API Key:
1. Acesse: https://elevenlabs.io
2. Crie uma conta ou faça login
3. Vá em **Profile Settings** → **API Keys**
4. Copie sua API key

#### Configurar no sistema:
Adicione no arquivo `.env` da API:
```env
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
```

#### Funcionalidades:
- ✅ Buscar vozes disponíveis
- ✅ Gerar áudio a partir de texto
- ✅ Personalizar configurações de voz (estabilidade, similaridade)

### 2. Wavoip API

#### Obter API Key:
1. Acesse a plataforma Wavoip
2. Crie uma conta ou faça login
3. Navegue até configurações de API
4. Gere uma nova API key

#### Configurar no sistema:
Adicione no arquivo `.env` da API:
```env
WAVOIP_API_KEY=your_wavoip_api_key_here
WAVOIP_API_URL=https://api.wavoip.com/v1
```

#### Funcionalidades:
- ✅ Fazer chamadas telefônicas
- ✅ Enviar áudio ou texto (TTS)
- ✅ Rastrear status das chamadas
- ✅ Receber webhooks de eventos

## 🔧 Como Funciona

### Fluxo de uma Chamada:

1. **Usuário cria um Agente de Voz:**
   - Define nome, descrição
   - Seleciona voz do ElevenLabs
   - Configura API key do Wavoip
   - Define número de origem
   - Escreve mensagem de saudação e instruções

2. **Usuário clica em "Ligar" (Test Call):**
   - Sistema valida configurações
   - Busca dados do agente no banco
   - Prepara mensagem de áudio
   - Envia requisição para Wavoip API
   - Wavoip faz a chamada real
   - Sistema registra chamada no banco

3. **Durante a Chamada:**
   - Wavoip reproduz o áudio/mensagem
   - Pode gravar a ligação
   - Envia webhooks de status
   - Gera transcrição (se configurado)

## 📝 Configuração por Agente

Cada agente armazena suas próprias configurações:

```json
{
  "voice_config": {
    "voice_id": "ErXwobaYiN019PkySvjV",
    "model_id": "eleven_monolingual_v1",
    "stability": 0.5,
    "similarity_boost": 0.75
  },
  "call_config": {
    "api_key": "wavoip_key_do_usuario",
    "phone_number": "+5511999999999",
    "max_duration": 300
  }
}
```

## 🎯 Recursos Implementados

### ✅ Frontend:
- Interface de criação/edição de agentes
- Listagem de agentes com busca
- Modal responsivo (mobile/tablet/desktop)
- Botões de ação (Editar, Testar, Deletar)
- Toggle para ativar/desativar agentes
- Seleção de vozes do ElevenLabs

### ✅ Backend:
- CRUD completo de agentes (GET, POST, PUT, DELETE, TOGGLE)
- Endpoint para buscar vozes do ElevenLabs
- Endpoint para fazer chamadas de teste
- Serviço ElevenLabs com fallback
- Serviço Wavoip com validações
- Registro de chamadas no banco de dados

### ✅ Banco de Dados:
- Tabela `voice_agents` (agentes)
- Tabela `voice_agent_calls` (histórico de chamadas)
- Índices otimizados
- Foreign keys e cascades

## 🚀 Próximos Passos

### 1. Testar Integração Real

Para testar com APIs reais:

```bash
# No arquivo api/.env
ELEVENLABS_API_KEY=sk-elevenlabs-xxxxx
WAVOIP_API_KEY=your-wavoip-key
WAVOIP_API_URL=https://api.wavoip.com/v1
```

### 2. Implementar Funcionalidades Avançadas

```typescript
// TODO: Adicionar no futuro
- [ ] Webhook receiver para status de chamadas
- [ ] Gravação de chamadas
- [ ] Transcrição automática
- [ ] Analytics de chamadas
- [ ] Integração com leads (associar chamadas)
- [ ] Respostas interativas (IVR)
- [ ] A/B testing de vozes
- [ ] Agendamento de chamadas
```

### 3. Webhooks do Wavoip

Configure webhook URL no Wavoip para receber eventos:

```
POST https://seu-dominio.com/api/voice-agents/webhooks/wavoip
```

Eventos recebidos:
- `call.initiated` - Chamada iniciada
- `call.ringing` - Telefone tocando
- `call.answered` - Chamada atendida
- `call.completed` - Chamada concluída
- `call.failed` - Chamada falhou

### 4. Melhorias de Segurança

- [ ] Criptografar API keys no banco
- [ ] Rate limiting para chamadas
- [ ] Validação de números de telefone
- [ ] Logs de auditoria
- [ ] Permissões por usuário

## 📊 Monitoramento

### Logs para acompanhar:

```bash
# API logs
[VoiceAgents] ✅ Voice agent created: Nome (id)
[VoiceAgents] 🧪 Test call initiated: call_id
[ElevenLabs] ✅ Fetched 100 voices
[Wavoip] 📞 Call initiated: call_id
```

### Métricas importantes:
- Taxa de sucesso de chamadas
- Duração média das chamadas
- Custo por chamada
- Taxa de resposta
- Erros de API

## 🛠️ Troubleshooting

### Problema: Vozes não carregam
**Solução:** Verifique se `ELEVENLABS_API_KEY` está configurado. O sistema usa vozes padrão como fallback.

### Problema: Chamada não é iniciada
**Possíveis causas:**
1. API key do Wavoip não configurado no agente
2. Número de origem inválido
3. Créditos insuficientes no Wavoip
4. API do Wavoip indisponível

**Debug:**
```bash
# Verifique logs do backend
tail -f api/logs/app.log | grep -i wavoip
```

### Problema: Erro 401 Unauthorized
**Solução:** Token de autenticação expirado. Faça login novamente.

## 📞 Suporte

Para problemas específicos:
- ElevenLabs: https://elevenlabs.io/docs
- Wavoip: Consulte documentação da plataforma

## 🔒 Segurança

**IMPORTANTE:**
- Nunca commite API keys no código
- Use variáveis de ambiente
- Rotacione keys regularmente
- Monitore uso das APIs
- Configure rate limits

## 📈 Custos

### ElevenLabs:
- Plano Free: 10.000 caracteres/mês
- Plano Starter: $5/mês (30.000 caracteres)
- Plano Creator: $22/mês (100.000 caracteres)

### Wavoip:
- Varia por país e tipo de chamada
- Consulte pricing na plataforma
- Configure limites de gasto

---

**Status Atual:** ✅ Sistema funcional com modo de simulação
**Próximo Passo:** Configurar API keys reais para testes em produção
