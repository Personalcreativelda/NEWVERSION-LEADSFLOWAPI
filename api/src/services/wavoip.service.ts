/**
 * Wavoip Service
 * Handles integration with Wavoip Click to Call
 *
 * How Wavoip Click to Call works:
 * - NOT a server-side REST call. Wavoip uses a browser webphone popup.
 * - The backend generates a URL: https://app.wavoip.com/call?token=TOKEN&phone=PHONE&name=NAME
 * - The frontend opens this URL in a popup window (window.open)
 * - The user's browser establishes the WebRTC call via Wavoip's webphone interface
 *
 * Fields:
 * - token: the Wavoip license token (stored as api_key in call_config)
 * - phone: destination phone number (digits only, no + prefix)
 * - name: contact name (optional, shown in the webphone UI)
 */

const WAVOIP_WEBPHONE_URL = 'https://app.wavoip.com/call';

export interface WavoipClickToCallResult {
  call_url: string;
  type: 'click_to_call';
  token: string;
  phone: string;
  name: string;
}

export class WavoipService {
  private token: string;

  constructor(apiKey?: string) {
    this.token = apiKey || '';
  }

  /**
   * Generate the Wavoip Click to Call URL.
   * The frontend should open this URL in a popup window.
   *
   * @param phone - destination phone number (E.164 or digits only, e.g. +5511999999999 or 5511999999999)
   * @param name  - contact name shown in the Wavoip webphone UI
   */
  generateClickToCallUrl(phone: string, name: string = ''): WavoipClickToCallResult {
    if (!this.token) {
      throw new Error('Token Wavoip não configurado para este agente');
    }

    // Strip leading + if present — Wavoip expects digits only
    const digits = phone.replace(/^\+/, '');

    const params = new URLSearchParams({
      token: this.token,
      phone: digits,
      ...(name ? { name } : {}),
    });

    const call_url = `${WAVOIP_WEBPHONE_URL}?${params.toString()}`;

    console.log(`[Wavoip] 🔗 Click to Call URL generated for ${digits}`);

    return {
      call_url,
      type: 'click_to_call',
      token: this.token,
      phone: digits,
      name,
    };
  }
}

// Export factory function to create instances with custom tokens
export const createWavoipService = (apiKey: string) => new WavoipService(apiKey);

// Export default instance
export const wavoipService = new WavoipService(process.env.WAVOIP_API_KEY);
