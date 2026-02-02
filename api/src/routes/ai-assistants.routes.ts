// INBOX: Rotas para gerenciar assistentes virtuais de IA
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { AIAssistantsService } from '../services/ai-assistants.service';

const router = Router();
const aiAssistantsService = new AIAssistantsService();

router.use(authMiddleware);

// GET /api/ai-assistants - Lista todos os assistentes do usuário
router.get('/', async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const assistants = await aiAssistantsService.findAll(user.id);
        res.json(assistants);
    } catch (error) {
        next(error);
    }
});

// GET /api/ai-assistants/:id - Busca assistente por ID
router.get('/:id', async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const assistant = await aiAssistantsService.findById(req.params.id, user.id);
        if (!assistant) {
            return res.status(404).json({ error: 'AI Assistant not found' });
        }

        res.json(assistant);
    } catch (error) {
        next(error);
    }
});

// POST /api/ai-assistants - Cria novo assistente
router.post('/', async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { name, mode, channel_id, webhook_url, webhook_headers, llm_provider, llm_api_key, llm_model, llm_system_prompt, settings } = req.body;

        // Validações
        if (!name || !mode) {
            return res.status(400).json({ error: 'Name and mode are required' });
        }

        if (!['webhook', 'llm'].includes(mode)) {
            return res.status(400).json({ error: 'Mode must be either "webhook" or "llm"' });
        }

        if (mode === 'webhook' && !webhook_url) {
            return res.status(400).json({ error: 'webhook_url is required for webhook mode' });
        }

        if (mode === 'llm') {
            if (!llm_provider || !llm_api_key) {
                return res.status(400).json({ error: 'llm_provider and llm_api_key are required for LLM mode' });
            }
            if (!['gemini', 'openai', 'anthropic'].includes(llm_provider)) {
                return res.status(400).json({ error: 'llm_provider must be gemini, openai, or anthropic' });
            }
        }

        const assistant = await aiAssistantsService.create({
            name,
            mode,
            channel_id: channel_id || null,
            webhook_url,
            webhook_headers,
            llm_provider,
            llm_api_key,
            llm_model,
            llm_system_prompt,
            settings: settings || { enabled: true, auto_respond: false }
        }, user.id);

        res.status(201).json(assistant);
    } catch (error) {
        next(error);
    }
});

// PUT /api/ai-assistants/:id - Atualiza assistente
router.put('/:id', async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const assistant = await aiAssistantsService.update(req.params.id, req.body, user.id);
        if (!assistant) {
            return res.status(404).json({ error: 'AI Assistant not found' });
        }

        res.json(assistant);
    } catch (error) {
        next(error);
    }
});

// DELETE /api/ai-assistants/:id - Remove assistente
router.delete('/:id', async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const deleted = await aiAssistantsService.delete(req.params.id, user.id);
        if (!deleted) {
            return res.status(404).json({ error: 'AI Assistant not found' });
        }

        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

// POST /api/ai-assistants/:id/toggle - Ativa/desativa assistente
router.post('/:id/toggle', async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { is_active } = req.body;
        if (typeof is_active !== 'boolean') {
            return res.status(400).json({ error: 'is_active must be a boolean' });
        }

        await aiAssistantsService.toggleActive(req.params.id, is_active, user.id);
        res.json({ success: true, is_active });
    } catch (error) {
        next(error);
    }
});

export default router;
