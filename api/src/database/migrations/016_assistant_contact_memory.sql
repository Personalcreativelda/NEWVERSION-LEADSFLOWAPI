-- Migration: Assistant Contact Memory
-- Creates the table to store long-term memory for AI assistants

CREATE TABLE IF NOT EXISTS assistant_contact_memory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_assistant_id UUID NOT NULL REFERENCES user_assistants(id) ON DELETE CASCADE,
    contact_phone VARCHAR(255) NOT NULL,
    contact_name VARCHAR(255),
    summary TEXT,
    preferences JSONB DEFAULT '{}',
    last_topics JSONB DEFAULT '[]',
    total_conversations INTEGER DEFAULT 1,
    first_contact_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_contact_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_assistant_id, contact_phone)
);

CREATE INDEX IF NOT EXISTS idx_assistant_memory_phone ON assistant_contact_memory(contact_phone);

-- Trigger for updated_at
DO $$ BEGIN
  CREATE TRIGGER update_assistant_contact_memory_updated_at BEFORE UPDATE ON assistant_contact_memory FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
