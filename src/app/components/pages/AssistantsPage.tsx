import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Bot, Search, Plus, Settings, Power, PowerOff, Trash2,
  Briefcase, Headphones, Calendar, Users, ShoppingCart,
  Zap, X, Check, Loader2,
  MessageSquare, Clock, Star, Sparkles, Link2, Unlink2,
  Edit3, MessageCircle, Instagram, Facebook, Send, Mail, Hash,
  Brain, Smartphone, Cloud, History, Lock, AlertTriangle, Mic, Volume2
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { toast } from 'sonner';
import { assistantsApi, type Assistant, type UserAssistant, type CreateAssistantInput } from '../../services/api/assistants';
import { channelsApi } from '../../services/api/inbox';
import type { Channel } from '../../types/inbox';
import { usePlanLimits } from '../../hooks/usePlanLimits';
import { useConfirm } from '../ui/ConfirmDialog';

interface AssistantsPageProps {
  isDark: boolean;
}

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

// Detect current user plan from localStorage
function getUserPlan(): string {
  try {
    const raw = localStorage.getItem('leadflow_user');
    if (raw) {
      const u = JSON.parse(raw);
      return (u.plan || 'free').toLowerCase();
    }
  } catch { /* ignore */ }
  return 'free';
}

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

const CHANNEL_ICONS: Record<string, React.ComponentType<any>> = {
  'whatsapp': MessageCircle,
  'whatsapp_cloud': Cloud,
  'instagram': Instagram,
  'facebook': Facebook,
  'messenger': Facebook,
  'telegram': Send,
  'email': Mail,
  'twilio_sms': Smartphone,
  'sms': Smartphone,
  'twilio': Smartphone,
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
};

// Assistants available for free-plan users to try (by name, case-insensitive)
const FREE_SAMPLE_ASSISTANTS = ['atendente virtual'];

function isFreeTrialAssistant(assistant: Assistant): boolean {
  return !assistant.is_custom && FREE_SAMPLE_ASSISTANTS.includes(assistant.name.toLowerCase());
}

export default function AssistantsPage({ isDark }: AssistantsPageProps) {
  const confirm = useConfirm();
  const planLimits = usePlanLimits();
  const [activeTab, setActiveTab] = useState<'marketplace' | 'connected'>('marketplace');
  const [availableAssistants, setAvailableAssistants] = useState<Assistant[]>([]);
  const [userAssistants, setUserAssistants] = useState<UserAssistant[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [premiumModalOpen, setPremiumModalOpen] = useState(false);
  const [premiumModalReason, setPremiumModalReason] = useState<'marketplace' | 'custom_limit'>('marketplace');

  // ElevenLabs voices
  const [elevenLabsVoices, setElevenLabsVoices] = useState<Array<{ voice_id: string; name: string }>>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);

  // Load ElevenLabs voices dynamically from the API
  const loadElevenLabsVoices = useCallback(async () => {
    setVoicesLoading(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
      const token = localStorage.getItem('token') || localStorage.getItem('auth_token');
      const response = await fetch(`${apiUrl}/api/assistants/elevenlabs-voices`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setElevenLabsVoices(data.voices || []);
      } else {
        // Fallback to built-in voices if API fails
        setElevenLabsVoices([
          { voice_id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah (Feminina)' },
          { voice_id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam (Masculino)' },
          { voice_id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli (Feminina)' },
          { voice_id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold (Masculino)' },
          { voice_id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh (Masculino)' },
          { voice_id: 'ErXwobaYiN019PkySvjV', name: 'Antoni (Masculino)' },
        ]);
      }
    } catch {
      setElevenLabsVoices([
        { voice_id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah (Feminina)' },
        { voice_id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam (Masculino)' },
        { voice_id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli (Feminina)' },
        { voice_id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold (Masculino)' },
      ]);
    } finally {
      setVoicesLoading(false);
    }
  }, []);

  // Modal states
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [configLoadingFresh, setConfigLoadingFresh] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedAssistant, setSelectedAssistant] = useState<Assistant | null>(null);
  const [selectedUserAssistant, setSelectedUserAssistant] = useState<UserAssistant | null>(null);
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [configValues, setConfigValues] = useState<Record<string, any>>({});
  const [actionLoading, setActionLoading] = useState(false);

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
    const matchesSearch = assistant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (assistant.description || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || assistant.category === selectedCategory;
    return matchesSearch && matchesCategory;
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

  // Handle connect
  const handleConnect = async () => {
    if (!selectedAssistant) return;

    // ✅ Validar seleção de canais
    if (selectedChannelIds.length === 0) {
      toast.error('❌ Selecione pelo menos UM canal para conectar o assistente');
      return;
    }

    try {
      setActionLoading(true);
      await assistantsApi.connect(selectedAssistant.id, selectedChannelIds);
      toast.success(`${selectedAssistant.name} conectado com sucesso!`);
      setConnectModalOpen(false);
      setSelectedAssistant(null);
      setSelectedChannelIds([]);
      loadData();
    } catch (error: any) {
      console.error('[AssistantsPage] Error connecting:', error);
      toast.error(error.response?.data?.error || 'Erro ao conectar assistente');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle disconnect
  const handleDisconnect = async (userAssistant: UserAssistant) => {
    const confirmed = await confirm(`Deseja realmente desconectar ${userAssistant.assistant?.name}?`, {
      title: 'Desconectar assistente',
      confirmLabel: 'Desconectar',
      variant: 'warning',
    });
    if (!confirmed) return;

    try {
      setActionLoading(true);
      await assistantsApi.disconnect(userAssistant.id);
      toast.success('Assistente desconectado');
      loadData();
    } catch (error) {
      console.error('[AssistantsPage] Error disconnecting:', error);
      toast.error('Erro ao desconectar assistente');
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

    // Basic validation: require AI api key if provider is configured
    if (configValues.ai_provider && !configValues.ai_api_key?.trim()) {
      toast.error('API Key é obrigatória para usar IA');
      return;
    }

    try {
      setActionLoading(true);
      // Normalize __default__ sentinel back to empty string before saving
      const valuesToSave = {
        ...configValues,
        ai_model: configValues.ai_model === '__default__' ? '' : (configValues.ai_model || ''),
      };
      await assistantsApi.configure(
        selectedUserAssistant.id,
        valuesToSave,
        selectedChannelIds.length > 0 ? selectedChannelIds : undefined
      );
      toast.success('Configuração salva com sucesso!');
      setConfigModalOpen(false);
      setSelectedUserAssistant(null);
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
    audio_enabled: cfg.audio_enabled === true,
    audio_voice_id: cfg.audio_voice_id || 'EXAVITQu4vr4xnSDxMaL',
  });

  // Open config modal — fetch fresh data to avoid stale cached config
  const openConfigModal = async (userAssistant: UserAssistant) => {
    setSelectedUserAssistant(userAssistant);
    setConfigValues(normalizeConfig(userAssistant.config || {}));
    setSelectedChannelIds(userAssistant.channel_ids || []);
    setConfigModalOpen(true);
    // Load ElevenLabs voices when opening config modal
    if (elevenLabsVoices.length === 0) loadElevenLabsVoices();
    // Re-fetch fresh config in background (updates modal if data differs)
    setConfigLoadingFresh(true);
    try {
      const fresh = await assistantsApi.getUserAssistantById(userAssistant.id);
      setSelectedUserAssistant(fresh);
      setConfigValues(normalizeConfig(fresh.config || {}));
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
    const confirmed = await confirm(`Deseja realmente deletar o assistente "${assistant.name}"? Esta ação não pode ser desfeita.`, {
      title: 'Excluir assistente',
      confirmLabel: 'Excluir',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      setActionLoading(true);
      await assistantsApi.deleteAssistant(assistant.id);
      // Optimistic update — remove immediately from state
      setAvailableAssistants(prev => prev.filter(a => a.id !== assistant.id));
      setUserAssistants(prev => prev.filter(ua => ua.assistant_id !== assistant.id));
      toast.success('Assistente deletado com sucesso');
      // Sync from server in background
      loadData();
    } catch (error) {
      console.error('[AssistantsPage] Error deleting assistant:', error);
      toast.error('Erro ao deletar assistente');
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
    const IconComponent = ICON_MAP[assistant.icon] || Bot;
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
        className={`relative flex flex-col rounded-2xl border p-4 transition-all duration-200 hover:shadow-lg ${
          isFree
            ? 'bg-card border-2 border-blue-500/40 text-card-foreground shadow-sm shadow-blue-500/10'
            : 'bg-muted/30 border border-border text-muted-foreground hover:border-muted-foreground/40 hover:bg-muted/50'
        }`}
      >
        {/* Free plan glow strip at top */}
        {isFree && (
          <div className="absolute top-0 left-4 right-4 h-0.5 rounded-full bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-400 opacity-70" />
        )}
        {/* Featured badge */}
        {assistant.is_featured && (
          <div className="absolute -top-2 -right-2">
            <Badge className="bg-muted text-muted-foreground border border-border/60 gap-1 font-medium text-[11px]">
              <Star className="h-2.5 w-2.5" />
              Destaque
            </Badge>
          </div>
        )}

        {/* Custom badge */}
        {assistant.is_custom && (
          <div className="absolute -top-2 -right-2">
            <Badge className="bg-primary text-primary-foreground border-0 gap-1">
              <Edit3 className="h-3 w-3" />
              Personalizado
            </Badge>
          </div>
        )}

        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: `${assistant.color}20` }}
          >
            <IconComponent className="w-6 h-6" style={{ color: assistant.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base text-foreground">
              {assistant.name}
            </h3>
            <p className="text-xs text-muted-foreground">
              {CATEGORY_LABELS[assistant.category] || assistant.category}
            </p>
          </div>
          {/* Price badge */}
          {assistant.is_custom ? (
            <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30 shrink-0">
              Grátis
            </Badge>
          ) : isFree ? (
            <Badge className="bg-secondary text-secondary-foreground border border-border shrink-0 gap-1">
              <Zap className="w-3 h-3" />
              Grátis
            </Badge>
          ) : (
            <Badge className="bg-muted text-muted-foreground border-0 shrink-0">
              Pro
            </Badge>
          )}
        </div>

        {/* Description */}
        {assistant.short_description && (
          <p className="text-sm mb-3 line-clamp-2 text-muted-foreground">
            {assistant.short_description}
          </p>
        )}

        {/* Features */}
        {(assistant.features?.length || 0) > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
          {assistant.features?.slice(0, 3).map((feature, idx) => (
            <span
              key={idx}
              className={`text-[10px] px-2 py-0.5 rounded-full ${
                  'bg-muted text-muted-foreground'
              }`}
            >
              {feature}
            </span>
          ))}
          {(assistant.features?.length || 0) > 3 && (
            <span className="text-[10px] text-muted-foreground">
              +{(assistant.features?.length || 0) - 3} mais
            </span>
          )}
          </div>
        )}

        {/* Connected channels */}
        {resolvedChannels.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            <span className="text-[10px] font-medium text-muted-foreground">Canais:</span>
            {resolvedChannels.map(channel => (
              <span key={channel.id} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-muted border border-border">
                {renderChannelIcon(channel.type, 'w-3 h-3')}
                {channel.name || channel.type}
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
                    ? new Date(userAssistant.last_triggered_at).toLocaleDateString('pt-BR')
                    : 'Nunca usado'}
                </span>
              </div>
            </div>
            {/* Monthly messages usage bar */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-muted-foreground">Mensagens este mês</span>
                <span className={`text-[10px] font-semibold ${atLimit ? 'text-red-500' : nearLimit ? 'text-amber-500' : 'text-muted-foreground'}`}>
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

        {/* Free plan callout (only on marketplace card when not yet connected) */}
        {isFree && isMarketplace && !connected && (
          <div className="mb-3 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5"
            style={{ backgroundColor: 'hsl(210 100% 56% / 0.10)', borderLeft: '2px solid hsl(210 100% 56% / 0.5)' }}>
            <Zap className="w-3 h-3 flex-shrink-0 text-blue-400" />
            <span className="text-[10px] text-blue-400 font-medium">Disponível gratuitamente · 200 msg/mês incluídas</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 mt-auto pt-1">
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
                  className="text-red-500 hover:text-red-600 hover:bg-red-50"
                  onClick={() => userAssistant && handleDisconnect(userAssistant)}
                >
                  <Unlink2 className="w-4 h-4" />
                </Button>
              </>
            ) : (
              <>
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
                  Conectar
                </Button>
                {/* Edit/Delete for custom assistants */}
                {assistant.is_custom && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditModal(assistant)}
                    >
                      <Edit3 className="w-4 h-4" />
                    </Button>
                    <Button
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
                onClick={() => userAssistant && openConfigModal(userAssistant)}
              >
                <Settings className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-500 hover:text-red-600 hover:bg-red-50"
                onClick={() => userAssistant && handleDisconnect(userAssistant)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>

      </div>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Assistentes de IA
          </h1>
          <p className="text-sm mt-1 text-muted-foreground">
            Conecte assistentes inteligentes aos seus canais para automatizar o atendimento
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          {/* Create button */}
          {(() => {
            const customCount = availableAssistants.filter(a => a.is_custom).length;
            const canCreate = planLimits.canCreateCustomAssistant(customCount);
            return (
              <Button
                onClick={() => {
                  if (!canCreate) return;
                  resetCreateForm();
                  setCreateModalOpen(true);
                }}
                disabled={!canCreate}
                className={canCreate
                  ? 'bg-primary text-primary-foreground hover:opacity-90 transition-all duration-150'
                  : 'bg-primary/30 text-primary-foreground/60 cursor-not-allowed'
                }
              >
                {canCreate ? <Plus className="w-4 h-4 mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
                Criar Assistente
                {!canCreate && (
                  <span className="ml-2 text-xs bg-white/20 px-1.5 py-0.5 rounded-full">
                    {planLimits.limits.customAssistants === 0 ? 'Pro' : `${customCount}/${planLimits.limitLabel.customAssistants}`}
                  </span>
                )}
              </Button>
            );
          })()}

          {/* Search */}
          <div className="relative flex-1 md:w-72 md:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar assistentes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`pl-9 bg-background border-border`}
            />
          </div>
        </div>
      </div>

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
                  ? 'O plano Gratuito não inclui Assistentes Personalizados. Faça upgrade para Business para criar os seus próprios.'
                  : `Você está usando ${customCount} de ${planLimits.limitLabel.customAssistants} assistente(s) permitido(s). Remova um ou faça upgrade para criar mais.`
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
              <Zap size={13} /> Fazer Upgrade
            </button>
          </div>
        );
      })()}

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg mb-6 w-fit bg-muted">
        <button
          onClick={() => setActiveTab('marketplace')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'marketplace'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Sparkles className="w-4 h-4 inline-block mr-1.5" />
          Marketplace
        </button>
        <button
          onClick={() => setActiveTab('connected')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'connected'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Bot className="w-4 h-4 inline-block mr-1.5" />
          Meus Assistentes
          {userAssistants.length > 0 && (
            <Badge variant="secondary" className="ml-2 h-5 min-w-[20px]">
              {userAssistants.length}
            </Badge>
          )}
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
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : activeTab === 'marketplace' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredAssistants.map(assistant => renderAssistantCard(assistant, true))}
          {filteredAssistants.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              <Bot className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Nenhum assistente encontrado</p>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {userAssistants.map(ua => ua.assistant && renderAssistantCard(ua.assistant, false))}
          {userAssistants.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              <Bot className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="mb-4">Você ainda não conectou nenhum assistente</p>
              <Button onClick={() => setActiveTab('marketplace')}>
                <Sparkles className="w-4 h-4 mr-2" />
                Explorar Marketplace
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Connect Modal - Multi-channel */}
      {connectModalOpen && selectedAssistant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl shadow-2xl bg-card border border-border">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="text-lg font-semibold text-foreground">
                Conectar Assistente
              </h3>
              <button
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
                {(() => {
                  const IconComponent = ICON_MAP[selectedAssistant.icon] || Bot;
                  return (
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${selectedAssistant.color}20` }}
                    >
                      <IconComponent className="w-5 h-5" style={{ color: selectedAssistant.color }} />
                    </div>
                  );
                })()}
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
                  Selecione os canais para conectar
                </label>
                
                {/* ✅ Aviso obrigatório */}
                <div className={`p-3 rounded-lg border mb-3 ${
                  selectedChannelIds.length === 0
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300'
                    : 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300'
                }`}>
                  {selectedChannelIds.length === 0 ? (
                    <p className="text-xs font-medium">⚠️ Obrigatório selecionar pelo menos 1 canal</p>
                  ) : (
                    <p className="text-xs font-medium">✅ {selectedChannelIds.length} {selectedChannelIds.length === 1 ? 'canal' : 'canais'} selecionado(s)</p>
                  )}
                </div>
                
                {channels.length === 0 ? (
                  <div className="text-center py-4 rounded-lg border-2 border-dashed border-border text-muted-foreground">
                    <Hash className="w-6 h-6 mx-auto mb-2 opacity-50" />
                    <p className="text-xs">Nenhum canal conectado</p>
                    <p className="text-[10px] mt-1">Conecte canais na página de configurações</p>
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
                          <span className="flex-1 text-sm font-medium">{channel.name || channel.type}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {channel.type}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs mt-2 text-muted-foreground">
                  O assistente responderá nas caixas de entrada dos canais selecionados
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 p-4 border-t border-border">
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
                Conectar {selectedChannelIds.length > 0 ? `(${selectedChannelIds.length} ${selectedChannelIds.length === 1 ? 'canal' : 'canais'})` : '(selecione canais)'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Config Modal */}
      {configModalOpen && selectedUserAssistant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl shadow-2xl bg-card border border-border">
            <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b bg-card border-border">
              <h3 className="text-lg font-semibold flex items-center gap-2 text-foreground">
                Configurar {selectedUserAssistant.assistant?.name}
                {configLoadingFresh && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
              </h3>
              <button
                onClick={() => {
                  setConfigModalOpen(false);
                  setSelectedUserAssistant(null);
                }}
                className="p-2 rounded-lg transition-colors hover:bg-muted text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Channel Selection */}
              <div>
                <label className="block text-sm font-medium mb-2 text-foreground">
                  Canais conectados
                </label>
                <div className="space-y-2 max-h-36 overflow-y-auto">
                  {channels.map(channel => {
                    const isSelected = selectedChannelIds.includes(channel.id);
                    return (
                      <button
                        key={channel.id}
                        type="button"
                        onClick={() => toggleChannelSelection(channel.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors text-left ${
                          isSelected
                            ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-500/50 text-blue-700 dark:text-blue-400'
                            : 'bg-background border-border hover:border-muted-foreground/40 text-foreground'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border-2 transition-colors ${
                          isSelected ? 'bg-blue-600 border-blue-600' : 'border-border'
                        }`}>
                          {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                        {renderChannelIcon(channel.type, 'w-3.5 h-3.5')}
                        <span className="text-sm">{channel.name || channel.type}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Greeting */}
              <div>
                <label className="block text-sm font-medium mb-2 text-foreground">
                  Mensagem de Boas-vindas
                </label>
                <textarea
                  value={configValues.greeting || ''}
                  onChange={(e) => setConfigValues({ ...configValues, greeting: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border text-sm bg-background border-border text-foreground placeholder:text-muted-foreground"
                  placeholder="Ex: Olá! Como posso ajudar você hoje?"
                />
              </div>

              {/* Instructions */}
              <div>
                <label className="block text-sm font-medium mb-2 text-foreground">
                  Instruções do Assistente
                </label>
                <textarea
                  value={configValues.instructions || ''}
                  onChange={(e) => setConfigValues({ ...configValues, instructions: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg border text-sm bg-background border-border text-foreground placeholder:text-muted-foreground"
                  placeholder="Ex: Você é um assistente de vendas amigável que ajuda clientes a encontrar os melhores produtos..."
                />
                <p className="text-xs mt-1 text-muted-foreground">
                  Descreva como o assistente deve se comportar e responder
                </p>
              </div>

              {/* Business Hours */}
              <div>
                <label className="block text-sm font-medium mb-2 text-foreground">
                  Horário de Funcionamento
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Início</label>
                    <input
                      type="time"
                      value={configValues.business_hours_start || '09:00'}
                      onChange={(e) => setConfigValues({ ...configValues, business_hours_start: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border text-sm bg-background border-border text-foreground"
                      style={{ colorScheme: isDark ? 'dark' : 'light' }}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Fim</label>
                    <input
                      type="time"
                      value={configValues.business_hours_end || '18:00'}
                      onChange={(e) => setConfigValues({ ...configValues, business_hours_end: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border text-sm bg-background border-border text-foreground"
                      style={{ colorScheme: isDark ? 'dark' : 'light' }}
                    />
                  </div>
                </div>
              </div>

              {/* Memory & Context Window */}
              <div className="p-4 rounded-lg border bg-muted/30 border-border">
                <div className="flex items-center gap-2 mb-4">
                  <History className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <h4 className="text-sm font-semibold text-foreground">Memória & Contexto</h4>
                </div>

                <div className="space-y-4">
                  {/* Context Window toggle */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">Janela de contexto</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Lembrar da última conversa ao iniciar uma nova sessão
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!!configValues.context_window_enabled}
                      onClick={() => setConfigValues({ ...configValues, context_window_enabled: !configValues.context_window_enabled })}
                      className="mt-0.5 flex-shrink-0 relative inline-flex items-center rounded-full transition-colors focus:outline-none"
                      style={{ width: 44, height: 24, background: configValues.context_window_enabled ? '#2563eb' : '#6b7280' }}
                    >
                      <span
                        className="inline-block rounded-full bg-white shadow transition-transform"
                        style={{ width: 18, height: 18, transform: configValues.context_window_enabled ? 'translateX(22px)' : 'translateX(3px)' }}
                      />
                    </button>
                  </div>

                  {configValues.context_window_enabled && (
                    <div className="pl-0">
                      <label className="text-xs text-muted-foreground">
                        Mensagens anteriores a incluir no contexto
                      </label>
                      <div className="flex items-center gap-2 mt-1.5">
                        <input
                          type="number"
                          min={4}
                          max={30}
                          value={configValues.context_window_messages}
                          onChange={(e) => setConfigValues({
                            ...configValues,
                            context_window_messages: Math.min(30, Math.max(4, Number(e.target.value) || 10))
                          })}
                          className="w-20 px-3 py-1.5 rounded-lg border text-sm bg-background border-border text-foreground"
                        />
                        <span className="text-xs text-muted-foreground">mensagens (4 – 30)</span>
                      </div>
                    </div>
                  )}

                  {/* Long-term memory toggle */}
                  <div className="flex items-start justify-between gap-4 pt-3 border-t border-border">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">Memória de longo prazo</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Construir perfil do contato ao longo do tempo
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!!configValues.memory_enabled}
                      onClick={() => setConfigValues({ ...configValues, memory_enabled: !configValues.memory_enabled })}
                      className="mt-0.5 flex-shrink-0 relative inline-flex items-center rounded-full transition-colors focus:outline-none"
                      style={{ width: 44, height: 24, background: configValues.memory_enabled ? '#2563eb' : '#6b7280' }}
                    >
                      <span
                        className="inline-block rounded-full bg-white shadow transition-transform"
                        style={{ width: 18, height: 18, transform: configValues.memory_enabled ? 'translateX(22px)' : 'translateX(3px)' }}
                      />
                    </button>
                  </div>

                  {/* Funnel tracking toggle */}
                  <div className="flex items-start justify-between gap-4 pt-3 border-t border-border">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">Movimentação automática do funil</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        O assistente avança leads pelo funil com base nas conversas
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!!configValues.funnel_tracking_enabled}
                      onClick={() => setConfigValues({ ...configValues, funnel_tracking_enabled: !configValues.funnel_tracking_enabled })}
                      className="mt-0.5 flex-shrink-0 relative inline-flex items-center rounded-full transition-colors focus:outline-none"
                      style={{ width: 44, height: 24, background: configValues.funnel_tracking_enabled ? '#2563eb' : '#6b7280' }}
                    >
                      <span
                        className="inline-block rounded-full bg-white shadow transition-transform"
                        style={{ width: 18, height: 18, transform: configValues.funnel_tracking_enabled ? 'translateX(22px)' : 'translateX(3px)' }}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* 🎙️ ElevenLabs — Respostas em Áudio Mágico */}
              <div className="p-4 rounded-lg border bg-muted/30 border-border">
                <div className="flex items-center gap-2 mb-4">
                  <Mic className="w-4 h-4 text-violet-500" />
                  <h4 className="text-sm font-semibold text-foreground">Áudio Mágico (ElevenLabs)</h4>
                  <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-500 font-medium border border-violet-500/20">
                    WhatsApp
                  </span>
                </div>

                <div className="space-y-4">
                  {/* Toggle */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">Responder em áudio quando receber áudio</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Quando o cliente enviar um áudio, o assistente responde com voz gerada por IA
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!!configValues.audio_enabled}
                      onClick={() => setConfigValues({ ...configValues, audio_enabled: !configValues.audio_enabled })}
                      className="mt-0.5 flex-shrink-0 relative inline-flex items-center rounded-full transition-colors focus:outline-none"
                      style={{ width: 44, height: 24, background: configValues.audio_enabled ? '#7c3aed' : '#6b7280' }}
                    >
                      <span
                        className="inline-block rounded-full bg-white shadow transition-transform"
                        style={{ width: 18, height: 18, transform: configValues.audio_enabled ? 'translateX(22px)' : 'translateX(3px)' }}
                      />
                    </button>
                  </div>

                  {/* Voice selector (only shown if audio_enabled) */}
                  {configValues.audio_enabled && (
                    <div className="pt-3 border-t border-border">
                      <label className="block text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                        <Volume2 className="w-3.5 h-3.5" />
                        Voz padrão do assistente
                      </label>
                      {voicesLoading ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando vozes da ElevenLabs...
                        </div>
                      ) : (
                        <select
                          value={configValues.audio_voice_id || 'EXAVITQu4vr4xnSDxMaL'}
                          onChange={(e) => setConfigValues({ ...configValues, audio_voice_id: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border text-sm bg-background border-border text-foreground"
                        >
                          {elevenLabsVoices.length > 0
                            ? elevenLabsVoices.map(v => (
                                <option key={v.voice_id} value={v.voice_id}>{v.name}</option>
                              ))
                            : (
                              <>
                                <option value="EXAVITQu4vr4xnSDxMaL">Sarah (Feminina)</option>
                                <option value="pNInz6obpgDQGcFmaJgB">Adam (Masculino)</option>
                                <option value="MF3mGyEYCl7XYWbV9V6O">Elli (Feminina)</option>
                                <option value="VR6AewLTigWG4xSOukaG">Arnold (Masculino)</option>
                                <option value="TxGEqnHWrfWFTfGW9XjX">Josh (Masculino)</option>
                              </>
                            )
                          }
                        </select>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1">
                        <Mic className="w-3 h-3 text-violet-400" />
                        Vozes carregadas diretamente da sua conta ElevenLabs
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Stats */}
              {selectedUserAssistant.stats && (
                <div className="p-3 rounded-lg bg-muted">
                  <h4 className="text-sm font-medium mb-2 text-foreground">
                    Estatísticas
                  </h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <p className="text-lg font-bold text-foreground">
                        {selectedUserAssistant.stats.conversations || 0}
                      </p>
                      <p className="text-xs text-muted-foreground">Conversas</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-foreground">
                        {selectedUserAssistant.stats.messages_received || 0}
                      </p>
                      <p className="text-xs text-muted-foreground">Recebidas</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-foreground">
                        {selectedUserAssistant.stats.messages_sent || 0}
                      </p>
                      <p className="text-xs text-muted-foreground">Enviadas</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 flex items-center justify-end gap-2 p-4 border-t bg-card border-border">
              <Button
                variant="outline"
                onClick={() => {
                  setConfigModalOpen(false);
                  setSelectedUserAssistant(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSaveConfig}
                disabled={actionLoading}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {actionLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                Salvar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Assistant Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl shadow-2xl bg-card border border-border">
            <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b bg-card border-border">
              <h3 className="text-lg font-semibold text-foreground">
                {editingAssistantId ? 'Editar Assistente' : 'Criar Assistente'}
              </h3>
              <button
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
                  Mensagem de Boas-vindas
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
                <p className="text-xs mt-1 text-muted-foreground">
                  Estas instruções definem o comportamento do assistente nas conversas
                </p>
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

            <div className="sticky bottom-0 flex items-center justify-end gap-2 p-4 border-t bg-card border-border">
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
                {editingAssistantId ? 'Salvar' : 'Criar Assistente'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Premium Upgrade Modal */}
      {premiumModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl shadow-2xl bg-card border border-border p-6 flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-amber-500/15 flex items-center justify-center">
              <Lock className="w-8 h-8 text-amber-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">Recurso Premium</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Os assistentes do Marketplace estão disponíveis nos planos pagos.
                Faça upgrade para conectar e automatizar o seu atendimento.
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
          </div>
        </div>
      )}
    </div>
  );
}
