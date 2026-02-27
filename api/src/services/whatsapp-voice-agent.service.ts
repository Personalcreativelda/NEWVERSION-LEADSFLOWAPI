/**
 * WhatsApp Voice Agent Service
 *
 * Enables AI voice conversations through WhatsApp voice notes (PTT audio).
 * Flow:
 *   1. User sends voice note  →  Evolution API webhook fires
 *   2. This service is called with the audio base64
 *   3. Audio → text via OpenAI Whisper (STT)
 *   4. Text → AI response via configured LLM (OpenAI / Anthropic / Gemini)
 *   5. AI response → audio via ElevenLabs TTS
 *   6. Audio sent back as WhatsApp PTT voice note
 *
 * Completely FREE from a WhatsApp standpoint — only standard API costs apply.
 * Works in Mozambique and any country where WhatsApp is available.
 */

import { query } from '../database/connection';
import { WhatsAppService } from './whatsapp.service';
import FormData from 'form-data';
import axios from 'axios';

const whatsappService = new WhatsAppService();

// ─── Types ──────────────────────────────────────────────────────────────────

interface HistoryEntry {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface VoiceNoteParams {
  channelId: string;
  conversationId: string;
  userId: string;
  contactPhone: string;
  audioBase64: string;
  mediaMimetype: string;
  /** Evolution API instance name (e.g. "minha-instancia") */
  instanceId: string;
}

// ─── Main Service ────────────────────────────────────────────────────────────

export class WhatsAppVoiceAgentService {

  /**
   * Entry point called from the Evolution API webhook handler.
   * Returns true if a voice agent handled the message.
   */
  async processIncomingVoiceNote(params: VoiceNoteParams): Promise<boolean> {
    const { channelId, conversationId, userId, contactPhone, audioBase64, mediaMimetype, instanceId } = params;

    // 1. Check if this channel has an active voice agent linked
    const linkResult = await query(
      `SELECT l.*, v.name as agent_name, v.call_config, v.instructions, v.greeting_message, v.language
       FROM voice_agent_whatsapp_links l
       JOIN voice_agents v ON v.id = l.voice_agent_id
       WHERE l.channel_id = $1 AND l.is_active = TRUE AND v.is_active = TRUE
       LIMIT 1`,
      [channelId],
    );

    if (linkResult.rows.length === 0) return false;

    const link = linkResult.rows[0];
    const agentId = link.voice_agent_id;
    const callConfig = typeof link.call_config === 'string'
      ? JSON.parse(link.call_config) : (link.call_config || {});

    console.log(`[VoiceAgent WA] 🎙️ Voice note from ${contactPhone} → agent "${link.agent_name}"`);

    // Get user API keys
    const userResult = await query(
      'SELECT elevenlabs_api_key, openai_api_key, anthropic_api_key, google_api_key FROM users WHERE id = $1',
      [userId],
    );
    const userKeys = userResult.rows[0] || {};

    // 2. Transcribe audio → text
    let userText: string;
    try {
      userText = await this.transcribeAudio(audioBase64, mediaMimetype, userKeys.openai_api_key);
      console.log(`[VoiceAgent WA] 📝 Transcription: "${userText.substring(0, 100)}"`);
    } catch (err: any) {
      console.error('[VoiceAgent WA] ❌ Transcription failed:', err.message);
      // Send error message back as text
      await whatsappService.sendMessage({
        instanceId,
        number: contactPhone,
        text: '⚠️ Não consegui transcrever o áudio. Por favor, tente enviar uma mensagem de texto.',
      });
      return true;
    }

    if (!userText.trim()) return true;

    // 3. Load conversation history
    const history = await this.loadHistory(conversationId, agentId);

    // 4. Build system prompt from agent instructions
    const systemPrompt = link.instructions
      ? `${link.instructions}\n\nResponda de forma concisa e natural, como em uma conversa por voz no WhatsApp. Idioma: ${link.language || 'pt-BR'}.`
      : `Você é um assistente de voz prestativo. Responda de forma concisa e natural. Idioma: ${link.language || 'pt-BR'}.`;

    // 5. Get AI text response
    let aiText: string;
    try {
      aiText = await this.getAIResponse(systemPrompt, history, userText, userKeys);
      console.log(`[VoiceAgent WA] 🤖 AI response: "${aiText.substring(0, 100)}"`);
    } catch (err: any) {
      console.error('[VoiceAgent WA] ❌ AI response failed:', err.message);
      await whatsappService.sendMessage({
        instanceId,
        number: contactPhone,
        text: '⚠️ O agente de IA não conseguiu processar sua mensagem. Tente novamente.',
      });
      return true;
    }

    // 6. Generate TTS audio
    const voiceId = callConfig.voice_id || null;
    let audioBuffer: Buffer | null = null;

    if (userKeys.elevenlabs_api_key) {
      try {
        audioBuffer = await this.generateTTS(aiText, voiceId, userKeys.elevenlabs_api_key);
        console.log(`[VoiceAgent WA] 🔊 TTS generated: ${audioBuffer.length} bytes`);
      } catch (err: any) {
        console.error('[VoiceAgent WA] ⚠️ TTS failed, sending text instead:', err.message);
      }
    }

    // 7. Save updated history
    const newHistory: HistoryEntry[] = [
      ...history,
      { role: 'user', content: userText, timestamp: new Date().toISOString() },
      { role: 'assistant', content: aiText, timestamp: new Date().toISOString() },
    ];
    // Keep last 20 turns (10 exchanges)
    const trimmed = newHistory.slice(-20);
    await this.saveHistory(conversationId, agentId, userId, trimmed);

    // 8. Send response — audio if TTS worked, otherwise text
    if (audioBuffer) {
      const audioBase64Response = audioBuffer.toString('base64');
      try {
        await whatsappService.sendAudio({
          instanceId,
          number: contactPhone,
          audioBase64: audioBase64Response,
        });
        console.log(`[VoiceAgent WA] ✅ Voice note sent to ${contactPhone}`);
      } catch (audioSendErr: any) {
        console.error('[VoiceAgent WA] ⚠️ Audio send failed, falling back to text:', audioSendErr.message);
        await whatsappService.sendMessage({ instanceId, number: contactPhone, text: aiText });
      }
    } else {
      await whatsappService.sendMessage({ instanceId, number: contactPhone, text: aiText });
    }

    return true;
  }

  // ─── STT — OpenAI Whisper ─────────────────────────────────────────────────

  private async transcribeAudio(base64: string, mimetype: string, openaiKey?: string): Promise<string> {
    if (!openaiKey) throw new Error('OpenAI API key not configured for speech-to-text');

    const ext = this.mimetypeToExt(mimetype);
    const audioBuffer = Buffer.from(base64, 'base64');

    const form = new FormData();
    form.append('file', audioBuffer, { filename: `audio.${ext}`, contentType: mimetype || 'audio/ogg' });
    form.append('model', 'whisper-1');

    const res = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, {
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        ...form.getHeaders(),
      },
      timeout: 30_000,
    });

    return (res.data as { text: string }).text || '';
  }

  private mimetypeToExt(mimetype: string): string {
    const map: Record<string, string> = {
      'audio/ogg': 'ogg',
      'audio/mpeg': 'mp3',
      'audio/mp4': 'mp4',
      'audio/webm': 'webm',
      'audio/wav': 'wav',
      'audio/aac': 'aac',
    };
    return map[mimetype] || 'ogg';
  }

  // ─── AI Response ──────────────────────────────────────────────────────────

  private async getAIResponse(
    systemPrompt: string,
    history: HistoryEntry[],
    userText: string,
    keys: { openai_api_key?: string; anthropic_api_key?: string; google_api_key?: string },
  ): Promise<string> {
    if (keys.openai_api_key) {
      return this.openAIResponse(systemPrompt, history, userText, keys.openai_api_key);
    }
    if (keys.anthropic_api_key) {
      return this.anthropicResponse(systemPrompt, history, userText, keys.anthropic_api_key);
    }
    if (keys.google_api_key) {
      return this.geminiResponse(systemPrompt, history, userText, keys.google_api_key);
    }
    throw new Error('No AI API key configured (OpenAI, Anthropic or Google required)');
  }

  private async openAIResponse(system: string, history: HistoryEntry[], userText: string, key: string): Promise<string> {
    const messages = [
      { role: 'system', content: system },
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: userText },
    ];
    const res = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      { model: 'gpt-4o-mini', messages, max_tokens: 300, temperature: 0.7 },
      { headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, timeout: 30_000 },
    );
    return res.data.choices[0]?.message?.content?.trim() || '';
  }

  private async anthropicResponse(system: string, history: HistoryEntry[], userText: string, key: string): Promise<string> {
    const messages = [
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: userText },
    ];
    const res = await axios.post(
      'https://api.anthropic.com/v1/messages',
      { model: 'claude-haiku-4-5-20251001', system, messages, max_tokens: 300 },
      {
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        timeout: 30_000,
      },
    );
    return res.data.content?.[0]?.text?.trim() || '';
  }

  private async geminiResponse(system: string, history: HistoryEntry[], userText: string, key: string): Promise<string> {
    const contents = [
      ...history.map(h => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.content }] })),
      { role: 'user', parts: [{ text: userText }] },
    ];
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
      { system_instruction: { parts: [{ text: system }] }, contents, generationConfig: { maxOutputTokens: 300 } },
      { headers: { 'Content-Type': 'application/json' }, timeout: 30_000 },
    );
    return res.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  }

  // ─── TTS — ElevenLabs ─────────────────────────────────────────────────────

  private async generateTTS(text: string, voiceId: string | null, apiKey: string): Promise<Buffer> {
    const vid = voiceId || 'EXAVITQu4vr4xnSDxMaL'; // default: Bella
    const res = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${vid}`,
      { text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75 } },
      {
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        responseType: 'arraybuffer',
        timeout: 30_000,
      },
    );
    return Buffer.from(res.data);
  }

  // ─── Session History ──────────────────────────────────────────────────────

  private async loadHistory(conversationId: string, agentId: string): Promise<HistoryEntry[]> {
    try {
      const r = await query(
        'SELECT history FROM voice_note_sessions WHERE conversation_id = $1 AND voice_agent_id = $2',
        [conversationId, agentId],
      );
      if (r.rows.length === 0) return [];
      const h = r.rows[0].history;
      return Array.isArray(h) ? h : [];
    } catch {
      return [];
    }
  }

  private async saveHistory(conversationId: string, agentId: string, userId: string, history: HistoryEntry[]): Promise<void> {
    try {
      await query(
        `INSERT INTO voice_note_sessions (conversation_id, voice_agent_id, user_id, history, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (conversation_id, voice_agent_id)
         DO UPDATE SET history = $4, updated_at = NOW()`,
        [conversationId, agentId, userId, JSON.stringify(history)],
      );
    } catch (err: any) {
      console.error('[VoiceAgent WA] Error saving session history:', err.message);
    }
  }

  // ─── Channel link helpers (used by routes) ────────────────────────────────

  async linkAgentToChannel(agentId: string, channelId: string, userId: string, alwaysRespond = false): Promise<void> {
    await query(
      `INSERT INTO voice_agent_whatsapp_links (voice_agent_id, channel_id, user_id, always_respond)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (voice_agent_id, channel_id)
       DO UPDATE SET is_active = TRUE, always_respond = $4, updated_at = NOW()`,
      [agentId, channelId, userId, alwaysRespond],
    );
  }

  async unlinkAgentFromChannel(agentId: string, channelId: string, userId: string): Promise<void> {
    await query(
      'DELETE FROM voice_agent_whatsapp_links WHERE voice_agent_id = $1 AND channel_id = $2 AND user_id = $3',
      [agentId, channelId, userId],
    );
  }

  async getLinksForAgent(agentId: string, userId: string): Promise<any[]> {
    const r = await query(
      `SELECT l.*, c.name as channel_name, c.type as channel_type,
              (c.credentials->>'instanceName') as instance_name,
              (c.credentials->>'phoneNumber') as phone_number
       FROM voice_agent_whatsapp_links l
       JOIN channels c ON c.id = l.channel_id
       WHERE l.voice_agent_id = $1 AND l.user_id = $2
       ORDER BY l.created_at DESC`,
      [agentId, userId],
    );
    return r.rows;
  }

  async getLinkedAgentForChannel(channelId: string): Promise<any | null> {
    const r = await query(
      `SELECT l.*, v.name as agent_name, v.instructions, v.language, v.call_config
       FROM voice_agent_whatsapp_links l
       JOIN voice_agents v ON v.id = l.voice_agent_id
       WHERE l.channel_id = $1 AND l.is_active = TRUE AND v.is_active = TRUE
       LIMIT 1`,
      [channelId],
    );
    return r.rows[0] || null;
  }

  async clearHistory(conversationId: string, agentId: string): Promise<void> {
    await query(
      'DELETE FROM voice_note_sessions WHERE conversation_id = $1 AND voice_agent_id = $2',
      [conversationId, agentId],
    );
  }
}

export const whatsappVoiceAgentService = new WhatsAppVoiceAgentService();
