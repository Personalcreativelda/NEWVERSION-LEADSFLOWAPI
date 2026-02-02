import { query } from '../database/connection';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

/**
 * Helper function to make HTTP/HTTPS POST requests without external dependencies
 */
function postWebhook(url: string, data: any): Promise<{ ok: boolean; statusText: string }> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const postData = JSON.stringify(data);

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const client = parsedUrl.protocol === 'https:' ? https : http;

    const req = client.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        resolve({
          ok: res.statusCode ? res.statusCode >= 200 && res.statusCode < 300 : false,
          statusText: res.statusMessage || 'Unknown',
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

export class CampaignScheduler {
  private checkInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  /**
   * Inicia o scheduler que verifica campanhas agendadas a cada minuto
   */
  start() {
    if (this.isRunning) {
      console.log('[Campaign Scheduler] Já está em execução');
      return;
    }

    console.log('[Campaign Scheduler] 🚀 Iniciando scheduler de campanhas...');
    this.isRunning = true;

    // Executar imediatamente
    this.checkScheduledCampaigns();

    // Verificar a cada 1 minuto
    this.checkInterval = setInterval(() => {
      this.checkScheduledCampaigns();
    }, 60 * 1000); // 60 segundos
  }

  /**
   * Para o scheduler
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    console.log('[Campaign Scheduler] 🛑 Scheduler parado');
  }

  /**
   * Verifica campanhas agendadas que devem ser disparadas agora
   */
  private async checkScheduledCampaigns() {
    try {
      const now = new Date();
      console.log(`[Campaign Scheduler] ⏰ Verificando campanhas agendadas... (${now.toISOString()})`);

      // Buscar TODAS as campanhas agendadas para debug
      const allScheduledResult = await query(
        `SELECT id, name, status, scheduled_at,
                scheduled_at <= $1 as should_fire,
                EXTRACT(EPOCH FROM ($1::timestamp - scheduled_at)) / 60 as minutes_diff
         FROM campaigns
         WHERE status = 'scheduled'
         AND scheduled_at IS NOT NULL
         ORDER BY scheduled_at ASC`,
        [now]
      );

      if (allScheduledResult.rows.length > 0) {
        console.log(`[Campaign Scheduler] 📋 Total de campanhas com status 'scheduled': ${allScheduledResult.rows.length}`);
        allScheduledResult.rows.forEach((c: any) => {
          console.log(`[Campaign Scheduler]   - ${c.name}: scheduled_at=${c.scheduled_at}, should_fire=${c.should_fire}, diff=${Math.round(c.minutes_diff)} min`);
        });
      }

      // Buscar campanhas com status 'scheduled' e scheduled_at <= agora
      const result = await query(
        `SELECT * FROM campaigns
         WHERE status = 'scheduled'
         AND scheduled_at IS NOT NULL
         AND scheduled_at <= $1`,
        [now]
      );

      const campaigns = result.rows;

      if (campaigns.length === 0) {
        console.log('[Campaign Scheduler] ✅ Nenhuma campanha agendada para disparar no momento');
        return;
      }

      console.log(`[Campaign Scheduler] 📢 Encontradas ${campaigns.length} campanha(s) para disparar`);

      // Processar cada campanha
      for (const campaign of campaigns) {
        await this.triggerCampaign(campaign);
      }
    } catch (error) {
      console.error('[Campaign Scheduler] ❌ Erro ao verificar campanhas:', error);
    }
  }

  /**
   * Dispara uma campanha agendada
   */
  private async triggerCampaign(campaign: any) {
    try {
      console.log(`[Campaign Scheduler] 🎯 Disparando campanha: ${campaign.name} (${campaign.id})`);

      // 1. Atualizar status da campanha para 'active'
      await query(
        `UPDATE campaigns
         SET status = 'active',
             started_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [campaign.id]
      );

      // 2. Disparar webhook do N8N (se configurado)
      const n8nWebhookUrl = process.env.N8N_CAMPAIGN_WEBHOOK_URL;

      if (n8nWebhookUrl) {
        console.log(`[Campaign Scheduler] 📡 Disparando webhook N8N: ${n8nWebhookUrl}`);

        const settings = typeof campaign.settings === 'string'
          ? JSON.parse(campaign.settings)
          : campaign.settings || {};

        const webhookPayload = {
          campaignId: campaign.id,
          campaignName: campaign.name,
          userId: campaign.user_id,
          type: campaign.type,
          template: campaign.template,
          settings,
          media_urls: campaign.media_urls || [],
          scheduled_at: campaign.scheduled_at,
          triggered_at: new Date().toISOString()
        };

        try {
          const response = await postWebhook(n8nWebhookUrl, webhookPayload);

          if (response.ok) {
            console.log(`[Campaign Scheduler] ✅ Webhook N8N disparado com sucesso para campanha ${campaign.id}`);
          } else {
            console.error(`[Campaign Scheduler] ❌ Erro ao disparar webhook N8N:`, response.statusText);
          }
        } catch (webhookError) {
          console.error(`[Campaign Scheduler] ❌ Erro ao disparar webhook N8N:`, webhookError);
        }
      } else {
        console.warn(`[Campaign Scheduler] ⚠️ N8N_CAMPAIGN_WEBHOOK_URL não configurado, campanha ${campaign.id} ativada mas webhook não disparado`);
      }

      console.log(`[Campaign Scheduler] ✅ Campanha ${campaign.name} disparada com sucesso!`);
    } catch (error) {
      console.error(`[Campaign Scheduler] ❌ Erro ao disparar campanha ${campaign.id}:`, error);

      // Marcar campanha como failed
      try {
        await query(
          `UPDATE campaigns
           SET status = 'failed',
               updated_at = NOW()
           WHERE id = $1`,
          [campaign.id]
        );
      } catch (updateError) {
        console.error('[Campaign Scheduler] ❌ Erro ao atualizar status da campanha:', updateError);
      }
    }
  }

  /**
   * Retorna o status do scheduler
   */
  getStatus() {
    return {
      running: this.isRunning,
      message: this.isRunning
        ? 'Scheduler está rodando e verificando campanhas agendadas'
        : 'Scheduler está parado'
    };
  }
}

// Exportar instância singleton
export const campaignScheduler = new CampaignScheduler();
