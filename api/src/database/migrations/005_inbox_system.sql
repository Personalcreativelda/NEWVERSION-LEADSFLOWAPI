-- INBOX: Migração 5 - Sistema de Inbox Completo
-- Esta migração garante que todas as tabelas necessárias para o inbox existam

-- Criar extensão UUID se não existir
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- =====================================================
-- TABELA: channels (canais de comunicação)
-- =====================================================
CREATE TABLE IF NOT EXISTS channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('whatsapp', 'whatsapp_cloud', 'facebook', 'instagram', 'telegram')),
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'error', 'connecting')),
    provider VARCHAR(50) DEFAULT 'evolution_api',
    credentials JSONB DEFAULT '{}',
    settings JSONB DEFAULT '{}',
    last_sync_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channels_user_id ON channels(user_id);
CREATE INDEX IF NOT EXISTS idx_channels_type ON channels(type);
CREATE INDEX IF NOT EXISTS idx_channels_status ON channels(status);

-- Trigger para atualizar updated_at
DROP TRIGGER IF EXISTS update_channels_updated_at ON channels;
CREATE TRIGGER update_channels_updated_at 
    BEFORE UPDATE ON channels 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- TABELA: conversations (conversas)
-- =====================================================
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    channel_id UUID REFERENCES channels(id) ON DELETE SET NULL,
    remote_jid VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'open' CHECK (status IN ('open', 'closed', 'pending', 'snoozed')),
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    unread_count INTEGER DEFAULT 0,
    is_group BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_lead_id ON conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_conversations_channel_id ON conversations(channel_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_remote_jid ON conversations(remote_jid);
CREATE INDEX IF NOT EXISTS idx_conversations_unread ON conversations(unread_count) WHERE unread_count > 0;

-- Unique constraint para evitar conversas duplicadas
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_unique 
    ON conversations(user_id, channel_id, remote_jid) 
    WHERE channel_id IS NOT NULL;

-- Trigger para atualizar updated_at
DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
CREATE TRIGGER update_conversations_updated_at 
    BEFORE UPDATE ON conversations 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- TABELA: messages (mensagens)
-- =====================================================
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    contact_id UUID,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    campaign_id UUID,
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('in', 'out')),
    channel VARCHAR(50) NOT NULL DEFAULT 'whatsapp',
    content TEXT,
    media_url TEXT,
    media_type VARCHAR(50),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
    external_id VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_lead_id ON messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_messages_direction ON messages(direction);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_external_id ON messages(external_id);

-- Trigger para atualizar updated_at
DROP TRIGGER IF EXISTS update_messages_updated_at ON messages;
CREATE TRIGGER update_messages_updated_at 
    BEFORE UPDATE ON messages 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- FUNÇÃO: Atualizar conversa quando mensagem é inserida
-- =====================================================
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
    -- Atualizar last_message_at da conversa
    UPDATE conversations 
    SET last_message_at = NEW.created_at,
        updated_at = NOW()
    WHERE id = NEW.conversation_id;
    
    -- Se for mensagem recebida (in) e não lida, incrementar contador
    IF NEW.direction = 'in' AND NEW.status != 'read' THEN
        UPDATE conversations 
        SET unread_count = unread_count + 1
        WHERE id = NEW.conversation_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para atualizar conversa
DROP TRIGGER IF EXISTS update_conversation_on_message_trigger ON messages;
CREATE TRIGGER update_conversation_on_message_trigger
    AFTER INSERT ON messages
    FOR EACH ROW
    WHEN (NEW.conversation_id IS NOT NULL)
    EXECUTE FUNCTION update_conversation_on_message();

-- =====================================================
-- FUNÇÃO: Decrementar não lidas quando status muda para read
-- =====================================================
CREATE OR REPLACE FUNCTION update_conversation_on_message_read()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.direction = 'in' AND NEW.status = 'read' AND OLD.status != 'read' THEN
        UPDATE conversations 
        SET unread_count = GREATEST(0, unread_count - 1),
            updated_at = NOW()
        WHERE id = NEW.conversation_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_conversation_on_message_read_trigger ON messages;
CREATE TRIGGER update_conversation_on_message_read_trigger
    AFTER UPDATE ON messages
    FOR EACH ROW
    WHEN (NEW.conversation_id IS NOT NULL)
    EXECUTE FUNCTION update_conversation_on_message_read();

-- =====================================================
-- Comentários de documentação
-- =====================================================
COMMENT ON TABLE channels IS 'Canais de comunicação (WhatsApp, Instagram, etc)';
COMMENT ON TABLE conversations IS 'Conversas com leads/contatos - apenas conversas com histórico real';
COMMENT ON TABLE messages IS 'Mensagens enviadas e recebidas';
COMMENT ON COLUMN conversations.remote_jid IS 'Identificador remoto (WhatsApp JID, etc)';
COMMENT ON COLUMN conversations.unread_count IS 'Contador de mensagens não lidas';
COMMENT ON COLUMN messages.conversation_id IS 'Referência para a conversa no inbox';
