-- Migration 021: Team Inbox - Gestão de Equipa
-- Adiciona suporte a equipa, atribuição de conversas, notas internas e logs de auditoria

-- ─── 1. Colunas extra em conversations ───────────────────────────────────────
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS assignee_id   UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS assigned_team  VARCHAR(100) DEFAULT NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS assigned_at   TIMESTAMPTZ  DEFAULT NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS assigned_by   UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS priority      VARCHAR(20)  NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high','urgent'));

-- Ampliar status para incluir 'resolved' e 'closed' (já existia snoozed/open/pending/closed)
-- Remover constraint antiga e recriar com valores completos
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_status_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_status_check
    CHECK (status IN ('open','pending','resolved','closed','snoozed'));

-- Índices para filtros rápidos de equipa
CREATE INDEX IF NOT EXISTS idx_conversations_assignee_id   ON conversations(assignee_id);
CREATE INDEX IF NOT EXISTS idx_conversations_priority      ON conversations(priority);

-- ─── 2. Tabela team_members (agentes da equipa) ──────────────────────────────
-- user_id referencia a tabela users (conta já existe), owner_id = quem criou o workspace
CREATE TABLE IF NOT EXISTS team_members (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_id      UUID        REFERENCES users(id) ON DELETE SET NULL,   -- NULL = convite pendente
    email        VARCHAR(255) NOT NULL,
    name         VARCHAR(255) NOT NULL,
    role         VARCHAR(50)  NOT NULL DEFAULT 'agent'
        CHECK (role IN ('admin','manager','agent','viewer')),
    team         VARCHAR(100) DEFAULT NULL,          -- departamento/equipa
    is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
    invited_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    accepted_at  TIMESTAMPTZ  DEFAULT NULL,
    avatar_url   TEXT         DEFAULT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE(owner_id, email)
);
CREATE INDEX IF NOT EXISTS idx_team_members_owner_id ON team_members(owner_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id  ON team_members(user_id);

-- ─── 3. Tabela conversation_assignments (histórico de atribuições) ───────────
CREATE TABLE IF NOT EXISTS conversation_assignments (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id         UUID        NOT NULL,                                -- owner_id (dono da conta)
    assignee_id     UUID        REFERENCES users(id) ON DELETE SET NULL, -- NULL = sem responsável
    assigned_team   VARCHAR(100) DEFAULT NULL,
    assigned_by     UUID        REFERENCES users(id) ON DELETE SET NULL,
    note            TEXT        DEFAULT NULL,                             -- motivo opcional
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conv_assignments_conv ON conversation_assignments(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conv_assignments_assignee ON conversation_assignments(assignee_id);

-- ─── 4. Tabela conversation_internal_notes (notas internas) ─────────────────
CREATE TABLE IF NOT EXISTS conversation_internal_notes (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    author_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content         TEXT        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_internal_notes_conv ON conversation_internal_notes(conversation_id);

-- ─── 5. Tabela conversation_activity_logs (auditoria) ───────────────────────
CREATE TABLE IF NOT EXISTS conversation_activity_logs (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    actor_id        UUID        REFERENCES users(id) ON DELETE SET NULL,
    action          VARCHAR(100) NOT NULL,
    -- ex: 'assigned','unassigned','status_changed','note_added','reopened','resolved'
    metadata        JSONB       DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_logs_conv ON conversation_activity_logs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_actor ON conversation_activity_logs(actor_id);

-- ─── 6. Tabela routing_rules (para automação futura) ────────────────────────
CREATE TABLE IF NOT EXISTS routing_rules (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    priority    INTEGER      NOT NULL DEFAULT 0,
    conditions  JSONB        NOT NULL DEFAULT '[]',
    -- ex: [{"field":"channel","operator":"eq","value":"whatsapp"}]
    action_type VARCHAR(50)  NOT NULL DEFAULT 'assign_agent',
    -- assign_agent | assign_team | round_robin | least_busy
    action_data JSONB        NOT NULL DEFAULT '{}',
    -- ex: {"assignee_id":"xxx"} or {"team":"suporte"}
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_routing_rules_owner ON routing_rules(owner_id);
