/**
 * Script de diagnóstico - Verificar por que o assistente não responde
 * 
 * Execução: npx ts-node api/diagnose-assistants.ts
 */
import { query } from './src/database/connection';

async function diagnoseAssistants() {
  try {
    console.log('🔍 DIAGNÓSTICO DE ASSISTENTES - Evolution API\n');
    console.log('=' .repeat(70));

    // 1. Verificar canais Evolution API
    console.log('\n📱 1. CANAIS EVOLUTION API CADASTRADOS:');
    const channelsResult = await query(
      `SELECT id, user_id, name, type, is_active, credentials::text 
       FROM channels 
       WHERE type = $1 OR type LIKE $2
       ORDER BY created_at DESC`,
      ['whatsapp', '%evolution%']
    );

    if (channelsResult.rows.length === 0) {
      console.log('   ❌ PROBLEMA: Nenhum canal Evolution API encontrado!');
      console.log('   Solução: Cadastre um canal Evolution API no painel');
    } else {
      console.log(`   ✅ Encontrados ${channelsResult.rows.length} canal(is):`);
      channelsResult.rows.forEach((channel: any) => {
        console.log(`\n      📌 Canal: ${channel.name}`);
        console.log(`         - ID: ${channel.id}`);
        console.log(`         - Type: ${channel.type}`);
        console.log(`         - User ID: ${channel.user_id}`);
        console.log(`         - Ativo: ${channel.is_active ? '✅ SIM' : '❌ NÃO'}`);
        
        // 2. Para cada canal, verificar assistentes vinculados
        console.log('\n      🤖 2. ASSISTENTES VINCULADOS A ESTE CANAL:');
        query(
          `SELECT ua.id, ua.user_id, ua.is_active, ua.channel_ids, ua.channel_id, a.name
           FROM user_assistants ua
           LEFT JOIN assistants a ON ua.assistant_id = a.id
           WHERE ua.user_id = $1`,
          [channel.user_id]
        ).then((assistantResult: any) => {
          if (assistantResult.rows.length === 0) {
            console.log(`         ❌ PROBLEMA: Este usuário (${channel.user_id}) NÃO tem assistentes!`);
            console.log(`         Solução: Conecte um assistente em Marketplace → Meus Assistentes`);
          } else {
            console.log(`         ✅ Encontrados ${assistantResult.rows.length} assistente(s):`);
            assistantResult.rows.forEach((assistant: any) => {
              const channelIds = Array.isArray(assistant.channel_ids) ? assistant.channel_ids : [];
              const isInChannel = channelIds.includes(channel.id) || assistant.channel_id === channel.id;
              
              console.log(`\n            🎙️ ${assistant.name}`);
              console.log(`               - ID: ${assistant.id}`);
              console.log(`               - Ativo: ${assistant.is_active ? '✅ SIM' : '❌ NÃO'}`);
              console.log(`               - channel_id (legacy): ${assistant.channel_id || 'NULL'}`);
              console.log(`               - channel_ids (novo): ${JSON.stringify(channelIds)}`);
              
              if (isInChannel) {
                console.log(`               ✅ VINCULADO A ESTE CANAL`);
                if (!assistant.is_active) {
                  console.log(`               ⚠️ MAS ESTÁ DESATIVADO!`);
                  console.log(`               Solução: Ative o assistente em Meus Assistentes`);
                }
              } else {
                console.log(`               ❌ NÃO VINCULADO A ESTE CANAL!`);
                console.log(`               Solução: Conecte este assistente ao canal`);
              }
            });
          }
        });
      });
    }

    console.log('\n' + '='.repeat(70));
    console.log('\n📋 CHECKLIST DE SOLUÇÕES:\n');
    console.log('1. ☐ Verificar se há um canal Evolution API cadastrado');
    console.log('2. ☐ Verificar se o assistente está conectado AO CANAL ESPECÍFICO');
    console.log('3. ☐ Verificar se o assistente está ATIVADO (✅ verde)');
    console.log('4. ☐ Se falta algo, ver logs em terminal quando mensagem chegar:');
    console.log('      [AssistantProcessor] 🔍 Buscando assistente ativo para canal=...');
    console.log('5. ☐ Enviar mensagem no Evolution API novamente e verificar logs');
    console.log('\n' + '='.repeat(70));

    process.exit(0);
  } catch (error: any) {
    console.error('❌ Erro ao diagnosticar:', error.message);
    process.exit(1);
  }
}

diagnoseAssistants();
