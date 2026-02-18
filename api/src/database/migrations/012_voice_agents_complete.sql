-- Migration 012: Create voice_agents tables (COMPLETE)
-- Execute this entire script in pgAdmin

-- 1. Create voice_agents table FIRST
CREATE TABLE IF NOT EXISTS voice_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    voice_provider VARCHAR(50) NOT NULL DEFAULT 'elevenlabs',
    voice_config JSONB DEFAULT '{}'::jsonb,
    call_provider VARCHAR(50) NOT NULL DEFAULT 'wavoip',
    call_config JSONB DEFAULT '{}'::jsonb,
    greeting_message TEXT,
    instructions TEXT,
    language VARCHAR(10) DEFAULT 'pt-BR',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Create indexes for voice_agents
CREATE INDEX IF NOT EXISTS idx_voice_agents_user_id ON voice_agents(user_id);
CREATE INDEX IF NOT EXISTS idx_voice_agents_is_active ON voice_agents(is_active);
CREATE INDEX IF NOT EXISTS idx_voice_agents_created_at ON voice_agents(created_at DESC);

-- 3. Create voice_agent_calls table SECOND (depends on voice_agents)
CREATE TABLE IF NOT EXISTS voice_agent_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    voice_agent_id UUID NOT NULL REFERENCES voice_agents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    phone_number VARCHAR(50) NOT NULL,
    direction VARCHAR(20) NOT NULL,
    status VARCHAR(50) NOT NULL,
    duration_seconds INTEGER DEFAULT 0,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    recording_url TEXT,
    transcript TEXT,
    call_provider_id VARCHAR(255),
    voice_provider_id VARCHAR(255),
    metadata JSONB DEFAULT '{}'::jsonb,
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 4. Create indexes for voice_agent_calls
CREATE INDEX IF NOT EXISTS idx_voice_agent_calls_agent_id ON voice_agent_calls(voice_agent_id);
CREATE INDEX IF NOT EXISTS idx_voice_agent_calls_user_id ON voice_agent_calls(user_id);
CREATE INDEX IF NOT EXISTS idx_voice_agent_calls_lead_id ON voice_agent_calls(lead_id);
CREATE INDEX IF NOT EXISTS idx_voice_agent_calls_status ON voice_agent_calls(status);
CREATE INDEX IF NOT EXISTS idx_voice_agent_calls_created_at ON voice_agent_calls(created_at DESC);

-- 5. Add comments
COMMENT ON TABLE voice_agents IS 'Voice AI agents for automated calling using ElevenLabs voice + Wavoip calls';
COMMENT ON TABLE voice_agent_calls IS 'Log of all calls made/received by voice agents';
