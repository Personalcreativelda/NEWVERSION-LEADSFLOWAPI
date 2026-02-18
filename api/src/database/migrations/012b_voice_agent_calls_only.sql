-- Migration 012b: Create voice_agent_calls table only
-- This is a fix for completing the voice agents migration

-- Create call_logs table for tracking voice agent calls
CREATE TABLE voice_agent_calls (
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
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for call logs
CREATE INDEX idx_voice_agent_calls_agent_id ON voice_agent_calls(voice_agent_id);
CREATE INDEX idx_voice_agent_calls_user_id ON voice_agent_calls(user_id);
CREATE INDEX idx_voice_agent_calls_lead_id ON voice_agent_calls(lead_id);
CREATE INDEX idx_voice_agent_calls_status ON voice_agent_calls(status);
CREATE INDEX idx_voice_agent_calls_created_at ON voice_agent_calls(created_at DESC);

-- Add comment
COMMENT ON TABLE voice_agent_calls IS 'Log of all calls made/received by voice agents';
