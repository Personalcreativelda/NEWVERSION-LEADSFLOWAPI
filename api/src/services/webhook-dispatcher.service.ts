import { userWebhooksService, WebhookEventType, UserWebhook } from './user-webhooks.service';

interface WebhookPayload {
  event: WebhookEventType;
  timestamp: string;
  data: any;
  channel?: {
    id: string;
    type: string;
    name?: string;
  };
  conversation?: {
    id: string;
    contact_name?: string;
    contact_phone?: string;
  };
  message?: {
    id: string;
    content: string;
    direction: 'in' | 'out';
    media_type?: string;
    media_url?: string;
  };
  contact?: {
    id: string;
    name?: string;
    phone?: string;
    email?: string;
  };
}

class WebhookDispatcher {
  private queue: { userId: string; event: WebhookEventType; payload: any; channelId?: string }[] = [];
  private processing = false;

  /**
   * Disparar evento para todos os webhooks ativos do usuário
   * Esta função é assíncrona e não bloqueia
   */
  async dispatch(userId: string, event: WebhookEventType, data: any, channelId?: string): Promise<void> {
    console.log(`[WebhookDispatcher] Queueing event: ${event} for user: ${userId}, channelId: ${channelId || 'all'}`);

    // Adicionar na fila para processamento assíncrono
    this.queue.push({ userId, event, payload: data, channelId });

    // Processar fila se não estiver processando
    if (!this.processing) {
      this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) continue;

      try {
        await this.dispatchToWebhooks(item.userId, item.event, item.payload, item.channelId);
      } catch (error: any) {
        console.error('[WebhookDispatcher] Error processing queue item:', error.message);
      }
    }

    this.processing = false;
  }

  private async dispatchToWebhooks(userId: string, event: WebhookEventType, data: any, channelId?: string): Promise<void> {
    try {
      console.log(`[WebhookDispatcher] Looking for webhooks: userId=${userId}, event=${event}, channelId=${channelId || 'any'}`);

      // Buscar webhooks ativos para este evento
      const webhooks = await userWebhooksService.findActiveByEvent(userId, event, channelId);

      console.log(`[WebhookDispatcher] Found ${webhooks.length} active webhook(s) for event ${event}`);

      if (webhooks.length === 0) {
        console.log(`[WebhookDispatcher] No webhooks found for event ${event} - skipping`);
        return;
      }

      console.log(`[WebhookDispatcher] Dispatching ${event} to ${webhooks.length} webhook(s):`, webhooks.map(w => ({ id: w.id, name: w.name, url: w.url })));

      // Construir payload padrão
      const payload: WebhookPayload = {
        event,
        timestamp: new Date().toISOString(),
        data,
        ...(data.channel && { channel: data.channel }),
        ...(data.conversation && { conversation: data.conversation }),
        ...(data.message && { message: data.message }),
        ...(data.contact && { contact: data.contact }),
      };

      // Disparar para cada webhook em paralelo
      const promises = webhooks.map(webhook => this.sendToWebhook(webhook, payload));
      await Promise.allSettled(promises);
    } catch (error: any) {
      console.error('[WebhookDispatcher] Error dispatching:', error.message);
    }
  }

  private async sendToWebhook(webhook: UserWebhook, payload: WebhookPayload): Promise<void> {
    console.log(`[WebhookDispatcher] Sending to webhook ${webhook.id} (${webhook.name}) at ${webhook.url}`);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'LeadsFlow-Webhook/1.0',
        'X-Webhook-Event': payload.event,
        'X-Webhook-Timestamp': payload.timestamp,
        ...webhook.headers,
      };

      if (webhook.secret) {
        // Adicionar assinatura HMAC para verificação
        const signature = await this.generateSignature(JSON.stringify(payload), webhook.secret);
        headers['X-Webhook-Signature'] = signature;
        headers['X-Webhook-Secret'] = webhook.secret;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

      try {
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        const responseText = await response.text().catch(() => '');

        // Logar resultado
        await userWebhooksService.logTrigger(webhook.id, payload.event, payload, {
          status: response.status,
          body: responseText.substring(0, 1000),
          error: response.ok ? undefined : `HTTP ${response.status}`,
        });

        if (!response.ok) {
          console.warn(`[WebhookDispatcher] Webhook ${webhook.id} returned ${response.status}: ${responseText.substring(0, 200)}`);
        } else {
          console.log(`[WebhookDispatcher] Webhook ${webhook.id} sent successfully (HTTP ${response.status})`);
        }
      } catch (fetchError: any) {
        clearTimeout(timeout);
        throw fetchError;
      }
    } catch (error: any) {
      console.error(`[WebhookDispatcher] Error sending to webhook ${webhook.id}:`, error.message);

      // Logar erro
      await userWebhooksService.logTrigger(webhook.id, payload.event, payload, {
        error: error.message,
      });
    }
  }

  private async generateSignature(payload: string, secret: string): Promise<string> {
    // Criar HMAC SHA256 simples
    const encoder = new TextEncoder();
    const data = encoder.encode(payload);
    const keyData = encoder.encode(secret);

    // Usar crypto se disponível, senão usar fallback simples
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      try {
        const key = await crypto.subtle.importKey(
          'raw',
          keyData,
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        );
        const signature = await crypto.subtle.sign('HMAC', key, data);
        const hashArray = Array.from(new Uint8Array(signature));
        return 'sha256=' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      } catch {
        // Fallback
      }
    }

    // Fallback simples (base64 do payload + secret)
    const combined = Buffer.from(payload + secret).toString('base64');
    return 'simple=' + combined.substring(0, 64);
  }

  // Métodos de conveniência para eventos específicos

  async dispatchMessageReceived(userId: string, data: {
    channelId: string;
    channelType: string;
    channelName?: string;
    conversationId: string;
    messageId: string;
    content: string;
    contactName?: string;
    contactPhone?: string;
    mediaType?: string;
    mediaUrl?: string;
    rawPayload?: any;
  }): Promise<void> {
    await this.dispatch(userId, 'message.received', {
      channel: {
        id: data.channelId,
        type: data.channelType,
        name: data.channelName,
      },
      conversation: {
        id: data.conversationId,
        contact_name: data.contactName,
        contact_phone: data.contactPhone,
      },
      message: {
        id: data.messageId,
        content: data.content,
        direction: 'in' as const,
        media_type: data.mediaType,
        media_url: data.mediaUrl,
      },
      raw: data.rawPayload,
    }, data.channelId);
  }

  async dispatchMessageSent(userId: string, data: {
    channelId: string;
    channelType: string;
    conversationId: string;
    messageId: string;
    content: string;
    contactPhone?: string;
  }): Promise<void> {
    await this.dispatch(userId, 'message.sent', {
      channel: {
        id: data.channelId,
        type: data.channelType,
      },
      conversation: {
        id: data.conversationId,
        contact_phone: data.contactPhone,
      },
      message: {
        id: data.messageId,
        content: data.content,
        direction: 'out' as const,
      },
    }, data.channelId);
  }

  async dispatchConversationCreated(userId: string, data: {
    channelId: string;
    conversationId: string;
    contactName?: string;
    contactPhone?: string;
  }): Promise<void> {
    await this.dispatch(userId, 'conversation.created', {
      channel: { id: data.channelId },
      conversation: {
        id: data.conversationId,
        contact_name: data.contactName,
        contact_phone: data.contactPhone,
      },
    }, data.channelId);
  }

  async dispatchContactCreated(userId: string, data: {
    contactId: string;
    name?: string;
    phone?: string;
    email?: string;
    source?: string;
  }): Promise<void> {
    await this.dispatch(userId, 'contact.created', {
      contact: {
        id: data.contactId,
        name: data.name,
        phone: data.phone,
        email: data.email,
      },
      source: data.source,
    });
  }

  async dispatchChannelConnected(userId: string, data: {
    channelId: string;
    channelType: string;
    channelName?: string;
  }): Promise<void> {
    await this.dispatch(userId, 'channel.connected', {
      channel: {
        id: data.channelId,
        type: data.channelType,
        name: data.channelName,
      },
    }, data.channelId);
  }

  async dispatchWhatsAppEvent(userId: string, event: 'whatsapp.connection.update' | 'whatsapp.presence.update' | 'whatsapp.groups.update', data: {
    channelId: string;
    instanceName?: string;
    status?: string;
    rawPayload?: any;
  }): Promise<void> {
    await this.dispatch(userId, event, {
      channel: {
        id: data.channelId,
        type: 'whatsapp',
      },
      instance_name: data.instanceName,
      status: data.status,
      raw: data.rawPayload,
    }, data.channelId);
  }
}

export const webhookDispatcher = new WebhookDispatcher();
export default webhookDispatcher;
