// Sistema de Internacionalização (i18n) do LeadsFlow

export type Language = 'pt' | 'en' | 'es' | 'fr';

export interface Translations {
  // Header
  notifications: string;
  darkMode: string;
  lightMode: string;

  // Sidebar Navigation
  dashboard: string;
  leads: string;
  contactos: string;
  inbox: string;
  salesFunnel: string;
  analytics: string;
  tasksFollowup: string;
  campaigns: string;
  plan: string;
  integrations: string;
  security: string;
  accountSettings: string;
  admin: string;
  conversas: string;
  configuracoesInbox: string;
  canaisComunicacao: string;
  canais: string;
  status: string;
  mentions: string;
  unattended: string;
  inboxSettings: string;
  aiAssistants: string;
  automations: string;
  assistentesIA: string;
  regrasAutomacao: string;
  greeting: string;

  // User Menu
  viewProfile: string;
  settings: string;
  changePassword: string;
  logout: string;

  // Notifications
  noNotifications: string;
  markAllAsRead: string;
  clearAll: string;
  markAsRead: string;
  startTour: string;
  youWillReceiveUpdates: string;

  // Common
  welcome: string;
  new: string;
  total: string;
  search: string;
  export: string;
  import: string;
  save: string;
  cancel: string;
  delete: string;
  edit: string;
  add: string;
  close: string;

  // Dashboard
  totalLeads: string;
  newToday: string;
  converted: string;
  conversionRate: string;
  leadsByOrigin: string;
  statusOfLeads: string;
  evolutionOfLeads: string;
  campaignEngagement: string;

  // Language names
  languagePortuguese: string;
  languageEnglish: string;
  languageSpanish: string;
  languageFrench: string;
}

export const translations: Record<Language, Translations> = {
  pt: {
    // Header
    notifications: 'Notificações',
    darkMode: 'Modo Escuro',
    lightMode: 'Modo Claro',

    // Sidebar Navigation
    dashboard: 'Dashboard',
    leads: 'Leads',
    contactos: 'Contactos',
    inbox: 'Caixa de Entrada',
    salesFunnel: 'Funil de Vendas',
    analytics: 'Analytics',
    tasksFollowup: 'Tarefas & Follow-up',
    campaigns: 'Campanhas',
    plan: 'Plano',
    integrations: 'Integrações',
    security: 'Segurança',
    accountSettings: 'Configurações da Conta',
    admin: 'Admin',
    conversas: 'Conversas',
    configuracoesInbox: 'Configurações',
    canaisComunicacao: 'Canais de Comunicação',
    canais: 'Canais',
    status: 'Status',
    mentions: 'Menções',
    unattended: 'Não atendidas',
    inboxSettings: 'Configurações',
    aiAssistants: 'Assistentes IA',
    automations: 'Automação',
    assistentesIA: 'Assistentes IA',
    regrasAutomacao: 'Automação',
    greeting: 'Olá',

    // User Menu
    viewProfile: 'Ver Perfil',
    settings: 'Configurações da Conta',
    changePassword: 'Alterar Senha',
    logout: 'Sair',

    // Notifications
    noNotifications: 'Nenhuma notificação no momento',
    markAllAsRead: 'Marcar todas como lidas',
    clearAll: 'Limpar tudo',
    markAsRead: 'Marcar como lida',
    startTour: 'Iniciar Tour',
    youWillReceiveUpdates: 'Você receberá atualizações aqui',

    // Common
    welcome: 'Bem-vindo',
    new: 'Novo',
    total: 'Total',
    search: 'Buscar',
    export: 'Exportar',
    import: 'Importar',
    save: 'Salvar',
    cancel: 'Cancelar',
    delete: 'Deletar',
    edit: 'Editar',
    add: 'Adicionar',
    close: 'Fechar',

    // Dashboard
    totalLeads: 'Total de Leads',
    newToday: 'Novos Hoje',
    converted: 'Convertidos',
    conversionRate: 'Taxa de Conversão',
    leadsByOrigin: 'Leads por Origem',
    statusOfLeads: 'Status dos Leads',
    evolutionOfLeads: 'Evolução de Leads',
    campaignEngagement: 'Engajamento em Campanhas',

    // Language names
    languagePortuguese: 'Português',
    languageEnglish: 'Inglês',
    languageSpanish: 'Espanhol',
    languageFrench: 'Francês',
  },

  en: {
    // Header
    notifications: 'Notifications',
    darkMode: 'Dark Mode',
    lightMode: 'Light Mode',

    // Sidebar Navigation
    dashboard: 'Dashboard',
    leads: 'Leads',
    contactos: 'Contacts',
    inbox: 'Inbox',
    salesFunnel: 'Sales Funnel',
    analytics: 'Analytics',
    tasksFollowup: 'Tasks & Follow-up',
    campaigns: 'Campaigns',
    plan: 'Plan',
    integrations: 'Integrations',
    security: 'Security',
    accountSettings: 'Account Settings',
    admin: 'Admin',
    conversas: 'Conversations',
    configuracoesInbox: 'Inbox Settings',
    canaisComunicacao: 'Communication Channels',
    canais: 'Channels',
    status: 'Status',
    mentions: 'Mentions',
    unattended: 'Unattended',
    inboxSettings: 'Settings',
    aiAssistants: 'AI Assistants',
    automations: 'Automation',
    assistentesIA: 'AI Assistants',
    regrasAutomacao: 'Rules / Automation',
    greeting: 'Hello',

    // User Menu
    viewProfile: 'View Profile',
    settings: 'Account Settings',
    changePassword: 'Change Password',
    logout: 'Logout',

    // Notifications
    noNotifications: 'No notifications at the moment',
    markAllAsRead: 'Mark all as read',
    clearAll: 'Clear all',
    markAsRead: 'Mark as read',
    startTour: 'Start Tour',
    youWillReceiveUpdates: 'You will receive updates here',

    // Common
    welcome: 'Welcome',
    new: 'New',
    total: 'Total',
    search: 'Search',
    export: 'Export',
    import: 'Import',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    add: 'Add',
    close: 'Close',

    // Dashboard
    totalLeads: 'Total Leads',
    newToday: 'New Today',
    converted: 'Converted',
    conversionRate: 'Conversion Rate',
    leadsByOrigin: 'Leads by Origin',
    statusOfLeads: 'Lead Status',
    evolutionOfLeads: 'Lead Evolution',
    campaignEngagement: 'Campaign Engagement',

    // Language names
    languagePortuguese: 'Portuguese',
    languageEnglish: 'English',
    languageSpanish: 'Spanish',
    languageFrench: 'French',
  },

  es: {
    // Header
    notifications: 'Notificaciones',
    darkMode: 'Modo Oscuro',
    lightMode: 'Modo Claro',

    // Sidebar Navigation
    dashboard: 'Panel de Control',
    leads: 'Prospectos',
    contactos: 'Contactos',
    inbox: 'Bandeja de Entrada',
    salesFunnel: 'Embudo de Ventas',
    analytics: 'Analítica',
    tasksFollowup: 'Tareas y Seguimiento',
    campaigns: 'Campañas',
    plan: 'Plan',
    integrations: 'Integraciones',
    security: 'Seguridad',
    accountSettings: 'Configuración de la Cuenta',
    admin: 'Admin',
    conversas: 'Conversaciones',
    configuracoesInbox: 'Configuración de Inbox',
    canaisComunicacao: 'Canales de Comunicación',
    canais: 'Canales',
    status: 'Estado',    mentions: 'Menciones',
    unattended: 'No atendidas',
    inboxSettings: 'Configuración',
    aiAssistants: 'Asistentes IA',
    automations: 'Automatización',    assistentesIA: 'Asistentes de IA',
    regrasAutomacao: 'Reglas / Automatización',
    greeting: 'Hola',

    // User Menu
    viewProfile: 'Ver Perfil',
    settings: 'Configuración de la Cuenta',
    changePassword: 'Cambiar Contraseña',
    logout: 'Cerrar Sesión',

    // Notifications
    noNotifications: 'No hay notificaciones en este momento',
    markAllAsRead: 'Marcar todas como leídas',
    clearAll: 'Limpiar todo',
    markAsRead: 'Marcar como leída',
    startTour: 'Iniciar Tour',
    youWillReceiveUpdates: 'Recibirás actualizaciones aquí',

    // Common
    welcome: 'Bienvenido',
    new: 'Nuevo',
    total: 'Total',
    search: 'Buscar',
    export: 'Exportar',
    import: 'Importar',
    save: 'Guardar',
    cancel: 'Cancelar',
    delete: 'Eliminar',
    edit: 'Editar',
    add: 'Agregar',
    close: 'Cerrar',

    // Dashboard
    totalLeads: 'Total de Prospectos',
    newToday: 'Nuevos Hoy',
    converted: 'Convertidos',
    conversionRate: 'Tasa de Conversión',
    leadsByOrigin: 'Prospectos por Origen',
    statusOfLeads: 'Estado de Prospectos',
    evolutionOfLeads: 'Evolución de Prospectos',
    campaignEngagement: 'Compromiso de Campaña',

    // Language names
    languagePortuguese: 'Portugués',
    languageEnglish: 'Inglés',
    languageSpanish: 'Español',
    languageFrench: 'Francés',
  },

  fr: {
    // Header
    notifications: 'Notifications',
    darkMode: 'Mode Sombre',
    lightMode: 'Mode Clair',

    // Sidebar Navigation
    dashboard: 'Tableau de Bord',
    leads: 'Prospects',
    contactos: 'Contacts',
    inbox: 'Boîte de Réception',
    salesFunnel: 'Entonnoir de Ventes',
    analytics: 'Analytique',
    tasksFollowup: 'Tâches et Suivi',
    campaigns: 'Campagnes',
    plan: 'Plan',
    integrations: 'Intégrations',
    security: 'Sécurité',
    accountSettings: 'Paramètres du Compte',
    admin: 'Admin',
    conversas: 'Conversations',
    configuracoesInbox: 'Paramètres de la boîte',
    canaisComunicacao: 'Canaux de communication',
    canais: 'Canaux',
    status: 'Statut',
    mentions: 'Mentions',
    unattended: 'Non traités',
    inboxSettings: 'Paramètres',
    aiAssistants: 'Assistants IA',
    automations: 'Automatisation',
    assistentesIA: 'Assistants IA',
    regrasAutomacao: 'Règles / Automatisation',
    greeting: 'Bonjour',

    // User Menu
    viewProfile: 'Voir le Profil',
    settings: 'Paramètres du Compte',
    changePassword: 'Changer le Mot de Passe',
    logout: 'Se Déconnecter',

    // Notifications
    noNotifications: 'Aucune notification pour le moment',
    markAllAsRead: 'Tout marquer comme lu',
    clearAll: 'Tout effacer',
    markAsRead: 'Marquer comme lu',
    startTour: 'Commencer la Visite',
    youWillReceiveUpdates: 'Vous recevrez des mises à jour ici',

    // Common
    welcome: 'Bienvenue',
    new: 'Nouveau',
    total: 'Total',
    search: 'Rechercher',
    export: 'Exporter',
    import: 'Importer',
    save: 'Enregistrer',
    cancel: 'Annuler',
    delete: 'Supprimer',
    edit: 'Modifier',
    add: 'Ajouter',
    close: 'Fermer',

    // Dashboard
    totalLeads: 'Total des Prospects',
    newToday: 'Nouveaux Aujourd\'hui',
    converted: 'Convertis',
    conversionRate: 'Taux de Conversion',
    leadsByOrigin: 'Prospects par Origine',
    statusOfLeads: 'Statut des Prospects',
    evolutionOfLeads: 'Évolution des Prospects',
    campaignEngagement: 'Engagement de Campagne',

    // Language names
    languagePortuguese: 'Portugais',
    languageEnglish: 'Anglais',
    languageSpanish: 'Espagnol',
    languageFrench: 'Français',
  },
};

// Hook personalizado para usar traduções
export function useTranslation(language: Language = 'pt'): Translations {
  return translations[language];
}

// Função helper para obter a tradução
export function getTranslation(language: Language, key: keyof Translations): string {
  return translations[language][key];
}

// Salvar idioma no localStorage
export function saveLanguage(language: Language): void {
  localStorage.setItem('leadsflow_language', language);
}

// Carregar idioma do localStorage
export function loadLanguage(): Language {
  const saved = localStorage.getItem('leadsflow_language');
  if (saved && ['pt', 'en', 'es', 'fr'].includes(saved)) {
    return saved as Language;
  }
  return 'pt'; // Default
}
