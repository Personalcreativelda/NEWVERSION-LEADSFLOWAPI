-- ============================================
-- Script Manual para Criação de Tabelas
-- Execute este script diretamente no banco de dados PostgreSQL
-- ============================================

-- 1. Adicionar colunas de 2FA e planos na tabela users (se não existirem)
DO $$
BEGIN
    -- Two Factor Authentication
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='users' AND column_name='two_factor_enabled') THEN
        ALTER TABLE users ADD COLUMN two_factor_enabled BOOLEAN DEFAULT false;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='users' AND column_name='two_factor_secret') THEN
        ALTER TABLE users ADD COLUMN two_factor_secret VARCHAR(255);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='users' AND column_name='two_factor_backup_codes') THEN
        ALTER TABLE users ADD COLUMN two_factor_backup_codes TEXT[];
    END IF;

    -- Plan columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='users' AND column_name='plan') THEN
        ALTER TABLE users ADD COLUMN plan VARCHAR(50) DEFAULT 'free';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='users' AND column_name='subscription_plan') THEN
        ALTER TABLE users ADD COLUMN subscription_plan VARCHAR(50) DEFAULT 'free';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='users' AND column_name='plan_limits') THEN
        ALTER TABLE users ADD COLUMN plan_limits JSONB DEFAULT '{"leads": 100, "messages": 100, "massMessages": 200}';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='users' AND column_name='plan_expires_at') THEN
        ALTER TABLE users ADD COLUMN plan_expires_at TIMESTAMP WITH TIME ZONE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='users' AND column_name='trial_ends_at') THEN
        ALTER TABLE users ADD COLUMN trial_ends_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- 2. Criar tabela api_tokens (se não existir)
CREATE TABLE IF NOT EXISTS api_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    token_prefix VARCHAR(20) NOT NULL,
    scopes TEXT[] DEFAULT ARRAY['read', 'write'],
    last_used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Criar índices (se não existirem)
DO $$
BEGIN
    -- Índices para api_tokens
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_api_tokens_user_id') THEN
        CREATE INDEX idx_api_tokens_user_id ON api_tokens(user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_api_tokens_token_hash') THEN
        CREATE INDEX idx_api_tokens_token_hash ON api_tokens(token_hash);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_api_tokens_token_prefix') THEN
        CREATE INDEX idx_api_tokens_token_prefix ON api_tokens(token_prefix);
    END IF;

    -- Índices para users
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_users_plan') THEN
        CREATE INDEX idx_users_plan ON users(plan);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_users_plan_expires_at') THEN
        CREATE INDEX idx_users_plan_expires_at ON users(plan_expires_at);
    END IF;
END $$;

-- 4. Criar trigger para updated_at (se não existir)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_api_tokens_updated_at') THEN
        CREATE TRIGGER update_api_tokens_updated_at
        BEFORE UPDATE ON api_tokens
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- 5. Verificar se as tabelas foram criadas corretamente
SELECT
    'api_tokens' as table_name,
    COUNT(*) as column_count
FROM information_schema.columns
WHERE table_name = 'api_tokens'
UNION ALL
SELECT
    'users (new columns)' as table_name,
    COUNT(*) as column_count
FROM information_schema.columns
WHERE table_name = 'users'
AND column_name IN ('two_factor_enabled', 'two_factor_secret', 'plan', 'plan_limits');

-- Mensagem de sucesso
SELECT '✅ Tabelas e colunas criadas com sucesso!' as status;
