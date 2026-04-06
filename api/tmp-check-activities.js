const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const poolConfig = {
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'leadsflow',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '',
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
};

const pool = new Pool(poolConfig);

async function check() {
  try {
    console.log('Connecting to:', poolConfig.host);
    const res = await pool.query('SELECT COUNT(*) FROM activities');
    console.log('Total activities:', res.rows[0].count);
    
    const active = await pool.query("SELECT COUNT(*) FROM users WHERE last_active_at >= NOW() - INTERVAL '15 minutes'");
    console.log('Active users (last 15m):', active.rows[0].count);
    
    if (res.rows[0].count > 0) {
      const recent = await pool.query('SELECT a.*, u.email FROM activities a LEFT JOIN users u ON a.user_id = u.id ORDER BY a.created_at DESC LIMIT 5');
      console.log('Recent activities:', JSON.stringify(recent.rows, null, 2));
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

check();
