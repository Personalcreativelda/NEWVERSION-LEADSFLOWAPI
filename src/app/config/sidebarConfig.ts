import {
    Home, Users, MessageSquare, Workflow, BarChart3,
    CheckSquare, Megaphone, Crown, Settings, User,
    Radio, Bot, PhoneCall, Globe, Target, Brain
} from 'lucide-react';

export interface SidebarItemConfig {
    id: string;
    labelKey: string;
    icon: any;
    path: string;
    sectionLabel?: string; // Section header rendered above this item
    keywords?: string; // Termos extra para a pesquisa da sidebar (sinónimos, sub-páginas)
    isDynamic?: boolean; // Para indicar que os filhos são carregados dinamicamente
    isDropdown?: boolean; // Para indicar que é um dropdown expansível
    children?: {
        id: string;
        labelKey: string;
        path: string;
        queryParam?: string; // Para filtros via query string
        isDynamic?: boolean;
    }[];
}

export const sidebarConfig: SidebarItemConfig[] = [
    { id: 'dashboard', labelKey: 'dashboard', icon: Home, path: '/dashboard', keywords: 'inicio home painel visao geral resumo' },
    // Comunicação
    { id: 'inbox', labelKey: 'inbox', icon: MessageSquare, path: '/dashboard/inbox', sectionLabel: 'Comunicação', keywords: 'conversas mensagens chat caixa de entrada whatsapp instagram facebook messenger telegram email' },
    { id: 'inbox-settings', labelKey: 'canais', icon: Radio, path: '/dashboard/inbox/settings', keywords: 'canais conexoes ligar conectar numero whatsapp instagram facebook telegram email' },
    { id: 'leads', labelKey: 'contactos', icon: Users, path: '/dashboard/leads', keywords: 'leads contatos clientes lista importar exportar' },
    // Vendas
    { id: 'funnel', labelKey: 'salesFunnel', icon: Workflow, path: '/dashboard/funnel', sectionLabel: 'Vendas', keywords: 'funil pipeline kanban etapas negocios oportunidades' },
    { id: 'campaigns', labelKey: 'campaigns', icon: Megaphone, path: '/dashboard/campaigns', keywords: 'disparos envio em massa broadcast whatsapp email sms' },
    { id: 'remarketing', labelKey: 'remarketing', icon: Target, path: '/dashboard/remarketing', keywords: 'reengajar recuperar segmentos publico' },
    { id: 'ai-insights', labelKey: 'aiInsights', icon: Brain, path: '/dashboard/ai-insights', keywords: 'ia inteligencia artificial analise sugestoes previsoes' },
    { id: 'analytics', labelKey: 'analytics', icon: BarChart3, path: '/dashboard/analytics', keywords: 'relatorios estatisticas metricas graficos desempenho' },
    { id: 'tasks', labelKey: 'tasksFollowup', icon: CheckSquare, path: '/dashboard/tasks', keywords: 'tarefas follow-up lembretes agenda agendamentos' },
    // Automação
    { id: 'ai-assistants', labelKey: 'aiAssistants', icon: Bot, path: '/dashboard/ai-assistants', sectionLabel: 'Automação', keywords: 'ia bot chatbot agentes atendimento automatico gpt' },
    { id: 'voice-agents', labelKey: 'voiceAgents', icon: PhoneCall, path: '/dashboard/voice-agents', keywords: 'voz chamadas telefone ligacoes' },
    { id: 'webhook', labelKey: 'webhook', icon: Globe, path: '/dashboard/automations', keywords: 'webhooks automacoes eventos n8n api' },
    // Configurações
    { id: 'plan', labelKey: 'plan', icon: Crown, path: '/dashboard/plan', sectionLabel: 'Definições', keywords: 'plano upgrade assinatura pagamento faturacao preco limites' },
    { id: 'integrations', labelKey: 'integrations', icon: Settings, path: '/dashboard/integrations', keywords: 'integracoes chaves api stripe pixel meta google analytics n8n smtp' },
    { id: 'account', labelKey: 'accountSettings', icon: User, path: '/dashboard/account', keywords: 'conta perfil avatar nome senha password seguranca equipa equipe membros convites' },
];
