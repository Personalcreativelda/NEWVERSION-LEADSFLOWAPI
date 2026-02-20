/**
 * Wavoip API Service
 * Handles integration with Wavoip for making phone calls
 * 
 * Wavoip Documentation: https://docs.wavoip.co
 * 
 * Note: Wavoip requires:
 * - Valid API Key (configured per agent in call_config)
 * - From number (origin phone) in E.164 format: +CCNNNNNNNNN
 * - To number (destination) in E.164 format: +CCNNNNNNNNN
 */

import axios from 'axios';

// Wavoip API endpoint — domain is .co (not .com), see https://docs.wavoip.co
const WAVOIP_API_URL = process.env.WAVOIP_API_URL || 'https://api.wavoip.co/v1';
const WAVOIP_TIMEOUT = 30000; // 30 seconds timeout

export interface WavoipCallOptions {
  from: string; // Origin phone number (E.164 format: +5511999999999)
  to: string; // Destination phone number (E.164 format: +5511999999999)
  voice_url?: string; // URL with audio voice file
  voice_text?: string; // Text for TTS (Text-To-Speech)
  webhook_url?: string; // URL to receive call callbacks
  max_duration?: number; // Max duration in seconds
  language?: string; // Language code (e.g., 'pt-BR', 'en-US')
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
   * Validate phone number format (E.164)
   * E.164 format: +CCNNNNNNNNN (e.g., +5511999999999)
   */
  private validatePhoneNumber(phone: string): boolean {
    // Check if starts with + and has 10-15 digits
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    return e164Regex.test(phone);
  }

  /**
   * Make a phone call using Wavoip
   */
  async makeCall(options: WavoipCallOptions): Promise<WavoipCallResponse> {
    try {
      if (!this.apiKey) {
        throw new Error('Wavoip API key not configured');
      }

      const { from, to, voice_url, voice_text, webhook_url, max_duration = 300, language = 'pt-BR' } = options;

      // Validate required fields
      if (!from || !to) {
        throw new Error('Missing required fields: from and to phone numbers');
      }

      // Validate phone number format
      if (!this.validatePhoneNumber(from)) {
        throw new Error(`Invalid "from" phone number format. Use E.164 format: +CCNNNNNNNNN (e.g., +5511999999999). Got: ${from}`);
      }

      if (!this.validatePhoneNumber(to)) {
        throw new Error(`Invalid "to" phone number format. Use E.164 format: +CCNNNNNNNNN (e.g., +5511999999999). Got: ${to}`);
      }

      if (!voice_url && !voice_text) {
        throw new Error('Either voice_url or voice_text must be provided');
      }

      console.log(`[Wavoip] 📞 Initiating call from ${from} to ${to}`);
      console.log(`[Wavoip] 🔐 API URL: ${this.baseURL}/calls`);

      // Prepare request payload
      const payload: any = {
        from,
        to,
        max_duration,
      };

      if (voice_url) {
        payload.voice_url = voice_url;
      }

      if (voice_text) {
        payload.voice_text = voice_text;
        payload.language = language;
      }

      if (webhook_url) {
        payload.webhook_url = webhook_url;
      }

      console.log(`[Wavoip] 📤 Request payload:`, JSON.stringify(payload, null, 2));

      const response = await axios.post(
        `${this.baseURL}/calls`,
        payload,
        {
          timeout: WAVOIP_TIMEOUT,
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'User-Agent': 'LeadFlowAPI/1.0',
          },
        }
      );

      console.log(`[Wavoip] ✅ Call initiated successfully: ${response.data.call_id}`);
      console.log(`[Wavoip] 📊 Response:`, JSON.stringify(response.data, null, 2));

      return {
        call_id: response.data.call_id || response.data.id,
        status: response.data.status || 'initiated',
        from: response.data.from || from,
        to: response.data.to || to,
        started_at: response.data.started_at || new Date().toISOString(),
      };
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message;
      const statusCode = error.response?.status;
      
      console.error(`[Wavoip] ❌ Error making call (Status: ${statusCode}):`, errorMessage);
      
      if (error.response?.data) {
        console.error(`[Wavoip] 📋 Error details:`, JSON.stringify(error.response.data, null, 2));
      }
      
      // Return error response
      return {
        call_id: '',
        status: 'failed',
        from: options.from,
        to: options.to,
        error: `[${statusCode || 'ERROR'}] ${errorMessage}`,
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
