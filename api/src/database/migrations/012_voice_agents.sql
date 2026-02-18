-- Migration 012: Create voice_agents table for ElevenLabs + Wavoip integration
-- Created: 2025-01-XX
-- Description: Adds voice agents table to support AI voice calling agents

-- Create voice_agents table
CREATE TABLE IF NOT EXISTS voice_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Agent info
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Voice provider (ElevenLabs)
    voice_provider VARCHAR(50) NOT NULL DEFAULT 'elevenlabs',
    voice_config JSONB DEFAULT '{}'::jsonb, -- { voice_id, model, stability, similarity_boost, etc }
    
    -- Call provider (Wavoip)
    call_provider VARCHAR(50) NOT NULL DEFAULT 'wavoip',
    call_config JSONB DEFAULT '{}'::jsonb, -- { api_key, from_number, etc }
    
    -- Agent behavior
    greeting_message TEXT,
    instructions TEXT, -- System instructions for the AI
    language VARCHAR(10) DEFAULT 'pt-BR',
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_voice_agents_user_id ON voice_agents(user_id);
CREATE INDEX IF NOT EXISTS idx_voice_agents_is_active ON voice_agents(is_active);
CREATE INDEX IF NOT EXISTS idx_voice_agents_created_at ON voice_agents(created_at DESC);

-- Create call_logs table for tracking voice agent calls
CREATE TABLE IF NOT EXISTS voice_agent_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    voice_agent_id UUID NOT NULL REFERENCES voice_agents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Call info
    phone_number VARCHAR(50) NOT NULL,
    direction VARCHAR(20) NOT NULL, -- 'outbound' or 'inbound'
    status VARCHAR(50) NOT NULL, -- 'initiated', 'ringing', 'answered', 'completed', 'failed', 'no-answer', 'busy'
    duration_seconds INTEGER DEFAULT 0,
    
    -- Context
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    
    -- Recording & transcript
    recording_url TEXT,
    transcript TEXT,
    
    -- Provider IDs
    call_provider_id VARCHAR(255), -- Wavoip call ID
    voice_provider_id VARCHAR(255), -- ElevenLabs session ID
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for call logs
CREATE INDEX IF NOT EXISTS idx_voice_agent_calls_agent_id ON voice_agent_calls(voice_agent_id);
CREATE INDEX IF NOT EXISTS idx_voice_agent_calls_user_id ON voice_agent_calls(user_id);
CREATE INDEX IF NOT EXISTS idx_voice_agent_calls_lead_id ON voice_agent_calls(lead_id);
CREATE INDEX IF NOT EXISTS idx_voice_agent_calls_status ON voice_agent_calls(status);
CREATE INDEX IF NOT EXISTS idx_voice_agent_calls_created_at ON voice_agent_calls(created_at DESC);

-- Add comment
COMMENT ON TABLE voice_agents IS 'Voice AI agents for automated calling using ElevenLabs voice + Wavoip calls';
COMMENT ON TABLE voice_agent_calls IS 'Log of all calls made/received by voice agents';
