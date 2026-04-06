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

async function run() {
  try {
    console.log('Finding a user...');
    const userRes = await pool.query('SELECT id, email FROM users LIMIT 1');
    if (userRes.rows.length === 0) {
      console.log('No users found.');
      return;
    }
    const user = userRes.rows[0];
    console.log(`User found: ${user.email} (${user.id})`);

    console.log('Inserting test activity...');
    const result = await pool.query(
      "INSERT INTO activities (user_id, type, description, created_at) VALUES ($1, $2, $3, NOW()) RETURNING *",
      [user.id, 'manual_test', 'Test activity from Antigravity diagnostic']
    );
    console.log('Activity logged:', result.rows[0]);

    console.log('Updating user last_active_at...');
    await pool.query('UPDATE users SET last_active_at = NOW() WHERE id = $1', [user.id]);
    console.log('User timestamp updated.');

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

run();
