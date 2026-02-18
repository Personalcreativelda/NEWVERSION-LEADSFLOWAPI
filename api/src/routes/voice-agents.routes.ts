import { Router, Request, Response, NextFunction } from 'express';
import { query } from '../database/connection';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

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

    // TODO: Implement actual call logic with Wavoip
    console.log(`[VoiceAgents] 🧪 Test call requested for agent ${id} to ${phone_number}`);

    res.json({ 
      success: true, 
      message: 'Test call initiated',
      agent_id: id,
      phone_number 
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/voice-agents/providers/elevenlabs/voices
 * Get available ElevenLabs voices
 */
router.get('/providers/elevenlabs/voices', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // TODO: Fetch from ElevenLabs API
    // For now, return some common voices
    const voices = [
      { voice_id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', language: 'en' },
      { voice_id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', language: 'en' },
      { voice_id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', language: 'en' },
      { voice_id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', language: 'en' },
      { voice_id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli', language: 'en' },
      { voice_id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', language: 'en' },
      { voice_id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', language: 'en' },
      { voice_id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', language: 'en' },
      { voice_id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam', language: 'en' },
    ];

    res.json(voices);
  } catch (error) {
    next(error);
  }
});

export default router;
