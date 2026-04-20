// INBOX: Rotas para gerenciar assistentes virtuais de IA
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { AIAssistantsService } from '../services/ai-assistants.service';

// ── Marketplace templates (pre-configured, platform-managed) ────────────────
export const MARKETPLACE_TEMPLATES = [
    {
        id: 'atendente-geral',
        name: 'Atendente Virtual',
        description: 'Assistente de atendimento ao cliente para responder dúvidas, coletar informações e encaminhar solicitações. Pronto para usar — só edite o nome da sua empresa.',
        category: 'Atendimento',
        icon: '🤝',
        mode: 'llm' as const,
        llm_provider: 'gemini' as const,
        llm_model: 'gemini-1.5-flash',
        llm_system_prompt: `Você é um assistente virtual de atendimento ao cliente da [Nome da Empresa]. Seu papel é ajudar os clientes de forma simpática, clara e eficiente.

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
        settings: {
            enabled: true,
            auto_respond: true,
            max_tokens: 500,
            temperature: 0.7,
            monthly_message_limit: 200,
            funnel_tracking_enabled: true,
            ai_funnel_detection: false
        }
    },
    {
        id: 'vendas-qualificacao',
        name: 'Qualificador de Leads',
        description: 'Engaja novos contactos, qualifica o interesse e agenda reuniões automaticamente para a sua equipe comercial.',
        category: 'Vendas',
        icon: '🎯',
        mode: 'llm' as const,
        llm_provider: 'gemini' as const,
        llm_model: 'gemini-1.5-flash',
        llm_system_prompt: `Você é um assistente de vendas da [Nome da Empresa], especialista em qualificar leads e agendar demonstrações.

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
        settings: {
            enabled: true,
            auto_respond: true,
            max_tokens: 400,
            temperature: 0.6,
            monthly_message_limit: 200,
            funnel_tracking_enabled: true,
            ai_funnel_detection: true
        }
    },
    {
        id: 'suporte-tecnico',
        name: 'Suporte Técnico',
        description: 'Resolve problemas técnicos de nível 1, guia o cliente no diagnóstico e escala para humanos quando necessário.',
        category: 'Suporte',
        icon: '🛠️',
        mode: 'llm' as const,
        llm_provider: 'gemini' as const,
        llm_model: 'gemini-1.5-flash',
        llm_system_prompt: `Você é o suporte técnico de nível 1 da [Nome da Empresa]. Seu papel é diagnosticar e resolver problemas técnicos dos utilizadores de forma rápida e eficaz.

## Processo de diagnóstico
1. Peça ao cliente para descrever detalhadamente o problema
2. Pergunte: sistema operativo, versão do produto, mensagem de erro (se houver)
3. Siga esta ordem de verificação: conectividade → configuração → conta → reinstalação
4. Forneça passos numerados e claros

## Soluções comuns (adapte ao seu produto)
- Problemas de login: limpar cache, resetar senha, verificar email confirmado
- Erros de sincronização: verificar conexão, sair e entrar novamente
- Performance lenta: verificar recursos do dispositivo, limpar dados do app

## Escalada
Se o problema não for resolvido em 3 tentativas, diga: "Vou transferir o seu caso para a equipe técnica avançada. Pode me fornecer o seu email para acompanhamento?"

## Tom
- Paciente e técnico, mas acessível
- Confirme sempre se o problema foi resolvido antes de encerrar`,
        settings: {
            enabled: true,
            auto_respond: true,
            max_tokens: 600,
            temperature: 0.4,
            monthly_message_limit: 200,
            funnel_tracking_enabled: false,
            ai_funnel_detection: false
        }
    }
];

// Default template auto-assigned to every new user
export const DEFAULT_ONBOARDING_TEMPLATE = MARKETPLACE_TEMPLATES[0];

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

// GET /api/ai-assistants/marketplace - Lista templates do marketplace (must be before /:id)
router.get('/marketplace', async (_req, res) => {
    const templates = MARKETPLACE_TEMPLATES.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        icon: t.icon,
        mode: t.mode,
        llm_provider: t.llm_provider,
        llm_model: t.llm_model,
        llm_system_prompt: t.llm_system_prompt,
        settings: t.settings
    }));
    res.json(templates);
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

        const { name, mode, channel_id, webhook_url, webhook_headers, llm_provider, llm_model, llm_system_prompt, settings } = req.body;

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
            if (!llm_provider) {
                return res.status(400).json({ error: 'llm_provider is required for LLM mode' });
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
            llm_model,
            llm_system_prompt,
            settings: settings || { enabled: true, auto_respond: false, monthly_message_limit: 200 }
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

// POST /api/ai-assistants/marketplace/:templateId/install - Instala template para o usuário
router.post('/marketplace/:templateId/install', async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const template = MARKETPLACE_TEMPLATES.find(t => t.id === req.params.templateId);
        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }

        const assistant = await aiAssistantsService.create({
            name: template.name,
            mode: template.mode,
            channel_id: null,
            llm_provider: template.llm_provider,
            llm_model: template.llm_model,
            llm_system_prompt: template.llm_system_prompt,
            settings: { ...template.settings }
        }, user.id);

        res.status(201).json(assistant);
    } catch (error) {
        next(error);
    }
});

export default router;
