// Rotas para gerenciar assistentes do marketplace
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { AssistantsService } from '../services/assistants.service';

const router = Router();
const assistantsService = new AssistantsService();

// GET /api/assistants/available - Lista assistentes disponíveis no marketplace
router.get('/available', async (req, res) => {
    try {
        // Tentar extrair userId do token se disponível
        let userId: string | undefined;
        try {
            const authHeader = req.headers.authorization;
            if (authHeader?.startsWith('Bearer ')) {
                const jwt = await import('jsonwebtoken');
                const token = authHeader.slice(7);
                const decoded = jwt.default.verify(token, process.env.JWT_SECRET || 'secret') as any;
                userId = decoded.id || decoded.userId;
            }
        } catch { /* ignore auth errors for public endpoint */ }

        const assistants = await assistantsService.findAllAvailable(userId);
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

// POST /api/assistants/create - Cria um assistente personalizado
router.post('/create', async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { name, description, short_description, icon, color, category, features, instructions, greeting } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Nome é obrigatório' });
        }

        const assistant = await assistantsService.createCustomAssistant(user.id, {
            name: name.trim(),
            description,
            short_description,
            icon,
            color,
            category,
            features,
            instructions,
            greeting
        });

        res.status(201).json(assistant);
    } catch (error: any) {
        console.error('[Assistants] Error creating assistant:', error.message, error.code, error.detail);
        res.status(500).json({
            error: 'Erro ao criar assistente',
            details: error.message,
            code: error.code,
            hint: error.hint || error.detail || null
        });
    }
});

// PUT /api/assistants/:id/edit - Atualiza um assistente personalizado
router.put('/:id/edit', async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const assistant = await assistantsService.updateCustomAssistant(req.params.id, user.id, req.body);
        if (!assistant) {
            return res.status(404).json({ error: 'Assistente não encontrado ou sem permissão' });
        }

        res.json(assistant);
    } catch (error) {
        next(error);
    }
});

// DELETE /api/assistants/:id/delete - Deleta um assistente personalizado
router.delete('/:id/delete', async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const deleted = await assistantsService.deleteCustomAssistant(req.params.id, user.id);
        if (!deleted) {
            return res.status(404).json({ error: 'Assistente não encontrado ou sem permissão' });
        }

        res.json({ success: true, message: 'Assistente deletado com sucesso' });
    } catch (error) {
        next(error);
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

        const { assistantId, channelIds } = req.body;

        if (!assistantId) {
            return res.status(400).json({ error: 'assistantId é obrigatório' });
        }

        // ✅ IMPORTANTE: Exigir seleção de pelo menos UM canal
        if (!Array.isArray(channelIds) || channelIds.length === 0) {
            return res.status(400).json({ 
                error: 'Você deve selecionar pelo menos UM canal para conectar o assistente',
                code: 'CHANNELS_REQUIRED'
            });
        }

        const userAssistant = await assistantsService.connectAssistant(
            assistantId,
            user.id,
            channelIds
        );
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

// PUT /api/assistants/:id/channels - Atualiza os canais conectados
router.put('/:id/channels', async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { channelIds } = req.body;
        if (!Array.isArray(channelIds)) {
            return res.status(400).json({ error: 'channelIds deve ser um array' });
        }

        const userAssistant = await assistantsService.updateChannels(req.params.id, user.id, channelIds);
        if (!userAssistant) {
            return res.status(404).json({ error: 'Assistente não encontrado' });
        }

        res.json(userAssistant);
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

        const { config, channelIds } = req.body;

        if (!config) {
            return res.status(400).json({ error: 'config é obrigatório' });
        }

        const userAssistant = await assistantsService.updateConfiguration(
            req.params.id,
            user.id,
            config,
            channelIds
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
