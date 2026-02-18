-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    avatar_url TEXT,
    role VARCHAR(50) DEFAULT 'user',
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    two_factor_enabled BOOLEAN DEFAULT false,
    two_factor_secret VARCHAR(255),
    two_factor_backup_codes TEXT[],
    plan VARCHAR(50) DEFAULT 'free',
    subscription_plan VARCHAR(50) DEFAULT 'free',
    plan_limits JSONB DEFAULT '{"leads": 100, "messages": 100, "massMessages": 200}',
    plan_expires_at TIMESTAMP WITH TIME ZONE,
    trial_ends_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Leads table
CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    whatsapp VARCHAR(50),
    company VARCHAR(255),
    position VARCHAR(255),
    source VARCHAR(100),
    status VARCHAR(50) DEFAULT 'novo',
    score INTEGER DEFAULT 0,
    tags TEXT[],
    notes TEXT,
    custom_fields JSONB DEFAULT '{}',
    last_contact_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Contacts table
CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    whatsapp VARCHAR(50),
    company VARCHAR(255),
    position VARCHAR(255),
    address TEXT,
    city VARCHAR(100),
    country VARCHAR(100),
    notes TEXT,
    custom_fields JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Campaigns table
CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'draft',
    template TEXT,
    settings JSONB DEFAULT '{}',
    scheduled_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    stats JSONB DEFAULT '{"sent": 0, "delivered": 0, "read": 0, "replied": 0, "failed": 0}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Messages table
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    direction VARCHAR(20) NOT NULL,
    channel VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    media_url TEXT,
    media_type VARCHAR(50),
    status VARCHAR(50) DEFAULT 'pending',
    external_id VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- WhatsApp instances table
CREATE TABLE whatsapp_instances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    instance_name VARCHAR(255) NOT NULL,
    instance_id VARCHAR(255) UNIQUE,
    status VARCHAR(50) DEFAULT 'disconnected',
    phone_number VARCHAR(50),
    qr_code TEXT,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Message templates table
CREATE TABLE message_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    content TEXT NOT NULL,
    variables TEXT[],
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tags table
CREATE TABLE tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(20) DEFAULT '#3B82F6',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Activities table
CREATE TABLE activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
    type VARCHAR(100) NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sessions table
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- API tokens table
CREATE TABLE api_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    token_prefix VARCHAR(20) NOT NULL,
    scopes TEXT[] DEFAULT ARRAY['read', 'write'],
    last_used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Plans table
CREATE TABLE plans (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price_monthly DECIMAL(10, 2) NOT NULL DEFAULT 0,
    price_annual DECIMAL(10, 2) NOT NULL DEFAULT 0,
    payment_link_monthly VARCHAR(500),
    payment_link_annual VARCHAR(500),
    features JSONB NOT NULL DEFAULT '[]',
    limits JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notifications table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(50),
    is_read BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Settings table
CREATE TABLE settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    key VARCHAR(255) NOT NULL,
    value JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, key)
);

-- Lead notes table (multiple notes per lead)
CREATE TABLE IF NOT EXISTS lead_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Scheduled conversations table
CREATE TABLE IF NOT EXISTS scheduled_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add deal_value column to leads table
DO $$ BEGIN
  ALTER TABLE leads ADD COLUMN deal_value DECIMAL(12,2) DEFAULT 0;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lead_notes_lead_id ON lead_notes(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_notes_user_id ON lead_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_conversations_lead_id ON scheduled_conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_conversations_user_id ON scheduled_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_conversations_scheduled_at ON scheduled_conversations(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_messages_lead_id ON messages(lead_id);
CREATE INDEX idx_leads_user_id ON leads(user_id);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX idx_contacts_user_id ON contacts(user_id);
CREATE INDEX idx_contacts_lead_id ON contacts(lead_id);
CREATE INDEX idx_messages_user_id ON messages(user_id);
CREATE INDEX idx_messages_contact_id ON messages(contact_id);
CREATE INDEX idx_messages_campaign_id ON messages(campaign_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX idx_campaigns_user_id ON campaigns(user_id);
CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_activities_lead_id ON activities(lead_id);
CREATE INDEX idx_activities_contact_id ON activities(contact_id);
CREATE INDEX idx_api_tokens_user_id ON api_tokens(user_id);
CREATE INDEX idx_api_tokens_token_hash ON api_tokens(token_hash);
CREATE INDEX idx_api_tokens_token_prefix ON api_tokens(token_prefix);
CREATE INDEX idx_plans_is_active ON plans(is_active);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX idx_users_plan ON users(plan);
CREATE INDEX idx_users_plan_expires_at ON users(plan_expires_at);

-- Insert default plans
INSERT INTO plans (id, name, description, price_monthly, price_annual, features, limits) VALUES
('free', 'Free', 'Plano gratuito para começar', 0, 0, 
  '["100 leads", "100 mensagens individuais/mês", "200 mensagens em massa/mês", "3 campanhas ativas", "Suporte básico"]'::jsonb,
  '{"leads": 100, "messages": 100, "massMessages": 200}'::jsonb
),
('business', 'Business', 'Para pequenos negócios', 20, 100,
  '["500 leads", "500 mensagens individuais/mês", "1.000 mensagens em massa/mês", "50 campanhas ativas", "Suporte prioritário", "Integrações avançadas"]'::jsonb,
  '{"leads": 500, "messages": 500, "massMessages": 1000}'::jsonb
),
('enterprise', 'Enterprise', 'Para empresas em crescimento', 59, 200,
  '["Leads ilimitados", "Mensagens individuais ilimitadas", "Mensagens em massa ilimitadas", "Campanhas ilimitadas", "Suporte VIP 24/7", "API dedicada", "Gestor de conta"]'::jsonb,
  '{"leads": -1, "messages": -1, "massMessages": -1}'::jsonb
);

-- Trigger helper
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_whatsapp_instances_updated_at BEFORE UPDATE ON whatsapp_instances FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_message_templates_updated_at BEFORE UPDATE ON message_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_notifications_updated_at BEFORE UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_api_tokens_updated_at BEFORE UPDATE ON api_tokens FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DO $$ BEGIN
  CREATE TRIGGER update_lead_notes_updated_at BEFORE UPDATE ON lead_notes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER update_scheduled_conversations_updated_at BEFORE UPDATE ON scheduled_conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AI Assistants table (available assistants/products)
CREATE TABLE IF NOT EXISTS assistants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    short_description VARCHAR(500),
    icon VARCHAR(100) DEFAULT 'bot',
    color VARCHAR(20) DEFAULT '#3B82F6',
    category VARCHAR(100) DEFAULT 'general',
    features TEXT[],
    price_monthly DECIMAL(10, 2) DEFAULT 0,
    price_annual DECIMAL(10, 2) DEFAULT 0,
    is_free BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    is_featured BOOLEAN DEFAULT false,
    is_custom BOOLEAN DEFAULT false,
    created_by UUID,
    n8n_webhook_url TEXT,
    default_config JSONB DEFAULT '{}',
    required_channels TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User's connected assistants
CREATE TABLE IF NOT EXISTS user_assistants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    assistant_id UUID REFERENCES assistants(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    is_configured BOOLEAN DEFAULT false,
    config JSONB DEFAULT '{}',
    channel_id UUID,
    channel_ids UUID[] DEFAULT '{}',
    n8n_workflow_id VARCHAR(255),
    last_triggered_at TIMESTAMP WITH TIME ZONE,
    stats JSONB DEFAULT '{"conversations": 0, "messages_sent": 0, "messages_received": 0}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, assistant_id)
);

-- Assistant conversation logs (for analytics)
CREATE TABLE IF NOT EXISTS assistant_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_assistant_id UUID REFERENCES user_assistants(id) ON DELETE CASCADE,
    conversation_id VARCHAR(255),
    contact_phone VARCHAR(50),
    contact_name VARCHAR(255),
    message_in TEXT,
    message_out TEXT,
    tokens_used INTEGER DEFAULT 0,
    response_time_ms INTEGER,
    status VARCHAR(50) DEFAULT 'success',
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for assistants
CREATE INDEX IF NOT EXISTS idx_assistants_slug ON assistants(slug);
CREATE INDEX IF NOT EXISTS idx_assistants_category ON assistants(category);
CREATE INDEX IF NOT EXISTS idx_assistants_is_active ON assistants(is_active);
CREATE INDEX IF NOT EXISTS idx_user_assistants_user_id ON user_assistants(user_id);
CREATE INDEX IF NOT EXISTS idx_user_assistants_assistant_id ON user_assistants(assistant_id);
CREATE INDEX IF NOT EXISTS idx_user_assistants_is_active ON user_assistants(is_active);
CREATE INDEX IF NOT EXISTS idx_assistant_logs_user_assistant_id ON assistant_logs(user_assistant_id);
CREATE INDEX IF NOT EXISTS idx_assistant_logs_created_at ON assistant_logs(created_at DESC);

-- Triggers for assistants
DO $$ BEGIN
  CREATE TRIGGER update_assistants_updated_at BEFORE UPDATE ON assistants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER update_user_assistants_updated_at BEFORE UPDATE ON user_assistants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Insert default assistants
INSERT INTO assistants (name, slug, description, short_description, icon, color, category, features, price_monthly, is_free, is_active, is_featured, default_config) VALUES
('Assistente de Vendas', 'sales-assistant',
  'Assistente de IA especializado em vendas que qualifica leads, responde perguntas sobre produtos e agenda reuniões automaticamente.',
  'Qualifica leads e agenda reuniões automaticamente',
  'briefcase', '#10B981', 'sales',
  ARRAY['Qualificação automática de leads', 'Respostas sobre produtos', 'Agendamento de reuniões', 'Follow-up automático'],
  0, true, true, true,
  '{"greeting": "Olá! Sou o assistente de vendas. Como posso ajudar?", "qualification_questions": [], "products": []}'::jsonb
),
('Suporte ao Cliente', 'support-assistant',
  'Assistente de IA para suporte ao cliente que responde dúvidas frequentes, cria tickets e escala para atendentes humanos quando necessário.',
  'Responde dúvidas e cria tickets automaticamente',
  'headphones', '#6366F1', 'support',
  ARRAY['FAQ automático', 'Criação de tickets', 'Escalação inteligente', 'Histórico de conversas'],
  29.90, false, true, true,
  '{"greeting": "Olá! Sou o assistente de suporte. Em que posso ajudar?", "faq": [], "escalation_keywords": []}'::jsonb
),
('Agendamento Inteligente', 'scheduling-assistant',
  'Assistente de IA para agendamento de consultas, reuniões e serviços com integração ao calendário.',
  'Agenda consultas e reuniões automaticamente',
  'calendar', '#F59E0B', 'scheduling',
  ARRAY['Agendamento 24/7', 'Confirmação automática', 'Lembretes por WhatsApp', 'Reagendamento fácil'],
  19.90, false, true, false,
  '{"greeting": "Olá! Posso ajudar você a agendar um horário.", "available_slots": [], "duration_minutes": 30}'::jsonb
),
('Captação de Leads', 'lead-capture-assistant',
  'Assistente de IA focado em capturar informações de leads e nutri-los com conteúdo relevante.',
  'Captura e nutre leads automaticamente',
  'users', '#EC4899', 'marketing',
  ARRAY['Captura de dados', 'Nutrição de leads', 'Segmentação automática', 'Envio de materiais'],
  24.90, false, true, false,
  '{"greeting": "Olá! Gostaria de receber mais informações?", "capture_fields": ["name", "email", "phone"], "materials": []}'::jsonb
),
('Assistente de Pedidos', 'orders-assistant',
  'Assistente de IA para receber pedidos, mostrar cardápio/catálogo e processar vendas via WhatsApp.',
  'Recebe pedidos e processa vendas',
  'shopping-cart', '#EF4444', 'ecommerce',
  ARRAY['Catálogo digital', 'Carrinho de compras', 'Cálculo de frete', 'Pagamento integrado'],
  39.90, false, true, false,
  '{"greeting": "Olá! Bem-vindo à nossa loja. Posso ajudar com seu pedido?", "catalog": [], "payment_methods": []}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- Migrations: add new columns to existing tables (safe to re-run)
ALTER TABLE assistants ADD COLUMN IF NOT EXISTS is_custom BOOLEAN DEFAULT false;
ALTER TABLE assistants ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE user_assistants ADD COLUMN IF NOT EXISTS channel_ids UUID[] DEFAULT '{}';

-- =====================================================
-- VOICE AGENTS (ElevenLabs + Wavoip Integration)
-- =====================================================

-- Voice Agents table
CREATE TABLE IF NOT EXISTS voice_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Agent info
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Voice provider (ElevenLabs)
    voice_provider VARCHAR(50) NOT NULL DEFAULT 'elevenlabs',
    voice_config JSONB DEFAULT '{}'::jsonb,
    
    -- Call provider (Wavoip)
    call_provider VARCHAR(50) NOT NULL DEFAULT 'wavoip',
    call_config JSONB DEFAULT '{}'::jsonb,
    
    -- Agent behavior
    greeting_message TEXT,
    instructions TEXT,
    language VARCHAR(10) DEFAULT 'pt-BR',
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Voice Agent Calls table
CREATE TABLE IF NOT EXISTS voice_agent_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    voice_agent_id UUID NOT NULL REFERENCES voice_agents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Call info
    phone_number VARCHAR(50) NOT NULL,
    direction VARCHAR(20) NOT NULL,
    status VARCHAR(50) NOT NULL,
    duration_seconds INTEGER DEFAULT 0,
    
    -- Context
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    
    -- Recording & transcript
    recording_url TEXT,
    transcript TEXT,
    
    -- Provider IDs
    call_provider_id VARCHAR(255),
    voice_provider_id VARCHAR(255),
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for voice agents
CREATE INDEX IF NOT EXISTS idx_voice_agents_user_id ON voice_agents(user_id);
CREATE INDEX IF NOT EXISTS idx_voice_agents_is_active ON voice_agents(is_active);
CREATE INDEX IF NOT EXISTS idx_voice_agents_created_at ON voice_agents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_voice_agent_calls_agent_id ON voice_agent_calls(voice_agent_id);
CREATE INDEX IF NOT EXISTS idx_voice_agent_calls_user_id ON voice_agent_calls(user_id);
CREATE INDEX IF NOT EXISTS idx_voice_agent_calls_lead_id ON voice_agent_calls(lead_id);
CREATE INDEX IF NOT EXISTS idx_voice_agent_calls_status ON voice_agent_calls(status);
CREATE INDEX IF NOT EXISTS idx_voice_agent_calls_created_at ON voice_agent_calls(created_at DESC);

-- Triggers for voice agents
DO $$ BEGIN
  CREATE TRIGGER update_voice_agents_updated_at BEFORE UPDATE ON voice_agents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Comments
COMMENT ON TABLE voice_agents IS 'Voice AI agents for automated calling using ElevenLabs voice + Wavoip calls';
COMMENT ON TABLE voice_agent_calls IS 'Log of all calls made/received by voice agents';