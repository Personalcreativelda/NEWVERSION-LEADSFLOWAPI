/**
 * ElevenLabs API Service
 * Handles integration with ElevenLabs for voice synthesis
 */

import axios from 'axios';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
  description?: string;
  preview_url?: string;
  available_for_tiers?: string[];
  settings?: {
    stability?: number;
    similarity_boost?: number;
  };
}

export interface TextToSpeechOptions {
  text: string;
  voice_id: string;
  model_id?: string;
  voice_settings?: {
    stability?: number;
    similarity_boost?: number;
    style?: number;
    use_speaker_boost?: boolean;
  };
}

export class ElevenLabsService {
  private apiKey: string;
  private baseURL: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || ELEVENLABS_API_KEY || '';
    this.baseURL = ELEVENLABS_API_URL;

    if (!this.apiKey) {
      console.warn('[ElevenLabs] ⚠️ No API key configured. Set ELEVENLABS_API_KEY environment variable.');
    }
  }

  /**
   * Get all available voices from ElevenLabs
   */
  async getVoices(): Promise<ElevenLabsVoice[]> {
    try {
      if (!this.apiKey) {
        console.warn('[ElevenLabs] ⚠️ No API key - returning default voices');
        return this.getDefaultVoices();
      }

      const response = await axios.get(`${this.baseURL}/voices`, {
        headers: {
          'xi-api-key': this.apiKey,
        },
      });

      console.log(`[ElevenLabs] ✅ Fetched ${response.data.voices?.length || 0} voices`);
      return response.data.voices || [];
    } catch (error: any) {
      console.error('[ElevenLabs] ❌ Error fetching voices:', error.message);
      
      // Return default voices if API call fails
      return this.getDefaultVoices();
    }
  }

  /**
   * Get a specific voice by ID
   */
  async getVoice(voiceId: string): Promise<ElevenLabsVoice | null> {
    try {
      if (!this.apiKey) {
        throw new Error('ElevenLabs API key not configured');
      }

      const response = await axios.get(`${this.baseURL}/voices/${voiceId}`, {
        headers: {
          'xi-api-key': this.apiKey,
        },
      });

      return response.data;
    } catch (error: any) {
      console.error(`[ElevenLabs] ❌ Error fetching voice ${voiceId}:`, error.message);
      return null;
    }
  }

  /**
   * Convert text to speech
   */
  async textToSpeech(options: TextToSpeechOptions): Promise<Buffer | null> {
    try {
      if (!this.apiKey) {
        throw new Error('ElevenLabs API key not configured');
      }

      const { text, voice_id, model_id = 'eleven_monolingual_v1', voice_settings } = options;

      const response = await axios.post(
        `${this.baseURL}/text-to-speech/${voice_id}`,
        {
          text,
          model_id,
          voice_settings: voice_settings || {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        },
        {
          headers: {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
        }
      );

      console.log(`[ElevenLabs] ✅ Generated speech for voice ${voice_id}`);
      return Buffer.from(response.data);
    } catch (error: any) {
      console.error('[ElevenLabs] ❌ Error generating speech:', error.message);
      return null;
    }
  }

  /**
   * Get default voices as fallback
   */
  private getDefaultVoices(): ElevenLabsVoice[] {
    return [
      { 
        voice_id: 'ErXwobaYiN019PkySvjV', 
        name: 'Antoni', 
        category: 'premade',
        description: 'Mature and well-rounded voice'
      },
      { 
        voice_id: '21m00Tcm4TlvDq8ikWAM', 
        name: 'Rachel', 
        category: 'premade',
        description: 'Calm and pleasant voice'
      },
      { 
        voice_id: 'AZnzlk1XvdvUeBnXmlld', 
        name: 'Domi', 
        category: 'premade',
        description: 'Strong and confident voice'
      },
      { 
        voice_id: 'EXAVITQu4vr4xnSDxMaL', 
        name: 'Bella', 
        category: 'premade',
        description: 'Soft and gentle voice'
      },
      { 
        voice_id: 'MF3mGyEYCl7XYWbV9V6O', 
        name: 'Elli', 
        category: 'premade',
        description: 'Young and energetic voice'
      },
      { 
        voice_id: 'TxGEqnHWrfWFTfGW9XjX', 
        name: 'Josh', 
        category: 'premade',
        description: 'Deep and authoritative voice'
      },
      { 
        voice_id: 'VR6AewLTigWG4xSOukaG', 
        name: 'Arnold', 
        category: 'premade',
        description: 'Crisp and clear voice'
      },
      { 
        voice_id: 'pNInz6obpgDQGcFmaJgB', 
        name: 'Adam', 
        category: 'premade',
        description: 'Deep and resonant voice'
      },
      { 
        voice_id: 'yoZ06aMxZJJ28mfd3POQ', 
        name: 'Sam', 
        category: 'premade',
        description: 'Energetic and dynamic voice'
      },
    ];
  }
}

// Export singleton instance
export const elevenLabsService = new ElevenLabsService();
