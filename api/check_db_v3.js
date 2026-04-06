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
    console.log('--- USERS Table Columns ---');
    const cols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users'");
    cols.rows.forEach(r => console.log(`- ${r.column_name}`));

    console.log('\n--- ACTIVITIES Table Columns ---');
    const cols2 = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'activities'");
    cols2.rows.forEach(r => console.log(`- ${r.column_name}`));
    
    if (cols.rows.find(r => r.column_name === 'last_active_at')) {
        const users = await pool.query('SELECT email, last_active_at FROM users WHERE last_active_at IS NOT NULL');
        console.log(`\nUsers with last_active_at: ${users.rows.length}`);
    } else {
        console.log('\nCOLUMN last_active_at MISSING from users table!');
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

check();
