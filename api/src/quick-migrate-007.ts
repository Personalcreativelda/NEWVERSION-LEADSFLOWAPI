/**
 * Script de migração rápida - executar via backend rodando
 * Use: import e rode manualmente no servidor
 */

import { query } from './database/connection';
import fs from 'fs';
import path from 'path';

export async function apply007Migration() {
  try {
    console.log('🔄 Aplicando migração 007...');
    
    const sql = fs.readFileSync(
      path.join(__dirname, 'database', 'migrations', '007_add_twilio_sms_channel_type.sql'),
      'utf8'
    );
    
    await query(sql);
    console.log('✅ Migração 007 aplicada com sucesso!');
    
    // Verificar
    const result = await query(`
      SELECT check_clause 
      FROM information_schema.check_constraints 
      WHERE constraint_name = 'channels_type_check'
    `);
    
    if (result.rows.length > 0) {
      console.log('✅ Constraint atualizado:', result.rows[0].check_clause);
    }
    
    return true;
  } catch (error: any) {
    console.error('❌ Erro ao aplicar migração 007:', error.message);
    throw error;
  }
}

// Se executado diretamente
if (require.main === module) {
  apply007Migration()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
