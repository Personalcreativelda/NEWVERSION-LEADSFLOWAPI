-- App version table for dynamic version management
CREATE TABLE IF NOT EXISTS app_version (
    id SERIAL PRIMARY KEY,
    version VARCHAR(50) NOT NULL,
    release_notes TEXT,
    is_current BOOLEAN DEFAULT false,
    notify_users BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create unique partial index to ensure only one current version
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_version_current ON app_version(is_current) WHERE is_current = true;

-- Insert initial version
INSERT INTO app_version (version, release_notes, is_current, notify_users)
VALUES ('1.0.0', 'Versão inicial do LeadsFlow CRM', true, false)
ON CONFLICT DO NOTHING;

-- User version notifications - tracks which users have seen which version notification
CREATE TABLE IF NOT EXISTS user_version_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    version_id INTEGER REFERENCES app_version(id) ON DELETE CASCADE,
    seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, version_id)
);
