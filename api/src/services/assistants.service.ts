// Service para gerenciar assistentes do marketplace (produtos de IA)
import { query } from '../database/connection';
import axios from 'axios';

export interface Assistant {
    id: string;
    name: string;
    slug: string;
    description: string;
    short_description: string;
    icon: string;
    color: string;
    category: string;
    features: string[];
    price_monthly: number;
    price_annual: number;
    is_free: boolean;
    is_active: boolean;
    is_featured: boolean;
    n8n_webhook_url: string | null;
    default_config: any;
    required_channels: string[];
    created_at: string;
    updated_at: string;
}

export interface UserAssistant {
    id: string;
    user_id: string;
    assistant_id: string;
    is_active: boolean;
    is_configured: boolean;
    config: any;
    channel_id: string | null;
    n8n_workflow_id: string | null;
    last_triggered_at: string | null;
    stats: {
        conversations: number;
        messages_sent: number;
        messages_received: number;
    };
    created_at: string;
    updated_at: string;
    // Joined fields
    assistant?: Assistant;
}

export interface AssistantLog {
    id: string;
    user_assistant_id: string;
    conversation_id: string;
    contact_phone: string;
    contact_name: string;
    message_in: string;
    message_out: string;
    tokens_used: number;
    response_time_ms: number;
    status: string;
    error_message: string | null;
    metadata: any;
    created_at: string;
}

export class AssistantsService {
    /**
     * Lista todos os assistentes disponíveis no marketplace
     */
    async findAllAvailable(): Promise<Assistant[]> {
        const result = await query(
            `SELECT * FROM assistants
             WHERE is_active = true
             ORDER BY is_featured DESC, is_free DESC, name ASC`
        );
        return result.rows;
    }

    /**
     * Busca assistente por slug
     */
    async findBySlug(slug: string): Promise<Assistant | null> {
        const result = await query(
            'SELECT * FROM assistants WHERE slug = $1 AND is_active = true',
            [slug]
        );
        return result.rows[0] || null;
    }

    /**
     * Busca assistente por ID
     */
    async findAssistantById(id: string): Promise<Assistant | null> {
        const result = await query(
            'SELECT * FROM assistants WHERE id = $1',
            [id]
        );
        return result.rows[0] || null;
    }

    /**
     * Lista assistentes conectados do usuário
     */
    async findUserAssistants(userId: string): Promise<UserAssistant[]> {
        const result = await query(
            `SELECT ua.*,
                    a.name, a.slug, a.description, a.short_description,
                    a.icon, a.color, a.category, a.features,
                    a.price_monthly, a.is_free, a.default_config
             FROM user_assistants ua
             JOIN assistants a ON ua.assistant_id = a.id
             WHERE ua.user_id = $1
             ORDER BY ua.created_at DESC`,
            [userId]
        );

        return result.rows.map(row => ({
            id: row.id,
            user_id: row.user_id,
            assistant_id: row.assistant_id,
            is_active: row.is_active,
            is_configured: row.is_configured,
            config: row.config,
            channel_id: row.channel_id,
            n8n_workflow_id: row.n8n_workflow_id,
            last_triggered_at: row.last_triggered_at,
            stats: row.stats,
            created_at: row.created_at,
            updated_at: row.updated_at,
            assistant: {
                id: row.assistant_id,
                name: row.name,
                slug: row.slug,
                description: row.description,
                short_description: row.short_description,
                icon: row.icon,
                color: row.color,
                category: row.category,
                features: row.features,
                price_monthly: row.price_monthly,
                is_free: row.is_free,
                default_config: row.default_config
            } as Assistant
        }));
    }

    /**
     * Busca assistente conectado do usuário por ID
     */
    async findUserAssistantById(id: string, userId: string): Promise<UserAssistant | null> {
        const result = await query(
            `SELECT ua.*,
                    a.name, a.slug, a.description, a.short_description,
                    a.icon, a.color, a.category, a.features,
                    a.price_monthly, a.is_free, a.default_config, a.n8n_webhook_url
             FROM user_assistants ua
             JOIN assistants a ON ua.assistant_id = a.id
             WHERE ua.id = $1 AND ua.user_id = $2`,
            [id, userId]
        );

        if (!result.rows[0]) return null;

        const row = result.rows[0];
        return {
            id: row.id,
            user_id: row.user_id,
            assistant_id: row.assistant_id,
            is_active: row.is_active,
            is_configured: row.is_configured,
            config: row.config,
            channel_id: row.channel_id,
            n8n_workflow_id: row.n8n_workflow_id,
            last_triggered_at: row.last_triggered_at,
            stats: row.stats,
            created_at: row.created_at,
            updated_at: row.updated_at,
            assistant: {
                id: row.assistant_id,
                name: row.name,
                slug: row.slug,
                description: row.description,
                short_description: row.short_description,
                icon: row.icon,
                color: row.color,
                category: row.category,
                features: row.features,
                price_monthly: row.price_monthly,
                is_free: row.is_free,
                default_config: row.default_config,
                n8n_webhook_url: row.n8n_webhook_url
            } as Assistant
        };
    }

    /**
     * Conecta um assistente ao usuário
     */
    async connectAssistant(assistantId: string, userId: string, channelId?: string): Promise<UserAssistant> {
        // Verificar se o assistente existe
        const assistant = await this.findAssistantById(assistantId);
        if (!assistant) {
            throw new Error('Assistente não encontrado');
        }

        // Verificar se já está conectado
        const existing = await query(
            'SELECT id FROM user_assistants WHERE user_id = $1 AND assistant_id = $2',
            [userId, assistantId]
        );

        if (existing.rows[0]) {
            throw new Error('Assistente já está conectado');
        }

        // Criar conexão
        const result = await query(
            `INSERT INTO user_assistants (user_id, assistant_id, config, channel_id, is_active, is_configured)
             VALUES ($1, $2, $3, $4, true, false)
             RETURNING *`,
            [userId, assistantId, JSON.stringify(assistant.default_config || {}), channelId || null]
        );

        const userAssistant = result.rows[0];

        // Enviar webhook para n8n para criar/configurar o workflow (silenciosamente)
        this.sendN8nWebhook(assistant, userAssistant, userId, 'connect').catch(err => {
            console.error('[Assistants] Error sending n8n webhook:', err.message);
        });

        return {
            ...userAssistant,
            assistant
        };
    }

    /**
     * Desconecta um assistente do usuário
     */
    async disconnectAssistant(userAssistantId: string, userId: string): Promise<boolean> {
        // Buscar dados antes de deletar
        const userAssistant = await this.findUserAssistantById(userAssistantId, userId);
        if (!userAssistant) {
            return false;
        }

        const result = await query(
            'DELETE FROM user_assistants WHERE id = $1 AND user_id = $2 RETURNING id',
            [userAssistantId, userId]
        );

        if ((result.rowCount ?? 0) > 0 && userAssistant.assistant) {
            // Enviar webhook para n8n para remover o workflow (silenciosamente)
            this.sendN8nWebhook(
                userAssistant.assistant,
                userAssistant,
                userId,
                'disconnect'
            ).catch(err => {
                console.error('[Assistants] Error sending n8n disconnect webhook:', err.message);
            });
        }

        return (result.rowCount ?? 0) > 0;
    }

    /**
     * Atualiza configuração do assistente do usuário
     */
    async updateConfiguration(
        userAssistantId: string,
        userId: string,
        config: any,
        channelId?: string
    ): Promise<UserAssistant | null> {
        const fields: string[] = ['config = $1', 'is_configured = true', 'updated_at = NOW()'];
        const values: any[] = [JSON.stringify(config)];
        let paramIndex = 2;

        if (channelId !== undefined) {
            fields.push(`channel_id = $${paramIndex++}`);
            values.push(channelId);
        }

        values.push(userAssistantId, userId);

        const result = await query(
            `UPDATE user_assistants
             SET ${fields.join(', ')}
             WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
             RETURNING *`,
            values
        );

        if (!result.rows[0]) {
            return null;
        }

        const userAssistant = await this.findUserAssistantById(userAssistantId, userId);

        if (userAssistant?.assistant) {
            // Enviar webhook para n8n com a nova configuração (silenciosamente)
            this.sendN8nWebhook(
                userAssistant.assistant,
                userAssistant,
                userId,
                'configure'
            ).catch(err => {
                console.error('[Assistants] Error sending n8n configure webhook:', err.message);
            });
        }

        return userAssistant;
    }

    /**
     * Ativa/desativa assistente do usuário
     */
    async toggleActive(userAssistantId: string, userId: string, isActive: boolean): Promise<boolean> {
        const result = await query(
            `UPDATE user_assistants
             SET is_active = $1, updated_at = NOW()
             WHERE id = $2 AND user_id = $3
             RETURNING *`,
            [isActive, userAssistantId, userId]
        );

        if (!result.rows[0]) {
            return false;
        }

        const userAssistant = await this.findUserAssistantById(userAssistantId, userId);

        if (userAssistant?.assistant) {
            // Enviar webhook para n8n (silenciosamente)
            this.sendN8nWebhook(
                userAssistant.assistant,
                userAssistant,
                userId,
                isActive ? 'activate' : 'deactivate'
            ).catch(err => {
                console.error('[Assistants] Error sending n8n toggle webhook:', err.message);
            });
        }

        return true;
    }

    /**
     * Registra log de conversa do assistente
     */
    async logConversation(data: Partial<AssistantLog>): Promise<AssistantLog> {
        const result = await query(
            `INSERT INTO assistant_logs (
                user_assistant_id, conversation_id, contact_phone, contact_name,
                message_in, message_out, tokens_used, response_time_ms,
                status, error_message, metadata
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING *`,
            [
                data.user_assistant_id,
                data.conversation_id,
                data.contact_phone,
                data.contact_name,
                data.message_in,
                data.message_out,
                data.tokens_used || 0,
                data.response_time_ms || 0,
                data.status || 'success',
                data.error_message || null,
                JSON.stringify(data.metadata || {})
            ]
        );

        // Atualizar estatísticas
        await query(
            `UPDATE user_assistants
             SET stats = jsonb_set(
                 jsonb_set(
                     jsonb_set(stats, '{conversations}', ((stats->>'conversations')::int + 1)::text::jsonb),
                     '{messages_received}', ((stats->>'messages_received')::int + 1)::text::jsonb
                 ),
                 '{messages_sent}', ((stats->>'messages_sent')::int + 1)::text::jsonb
             ),
             last_triggered_at = NOW()
             WHERE id = $1`,
            [data.user_assistant_id]
        );

        return result.rows[0];
    }

    /**
     * Busca logs de um assistente do usuário
     */
    async getLogs(userAssistantId: string, userId: string, limit: number = 50): Promise<AssistantLog[]> {
        // Verificar se o user_assistant pertence ao usuário
        const ua = await this.findUserAssistantById(userAssistantId, userId);
        if (!ua) {
            return [];
        }

        const result = await query(
            `SELECT * FROM assistant_logs
             WHERE user_assistant_id = $1
             ORDER BY created_at DESC
             LIMIT $2`,
            [userAssistantId, limit]
        );

        return result.rows;
    }

    /**
     * Envia webhook para n8n (interno - não exposto ao cliente)
     */
    private async sendN8nWebhook(
        assistant: Assistant,
        userAssistant: UserAssistant,
        userId: string,
        action: 'connect' | 'disconnect' | 'configure' | 'activate' | 'deactivate'
    ): Promise<void> {
        // URL do webhook N8N configurado na variável de ambiente ou no assistente
        const webhookUrl = process.env.N8N_ASSISTANTS_WEBHOOK_URL || assistant.n8n_webhook_url;

        if (!webhookUrl) {
            console.log('[Assistants] No n8n webhook URL configured, skipping');
            return;
        }

        try {
            console.log(`[Assistants] Sending ${action} webhook to n8n for assistant ${assistant.slug}`);

            await axios.post(webhookUrl, {
                action,
                timestamp: new Date().toISOString(),
                assistant: {
                    id: assistant.id,
                    slug: assistant.slug,
                    name: assistant.name,
                    category: assistant.category
                },
                userAssistant: {
                    id: userAssistant.id,
                    userId,
                    channelId: userAssistant.channel_id,
                    config: userAssistant.config,
                    isActive: userAssistant.is_active,
                    isConfigured: userAssistant.is_configured
                }
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Leadflow-Source': 'assistants-service'
                },
                timeout: 10000
            });

            console.log(`[Assistants] Webhook sent successfully for ${action}`);
        } catch (error: any) {
            console.error(`[Assistants] Failed to send webhook: ${error.message}`);
            // Não propagar erro - webhooks são fire-and-forget para o cliente
        }
    }
}
