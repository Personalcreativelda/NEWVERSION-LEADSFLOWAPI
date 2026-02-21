import { Router, Request, Response, NextFunction } from 'express';
import { query } from '../database/connection';
import { authMiddleware } from '../middleware/auth.middleware';
import { elevenLabsService } from '../services/elevenlabs.service';
import { ElevenLabsService } from '../services/elevenlabs.service';
import { createWavoipService } from '../services/wavoip.service';
import { AIService } from '../services/ai.service';
import { createElevenLabsConvAIService } from '../services/elevenlabs-convai.service';

const router = Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

/**
 * GET /api/voice-agents/diagnose
 * Diagnostic endpoint to check database schema and configuration
 */
router.get('/diagnose', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    console.log(`[VoiceAgents] 🔍 Diagnosis check requested by user ${user.id}`);

    // Check if columns exist
    const columnCheckQuery = `
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name IN ('elevenlabs_api_key', 'openai_api_key', 'anthropic_api_key', 'google_api_key', 'preferred_ai_model', 'voice_settings')
      ORDER BY column_name;
    `;

    const columnResult = await query(columnCheckQuery, []);
    const existingColumns = columnResult.rows.map(row => row.column_name);
    console.log(`[VoiceAgents] Found columns:`, existingColumns);

    // Expected columns
    const expectedColumns = ['elevenlabs_api_key', 'openai_api_key', 'anthropic_api_key', 'google_api_key', 'preferred_ai_model', 'voice_settings'];
    const missingColumns = expectedColumns.filter(col => !existingColumns.includes(col));

    res.json({
      status: 'ok',
      diagnosis: {
        allColumnsExist: missingColumns.length === 0,
        existingColumns: existingColumns,
        missingColumns: missingColumns,
        message: missingColumns.length === 0 
          ? '✅ All required columns exist in the database!'
          : `❌ Missing columns: ${missingColumns.join(', ')}. Run migration 014_add_ai_models_support.sql`
      },
      migration: {
        required: missingColumns.length > 0,
        scriptFile: '014_add_ai_models_support.sql',
        location: 'api/src/database/migrations/'
      }
    });
  } catch (error) {
    console.error(`[VoiceAgents] Diagnosis error:`, error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to run diagnosis',
      details: (error as any).message
    });
  }
});

/**
 * GET /api/voice-agents/settings
 * Get user's voice agent settings (API keys, preferences, etc)
 */
router.get('/settings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const result = await query(
      'SELECT elevenlabs_api_key, openai_api_key, anthropic_api_key, google_api_key, preferred_ai_model, voice_settings FROM users WHERE id = $1',
      [user.id]
    );

    const settings = result.rows[0] || {};

    // Don't expose the full API keys for security
    res.json({
      elevenlabs_configured: !!settings.elevenlabs_api_key,
      elevenlabs_api_key_preview: settings.elevenlabs_api_key 
        ? `${settings.elevenlabs_api_key.substring(0, 8)}...` 
        : null,
      openai_configured: !!settings.openai_api_key,
      openai_api_key_preview: settings.openai_api_key
        ? `${settings.openai_api_key.substring(0, 8)}...`
        : null,
      anthropic_configured: !!settings.anthropic_api_key,
      anthropic_api_key_preview: settings.anthropic_api_key
        ? `${settings.anthropic_api_key.substring(0, 8)}...`
        : null,
      google_configured: !!settings.google_api_key,
      google_api_key_preview: settings.google_api_key
        ? `${settings.google_api_key.substring(0, 8)}...`
        : null,
      preferred_ai_model: settings.preferred_ai_model || 'elevenlabs',
      voice_settings: settings.voice_settings || {}
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/voice-agents/settings
 * Update user's voice agent settings (API keys for multiple AI models)
 */
router.put('/settings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    console.log(`[VoiceAgents] 🔧 PUT /settings called for user ${user.id}`);
    console.log(`[VoiceAgents] Request body received:`, JSON.stringify(req.body, null, 2));

    const { 
      elevenlabs_api_key, 
      openai_api_key,
      anthropic_api_key,
      google_api_key,
      preferred_ai_model,
      voice_settings 
    } = req.body;

    console.log(`[VoiceAgents] Parsed fields:`, {
      hasElevenLabs: elevenlabs_api_key !== undefined,
      hasOpenAI: openai_api_key !== undefined,
      hasAnthropic: anthropic_api_key !== undefined,
      hasGoogle: google_api_key !== undefined,
      hasModel: preferred_ai_model !== undefined,
      hasVoiceSettings: voice_settings !== undefined,
    });

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (elevenlabs_api_key !== undefined) {
      updates.push(`elevenlabs_api_key = $${paramIndex++}`);
      values.push(elevenlabs_api_key || null);
      console.log(`[VoiceAgents] Adding elevenlabs_api_key update`);
    }

    if (openai_api_key !== undefined) {
      updates.push(`openai_api_key = $${paramIndex++}`);
      values.push(openai_api_key || null);
      console.log(`[VoiceAgents] Adding openai_api_key update`);
    }

    if (anthropic_api_key !== undefined) {
      updates.push(`anthropic_api_key = $${paramIndex++}`);
      values.push(anthropic_api_key || null);
      console.log(`[VoiceAgents] Adding anthropic_api_key update`);
    }

    if (google_api_key !== undefined) {
      updates.push(`google_api_key = $${paramIndex++}`);
      values.push(google_api_key || null);
      console.log(`[VoiceAgents] Adding google_api_key update`);
    }

    if (preferred_ai_model !== undefined) {
      updates.push(`preferred_ai_model = $${paramIndex++}`);
      values.push(preferred_ai_model || 'elevenlabs');
      console.log(`[VoiceAgents] Adding preferred_ai_model update`);
    }

    if (voice_settings !== undefined) {
      updates.push(`voice_settings = $${paramIndex++}`);
      values.push(JSON.stringify(voice_settings));
      console.log(`[VoiceAgents] Adding voice_settings update`);
    }

    console.log(`[VoiceAgents] Total updates to apply: ${updates.length}`);
    
    if (updates.length === 0) {
      console.warn(`[VoiceAgents] ⚠️ No settings fields provided in request body. Sending 400 error.`);
      return res.status(400).json({ 
        error: 'No settings to update',
        receivedFields: {
          elevenlabs_api_key: elevenlabs_api_key !== undefined ? 'defined' : 'undefined',
          openai_api_key: openai_api_key !== undefined ? 'defined' : 'undefined',
          anthropic_api_key: anthropic_api_key !== undefined ? 'defined' : 'undefined',
          google_api_key: google_api_key !== undefined ? 'defined' : 'undefined',
          preferred_ai_model: preferred_ai_model !== undefined ? 'defined' : 'undefined',
          voice_settings: voice_settings !== undefined ? 'defined' : 'undefined',
        }
      });
    }

    values.push(user.id);

    const sqlQuery = `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex}`;
    console.log(`[VoiceAgents] Executing query:`, sqlQuery);
    console.log(`[VoiceAgents] With parameters:`, values.length, 'values');

    try {
      const result = await query(sqlQuery, values);
      console.log(`[VoiceAgents] ✅ Query executed successfully. Rows affected:`, result.rowCount);
    } catch (queryError: any) {
      console.error(`[VoiceAgents] ❌ Database query error:`, queryError.message);
      console.error(`[VoiceAgents] Error code:`, queryError.code);
      console.error(`[VoiceAgents] Error detail:`, queryError.detail);
      
      // Check if columns don't exist
      if (queryError.code === '42703') {
        console.error(`[VoiceAgents] ERROR: Column not found. Migration 014 may not have been applied.`);
        return res.status(500).json({ 
          error: 'Database schema not updated',
          message: 'Migration 014 (add_ai_models_support) has not been applied. Please run the migration.',
          details: queryError.message
        });
      }
      
      throw queryError;
    }

    console.log(`[VoiceAgents] ✅ Settings updated for user ${user.id}`);
    console.log(`[VoiceAgents] Updated values: ElevenLabs=${!!elevenlabs_api_key}, OpenAI=${!!openai_api_key}, Anthropic=${!!anthropic_api_key}, Google=${!!google_api_key}`);

    // Return confirmation with updated settings
    res.json({ 
      success: true,
      message: 'Configurações atualizadas com sucesso',
      settings: {
        elevenlabs_configured: elevenlabs_api_key !== undefined ? !!elevenlabs_api_key : undefined,
        openai_configured: openai_api_key !== undefined ? !!openai_api_key : undefined,
        anthropic_configured: anthropic_api_key !== undefined ? !!anthropic_api_key : undefined,
        google_configured: google_api_key !== undefined ? !!google_api_key : undefined,
        preferred_ai_model: preferred_ai_model || 'elevenlabs'
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/voice-agents
 * Get all voice agents for the authenticated user
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const result = await query(
      `SELECT 
        id, 
        user_id, 
        name, 
        description,
        voice_provider,
        voice_config,
        call_provider,
        call_config,
        greeting_message,
        instructions,
        language,
        is_active,
        created_at,
        updated_at
      FROM voice_agents
      WHERE user_id = $1
      ORDER BY created_at DESC`,
      [user.id]
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/voice-agents/providers/elevenlabs/voices
 * Get available ElevenLabs voices using user's API key
 * NOTE: This route MUST be declared before GET /:id to avoid being shadowed
 */
router.get('/providers/elevenlabs/voices', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    console.log('[VoiceAgents] 🎤 Fetching ElevenLabs voices for user:', user.id);

    // Get user's ElevenLabs API key from database
    const userResult = await query(
      'SELECT elevenlabs_api_key FROM users WHERE id = $1',
      [user.id]
    );

    const userApiKey = userResult.rows[0]?.elevenlabs_api_key;

    if (!userApiKey) {
      console.log('[VoiceAgents] ⚠️ User has no ElevenLabs API key configured - returning default voices');

      // Return default voices when no API key is configured
      const defaultVoices = [
        { voice_id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', category: 'premade', description: 'Mature and well-rounded voice' },
        { voice_id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', category: 'premade', description: 'Calm and pleasant voice' },
        { voice_id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', category: 'premade', description: 'Strong and confident voice' },
        { voice_id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', category: 'premade', description: 'Soft and gentle voice' },
        { voice_id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli', category: 'premade', description: 'Young and energetic voice' },
        { voice_id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', category: 'premade', description: 'Deep and authoritative voice' },
        { voice_id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', category: 'premade', description: 'Crisp and clear voice' },
        { voice_id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', category: 'premade', description: 'Deep and resonant voice' },
        { voice_id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam', category: 'premade', description: 'Energetic and dynamic voice' },
      ];

      return res.json({
        voices: defaultVoices,
        configured: false,
        message: 'Configure sua API key do ElevenLabs para acessar todas as vozes disponíveis.'
      });
    }

    // Fetch voices from ElevenLabs API using user's key
    const elevenLabsService = new (await import('../services/elevenlabs.service')).ElevenLabsService(userApiKey);
    const voices = await elevenLabsService.getVoices();

    console.log(`[VoiceAgents] ✅ Returned ${voices.length} voices for user ${user.id}`);

    res.json({
      voices,
      configured: true
    });
  } catch (error) {
    console.error('[VoiceAgents] ❌ Error fetching ElevenLabs voices:', error);
    next(error);
  }
});

// ─── ElevenLabs Conversational AI (ConvAI) routes ─────────────────────────────
// IMPORTANT: These must be declared BEFORE /:id to avoid route shadowing

/**
 * GET /api/voice-agents/elevenlabs/agents
 * List all Conversational AI agents in the user's ElevenLabs account.
 * These are the AI agents configured in the ElevenLabs dashboard.
 */
router.get('/elevenlabs/agents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const userResult = await query('SELECT elevenlabs_api_key FROM users WHERE id = $1', [user.id]);
    const apiKey = userResult.rows[0]?.elevenlabs_api_key;

    if (!apiKey) {
      return res.status(400).json({
        error: 'ElevenLabs API key not configured. Go to Settings to add your key.',
        agents: [],
      });
    }

    const convai = createElevenLabsConvAIService(apiKey);
    const agents = await convai.listAgents();
    console.log(`[VoiceAgents] 🤖 ElevenLabs ConvAI agents for user ${user.id}: ${agents.length} found`);
    res.json({ agents });
  } catch (error: any) {
    console.error('[VoiceAgents] ❌ Error fetching ElevenLabs agents:', error.message);
    res.status(500).json({ error: error.message || 'Failed to fetch ElevenLabs agents', agents: [] });
  }
});

/**
 * GET /api/voice-agents/elevenlabs/phone-numbers
 * List all registered SIP trunks / phone numbers in the user's ElevenLabs account.
 */
router.get('/elevenlabs/phone-numbers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const userResult = await query('SELECT elevenlabs_api_key FROM users WHERE id = $1', [user.id]);
    const apiKey = userResult.rows[0]?.elevenlabs_api_key;

    if (!apiKey) {
      return res.status(400).json({
        error: 'ElevenLabs API key not configured.',
        phone_numbers: [],
      });
    }

    const convai = createElevenLabsConvAIService(apiKey);
    const phone_numbers = await convai.listPhoneNumbers();
    console.log(`[VoiceAgents] 📞 ElevenLabs phone numbers for user ${user.id}: ${phone_numbers.length} found`);
    res.json({ phone_numbers });
  } catch (error: any) {
    console.error('[VoiceAgents] ❌ Error fetching ElevenLabs phone numbers:', error.message);
    res.status(500).json({ error: error.message || 'Failed to fetch phone numbers', phone_numbers: [] });
  }
});

/**
 * POST /api/voice-agents/elevenlabs/phone-numbers
 * Register a Wavoip SIP trunk as a phone number in ElevenLabs.
 *
 * Body: { label, phone_number, sip_host, sip_username, sip_password }
 */
router.post('/elevenlabs/phone-numbers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { label, phone_number, sip_host, sip_username, sip_password } = req.body;

    if (!phone_number || !sip_host || !sip_username || !sip_password) {
      return res.status(400).json({
        error: 'Campos obrigatórios: phone_number, sip_host, sip_username, sip_password',
      });
    }

    const userResult = await query('SELECT elevenlabs_api_key FROM users WHERE id = $1', [user.id]);
    const apiKey = userResult.rows[0]?.elevenlabs_api_key;

    if (!apiKey) {
      return res.status(400).json({ error: 'ElevenLabs API key not configured.' });
    }

    const convai = createElevenLabsConvAIService(apiKey);
    const phoneLabel = label || `Wavoip ${phone_number}`;
    const result = await convai.registerSipTrunk(phoneLabel, phone_number, {
      host: sip_host,
      username: sip_username,
      password: sip_password,
    });

    console.log(`[VoiceAgents] ✅ SIP trunk registered for user ${user.id}: ${result.phone_number_id}`);
    res.json({ success: true, phone_number: result });
  } catch (error: any) {
    console.error('[VoiceAgents] ❌ Error registering SIP trunk:', error.message);
    res.status(500).json({ error: error.message || 'Failed to register SIP trunk' });
  }
});

/**
 * DELETE /api/voice-agents/elevenlabs/phone-numbers/:phoneNumberId
 * Remove a registered phone number / SIP trunk from ElevenLabs.
 */
router.delete('/elevenlabs/phone-numbers/:phoneNumberId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { phoneNumberId } = req.params;

    const userResult = await query('SELECT elevenlabs_api_key FROM users WHERE id = $1', [user.id]);
    const apiKey = userResult.rows[0]?.elevenlabs_api_key;

    if (!apiKey) {
      return res.status(400).json({ error: 'ElevenLabs API key not configured.' });
    }

    const convai = createElevenLabsConvAIService(apiKey);
    await convai.deletePhoneNumber(phoneNumberId);

    console.log(`[VoiceAgents] ✅ Phone number ${phoneNumberId} deleted for user ${user.id}`);
    res.json({ success: true });
  } catch (error: any) {
    console.error('[VoiceAgents] ❌ Error deleting phone number:', error.message);
    res.status(500).json({ error: error.message || 'Failed to delete phone number' });
  }
});

/**
 * GET /api/voice-agents/conversations/:conversationId
 * Get the status and transcript of an active or completed AI call.
 */
router.get('/conversations/:conversationId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { conversationId } = req.params;

    const userResult = await query('SELECT elevenlabs_api_key FROM users WHERE id = $1', [user.id]);
    const apiKey = userResult.rows[0]?.elevenlabs_api_key;

    if (!apiKey) {
      return res.status(400).json({ error: 'ElevenLabs API key not configured.' });
    }

    const convai = createElevenLabsConvAIService(apiKey);
    const conversation = await convai.getConversation(conversationId);
    res.json(conversation);
  } catch (error: any) {
    console.error('[VoiceAgents] ❌ Error fetching conversation:', error.message);
    res.status(500).json({ error: error.message || 'Failed to fetch conversation' });
  }
});

// ─── End of ConvAI routes ──────────────────────────────────────────────────────

/**
 * GET /api/voice-agents/:id
 * Get a specific voice agent by ID
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;

    const result = await query(
      `SELECT * FROM voice_agents WHERE id = $1 AND user_id = $2`,
      [id, user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Voice agent not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/voice-agents
 * Create a new voice agent
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const {
      name,
      description,
      voice_provider, // 'elevenlabs' or 'custom'
      voice_config, // JSON with voice settings (voice_id, model, etc)
      call_provider, // 'wavoip' or 'custom'
      call_config, // JSON with call settings (api_key, from_number, etc)
      greeting_message,
      instructions,
      language = 'pt-BR',
    } = req.body;

    // Validations
    if (!name || !voice_provider || !call_provider) {
      return res.status(400).json({ 
        error: 'Missing required fields: name, voice_provider, call_provider' 
      });
    }

    const result = await query(
      `INSERT INTO voice_agents (
        user_id,
        name,
        description,
        voice_provider,
        voice_config,
        call_provider,
        call_config,
        greeting_message,
        instructions,
        language,
        is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        user.id,
        name,
        description || null,
        voice_provider,
        JSON.stringify(voice_config || {}),
        call_provider,
        JSON.stringify(call_config || {}),
        greeting_message || null,
        instructions || null,
        language,
        true
      ]
    );

    console.log(`[VoiceAgents] ✅ Voice agent created: ${name} (${result.rows[0].id})`);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/voice-agents/:id
 * Update a voice agent
 */
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const {
      name,
      description,
      voice_provider,
      voice_config,
      call_provider,
      call_config,
      greeting_message,
      instructions,
      language,
      is_active
    } = req.body;

    // Check ownership
    const checkResult = await query(
      'SELECT id FROM voice_agents WHERE id = $1 AND user_id = $2',
      [id, user.id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Voice agent not found' });
    }

    const result = await query(
      `UPDATE voice_agents SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        voice_provider = COALESCE($3, voice_provider),
        voice_config = COALESCE($4, voice_config),
        call_provider = COALESCE($5, call_provider),
        call_config = COALESCE($6, call_config),
        greeting_message = COALESCE($7, greeting_message),
        instructions = COALESCE($8, instructions),
        language = COALESCE($9, language),
        is_active = COALESCE($10, is_active),
        updated_at = NOW()
      WHERE id = $11 AND user_id = $12
      RETURNING *`,
      [
        name,
        description,
        voice_provider,
        voice_config ? JSON.stringify(voice_config) : null,
        call_provider,
        call_config ? JSON.stringify(call_config) : null,
        greeting_message,
        instructions,
        language,
        is_active,
        id,
        user.id
      ]
    );

    console.log(`[VoiceAgents] ✅ Voice agent updated: ${id}`);
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/voice-agents/:id
 * Delete a voice agent
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;

    const result = await query(
      'DELETE FROM voice_agents WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Voice agent not found' });
    }

    console.log(`[VoiceAgents] ✅ Voice agent deleted: ${id}`);
    res.json({ success: true, id });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/voice-agents/:id/toggle
 * Toggle voice agent active status
 */
router.post('/:id/toggle', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const { is_active } = req.body;

    const result = await query(
      `UPDATE voice_agents 
      SET is_active = $1, updated_at = NOW()
      WHERE id = $2 AND user_id = $3
      RETURNING *`,
      [is_active, id, user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Voice agent not found' });
    }

    console.log(`[VoiceAgents] ✅ Voice agent toggled: ${id} (${is_active})`);
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/voice-agents/:id/test-call
 * Test a voice agent by making a test call
 */
router.post('/:id/test-call', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const { phone_number } = req.body;

    if (!phone_number) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    // Validate phone number format (E.164)
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    if (!e164Regex.test(phone_number)) {
      return res.status(400).json({ 
        error: `Invalid phone number format. Use E.164 format: +CCNNNNNNNNN (e.g., +5511999999999). Got: ${phone_number}` 
      });
    }

    // Get voice agent
    const agentResult = await query(
      'SELECT * FROM voice_agents WHERE id = $1 AND user_id = $2',
      [id, user.id]
    );

    if (agentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Voice agent not found' });
    }

    const agent = agentResult.rows[0];
    const callConfig = typeof agent.call_config === 'string' 
      ? JSON.parse(agent.call_config) 
      : agent.call_config;

    // Validate that the Wavoip token is configured
    if (!callConfig.api_key) {
      return res.status(400).json({
        error: 'Token Wavoip não configurado para este agente. Configure o campo "API Key / Token" nas configurações do agente.'
      });
    }

    // Create Wavoip service with agent's token
    const wavoipService = createWavoipService(callConfig.api_key);

    const contactName = `Teste — ${agent.name}`;

    console.log(`[VoiceAgents] 🔗 Generating Wavoip Click to Call URL for agent ${agent.name} (${id})`);
    console.log(`[VoiceAgents] 📞 Destination: ${phone_number}`);

    // Generate Click to Call URL (no server-side HTTP call — Wavoip uses browser webphone)
    const callResult = wavoipService.generateClickToCallUrl(phone_number, contactName);

    // Save call record to database
    try {
      await query(
        `INSERT INTO voice_agent_calls (
          voice_agent_id,
          user_id,
          phone_number,
          direction,
          status,
          call_provider_id,
          metadata,
          started_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          id,
          user.id,
          phone_number,
          'outbound',
          'initiated',
          `click_to_call_${Date.now()}`,
          JSON.stringify({
            test_call: true,
            type: 'click_to_call',
            call_url: callResult.call_url,
          }),
          new Date().toISOString()
        ]
      );
    } catch (dbError) {
      console.error('[VoiceAgents] ❌ Error saving call record:', dbError);
    }

    console.log(`[VoiceAgents] ✅ Click to Call URL generated: ${callResult.call_url}`);

    res.json({
      success: true,
      type: 'click_to_call',
      call_url: callResult.call_url,
      message: 'URL de chamada gerada. Abrindo webphone Wavoip...',
      agent_id: id,
      phone_number,
    });
  } catch (error) {
    console.error('[VoiceAgents] ❌ Error in test call:', error);
    next(error);
  }
});

/**
 * POST /api/voice-agents/:id/call
 * Start an outbound AI call using ElevenLabs Conversational AI + Wavoip SIP.
 *
 * Requires the agent to have call_config.elevenlabs_agent_id and
 * call_config.phone_number_id configured.
 *
 * Body: { phone_number }
 */
router.post('/:id/call', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const { phone_number } = req.body;

    if (!phone_number) {
      return res.status(400).json({ error: 'phone_number is required' });
    }

    const e164Regex = /^\+[1-9]\d{1,14}$/;
    if (!e164Regex.test(phone_number)) {
      return res.status(400).json({
        error: `Formato inválido. Use E.164: +5511999999999. Recebido: ${phone_number}`,
      });
    }

    // Get agent and user's ElevenLabs key
    const [agentResult, userResult] = await Promise.all([
      query('SELECT * FROM voice_agents WHERE id = $1 AND user_id = $2', [id, user.id]),
      query('SELECT elevenlabs_api_key FROM users WHERE id = $1', [user.id]),
    ]);

    if (agentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Voice agent not found' });
    }

    const agent = agentResult.rows[0];
    const callConfig = typeof agent.call_config === 'string'
      ? JSON.parse(agent.call_config)
      : (agent.call_config || {});

    const elevenlabsAgentId: string = callConfig.elevenlabs_agent_id;
    const phoneNumberId: string = callConfig.phone_number_id;

    if (!elevenlabsAgentId) {
      return res.status(400).json({
        error: 'Este agente não tem um ElevenLabs Agent ID configurado. Edite o agente e selecione um agente ConvAI.',
      });
    }
    if (!phoneNumberId) {
      return res.status(400).json({
        error: 'Este agente não tem um número de saída configurado. Edite o agente e selecione o número SIP registrado.',
      });
    }

    const apiKey = userResult.rows[0]?.elevenlabs_api_key;
    if (!apiKey) {
      return res.status(400).json({
        error: 'ElevenLabs API key não configurada. Vá em Configurações e adicione sua chave.',
      });
    }

    console.log(`[VoiceAgents] 📞 Starting AI call for agent ${agent.name} → ${phone_number}`);

    const convai = createElevenLabsConvAIService(apiKey);
    const callResult = await convai.initiateOutboundCall(elevenlabsAgentId, phoneNumberId, phone_number);

    // Save call record
    try {
      await query(
        `INSERT INTO voice_agent_calls (
          voice_agent_id, user_id, phone_number, direction, status,
          call_provider_id, voice_provider_id, metadata, started_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          id,
          user.id,
          phone_number,
          'outbound',
          'initiated',
          callResult.conversation_id,
          elevenlabsAgentId,
          JSON.stringify({
            type: 'elevenlabs_convai',
            conversation_id: callResult.conversation_id,
            elevenlabs_agent_id: elevenlabsAgentId,
            phone_number_id: phoneNumberId,
          }),
          new Date().toISOString(),
        ],
      );
    } catch (dbError) {
      console.error('[VoiceAgents] ❌ Error saving call record:', dbError);
    }

    console.log(`[VoiceAgents] ✅ AI call initiated: conversation_id=${callResult.conversation_id}`);

    res.json({
      success: true,
      type: 'elevenlabs_convai',
      conversation_id: callResult.conversation_id,
      message: 'Chamada AI iniciada com sucesso via ElevenLabs + Wavoip',
      agent_id: id,
      phone_number,
    });
  } catch (error: any) {
    console.error('[VoiceAgents] ❌ Error starting AI call:', error.message);
    res.status(500).json({ error: error.message || 'Erro ao iniciar chamada AI' });
  }
});

/**
 * GET /api/voice-agents/:id/call-config
 * Returns agent config needed for the AI call popup (token, voice, greeting, instructions)
 */
router.get('/:id/call-config', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;

    const agentResult = await query(
      'SELECT * FROM voice_agents WHERE id = $1 AND user_id = $2',
      [id, user.id]
    );

    if (agentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Voice agent not found' });
    }

    const agent = agentResult.rows[0];
    const callConfig = typeof agent.call_config === 'string'
      ? JSON.parse(agent.call_config) : agent.call_config || {};
    const voiceConfig = typeof agent.voice_config === 'string'
      ? JSON.parse(agent.voice_config) : agent.voice_config || {};

    // Get user's API keys (needed by popup for TTS/STT/AI calls)
    const userResult = await query(
      'SELECT elevenlabs_api_key, openai_api_key, anthropic_api_key, google_api_key, preferred_ai_model FROM users WHERE id = $1',
      [user.id]
    );
    const userSettings = userResult.rows[0] || {};

    res.json({
      agent_id: agent.id,
      name: agent.name,
      wavoip_token: callConfig.api_key || '',
      voice_provider: agent.voice_provider,
      voice_config: voiceConfig,
      greeting_message: agent.greeting_message || '',
      instructions: agent.instructions || '',
      language: agent.language || 'pt-BR',
      elevenlabs_configured: !!userSettings.elevenlabs_api_key,
      openai_configured: !!userSettings.openai_api_key,
      preferred_ai_model: userSettings.preferred_ai_model || 'openai',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/voice-agents/:id/tts
 * Generate TTS audio using ElevenLabs (returns base64 mp3)
 * Body: { text: string }
 */
router.post('/:id/tts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const { text } = req.body;

    if (!text?.trim()) {
      return res.status(400).json({ error: 'text is required' });
    }

    // Get agent voice config
    const agentResult = await query(
      'SELECT voice_config FROM voice_agents WHERE id = $1 AND user_id = $2',
      [id, user.id]
    );

    if (agentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Voice agent not found' });
    }

    const voiceConfig = typeof agentResult.rows[0].voice_config === 'string'
      ? JSON.parse(agentResult.rows[0].voice_config)
      : agentResult.rows[0].voice_config || {};

    // Get user's ElevenLabs API key
    const userResult = await query(
      'SELECT elevenlabs_api_key FROM users WHERE id = $1',
      [user.id]
    );
    const elevenLabsApiKey = userResult.rows[0]?.elevenlabs_api_key;

    if (!elevenLabsApiKey) {
      return res.status(400).json({ error: 'ElevenLabs API key not configured' });
    }

    const ttsService = new ElevenLabsService(elevenLabsApiKey);
    const audioBuffer = await ttsService.textToSpeech({
      text,
      voice_id: voiceConfig.voice_id || 'ErXwobaYiN019PkySvjV',
      model_id: voiceConfig.model || 'eleven_monolingual_v1',
      voice_settings: voiceConfig.stability != null ? {
        stability: voiceConfig.stability,
        similarity_boost: voiceConfig.similarity_boost ?? 0.75,
      } : undefined,
    });

    if (!audioBuffer) {
      return res.status(500).json({ error: 'Failed to generate TTS audio' });
    }

    res.json({
      audio_base64: audioBuffer.toString('base64'),
      content_type: 'audio/mpeg',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/voice-agents/:id/stt
 * Transcribe audio using OpenAI Whisper
 * Body: { audio_base64: string, sample_rate: number }
 */
router.post('/:id/stt', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const { audio_base64, sample_rate = 8000 } = req.body;

    if (!audio_base64) {
      return res.status(400).json({ error: 'audio_base64 is required' });
    }

    // Get agent language and user's OpenAI key
    const agentResult = await query(
      'SELECT language FROM voice_agents WHERE id = $1 AND user_id = $2',
      [id, user.id]
    );

    if (agentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Voice agent not found' });
    }

    const language = (agentResult.rows[0].language || 'pt-BR').split('-')[0]; // 'pt-BR' -> 'pt'

    const userResult = await query(
      'SELECT openai_api_key FROM users WHERE id = $1',
      [user.id]
    );
    const openaiApiKey = userResult.rows[0]?.openai_api_key;

    if (!openaiApiKey) {
      return res.status(400).json({ error: 'OpenAI API key not configured for STT' });
    }

    // Decode base64 WAV audio
    const wavBuffer = Buffer.from(audio_base64, 'base64');

    // Send to OpenAI Whisper
    const formData = new FormData();
    formData.append('file', new Blob([wavBuffer], { type: 'audio/wav' }), 'audio.wav');
    formData.append('model', 'whisper-1');
    formData.append('language', language);

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiApiKey}` },
      body: formData,
    });

    if (!whisperRes.ok) {
      const errText = await whisperRes.text();
      console.error('[VoiceAgents] Whisper error:', errText);
      return res.status(500).json({ error: 'STT failed', details: errText });
    }

    const whisperData = await whisperRes.json() as { text: string };
    console.log(`[VoiceAgents] 🎙️ STT result: "${whisperData.text}"`);

    res.json({ text: whisperData.text || '' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/voice-agents/:id/ai-respond
 * Get AI response for the voice agent conversation
 * Body: { history: [{role: string, content: string}][] }
 */
router.post('/:id/ai-respond', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const { history } = req.body;

    if (!Array.isArray(history)) {
      return res.status(400).json({ error: 'history array is required' });
    }

    // Get agent instructions and user's AI keys
    const agentResult = await query(
      'SELECT instructions, language FROM voice_agents WHERE id = $1 AND user_id = $2',
      [id, user.id]
    );

    if (agentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Voice agent not found' });
    }

    const agent = agentResult.rows[0];

    const userResult = await query(
      'SELECT openai_api_key, anthropic_api_key, google_api_key, preferred_ai_model FROM users WHERE id = $1',
      [user.id]
    );
    const userSettings = userResult.rows[0] || {};

    // Pick the best available AI provider
    let apiKey: string | null = null;
    let provider: 'openai' | 'gemini' = 'openai';

    if (userSettings.openai_api_key) {
      apiKey = userSettings.openai_api_key;
      provider = 'openai';
    } else if (userSettings.google_api_key) {
      apiKey = userSettings.google_api_key;
      provider = 'gemini';
    }

    if (!apiKey) {
      return res.status(400).json({ error: 'No AI API key configured (OpenAI or Google)' });
    }

    const aiService = new AIService();

    // Build messages: system prompt + conversation history
    const systemPrompt = agent.instructions
      ? `${agent.instructions}\n\nResponda de forma concisa e natural, como em uma conversa por telefone. Língua: ${agent.language || 'pt-BR'}.`
      : `Você é um assistente de voz prestativo. Responda de forma concisa e natural, como em uma conversa por telefone. Língua: ${agent.language || 'pt-BR'}.`;

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...history.map((m: any) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    const aiResponse = await aiService.generateResponse(messages, provider, apiKey);

    console.log(`[VoiceAgents] 🤖 AI response: "${aiResponse.content.substring(0, 80)}..."`);

    res.json({ text: aiResponse.content });
  } catch (error) {
    next(error);
  }
});

export default router;
