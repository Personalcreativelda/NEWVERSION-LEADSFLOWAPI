// INBOX: Rotas para gerenciar canais de comunicação
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { ChannelsService } from '../services/channels.service';
import { WhatsAppService } from '../services/whatsapp.service';

const router = Router();
const channelsService = new ChannelsService();
const whatsappService = new WhatsAppService();

// ✅ Função helper para configurar webhook automaticamente na Evolution API
async function configureWebhookForInstance(instanceId: string): Promise<void> {
    const webhookUrl = process.env.WEBHOOK_URL || process.env.API_URL || process.env.SERVICE_URL_API;
    const evolutionUrl = process.env.EVOLUTION_API_URL;
    const apiKey = process.env.EVOLUTION_API_KEY;

    if (!webhookUrl || !evolutionUrl || !apiKey) {
        console.warn('[Channels] Cannot configure webhook - missing WEBHOOK_URL, EVOLUTION_API_URL, or EVOLUTION_API_KEY');
        return;
    }

    const fullWebhookUrl = `${webhookUrl.replace(/\/$/, '')}/api/webhooks/evolution/messages`;

    console.log(`[Channels] 🔧 Auto-configuring webhook for instance: ${instanceId}`);
    console.log(`[Channels] Webhook URL: ${fullWebhookUrl}`);

    try {
        const webhookConfig = {
            url: fullWebhookUrl,
            webhook_by_events: false,
            webhook_base64: true,
            events: [
                'MESSAGES_UPSERT',
                'MESSAGES_UPDATE',
                'CONNECTION_UPDATE',
                'QRCODE_UPDATED',
            ],
        };

        const response = await fetch(`${evolutionUrl}/webhook/set/${instanceId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': apiKey,
            },
            body: JSON.stringify(webhookConfig),
        });

        if (response.ok) {
            console.log(`[Channels] ✅ Webhook configured successfully for: ${instanceId}`);
        } else {
            const errorText = await response.text();
            console.warn(`[Channels] ⚠️ Failed to configure webhook for ${instanceId}:`, errorText);
        }
    } catch (error: any) {
        console.error(`[Channels] ❌ Error configuring webhook for ${instanceId}:`, error.message);
    }
}

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
            credentials.instance_name = instanceId; // Garantir que ambos existem

            // Verificar se já existe canal com esse instance_id
            const existing = await channelsService.findByInstanceId(credentials.instance_id, user.id);
            if (existing) {
                // Se já existe, atualizar status para active e retornar
                const updated = await channelsService.update(existing.id, {
                    status: requestedStatus || 'active',
                    credentials
                }, user.id);

                // Configurar webhook automaticamente (mesmo se canal já existe)
                await configureWebhookForInstance(instanceId);

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

            // ✅ IMPORTANTE: Configurar webhook automaticamente na Evolution API
            await configureWebhookForInstance(instanceId);

            return res.status(201).json(channel);
        }

        // Para Telegram, configurar webhook automaticamente
        if (type === 'telegram' && credentials?.bot_token) {
            const webhookUrl = process.env.WEBHOOK_URL || process.env.API_URL || process.env.SERVICE_URL_API;
            if (webhookUrl) {
                const telegramWebhookUrl = `${webhookUrl.replace(/\/$/, '')}/api/webhooks/telegram`;
                try {
                    const telegramResponse = await fetch(
                        `https://api.telegram.org/bot${credentials.bot_token}/setWebhook?url=${encodeURIComponent(telegramWebhookUrl)}`
                    );
                    const telegramData = await telegramResponse.json();
                    if (telegramData.ok) {
                        console.log(`[Channels] ✅ Telegram webhook configured: ${telegramWebhookUrl}`);
                    } else {
                        console.warn(`[Channels] ⚠️ Failed to configure Telegram webhook:`, telegramData);
                    }
                } catch (err: any) {
                    console.error(`[Channels] ❌ Error configuring Telegram webhook:`, err.message);
                }
            }
        }

        // Para outros canais (Telegram, Facebook, Instagram), usar o status enviado ou 'active'
        const channel = await channelsService.create({
            type,
            name,
            status: requestedStatus || 'active',
            credentials: credentials || {},
            settings: settings || {}
        }, user.id);

        console.log(`[Channels] ${type} channel created: ${channel.id} with status: ${channel.status}`);

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

        const channelId = req.params.id;
        console.log(`[Channels] Deleting channel: ${channelId} for user: ${user.id}`);

        // Primeiro, buscar o canal para obter informações
        const channel = await channelsService.findById(channelId, user.id);

        // Se for WhatsApp, também deletar a instância na Evolution API
        if (channel && channel.type === 'whatsapp') {
            const instanceId = channel.credentials?.instance_id || channel.credentials?.instance_name;
            if (instanceId && whatsappService.isReady()) {
                try {
                    console.log(`[Channels] Also deleting Evolution API instance: ${instanceId}`);
                    await whatsappService.deleteInstance(instanceId);
                    console.log(`[Channels] Evolution API instance deleted: ${instanceId}`);
                } catch (e: any) {
                    console.warn(`[Channels] Could not delete Evolution API instance: ${e.message}`);
                    // Continua mesmo se falhar (instância pode já ter sido deletada)
                }
            }
        }

        // Deletar do banco de dados
        const deleted = await channelsService.delete(channelId, user.id);

        // Se não encontrou no banco mas temos instanceId na URL, tentar deletar da Evolution
        if (!deleted && !channel) {
            // Tentar extrair instanceId do ID (pode ser que o frontend esteja enviando instanceId ao invés de channelId)
            console.log(`[Channels] Channel not found in DB, checking if ${channelId} is an instance name...`);

            // Verificar se é um nome de instância
            if (channelId.startsWith('leadflow_') && whatsappService.isReady()) {
                try {
                    await whatsappService.deleteInstance(channelId);
                    console.log(`[Channels] Deleted Evolution instance directly: ${channelId}`);
                    return res.json({ success: true, message: 'Instance deleted from Evolution API' });
                } catch (e: any) {
                    console.warn(`[Channels] Could not delete instance: ${e.message}`);
                }
            }

            return res.status(404).json({ error: 'Channel not found' });
        }

        console.log(`[Channels] Channel deleted successfully: ${channelId}`);
        res.json({ success: true });
    } catch (error) {
        console.error('[Channels] Error deleting channel:', error);
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
