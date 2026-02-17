-- =====================================================
-- MIGRATION: 011 - Sistema de etiquetas para conversas
-- =====================================================
-- Permite que usuários criem e personalizem etiquetas
-- para categorizar conversas com flexibilidade total

-- =====================================================
-- Tabela: conversation_tags (Etiquetas disponíveis)
-- =====================================================
CREATE TABLE IF NOT EXISTS conversation_tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(20) DEFAULT '#3B82F6', -- Cor em hex (padrão: azul)
    icon VARCHAR(50), -- Ícone/emoji opcional (ex: "🔥", "⭐", etc)
    order_index INT DEFAULT 0, -- Ordem de exibição
    is_default BOOLEAN DEFAULT false, -- Vem pré-configurada na app
    description TEXT, -- Descrição opcional
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversation_tags_user_id ON conversation_tags(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_tags_order_index ON conversation_tags(user_id, order_index);

-- =====================================================
-- Tabela: conversation_tag_assignments (Atribuições)
-- =====================================================
-- Muitos-para-muitos: conversas podem ter múltiplas tags
CREATE TABLE IF NOT EXISTS conversation_tag_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES conversation_tags(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    assigned_by VARCHAR(100) DEFAULT 'system'
);

CREATE INDEX IF NOT EXISTS idx_conv_tag_assignments_conversation ON conversation_tag_assignments(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conv_tag_assignments_tag ON conversation_tag_assignments(tag_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_conv_tag_unique ON conversation_tag_assignments(conversation_id, tag_id);

-- =====================================================
-- Triggers
-- =====================================================
DROP TRIGGER IF EXISTS update_conversation_tags_updated_at ON conversation_tags;
CREATE TRIGGER update_conversation_tags_updated_at
    BEFORE UPDATE ON conversation_tags
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- Dados padrão: Tags iniciais padrão
-- =====================================================
-- Essas serão inseridas automaticamente quando um usuário é criado
-- (via aplicação) ou podem ser inseridas manualmente por usuário

-- =====================================================
-- Views
-- =====================================================

-- View: Conversas com suas tags
CREATE OR REPLACE VIEW conversations_with_tags AS
SELECT 
    c.id,
    c.user_id,
    c.lead_id,
    c.channel_id,
    c.remote_jid,
    c.status,
    c.unread_count,
    c.last_message_at,
    json_agg(
        json_build_object(
            'id', ct.id,
            'name', ct.name,
            'color', ct.color,
            'icon', ct.icon
        ) ORDER BY ct.order_index
    ) FILTER (WHERE ct.id IS NOT NULL) as tags
FROM conversations c
LEFT JOIN conversation_tag_assignments cta ON c.id = cta.conversation_id
LEFT JOIN conversation_tags ct ON cta.tag_id = ct.id
GROUP BY c.id;

-- View: Estatísticas de tags
CREATE OR REPLACE VIEW conversation_tags_stats AS
SELECT 
    ct.id,
    ct.user_id,
    ct.name,
    ct.color,
    COUNT(cta.id) as conversation_count,
    MAX(c.last_message_at) as last_used
FROM conversation_tags ct
LEFT JOIN conversation_tag_assignments cta ON ct.id = cta.tag_id
LEFT JOIN conversations c ON cta.conversation_id = c.id
GROUP BY ct.id, ct.user_id, ct.name, ct.color
ORDER BY ct.user_id, ct.order_index;

COMMIT;
