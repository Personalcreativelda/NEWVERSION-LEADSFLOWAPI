-- Migration 007: Add Twilio SMS channel type support
-- Created: 2024-01-XX
-- Description: Adds 'twilio_sms' to channels table CHECK constraint

-- Drop the existing CHECK constraint
ALTER TABLE channels DROP CONSTRAINT IF EXISTS channels_type_check;

-- Add new CHECK constraint including 'twilio_sms'
ALTER TABLE channels ADD CONSTRAINT channels_type_check
    CHECK (type IN ('whatsapp', 'whatsapp_cloud', 'facebook', 'instagram', 'telegram', 'email', 'website', 'twilio_sms'));

-- Optional: Add comment to document channel types
COMMENT ON COLUMN channels.type IS 'Channel type: whatsapp, whatsapp_cloud, facebook, instagram, telegram, email, website, twilio_sms';
