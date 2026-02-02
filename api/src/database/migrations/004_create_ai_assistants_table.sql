-- INBOX: Migração 4 - Criar tabela de assistentes virtuais (ai_assistants)
-- Esta tabela gerencia os assistentes de IA para resposta automática

CREATE TABLE IF NOT EXISTS ai_assistants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    mode VARCHAR(50) NOT NULL CHECK (mode IN ('webhook', 'llm')),
    -- Configurações para modo webhook
    webhook_url TEXT,
    webhook_headers JSONB,
    -- Configurações para modo LLM
    llm_provider VARCHAR(50) CHECK (llm_provider IN ('gemini', 'openai', 'anthropic')),
    llm_api_key TEXT, -- Será criptografado na aplicação
    llm_model VARCHAR(100),
    llm_system_prompt TEXT,
    -- Configurações gerais
    settings JSONB DEFAULT '{
        "enabled": true, 
        "auto_respond": false,
        "business_hours_only": false,
        "fallback_to_human": true
    }',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_ai_assistants_user_id ON ai_assistants(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_assistants_channel_id ON ai_assistants(channel_id);
CREATE INDEX IF NOT EXISTS idx_ai_assistants_is_active ON ai_assistants(is_active);
CREATE INDEX IF NOT EXISTS idx_ai_assistants_mode ON ai_assistants(mode);

-- Trigger para atualizar updated_at automaticamente
CREATE TRIGGER update_ai_assistants_updated_at 
    BEFORE UPDATE ON ai_assistants 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Comentários de documentação
COMMENT ON TABLE ai_assistants IS 'Gerencia os assistentes virtuais de IA para resposta automática';
COMMENT ON COLUMN ai_assistants.mode IS 'Modo de operação: webhook (chama URL externa) ou llm (usa modelo de IA)';
COMMENT ON COLUMN ai_assistants.channel_id IS 'Canal específico (NULL = todos os canais do usuário)';
COMMENT ON COLUMN ai_assistants.webhook_url IS 'URL do webhook para modo webhook';
COMMENT ON COLUMN ai_assistants.llm_provider IS 'Provedor de LLM: gemini, openai, anthropic';
COMMENT ON COLUMN ai_assistants.llm_api_key IS 'Chave de API do LLM (criptografada)';
COMMENT ON COLUMN ai_assistants.llm_system_prompt IS 'Prompt de sistema para o LLM';
COMMENT ON COLUMN ai_assistants.settings IS 'Configurações: enabled, auto_respond, business_hours_only, fallback_to_human, trigger_keywords, etc';
