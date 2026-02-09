export class WhatsAppService {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly isConfigured: boolean;

  constructor() {
    const rawUrl = process.env.EVOLUTION_API_URL || '';
    const rawKey = process.env.EVOLUTION_API_KEY || '';

    // Validate and clean URL
    try {
      if (rawUrl && rawUrl !== '') {
        // Remove trailing slashes and validate URL format
        const cleanUrl = rawUrl.replace(/\/$/, '');
        // Test if it's a valid URL
        new URL(cleanUrl);
        this.baseUrl = cleanUrl;
      } else {
        this.baseUrl = '';
      }
    } catch (error) {
      console.error('[WhatsAppService] Invalid EVOLUTION_API_URL:', rawUrl);
      this.baseUrl = '';
    }

    this.apiKey = rawKey;
    this.isConfigured = Boolean(this.baseUrl && this.apiKey);

    if (!this.isConfigured) {
      console.warn('[WhatsAppService] Evolution API não está configurado. Configure EVOLUTION_API_URL e EVOLUTION_API_KEY no .env');
    }
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (!this.isConfigured) {
      console.error('[WhatsAppService] Not configured');
      console.error('[WhatsAppService] EVOLUTION_API_URL:', process.env.EVOLUTION_API_URL ? 'SET' : 'NOT SET');
      console.error('[WhatsAppService] EVOLUTION_API_KEY:', process.env.EVOLUTION_API_KEY ? 'SET' : 'NOT SET');
      throw new Error('Evolution API não está configurado. Por favor, configure EVOLUTION_API_URL e EVOLUTION_API_KEY nas variáveis de ambiente.');
    }

    if (!this.baseUrl) {
      throw new Error('Evolution API URL inválida.');
    }

    try {
      const url = `${this.baseUrl}${endpoint}`;

      // Validate final URL
      new URL(url);

      console.log('[WhatsAppService] Making request to:', url);
      console.log('[WhatsAppService] Method:', options.method || 'GET');
      if (options.body) {
        console.log('[WhatsAppService] Request body:', options.body);
      }

      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          apikey: this.apiKey,
          ...(options.headers || {}),
        },
      });

      console.log('[WhatsAppService] Response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        console.error('[WhatsAppService] Error response:', errorBody);
        const errorMessage = errorBody.message || errorBody.error || `Evolution API Error: ${response.status} ${response.statusText}`;
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log('[WhatsAppService] Success response:', JSON.stringify(data).substring(0, 200));
      return data;
    } catch (error) {
      console.error('[WhatsAppService] Request failed:', error);

      if (error instanceof TypeError && error.message.includes('Invalid URL')) {
        console.error('[WhatsAppService] URL inválida:', `${this.baseUrl}${endpoint}`);
        throw new Error('Evolution API: URL inválida. Verifique a configuração do EVOLUTION_API_URL.');
      }

      if (error instanceof TypeError && error.message.includes('fetch failed')) {
        console.error('[WhatsAppService] Network error - Evolution API may be unreachable');
        throw new Error('Não foi possível conectar à Evolution API. Verifique se o servidor está online e acessível.');
      }

      throw error;
    }
  }

  async sendMessage(data: { instanceId: string; number: string; text: string }) {
    return this.request(`/message/sendText/${data.instanceId}`, {
      method: 'POST',
      body: JSON.stringify({
        number: data.number,
        text: data.text,
      }),
    });
  }

  async sendMedia(data: { 
    instanceId: string; 
    number: string; 
    mediaUrl: string; 
    mediaType: string;
    caption?: string;
  }) {
    const { instanceId, number, mediaUrl, mediaType, caption } = data;
    
    // Determine the endpoint based on media type
    let endpoint = '/message/sendMedia';
    const body: any = {
      number,
      mediatype: mediaType, // image, video, audio, document
      media: mediaUrl,
    };
    
    // Add caption if provided
    if (caption) {
      body.caption = caption;
    }
    
    // For documents, add filename
    if (mediaType === 'document') {
      const urlParts = mediaUrl.split('/');
      body.fileName = urlParts[urlParts.length - 1] || 'document';
    }
    
    console.log('[WhatsAppService] Sending media:', { instanceId, number, mediaType, mediaUrl: mediaUrl.substring(0, 50) + '...' });
    
    return this.request(`${endpoint}/${instanceId}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async getStatus(instanceId: string) {
    return this.request(`/instance/connectionState/${instanceId}`);
  }

  async getQrCode(instanceId: string) {
    return this.request(`/instance/connect/${instanceId}`);
  }

  async createInstance(data: { instanceName: string; webhookUrl?: string }) {
    console.log('[WhatsAppService] Creating instance with name:', data.instanceName);

    // Determine the webhook URL
    const webhookUrl = data.webhookUrl || process.env.WEBHOOK_URL || process.env.API_URL || process.env.SERVICE_URL_API;
    const fullWebhookUrl = webhookUrl ? `${webhookUrl.replace(/\/$/, '')}/api/webhooks/evolution/messages` : null;
    console.log('[WhatsAppService] Webhook URL:', fullWebhookUrl);

    try {
      const requestBody: any = {
        instanceName: data.instanceName,
        token: this.apiKey,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
      };

      // Add webhook configuration if we have a URL
      if (fullWebhookUrl) {
        requestBody.webhook = {
          url: fullWebhookUrl,
          byEvents: false, // Send all events to same URL
          base64: true, // Include media as base64
          headers: {
            'Content-Type': 'application/json',
          },
          events: [
            'MESSAGES_UPSERT',
            'CONNECTION_UPDATE',
            'QRCODE_UPDATED',
          ],
        };
      }

      const result = await this.request('/instance/create', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      console.log('[WhatsAppService] Instance created successfully:', result);
      return result;
    } catch (error: any) {
      console.error('[WhatsAppService] Failed to create instance:', error);

      // Provide more helpful error messages
      if (error.message.includes('already exists')) {
        console.log('[WhatsAppService] Instance already exists, this is OK');
        // Try to configure webhook for existing instance
        if (fullWebhookUrl) {
          await this.configureWebhook(data.instanceName, fullWebhookUrl).catch(e => {
            console.warn('[WhatsAppService] Failed to configure webhook for existing instance:', e.message);
          });
        }
        return {
          instance: {
            instanceName: data.instanceName,
          },
          message: 'Instance already exists',
        };
      }

      throw error;
    }
  }

  /**
   * Configure webhook for an existing instance
   */
  async configureWebhook(instanceName: string, webhookUrl: string) {
    console.log('[WhatsAppService] Configuring webhook for instance:', instanceName, 'URL:', webhookUrl);

    try {
      const result = await this.request(`/webhook/set/${instanceName}`, {
        method: 'POST',
        body: JSON.stringify({
          url: webhookUrl,
          webhook_by_events: false,
          webhook_base64: true,
          events: [
            'MESSAGES_UPSERT',
            'CONNECTION_UPDATE',
            'QRCODE_UPDATED',
          ],
        }),
      });

      console.log('[WhatsAppService] Webhook configured successfully:', result);
      return result;
    } catch (error: any) {
      console.error('[WhatsAppService] Failed to configure webhook:', error);
      throw error;
    }
  }

  async listInstances() {
    return this.request('/instance/fetchInstances');
  }

  async disconnectInstance(instanceId: string) {
    return this.request(`/instance/logout/${instanceId}`, {
      method: 'DELETE',
    });
  }

  async deleteInstance(instanceId: string) {
    console.log('[WhatsAppService] Deleting instance permanently:', instanceId);

    try {
      // First try to logout
      await this.disconnectInstance(instanceId).catch(() => {
        console.log('[WhatsAppService] Logout failed or instance already disconnected');
      });

      // Then delete the instance from Evolution API server
      const result = await this.request(`/instance/delete/${instanceId}`, {
        method: 'DELETE',
      });

      console.log('[WhatsAppService] Instance deleted successfully:', instanceId);
      return result;
    } catch (error: any) {
      console.error('[WhatsAppService] Error deleting instance:', error);

      // If instance doesn't exist, that's OK
      if (error.message?.includes('not found') || error.message?.includes('404')) {
        console.log('[WhatsAppService] Instance already deleted or does not exist');
        return { success: true, message: 'Instance does not exist' };
      }

      throw error;
    }
  }

  /**
   * Fetch all chats from Evolution API
   * Tries multiple endpoint formats for compatibility with different Evolution API versions
   */
  async fetchChats(instanceId: string) {
    console.log('[WhatsAppService] Fetching chats for instance:', instanceId);

    // List of endpoints to try (different Evolution API versions)
    const endpointsToTry = [
      { url: `/chat/findChats/${instanceId}`, method: 'GET' },
      { url: `/chat/findChats/${instanceId}`, method: 'POST', body: {} },
      { url: `/message/findChats/${instanceId}`, method: 'GET' },
      { url: `/instance/fetchInstances/${instanceId}`, method: 'GET' },
    ];

    for (const endpoint of endpointsToTry) {
      try {
        console.log(`[WhatsAppService] Trying ${endpoint.method} ${endpoint.url}`);
        const result = await this.request(endpoint.url, {
          method: endpoint.method,
          ...(endpoint.body ? { body: JSON.stringify(endpoint.body) } : {}),
        }) as any;

        console.log('[WhatsAppService] Found chats:', Array.isArray(result) ? result.length : JSON.stringify(result).substring(0, 300));

        // Handle different response formats
        if (Array.isArray(result)) {
          return result;
        }
        if (result?.chats && Array.isArray(result.chats)) {
          return result.chats;
        }
        if (result?.data && Array.isArray(result.data)) {
          return result.data;
        }

        // If we got a valid response but not in expected format, log and continue
        console.log('[WhatsAppService] Response format not recognized, trying next endpoint');
      } catch (error: any) {
        console.log(`[WhatsAppService] ${endpoint.method} ${endpoint.url} failed:`, error.message);
        // Continue to next endpoint
      }
    }

    // If all endpoints failed, return empty array instead of throwing
    console.warn('[WhatsAppService] All chat fetch endpoints failed, returning empty array');
    return [];
  }

  /**
   * Fetch messages for a specific chat from Evolution API
   * Tries multiple endpoint formats for compatibility with different Evolution API versions
   */
  async fetchMessages(instanceId: string, remoteJid: string, count = 100) {
    console.log('[WhatsAppService] Fetching messages for:', remoteJid, 'instance:', instanceId);

    // List of endpoints/formats to try
    const attemptsToTry = [
      // Evolution API v2.1+ format - fetchMessages endpoint
      {
        url: `/chat/fetchMessages/${instanceId}`,
        method: 'POST',
        body: {
          number: remoteJid.replace('@s.whatsapp.net', ''),
          count: count,
        },
      },
      // Evolution API v2.1+ alternative with where clause
      {
        url: `/chat/fetchMessages/${instanceId}`,
        method: 'POST',
        body: {
          where: {
            key: {
              remoteJid: remoteJid,
            },
          },
          limit: count,
        },
      },
      // Evolution API v2 format - findMessages with where
      {
        url: `/chat/findMessages/${instanceId}`,
        method: 'POST',
        body: {
          where: {
            key: {
              remoteJid: remoteJid,
            },
          },
          page: 1,
          offset: count,
        },
      },
      // Evolution API v2 simpler format
      {
        url: `/chat/findMessages/${instanceId}`,
        method: 'POST',
        body: {
          remoteJid: remoteJid,
          limit: count,
        },
      },
      // Evolution API v1 format
      {
        url: `/message/findMessages/${instanceId}`,
        method: 'POST',
        body: {
          remoteJid: remoteJid,
          limit: count,
        },
      },
      // Alternative: GET with query params
      {
        url: `/chat/fetchMessages/${instanceId}?remoteJid=${encodeURIComponent(remoteJid)}&count=${count}`,
        method: 'GET',
        body: null,
      },
    ];

    for (const attempt of attemptsToTry) {
      try {
        console.log(`[WhatsAppService] Trying ${attempt.method} ${attempt.url}`);
        const requestOptions: any = { method: attempt.method };
        if (attempt.body) {
          requestOptions.body = JSON.stringify(attempt.body);
        }
        const result = await this.request(attempt.url, requestOptions) as any;

        console.log('[WhatsAppService] Messages result:', JSON.stringify(result).substring(0, 500));

        // Handle different response formats
        if (Array.isArray(result) && result.length > 0) {
          console.log('[WhatsAppService] Found', result.length, 'messages (array)');
          return { messages: result };
        }
        // Evolution API v2 paginated response: { messages: { total, pages, records: [...] } }
        if (result?.messages?.records && Array.isArray(result.messages.records) && result.messages.records.length > 0) {
          console.log('[WhatsAppService] Found', result.messages.records.length, 'messages (in messages.records - paginated)');
          return { messages: result.messages.records };
        }
        if (result?.messages && Array.isArray(result.messages) && result.messages.length > 0) {
          console.log('[WhatsAppService] Found', result.messages.length, 'messages (in messages key)');
          return result;
        }
        if (result?.records && Array.isArray(result.records) && result.records.length > 0) {
          console.log('[WhatsAppService] Found', result.records.length, 'messages (in records key)');
          return { messages: result.records };
        }
        if (result?.data && Array.isArray(result.data) && result.data.length > 0) {
          console.log('[WhatsAppService] Found', result.data.length, 'messages (in data key)');
          return { messages: result.data };
        }

        // If response is empty array or no messages found, continue to next endpoint
        console.log('[WhatsAppService] No messages in response, trying next endpoint');
      } catch (error: any) {
        console.log(`[WhatsAppService] ${attempt.method} ${attempt.url} failed:`, error.message);
        // Continue to next endpoint
      }
    }

    // If all endpoints failed, return empty messages array
    console.warn('[WhatsAppService] All message fetch endpoints failed, returning empty array');
    return { messages: [] };
  }

  /**
   * Fetch contacts from Evolution API
   */
  async fetchContacts(instanceId: string) {
    console.log('[WhatsAppService] Fetching contacts for instance:', instanceId);
    try {
      // Try GET method first
      try {
        const result = await this.request(`/chat/findContacts/${instanceId}`, {
          method: 'GET',
        });
        console.log('[WhatsAppService] Found contacts (GET):', Array.isArray(result) ? result.length : 'unknown');
        return result;
      } catch (getError: any) {
        console.log('[WhatsAppService] GET contacts failed, trying POST');
      }

      // Fallback to POST
      const result = await this.request(`/chat/findContacts/${instanceId}`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      console.log('[WhatsAppService] Found contacts (POST):', Array.isArray(result) ? result.length : 'unknown');
      return result;
    } catch (error: any) {
      console.error('[WhatsAppService] Error fetching contacts:', error);
      throw error;
    }
  }

  /**
   * Fetch profile picture from Evolution API
   */
  async fetchProfilePicture(instanceId: string, remoteJid: string): Promise<string | null> {
    try {
      // Clean the JID for the API call
      const number = remoteJid.replace('@s.whatsapp.net', '').replace('@lid', '').replace('@g.us', '');
      
      // Try different Evolution API endpoints for profile picture
      const endpoints = [
        { url: `/chat/fetchProfilePictureUrl/${instanceId}`, body: { number: remoteJid } },
        { url: `/chat/fetchProfilePictureUrl/${instanceId}`, body: { number } },
        { url: `/chat/profilePicture/${instanceId}`, body: { number: remoteJid } },
      ];
      
      for (const endpoint of endpoints) {
        try {
          const result = await this.request(endpoint.url, {
            method: 'POST',
            body: JSON.stringify(endpoint.body),
          }) as any;
          
          if (result?.profilePictureUrl || result?.profilePicUrl || result?.url || result?.picture) {
            const url = result.profilePictureUrl || result.profilePicUrl || result.url || result.picture;
            console.log('[WhatsAppService] Found profile picture for', remoteJid);
            return url;
          }
        } catch (e) {
          // Try next endpoint
        }
      }
      
      return null;
    } catch (error) {
      console.warn('[WhatsAppService] Error fetching profile picture:', error);
      return null;
    }
  }

  /**
   * Check if Evolution API is configured
   */
  isReady(): boolean {
    return this.isConfigured;
  }

  /**
   * Check if phone numbers have WhatsApp accounts
   * Uses Evolution API onWhatsApp endpoint
   * @param instanceId - Instance name to use for checking
   * @param numbers - Array of phone numbers to check (E.164 format or digits only)
   * @returns Array of results with exists flag for each number
   */
  async checkWhatsAppNumbers(instanceId: string, numbers: string[]): Promise<{
    results: Array<{
      number: string;
      exists: boolean;
      jid?: string;
      name?: string;
    }>;
    valid: string[];
    invalid: string[];
  }> {
    console.log('[WhatsAppService] Checking', numbers.length, 'numbers on WhatsApp');

    // Clean numbers - remove non-digits and ensure proper format
    const cleanedNumbers = numbers.map(n => n.replace(/\D/g, ''));

    // List of endpoints to try (different Evolution API versions)
    const endpointsToTry = [
      // Evolution API v2 format
      {
        url: `/chat/whatsappNumbers/${instanceId}`,
        method: 'POST',
        body: { numbers: cleanedNumbers },
      },
      // Alternative format with number array
      {
        url: `/chat/onWhatsapp/${instanceId}`,
        method: 'POST',
        body: { numbers: cleanedNumbers },
      },
      // Evolution API v1 format
      {
        url: `/misc/onWhatsapp/${instanceId}`,
        method: 'POST',
        body: { numbers: cleanedNumbers },
      },
    ];

    for (const endpoint of endpointsToTry) {
      try {
        console.log(`[WhatsAppService] Trying ${endpoint.method} ${endpoint.url}`);
        const result = await this.request(endpoint.url, {
          method: endpoint.method,
          body: JSON.stringify(endpoint.body),
        }) as any;

        console.log('[WhatsAppService] WhatsApp check result:', JSON.stringify(result).substring(0, 500));

        // Parse the result based on different response formats
        let parsedResults: Array<{ number: string; exists: boolean; jid?: string; name?: string }> = [];

        // Format 1: Direct array
        if (Array.isArray(result)) {
          parsedResults = result.map((item: any) => ({
            number: item.number || item.phone || item.jid?.replace('@s.whatsapp.net', ''),
            exists: item.exists === true || item.onWhatsApp === true || item.isWhatsApp === true,
            jid: item.jid,
            name: item.name || item.pushName,
          }));
        }
        // Format 2: Nested in response key
        else if (result?.response && Array.isArray(result.response)) {
          parsedResults = result.response.map((item: any) => ({
            number: item.number || item.phone || item.jid?.replace('@s.whatsapp.net', ''),
            exists: item.exists === true || item.onWhatsApp === true || item.isWhatsApp === true,
            jid: item.jid,
            name: item.name || item.pushName,
          }));
        }
        // Format 3: Nested in data key
        else if (result?.data && Array.isArray(result.data)) {
          parsedResults = result.data.map((item: any) => ({
            number: item.number || item.phone || item.jid?.replace('@s.whatsapp.net', ''),
            exists: item.exists === true || item.onWhatsApp === true || item.isWhatsApp === true,
            jid: item.jid,
            name: item.name || item.pushName,
          }));
        }
        // Format 4: Object with message array (error format from Evolution)
        else if (result?.message && Array.isArray(result.message)) {
          parsedResults = result.message.map((item: any) => ({
            number: item.number || item.phone || item.jid?.replace('@s.whatsapp.net', ''),
            exists: item.exists === true,
            jid: item.jid,
            name: item.name,
          }));
        }

        if (parsedResults.length > 0) {
          const valid = parsedResults.filter(r => r.exists).map(r => r.number);
          const invalid = parsedResults.filter(r => !r.exists).map(r => r.number);

          console.log('[WhatsAppService] Valid WhatsApp numbers:', valid.length);
          console.log('[WhatsAppService] Invalid numbers:', invalid.length);

          return {
            results: parsedResults,
            valid,
            invalid,
          };
        }

        console.log('[WhatsAppService] Response format not recognized, trying next endpoint');
      } catch (error: any) {
        console.log(`[WhatsAppService] ${endpoint.method} ${endpoint.url} failed:`, error.message);
        // Continue to next endpoint
      }
    }

    // If all endpoints fail, return all numbers as unchecked (assume valid to not block workflow)
    console.warn('[WhatsAppService] All WhatsApp check endpoints failed, returning numbers as unchecked');
    return {
      results: cleanedNumbers.map(n => ({ number: n, exists: true })), // Assume valid if can't check
      valid: cleanedNumbers,
      invalid: [],
    };
  }

  /**
   * Send WhatsApp Audio (voice message)
   * Uses the sendWhatsAppAudio endpoint for PTT audio messages
   */
  async sendAudio(data: { 
    instanceId: string; 
    number: string; 
    audioUrl?: string;
    audioBase64?: string;
  }) {
    const { instanceId, number, audioUrl, audioBase64 } = data;
    
    console.log('[WhatsAppService] Sending audio to:', number, 'URL:', audioUrl);
    
    // Formato para Evolution API - usando sendMedia para compatibilidade
    const body: any = { 
      number,
      mediatype: 'audio',
      caption: '',
    };
    
    // Evolution API aceita URL ou base64
    if (audioBase64) {
      body.media = audioBase64;
    } else if (audioUrl) {
      body.media = audioUrl;
    } else {
      throw new Error('Audio URL or base64 is required');
    }
    
    // Tenta primeiro o endpoint de PTT audio
    try {
      const pttBody: any = { number };
      if (audioBase64) {
        pttBody.audio = audioBase64;
      } else if (audioUrl) {
        pttBody.audio = audioUrl;
      }
      
      return await this.request(`/message/sendWhatsAppAudio/${instanceId}`, {
        method: 'POST',
        body: JSON.stringify(pttBody),
      });
    } catch (pttError) {
      console.log('[WhatsAppService] PTT audio failed, trying sendMedia:', pttError);
      
      // Fallback para sendMedia se PTT falhar
      return this.request(`/message/sendMedia/${instanceId}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    }
  }

  /**
   * Send Sticker
   * Accepts either a sticker URL or base64
   */
  async sendSticker(data: { 
    instanceId: string; 
    number: string; 
    stickerUrl?: string;
    stickerBase64?: string;
  }) {
    const { instanceId, number, stickerUrl, stickerBase64 } = data;
    
    console.log('[WhatsAppService] Sending sticker to:', number);
    
    const body: any = { number };
    
    if (stickerBase64) {
      body.sticker = stickerBase64;
    } else if (stickerUrl) {
      body.sticker = stickerUrl;
    } else {
      throw new Error('Sticker URL or base64 is required');
    }
    
    return this.request(`/message/sendSticker/${instanceId}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }
}
