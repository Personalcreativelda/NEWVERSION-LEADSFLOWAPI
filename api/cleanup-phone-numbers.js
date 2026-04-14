#!/usr/bin/env node
/**
 * Script para executar limpeza de números telefônicos no PostgreSQL
 * Uso: node cleanup-phone-numbers.js
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.PG_HOST || '168.231.104.15',
  port: process.env.PG_PORT || 5433,
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE || 'postgres',
  ssl: false,
});

async function cleanupPhoneNumbers() {
  const client = await pool.connect();
  
  try {
    console.log('\n' + '═'.repeat(80));
    console.log('🧹 Iniciando limpeza de números telefônicos...');
    console.log('═'.repeat(80) + '\n');

    console.log('📋 PASSO 1: Criar backup da tabela leads...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS leads_backup_phone_cleanup AS
      SELECT * FROM leads WHERE phone IS NOT NULL OR whatsapp IS NOT NULL;
    `);
    console.log('✅ Backup criado em leads_backup_phone_cleanup\n');

    console.log('🧹 PASSO 2: Normalizar coluna "phone"...');
    const phoneResult = await client.query(`
      UPDATE leads
      SET phone = TRIM(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'))
      WHERE phone IS NOT NULL 
        AND phone != ''
        AND REGEXP_REPLACE(phone, '[^0-9]', '', 'g') ~ '^\\d{5,15}$'
    `);
    console.log(`✅ ${phoneResult.rowCount} registros atualizados\n`);

    console.log('🧹 PASSO 3: Normalizar coluna "whatsapp"...');
    const whatsappResult = await client.query(`
      UPDATE leads
      SET whatsapp = TRIM(REGEXP_REPLACE(whatsapp, '[^0-9]', '', 'g'))
      WHERE whatsapp IS NOT NULL 
        AND whatsapp != ''
        AND REGEXP_REPLACE(whatsapp, '[^0-9]', '', 'g') ~ '^\\d{5,15}$'
    `);
    console.log(`✅ ${whatsappResult.rowCount} registros atualizados\n`);

    console.log('📊 PASSO 4: Verificar resultado da limpeza...');
    const statsResult = await client.query(`
      SELECT 
        COUNT(*) AS total_leads,
        COUNT(CASE WHEN phone IS NOT NULL AND phone ~ '^\\d+$' THEN 1 END) AS phone_cleaned_numeric,
        COUNT(CASE WHEN phone IS NOT NULL AND phone !~ '^\\d+$' THEN 1 END) AS phone_still_malformed,
        COUNT(CASE WHEN whatsapp IS NOT NULL AND whatsapp ~ '^\\d+$' THEN 1 END) AS whatsapp_cleaned,
        COUNT(CASE WHEN whatsapp IS NOT NULL AND whatsapp !~ '^\\d+$' THEN 1 END) AS whatsapp_still_malformed
      FROM leads;
    `);

    const stats = statsResult.rows[0];
    console.log(`
    📈 ESTATÍSTICAS:
    ├─ Total de leads: ${stats.total_leads}
    ├─ Phone normalizados: ${stats.phone_cleaned_numeric}
    ├─ Phone ainda malformados: ${stats.phone_still_malformed}
    ├─ WhatsApp normalizados: ${stats.whatsapp_cleaned}
    └─ WhatsApp ainda malformados: ${stats.whatsapp_still_malformed}
    `);

    console.log('✅ LIMPEZA CONCLUÍDA COM SUCESSO!\n');
    console.log('═'.repeat(80));
    console.log('ℹ️  Próximos passos:');
    console.log('1. Fazer rebuild do backend no Coolify');
    console.log('2. Enviar uma mensagem de teste via WhatsApp');
    console.log('3. Verificar se o lead foi criado corretamente');
    console.log('═'.repeat(80) + '\n');

  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    console.error('\nStack:', error.stack);
    process.exit(1);
  } finally {
    await client.release();
    await pool.end();
  }
}

cleanupPhoneNumbers();
