import { useState, useEffect, useCallback } from 'react';
import {
  Bot, Search, Plus, Settings, Power, PowerOff, Trash2,
  Briefcase, Headphones, Calendar, Users, ShoppingCart,
  Zap, X, Check, Loader2,
  MessageSquare, Clock, Star, Sparkles, Link2, Unlink2,
  Edit3, MessageCircle, Instagram, Facebook, Send, Mail, Hash,
  Key, Brain, Eye, EyeOff, Smartphone, Phone, PhoneCall, Mic
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';
import { assistantsApi, type Assistant, type UserAssistant, type CreateAssistantInput } from '../../services/api/assistants';
import { voiceAgentsApi } from '../../services/api/voice-agents';
import { channelsApi } from '../../services/api/inbox';
import type { Channel } from '../../types/inbox';
import type { VoiceAgent, CreateVoiceAgentInput, ElevenLabsVoice } from '../../types/voice-agents';

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
  'instagram': 'text-pink-500',
  'facebook': 'text-blue-600',
  'messenger': 'text-blue-600',
  'telegram': 'text-sky-500',
  'email': 'text-gray-500',
  'twilio_sms': 'text-teal-500',
  'sms': 'text-teal-500',
  'twilio': 'text-teal-500',
};

export default function AssistantsPage({ isDark }: AssistantsPageProps) {
  const [activeTab, setActiveTab] = useState<'marketplace' | 'connected' | 'voice-agents'>('marketplace');
  const [availableAssistants, setAvailableAssistants] = useState<Assistant[]>([]);
  const [userAssistants, setUserAssistants] = useState<UserAssistant[]>([]);
  const [voiceAgents, setVoiceAgents] = useState<VoiceAgent[]>([]);
  const [elevenLabsVoices, setElevenLabsVoices] = useState<ElevenLabsVoice[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Modal states
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [voiceAgentModalOpen, setVoiceAgentModalOpen] = useState(false);
  const [selectedAssistant, setSelectedAssistant] = useState<Assistant | null>(null);
  const [selectedUserAssistant, setSelectedUserAssistant] = useState<UserAssistant | null>(null);
  const [selectedVoiceAgent, setSelectedVoiceAgent] = useState<VoiceAgent | null>(null);
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [configValues, setConfigValues] = useState<Record<string, any>>({});
  const [actionLoading, setActionLoading] = useState(false);

  // Create modal state
  const [showApiKey, setShowApiKey] = useState(false);

  // Voice agent form state
  const [voiceAgentForm, setVoiceAgentForm] = useState<CreateVoiceAgentInput>({
    name: '',
    description: '',
    voice_provider: 'elevenlabs',
    voice_config: {
      voice_id: '',
      model: 'eleven_monolingual_v1',
      stability: 0.5,
      similarity_boost: 0.75,
    },
    call_provider: 'wavoip',
    call_config: {
      api_key: '',
      from_number: '',
    },
    greeting_message: '',
    instructions: '',
    language: 'pt-BR',
  });

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
      const [assistants, userAssists, channelsList, voiceAgentsList, elevenVoices] = await Promise.all([
        assistantsApi.getAvailable(),
        assistantsApi.getUserAssistants(),
        channelsApi.getAll(),
        voiceAgentsApi.getAll(),
        voiceAgentsApi.getElevenLabsVoices().catch(() => []), // Graceful fallback
      ]);
      setAvailableAssistants(assistants);
      setUserAssistants(userAssists);
      setChannels(channelsList);
      setVoiceAgents(voiceAgentsList);
      setElevenLabsVoices(elevenVoices);
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

    try {
      setActionLoading(true);
      await assistantsApi.connect(selectedAssistant.id, selectedChannelIds.length > 0 ? selectedChannelIds : undefined);
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
    if (!confirm(`Deseja realmente desconectar ${userAssistant.assistant?.name}?`)) return;

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

    try {
      setActionLoading(true);
      await assistantsApi.configure(
        selectedUserAssistant.id,
        configValues,
        selectedChannelIds.length > 0 ? selectedChannelIds : undefined
      );
      toast.success('Configuração salva com sucesso!');
      setConfigModalOpen(false);
      setSelectedUserAssistant(null);
      loadData();
    } catch (error) {
      console.error('[AssistantsPage] Error saving config:', error);
      toast.error('Erro ao salvar configuração');
    } finally {
      setActionLoading(false);
    }
  };

  // Open config modal
  const openConfigModal = (userAssistant: UserAssistant) => {
    setSelectedUserAssistant(userAssistant);
    setConfigValues(userAssistant.config || {});
    setSelectedChannelIds(userAssistant.channel_ids || []);
    setConfigModalOpen(true);
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
    if (!confirm(`Deseja realmente deletar o assistente "${assistant.name}"? Esta ação não pode ser desfeita.`)) return;

    try {
      setActionLoading(true);
      await assistantsApi.deleteAssistant(assistant.id);
      toast.success('Assistente deletado com sucesso');
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

  // ========== VOICE AGENTS HANDLERS ==========

  const handleCreateVoiceAgent = async () => {
    if (!voiceAgentForm.name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }
    if (!voiceAgentForm.voice_config.voice_id) {
      toast.error('Selecione uma voz do ElevenLabs');
      return;
    }
    if (!voiceAgentForm.call_config.api_key) {
      toast.error('API Key do Wavoip é obrigatória');
      return;
    }

    try {
      setActionLoading(true);

      if (selectedVoiceAgent) {
        await voiceAgentsApi.update(selectedVoiceAgent.id, voiceAgentForm);
        toast.success('Agente de voz atualizado!');
      } else {
        await voiceAgentsApi.create(voiceAgentForm);
        toast.success('Agente de voz criado!');
      }

      setVoiceAgentModalOpen(false);
      resetVoiceAgentForm();
      loadData();
    } catch (error: any) {
      console.error('[AssistantsPage] Error creating/updating voice agent:', error);
      toast.error(error.response?.data?.error || 'Erro ao salvar agente de voz');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteVoiceAgent = async (agent: VoiceAgent) => {
    if (!confirm(`Deseja realmente deletar o agente "${agent.name}"?`)) return;

    try {
      setActionLoading(true);
      await voiceAgentsApi.delete(agent.id);
      toast.success('Agente de voz deletado');
      loadData();
    } catch (error) {
      console.error('[AssistantsPage] Error deleting voice agent:', error);
      toast.error('Erro ao deletar agente de voz');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleVoiceAgent = async (agent: VoiceAgent) => {
    try {
      await voiceAgentsApi.toggle(agent.id, !agent.is_active);
      toast.success(agent.is_active ? 'Agente desativado' : 'Agente ativado');
      loadData();
    } catch (error) {
      console.error('[AssistantsPage] Error toggling voice agent:', error);
      toast.error('Erro ao alterar status');
    }
  };

  const handleTestCall = async (agent: VoiceAgent) => {
    const phoneNumber = prompt('Digite o número de telefone para teste (incluindo código do país):');
    if (!phoneNumber) return;

    try {
      setActionLoading(true);
      await voiceAgentsApi.testCall(agent.id, { phone_number: phoneNumber });
      toast.success('Chamada de teste iniciada!');
    } catch (error: any) {
      console.error('[AssistantsPage] Error testing call:', error);
      toast.error(error.response?.data?.error || 'Erro ao iniciar chamada de teste');
    } finally {
      setActionLoading(false);
    }
  };

  const openEditVoiceAgentModal = (agent: VoiceAgent) => {
    setSelectedVoiceAgent(agent);
    setVoiceAgentForm({
      name: agent.name,
      description: agent.description || '',
      voice_provider: agent.voice_provider,
      voice_config: agent.voice_config,
      call_provider: agent.call_provider,
      call_config: agent.call_config,
      greeting_message: agent.greeting_message || '',
      instructions: agent.instructions || '',
      language: agent.language,
    });
    setVoiceAgentModalOpen(true);
  };

  const resetVoiceAgentForm = () => {
    setVoiceAgentForm({
      name: '',
      description: '',
      voice_provider: 'elevenlabs',
      voice_config: {
        voice_id: '',
        model: 'eleven_monolingual_v1',
        stability: 0.5,
        similarity_boost: 0.75,
      },
      call_provider: 'wavoip',
      call_config: {
        api_key: '',
        from_number: '',
      },
      greeting_message: '',
      instructions: '',
      language: 'pt-BR',
    });
    setSelectedVoiceAgent(null);
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

    return (
      <div
        key={assistant.id}
        className={`relative rounded-2xl border p-5 transition-all duration-200 hover:shadow-lg ${
          isDark
            ? 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
            : 'bg-white border-gray-200 hover:border-gray-300'
        }`}
      >
        {/* Featured badge */}
        {assistant.is_featured && (
          <div className="absolute -top-2 -right-2">
            <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 gap-1">
              <Star className="h-3 w-3 fill-current" />
              Destaque
            </Badge>
          </div>
        )}

        {/* Custom badge */}
        {assistant.is_custom && (
          <div className="absolute -top-2 -right-2">
            <Badge className="bg-gradient-to-r from-purple-500 to-indigo-500 text-white border-0 gap-1">
              <Edit3 className="h-3 w-3" />
              Personalizado
            </Badge>
          </div>
        )}

        {/* Header */}
        <div className="flex items-start gap-4 mb-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: `${assistant.color}20` }}
          >
            <IconComponent className="w-6 h-6" style={{ color: assistant.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className={`font-semibold text-base ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {assistant.name}
            </h3>
            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              {CATEGORY_LABELS[assistant.category] || assistant.category}
            </p>
          </div>
          {/* Price or Free badge */}
          {assistant.is_free || assistant.is_custom ? (
            <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
              Grátis
            </Badge>
          ) : (
            <Badge variant="outline" className={isDark ? 'border-slate-600' : ''}>
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(assistant.price_monthly)}/mês
            </Badge>
          )}
        </div>

        {/* Description */}
        <p className={`text-sm mb-4 line-clamp-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          {assistant.short_description}
        </p>

        {/* Features */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {assistant.features?.slice(0, 3).map((feature, idx) => (
            <span
              key={idx}
              className={`text-[10px] px-2 py-0.5 rounded-full ${
                isDark ? 'bg-slate-700 text-gray-300' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {feature}
            </span>
          ))}
          {(assistant.features?.length || 0) > 3 && (
            <span className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              +{(assistant.features?.length || 0) - 3} mais
            </span>
          )}
        </div>

        {/* Connected channels */}
        {userAssistant && (userAssistant.channel_ids?.length > 0) && (
          <div className={`flex flex-wrap items-center gap-1.5 mb-4 py-2 px-3 rounded-lg ${
            isDark ? 'bg-slate-900/50' : 'bg-gray-50'
          }`}>
            <span className={`text-[10px] font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Canais:</span>
            {userAssistant.channel_ids.map(channelId => {
              const channel = getChannelById(channelId);
              if (!channel) return null;
              return (
                <span key={channelId} className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ${
                  isDark ? 'bg-slate-700' : 'bg-white border border-gray-200'
                }`}>
                  {renderChannelIcon(channel.type, 'w-3 h-3')}
                  {channel.name || channel.type}
                </span>
              );
            })}
          </div>
        )}

        {/* Stats for connected assistants */}
        {!isMarketplace && userAssistant && (
          <div className={`flex items-center gap-4 mb-4 py-3 px-3 rounded-lg ${
            isDark ? 'bg-slate-900/50' : 'bg-gray-50'
          }`}>
            <div className="flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
              <span className={`text-xs ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                {userAssistant.stats?.conversations || 0} conversas
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-green-500" />
              <span className={`text-xs ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                {userAssistant.last_triggered_at
                  ? new Date(userAssistant.last_triggered_at).toLocaleDateString('pt-BR')
                  : 'Nunca usado'}
              </span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
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
                  className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
                  size="sm"
                  onClick={() => {
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

        {/* Connected indicator */}
        {isMarketplace && connected && (
          <div className="absolute top-3 left-3">
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/10 text-green-500 text-xs font-medium">
              <Check className="w-3 h-3" />
              Conectado
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Assistentes de IA
          </h1>
          <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            Conecte assistentes inteligentes aos seus canais para automatizar o atendimento
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          {/* Create button */}
          <Button
            onClick={() => {
              resetCreateForm();
              setCreateModalOpen(true);
            }}
            className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Criar Assistente
          </Button>

          {/* Search */}
          <div className="relative flex-1 md:w-72 md:flex-none">
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
            <Input
              placeholder="Buscar assistentes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`pl-9 ${isDark ? 'bg-slate-800 border-slate-700' : ''}`}
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className={`flex gap-1 p-1 rounded-lg mb-6 w-fit ${isDark ? 'bg-slate-800' : 'bg-gray-100'}`}>
        <button
          onClick={() => setActiveTab('marketplace')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'marketplace'
              ? isDark
                ? 'bg-slate-700 text-white'
                : 'bg-white text-gray-900 shadow-sm'
              : isDark
                ? 'text-gray-400 hover:text-white'
                : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Sparkles className="w-4 h-4 inline-block mr-1.5" />
          Marketplace
        </button>
        <button
          onClick={() => setActiveTab('connected')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'connected'
              ? isDark
                ? 'bg-slate-700 text-white'
                : 'bg-white text-gray-900 shadow-sm'
              : isDark
                ? 'text-gray-400 hover:text-white'
                : 'text-gray-600 hover:text-gray-900'
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
        <button
          onClick={() => setActiveTab('voice-agents')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'voice-agents'
              ? isDark
                ? 'bg-slate-700 text-white'
                : 'bg-white text-gray-900 shadow-sm'
              : isDark
                ? 'text-gray-400 hover:text-white'
                : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <PhoneCall className="w-4 h-4 inline-block mr-1.5" />
          Agentes de Voz
          {voiceAgents.length > 0 && (
            <Badge variant="secondary" className="ml-2 h-5 min-w-[20px]">
              {voiceAgents.length}
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
                  : isDark
                    ? 'bg-slate-800 text-gray-300 hover:bg-slate-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
          <Loader2 className={`w-8 h-8 animate-spin ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
        </div>
      ) : activeTab === 'marketplace' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredAssistants.map(assistant => renderAssistantCard(assistant, true))}
          {filteredAssistants.length === 0 && (
            <div className={`col-span-full text-center py-12 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              <Bot className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Nenhum assistente encontrado</p>
            </div>
          )}
        </div>
      ) : activeTab === 'connected' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {userAssistants.map(ua => ua.assistant && renderAssistantCard(ua.assistant, false))}
          {userAssistants.length === 0 && (
            <div className={`col-span-full text-center py-12 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              <Bot className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="mb-4">Você ainda não conectou nenhum assistente</p>
              <Button onClick={() => setActiveTab('marketplace')}>
                <Sparkles className="w-4 h-4 mr-2" />
                Explorar Marketplace
              </Button>
            </div>
          )}
        </div>
      ) : (
        // Voice Agents Tab
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Agentes de Voz (ElevenLabs + Wavoip)
            </h3>
            <Button onClick={() => { resetVoiceAgentForm(); setVoiceAgentModalOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              Criar Agente
            </Button>
          </div>

          {voiceAgents.length === 0 ? (
            <div className={`text-center py-12 rounded-xl border-2 border-dashed ${isDark ? 'border-slate-700 bg-slate-800/50' : 'border-gray-300 bg-gray-50'}`}>
              <PhoneCall className={`w-16 h-16 mx-auto mb-4 ${isDark ? 'text-gray-600' : 'text-gray-400'}`} />
              <h4 className={`text-lg font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Nenhum agente de voz configurado
              </h4>
              <p className={`mb-6 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                Crie agentes de voz usando ElevenLabs para gerar vozes realistas e Wavoip para efetuar chamadas automáticas
              </p>
              <Button onClick={() => setVoiceAgentModalOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Criar Primeiro Agente
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {voiceAgents.map(agent => (
                <div
                  key={agent.id}
                  className={`p-4 rounded-xl border transition-all ${
                    isDark ? 'bg-slate-800 border-slate-700 hover:border-slate-600' : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${agent.is_active ? 'bg-blue-500/20' : 'bg-gray-500/20'}`}>
                        <Mic className={`w-5 h-5 ${agent.is_active ? 'text-blue-500' : 'text-gray-500'}`} />
                      </div>
                      <div>
                        <h4 className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{agent.name}</h4>
                        <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{agent.description || 'Sem descrição'}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleToggleVoiceAgent(agent)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        agent.is_active
                          ? 'bg-green-500/20 text-green-500 hover:bg-green-500/30'
                          : 'bg-gray-500/20 text-gray-500 hover:bg-gray-500/30'
                      }`}
                      title={agent.is_active ? 'Ativo' : 'Inativo'}
                    >
                      {agent.is_active ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
                    </button>
                  </div>

                  <div className={`space-y-2 text-xs mb-3 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    <div className="flex items-center gap-2">
                      <Mic className="w-3.5 h-3.5" />
                      <span>Voz: {agent.voice_config.voice_id || 'Não configurada'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5" />
                      <span>Idioma: {agent.language}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleTestCall(agent)}
                      disabled={!agent.is_active}
                    >
                      <PhoneCall className="w-3.5 h-3.5 mr-1" />
                      Testar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditVoiceAgentModal(agent)}
                    >
                      <Settings className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteVoiceAgent(agent)}
                      className="text-red-500 hover:text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Connect Modal - Multi-channel */}
      {connectModalOpen && selectedAssistant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className={`w-full max-w-md rounded-2xl shadow-2xl ${isDark ? 'bg-slate-900 border border-slate-700' : 'bg-white'}`}>
            <div className={`flex items-center justify-between p-4 border-b ${isDark ? 'border-slate-700' : 'border-gray-200'}`}>
              <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Conectar Assistente
              </h3>
              <button
                onClick={() => {
                  setConnectModalOpen(false);
                  setSelectedAssistant(null);
                  setSelectedChannelIds([]);
                }}
                className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Assistant Info */}
              <div className={`flex items-center gap-3 p-3 rounded-lg ${isDark ? 'bg-slate-800' : 'bg-gray-50'}`}>
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
                  <p className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {selectedAssistant.name}
                  </p>
                  <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    {selectedAssistant.short_description}
                  </p>
                </div>
              </div>

              {/* Channel Selection - Multi-select with checkboxes */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Selecione os canais para conectar
                </label>
                {channels.length === 0 ? (
                  <div className={`text-center py-4 rounded-lg border-2 border-dashed ${isDark ? 'border-slate-700 text-gray-500' : 'border-gray-200 text-gray-400'}`}>
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
                              ? isDark
                                ? 'bg-blue-900/30 border-blue-500/50 text-blue-400'
                                : 'bg-blue-50 border-blue-300 text-blue-700'
                              : isDark
                                ? 'bg-slate-800 border-slate-700 hover:border-slate-600 text-gray-300'
                                : 'bg-white border-gray-200 hover:border-gray-300 text-gray-700'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border-2 transition-colors ${
                            isSelected
                              ? 'bg-blue-600 border-blue-600'
                              : isDark ? 'border-slate-600' : 'border-gray-300'
                          }`}>
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </div>
                          {renderChannelIcon(channel.type)}
                          <span className="flex-1 text-sm font-medium">{channel.name || channel.type}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${isDark ? 'bg-slate-700 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                            {channel.type}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <p className={`text-xs mt-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  O assistente responderá nas caixas de entrada dos canais selecionados
                </p>
              </div>
            </div>

            <div className={`flex items-center justify-end gap-2 p-4 border-t ${isDark ? 'border-slate-700' : 'border-gray-200'}`}>
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
                disabled={actionLoading}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
              >
                {actionLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Link2 className="w-4 h-4 mr-2" />
                )}
                Conectar {selectedChannelIds.length > 0 ? `(${selectedChannelIds.length} ${selectedChannelIds.length === 1 ? 'canal' : 'canais'})` : ''}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Config Modal */}
      {configModalOpen && selectedUserAssistant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className={`w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl shadow-2xl ${isDark ? 'bg-slate-900 border border-slate-700' : 'bg-white'}`}>
            <div className={`sticky top-0 z-10 flex items-center justify-between p-4 border-b ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'}`}>
              <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Configurar {selectedUserAssistant.assistant?.name}
              </h3>
              <button
                onClick={() => {
                  setConfigModalOpen(false);
                  setSelectedUserAssistant(null);
                }}
                className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Channel Selection */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
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
                            ? isDark
                              ? 'bg-blue-900/30 border-blue-500/50 text-blue-400'
                              : 'bg-blue-50 border-blue-300 text-blue-700'
                            : isDark
                              ? 'bg-slate-800 border-slate-700 hover:border-slate-600 text-gray-300'
                              : 'bg-white border-gray-200 hover:border-gray-300 text-gray-700'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border-2 transition-colors ${
                          isSelected ? 'bg-blue-600 border-blue-600' : isDark ? 'border-slate-600' : 'border-gray-300'
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
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Mensagem de Boas-vindas
                </label>
                <textarea
                  value={configValues.greeting || ''}
                  onChange={(e) => setConfigValues({ ...configValues, greeting: e.target.value })}
                  rows={3}
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${
                    isDark
                      ? 'bg-slate-800 border-slate-700 text-white'
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                  placeholder="Ex: Olá! Como posso ajudar você hoje?"
                />
              </div>

              {/* Instructions */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Instruções do Assistente
                </label>
                <textarea
                  value={configValues.instructions || ''}
                  onChange={(e) => setConfigValues({ ...configValues, instructions: e.target.value })}
                  rows={4}
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${
                    isDark
                      ? 'bg-slate-800 border-slate-700 text-white'
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                  placeholder="Ex: Você é um assistente de vendas amigável que ajuda clientes a encontrar os melhores produtos..."
                />
                <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  Descreva como o assistente deve se comportar e responder
                </p>
              </div>

              {/* AI Configuration */}
              <div className={`p-4 rounded-lg border ${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-blue-50/50 border-blue-200'}`}>
                <div className="flex items-center gap-2 mb-3">
                  <Brain className={`w-4 h-4 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
                  <h4 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Configuração de IA
                  </h4>
                </div>

                {/* AI Provider */}
                <div className="mb-3">
                  <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    Provedor de IA
                  </label>
                  <select
                    value={configValues.ai_provider || 'openai'}
                    onChange={(e) => setConfigValues({ ...configValues, ai_provider: e.target.value, ai_model: '' })}
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${
                      isDark
                        ? 'bg-slate-800 border-slate-600 text-white'
                        : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  >
                    <option value="openai">OpenAI (ChatGPT)</option>
                    <option value="gemini">Google Gemini</option>
                  </select>
                </div>

                {/* AI Model */}
                <div className="mb-3">
                  <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    Modelo
                  </label>
                  <select
                    value={configValues.ai_model || ''}
                    onChange={(e) => setConfigValues({ ...configValues, ai_model: e.target.value })}
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${
                      isDark
                        ? 'bg-slate-800 border-slate-600 text-white'
                        : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  >
                    {(configValues.ai_provider || 'openai') === 'openai' ? (
                      <>
                        <option value="">gpt-4o-mini (padrão)</option>
                        <option value="gpt-4o">GPT-4o</option>
                        <option value="gpt-4o-mini">GPT-4o Mini</option>
                        <option value="gpt-4-turbo">GPT-4 Turbo</option>
                        <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                      </>
                    ) : (
                      <>
                        <option value="">gemini-2.0-flash (padrão)</option>
                        <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                        <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                        <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                      </>
                    )}
                  </select>
                </div>

                {/* API Key */}
                <div>
                  <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    API Key
                  </label>
                  <div className="relative">
                    <Key className={`absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={configValues.ai_api_key || ''}
                      onChange={(e) => setConfigValues({ ...configValues, ai_api_key: e.target.value })}
                      placeholder={`Cole sua ${(configValues.ai_provider || 'openai') === 'openai' ? 'OpenAI' : 'Google'} API Key`}
                      className={`w-full pl-9 pr-10 py-2 rounded-lg border text-sm ${
                        isDark
                          ? 'bg-slate-800 border-slate-600 text-white placeholder:text-gray-500'
                          : 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-400'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className={`absolute right-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                      {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <p className={`text-[10px] mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                    {(configValues.ai_provider || 'openai') === 'openai'
                      ? 'Obtenha em platform.openai.com/api-keys'
                      : 'Obtenha em aistudio.google.com/apikey'}
                  </p>
                </div>
              </div>

              {/* Business Hours */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Horário de Funcionamento
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Início</label>
                    <input
                      type="time"
                      value={configValues.business_hours_start || '09:00'}
                      onChange={(e) => setConfigValues({ ...configValues, business_hours_start: e.target.value })}
                      className={`w-full px-3 py-2 rounded-lg border text-sm ${
                        isDark
                          ? 'bg-slate-800 border-slate-700 text-white'
                          : 'bg-white border-gray-300 text-gray-900'
                      }`}
                    />
                  </div>
                  <div>
                    <label className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Fim</label>
                    <input
                      type="time"
                      value={configValues.business_hours_end || '18:00'}
                      onChange={(e) => setConfigValues({ ...configValues, business_hours_end: e.target.value })}
                      className={`w-full px-3 py-2 rounded-lg border text-sm ${
                        isDark
                          ? 'bg-slate-800 border-slate-700 text-white'
                          : 'bg-white border-gray-300 text-gray-900'
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* Stats */}
              {selectedUserAssistant.stats && (
                <div className={`p-3 rounded-lg ${isDark ? 'bg-slate-800' : 'bg-gray-50'}`}>
                  <h4 className={`text-sm font-medium mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Estatísticas
                  </h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <p className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {selectedUserAssistant.stats.conversations || 0}
                      </p>
                      <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Conversas</p>
                    </div>
                    <div className="text-center">
                      <p className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {selectedUserAssistant.stats.messages_received || 0}
                      </p>
                      <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Recebidas</p>
                    </div>
                    <div className="text-center">
                      <p className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {selectedUserAssistant.stats.messages_sent || 0}
                      </p>
                      <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Enviadas</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className={`sticky bottom-0 flex items-center justify-end gap-2 p-4 border-t ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'}`}>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className={`w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl shadow-2xl ${isDark ? 'bg-slate-900 border border-slate-700' : 'bg-white'}`}>
            <div className={`sticky top-0 z-10 flex items-center justify-between p-4 border-b ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'}`}>
              <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {editingAssistantId ? 'Editar Assistente' : 'Criar Assistente'}
              </h3>
              <button
                onClick={() => {
                  setCreateModalOpen(false);
                  resetCreateForm();
                }}
                className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Name */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Nome *
                </label>
                <Input
                  value={createForm.name}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex: Assistente de Vendas"
                  className={isDark ? 'bg-slate-800 border-slate-700' : ''}
                />
              </div>

              {/* Description */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Descrição
                </label>
                <textarea
                  value={createForm.description || ''}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, description: e.target.value }))}
                  rows={2}
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${
                    isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                  placeholder="Descrição detalhada do assistente..."
                />
              </div>

              {/* Icon and Color */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
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
                              : isDark ? 'border-slate-700 hover:border-slate-600' : 'border-gray-200 hover:border-gray-300'
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
                  <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
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
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Mensagem de Boas-vindas
                </label>
                <textarea
                  value={createForm.greeting || ''}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, greeting: e.target.value }))}
                  rows={2}
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${
                    isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                  placeholder="Ex: Olá! Como posso ajudar você hoje?"
                />
              </div>

              {/* Instructions */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Instruções / Prompt
                </label>
                <textarea
                  value={createForm.instructions || ''}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, instructions: e.target.value }))}
                  rows={4}
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${
                    isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                  placeholder="Descreva como o assistente deve se comportar, que tipo de perguntas deve responder, tom de voz, etc..."
                />
                <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  Estas instruções definem o comportamento do assistente nas conversas
                </p>
              </div>

              {/* Features */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Funcionalidades
                </label>
                <div className="flex gap-2 mb-2">
                  <Input
                    value={newFeature}
                    onChange={(e) => setNewFeature(e.target.value)}
                    placeholder="Ex: Qualificação de leads"
                    className={`flex-1 ${isDark ? 'bg-slate-800 border-slate-700' : ''}`}
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
                      className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                        isDark ? 'bg-slate-700 text-gray-300' : 'bg-gray-100 text-gray-600'
                      }`}
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

            <div className={`sticky bottom-0 flex items-center justify-end gap-2 p-4 border-t ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'}`}>
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
                className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white"
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

      {/* Voice Agent Modal - ElevenLabs + Wavoip */}
      {voiceAgentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className={`w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl ${isDark ? 'bg-slate-900 border border-slate-700' : 'bg-white'}`}>
            <div className={`sticky top-0 flex items-center justify-between p-4 border-b ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'} z-10`}>
              <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {selectedVoiceAgent ? 'Editar Agente de Voz' : 'Criar Agente de Voz'}
              </h3>
              <button
                onClick={() => { setVoiceAgentModalOpen(false); resetVoiceAgentForm(); }}
                className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Basic Info */}
              <div className="space-y-3">
                <h4 className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>Informações Básicas</h4>
                <Input
                  placeholder="Nome do agente"
                  value={voiceAgentForm.name}
                  onChange={(e) => setVoiceAgentForm({ ...voiceAgentForm, name: e.target.value })}
                  className={isDark ? 'bg-slate-800 border-slate-700' : ''}
                />
                <textarea
                  placeholder="Descrição (opcional)"
                  value={voiceAgentForm.description}
                  onChange={(e) => setVoiceAgentForm({ ...voiceAgentForm, description: e.target.value })}
                  className={`w-full px-3 py-2 rounded-lg border resize-none ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'border-gray-300'}`}
                  rows={2}
                />
              </div>

              {/* ElevenLabs Voice Config */}
              <div className={`p-4 rounded-lg space-y-3 ${isDark ? 'bg-slate-800/50' : 'bg-blue-50'}`}>
                <div className="flex items-center gap-2">
                  <Mic className="w-5 h-5 text-blue-500" />
                  <h4 className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>Configuração de Voz (ElevenLabs)</h4>
                </div>
                <div>
                  <label className={`text-sm mb-1 block ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Selecione a Voz</label>
                  <select
                    value={voiceAgentForm.voice_config.voice_id}
                    onChange={(e) => setVoiceAgentForm({
                      ...voiceAgentForm,
                      voice_config: { ...voiceAgentForm.voice_config, voice_id: e.target.value }
                    })}
                    className={`w-full px-3 py-2 rounded-lg border ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'border-gray-300'}`}
                  >
                    <option value="">Selecione uma voz...</option>
                    {elevenLabsVoices.map(voice => (
                      <option key={voice.voice_id} value={voice.voice_id}>
                        {voice.name} ({voice.language})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`text-sm mb-1 block ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      Estabilidade: {voiceAgentForm.voice_config.stability}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={voiceAgentForm.voice_config.stability}
                      onChange={(e) => setVoiceAgentForm({
                        ...voiceAgentForm,
                        voice_config: { ...voiceAgentForm.voice_config, stability: parseFloat(e.target.value) }
                      })}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className={`text-sm mb-1 block ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      Similaridade: {voiceAgentForm.voice_config.similarity_boost}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={voiceAgentForm.voice_config.similarity_boost}
                      onChange={(e) => setVoiceAgentForm({
                        ...voiceAgentForm,
                        voice_config: { ...voiceAgentForm.voice_config, similarity_boost: parseFloat(e.target.value) }
                      })}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              {/* Wavoip Call Config */}
              <div className={`p-4 rounded-lg space-y-3 ${isDark ? 'bg-slate-800/50' : 'bg-green-50'}`}>
                <div className="flex items-center gap-2">
                  <Phone className="w-5 h-5 text-green-500" />
                  <h4 className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>Configuração de Chamadas (Wavoip)</h4>
                </div>
                <Input
                  placeholder="API Key do Wavoip"
                  type="password"
                  value={voiceAgentForm.call_config.api_key}
                  onChange={(e) => setVoiceAgentForm({
                    ...voiceAgentForm,
                    call_config: { ...voiceAgentForm.call_config, api_key: e.target.value }
                  })}
                  className={isDark ? 'bg-slate-800 border-slate-700' : ''}
                />
                <Input
                  placeholder="Número de origem (ex: +5511999999999)"
                  value={voiceAgentForm.call_config.from_number}
                  onChange={(e) => setVoiceAgentForm({
                    ...voiceAgentForm,
                    call_config: { ...voiceAgentForm.call_config, from_number: e.target.value }
                  })}
                  className={isDark ? 'bg-slate-800 border-slate-700' : ''}
                />
              </div>

              {/* Agent Behavior */}
              <div className="space-y-3">
                <h4 className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>Comportamento do Agente</h4>
                <div>
                  <label className={`text-sm mb-1 block ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Mensagem de Saudação</label>
                  <textarea
                    placeholder="Olá! Como posso ajudá-lo hoje?"
                    value={voiceAgentForm.greeting_message}
                    onChange={(e) => setVoiceAgentForm({ ...voiceAgentForm, greeting_message: e.target.value })}
                    className={`w-full px-3 py-2 rounded-lg border resize-none ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'border-gray-300'}`}
                    rows={2}
                  />
                </div>
                <div>
                  <label className={`text-sm mb-1 block ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Instruções do Sistema</label>
                  <textarea
                    placeholder="Você é um assistente virtual. Seja educado e prestativo..."
                    value={voiceAgentForm.instructions}
                    onChange={(e) => setVoiceAgentForm({ ...voiceAgentForm, instructions: e.target.value })}
                    className={`w-full px-3 py-2 rounded-lg border resize-none ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'border-gray-300'}`}
                    rows={3}
                  />
                </div>
                <div>
                  <label className={`text-sm mb-1 block ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Idioma</label>
                  <select
                    value={voiceAgentForm.language}
                    onChange={(e) => setVoiceAgentForm({ ...voiceAgentForm, language: e.target.value })}
                    className={`w-full px-3 py-2 rounded-lg border ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'border-gray-300'}`}
                  >
                    <option value="pt-BR">Português (Brasil)</option>
                    <option value="pt-PT">Português (Portugal)</option>
                    <option value="en-US">English (US)</option>
                    <option value="es-ES">Español</option>
                  </select>
                </div>
              </div>
            </div>

            <div className={`sticky bottom-0 flex items-center justify-end gap-2 p-4 border-t ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'}`}>
              <Button
                variant="outline"
                onClick={() => { setVoiceAgentModalOpen(false); resetVoiceAgentForm(); }}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleCreateVoiceAgent}
                disabled={actionLoading || !voiceAgentForm.name.trim() || !voiceAgentForm.voice_config.voice_id || !voiceAgentForm.call_config.api_key}
                className="bg-gradient-to-r from-blue-600 to-green-600 hover:from-blue-700 hover:to-green-700 text-white"
              >
                {actionLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : selectedVoiceAgent ? (
                  <Check className="w-4 h-4 mr-2" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                {selectedVoiceAgent ? 'Salvar' : 'Criar Agente'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
