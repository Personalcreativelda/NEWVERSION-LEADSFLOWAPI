/**
 * Diagnóstico detalhado de múltiplas instâncias Evolution
 * 
 * Execução: npx ts-node api/diagnose-multiple-instances.ts
 */
import { query } from './src/database/connection';

async function diagnose() {
  try {
    console.log('\n' + '='.repeat(80));
    console.log('🔍 DIAGNÓSTICO: ASSISTENTES EM MÚLTIPLAS INSTÂNCIAS EVOLUTION');
    console.log('='.repeat(80) + '\n');

    // 1. Listar TODOS os canais Evolution
    console.log('📱 1. CANAIS EVOLUTION REGISTRADOS:\n');
    const channelsResult = await query(
      `SELECT id, user_id, name, type, is_active, 
              credentials->>'instance_id' as instance_id,
              credentials->>'instance_name' as instance_name
       FROM channels WHERE type = 'whatsapp' OR type LIKE '%evolution%'
       ORDER BY created_at`
    );

    if (channelsResult.rows.length === 0) {
      console.log('❌ Nenhum canal encontrado\n');
    } else {
      channelsResult.rows.forEach((ch: any) => {
        console.log(`   📌 Canal: "${ch.name}" (ID no banco: ${ch.id})`);
        console.log(`      - Instance ID: ${ch.instance_id || 'NULL'} ⚠️`);
        console.log(`      - Instance Name: ${ch.instance_name || 'NULL'} ⚠️`);
        console.log(`      - User: ${ch.user_id}`);
        console.log(`      - Ativo: ${ch.is_active ? '✅ SIM' : '❌ NÃO'}\n`);
      });
    }

    // 2. Listar assistentes conectados
    console.log('🤖 2. ASSISTENTES CONECTADOS:\n');
    const assistantsResult = await query(
      `SELECT ua.id, ua.user_id, ua.is_active,
              ua.channel_id as legacy_channel_id,
              ua.channel_ids as new_channel_ids,
              a.name
       FROM user_assistants ua
       LEFT JOIN assistants a ON ua.assistant_id = a.id
       ORDER BY ua.created_at`
    );

    if (assistantsResult.rows.length === 0) {
      console.log('❌ Nenhum assistente conectado\n');
    } else {
      assistantsResult.rows.forEach((asst: any) => {
        const channelIds = Array.isArray(asst.new_channel_ids) ? asst.new_channel_ids : [];
        console.log(`   🎙️ ${asst.name} (ID: ${asst.id})`);
        console.log(`      - User: ${asst.user_id}`);
        console.log(`      - Ativo: ${asst.is_active ? '✅ SIM' : '❌ NÃO'}`);
        console.log(`      - Channel ID (legacy): ${asst.legacy_channel_id || 'NULL'}`);
        console.log(`      - Channel IDs (novo array): ${JSON.stringify(channelIds)}`);
        
        if (channelIds.length === 0 && !asst.legacy_channel_id) {
          console.log(`      ⚠️ PROBLEMA: NEM CHANNEL_ID NEM CHANNEL_IDS PREENCHIDO!\n`);
        } else if (channelIds.length === 0) {
          console.log(`      ⚠️ Usando apenas legacy channel_id (vai dar problema com múltiplas instâncias)\n`);
        } else {
          console.log(`      ✅ Vinculado a ${channelIds.length} canal(is)\n`);
        }
      });
    }

    // 3. Crosscheck: Verificar se os channel_ids apontam para canais existentes
    console.log('🔗 3. VALIDAÇÃO CRUZADA - Channel IDs vs Canais Cadastrados:\n');
    for (const asst of assistantsResult.rows) {
      const channelIds = Array.isArray(asst.new_channel_ids) ? asst.new_channel_ids : [];
      console.log(`   Para assistente "${asst.name}":`);
      
      if (channelIds.length === 0) {
        console.log(`      ❌ Sem channel_ids no array\n`);
        continue;
      }

      for (const chId of channelIds) {
        const channelExists = channelsResult.rows.find((ch: any) => ch.id === chId);
        if (channelExists) {
          console.log(`      ✅ Canal "${channelExists.name}" (${chId}) - Instance: ${channelExists.instance_id}`);
        } else {
          console.log(`      ❌ PROBLEMA: Channel ID ${chId} NÃO EXISTE no banco!`);
        }
      }
      console.log();
    }

    // 4. Testar query exata que o assistente usa
    console.log('🧪 4. TESTE DA QUERY DO ASSISTENTE:\n');
    const testChannels = channelsResult.rows.slice(0, 3);
    
    for (const testCh of testChannels) {
      console.log(`   Simulando webhook do canal "${testCh.name}" (ID: ${testCh.id}):`);
      
      const testResult = await query(
        `SELECT ua.id, a.name, ua.channel_ids
         FROM user_assistants ua
         LEFT JOIN assistants a ON ua.assistant_id = a.id
         WHERE ua.user_id = $1
           AND ua.is_active = true
           AND ($2 = ANY(ua.channel_ids) OR ua.channel_id = $2)
         LIMIT 1`,
        [testCh.user_id, testCh.id]
      );

      if (testResult.rows.length > 0) {
        console.log(`      ✅ ENCONTRADO: ${testResult.rows[0].name}`);
        console.log(`         Channel IDs no array: ${JSON.stringify(testResult.rows[0].channel_ids)}\n`);
      } else {
        console.log(`      ❌ NÃO ENCONTRADO - Assistente não vai responder!\n`);
      }
    }

    console.log('='.repeat(80) + '\n');
    console.log('📋 RESUMO DE PROBLEMAS ENCONTRADOS:\n');
    
    // Detectar problemas
    let hasProblems = false;
    
    for (const asst of assistantsResult.rows) {
      const channelIds = Array.isArray(asst.new_channel_ids) ? asst.new_channel_ids : [];
      if (channelIds.length === 0 && !asst.legacy_channel_id) {
        console.log(`❌ Assistente "${asst.name}" SEM NENHUM CANAL VINCULADO`);
        hasProblems = true;
      }
      for (const chId of channelIds) {
        const exists = channelsResult.rows.find((ch: any) => ch.id === chId);
        if (!exists) {
          console.log(`❌ Assistente "${asst.name}" aponta para channel ID ${chId} que NÃO EXISTE`);
          hasProblems = true;
        }
      }
    }

    if (!hasProblems && assistantsResult.rows.length > 0) {
      console.log('✅ Nenhum problema detectado!\n');
    }

    process.exit(0);
  } catch (error: any) {
    console.error('❌ Erro ao diagnosticar:', error.message);
    process.exit(1);
  }
}

diagnose();
