// INBOX: Rotas para gerenciar canais de comunicação
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { ChannelsService } from '../services/channels.service';
import { WhatsAppService } from '../services/whatsapp.service';

const router = Router();
const channelsService = new ChannelsService();
const whatsappService = new WhatsAppService();

router.use(authMiddleware);

// GET /api/channels - Lista todos os canais do usuário
router.get('/', async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const channels = await channelsService.findAll(user.id);
        res.json(channels);
    } catch (error) {
        next(error);
    }
});

// GET /api/channels/:id - Busca canal por ID
router.get('/:id', async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const channel = await channelsService.findById(req.params.id, user.id);
        if (!channel) {
            return res.status(404).json({ error: 'Channel not found' });
        }

        res.json(channel);
    } catch (error) {
        next(error);
    }
});

// POST /api/channels - Cria novo canal
router.post('/', async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { type, name, credentials, settings, status: requestedStatus, provider } = req.body;

        if (!type || !name) {
            return res.status(400).json({ error: 'Type and name are required' });
        }

        // Para WhatsApp, validar credenciais
        if (type === 'whatsapp') {
            const instanceId = credentials?.instance_id || credentials?.instance_name;
            if (!instanceId) {
                return res.status(400).json({ error: 'instance_id (or instance_name) is required for WhatsApp channels' });
            }
            // Normalize credentials to include instance_id
            credentials.instance_id = instanceId;

            // Verificar se já existe canal com esse instance_id
            const existing = await channelsService.findByInstanceId(credentials.instance_id, user.id);
            if (existing) {
                // Se já existe, atualizar status para active e retornar
                const updated = await channelsService.update(existing.id, {
                    status: requestedStatus || 'active',
                    credentials
                }, user.id);
                return res.status(200).json(updated);
            }

            // Se o frontend já disse que está 'active', confiar nisso
            // O frontend só envia 'active' após confirmar conexão via polling
            let finalStatus = requestedStatus || 'active';

            // Opcionalmente verificar status da instância no Evolution API (mas não sobrescrever)
            if (!requestedStatus && whatsappService.isReady()) {
                try {
                    const status = await whatsappService.getStatus(credentials.instance_id) as any;
                    const isConnected = status.state === 'open' || status.connected === true;
                    finalStatus = isConnected ? 'active' : 'inactive';
                    credentials.phone_number = status.instance?.profileName || status.profileName || null;
                } catch (error) {
                    console.error('[Channels] Error checking WhatsApp status:', error);
                    // Se não conseguir verificar, assumir active (frontend já validou)
                    finalStatus = 'active';
                }
            }

            const channel = await channelsService.create({
                type,
                name,
                status: finalStatus,
                credentials,
                settings: settings || {}
            }, user.id);

            console.log(`[Channels] WhatsApp channel created: ${channel.id} with status: ${finalStatus}`);
            return res.status(201).json(channel);
        }

        const channel = await channelsService.create({
            type,
            name,
            status: 'inactive',
            credentials: credentials || {},
            settings: settings || {}
        }, user.id);

        res.status(201).json(channel);
    } catch (error) {
        next(error);
    }
});

// PUT /api/channels/:id - Atualiza canal
router.put('/:id', async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const channel = await channelsService.update(req.params.id, req.body, user.id);
        if (!channel) {
            return res.status(404).json({ error: 'Channel not found' });
        }

        res.json(channel);
    } catch (error) {
        next(error);
    }
});

// DELETE /api/channels/:id - Remove canal
router.delete('/:id', async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const deleted = await channelsService.delete(req.params.id, user.id);
        if (!deleted) {
            return res.status(404).json({ error: 'Channel not found' });
        }

        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

// POST /api/channels/:id/sync - Sincroniza status do canal
router.post('/:id/sync', async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const channel = await channelsService.findById(req.params.id, user.id);
        if (!channel) {
            return res.status(404).json({ error: 'Channel not found' });
        }

        // Para WhatsApp, verificar status no Evolution API
        if (channel.type === 'whatsapp' && whatsappService.isReady()) {
            try {
                const instanceId = channel.credentials?.instance_id;
                if (instanceId) {
                    const status = await whatsappService.getStatus(instanceId) as any;
                    const isConnected = status.state === 'open' || status.connectionStatus === 'open';

                    await channelsService.updateStatus(
                        channel.id,
                        isConnected ? 'active' : 'inactive',
                        user.id
                    );

                    await channelsService.updateLastSync(channel.id, user.id);

                    return res.json({
                        success: true,
                        status: isConnected ? 'active' : 'inactive',
                        synced_at: new Date().toISOString()
                    });
                }
            } catch (error) {
                console.error('[Channels] Error syncing WhatsApp status:', error);
                await channelsService.updateStatus(channel.id, 'error', user.id);
                return res.status(500).json({ error: 'Failed to sync channel status' });
            }
        }

        res.json({ success: true, message: 'Sync not available for this channel type' });
    } catch (error) {
        next(error);
    }
});

export default router;
