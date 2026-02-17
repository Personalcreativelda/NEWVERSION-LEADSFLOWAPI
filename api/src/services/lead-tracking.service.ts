import { query } from '../database/connection';

/**
 * Serviço para rastrear leads de múltiplos canais
 * Responsável por:
 * - Registrar captura de lead (data/hora)
 * - Rastrear mudanças de status
 * - Registrar todas as interações
 * - Gerar relatórios de leads por canal
 */
export class LeadTrackingService {
  /**
   * Registrar captura de lead (quando chega de um canal)
   */
  async recordLeadCapture(
    userId: string,
    leadId: string,
    channelId: string | null,
    channelSource: string, // 'whatsapp', 'telegram', 'instagram', 'whatsapp_cloud', 'facebook', 'email', 'website', 'n8n', 'campaign'
    metadata?: Record<string, any>
  ) {
    try {
      console.log(`[LeadTracking] 🎯 Registrando captura de lead: ${leadId} via ${channelSource}`);

      const result = await query(
        `UPDATE leads 
         SET captured_at = COALESCE(captured_at, NOW()),
             channel_source = $1,
             captured_by_channel_id = $2,
             tracking_metadata = jsonb_set(
               COALESCE(tracking_metadata, '{}'::jsonb),
               '{captured_from}',
               $3::jsonb
             )
         WHERE id = $4 AND user_id = $5
         RETURNING *`,
        [
          channelSource,
          channelId,
          JSON.stringify({
            channel: channelSource,
            channel_id: channelId,
            timestamp: new Date().toISOString(),
            ...metadata
          }),
          leadId,
          userId
        ]
      );

      if (result.rows.length > 0) {
        console.log(`[LeadTracking] ✅ Lead capturado com sucesso: ${leadId}`);
        return result.rows[0];
      }
      return null;
    } catch (error) {
      console.error('[LeadTracking] Erro ao registrar captura:', error);
      throw error;
    }
  }

  /**
   * Registrar mudança de status de lead
   * Automaticamente mantém histórico completo
   */
  async recordStatusChange(
    userId: string,
    leadId: string,
    newStatus: string,
    reason?: string,
    metadata?: Record<string, any>
  ) {
    try {
      console.log(`[LeadTracking] 📊 Registrando mudança de status: ${leadId} -> ${newStatus}`);

      // Pegar status atual
      const currentLead = await query(
        'SELECT status, first_status_change_at FROM leads WHERE id = $1 AND user_id = $2',
        [leadId, userId]
      );

      if (currentLead.rows.length === 0) {
        console.warn(`[LeadTracking] Lead não encontrado: ${leadId}`);
        return null;
      }

      const lead = currentLead.rows[0];
      const oldStatus = lead.status;

      // Se status não mudou, não registra
      if (oldStatus === newStatus) {
        console.log(`[LeadTracking] ℹ️ Status não mudou (${oldStatus}), ignorando`);
        return null;
      }

      // Registrar no histórico
      const historyResult = await query(
        `INSERT INTO lead_status_history (
          user_id, lead_id, old_status, new_status, reason, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
         RETURNING *`,
        [
          userId,
          leadId,
          oldStatus,
          newStatus,
          reason || null,
          JSON.stringify({
            timestamp: new Date().toISOString(),
            ...metadata
          })
        ]
      );

      // Atualizar lead
      const updateLeadResult = await query(
        `UPDATE leads 
         SET status = $1,
             first_status_change_at = COALESCE(first_status_change_at, NOW()),
             updated_at = NOW()
         WHERE id = $2 AND user_id = $3
         RETURNING *`,
        [newStatus, leadId, userId]
      );

      console.log(`[LeadTracking] ✅ Status atualizado: ${oldStatus} -> ${newStatus}`);
      return {
        history: historyResult.rows[0],
        lead: updateLeadResult.rows[0]
      };
    } catch (error) {
      console.error('[LeadTracking] Erro ao registrar mudança de status:', error);
      throw error;
    }
  }

  /**
   * Registrar interação com lead
   * (mensagem recebida/enviada, chamada, email, etc)
   */
  async recordInteraction(
    userId: string,
    leadId: string,
    interactionType: string,
    data: {
      conversationId?: string;
      channelId?: string;
      direction?: 'in' | 'out';
      content?: string;
      details?: Record<string, any>;
    }
  ) {
    try {
      console.log(`[LeadTracking] 💬 Registrando interação: ${leadId} - ${interactionType}`);

      const result = await query(
        `INSERT INTO lead_interactions (
          user_id, lead_id, conversation_id, channel_id,
          interaction_type, direction, content, details, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         RETURNING *`,
        [
          userId,
          leadId,
          data.conversationId || null,
          data.channelId || null,
          interactionType,
          data.direction || null,
          data.content || null,
          JSON.stringify(data.details || {})
        ]
      );

      console.log(`[LeadTracking] ✅ Interação registrada: ${interactionType}`);
      return result.rows[0];
    } catch (error) {
      console.error('[LeadTracking] Erro ao registrar interação:', error);
      throw error;
    }
  }

  /**
   * Obter leads capturados hoje
   */
  async getLeadsCapturedToday(
    userId: string,
    filters?: {
      channelSource?: string;
      status?: string;
      limit?: number;
      offset?: number;
    }
  ) {
    try {
      let sql = `
        SELECT 
          l.id,
          l.name,
          l.email,
          l.phone,
          l.status,
          COALESCE(l.channel_source, l.source) as channel_source,
          COALESCE(l.captured_at, l.created_at) as captured_at,
          l.source,
          ch.type as channel_type,
          ch.name as channel_name,
          EXTRACT(HOUR FROM COALESCE(l.captured_at, l.created_at) AT TIME ZONE 'America/Sao_Paulo') as hour_captured,
          COUNT(DISTINCT li.id) as interaction_count
        FROM leads l
        LEFT JOIN channels ch ON l.captured_by_channel_id = ch.id
        LEFT JOIN lead_interactions li ON l.id = li.lead_id
        WHERE l.user_id = $1
          AND DATE(COALESCE(l.captured_at, l.created_at) AT TIME ZONE 'America/Sao_Paulo') = CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo'
      `;

      const params: any[] = [userId];
      let paramIndex = 2;

      if (filters?.channelSource) {
        sql += ` AND COALESCE(l.channel_source, l.source) = $${paramIndex}`;
        params.push(filters.channelSource);
        paramIndex++;
      }

      if (filters?.status) {
        sql += ` AND l.status = $${paramIndex}`;
        params.push(filters.status);
        paramIndex++;
      }

      sql += ` GROUP BY l.id, l.name, l.email, l.phone, l.status, l.channel_source, l.captured_at, l.created_at, l.source, ch.type, ch.name
               ORDER BY COALESCE(l.captured_at, l.created_at) DESC`;

      if (filters?.limit) {
        sql += ` LIMIT $${paramIndex}`;
        params.push(filters.limit);
        paramIndex++;
      }

      if (filters?.offset) {
        sql += ` OFFSET $${paramIndex}`;
        params.push(filters.offset);
      }

      const result = await query(sql, params);
      console.log(`[LeadTracking] 📋 Leads capturados hoje: ${result.rows.length}`);
      return result.rows;
    } catch (error) {
      console.error('[LeadTracking] Erro ao buscar leads capturados hoje:', error);
      throw error;
    }
  }

  /**
   * Obter histórico de mudanças de status de um lead
   */
  async getStatusHistory(userId: string, leadId: string) {
    try {
      const result = await query(
        `SELECT * FROM lead_status_history 
         WHERE user_id = $1 AND lead_id = $2
         ORDER BY created_at ASC`,
        [userId, leadId]
      );

      console.log(`[LeadTracking] 📈 Histórico de status: ${result.rows.length} mudanças`);
      return result.rows;
    } catch (error) {
      console.error('[LeadTracking] Erro ao buscar histórico:', error);
      throw error;
    }
  }

  /**
   * Obter todas as interações de um lead
   */
  async getLeadInteractions(
    userId: string,
    leadId: string,
    filters?: {
      interactionType?: string;
      limit?: number;
      offset?: number;
    }
  ) {
    try {
      let sql = `SELECT * FROM lead_interactions 
                 WHERE user_id = $1 AND lead_id = $2`;
      const params: any[] = [userId, leadId];
      let paramIndex = 3;

      if (filters?.interactionType) {
        sql += ` AND interaction_type = $${paramIndex}`;
        params.push(filters.interactionType);
        paramIndex++;
      }

      sql += ' ORDER BY created_at DESC';

      if (filters?.limit) {
        sql += ` LIMIT $${paramIndex}`;
        params.push(filters.limit);
        paramIndex++;
      }

      if (filters?.offset) {
        sql += ` OFFSET $${paramIndex}`;
        params.push(filters.offset);
      }

      const result = await query(sql, params);
      return result.rows;
    } catch (error) {
      console.error('[LeadTracking] Erro ao buscar interações:', error);
      throw error;
    }
  }

  /**
   * Obter estatísticas de leads por canal
   */
  async getLeadsStatsByChannel(userId: string, days: number = 7) {
    try {
      const result = await query(
        `SELECT 
          COALESCE(channel_source, source) as channel_source,
          status,
          COUNT(*) as count,
          COUNT(CASE WHEN DATE(COALESCE(captured_at, created_at)) = CURRENT_DATE THEN 1 END) as today,
          MAX(COALESCE(captured_at, created_at)) as last_captured,
          AVG(EXTRACT(EPOCH FROM (now() - COALESCE(captured_at, created_at))) / 3600.0) as avg_hours_old
         FROM leads
         WHERE user_id = $1
           AND COALESCE(captured_at, created_at) >= NOW() - INTERVAL '1 day' * $2
         GROUP BY COALESCE(channel_source, source), status
         ORDER BY COALESCE(channel_source, source), count DESC`,
        [userId, days]
      );

      console.log(`[LeadTracking] 📊 Estatísticas: ${result.rows.length} grupos`);
      return result.rows;
    } catch (error) {
      console.error('[LeadTracking] Erro ao buscar estatísticas:', error);
      throw error;
    }
  }

  /**
   * Obter resumo de movimento de leads
   */
  async getLeadMovementSummary(userId: string, leadId: string) {
    try {
      const statusHistory = await this.getStatusHistory(userId, leadId);
      const interactions = await this.getLeadInteractions(userId, leadId);
      
      const leadResult = await query(
        'SELECT captured_at, channel_source, source, status, created_at FROM leads WHERE id = $1 AND user_id = $2',
        [leadId, userId]
      );

      if (leadResult.rows.length === 0) return null;

      const lead = leadResult.rows[0];

      return {
        lead: {
          id: leadId,
          status: lead.status,
          capturedAt: lead.captured_at || lead.created_at,
          channelSource: lead.channel_source || lead.source,
          createdAt: lead.created_at
        },
        statusHistory,
        interactions,
        summary: {
          totalStatusChanges: statusHistory.length,
          totalInteractions: interactions.length,
          messagesSent: interactions.filter((i: any) => i.direction === 'out').length,
          messagesReceived: interactions.filter((i: any) => i.direction === 'in').length,
          daysActive: Math.floor((Date.now() - new Date(lead.captured_at || lead.created_at).getTime()) / (1000 * 60 * 60 * 24))
        }
      };
    } catch (error) {
      console.error('[LeadTracking] Erro ao buscar resumo de movimento:', error);
      throw error;
    }
  }
}

export const leadTrackingService = new LeadTrackingService();
