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
  /** Wavoip Click-to-Call token (simple/legacy mode) */
  api_key?: string;
  /** Source phone number for Click-to-Call */
  from_number?: string;
  /** Webhook for call events */
  webhook_url?: string;
  /** Max call duration in seconds */
  max_duration_seconds?: number;
  /**
   * ElevenLabs Conversational AI agent ID.
   * When set, calls use ElevenLabs ConvAI + Wavoip SIP (AI-powered).
   */
  elevenlabs_agent_id?: string;
  /**
   * ElevenLabs registered phone number / SIP trunk ID.
   * Obtained after registering the Wavoip SIP credentials in ElevenLabs.
   */
  phone_number_id?: string;
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

/** An ElevenLabs Conversational AI agent (created in ElevenLabs dashboard) */
export interface ElevenLabsConvAIAgent {
  agent_id: string;
  name: string;
  created_at_unix_secs?: number;
}

/** A SIP trunk / phone number registered in ElevenLabs */
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

/** Result of initiating an outbound call */
export interface AICallResult {
  success: boolean;
  type: 'elevenlabs_convai' | 'click_to_call';
  conversation_id?: string;
  call_url?: string;
  message: string;
  agent_id: string;
  phone_number: string;
}

/** Status of an active or completed AI conversation */
export interface ConvAIConversation {
  conversation_id: string;
  agent_id: string;
  status: 'initiated' | 'ringing' | 'in-progress' | 'completed' | 'failed';
  start_time_unix_secs?: number;
  end_time_unix_secs?: number;
  transcript?: Array<{
    role: 'user' | 'agent';
    message: string;
    time_in_call_secs: number;
  }>;
  metadata?: Record<string, any>;
}
