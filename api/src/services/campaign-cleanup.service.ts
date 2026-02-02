import { query } from '../database/connection';

/**
 * Serviço de limpeza automática de campanhas
 *
 * Este serviço roda periodicamente e:
 * 1. Marca campanhas 'active' antigas (>2 horas) como 'completed'
 * 2. Remove campanhas 'draft' muito antigas (>30 dias)
 *
 * Isso evita que campanhas fiquem presas em 'active' indefinidamente.
 */
export class CampaignCleanupService {
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private readonly CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutos
  private readonly ACTIVE_TIMEOUT = 2 * 60 * 60 * 1000; // 2 horas
  private readonly DRAFT_TIMEOUT = 30 * 24 * 60 * 60 * 1000; // 30 dias

  /**
   * Inicia o serviço de limpeza automática
   */
  start() {
    if (this.isRunning) {
      console.log('[Campaign Cleanup] Já está em execução');
      return;
    }

    console.log('[Campaign Cleanup] 🧹 Iniciando serviço de limpeza automática...');
    this.isRunning = true;

    // Executar imediatamente
    this.cleanup();

    // Executar a cada 5 minutos
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.CHECK_INTERVAL);
  }

  /**
   * Para o serviço de limpeza
   */
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.isRunning = false;
    console.log('[Campaign Cleanup] 🛑 Serviço parado');
  }

  /**
   * Executa a limpeza de campanhas
   */
  private async cleanup() {
    try {
      console.log(`[Campaign Cleanup] 🔍 Verificando campanhas para limpeza...`);

      // 1. Marcar campanhas 'active' antigas como 'completed'
      await this.cleanupStalledActiveCampaigns();

      // 2. Remover campanhas 'draft' muito antigas (opcional)
      // await this.cleanupOldDrafts();

      console.log('[Campaign Cleanup] ✅ Limpeza concluída');
    } catch (error) {
      console.error('[Campaign Cleanup] ❌ Erro durante limpeza:', error);
    }
  }

  /**
   * Marca campanhas 'active' antigas como 'completed'
   *
   * Uma campanha é considerada "antiga" se:
   * - Status = 'active'
   * - started_at > 2 horas atrás
   * - completed_at IS NULL
   */
  private async cleanupStalledActiveCampaigns() {
    try {
      const twoHoursAgo = new Date(Date.now() - this.ACTIVE_TIMEOUT);

      // Buscar campanhas antigas
      const result = await query(
        `SELECT id, name, user_id, status, started_at, stats
         FROM campaigns
         WHERE status = 'active'
         AND started_at < $1
         AND completed_at IS NULL`,
        [twoHoursAgo]
      );

      const stalledCampaigns = result.rows;

      if (stalledCampaigns.length === 0) {
        console.log('[Campaign Cleanup] 👍 Nenhuma campanha antiga encontrada');
        return;
      }

      console.log(`[Campaign Cleanup] 🚨 Encontradas ${stalledCampaigns.length} campanha(s) antiga(s)`);

      // Atualizar cada campanha
      for (const campaign of stalledCampaigns) {
        try {
          console.log(`[Campaign Cleanup] 🔧 Marcando campanha como concluída: ${campaign.name} (${campaign.id})`);

          await query(
            `UPDATE campaigns
             SET status = 'completed',
                 completed_at = NOW(),
                 updated_at = NOW()
             WHERE id = $1`,
            [campaign.id]
          );

          console.log(`[Campaign Cleanup] ✅ Campanha ${campaign.name} marcada como concluída`);
        } catch (error) {
          console.error(`[Campaign Cleanup] ❌ Erro ao atualizar campanha ${campaign.id}:`, error);
        }
      }
    } catch (error) {
      console.error('[Campaign Cleanup] ❌ Erro ao limpar campanhas antigas:', error);
    }
  }

  /**
   * Remove campanhas 'draft' muito antigas (>30 dias)
   *
   * NOTA: Comentado por padrão. Descomente se quiser remover drafts antigos automaticamente.
   */
  private async cleanupOldDrafts() {
    try {
      const thirtyDaysAgo = new Date(Date.now() - this.DRAFT_TIMEOUT);

      const result = await query(
        `DELETE FROM campaigns
         WHERE status = 'draft'
         AND created_at < $1
         RETURNING id, name`,
        [thirtyDaysAgo]
      );

      if (result.rows.length > 0) {
        console.log(`[Campaign Cleanup] 🗑️ Removidos ${result.rows.length} draft(s) antigo(s)`);
      }
    } catch (error) {
      console.error('[Campaign Cleanup] ❌ Erro ao remover drafts antigos:', error);
    }
  }

  /**
   * Retorna o status do serviço
   */
  getStatus() {
    return {
      running: this.isRunning,
      checkInterval: `${this.CHECK_INTERVAL / 1000 / 60} minutos`,
      activeTimeout: `${this.ACTIVE_TIMEOUT / 1000 / 60 / 60} horas`,
      message: this.isRunning
        ? 'Serviço de limpeza está rodando'
        : 'Serviço de limpeza está parado'
    };
  }
}

// Exportar instância singleton
export const campaignCleanupService = new CampaignCleanupService();
