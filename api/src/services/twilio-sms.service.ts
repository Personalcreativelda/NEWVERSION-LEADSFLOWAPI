import twilio from 'twilio';

interface TwilioCredentials {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
}

/**
 * TwilioSMSService - Multi-tenant SMS service
 * Cada canal pode ter suas próprias credenciais Twilio
 */
export class TwilioSMSService {
  private client: any;
  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly phoneNumber: string;
  private readonly isConfigured: boolean;

  /**
   * @param credentials - Credenciais específicas do canal (opcional)
   * Se não fornecidas, usa variáveis de ambiente como fallback
   */
  constructor(credentials?: TwilioCredentials) {
    if (credentials) {
      // Usar credenciais do canal (multi-tenant)
      this.accountSid = credentials.accountSid;
      this.authToken = credentials.authToken;
      this.phoneNumber = credentials.phoneNumber;
    } else {
      // Fallback para variáveis de ambiente
      this.accountSid = process.env.TWILIO_ACCOUNT_SID || '';
      this.authToken = process.env.TWILIO_AUTH_TOKEN || '';
      this.phoneNumber = process.env.TWILIO_PHONE_NUMBER || '';
    }

    this.isConfigured = Boolean(
      this.accountSid && 
      this.authToken && 
      this.phoneNumber
    );

    if (this.isConfigured) {
      try {
        this.client = twilio(this.accountSid, this.authToken);
        console.log('[TwilioSMS] Service initialized with phone:', this.phoneNumber);
      } catch (error) {
        console.error('[TwilioSMS] Failed to initialize Twilio client:', error);
        throw new Error('Failed to initialize Twilio client');
      }
    } else {
      console.warn('[TwilioSMS] Credentials not provided');
      throw new Error('Twilio credentials not configured');
    }
  }

  /**
   * Format phone number to E.164 format
   */
  private formatPhoneNumber(phone: string): string {
    // Remove all non-digit characters
    let cleaned = phone.replace(/\D/g, '');
    
    // If doesn't start with +, add country code
    if (!phone.startsWith('+')) {
      // Assume Brazil (+55) if no country code
      if (cleaned.length === 11 || cleaned.length === 10) {
        cleaned = '55' + cleaned;
      }
      cleaned = '+' + cleaned;
    } else {
      cleaned = '+' + cleaned;
    }
    
    return cleaned;
  }

  /**
   * Send SMS via Twilio
   */
  async sendSMS(to: string, body: string): Promise<any> {
    try {
      const formattedTo = this.formatPhoneNumber(to);
      console.log('[TwilioSMS] Sending SMS to:', formattedTo);

      const message = await this.client.messages.create({
        body: body,
        from: this.phoneNumber,
        to: formattedTo
      });

      console.log('[TwilioSMS] SMS sent successfully:', message.sid);
      
      return {
        success: true,
        sid: message.sid,
        messageId: message.sid,
        status: message.status,
        to: message.to,
        from: message.from,
        body: message.body,
        dateCreated: message.dateCreated
      };
    } catch (error: any) {
      console.error('[TwilioSMS] Error sending SMS:', error);
      throw new Error(`Failed to send SMS: ${error.message}`);
    }
  }

  /**
   * Send SMS with media (MMS)
   */
  async sendMMS(to: string, body: string, mediaUrl: string): Promise<any> {
    try {
      const formattedTo = this.formatPhoneNumber(to);
      console.log('[TwilioSMS] Sending MMS to:', formattedTo, 'with media:', mediaUrl);

      const message = await this.client.messages.create({
        body: body,
        from: this.phoneNumber,
        to: formattedTo,
        mediaUrl: [mediaUrl]
      });

      console.log('[TwilioSMS] MMS sent successfully:', message.sid);
      
      return {
        success: true,
        sid: message.sid,
        messageId: message.sid,
        status: message.status,
        to: message.to,
        from: message.from,
        body: message.body,
        dateCreated: message.dateCreated
      };
    } catch (error: any) {
      console.error('[TwilioSMS] Error sending MMS:', error);
      throw new Error(`Failed to send MMS: ${error.message}`);
    }
  }

  /**
   * Get message status
   */
  async getMessageStatus(messageSid: string): Promise<any> {
    try {
      const message = await this.client.messages(messageSid).fetch();
      
      return {
        sid: message.sid,
        status: message.status,
        to: message.to,
        from: message.from,
        body: message.body,
        dateCreated: message.dateCreated,
        dateUpdated: message.dateUpdated,
        dateSent: message.dateSent,
        errorCode: message.errorCode,
        errorMessage: message.errorMessage
      };
    } catch (error: any) {
      console.error('[TwilioSMS] Error fetching message status:', error);
      throw new Error(`Failed to get message status: ${error.message}`);
    }
  }

  /**
   * Validate webhook signature
   */
  validateWebhookSignature(
    signature: string,
    url: string,
    params: any
  ): boolean {
    try {
      return twilio.validateRequest(
        this.authToken,
        signature,
        url,
        params
      );
    } catch (error) {
      console.error('[TwilioSMS] Error validating webhook:', error);
      return false;
    }
  }
}
