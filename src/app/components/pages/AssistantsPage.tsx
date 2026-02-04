import { useState, useEffect, useCallback } from 'react';
import {
  Bot, Search, Plus, Settings, Power, PowerOff, Trash2,
  Briefcase, Headphones, Calendar, Users, ShoppingCart,
  Zap, ChevronRight, X, Check, Loader2, BarChart3,
  MessageSquare, Clock, Star, Crown, Sparkles, Link2, Unlink2
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';
import { assistantsApi, type Assistant, type UserAssistant } from '../../services/api/assistants';
import { channelsApi } from '../../services/api/inbox';
import type { Channel } from '../../types/inbox';

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
};

const CATEGORY_LABELS: Record<string, string> = {
  'sales': 'Vendas',
  'support': 'Suporte',
  'scheduling': 'Agendamento',
  'marketing': 'Marketing',
  'ecommerce': 'E-commerce',
  'general': 'Geral',
};

export default function AssistantsPage({ isDark }: AssistantsPageProps) {
  const [activeTab, setActiveTab] = useState<'marketplace' | 'connected'>('marketplace');
  const [availableAssistants, setAvailableAssistants] = useState<Assistant[]>([]);
  const [userAssistants, setUserAssistants] = useState<UserAssistant[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Modal states
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [selectedAssistant, setSelectedAssistant] = useState<Assistant | null>(null);
  const [selectedUserAssistant, setSelectedUserAssistant] = useState<UserAssistant | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [configValues, setConfigValues] = useState<Record<string, any>>({});
  const [actionLoading, setActionLoading] = useState(false);

  // Load data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [assistants, userAssists, channelsList] = await Promise.all([
        assistantsApi.getAvailable(),
        assistantsApi.getUserAssistants(),
        channelsApi.getAll()
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

  // Filter assistants
  const filteredAssistants = availableAssistants.filter(assistant => {
    const matchesSearch = assistant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      assistant.description.toLowerCase().includes(searchTerm.toLowerCase());
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

  // Handle connect
  const handleConnect = async () => {
    if (!selectedAssistant) return;

    try {
      setActionLoading(true);
      await assistantsApi.connect(selectedAssistant.id, selectedChannelId || undefined);
      toast.success(`${selectedAssistant.name} conectado com sucesso!`);
      setConnectModalOpen(false);
      setSelectedAssistant(null);
      setSelectedChannelId('');
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
        selectedChannelId || undefined
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
    setSelectedChannelId(userAssistant.channel_id || '');
    setConfigModalOpen(true);
  };

  // Categories from available assistants
  const categories = ['all', ...new Set(availableAssistants.map(a => a.category))];

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
          {assistant.is_free ? (
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
              <Button
                className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
                size="sm"
                onClick={() => {
                  setSelectedAssistant(assistant);
                  setConnectModalOpen(true);
                }}
              >
                <Link2 className="w-4 h-4 mr-1.5" />
                Conectar
              </Button>
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
    <div className="flex flex-col h-full p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Assistentes de IA
          </h1>
          <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            Conecte assistentes inteligentes para automatizar seu atendimento
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-72">
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
          <Input
            placeholder="Buscar assistentes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`pl-9 ${isDark ? 'bg-slate-800 border-slate-700' : ''}`}
          />
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
      ) : (
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
      )}

      {/* Connect Modal */}
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

              {/* Channel Selection */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Canal (opcional)
                </label>
                <select
                  value={selectedChannelId}
                  onChange={(e) => setSelectedChannelId(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${
                    isDark
                      ? 'bg-slate-800 border-slate-700 text-white'
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                >
                  <option value="">Todos os canais</option>
                  {channels.map(channel => (
                    <option key={channel.id} value={channel.id}>
                      {channel.name} ({channel.type})
                    </option>
                  ))}
                </select>
                <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  Selecione um canal específico ou deixe em branco para usar em todos
                </p>
              </div>

              {/* Price Info */}
              {!selectedAssistant.is_free && (
                <div className={`p-3 rounded-lg ${isDark ? 'bg-amber-900/20 border border-amber-500/30' : 'bg-amber-50 border border-amber-200'}`}>
                  <div className="flex items-center gap-2">
                    <Crown className="w-4 h-4 text-amber-500" />
                    <span className={`text-sm font-medium ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedAssistant.price_monthly)}/mês
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className={`flex items-center justify-end gap-2 p-4 border-t ${isDark ? 'border-slate-700' : 'border-gray-200'}`}>
              <Button
                variant="outline"
                onClick={() => {
                  setConnectModalOpen(false);
                  setSelectedAssistant(null);
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
                Conectar
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
                  Canal
                </label>
                <select
                  value={selectedChannelId}
                  onChange={(e) => setSelectedChannelId(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${
                    isDark
                      ? 'bg-slate-800 border-slate-700 text-white'
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                >
                  <option value="">Todos os canais</option>
                  {channels.map(channel => (
                    <option key={channel.id} value={channel.id}>
                      {channel.name} ({channel.type})
                    </option>
                  ))}
                </select>
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
    </div>
  );
}
