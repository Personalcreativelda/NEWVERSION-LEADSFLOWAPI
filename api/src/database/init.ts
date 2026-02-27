import fs from 'fs';
import path from 'path';
import pool from './connection';

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
};

export const initDatabase = async () => {
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
