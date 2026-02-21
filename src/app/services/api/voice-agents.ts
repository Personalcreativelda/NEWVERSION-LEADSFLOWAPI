import axios from 'axios';
import type {
  VoiceAgent,
  CreateVoiceAgentInput,
  UpdateVoiceAgentInput,
  VoiceAgentCall,
  ElevenLabsVoice,
  ElevenLabsConvAIAgent,
  ElevenLabsPhoneNumber,
  AICallResult,
  ConvAIConversation,
  TestCallInput,
} from '../../types/voice-agents';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const baseURL = API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`;

// Axios instance with default configuration
const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('leadflow_access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const voiceAgentsApi = {
  /**
   * Get user's voice agent settings
   */
  async getSettings(): Promise<{
    elevenlabs_configured: boolean;
    elevenlabs_api_key_preview: string | null;
    openai_configured: boolean;
    openai_api_key_preview: string | null;
    anthropic_configured: boolean;
    anthropic_api_key_preview: string | null;
    google_configured: boolean;
    google_api_key_preview: string | null;
    preferred_ai_model: string;
    voice_settings: Record<string, any>;
  }> {
    const response = await api.get('/voice-agents/settings');
    return response.data;
  },

  /**
   * Update user's voice agent settings
   */
  async updateSettings(data: {
    elevenlabs_api_key?: string | null;
    openai_api_key?: string | null;
    anthropic_api_key?: string | null;
    google_api_key?: string | null;
    preferred_ai_model?: string;
    voice_settings?: Record<string, any>;
  }): Promise<{ success: boolean; message: string }> {
    const response = await api.put('/voice-agents/settings', data);
    return response.data;
  },

  /**
   * Get all voice agents
   */
  async getAll(): Promise<VoiceAgent[]> {
    const response = await api.get('/voice-agents');
    return response.data;
  },

  /**
   * Get a specific voice agent
   */
  async getById(id: string): Promise<VoiceAgent> {
    const response = await api.get(`/voice-agents/${id}`);
    return response.data;
  },

  /**
   * Create a new voice agent
   */
  async create(data: CreateVoiceAgentInput): Promise<VoiceAgent> {
    const response = await api.post('/voice-agents', data);
    return response.data;
  },

  /**
   * Update a voice agent
   */
  async update(id: string, data: UpdateVoiceAgentInput): Promise<VoiceAgent> {
    const response = await api.put(`/voice-agents/${id}`, data);
    return response.data;
  },

  /**
   * Delete a voice agent
   */
  async delete(id: string): Promise<void> {
    await api.delete(`/voice-agents/${id}`);
  },

  /**
   * Toggle voice agent active status
   */
  async toggle(id: string, is_active: boolean): Promise<VoiceAgent> {
    const response = await api.post(`/voice-agents/${id}/toggle`, { is_active });
    return response.data;
  },

  /**
   * Make a test call with a voice agent
   */
  async testCall(id: string, data: TestCallInput): Promise<{ success: boolean; message: string; type?: string; call_url?: string }> {
    const response = await api.post(`/voice-agents/${id}/test-call`, data);
    return response.data;
  },

  /**
   * Get available ElevenLabs voices
   */
  async getElevenLabsVoices(): Promise<ElevenLabsVoice[]> {
    const response = await api.get('/voice-agents/providers/elevenlabs/voices');
    return response.data;
  },

  /**
   * Get call history for a voice agent
   */
  async getCallHistory(agentId: string): Promise<VoiceAgentCall[]> {
    // TODO: Implement this endpoint in the backend
    const response = await api.get(`/voice-agents/${agentId}/calls`);
    return response.data;
  },

  /**
   * Run diagnosis check to verify database schema
   */
  async diagnose(): Promise<any> {
    const response = await api.get('/voice-agents/diagnose');
    return response.data;
  },

  // ─── ElevenLabs Conversational AI (ConvAI) ──────────────────────────────────

  /**
   * List all Conversational AI agents in the user's ElevenLabs account.
   */
  async listConvAIAgents(): Promise<ElevenLabsConvAIAgent[]> {
    const response = await api.get('/voice-agents/elevenlabs/agents');
    return response.data.agents || [];
  },

  /**
   * List all registered SIP phone numbers in the user's ElevenLabs account.
   */
  async listPhoneNumbers(): Promise<ElevenLabsPhoneNumber[]> {
    const response = await api.get('/voice-agents/elevenlabs/phone-numbers');
    return response.data.phone_numbers || [];
  },

  /**
   * Register a Wavoip SIP trunk as a phone number in ElevenLabs.
   * ElevenLabs will use this to make outbound WhatsApp calls.
   */
  async registerSipTrunk(data: {
    label?: string;
    phone_number: string;
    sip_host: string;
    sip_username: string;
    sip_password: string;
  }): Promise<{ success: boolean; phone_number: ElevenLabsPhoneNumber }> {
    const response = await api.post('/voice-agents/elevenlabs/phone-numbers', data);
    return response.data;
  },

  /**
   * Delete a registered SIP phone number from ElevenLabs.
   */
  async deletePhoneNumber(phoneNumberId: string): Promise<void> {
    await api.delete(`/voice-agents/elevenlabs/phone-numbers/${phoneNumberId}`);
  },

  /**
   * Start an outbound AI call via ElevenLabs ConvAI + Wavoip SIP.
   * The agent must have elevenlabs_agent_id and phone_number_id configured.
   */
  async startAICall(agentId: string, data: { phone_number: string }): Promise<AICallResult> {
    const response = await api.post(`/voice-agents/${agentId}/call`, data);
    return response.data;
  },

  /**
   * Get the current status and transcript of an AI conversation.
   */
  async getConversation(conversationId: string): Promise<ConvAIConversation> {
    const response = await api.get(`/voice-agents/conversations/${conversationId}`);
    return response.data;
  },
};
