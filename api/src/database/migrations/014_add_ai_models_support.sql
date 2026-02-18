-- Migration 014: Add support for multiple AI model API keys
-- Execute this migration to add columns for OpenAI, Anthropic, and Google API keys

-- Add new columns to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS openai_api_key TEXT,
ADD COLUMN IF NOT EXISTS anthropic_api_key TEXT,
ADD COLUMN IF NOT EXISTS google_api_key TEXT,
ADD COLUMN IF NOT EXISTS preferred_ai_model VARCHAR(50) DEFAULT 'elevenlabs';

-- Add comment explaining the new fields
COMMENT ON COLUMN users.openai_api_key IS 'OpenAI API key for GPT models (sk-...)';
COMMENT ON COLUMN users.anthropic_api_key IS 'Anthropic API key for Claude models (sk-ant-...)';
COMMENT ON COLUMN users.google_api_key IS 'Google API key for Gemini models (AIza...)';
COMMENT ON COLUMN users.preferred_ai_model IS 'Preferred AI model: elevenlabs | openai | anthropic | google';

-- Log migration execution
DO $$
BEGIN
  INSERT INTO migrations (name, executed_at) VALUES ('014_add_ai_models_support', NOW());
  RAISE NOTICE 'Migration 014: Added AI models support (OpenAI, Anthropic, Google)';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Migration 014: Columns may already exist, skipping insert';
END $$;
