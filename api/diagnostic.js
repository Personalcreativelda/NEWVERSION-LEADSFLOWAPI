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

async function diagnostic() {
  try {
    console.log('--- Database Diagnostic ---');
    console.log('Connecting to:', process.env.PG_HOST);
    
    // Check users
    const usersRes = await pool.query('SELECT id, email, name, last_active_at, role FROM users ORDER BY last_active_at DESC NULLS LAST LIMIT 10');
    console.log('\nRecent Users (by last_active_at):');
    usersRes.rows.forEach(u => {
      console.log(`- ${u.email} (${u.role}): last_active=${u.last_active_at}`);
    });

    // Check activities
    const countRes = await pool.query('SELECT COUNT(*) FROM activities');
    console.log(`\nTotal activities count: ${countRes.rows[0].count}`);

    if (parseInt(countRes.rows[0].count) > 0) {
      const actRes = await pool.query('SELECT a.*, u.email FROM activities a LEFT JOIN users u ON a.user_id = u.id ORDER BY a.created_at DESC LIMIT 5');
      console.log('\nRecent Activities:');
      actRes.rows.forEach(a => {
        console.log(`- [${a.created_at}] ${a.email}: ${a.type} - ${a.description}`);
      });
    }

    // Check "Online Now" query with 15 minutes
    const minutes = 15;
    try {
      const onlineRes = await pool.query(
        `SELECT id, email, name, last_active_at 
         FROM users 
         WHERE last_active_at >= NOW() - ($1 || ' minutes')::interval`,
        [minutes]
      );
      console.log(`\nOnline users (15m query): ${onlineRes.rows.length}`);
    } catch (err) {
      console.error('\nERROR in Online Users query:', err.message);
    }

    // Check current time in DB
    const timeRes = await pool.query('SELECT NOW() as db_now');
    console.log(`\nDB Current Time: ${timeRes.rows[0].db_now}`);

  } catch (err) {
    console.error('Diagnostic failed:', err);
  } finally {
    await pool.end();
  }
}

diagnostic();
