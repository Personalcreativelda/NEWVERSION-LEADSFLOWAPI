import { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from "sonner";

// Dashboard components
import StatsCards from './dashboard/StatsCards';
import MainStatsCards from './dashboard/MainStatsCards';
import FilterBar from './dashboard/FilterBar';
import LeadsTable from './dashboard/LeadsTable';
import ChartsSection from './dashboard/ChartsSection';
import PlanoWidget from './dashboard/PlanoWidget';
import RecentLeadsSection from './dashboard/RecentLeadsSection';
import SalesFunnel from './dashboard/SalesFunnel';
import AdvancedAnalytics from './dashboard/AdvancedAnalytics';

// Navigation components
import RefactoredHeader from './navigation/RefactoredHeader';
import NavigationSidebar from './navigation/NavigationSidebar';

// Tasks
import TaskManager from './tasks/TaskManager';

// Reports
import ReportExporter from './reports/ReportExporter';

// Settings pages
import PlanPage from './settings/PlanPage';
import IntegrationsPage from './settings/IntegrationsPage';
import SecurityPage from './settings/SecurityPage';
import AccountSettingsPage from './settings/AccountSettingsPage';
import AdminPage from './settings/AdminPage';
import CampaignsPage from './pages/CampaignsPage';
import InboxPage from './pages/InboxPage';

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

// Chat Flutuante

// Utils and Hooks
import { leadsApi, userApi, integrationsApi } from '../utils/api';
import { conversationsApi } from '../services/api/inbox';
import { useLeadsAutoRefresh } from '../hooks/useLeadsAutoRefresh';
import { Language, loadLanguage, saveLanguage } from '../utils/i18n';

import { AlertTriangle, AlertCircle, CheckCircle2, CopyX, Download, MailX, X } from 'lucide-react';

// Types
interface Lead {
  id: string;
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

export default function Dashboard({ user, onLogout, onSettings, onAdmin, onUserUpdate, onRefreshUser, enforcementBlock, onEnforcementBlockCleared }: DashboardProps) {
  // Theme mode: 'light' | 'dark'
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(() => {
    const savedMode = localStorage.getItem('crm_tema_mode') as 'light' | 'dark' | null;
    const initialMode = savedMode || 'dark';
    if (!savedMode) {
      localStorage.setItem('crm_tema_mode', initialMode);
    }
    return initialMode;
  });
  const [isDark, setIsDark] = useState(() => {
    const savedMode = localStorage.getItem('crm_tema_mode');
    const mode = savedMode || 'dark';
    if (mode === 'dark') {
      document.documentElement.classList.add('dark');
      return true;
    }
    document.documentElement.classList.remove('dark');
    return false;
  });
  const [language, setLanguage] = useState<Language>(() => loadLanguage());

  // Resolve the dashboard sub-page from the URL path on first mount
  const getSubPageFromUrl = () => {
    const subPathMap: Record<string, string> = {
      '/dashboard/leads': 'leads',
      '/dashboard/inbox': 'inbox',
      '/dashboard/inbox/settings': 'inbox-settings',
      '/dashboard/inbox/ai-assistants': 'ai-assistants',
      '/dashboard/inbox/automations': 'automations',
      '/dashboard/funnel': 'funnel',
      '/dashboard/analytics': 'analytics',
      '/dashboard/tasks': 'tasks',
      '/dashboard/campaigns': 'campaigns',
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
    'funnel': '/dashboard/funnel',
    'analytics': '/dashboard/analytics',
    'tasks': '/dashboard/tasks',
    'campaigns': '/dashboard/campaigns',
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
  const [isMobile, setIsMobile] = useState(false);
  const [filtros, setFiltros] = useState({ origem: '', status: '', busca: '' });
  const [filtrosAplicados, setFiltrosAplicados] = useState({ origem: '', status: '', busca: '' });
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDeletingLeads, setIsDeletingLeads] = useState(false); // ✅ Bloquear auto-refresh durante deleção
  const [isBackendOffline, setIsBackendOffline] = useState(false); // ✅ Detectar backend offline

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
  const [zombieLeadsDetected, setZombieLeadsDetected] = useState<string[]>([]);
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
  
  // ✅ DEBUG - Rastrear mudanças no estado whatsappContacts
  useEffect(() => {
    console.log('[Dashboard] ================================================');
    console.log('[Dashboard] 📊 ESTADO whatsappContacts MUDOU');
    console.log('[Dashboard] 📈 Novo tamanho:', whatsappContacts.length);
    console.log('[Dashboard] 📋 Sample (3 primeiros):', whatsappContacts.slice(0, 3));
    console.log('[Dashboard] 🔍 Stack trace de onde veio a mudança:');
    console.trace();
    console.log('[Dashboard] ================================================');
  }, [whatsappContacts]);

  // Onboarding state
  const [showTour, setShowTour] = useState(false);

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

    // Detect mobile/desktop
    const checkMobile = () => {
      const mobile = window.innerWidth < 1024;
      const wasMobile = isMobile;
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
    
    return () => {
      window.removeEventListener('resize', checkMobile);
      window.removeEventListener('leads-updated', handleLeadsUpdated);
    };
  }, []);

  // Não há necessidade de monitorar tema do sistema

  // Save sidebar state whenever it changes
  useEffect(() => {
    localStorage.setItem('sidebar_open', JSON.stringify(isSidebarOpen));
  }, [isSidebarOpen]);

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
      } else if (
        (user?.limits?.leads ?? 0) > 0 &&
        (user?.limits?.leads ?? 0) !== -1 &&
        (user?.usage?.leads ?? 0) >= (user?.limits?.leads ?? 0)
      ) {
        block = {
          code: 'LEAD_LIMIT_EXCEEDED',
          message: `Você atingiu o limite de ${user.limits.leads} leads do seu plano. Faça upgrade para continuar.`,
        };
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
    
    try {
      setLoading(true);
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
          setZombieLeadsDetected(zombieLeads);
          toast.error(
            `🧟 ${zombieLeads.length} leads deletados VOLTARAM!\n\n` +
            `Verifique:\n` +
            `1. Webhook N8N re-importando?\n` +
            `2. Auto-sincronização ativa?\n` +
            `3. Backend deletando corretamente?`,
            { duration: 10000 }
          );
        }
        
        setLeads(response.leads);
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
      setLoading(false);
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
        toast.info('🔄 Sincronizando leads do N8N...');
        await sincronizarLeadsN8N();
      } else {
        // Se não tiver webhook, apenas recarregar do banco
        toast.info('🔄 Atualizando lista de leads...');
        await carregarLeads();
        toast.success('✅ Lista de leads atualizada!');
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
        toast.success(`✅ ${imported} lead(s) importado(s) via N8N!`);
      }

      if (duplicates > 0) {
        toast.info(`ℹ️ ${duplicates} lead(s) duplicado(s) ignorado(s).`);
      }

      if (imported === 0 && duplicates === 0) {
        toast.info('ℹ️ Nenhuma alteração detectada na planilha.');
      }

      if (received && imported === 0 && duplicates === 0) {
        toast.warning(`⚠️ ${received} registros recebidos, mas nenhum pôde ser importado. Confira o workflow N8N.`);
      }

      console.log('[N8N Sync] ====== SYNC COMPLETED ======');
    } catch (error: any) {
      console.error('[N8N Sync] Error:', error);
      toast.error(error?.message || '❌ Erro ao sincronizar com o N8N.');

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
    const leadLimit = user?.limits?.leads ?? 0;
    const leadUsage = user?.usage?.leads ?? 0;
    if (leadLimit > 0 && leadLimit !== -1 && leadUsage >= leadLimit) {
      return { code: 'LEAD_LIMIT_EXCEEDED', message: `Você atingiu o limite de ${leadLimit} leads do seu plano. Faça upgrade para continuar.` };
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
        
        return true;
      }
      return false;
    } catch (error: any) {
      console.error('[Dashboard] Error creating lead:', error);
      const errorMessage = (error?.message || '').toLowerCase();

      if (errorMessage.includes('limit reached') || errorMessage.includes('lead limit reached')) {
        const block = getBlockReason();
        if (block) { showPlanBlock(block.code, block.message); }
        else { triggerPlanLimitMessage('leads'); }
      } else if (errorMessage.includes('duplicate lead') || error?.isDuplicate) {
        triggerDuplicateLeadMessage();
      } else {
        triggerErrorMessage('Erro ao criar lead', error?.message || 'Erro desconhecido ao criar lead.');
      }
      return false;
    }
  };

  const handleEditarLead = async (leadEditado: Lead) => {
    try {
      if (!leadEditado.id) {
        console.error('Lead ID is missing:', leadEditado);
        triggerErrorMessage('Lead sem ID', 'Não foi possível localizar o identificador do lead. Por favor, recarregue a página e tente novamente.');
        return;
      }

      const response = await leadsApi.update(leadEditado.id, leadEditado);
      if (response.success) {
        // ✅ Recarregar leads para garantir que gráficos e stats atualizem
        await carregarLeads();
        setModalEditarLead(false);
        setLeadSelecionado(null);
        toast.success('Lead atualizado com sucesso!');
      }
    } catch (error) {
      console.error('Error updating lead:', error);
      toast.error('Erro ao atualizar lead. Por favor, tente novamente.');
    }
  };

  // Deletar lead pelo ID (usado no SalesFunnel)
  const handleDeletarLead = async (leadId: string) => {
    try {
      const response = await leadsApi.delete(leadId);
      if (response.success) {
        setLeads(leads.filter(l => l.id !== leadId));
        toast.success('Lead deletado com sucesso!');
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
        toast.error('Erro ao deletar lead');
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
    } catch (error) {
      // Reverter em caso de erro
      setLeads(leads);
      throw error;
    }
  };

  const handleDelete = async (leadId: string) => {
    if (!confirm('Tem certeza que deseja deletar este lead?')) return;

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
      const toastId = toast.loading('Verificando conexão com servidor...');
      
      try {
        const testResult = await leadsApi.delete(leadIds[0]);
        console.log('[Dashboard] ✅ Backend online - proceeding with batch deletion');
        
        // ✅ Se sucesso, continuar com o resto
        if (testResult.success) {
          toast.loading(`Deletando ${leadIds.length} lead(s)...`, { id: toastId });
        }
      } catch (testError: any) {
        const errorMsg = testError?.message || '';
        
        // Se backend offline, abortar imediatamente
        if (errorMsg.includes('Backend indisponível') || errorMsg.includes('Failed to fetch')) {
          console.error('[Dashboard] ❌ Backend offline - aborting deletion');
          toast.dismiss(toastId);
          toast.error('❌ Servidor offline! Não é possível deletar leads no momento. Por favor, tente novamente mais tarde.');
          return;
        }
        
        // Se não for "not found", também abortar
        if (!errorMsg.toLowerCase().includes('lead not found')) {
          console.error('[Dashboard] ❌ Unexpected error during backend test:', testError);
          toast.dismiss(toastId);
          toast.error('Erro ao conectar com o servidor. Por favor, tente novamente.');
          return;
        }
        
        // Se for "not found", lead já estava deletado, continuar normalmente
        console.log('[Dashboard] First lead already deleted, continuing...');
        toast.loading(`Deletando ${leadIds.length} lead(s)...`, { id: toastId });
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
        
        toast.success('✅ 1 lead deletado com sucesso!');
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
        toast.loading(`Deletando ${totalProcessed}/${leadIds.length} leads...`, { id: toastId });
      }
      
      console.log(`[Dashboard] 🗑️ Deletion finished - Success: ${deletedCount}, Errors: ${errorCount}, Backend offline: ${backendOffline}`);
      console.log(`[Dashboard] 🗑️ Successfully deleted IDs (${successfullyDeletedIds.length}):`, successfullyDeletedIds);
      
      // ✅ Mostrar resultado
      toast.dismiss(toastId);
      
      if (backendOffline) {
        toast.error('❌ Backend offline! Não foi possível deletar os leads. Por favor, verifique a conexão com o servidor.');
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
        toast.success(`✅ ${deletedCount} lead(s) deletado(s) com sucesso!`);
        console.log(`[Dashboard] 🎉 Deleção completa - ${deletedCount} leads deletados sem erros`);
      } else {
        toast.warning(`⚠️ ${deletedCount} deletados, ${errorCount} erro(s)`);
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
      toast.loading('🔄 Verificando sincronização com servidor...', { id: toastId });
      
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
      toast.error('Erro ao deletar leads selecionados');
      
      // ✅ DESBLOQUEAR em caso de erro também
      setIsDeletingLeads(false);
      console.log('[Dashboard] ✅ AUTO-REFRESH DESBLOQUEADO (erro)');
    }
  };


  // Troca de tema instantânea, aproveitando o transition do body
  const handleThemeChange = (mode: 'light' | 'dark') => {
    setThemeMode(mode);
    localStorage.setItem('crm_tema_mode', mode);
    if (mode === 'light') {
      setIsDark(false);
      document.documentElement.classList.remove('dark');
    } else if (mode === 'dark') {
      setIsDark(true);
      document.documentElement.classList.add('dark');
    }
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
    return value.toLocaleString('pt-BR');
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
        description: 'Limites do seu plano e oportunidades de upgrade.',
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
        description: 'Confirmações e registros de atividades recentes.',
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
            Você alcançou o limite de {planLabels[resource]} disponível no seu plano atual. Realize um upgrade para continuar usando este recurso sem interrupções.
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
            Seu plano atual permite exportar até {formatLimit(maxAllowed)} leads por vez. Você possui {formatLimit(totalCount)} leads cadastrados.
          </p>
          <p className="text-xs text-muted-foreground">
            Exporte a quantidade permitida agora ou faça upgrade para liberar a exportação completa.
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
            Já existe um lead com o mesmo email ou telefone cadastrado. Evite duplicidades revisando os dados antes de criar um novo contato.
          </p>
          <p className="text-xs text-muted-foreground">
            Dica: utilize a importação incremental ou pesquise o lead antes de cadastrá-lo novamente.
          </p>
        </div>
      ),
      actions: [
        {
          label: 'Ver leads cadastrados',
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
    if (!podeExecutar('leads')) {
      const block = getBlockReason();
      if (block) { showPlanBlock(block.code, block.message); return; }
      triggerPlanLimitMessage('leads');
      return;
    }
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

  const handleImport = () => {
    // Check plan enforcement first
    const block = getBlockReason();
    if (block) { showPlanBlock(block.code, block.message); return; }

    // Import limit comes from DB plan_limits.leads (already loaded in user.limits.leads)
    const maxImport: number = (user?.limits?.leads ?? -1);
    const currentPlan = (user?.plan || 'free').toUpperCase();

    // Inform about limits before opening modal
    const confirmMessage = maxImport === -1
      ? `📥 Importação de Leads\n\nSeu plano ${currentPlan} tem importação ILIMITADA! 🚀\n\nVocê pode importar quantos leads quiser.\n\nDeseja continuar?`
      : `📥 Importação de Leads\n\nSeu plano ${currentPlan} permite importar até ${maxImport} leads.\n\nO sistema irá importar apenas os primeiros ${maxImport} leads da sua planilha.\n\nDeseja continuar?`;

    if (!confirm(confirmMessage)) return;

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
      toast.error('❌ Erro ao carregar configurações. Por favor, tente novamente.');
      return;
    }

    const webhookUrl = userSettings?.n8n_whatsapp_import_url;

    if (!webhookUrl) {
      console.error("[IMPORT WA] Webhook não configurado!");
      toast.error('❌ Webhook N8N não configurado! Configure o "Webhook - Importação de Contatos do WhatsApp" na aba Integrações.');
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
    toast.info('🔄 Enviando requisição para N8N...', { duration: 2000 });

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
        toast.warning('⚠️ Nenhum contato foi retornado pelo N8N');
        return;
      }

      toast.success(`✅ ${contatos.length} contato(s) recebido(s) do N8N!`);

      // Filtrar contatos válidos antes de mostrar
      const contatosFiltrados = contatos.filter(c =>
        c &&
        c.NumeroLimpo &&
        c.NumeroLimpo !== "" &&
        c.EhValido === true
      );

      if (contatosFiltrados.length === 0) {
        toast.warning('⚠️ Nenhum contato válido encontrado após filtragem');
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

      toast.info(`📋 ${contatosFiltrados.length} contato(s) válido(s) prontos para importação. Selecione os que deseja importar.`, { duration: 4000 });

    } catch (err) {
      console.error("[IMPORT WA] Erro no fetch:", err);
      setModalImportandoWhatsApp(false);
      toast.error('❌ Erro ao importar contatos do WhatsApp');
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
        toast.success(`✅ ${importedCount} contato(s) importado(s) do WhatsApp! (${duplicatesSkipped} duplicados ignorados)`);
      } else {
        toast.success(`✅ ${importedCount} contato(s) importado(s) do WhatsApp com sucesso!`);
      }
      
      console.log('[WhatsApp Confirm] ✅ Importação otimizada concluída via backend Express');
    } catch (error: any) {
      console.error('[WhatsApp Confirm] ❌ Erro ao salvar contatos do WhatsApp:', error);
      toast.error(error.message || 'Erro ao salvar contatos. Tente novamente.');
    }
  };

  const handleRemoveDuplicates = async () => {
    try {
      // Confirmar ação com o usuário
      const confirmRemove = confirm(
        `🗑️ Remover Leads Duplicados\n\n` +
        `Esta ação irá remover todos os leads duplicados (com mesmo email ou telefone).\n\n` +
        `Apenas a versão mais antiga de cada lead será mantida.\n\n` +
        `Deseja continuar?`
      );
      
      if (!confirmRemove) {
        return;
      }
      
      setLoading(true);
      toast.info('🔍 Procurando leads duplicados...');
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
          `✅ ${data.removed} lead(s) duplicado(s) removido(s)!\n\n` +
          `${data.remaining} leads únicos restantes.`,
          { duration: 5000 }
        );
      } else {
        toast.info('ℹ️ Nenhum lead duplicado encontrado!', { duration: 3000 });
      }
      
    } catch (error: any) {
      console.error('[Remove Duplicates] Error:', error);
      toast.error(`❌ Erro ao remover duplicados: ${error.message}`);
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
    toast.success('🎉 Tour concluído! Agora você conhece todas as funcionalidades!');
  };

  const handleTourSkip = () => {
    localStorage.setItem('leadsflow_tour_completed', 'true');
    setShowTour(false);
    toast.info('Tour pulado. Você pode reiniciá-lo a qualquer momento.');
  };

  const handleStartTour = () => {
    handleNavigate('dashboard');
    setTimeout(() => {
      setShowTour(true);
    }, 500);
  };

  return (
    <div
      className="min-h-screen flex transition-colors duration-200 relative"
      style={{ background: 'hsl(var(--background))' }}
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
        isCollapsed={false}
        user={user}
        language={language}
        onLogout={onLogout}
      />

      {/* Main Content Wrapper - SEMPRE com margin-left em desktop (>1024px) */}
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300 lg:ml-[260px] h-screen">
        <div className={`dashboard-container flex flex-col ${
          currentPage === 'inbox' || currentPage === 'inbox-settings' || currentPage === 'ai-assistants' || currentPage === 'automations'
            ? 'h-screen overflow-hidden'
            : 'min-h-screen'
        }`} style={{ background: 'hsl(var(--background))' }}>
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
          />

          {/* ⚠️ BANNER DE BACKEND OFFLINE */}
          {isBackendOffline && (
            <div className="bg-gradient-to-r from-red-500 to-orange-500 text-white px-6 py-4 shadow-lg border-b-4 border-red-700">
              <div className="max-w-[1400px] mx-auto flex items-start gap-4">
                <div className="flex-shrink-0">
                  <AlertCircle className="w-6 h-6 mt-0.5" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-lg mb-1">🚨 Backend Offline - App em Modo Simulação</h3>
                  <p className="text-sm mb-2 opacity-90">
                    O servidor backend não está respondendo. Suas ações (criar, editar, deletar leads) <strong>NÃO serão salvas</strong>.
                  </p>
                  <div className="bg-white/10 rounded-lg p-3 text-xs space-y-1">
                    <p className="font-semibold">🔧 Como resolver:</p>
                    <p>1. Abra o terminal na pasta do projeto</p>
                    <p>2. Execute: <code className="bg-black/20 px-2 py-0.5 rounded">chmod +x deploy-backend.sh && ./deploy-backend.sh</code></p>
                    <p>3. Aguarde o deploy completar e recarregue a página</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsBackendOffline(false)}
                  className="flex-shrink-0 p-2 hover:bg-white/10 rounded-lg transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {/* Main Content */}
          <main className={`flex-1 min-h-0 ${
            currentPage === 'inbox' || currentPage === 'inbox-settings' || currentPage === 'ai-assistants' || currentPage === 'automations' 
              ? 'overflow-hidden flex flex-col' 
              : 'overflow-y-auto'
          }`}>
            <div className={`w-full mx-auto ${
              currentPage === 'inbox' || currentPage === 'inbox-settings' || currentPage === 'ai-assistants' || currentPage === 'automations'
                ? 'h-full flex-1 min-h-0 max-w-none px-0 py-0 overflow-hidden'
                : 'max-w-[1600px] px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 lg:py-8'
            }`} style={{ background: 'hsl(var(--background))' }}>
            {/* Renderizar conteúdo baseado na página atual */}
            {currentPage === 'dashboard' && (
              <div className="space-y-4 sm:space-y-5 lg:space-y-6">
                {/* Widget de Planos */}
                <PlanoWidget
                  limites={limites}
                  diasRestantes={diasRestantes}
                  onUpgrade={handleUpgrade}
                  userPlan={user?.plan || 'free'}
                  isTrial={user?.isTrial || false}
                  onRefresh={onRefreshUser}
                />

                {/* Cards Principais de Estatísticas */}
                <MainStatsCards
                  totalLeads={stats.total}
                  leadsNovosHoje={stats.novosHoje}
                  leadsFechados={stats.convertidos}
                  limiteLeads={limites.leads === -1 ? 999999 : limites.leads}
                />

                {/* Cards Secundários */}
                <StatsCards
                  totalLeads={stats.total}
                  leadsNovosHoje={stats.novosHoje}
                  leadsFechados={stats.convertidos}
                  leads={leadsFiltradosPorFiltros}
                  limites={limites}
                  isDark={isDark}
                />

                {/* Gráficos de Insights */}
                <ChartsSection 
                  key={`charts-${leads.length}-${leadsFiltradosPorFiltros.length}`}
                  leads={leadsFiltradosPorFiltros}
                  origens={origens}
                  status={statusList}
                  isDark={isDark}
                  onFilterChange={handleAplicarFiltros}
                />

                {/* Seção de Leads Recentes */}
                <RecentLeadsSection
                  leads={leads}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onChat={handleChat}
                  onSendEmail={handleSendEmail}
                />
                
                {/* Barra de Filtros */}
                <FilterBar
                  origens={origens}
                  status={statusList}
                  onFilterChange={setFiltros}
                  onRemoveDuplicates={handleRemoveDuplicates}
                />

                {/* Tabela de Leads */}
                <LeadsTable
                  leads={leads}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onChat={handleChat}
                  onRefresh={handleAtualizar}
                  onExport={handleExport}
                  onImport={handleImport}
                  onImportWhatsApp={handleImportWhatsApp}
                  onToggleEmailMarketing={handleToggleEmailMarketing}
                  onSendEmail={handleSendEmail}
                  onNovoLead={handleNovoLead}
                  onCampaigns={() => {
                    const b = getBlockReason();
                    if (b) { showPlanBlock(b.code, b.message); return; }
                    setChannelSelectorOpen(true);
                  }}
                  onDeleteMultiple={handleDeleteMultiple}
                  userPlan={user?.plan || 'free'}
                  planExpired={planExpired}
                  limitReached={!!getBlockReason()}
                  loading={loading}
                />
              </div>
            )}

            {currentPage === 'leads' && (
              <div className="space-y-5 sm:space-y-6 xl:space-y-8">
                <div className="mb-6">
                  <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
                    Leads
                  </h1>
                  <p className="text-sm text-gray-500 dark:text-gray-500 dark:text-gray-400">
                    Gerencie todos os seus leads
                  </p>
                </div>
                
                {/* Cards Principais de Estatísticas */}
                <MainStatsCards
                  totalLeads={stats.total}
                  leadsNovosHoje={stats.novosHoje}
                  leadsFechados={stats.convertidos}
                  limiteLeads={limites.leads === -1 ? 999999 : limites.leads}
                />

                {/* Cards Secundários */}
                <StatsCards
                  totalLeads={stats.total}
                  leadsNovosHoje={stats.novosHoje}
                  leadsFechados={stats.convertidos}
                  leads={leadsFiltradosPorFiltros}
                  limites={limites}
                  isDark={isDark}
                />

                {/* Seção de Leads Recentes */}
                <RecentLeadsSection
                  leads={leads}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  isDark={isDark}
                  onChat={handleChat}
                  onSendEmail={handleSendEmail}
                />
                
                {/* Barra de Filtros */}
                <FilterBar
                  origens={origens}
                  status={statusList}
                  onFilterChange={setFiltros}
                  onRemoveDuplicates={handleRemoveDuplicates}
                />

                {/* Tabela de Leads */}
                <LeadsTable
                  leads={leads}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onChat={handleChat}
                  onRefresh={handleAtualizar}
                  onExport={handleExport}
                  onImport={handleImport}
                  onImportWhatsApp={handleImportWhatsApp}
                  onToggleEmailMarketing={handleToggleEmailMarketing}
                  onSendEmail={handleSendEmail}
                  onNovoLead={handleNovoLead}
                  onCampaigns={() => {
                    const b = getBlockReason();
                    if (b) { showPlanBlock(b.code, b.message); return; }
                    setChannelSelectorOpen(true);
                  }}
                  userPlan={user?.plan || 'free'}
                  planExpired={planExpired}
                  limitReached={!!getBlockReason()}
                />
              </div>
            )}

            {currentPage === 'campaigns' && (
              <CampaignsPage
                leads={leads}
                isDark={isDark}
                userPlan={(user?.plan || user?.subscription_plan || 'free') as 'free' | 'business' | 'enterprise'}
              />
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
                <SalesFunnel
                  leads={leads}
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
                      await handleEditarLead(updatedLead);
                      toast.success(`Lead movido para ${newStatus}!`);
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
                    if (confirm('Tem certeza que deseja deletar este lead permanentemente?')) {
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
              </div>
            )}

            {currentPage === 'analytics' && (
              <div className="space-y-5 sm:space-y-6 xl:space-y-8">
                <div className="flex justify-between items-start pt-6 pb-8">
                  <div className="space-y-2">
                    <h1 className="text-[32px] font-semibold text-[#1F2937] dark:text-[#F1F5F9]" style={{ letterSpacing: '-0.5px' }}>
                      Analytics
                    </h1>
                    <p className="text-[15px] text-[#6B7280] dark:text-[#6B7280]">
                      Análises detalhadas e insights sobre seus leads e performance de vendas
                    </p>
                  </div>
                  <button
                    onClick={() => setModalReportExporter(true)}
                    className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all flex items-center gap-2 shadow-lg"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Exportar Relatório
                  </button>
                </div>
                <AdvancedAnalytics leads={leads} isDark={isDark} />
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
              <SecurityPage user={user} />
            )}

            {currentPage === 'account' && (
              <AccountSettingsPage user={user} onUpdateUser={onUserUpdate} />
            )}

            {currentPage === 'admin' && (
              <AdminPage user={user} />
            )}
          </div>

          {/* Footer */}
          <footer className="border-t border-gray-200 dark:border-gray-700 mt-12 py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex flex-col md:flex-row justify-between items-center gap-3 text-sm text-gray-600 dark:text-gray-500 dark:text-gray-400">
                <p className="text-center md:text-left">
                  © {new Date().getFullYear()} <span className="font-bold text-gray-900 dark:text-white">LeadsFlow</span> <span className="text-gray-700 dark:text-gray-300">SAAS</span>. Todos os direitos reservados.
                </p>
                <p className="text-center md:text-right">
                  Desenvolvido por <span className="text-blue-600 dark:text-blue-400 font-medium">PersonalCreativeLda</span>
                </p>
              </div>
            </div>
          </footer>
        </main>
      </div>

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
        onSave={handleEditarLead}
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
        leads={leads}
        onSendSuccess={() => {
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
        leads={leads}
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





