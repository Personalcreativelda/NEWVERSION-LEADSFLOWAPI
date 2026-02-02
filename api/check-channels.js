const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.PG_HOST,
  port: parseInt(process.env.PG_PORT),
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD
});

async function main() {
  try {
    const result = await pool.query("SELECT id, name, status, credentials FROM channels WHERE type = 'whatsapp' LIMIT 5");
    console.log('Channels:', JSON.stringify(result.rows, null, 2));
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await pool.end();
  }
}

main();
