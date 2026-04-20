import {
    Home, Users, MessageSquare, Workflow, BarChart3,
    CheckSquare, Megaphone, Crown, Settings, Shield, User, Zap,
    Radio, Bot, PhoneCall, Globe, RefreshCcw, Target, Brain
} from 'lucide-react';

export interface SidebarItemConfig {
    id: string;
    labelKey: string;
    icon: any;
    path: string;
    sectionLabel?: string; // Section header rendered above this item
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
    { id: 'dashboard', labelKey: 'dashboard', icon: Home, path: '/dashboard' },
    // Comunicação
    { id: 'inbox', labelKey: 'inbox', icon: MessageSquare, path: '/dashboard/inbox', sectionLabel: 'Comunicação' },
    { id: 'inbox-settings', labelKey: 'canais', icon: Radio, path: '/dashboard/inbox/settings' },
    { id: 'leads', labelKey: 'contactos', icon: Users, path: '/dashboard/leads' },
    // Vendas
    { id: 'funnel', labelKey: 'salesFunnel', icon: Workflow, path: '/dashboard/funnel', sectionLabel: 'Vendas' },
    { id: 'campaigns', labelKey: 'campaigns', icon: Megaphone, path: '/dashboard/campaigns' },
    { id: 'remarketing', labelKey: 'remarketing', icon: Target, path: '/dashboard/remarketing' },
    { id: 'ai-insights', labelKey: 'aiInsights', icon: Brain, path: '/dashboard/ai-insights' },
    { id: 'analytics', labelKey: 'analytics', icon: BarChart3, path: '/dashboard/analytics' },
    { id: 'tasks', labelKey: 'tasksFollowup', icon: CheckSquare, path: '/dashboard/tasks' },
    // Automação
    { id: 'ai-assistants', labelKey: 'aiAssistants', icon: Bot, path: '/dashboard/ai-assistants', sectionLabel: 'Automação' },
    { id: 'voice-agents', labelKey: 'voiceAgents', icon: PhoneCall, path: '/dashboard/voice-agents' },
    { id: 'webhook', labelKey: 'webhook', icon: Globe, path: '/dashboard/automations' },
    // Configurações
    { id: 'plan', labelKey: 'plan', icon: Crown, path: '/dashboard/plan', sectionLabel: 'Configurações' },
    { id: 'integrations', labelKey: 'integrations', icon: Settings, path: '/dashboard/integrations' },
    { id: 'account', labelKey: 'accountSettings', icon: User, path: '/dashboard/account' },
];
