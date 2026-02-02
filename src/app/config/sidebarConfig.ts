import {
    Home, Users, MessageSquare, Workflow, BarChart3,
    CheckSquare, Zap, Crown, Settings, Shield, User
} from 'lucide-react';

export interface SidebarItemConfig {
    id: string;
    labelKey: string;
    icon: any;
    path: string;
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
    {
        id: 'inbox',
        labelKey: 'inbox',
        icon: MessageSquare,
        path: '/dashboard/inbox',
        children: [
            // Conversas (sempre visível)
            { 
                id: 'inbox-conversations', 
                labelKey: 'conversas', 
                path: '/dashboard/inbox'
            },
            // Canais (dropdown dinâmico)
            { 
                id: 'inbox-channels', 
                labelKey: 'canais', 
                path: '/dashboard/inbox',
                isDynamic: true // Os canais serão carregados via API
            },
            // Status (dropdown dinâmico)
            { 
                id: 'inbox-status', 
                labelKey: 'status', 
                path: '/dashboard/inbox',
                isDynamic: true // Os status serão fixos mas com dropdown
            },
            // Separador (opcional)
            { id: 'inbox-settings', labelKey: 'configuracoesInbox', path: '/dashboard/inbox/settings' },
            { id: 'inbox-assistants', labelKey: 'assistentesIA', path: '/dashboard/inbox/ai-assistants' },
            { id: 'inbox-automations', labelKey: 'regrasAutomacao', path: '/dashboard/inbox/automations' },
        ]
    },
    { id: 'leads', labelKey: 'contactos', icon: Users, path: '/dashboard/leads' },
    { id: 'funnel', labelKey: 'salesFunnel', icon: Workflow, path: '/dashboard/funnel' },
    { id: 'analytics', labelKey: 'analytics', icon: BarChart3, path: '/dashboard/analytics' },
    { id: 'tasks', labelKey: 'tasksFollowup', icon: CheckSquare, path: '/dashboard/tasks' },
    { id: 'campaigns', labelKey: 'campaigns', icon: Zap, path: '/dashboard/campaigns' },
    { id: 'plan', labelKey: 'plan', icon: Crown, path: '/dashboard/plan' },
    { id: 'integrations', labelKey: 'integrations', icon: Settings, path: '/dashboard/integrations' },
    { id: 'security', labelKey: 'security', icon: Shield, path: '/dashboard/security' },
    { id: 'account', labelKey: 'accountSettings', icon: User, path: '/dashboard/account' },
];
