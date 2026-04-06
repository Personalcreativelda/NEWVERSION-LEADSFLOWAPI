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
    const res = await pool.query("SELECT count(*) FROM information_schema.tables WHERE table_name = 'activities'");
    console.log('Activities table exists count:', res.rows[0].count);
    
    if (parseInt(res.rows[0].count) > 0) {
        const cols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'activities'");
        console.log('Activities columns:');
        cols.rows.forEach(c => console.log(`- ${c.column_name} (${c.data_type})`));
    } else {
        console.log('--- TABLES IN DB ---');
        const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        tables.rows.forEach(t => console.log(`- ${t.table_name}`));
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

check();
