const { Pool } = require('pg');
const path = require('path');

// Carregar .env
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'postgres',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('\n🔧 ADICIONANDO COLUNA is_group NA TABELA conversations\n');
    console.log('📍 Conexão:');
    console.log(`   Host: ${process.env.PG_HOST}`);
    console.log(`   Port: ${process.env.PG_PORT}`);
    console.log(`   Database: ${process.env.PG_DATABASE}`);
    console.log(`   User: ${process.env.PG_USER}\n`);

    // 1. Verificar se a coluna já existe
    console.log('1️⃣  Verificando se coluna is_group já existe...');
    const checkCol = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'conversations' AND column_name = 'is_group'
    `);

    if (checkCol.rows.length > 0) {
      console.log('   ✅ Coluna is_group já existe! Nenhuma ação necessária.\n');
      return;
    }

    console.log('   ⚠️  Coluna is_group NÃO existe. Criando...\n');

    // 2. Adicionar a coluna is_group
    console.log('2️⃣  Adicionando coluna is_group...');
    await client.query(`
      ALTER TABLE conversations 
      ADD COLUMN IF NOT EXISTS is_group BOOLEAN DEFAULT FALSE
    `);
    console.log('   ✅ Coluna is_group adicionada com sucesso!\n');

    // 3. Atualizar conversas existentes que são grupos (@g.us)
    console.log('3️⃣  Atualizando conversas existentes que são grupos (@g.us)...');
    const updateResult = await client.query(`
      UPDATE conversations 
      SET is_group = TRUE 
      WHERE remote_jid LIKE '%@g.us' AND is_group = FALSE
    `);
    console.log(`   ✅ ${updateResult.rowCount} conversa(s) de grupo atualizadas!\n`);

    // 4. Criar índice para is_group
    console.log('4️⃣  Criando índice para is_group...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_conversations_is_group 
      ON conversations(is_group) WHERE is_group = TRUE
    `);
    console.log('   ✅ Índice criado!\n');

    // 5. Verificar resultado final
    console.log('5️⃣  Verificando resultado final...');
    const check = await client.query(`
      SELECT 
        COUNT(*) FILTER (WHERE is_group = TRUE) as grupos,
        COUNT(*) FILTER (WHERE is_group = FALSE) as individuais,
        COUNT(*) as total
      FROM conversations
    `);
    const stats = check.rows[0];
    console.log(`   Total de conversas: ${stats.total}`);
    console.log(`   Conversas de grupo: ${stats.grupos}`);
    console.log(`   Conversas individuais: ${stats.individuais}`);

    console.log('\n✅ MIGRAÇÃO CONCLUÍDA COM SUCESSO!\n');
    console.log('💡 Reinicie a API para que as mensagens voltem a entrar no inbox.\n');

  } catch (err) {
    console.error('\n❌ ERRO NA MIGRAÇÃO:', err.message);
    console.error(err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
