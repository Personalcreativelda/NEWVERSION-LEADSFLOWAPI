-- INBOX: Script consolidado de migrações
-- Execute este arquivo diretamente no PostgreSQL

-- Verificar se a função update_updated_at_column existe, se não, criar
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- MIGRAÇÃO 1: Criar tabela channels
-- ============================================

CREATE TABLE IF NOT EXISTS channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('whatsapp', 'facebook', 'instagram', 'telegram')),
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'error', 'connecting')),
    credentials JSONB DEFAULT '{}',
    settings JSONB DEFAULT '{}',
    last_sync_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channels_user_id ON channels(user_id);
CREATE INDEX IF NOT EXISTS idx_channels_type ON channels(type);
CREATE INDEX IF NOT EXISTS idx_channels_status ON channels(status);

DROP TRIGGER IF EXISTS update_channels_updated_at ON channels;
CREATE TRIGGER update_channels_updated_at 
    BEFORE UPDATE ON channels 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE channels IS 'Gerencia os canais de comunicação integrados (WhatsApp, Facebook, Instagram, etc)';

-- Migrar instâncias WhatsApp existentes para channels (apenas se não existirem)
INSERT INTO channels (user_id, type, name, status, credentials, created_at, updated_at)
SELECT 
    user_id,
    'whatsapp' as type,
    COALESCE(instance_name, 'WhatsApp Principal') as name,
    CASE 
        WHEN status = 'connected' THEN 'active'
        WHEN status = 'disconnected' THEN 'inactive'
        ELSE 'error'
    END as status,
    jsonb_build_object(
        'instance_id', instance_id,
        'instance_name', instance_name,
        'phone_number', phone_number
    ) as credentials,
    created_at,
    updated_at
FROM whatsapp_instances
WHERE instance_id IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM channels c 
    WHERE c.credentials->>'instance_id' = whatsapp_instances.instance_id
)
ON CONFLICT DO NOTHING;

-- ============================================
-- MIGRAÇÃO 2: Criar tabela conversations
-- ============================================

CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    remote_jid VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'open' CHECK (status IN ('open', 'closed', 'pending', 'snoozed')),
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    unread_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, channel_id, remote_jid)
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_lead_id ON conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_conversations_channel_id ON conversations(channel_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_remote_jid ON conversations(remote_jid);
CREATE INDEX IF NOT EXISTS idx_conversations_unread ON conversations(unread_count) WHERE unread_count > 0;

DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
CREATE TRIGGER update_conversations_updated_at 
    BEFORE UPDATE ON conversations 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE conversations IS 'Gerencia as conversas individuais com leads/contatos através dos canais';

-- ============================================
-- MIGRAÇÃO 3: Atualizar tabela messages
-- ============================================

ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);

-- Função para atualizar contador de mensagens não lidas
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
    -- Se for mensagem recebida (in) e não lida
    IF NEW.direction = 'in' AND NEW.status != 'read' THEN
        UPDATE conversations 
        SET unread_count = unread_count + 1,
            last_message_at = NEW.created_at,
            updated_at = NOW()
        WHERE id = NEW.conversation_id;
    END IF;
    
    -- Se for mensagem enviada (out), apenas atualiza última mensagem
    IF NEW.direction = 'out' THEN
        UPDATE conversations 
        SET last_message_at = NEW.created_at,
            updated_at = NOW()
        WHERE id = NEW.conversation_id;
    END IF;
    
    -- Se mudou de não lida para lida
    IF TG_OP = 'UPDATE' AND NEW.direction = 'in' AND NEW.status = 'read' AND OLD.status != 'read' THEN
        UPDATE conversations 
        SET unread_count = GREATEST(0, unread_count - 1),
            updated_at = NOW()
        WHERE id = NEW.conversation_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_conversation_on_message_trigger ON messages;
CREATE TRIGGER update_conversation_on_message_trigger
    AFTER INSERT OR UPDATE ON messages
    FOR EACH ROW
    WHEN (NEW.conversation_id IS NOT NULL)
    EXECUTE FUNCTION update_conversation_on_message();

COMMENT ON COLUMN messages.conversation_id IS 'Referência para a conversa (inbox)';

-- ============================================
-- MIGRAÇÃO 4: Criar tabela ai_assistants
-- ============================================

CREATE TABLE IF NOT EXISTS ai_assistants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    mode VARCHAR(50) NOT NULL CHECK (mode IN ('webhook', 'llm')),
    webhook_url TEXT,
    webhook_headers JSONB,
    llm_provider VARCHAR(50) CHECK (llm_provider IN ('gemini', 'openai', 'anthropic')),
    llm_api_key TEXT,
    llm_model VARCHAR(100),
    llm_system_prompt TEXT,
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

CREATE INDEX IF NOT EXISTS idx_ai_assistants_user_id ON ai_assistants(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_assistants_channel_id ON ai_assistants(channel_id);
CREATE INDEX IF NOT EXISTS idx_ai_assistants_is_active ON ai_assistants(is_active);
CREATE INDEX IF NOT EXISTS idx_ai_assistants_mode ON ai_assistants(mode);

DROP TRIGGER IF EXISTS update_ai_assistants_updated_at ON ai_assistants;
CREATE TRIGGER update_ai_assistants_updated_at 
    BEFORE UPDATE ON ai_assistants 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE ai_assistants IS 'Gerencia os assistentes virtuais de IA para resposta automática';

-- ============================================
-- Verificação final
-- ============================================

SELECT 'Migrações executadas com sucesso!' as status;
SELECT 'Tabelas criadas:' as info;
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('channels', 'conversations', 'ai_assistants')
ORDER BY table_name;
