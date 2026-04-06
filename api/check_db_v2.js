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
    console.log('Testing "users" table...');
    const u = await pool.query('SELECT 1 FROM users LIMIT 1');
    console.log('Users table exists.');

    console.log('Testing "activities" table...');
    try {
        const a = await pool.query('SELECT 1 FROM activities LIMIT 1');
        console.log('Activities table exists.');
    } catch (e) {
        console.log('Activities table MISSING or ERROR:', e.message);
    }

    console.log('Checking columns in users...');
    const cols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users'");
    console.log('Columns:', cols.rows.map(r => r.column_name).join(', '));

  } catch (err) {
    console.error('Core check failed:', err.message);
  } finally {
    await pool.end();
  }
}

check();
