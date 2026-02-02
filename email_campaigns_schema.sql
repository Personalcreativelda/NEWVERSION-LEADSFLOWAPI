-- Email Campaigns Schema
-- This extends the generic campaigns table with email-specific fields
-- Attachments are stored in MinIO, paths stored in JSONB

CREATE TABLE IF NOT EXISTS email_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- Email specific fields
    campaign_name VARCHAR(255) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    from_email VARCHAR(255) NOT NULL,
    from_name VARCHAR(255),
    
    -- Content
    message TEXT,
    html_content TEXT,
    is_html BOOLEAN DEFAULT false,
    
    -- Recipients
    recipient_mode VARCHAR(50) NOT NULL, -- 'all', 'segments', 'custom'
    selected_statuses TEXT[], -- for segment mode ['novo', 'qualificado', etc]
    custom_emails TEXT, -- comma-separated for custom mode
    recipient_count INTEGER DEFAULT 0,
    
    -- Scheduling
    schedule_mode VARCHAR(50) DEFAULT 'now', -- 'now', 'scheduled'
    scheduled_date DATE,
    scheduled_time TIME,
    scheduled_datetime TIMESTAMP WITH TIME ZONE,
    
    -- Status & Stats
    status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'scheduled', 'sending', 'sent', 'failed'
    sent_count INTEGER DEFAULT 0,
    delivered_count INTEGER DEFAULT 0,
    opened_count INTEGER DEFAULT 0,
    clicked_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    
    -- Metadata
    attachments JSONB DEFAULT '[]', -- [{name, size, type, minio_path, url}]
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sent_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_email_campaigns_user_id ON email_campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_status ON email_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_scheduled_datetime ON email_campaigns(scheduled_datetime);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_created_at ON email_campaigns(created_at DESC);

-- Trigger for updated_at
CREATE TRIGGER update_email_campaigns_updated_at 
    BEFORE UPDATE ON email_campaigns 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE email_campaigns IS 'Stores email marketing campaigns with MinIO attachment support';
COMMENT ON COLUMN email_campaigns.attachments IS 'JSONB array of attachment metadata: [{name, size, type, minio_path, url}]';
COMMENT ON COLUMN email_campaigns.recipient_mode IS 'How recipients are selected: all, segments, or custom list';
COMMENT ON COLUMN email_campaigns.status IS 'Campaign lifecycle: draft → scheduled/sending → sent/failed';
