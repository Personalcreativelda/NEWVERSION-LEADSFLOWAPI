-- Migration 015: Link voice agents to WhatsApp channels for voice note AI responses
-- This enables: user sends voice note → AI agent responds with voice note (free via WhatsApp)

-- Table that links a voice agent to one or more WhatsApp channel instances
CREATE TABLE IF NOT EXISTS voice_agent_whatsapp_links (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voice_agent_id UUID NOT NULL REFERENCES voice_agents(id) ON DELETE CASCADE,
  channel_id     UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  -- When true the agent replies to EVERY audio message on this channel.
  -- When false it only replies when the conversation has ai_assistant enabled.
  always_respond BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(voice_agent_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_vawl_voice_agent ON voice_agent_whatsapp_links(voice_agent_id);
CREATE INDEX IF NOT EXISTS idx_vawl_channel     ON voice_agent_whatsapp_links(channel_id);
CREATE INDEX IF NOT EXISTS idx_vawl_user        ON voice_agent_whatsapp_links(user_id);

-- Store per-conversation voice session history (last N turns kept for context)
CREATE TABLE IF NOT EXISTS voice_note_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL,
  voice_agent_id  UUID NOT NULL REFERENCES voice_agents(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL,
  -- JSON array of { role: 'user'|'assistant', content: string, timestamp: ISO }
  history         JSONB NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(conversation_id, voice_agent_id)
);

CREATE INDEX IF NOT EXISTS idx_vns_conversation ON voice_note_sessions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_vns_agent        ON voice_note_sessions(voice_agent_id);
