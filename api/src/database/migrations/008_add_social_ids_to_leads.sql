-- Migration: Add social media IDs to leads table
-- Date: 2024-01-15
-- Description: Add telegram_id, facebook_id, instagram_id columns for multi-channel inbox

-- Add telegram_id column
ALTER TABLE leads ADD COLUMN IF NOT EXISTS telegram_id VARCHAR(100);

-- Add facebook_id column
ALTER TABLE leads ADD COLUMN IF NOT EXISTS facebook_id VARCHAR(100);

-- Add instagram_id column
ALTER TABLE leads ADD COLUMN IF NOT EXISTS instagram_id VARCHAR(100);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_leads_telegram_id ON leads(telegram_id) WHERE telegram_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_facebook_id ON leads(facebook_id) WHERE facebook_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_instagram_id ON leads(instagram_id) WHERE instagram_id IS NOT NULL;

-- Add unique constraint per user to avoid duplicate leads
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_user_telegram ON leads(user_id, telegram_id) WHERE telegram_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_user_facebook ON leads(user_id, facebook_id) WHERE facebook_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_user_instagram ON leads(user_id, instagram_id) WHERE instagram_id IS NOT NULL;
