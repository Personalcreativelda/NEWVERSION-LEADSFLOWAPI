// Service para gerenciar assistentes do marketplace (produtos de IA)
import { query } from '../database/connection';

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
    is_custom: boolean;
    created_by: string | null;
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
    channel_ids: string[];
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

export interface CreateAssistantInput {
    name: string;
    description?: string;
    short_description?: string;
    icon?: string;
    color?: string;
    category?: string;
    features?: string[];
    instructions?: string;
    greeting?: string;
    memory_enabled?: boolean;
    memory_window?: number;  // número de mensagens por sessão (5-50)
}

export class AssistantsService {
    /**
     * Lista todos os assistentes disponíveis no marketplace (globais + custom do user)
     */
    async findAllAvailable(userId?: string): Promise<Assistant[]> {
        await this.ensureColumns();
        try {
            const result = await query(
                `SELECT * FROM assistants
                 WHERE is_active = true AND (is_custom = false OR created_by = $1)
                 ORDER BY is_featured DESC, is_free DESC, is_custom ASC, name ASC`,
                [userId || null]
            );
            return result.rows;
        } catch (error: any) {
            // Fallback if is_custom/created_by columns don't exist yet
            if (error.code === '42703') {
                const result = await query(
                    `SELECT * FROM assistants WHERE is_active = true ORDER BY is_featured DESC, is_free DESC, name ASC`
                );
                return result.rows;
            }
            throw error;
        }
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
     * Garante que as tabelas e colunas existem (migração automática)
     */
    private migrationDone = false;
    private async ensureColumns(): Promise<void> {
        if (this.migrationDone) return;

        // Criar tabelas se não existirem
        try {
            await query(`
                CREATE TABLE IF NOT EXISTS assistants (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    name VARCHAR(255) NOT NULL,
                    slug VARCHAR(100) UNIQUE NOT NULL,
                    description TEXT,
                    short_description VARCHAR(500),
                    icon VARCHAR(100) DEFAULT 'bot',
                    color VARCHAR(20) DEFAULT '#3B82F6',
                    category VARCHAR(100) DEFAULT 'general',
                    features TEXT[],
                    price_monthly DECIMAL(10, 2) DEFAULT 0,
                    price_annual DECIMAL(10, 2) DEFAULT 0,
                    is_free BOOLEAN DEFAULT false,
                    is_active BOOLEAN DEFAULT true,
                    is_featured BOOLEAN DEFAULT false,
                    is_custom BOOLEAN DEFAULT false,
                    created_by UUID,
                    n8n_webhook_url TEXT,
                    default_config JSONB DEFAULT '{}',
                    required_channels TEXT[] DEFAULT '{}',
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )
            `);
            await query(`
                CREATE TABLE IF NOT EXISTS user_assistants (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    user_id UUID,
                    assistant_id UUID REFERENCES assistants(id) ON DELETE CASCADE,
                    is_active BOOLEAN DEFAULT true,
                    is_configured BOOLEAN DEFAULT false,
                    config JSONB DEFAULT '{}',
                    channel_id UUID,
                    channel_ids UUID[] DEFAULT '{}',
                    n8n_workflow_id VARCHAR(255),
                    last_triggered_at TIMESTAMP WITH TIME ZONE,
                    stats JSONB DEFAULT '{"conversations": 0, "messages_sent": 0, "messages_received": 0}',
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    UNIQUE(user_id, assistant_id)
                )
            `);
            await query(`
                CREATE TABLE IF NOT EXISTS assistant_logs (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    user_assistant_id UUID REFERENCES user_assistants(id) ON DELETE CASCADE,
                    conversation_id VARCHAR(255),
                    contact_phone VARCHAR(50),
                    contact_name VARCHAR(255),
                    message_in TEXT,
                    message_out TEXT,
                    tokens_used INTEGER DEFAULT 0,
                    response_time_ms INTEGER DEFAULT 0,
                    status VARCHAR(50) DEFAULT 'success',
                    error_message TEXT,
                    metadata JSONB DEFAULT '{}',
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )
            `);

            // Tabela de memória persistente por contato
            await query(`
                CREATE TABLE IF NOT EXISTS assistant_contact_memory (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    user_assistant_id UUID REFERENCES user_assistants(id) ON DELETE CASCADE,
                    contact_phone VARCHAR(50) NOT NULL,
                    contact_name VARCHAR(255),
                    summary TEXT,
                    preferences JSONB DEFAULT '{}',
                    last_topics TEXT[] DEFAULT '{}',
                    total_conversations INTEGER DEFAULT 0,
                    first_contact_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    last_contact_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    UNIQUE(user_assistant_id, contact_phone)
                )
            `);
        } catch (err: any) {
            console.error('[Assistants] Table creation error:', err.message);
        }

        // Adicionar colunas novas se não existirem
        const migrations = [
            'ALTER TABLE assistants ADD COLUMN IF NOT EXISTS is_custom BOOLEAN DEFAULT false',
            'ALTER TABLE assistants ADD COLUMN IF NOT EXISTS created_by UUID',
            "ALTER TABLE user_assistants ADD COLUMN IF NOT EXISTS channel_ids UUID[] DEFAULT '{}'",
            // Memória: flags de configuração no config do user_assistant
            // (memory_enabled e memory_window ficam no JSONB config, não precisam de coluna nova)
        ];
        for (const sql of migrations) {
            try {
                await query(sql);
            } catch (err: any) {
                console.error('[Assistants] Migration error:', sql, err.message);
            }
        }

        // Seed platform assistants (idempotent — skips if slug already exists)
        const platformAssistants = [
            {
                slug: 'atendente-virtual',
                name: 'Atendente Virtual',
                short_description: 'Responde dúvidas, coleta dados e encaminha solicitações automaticamente.',
                description: 'Assistente de atendimento ao cliente pronto para uso. Responde perguntas frequentes, coleta informações do cliente e encaminha para humanos quando necessário. Edite as instruções com o nome da sua empresa para começar.',
                icon: 'headphones',
                color: '#3B82F6',
                category: 'support',
                features: ['Respostas automáticas 24h', 'Coleta de dados do cliente', 'Encaminhamento para humano', 'Mensagens curtas e objetivas'],
                instructions: `Você é um assistente virtual de atendimento ao cliente da [Nome da Empresa]. Seu papel é ajudar os clientes de forma simpática, clara e eficiente.

## Diretrizes de comportamento
- Cumprimente sempre com cordialidade e apresente-se
- Responda em português do Brasil, com linguagem natural e respeitosa
- Seja objetivo: respostas curtas e diretas, sem rodeios
- Se não souber algo, diga honestamente e ofereça alternativas
- Nunca invente informações sobre produtos, preços ou prazos

## O que você pode fazer
1. Responder perguntas frequentes sobre produtos e serviços
2. Coletar dados do cliente (nome, contacto, problema) para acompanhamento
3. Informar horas de funcionamento e canais de suporte
4. Encaminhar pedidos mais complexos para a equipe humana dizendo: "Vou transferir para um especialista."

## Limitações
- Não faça promessas de preços ou prazos sem confirmação
- Não processe pagamentos nem acesse dados sensíveis
- Sempre que o cliente estiver irritado, demonstre empatia antes de responder`,
                greeting: 'Olá! Sou o assistente virtual da [Nome da Empresa]. Como posso ajudar você hoje?',
                is_free: true,
                is_featured: true,
            },
            {
                slug: 'qualificador-leads',
                name: 'Qualificador de Leads',
                short_description: 'Engaja novos contactos, qualifica o interesse e agenda reuniões para a equipe comercial.',
                description: 'Assistente de vendas especializado em qualificar leads. Identifica o nível de interesse, entende a necessidade do cliente e agenda demonstrações com a equipe comercial quando o lead está pronto.',
                icon: 'briefcase',
                color: '#10B981',
                category: 'sales',
                features: ['Qualificação automática de leads', 'Agendamento de demos', 'Perguntas de sondagem', 'Abordagem consultiva'],
                instructions: `Você é um assistente de vendas da [Nome da Empresa], especialista em qualificar leads e agendar demonstrações.

## Objetivo
Identificar o interesse real do cliente, entender a necessidade e agendar uma reunião com o time comercial quando o lead estiver qualificado.

## Fluxo de qualificação
1. Pergunte o nome e a empresa do cliente
2. Entenda o problema ou necessidade principal
3. Pergunte o tamanho da equipe ou volume de operações
4. Identifique o prazo de decisão ("Quando pretende implementar uma solução?")
5. Se qualificado: ofereça agendar uma demo — peça melhor horário e WhatsApp/email
6. Se não qualificado agora: agradeça e mantenha relacionamento amigável

## Tom
- Consultivo, nunca agressivo
- Faça uma pergunta de cada vez
- Mantenha respostas curtas (2-3 frases no máximo)`,
                greeting: 'Olá! Sou o consultor virtual da [Nome da Empresa]. Posso tirar 2 minutos para entender como podemos ajudar o seu negócio?',
                is_free: true,
                is_featured: true,
            },
            {
                slug: 'suporte-tecnico',
                name: 'Suporte Técnico',
                short_description: 'Resolve problemas técnicos de nível 1 e escala para humanos quando necessário.',
                description: 'Assistente especializado em suporte técnico. Diagnostica problemas passo a passo, guia o utilizador nas soluções mais comuns e escala automaticamente casos complexos para a equipe técnica.',
                icon: 'zap',
                color: '#F59E0B',
                category: 'support',
                features: ['Diagnóstico guiado', 'Soluções passo a passo', 'Escalada inteligente', 'Coleta de dados para ticket'],
                instructions: `Você é o suporte técnico de nível 1 da [Nome da Empresa]. Seu papel é diagnosticar e resolver problemas técnicos dos utilizadores de forma rápida e eficaz.

## Processo de diagnóstico
1. Peça ao cliente para descrever detalhadamente o problema
2. Pergunte: sistema operativo, versão do produto, mensagem de erro (se houver)
3. Siga esta ordem de verificação: conectividade → configuração → conta → reinstalação
4. Forneça passos numerados e claros

## Soluções comuns
- Problemas de login: limpar cache, resetar senha, verificar email confirmado
- Erros de sincronização: verificar conexão, sair e entrar novamente
- Performance lenta: verificar recursos do dispositivo, limpar dados do app

## Escalada
Se o problema não for resolvido em 3 tentativas, diga: "Vou transferir o seu caso para a equipe técnica avançada. Pode me fornecer o seu email para acompanhamento?"

## Tom
- Paciente e técnico, mas acessível
- Confirme sempre se o problema foi resolvido antes de encerrar`,
                greeting: 'Olá! Sou o assistente de suporte técnico da [Nome da Empresa]. Descreva o problema que está enfrentando e vou ajudar a resolver.',
                is_free: true,
                is_featured: false,
            },
        ];

        for (const a of platformAssistants) {
            try {
                await query(
                    `INSERT INTO assistants (
                        name, slug, description, short_description,
                        icon, color, category, features,
                        is_free, is_active, is_featured, is_custom,
                        default_config, required_channels
                    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10,false,$11,'{}')
                    ON CONFLICT (slug) DO NOTHING`,
                    [
                        a.name, a.slug, a.description, a.short_description,
                        a.icon, a.color, a.category, a.features,
                        a.is_free, a.is_featured,
                        JSON.stringify({ instructions: a.instructions, greeting: a.greeting })
                    ]
                );
            } catch (err: any) {
                console.error(`[Assistants] Seed error for ${a.slug}:`, err.message);
            }
        }

        this.migrationDone = true;
    }

    /**
     * Cria um assistente personalizado do usuário
     */
    async createCustomAssistant(userId: string, input: CreateAssistantInput): Promise<Assistant> {
        // Garantir que as colunas novas existem
        await this.ensureColumns();

        const slug = `custom-${userId.slice(0, 8)}-${Date.now()}`;
        const defaultConfig: Record<string, any> = {};
        if (input.greeting) defaultConfig.greeting = input.greeting;
        if (input.instructions) defaultConfig.instructions = input.instructions;

        const result = await query(
            `INSERT INTO assistants (
                name, slug, description, short_description,
                icon, color, category, features,
                is_free, is_active, is_custom, created_by,
                default_config
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, true, true, $9, $10)
             RETURNING *`,
            [
                input.name,
                slug,
                input.description || '',
                input.short_description || input.description || '',
                input.icon || 'bot',
                input.color || '#3B82F6',
                input.category || 'custom',
                input.features || [],
                userId,
                JSON.stringify(defaultConfig)
            ]
        );

        return result.rows[0];
    }

    /**
     * Atualiza um assistente personalizado do usuário
     */
    async updateCustomAssistant(assistantId: string, userId: string, input: Partial<CreateAssistantInput>): Promise<Assistant | null> {
        const assistant = await this.findAssistantById(assistantId);
        if (!assistant || !assistant.is_custom || assistant.created_by !== userId) {
            return null;
        }

        const fields: string[] = [];
        const values: any[] = [];
        let idx = 1;

        if (input.name !== undefined) { fields.push(`name = $${idx++}`); values.push(input.name); }
        if (input.description !== undefined) { fields.push(`description = $${idx++}`); values.push(input.description); }
        if (input.short_description !== undefined) { fields.push(`short_description = $${idx++}`); values.push(input.short_description); }
        if (input.icon !== undefined) { fields.push(`icon = $${idx++}`); values.push(input.icon); }
        if (input.color !== undefined) { fields.push(`color = $${idx++}`); values.push(input.color); }
        if (input.category !== undefined) { fields.push(`category = $${idx++}`); values.push(input.category); }
        if (input.features !== undefined) { fields.push(`features = $${idx++}`); values.push(input.features); }

        if (input.greeting !== undefined || input.instructions !== undefined) {
            const config = assistant.default_config || {};
            if (input.greeting !== undefined) config.greeting = input.greeting;
            if (input.instructions !== undefined) config.instructions = input.instructions;
            fields.push(`default_config = $${idx++}`);
            values.push(JSON.stringify(config));
        }

        if (fields.length === 0) return assistant;

        fields.push('updated_at = NOW()');
        values.push(assistantId);

        const result = await query(
            `UPDATE assistants SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
            values
        );

        return result.rows[0] || null;
    }

    /**
     * Deleta um assistente personalizado do usuário
     */
    async deleteCustomAssistant(assistantId: string, userId: string): Promise<boolean> {
        const result = await query(
            'DELETE FROM assistants WHERE id = $1 AND is_custom = true AND created_by = $2 RETURNING id',
            [assistantId, userId]
        );
        return (result.rowCount ?? 0) > 0;
    }

    /**
     * Lista assistentes conectados do usuário
     */
    async findUserAssistants(userId: string): Promise<UserAssistant[]> {
        await this.ensureColumns();
        const result = await query(
            `SELECT ua.*,
                    a.name, a.slug, a.description, a.short_description,
                    a.icon, a.color, a.category, a.features,
                    a.price_monthly, a.is_free, a.is_custom, a.created_by, a.default_config,
                    COALESCE(monthly.count, 0)::int AS monthly_messages_used
             FROM user_assistants ua
             JOIN assistants a ON ua.assistant_id = a.id
             LEFT JOIN (
               SELECT user_assistant_id, COUNT(*) AS count
               FROM assistant_logs
               WHERE status = 'success'
                 AND created_at >= date_trunc('month', NOW())
               GROUP BY user_assistant_id
             ) monthly ON monthly.user_assistant_id = ua.id
             WHERE ua.user_id = $1
             ORDER BY ua.created_at DESC`,
            [userId]
        );

        return result.rows.map((row: Record<string, any>) => ({
            id: row.id,
            user_id: row.user_id,
            assistant_id: row.assistant_id,
            is_active: row.is_active,
            is_configured: row.is_configured,
            config: row.config,
            channel_id: row.channel_id,
            channel_ids: row.channel_ids || [],
            n8n_workflow_id: row.n8n_workflow_id,
            last_triggered_at: row.last_triggered_at,
            stats: {
                ...(row.stats || {}),
                monthly_messages_used: row.monthly_messages_used,
            },
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
                is_custom: row.is_custom,
                created_by: row.created_by,
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
                    a.price_monthly, a.is_free, a.is_custom, a.created_by,
                    a.default_config, a.n8n_webhook_url,
                    COALESCE(monthly.count, 0)::int AS monthly_messages_used
             FROM user_assistants ua
             JOIN assistants a ON ua.assistant_id = a.id
             LEFT JOIN (
               SELECT user_assistant_id, COUNT(*) AS count
               FROM assistant_logs
               WHERE status = 'success'
                 AND created_at >= date_trunc('month', NOW())
               GROUP BY user_assistant_id
             ) monthly ON monthly.user_assistant_id = ua.id
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
            channel_ids: row.channel_ids || [],
            n8n_workflow_id: row.n8n_workflow_id,
            last_triggered_at: row.last_triggered_at,
            stats: {
                ...(row.stats || {}),
                monthly_messages_used: row.monthly_messages_used,
            },
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
                is_custom: row.is_custom,
                created_by: row.created_by,
                default_config: row.default_config,
                n8n_webhook_url: row.n8n_webhook_url
            } as Assistant
        };
    }

    /**
     * Conecta um assistente ao usuário com múltiplos canais
     * Se já existe, ATUALIZA os canais (UPSERT)
     */
    async connectAssistant(assistantId: string, userId: string, channelIds?: string[]): Promise<UserAssistant> {
        // Garantir que as colunas novas existem
        await this.ensureColumns();

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

        const channelIdsArray = channelIds && channelIds.length > 0 ? channelIds : [];
        const primaryChannelId = channelIdsArray.length > 0 ? channelIdsArray[0] : null;

        console.log(`[Assistants] ${existing.rows[0] ? 'Atualizando' : 'Conectando'} assistente ${assistantId} para usuário ${userId}`);
        console.log(`[Assistants]   - Canais selecionados: ${channelIdsArray.length}`);
        console.log(`[Assistants]   - Channel IDs: ${JSON.stringify(channelIdsArray)}`);

        let result;

        if (existing.rows[0]) {
            // JÁ EXISTE: Atualizar os canais
            result = await query(
                `UPDATE user_assistants
                 SET channel_ids = $1, channel_id = $2, updated_at = NOW()
                 WHERE id = $3 AND user_id = $4
                 RETURNING *`,
                [channelIdsArray, primaryChannelId, existing.rows[0].id, userId]
            );
            console.log(`[Assistants] ✅ Assistente atualizado com novos canais`);
        } else {
            // NÃO EXISTE: Criar conexão
            result = await query(
                `INSERT INTO user_assistants (user_id, assistant_id, config, channel_id, channel_ids, is_active, is_configured)
                 VALUES ($1, $2, $3, $4, $5, true, false)
                 RETURNING *`,
                [userId, assistantId, JSON.stringify(assistant.default_config || {}), primaryChannelId, channelIdsArray]
            );
            console.log(`[Assistants] ✅ Assistente conectado com sucesso`);
        }

        const userAssistant = result.rows[0];

        // Enviar webhook para n8n para criar/configurar o workflow (silenciosamente)
        const action = existing.rows[0] ? 'configure' : 'connect';
        this.sendN8nWebhook(assistant, { ...userAssistant, channel_ids: channelIdsArray }, userId, action).catch(err => {
            console.error('[Assistants] Error sending n8n webhook:', err.message);
        });

        return {
            ...userAssistant,
            channel_ids: channelIdsArray,
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
     * Atualiza os canais conectados de um assistente
     */
    async updateChannels(userAssistantId: string, userId: string, channelIds: string[]): Promise<UserAssistant | null> {
        const primaryChannelId = channelIds.length > 0 ? channelIds[0] : null;

        const result = await query(
            `UPDATE user_assistants
             SET channel_ids = $1, channel_id = $2, updated_at = NOW()
             WHERE id = $3 AND user_id = $4
             RETURNING *`,
            [channelIds, primaryChannelId, userAssistantId, userId]
        );

        if (!result.rows[0]) return null;

        const userAssistant = await this.findUserAssistantById(userAssistantId, userId);

        if (userAssistant?.assistant) {
            this.sendN8nWebhook(
                userAssistant.assistant,
                userAssistant,
                userId,
                'configure'
            ).catch(err => {
                console.error('[Assistants] Error sending n8n channels webhook:', err.message);
            });
        }

        return userAssistant;
    }

    /**
     * Atualiza configuração do assistente do usuário
     */
    async updateConfiguration(
        userAssistantId: string,
        userId: string,
        config: any,
        channelIds?: string[]
    ): Promise<UserAssistant | null> {
        const fields: string[] = ['config = $1', 'is_configured = true', 'updated_at = NOW()'];
        const values: any[] = [JSON.stringify(config)];
        let paramIndex = 2;

        if (channelIds !== undefined) {
            fields.push(`channel_ids = $${paramIndex++}`);
            values.push(channelIds);
            const primaryChannelId = channelIds.length > 0 ? channelIds[0] : null;
            fields.push(`channel_id = $${paramIndex++}`);
            values.push(primaryChannelId);
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
        // conversations e messages_received: sempre incrementa (1 interação = 1 mensagem recebida)
        // messages_sent: só incrementa se foi enviado com sucesso
        const isSuccess = (data.status || 'success') === 'success' && !!data.message_out;
        if (isSuccess) {
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
        } else {
            // Erro: incrementa só conversations e received, não sent
            await query(
                `UPDATE user_assistants
                 SET stats = jsonb_set(
                     jsonb_set(stats, '{conversations}', ((stats->>'conversations')::int + 1)::text::jsonb),
                     '{messages_received}', ((stats->>'messages_received')::int + 1)::text::jsonb
                 ),
                 last_triggered_at = NOW()
                 WHERE id = $1`,
                [data.user_assistant_id]
            );
        }

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

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Leadflow-Source': 'assistants-service'
                },
                body: JSON.stringify({
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
                        channelIds: userAssistant.channel_ids || [],
                        config: userAssistant.config,
                        isActive: userAssistant.is_active,
                        isConfigured: userAssistant.is_configured
                    }
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            console.log(`[Assistants] Webhook sent successfully for ${action}`);
        } catch (error: any) {
            console.error(`[Assistants] Failed to send webhook: ${error.message}`);
            // Não propagar erro - webhooks são fire-and-forget para o cliente
        }
    }
}
