#!/usr/bin/env ts-node

/**
 * Script de teste para verificar campanhas agendadas
 *
 * Usage: npx ts-node api/scripts/check-scheduled-campaigns.ts
 */

import { query } from '../src/database/connection';

async function checkScheduledCampaigns() {
  try {
    console.log('🔍 Verificando campanhas agendadas...\n');

    const now = new Date();
    console.log(`📅 Horário atual (servidor): ${now.toISOString()}`);
    console.log(`📅 Horário atual (local): ${now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n`);

    // Buscar todas as campanhas agendadas
    const result = await query(
      `SELECT
        id,
        name,
        status,
        scheduled_at,
        started_at,
        completed_at,
        created_at,
        stats,
        scheduled_at <= $1 as should_fire_now,
        EXTRACT(EPOCH FROM ($1::timestamp - scheduled_at)) / 60 as minutes_diff
      FROM campaigns
      WHERE status = 'scheduled'
      ORDER BY scheduled_at ASC`,
      [now]
    );

    if (result.rows.length === 0) {
      console.log('❌ Nenhuma campanha com status "scheduled" encontrada\n');

      // Verificar se há campanhas em outros status
      const allCampaigns = await query(
        `SELECT status, COUNT(*) as count FROM campaigns GROUP BY status`
      );

      console.log('📊 Campanhas por status:');
      allCampaigns.rows.forEach((row: any) => {
        console.log(`   ${row.status}: ${row.count}`);
      });

      return;
    }

    console.log(`📢 Encontradas ${result.rows.length} campanha(s) agendada(s):\n`);

    result.rows.forEach((campaign: any, index: number) => {
      const scheduledAtUTC = new Date(campaign.scheduled_at);
      const scheduledAtLocal = scheduledAtUTC.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      const diffMinutes = Math.round(campaign.minutes_diff);
      const diffHours = Math.round(diffMinutes / 60);

      console.log(`${index + 1}. ${campaign.name}`);
      console.log(`   ID: ${campaign.id}`);
      console.log(`   Status: ${campaign.status}`);
      console.log(`   Agendada para (UTC): ${campaign.scheduled_at}`);
      console.log(`   Agendada para (Local BR): ${scheduledAtLocal}`);
      console.log(`   Diferença: ${diffMinutes} minutos (${diffHours} horas)`);
      console.log(`   Deve disparar agora? ${campaign.should_fire_now ? '✅ SIM' : '❌ NÃO'}`);

      if (campaign.should_fire_now) {
        if (diffMinutes > 60) {
          console.log(`   ⚠️ ATENÇÃO: Campanha deveria ter disparado há ${diffHours} horas!`);
        } else {
          console.log(`   ✅ Pronta para disparar`);
        }
      } else {
        const minutesUntil = Math.abs(diffMinutes);
        const hoursUntil = Math.abs(diffHours);
        console.log(`   ⏰ Vai disparar em: ${minutesUntil} minutos (${hoursUntil} horas)`);
      }

      if (campaign.stats) {
        console.log(`   Estatísticas:`, campaign.stats);
      }

      console.log('');
    });

    // Verificar variável de ambiente
    console.log('\n🔧 Configuração:');
    console.log(`   N8N_CAMPAIGN_WEBHOOK_URL: ${process.env.N8N_CAMPAIGN_WEBHOOK_URL || '❌ NÃO CONFIGURADO'}`);

    if (!process.env.N8N_CAMPAIGN_WEBHOOK_URL) {
      console.log('\n⚠️ AVISO: N8N_CAMPAIGN_WEBHOOK_URL não está configurado!');
      console.log('   As campanhas serão marcadas como "active" mas o webhook não será disparado.');
      console.log('   Configure no arquivo .env e reinicie a API.\n');
    }

  } catch (error) {
    console.error('❌ Erro ao verificar campanhas:', error);
  } finally {
    process.exit(0);
  }
}

checkScheduledCampaigns();
