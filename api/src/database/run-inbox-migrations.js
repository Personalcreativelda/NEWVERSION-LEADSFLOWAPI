// INBOX: Executar migrações consolidadas via Node.js
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const client = new Client({
    host: '168.231.104.15',
    port: 5433,
    database: 'postgres',
    user: 'postgres',
    password: 'Mam11Me8DUEnp6Quq8N5c9msIBVH9ZCCeK7aZt0Ga6azkdKGvwzKJrCxtl6Hh6a6',
    ssl: false
});

async function runMigrations() {
    try {
        console.log('🔌 Conectando ao banco de dados...');
        await client.connect();
        console.log('✅ Conectado com sucesso!\n');

        console.log('📝 Lendo arquivo de migrações...');
        const sqlPath = path.join(__dirname, 'migrations', 'inbox_migrations_consolidated.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('🚀 Executando migrações do Inbox...\n');
        await client.query(sql);

        console.log('✅ Migrações executadas com sucesso!\n');

        // Verificar tabelas criadas
        const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('channels', 'conversations', 'ai_assistants')
      ORDER BY table_name
    `);

        console.log('📊 Tabelas criadas:');
        result.rows.forEach(row => {
            console.log(`  ✓ ${row.table_name}`);
        });

        // Verificar se há canais migrados
        const channelsCount = await client.query('SELECT COUNT(*) as count FROM channels');
        console.log(`\n📱 Canais WhatsApp migrados: ${channelsCount.rows[0].count}`);

    } catch (error) {
        console.error('❌ Erro ao executar migrações:', error);
        process.exit(1);
    } finally {
        await client.end();
        console.log('\n🔌 Conexão encerrada.');
    }
}

runMigrations();
