/**
 * ElevenLabs Conversational AI Service
 *
 * Architecture: ElevenLabs ConvAI + Wavoip SIP → WhatsApp calls
 *
 * How it works:
 * 1. Register Wavoip SIP trunk once in ElevenLabs as a "phone number"
 *    (ElevenLabs registers as a SIP client with Wavoip using host/user/pass)
 * 2. Create AI agents in ElevenLabs dashboard (prompt, voice, behavior)
 * 3. Our app calls ElevenLabs API → initiates outbound call
 * 4. ElevenLabs dials the customer via Wavoip SIP → WhatsApp
 * 5. ElevenLabs AI agent conducts the full conversation
 *
 * Key ElevenLabs API endpoints:
 *   GET  /v1/convai/agents                              – list agents
 *   GET  /v1/convai/phone-numbers                       – list SIP trunks/numbers
 *   POST /v1/convai/phone-numbers                       – register Wavoip SIP trunk
 *   DELETE /v1/convai/phone-numbers/:id                 – remove a number
 *   POST /v1/convai/conversations/initiate_outbound_call – start outbound call
 *   GET  /v1/convai/conversations/:id                   – get call status/transcript
 */

import axios, { AxiosError } from 'axios';

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ElevenLabsConvAIAgent {
  agent_id: string;
  name: string;
  created_at_unix_secs?: number;
}

export interface ElevenLabsPhoneNumber {
  phone_number_id: string;
  phone_number: string;
  provider: string;
  label: string;
  assigned_agent?: {
    agent_id: string;
    agent_name: string;
  } | null;
}

export interface WavoipSipCredentials {
  /** Wavoip SIP host, e.g. sipv2.wavoip.com */
  host: string;
  /** Wavoip SIP username (UUID shown in Wavoip dashboard) */
  username: string;
  /** Wavoip SIP password */
  password: string;
}

export interface ConvAICallResult {
  conversation_id: string;
}

export interface ConvAITranscriptItem {
  role: 'user' | 'agent';
  message: string;
  time_in_call_secs: number;
}

export interface ConvAIConversation {
  conversation_id: string;
  agent_id: string;
  status: 'initiated' | 'ringing' | 'in-progress' | 'completed' | 'failed';
  start_time_unix_secs?: number;
  end_time_unix_secs?: number;
  transcript?: ConvAITranscriptItem[];
  metadata?: Record<string, any>;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class ElevenLabsConvAIService {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private get headers() {
    return {
      'xi-api-key': this.apiKey,
      'Content-Type': 'application/json',
    };
  }

  private handleError(err: unknown, context: string): never {
    if (err instanceof AxiosError) {
      const status = err.response?.status;
      const data = err.response?.data;
      console.error(`[ElevenLabsConvAI] ❌ ${context}: HTTP ${status}`, data);
      const msg = data?.detail?.message || data?.detail || data?.error || err.message;
      throw new Error(`ElevenLabs ConvAI error (${context}): ${msg}`);
    }
    throw err;
  }

  /**
   * List all Conversational AI agents in this ElevenLabs account.
   */
  async listAgents(): Promise<ElevenLabsConvAIAgent[]> {
    try {
      const res = await axios.get(`${ELEVENLABS_API_URL}/convai/agents`, {
        headers: this.headers,
      });
      return res.data.agents || [];
    } catch (err) {
      this.handleError(err, 'listAgents');
    }
  }

  /**
   * List all registered phone numbers / SIP trunks in this ElevenLabs account.
   */
  async listPhoneNumbers(): Promise<ElevenLabsPhoneNumber[]> {
    try {
      const res = await axios.get(`${ELEVENLABS_API_URL}/convai/phone-numbers`, {
        headers: this.headers,
      });
      return res.data.phone_numbers || [];
    } catch (err) {
      this.handleError(err, 'listPhoneNumbers');
    }
  }

  /**
   * Register a Wavoip SIP trunk as a phone number in ElevenLabs.
   * ElevenLabs will authenticate with Wavoip using the SIP credentials and
   * use this trunk to make/receive WhatsApp calls.
   *
   * @param label        – Display label, e.g. "Wavoip +5511999999999"
   * @param phoneNumber  – The WhatsApp number in E.164, e.g. +5511999999999
   * @param credentials  – Wavoip SIP credentials (host, username, password)
   */
  async registerSipTrunk(
    label: string,
    phoneNumber: string,
    credentials: WavoipSipCredentials,
  ): Promise<ElevenLabsPhoneNumber> {
    try {
      const res = await axios.post(
        `${ELEVENLABS_API_URL}/convai/phone-numbers`,
        {
          label,
          phone_number: phoneNumber,
          provider: 'sip_trunk',
          sip_trunk_credentials: {
            termination_uri: credentials.host,
            username: credentials.username,
            password: credentials.password,
          },
        },
        { headers: this.headers },
      );
      console.log(`[ElevenLabsConvAI] ✅ SIP trunk registered: ${res.data.phone_number_id}`);
      return res.data;
    } catch (err) {
      this.handleError(err, 'registerSipTrunk');
    }
  }

  /**
   * Remove a registered phone number / SIP trunk from ElevenLabs.
   */
  async deletePhoneNumber(phoneNumberId: string): Promise<void> {
    try {
      await axios.delete(`${ELEVENLABS_API_URL}/convai/phone-numbers/${phoneNumberId}`, {
        headers: this.headers,
      });
      console.log(`[ElevenLabsConvAI] ✅ Phone number deleted: ${phoneNumberId}`);
    } catch (err) {
      this.handleError(err, 'deletePhoneNumber');
    }
  }

  /**
   * Initiate an outbound AI call.
   * ElevenLabs will use the registered SIP trunk (Wavoip) to call the customer,
   * and the specified AI agent will handle the conversation.
   *
   * @param agentId          – ElevenLabs Conversational AI agent ID
   * @param fromPhoneNumberId – ID of the registered SIP/phone number
   * @param toNumber         – Destination number in E.164 (e.g. +5511999999999)
   */
  async initiateOutboundCall(
    agentId: string,
    fromPhoneNumberId: string,
    toNumber: string,
  ): Promise<ConvAICallResult> {
    try {
      const res = await axios.post(
        `${ELEVENLABS_API_URL}/convai/conversations/initiate_outbound_call`,
        {
          agent_id: agentId,
          agent_phone_number_id: fromPhoneNumberId,
          customer_number: toNumber,
        },
        { headers: this.headers },
      );
      console.log(`[ElevenLabsConvAI] ✅ Outbound call initiated: ${res.data.conversation_id}`);
      return res.data;
    } catch (err) {
      this.handleError(err, 'initiateOutboundCall');
    }
  }

  /**
   * Create a new Conversational AI agent in ElevenLabs.
   *
   * @param input - Agent configuration
   */
  async createAgent(input: {
    name: string;
    system_prompt: string;
    first_message: string;
    voice_id?: string;
    language?: string;
    llm?: string;
  }): Promise<ElevenLabsConvAIAgent> {
    try {
      const body: any = {
        name: input.name,
        conversation_config: {
          agent: {
            prompt: {
              prompt: input.system_prompt,
              llm: input.llm || 'claude-3-5-sonnet',
              temperature: 0.5,
              max_tokens: 2000,
            },
            first_message: input.first_message,
            language: input.language || 'pt',
          },
        },
      };

      if (input.voice_id) {
        body.conversation_config.tts = {
          voice_id: input.voice_id,
          model_id: 'eleven_multilingual_v2',
          stability: 0.5,
          similarity_boost: 0.75,
        };
      }

      const res = await axios.post(`${ELEVENLABS_API_URL}/convai/agents`, body, {
        headers: this.headers,
      });
      console.log(`[ElevenLabsConvAI] ✅ Agent created: ${res.data.agent_id}`);
      return { agent_id: res.data.agent_id, name: input.name };
    } catch (err) {
      this.handleError(err, 'createAgent');
    }
  }

  /**
   * Get the current status and transcript of a conversation.
   */
  async getConversation(conversationId: string): Promise<ConvAIConversation> {
    try {
      const res = await axios.get(
        `${ELEVENLABS_API_URL}/convai/conversations/${conversationId}`,
        { headers: this.headers },
      );
      return res.data;
    } catch (err) {
      this.handleError(err, 'getConversation');
    }
  }
}

export const createElevenLabsConvAIService = (apiKey: string) =>
  new ElevenLabsConvAIService(apiKey);
