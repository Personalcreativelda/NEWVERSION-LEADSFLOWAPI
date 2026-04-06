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

async function listColumns() {
  try {
    console.log('--- Table Columns ---');
    
    console.log('\n- users -');
    const usersCol = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users'");
    console.log(usersCol.rows.map(r => r.column_name).join(', '));

    console.log('\n- activities -');
    const activitiesCol = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'activities'");
    if (activitiesCol.rows.length === 0) {
      console.log('Table "activities" NOT FOUND!');
    } else {
      console.log(activitiesCol.rows.map(r => r.column_name).join(', '));
    }

  } catch (err) {
    console.error('Failed:', err);
  } finally {
    await pool.end();
  }
}

listColumns();
