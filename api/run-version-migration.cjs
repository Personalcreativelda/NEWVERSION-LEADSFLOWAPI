const { Pool } = require('pg');

// Use direct credentials from .env file
const pool = new Pool({
  host: '168.231.104.15',
  port: 5433,
  database: 'postgres',
  user: 'postgres',
  password: 'Mam11Me8DUEnp6Quq8N5c9msIBVH9ZCCeK7aZt0Ga6azkdKGvwzKJrCxtl6Hh6a6'
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Running app_version migration...');
    
    // Create app_version table
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_version (
        id SERIAL PRIMARY KEY,
        version VARCHAR(50) NOT NULL,
        release_notes TEXT,
        is_current BOOLEAN DEFAULT false,
        notify_users BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    console.log('✅ app_version table created');
    
    // Create unique partial index
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_app_version_current 
      ON app_version(is_current) WHERE is_current = true
    `);
    console.log('✅ Unique index created');
    
    // Check if initial version exists
    const { rows } = await client.query('SELECT * FROM app_version WHERE is_current = true');
    
    if (rows.length === 0) {
      await client.query(`
        INSERT INTO app_version (version, release_notes, is_current, notify_users)
        VALUES ('1.0.0', 'Versão inicial do LeadsFlow CRM', true, false)
      `);
      console.log('✅ Initial version 1.0.0 inserted');
    } else {
      console.log('ℹ️ Current version already exists:', rows[0].version);
    }
    
    // Create user_version_notifications table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_version_notifications (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        version_id INTEGER REFERENCES app_version(id) ON DELETE CASCADE,
        seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(user_id, version_id)
      )
    `);
    console.log('✅ user_version_notifications table created');
    
    console.log('🎉 Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
