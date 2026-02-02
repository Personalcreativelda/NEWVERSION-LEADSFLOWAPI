const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432', 10),
    database: process.env.PG_DATABASE || 'leadsflow',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '',
});

async function migrate() {
    try {
        console.log('--- Migration: Adding metadata to campaigns table ---');

        // Check if column exists (optional for PG 9.6+, ALTER TABLE ... ADD COLUMN IF NOT EXISTS works)
        await pool.query('ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT \'{}\'');

        console.log('✅ Success: campaigns.metadata column ensures parity with email_campaigns.');
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

migrate();
