-- Migration 013: Add voice settings to users table
-- Each user configures their own API keys

-- Add columns to users table for voice agent settings
ALTER TABLE users ADD COLUMN IF NOT EXISTS elevenlabs_api_key TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS voice_settings JSONB DEFAULT '{}'::jsonb;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_elevenlabs_key ON users(id) WHERE elevenlabs_api_key IS NOT NULL;

-- Add comments
COMMENT ON COLUMN users.elevenlabs_api_key IS 'User-specific ElevenLabs API key for voice synthesis';
COMMENT ON COLUMN users.voice_settings IS 'Additional voice-related settings per user (JSON)';
