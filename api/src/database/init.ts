import fs from 'fs';
import path from 'path';
import pool from './connection';
import { initPool } from './connection';

const readSchemaFile = () => {
  const primaryPath = path.join(__dirname, 'schema.sql');
  if (fs.existsSync(primaryPath)) {
    return fs.readFileSync(primaryPath, 'utf-8');
  }

  const fallbackPath = path.join(process.cwd(), 'src', 'database', 'schema.sql');
  if (fs.existsSync(fallbackPath)) {
    return fs.readFileSync(fallbackPath, 'utf-8');
  }

  throw new Error('schema.sql not found. Ensure it exists in src/database.');
};

// Executar migrações pendentes automaticamente
const runPendingMigrations = async () => {
  // Migração: plan_activated_at, subscription_status, stripe IDs e tabela payment_history
  try {
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_activated_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'free';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(100);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(100);
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payment_history (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        plan_id VARCHAR(50) NOT NULL,
        amount DECIMAL(10,2),
        currency VARCHAR(10) DEFAULT 'USD',
        billing_cycle VARCHAR(20),
        payment_method VARCHAR(50),
        payment_provider VARCHAR(50),
        card_brand VARCHAR(30),
        card_last4 VARCHAR(10),
        stripe_subscription_id VARCHAR(100),
        status VARCHAR(50) DEFAULT 'completed',
        provider_transaction_id VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_payment_history_user_id ON payment_history(user_id);
      CREATE INDEX IF NOT EXISTS idx_payment_history_created_at ON payment_history(created_at DESC);
    `);
    console.log('[DB] plan_activated_at, subscription_status, stripe IDs e payment_history prontos');
  } catch (error: any) {
    console.warn('[DB] Migration plan_activated_at/payment_history warning:', error.message);
  }

  // Migração: adicionar colunas de cartão e subscription ao payment_history (se já existir)
  try {
    await pool.query(`
      ALTER TABLE payment_history ADD COLUMN IF NOT EXISTS card_brand VARCHAR(30);
      ALTER TABLE payment_history ADD COLUMN IF NOT EXISTS card_last4 VARCHAR(10);
      ALTER TABLE payment_history ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(100);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(100);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(100);
    `);
    console.log('[DB] card_brand, card_last4, stripe IDs adicionados');
  } catch (error: any) {
    console.warn('[DB] Migration card/stripe IDs warning:', error.message);
  }

  // Migração: Deduplicar payment_history e adicionar índice único em provider_transaction_id
  try {
    await pool.query(`
      DO $$
      BEGIN
        -- Remove duplicate payment_history rows keeping only the oldest per (user_id, stripe_subscription_id, status)
        -- This fixes existing duplicates caused by both /sync-subscription and checkout.session.completed webhook running simultaneously
        DELETE FROM payment_history ph1
        USING payment_history ph2
        WHERE ph1.user_id = ph2.user_id
          AND ph1.stripe_subscription_id = ph2.stripe_subscription_id
          AND ph1.stripe_subscription_id IS NOT NULL
          AND ph1.status = ph2.status
          AND ph1.status = 'completed'
          AND ph1.created_at > ph2.created_at;

        -- Add unique index on provider_transaction_id (non-NULL only) to prevent future duplicates at DB level
        CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_history_provider_tx_id
          ON payment_history (provider_transaction_id)
          WHERE provider_transaction_id IS NOT NULL;
      EXCEPTION
        WHEN others THEN
          RAISE NOTICE 'payment_history dedup migration: %', SQLERRM;
      END $$;
    `);
    console.log('[DB] payment_history deduplication and unique index applied');
  } catch (error: any) {
    console.warn('[DB] Migration payment_history dedup warning:', error.message);
  }

  try {
    // Migração: Atualizar CHECK constraint da tabela channels para incluir email e website
    await pool.query(`
      DO $$
      BEGIN
        -- Remover constraints antigos
        ALTER TABLE channels DROP CONSTRAINT IF EXISTS channels_type_check;
        ALTER TABLE channels DROP CONSTRAINT IF EXISTS channels_type_check1;
        -- Adicionar constraint atualizado
        ALTER TABLE channels ADD CONSTRAINT channels_type_check
          CHECK (type IN ('whatsapp', 'whatsapp_cloud', 'facebook', 'instagram', 'telegram', 'email', 'website', 'twilio_sms'));
      EXCEPTION
        WHEN others THEN
          RAISE NOTICE 'Channels type constraint migration: %', SQLERRM;
      END $$;
    `);
    console.log('[DB] Channel type constraint updated (email, website, twilio_sms added)');
  } catch (error: any) {
    console.warn('[DB] Migration warning:', error.message);
  }

  // Migração: Adicionar colunas de IDs sociais à tabela leads
  try {
    await pool.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS telegram_id VARCHAR(100);
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS facebook_id VARCHAR(100);
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS instagram_id VARCHAR(100);
    `);
    // Criar índices para busca rápida
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_leads_telegram_id ON leads(telegram_id) WHERE telegram_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_leads_facebook_id ON leads(facebook_id) WHERE facebook_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_leads_instagram_id ON leads(instagram_id) WHERE instagram_id IS NOT NULL;
    `);
    console.log('[DB] Social IDs columns added to leads (telegram_id, facebook_id, instagram_id)');
  } catch (error: any) {
    console.warn('[DB] Social IDs migration warning:', error.message);
  }

  // Migração: Adicionar colunas Stripe à tabela plans
  try {
    await pool.query(`
      ALTER TABLE plans ADD COLUMN IF NOT EXISTS stripe_product_id VARCHAR(100);
      ALTER TABLE plans ADD COLUMN IF NOT EXISTS stripe_price_monthly_id VARCHAR(100);
      ALTER TABLE plans ADD COLUMN IF NOT EXISTS stripe_price_annual_id VARCHAR(100);
    `);
    console.log('[DB] Stripe columns added to plans (stripe_product_id, stripe_price_monthly_id, stripe_price_annual_id)');

    const stripeDefaults: Record<string, {
      productId: string | null;
      priceMonthlyId: string | null;
      priceAnnualId: string | null;
    }> = {
      business: {
        productId: process.env.STRIPE_BUSINESS_PRODUCT_ID || null,
        priceMonthlyId: process.env.STRIPE_BUSINESS_PRICE_MONTHLY_ID || null,
        priceAnnualId: process.env.STRIPE_BUSINESS_PRICE_ANNUAL_ID || null,
      },
      enterprise: {
        productId: process.env.STRIPE_ENTERPRISE_PRODUCT_ID || null,
        priceMonthlyId: process.env.STRIPE_ENTERPRISE_PRICE_MONTHLY_ID || null,
        priceAnnualId: process.env.STRIPE_ENTERPRISE_PRICE_ANNUAL_ID || null,
      },
    };

    for (const [planId, stripeConfig] of Object.entries(stripeDefaults)) {
      if (!stripeConfig.priceMonthlyId && !stripeConfig.priceAnnualId) continue;

      // Sync Stripe IDs from env (source of truth for payment routing).
      // Do NOT overwrite price_monthly / price_annual — those are managed via the admin panel.
      await pool.query(
        `UPDATE plans
         SET stripe_product_id       = COALESCE($1, stripe_product_id),
             stripe_price_monthly_id = COALESCE($2, stripe_price_monthly_id),
             stripe_price_annual_id  = COALESCE($3, stripe_price_annual_id)
         WHERE id = $4;`,
        [
          stripeConfig.productId,
          stripeConfig.priceMonthlyId,
          stripeConfig.priceAnnualId,
          planId,
        ]
      );
      console.log(`[DB] Plan "${planId}" Stripe IDs synced from env (prices preserved from DB).`);
    }
  } catch (error: any) {
    console.warn('[DB] Stripe migration warning:', error.message);
  }

  // Migração: Criar tabela lead_interactions (rastreamento de interações)
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS lead_interactions (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
          conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
          channel_id UUID REFERENCES channels(id) ON DELETE SET NULL,
          interaction_type VARCHAR(50) NOT NULL,
          direction VARCHAR(10),
          content VARCHAR(1000),
          details JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_lead_interactions_lead_id ON lead_interactions(lead_id);
      CREATE INDEX IF NOT EXISTS idx_lead_interactions_user_id ON lead_interactions(user_id);
      CREATE INDEX IF NOT EXISTS idx_lead_interactions_created_at ON lead_interactions(created_at);
      CREATE INDEX IF NOT EXISTS idx_lead_interactions_type ON lead_interactions(interaction_type);
    `);
    console.log('[DB] ✅ lead_interactions table created/verified');
  } catch (error: any) {
    console.warn('[DB] lead_interactions migration warning:', error.message);
  }

  // Migração: Fila de mensagens + lock para assistente IA (debounce/mutex como no n8n)
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS assistant_message_queue (
          id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          conversation_id      UUID    NOT NULL,
          user_id              UUID    NOT NULL,
          channel_id           UUID    NOT NULL,
          channel_type         VARCHAR(50) NOT NULL DEFAULT 'whatsapp',
          message_content      TEXT    NOT NULL,
          remote_jid           VARCHAR(255),
          contact_phone        VARCHAR(255),
          contact_name         VARCHAR(255),
          credentials          JSONB,
          media_type           VARCHAR(50),
          media_url            TEXT,
          incoming_message_id  VARCHAR(255),
          created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_amq_conversation_id ON assistant_message_queue(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_amq_created_at      ON assistant_message_queue(created_at);
      -- Add missing columns to existing deployments
      ALTER TABLE assistant_message_queue ADD COLUMN IF NOT EXISTS media_type          VARCHAR(50);
      ALTER TABLE assistant_message_queue ADD COLUMN IF NOT EXISTS media_url           TEXT;
      ALTER TABLE assistant_message_queue ADD COLUMN IF NOT EXISTS incoming_message_id VARCHAR(255);

      CREATE TABLE IF NOT EXISTS assistant_processing_lock (
          conversation_id UUID PRIMARY KEY,
          locked_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          expires_at      TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '90 seconds')
      );
    `);
    console.log('[DB] ✅ assistant_message_queue + assistant_processing_lock created/verified');
  } catch (error: any) {
    console.warn('[DB] assistant queue migration warning:', error.message);
  }

  // ── whatsapp_lid em leads ──────────────────────────────────────────────────
  // Armazena o @lid (Linked Device ID) do WhatsApp para lookups futuros
  // quando o remoteJid é apenas LID e não um número de telefone real.
  try {
    await pool.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS whatsapp_lid TEXT;
      CREATE INDEX IF NOT EXISTS idx_leads_whatsapp_lid ON leads(whatsapp_lid) WHERE whatsapp_lid IS NOT NULL;
    `);
    console.log('[DB] ✅ whatsapp_lid column added to leads');
  } catch (error: any) {
    console.warn('[DB] whatsapp_lid migration warning:', error.message);
  }

  // ── first_status_change_at em leads ───────────────────────────────────────
  try {
    await pool.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS first_status_change_at TIMESTAMPTZ;
    `);
    console.log('[DB] ✅ first_status_change_at column added to leads');
  } catch (error: any) {
    console.warn('[DB] first_status_change_at migration warning:', error.message);
  }

  // ── Migration: file_attachments (storage retention & lifecycle) ─────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS file_attachments (
        id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id        UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message_id     UUID         REFERENCES messages(id) ON DELETE SET NULL,
        campaign_id    UUID         REFERENCES campaigns(id) ON DELETE SET NULL,
        bucket         VARCHAR(255) NOT NULL DEFAULT 'leadflow-uploads',
        storage_key    TEXT         NOT NULL,
        public_url     TEXT         NOT NULL,
        file_name      VARCHAR(500),
        mime_type      VARCHAR(255),
        size_bytes     BIGINT,
        folder_type    VARCHAR(50)  NOT NULL,
        is_temporary   BOOLEAN      NOT NULL DEFAULT true,
        retention_days INTEGER,
        expires_at     TIMESTAMPTZ,
        deleted_at     TIMESTAMPTZ,
        status         VARCHAR(20)  NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active', 'expired', 'deleted')),
        created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_file_attachments_user_id    ON file_attachments(user_id);
      CREATE INDEX IF NOT EXISTS idx_file_attachments_message_id ON file_attachments(message_id);
      CREATE INDEX IF NOT EXISTS idx_file_attachments_expires_at ON file_attachments(expires_at) WHERE status = 'active';
      CREATE INDEX IF NOT EXISTS idx_file_attachments_status     ON file_attachments(status);
      CREATE INDEX IF NOT EXISTS idx_file_attachments_public_url ON file_attachments(public_url);
      CREATE INDEX IF NOT EXISTS idx_file_attachments_created_at ON file_attachments(created_at DESC);
    `);
    console.log('[DB] ✅ file_attachments table created/verified');
  } catch (error: any) {
    console.warn('[DB] file_attachments migration warning:', error.message);
  }

  // ── Migration 018: Preservar conversas quando canal é deletado ────────────
  try {
    // Tornar channel_id nullable (era NOT NULL antes)
    await pool.query(`ALTER TABLE conversations ALTER COLUMN channel_id DROP NOT NULL`);
    console.log('[DB] ✅ conversations.channel_id agora é nullable');
  } catch (error: any) {
    // Ignora se já for nullable
    if (!error.message?.includes('does not exist') && !error.message?.includes('already')) {
      console.warn('[DB] Migration 018 (nullable channel_id) warning:', error.message);
    }
  }

  try {
    // Trocar FK de ON DELETE CASCADE para ON DELETE SET NULL
    await pool.query(`
      ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_channel_id_fkey;
      ALTER TABLE conversations
        ADD CONSTRAINT conversations_channel_id_fkey
        FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE SET NULL;
    `);
    console.log('[DB] ✅ conversations.channel_id FK alterado para ON DELETE SET NULL');
  } catch (error: any) {
    console.warn('[DB] Migration 018 (SET NULL FK) warning:', error.message);
  }

  try {
    // Coluna para guardar info do canal deletado
    await pool.query(`
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS deleted_channel_info JSONB DEFAULT NULL;
    `);
    console.log('[DB] ✅ conversations.deleted_channel_info adicionada');
  } catch (error: any) {
    console.warn('[DB] Migration 018 (deleted_channel_info) warning:', error.message);
  }

  // ── Migration 019: remarketing_flows ──────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS remarketing_flows (
        id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id       UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name          VARCHAR(255) NOT NULL,
        description   TEXT         NOT NULL DEFAULT '',
        status        VARCHAR(20)  NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('active', 'paused', 'draft')),
        trigger_type  VARCHAR(50)  NOT NULL
                        CHECK (trigger_type IN ('funnel_stage', 'tag', 'inactivity', 'purchase', 'lead_score')),
        trigger_label VARCHAR(255) NOT NULL DEFAULT '',
        steps         JSONB        NOT NULL DEFAULT '[]',
        enrolled_leads INTEGER     NOT NULL DEFAULT 0,
        conversions   INTEGER      NOT NULL DEFAULT 0,
        template_id   VARCHAR(100),
        created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_remarketing_flows_user_id ON remarketing_flows(user_id);
      CREATE INDEX IF NOT EXISTS idx_remarketing_flows_status  ON remarketing_flows(status);
      CREATE OR REPLACE FUNCTION update_remarketing_flows_updated_at()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
      $$;
      DROP TRIGGER IF EXISTS trg_remarketing_flows_updated_at ON remarketing_flows;
      CREATE TRIGGER trg_remarketing_flows_updated_at
        BEFORE UPDATE ON remarketing_flows
        FOR EACH ROW EXECUTE FUNCTION update_remarketing_flows_updated_at();
    `);
    console.log('[DB] ✅ remarketing_flows table created/verified');
  } catch (error: any) {
    console.warn('[DB] remarketing_flows migration warning:', error.message);
  }

  // ── Migration 021: Team Inbox ─────────────────────────────────────────────
  try {
    // Colunas de atribuição em conversations
    await pool.query(`
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS assignee_id  UUID REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS assigned_team VARCHAR(100) DEFAULT NULL;
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS assigned_at  TIMESTAMPTZ DEFAULT NULL;
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS assigned_by  UUID REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS priority     VARCHAR(20)  NOT NULL DEFAULT 'normal';
    `);
    console.log('[DB] ✅ conversations team columns added');
  } catch (error: any) {
    console.warn('[DB] Migration 021 (conversations columns) warning:', error.message);
  }

  try {
    // Ampliar status constraint para incluir 'resolved'
    await pool.query(`
      DO $$
      BEGIN
        ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_status_check;
        ALTER TABLE conversations ADD CONSTRAINT conversations_status_check
          CHECK (status IN ('open','pending','resolved','closed','snoozed'));
      EXCEPTION WHEN others THEN
        RAISE NOTICE 'conversations_status_check: %', SQLERRM;
      END $$;
    `);
    console.log('[DB] ✅ conversations status constraint updated (resolved added)');
  } catch (error: any) {
    console.warn('[DB] Migration 021 (status constraint) warning:', error.message);
  }

  try {
    // Índices
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_conversations_assignee_id ON conversations(assignee_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_priority    ON conversations(priority);
    `);
  } catch (error: any) {
    console.warn('[DB] Migration 021 (indexes) warning:', error.message);
  }

  try {
    // Tabela team_members
    await pool.query(`
      CREATE TABLE IF NOT EXISTS team_members (
        id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_id      UUID         REFERENCES users(id) ON DELETE SET NULL,
        email        VARCHAR(255) NOT NULL,
        name         VARCHAR(255) NOT NULL,
        role         VARCHAR(50)  NOT NULL DEFAULT 'agent',
        team         VARCHAR(100) DEFAULT NULL,
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
    `);
    console.log('[DB] ✅ team_members table created/verified');
  } catch (error: any) {
    console.warn('[DB] Migration 021 (team_members) warning:', error.message);
  }

  try {
    // Tabela conversation_assignments (histórico)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversation_assignments (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        user_id         UUID        NOT NULL,
        assignee_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
        assigned_team   VARCHAR(100) DEFAULT NULL,
        assigned_by     UUID        REFERENCES users(id) ON DELETE SET NULL,
        note            TEXT        DEFAULT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_conv_assignments_conv     ON conversation_assignments(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_conv_assignments_assignee ON conversation_assignments(assignee_id);
    `);
    console.log('[DB] ✅ conversation_assignments table created/verified');
  } catch (error: any) {
    console.warn('[DB] Migration 021 (conversation_assignments) warning:', error.message);
  }

  try {
    // Tabela conversation_internal_notes
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversation_internal_notes (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        author_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content         TEXT        NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_internal_notes_conv ON conversation_internal_notes(conversation_id);
    `);
    console.log('[DB] ✅ conversation_internal_notes table created/verified');
  } catch (error: any) {
    console.warn('[DB] Migration 021 (internal_notes) warning:', error.message);
  }

  try {
    // Tabela conversation_activity_logs
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversation_activity_logs (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        actor_id        UUID        REFERENCES users(id) ON DELETE SET NULL,
        action          VARCHAR(100) NOT NULL,
        metadata        JSONB       DEFAULT '{}',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_activity_logs_conv  ON conversation_activity_logs(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_activity_logs_actor ON conversation_activity_logs(actor_id);
    `);
    console.log('[DB] ✅ conversation_activity_logs table created/verified');
  } catch (error: any) {
    console.warn('[DB] Migration 021 (activity_logs) warning:', error.message);
  }

  try {
    // Tabela routing_rules (estrutura para automação futura)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS routing_rules (
        id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name        VARCHAR(255) NOT NULL,
        is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
        priority    INTEGER      NOT NULL DEFAULT 0,
        conditions  JSONB        NOT NULL DEFAULT '[]',
        action_type VARCHAR(50)  NOT NULL DEFAULT 'assign_agent',
        action_data JSONB        NOT NULL DEFAULT '{}',
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_routing_rules_owner ON routing_rules(owner_id);
    `);
    console.log('[DB] ✅ routing_rules table created/verified');
  } catch (error: any) {
    console.warn('[DB] Migration 021 (routing_rules) warning:', error.message);
  }

  // ── Migration 022: Workspaces + Workspace Invites (multi-tenant) ─────────────

  try {
    // workspaces: one per owner account (1-to-1 for now, extensible to N later)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id        UUID         NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        name            VARCHAR(255) NOT NULL,
        avatar_url      TEXT         DEFAULT NULL,
        plan            VARCHAR(50)  NOT NULL DEFAULT 'free',
        plan_limits     JSONB        DEFAULT NULL,
        plan_expires_at TIMESTAMPTZ  DEFAULT NULL,
        settings        JSONB        NOT NULL DEFAULT '{}',
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_workspaces_owner_id ON workspaces(owner_id);
    `);
    console.log('[DB] ✅ workspaces table created/verified');
  } catch (error: any) {
    console.warn('[DB] Migration 022 (workspaces) warning:', error.message);
  }

  try {
    // Backfill one workspace per existing user
    await pool.query(`
      INSERT INTO workspaces (owner_id, name, plan, plan_limits)
      SELECT id,
             COALESCE(NULLIF(TRIM(name), ''), email),
             COALESCE(plan, subscription_plan, 'free'),
             plan_limits
      FROM users
      ON CONFLICT (owner_id) DO NOTHING;
    `);
    console.log('[DB] ✅ workspaces backfilled from users');
  } catch (error: any) {
    console.warn('[DB] Migration 022 (workspaces backfill) warning:', error.message);
  }

  try {
    // workspace_invites: token-based email invites
    await pool.query(`
      CREATE TABLE IF NOT EXISTS workspace_invites (
        id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID         NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        email        VARCHAR(255) NOT NULL,
        role         VARCHAR(50)  NOT NULL DEFAULT 'agent',
        token        VARCHAR(255) NOT NULL UNIQUE,
        status       VARCHAR(50)  NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','accepted','expired','revoked')),
        invited_by   UUID         REFERENCES users(id) ON DELETE SET NULL,
        expires_at   TIMESTAMPTZ  NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
        accepted_at  TIMESTAMPTZ  DEFAULT NULL,
        accepted_by  UUID         REFERENCES users(id) ON DELETE SET NULL,
        created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        UNIQUE(workspace_id, email)
      );
      CREATE INDEX IF NOT EXISTS idx_workspace_invites_workspace ON workspace_invites(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_workspace_invites_token     ON workspace_invites(token);
      CREATE INDEX IF NOT EXISTS idx_workspace_invites_email     ON workspace_invites(email);
    `);
    console.log('[DB] ✅ workspace_invites table created/verified');
  } catch (error: any) {
    console.warn('[DB] Migration 022 (workspace_invites) warning:', error.message);
  }

  try {
    // Add workspace_id to team_members and backfill
    await pool.query(`
      ALTER TABLE team_members
        ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
    `);
    await pool.query(`
      UPDATE team_members tm
      SET    workspace_id = w.id
      FROM   workspaces w
      WHERE  w.owner_id = tm.owner_id
        AND  tm.workspace_id IS NULL;
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_team_members_workspace_id ON team_members(workspace_id);
    `);
    console.log('[DB] ✅ team_members.workspace_id added/backfilled');
  } catch (error: any) {
    console.warn('[DB] Migration 022 (team_members.workspace_id) warning:', error.message);
  }

  try {
    // Add workspace_id to conversations and backfill
    await pool.query(`
      ALTER TABLE conversations
        ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
    `);
    await pool.query(`
      UPDATE conversations c
      SET    workspace_id = w.id
      FROM   workspaces w
      WHERE  w.owner_id = c.user_id
        AND  c.workspace_id IS NULL;
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_conversations_workspace_id ON conversations(workspace_id);
    `);
    console.log('[DB] ✅ conversations.workspace_id added/backfilled');
  } catch (error: any) {
    console.warn('[DB] Migration 022 (conversations.workspace_id) warning:', error.message);
  }

  try {
    // Add status column to team_members for invite lifecycle
    await pool.query(`
      ALTER TABLE team_members
        ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'active'
        CHECK (status IN ('pending','active','inactive'));
    `);
    // Mark rows without user_id (never accepted) as pending
    await pool.query(`
      UPDATE team_members SET status = 'pending'
      WHERE user_id IS NULL AND status = 'active';
    `);
    console.log('[DB] ✅ team_members.status added/backfilled');
  } catch (error: any) {
    console.warn('[DB] Migration 022 (team_members.status) warning:', error.message);
  }

  try {
    // Add invited_by to team_members
    await pool.query(`
      ALTER TABLE team_members
        ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES users(id) ON DELETE SET NULL;
    `);
    await pool.query(`
      ALTER TABLE team_members
        ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ DEFAULT NULL;
    `);
    // Backfill joined_at from accepted_at
    await pool.query(`
      UPDATE team_members SET joined_at = accepted_at WHERE accepted_at IS NOT NULL AND joined_at IS NULL;
    `);
    console.log('[DB] ✅ team_members.invited_by / joined_at added');
  } catch (error: any) {
    console.warn('[DB] Migration 022 (team_members invited_by/joined_at) warning:', error.message);
  }

  // Auto-create workspace when new users register (trigger)
  try {
    await pool.query(`
      CREATE OR REPLACE FUNCTION create_workspace_for_user()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN
        INSERT INTO workspaces (owner_id, name, plan, plan_limits)
        VALUES (
          NEW.id,
          COALESCE(NULLIF(TRIM(NEW.name), ''), NEW.email),
          COALESCE(NEW.plan, NEW.subscription_plan, 'free'),
          NEW.plan_limits
        )
        ON CONFLICT (owner_id) DO NOTHING;
        RETURN NEW;
      END;
      $$;

      DROP TRIGGER IF EXISTS trg_create_workspace_for_user ON users;
      CREATE TRIGGER trg_create_workspace_for_user
        AFTER INSERT ON users
        FOR EACH ROW EXECUTE FUNCTION create_workspace_for_user();
    `);
    console.log('[DB] ✅ workspace auto-create trigger installed');
  } catch (error: any) {
    console.warn('[DB] Migration 022 (workspace trigger) warning:', error.message);
  }

  // Link pending team_members.user_id when matching user registers (trigger)
  try {
    await pool.query(`
      CREATE OR REPLACE FUNCTION link_pending_team_member()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN
        UPDATE team_members
        SET user_id   = NEW.id,
            status    = 'active',
            joined_at = NOW()
        WHERE email = NEW.email
          AND user_id IS NULL;

        UPDATE workspace_invites
        SET status      = 'accepted',
            accepted_at = NOW(),
            accepted_by = NEW.id
        WHERE email = NEW.email
          AND status = 'pending';

        RETURN NEW;
      END;
      $$;

      DROP TRIGGER IF EXISTS trg_link_pending_team_member ON users;
      CREATE TRIGGER trg_link_pending_team_member
        AFTER INSERT ON users
        FOR EACH ROW EXECUTE FUNCTION link_pending_team_member();
    `);
    console.log('[DB] ✅ pending team member link trigger installed');
  } catch (error: any) {
    console.warn('[DB] Migration 022 (link pending member trigger) warning:', error.message);
  }
};

export const initDatabase = async () => {
  // Ensure pool (and proxy bridge if needed) is ready before any query
  await initPool();
  try {
    const schema = readSchemaFile();
    await pool.query(schema);
    console.log('Database schema initialized successfully');
  } catch (error: any) {
    if (error.code === '42P07') {
      console.log('Tables already exist, skipping initialization');
    } else {
      console.error('Error initializing database:', error);
      throw error;
    }
  }

  // Sempre executar migrações pendentes
  await runPendingMigrations();
};
