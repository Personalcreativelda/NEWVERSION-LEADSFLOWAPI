@echo off
docker run --rm postgres:15 bash -c ^
  "PGPASSWORD='Mam11Me8DUEnp6Quq8N5c9msIBVH9ZCCeK7aZt0Ga6azkdKGvwzKJrCxtl6Hh6a6' psql -h 168.231.104.15 -p 5433 -U postgres -d postgres -c '^
  CREATE TABLE IF NOT EXISTS notifications (^
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),^
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,^
    type VARCHAR(50) NOT NULL,^
    title VARCHAR(255) NOT NULL,^
    description TEXT,^
    icon VARCHAR(50),^
    is_read BOOLEAN DEFAULT false,^
    metadata JSONB DEFAULT '{}',^
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),^
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()^
  );^
  CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);^
  CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);^
  CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);^
  SELECT tablename FROM pg_tables WHERE tablename = 'notifications';'"
