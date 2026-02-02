-- Email Campaigns - VERSÃO MÍNIMA (só a tabela)
-- Execute APENAS isto primeiro

CREATE TABLE IF NOT EXISTS email_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    campaign_name VARCHAR(255) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    from_email VARCHAR(255) NOT NULL,
    from_name VARCHAR(255),
    message TEXT,
    html_content TEXT,
    is_html BOOLEAN DEFAULT false,
    recipient_mode VARCHAR(50) NOT NULL,
    selected_statuses TEXT[],
    custom_emails TEXT,
    recipient_count INTEGER DEFAULT 0,
    schedule_mode VARCHAR(50) DEFAULT 'now',
    scheduled_date DATE,
    scheduled_time TIME,
    scheduled_datetime TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'draft',
    sent_count INTEGER DEFAULT 0,
    delivered_count INTEGER DEFAULT 0,
    opened_count INTEGER DEFAULT 0,
    clicked_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    attachments JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sent_at TIMESTAMP WITH TIME ZONE
);
