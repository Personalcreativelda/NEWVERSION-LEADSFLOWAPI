-- =====================================================
-- MIGRATION: 010 - Sistema de rastreamento de leads
-- =====================================================
-- Adiciona campos para rastrear:
-- 1. Data de captura do lead (quando chegou)
-- 2. Canal de origem
-- 3. Histórico de mudanças de status
-- 4. Metadados do rastreamento

-- =====================================================
-- Adicionar colunas na tabela leads
-- =====================================================

-- Coluna: data de captura (quando o lead foi criado/capturado)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS captured_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Coluna: canal de origem detalhado (telegram, whatsapp_cloud, instagram, whatsapp, etc.)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS channel_source VARCHAR(255);

-- Coluna: ID do channel que capturou o lead
ALTER TABLE leads ADD COLUMN IF NOT EXISTS captured_by_channel_id UUID REFERENCES channels(id) ON DELETE SET NULL;

-- Coluna: metadata de rastreamento (JSON com informações adicionais)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tracking_metadata JSONB DEFAULT '{}'::jsonb;

-- Coluna: data da primeira conversão/status change
ALTER TABLE leads ADD COLUMN IF NOT EXISTS first_status_change_at TIMESTAMP WITH TIME ZONE;

-- =====================================================
-- Nova tabela: Lead Status History (histórico de mudanças)
-- =====================================================

CREATE TABLE IF NOT EXISTS lead_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    old_status VARCHAR(100),
    new_status VARCHAR(100) NOT NULL,
    reason VARCHAR(500),
    changed_by VARCHAR(100) DEFAULT 'system',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_status_history_lead_id ON lead_status_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_status_history_user_id ON lead_status_history(user_id);
CREATE INDEX IF NOT EXISTS idx_lead_status_history_created_at ON lead_status_history(created_at);

-- =====================================================
-- Nova tabela: Lead Interactions (rastreamento de interações)
-- =====================================================

CREATE TABLE IF NOT EXISTS lead_interactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    channel_id UUID REFERENCES channels(id) ON DELETE SET NULL,
    interaction_type VARCHAR(50) NOT NULL, -- 'message_received', 'message_sent', 'status_changed', 'call', 'email', etc.
    direction VARCHAR(10), -- 'in', 'out'
    content VARCHAR(1000),
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_interactions_lead_id ON lead_interactions(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_interactions_user_id ON lead_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_lead_interactions_created_at ON lead_interactions(created_at);
CREATE INDEX IF NOT EXISTS idx_lead_interactions_type ON lead_interactions(interaction_type);

-- =====================================================
-- Triggers
-- =====================================================

-- Trigger para atualizar timestamp updates
DROP TRIGGER IF EXISTS update_lead_status_history_updated_at ON lead_status_history;
CREATE TRIGGER update_lead_status_history_updated_at
    BEFORE UPDATE ON lead_status_history
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_lead_interactions_updated_at ON lead_interactions;
CREATE TRIGGER update_lead_interactions_updated_at
    BEFORE UPDATE ON lead_interactions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- Views úteis
-- =====================================================

-- View: Leads capturados hoje
CREATE OR REPLACE VIEW leads_captured_today AS
SELECT 
    l.id,
    l.user_id,
    l.name,
    l.email,
    l.phone,
    l.status,
    l.channel_source,
    l.captured_at,
    l.source,
    ch.type as channel_type,
    ch.name as channel_name,
    EXTRACT(HOUR FROM l.captured_at AT TIME ZONE 'America/Sao_Paulo') as hour_captured,
    COUNT(li.id) as interaction_count
FROM leads l
LEFT JOIN channels ch ON l.captured_by_channel_id = ch.id
LEFT JOIN lead_interactions li ON l.id = li.lead_id
WHERE DATE(l.captured_at AT TIME ZONE 'America/Sao_Paulo') = CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo'
GROUP BY l.id, l.user_id, l.name, l.email, l.phone, l.status, l.channel_source, l.captured_at, l.source, ch.type, ch.name
ORDER BY l.captured_at DESC;

-- View: Movimento de status por lead
CREATE OR REPLACE VIEW lead_status_movement AS
SELECT 
    l.id,
    l.user_id,
    l.name,
    l.status as current_status,
    lsh.old_status,
    lsh.new_status,
    lsh.changed_at,
    EXTRACT(DAY FROM NOW() - lsh.changed_at) as days_in_status,
    ROW_NUMBER() OVER (PARTITION BY l.id ORDER BY lsh.created_at DESC) as status_change_rank
FROM leads l
LEFT JOIN lead_status_history lsh ON l.id = lsh.lead_id
ORDER BY l.id, lsh.created_at DESC;

COMMIT;
