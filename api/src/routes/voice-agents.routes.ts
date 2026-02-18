import { Router, Request, Response, NextFunction } from 'express';
import { query } from '../database/connection';
import { authMiddleware } from '../middleware/auth.middleware';
import { elevenLabsService } from '../services/elevenlabs.service';
import { createWavoipService } from '../services/wavoip.service';

const router = Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

/**
 * GET /api/voice-agents/settings
 * Get user's voice agent settings (API keys, etc)
 */
router.get('/settings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const result = await query(
      'SELECT elevenlabs_api_key, voice_settings FROM users WHERE id = $1',
      [user.id]
    );

    const settings = result.rows[0] || {};

    // Don't expose the full API key for security
    res.json({
      elevenlabs_configured: !!settings.elevenlabs_api_key,
      elevenlabs_api_key_preview: settings.elevenlabs_api_key 
        ? `${settings.elevenlabs_api_key.substring(0, 8)}...` 
        : null,
      voice_settings: settings.voice_settings || {}
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/voice-agents/settings
 * Update user's voice agent settings
 */
router.put('/settings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { elevenlabs_api_key, voice_settings } = req.body;

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (elevenlabs_api_key !== undefined) {
      updates.push(`elevenlabs_api_key = $${paramIndex++}`);
      values.push(elevenlabs_api_key || null);
    }

    if (voice_settings !== undefined) {
      updates.push(`voice_settings = $${paramIndex++}`);
      values.push(JSON.stringify(voice_settings));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No settings to update' });
    }

    values.push(user.id);

    await query(
      `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex}`,
      values
    );

    console.log(`[VoiceAgents] ✅ Settings updated for user ${user.id}`);

    res.json({ 
      success: true,
      message: 'Configurações atualizadas com sucesso'
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

    // Validate configuration
    if (!callConfig.api_key) {
      return res.status(400).json({ 
        error: 'Wavoip API key not configured for this agent' 
      });
    }

    if (!callConfig.phone_number) {
      return res.status(400).json({ 
        error: 'Origin phone number not configured for this agent' 
      });
    }

    // Create Wavoip service with agent's API key
    const wavoipService = createWavoipService(callConfig.api_key);

    // Make the call
    const greeting = agent.greeting_message || 
      `Olá! Este é um teste do agente de voz ${agent.name}. Esta chamada foi iniciada automaticamente.`;

    console.log(`[VoiceAgents] 🧪 Initiating test call for agent ${agent.name} (${id})`);
    console.log(`[VoiceAgents] 📞 From: ${callConfig.phone_number} To: ${phone_number}`);

    const callResult = await wavoipService.makeTestCall(
      callConfig.phone_number,
      phone_number,
      greeting
    );

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
          callResult.status,
          callResult.call_id,
          JSON.stringify({
            test_call: true,
            greeting_message: greeting,
            wavoip_response: callResult
          }),
          callResult.started_at || new Date().toISOString()
        ]
      );
    } catch (dbError) {
      console.error('[VoiceAgents] ❌ Error saving call record:', dbError);
    }

    if (callResult.status === 'failed') {
      return res.status(500).json({ 
        success: false,
        error: callResult.error || 'Failed to initiate call',
        agent_id: id,
        phone_number 
      });
    }

    console.log(`[VoiceAgents] ✅ Test call initiated: ${callResult.call_id}`);

    res.json({ 
      success: true, 
      message: 'Test call initiated successfully',
      agent_id: id,
      phone_number,
      call_id: callResult.call_id,
      status: callResult.status
    });
  } catch (error) {
    console.error('[VoiceAgents] ❌ Error in test call:', error);
    next(error);
  }
});

/**
 * GET /api/voice-agents/providers/elevenlabs/voices
 * Get available ElevenLabs voices using user's API key
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

export default router;
