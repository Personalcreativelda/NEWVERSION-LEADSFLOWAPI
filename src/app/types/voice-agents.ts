// Voice Agent types for ElevenLabs + Wavoip integration

export interface VoiceAgent {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  voice_provider: 'elevenlabs' | 'custom';
  voice_config: VoiceConfig;
  call_provider: 'wavoip' | 'custom';
  call_config: CallConfig;
  greeting_message?: string;
  instructions?: string;
  language: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface VoiceConfig {
  voice_id?: string; // ElevenLabs voice ID
  model?: string; // ElevenLabs model (e.g., 'eleven_monolingual_v1')
  stability?: number; // 0.0 - 1.0
  similarity_boost?: number; // 0.0 - 1.0
  style?: number; // 0.0 - 1.0
  use_speaker_boost?: boolean;
}

export interface CallConfig {
  api_key?: string; // Wavoip API key
  from_number?: string; // Source phone number
  webhook_url?: string; // Webhook for call events
  max_duration_seconds?: number; // Max call duration
}

export interface CreateVoiceAgentInput {
  name: string;
  description?: string;
  voice_provider: 'elevenlabs' | 'custom';
  voice_config: VoiceConfig;
  call_provider: 'wavoip' | 'custom';
  call_config: CallConfig;
  greeting_message?: string;
  instructions?: string;
  language?: string;
}

export interface UpdateVoiceAgentInput extends Partial<CreateVoiceAgentInput> {
  is_active?: boolean;
}

export interface VoiceAgentCall {
  id: string;
  voice_agent_id: string;
  user_id: string;
  phone_number: string;
  direction: 'outbound' | 'inbound';
  status: 'initiated' | 'ringing' | 'answered' | 'completed' | 'failed' | 'no-answer' | 'busy';
  duration_seconds: number;
  lead_id?: string;
  conversation_id?: string;
  recording_url?: string;
  transcript?: string;
  call_provider_id?: string;
  voice_provider_id?: string;
  metadata?: Record<string, any>;
  started_at?: string;
  ended_at?: string;
  created_at: string;
}

export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  language: string;
  description?: string;
  preview_url?: string;
}

export interface TestCallInput {
  phone_number: string;
}
