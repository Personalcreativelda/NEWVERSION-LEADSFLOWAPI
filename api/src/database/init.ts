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
          CHECK (type IN ('whatsapp', 'whatsapp_cloud', 'facebook', 'instagram', 'telegram', 'email', 'website', 'sms'));
      EXCEPTION
        WHEN others THEN
          RAISE NOTICE 'Channels type constraint migration: %', SQLERRM;
      END $$;
    `);
    console.log('[DB] Channel type constraint updated (email, website, sms added)');
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
