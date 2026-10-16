// Rotas para gerenciar assistentes do marketplace
import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.middleware';
import { AssistantsService } from '../services/assistants.service';
import { AIService } from '../services/ai.service';
import { getStorageService } from '../services/storage.service';

const router = Router();
const assistantsService = new AssistantsService();

// Upload de base de conhecimento — limite 5MB
const KB_MAX_BYTES = 5 * 1024 * 1024; // 5MB
const kbUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: KB_MAX_BYTES } });

function isKnowledgeFileAllowed(file: Express.Multer.File): boolean {
    const name = (file.originalname || '').toLowerCase();
    const allowedExt = /\.(pdf|xlsx|xls|csv|txt|docx|doc)$/.test(name);
    const mime = (file.mimetype || '').toLowerCase();
    const allowedMime = /pdf|spreadsheet|excel|csv|text\/|word|document/.test(mime);
    return allowedExt || allowedMime;
}

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

// GET /api/assistants/elevenlabs-voices - Retorna vozes disponíveis da ElevenLabs
router.get('/elevenlabs-voices', authMiddleware, async (_req, res) => {
    try {
        const apiKey = process.env.ELEVENLABS_API_KEY;
        if (!apiKey) {
            // Retornar vozes padrão se chave não configurada
            return res.json({ voices: [
                { voice_id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah (Feminina)' },
                { voice_id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam (Masculino)' },
                { voice_id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli (Feminina)' },
                { voice_id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold (Masculino)' },
                { voice_id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh (Masculino)' },
                { voice_id: 'ErXwobaYiN019PkySvjV', name: 'Antoni (Masculino)' },
            ]});
        }

        const response = await fetch('https://api.elevenlabs.io/v1/voices', {
            headers: { 'xi-api-key': apiKey }
        });

        if (!response.ok) {
            throw new Error(`ElevenLabs API error: ${response.status}`);
        }

        const data: any = await response.json();
        const voices = (data.voices || []).map((v: any) => ({
            voice_id: v.voice_id,
            name: v.name,
            category: v.category,
            labels: v.labels,
            preview_url: v.preview_url,
        }));

        res.json({ voices });
    } catch (error: any) {
        console.error('[Assistants] Erro ao buscar vozes ElevenLabs:', error.message);
        // Fallback com vozes padrão em caso de erro
        res.json({ voices: [
            { voice_id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah (Feminina)' },
            { voice_id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam (Masculino)' },
            { voice_id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli (Feminina)' },
            { voice_id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold (Masculino)' },
        ]});
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

// POST /api/assistants/connect - Conecta um assistente (ou atualiza canais se já existe)
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

// ── Base de Conhecimento ──────────────────────────────────────────────────────

// POST /api/assistants/:id/knowledge - Faz upload de um documento (PDF/Excel/CSV/TXT/DOCX)
router.post('/:id/knowledge', kbUpload.single('file'), async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const file = req.file;
        if (!file) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado' });
        }
        if (file.size > KB_MAX_BYTES) {
            return res.status(400).json({ error: 'O arquivo excede o limite de 5MB' });
        }
        if (!isKnowledgeFileAllowed(file)) {
            return res.status(400).json({ error: 'Formato não suportado. Envie PDF, Excel (XLSX), CSV, TXT ou DOCX.' });
        }

        // Categoria do documento: 'rag' (base de conhecimento) ou 'client' (arquivo para enviar ao cliente)
        const kind = req.body?.kind === 'client' ? 'client' : 'rag';

        // Confirmar que o assistente pertence ao usuário
        const userAssistant = await assistantsService.findUserAssistantById(req.params.id, user.id);
        if (!userAssistant) {
            return res.status(404).json({ error: 'Assistente não encontrado' });
        }

        // Extrair o texto UMA única vez (fica cacheado no banco — não re-lê o arquivo)
        // Normalizar o MIME pela extensão: navegadores podem reportar 'application/vnd.ms-excel' para .csv, etc.
        const ext = (file.originalname.split('.').pop() || '').toLowerCase();
        const extMime: Record<string, string> = {
            pdf:  'application/pdf',
            xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            xls:  'application/vnd.ms-excel',
            csv:  'text/csv',
            txt:  'text/plain',
            docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            doc:  'application/msword',
        };
        const mimeForExtraction = extMime[ext] || file.mimetype || 'application/octet-stream';

        const aiService = new AIService();
        const base64 = file.buffer.toString('base64');
        const dataUri = `data:${mimeForExtraction};base64,${base64}`;
        const textContent = await aiService.extractDocumentText(dataUri, mimeForExtraction, process.env.GEMINI_API_KEY, 20000);

        // Guardar o arquivo original (para o assistente poder enviá-lo quando o cliente pedir)
        let storageUrl: string | null = null;
        try {
            const storageService = getStorageService();
            storageUrl = await storageService.uploadBuffer(
                file.buffer,
                file.originalname,
                file.mimetype || 'application/octet-stream',
                'knowledge-base',
                user.id
            );
        } catch (storeErr: any) {
            console.warn('[Assistants] Falha ao armazenar arquivo original (não crítico):', storeErr.message);
        }

        const kbFile = await assistantsService.addKnowledgeFile(req.params.id, user.id, {
            fileName: file.originalname,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            textContent,
            storageUrl,
            kind,
        });

        res.status(201).json(kbFile);
    } catch (error: any) {
        if (error?.name === 'MulterError') {
            return res.status(400).json({ error: 'O arquivo excede o limite de 5MB' });
        }
        if (error?.code === 'KNOWLEDGE_LIMIT_REACHED') {
            return res.status(400).json({ error: error.message });
        }
        next(error);
    }
});

// GET /api/assistants/:id/knowledge - Lista documentos da base de conhecimento
router.get('/:id/knowledge', async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const kind = (req.query.kind === 'rag' || req.query.kind === 'client') ? req.query.kind as 'rag' | 'client' : undefined;
        const files = await assistantsService.listKnowledgeFiles(req.params.id, user.id, kind);
        res.json(files);
    } catch (error) {
        next(error);
    }
});

// GET /api/assistants/:id/knowledge/:fileId/text - Retorna o texto completo extraído
router.get('/:id/knowledge/:fileId/text', async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const text = await assistantsService.getKnowledgeFileText(req.params.id, req.params.fileId, user.id);
        if (text === null) {
            return res.status(404).json({ error: 'Documento não encontrado' });
        }

        res.json({ text });
    } catch (error) {
        next(error);
    }
});

// DELETE /api/assistants/:id/knowledge/:fileId - Remove um documento da base
router.delete('/:id/knowledge/:fileId', async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const deleted = await assistantsService.deleteKnowledgeFile(req.params.id, req.params.fileId, user.id);
        if (!deleted) {
            return res.status(404).json({ error: 'Documento não encontrado' });
        }

        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

// Trata erros de upload (ex: arquivo > 5MB) de forma amigável
router.use((err: any, _req: any, res: any, next: any) => {
    if (err && err.name === 'MulterError') {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: `O arquivo excede o limite de ${KB_MAX_BYTES / 1024 / 1024}MB` });
        }
        return res.status(400).json({ error: 'Erro no upload do arquivo' });
    }
    next(err);
});

export default router;
