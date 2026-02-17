const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Carregar .env se existir
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (e) {
  console.log('⚠️  .env não encontrado, usando variáveis de ambiente padrão');
}

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'leadsflow',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
});

async function applyMigration() {
  try {
    console.log('🔄 Conectando ao banco de dados...');
    console.log(`   Host: ${process.env.PG_HOST || 'localhost'}`);
    console.log(`   Database: ${process.env.PG_DATABASE || 'leadsflow'}`);
    console.log(`   User: ${process.env.PG_USER || 'postgres'}`);
    
    const sql = fs.readFileSync(
      path.join(__dirname, 'src', 'database', 'migrations', '007_add_twilio_sms_channel_type.sql'),
      'utf8'
    );
    
    console.log('🔄 Aplicando migração 007...');
    await pool.query(sql);
    console.log('✅ Migração aplicada com sucesso!');
    
    // Verificar constraint
    const result = await pool.query(`
      SELECT check_clause 
      FROM information_schema.check_constraints 
      WHERE constraint_name = 'channels_type_check'
    `);
    
    if (result.rows.length > 0) {
      console.log('✅ CHECK constraint atualizado:');
      console.log('   ' + result.rows[0].check_clause);
    }
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao aplicar migração:', error.message);
    console.error('   Stack:', error.stack);
    await pool.end();
    process.exit(1);
  }
}

applyMigration();
