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
    console.log('Columns in users:');
    const u = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users'");
    console.log(u.rows.map(r => r.column_name).join(', '));

    console.log('\nColumns in activities:');
    const a = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'activities'");
    if (a.rows.length === 0) {
        console.log('Activities table MISSING!');
    } else {
        console.log(a.rows.map(r => r.column_name).join(', '));
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

check();
