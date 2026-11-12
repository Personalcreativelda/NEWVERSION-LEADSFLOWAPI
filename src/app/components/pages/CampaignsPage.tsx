import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from '../../hooks/useWebSocket';
import {
  Plus, X, Megaphone,
  Pause, Play, BarChart3, FileText, Edit2,
  Send, Trash2, Copy, MoreVertical,
  FileDown, Bell, Calendar, 
  Mail, MessageSquare, PlayCircle, Clock,
  Timer, Save, Users, CheckCircle, CalendarCheck, XCircle
} from 'lucide-react';
import { AppButton } from '../base/AppButton';
import { PageHeader } from '../base/PageHeader';
import { DashboardCard } from '../base/DashboardCard';
import { StatusBadge } from '../base/StatusBadge';
import { SearchInput } from '../base/SearchInput';
import { EmptyState } from '../base/EmptyState';
import { matchesSearch } from '../../utils/search';
import CampaignWhatsAppModal from '../modals/CampaignWhatsAppModal';
import CampaignEmailModal from '../modals/CampaignEmailModal';
import CampaignSMSModal from '../modals/CampaignSMSModal';
import ChannelSelectorModal from '../modals/ChannelSelectorModal';
import CampaignDetailsModal from '../modals/CampaignDetailsModal';
import CampaignMessageModal from '../modals/CampaignMessageModal';
import CampaignAlertsModal from '../modals/CampaignAlertsModal';
import { useConfirm } from '../ui/ConfirmDialog';
import { toast } from 'sonner';
import { usePlanLimits } from '../../hooks/usePlanLimits';
import { SkeletonCampaignSection, UpdatingBadge } from '../ui/skeletons';
import { NUMBER_OPTS, getLocale } from '../../utils/format';
import { BrandIcon } from '../base/BrandIcon';
import { saveFile } from '../../lib/saveFile';

interface Lead {
  id: string;
  nome: string;
  telefone?: string;
  email?: string;
  empresa?: string;
  status?: string;
}

interface CampaignsPageProps {
  leads: Lead[];
  isDark: boolean;
  userPlan?: 'free' | 'business' | 'enterprise';
  activeTab?: string;
}

interface Campaign {
  id: string;
  name: string;
  type: 'whatsapp' | 'email' | 'sms';
  status: 'active' | 'scheduled' | 'completed' | 'paused' | 'draft' | 'sending' | 'failed';
  totalRecipients: number;
  sent?: number;
  delivered?: number;
  read?: number;
  failed?: number;
  replies?: number;
  skipped?: number;
  pending?: number;
  excluded?: number;
  metadata?: any;
  scheduledDate?: string;
  completedDate?: string;
  updatedDate?: string;
  createdDate?: string;
  progress?: number;
  estimatedTime?: number;
  deliveryRate?: number;
  createdAt?: string;
  template?: string;
  settings?: any;
  media_urls?: string[];
}
// Estados vindos da API → as secções da página. Estados fora desta lista (ex.: 'sent'
// do email, 'pending', 'cancelled') não entravam em nenhuma secção e a campanha
// ficava invisível — mesmo encontrada pela pesquisa.
function normalizeCampaignStatus(raw: unknown): Campaign['status'] {
  const s = String(raw ?? '').toLowerCase();
  if (s === 'active' || s === 'running' || s === 'open' || s === 'in_progress' || s === 'processing' || s === 'queued') return 'active';
  if (s === 'sending') return 'sending';
  if (s === 'paused') return 'paused';
  if (s === 'scheduled' || s === 'pending') return 'scheduled';
  if (s === 'completed' || s === 'sent' || s === 'finished' || s === 'done') return 'completed';
  if (s === 'failed' || s === 'error' || s === 'cancelled' || s === 'canceled' || s === 'stopped') return 'failed';
  return 'draft';
}

const parseMaybe = (v: any) => {
  if (!v) return {};
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v) || {}; } catch { return {}; }
};

// Progresso de uma campanha de WhatsApp a partir do que o servidor guarda (nada estimado)
function whatsAppProgress(raw: any) {
  const settings = parseMaybe(raw.settings);
  const stats = parseMaybe(raw.stats);
  const status = normalizeCampaignStatus(raw.status);
  const total = Number(stats.total ?? settings.recipientCount ?? 0) || 0;
  const sent = Number(stats.sent || 0);
  const failed = Number(stats.failed || 0);
  const skipped = Number(stats.skipped || 0);
  const pending = stats.pending != null ? Number(stats.pending) : Math.max(0, total - sent - failed - skipped);
  const delivered = Number(stats.delivered || 0);
  return {
    status,
    totalRecipients: total,
    sent,
    failed,
    skipped,
    pending,
    excluded: Number(stats.excluded || 0),
    delivered,
    read: Number(stats.read || 0),
    replies: Number(stats.replied || 0),
    progress: status === 'completed' ? 100 : total > 0 ? Math.min(100, Math.round(((total - pending) / total) * 100)) : 0,
    deliveryRate: sent > 0 ? Math.min(100, Math.floor((delivered / sent) * 100)) : 0,
    metadata: parseMaybe(raw.metadata),
  };
}

// O plano não chega para todos: a campanha começa e pausa quando o limite acabar
function warnPlanLimit(result: { totalLeads?: number; plan?: { remaining: number } | null }) {
  if (result?.plan && (result.totalLeads ?? 0) > result.plan.remaining) {
    toast.warning(`O seu plano permite enviar mais ${result.plan.remaining} mensagens neste período. A campanha pausa quando chegar ao limite.`);
  }
}

const PAUSE_REASONS: Record<string, string> = {
  TOO_MANY_ERRORS: 'Várias mensagens falharam seguidas. Confirme que o WhatsApp está ligado e retome.',
  LOW_DELIVERY: 'Muitas mensagens não estão a ser entregues: o número pode estar restrito. Espere algumas horas antes de retomar.',
  HIGH_OPT_OUT: 'Muitos contactos pediram para não receber mais mensagens. Reveja a mensagem antes de retomar.',
  MASS_MESSAGE_LIMIT_EXCEEDED: 'Atingiu o limite de mensagens em massa do plano.',
  CHANNEL_MISSING: 'O canal de WhatsApp da campanha já não existe.',
  ENGINE_UPDATED: 'Retome para continuar a enviar.',
};

// Estado que o cartão mostra: a enviar, à espera do horário/limite diário, ou pausada e porquê
function sendingState(c: Campaign): { label: string; tone: 'success' | 'warning' | 'info'; detail?: string; resumeAt?: string } {
  const meta = c.metadata || {};
  if (c.status === 'paused') return { label: 'Pausada', tone: 'warning', detail: PAUSE_REASONS[meta.pausedReason] };
  if (meta.waiting === 'window') return { label: 'Fora do horário de envio', tone: 'info', resumeAt: meta.resume_at };
  if (meta.waiting === 'daily_limit') {
    return {
      label: 'Limite diário atingido', tone: 'info', resumeAt: meta.resume_at,
      detail: meta.warmup ? 'Número novo: o limite sobe todos os dias.' : undefined,
    };
  }
  return { label: 'A enviar', tone: 'success' };
}

// Tempo que falta, com o ritmo e o limite diário da campanha
function remainingTime(c: Campaign): string {
  const pending = c.pending ?? 0;
  if (pending <= 0) return '—';
  const st = parseMaybe(c.settings);
  if (st.channelType === 'whatsapp_cloud') return pending < 30 ? '< 1 min' : `~${Math.ceil((pending * 2) / 60)} min`;
  const min = Math.max(12, Number(st.minDelaySeconds) || 15);
  const max = Math.max(min + 5, Number(st.maxDelaySeconds) || 45);
  const rawLimit = Number(st.dailyLimit ?? 150);
  const perDay = rawLimit <= 0 ? 300 : Math.min(300, rawLimit);
  if (pending > perDay) return `~${Math.ceil(pending / perDay)} dias`;
  const minutes = Math.ceil((pending * (min + max)) / 2 / 60);
  if (minutes < 60) return `~${Math.max(1, minutes)} min`;
  return `~${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

// Rótulos dos estados, também usados na pesquisa ("agendada", "concluída"…)
const CAMPAIGN_STATUS_LABELS: Record<Campaign['status'], string> = {
  active: 'ativa',
  paused: 'pausada',
  sending: 'em envio',
  scheduled: 'agendada',
  draft: 'rascunho salva',
  completed: 'concluida',
  failed: 'falhada erro',
};

// ✅ Restaurando props leads e userPlan que foram removidos acidentalmente
export default function CampaignsPage({ leads, activeTab: initialTab = 'whatsapp', isDark = false, userPlan = 'free' }: CampaignsPageProps) {
  const planLimits = usePlanLimits();
  const [activeTab, setActiveTab] = useState(initialTab);

  // ✅ Carregar campanhas do banco de dados
  const confirm = useConfirm();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [channelSelectorOpen, setChannelSelectorOpen] = useState(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showSMSModal, setShowSMSModal] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null);

  // ✅ Estados para modals de funcionalidades
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [messageModalOpen, setMessageModalOpen] = useState(false);
  const [alertsModalOpen, setAlertsModalOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);

  // Listener WebSocket para stats em tempo real (sem polling extra)
  const handleCampaignStats = useCallback((data: { campaignId: string; stats: any; progress: { sent: number; failed: number; total: number; done?: number } }) => {
    setCampaigns(prev => prev.map(c => {
      if (c.id !== data.campaignId) return c;
      if (data.stats) return { ...c, ...whatsAppProgress({ status: c.status, settings: c.settings, stats: data.stats, metadata: c.metadata }) };
      const { sent, failed, total } = data.progress;
      const totalRecipients = total || c.totalRecipients || 1;
      const done = data.progress.done ?? sent + failed;
      return { ...c, sent, failed, totalRecipients, progress: Math.min(100, Math.round((done / totalRecipients) * 100)) };
    }));
  }, []);

  useWebSocket({ onCampaignStats: handleCampaignStats });

  const isDebugMode = (import.meta as any).env.DEV;
  const debugLog = (...args: any[]) => {
    if (!isDebugMode) return;
    console.log(...args);
  };
  const debugWarn = (...args: any[]) => {
    if (!isDebugMode) return;
    console.warn(...args);
  };

  // ✅ Função para recarregar campanhas do banco de dados
  const reloadCampaigns = async () => {
    try {
      setIsLoadingCampaigns(true);
      const token = localStorage.getItem('leadflow_access_token');
      if (!token) {
        console.warn('[CampaignsPage] ⚠️ No auth token found');
        return;
      }

      console.log('[CampaignsPage] 🔄 Reloading all campaigns from database...');

      // ✅ Fetch WhatsApp/General campaigns
      const response = await fetch(`${(import.meta as any).env.VITE_API_URL}/api/campaigns`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      // ✅ Fetch Email campaigns from specialized endpoint
      const emailResponse = await fetch(`${(import.meta as any).env.VITE_API_URL}/api/email-campaigns`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      // ✅ Fetch SMS campaigns
      const smsResponse = await fetch(`${(import.meta as any).env.VITE_API_URL}/api/sms-campaigns`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      let campaignsData: Campaign[] = [];

      if (response.ok) {
        const data = await response.json();
        const mappedWhatsApp = data.map((campaign: any) => {
          const settings = typeof campaign.settings === 'string' ? JSON.parse(campaign.settings) : campaign.settings || {};
          const stats = typeof campaign.stats === 'string' ? JSON.parse(campaign.stats) : campaign.stats || {};
          const metadata = typeof campaign.metadata === 'string' ? JSON.parse(campaign.metadata) : campaign.metadata || {};

          return {
            id: campaign.id,
            name: campaign.name,
            type: campaign.type || 'whatsapp',
            ...whatsAppProgress({ ...campaign, settings, stats, metadata }),
            scheduledDate: campaign.scheduled_at,
            completedDate: campaign.completed_at,
            createdAt: campaign.created_at,
            template: campaign.template,
            settings: campaign.settings,
            media_urls: campaign.media_urls || [],
          };
        });
        campaignsData = [...mappedWhatsApp];
      }

      if (emailResponse.ok) {
        const emailData = await emailResponse.json();
        if (emailData.success && emailData.campaigns) {
          const mappedEmail = emailData.campaigns.map((c: any) => {
            // Robust parsing for attachments
            let parsedAttachments = [];
            try {
              parsedAttachments = typeof c.attachments === 'string' ? JSON.parse(c.attachments) : (c.attachments || []);
              if (!Array.isArray(parsedAttachments)) parsedAttachments = [];
            } catch (e) {
              console.error('[CampaignsPage] Error parsing attachments for campaign', c.id, e);
            }

            // Robust parsing for selected_statuses
            let parsedStatuses = [];
            try {
              parsedStatuses = typeof c.selected_statuses === 'string' ? JSON.parse(c.selected_statuses) : (c.selected_statuses || []);
              if (!Array.isArray(parsedStatuses)) parsedStatuses = [];
            } catch (e) {
              parsedStatuses = c.selected_statuses || [];
            }

            console.log(`[CampaignsPage] 📧 Email Campaign ${c.id}: ${c.campaign_name} has ${parsedAttachments.length} attachments`);

            return {
              id: c.id,
              name: c.campaign_name,
              type: 'email' as const,
              status: normalizeCampaignStatus(c.status),
              totalRecipients: c.recipient_count || 0,
              sent: c.sent_count || 0,
              delivered: c.delivered_count || 0,
              read: c.opened_count || 0,
              replies: 0,
              failed: c.failed_count || 0,
              scheduledDate: c.scheduled_datetime || (c.scheduled_date ? `${c.scheduled_date}T${c.scheduled_time || '00:00:00'}` : null),
              completedDate: c.sent_at,
              createdAt: c.created_at,
              progress: (c.status === 'completed' || c.status === 'sent') ? 100 : (c.status === 'scheduled' ? 0 : (c.status === 'active' ? Math.floor(((c.sent_count || 0) / (c.recipient_count || 1)) * 100) : undefined)),
              estimatedTime: Math.ceil(((c.recipient_count || 0) - (c.sent_count || 0)) * 1 / 60),
              deliveryRate: c.sent_count > 0 ? Math.floor(((c.delivered_count || 0) / c.sent_count) * 100) : 0,
              metadata: c.metadata,
              template: c.subject,
              settings: {
                ...c.metadata,
                message: c.message,
                htmlContent: c.html_content,
                isHtml: c.is_html,
                recipientMode: c.recipient_mode,
                selectedStatuses: parsedStatuses,
                customEmails: c.custom_emails,
                scheduleMode: c.schedule_mode,
                scheduledDate: c.scheduled_date,
                scheduledTime: c.scheduled_time,
                fromEmail: c.from_email,
                fromName: c.from_name,
                attachments: parsedAttachments
              },
              media_urls: parsedAttachments,
            };
          });
          campaignsData = [...campaignsData, ...mappedEmail];
        }
      }

      if (smsResponse.ok) {
        const smsData = await smsResponse.json();
        if (smsData.success && smsData.campaigns) {
          const mappedSMS = smsData.campaigns.map((c: any) => ({
            id: c.id,
            name: c.campaign_name,
            type: 'sms' as const,
            status: normalizeCampaignStatus(c.status),
            totalRecipients: c.recipient_count || 0,
            sent: c.sent_count || 0,
            delivered: c.delivered_count || 0,
            read: 0,
            replies: 0,
            failed: c.failed_count || 0,
            scheduledDate: c.scheduled_datetime || (c.scheduled_date ? `${c.scheduled_date}T${c.scheduled_time || '00:00:00'}` : null),
            completedDate: c.sent_at,
            createdAt: c.created_at,
            progress: (c.status === 'completed') ? 100 : (c.status === 'active' ? Math.floor(((c.sent_count || 0) / (c.recipient_count || 1)) * 100) : 0),
            deliveryRate: c.sent_count > 0 ? Math.floor(((c.delivered_count || 0) / c.sent_count) * 100) : 0,
            template: c.message?.substring(0, 60),
            settings: {
              message: c.message,
              channelId: c.channel_id,
              recipientMode: c.recipient_mode,
              selectedStatuses: typeof c.selected_statuses === 'string' ? JSON.parse(c.selected_statuses) : (c.selected_statuses || []),
              customPhones: c.custom_phones,
              scheduleMode: c.schedule_mode,
              scheduledDate: c.scheduled_date,
              scheduledTime: c.scheduled_time,
            },
          }));
          campaignsData = [...campaignsData, ...mappedSMS];
        }
      }

      // Sort by created date descending
      campaignsData.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

      setCampaigns(campaignsData);
      console.log('[CampaignsPage] ✅ Total campaigns reloaded:', campaignsData.length);
    } catch (error) {
      console.error('[CampaignsPage] ❌ Error reloading campaigns:', error);
    } finally {
      setIsLoadingCampaigns(false);
    }
  };

  const handleChannelSelect = (channel: 'whatsapp' | 'email' | 'sms') => {
    if (channel === 'whatsapp') {
      setShowWhatsAppModal(true);
    } else if (channel === 'email') {
      setShowEmailModal(true);
    } else if (channel === 'sms') {
      setShowSMSModal(true);
    }
  };

  // ✅ Callback para adicionar nova campanha criada
  const handleCampaignCreated = async (newCampaign: any) => {
    debugLog('[CampaignsPage] ========== RECEBENDO NOVA CAMPANHA ==========');
    debugLog('[CampaignsPage] 🎉 Nova campanha recebida:', JSON.stringify(newCampaign, null, 2));

    // ✅ Recarregar campanhas do banco de dados
    await reloadCampaigns();

    debugLog('[CampaignsPage] ========== CAMPANHA ADICIONADA ==========');
  };

  // ✅ Callback para atualizar campanha existente (SEM DUPLICAR)
  const handleCampaignUpdated = async (updatedCampaign: any) => {
    debugLog('[CampaignsPage] ========== ATUALIZANDO CAMPANHA ==========');
    debugLog('[CampaignsPage] ✏️ Campanha atualizada:', JSON.stringify(updatedCampaign, null, 2));

    // ✅ Recarregar campanhas do banco de dados
    await reloadCampaigns();

    debugLog('[CampaignsPage] ========== CAMPANHA ATUALIZADA ==========');
  };

  // ✅ useEffect para debugar mudanças no estado
  useEffect(() => {
    debugLog('[CampaignsPage] 🔄 Estado de campanhas mudou!');
    debugLog('[CampaignsPage] 📊 Total de campanhas:', campaigns.length);
    debugLog('[CampaignsPage] 📊 Campanhas:', campaigns.map(c => ({ id: c.id, name: c.name, type: c.type, status: c.status })));
  }, [campaigns]);

  // ✅ Carregar campanhas do banco de dados ao montar componente
  useEffect(() => {
    reloadCampaigns();
  }, []); // Executar apenas uma vez ao montar

  // Progresso das campanhas em curso: quem envia é o servidor, aqui só se lê
  const trackedKey = campaigns
    .filter(c => (c.status === 'active' || c.status === 'sending') && (c.type === 'whatsapp' || c.type === 'email'))
    .map(c => `${c.type}:${c.id}`)
    .join(',');

  useEffect(() => {
    if (!trackedKey) return;
    const base = (import.meta as any).env.VITE_API_URL;
    const items = trackedKey.split(',').map(k => { const [type, id] = k.split(':'); return { type, id }; });

    const refresh = async () => {
      const token = localStorage.getItem('leadflow_access_token');
      const fresh = await Promise.all(items.map(async ({ type, id }) => {
        try {
          const res = await fetch(`${base}/api/${type === 'email' ? 'email-campaigns' : 'campaigns'}/${id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) return null;
          const data = await res.json();
          return { type, id, raw: type === 'email' ? data.campaign : data };
        } catch {
          return null;
        }
      }));

      setCampaigns(prev => prev.map(c => {
        const f = fresh.find(x => x?.id === c.id);
        if (!f?.raw) return c;
        if (f.type === 'whatsapp') return { ...c, ...whatsAppProgress(f.raw) };

        // Email: o envio termina no servidor e o painel marca a campanha como concluída
        const sent = f.raw.sent_count || 0;
        const failed = f.raw.failed_count || 0;
        const delivered = f.raw.delivered_count || 0;
        const total = c.totalRecipients || 1;
        const finished = sent + failed >= total || f.raw.status === 'completed' || f.raw.status === 'failed';
        if (finished && c.status !== 'completed') {
          fetch(`${base}/api/email-campaigns/${c.id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ status: 'completed', stats: { sent, delivered, read: f.raw.opened_count || 0, replied: 0, failed } }),
          }).catch(() => {});
        }
        return {
          ...c,
          status: finished ? 'completed' as const : c.status,
          sent,
          failed,
          delivered,
          read: f.raw.opened_count || 0,
          progress: finished ? 100 : Math.min(100, Math.floor((sent / total) * 100)),
          deliveryRate: sent > 0 ? Math.floor((delivered / sent) * 100) : 0,
        };
      }));
    };

    refresh();
    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, [trackedKey]);

  const setCampaignStatus = (id: string, status: Campaign['status'], metadata?: any) =>
    setCampaigns(prev => prev.map(c => (c.id === id ? { ...c, status, ...(metadata ? { metadata } : {}) } : c)));

  const campaignRequest = async (path: string, init: RequestInit) => {
    const token = localStorage.getItem('leadflow_access_token');
    const res = await fetch(`${(import.meta as any).env.VITE_API_URL}/api/campaigns/${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.message || 'Não foi possível concluir o pedido');
    return data;
  };

  const handleResumeCampaign = async (campaign: Campaign) => {
    setDropdownOpen(null);
    try {
      let result: any;
      if (campaign.type === 'whatsapp') {
        result = await campaignRequest(`${campaign.id}/execute`, { method: 'POST' });
      } else {
        const res = await fetch(`${(import.meta as any).env.VITE_API_URL}/api/${campaign.type === 'email' ? 'email-campaigns' : 'sms-campaigns'}/${campaign.id}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('leadflow_access_token')}` },
          body: JSON.stringify({}),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Não foi possível concluir o pedido');
        result = { totalLeads: data.recipientCount, plan: data.plan };
      }
      setCampaignStatus(campaign.id, 'active', { ...(campaign.metadata || {}), pausedReason: undefined });
      toast.success('Campanha retomada');
      warnPlanLimit(result);
      await reloadCampaigns();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handlePauseCampaign = async (campaign: Campaign) => {
    setDropdownOpen(null);
    setCampaignStatus(campaign.id, 'paused', { ...(campaign.metadata || {}), pausedReason: 'USER', waiting: undefined });
    if (campaign.type !== 'whatsapp') return;
    try {
      await campaignRequest(`${campaign.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'paused' }) });
      toast.success('Campanha pausada');
    } catch (error: any) {
      setCampaignStatus(campaign.id, campaign.status, campaign.metadata);
      toast.error(error.message);
    }
  };

  const handleCancelCampaign = async (campaign: Campaign) => {
    const confirmed = await confirm(`Tem certeza que deseja cancelar a campanha "${campaign.name}"?`, {
      title: 'Cancelar campanha',
      description: 'A campanha será interrompida e removida da lista ativa.',
      confirmLabel: 'Cancelar campanha',
      variant: 'warning',
    });
    if (confirmed) {
      // Optimistic: remove imediatamente da UI
      setCampaigns(prev => prev.filter(c => c.id !== campaign.id));
      setDropdownOpen(null);
      toast.success(`Campanha "${campaign.name}" cancelada!`);

      // Sincronizar com banco em background
      const token = localStorage.getItem('leadflow_access_token');
      if (!token) return;
      const endpoint = campaign.type === 'email' ? 'email-campaigns' : (campaign.type === 'sms' ? 'sms-campaigns' : 'campaigns');
      fetch(`${(import.meta as any).env.VITE_API_URL}/api/${endpoint}/${campaign.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      }).then(res => {
        if (!res.ok) throw new Error('Erro ao cancelar campanha');
      }).catch(error => {
        console.error('[CampaignsPage] Erro ao cancelar campanha:', error);
        // Restaurar campanha na UI em caso de falha
        setCampaigns(prev => [campaign, ...prev]);
        toast.error('Erro ao cancelar campanha — restaurado');
      });
    }
  };

  const handleDeleteCampaign = async (id: string, name: string) => {
    const confirmed = await confirm(`Tem certeza que deseja eliminar a campanha "${name}"?`, {
      title: 'Eliminar campanha',
      description: 'Esta ação não pode ser desfeita.',
      confirmLabel: 'Eliminar',
      variant: 'danger',
    });
    if (confirmed) {
      // Optimistic: salvar snapshot e remover imediatamente da UI
      const snapshot = campaigns.find(c => c.id === id) ?? null;
      setCampaigns(prev => prev.filter(c => c.id !== id));
      setDropdownOpen(null);
      toast.success(`Campanha "${name}" eliminada com sucesso!`);

      // Sincronizar com banco em background
      const token = localStorage.getItem('leadflow_access_token');
      if (!token) return;
      const type = snapshot?.type;
      const endpoint = type === 'email' ? 'email-campaigns' : (type === 'sms' ? 'sms-campaigns' : 'campaigns');
      fetch(`${(import.meta as any).env.VITE_API_URL}/api/${endpoint}/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      }).then(res => {
        if (!res.ok) throw new Error('Erro ao excluir campanha');
      }).catch(error => {
        console.error('[CampaignsPage] Erro ao deletar campanha:', error);
        // Restaurar campanha na UI em caso de falha
        if (snapshot) setCampaigns(prev => [snapshot, ...prev]);
        toast.error('Erro ao eliminar campanha — restaurado');
      });
    }
  };

  const handleEditCampaign = (campaign: Campaign) => {
    // ✅ Abrir modal de edição de acordo com o tipo da campanha
    setEditingCampaign(campaign);
    setDropdownOpen(null);

    if (campaign.type === 'whatsapp') {
      setShowWhatsAppModal(true);
    } else if (campaign.type === 'email') {
      setShowEmailModal(true);
    } else if (campaign.type === 'sms') {
      setShowSMSModal(true);
    }
  };

  const handleSendNow = async (id: string, name: string, type?: string) => {
    const confirmed = await confirm(`Enviar campanha "${name}" agora?`, {
      title: 'Confirmar envio',
      description: 'O envio começará imediatamente e os resultados aparecerão nas notificações.',
      confirmLabel: 'Enviar agora',
      variant: 'info',
    });
    if (confirmed) {
      try {
        const token = localStorage.getItem('leadflow_access_token');
        if (!token) {
          toast.error('Você precisa estar autenticado');
          return;
        }

        // Para campanhas WhatsApp, usar o endpoint de execução direto
        // que envia as mensagens e cria conversas no inbox automaticamente
        if (type === 'whatsapp') {
          console.log('[CampaignsPage] Executando campanha WhatsApp diretamente...');

          const executeResponse = await fetch(`${(import.meta as any).env.VITE_API_URL}/api/campaigns/${id}/execute`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
          });

          if (!executeResponse.ok) {
            const errorData = await executeResponse.json();
            throw new Error(errorData.error || 'Erro ao executar campanha');
          }

          const result = await executeResponse.json();
          console.log('[CampaignsPage] Campanha iniciada:', result);

          toast.success(`Campanha "${name}" iniciada! A enviar para ${result.totalLeads} contactos...`);
          warnPlanLimit(result);
        } else if (type === 'sms') {
          // Para campanhas SMS, acionar endpoint de send dedicado
          const smsResponse = await fetch(`${(import.meta as any).env.VITE_API_URL}/api/sms-campaigns/${id}/send`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({}),
          });

          if (!smsResponse.ok) {
            const errData = await smsResponse.json();
            throw new Error(errData.error || 'Erro ao enviar SMS');
          }

          const smsResult = await smsResponse.json();
          toast.success(`Campanha SMS "${name}" iniciada! A enviar para ${smsResult.recipientCount} contactos...`);
          warnPlanLimit({ totalLeads: smsResult.recipientCount, plan: smsResult.plan });
        } else {
          // Para outros tipos (email), apenas atualizar status
          const response = await fetch(`${(import.meta as any).env.VITE_API_URL}/api/campaigns/${id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              status: 'active',
            }),
          });

          if (!response.ok) {
            throw new Error('Erro ao iniciar campanha');
          }

          toast.success(`Campanha "${name}" iniciada!`);
        }

        // ✅ Recarregar campanhas do banco
        await reloadCampaigns();
        setDropdownOpen(null);
      } catch (error: any) {
        console.error('[CampaignsPage] Erro ao iniciar campanha:', error);
        toast.error(error.message || 'Erro ao iniciar campanha');
      }
    }
  };

  const handleViewReport = (campaign: Campaign) => {
    setDetailsModalOpen(true);
    setSelectedCampaign(campaign);
    setDropdownOpen(null);
  };

  // ✅ Duplicar campanha
  const handleDuplicateCampaign = async (campaign: Campaign) => {
    try {
      const token = localStorage.getItem('leadflow_access_token');
      if (!token) {
        toast.error('Você precisa estar autenticado');
        return;
      }

      // ✅ Criar nova campanha no banco baseada na existente
      const newCampaignData = {
        name: `${campaign.name} (Cópia)`,
        description: `Cópia de ${campaign.name}`,
        type: campaign.type,
        status: 'draft',
        template: campaign.template,
        settings: campaign.settings,
        media_urls: campaign.media_urls || [],
      };

      const response = await fetch(`${(import.meta as any).env.VITE_API_URL}/api/campaigns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(newCampaignData),
      });

      if (!response.ok) {
        throw new Error('Erro ao duplicar campanha');
      }

      // ✅ Recarregar campanhas do banco
      await reloadCampaigns();

      toast.success(`Campanha "${campaign.name}" duplicada com sucesso!`);
      setDropdownOpen(null);
    } catch (error) {
      console.error('[CampaignsPage] Erro ao duplicar campanha:', error);
      toast.error('Erro ao duplicar campanha');
    }
  };

  // ✅ Exportar dados para CSV
  const handleExportData = (campaign: Campaign) => {
    const csvData = [
      ['LeadsFlow API - Dados da Campanha'],
      [''],
      ['Nome', campaign.name],
      ['Canal', campaign.type === 'whatsapp' ? 'WhatsApp' : campaign.type === 'email' ? 'Email' : 'SMS'],
      ['Status', campaign.status],
      ['Total de Destinatários', campaign.totalRecipients.toString()],
      ...(campaign.sent ? [['Enviadas', campaign.sent.toString()]] : []),
      ...(campaign.delivered ? [['Entregues', campaign.delivered.toString()]] : []),
      ...(campaign.read ? [['Visualizadas', campaign.read.toString()]] : []),
      ...(campaign.replies ? [['Respostas', campaign.replies.toString()]] : []),
      ...(campaign.deliveryRate ? [['Taxa de Entrega', `${campaign.deliveryRate}%`]] : []),
      [''],
      ['Exportado em', new Date().toLocaleString(getLocale())],
    ];

    const csvContent = csvData.map(row => row.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    void saveFile(`campanha_${campaign.id}.csv`, blob, 'text/csv');
    setDropdownOpen(null);
  };

  // ✅ Reenviar para falhados
  const handleResendFailed = (campaign: Campaign) => {
    void (async () => {
      const confirmed = await confirm(`Reenviar campanha "${campaign.name}" apenas para os destinatários que falharam?`, {
        title: 'Reenviar falhados',
        description: 'Apenas os contactos com falha serão reenviados.',
        confirmLabel: 'Reenviar',
        variant: 'warning',
      });
      if (!confirmed) return;
      setDropdownOpen(null);
      try {
        const res = await campaignRequest(`${campaign.id}/retry-failed`, { method: 'POST' });
        toast.success(res.retried === 1 ? '1 contacto voltou à fila' : `${res.retried} contactos voltaram à fila`);
        await reloadCampaigns();
      } catch (error: any) {
        toast.error(error.message);
      }
    })();
  };

  // Pesquisa: nome, mensagem, assunto e estado — sem acentos/maiúsculas, em todos os canais
  const searchMatches = campaigns.filter(c =>
    matchesSearch(searchTerm, c.name, c.template, c.settings?.subject, CAMPAIGN_STATUS_LABELS[c.status])
  );
  const filteredCampaigns = searchMatches.filter(c => c.type === activeTab);
  const isSearching = searchTerm.trim() !== '';
  const countByChannel = (type: Campaign['type']) => searchMatches.filter(c => c.type === type).length;

  // Se o canal aberto não tem resultados mas outro tem, mostra esse
  useEffect(() => {
    if (!searchTerm.trim() || filteredCampaigns.length > 0) return;
    const firstWithResults = (['whatsapp', 'email', 'sms'] as const).find(t => searchMatches.some(c => c.type === t));
    if (firstWithResults && firstWithResults !== activeTab) setActiveTab(firstWithResults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, campaigns]);

  // 'sending' (em envio) aparece junto das ativas — antes não entrava em nenhuma lista
  const activeCampaigns = filteredCampaigns.filter(c => c.status === 'active' || c.status === 'paused' || c.status === 'sending');
  const scheduledCampaigns = filteredCampaigns.filter(c => c.status === 'scheduled');
  const draftCampaigns = filteredCampaigns.filter(c => c.status === 'draft');
  const completedCampaigns = filteredCampaigns.filter(c => c.status === 'completed');
  const failedCampaigns = filteredCampaigns.filter(c => c.status === 'failed');

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(getLocale(), {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getDaysUntil = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const formatMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) return `~${hours}h ${mins}m`;
    return `~${mins}m`;
  };

  const DropdownMenu = ({ campaign }: { campaign: Campaign }) => {
    const isOpen = dropdownOpen === campaign.id;

    return (
      <div className="relative">
        <button aria-label="Mais opções"
          onClick={() => setDropdownOpen(isOpen ? null : campaign.id)}
          className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-muted-foreground hover:bg-muted/50 rounded-lg transition-all duration-150"
        >
          <MoreVertical className="w-5 h-5" />
        </button>

        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setDropdownOpen(null)}
            />
            <div className="absolute right-0 mt-2 w-56 bg-card rounded-lg shadow-lg border border-border py-1 z-20">
              {(campaign.status === 'active' || campaign.status === 'paused') && (
                <>
                  <button
                    onClick={() => handleEditCampaign(campaign)}
                    className="w-full text-left px-4 py-2 text-sm text-foreground/80 hover:bg-muted/50 flex items-center gap-3 transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                    <span>Editar campanha</span>
                  </button>
                  <button
                    onClick={() => {
                      setDetailsModalOpen(true);
                      setSelectedCampaign(campaign);
                      setDropdownOpen(null);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-foreground/80 hover:bg-muted/50 flex items-center gap-3 transition-colors"
                  >
                    <BarChart3 className="w-4 h-4" />
                    <span>Ver detalhes</span>
                  </button>
                  <button
                    onClick={() => {
                      setMessageModalOpen(true);
                      setSelectedCampaign(campaign);
                      setDropdownOpen(null);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-foreground/80 hover:bg-muted/50 flex items-center gap-3 transition-colors"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Ver Mensagem</span>
                  </button>
                  <button
                    onClick={() => handleDuplicateCampaign(campaign)}
                    className="w-full text-left px-4 py-2 text-sm text-foreground/80 hover:bg-muted/50 flex items-center gap-3 transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                    <span>Duplicar</span>
                  </button>
                  <div className="border-t border-border my-1"></div>
                  {campaign.type === 'whatsapp' && (campaign.failed ?? 0) > 0 && (
                  <button
                    onClick={() => handleResendFailed(campaign)}
                    className="w-full text-left px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center gap-3 transition-colors"
                  >
                    <Send className="w-4 h-4" />
                    <span>Reenviar falhados</span>
                  </button>
                  )}
                  <div className="border-t border-border my-1"></div>
                  <button
                    onClick={() => handleExportData(campaign)}
                    className="w-full text-left px-4 py-2 text-sm text-foreground/80 hover:bg-muted/50 flex items-center gap-3 transition-colors"
                  >
                    <FileDown className="w-4 h-4" />
                    <span>Exportar Dados</span>
                  </button>
                  <button
                    onClick={() => {
                      setAlertsModalOpen(true);
                      setSelectedCampaign(campaign);
                      setDropdownOpen(null);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-foreground/80 hover:bg-muted/50 flex items-center gap-3 transition-colors"
                  >
                    <Bell className="w-4 h-4" />
                    <span>Configurar Alertas</span>
                  </button>
                </>
              )}

              {campaign.status === 'scheduled' && (
                <>
                  <button
                    onClick={() => {
                      setMessageModalOpen(true);
                      setSelectedCampaign(campaign);
                      setDropdownOpen(null);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-foreground/80 hover:bg-muted/50 flex items-center gap-3 transition-colors"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Ver Mensagem</span>
                  </button>
                  <button
                    onClick={() => handleDuplicateCampaign(campaign)}
                    className="w-full text-left px-4 py-2 text-sm text-foreground/80 hover:bg-muted/50 flex items-center gap-3 transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                    <span>Duplicar</span>
                  </button>
                  <button
                    onClick={() => {
                      alert('Alterar horário de envio');
                      setDropdownOpen(null);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-foreground/80 hover:bg-muted/50 flex items-center gap-3 transition-colors"
                  >
                    <Calendar className="w-4 h-4" />
                    <span>Alterar Horário</span>
                  </button>
                  <div className="border-t border-border my-1"></div>
                  <button
                    onClick={() => handleDeleteCampaign(campaign.id, campaign.name)}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Eliminar</span>
                  </button>
                </>
              )}

              {campaign.status === 'completed' && (
                <>
                  <button
                    onClick={() => handleViewReport(campaign)}
                    className="w-full text-left px-4 py-2 text-sm text-foreground/80 hover:bg-muted/50 flex items-center gap-3 transition-colors"
                  >
                    <BarChart3 className="w-4 h-4" />
                    <span>Ver Relatório</span>
                  </button>
                  <button
                    onClick={() => {
                      setMessageModalOpen(true);
                      setSelectedCampaign(campaign);
                      setDropdownOpen(null);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-foreground/80 hover:bg-muted/50 flex items-center gap-3 transition-colors"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Ver Mensagem</span>
                  </button>
                  <button
                    onClick={() => handleDuplicateCampaign(campaign)}
                    className="w-full text-left px-4 py-2 text-sm text-foreground/80 hover:bg-muted/50 flex items-center gap-3 transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                    <span>Duplicar</span>
                  </button>
                  <div className="border-t border-border my-1"></div>
                  <button
                    onClick={() => handleDeleteCampaign(campaign.id, campaign.name)}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Eliminar</span>
                  </button>
                </>
              )}

              {campaign.status === 'draft' && (
                <>
                  <button
                    onClick={() => handleEditCampaign(campaign)}
                    className="w-full text-left px-4 py-2 text-sm text-foreground/80 hover:bg-muted/50 flex items-center gap-3 transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                    <span>Editar campanha</span>
                  </button>
                  <button
                    onClick={() => {
                      setMessageModalOpen(true);
                      setSelectedCampaign(campaign);
                      setDropdownOpen(null);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-foreground/80 hover:bg-muted/50 flex items-center gap-3 transition-colors"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Ver Mensagem</span>
                  </button>
                  <button
                    onClick={() => handleDuplicateCampaign(campaign)}
                    className="w-full text-left px-4 py-2 text-sm text-foreground/80 hover:bg-muted/50 flex items-center gap-3 transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                    <span>Duplicar</span>
                  </button>
                  <div className="border-t border-border my-1"></div>
                  <button
                    onClick={() => handleDeleteCampaign(campaign.id, campaign.name)}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Eliminar</span>
                  </button>
                </>
              )}

              {campaign.status === 'failed' && (
                <>
                  <button
                    onClick={() => handleViewReport(campaign)}
                    className="w-full text-left px-4 py-2 text-sm text-foreground/80 hover:bg-muted/50 flex items-center gap-3 transition-colors"
                  >
                    <BarChart3 className="w-4 h-4" />
                    <span>Ver Relatório</span>
                  </button>
                  <button
                    onClick={() => {
                      setMessageModalOpen(true);
                      setSelectedCampaign(campaign);
                      setDropdownOpen(null);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-foreground/80 hover:bg-muted/50 flex items-center gap-3 transition-colors"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Ver Mensagem</span>
                  </button>
                  <button
                    onClick={() => handleDuplicateCampaign(campaign)}
                    className="w-full text-left px-4 py-2 text-sm text-foreground/80 hover:bg-muted/50 flex items-center gap-3 transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                    <span>Duplicar</span>
                  </button>
                  <div className="border-t border-border my-1"></div>
                  <button
                    onClick={() => handleResendFailed(campaign)}
                    className="w-full text-left px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center gap-3 transition-colors"
                  >
                    <Send className="w-4 h-4" />
                    <span>Reenviar</span>
                  </button>
                  <div className="border-t border-border my-1"></div>
                  <button
                    onClick={() => handleDeleteCampaign(campaign.id, campaign.name)}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Eliminar</span>
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  const handleNewCampaign = () => {
    // SMS campaigns: open SMS modal directly (Twilio handles sending)
    if (activeTab === 'sms') {
      setShowSMSModal(true);
      return;
    }
    // Email campaigns bypass plan limits when SMTP is configured
    const hasSmtp = !!localStorage.getItem('smtp_host');
    if (activeTab === 'email' && hasSmtp) {
      setShowEmailModal(true);
      return;
    }
    // Count all non-completed campaigns across all types as "active"
    const activeCampaignCount = campaigns.filter(c =>
      c.status === 'active' || c.status === 'scheduled' || c.status === 'paused'
    ).length;
    if (!planLimits.canCreateActiveCampaign(activeCampaignCount)) {
      planLimits.openUpgradeModal();
      toast.warning(
        `Limite de ${planLimits.limitLabel.activeCampaigns} campanha(s) ativa(s) atingido. Faça melhorar o plano para criar mais.`,
        { duration: 4000 }
      );
      return;
    }
    setChannelSelectorOpen(true);
  };

  return (
    <div className="w-full">
      <main>
        <PageHeader
          title="Campanhas"
          description="Envios em massa por WhatsApp, email e SMS"
          icon={Megaphone}
          create={{ label: 'Nova campanha', onClick: handleNewCampaign }}
        />

        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Pesquisar campanhas..."
          containerClassName="mb-6 w-full sm:w-80"
          className="w-full"
        />

        {/* Channel Tabs */}
        <div className="mb-6 md:mb-8">
          <div className="border-b border-border">
            <nav className="grid grid-cols-3 sm:flex sm:space-x-8">
              <button
                onClick={() => setActiveTab('whatsapp')}
                className={`py-3 px-1 text-sm sm:text-base font-semibold flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 border-b-2 transition-all ${activeTab === 'whatsapp'
                  ? 'border-[#10B981] text-[#10B981]'
                  : 'border-transparent text-muted-foreground hover:text-[#10B981]'
                  }`}
              >
                <BrandIcon brand="whatsapp" className="w-4 h-4 flex-shrink-0" />
                <span>WhatsApp</span>
                <span className={`min-w-[22px] rounded-full px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums ${activeTab === 'whatsapp' ? 'bg-[#10B981] text-white' : 'bg-muted text-muted-foreground'}`}>
                  {countByChannel('whatsapp')}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('email')}
                className={`py-3 px-1 text-sm sm:text-base font-semibold flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 border-b-2 transition-all ${activeTab === 'email'
                  ? 'border-[#3B82F6] text-[#3B82F6]'
                  : 'border-transparent text-muted-foreground hover:text-[#3B82F6]'
                  }`}
              >
                <Mail className="w-4 h-4 flex-shrink-0" />
                <span>Email</span>
                <span className={`min-w-[22px] rounded-full px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums ${activeTab === 'email' ? 'bg-[#3B82F6] text-white' : 'bg-muted text-muted-foreground'}`}>
                  {countByChannel('email')}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('sms')}
                className={`py-3 px-1 text-sm sm:text-base font-semibold flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 border-b-2 transition-all ${activeTab === 'sms'
                  ? 'border-[#F22F46] text-[#F22F46]'
                  : 'border-transparent text-muted-foreground hover:text-[#F22F46]'
                  }`}
              >
                <MessageSquare className="w-4 h-4 flex-shrink-0" />
                <span>SMS</span>
                <span className={`min-w-[22px] rounded-full px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums ${activeTab === 'sms' ? 'bg-[#F22F46] text-white' : 'bg-muted text-muted-foreground'}`}>
                  {countByChannel('sms')}
                </span>
              </button>
            </nav>
          </div>
        </div>

        {/* WhatsApp, Email & SMS Content */}
        {(activeTab === 'whatsapp' || activeTab === 'email' || activeTab === 'sms') && (
          <div className="space-y-10">

            {/* Skeleton: first load with no cached data */}
            {isLoadingCampaigns && campaigns.length === 0 && (
              <>
                <SkeletonCampaignSection count={3} />
                <SkeletonCampaignSection count={2} />
              </>
            )}

            {/* Pesquisa sem resultados em nenhum canal */}
            {(!isLoadingCampaigns || campaigns.length > 0) && searchTerm.trim() !== '' && searchMatches.length === 0 && (
              <EmptyState
                icon={Megaphone}
                title="Nenhuma campanha encontrada"
                description={`Nada corresponde a "${searchTerm.trim()}" no nome, mensagem ou estado.`}
                action={<AppButton variant="outline" onClick={() => setSearchTerm('')}>Limpar pesquisa</AppButton>}
              />
            )}

            {/* Canal sem campanhas: um só estado vazio com a ação de criar (sem uma caixa por secção) */}
            {!isLoadingCampaigns && !isSearching && filteredCampaigns.length === 0 && (
              <EmptyState
                icon={Megaphone}
                title={`Ainda não tem campanhas de ${activeTab === 'whatsapp' ? 'WhatsApp' : activeTab === 'email' ? 'email' : 'SMS'}`}
                description="Crie a primeira para enviar mensagens aos seus leads."
                action={<AppButton onClick={handleNewCampaign}><Plus />Criar campanha</AppButton>}
              />
            )}

            {/* Content: stale or fresh data */}
            {(!isLoadingCampaigns || campaigns.length > 0) && filteredCampaigns.length > 0 && !(searchTerm.trim() !== '' && searchMatches.length === 0) && (
              <>
                {isLoadingCampaigns && (
                  <div className="flex items-center justify-end">
                    <UpdatingBadge />
                  </div>
                )}
                {activeCampaigns.length === 0 && scheduledCampaigns.length === 0 && !isSearching && (
                  <EmptyState
                    icon={Megaphone}
                    title="Sem campanhas ativas ou agendadas"
                    description="Crie uma campanha para enviar mensagens aos seus leads."
                    action={<AppButton onClick={handleNewCampaign}><Plus />Criar campanha</AppButton>}
                  />
                )}
                <section className={activeCampaigns.length === 0 ? 'hidden' : undefined}>
                  <h3 className="text-lg font-semibold text-foreground dark:text-foreground mb-4 flex items-center space-x-2">
                    <PlayCircle className="w-5 h-5 text-[#10B981]" />
                    <span>Campanhas Ativas</span>
                    <span className="text-sm font-normal text-muted-foreground">({activeCampaigns.length})</span>
                  </h3>
                  {activeCampaigns.length > 0 ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                      {activeCampaigns.map((campaign) => {
                        const state = sendingState(campaign);
                        return (
                        <DashboardCard key={campaign.id} disableContentPadding className="hover:shadow-md transition-shadow duration-200">
                        <div className="p-6">
                          <div className="flex items-start justify-between mb-4">
                            <div>
                              <h4 className="font-semibold text-foreground dark:text-foreground mb-1">{campaign.name}</h4>
                              <StatusBadge label={state.label} tone={state.tone} />
                              {state.resumeAt && (
                                <p className="mt-1.5 text-xs text-muted-foreground">
                                  Continua <span translate="no">{new Date(state.resumeAt).toLocaleString(getLocale(), { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                                </p>
                              )}
                              {state.detail && <p className="mt-1.5 text-xs text-muted-foreground">{state.detail}</p>}
                            </div>
                            <DropdownMenu campaign={campaign} />
                          </div>

                          <div className="mb-4">
                            <div className="flex justify-between text-sm text-muted-foreground mb-2">
                              <span>{campaign.sent?.toLocaleString(getLocale(), NUMBER_OPTS)} / {campaign.totalRecipients.toLocaleString(getLocale(), NUMBER_OPTS)} enviadas</span>
                              <span>{campaign.progress}%</span>
                            </div>
                            <div className="w-full bg-muted dark:bg-muted rounded-full h-2">
                              <div
                                className="bg-[#10B981] h-2 rounded-full transition-all duration-300"
                                style={{ width: `${campaign.progress}%` }}
                              />
                            </div>
                            {((campaign.excluded ?? 0) + (campaign.skipped ?? 0)) > 0 && (
                              <p className="mt-1.5 text-xs text-muted-foreground">
                                {((campaign.excluded ?? 0) + (campaign.skipped ?? 0)).toLocaleString(getLocale(), NUMBER_OPTS)} ficaram de fora
                              </p>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">Entregues</span>
                              <p className="font-semibold text-foreground">
                                {campaign.delivered?.toLocaleString(getLocale(), NUMBER_OPTS)}
                                {(campaign.sent ?? 0) > 0 && <span className="ml-1 text-xs font-normal text-muted-foreground">{campaign.deliveryRate}%</span>}
                              </p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Visualizadas</span>
                              <p className="font-semibold text-foreground">{campaign.read?.toLocaleString(getLocale(), NUMBER_OPTS)}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Respostas</span>
                              <p className="font-semibold text-foreground">
                                {(campaign.replies ?? 0).toLocaleString(getLocale(), NUMBER_OPTS)}
                                {(campaign.sent ?? 0) > 0 && <span className="ml-1 text-xs font-normal text-muted-foreground">{Math.round(((campaign.replies ?? 0) / (campaign.sent ?? 1)) * 100)}%</span>}
                              </p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Tempo restante</span>
                              <p className="font-semibold text-foreground">{campaign.type === 'whatsapp' ? remainingTime(campaign) : formatMinutes(campaign.estimatedTime || 0)}</p>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex gap-2 pt-4 border-t border-border">
                            {campaign.status === 'paused' ? (
                              <AppButton variant="outline" onClick={() => handleResumeCampaign(campaign)} className="flex-1">
                                <Play className="w-4 h-4" />
                                <span>Retomar</span>
                              </AppButton>
                            ) : campaign.type === 'whatsapp' ? (
                              // SMS e email enviam de seguida no servidor: só pausam quando o plano acaba
                              <AppButton variant="outline" onClick={() => handlePauseCampaign(campaign)} className="flex-1">
                                <Pause className="w-4 h-4" />
                                <span>Pausar</span>
                              </AppButton>
                            ) : null}
                            <AppButton
                              variant="outline"
                              onClick={() => handleCancelCampaign(campaign)}
                              className="flex-1 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-300 dark:hover:border-red-800"
                            >
                              <X className="w-4 h-4" />
                              <span>Cancelar</span>
                            </AppButton>
                          </div>
                        </div>
                        </DashboardCard>
                        );
                      })}
                    </div>
                  ) : null}
                </section>

                {/* Scheduled Campaigns */}
                <section className={scheduledCampaigns.length === 0 ? 'hidden' : undefined}>
                  <h3 className="text-lg font-semibold text-foreground dark:text-foreground mb-4 flex items-center space-x-2">
                    <Clock className="w-5 h-5 text-[#F59E0B]" />
                    <span>Campanhas Agendadas</span>
                    <span className="text-sm font-normal text-muted-foreground">({scheduledCampaigns.length})</span>
                  </h3>
                  {scheduledCampaigns.length > 0 ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                      {scheduledCampaigns.map((campaign) => {
                        // ✅ Verificar se scheduledDate existe e é válida
                        const hasValidDate = campaign.scheduledDate && !isNaN(new Date(campaign.scheduledDate).getTime());
                        const daysUntil = hasValidDate ? getDaysUntil(campaign.scheduledDate!) : null;
                        const formattedDate = hasValidDate ? formatDate(campaign.scheduledDate!) : 'Data não definida';

                        return (
                          <DashboardCard key={campaign.id} disableContentPadding className="hover:shadow-md transition-shadow duration-200">
                          <div className="p-6">
                            <div className="flex items-start justify-between mb-4">
                              <div>
                                <h4 className="font-semibold text-foreground dark:text-foreground mb-1">{campaign.name}</h4>
                                <div className="flex items-center space-x-2">
                                  <Calendar className="w-4 h-4 text-[#F59E0B]" />
                                  <span className={`text-sm ${!hasValidDate ? 'text-red-500 dark:text-red-400' : 'text-muted-foreground'}`}>
                                    {formattedDate}
                                  </span>
                                </div>
                              </div>
                              <DropdownMenu campaign={campaign} />
                            </div>

                            <div className="mb-4">
                              <div className={`border rounded-lg p-3 ${!hasValidDate ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/30' : 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-900/30'}`}>
                                <div className="flex items-center space-x-2 mb-1">
                                  <Timer className={`w-4 h-4 ${!hasValidDate ? 'text-red-500 dark:text-red-400' : 'text-blue-500 dark:text-blue-400'}`} />
                                  <span className={`text-sm font-medium ${!hasValidDate ? 'text-red-700 dark:text-red-400' : 'text-blue-700 dark:text-blue-400'}`}>
                                    {!hasValidDate
                                      ? 'Agendar data de envio'
                                      : daysUntil === 0
                                        ? 'Hoje'
                                        : daysUntil === 1
                                          ? 'Amanhã'
                                          : `Em ${daysUntil} dias`
                                    }
                                  </span>
                                </div>
                                <p className={`text-sm ${!hasValidDate ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>
                                  {campaign.totalRecipients.toLocaleString(getLocale(), NUMBER_OPTS)} destinatários
                                </p>
                              </div>
                            </div>

                            {/* Action Buttons - Scheduled */}
                            <div className="flex gap-2 pt-4 border-t border-border">
                              <AppButton
                                variant="outline"
                                onClick={() => handleEditCampaign(campaign)}
                                className="flex-1 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900/50 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-800"
                              >
                                <Edit2 className="w-4 h-4" />
                                <span>Editar</span>
                              </AppButton>
                              <AppButton
                                onClick={() => handleSendNow(campaign.id, campaign.name, campaign.type)}
                                className="flex-1"
                              >
                                <Send className="w-4 h-4" />
                                <span>Enviar</span>
                              </AppButton>
                            </div>
                          </div>
                          </DashboardCard>
                        );
                      })}
                    </div>
                  ) : null}
                </section>

                {/* Draft/Saved Campaigns */}
                <section className={draftCampaigns.length === 0 ? 'hidden' : undefined}>
                  <h3 className="text-lg font-semibold text-foreground dark:text-foreground mb-4 flex items-center space-x-2">
                    <Save className="w-5 h-5 text-blue-500" />
                    <span>Rascunhos</span>
                    <span className="text-sm font-normal text-muted-foreground">({draftCampaigns.length})</span>
                  </h3>
                  {draftCampaigns.length > 0 ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                      {draftCampaigns.map((campaign) => (
                        <DashboardCard key={campaign.id} disableContentPadding className="hover:shadow-md transition-shadow duration-200">
                        <div className="p-6">
                          <div className="flex items-start justify-between mb-4">
                            <div>
                              <h4 className="font-semibold text-foreground dark:text-foreground mb-1">{campaign.name}</h4>
                              <div className="flex items-center space-x-2">
                                <FileText className="w-4 h-4 text-blue-500" />
                                <span className="text-sm text-muted-foreground">
                                  {campaign.createdAt ? formatDate(campaign.createdAt) : 'Sem data'}
                                </span>
                              </div>
                            </div>
                            <DropdownMenu campaign={campaign} />
                          </div>

                          <div className="mb-4">
                            <div className="border rounded-lg p-3 bg-muted/50 border-border">
                              <div className="flex items-center space-x-2 mb-1">
                                <Users className="w-4 h-4 text-muted-foreground" />
                                <span className="text-sm font-medium text-foreground/80">
                                  {campaign.totalRecipients.toLocaleString(getLocale(), NUMBER_OPTS)} destinatários
                                </span>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                Pronto para envio
                              </p>
                            </div>
                          </div>

                          {/* Action Buttons - Draft */}
                          <div className="flex gap-2 pt-4 border-t border-border">
                            <AppButton
                              variant="outline"
                              onClick={() => handleEditCampaign(campaign)}
                              className="flex-1 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900/50 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-800"
                            >
                              <Edit2 className="w-4 h-4" />
                              <span>Editar</span>
                            </AppButton>
                            <AppButton
                              onClick={() => handleSendNow(campaign.id, campaign.name, campaign.type)}
                              className="flex-1"
                            >
                              <Send className="w-4 h-4" />
                              <span>Enviar</span>
                            </AppButton>
                          </div>
                        </div>
                        </DashboardCard>
                      ))}
                    </div>
                  ) : null}
                </section>

                {/* Completed Campaigns */}
                <section className={completedCampaigns.length === 0 ? 'hidden' : undefined}>
                  <h3 className="text-lg font-semibold text-foreground dark:text-foreground mb-4 flex items-center space-x-2">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span>Campanhas Concluídas</span>
                    <span className="text-sm font-normal text-muted-foreground">({completedCampaigns.length})</span>
                  </h3>
                  {completedCampaigns.length > 0 ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                      {completedCampaigns.map((campaign) => (
                        <DashboardCard key={campaign.id} disableContentPadding className="hover:shadow-md transition-shadow duration-200">
                        <div className="p-6">
                          <div className="flex items-start justify-between mb-4">
                            <div>
                              <h4 className="font-semibold text-foreground dark:text-foreground mb-1">{campaign.name}</h4>
                              <div className="flex items-center space-x-2">
                                <CalendarCheck className="w-4 h-4 text-green-500" />
                                <span className="text-sm text-muted-foreground">{formatDate(campaign.completedDate!)}</span>
                              </div>
                            </div>
                            <DropdownMenu campaign={campaign} />
                          </div>

                          <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">Total enviadas</span>
                              <p className="font-semibold text-foreground">{campaign.sent?.toLocaleString(getLocale(), NUMBER_OPTS)}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Taxa de entrega</span>
                              <p className="font-semibold text-green-600 dark:text-green-400">{campaign.deliveryRate}%</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Visualizações</span>
                              <p className="font-semibold text-foreground">{campaign.read?.toLocaleString(getLocale(), NUMBER_OPTS)}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Respostas</span>
                              <p className="font-semibold text-foreground">{campaign.replies?.toLocaleString(getLocale(), NUMBER_OPTS)}</p>
                            </div>
                          </div>

                          <AppButton
                            onClick={() => handleViewReport(campaign)}
                            variant="outline"
                            size="sm"
                            className="w-full bg-muted hover:bg-muted text-foreground/80 border-0 font-medium"
                          >
                            <BarChart3 className="w-4 h-4" />
                            Ver Relatório Completo
                          </AppButton>
                        </div>
                        </DashboardCard>
                      ))}
                    </div>
                  ) : null}
                </section>

                {/* Failed Campaigns */}
                {failedCampaigns.length > 0 && (
                  <section>
                    <h3 className="text-lg font-semibold text-foreground dark:text-foreground mb-4 flex items-center space-x-2">
                      <XCircle className="w-5 h-5 text-red-500" />
                      <span>Canceladas ou com falha</span>
                      <span className="text-sm font-normal text-muted-foreground">({failedCampaigns.length})</span>
                    </h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                      {failedCampaigns.map((campaign) => (
                        <DashboardCard key={campaign.id} disableContentPadding className="border-red-200 dark:border-red-900 hover:shadow-md transition-shadow duration-200">
                        <div className="p-6">
                          <div className="flex items-start justify-between mb-4">
                            <div>
                              <h4 className="font-semibold text-foreground dark:text-foreground mb-1">{campaign.name}</h4>
                              <div className="flex items-center space-x-2">
                                <XCircle className="w-4 h-4 text-red-500" />
                                <span className="text-sm text-red-500 dark:text-red-400">{formatDate(campaign.completedDate || campaign.updatedDate || campaign.createdDate)}</span>
                              </div>
                            </div>
                            <DropdownMenu campaign={campaign} />
                          </div>

                          <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">Enviadas</span>
                              <p className="font-semibold text-foreground">{campaign.sent?.toLocaleString(getLocale(), NUMBER_OPTS) ?? 0}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Falhadas</span>
                              <p className="font-semibold text-red-600 dark:text-red-400">{campaign.failed?.toLocaleString(getLocale(), NUMBER_OPTS) ?? 0}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Total previsto</span>
                              <p className="font-semibold text-foreground">{campaign.totalRecipients?.toLocaleString(getLocale(), NUMBER_OPTS) ?? 0}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Taxa de entrega</span>
                              <p className="font-semibold text-red-600 dark:text-red-400">{campaign.deliveryRate ?? 0}%</p>
                            </div>
                          </div>

                          <AppButton
                            onClick={() => handleViewReport(campaign)}
                            variant="outline"
                            size="sm"
                            className="w-full bg-red-50 dark:bg-red-950 hover:bg-red-100 dark:hover:bg-red-900 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800 font-medium"
                          >
                            <BarChart3 className="w-4 h-4" />
                            Ver Relatório
                          </AppButton>
                        </div>
                        </DashboardCard>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        )}
      </main>

      {/* Modals */}
      <ChannelSelectorModal
        isOpen={channelSelectorOpen}
        onClose={() => setChannelSelectorOpen(false)}
        onSelectChannel={handleChannelSelect}
      />

      {showWhatsAppModal && (
        <CampaignWhatsAppModal
          isOpen={showWhatsAppModal}
          onClose={() => {
            setShowWhatsAppModal(false);
            setEditingCampaign(null);
          }}
          leads={leads}
          onCampaignCreated={handleCampaignCreated}
          onCampaignUpdated={handleCampaignUpdated}
          editingCampaign={editingCampaign}
          userPlan={userPlan}
          isDark={isDark}
        />
      )}

      {showEmailModal && (
        <CampaignEmailModal
          isOpen={showEmailModal}
          onClose={() => {
            setShowEmailModal(false);
            setEditingCampaign(null);
          }}
          leads={leads}
          onCampaignCreated={handleCampaignCreated}
          onCampaignUpdated={handleCampaignUpdated}
          editingCampaign={editingCampaign}
        />
      )}

      {showSMSModal && (
        <CampaignSMSModal
          isOpen={showSMSModal}
          onClose={() => {
            setShowSMSModal(false);
            setEditingCampaign(null);
          }}
          leads={leads}
          onCampaignCreated={handleCampaignCreated}
          onCampaignUpdated={handleCampaignUpdated}
          editingCampaign={editingCampaign}
        />
      )}

      {detailsModalOpen && (
        <CampaignDetailsModal
          isOpen={detailsModalOpen}
          onClose={() => setDetailsModalOpen(false)}
          campaign={selectedCampaign as any}
        />
      )}

      {messageModalOpen && (
        <CampaignMessageModal
          isOpen={messageModalOpen}
          onClose={() => setMessageModalOpen(false)}
          campaign={selectedCampaign!}
        />
      )}

      {alertsModalOpen && (
        <CampaignAlertsModal
          isOpen={alertsModalOpen}
          onClose={() => setAlertsModalOpen(false)}
          campaign={selectedCampaign!}
        />
      )}
    </div>
  );
}


