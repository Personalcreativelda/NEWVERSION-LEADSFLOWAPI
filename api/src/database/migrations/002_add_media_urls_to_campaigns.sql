-- Migration: Add media_urls array to campaigns table
-- This allows storing uploaded media (images, videos, documents) URLs

-- Add media_urls column if it doesn't exist
ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS media_urls TEXT[] DEFAULT '{}';

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_campaigns_media_urls ON campaigns USING GIN (media_urls);

-- Add comment
COMMENT ON COLUMN campaigns.media_urls IS 'Array of media file URLs (images, videos, PDFs) uploaded for this campaign';
