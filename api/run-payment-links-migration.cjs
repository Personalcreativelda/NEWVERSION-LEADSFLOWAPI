const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.PG_HOST,
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function run() {
  try {
    console.log('Adding payment_link columns...');
    await pool.query('ALTER TABLE plans ADD COLUMN IF NOT EXISTS payment_link_monthly VARCHAR(500)');
    await pool.query('ALTER TABLE plans ADD COLUMN IF NOT EXISTS payment_link_annual VARCHAR(500)');
    console.log('Columns added!');

    console.log('Updating payment links...');
    await pool.query(`UPDATE plans SET 
      payment_link_monthly = 'https://www.paypal.com/ncp/payment/MJFXSMAZY9VPS', 
      payment_link_annual = 'https://www.paypal.com/ncp/payment/ADJF2GY82HDCW' 
      WHERE id = 'business'`);
    
    await pool.query(`UPDATE plans SET 
      payment_link_monthly = 'https://www.paypal.com/ncp/payment/6XX4G2TKPCA6Y', 
      payment_link_annual = 'https://www.paypal.com/ncp/payment/ESX4B2DFC6AZL' 
      WHERE id = 'enterprise'`);
    
    console.log('Payment links updated!');

    const result = await pool.query('SELECT id, name, payment_link_monthly, payment_link_annual FROM plans');
    console.log('Plans:', result.rows);
    
    await pool.end();
    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

run();
