import axios from 'axios';
import type { 
  VoiceAgent, 
  CreateVoiceAgentInput, 
  UpdateVoiceAgentInput,
  VoiceAgentCall,
  ElevenLabsVoice,
  TestCallInput
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
  async testCall(id: string, data: TestCallInput): Promise<{ success: boolean; message: string }> {
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
  }
};
