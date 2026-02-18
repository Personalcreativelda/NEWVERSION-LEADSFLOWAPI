require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_HOST,
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function runMigration() {
  try {
    console.log('[Migration] Running 012_voice_agents migration...');
    console.log('[Migration] Database:', process.env.PG_DATABASE);
    console.log('[Migration] Host:', process.env.PG_HOST);

    const migrationPath = path.join(__dirname, 'src', 'database', 'migrations', '012_voice_agents.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    await pool.query(migrationSQL);

    console.log('[Migration] ✅ Migration completed successfully');
    console.log('[Migration] Tables created:');
    console.log('  - voice_agents');
    console.log('  - voice_agent_calls');
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('[Migration] ❌ Migration failed:', error);
    await pool.end();
    process.exit(1);
  }
}

runMigration();
