-- Email Campaigns Schema - VERSÃO SIMPLIFICADA SEM TRIGGER
-- Execute este se o outro ainda der erro

CREATE TABLE IF NOT EXISTS email_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    
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
    recipient_mode VARCHAR(50) NOT NULL,
    selected_statuses TEXT[],
    custom_emails TEXT,
    recipient_count INTEGER DEFAULT 0,
    
    -- Scheduling
    schedule_mode VARCHAR(50) DEFAULT 'now',
    scheduled_date DATE,
    scheduled_time TIME,
    scheduled_datetime TIMESTAMP WITH TIME ZONE,
    
    -- Status & Stats
    status VARCHAR(50) DEFAULT 'draft',
    sent_count INTEGER DEFAULT 0,
    delivered_count INTEGER DEFAULT 0,
    opened_count INTEGER DEFAULT 0,
    clicked_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    
    -- Metadata
    attachments JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sent_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_email_campaigns_user_id ON email_campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_status ON email_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_scheduled_datetime ON email_campaigns(scheduled_datetime);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_created_at ON email_campaigns(created_at DESC);
