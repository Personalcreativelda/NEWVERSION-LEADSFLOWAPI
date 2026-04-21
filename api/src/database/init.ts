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
          id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          conversation_id UUID    NOT NULL,
          user_id         UUID    NOT NULL,
          channel_id      UUID    NOT NULL,
          channel_type    VARCHAR(50) NOT NULL DEFAULT 'whatsapp',
          message_content TEXT    NOT NULL,
          remote_jid      VARCHAR(255),
          contact_phone   VARCHAR(255),
          contact_name    VARCHAR(255),
          credentials     JSONB,
          created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_amq_conversation_id ON assistant_message_queue(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_amq_created_at      ON assistant_message_queue(created_at);

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
