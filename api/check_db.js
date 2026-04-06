const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const pool = new Pool({
  host: process.env.PG_HOST,
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function check() {
  try {
    console.log('--- DB Check ---');
    
    const timeRes = await pool.query('SELECT NOW() as now');
    console.log('DB Now:', timeRes.rows[0].now);
    
    const usersRes = await pool.query('SELECT id, email, last_active_at FROM users ORDER BY last_active_at DESC NULLS LAST LIMIT 5');
    console.log('\nUsers (last_active_at):');
    usersRes.rows.forEach(u => console.log(`${u.email}: ${u.last_active_at}`));
    
    const actCount = await pool.query('SELECT COUNT(*) FROM activities');
    console.log('\nActivities Count:', actCount.rows[0].count);
    
    if (actCount.rows[0].count > 0) {
      const recentActs = await pool.query('SELECT * FROM activities ORDER BY created_at DESC LIMIT 5');
      console.log('\nRecent Activities:', JSON.stringify(recentActs.rows, null, 2));
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

check();
