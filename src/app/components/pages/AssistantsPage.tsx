import { matchesSearch } from '../../utils/search';
import { OverlayModal } from '../base/OverlayModal';
import { useState, useEffect, useCallback, useRef } from 'react';
import { AppModal } from '../base/AppModal';
import { ChoiceList } from '../base/ChoiceList';
import {
  Bot, Search, Plus, Settings, Power, PowerOff, Trash2,
  Briefcase, Headphones, Calendar, Users, ShoppingCart,
  Zap, X, Check, Loader2,
  MessageSquare, Clock, Star, Sparkles, Link2, Unlink2,
  Edit3, Send, Mail, Hash, Globe,
  Smartphone, History, Lock, AlertTriangle, Mic,
  Image, FileText, Upload, BookOpen, FileSpreadsheet, ChevronDown, ChevronUp, ShieldCheck, RefreshCw, ArrowLeft
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { PageHeader, PageAction } from '../base/PageHeader';
import { EmptyState } from '../base/EmptyState';
import { SettingsAction, SettingsField, SettingsGroup, SettingsItem, SettingsToggle } from '../base/SettingsList';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';
import { assistantsApi, googleDriveApi, MAX_KNOWLEDGE_FILES, type AssistantVoice, type Assistant, type UserAssistant, type CreateAssistantInput, type KnowledgeFile } from '../../services/api/assistants';
import { BrandIcon } from '../base/BrandIcon';
import { AssistantTestChat } from '../assistants/AssistantTestChat';
import { isNativeApp, openBrowser } from '../../../native';
import { channelsApi } from '../../services/api/inbox';
import type { Channel } from '../../types/inbox';
import { usePlanLimits } from '../../hooks/usePlanLimits';
import { useConfirm } from '../ui/ConfirmDialog';
import { SkeletonAssistantGrid } from '../ui/skeletons';
import { getLocale } from '../../utils/format';
import { channelDisplayName } from '../inbox/channels/ChannelRows';
import { brandIcon } from '../base/BrandIcon';

// O canal do site tem um nome interno (ex.: "Leadsflowapi"): mostra "Chat do site"
const assistantChannelName = (channel: Channel) =>
  channel.type === 'website' ? 'Chat do site' : channelDisplayName(channel);

// Textos dos assistentes que vêm da base de dados em pt-BR
const PT_MZ: [RegExp, string][] = [
  [/\bcoleta dados\b/gi, 'recolhe dados'],
  [/\bColeta de dados\b/g, 'Recolha de dados'],
  [/\bcoleta de dados\b/g, 'recolha de dados'],
  [/\bdo (equipe|time) comercial\b/gi, 'da equipa comercial'],
  [/\bao (equipe|time) comercial\b/gi, 'à equipa comercial'],
  [/\bo (equipe|time) comercial\b/gi, 'a equipa comercial'],
  [/\b(equipe|time) comercial\b/gi, 'equipa comercial'],
  [/\bequipe\b/g, 'equipa'],
  [/\bEquipe\b/g, 'Equipa'],
];
const ptMZ = (text?: string) => PT_MZ.reduce((t, [re, to]) => t.replace(re, to), text || '');

interface AssistantsPageProps {
  isDark: boolean;
}

// Secções das definições de um assistente (cada função na sua)
const SETTINGS_SECTIONS = [
  { key: 'geral', label: 'Geral' },
  { key: 'testar', label: 'Testar' },
  { key: 'vendas', label: 'Vendas e agenda' },
  { key: 'conhecimento', label: 'Conhecimento' },
  { key: 'midia', label: 'Voz e media' },
  { key: 'seguranca', label: 'Equipa e segurança' },
  { key: 'avancado', label: 'Avançado' },
] as const;

// Ritmo dos follow-ups automáticos (horas entre cada mensagem, desde a última)
const FOLLOWUP_PRESETS: Array<{ label: string; hint: string; steps: number[] }> = [
  { label: 'Rápido', hint: '4 h, 1 dia, 3 dias', steps: [4, 24, 72] },
  { label: 'Normal', hint: '1, 2 e 4 dias', steps: [24, 48, 96] },
  { label: 'Suave', hint: '2, 5 e 10 dias', steps: [48, 120, 240] },
];

// Map icon names to Lucide components
const ICON_MAP: Record<string, React.ComponentType<any>> = {
  'briefcase': Briefcase,
  'headphones': Headphones,
  'calendar': Calendar,
  'users': Users,
  'shopping-cart': ShoppingCart,
  'bot': Bot,
  'zap': Zap,
  'star': Star,
  'message-square': MessageSquare,
};

const ICON_OPTIONS = [
  { value: 'bot', label: 'Bot', icon: Bot },
  { value: 'briefcase', label: 'Vendas', icon: Briefcase },
  { value: 'headphones', label: 'Suporte', icon: Headphones },
  { value: 'calendar', label: 'Agenda', icon: Calendar },
  { value: 'users', label: 'Leads', icon: Users },
  { value: 'shopping-cart', label: 'Pedidos', icon: ShoppingCart },
  { value: 'zap', label: 'Automação', icon: Zap },
  { value: 'message-square', label: 'Chat', icon: MessageSquare },
];

const COLOR_OPTIONS = [
  '#3B82F6', '#10B981', '#6366F1', '#F59E0B', '#EC4899',
  '#EF4444', '#8B5CF6', '#14B8A6', '#F97316', '#06B6D4',
];

const CATEGORY_LABELS: Record<string, string> = {
  'sales': 'Vendas',
  'support': 'Suporte',
  'scheduling': 'Agendamento',
  'marketing': 'Marketing',
  'ecommerce': 'E-commerce',
  'general': 'Geral',
  'custom': 'Personalizado',
};

/**
 * Logótipo do assistente, como o ícone de uma app: quadrado arredondado em gradiente
 * da cor do assistente, com o ícone a branco.
 */
function AssistantLogo({ icon, color, size = 'md' }: { icon?: string; color?: string; size?: 'sm' | 'md' }) {
  const Icon = ICON_MAP[icon || 'bot'] || Bot;
  const c = color || '#3B82F6';
  const box = size === 'sm' ? 'h-10 w-10 rounded-xl' : 'h-12 w-12 rounded-2xl';
  return (
    <div
      className={`${box} flex flex-shrink-0 items-center justify-center text-white`}
      style={{
        backgroundColor: c,
        backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${c} 82%, white), color-mix(in srgb, ${c} 70%, black))`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.25), 0 6px 14px -6px ${c}`,
      }}
    >
      <Icon className={size === 'sm' ? 'h-5 w-5' : 'h-6 w-6'} strokeWidth={2.2} />
    </div>
  );
}

const CHANNEL_ICONS: Record<string, React.ComponentType<any>> = {
  'whatsapp': brandIcon('whatsapp'),
  'whatsapp_cloud': brandIcon('whatsapp'),
  'instagram': brandIcon('instagram'),
  'facebook': brandIcon('messenger'),
  'messenger': brandIcon('messenger'),
  'telegram': brandIcon('telegram'),
  'email': Mail,
  'twilio_sms': Smartphone,
  'sms': Smartphone,
  'twilio': Smartphone,
  'website': Globe,
};

const CHANNEL_COLORS: Record<string, string> = {
  'whatsapp': 'text-green-500',
  'whatsapp_cloud': 'text-green-500',
  'instagram': 'text-pink-500',
  'facebook': 'text-blue-600',
  'messenger': 'text-blue-600',
  'telegram': 'text-sky-500',
  'email': 'text-gray-500',
  'twilio_sms': 'text-teal-500',
  'sms': 'text-teal-500',
  'twilio': 'text-teal-500',
  'website': 'text-violet-500',
};

// Assistants available for free-plan users to try (by name, case-insensitive)
const FREE_SAMPLE_ASSISTANTS = ['atendente virtual'];

function isFreeTrialAssistant(assistant: Assistant): boolean {
  return !assistant.is_custom && FREE_SAMPLE_ASSISTANTS.includes(assistant.name.toLowerCase());
}

export default function AssistantsPage({ isDark }: AssistantsPageProps) {
  const confirm = useConfirm();
  const planLimits = usePlanLimits();
  const [activeTab, setActiveTab] = useState<'marketplace' | 'connected'>('connected');
  // Só na primeira carga: sem assistentes ligados abre no Marketplace
  const tabChosenRef = useRef(false);
  const [availableAssistants, setAvailableAssistants] = useState<Assistant[]>([]);
  const [userAssistants, setUserAssistants] = useState<UserAssistant[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [premiumModalOpen, setPremiumModalOpen] = useState(false);
  const [premiumModalReason, setPremiumModalReason] = useState<'marketplace' | 'custom_limit'>('marketplace');

  // Modal states
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  // Definições numa página com secções (cada função na sua)
  type SettingsSection = 'geral' | 'vendas' | 'conhecimento' | 'midia' | 'seguranca' | 'avancado' | 'testar';
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('geral');
  const [configLoadingFresh, setConfigLoadingFresh] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedAssistant, setSelectedAssistant] = useState<Assistant | null>(null);
  const [selectedUserAssistant, setSelectedUserAssistant] = useState<UserAssistant | null>(null);
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [configValues, setConfigValues] = useState<Record<string, any>>({});
  const [voices, setVoices] = useState<AssistantVoice[]>([]);
  // Só carrega as vozes quando as respostas em áudio estão ligadas
  useEffect(() => {
    if (!configValues.audio_enabled || voices.length > 0) return;
    assistantsApi.getVoices().then(setVoices).catch(() => {});
  }, [configValues.audio_enabled, voices.length]);
  const [actionLoading, setActionLoading] = useState(false);
  const [knowledgeFiles, setKnowledgeFiles] = useState<KnowledgeFile[]>([]); // base de conhecimento (RAG)
  const [clientFiles, setClientFiles] = useState<KnowledgeFile[]>([]); // arquivos para enviar ao cliente
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [uploadingKind, setUploadingKind] = useState<'rag' | 'client' | null>(null);
  const [expandedFileId, setExpandedFileId] = useState<string | null>(null);
  const [fullTextCache, setFullTextCache] = useState<Record<string, string>>({});
  const [loadingFullTextId, setLoadingFullTextId] = useState<string | null>(null);

  // Create modal state

  const [createForm, setCreateForm] = useState<CreateAssistantInput>({
    name: '',
    description: '',
    short_description: '',
    icon: 'bot',
    color: '#3B82F6',
    category: 'custom',
    features: [],
    greeting: '',
    instructions: '',
  });
  const [newFeature, setNewFeature] = useState('');
  const [editingAssistantId, setEditingAssistantId] = useState<string | null>(null);

  // Load data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [assistants, userAssists, channelsList] = await Promise.all([
        assistantsApi.getAvailable(),
        assistantsApi.getUserAssistants(),
        channelsApi.getAll(),
      ]);
      setAvailableAssistants(assistants);
      setUserAssistants(userAssists);
      setChannels(channelsList);
      if (!tabChosenRef.current) {
        tabChosenRef.current = true;
        if (userAssists.length === 0) setActiveTab('marketplace');
      }
    } catch (error) {
      console.error('[AssistantsPage] Error loading data:', error);
      toast.error('Erro ao carregar assistentes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh dos stats a cada 60s e quando a janela ganha foco
  useEffect(() => {
    const refreshStats = async () => {
      try {
        const userAssists = await assistantsApi.getUserAssistants();
        setUserAssistants(userAssists);
      } catch { /* silent */ }
    };
    const interval = setInterval(refreshStats, 60_000);
    window.addEventListener('focus', refreshStats);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', refreshStats);
    };
  }, []);

  // Filter assistants
  const filteredAssistants = availableAssistants.filter(assistant => {
    const matchesQuery = matchesSearch(searchTerm, assistant.name, assistant.description, assistant.category);
    const matchesCategory = selectedCategory === 'all' || assistant.category === selectedCategory;
    return matchesQuery && matchesCategory;
  });

  // Check if assistant is connected
  const isConnected = (assistantId: string) => {
    return userAssistants.some(ua => ua.assistant_id === assistantId);
  };

  // Get user assistant by assistant ID
  const getUserAssistantByAssistantId = (assistantId: string) => {
    return userAssistants.find(ua => ua.assistant_id === assistantId);
  };

  // Toggle channel selection
  const toggleChannelSelection = (channelId: string) => {
    setSelectedChannelIds(prev =>
      prev.includes(channelId)
        ? prev.filter(id => id !== channelId)
        : [...prev, channelId]
    );
  };

  // Que outro assistente já usa este canal?
  const channelOwner = (channelId: string, exceptUserAssistantId?: string) =>
    userAssistants.find((ua) => ua.id !== exceptUserAssistantId && (ua.channel_ids || []).includes(channelId));

  // Canal que já tem assistente: trabalham em equipa (passam a conversa entre si) ou este substitui o outro
  const [sharing, setSharing] = useState<{ rows: { channel: Channel; owner: UserAssistant }[]; mode: 'team' | 'replace' } | null>(null);
  const sharingResolve = useRef<(value: string[] | null) => void>(() => {});
  const finishSharing = (value: string[] | null) => {
    setSharing(null);
    sharingResolve.current(value);
  };

  /** Canais a tirar dos outros assistentes ([] = em equipa; null = cancelado). Só pergunta pelos canais novos. */
  const askChannelSharing = (channelIds: string[], current?: UserAssistant | null): Promise<string[] | null> => {
    const already = new Set(current?.id ? current.channel_ids || [] : []);
    const rows = channelIds
      .filter((id) => !already.has(id))
      .map((id) => ({ channel: channels.find((c) => c.id === id)!, owner: channelOwner(id, current?.id || undefined)! }))
      .filter((r) => r.channel && r.owner);
    if (rows.length === 0) return Promise.resolve([]);
    return new Promise((resolve) => {
      sharingResolve.current = resolve;
      setSharing({ rows, mode: 'team' });
    });
  };

  // Handle connect
  const handleConnect = async () => {
    if (!selectedAssistant) return;

    // ✅ Validar seleção de canais
    if (selectedChannelIds.length === 0) {
      toast.error('Selecione pelo menos UM canal para ligar o assistente');
      return;
    }
    const replaceChannelIds = await askChannelSharing(selectedChannelIds);
    if (replaceChannelIds === null) return;

    try {
      setActionLoading(true);
      await assistantsApi.connect(selectedAssistant.id, selectedChannelIds, replaceChannelIds);
      toast.success(`${selectedAssistant.name} ligado com sucesso!`);
      setConnectModalOpen(false);
      setSelectedAssistant(null);
      setSelectedChannelIds([]);
      loadData();
    } catch (error: any) {
      console.error('[AssistantsPage] Error connecting:', error);
      toast.error(error.response?.data?.error || 'Erro ao ligar assistente');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle disconnect
  const handleDisconnect = async (userAssistant: UserAssistant) => {
    const confirmed = await confirm(`Deseja realmente desligar ${userAssistant.assistant?.name}?`, {
      title: 'Desligar assistente',
      confirmLabel: 'Desligar',
      variant: 'warning',
    });
    if (!confirmed) return;

    try {
      setActionLoading(true);
      await assistantsApi.disconnect(userAssistant.id);
      toast.success('Assistente desligado');
      loadData();
    } catch (error) {
      console.error('[AssistantsPage] Error disconnecting:', error);
      toast.error('Erro ao desligar assistente');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle toggle
  const handleToggle = async (userAssistant: UserAssistant) => {
    try {
      await assistantsApi.toggle(userAssistant.id, !userAssistant.is_active);
      toast.success(userAssistant.is_active ? 'Assistente desativado' : 'Assistente ativado');
      loadData();
    } catch (error) {
      console.error('[AssistantsPage] Error toggling:', error);
      toast.error('Erro ao alterar status');
    }
  };

  // Handle save config
  const handleSaveConfig = async () => {
    if (!selectedUserAssistant) return;
    const isPreview = !selectedUserAssistant.id;
    const previewAssistant = selectedUserAssistant.assistant as Assistant | undefined;
    if (isPreview) {
      if (!previewAssistant) return;
      if (!previewAssistant.is_custom && !isFreeTrialAssistant(previewAssistant) && !planLimits.features.marketplaceAssistants) {
        setPremiumModalReason('marketplace');
        setPremiumModalOpen(true);
        return;
      }
      if (selectedChannelIds.length === 0) {
        setSettingsSection('geral');
        toast.error('Escolha pelo menos um canal para ligar o assistente');
        return;
      }
    }
    const replaceChannelIds = await askChannelSharing(selectedChannelIds, selectedUserAssistant);
    if (replaceChannelIds === null) return;

    // Basic validation: require AI api key if provider is configured
    if (configValues.ai_provider && !configValues.ai_api_key?.trim()) {
      toast.error('API Key é obrigatória para usar IA');
      return;
    }

    try {
      setActionLoading(true);
      // Normalize __default__ sentinel back to empty string before saving
      const valuesToSave: Record<string, any> = {
        ...configValues,
        ai_model: configValues.ai_model === '__default__' ? '' : (configValues.ai_model || ''),
      };
      // Gatilhos de escalação: se o usuário digitou (string), converte para array;
      // se ficou vazio, remove a chave para o backend usar os gatilhos padrão.
      if (typeof configValues.escalation_keywords === 'string') {
        const parsed = configValues.escalation_keywords.split(',').map((s: string) => s.trim()).filter(Boolean);
        if (parsed.length > 0) {
          valuesToSave.escalation_keywords = parsed;
        } else {
          delete valuesToSave.escalation_keywords;
        }
      }
      let targetId = selectedUserAssistant.id;
      if (isPreview) {
        const connected = await assistantsApi.connect(selectedUserAssistant.assistant_id, selectedChannelIds, replaceChannelIds);
        targetId = connected.id;
      }
      await assistantsApi.configure(
        targetId,
        valuesToSave,
        selectedChannelIds.length > 0 ? selectedChannelIds : undefined,
        replaceChannelIds
      );
      toast.success(isPreview ? `${previewAssistant?.name || 'Assistente'} ligado com sucesso!` : 'Configuração guardada com sucesso!');
      closeSettings();
      if (isPreview) setActiveTab('connected');
      loadData();
    } catch (error: any) {
      console.error('[AssistantsPage] Error saving config:', error);
      const msg = error.response?.data?.error || error.response?.data?.details || error.message || 'Erro ao salvar configuração';
      toast.error(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const normalizeConfig = (cfg: Record<string, any>) => ({
    ...cfg,
    ai_model: cfg.ai_model || '__default__',
    context_window_enabled: cfg.context_window_enabled !== false,
    context_window_messages: cfg.context_window_messages ?? 10,
    memory_enabled: cfg.memory_enabled !== false,
    funnel_tracking_enabled: cfg.funnel_tracking_enabled !== false,
    audio_enabled: cfg.audio_enabled === true || cfg.audio_enabled === 'true',
    vision_enabled: cfg.vision_enabled !== false,
    document_enabled: cfg.document_enabled !== false,
    reactions_enabled: cfg.reactions_enabled === true || cfg.reactions_enabled === 'true',
    knowledge_base_enabled: cfg.knowledge_base_enabled !== false,
    file_sending_enabled: cfg.file_sending_enabled !== false,
    escalation_enabled: cfg.escalation_enabled !== false,
    guardrails_enabled: cfg.guardrails_enabled !== false,
    followup_enabled: cfg.followup_enabled === true || cfg.followup_enabled === 'true',
    followup_steps_hours: Array.isArray(cfg.followup_steps_hours) ? cfg.followup_steps_hours : [24, 48, 96],
    calendar_check_enabled: cfg.calendar_check_enabled !== false,
    appointment_minutes: Number(cfg.appointment_minutes) || 60,
  });

  // Agentes do marketplace trazem as suas funções de vendas ligadas (follow-ups, agenda…)
  const SALES_DEFAULT_KEYS = ['followup_enabled', 'followup_steps_hours', 'calendar_check_enabled', 'appointment_minutes'];
  const withAgentDefaults = (ua: UserAssistant) => {
    const defaults = ((ua as any).assistant?.default_config || {}) as Record<string, any>;
    const picked = Object.fromEntries(SALES_DEFAULT_KEYS.filter((k) => defaults[k] !== undefined).map((k) => [k, defaults[k]]));
    return { ...picked, ...(ua.config || {}) };
  };

  // ========== Base de Conhecimento / Arquivos para clientes ==========

  // ── Google Drive ──
  const [drive, setDrive] = useState<{ configured: boolean; connected: boolean; email: string | null } | null>(null);
  const [driveBusy, setDriveBusy] = useState<'connect' | 'sync' | null>(null);
  useEffect(() => {
    googleDriveApi.status().then(setDrive).catch(() => setDrive(null));
  }, []);

  const handleDriveReturn = useCallback((params: Record<string, string>) => {
    setDriveBusy(null);
    if (params.drive === 'importing') {
      const n = Number(params.count || 0);
      toast.success(n === 1 ? 'A importar 1 documento do Google Drive' : `A importar ${n} documentos do Google Drive`);
      if (Number(params.skipped || 0) > 0) toast.warning(`Limite de ${MAX_KNOWLEDGE_FILES} documentos: ${params.skipped} ficaram de fora.`);
      googleDriveApi.status().then(setDrive).catch(() => {});
      if (params.assistant) void loadKnowledgeFiles(params.assistant);
    } else if (params.drive === 'error') {
      toast.error('Não foi possível ligar o Google Drive. Tente de novo.');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // App: a aba do Google fecha e o native.ts avisa; web: a janela do Google avisa antes de fechar
    const onApp = (e: Event) => handleDriveReturn((e as CustomEvent).detail || {});
    const apiOrigin = (() => { try { return new URL(import.meta.env.VITE_API_URL || 'https://api.leadsflowapi.com').origin; } catch { return ''; } })();
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== apiOrigin || e.data?.type !== 'leadsflow-drive') return;
      handleDriveReturn(e.data);
    };
    window.addEventListener('leadsflow-drive', onApp);
    window.addEventListener('message', onMessage);
    return () => { window.removeEventListener('leadsflow-drive', onApp); window.removeEventListener('message', onMessage); };
  }, [handleDriveReturn]);

  const handleAddFromDrive = async () => {
    if (!selectedUserAssistant) return;
    const native = isNativeApp();
    // A janela abre já (antes do pedido) para o browser não a bloquear
    const popup = native ? null : window.open('', 'leadsflow-drive', 'width=960,height=720');
    try {
      setDriveBusy('connect');
      const url = await googleDriveApi.start(selectedUserAssistant.id, native ? 'app' : 'web');
      if (native) { await openBrowser(url); return; }
      if (popup) {
        popup.location.href = url;
        // Se a janela fechar sem aviso (o Google às vezes corta a ligação), atualiza na mesma
        const id = selectedUserAssistant.id;
        const timer = window.setInterval(() => {
          if (popup.closed) { window.clearInterval(timer); setDriveBusy(null); void loadKnowledgeFiles(id); }
        }, 800);
      } else {
        window.location.href = url;
      }
    } catch (err: any) {
      popup?.close();
      setDriveBusy(null);
      toast.error(err?.response?.data?.error || 'Não foi possível abrir o Google Drive.');
    }
  };

  const handleSyncDrive = async () => {
    if (!selectedUserAssistant) return;
    try {
      setDriveBusy('sync');
      const r = await assistantsApi.syncDriveFiles(selectedUserAssistant.id);
      toast.success(r.updated > 0 ? `${r.updated} documento(s) atualizado(s)` : 'Os documentos já estão atualizados');
      await loadKnowledgeFiles(selectedUserAssistant.id);
    } catch (err: any) {
      if (err?.response?.data?.code === 'DRIVE_NOT_CONNECTED') {
        toast.error('Ligue de novo o Google Drive.');
        setDrive((d) => d ? { ...d, connected: false } : d);
      } else {
        toast.error(err?.response?.data?.error || 'Não foi possível sincronizar.');
      }
    } finally {
      setDriveBusy(null);
    }
  };

  // Documentos a importar: atualiza a lista até ficarem prontos
  useEffect(() => {
    if (!selectedUserAssistant || !knowledgeFiles.some((f) => f.status === 'processing')) return;
    const t = window.setTimeout(() => void loadKnowledgeFiles(selectedUserAssistant.id), 3000);
    return () => window.clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knowledgeFiles, selectedUserAssistant?.id]);

  const loadKnowledgeFiles = async (userAssistantId: string) => {
    try {
      setKnowledgeLoading(true);
      const [rag, client] = await Promise.all([
        assistantsApi.listKnowledgeFiles(userAssistantId, 'rag'),
        assistantsApi.listKnowledgeFiles(userAssistantId, 'client'),
      ]);
      setKnowledgeFiles(rag);
      setClientFiles(client);
    } catch (err) {
      console.warn('[AssistantsPage] Could not load knowledge files:', err);
    } finally {
      setKnowledgeLoading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleUploadKnowledge = async (e: React.ChangeEvent<HTMLInputElement>, kind: 'rag' | 'client') => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selectedUserAssistant) return;

    const currentList = kind === 'client' ? clientFiles : knowledgeFiles;
    if (currentList.length >= MAX_KNOWLEDGE_FILES) {
      toast.error(`Limite de ${MAX_KNOWLEDGE_FILES} documentos atingido.`);
      return;
    }

    const ext = (file.name.split('.').pop() || '').toLowerCase();
    // Imagens só nos ficheiros para clientes (o assistente envia-as quando a resposta está nelas)
    const allowed = ['pdf', 'xlsx', 'xls', 'csv', 'txt', 'docx', 'doc', ...(kind === 'client' ? ['jpg', 'jpeg', 'png', 'webp'] : [])];
    if (!allowed.includes(ext)) {
      toast.error(kind === 'client'
        ? 'Formato não suportado. Envie PDF, Excel (XLSX), CSV, TXT, DOCX ou imagem (JPG, PNG).'
        : 'Formato não suportado. Envie PDF, Excel (XLSX), CSV, TXT ou DOCX.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('O ficheiro excede o limite de 5MB.');
      return;
    }

    try {
      setUploadingKind(kind);
      const kbFile = await assistantsApi.uploadKnowledgeFile(selectedUserAssistant.id, file, kind);
      if (kbFile.status === 'failed') {
        toast.warning('Ficheiro enviado, mas não foi possível extrair texto dele (documento sem texto selecionável ou formato não suportado).');
      } else {
        toast.success(kind === 'client' ? 'Ficheiro adicionado aos ficheiros para clientes!' : 'Documento adicionado à base de conhecimento!');
      }
      await loadKnowledgeFiles(selectedUserAssistant.id);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Erro ao enviar arquivo';
      toast.error(msg);
    } finally {
      setUploadingKind(null);
    }
  };

  const handleDeleteKnowledgeFile = async (fileId: string, kind: 'rag' | 'client') => {
    if (!selectedUserAssistant) return;
    try {
      await assistantsApi.deleteKnowledgeFile(selectedUserAssistant.id, fileId);
      toast.success('Ficheiro removido');
      const setList = kind === 'client' ? setClientFiles : setKnowledgeFiles;
      setList(prev => prev.filter(f => f.id !== fileId));
      if (kind === 'rag') {
        setExpandedFileId(prev => prev === fileId ? null : prev);
        setFullTextCache(prev => {
          const next = { ...prev };
          delete next[fileId];
          return next;
        });
      }
    } catch {
      toast.error('Erro ao remover ficheiro');
    }
  };

  const handleTogglePreview = (fileId: string) => {
    setExpandedFileId(prev => prev === fileId ? null : fileId);
  };

  const handleViewFullText = async (fileId: string) => {
    if (!selectedUserAssistant) return;
    if (fullTextCache[fileId] !== undefined) return;
    try {
      setLoadingFullTextId(fileId);
      const text = await assistantsApi.getKnowledgeFileText(selectedUserAssistant.id, fileId);
      setFullTextCache(prev => ({ ...prev, [fileId]: text }));
    } catch {
      toast.error('Erro ao carregar o texto do documento');
    } finally {
      setLoadingFullTextId(null);
    }
  };

  // Open config modal — fetch fresh data to avoid stale cached config
  // Ver um assistente do marketplace antes de o ligar: as mesmas definições e a conversa de teste
  const openPreview = (assistant: Assistant) => {
    const defaults = ((assistant as any).default_config || {}) as Record<string, any>;
    const preview = { id: '', assistant_id: assistant.id, assistant, config: {}, channel_ids: [], is_active: false } as unknown as UserAssistant;
    setSelectedUserAssistant(preview);
    setConfigValues(normalizeConfig({ ...withAgentDefaults(preview), instructions: defaults.instructions || '', greeting: defaults.greeting || '' }));
    setSelectedChannelIds([]);
    setKnowledgeFiles([]);
    setClientFiles([]);
    setSettingsSection('testar');
    setConfigModalOpen(true);
  };

  const closeSettings = () => {
    setConfigModalOpen(false);
    setSelectedUserAssistant(null);
  };

  // Botão "voltar" do telemóvel/browser: fecha as definições em vez de sair da página
  const settingsOpen = configModalOpen && !!selectedUserAssistant;
  const settingsIsPreview = settingsOpen && !selectedUserAssistant?.id;
  useEffect(() => {
    if (!settingsOpen) return;
    window.history.pushState({ ...(window.history.state || {}), assistantSettings: true }, '');
    const onPop = () => { setConfigModalOpen(false); setSelectedUserAssistant(null); };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      if (window.history.state?.assistantSettings) window.history.back();
    };
  }, [settingsOpen]);

  const openConfigModal = async (userAssistant: UserAssistant) => {
    setSettingsSection('geral');
    setSelectedUserAssistant(userAssistant);
    setConfigValues(normalizeConfig(withAgentDefaults(userAssistant)));
    setSelectedChannelIds(userAssistant.channel_ids || []);
    setConfigModalOpen(true);
    void loadKnowledgeFiles(userAssistant.id);
    // Re-fetch fresh config in background (updates modal if data differs)
    setConfigLoadingFresh(true);
    try {
      const fresh = await assistantsApi.getUserAssistantById(userAssistant.id);
      setSelectedUserAssistant(fresh);
      setConfigValues(normalizeConfig(withAgentDefaults(fresh)));
      setSelectedChannelIds(fresh.channel_ids || []);
    } catch (err) {
      // Keep cached data on error — just warn
      console.warn('[AssistantsPage] Could not refresh config, using cached data');
    } finally {
      setConfigLoadingFresh(false);
    }
  };

  // Handle create assistant
  const handleCreateAssistant = async () => {
    if (!createForm.name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }

    try {
      setActionLoading(true);

      if (editingAssistantId) {
        await assistantsApi.update(editingAssistantId, createForm);
        toast.success('Assistente atualizado com sucesso!');
      } else {
        await assistantsApi.create(createForm);
        toast.success('Assistente criado com sucesso!');
      }

      setCreateModalOpen(false);
      resetCreateForm();
      loadData();
    } catch (error: any) {
      console.error('[AssistantsPage] Error creating/updating assistant:', error.response?.data || error);
      const msg = error.response?.data?.details || error.response?.data?.error || 'Erro ao salvar assistente';
      toast.error(msg);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle delete custom assistant
  const handleDeleteAssistant = async (assistant: Assistant) => {
    const confirmed = await confirm(`Deseja realmente apagar o assistente "${assistant.name}"? Esta ação não pode ser desfeita.`, {
      title: 'Eliminar assistente',
      confirmLabel: 'Eliminar',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      setActionLoading(true);
      await assistantsApi.deleteAssistant(assistant.id);
      // Optimistic update — remove immediately from state
      setAvailableAssistants(prev => prev.filter(a => a.id !== assistant.id));
      setUserAssistants(prev => prev.filter(ua => ua.assistant_id !== assistant.id));
      toast.success('Assistente apagado com sucesso');
      // Sync from server in background
      loadData();
    } catch (error) {
      console.error('[AssistantsPage] Error deleting assistant:', error);
      toast.error('Erro ao apagar assistente');
    } finally {
      setActionLoading(false);
    }
  };

  // Open edit modal
  const openEditModal = (assistant: Assistant) => {
    setEditingAssistantId(assistant.id);
    setCreateForm({
      name: assistant.name,
      description: assistant.description || '',
      short_description: assistant.short_description || '',
      icon: assistant.icon || 'bot',
      color: assistant.color || '#3B82F6',
      category: assistant.category || 'custom',
      features: assistant.features || [],
      greeting: assistant.default_config?.greeting || '',
      instructions: assistant.default_config?.instructions || '',
    });
    setCreateModalOpen(true);
  };

  const resetCreateForm = () => {
    setCreateForm({
      name: '',
      description: '',
      short_description: '',
      icon: 'bot',
      color: '#3B82F6',
      category: 'custom',
      features: [],
      greeting: '',
      instructions: '',
    });
    setNewFeature('');
    setEditingAssistantId(null);
  };

  const addFeature = () => {
    if (newFeature.trim() && (createForm.features?.length || 0) < 8) {
      setCreateForm(prev => ({
        ...prev,
        features: [...(prev.features || []), newFeature.trim()]
      }));
      setNewFeature('');
    }
  };

  const removeFeature = (idx: number) => {
    setCreateForm(prev => ({
      ...prev,
      features: (prev.features || []).filter((_, i) => i !== idx)
    }));
  };

  // ========== RENDER HELPERS ==========

  // Get channel name by ID
  const getChannelById = (channelId: string) => channels.find(c => c.id === channelId);

  // Categories from available assistants
  const categories = ['all', ...new Set(availableAssistants.map(a => a.category))];

  // Render channel icon
  const renderChannelIcon = (type: string, size: string = 'w-3.5 h-3.5') => {
    const ChannelIcon = CHANNEL_ICONS[type?.toLowerCase()] || Hash;
    const color = CHANNEL_COLORS[type?.toLowerCase()] || 'text-gray-500';
    return <ChannelIcon className={`${size} ${color}`} />;
  };

  // Render assistant card
  const renderAssistantCard = (assistant: Assistant, isMarketplace: boolean = true) => {
    const connected = isConnected(assistant.id);
    const userAssistant = getUserAssistantByAssistantId(assistant.id);
    const resolvedChannels = (userAssistant?.channel_ids || [])
      .map(id => getChannelById(id))
      .filter(Boolean) as Channel[];

    const isFree = isFreeTrialAssistant(assistant);
    const monthlyUsed = userAssistant?.stats?.monthly_messages_used ?? 0;
    const monthlyLimit = Number(userAssistant?.config?.monthly_message_limit) || 200;
    const monthlyPct = Math.min(100, Math.round((monthlyUsed / monthlyLimit) * 100));
    const nearLimit = monthlyPct >= 80;
    const atLimit = monthlyPct >= 100;

    return (
      <div
        key={assistant.id}
        className="relative flex flex-col rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition-[box-shadow,border-color] duration-200 hover:border-foreground/20 hover:shadow-[0_8px_24px_-12px_rgba(16,24,40,0.18)] dark:shadow-none dark:hover:shadow-none"
      >
        {/* Cabeçalho: logótipo, nome e "categoria · plano" numa só linha (sem selos coloridos) */}
        <div className="flex items-center gap-3.5">
          <AssistantLogo icon={assistant.icon} color={assistant.color} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h3 className="truncate text-base font-semibold text-foreground">{assistant.name}</h3>
              {assistant.is_featured && (
                <Star className="h-3.5 w-3.5 flex-shrink-0 fill-amber-400 text-amber-400" aria-label="Destaque" />
              )}
            </div>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {CATEGORY_LABELS[assistant.category] || assistant.category}
              {' · '}
              {assistant.is_custom ? 'Personalizado' : isFree
                ? <span className="font-medium text-emerald-600 dark:text-emerald-400">Grátis</span>
                : 'Pro'}
            </p>
          </div>
        </div>

        {/* Descrição: sempre com a altura de duas linhas (os cartões ficam alinhados) */}
        {assistant.short_description && (
          <p className="mt-4 line-clamp-2 min-h-[2.5rem] text-sm leading-5 text-muted-foreground">
            {ptMZ(assistant.short_description)}
          </p>
        )}

        {/* Funções principais */}
        {(assistant.features?.length || 0) > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {assistant.features?.slice(0, 2).map((feature, idx) => (
              <span key={idx} className="max-w-full truncate rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
                {ptMZ(feature)}
              </span>
            ))}
          </div>
        )}

        {/* Grátis: o que inclui (só antes de ligar) */}
        {isFree && isMarketplace && !connected && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Zap className="h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />
            200 mensagens/mês incluídas
          </p>
        )}

        <div className="mb-4" />

        {/* Connected channels */}
        {resolvedChannels.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            {resolvedChannels.map(channel => (
              <span key={channel.id} className="inline-flex max-w-full items-center gap-1.5 truncate rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
                {renderChannelIcon(channel.type, 'w-3 h-3')}
                {assistantChannelName(channel)}
                {connected && <Check className="w-3 h-3 text-green-500 ml-0.5" />}
              </span>
            ))}
          </div>
        )}

        {/* Stats for connected assistants */}
        {!isMarketplace && userAssistant && (
          <div className="flex flex-col gap-2 mb-3">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-xs text-muted-foreground">
                  {userAssistant.stats?.conversations || 0} conversas
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-green-500" />
                <span className="text-xs text-muted-foreground">
                  {userAssistant.last_triggered_at
                    ? new Date(userAssistant.last_triggered_at).toLocaleDateString(getLocale())
                    : 'Nunca usado'}
                </span>
              </div>
            </div>
            {/* Monthly messages usage bar */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Mensagens este mês</span>
                <span className={`text-xs font-medium tabular-nums ${atLimit ? 'text-red-500' : nearLimit ? 'text-amber-500' : 'text-muted-foreground'}`}>
                  {monthlyUsed}/{monthlyLimit}
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    atLimit ? 'bg-red-500' : nearLimit ? 'bg-amber-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${monthlyPct}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="mt-auto flex items-center gap-2">
          {isMarketplace ? (
            connected ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => userAssistant && openConfigModal(userAssistant)}
                >
                  <Settings className="w-4 h-4 mr-1.5" />
                  Configurar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700 hover:bg-red-500/10"
                  onClick={() => userAssistant && handleDisconnect(userAssistant)}
                >
                  <Unlink2 className="w-4 h-4 mr-1.5" />
                  Desligar
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  className="flex-1"
                  size="sm"
                  onClick={() => openPreview(assistant)}
                >
                  Ver e testar
                </Button>
                <Button
                  className="flex-1 bg-primary text-primary-foreground hover:opacity-90 transition-all duration-150"
                  size="sm"
                  onClick={() => {
                    if (!assistant.is_custom && !isFreeTrialAssistant(assistant) && !planLimits.features.marketplaceAssistants) {
                      setPremiumModalReason('marketplace');
                      setPremiumModalOpen(true);
                      return;
                    }
                    setSelectedAssistant(assistant);
                    setSelectedChannelIds([]);
                    setConnectModalOpen(true);
                  }}
                >
                  <Link2 className="w-4 h-4 mr-1.5" />
                  Ligar
                </Button>
                {/* Edit/Delete for custom assistants */}
                {assistant.is_custom && (
                  <>
                    <Button aria-label="Editar"
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditModal(assistant)}
                    >
                      <Edit3 className="w-4 h-4" />
                    </Button>
                    <Button aria-label="Apagar"
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-600 hover:bg-red-50"
                      onClick={() => handleDeleteAssistant(assistant)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </>
                )}
              </>
            )
          ) : (
            <>
              <Button
                variant={userAssistant?.is_active ? 'default' : 'outline'}
                size="sm"
                className={userAssistant?.is_active ? 'bg-green-600 hover:bg-green-700' : ''}
                onClick={() => userAssistant && handleToggle(userAssistant)}
              >
                {userAssistant?.is_active ? (
                  <>
                    <Power className="w-4 h-4 mr-1.5" />
                    Ativo
                  </>
                ) : (
                  <>
                    <PowerOff className="w-4 h-4 mr-1.5" />
                    Inativo
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                aria-label="Configurar"
                onClick={() => userAssistant && openConfigModal(userAssistant)}
              >
                <Settings className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto text-red-600 hover:text-red-700 hover:bg-red-500/10"
                onClick={() => userAssistant && handleDisconnect(userAssistant)}
              >
                <Unlink2 className="w-4 h-4 mr-1.5" />
                Desligar
              </Button>
            </>
          )}
        </div>

      </div>
    );
  };

  return (
    // Página de ecrã inteiro (dentro do InboxPage): mesmas margens do PageContainer do Dashboard
    <div className="flex flex-col h-full overflow-y-auto px-3 py-4 sm:px-6 sm:py-6 lg:px-10 lg:py-8">
      {!settingsOpen && (<>
      {(() => {
        const customCount = availableAssistants.filter(a => a.is_custom).length;
        const canCreate = planLimits.canCreateCustomAssistant(customCount);
        const limitTag = planLimits.limits.customAssistants === 0 ? 'Pro' : `${customCount}/${planLimits.limitLabel.customAssistants}`;
        return (
          <PageHeader
            title="Assistentes de IA"
            description="Atendimento automático nos seus canais"
            icon={Bot}
            create={{
              icon: canCreate ? Plus : Lock,
              label: canCreate ? 'Criar assistente' : `Criar assistente (${limitTag})`,
              // Sem plano para criar: o mesmo botão abre o aviso de upgrade
              onClick: () => {
                if (!canCreate) {
                  setPremiumModalOpen(true);
                  return;
                }
                resetCreateForm();
                setCreateModalOpen(true);
              },
            }}
          />
        );
      })()}

      {/* Pesquisa só quando há muitos assistentes */}
      {(availableAssistants.length > 8 || searchTerm) && (
      <div className="relative mb-6 w-full sm:w-80">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Pesquisar assistentes..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={`pl-9 bg-background border-border`}
        />
      </div>
      )}

      {/* Inline custom-assistant limit banner */}
      {(() => {
        const customCount = availableAssistants.filter(a => a.is_custom).length;
        const atLimit = !planLimits.canCreateCustomAssistant(customCount);
        if (!atLimit) return null;
        const isFeatureLocked = planLimits.limits.customAssistants === 0;
        return (
          <div
            className="mb-5 p-4 rounded-xl border flex items-start gap-4"
            style={{
              backgroundColor: 'hsl(38 92% 50% / 0.08)',
              borderColor: 'hsl(38 92% 50% / 0.35)',
            }}
          >
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'hsl(38 92% 50%)' }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: 'hsl(38 92% 50%)' }}>
                {isFeatureLocked ? 'Recurso indisponível no plano Gratuito' : 'Limite de assistentes atingido'}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {isFeatureLocked
                  ? 'O plano Gratuito não inclui Assistentes Personalizados. Melhore para o plano Business para criar os seus próprios.'
                  : `Está a usar ${customCount} de ${planLimits.limitLabel.customAssistants} assistente(s) permitido(s). Remova um ou melhore o plano para criar mais.`
                }
              </p>
            </div>
            <button
              onClick={() => planLimits.openUpgradeModal()}
              className="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              style={{ backgroundColor: 'hsl(38 92% 50%)', color: '#000' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'hsl(38 92% 40%)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'hsl(38 92% 50%)')}
            >
              <Zap size={13} /> Melhorar plano
            </button>
          </div>
        );
      })()}

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg mb-6 w-fit bg-muted">
        <button
          onClick={() => { tabChosenRef.current = true; setActiveTab('connected'); }}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'connected'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Bot className="w-4 h-4 inline-block mr-1.5" />
          Os meus
          {userAssistants.length > 0 && (
            <Badge variant="secondary" className="ml-2 h-5 min-w-[20px]">
              {userAssistants.length}
            </Badge>
          )}
        </button>
        <button
          onClick={() => { tabChosenRef.current = true; setActiveTab('marketplace'); }}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'marketplace'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Sparkles className="w-4 h-4 inline-block mr-1.5" />
          Marketplace
        </button>
      </div>

      {/* Category filter (only in marketplace) */}
      {activeTab === 'marketplace' && (
        <div className="flex gap-2 mb-6 flex-wrap">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                selectedCategory === cat
                  ? 'bg-blue-600 text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
              }`}
            >
              {cat === 'all' ? 'Todos' : CATEGORY_LABELS[cat] || cat}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <SkeletonAssistantGrid count={8} />
      ) : activeTab === 'marketplace' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredAssistants.map(assistant => renderAssistantCard(assistant, true))}
          {filteredAssistants.length === 0 && (
            <EmptyState
              className="col-span-full"
              icon={Bot}
              title="Nenhum assistente encontrado"
              description="Tente outro termo de pesquisa."
            />
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {userAssistants.map(ua => ua.assistant && renderAssistantCard(ua.assistant, false))}
          {userAssistants.length === 0 && (
            <EmptyState
              className="col-span-full"
              icon={Bot}
              title="Ainda sem assistentes ligados"
              description="Escolha um assistente pronto no marketplace e ligue-o aos seus canais."
              action={<PageAction variant="primary" icon={Sparkles} label="Explorar marketplace" onClick={() => { tabChosenRef.current = true; setActiveTab('marketplace'); }} />}
            />
          )}
        </div>
      )}

      </>)}

      {/* Connect Modal - Multi-channel */}
      {connectModalOpen && selectedAssistant && (
        <OverlayModal onClose={() => { setConnectModalOpen(false); setSelectedAssistant(null); setSelectedChannelIds([]); }} className="max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="text-lg font-semibold text-foreground">
                Ligar Assistente
              </h3>
              <button aria-label="Fechar"
                onClick={() => {
                  setConnectModalOpen(false);
                  setSelectedAssistant(null);
                  setSelectedChannelIds([]);
                }}
                className="p-2 rounded-lg transition-colors hover:bg-muted text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Assistant Info */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                <AssistantLogo icon={selectedAssistant.icon} color={selectedAssistant.color} size="sm" />
                <div>
                  <p className="font-medium text-foreground">
                    {selectedAssistant.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedAssistant.short_description}
                  </p>
                </div>
              </div>

              {/* Channel Selection - Multi-select with checkboxes */}
              <div>
                <label className="block text-sm font-medium mb-2 text-foreground">
                  Selecione os canais para ligar
                </label>
                
                {/* ✅ Aviso obrigatório */}
                <div className={`p-3 rounded-lg border mb-3 ${
                  selectedChannelIds.length === 0
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300'
                    : 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300'
                }`}>
                  {selectedChannelIds.length === 0 ? (
                    <p className="text-xs font-medium">Obrigatório selecionar pelo menos 1 canal</p>
                  ) : (
                    <p className="text-xs font-medium"> {selectedChannelIds.length} {selectedChannelIds.length === 1 ? 'canal' : 'canais'} selecionado(s)</p>
                  )}
                </div>
                
                {channels.length === 0 ? (
                  <div className="text-center py-4 rounded-lg border-2 border-dashed border-border text-muted-foreground">
                    <Hash className="w-6 h-6 mx-auto mb-2 opacity-50" />
                    <p className="text-xs">Nenhum canal ligado</p>
                    <p className="text-[10px] mt-1">Conecte canais na página de definições</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {channels.map(channel => {
                      const isSelected = selectedChannelIds.includes(channel.id);
                      return (
                        <button
                          key={channel.id}
                          type="button"
                          onClick={() => toggleChannelSelection(channel.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors text-left ${
                            isSelected
                              ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-500/50 text-blue-700 dark:text-blue-400'
                              : 'bg-background border-border hover:border-muted-foreground/40 text-foreground'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border-2 transition-colors ${
                            isSelected
                              ? 'bg-blue-600 border-blue-600'
                              : 'border-border'
                          }`}>
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </div>
                          {renderChannelIcon(channel.type)}
                          <span className="flex-1 min-w-0 truncate text-sm font-medium">{assistantChannelName(channel)}</span>
                          {channelOwner(channel.id) && (
                            <span className="flex-shrink-0 truncate text-xs text-muted-foreground">{channelOwner(channel.id)!.assistant?.name}</span>
                          )}
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {channel.type}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2 [&>*]:flex-1 sm:[&>*]:flex-none sm:justify-end p-4 border-t border-border">
              <Button
                variant="outline"
                onClick={() => {
                  setConnectModalOpen(false);
                  setSelectedAssistant(null);
                  setSelectedChannelIds([]);
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleConnect}
                disabled={actionLoading || selectedChannelIds.length === 0}
                className={`${
                  selectedChannelIds.length === 0
                    ? 'bg-muted text-muted-foreground cursor-not-allowed opacity-60'
                    : 'bg-primary text-primary-foreground hover:opacity-90 transition-all duration-150'
                } text-white`}
              >
                {actionLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Link2 className="w-4 h-4 mr-2" />
                )}
                Ligar {selectedChannelIds.length > 0 ? `(${selectedChannelIds.length} ${selectedChannelIds.length === 1 ? 'canal' : 'canais'})` : '(selecione canais)'}
              </Button>
            </div>
        </OverlayModal>
      )}

      {/* Definições do assistente: página com uma secção por função */}
      {settingsOpen && selectedUserAssistant && (
        <div className="flex min-h-full flex-col">
          {/* Cabeçalho: voltar, assistente e guardar */}
          <div className="mb-4 flex items-center gap-3">
            <button
              type="button"
              onClick={closeSettings}
              aria-label="Voltar aos assistentes"
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <AssistantLogo icon={selectedUserAssistant.assistant?.icon} color={selectedUserAssistant.assistant?.color} />
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-serif text-xl text-foreground">{selectedUserAssistant.assistant?.name}</h2>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {settingsIsPreview ? 'Não ligado' : selectedUserAssistant.is_active ? 'Ativo' : 'Pausado'}
                {configLoadingFresh && <Loader2 className="h-3 w-3 animate-spin" />}
              </p>
            </div>
            <div className="hidden gap-2 sm:flex">
              <Button variant="outline" onClick={closeSettings}>Cancelar</Button>
              <Button onClick={handleSaveConfig} disabled={actionLoading}>
                {settingsIsPreview ? 'Ligar' : 'Guardar'}
                {actionLoading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-8">
            {/* Secções: em linha no telemóvel, coluna no computador */}
            <nav
              aria-label="Secções"
              className="-mx-3 flex gap-1.5 overflow-x-auto scrollbar-none px-3 pb-1 pr-6 lg:sticky lg:top-0 lg:mx-0 lg:w-52 lg:flex-shrink-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pr-0"
              style={{ maskImage: 'linear-gradient(to right, black calc(100% - 24px), transparent)', WebkitMaskImage: 'linear-gradient(to right, black calc(100% - 24px), transparent)' }}
            >
              {SETTINGS_SECTIONS.map((sec) => (
                <button
                  key={sec.key}
                  type="button"
                  onClick={(e) => {
                    setSettingsSection(sec.key);
                    // Telemóvel: a secção escolhida fica à vista na barra
                    e.currentTarget.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
                  }}
                  aria-current={settingsSection === sec.key ? 'page' : undefined}
                  className={`h-9 flex-shrink-0 whitespace-nowrap rounded-full border px-3.5 text-sm transition-colors lg:h-10 lg:w-full lg:rounded-lg lg:border-0 lg:text-left ${
                    settingsSection === sec.key
                      ? 'border-foreground/25 bg-muted font-medium text-foreground'
                      : 'border-border text-muted-foreground hover:text-foreground lg:hover:bg-muted/60'
                  }`}
                >
                  {sec.label}
                </button>
              ))}
            </nav>

            <div className="min-w-0 flex-1 space-y-6 pb-24 sm:pb-6 lg:max-w-2xl">
              {settingsSection === 'testar' && (
                <AssistantTestChat
                  key={selectedUserAssistant.id || selectedUserAssistant.assistant_id}
                  name={selectedUserAssistant.assistant?.name || 'Assistente'}
                  assistantId={selectedUserAssistant.assistant_id}
                  userAssistantId={selectedUserAssistant.id || undefined}
                  instructions={configValues.instructions}
                  greeting={configValues.greeting}
                  businessName={(() => { const ch = channels.find((c) => selectedChannelIds.includes(c.id)) || channels[0]; return ch ? assistantChannelName(ch) : undefined; })()}
                />
              )}

              {settingsSection === 'geral' && (<>
              <SettingsGroup title="Canais">
                {channels.length === 0 ? (
                  <SettingsItem label="Sem canais ligados" />
                ) : channels.map((channel) => {
                  const isSelected = selectedChannelIds.includes(channel.id);
                  const owner = channelOwner(channel.id, selectedUserAssistant.id || undefined);
                  return (
                    <button
                      key={channel.id}
                      type="button"
                      role="checkbox"
                      aria-checked={isSelected}
                      onClick={() => toggleChannelSelection(channel.id)}
                      className="flex min-h-[56px] w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/60 active:bg-muted"
                    >
                      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center">{renderChannelIcon(channel.type, 'w-5 h-5')}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base text-foreground">{assistantChannelName(channel)}</span>
                        {owner && <span className="block truncate text-sm text-muted-foreground">{owner.assistant?.name}</span>}
                      </span>
                      <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border transition-colors ${isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'}`}>
                        {isSelected && <Check className="h-3 w-3" strokeWidth={3} />}
                      </span>
                    </button>
                  );
                })}
              </SettingsGroup>

              <SettingsGroup title="Respostas">
                {/* Equipa: o que este assistente faz quando partilha o canal com outros */}
                {selectedChannelIds.some((id) => channelOwner(id, selectedUserAssistant.id || undefined)) && (
                  <SettingsField label="Função na equipa" htmlFor="assistant-team-role">
                    <textarea
                      id="assistant-team-role"
                      value={configValues.team_role || ''}
                      onChange={(e) => setConfigValues({ ...configValues, team_role: e.target.value })}
                      rows={2}
                      maxLength={240}
                      className="w-full px-3 py-2"
                      placeholder={(selectedUserAssistant.assistant as Assistant | undefined)?.short_description || 'Ex.: Marcações e reagendamentos'}
                    />
                  </SettingsField>
                )}
                <SettingsField label="Mensagem de boas-vindas" htmlFor="assistant-greeting">
                  <textarea
                    id="assistant-greeting"
                    value={configValues.greeting || ''}
                    onChange={(e) => setConfigValues({ ...configValues, greeting: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2"
                    placeholder="Ex: Olá! Como posso ajudar você hoje?"
                  />
                </SettingsField>
                <SettingsField label="Instruções do assistente" htmlFor="assistant-instructions">
                  <textarea
                    id="assistant-instructions"
                    value={configValues.instructions || ''}
                    onChange={(e) => setConfigValues({ ...configValues, instructions: e.target.value })}
                    rows={6}
                    className="w-full px-3 py-2"
                    placeholder="Ex: Você é um assistente de vendas amigável que ajuda clientes a encontrar os melhores produtos..."
                  />
                </SettingsField>
              </SettingsGroup>

              <SettingsGroup title="Horário de funcionamento">
                <SettingsItem label="Início">
                  <input
                    type="time"
                    aria-label="Início"
                    value={configValues.business_hours_start || '09:00'}
                    onChange={(e) => setConfigValues({ ...configValues, business_hours_start: e.target.value })}
                    className="w-32 px-3"
                    style={{ colorScheme: isDark ? 'dark' : 'light' }}
                  />
                </SettingsItem>
                <SettingsItem label="Fim">
                  <input
                    type="time"
                    aria-label="Fim"
                    value={configValues.business_hours_end || '18:00'}
                    onChange={(e) => setConfigValues({ ...configValues, business_hours_end: e.target.value })}
                    className="w-32 px-3"
                    style={{ colorScheme: isDark ? 'dark' : 'light' }}
                  />
                </SettingsItem>
              </SettingsGroup>
              </>)}

              {settingsSection === 'vendas' && (<>
              <SettingsGroup title="Follow-ups">
                <SettingsToggle
                  label="Follow-ups automáticos"
                  hint="Volta a escrever a quem deixa de responder"
                  checked={!!configValues.followup_enabled}
                  onChange={(v) => setConfigValues({ ...configValues, followup_enabled: v })}
                />
                {configValues.followup_enabled && (
                  <div className="flex flex-wrap gap-2 px-4 py-3" role="radiogroup" aria-label="Ritmo dos follow-ups">
                    {FOLLOWUP_PRESETS.map((preset) => {
                      const active = JSON.stringify(configValues.followup_steps_hours) === JSON.stringify(preset.steps);
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => setConfigValues({ ...configValues, followup_steps_hours: preset.steps })}
                          className={`h-10 rounded-full border px-4 text-sm transition-colors ${active ? 'border-foreground/25 bg-muted font-medium text-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}
                        >
                          {preset.label} <span className="text-muted-foreground">· {preset.hint}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </SettingsGroup>

              <SettingsGroup title="Agenda">
                <SettingsToggle
                  label="Consultar a agenda"
                  hint="Só propõe horários livres e marca nas Tarefas"
                  checked={!!configValues.calendar_check_enabled}
                  onChange={(v) => setConfigValues({ ...configValues, calendar_check_enabled: v })}
                />
                {configValues.calendar_check_enabled && (
                  <SettingsItem label="Duração de cada marcação">
                    <select
                      aria-label="Duração de cada marcação"
                      value={configValues.appointment_minutes || 60}
                      onChange={(e) => setConfigValues({ ...configValues, appointment_minutes: Number(e.target.value) })}
                      className="w-32 px-3"
                    >
                      {[15, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h`.replace('.5 h', ' h 30')}</option>)}
                    </select>
                  </SettingsItem>
                )}
              </SettingsGroup>
              </>)}

              {settingsSection === 'seguranca' && (<>
              <SettingsGroup title="Proteção">
                <SettingsToggle
                  label="Proteção contra manipulação"
                  hint="Ignora pedidos para mudar as regras ou revelar as instruções"
                  checked={!!configValues.guardrails_enabled}
                  onChange={(v) => setConfigValues({ ...configValues, guardrails_enabled: v })}
                />
              </SettingsGroup>

              <SettingsGroup title="Passar para humano">
                <SettingsToggle
                  label="Escalar para humano"
                  hint="Pausa a IA e avisa a equipa quando o cliente pede"
                  checked={!!configValues.escalation_enabled}
                  onChange={(v) => setConfigValues({ ...configValues, escalation_enabled: v })}
                />
                {configValues.escalation_enabled && (<>
                  <SettingsField label="WhatsApp do responsável" htmlFor="escalation-phone">
                    <input
                      id="escalation-phone"
                      type="tel"
                      placeholder="Ex: 5511999999999"
                      value={configValues.escalation_phone || ''}
                      onChange={(e) => setConfigValues({ ...configValues, escalation_phone: e.target.value })}
                      className="w-full px-3"
                    />
                    <details className="text-sm text-muted-foreground">
                      <summary className="cursor-pointer select-none">Como responder ao cliente</summary>
                      <p className="mt-2">
                        Este número recebe a notificação da conversa escalada, com um código, e passa a receber as mensagens do cliente. O que ele responder é enviado ao cliente pelo número da empresa (com várias conversas abertas: <strong>#código mensagem</strong>). Para devolver a conversa à IA, basta responder <strong>resolvido &lt;código&gt;</strong> (ou <strong>pendentes</strong> para ver a lista).
                      </p>
                    </details>
                  </SettingsField>
                  <SettingsField label="Mensagem enviada ao cliente" htmlFor="escalation-message">
                    <textarea
                      id="escalation-message"
                      rows={2}
                      placeholder="Entendido! Vou te ligar com um atendente humano..."
                      value={configValues.escalation_message || ''}
                      onChange={(e) => setConfigValues({ ...configValues, escalation_message: e.target.value })}
                      className="w-full px-3 py-2"
                    />
                  </SettingsField>
                  <SettingsField label="Gatilhos (separados por vírgula)" htmlFor="escalation-keywords" hint="Vazio usa os gatilhos padrão">
                    <input
                      id="escalation-keywords"
                      type="text"
                      placeholder="falar com humano, quero atendente, cancelar assinatura"
                      value={typeof configValues.escalation_keywords === 'string' ? configValues.escalation_keywords : (Array.isArray(configValues.escalation_keywords) ? configValues.escalation_keywords.join(', ') : '')}
                      onChange={(e) => setConfigValues({ ...configValues, escalation_keywords: e.target.value })}
                      className="w-full px-3"
                    />
                  </SettingsField>
                </>)}
              </SettingsGroup>
              </>)}

              {settingsSection === 'avancado' && (<>
              <SettingsGroup title="Memória e contexto">
                <SettingsToggle
                  label="Janela de contexto"
                  hint="Lembra a última conversa"
                  checked={!!configValues.context_window_enabled}
                  onChange={(v) => setConfigValues({ ...configValues, context_window_enabled: v })}
                />
                {configValues.context_window_enabled && (
                  <SettingsItem label="Mensagens anteriores" hint="De 4 a 30">
                    <input
                      type="number"
                      aria-label="Mensagens anteriores"
                      min={4}
                      max={30}
                      value={configValues.context_window_messages}
                      onChange={(e) => setConfigValues({
                        ...configValues,
                        context_window_messages: Math.min(30, Math.max(4, Number(e.target.value) || 10)),
                      })}
                      className="w-20 px-3 text-center tabular-nums"
                    />
                  </SettingsItem>
                )}
                <SettingsToggle
                  label="Memória de longo prazo"
                  hint="Guarda o que aprende sobre o contacto"
                  checked={!!configValues.memory_enabled}
                  onChange={(v) => setConfigValues({ ...configValues, memory_enabled: v })}
                />
              </SettingsGroup>

              <SettingsGroup title="Funil">
                <SettingsToggle
                  label="Movimentação automática do funil"
                  hint="Avança os leads no funil e preenche o valor do negócio"
                  checked={!!configValues.funnel_tracking_enabled}
                  onChange={(v) => setConfigValues({ ...configValues, funnel_tracking_enabled: v })}
                />
              </SettingsGroup>
              </>)}

              {settingsSection === 'midia' && (<>
              <SettingsGroup title="Voz">
                <SettingsToggle
                  label="Responder em áudio"
                  hint="Quando o cliente envia um áudio"
                  checked={!!configValues.audio_enabled}
                  onChange={(v) => setConfigValues({ ...configValues, audio_enabled: v })}
                />
                {configValues.audio_enabled && (
                  <SettingsField label="Voz" htmlFor="assistant-voice">
                    <select
                      id="assistant-voice"
                      value={configValues.voice_id || ''}
                      onChange={(e) => setConfigValues({ ...configValues, voice_id: e.target.value })}
                      className="w-full px-3"
                      translate="no"
                    >
                      <option value="">Voz padrão</option>
                      {voices.map((voice) => (
                        <option key={voice.voice_id} value={voice.voice_id}>
                          {voice.portuguese ? `${voice.name} · PT` : voice.name}
                        </option>
                      ))}
                    </select>
                    {voices.find((voice) => voice.voice_id === configValues.voice_id)?.preview_url && (
                      <audio
                        key={configValues.voice_id}
                        controls
                        preload="none"
                        src={voices.find((voice) => voice.voice_id === configValues.voice_id)?.preview_url}
                        className="h-10 w-full"
                      />
                    )}
                  </SettingsField>
                )}
              </SettingsGroup>

              <SettingsGroup title="Imagens e documentos">
                <SettingsToggle
                  label="Entender imagens"
                  hint="Imagens enviadas pelo cliente"
                  checked={!!configValues.vision_enabled}
                  onChange={(v) => setConfigValues({ ...configValues, vision_enabled: v })}
                />
                <SettingsToggle
                  label="Ler PDFs e documentos"
                  hint="Documentos enviados pelo cliente"
                  checked={!!configValues.document_enabled}
                  onChange={(v) => setConfigValues({ ...configValues, document_enabled: v })}
                />
                <SettingsToggle
                  label="Reagir às mensagens"
                  hint="No WhatsApp"
                  checked={!!configValues.reactions_enabled}
                  onChange={(v) => setConfigValues({ ...configValues, reactions_enabled: v })}
                />
              </SettingsGroup>
              </>)}

              {settingsSection === 'conhecimento' && settingsIsPreview && (
                <EmptyState icon={BookOpen} title="Documentos depois de ligar" description="Ligue o assistente para lhe juntar documentos e ficheiros." />
              )}
              {settingsSection === 'conhecimento' && !settingsIsPreview && (<>
              {/* Base de conhecimento: o assistente CONSULTA para responder */}
              <div className="space-y-2">
                <SettingsGroup
                  title="Base de conhecimento"
                  action={<span className="text-xs tabular-nums text-muted-foreground">{knowledgeFiles.length}/{MAX_KNOWLEDGE_FILES}</span>}
                >
                  <SettingsToggle
                    label="Usar base de conhecimento"
                    hint="Usa os documentos nas respostas"
                    checked={!!configValues.knowledge_base_enabled}
                    onChange={(v) => setConfigValues({ ...configValues, knowledge_base_enabled: v })}
                  />
                  {knowledgeLoading ? (
                    <SettingsItem icon={<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />} label="A carregar documentos..." />
                  ) : knowledgeFiles.map((kf) => (
                    <div key={kf.id}>
                      <div className="flex min-h-[56px] items-center gap-3 py-2 pl-4 pr-2">
                        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
                          {kf.status === 'processing' ? (
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                          ) : kf.source === 'google_drive' ? (
                            <BrandIcon brand="googledrive" className={`h-5 w-5 ${kf.status === 'failed' ? 'opacity-50' : ''}`} />
                          ) : (
                            <FileText className={`h-5 w-5 ${kf.status === 'failed' ? 'text-red-500' : 'text-muted-foreground'}`} strokeWidth={1.75} />
                          )}
                        </span>
                        <button type="button" onClick={() => handleTogglePreview(kf.id)} className="min-w-0 flex-1 py-1 text-left">
                          <span className="block truncate text-base text-foreground" translate="no">{kf.file_name}</span>
                          <span className={`block truncate text-sm ${kf.status === 'failed' ? 'text-red-500' : 'text-muted-foreground'}`}>
                            {kf.status === 'processing'
                              ? 'A importar…'
                              : kf.status === 'failed'
                                ? (kf.error_message || 'Sem texto extraído')
                                : <>{formatFileSize(kf.size_bytes)} · {kf.char_count} caracteres</>}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTogglePreview(kf.id)}
                          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                          aria-label="Ver texto"
                        >
                          {expandedFileId === kf.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteKnowledgeFile(kf.id, 'rag')}
                          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-red-500"
                          aria-label="Remover documento"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      {expandedFileId === kf.id && (
                        <div className="px-4 pb-3">
                          {kf.status === 'failed' ? (
                            <p className="text-sm text-red-500">{kf.preview || kf.error_message || 'Não foi possível extrair texto deste documento.'}</p>
                          ) : (
                            <>
                              <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-3 font-sans text-sm text-muted-foreground">
                                {fullTextCache[kf.id] ?? kf.preview ?? 'Sem pré-visualização'}
                              </pre>
                              {fullTextCache[kf.id] === undefined && kf.char_count > 220 && (
                                <button
                                  type="button"
                                  onClick={() => handleViewFullText(kf.id)}
                                  disabled={loadingFullTextId === kf.id}
                                  className="mt-2 flex items-center gap-1 text-sm text-primary hover:underline"
                                >
                                  Ver texto completo ({kf.char_count} caracteres)
                                  {loadingFullTextId === kf.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {knowledgeFiles.length >= MAX_KNOWLEDGE_FILES ? (
                    <SettingsItem icon={<Lock className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />} label={`Limite de ${MAX_KNOWLEDGE_FILES} documentos atingido`} />
                  ) : (<>
                    <SettingsAction
                      icon={uploadingKind === 'rag' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" strokeWidth={1.75} />}
                      label={uploadingKind === 'rag' ? 'A enviar...' : 'Adicionar documento'}
                      disabled={uploadingKind !== null}
                    >
                      <input
                        type="file"
                        accept=".pdf,.xlsx,.xls,.csv,.txt,.docx,.doc"
                        className="hidden"
                        onChange={(e) => handleUploadKnowledge(e, 'rag')}
                        disabled={uploadingKind !== null}
                      />
                    </SettingsAction>
                    {drive?.configured && (
                      <SettingsAction
                        icon={driveBusy === 'connect' ? <Loader2 className="h-5 w-5 animate-spin" /> : <BrandIcon brand="googledrive" className="h-5 w-5" />}
                        label="Escolher do Google Drive"
                        onClick={() => void handleAddFromDrive()}
                        disabled={driveBusy !== null}
                      />
                    )}
                  </>)}
                  {drive?.configured && knowledgeFiles.some((f) => f.source === 'google_drive') && (
                    <SettingsAction
                      icon={driveBusy === 'sync' ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5" strokeWidth={1.75} />}
                      label="Ler de novo o Google Drive"
                      onClick={() => void handleSyncDrive()}
                      disabled={driveBusy !== null}
                    />
                  )}
                </SettingsGroup>
                <p className="px-1 text-sm text-muted-foreground">
                  PDF, Word, Excel, CSV ou TXT · máx 5MB
                  {drive?.connected && drive.email && <> · <span translate="no">{drive.email}</span></>}
                </p>
              </div>

              {/* Ficheiros para clientes: o assistente ENVIA quando pedidos ou quando a resposta está neles */}
              <div className="space-y-2">
                <SettingsGroup
                  title="Ficheiros para clientes"
                  action={<span className="text-xs tabular-nums text-muted-foreground">{clientFiles.length}/{MAX_KNOWLEDGE_FILES}</span>}
                >
                  <SettingsToggle
                    label="Enviar ficheiros aos clientes"
                    hint="Quando os pedem ou a resposta está neles"
                    checked={!!configValues.file_sending_enabled}
                    onChange={(v) => setConfigValues({ ...configValues, file_sending_enabled: v })}
                  />
                  {knowledgeLoading ? (
                    <SettingsItem icon={<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />} label="A carregar ficheiros..." />
                  ) : clientFiles.map((kf) => {
                    const isImg = /^image\//.test(kf.mime_type || '') || /\.(jpe?g|png|webp)$/i.test(kf.file_name || '');
                    return (
                      <div key={kf.id} className="flex min-h-[56px] items-center gap-3 py-2 pl-4 pr-2">
                        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
                          {isImg
                            ? <Image className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
                            : <FileText className={`h-5 w-5 ${kf.status === 'failed' ? 'text-red-500' : 'text-muted-foreground'}`} strokeWidth={1.75} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-base text-foreground" translate="no">{kf.file_name}</span>
                          <span className="block truncate text-sm text-muted-foreground">{formatFileSize(kf.size_bytes)}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteKnowledgeFile(kf.id, 'client')}
                          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-red-500"
                          aria-label="Remover ficheiro"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                  {clientFiles.length >= MAX_KNOWLEDGE_FILES ? (
                    <SettingsItem icon={<Lock className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />} label={`Limite de ${MAX_KNOWLEDGE_FILES} ficheiros atingido`} />
                  ) : (
                    <SettingsAction
                      icon={uploadingKind === 'client' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" strokeWidth={1.75} />}
                      label={uploadingKind === 'client' ? 'A enviar...' : 'Adicionar ficheiro ou imagem'}
                      disabled={uploadingKind !== null}
                    >
                      <input
                        type="file"
                        accept=".pdf,.xlsx,.xls,.csv,.txt,.docx,.doc,.jpg,.jpeg,.png,.webp"
                        className="hidden"
                        onChange={(e) => handleUploadKnowledge(e, 'client')}
                        disabled={uploadingKind !== null}
                      />
                    </SettingsAction>
                  )}
                </SettingsGroup>
                <p className="px-1 text-sm text-muted-foreground">PDF, Word, Excel, JPG ou PNG · máx 5MB</p>
              </div>
              </>)}
              {settingsSection === 'geral' && selectedUserAssistant.stats && (
                <SettingsGroup title="Estatísticas">
                  <div className="grid grid-cols-3 divide-x divide-border">
                    {[
                      ['Conversas', selectedUserAssistant.stats.conversations],
                      ['Recebidas', selectedUserAssistant.stats.messages_received],
                      ['Enviadas', selectedUserAssistant.stats.messages_sent],
                    ].map(([label, value]) => (
                      <div key={label as string} className="px-3 py-4 text-center">
                        <p className="font-serif text-2xl tabular-nums text-foreground">{(value as number) || 0}</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">{label}</p>
                      </div>
                    ))}
                  </div>
                </SettingsGroup>
              )}
            </div>
          </div>

          {/* Telemóvel: Cancelar | Guardar sempre à mão */}
          <div className="sticky bottom-0 -mx-3 mt-auto flex gap-2 border-t border-border bg-background p-3 sm:hidden [&>*]:flex-1">
            <Button variant="outline" onClick={closeSettings}>Cancelar</Button>
            <Button onClick={handleSaveConfig} disabled={actionLoading}>
              {settingsIsPreview ? 'Ligar' : 'Guardar'}
              {actionLoading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            </Button>
          </div>
        </div>
      )}

      {/* Create/Edit Assistant Modal */}
      {createModalOpen && (
        <OverlayModal onClose={() => { setCreateModalOpen(false); resetCreateForm(); }} className="max-w-lg">
            <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b bg-card border-border">
              <h3 className="text-lg font-semibold text-foreground">
                {editingAssistantId ? 'Editar Assistente' : 'Criar Assistente'}
              </h3>
              <button aria-label="Fechar"
                onClick={() => {
                  setCreateModalOpen(false);
                  resetCreateForm();
                }}
                className="p-2 rounded-lg transition-colors hover:bg-muted text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium mb-2 text-foreground">
                  Nome *
                </label>
                <Input
                  value={createForm.name}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex: Assistente de Vendas"
                  className="bg-background border-border"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium mb-2 text-foreground">
                  Descrição
                </label>
                <textarea
                  value={createForm.description || ''}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, description: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border text-sm bg-background border-border text-foreground placeholder:text-muted-foreground"
                  placeholder="Descrição detalhada do assistente..."
                />
              </div>

              {/* Icon and Color */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-foreground">
                    Ícone
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {ICON_OPTIONS.map(opt => {
                      const OptIcon = opt.icon;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setCreateForm(prev => ({ ...prev, icon: opt.value }))}
                          className={`p-2 rounded-lg border transition-colors flex items-center justify-center ${
                            createForm.icon === opt.value
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                              : 'border-border hover:border-muted-foreground/50'
                          }`}
                          title={opt.label}
                        >
                          <OptIcon className="w-5 h-5" style={{ color: createForm.color }} />
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-foreground">
                    Cor
                  </label>
                  <div className="grid grid-cols-5 gap-2">
                    {COLOR_OPTIONS.map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setCreateForm(prev => ({ ...prev, color }))}
                        className={`w-8 h-8 rounded-lg transition-all ${
                          createForm.color === color ? 'ring-2 ring-offset-2 ring-blue-500 scale-110' : ''
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Greeting */}
              <div>
                <label className="block text-sm font-medium mb-2 text-foreground">
                  Mensagem de boas-vindas
                </label>
                <textarea
                  value={createForm.greeting || ''}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, greeting: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border text-sm bg-background border-border text-foreground placeholder:text-muted-foreground"
                  placeholder="Ex: Olá! Como posso ajudar você hoje?"
                />
              </div>

              {/* Instructions */}
              <div>
                <label className="block text-sm font-medium mb-2 text-foreground">
                  Instruções / Prompt
                </label>
                <textarea
                  value={createForm.instructions || ''}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, instructions: e.target.value }))}
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg border text-sm bg-background border-border text-foreground placeholder:text-muted-foreground"
                  placeholder="Descreva como o assistente deve se comportar, que tipo de perguntas deve responder, tom de voz, etc..."
                />
              </div>

              {/* Features */}
              <div>
                <label className="block text-sm font-medium mb-2 text-foreground">
                  Funcionalidades
                </label>
                <div className="flex gap-2 mb-2">
                  <Input
                    value={newFeature}
                    onChange={(e) => setNewFeature(e.target.value)}
                    placeholder="Ex: Qualificação de leads"
                    className="flex-1 bg-background border-border"
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addFeature())}
                  />
                  <Button variant="outline" size="sm" onClick={addFeature} disabled={(createForm.features?.length || 0) >= 8}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(createForm.features || []).map((feature, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground"
                    >
                      {feature}
                      <button onClick={() => removeFeature(idx)} className="hover:text-red-500">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-2 [&>*]:flex-1 sm:[&>*]:flex-none sm:justify-end sticky bottom-0 p-4 border-t bg-card border-border">
              <Button
                variant="outline"
                onClick={() => {
                  setCreateModalOpen(false);
                  resetCreateForm();
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleCreateAssistant}
                disabled={actionLoading || !createForm.name.trim()}
                className="bg-primary text-primary-foreground hover:opacity-90 transition-all duration-150"
              >
                {actionLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : editingAssistantId ? (
                  <Check className="w-4 h-4 mr-2" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                {editingAssistantId ? 'Guardar' : 'Criar Assistente'}
              </Button>
            </div>
        </OverlayModal>
      )}

      {/* Premium Upgrade Modal */}
      {premiumModalOpen && (
        <OverlayModal onClose={() => setPremiumModalOpen(false)} className="max-w-sm p-6 items-center text-center gap-4" stickyEdges={false}>
            <div className="w-16 h-16 rounded-full bg-amber-500/15 flex items-center justify-center">
              <Lock className="w-8 h-8 text-amber-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">Recurso Premium</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Disponível nos planos pagos.
              </p>
            </div>
            <div className="flex gap-3 w-full">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setPremiumModalOpen(false)}
              >
                Fechar
              </Button>
              <Button
                className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-black font-semibold"
                onClick={() => {
                  setPremiumModalOpen(false);
                  window.dispatchEvent(new Event('leadflow:open-upgrade'));
                }}
              >
                Ver Planos
              </Button>
            </div>
        </OverlayModal>
      )}

      {/* Canal que já tem assistente: equipa ou substituir */}
      <AppModal
        open={!!sharing}
        onOpenChange={(open) => { if (!open) finishSharing(null); }}
        title="Canal com outro assistente"
        size="sm"
        footer={(
          <>
            <Button variant="outline" onClick={() => finishSharing(null)}>Cancelar</Button>
            <Button onClick={() => finishSharing(sharing?.mode === 'replace' ? sharing.rows.map((r) => r.channel.id) : [])}>
              Continuar
            </Button>
          </>
        )}
      >
        {sharing && (
          <div className="space-y-3">
            <div className="divide-y divide-border rounded-xl border border-border">
              {sharing.rows.map((r) => (
                <div key={r.channel.id} className="flex items-center gap-3 px-4 py-2.5">
                  {renderChannelIcon(r.channel.type, 'w-4 h-4')}
                  <span className="min-w-0 flex-1 truncate text-sm">{assistantChannelName(r.channel)}</span>
                  <span className="max-w-[45%] flex-shrink-0 truncate text-xs text-muted-foreground">{r.owner.assistant?.name}</span>
                </div>
              ))}
            </div>
            <ChoiceList
              value={sharing.mode}
              onChange={(mode) => setSharing({ ...sharing, mode })}
              options={[
                {
                  value: 'team',
                  label: 'Trabalhar em equipa',
                  children: <p className="text-sm text-muted-foreground">Cada conversa fica com um deles, que a passa ao outro quando o pedido é da área dele.</p>,
                },
                {
                  value: 'replace',
                  label: 'Substituir',
                  children: <p className="text-sm text-muted-foreground">O outro assistente deixa de responder neste canal.</p>,
                },
              ]}
            />
          </div>
        )}
      </AppModal>
    </div>
  );
}
