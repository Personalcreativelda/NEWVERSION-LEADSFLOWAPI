-- INBOX: Migração 2 - Criar tabela de conversas (conversations)
-- Esta tabela gerencia as conversas individuais com leads/contatos

CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    remote_jid VARCHAR(255) NOT NULL, -- WhatsApp JID, Facebook PSID, Instagram ID, etc
    status VARCHAR(50) DEFAULT 'open' CHECK (status IN ('open', 'closed', 'pending', 'snoozed')),
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    unread_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, channel_id, remote_jid)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_lead_id ON conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_conversations_channel_id ON conversations(channel_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_remote_jid ON conversations(remote_jid);
CREATE INDEX IF NOT EXISTS idx_conversations_unread ON conversations(unread_count) WHERE unread_count > 0;

-- Trigger para atualizar updated_at automaticamente
CREATE TRIGGER update_conversations_updated_at 
    BEFORE UPDATE ON conversations 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Comentários de documentação
COMMENT ON TABLE conversations IS 'Gerencia as conversas individuais com leads/contatos através dos canais';
COMMENT ON COLUMN conversations.remote_jid IS 'Identificador remoto (WhatsApp JID, Facebook PSID, etc)';
COMMENT ON COLUMN conversations.status IS 'Status da conversa: open, closed, pending, snoozed';
COMMENT ON COLUMN conversations.assigned_to IS 'Usuário responsável pela conversa (para equipes)';
COMMENT ON COLUMN conversations.metadata IS 'Metadados adicionais (contact_name, phone, email, tags, etc)';
