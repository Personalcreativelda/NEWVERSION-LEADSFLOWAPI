-- Add plan columns to users table if they don't exist
ALTER TABLE users
ADD COLUMN IF NOT EXISTS plan VARCHAR(50) DEFAULT 'free' REFERENCES plans(id),
ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(50) DEFAULT 'free',
ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP WITH TIME ZONE;

-- Create index for plan lookups
CREATE INDEX IF NOT EXISTS idx_users_plan ON users(plan);
CREATE INDEX IF NOT EXISTS idx_users_plan_expires_at ON users(plan_expires_at);
