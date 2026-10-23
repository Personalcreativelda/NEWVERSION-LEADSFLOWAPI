import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { toast } from "sonner";
import { trackLeadStatusChange } from '../utils/tracking';

// Dashboard components
import StatsCards from './dashboard/StatsCards';
import MainStatsCards from './dashboard/MainStatsCards';
import LeadsTable from './dashboard/LeadsTable';
import PlanoWidget from './dashboard/PlanoWidget';
import RecentLeadsSection from './dashboard/RecentLeadsSection';
import SalesFunnel from './dashboard/SalesFunnel';
import AdvancedAnalytics from './dashboard/AdvancedAnalytics';
import AIIntelligencePanel from './dashboard/AIIntelligencePanel';

// Navigation components
import RefactoredHeader from './navigation/RefactoredHeader';
import NavigationSidebar, { SIDEBAR_DEFAULT_WIDTH, SIDEBAR_COLLAPSED_WIDTH, pathToPageId } from './navigation/NavigationSidebar';
import { sidebarConfig } from '../config/sidebarConfig';
import { PageContainer } from './base/PageContainer';

// Tasks
import TaskManager from './tasks/TaskManager';

// Reports
import ReportExporter from './reports/ReportExporter';

// Settings pages
import PlanPage from './settings/PlanPage';
import IntegrationsPage from './settings/IntegrationsPage';
import AccountSettingsPage from './settings/AccountSettingsPage';
import AdminPage from './settings/AdminPage';
import CampaignsPage from './pages/CampaignsPage';
import RemarketingPage from './pages/RemarketingPage';
import AIInsightsPage from './pages/AIInsightsPage';
import InboxPage from './pages/InboxPage';
import { SkeletonStatCardsRow, UpdatingBadge, SkeletonFunnel, SkeletonLimitCards } from './ui/skeletons';

// Modal imports
import NovoLeadModal from './modals/NovoLeadModal';
import EditarLeadModal from './modals/EditarLeadModal';
import LeadDetailModal, { type TabKey as LeadDetailTabKey } from './modals/LeadDetailModal';
import ChatModal from './modals/ChatModal';
import MassMessageModal from './modals/MassMessageModal';
import UpgradeModal from './modals/UpgradeModal';
import PlanEnforcementModal from './modals/PlanEnforcementModal';
import { SendMessageModal } from './SendMessageModal';
import ImportarLeadsModal from './modals/ImportarLeadsModal';
import CampaignEmailModal from './modals/CampaignEmailModal';
import CampaignWhatsAppModal from './modals/CampaignWhatsAppModal';
import ChannelSelectorModal from './modals/ChannelSelectorModal';
import EnviarEmailModal from './modals/EnviarEmailModal';
import ImportandoWhatsAppModal from './modals/ImportandoWhatsAppModal';
import PreviewWhatsAppLeadsModal from './modals/PreviewWhatsAppLeadsModal';
import DeletionSuccessModal from './dashboard/DeletionSuccessModal';
import MessageCenterModal, { type MessageCenterMessage, type MessageCenterSection, type MessageCenterTab } from './modals/MessageCenterModal';

// Onboarding
import ProductTour from './onboarding/ProductTour';
import { notifyTourAvailable } from '../utils/notificationHelpers';
import WelcomeVideoModal from './modals/WelcomeVideoModal';
import { isNativeApp } from '../../native';
import { resolveTheme, applyThemeClass, saveThemeChoice, onSystemThemeChange } from '../utils/theme';
import FeedbackModal from './modals/FeedbackModal';

// Chat Flutuante

// Utils and Hooks
import { leadsApi, userApi, integrationsApi } from '../utils/api';
import { conversationsApi } from '../services/api/inbox';
import { useLeadsAutoRefresh } from '../hooks/useLeadsAutoRefresh';
import { useWebSocket } from '../hooks/useWebSocket';
import { useConfirm } from './ui/ConfirmDialog';
import { Language, loadLanguage, saveLanguage, translations, Translations } from '../utils/i18n';

import { AlertTriangle, AlertCircle, CheckCircle2, CopyX, Download, MailX, X, LayoutDashboard, Users, MessageSquare, BarChart2, Menu, FileText, Workflow } from 'lucide-react';
import { PageHeader, PageAction, PageFab } from './base/PageHeader';
import { motion } from 'motion/react';
import { OfflineState } from './base/OfflineState';
import { PullToRefresh } from './base/PullToRefresh';
import { LatestLeads } from './dashboard/LatestLeads';
import { formatLeadStatus } from './dashboard/leadDisplay';
import { OriginsList } from './dashboard/OriginsList';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { getLocale } from '../utils/format';

// Types
interface Lead {
  id?: string;
  nome: string;
  telefone?: string;
  email?: string;
  interesse?: string;
  origem?: string;
  status?: string;
  data?: string;
  agente_atual?: string;
  observacoes?: string;
  marcado_email?: boolean;
  // Alias fields used in some places
  name?: string;
  phone?: string;
  whatsapp?: string;
  source?: string;
  capturedAt?: string;
  createdAt?: string;
  deal_value?: number;
  valor?: number;
  avatarUrl?: string | null;
  updatedAt?: string;
  lead_score?: number | null;
  empresa?: string;
}

interface DashboardProps {
  user: any;
  onLogout: () => void;
  onSettings: () => void;
  onAdmin?: () => void;
  onUserUpdate: (user: any) => void;
  onRefreshUser?: () => Promise<any>;
  /** Enforcement block passed from App (triggered by backend 403 event) */
  enforcementBlock?: { code: string; message: string } | null;
  onEnforcementBlockCleared?: () => void;
}

export default function Dashboard({ user, onLogout, onUserUpdate, onRefreshUser, enforcementBlock, onEnforcementBlockCleared }: DashboardProps) {
  const confirm = useConfirm();
  // Theme mode: 'light' | 'dark' — segue o tema do telemóvel/sistema até o utilizador
  // escolher um manualmente (ver utils/theme.ts)
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(() => {
    const mode = resolveTheme();
    applyThemeClass(mode);
    return mode;
  });
  const [isDark, setIsDark] = useState(() => themeMode === 'dark');

  useEffect(() => onSystemThemeChange((mode) => {
    setThemeMode(mode);
    setIsDark(mode === 'dark');
  }), []);
  const [language, setLanguage] = useState<Language>(() => loadLanguage());

  // Resolve the dashboard sub-page from the URL path on first mount
  const getSubPageFromUrl = () => {
    const subPathMap: Record<string, string> = {
      '/dashboard/leads': 'leads',
      '/dashboard/inbox': 'inbox',
      '/dashboard/inbox/settings': 'inbox-settings',
      '/dashboard/inbox/ai-assistants': 'ai-assistants',
      '/dashboard/inbox/automations': 'automations',
      '/dashboard/inbox/team': 'inbox-team',
      '/dashboard/funnel': 'funnel',
      '/dashboard/analytics': 'analytics',
      '/dashboard/tasks': 'tasks',
      '/dashboard/campaigns': 'campaigns',
      '/dashboard/remarketing': 'remarketing',
      '/dashboard/plan': 'plan',
      '/dashboard/integrations': 'integrations',
      '/dashboard/security': 'security',
      '/dashboard/account': 'account',
    };
    const path = window.location.pathname.split('?')[0];
    return subPathMap[path] || 'dashboard';
  };

  const subPageToPath: Record<string, string> = {
    'dashboard': '/',
    'leads': '/dashboard/leads',
    'inbox': '/dashboard/inbox',
    'inbox-settings': '/dashboard/inbox/settings',
    'ai-assistants': '/dashboard/inbox/ai-assistants',
    'automations': '/dashboard/inbox/automations',
    'inbox-team': '/dashboard/inbox/team',
    'funnel': '/dashboard/funnel',
    'analytics': '/dashboard/analytics',
    'tasks': '/dashboard/tasks',
    'campaigns': '/dashboard/campaigns',
    'remarketing': '/dashboard/remarketing',
    'plan': '/dashboard/plan',
    'integrations': '/dashboard/integrations',
    'security': '/dashboard/security',
    'account': '/dashboard/account',
  };

  const [currentPage, setCurrentPage] = useState(() => getSubPageFromUrl());
  const [conversationIdToOpen, setConversationIdToOpen] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    // Carregar estado da sidebar do localStorage
    const saved = localStorage.getItem('sidebar_open');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar_collapsed');
    return saved !== null ? JSON.parse(saved) : false;
  });
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('sidebar_width');
    return saved !== null ? Number(JSON.parse(saved)) : SIDEBAR_DEFAULT_WIDTH;
  });
  const [isMobile, setIsMobile] = useState(false);
  // Com a barra inferior visível o botão flutuante do chat de suporte fica escondido
  // (abre-se pelo Menu) — ver html.has-bottom-nav em globals.css
  useEffect(() => {
    document.documentElement.classList.toggle('has-bottom-nav', isMobile);
    return () => document.documentElement.classList.remove('has-bottom-nav');
  }, [isMobile]);
  const [filtrosAplicados, setFiltrosAplicados] = useState({ origem: '', status: '', busca: '' });
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const initialLoadDoneRef = useRef(false); // silent background refresh after first load
  // Último valor de "é mobile" visto no resize (começa em false, como o estado: ao abrir
  // no telemóvel o menu começa fechado)
  const lastIsMobileRef = useRef(false);
  const [isDeletingLeads, setIsDeletingLeads] = useState(false); // ✅ Bloquear auto-refresh durante deleção
  const [isBackendOffline, setIsBackendOffline] = useState(false); // ✅ Detectar backend offline

  // Sem internet: o painel mostra o ecrã "Sem ligação" em vez de esqueletos sem fim; quando
  // a ligação volta, a página atual é montada de novo (pedidos refeitos) e avisa-se.
  const isOnline = useOnlineStatus();
  const [reconnectKey, setReconnectKey] = useState(0);
  const wasOfflineRef = useRef(false);
  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true;
      return;
    }
    if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      setIsBackendOffline(false);
      setReconnectKey((k) => k + 1);
      void carregarLeads();
      toast.success('Ligação restabelecida');
    }
  }, [isOnline]); // eslint-disable-line react-hooks/exhaustive-deps

  // Estados dos modais
  const [modalNovoLead, setModalNovoLead] = useState(false);
  const [modalEditarLead, setModalEditarLead] = useState(false);
  const [modalChat, setModalChat] = useState(false);
  const [modalMassMessage, setModalMassMessage] = useState(false);
  const [modalUpgrade, setModalUpgrade] = useState(false);
  // Plan enforcement: shown on-demand when user tries to access a restricted feature
  const [showEnforcementModal, setShowEnforcementModal] = useState(false);
  const [activeEnforcementBlock, setActiveEnforcementBlock] = useState<{ code: string; message: string } | null>(null);
  const [modalSendMessage, setModalSendMessage] = useState(false);
  const [modalImportarLeads, setModalImportarLeads] = useState(false);
  const [modalEmailMarketing, setModalEmailMarketing] = useState(false);
  const [modalEnviarEmail, setModalEnviarEmail] = useState(false);
  const [selectedLeadsForMessage, setSelectedLeadsForMessage] = useState<string[]>([]);
  const [deletionSuccessModal, setDeletionSuccessModal] = useState(false);
  const [deletionStats, setDeletionStats] = useState({ deletedCount: 0, errorCount: 0, totalBefore: 0, totalAfter: 0 });
  const [modalReportExporter, setModalReportExporter] = useState(false);
  const [modalLeadDetail, setModalLeadDetail] = useState(false);
  const [channelSelectorOpen, setChannelSelectorOpen] = useState(false);
  const [campaignWhatsAppModalOpen, setCampaignWhatsAppModalOpen] = useState(false);
  const [leadDetailInitialTab, setLeadDetailInitialTab] = useState<LeadDetailTabKey>('notas');

  const [leadSelecionado, setLeadSelecionado] = useState<Lead | null>(null);

  const [messageCenterOpen, setMessageCenterOpen] = useState(false);
  const [messageCenterTab, setMessageCenterTab] = useState<MessageCenterTab>('plan');
  const [messageCenterSections, setMessageCenterSections] = useState<MessageCenterSection[]>([]);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | undefined>(undefined);

  // WhatsApp Import states
  const [modalImportandoWhatsApp, setModalImportandoWhatsApp] = useState(false);
  const [modalPreviewWhatsApp, setModalPreviewWhatsApp] = useState(false);
  const [whatsappContacts, setWhatsappContacts] = useState<any[]>(() => {
    console.log('[Dashboard] 🏗️ INICIALIZANDO whatsappContacts - deve estar vazio:', []);
    return [];
  });
  const [whatsappImportKey, setWhatsappImportKey] = useState<number>(Date.now()); // ✅ Key única para forçar remontagem
  
  // Onboarding state
  const [showTour, setShowTour] = useState(false);
  const [showWelcomeVideo, setShowWelcomeVideo] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  // Auto-refresh live usage counts (leads / messages / campaigns) on mount
  useEffect(() => {
    if (onRefreshUser) {
      onRefreshUser().catch(() => {});
    }
  }, []);

  // Refresh usage whenever the user navigates back to the main dashboard page
  useEffect(() => {
    if (currentPage === 'dashboard' && onRefreshUser) {
      onRefreshUser().catch(() => {});
    }
  }, [currentPage]);

  // Lock body scroll for full-bleed pages (inbox, channels, ai-assistants, automations)
  useEffect(() => {
    const isFullBleed = currentPage === 'inbox' || currentPage === 'inbox-settings' || currentPage === 'ai-assistants' || currentPage === 'automations';
    if (isFullBleed) {
      document.body.classList.add('full-bleed-lock');
    } else {
      document.body.classList.remove('full-bleed-lock');
    }
    return () => document.body.classList.remove('full-bleed-lock');
  }, [currentPage]);

  // Periodic usage refresh every 60 seconds
  useEffect(() => {
    if (!onRefreshUser) return;
    const interval = setInterval(() => {
      onRefreshUser().catch(() => {});
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, [onRefreshUser]);

  // Listen for events dispatched after lead/message operations to refresh usage
  useEffect(() => {
    const handleUsageChange = () => {
      if (onRefreshUser) {
        onRefreshUser().catch(() => {});
      }
    };
    window.addEventListener('leadflow:usage-changed', handleUsageChange);
    return () => window.removeEventListener('leadflow:usage-changed', handleUsageChange);
  }, [onRefreshUser]);

  useEffect(() => {
    const token = localStorage.getItem('leadflow_access_token');
    if (token) {
      carregarLeads();
    }
    // Check if user should see onboarding tour
    const tourCompleted = localStorage.getItem('leadsflow_tour_completed');
    const tourNotificationSent = localStorage.getItem('leadsflow_tour_notification_sent');
    
    if (!tourCompleted && user) {
      // Send notification for new users (only once)
      if (!tourNotificationSent) {
        notifyTourAvailable().catch(console.error);
        localStorage.setItem('leadsflow_tour_notification_sent', 'true');
      }

      // Show tour after 2 seconds
      setTimeout(() => {
        setShowTour(true);
      }, 2000);
    }

    // Show welcome video for brand new users (before tour) — not in the Android app
    const welcomeVideoSeen = localStorage.getItem('leadsflow_welcome_video_seen');
    if (!welcomeVideoSeen && user && !isNativeApp()) {
      setTimeout(() => {
        setShowWelcomeVideo(true);
      }, 800);
    }

    // Detect mobile/desktop
    // O valor anterior vem de uma ref: o `isMobile` desta closure é o do primeiro render,
    // e abrir o teclado no telemóvel (que dispara "resize") parecia sempre uma mudança
    // para mobile — fechava o menu ao tocar na pesquisa.
    const checkMobile = () => {
      const mobile = window.innerWidth < 1024;
      const wasMobile = lastIsMobileRef.current;
      lastIsMobileRef.current = mobile;
      setIsMobile(mobile);

      // Apenas ajustar sidebar se mudou de mobile para desktop ou vice-versa
      if (mobile !== wasMobile) {
        if (mobile) {
          // Mudou para mobile: fechar sidebar
          setIsSidebarOpen(false);
        }
        // Desktop: manter estado do localStorage (não forçar abertura)
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    // Listener para evento de atualização de leads (disparado quando sincroniza Google Sheets)
    const handleLeadsUpdated = () => {
      console.log('[Dashboard] Leads updated event received, reloading...');
      carregarLeads();
    };
    window.addEventListener('leads-updated', handleLeadsUpdated);

    // Listener for upgrade modal triggered by sub-pages (e.g. AssistantsPage, inbox limit)
    const handleOpenUpgrade = () => setModalUpgrade(true);
    window.addEventListener('leadflow:open-upgrade', handleOpenUpgrade);
    window.addEventListener('leadflow:show-upgrade', handleOpenUpgrade);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
      window.removeEventListener('leads-updated', handleLeadsUpdated);
      window.removeEventListener('leadflow:open-upgrade', handleOpenUpgrade);
      window.removeEventListener('leadflow:show-upgrade', handleOpenUpgrade);
    };
  }, []);

  // Não há necessidade de monitorar tema do sistema

  // Save sidebar state whenever it changes
  useEffect(() => {
    localStorage.setItem('sidebar_open', JSON.stringify(isSidebarOpen));
  }, [isSidebarOpen]);

  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', JSON.stringify(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem('sidebar_width', JSON.stringify(sidebarWidth));
  }, [sidebarWidth]);

  // Navigation handler: updates internal page state AND browser URL
  const handleNavigate = useCallback((pageId: string) => {
    // Pages that require an active, non-expired plan with lead capacity
    const RESTRICTED_PAGES = new Set([
      'inbox', 'inbox-settings', 'ai-assistants', 'automations',
      'funnel', 'campaigns', 'contacts',
    ]);

    if (RESTRICTED_PAGES.has(pageId)) {
      // Compute block reason from current user state
      const plan = (user?.plan || 'free').toLowerCase();
      let block: { code: string; message: string } | null = null;

      if (plan !== 'free' && user?.plan_expires_at && new Date(user.plan_expires_at) < new Date()) {
        block = { code: 'PLAN_EXPIRED', message: 'Seu plano expirou. Renove sua assinatura para continuar.' };
      } else if (plan !== 'free' && user?.subscription_status === 'past_due') {
        block = { code: 'PAYMENT_OVERDUE', message: 'Pagamento em atraso. Regularize sua assinatura para continuar.' };
      }

      // Also respect block passed from App (e.g. backend 403 event)
      const resolvedBlock = block || enforcementBlock || null;
      if (resolvedBlock) {
        setActiveEnforcementBlock(resolvedBlock);
        setShowEnforcementModal(true);
        return; // Do NOT navigate
      }
    }

    setCurrentPage(pageId);
    const path = subPageToPath[pageId] ?? `/dashboard/${pageId}`;
    if (window.location.pathname !== path) {
      window.history.pushState({ dashboardPage: pageId }, '', path);
    }
  }, [subPageToPath, user, enforcementBlock]);

  // Título da página no cabeçalho (o mesmo nome do menu) e seta de voltar no telemóvel
  // para as páginas fora dos separadores da barra inferior.
  const pageTitle = useMemo(() => {
    const tr = translations[language] as Translations;
    const item = sidebarConfig.find((i) => (pathToPageId[i.path] || i.id) === currentPage);
    if (item) return tr[item.labelKey as keyof Translations] as string;
    const extra: Record<string, string> = { 'inbox-settings': 'Canais', 'inbox-team': 'Equipa', security: 'Segurança', admin: 'Administração', contacts: 'Contactos' };
    return extra[currentPage] || '';
  }, [currentPage, language]);

  const isTabPage = ['dashboard', 'leads', 'inbox', 'analytics'].includes(currentPage);

  // Puxar para recarregar (substitui os botões de atualizar): a página é montada de novo
  // (refaz os pedidos) e os leads e limites do plano são recarregados.
  const handlePullRefresh = useCallback(async () => {
    setReconnectKey((k) => k + 1);
    await Promise.all([carregarLeads(), onRefreshUser?.().catch(() => {})]);
  }, [onRefreshUser]); // eslint-disable-line react-hooks/exhaustive-deps

  // FAB "Novo lead": mesmas verificações do antigo botão + da tabela (plano e limite)
  const leadsLimitReached = (user?.limits?.leads ?? 0) > 0 && (user?.limits?.leads ?? 0) !== -1 && (user?.usage?.leads ?? 0) >= (user?.limits?.leads ?? 0);
  const handleNovoLeadFab = () => {
    if (leadsLimitReached) {
      window.dispatchEvent(new CustomEvent('leadflow:show-upgrade'));
      return;
    }
    handleNovoLead();
  };
  const goBack = useCallback(() => {
    // Entrada criada pelo próprio painel ou por uma subpágina (pushState) → voltar no histórico; senão Início
    if (window.history.state?.dashboardPage || window.history.state?.subpage) window.history.back();
    else handleNavigate('dashboard');
  }, [handleNavigate]);

  // Botão "voltar" do Android numa página fora dos separadores: volta à anterior
  useEffect(() => {
    if (isTabPage || !isMobile) return;
    const onNativeBack = (e: Event) => {
      if (e.defaultPrevented) return;
      // Diálogos abertos fecham primeiro (native.ts trata-os a seguir)
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      goBack();
    };
    window.addEventListener('native-back', onNativeBack);
    return () => window.removeEventListener('native-back', onNativeBack);
  }, [isTabPage, isMobile, goBack]);

  // Sync internal page with browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPage(getSubPageFromUrl());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // When App passes an enforcement block (backend 403 event), show the modal
  useEffect(() => {
    if (enforcementBlock && !showEnforcementModal) {
      setActiveEnforcementBlock(enforcementBlock);
      setShowEnforcementModal(true);
    }
  }, [enforcementBlock]);

  // Log page changes for debugging
  useEffect(() => {
    console.log('[Dashboard] 📄 Page changed to:', currentPage);
  }, [currentPage]);

  const carregarLeads = async () => {
    // ✅ BLOQUEAR se estiver deletando para evitar recarregar leads que acabaram de ser deletados
    if (isDeletingLeads) {
      console.log('[Dashboard] 🚫 Auto-refresh BLOQUEADO - Deleção em andamento');
      return;
    }

    // Only show the full loading skeleton on the very first load.
    // Subsequent (background) refreshes update data silently so the UI never flickers.
    const isFirstLoad = !initialLoadDoneRef.current;

    try {
      if (isFirstLoad) setLoading(true);
      console.log('[Dashboard] 🔄 Starting to load leads from backend...');
      
      // ✅ VERIFICAR se há webhook N8N que pode estar re-importando leads
      const n8nWebhookUrl = localStorage.getItem('n8n_webhook_url');
      if (n8nWebhookUrl) {
        console.warn('[Dashboard] ⚠️ WEBHOOK N8N DETECTADO:', n8nWebhookUrl);
        console.warn('[Dashboard] ⚠️ Se leads voltarem após deletar, pode ser o N8N re-importando!');
      }
      
      const response = await leadsApi.getAll();
      console.log('[Dashboard] 📦 Leads API response:', response);
      
      if (response.success) {
        console.log(`[Dashboard] ✅ Loaded ${response.leads.length} leads from backend`);
        console.log('[Dashboard] 📋 First 3 lead IDs:', response.leads.slice(0, 3).map((l: any) => l.id));
        console.log('[Dashboard] 📊 Total leads count:', response.leads.length);
        console.log('[Dashboard] 📊 User usage from profile:', user?.usage?.leads || 0);
        
        // ✅ VERIFICAR se leads deletados voltaram
        const deletedIdsKey = `deleted_leads_${user?.id}`;
        const deletedIds = JSON.parse(localStorage.getItem(deletedIdsKey) || '[]');
        const newIds = response.leads.map((l: any) => l.id);
        const zombieLeads = newIds.filter(id => deletedIds.includes(id));
        
        if (zombieLeads.length > 0) {
          console.error('');
          console.error('🧟🧟🧟🧟🧟🧟🧟🧟🧟🧟🧟🧟🧟🧟🧟🧟🧟🧟🧟🧟🧟🧟🧟');
          console.error(`[Dashboard] 🧟 ZOMBIE LEADS DETECTADOS: ${zombieLeads.length} leads DELETADOS VOLTARAM!`);
          console.error('[Dashboard] 🧟 IDs que voltaram (primeiros 10):', zombieLeads.slice(0, 10));
          console.error('[Dashboard] 🧟 CAUSA PROVÁVEL:');
          console.error('[Dashboard] 🧟 1. Webhook N8N está re-importando os leads');
          console.error('[Dashboard] 🧟 2. Sincronização automática está restaurando do N8N');
          console.error('[Dashboard] 🧟 3. Backend não está deletando permanentemente');
          
          const n8nWebhook = localStorage.getItem('n8n_webhook_url');
          if (n8nWebhook) {
            console.error('[Dashboard] 🧟 ⚠️ WEBHOOK N8N ATIVO:', n8nWebhook);
            console.error('[Dashboard] 🧟 ⚠️ Isso pode estar causando re-importação automática!');
          }
          console.error('🧟🧟🧟🧟🧟🧟🧟🧟🧟🧟🧟🧟🧟🧟🧟🧟🧟🧟🧟🧟🧟🧟🧟');
          console.error('');
          
          // ✅ Alertar visualmente
          toast.error(
            ` ${zombieLeads.length} leads apagados VOLTARAM!\n\n` +
            `Verifique:\n` +
            `1. Webhook N8N re-a importar?\n` +
            `2. Auto-sincronização ativa?\n` +
            `3. Backend a apagar corretamente?`,
            { duration: 10000 }
          );
        }
        
        setLeads(response.leads);
        initialLoadDoneRef.current = true;
      } else {
        console.error('[Dashboard] ❌ Response not successful:', response);
      }
    } catch (error) {
      console.error('[Dashboard] ❌ Error loading leads:', error);

      // ✅ Detectar se é erro de backend offline
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('Failed to fetch') || errorMsg.includes('Backend indisponível')) {
        setIsBackendOffline(true);
        console.error('[Dashboard] 🚨 Backend OFFLINE detectado!');
      }
    } finally {
      if (isFirstLoad) setLoading(false);
    }
  };

  // Função para atualizar leads - recarrega do banco e opcionalmente sincroniza com N8N
  const handleAtualizar = async () => {
    try {
      setLoading(true);
      
      // Verificar se há webhook N8N configurado
      const n8nWebhookUrl = localStorage.getItem('n8n_webhook_url');
      
      if (n8nWebhookUrl) {
        // Se tiver webhook, sincronizar com N8N
        toast.info('A sincronizar leads do N8N...');
        await sincronizarLeadsN8N();
      } else {
        // Se não tiver webhook, apenas recarregar do banco
        toast.info('A atualizar lista de leads...');
        await carregarLeads();
        toast.success('Lista de leads atualizada!');
      }
    } catch (error) {
      console.error('[Dashboard] Error updating leads:', error);
      toast.error('Erro ao atualizar leads');
    } finally {
      setLoading(false);
    }
  };

  // Função para sincronizar leads do Google Sheets via webhook N8N
  const sincronizarLeadsN8N = async () => {
    try {
      const n8nWebhookUrl = localStorage.getItem('n8n_webhook_url');

      if (!n8nWebhookUrl) {
        toast.error('Configure o webhook N8N nas Integrações primeiro');
        return;
      }

      try {
        new URL(n8nWebhookUrl);
      } catch (error) {
        toast.error('URL do webhook N8N inválida. Verifique a configuração nas Integrações.');
        console.error('[N8N Sync] Invalid webhook URL:', n8nWebhookUrl, error);
        return;
      }

      setLoading(true);
      console.log('[N8N Sync] Proxying request through Express API...');

      const result = await integrationsApi.syncN8N(n8nWebhookUrl);
      console.log('[N8N Sync] Result:', result);

      await carregarLeads();

      const imported = result.imported || 0;
      const duplicates = result.duplicatesSkipped || 0;
      const received = result.received || result.total || 0;

      if (imported > 0) {
        toast.success(` ${imported} lead(s) importado(s) via N8N!`);
      }

      if (duplicates > 0) {
        toast.info(` ${duplicates} lead(s) duplicado(s) ignorado(s).`);
      }

      if (imported === 0 && duplicates === 0) {
        toast.info('Nenhuma alteração detectada na planilha.');
      }

      if (received && imported === 0 && duplicates === 0) {
        toast.warning(` ${received} registos recebidos, mas nenhum pôde ser importado. Confira o workflow N8N.`);
      }

      console.log('[N8N Sync] ====== SYNC COMPLETED ======');
    } catch (error: any) {
      console.error('[N8N Sync] Error:', error);
      toast.error(error?.message || 'Erro ao sincronizar com o N8N.');

      try {
        await carregarLeads();
      } catch (reloadError) {
        console.error('[N8N Sync] Error reloading leads:', reloadError);
      }
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh de leads a cada 15 segundos para detectar novos leads do webhook N8N
  useLeadsAutoRefresh({
    onRefresh: carregarLeads,
    enabled: currentPage === 'dashboard' || currentPage === 'leads',
    interval: 15000,
  });

  // Escutar eventos de movimentação de funil em tempo real (via assistente IA)
  useWebSocket({
    onLeadFunnelUpdate: (data) => {
      console.log('[Dashboard] Recebido lead_funnel_update via WebSocket:', data);
      
      // Atualizar lead na lista local sem precisar de nova requisição
      setLeads(prev => prev.map(lead =>
        String(lead.id) === String(data.leadId) ? { ...lead, status: data.newStatus } : lead
      ));

      const statusLabels: Record<string, string> = {
        contatado: 'Contatado',
        qualificado: 'Qualificado',
        negociacao: 'Em Negociação',
        convertido: 'Convertido',
        perdido: 'Perdido',
      };
      const newLabel = statusLabels[data.newStatus] || data.newStatus;
      toast.success(` ${data.assistantName || 'Assistente IA'} moveu "${data.leadName || 'Lead'}" para ${newLabel}`, {
        duration: 5000,
      });
    },
  });

  // Check if user can perform action based on limits
  const podeExecutar = (acao: 'leads' | 'mensagens' | 'envios'): boolean => {
    if (!user) return false;

    // Also block if plan is expired or payment overdue
    const plan = (user.plan || 'free').toLowerCase();
    if (plan !== 'free' && user.plan_expires_at && new Date(user.plan_expires_at) < new Date()) return false;
    if (plan !== 'free' && user.subscription_status === 'past_due') return false;
    
    const limites = user.limits || {};
    const uso = user.usage || {};

    if (acao === 'leads') {
      return limites.leads === -1 || (uso.leads || 0) < limites.leads;
    } else if (acao === 'mensagens') {
      return limites.messages === -1 || (uso.messages || 0) < limites.messages;
    } else if (acao === 'envios') {
      return limites.massMessages === -1 || (uso.massMessages || 0) < limites.massMessages;
    }
    
    return false;
  };

  /** Show plan enforcement modal for a blocked action */
  const showPlanBlock = (code: string, message: string) => {
    setActiveEnforcementBlock({ code, message });
    setShowEnforcementModal(true);
  };

  /** Returns the current block reason (if any), or null */
  const getBlockReason = (): { code: string; message: string } | null => {
    const plan = (user?.plan || 'free').toLowerCase();
    if (plan !== 'free' && user?.plan_expires_at && new Date(user.plan_expires_at) < new Date()) {
      return { code: 'PLAN_EXPIRED', message: 'Seu plano expirou. Renove sua assinatura para continuar.' };
    }
    if (plan !== 'free' && user?.subscription_status === 'past_due') {
      return { code: 'PAYMENT_OVERDUE', message: 'Pagamento em atraso. Regularize sua assinatura para continuar.' };
    }
    return enforcementBlock || null;
  };

  const handleAdicionarLead = async (novoLead: Omit<Lead, 'id'>) => {
    try {
      console.log('[Dashboard] Creating lead with data:', novoLead);
      const response = await leadsApi.create(novoLead);
      console.log('[Dashboard] Lead creation response:', response);
      
      if (response.success) {
        setLeads([...leads, response.lead]);
        setModalNovoLead(false);
        
        // ✅ ATUALIZAR PERFIL DO USUÁRIO PARA REFLETIR NOVO CONTADOR
        console.log('[Dashboard] 🔄 Updating user profile to reflect new lead count...');
        try {
          await onRefreshUser();
          console.log('[Dashboard] ✅ User profile updated successfully');
        } catch (refreshError) {
          console.warn('[Dashboard] ⚠️ Failed to refresh user profile, but lead was created:', refreshError);
          // Atualizar usage manualmente como fallback
          onUserUpdate({ ...user, usage: { ...user.usage, leads: (user.usage?.leads || 0) + 1 } });
        }
        window.dispatchEvent(new CustomEvent('leadflow:usage-changed'));
        
        return true;
      }
      return false;
    } catch (error: any) {
      console.error('[Dashboard] Error creating lead:', error);
      const status = error?.response?.status || error?.status;
      const data = error?.response?.data || error?.data;

      if (status === 429 || data?.upgrade || data?.code === 'LEAD_LIMIT_EXCEEDED') {
        window.dispatchEvent(new CustomEvent('leadflow:show-upgrade'));
      } else if ((error?.message || '').toLowerCase().includes('limit reached')) {
        triggerPlanLimitMessage('leads');
      } else if ((error?.message || '').toLowerCase().includes('duplicate lead') || error?.isDuplicate) {
        triggerDuplicateLeadMessage();
      } else {
        triggerErrorMessage('Erro ao criar lead', error?.message || 'Erro desconhecido ao criar lead.');
      }
      return false;
    }
  };

  // silent: quem chama mostra o seu próprio aviso (ex.: mover no Funil) — evita dois
  // toasts seguidos. Devolve true se a gravação correu bem.
  const handleEditarLead = async (leadEditado: Lead, options: { silent?: boolean } = {}): Promise<boolean> => {
    try {
      if (!leadEditado.id) {
        console.error('Lead ID is missing:', leadEditado);
        triggerErrorMessage('Lead sem ID', 'Não foi possível localizar o identificador do lead. Por favor, recarregue a página e tente novamente.');
        return false;
      }

      const response = await leadsApi.update(leadEditado.id, leadEditado);
      if (response.success) {
        // ✅ Recarregar leads para garantir que gráficos e stats atualizem
        await carregarLeads();
        setModalEditarLead(false);
        setLeadSelecionado(null);
        if (!options.silent) toast.success('Lead atualizado com sucesso!');
        return true;
      }
      if (!options.silent) toast.error('Erro ao atualizar lead. Por favor, tente novamente.');
      return false;
    } catch (error) {
      console.error('Error updating lead:', error);
      if (!options.silent) toast.error('Erro ao atualizar lead. Por favor, tente novamente.');
      return false;
    }
  };

  // Deletar lead pelo ID (usado no SalesFunnel)
  const handleDeletarLead = async (leadId: string) => {
    try {
      const response = await leadsApi.delete(leadId);
      if (response.success) {
        setLeads(leads.filter(l => l.id !== leadId));
        toast.success('Lead apagado com sucesso!');
        try {
          await onRefreshUser?.();
        } catch (_) {
          onUserUpdate({ ...user, usage: { ...user.usage, leads: Math.max(0, (user.usage?.leads || 0) - 1) } });
        }
      }
    } catch (error: any) {
      if (error.message?.toLowerCase().includes('not found')) {
        setLeads(leads.filter(l => l.id !== leadId));
      } else {
        toast.error('Erro ao apagar lead');
      }
    }
  };

  // Atualizar status de um lead (usado no SalesFunnel)
  const handleAtualizarStatusLead = async (leadId: string, novoStatus: string) => {
    const leadIndex = leads.findIndex(l => l.id === leadId);
    if (leadIndex === -1) return;

    const oldLead = leads[leadIndex];
    const updatedLead = { ...oldLead, status: novoStatus };

    // Atualização otimista
    const newLeads = [...leads];
    newLeads[leadIndex] = updatedLead;
    setLeads(newLeads);

    try {
      await leadsApi.update(leadId, updatedLead);
      // 🔔 Disparar evento de tracking (Meta Pixel + GA4)
      trackLeadStatusChange(novoStatus, {
        id: leadId,
        name: oldLead.name,
        email: oldLead.email,
        phone: oldLead.phone || oldLead.whatsapp,
        source: oldLead.source,
      });
    } catch (error) {
      // Reverter em caso de erro
      setLeads(leads);
      throw error;
    }
  };

  const handleDelete = async (leadId: string) => {
    const confirmed = await confirm('Tem certeza que deseja apagar este lead?', {
      title: 'Apagar Lead',
      variant: 'danger',
      confirmLabel: 'Apagar',
      cancelLabel: 'Cancelar',
    });
    if (!confirmed) return;

    try {
      const response = await leadsApi.delete(leadId);
      if (response.success) {
        setLeads(leads.filter(l => l.id !== leadId));
        
        // ✅ ATUALIZAR PERFIL DO USUÁRIO PARA REFLETIR NOVO CONTADOR
        console.log('[Dashboard] 🔄 Updating user profile after lead deletion...');
        try {
          await onRefreshUser();
          console.log('[Dashboard] ✅ User profile updated successfully');
        } catch (refreshError) {
          console.warn('[Dashboard] ⚠️ Failed to refresh user profile, but lead was deleted:', refreshError);
          // Atualizar usage manualmente como fallback
          onUserUpdate({ ...user, usage: { ...user.usage, leads: Math.max(0, (user.usage?.leads || 0) - 1) } });
        }
      }
    } catch (error: any) {
      // Se o lead não existe mais, apenas remover da lista local silenciosamente
      if (error.message?.toLowerCase().includes('lead not found') || 
          error.message?.toLowerCase().includes('not found')) {
        // ✅ Silenciar - comportamento esperado
        setLeads(leads.filter(l => l.id !== leadId));
        
        // ✅ ATUALIZAR PERFIL DO USUÁRIO
        try {
          await onRefreshUser();
        } catch (refreshError) {
          onUserUpdate({ ...user, usage: { ...user.usage, leads: Math.max(0, (user.usage?.leads || 0) - 1) } });
        }
      } else {
        console.error('[Dashboard] Error deleting lead:', error);
      }
    }
  };

  const handleDeleteMultiple = async (leadIds: string[]) => {
    try {
      console.log('[Dashboard] 🗑️ Deleting multiple leads, IDs:', leadIds.length);
      
      // ✅ BLOQUEAR AUTO-REFRESH durante deleção
      setIsDeletingLeads(true);
      console.log('[Dashboard] 🚫 AUTO-REFRESH BLOQUEADO');
      
      if (leadIds.length === 0) {
        toast.error('Nenhum lead válido selecionado');
        setIsDeletingLeads(false);
        return;
      }
      
      console.log('[Dashboard] 🗑️ Lead IDs to delete:', leadIds);
      
      // ✅ Teste rápido com primeiro lead para verificar se backend está online
      const toastId = toast.loading('A verificar ligação com servidor...');
      
      try {
        const testResult = await leadsApi.delete(leadIds[0]);
        console.log('[Dashboard] ✅ Backend online - proceeding with batch deletion');
        
        // ✅ Se sucesso, continuar com o resto
        if (testResult.success) {
          toast.loading(`A apagar ${leadIds.length} lead(s)...`, { id: toastId });
        }
      } catch (testError: any) {
        const errorMsg = testError?.message || '';
        
        // Se backend offline, abortar imediatamente
        if (errorMsg.includes('Backend indisponível') || errorMsg.includes('Failed to fetch')) {
          console.error('[Dashboard] ❌ Backend offline - aborting deletion');
          toast.dismiss(toastId);
          toast.error('Servidor offline! Não é possível apagar leads no momento. Por favor, tente novamente mais tarde.');
          return;
        }
        
        // Se não for "not found", também abortar
        if (!errorMsg.toLowerCase().includes('lead not found')) {
          console.error('[Dashboard] ❌ Unexpected error during backend test:', testError);
          toast.dismiss(toastId);
          toast.error('Erro ao ligar com o servidor. Por favor, tente novamente.');
          return;
        }
        
        // Se for "not found", lead já estava deletado, continuar normalmente
        console.log('[Dashboard] First lead already deleted, continuing...');
        toast.loading(`A apagar ${leadIds.length} lead(s)...`, { id: toastId });
      }
      
      // ✅ DELETAR EM PARALELO para ser muito mais rápido
      // Dividir em chunks de 50 para não sobrecarregar o servidor
      const CHUNK_SIZE = 50;
      let deletedCount = 1; // ✅ Já deletamos o primeiro no teste
      let errorCount = 0;
      let backendOffline = false;
      
      // ✅ RASTREAR LEADS REALMENTE DELETADOS (não todos tentados)
      const successfullyDeletedIds: string[] = [leadIds[0]]; // Primeiro já deletado
      
      // ✅ Processar leads restantes (pulando o primeiro)
      const remainingIds = leadIds.slice(1);
      
      if (remainingIds.length === 0) {
        // ✅ Era apenas 1 lead e já foi deletado no teste
        toast.dismiss(toastId);
        
        // ✅ Atualizar lista localmente APENAS com os IDs deletados com sucesso
        console.log('[Dashboard] 📝 Removendo 1 lead da lista local...');
        const deletedIdsSet = new Set(successfullyDeletedIds);
        const updatedLeads = leads.filter(lead => !deletedIdsSet.has(lead.id));
        setLeads(updatedLeads);
        console.log(`[Dashboard] ✅ Lista local atualizada: ${leads.length} → ${updatedLeads.length} leads`);
        
        const newUsage = Math.max(0, (user.usage?.leads || 0) - 1);
        onUserUpdate({ ...user, usage: { ...user.usage, leads: newUsage } });
        console.log(`[Dashboard] 📊 Uso atualizado: ${user.usage?.leads} → ${newUsage} leads`);
        
        toast.success('1 lead apagado com sucesso!');
        return;
      }
      
      for (let i = 0; i < remainingIds.length; i += CHUNK_SIZE) {
        const chunk = remainingIds.slice(i, i + CHUNK_SIZE);
        
        console.log(`[Dashboard] 🗑️ Processing chunk ${i / CHUNK_SIZE + 1}, size: ${chunk.length}`);
        
        // ✅ Deletar chunk inteiro em paralelo
        const results = await Promise.allSettled(
          chunk.map(leadId => leadsApi.delete(leadId))
        );
        
        // ✅ Contar sucessos e rastrear IDs deletados com sucesso
        results.forEach((result, idx) => {
          const currentLeadId = chunk[idx];
          
          if (result.status === 'fulfilled' && result.value?.success) {
            deletedCount++;
            successfullyDeletedIds.push(currentLeadId); // ✅ Rastrear sucesso
            console.log(`[Dashboard] ✅ Lead deletado: ${currentLeadId}`);
          } else if (result.status === 'rejected') {
            // Verificar se é "not found" (ok) ou erro real
            const error = result.reason;
            const errorMsg = error?.message || '';
            
            // ✅ Detectar se backend está offline
            if (errorMsg.includes('Backend indisponível') || errorMsg.includes('Failed to fetch')) {
              backendOffline = true;
              console.error(`[Dashboard] ❌ Backend offline ao deletar: ${currentLeadId}`);
            }
            
            if (errorMsg.toLowerCase().includes('lead not found') || 
                errorMsg.toLowerCase().includes('not found')) {
              deletedCount++;
              successfullyDeletedIds.push(currentLeadId); // ✅ Já não existe, pode remover
              console.log(`[Dashboard] ✅ Lead já estava deletado: ${currentLeadId}`);
            } else if (!errorMsg.includes('Backend indisponível')) {
              errorCount++;
              console.error(`[Dashboard] ❌ Erro ao deletar ${currentLeadId}:`, error);
            }
          }
        });
        
        // ✅ Se backend offline, parar de tentar
        if (backendOffline) {
          console.error('[Dashboard] ❌ Backend offline detected - stopping deletion');
          break;
        }
        
        // ✅ Atualizar progresso (considerando que já deletamos 1 no teste)
        const totalProcessed = deletedCount + errorCount;
        toast.loading(`A apagar ${totalProcessed}/${leadIds.length} leads...`, { id: toastId });
      }
      
      console.log(`[Dashboard] 🗑️ Deletion finished - Success: ${deletedCount}, Errors: ${errorCount}, Backend offline: ${backendOffline}`);
      console.log(`[Dashboard] 🗑️ Successfully deleted IDs (${successfullyDeletedIds.length}):`, successfullyDeletedIds);
      
      // ✅ Mostrar resultado
      toast.dismiss(toastId);
      
      if (backendOffline) {
        toast.error('Backend offline! Não foi possível apagar os leads. Por favor, verifique a ligação com o servidor.');
        setIsDeletingLeads(false); // ✅ Desbloquear auto-refresh
        console.log('[Dashboard] ✅ AUTO-REFRESH DESBLOQUEADO (backend offline)');
        return; // ✅ NÃO atualizar localmente se backend offline
      }
      
      // ✅ ATUALIZAR LISTA LOCALMENTE APENAS COM LEADS REALMENTE DELETADOS
      console.log(`[Dashboard] 📝 Removendo ${successfullyDeletedIds.length} leads da lista local...`);
      const deletedIdsSet = new Set(successfullyDeletedIds);
      const updatedLeads = leads.filter(lead => !deletedIdsSet.has(lead.id));
      setLeads(updatedLeads);
      console.log(`[Dashboard] ✅ Lista local atualizada: ${leads.length} → ${updatedLeads.length} leads`);
      
      // ✅ Atualizar uso
      const newUsage = Math.max(0, (user.usage?.leads || 0) - deletedCount);
      onUserUpdate({ ...user, usage: { ...user.usage, leads: newUsage } });
      console.log(`[Dashboard] 📊 Uso atualizado: ${user.usage?.leads} → ${newUsage} leads`);
      
      if (errorCount === 0) {
        toast.success(` ${deletedCount} lead(s) apagado(s) com sucesso!`);
        console.log(`[Dashboard] 🎉 Deleção completa - ${deletedCount} leads deletados sem erros`);
      } else {
        toast.warning(` ${deletedCount} apagados, ${errorCount} erro(s)`);
        console.warn(`[Dashboard] ⚠️ Deleção parcial - ${deletedCount} sucesso, ${errorCount} erros`);
      }
      
      console.log(`[Dashboard] ✅ Deletion complete - Success: ${deletedCount}, Errors: ${errorCount}`);
      
      // ✅ SALVAR IDs deletados no localStorage para rastreamento
      const deletedIdsKey = `deleted_leads_${user.id}`;
      const previousDeletedIds = JSON.parse(localStorage.getItem(deletedIdsKey) || '[]');
      const allDeletedIds = [...new Set([...previousDeletedIds, ...successfullyDeletedIds])];
      localStorage.setItem(deletedIdsKey, JSON.stringify(allDeletedIds));
      console.log(`[Dashboard] 💾 Salvos ${allDeletedIds.length} IDs deletados no localStorage para rastreamento`);
      
      // ✅ REFRESH DO BACKEND para garantir sincronização total
      console.log('[Dashboard] 🔄 Recarregando leads do backend para verificar sincronização...');
      toast.loading('A verificar sincronização com servidor...', { id: toastId });
      
      const leadsAntesRefresh = leads.length;
      await carregarLeads(); // Recarrega do backend
      
      // ✅ ATUALIZAR PERFIL DO USUÁRIO PARA REFLETIR NOVO CONTADOR
      console.log('[Dashboard] 🔄 Updating user profile to reflect deleted leads...');
      try {
        await onRefreshUser();
        console.log('[Dashboard] ✅ User profile updated successfully');
      } catch (refreshError) {
        console.warn('[Dashboard] ⚠️ Failed to refresh user profile:', refreshError);
      }
      
      // ✅ Aguardar 500ms para o estado atualizar
      await new Promise(resolve => setTimeout(resolve, 500));
      
      toast.dismiss(toastId);
      
      console.log(`[Dashboard] 📊 Leads antes do refresh: ${leadsAntesRefresh}`);
      console.log(`[Dashboard] 📊 Leads esperados após deleção: ${leadsAntesRefresh - deletedCount}`);
      console.log(`[Dashboard] 📊 Deleção confirmada no backend!`);
      
      // ✅ Mostrar modal de confirmação visual
      setDeletionStats({
        deletedCount,
        errorCount,
        totalBefore: leadsAntesRefresh,
        totalAfter: leadsAntesRefresh - deletedCount,
      });
      setDeletionSuccessModal(true);
      
      // ✅ DESBLOQUEAR AUTO-REFRESH após 3 segundos (usuário teve tempo de ver o modal)
      setTimeout(() => {
        setIsDeletingLeads(false);
        console.log('[Dashboard] ✅ AUTO-REFRESH DESBLOQUEADO');
      }, 3000);
      
    } catch (error) {
      console.error('[Dashboard] Error in handleDeleteMultiple:', error);
      toast.error('Erro ao apagar leads selecionados');
      
      // ✅ DESBLOQUEAR em caso de erro também
      setIsDeletingLeads(false);
      console.log('[Dashboard] ✅ AUTO-REFRESH DESBLOQUEADO (erro)');
    }
  };


  // Troca de tema instantânea, aproveitando o transition do body
  const handleThemeChange = (mode: 'light' | 'dark') => {
    setThemeMode(mode);
    setIsDark(mode === 'dark');
    saveThemeChoice(mode);
  };

  // Legacy support - mantém para compatibilidade
  const handleToggleTheme = () => {
    const newMode = isDark ? 'light' : 'dark';
    handleThemeChange(newMode);
  };

  const handleLanguageChange = (newLanguage: Language) => {
    setLanguage(newLanguage);
    saveLanguage(newLanguage);
    toast.success(`${newLanguage === 'pt' ? 'Idioma' : newLanguage === 'en' ? 'Language' : newLanguage === 'es' ? 'Idioma' : 'Langue'} ${newLanguage === 'pt' ? 'alterado' : newLanguage === 'en' ? 'changed' : newLanguage === 'es' ? 'cambiado' : 'changé'}!`);
  };

  const handleUpgrade = () => {
    setModalUpgrade(true);
  };

  const closeMessageCenter = useCallback(() => {
    setMessageCenterOpen(false);
    setHighlightedMessageId(undefined);
  }, []);

  const openUpgradeFromMessage = useCallback(() => {
    closeMessageCenter();
    setTimeout(() => setModalUpgrade(true), 100);
  }, [closeMessageCenter]);

  const formatLimit = (value?: number | null) => {
    if (value === undefined || value === null) return '0';
    if (value === -1) return 'Ilimitado';
    return value.toLocaleString(getLocale());
  };

  const baseMessageSections = useMemo<MessageCenterSection[]>(() => {
    const planId = (user?.plan || 'free') as string;
    const planLabels: Record<string, string> = {
      free: 'Free',
      business: 'Business',
      enterprise: 'Enterprise',
    };

    const usage = user?.usage || {};
    const limits = user?.limits || {};

    const planMessages: MessageCenterMessage[] = [
      {
        id: 'plan-overview',
        title: `Plano atual: ${planLabels[planId] || planId}`,
        badgeLabel: planLabels[planId] || planId,
        badgeVariant: 'outline',
        content: (
          <div className="space-y-2">
            <p>
              Acompanhe o consumo dos principais recursos do seu plano para evitar bloqueios nas suas operações.
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>
                Leads: {formatLimit(usage.leads)} de {formatLimit(limits.leads)}
              </li>
              <li>
                Mensagens: {formatLimit(usage.messages)} de {formatLimit(limits.messages)}
              </li>
              <li>
                Envios em massa: {formatLimit(usage.massMessages)} de {formatLimit(limits.massMessages)}
              </li>
            </ul>
          </div>
        ),
        actions: [
          {
            label: 'Ver planos disponíveis',
            variant: 'outline',
            onClick: openUpgradeFromMessage,
          },
        ],
      },
    ];

    return [
      {
        id: 'plan',
        label: 'Plano e limites',
        description: 'Limites do seu plano e oportunidades de melhorar o plano.',
        messages: planMessages,
      },
      {
        id: 'alerts',
        label: 'Alertas',
        description: 'Acompanhe pontos de atenção das suas últimas ações.',
        messages: [],
      },
      {
        id: 'updates',
        label: 'Novidades',
        description: 'Confirmações e registos de atividades recentes.',
        messages: [],
      },
    ];
  }, [user, openUpgradeFromMessage]);

  useEffect(() => {
    setMessageCenterSections(
      baseMessageSections.map((section) => ({
        ...section,
        messages: [...section.messages],
      })),
    );
  }, [baseMessageSections]);

  const openMessageCenter = (
    tab: MessageCenterTab,
    message?: MessageCenterMessage,
    options?: { preserveBase?: boolean },
  ) => {
    const includeBase = options?.preserveBase ?? !message;

    const baseSections = baseMessageSections.map((section) => ({
      ...section,
      messages: includeBase ? [...section.messages] : [],
    }));

    let highlightId: string | undefined;

    const sections = baseSections.map((section) => {
      if (message && section.id === tab) {
        highlightId = message.id;
        return {
          ...section,
          messages: [message, ...section.messages],
        };
      }
      return section;
    });

    setMessageCenterSections(sections);
    setMessageCenterTab(tab);
    setHighlightedMessageId(highlightId);
    setMessageCenterOpen(true);
  };

  const triggerPlanLimitMessage = (resource: 'leads' | 'mensagens' | 'envios') => {
    const planLabels: Record<string, string> = {
      leads: 'leads',
      mensagens: 'mensagens',
      envios: 'envios em massa',
    };

    const usage = user?.usage || {};
    const limits = user?.limits || {};

    const usageKeyMap: Record<typeof resource, keyof typeof usage> = {
      leads: 'leads',
      mensagens: 'messages',
      envios: 'massMessages',
    };

    const limitKeyMap: Record<typeof resource, keyof typeof limits> = {
      leads: 'leads',
      mensagens: 'messages',
      envios: 'massMessages',
    };

    const usageValue = usage[usageKeyMap[resource]] ?? 0;
    const limitValue = limits[limitKeyMap[resource]] ?? 0;

    openMessageCenter('plan', {
      id: `plan-limit-${resource}`,
      title: `Limite de ${planLabels[resource]} atingido`,
      tone: 'warning',
      badgeLabel: 'Plano atual',
      badgeVariant: 'secondary',
      icon: <AlertTriangle className="size-5 text-amber-500" />,
      content: (
        <div className="space-y-2">
          <p>
            Você alcançou o limite de {planLabels[resource]} disponível no seu plano atual. Realize um melhorar o plano para continuar usando este recurso sem interrupções.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>
              Consumo atual: {formatLimit(usageValue)} {planLabels[resource]}
            </li>
            <li>
              Limite do plano: {formatLimit(limitValue)}
            </li>
          </ul>
        </div>
      ),
      footer: 'Sugestão: faça upgrade ou revise seus envios para liberar espaço.',
      actions: [
        {
          label: 'Ver planos',
          onClick: openUpgradeFromMessage,
        },
      ],
    });
  };

  const triggerExportLimitMessage = (
    maxAllowed: number,
    totalCount: number,
    onConfirm: () => void,
  ) => {
    const handleConfirm = () => {
      closeMessageCenter();
      setTimeout(() => onConfirm(), 100);
    };

    openMessageCenter('plan', {
      id: 'export-limit',
      title: 'Limite de exportação',
      tone: 'warning',
      badgeLabel: 'Plano atual',
      badgeVariant: 'secondary',
      icon: <AlertTriangle className="size-5 text-amber-500" />,
      content: (
        <div className="space-y-2">
          <p>
            Seu plano atual permite exportar até {formatLimit(maxAllowed)} leads por vez. Você possui {formatLimit(totalCount)} leads registados.
          </p>
          <p className="text-xs text-muted-foreground">
            Exporte a quantidade permitida agora ou faça melhorar o plano para liberar a exportação completa.
          </p>
        </div>
      ),
      actions: [
        {
          label: `Exportar ${formatLimit(Math.min(maxAllowed, totalCount))} leads`,
          onClick: handleConfirm,
          icon: <Download className="size-4" />,
        },
        {
          label: 'Ver planos disponíveis',
          variant: 'outline',
          onClick: openUpgradeFromMessage,
        },
        {
          label: 'Cancelar',
          variant: 'ghost',
          onClick: closeMessageCenter,
        },
      ],
    });
  };

  const triggerDuplicateLeadMessage = () => {
    openMessageCenter('alerts', {
      id: 'duplicate-lead',
      title: 'Lead duplicado detectado',
      tone: 'warning',
      icon: <CopyX className="size-5 text-amber-500" />,
      content: (
        <div className="space-y-2">
          <p>
            Já existe um lead com o mesmo email ou telefone registado. Evite duplicidades revisando os dados antes de criar um novo contacto.
          </p>
          <p className="text-xs text-muted-foreground">
            Dica: utilize a importação incremental ou pesquise o lead antes de cadastrá-lo novamente.
          </p>
        </div>
      ),
      actions: [
        {
          label: 'Ver leads registados',
          variant: 'outline',
          onClick: () => {
            closeMessageCenter();
            setTimeout(() => setCurrentPage('leads'), 80);
          },
        },
      ],
    });
  };

  const triggerMissingEmailMessage = () => {
    openMessageCenter('alerts', {
      id: 'missing-email',
      title: 'Este lead não possui email',
      tone: 'warning',
      icon: <MailX className="size-5 text-amber-500" />,
      content: (
        <div className="space-y-2">
          <p>
            Adicione um email ao lead para habilitar o envio de campanhas e mensagens automáticas.
          </p>
          <p className="text-xs text-muted-foreground">
            Você pode editar o lead diretamente na tabela ou importar uma nova planilha com os dados completos.
          </p>
        </div>
      ),
      actions: [
        {
          label: 'Editar lead',
          variant: 'outline',
          onClick: () => {
            closeMessageCenter();
            setTimeout(() => setModalEditarLead(true), 80);
          },
        },
      ],
    });
  };

  const triggerErrorMessage = (title: string, description: string) => {
    openMessageCenter('alerts', {
      id: `error-${title.toLowerCase().replace(/\s+/g, '-')}`,
      title,
      tone: 'danger',
      icon: <AlertTriangle className="size-5 text-rose-500" />,
      content: (
        <div className="space-y-2">
          <p>{description}</p>
          <p className="text-xs text-muted-foreground">
            Caso o problema persista, tente recarregar a página ou fale com o suporte.
          </p>
        </div>
      ),
      actions: [
        {
          label: 'Atualizar página',
          variant: 'outline',
          onClick: () => window.location.reload(),
        },
      ],
    });
  };

  const triggerSuccessMessage = (title: string, description: string) => {
    openMessageCenter('updates', {
      id: `success-${title.toLowerCase().replace(/\s+/g, '-')}`,
      title,
      tone: 'success',
      icon: <CheckCircle2 className="size-5 text-emerald-500" />,
      content: (
        <div className="space-y-1">
          <p>{description}</p>
        </div>
      ),
    });
  };

  const handleNovoLead = () => {
    const block = getBlockReason();
    if (block) { showPlanBlock(block.code, block.message); return; }
    setModalNovoLead(true);
  };

  const handleEnvioMassa = () => {
    // Check if plan allows mass messages
    const block = getBlockReason();
    if (block) { showPlanBlock(block.code, block.message); return; }
    const currentPlan = user?.plan || 'free';
    if (currentPlan === 'free') {
      triggerPlanLimitMessage('envios');
      return;
    }
    setModalMassMessage(true);
  };

  const handleToggleEmailMarketing = async (leadId: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead?.id) return;

    try {
      const updatedLead = { ...lead, marcado_email: !lead.marcado_email };
      const response = await leadsApi.update(lead.id, updatedLead);

      if (response.success) {
        setLeads(leads.map(l => l.id === leadId ? response.lead : l));
      }
    } catch (error) {
      console.error('Error toggling email marketing:', error);
    }
  };

  const handleEmailMarketing = () => {
    // Não precisa validar aqui, a validação será feita no componente CampaignsPage
    // O usuário pode ter emails manuais mesmo sem leads cadastrados

    if (!podeExecutar('mensagens')) {
      const block = getBlockReason();
      if (block) { showPlanBlock(block.code, block.message); return; }
      triggerPlanLimitMessage('mensagens');
      return;
    }

    setModalEmailMarketing(true);
  };

  const handleEdit = (leadId: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (lead) {
      setLeadSelecionado(lead);
      setModalEditarLead(true);
    }
  };

  // Toque num lead (listas): abre o detalhe
  const handleViewLead = (leadId: string) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    setLeadSelecionado(lead);
    setLeadDetailInitialTab('notas');
    setModalLeadDetail(true);
  };

  const handleChat = async (leadId: string) => {
    if (!podeExecutar('mensagens')) {
      const block = getBlockReason();
      if (block) { showPlanBlock(block.code, block.message); return; }
      triggerPlanLimitMessage('mensagens');
      return;
    }
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    try {
      // Get channel type from lead's origin or channelSource
      const origemLower = ((lead as any).channelSource || lead.origem || 'whatsapp').toLowerCase();
      
      // Map origin to proper channel type
      let channelType = 'whatsapp'; // default
      if (origemLower.includes('telegram')) {
        channelType = 'telegram';
      } else if (origemLower.includes('instagram')) {
        channelType = 'instagram';
      } else if (origemLower.includes('facebook') || origemLower.includes('messenger')) {
        channelType = 'facebook';
      } else if (origemLower.includes('sms') || origemLower.includes('twilio')) {
        channelType = 'twilio_sms';
      } else if (origemLower.includes('email') || origemLower.includes('mail')) {
        channelType = 'email';
      }
      
      console.log('[handleChat] Lead origin:', lead.origem, 'channelSource:', (lead as any).channelSource, '-> mapped to:', channelType);
      
      // Try to find existing conversation for this lead
      const conversations = await conversationsApi.getAll();
      let conversationId: string | undefined;
      
      const existingConv = conversations.find((c: any) => c.lead_id === leadId);
      
      if (existingConv) {
        // Use existing conversation
        conversationId = existingConv.id;
        console.log('[handleChat] Found existing conversation:', conversationId);
      } else {
        // Create new conversation passing leadId directly
        console.log('[handleChat] Creating new conversation for lead:', leadId, 'channel:', channelType);
        const newConv = await conversationsApi.create({ 
          leadId: leadId,  // Pass leadId instead of contactId
          channelType: channelType
        });
        conversationId = newConv.id;
        console.log('[handleChat] Created new conversation:', conversationId);
      }

      // Navigate to inbox with conversation pre-selected
      if (conversationId) {
        setConversationIdToOpen(conversationId);
        setCurrentPage('inbox');
      }
    } catch (error) {
      console.error('[handleChat] Error opening conversation:', error);
      toast.error('Erro ao abrir conversa. Verifique se há um canal ativo configurado.');
    }
  };

  const handleSendEmail = (leadId: string) => {
    if (!podeExecutar('mensagens')) {
      const block = getBlockReason();
      if (block) { showPlanBlock(block.code, block.message); return; }
      triggerPlanLimitMessage('mensagens');
      return;
    }
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    if (!lead.email) {
      setLeadSelecionado(lead);
      triggerMissingEmailMessage();
      return;
    }
    setLeadSelecionado(lead);
    setModalEnviarEmail(true);
  };

  const handleSendEmailSubmit = async (assunto: string, mensagem: string) => {
    // Simular envio de email via API
    console.log('Enviando email:', {
      to: leadSelecionado?.email,
      subject: assunto,
      body: mensagem
    });
    // Aqui você pode integrar com sua API de envio de email
  };

  const performExport = (limit: number) => {
    const effectiveLimit = limit === -1 ? leads.length : Math.min(limit, leads.length);
    const leadsToExport = limit === -1 ? leads : leads.slice(0, effectiveLimit);

    const headers = ['Nome', 'Telefone', 'Interesse', 'Origem', 'Status', 'Data', 'Agente', 'Observacoes'];

    const rows = leadsToExport.map((lead) =>
      [
        lead.nome || '',
        lead.telefone || '',
        lead.interesse || '',
        lead.origem || '',
        lead.status || '',
        lead.data || '',
        lead.agente_atual || '',
        (lead.observacoes || '').replace(/\n/g, ' '),
      ]
        .map((field) => {
          if (field.includes(',') || field.includes('"')) {
            return '"' + field.replace(/"/g, '""') + '"';
          }
          return field;
        })
        .join(',')
    );

    const csv = headers.join(',') + '\n' + rows.join('\n');
    const blob = new Blob([new Uint8Array([0xef, 0xbb, 0xbf]), csv], {
      type: 'text/csv;charset=utf-8',
    });

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads_export_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    toast.success(`Exportação concluída! ${leadsToExport.length} leads exportados.`);
    triggerSuccessMessage('Exportação concluída', `${leadsToExport.length} leads exportados com sucesso.`);
  };

  const handleExport = () => {
    // Export limit comes from DB plan_limits.leads (already loaded in user.limits.leads)
    const maxExport: number = (user?.limits?.leads ?? -1);

    if (maxExport !== -1 && leads.length > maxExport) {
      triggerExportLimitMessage(maxExport, leads.length, () => performExport(maxExport));
      return;
    }

    performExport(maxExport);
  };

  const handleImport = async () => {
    // Check plan enforcement first
    const block = getBlockReason();
    if (block) { showPlanBlock(block.code, block.message); return; }

    // Import limit comes from DB plan_limits.leads (already loaded in user.limits.leads)
    const maxImport: number = (user?.limits?.leads ?? -1);
    const currentPlan = (user?.plan || 'free').toUpperCase();

    // Inform about limits before opening modal
    const confirmMessage = maxImport === -1
      ? `Importação de Leads\n\nSeu plano ${currentPlan} tem importação ILIMITADA! \n\nVocê pode importar quantos leads quiser.\n\nDeseja continuar?`
      : `Importação de Leads\n\nSeu plano ${currentPlan} permite importar até ${maxImport} leads.\n\nO sistema irá importar apenas os primeiros ${maxImport} leads da sua planilha.\n\nDeseja continuar?`;

    const importConfirmed = await confirm(confirmMessage, {
      title: 'Importação de Leads',
      variant: 'info',
      confirmLabel: 'Continuar',
      cancelLabel: 'Cancelar',
    });
    if (!importConfirmed) return;

    setModalImportarLeads(true);
  };

  // ✅ FUNÇÃO PRINCIPAL DE IMPORTAÇÃO DO WHATSAPP
  async function importarContatosWhatsApp() {
    console.log("[IMPORT WA] Disparando...");

    // Check plan enforcement first
    const block = getBlockReason();
    if (block) { showPlanBlock(block.code, block.message); return; }

    // ✅ BUSCAR CONFIGURAÇÕES DO BACKEND (específicas por usuário)
    let userSettings: any = null;
    try {
      console.log('[IMPORT WA] 🔍 Buscando configurações do backend...');
      const response = await userApi.getSettings();
      console.log('[IMPORT WA] ✅ Resposta bruta do backend:', response);

      // Parse settings if they come as JSON strings in the 'settings' object
      userSettings = response?.settings || response || {};

      // Parse JSON strings if needed
      if (userSettings) {
        Object.keys(userSettings).forEach(key => {
          if (typeof userSettings[key] === 'string' && (userSettings[key].startsWith('{') || userSettings[key].startsWith('['))) {
            try {
              userSettings[key] = JSON.parse(userSettings[key]);
            } catch (e) {
              // Not JSON, keep as string
            }
          }
        });
      }

      console.log('[IMPORT WA] ✅ Configurações parseadas:', userSettings);
    } catch (error) {
      console.error('[IMPORT WA] ❌ Erro ao buscar configurações:', error);
      toast.error('Erro ao carregar definições. Por favor, tente novamente.');
      return;
    }

    const webhookUrl = userSettings?.n8n_whatsapp_import_url;

    if (!webhookUrl) {
      console.error("[IMPORT WA] Webhook não configurado!");
      toast.error('Webhook N8N não configurado! Configure o "Webhook - Importação de Contactos do WhatsApp" na aba Integrações.');
      return;
    }

    // ✅ GERAR instância Evolution usando padrão leadflow_{userId}
    // Cada usuário tem sua própria instância isolada
    const evolutionInstance = `leadflow_${user.id.replace(/[^a-zA-Z0-9]/g, '_')}`;

    console.log('[IMPORT WA] 📱 Usando instância Evolution (auto-gerada):', evolutionInstance);
    console.log('[IMPORT WA] 🔗 Usando webhook:', webhookUrl);

    const payload = {
      instancia: evolutionInstance,
      leadflow_userId: user.id,
      userId: user.id,
      action: "listar-contatos"
    };

    console.log("[IMPORT WA] URL:", webhookUrl);
    console.log("[IMPORT WA] Payload:", payload);

    setModalImportandoWhatsApp(true);
    toast.info('A enviar requisição para N8N...', { duration: 2000 });

    try {
      const resposta = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!resposta.ok) {
        throw new Error(`Erro na requisição: ${resposta.status}`);
      }

      const dados = await resposta.json();
      console.log("[IMPORT WA] Resposta N8N:", dados);

      setModalImportandoWhatsApp(false);

      // Verificar se retornou contatos (compatível com response.contatos OU response.data)
      const contatos = dados.contatos || dados.data || [];
      
      if (!Array.isArray(contatos) || contatos.length === 0) {
        toast.warning('Nenhum contacto foi retornado pelo N8N');
        return;
      }

      toast.success(` ${contatos.length} contacto(s) recebido(s) do N8N!`);

      // Filtrar contatos válidos antes de mostrar
      const contatosFiltrados = contatos.filter(c =>
        c &&
        c.NumeroLimpo &&
        c.NumeroLimpo !== "" &&
        c.EhValido === true
      );

      if (contatosFiltrados.length === 0) {
        toast.warning('Nenhum contacto válido encontrado após filtragem');
        console.log('[IMPORT WA] Contatos filtrados:', contatosFiltrados);
        console.log('[IMPORT WA] Total recebidos:', contatos.length);
        return;
      }

      // Normalizar contatos para o formato esperado pelo PreviewModal
      const contatosNormalizados = contatosFiltrados.map(c => {
        // ✅ Se não tiver nome, usar o número como nome
        const nome = (c.Nome && c.Nome.trim() !== '') || (c.nome && c.nome.trim() !== '')
          ? (c.Nome || c.nome)
          : (c.NumeroLimpo || c.numero || 'Sem nome');
        
        return {
          nome: nome,
          numero: c.NumeroLimpo || c.numero || c.telefone || '',
          avatar: c.Avatar || c.avatar || null,
          // Adicionar campos extras para referência
          ehValido: c.EhValido,
          numeroOriginal: c.NumeroOriginal || c.numero
        };
      });

      console.log('[IMPORT WA] Contatos normalizados:', contatosNormalizados.length);
      console.log('[IMPORT WA] Sample:', contatosNormalizados.slice(0, 3));

      // ✅ Mostrar modal de preview para seleção manual
      setWhatsappContacts(contatosNormalizados);
      setWhatsappImportKey(Date.now()); // Forçar remontagem do modal
      setModalPreviewWhatsApp(true);

      toast.info(` ${contatosFiltrados.length} contacto(s) válido(s) prontos para importação. Selecione os que deseja importar.`, { duration: 4000 });

    } catch (err) {
      console.error("[IMPORT WA] Erro no fetch:", err);
      setModalImportandoWhatsApp(false);
      toast.error('Erro ao importar contactos do WhatsApp');
    }
  }

  // ✅ MANTER handleImportWhatsApp PARA COMPATIBILIDADE (chama a nova função)
  const handleImportWhatsApp = () => {
    importarContatosWhatsApp();
  };

  const handleConfirmWhatsAppImport = async (contacts: any[]) => {
    try {
      console.log('[WhatsApp Confirm] 💾 Salvando contatos do WhatsApp via importação em massa...');
      console.log('[WhatsApp Confirm] 📊 Total de contatos a importar:', contacts.length);
      console.log('[WhatsApp Confirm] 📋 Sample de contatos recebidos:', contacts.slice(0, 3));
      
      // ✅ FUNÇÃO PARA NORMALIZAR NÚMERO DE TELEFONE COM CÓDIGO DO PAÍS
      const normalizePhoneNumber = (phone: string): string => {
        if (!phone) return '';
        
        // Remover espaços e caracteres especiais
        const cleaned = phone.replace(/[\s\-\(\)]/g, '');
        
        // Se já tem + no início, retornar como está
        if (cleaned.startsWith('+')) {
          console.log(`[WhatsApp Normalize] ✅ Número já tem +: ${cleaned}`);
          return cleaned;
        }
        
        // Se começa com 258 (Moçambique sem +), adicionar +
        if (cleaned.startsWith('258')) {
          console.log(`[WhatsApp Normalize] ➕ Adicionando + ao 258: ${cleaned} → +${cleaned}`);
          return `+${cleaned}`;
        }
        
        // Se começa com 55 (Brasil), adicionar +
        if (cleaned.startsWith('55') && cleaned.length >= 12) {
          console.log(`[WhatsApp Normalize] ➕ Adicionando + ao Brasil: ${cleaned} → +${cleaned}`);
          return `+${cleaned}`;
        }
        
        // Se não tem código de país, assumir Moçambique (+258) como padrão
        // Números moçambicanos têm 9 dígitos após o código do país
        if (cleaned.length === 9) {
          console.log(`[WhatsApp Normalize] 🇲🇿 Adicionando código Moçambique: ${cleaned} → +258${cleaned}`);
          return `+258${cleaned}`;
        }
        
        // Se tem 12-13 dígitos sem +, provavelmente já tem código, só adicionar +
        if (cleaned.length >= 12) {
          console.log(`[WhatsApp Normalize] ➕ Número longo sem +, adicionando: ${cleaned} → +${cleaned}`);
          return `+${cleaned}`;
        }
        
        // Caso padrão: adicionar código Moçambique
        console.log(`[WhatsApp Normalize] 🇲🇿 Número desconhecido, assumindo Moçambique: ${cleaned} → +258${cleaned}`);
        return `+258${cleaned}`;
      };
      
      const leadsToImport = contacts.map(contact => {
        // ✅ Garantir que o nome não seja "Sem nome" vazio
        const nome = contact.nome && contact.nome !== 'Sem nome' && contact.nome.trim() !== '' 
          ? contact.nome 
          : contact.numero || 'Contato WhatsApp';
        
        // ✅ NORMALIZAR NÚMERO COM CÓDIGO DO PAÍS
        const numeroOriginal = contact.numero || contact.telefone || '';
        const numeroNormalizado = normalizePhoneNumber(numeroOriginal);
        
        console.log('[WhatsApp Confirm] Mapeando contato:', { 
          original: contact.nome, 
          final: nome, 
          numeroOriginal: numeroOriginal,
          numeroNormalizado: numeroNormalizado
        });
        
        return {
          nome: nome,
          telefone: numeroNormalizado, // ✅ USAR NÚMERO NORMALIZADO
          email: contact.email || '', // WhatsApp contacts usually don't have email
          avatarUrl: contact.avatar || null,
          origem: 'whatsapp',
          status: 'Novo',
          agente_atual: 'comercial',
          data: new Date().toISOString().split('T')[0],
        };
      });

      console.log('[WhatsApp Confirm] 📝 Leads preparados para importação:', leadsToImport.slice(0, 3));

      console.log('[WhatsApp Confirm] 🚀 Enviando para API local (bulk import)...');
      const result = await leadsApi.importBulk(leadsToImport, { source: 'whatsapp' });
      console.log('[WhatsApp Confirm] ✅ Importação concluída:', result);

      setModalPreviewWhatsApp(false);
      setWhatsappContacts([]);
      await carregarLeads();
      
      const importedCount = result.imported || contacts.length;
      const duplicatesSkipped = result.duplicatesSkipped || 0;
      
      if (duplicatesSkipped > 0) {
        toast.success(` ${importedCount} contacto(s) importado(s) do WhatsApp! (${duplicatesSkipped} duplicados ignorados)`);
      } else {
        toast.success(` ${importedCount} contacto(s) importado(s) do WhatsApp com sucesso!`);
      }
      
      console.log('[WhatsApp Confirm] ✅ Importação otimizada concluída via backend Express');
    } catch (error: any) {
      console.error('[WhatsApp Confirm] ❌ Erro ao salvar contatos do WhatsApp:', error);
      toast.error(error.message || 'Erro ao guardar contactos. Tente novamente.');
    }
  };

  const handleRemoveDuplicates = async () => {
    try {
      // Confirmar ação com o usuário
      const confirmRemove = await confirm(
        'Esta ação irá remover todos os leads duplicados (com mesmo email ou telefone). Apenas a versão mais antiga de cada lead será mantida.',
        {
          title: 'Remover Leads Duplicados',
          variant: 'danger',
          confirmLabel: 'Remover Duplicados',
          cancelLabel: 'Cancelar',
        }
      );
      
      if (!confirmRemove) {
        return;
      }
      
      setLoading(true);
      toast.info('Procurando leads duplicados...');
      const data = await leadsApi.removeDuplicates();
      console.log('[Remove Duplicates] Response:', data);
      
      // Recarregar leads
      await carregarLeads();
      
      // Atualizar dados do usuário para refletir a nova contagem
      if (onRefreshUser) {
        await onRefreshUser();
      }
      
      // Mostrar resultado
      if (data.removed > 0) {
        toast.success(
          ` ${data.removed} lead(s) duplicado(s) removido(s)!\n\n` +
          `${data.remaining} leads únicos restantes.`,
          { duration: 5000 }
        );
      } else {
        toast.info('Nenhum lead duplicado encontrado!', { duration: 3000 });
      }
      
    } catch (error: any) {
      console.error('[Remove Duplicates] Error:', error);
      toast.error(`Erro ao remover duplicados:${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleUpgradeSuccess = (updatedUser: any) => {
    onUserUpdate(updatedUser);
  };

  // Função para aplicar filtros aos cards e gráficos
  const handleAplicarFiltros = (novosFiltros: { origem: string; status: string; busca: string }) => {
    setFiltrosAplicados(novosFiltros);
  };

  // Filtrar leads baseado nos filtros aplicados
  const leadsFiltradosPorFiltros = useMemo(() => {
    return leads.filter((lead) => {
      const matchOrigem = !filtrosAplicados.origem || lead.origem === filtrosAplicados.origem;
      const matchStatus = !filtrosAplicados.status || lead.status === filtrosAplicados.status;
      const matchBusca =
        !filtrosAplicados.busca ||
        lead.nome?.toLowerCase().includes(filtrosAplicados.busca.toLowerCase()) ||
        lead.telefone?.includes(filtrosAplicados.busca) ||
        lead.interesse?.toLowerCase().includes(filtrosAplicados.busca.toLowerCase());

      return matchOrigem && matchStatus && matchBusca;
    });
  }, [leads, filtrosAplicados]);

  // Calcular estatísticas baseadas nos leads filtrados
  const stats = useMemo(() => {
    const hoje = new Date().toISOString().split('T')[0];
    const calculatedStats = {
      total: leadsFiltradosPorFiltros.length,
      novosHoje: leadsFiltradosPorFiltros.filter((l) => {
        // Usar capturedAt (quando disponível) ou fallback para data/createdAt
        const leadDate = l.capturedAt || l.data || l.createdAt || '';
        return leadDate.startsWith(hoje);
      }).length,
      convertidos: leadsFiltradosPorFiltros.filter((l) => {
        const st = l.status?.toLowerCase();
        return st === 'convertido' || st === 'converted';
      }).length,
    };

    return calculatedStats;
  }, [leadsFiltradosPorFiltros, leads.length, user?.usage?.leads]);

  // Extrair origens e status únicos
  const origens = useMemo(() => {
    return Array.from(new Set(leads.map((l) => l.origem).filter(Boolean)));
  }, [leads]);

  const statusList = useMemo(() => {
    return Array.from(new Set(leads.map((l) => l.status).filter(Boolean)));
  }, [leads]);

  // Calcular limites para o widget
  const limites = {
    leads: user?.limits?.leads || 0,
    mensagens: user?.limits?.messages || 0,
    envios: user?.limits?.massMessages || 0,
    usados: {
      leads: user?.usage?.leads || 0,
      mensagens: user?.usage?.messages || 0,
      envios: user?.usage?.massMessages || 0,
    },
  };

  // Calcular dias restantes do plano
  const calcularDiasRestantes = () => {
    // Check all possible field names (backend may return either)
    const expiresRaw = user?.planExpiresAt || user?.plan_expires_at || user?.trialEndsAt;
    if (expiresRaw && user?.plan && user.plan !== 'free') {
      const agora = new Date();
      const fimPlano = new Date(expiresRaw);
      const diffTime = fimPlano.getTime() - agora.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return Math.max(0, diffDays);
    }
    return null;
  };

  const diasRestantes = calcularDiasRestantes();
  
  // Verificar se o plano está expirado
  const planExpired = diasRestantes !== null && diasRestantes === 0;

  const handleTourComplete = () => {
    localStorage.setItem('leadsflow_tour_completed', 'true');
    setShowTour(false);
    toast.success('Visita guiada concluído! Agora você conhece todas as funcionalidades!');
  };

  const handleTourSkip = () => {
    localStorage.setItem('leadsflow_tour_completed', 'true');
    setShowTour(false);
    toast.info('Visita guiada ignorada. Pode recomeçá-la a qualquer momento.');
  };

  const handleStartTour = () => {
    handleNavigate('dashboard');
    setTimeout(() => {
      setShowTour(true);
    }, 500);
  };

  return (
    <div
      // overflow-x-clip (e não hidden): hidden criaria um contentor de scroll e o
      // cabeçalho sticky deixaria de ficar fixo ao rolar a página.
      className="min-h-screen transition-colors duration-200 bg-background overflow-x-clip"
    >
      {/* Background Grid - Dark Mode Only - Removido para ter fundo preto puro */}
      
      {/* Gradient Orbs - Removidos para ter fundo preto puro sem tom azulado */}

      {/* Sidebar - Desktop sempre visível, Mobile drawer */}
      <NavigationSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        currentPage={currentPage}
        onNavigate={handleNavigate}
        isDark={isDark}
        onToggleTheme={handleToggleTheme}
        isMobile={isMobile}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(prev => !prev)}
        user={user}
        language={language}
        onLogout={onLogout}
        onHelp={handleStartTour}
        onFeedback={() => setShowFeedback(true)}
        sidebarWidth={sidebarWidth}
        onSidebarWidthChange={setSidebarWidth}
      />

      {/* Main Content Wrapper - margin-based layout, adapts to sidebar width */}
      <div
        className={`min-w-0 flex flex-col transition-[margin] duration-300 ease-out ${
          currentPage === 'inbox' || currentPage === 'inbox-settings' || currentPage === 'ai-assistants' || currentPage === 'automations'
            ? 'overflow-hidden'
            : 'min-h-screen'
        }`}
        style={{
          marginLeft: isMobile ? 0 : isSidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : sidebarWidth,
          height: (currentPage === 'inbox' || currentPage === 'inbox-settings' || currentPage === 'ai-assistants' || currentPage === 'automations')
            ? isMobile ? 'calc(100dvh - 64px)' : '100dvh'
            : undefined,
        }}
      >
        <div className={`dashboard-container flex flex-col flex-1 min-w-0 min-h-0 bg-background ${
          currentPage === 'inbox' || currentPage === 'inbox-settings' || currentPage === 'ai-assistants' || currentPage === 'automations'
            ? 'overflow-hidden'
            : ''
        }`}>
          {/* Header */}
          <RefactoredHeader
            user={user}
            isDark={isDark}
            currentPage={currentPage}
            onNavigate={handleNavigate}
            onToggleTheme={handleToggleTheme}
            onThemeChange={handleThemeChange}
            themeMode={themeMode}
            onNovoLead={handleNovoLead}
            onEmailMarketing={handleEmailMarketing}
            onMassMessage={handleEnvioMassa}
            onSettings={() => handleNavigate('account')}
            onLogout={onLogout}
            isSidebarOpen={isSidebarOpen}
            onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            onStartTour={handleStartTour}
            language={language}
            onLanguageChange={handleLanguageChange}
            pageTitle={pageTitle}
            onBack={isTabPage ? undefined : goBack}
          />

          {/* ⚠️ BANNER DE BACKEND OFFLINE */}
          {isBackendOffline && isOnline && (
            <div role="alert" className="bg-amber-500/10 border-b border-amber-500/30 px-4 sm:px-6 py-3">
              <div className="max-w-[1720px] mx-auto flex items-center gap-3">
                <AlertCircle aria-hidden className="w-5 h-5 flex-shrink-0 text-amber-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">Sem ligação ao servidor</p>
                  <p className="text-xs text-muted-foreground">
                    Verifique a sua internet. As alterações não serão guardadas até a ligação voltar.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setIsBackendOffline(false);
                    void carregarLeads();
                  }}
                  className="flex-shrink-0 h-9 px-3 rounded-lg text-sm font-medium bg-amber-500 text-white active:bg-amber-600 transition-colors"
                >
                  Tentar de novo
                </button>
                <button
                  onClick={() => setIsBackendOffline(false)}
                  aria-label="Fechar aviso"
                  className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Main Content */}
          <main className={`flex-1 min-w-0 ${
            currentPage === 'inbox' || currentPage === 'inbox-settings' || currentPage === 'ai-assistants' || currentPage === 'automations'
              ? 'overflow-hidden flex flex-col min-h-0'
              : isMobile ? 'pb-24' : ''
          }`}>
            <PullToRefresh onRefresh={handlePullRefresh} disabled={!isMobile || !isOnline} />
            <PageContainer
              className={`w-full min-w-0 ${
                currentPage === 'inbox' || currentPage === 'inbox-settings' || currentPage === 'ai-assistants' || currentPage === 'automations'
                  ? 'h-full flex-1 min-h-0 overflow-hidden'
                  : ''
              }`}
              maxWidth={
                currentPage === 'inbox' || currentPage === 'inbox-settings' || currentPage === 'ai-assistants' || currentPage === 'automations'
                  ? false
                  : 1720
              }
              px={
                currentPage === 'inbox' || currentPage === 'inbox-settings' || currentPage === 'ai-assistants' || currentPage === 'automations'
                  ? 0
                  : { xs: 3, sm: 6, lg: 10 }
              }
              py={
                currentPage === 'inbox' || currentPage === 'inbox-settings' || currentPage === 'ai-assistants' || currentPage === 'automations'
                  ? 0
                  : { xs: 4, sm: 6, lg: 8 }
              }
            >
            {/* Transição entre páginas: entra com fade + 8px (sem esperar pela saída da
                anterior). Depois da animação o transform fica "none", para não afetar
                elementos position:fixed (modais) dentro das páginas. */}
            <motion.div
              key={`${currentPage}-${reconnectKey}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
              className={
                currentPage === 'inbox' || currentPage === 'inbox-settings' || currentPage === 'ai-assistants' || currentPage === 'automations'
                  ? 'h-full flex flex-col min-h-0'
                  : undefined
              }
            >
            {!isOnline ? (
              <OfflineState onRetry={() => setReconnectKey((k) => k + 1)} />
            ) : (<>
            {/* Renderizar conteúdo baseado na página atual */}
            {currentPage === 'dashboard' && (
              <div className="space-y-4 sm:space-y-6 lg:space-y-8">
                {/* Widget de Planos */}
                {loading && leads.length === 0 ? (
                  <SkeletonLimitCards />
                ) : (
                  <PlanoWidget
                    limites={limites}
                    diasRestantes={diasRestantes}
                    planExpiresAt={user?.plan_expires_at ?? null}
                    subscriptionStatus={user?.subscription_status ?? null}
                    onUpgrade={handleUpgrade}
                    userPlan={user?.plan || 'free'}
                    isTrial={user?.isTrial || false}
                  />
                )}

                {/* Cards Principais de Estatísticas */}
                {loading && leads.length === 0 ? (
                  <SkeletonStatCardsRow count={4} />
                ) : (
                  <>
                    {loading && <div className="flex justify-end"><UpdatingBadge /></div>}
                    <MainStatsCards
                      totalLeads={stats.total}
                      leadsNovosHoje={stats.novosHoje}
                      leadsFechados={stats.convertidos}
                      limiteLeads={limites.leads === -1 ? 999999 : limites.leads}
                    />
                  </>
                )}

                {/* Cards Secundários */}
                {(!loading || leads.length > 0) && (
                  <StatsCards
                    totalLeads={stats.total}
                    leadsNovosHoje={stats.novosHoje}
                    leadsFechados={stats.convertidos}
                    leads={leadsFiltradosPorFiltros as any}
                    limites={limites}
                    isDark={isDark}
                  />
                )}

                {/* Gráficos detalhados: só em Relatórios (Início é o resumo) */}
                <PageFab label="Novo lead" onClick={handleNovoLeadFab} />

                {/* Resumo: origem dos leads (lista), últimos leads e assistente de vendas */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6 items-start">
                  <div className="xl:col-span-2 flex flex-col gap-4 sm:gap-6">
                    <LatestLeads
                      leads={leads}
                      onViewAll={() => handleNavigate('leads')}
                      onOpen={(lead) => handleViewLead(lead.id!)}
                      onMessage={(lead) => handleChat(lead.id!)}
                      onDelete={(lead) => handleDelete(lead.id!)}
                    />
                    <OriginsList leads={leads} />
                  </div>
                  <div className="xl:col-span-1 flex flex-col">
                    <AIIntelligencePanel
                      onNavigateToRemarketing={() => setCurrentPage('ai-insights')}
                    />
                  </div>
                </div>
              </div>
            )}

            {currentPage === 'leads' && (
              <div className="space-y-5 sm:space-y-6 xl:space-y-8">
                <PageHeader
                  title="Leads"
                  description="Todos os seus contactos e oportunidades"
                  icon={Users}
                  create={{ label: 'Novo lead', onClick: handleNovoLeadFab }}
                />

                {/* Tabela de Leads */}
                <LeadsTable
                  leads={leads}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onChat={handleChat}
                  onExport={handleExport}
                  onImport={handleImport}
                  onImportWhatsApp={handleImportWhatsApp}
                  onRemoveDuplicates={handleRemoveDuplicates}
                  onView={handleViewLead}
                  onNovoLead={handleNovoLeadFab}
                  onToggleEmailMarketing={handleToggleEmailMarketing}
                  onSendEmail={handleSendEmail}
                  onCampaigns={() => {
                    const b = getBlockReason();
                    if (b) { showPlanBlock(b.code, b.message); return; }
                    setChannelSelectorOpen(true);
                  }}
                  userPlan={user?.plan || 'free'}
                  planExpired={planExpired}
                  limitReached={!!getBlockReason()}
                  leadsLimitReached={(user?.limits?.leads ?? 0) > 0 && (user?.limits?.leads ?? 0) !== -1 && (user?.usage?.leads ?? 0) >= (user?.limits?.leads ?? 0)}
                  campaignsLimitReached={(user?.limits?.massMessages ?? 0) > 0 && (user?.limits?.massMessages ?? 0) !== -1 && (user?.usage?.massMessages ?? 0) >= (user?.limits?.massMessages ?? 0)}
                />
              </div>
            )}

            {currentPage === 'campaigns' && (
              <CampaignsPage
                leads={leads as any}
                isDark={isDark}
                userPlan={(user?.plan || user?.subscription_plan || 'free') as 'free' | 'business' | 'enterprise'}
              />
            )}

            {currentPage === 'remarketing' && (
              <RemarketingPage />
            )}

            {currentPage === 'ai-insights' && (
              <AIInsightsPage />
            )}

            {(currentPage === 'inbox' || currentPage === 'inbox-settings' || currentPage === 'ai-assistants' || currentPage === 'voice-agents' || currentPage === 'automations') && (
              <InboxPage
                isDark={isDark}
                leads={leads}
                currentSubPage={currentPage}
                onNavigate={handleNavigate}
                conversationIdToOpen={conversationIdToOpen}
                onConversationOpened={() => setConversationIdToOpen(null)}
              />
            )}

            {currentPage === 'funnel' && (
              <div className="space-y-5 sm:space-y-6 xl:space-y-8">
                {loading && leads.length === 0 ? (
                  <>
                    {/* Mesmo cabeçalho do SalesFunnel, para a página não "saltar" ao carregar */}
                    <PageHeader title="Funil de Vendas" description="Arraste os leads entre as etapas do funil" icon={Workflow} />
                    <SkeletonFunnel />
                  </>
                ) : (
                <SalesFunnel
                  leads={leads as any}
                  onUpdateLeadStatus={async (leadId, newStatus) => {
                    // Atualização otimista: move o lead no estado local imediatamente
                    const leadIndex = leads.findIndex(l => l.id === leadId);
                    if (leadIndex === -1) return;
                    const oldLead = leads[leadIndex];
                    const updatedLead = { ...oldLead, status: newStatus };
                    // Atualiza localmente
                    const prevLeads = [...leads];
                    const newLeads = [...leads];
                    newLeads[leadIndex] = updatedLead;
                    setLeads(newLeads);
                    try {
                      const saved = await handleEditarLead(updatedLead, { silent: true });
                      if (!saved) throw new Error('update failed');
                      // 🔔 Disparar evento de tracking (Meta Pixel + GA4)
                      trackLeadStatusChange(newStatus, {
                        id: leadId,
                        name: oldLead.name,
                        email: oldLead.email,
                        phone: oldLead.phone || oldLead.whatsapp,
                        source: oldLead.source,
                      });
                      toast.success(`Lead movido para ${formatLeadStatus(newStatus)}`);
                    } catch (error) {
                      // Reverte se falhar
                      setLeads(prevLeads);
                      toast.error('Erro ao mover lead. Mudança revertida.');
                    }
                  }}
                  onEditLead={(lead) => {
                    setLeadSelecionado(lead);
                    setModalEditarLead(true);
                  }}
                  onDeleteLead={async (leadId) => {
                    const deleteConfirmed = await confirm('Tem certeza que deseja apagar este lead permanentemente?', {
                      title: 'Apagar Lead',
                      variant: 'danger',
                      confirmLabel: 'Apagar',
                      cancelLabel: 'Cancelar',
                    });
                    if (deleteConfirmed) {
                      await handleDeletarLead(leadId);
                    }
                  }}
                  onResetLeadToInitial={async (leadId) => {
                    try {
                      await handleAtualizarStatusLead(leadId, 'novo');
                      toast.success('Lead movido para a etapa inicial');
                    } catch (error) {
                      toast.error('Erro ao mover lead');
                    }
                  }}
                  onCallLead={(lead) => {
                    window.location.href = `tel:${lead.telefone}`;
                  }}
                  onEmailLead={(lead) => {
                    setLeadSelecionado(lead);
                    setModalEnviarEmail(true);
                  }}
                  onWhatsAppLead={(lead) => {
                    setLeadSelecionado(lead);
                    setSelectedLeadsForMessage([lead.id]);
                    setModalSendMessage(true);
                  }}
                  onViewLeadDetails={(lead, initialTab) => {
                    setLeadSelecionado(lead);
                    setLeadDetailInitialTab(initialTab || 'notas');
                    setModalLeadDetail(true);
                  }}
                  isDark={isDark}
                />
                )}
              </div>
            )}

            {currentPage === 'analytics' && (
              <div className="space-y-5 sm:space-y-6 xl:space-y-8">
                <PageHeader
                  title="Relatórios"
                  description="Desempenho dos seus leads e vendas"
                  icon={BarChart2}
                  actions={<PageAction variant="primary" icon={FileText} label="Exportar" onClick={() => setModalReportExporter(true)} />}
                />
                <AdvancedAnalytics leads={leads as any} isDark={isDark} />
              </div>
            )}

            {currentPage === 'tasks' && (
              <div className="space-y-5 sm:space-y-6 xl:space-y-8">
                <TaskManager leads={leads} isDark={isDark} />
              </div>
            )}

            {currentPage === 'plan' && (
              <PlanPage user={user} onUpgrade={handleUpgrade} diasRestantes={diasRestantes} />
            )}

            {currentPage === 'integrations' && (
              <IntegrationsPage user={user} />
            )}

            {currentPage === 'security' && (
              <AccountSettingsPage user={user} onUpdateUser={onUserUpdate} initialTab="security" />
            )}

            {currentPage === 'account' && (
              <AccountSettingsPage
                user={user}
                onUpdateUser={onUserUpdate}
                onOpenChannels={() => handleNavigate('inbox-settings')}
                onHelp={handleStartTour}
                onFeedback={() => setShowFeedback(true)}
                onLogout={onLogout}
              />
            )}

            {currentPage === 'admin' && (
              <AdminPage />
            )}
            </>)}
            </motion.div>
          </PageContainer>

          {/* Footer - hidden on inbox/full-height pages and on mobile (bottom nav layout / app) */}
          {!isMobile && currentPage !== 'inbox' && currentPage !== 'inbox-settings' && currentPage !== 'ai-assistants' && currentPage !== 'automations' && currentPage !== 'voice-agents' && currentPage !== 'inbox-team' && (
            <footer className="border-t border-border mt-12 py-6">
              <PageContainer maxWidth={1280} px={{ xs: 4, sm: 6, lg: 8 }}>
                <div className="flex flex-col md:flex-row justify-between items-center gap-3 text-sm text-muted-foreground">
                  <p className="text-center md:text-left">
                    © {new Date().getFullYear()} <span className="font-bold text-foreground">LeadsFlow</span> <span className="text-foreground/80">SAAS</span>. Todos os direitos reservados.
                  </p>
                  <p className="text-center md:text-right">
                    Desenvolvido por <span className="text-blue-600 dark:text-blue-400 font-medium">PersonalCreativeLda</span>
                  </p>
                </div>
              </PageContainer>
            </footer>
          )}
        </main>
      </div>

      {/* ── Mobile bottom navigation bar ─────────────────────────────── */}
      {isMobile && (
        <nav className="fixed bottom-0 left-0 right-0 z-[45] bg-card border-t border-border flex items-stretch h-16 safe-area-pb"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          {[
            { page: 'dashboard', icon: <LayoutDashboard size={20} />, label: 'Início' },
            { page: 'leads',     icon: <Users size={20} />,           label: 'Leads' },
            { page: 'inbox',     icon: <MessageSquare size={20} />,   label: 'Conversas' },
            { page: 'analytics', icon: <BarChart2 size={20} />,       label: 'Relatórios' },
          ].map(({ page, icon, label }) => {
            const active = currentPage === page || (page === 'inbox' && ['inbox','inbox-settings','inbox-team','automations'].includes(currentPage));
            return (
              <button
                key={page}
                onClick={() => handleNavigate(page as any)}
                aria-current={active ? 'page' : undefined}
                className={`group flex-1 flex flex-col items-center justify-center gap-1 text-[12px] font-medium transition-colors touch-manipulation ${
                  active ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                {/* Indicador "pílula" do item ativo (Material 3) + feedback ao tocar */}
                <span aria-hidden className={`relative flex items-center justify-center w-14 h-7 rounded-full transition-colors duration-150 ${
                  active ? '' : 'group-active:bg-muted'
                }`}>
                  {/* Pílula partilhada: desliza com mola até ao separador ativo */}
                  {active && (
                    <motion.span
                      layoutId="bottom-nav-pill"
                      className="absolute inset-0 rounded-full bg-primary/15"
                      transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                    />
                  )}
                  <motion.span className="relative" whileTap={{ scale: 0.85 }}>
                    {icon}
                  </motion.span>
                </span>
                {label}
              </button>
            );
          })}
          <button
            onClick={() => setIsSidebarOpen(true)}
            aria-expanded={isSidebarOpen}
            className="group flex-1 flex flex-col items-center justify-center gap-1 text-[12px] font-medium text-muted-foreground transition-colors touch-manipulation"
          >
            <span aria-hidden className="flex items-center justify-center w-14 h-7 rounded-full transition-colors duration-150 group-active:bg-muted">
              <Menu size={20} />
            </span>
            Menu
          </button>
        </nav>
      )}

      {/* Modais */}
      <NovoLeadModal
        isOpen={modalNovoLead}
        onClose={() => setModalNovoLead(false)}
        onSave={handleAdicionarLead}
      />

      <EditarLeadModal
        isOpen={modalEditarLead}
        lead={leadSelecionado}
        onClose={() => {
          setModalEditarLead(false);
          setLeadSelecionado(null);
        }}
        onSave={async (lead) => { await handleEditarLead(lead); }}
      />

      <LeadDetailModal
        isOpen={modalLeadDetail}
        lead={leadSelecionado}
        onClose={() => {
          setModalLeadDetail(false);
          setLeadSelecionado(null);
        }}
        isDark={isDark}
        initialTab={leadDetailInitialTab}
        onLeadUpdated={(updatedLead) => {
          // Update lead in the leads array so funnel shows updated deal_value
          setLeads(leads.map(l => l.id === updatedLead.id ? updatedLead : l));
          // Also update leadSelecionado if it's the same lead
          if (leadSelecionado?.id === updatedLead.id) {
            setLeadSelecionado(updatedLead);
          }
        }}
      />

      <ChatModal
        isOpen={modalChat}
        lead={leadSelecionado}
        onClose={() => {
          setModalChat(false);
          setLeadSelecionado(null);
        }}
        webhookUrl=""
      />

      <MassMessageModal
        isOpen={modalMassMessage}
        leads={leads}
        onClose={() => setModalMassMessage(false)}
        webhookUrl=""
        userPlan={user?.plan}
        onUpgrade={() => {
          setModalMassMessage(false);
          setModalUpgrade(true);
        }}
      />

      <MessageCenterModal
        open={messageCenterOpen}
        onClose={closeMessageCenter}
        sections={messageCenterSections}
        activeTab={messageCenterTab}
        onTabChange={(tab) => setMessageCenterTab(tab)}
        highlightMessageId={highlightedMessageId}
      />

      <UpgradeModal
        isOpen={modalUpgrade}
        onClose={() => setModalUpgrade(false)}
        currentPlan={user?.plan || 'free'}
        onUpgradeSuccess={handleUpgradeSuccess}
      />

      {/* Plan enforcement — shown on-demand when user tries to access a blocked feature */}
      {showEnforcementModal && activeEnforcementBlock && (
        <PlanEnforcementModal
          code={activeEnforcementBlock.code}
          message={activeEnforcementBlock.message}
          currentPlan={user?.plan || 'free'}
          onClose={() => {
            setShowEnforcementModal(false);
            setActiveEnforcementBlock(null);
            onEnforcementBlockCleared?.();
          }}
          onUpgradeSuccess={(updatedUser) => {
            setShowEnforcementModal(false);
            setActiveEnforcementBlock(null);
            onEnforcementBlockCleared?.();
            handleUpgradeSuccess(updatedUser);
          }}
        />
      )}

      <SendMessageModal
        isOpen={modalSendMessage}
        onClose={() => {
          setModalSendMessage(false);
          setSelectedLeadsForMessage([]);
        }}
        leadIds={selectedLeadsForMessage}
        leadNames={selectedLeadsForMessage.map(id => {
          const lead = leads.find(l => l.id === id);
          return lead?.nome || 'Lead sem nome';
        })}
        isMassMessage={selectedLeadsForMessage.length > 1}
        userPlan={user?.plan}
        onSuccess={() => {
          carregarLeads();
        }}
      />

      <ImportarLeadsModal
        isOpen={modalImportarLeads}
        onClose={() => setModalImportarLeads(false)}
        onSuccess={carregarLeads}
        userPlan={user?.plan || 'free'}
        importLimits={{
          free: 500,
          business: 3000,
          enterprise: -1
        }}
      />

      <ImportandoWhatsAppModal
        isOpen={modalImportandoWhatsApp}
      />

      {(() => {
        console.log('[Dashboard RENDER] ================================================');
        console.log('[Dashboard RENDER] 🎨 Renderizando PreviewWhatsAppLeadsModal');
        console.log('[Dashboard RENDER] 🚪 isOpen:', modalPreviewWhatsApp);
        console.log('[Dashboard RENDER] 🔑 Key:', whatsappImportKey);
        console.log('[Dashboard RENDER] 📊 whatsappContacts.length sendo passado:', whatsappContacts.length);
        console.log('[Dashboard RENDER] 📋 whatsappContacts[0]:', whatsappContacts[0]);
        console.log('[Dashboard RENDER] 📋 whatsappContacts[1]:', whatsappContacts[1]);
        console.log('[Dashboard RENDER] 📋 whatsappContacts[2]:', whatsappContacts[2]);
        console.log('[Dashboard RENDER] ================================================');
        return null;
      })()}
      <PreviewWhatsAppLeadsModal
        isOpen={modalPreviewWhatsApp}
        contacts={whatsappContacts}
        onClose={() => {
          console.log('[Dashboard] 👋 FECHANDO PreviewModal via onClose');
          setModalPreviewWhatsApp(false);
          setWhatsappContacts([]);
        }}
        onImport={handleConfirmWhatsAppImport}
        userPlan={user?.plan || user?.subscription_plan || 'free'}
        currentLeadsCount={user?.usage?.leads || 0}
        leadsLimit={user?.limits?.leads !== undefined ? user?.limits?.leads : 100}
        existingLeads={leads}
        key={whatsappImportKey} // ✅ Key única para forçar remontagem
      />

      <CampaignEmailModal
        isOpen={modalEmailMarketing}
        onClose={() => setModalEmailMarketing(false)}
        leads={leads as any}
        onCampaignCreated={() => {
          carregarLeads();
        }}
      />

      <DeletionSuccessModal
        isOpen={deletionSuccessModal}
        onClose={() => setDeletionSuccessModal(false)}
        deletedCount={deletionStats.deletedCount}
        errorCount={deletionStats.errorCount}
        totalBefore={deletionStats.totalBefore}
        totalAfter={deletionStats.totalAfter}
      />

      <EnviarEmailModal
        isOpen={modalEnviarEmail}
        onClose={() => {
          setModalEnviarEmail(false);
          setLeadSelecionado(null);
        }}
        leadNome={leadSelecionado?.nome || ''}
        leadEmail={leadSelecionado?.email || ''}
        onSend={handleSendEmailSubmit}
      />

      {/* Welcome Video - shown once to new users */}
      <WelcomeVideoModal
        isOpen={showWelcomeVideo}
        onClose={() => {
          localStorage.setItem('leadsflow_welcome_video_seen', 'true');
          setShowWelcomeVideo(false);
        }}
        onOpenFeedback={() => {
          localStorage.setItem('leadsflow_welcome_video_seen', 'true');
          setShowWelcomeVideo(false);
          setShowFeedback(true);
        }}
      />

      {/* Feedback Modal */}
      <FeedbackModal
        isOpen={showFeedback}
        onClose={() => setShowFeedback(false)}
      />

      {/* Product Tour - Onboarding com suporte a tema */}
      {showTour && (
        <ProductTour
          onComplete={handleTourComplete}
          onSkip={handleTourSkip}
          isDark={isDark}
          onNavigate={handleNavigate}
        />
      )}

      {/* Report Exporter */}
      <ReportExporter
        isOpen={modalReportExporter}
        onClose={() => setModalReportExporter(false)}
        leads={leads}
        isDark={isDark}
      />

      {/* Channel Selector Modal - Opens from Leads Table Campaign Button */}
      <ChannelSelectorModal
        isOpen={channelSelectorOpen}
        onClose={() => setChannelSelectorOpen(false)}
        onSelectChannel={(channel) => {
          setChannelSelectorOpen(false);
          if (channel === 'whatsapp') {
            setCampaignWhatsAppModalOpen(true);
          } else if (channel === 'email') {
            setModalEmailMarketing(true);
          }
        }}
      />

      {/* Campaign WhatsApp Modal */}
      <CampaignWhatsAppModal
        isOpen={campaignWhatsAppModalOpen}
        onClose={() => setCampaignWhatsAppModalOpen(false)}
        leads={leads as any}
        isDark={isDark}
        onCampaignCreated={() => {
          setCampaignWhatsAppModalOpen(false);
          carregarLeads();
        }}
      />
      </div>
    </div>
  );
}





