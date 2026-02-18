/**
 * Wavoip API Service
 * Handles integration with Wavoip for making phone calls
 */

import axios from 'axios';

const WAVOIP_API_URL = process.env.WAVOIP_API_URL || 'https://api.wavoip.com/v1';

export interface WavoipCallOptions {
  from: string; // Número de origem
  to: string; // Número de destino
  voice_url?: string; // URL com áudio da voz
  voice_text?: string; // Texto para ser falado (TTS)
  webhook_url?: string; // URL para receber callbacks
  max_duration?: number; // Duração máxima em segundos
}

export interface WavoipCallResponse {
  call_id: string;
  status: 'initiated' | 'ringing' | 'in-progress' | 'completed' | 'failed';
  from: string;
  to: string;
  started_at?: string;
  duration?: number;
  cost?: number;
  error?: string;
}

export class WavoipService {
  private apiKey: string;
  private baseURL: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || '';
    this.baseURL = WAVOIP_API_URL;
  }

  /**
   * Make a phone call using Wavoip
   */
  async makeCall(options: WavoipCallOptions): Promise<WavoipCallResponse> {
    try {
      if (!this.apiKey) {
        throw new Error('Wavoip API key not configured');
      }

      const { from, to, voice_url, voice_text, webhook_url, max_duration = 300 } = options;

      // Validate required fields
      if (!from || !to) {
        throw new Error('Missing required fields: from and to phone numbers');
      }

      if (!voice_url && !voice_text) {
        throw new Error('Either voice_url or voice_text must be provided');
      }

      console.log(`[Wavoip] 📞 Initiating call from ${from} to ${to}`);

      const response = await axios.post(
        `${this.baseURL}/calls`,
        {
          from,
          to,
          voice_url,
          voice_text,
          webhook_url,
          max_duration,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log(`[Wavoip] ✅ Call initiated: ${response.data.call_id}`);

      return {
        call_id: response.data.call_id || response.data.id,
        status: response.data.status || 'initiated',
        from: response.data.from || from,
        to: response.data.to || to,
        started_at: response.data.started_at || new Date().toISOString(),
      };
    } catch (error: any) {
      console.error('[Wavoip] ❌ Error making call:', error.message);
      
      // Return error response
      return {
        call_id: '',
        status: 'failed',
        from: options.from,
        to: options.to,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Get call status
   */
  async getCallStatus(callId: string): Promise<WavoipCallResponse | null> {
    try {
      if (!this.apiKey) {
        throw new Error('Wavoip API key not configured');
      }

      const response = await axios.get(`${this.baseURL}/calls/${callId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      return {
        call_id: response.data.call_id || response.data.id,
        status: response.data.status,
        from: response.data.from,
        to: response.data.to,
        started_at: response.data.started_at,
        duration: response.data.duration,
        cost: response.data.cost,
      };
    } catch (error: any) {
      console.error(`[Wavoip] ❌ Error fetching call ${callId}:`, error.message);
      return null;
    }
  }

  /**
   * Hangup/cancel a call
   */
  async hangupCall(callId: string): Promise<boolean> {
    try {
      if (!this.apiKey) {
        throw new Error('Wavoip API key not configured');
      }

      await axios.post(
        `${this.baseURL}/calls/${callId}/hangup`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
          },
        }
      );

      console.log(`[Wavoip] ✅ Call ${callId} hung up`);
      return true;
    } catch (error: any) {
      console.error(`[Wavoip] ❌ Error hanging up call ${callId}:`, error.message);
      return false;
    }
  }

  /**
   * Make a test call (simulated for development)
   */
  async makeTestCall(from: string, to: string, message: string): Promise<WavoipCallResponse> {
    console.log(`[Wavoip] 🧪 TEST CALL from ${from} to ${to}`);
    console.log(`[Wavoip] 📝 Message: ${message}`);

    // In development/test mode, return a simulated response
    if (!this.apiKey || process.env.NODE_ENV === 'development') {
      console.log('[Wavoip] ⚠️ Using simulated call (no API key or dev mode)');
      
      return {
        call_id: `test_${Date.now()}`,
        status: 'initiated',
        from,
        to,
        started_at: new Date().toISOString(),
      };
    }

    // Make real call
    return this.makeCall({
      from,
      to,
      voice_text: message,
    });
  }
}

// Export factory function to create instances with custom API keys
export const createWavoipService = (apiKey: string) => new WavoipService(apiKey);

// Export default instance (uses env var)
export const wavoipService = new WavoipService(process.env.WAVOIP_API_KEY);
