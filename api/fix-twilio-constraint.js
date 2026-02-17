const { Pool } = require('pg');
const path = require('path');

// Carregar .env
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'leadsflow',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function fixConstraint() {
  try {
    console.log('\n🔧 CORRIGINDO CONSTRAINT DO TWILIO SMS\n');
    console.log('📍 Conexão:');
    console.log(`   Host: ${process.env.PG_HOST || 'localhost'}`);
    console.log(`   Database: ${process.env.PG_DATABASE || 'leadsflow'}`);
    console.log(`   User: ${process.env.PG_USER || 'postgres'}\n`);
    
    // 1. Verificar constraint atual
    console.log('1️⃣  Verificando constraint atual...');
    const checkResult = await pool.query(`
      SELECT check_clause 
      FROM information_schema.check_constraints 
      WHERE constraint_name = 'channels_type_check'
    `);
    
    if (checkResult.rows.length > 0) {
      console.log('   ✅ Constraint encontrado:');
      console.log('   ' + checkResult.rows[0].check_clause);
      
      // Verificar se já inclui twilio_sms
      if (checkResult.rows[0].check_clause.includes('twilio_sms')) {
        console.log('\n   ⚠️  O constraint já inclui "twilio_sms"!');
        console.log('   O problema pode ser outro. Verificando...\n');
      }
    } else {
      console.log('   ⚠️  Nenhum constraint encontrado!\n');
    }
    
    // 2. Remover constraint antigo
    console.log('2️⃣  Removendo constraint antigo...');
    await pool.query('ALTER TABLE channels DROP CONSTRAINT IF EXISTS channels_type_check');
    console.log('   ✅ Constraint removido\n');
    
    // 3. Adicionar novo constraint com twilio_sms
    console.log('3️⃣  Adicionando novo constraint com twilio_sms...');
    await pool.query(`
      ALTER TABLE channels ADD CONSTRAINT channels_type_check
      CHECK (type IN ('whatsapp', 'whatsapp_cloud', 'facebook', 'instagram', 'telegram', 'email', 'website', 'twilio_sms'))
    `);
    console.log('   ✅ Novo constraint adicionado\n');
    
    // 4. Verificar constraint final
    console.log('4️⃣  Verificando constraint final...');
    const finalResult = await pool.query(`
      SELECT check_clause 
      FROM information_schema.check_constraints 
      WHERE constraint_name = 'channels_type_check'
    `);
    
    if (finalResult.rows.length > 0) {
      console.log('   ✅ Constraint atualizado:');
      console.log('   ' + finalResult.rows[0].check_clause);
      
      if (finalResult.rows[0].check_clause.includes('twilio_sms')) {
        console.log('\n✅ SUCESSO! O constraint agora aceita "twilio_sms"\n');
      } else {
        console.log('\n❌ ERRO: O constraint ainda não inclui "twilio_sms"\n');
      }
    }
    
    // 5. Adicionar comentário
    await pool.query(`
      COMMENT ON COLUMN channels.type IS 'Channel type: whatsapp, whatsapp_cloud, facebook, instagram, telegram, email, website, twilio_sms'
    `);
    console.log('5️⃣  Comentário adicionado ao campo type\n');
    
    await pool.end();
    console.log('🎉 Processo concluído!\n');
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    console.error('Detalhes:', error);
    await pool.end();
    process.exit(1);
  }
}

fixConstraint();
