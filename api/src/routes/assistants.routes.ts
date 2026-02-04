// Rotas para gerenciar assistentes do marketplace
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { AssistantsService } from '../services/assistants.service';

const router = Router();
const assistantsService = new AssistantsService();

// GET /api/assistants/available - Lista assistentes disponíveis no marketplace (público)
router.get('/available', async (_req, res) => {
    try {
        const assistants = await assistantsService.findAllAvailable();
        res.json(assistants);
    } catch (error: any) {
        console.error('[Assistants] Error fetching available assistants:', error.message);
        // Se a tabela não existir, retornar array vazio em vez de erro
        if (error.code === '42P01') { // relation does not exist
            return res.json([]);
        }
        res.status(500).json({ error: 'Erro ao buscar assistentes', details: error.message });
    }
});

// GET /api/assistants/slug/:slug - Busca assistente por slug (público)
router.get('/slug/:slug', async (req, res, next) => {
    try {
        const assistant = await assistantsService.findBySlug(req.params.slug);
        if (!assistant) {
            return res.status(404).json({ error: 'Assistente não encontrado' });
        }
        res.json(assistant);
    } catch (error) {
        next(error);
    }
});

// Rotas autenticadas
router.use(authMiddleware);

// GET /api/assistants - Lista assistentes conectados do usuário
router.get('/', async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const userAssistants = await assistantsService.findUserAssistants(user.id);
        res.json(userAssistants);
    } catch (error: any) {
        console.error('[Assistants] Error fetching user assistants:', error.message);
        if (error.code === '42P01') {
            return res.json([]);
        }
        res.status(500).json({ error: 'Erro ao buscar assistentes', details: error.message });
    }
});

// GET /api/assistants/:id - Busca assistente conectado por ID
router.get('/:id', async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const userAssistant = await assistantsService.findUserAssistantById(req.params.id, user.id);
        if (!userAssistant) {
            return res.status(404).json({ error: 'Assistente não encontrado' });
        }

        res.json(userAssistant);
    } catch (error) {
        next(error);
    }
});

// POST /api/assistants/connect - Conecta um assistente
router.post('/connect', async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { assistantId, channelId } = req.body;

        if (!assistantId) {
            return res.status(400).json({ error: 'assistantId é obrigatório' });
        }

        const userAssistant = await assistantsService.connectAssistant(assistantId, user.id, channelId);
        res.status(201).json(userAssistant);
    } catch (error: any) {
        if (error.message === 'Assistente não encontrado') {
            return res.status(404).json({ error: error.message });
        }
        if (error.message === 'Assistente já está conectado') {
            return res.status(409).json({ error: error.message });
        }
        next(error);
    }
});

// POST /api/assistants/:id/disconnect - Desconecta um assistente
router.post('/:id/disconnect', async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const deleted = await assistantsService.disconnectAssistant(req.params.id, user.id);
        if (!deleted) {
            return res.status(404).json({ error: 'Assistente não encontrado' });
        }

        res.json({ success: true, message: 'Assistente desconectado com sucesso' });
    } catch (error) {
        next(error);
    }
});

// PUT /api/assistants/:id/configure - Atualiza configuração do assistente
router.put('/:id/configure', async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { config, channelId } = req.body;

        if (!config) {
            return res.status(400).json({ error: 'config é obrigatório' });
        }

        const userAssistant = await assistantsService.updateConfiguration(
            req.params.id,
            user.id,
            config,
            channelId
        );

        if (!userAssistant) {
            return res.status(404).json({ error: 'Assistente não encontrado' });
        }

        res.json(userAssistant);
    } catch (error) {
        next(error);
    }
});

// POST /api/assistants/:id/toggle - Ativa/desativa assistente
router.post('/:id/toggle', async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { is_active } = req.body;
        if (typeof is_active !== 'boolean') {
            return res.status(400).json({ error: 'is_active deve ser boolean' });
        }

        const success = await assistantsService.toggleActive(req.params.id, user.id, is_active);
        if (!success) {
            return res.status(404).json({ error: 'Assistente não encontrado' });
        }

        res.json({ success: true, is_active });
    } catch (error) {
        next(error);
    }
});

// GET /api/assistants/:id/logs - Busca logs do assistente
router.get('/:id/logs', async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const limit = parseInt(req.query.limit as string) || 50;
        const logs = await assistantsService.getLogs(req.params.id, user.id, limit);
        res.json(logs);
    } catch (error) {
        next(error);
    }
});

// POST /api/assistants/:id/log - Registra log de conversa (para uso interno/webhook)
router.post('/:id/log', async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // Verificar se o assistente pertence ao usuário
        const userAssistant = await assistantsService.findUserAssistantById(req.params.id, user.id);
        if (!userAssistant) {
            return res.status(404).json({ error: 'Assistente não encontrado' });
        }

        const log = await assistantsService.logConversation({
            user_assistant_id: req.params.id,
            ...req.body
        });

        res.status(201).json(log);
    } catch (error) {
        next(error);
    }
});

export default router;
