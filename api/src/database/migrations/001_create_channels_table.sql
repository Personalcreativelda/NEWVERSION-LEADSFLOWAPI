-- INBOX: Migração 1 - Criar tabela de canais (channels)
-- Esta tabela gerencia os canais de comunicação (WhatsApp, Facebook, Instagram, etc)

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

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_channels_user_id ON channels(user_id);
CREATE INDEX IF NOT EXISTS idx_channels_type ON channels(type);
CREATE INDEX IF NOT EXISTS idx_channels_status ON channels(status);

-- Trigger para atualizar updated_at automaticamente
CREATE TRIGGER update_channels_updated_at 
    BEFORE UPDATE ON channels 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Migrar instâncias WhatsApp existentes para channels
-- Isso garante compatibilidade com o sistema atual
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
ON CONFLICT DO NOTHING;

-- Comentário de documentação
COMMENT ON TABLE channels IS 'Gerencia os canais de comunicação integrados (WhatsApp, Facebook, Instagram, etc)';
COMMENT ON COLUMN channels.type IS 'Tipo do canal: whatsapp, facebook, instagram, telegram';
COMMENT ON COLUMN channels.status IS 'Status da conexão: active, inactive, error, connecting';
COMMENT ON COLUMN channels.credentials IS 'Credenciais do canal (criptografadas quando necessário)';
COMMENT ON COLUMN channels.settings IS 'Configurações específicas do canal (auto_reply, business_hours, etc)';
