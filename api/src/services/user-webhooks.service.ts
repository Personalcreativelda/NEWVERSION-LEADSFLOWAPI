import { query } from '../database/connection';

// Eventos disponíveis para webhook - compatível com Evolution, Chatwoot, n8n
export const WEBHOOK_EVENTS = {
  // Mensagens
  'message.received': {
    name: 'Mensagem Recebida',
    description: 'Quando uma nova mensagem é recebida de um contato',
    category: 'messages',
  },
  'message.sent': {
    name: 'Mensagem Enviada',
    description: 'Quando uma mensagem é enviada para um contato',
    category: 'messages',
  },
  'message.updated': {
    name: 'Mensagem Atualizada',
    description: 'Quando o status de uma mensagem é atualizado (entregue, lida)',
    category: 'messages',
  },
  'message.deleted': {
    name: 'Mensagem Deletada',
    description: 'Quando uma mensagem é deletada',
    category: 'messages',
  },

  // Conversas
  'conversation.created': {
    name: 'Conversa Criada',
    description: 'Quando uma nova conversa é iniciada',
    category: 'conversations',
  },
  'conversation.updated': {
    name: 'Conversa Atualizada',
    description: 'Quando uma conversa é atualizada (status, tags, etc.)',
    category: 'conversations',
  },
  'conversation.resolved': {
    name: 'Conversa Resolvida',
    description: 'Quando uma conversa é marcada como resolvida/fechada',
    category: 'conversations',
  },
  'conversation.reopened': {
    name: 'Conversa Reaberta',
    description: 'Quando uma conversa fechada é reaberta',
    category: 'conversations',
  },

  // Contatos/Leads
  'contact.created': {
    name: 'Contato Criado',
    description: 'Quando um novo contato/lead é criado',
    category: 'contacts',
  },
  'contact.updated': {
    name: 'Contato Atualizado',
    description: 'Quando dados de um contato são atualizados',
    category: 'contacts',
  },

  // Canais
  'channel.connected': {
    name: 'Canal Conectado',
    description: 'Quando um canal é conectado com sucesso',
    category: 'channels',
  },
  'channel.disconnected': {
    name: 'Canal Desconectado',
    description: 'Quando um canal é desconectado',
    category: 'channels',
  },
  'channel.qr_updated': {
    name: 'QR Code Atualizado',
    description: 'Quando o QR Code do WhatsApp é atualizado',
    category: 'channels',
  },

  // WhatsApp específicos (Evolution API compatível)
  'whatsapp.connection.update': {
    name: 'Status da Conexão',
    description: 'Atualizações de conexão do WhatsApp',
    category: 'whatsapp',
  },
  'whatsapp.presence.update': {
    name: 'Presença Atualizada',
    description: 'Quando o status de presença muda (online, digitando, etc.)',
    category: 'whatsapp',
  },
  'whatsapp.groups.update': {
    name: 'Grupo Atualizado',
    description: 'Atualizações em grupos do WhatsApp',
    category: 'whatsapp',
  },
};

export type WebhookEventType = keyof typeof WEBHOOK_EVENTS;

export interface UserWebhook {
  id: string;
  user_id: string;
  name: string;
  url: string;
  events: WebhookEventType[];
  headers?: Record<string, string>;
  is_active: boolean;
  secret?: string;
  channel_ids?: string[]; // Filtrar por canais específicos ou vazio para todos
  created_at: string;
  updated_at: string;
  last_triggered_at?: string;
  trigger_count: number;
  last_error?: string;
}

export interface CreateWebhookInput {
  name: string;
  url: string;
  events: WebhookEventType[];
  headers?: Record<string, string>;
  secret?: string;
  channel_ids?: string[];
}

export interface WebhookLog {
  id: string;
  webhook_id: string;
  event: string;
  payload: any;
  response_status?: number;
  response_body?: string;
  error?: string;
  created_at: string;
}

class UserWebhooksService {
  private tableCreated = false;

  async ensureTable(): Promise<void> {
    if (this.tableCreated) return;

    try {
      await query(`
        CREATE TABLE IF NOT EXISTS user_webhooks (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL,
          name VARCHAR(255) NOT NULL,
          url TEXT NOT NULL,
          events TEXT[] NOT NULL DEFAULT '{}',
          headers JSONB DEFAULT '{}',
          is_active BOOLEAN DEFAULT true,
          secret VARCHAR(255),
          channel_ids UUID[] DEFAULT '{}',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          last_triggered_at TIMESTAMP WITH TIME ZONE,
          trigger_count INTEGER DEFAULT 0,
          last_error TEXT
        )
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS webhook_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          webhook_id UUID NOT NULL REFERENCES user_webhooks(id) ON DELETE CASCADE,
          event VARCHAR(100) NOT NULL,
          payload JSONB,
          response_status INTEGER,
          response_body TEXT,
          error TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      // Índices para performance
      await query(`CREATE INDEX IF NOT EXISTS idx_user_webhooks_user_id ON user_webhooks(user_id)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_user_webhooks_active ON user_webhooks(is_active)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_webhook_logs_webhook_id ON webhook_logs(webhook_id)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at)`);

      this.tableCreated = true;
    } catch (error: any) {
      console.error('[UserWebhooks] Error creating tables:', error.message);
    }
  }

  async findByUserId(userId: string): Promise<UserWebhook[]> {
    await this.ensureTable();
    const result = await query(
      `SELECT * FROM user_webhooks WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    return result.rows;
  }

  async findById(id: string, userId: string): Promise<UserWebhook | null> {
    await this.ensureTable();
    const result = await query(
      `SELECT * FROM user_webhooks WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    return result.rows[0] || null;
  }

  async findActiveByEvent(userId: string, event: WebhookEventType, channelId?: string): Promise<UserWebhook[]> {
    await this.ensureTable();

    console.log(`[UserWebhooks] Finding active webhooks for user=${userId}, event=${event}, channelId=${channelId || 'any'}`);

    let sql = `
      SELECT * FROM user_webhooks
      WHERE user_id = $1
        AND is_active = true
        AND $2 = ANY(events)
    `;
    const params: any[] = [userId, event];

    // Se tem channelId, filtrar também por canal
    if (channelId) {
      sql += ` AND (channel_ids = '{}' OR channel_ids IS NULL OR $3 = ANY(channel_ids))`;
      params.push(channelId);
    }

    console.log(`[UserWebhooks] Query:`, sql.replace(/\s+/g, ' ').trim(), 'Params:', params);

    const result = await query(sql, params);
    console.log(`[UserWebhooks] Found ${result.rows.length} webhook(s)`);
    return result.rows;
  }

  async create(userId: string, input: CreateWebhookInput): Promise<UserWebhook> {
    await this.ensureTable();

    // Gerar secret único se não fornecido
    const secret = input.secret || this.generateSecret();

    const result = await query(
      `INSERT INTO user_webhooks (user_id, name, url, events, headers, secret, channel_ids)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        userId,
        input.name,
        input.url,
        input.events,
        JSON.stringify(input.headers || {}),
        secret,
        input.channel_ids || [],
      ]
    );

    return result.rows[0];
  }

  async update(id: string, userId: string, input: Partial<CreateWebhookInput>): Promise<UserWebhook | null> {
    await this.ensureTable();

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (input.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(input.name);
    }
    if (input.url !== undefined) {
      updates.push(`url = $${paramIndex++}`);
      values.push(input.url);
    }
    if (input.events !== undefined) {
      updates.push(`events = $${paramIndex++}`);
      values.push(input.events);
    }
    if (input.headers !== undefined) {
      updates.push(`headers = $${paramIndex++}`);
      values.push(JSON.stringify(input.headers));
    }
    if (input.secret !== undefined) {
      updates.push(`secret = $${paramIndex++}`);
      values.push(input.secret);
    }
    if (input.channel_ids !== undefined) {
      updates.push(`channel_ids = $${paramIndex++}`);
      values.push(input.channel_ids);
    }

    updates.push(`updated_at = NOW()`);

    values.push(id, userId);

    const result = await query(
      `UPDATE user_webhooks SET ${updates.join(', ')}
       WHERE id = $${paramIndex++} AND user_id = $${paramIndex}
       RETURNING *`,
      values
    );

    return result.rows[0] || null;
  }

  async toggle(id: string, userId: string, isActive: boolean): Promise<UserWebhook | null> {
    await this.ensureTable();

    const result = await query(
      `UPDATE user_webhooks SET is_active = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [isActive, id, userId]
    );

    return result.rows[0] || null;
  }

  async delete(id: string, userId: string): Promise<boolean> {
    await this.ensureTable();

    const result = await query(
      `DELETE FROM user_webhooks WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    return result.rowCount > 0;
  }

  async logTrigger(webhookId: string, event: string, payload: any, response?: { status?: number; body?: string; error?: string }): Promise<void> {
    await this.ensureTable();

    // Atualizar contagem e timestamp do webhook
    await query(
      `UPDATE user_webhooks
       SET trigger_count = trigger_count + 1,
           last_triggered_at = NOW(),
           last_error = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [webhookId, response?.error || null]
    );

    // Salvar log
    await query(
      `INSERT INTO webhook_logs (webhook_id, event, payload, response_status, response_body, error)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        webhookId,
        event,
        JSON.stringify(payload),
        response?.status,
        response?.body?.substring(0, 5000), // Limitar tamanho
        response?.error,
      ]
    );

    // Limpar logs antigos (manter últimos 100 por webhook)
    await query(
      `DELETE FROM webhook_logs
       WHERE webhook_id = $1
         AND id NOT IN (
           SELECT id FROM webhook_logs
           WHERE webhook_id = $1
           ORDER BY created_at DESC
           LIMIT 100
         )`,
      [webhookId]
    );
  }

  async getLogs(webhookId: string, userId: string, limit: number = 50): Promise<WebhookLog[]> {
    await this.ensureTable();

    const result = await query(
      `SELECT wl.* FROM webhook_logs wl
       INNER JOIN user_webhooks uw ON wl.webhook_id = uw.id
       WHERE wl.webhook_id = $1 AND uw.user_id = $2
       ORDER BY wl.created_at DESC
       LIMIT $3`,
      [webhookId, userId, limit]
    );

    return result.rows;
  }

  async testWebhook(id: string, userId: string): Promise<{ success: boolean; status?: number; error?: string }> {
    const webhook = await this.findById(id, userId);
    if (!webhook) {
      return { success: false, error: 'Webhook não encontrado' };
    }

    const testPayload = {
      event: 'webhook.test',
      timestamp: new Date().toISOString(),
      data: {
        message: 'Este é um teste do webhook',
        webhook_id: webhook.id,
        webhook_name: webhook.name,
      },
    };

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'LeadsFlow-Webhook/1.0',
        ...webhook.headers,
      };

      if (webhook.secret) {
        headers['X-Webhook-Secret'] = webhook.secret;
      }

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(testPayload),
      });

      const responseText = await response.text().catch(() => '');

      await this.logTrigger(webhook.id, 'webhook.test', testPayload, {
        status: response.status,
        body: responseText,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      });

      return {
        success: response.ok,
        status: response.status,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
    } catch (error: any) {
      await this.logTrigger(webhook.id, 'webhook.test', testPayload, {
        error: error.message,
      });

      return {
        success: false,
        error: error.message,
      };
    }
  }

  private generateSecret(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let secret = 'whsec_';
    for (let i = 0; i < 32; i++) {
      secret += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return secret;
  }
}

export const userWebhooksService = new UserWebhooksService();
export default userWebhooksService;
