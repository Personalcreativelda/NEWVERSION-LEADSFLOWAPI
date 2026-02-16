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

        // Para WhatsApp Cloud API (API Oficial da Meta)
        if (type === 'whatsapp_cloud') {
            const phoneNumberId = credentials?.phone_number_id;
            const accessToken = credentials?.access_token;

            if (!phoneNumberId || !accessToken) {
                return res.status(400).json({ error: 'phone_number_id and access_token are required for WhatsApp Cloud' });
            }

            // Verificar se já existe canal com esse phone_number_id
            const existingResult = await channelsService.findByCredentialField('phone_number_id', phoneNumberId, user.id);
            if (existingResult) {
                // Atualizar canal existente
                const updated = await channelsService.update(existingResult.id, {
                    status: requestedStatus || 'active',
                    credentials
                }, user.id);
                return res.status(200).json(updated);
            }

            // Criar novo canal
            const channel = await channelsService.create({
                type: 'whatsapp_cloud',
                name,
                status: requestedStatus || 'active',
                credentials: {
                    phone_number_id: phoneNumberId,
                    waba_id: credentials.waba_id || null,
                    access_token: accessToken,
                    verify_token: credentials.verify_token || 'leadflow_verify'
                },
                settings: settings || {}
            }, user.id);

            console.log(`[Channels] WhatsApp Cloud channel created: ${channel.id}`);
            return res.status(201).json(channel);
        }

        // Para WhatsApp Evolution API
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

        // Para Telegram, verificar duplicata e configurar webhook automaticamente
        if (type === 'telegram' && credentials?.bot_token) {
            // Verificar se já existe canal com esse bot_token
            const existingTelegram = await channelsService.findByCredentialField('bot_token', credentials.bot_token, user.id);
            if (existingTelegram) {
                // Atualizar canal existente
                const updated = await channelsService.update(existingTelegram.id, {
                    status: requestedStatus || 'active',
                    name,
                    credentials
                }, user.id);

                // Re-configurar webhook com bot_token na URL
                const webhookUrl = process.env.WEBHOOK_URL || process.env.API_URL || process.env.SERVICE_URL_API;
                if (webhookUrl) {
                    const telegramWebhookUrl = `${webhookUrl.replace(/\/$/, '')}/api/webhooks/telegram/${credentials.bot_token}`;
                    try {
                        await fetch(`https://api.telegram.org/bot${credentials.bot_token}/setWebhook?url=${encodeURIComponent(telegramWebhookUrl)}`);
                        console.log(`[Channels] ✅ Telegram webhook re-configured: ${telegramWebhookUrl}`);
                    } catch (err: any) {
                        console.error(`[Channels] ❌ Error configuring Telegram webhook:`, err.message);
                    }
                }

                return res.status(200).json(updated);
            }

            // Criar novo canal Telegram
            const telegramChannel = await channelsService.create({
                type: 'telegram',
                name,
                status: requestedStatus || 'active',
                credentials: {
                    bot_token: credentials.bot_token,
                    bot_username: credentials.bot_username,
                    bot_id: credentials.bot_id
                },
                settings: settings || {}
            }, user.id);

            console.log(`[Channels] Telegram channel created: ${telegramChannel.id}`);

            // Configurar webhook com bot_token na URL para roteamento correto
            const webhookUrl = process.env.WEBHOOK_URL || process.env.API_URL || process.env.SERVICE_URL_API;
            if (webhookUrl) {
                const telegramWebhookUrl = `${webhookUrl.replace(/\/$/, '')}/api/webhooks/telegram/${credentials.bot_token}`;
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

            return res.status(201).json(telegramChannel);
        }

        // Para Facebook Messenger, verificar duplicata e auto-subscribe à página
        if (type === 'facebook' && credentials?.page_id) {
            const pageToken = credentials.page_access_token || credentials.access_token;

            // Helper: subscribe a página para receber eventos do Messenger
            const subscribePage = async (pageId: string, token: string) => {
                try {
                    // Meta API: subscribed_fields via query params (mais confiável)
                    const subscribeUrl = `https://graph.facebook.com/v21.0/${pageId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,messaging_optins&access_token=${encodeURIComponent(token)}`;
                    const subscribeResponse = await fetch(subscribeUrl, { method: 'POST' });
                    const subscribeData = await subscribeResponse.json();
                    if (subscribeData.success) {
                        console.log(`[Channels] ✅ Facebook page subscribed to messaging events: ${pageId}`);
                    } else {
                        console.warn(`[Channels] ⚠️ Failed to subscribe Facebook page:`, JSON.stringify(subscribeData));
                    }
                    return subscribeData;
                } catch (err: any) {
                    console.error(`[Channels] ❌ Error subscribing Facebook page:`, err.message);
                    return null;
                }
            };

            const existing = await channelsService.findByCredentialField('page_id', credentials.page_id, user.id);
            if (existing) {
                const updated = await channelsService.update(existing.id, {
                    status: requestedStatus || 'active',
                    credentials: {
                        ...existing.credentials,
                        page_id: credentials.page_id,
                        page_access_token: pageToken,
                        page_name: credentials.page_name || existing.credentials?.page_name
                    }
                }, user.id);

                // Sempre re-subscribe ao atualizar (token pode ter mudado)
                if (pageToken) await subscribePage(credentials.page_id, pageToken);

                return res.status(200).json(updated);
            }

            // Criar canal
            const channel = await channelsService.create({
                type: 'facebook',
                name,
                status: requestedStatus || 'active',
                credentials: {
                    page_id: credentials.page_id,
                    page_access_token: pageToken,
                    page_name: credentials.page_name
                },
                settings: settings || {}
            }, user.id);

            // Auto-subscribe à página para receber eventos de mensagens
            if (pageToken) await subscribePage(credentials.page_id, pageToken);

            console.log(`[Channels] Facebook channel created: ${channel.id}`);
            return res.status(201).json(channel);
        }

        // Para Instagram, auto-subscribe à conta para receber webhooks
        if (type === 'instagram' && credentials?.instagram_id) {
            const igToken = credentials.access_token;
            const pageToken = credentials.page_access_token || igToken;
            const igId = credentials.instagram_id;
            const pageId = credentials.page_id;

            // Verificar duplicata
            const existing = await channelsService.findByCredentialField('instagram_id', igId, user.id);
            if (existing) {
                const updated = await channelsService.update(existing.id, {
                    status: requestedStatus || 'active',
                    credentials: { ...existing.credentials, ...credentials }
                }, user.id);

                // Re-subscribe usando Page ID e Page Access Token
                if (pageToken && pageId) {
                    try {
                        const subUrl = `https://graph.facebook.com/v21.0/${pageId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,messaging_seen,messaging_reads&access_token=${encodeURIComponent(pageToken)}`;
                        const subRes = await fetch(subUrl, { method: 'POST' });
                        const subData = await subRes.json();
                        console.log(`[Channels] Instagram subscribe via Page result:`, JSON.stringify(subData));

                        if (subData.error) {
                            console.error(`[Channels] Instagram subscribe error:`, subData.error);
                        }
                    } catch (err: any) {
                        console.warn(`[Channels] Instagram subscribe error:`, err.message);
                    }
                } else {
                    console.warn(`[Channels] Instagram: Missing page_id or page_access_token for webhook subscription`);
                }

                return res.status(200).json(updated);
            }
        }

        // Para outros canais, usar o status enviado ou 'active'
        const channel = await channelsService.create({
            type,
            name,
            status: requestedStatus || 'active',
            credentials: credentials || {},
            settings: settings || {}
        }, user.id);

        // Auto-subscribe Instagram após criação usando Page ID
        if (type === 'instagram' && credentials?.instagram_id) {
            const pageToken = credentials.page_access_token || credentials.access_token;
            const pageId = credentials.page_id;

            if (pageToken && pageId) {
                try {
                    const subUrl = `https://graph.facebook.com/v21.0/${pageId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,messaging_seen,messaging_reads&access_token=${encodeURIComponent(pageToken)}`;
                    const subRes = await fetch(subUrl, { method: 'POST' });
                    const subData = await subRes.json();
                    console.log(`[Channels] Instagram subscribe after create via Page:`, JSON.stringify(subData));

                    if (subData.error) {
                        console.error(`[Channels] Instagram subscribe error:`, subData.error);
                    } else if (subData.success) {
                        console.log(`[Channels] ✅ Instagram webhook subscribed successfully for page ${pageId}`);
                    }
                } catch (err: any) {
                    console.warn(`[Channels] Instagram subscribe error:`, err.message);
                }
            } else {
                console.warn(`[Channels] Instagram: Missing page_id or page_access_token. Cannot subscribe to webhooks.`);
                console.warn(`[Channels] Credentials:`, { has_page_id: !!pageId, has_page_token: !!pageToken });
            }
        }

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

        // Para Facebook, re-subscribe à página e verificar token
        if (channel.type === 'facebook') {
            const pageToken = channel.credentials?.page_access_token || channel.credentials?.access_token;
            const pageId = channel.credentials?.page_id;

            if (!pageToken || !pageId) {
                return res.status(400).json({ error: 'Facebook channel missing page_id or access_token' });
            }

            try {
                // Verificar se o token ainda é válido
                const tokenCheck = await fetch(
                    `https://graph.facebook.com/v21.0/me?access_token=${pageToken}`
                );
                const tokenData = await tokenCheck.json();

                if (tokenData.error) {
                    await channelsService.updateStatus(channel.id, 'error', user.id);
                    return res.json({
                        success: false,
                        status: 'error',
                        error: tokenData.error.message || 'Token inválido ou expirado'
                    });
                }

                // Re-subscribe à página
                const subscribeUrl = `https://graph.facebook.com/v21.0/${pageId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,messaging_optins&access_token=${encodeURIComponent(pageToken)}`;
                const subscribeResponse = await fetch(subscribeUrl, { method: 'POST' });
                const subscribeData = await subscribeResponse.json();

                const subscribed = subscribeData.success === true;
                await channelsService.updateStatus(channel.id, subscribed ? 'active' : 'error', user.id);
                await channelsService.updateLastSync(channel.id, user.id);

                console.log(`[Channels] Facebook sync: page=${pageId}, subscribed=${subscribed}`);

                return res.json({
                    success: subscribed,
                    status: subscribed ? 'active' : 'error',
                    page_name: tokenData.name,
                    page_id: tokenData.id,
                    subscribed: subscribed,
                    subscribe_response: subscribeData,
                    synced_at: new Date().toISOString()
                });
            } catch (error: any) {
                console.error('[Channels] Error syncing Facebook:', error);
                await channelsService.updateStatus(channel.id, 'error', user.id);
                return res.status(500).json({ error: 'Failed to sync Facebook channel: ' + error.message });
            }
        }

        // Para Instagram, verificar token e re-subscribe
        if (channel.type === 'instagram') {
            const igToken = channel.credentials?.access_token;
            const igId = channel.credentials?.instagram_id;

            if (!igToken || !igId) {
                return res.status(400).json({ error: 'Instagram channel missing instagram_id or access_token' });
            }

            try {
                // Verificar token
                const tokenCheck = await fetch(
                    `https://graph.facebook.com/v21.0/${igId}?fields=id,username,name&access_token=${igToken}`
                );
                const tokenData = await tokenCheck.json();

                if (tokenData.error) {
                    await channelsService.updateStatus(channel.id, 'error', user.id);
                    return res.json({
                        success: false,
                        status: 'error',
                        error: tokenData.error.message || 'Token inválido ou expirado'
                    });
                }

                // Re-subscribe
                const subUrl = `https://graph.facebook.com/v21.0/${igId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks&access_token=${encodeURIComponent(igToken)}`;
                const subRes = await fetch(subUrl, { method: 'POST' });
                const subData = await subRes.json();

                await channelsService.updateStatus(channel.id, 'active', user.id);
                await channelsService.updateLastSync(channel.id, user.id);

                return res.json({
                    success: true,
                    status: 'active',
                    username: tokenData.username,
                    instagram_id: tokenData.id,
                    subscribed: subData.success === true,
                    synced_at: new Date().toISOString()
                });
            } catch (error: any) {
                console.error('[Channels] Error syncing Instagram:', error);
                return res.status(500).json({ error: 'Failed to sync Instagram: ' + error.message });
            }
        }

        res.json({ success: true, message: 'Sync not available for this channel type' });
    } catch (error) {
        next(error);
    }
});

export default router;
