#!/usr/bin/env ts-node

/**
 * Script para corrigir campanhas agendadas com timezone incorreto
 *
 * Este script identifica campanhas com scheduled_at no futuro devido ao bug de timezone
 * e corrige o horário considerando o offset do timezone (UTC-3 para Brasil)
 *
 * Usage: npx ts-node api/scripts/fix-scheduled-campaigns-timezone.ts
 */

import { query } from '../src/database/connection';

const TIMEZONE_OFFSET_HOURS = -3; // UTC-3 (Brasília)

async function fixScheduledCampaignsTimezone() {
  try {
    console.log('🔧 Corrigindo timezone de campanhas agendadas...\n');

    const now = new Date();
    console.log(`📅 Horário atual (UTC): ${now.toISOString()}`);
    console.log(`📅 Horário atual (Local BR): ${now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n`);

    // Buscar todas as campanhas agendadas
    const result = await query(
      `SELECT
        id,
        name,
        status,
        scheduled_at,
        created_at,
        EXTRACT(EPOCH FROM ($1::timestamp - scheduled_at)) / 60 as minutes_diff
      FROM campaigns
      WHERE status = 'scheduled'
      AND scheduled_at IS NOT NULL
      ORDER BY scheduled_at ASC`,
      [now]
    );

    if (result.rows.length === 0) {
      console.log('❌ Nenhuma campanha agendada encontrada\n');
      return;
    }

    console.log(`📢 Encontradas ${result.rows.length} campanha(s) agendada(s)\n`);

    // Identificar campanhas com timezone incorreto
    // Se a campanha foi criada recentemente mas está agendada para o futuro distante,
    // provavelmente tem o bug de timezone
    const campaignsToFix = result.rows.filter((campaign: any) => {
      const minutesDiff = Math.round(campaign.minutes_diff);
      const createdAt = new Date(campaign.created_at);
      const scheduledAt = new Date(campaign.scheduled_at);
      const hoursSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

      // Se foi criada recentemente (< 24h) e está agendada para mais de 2 horas no futuro,
      // pode ter o bug (considerando offset de 3h)
      return hoursSinceCreation < 24 && minutesDiff < -60;
    });

    if (campaignsToFix.length === 0) {
      console.log('✅ Nenhuma campanha precisa de correção\n');
      result.rows.forEach((campaign: any, index: number) => {
        console.log(`${index + 1}. ${campaign.name}`);
        console.log(`   Status: ${campaign.status}`);
        console.log(`   Agendada para: ${campaign.scheduled_at}`);
        console.log(`   Diferença: ${Math.round(campaign.minutes_diff)} minutos\n`);
      });
      return;
    }

    console.log(`⚠️ Encontradas ${campaignsToFix.length} campanha(s) que podem estar com timezone incorreto:\n`);

    for (const campaign of campaignsToFix) {
      const scheduledAt = new Date(campaign.scheduled_at);
      const minutesDiff = Math.round(campaign.minutes_diff);

      console.log(`\n📝 Campanha: ${campaign.name} (${campaign.id})`);
      console.log(`   Agendada para (atual): ${campaign.scheduled_at}`);
      console.log(`   Diferença: ${minutesDiff} minutos (${Math.round(minutesDiff / 60)} horas)`);

      // Calcular novo horário: subtrair o offset em HORAS (3 horas para UTC-3)
      // Se estava agendado para 22:23 UTC mas deveria ser 22:23 BRT,
      // e 22:23 BRT = 01:23 UTC do dia seguinte
      // Mas o bug fez com que salvasse como 19:23 UTC (subtraiu 3h em vez de adicionar)
      // Para corrigir: devemos ADICIONAR 2 * offset = 6 horas
      const correctedScheduledAt = new Date(scheduledAt.getTime() + (Math.abs(TIMEZONE_OFFSET_HOURS) * 2 * 60 * 60 * 1000));

      console.log(`   Novo horário (corrigido): ${correctedScheduledAt.toISOString()}`);
      console.log(`   Horário local (corrigido): ${correctedScheduledAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);

      // Perguntar se deve aplicar a correção
      console.log(`\n   ⚠️ ATENÇÃO: Isso mudará o horário de ${scheduledAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
      console.log(`             para ${correctedScheduledAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);

      // Verificar se o novo horário está no passado
      if (correctedScheduledAt <= now) {
        console.log(`   ⚠️ O horário corrigido está no passado! A campanha será marcada para disparo imediato.`);
      }
    }

    console.log('\n\n⚠️ ATENÇÃO: Execute o comando abaixo apenas se tiver certeza da correção:');
    console.log('Este script não aplica as mudanças automaticamente. Para aplicar, descomente o código de UPDATE.\n');

    // DESCOMENTE AS LINHAS ABAIXO PARA APLICAR AS CORREÇÕES:
    /*
    for (const campaign of campaignsToFix) {
      const scheduledAt = new Date(campaign.scheduled_at);
      const correctedScheduledAt = new Date(scheduledAt.getTime() + (Math.abs(TIMEZONE_OFFSET_HOURS) * 2 * 60 * 60 * 1000));

      await query(
        `UPDATE campaigns
         SET scheduled_at = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [correctedScheduledAt, campaign.id]
      );

      console.log(`✅ Campanha ${campaign.id} corrigida!`);
    }
    */

  } catch (error) {
    console.error('❌ Erro ao corrigir campanhas:', error);
  } finally {
    process.exit(0);
  }
}

fixScheduledCampaignsTimezone();
