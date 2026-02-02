// Script para executar migração do sistema de inbox
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : false
});

async function runMigration() {
  console.log('Conectando ao banco de dados...');
  
  try {
    const sql = fs.readFileSync(
      path.join(__dirname, 'src/database/migrations/005_inbox_system.sql'), 
      'utf8'
    );
    
    console.log('Executando migração 005_inbox_system...');
    await pool.query(sql);
    console.log('✅ Migração 005_inbox_system executada com sucesso!');
  } catch (err) {
    console.error('❌ Erro na migração:', err.message);
  } finally {
    await pool.end();
  }
}

runMigration();
