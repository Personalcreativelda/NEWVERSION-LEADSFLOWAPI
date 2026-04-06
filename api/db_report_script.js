const { Pool } = require('pg');
const dotenv = require('dotenv');
const fs = require('fs');
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

async function runReport() {
  let report = '--- DATABASE STRUCTURE REPORT ---\n\n';
  try {
    const usersCols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users'");
    report += 'USERS TABLE COLUMNS:\n';
    usersCols.rows.forEach(r => { report += `- ${r.column_name}\n`; });

    const actExists = await pool.query("SELECT count(*) FROM information_schema.tables WHERE table_name = 'activities'");
    report += `\nACTIVITIES TABLE EXISTS: ${actExists.rows[0].count > 0 ? 'YES' : 'NO'}\n`;

    if (actExists.rows[0].count > 0) {
      const actCols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'activities'");
      report += '\nACTIVITIES TABLE COLUMNS:\n';
      actCols.rows.forEach(r => { report += `- ${r.column_name}\n`; });
    }

    fs.writeFileSync('db_report.txt', report);
    console.log('Report written to db_report.txt');
  } catch (err) {
    fs.writeFileSync('db_report.txt', 'ERROR: ' + err.message);
    console.error(err);
  } finally {
    await pool.end();
  }
}

runReport();
