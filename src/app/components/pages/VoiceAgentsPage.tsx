import { useState, useEffect, useCallback } from 'react';
import {
  Phone, Search, Plus, Power, PowerOff, Trash2, Edit3,
  Loader2, X, Check, Eye, EyeOff, Mic, PhoneCall
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';
import { voiceAgentsApi } from '../../services/api/voice-agents';
import type { VoiceAgent, CreateVoiceAgentInput, ElevenLabsVoice } from '../../types/voice-agents';

interface VoiceAgentsPageProps {
  isDark: boolean;
}

export default function VoiceAgentsPage({ isDark }: VoiceAgentsPageProps) {
  console.log('[VoiceAgentsPage] Render - isDark:', isDark);
  
  const [voiceAgents, setVoiceAgents] = useState<VoiceAgent[]>([]);
  const [elevenLabsVoices, setElevenLabsVoices] = useState<ElevenLabsVoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<VoiceAgent | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  const [form, setForm] = useState<CreateVoiceAgentInput>({
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

  const loadData = useCallback(async () => {
    try {
      console.log('[VoiceAgentsPage] Starting to load data...');
      setLoading(true);
      const [agents, voices] = await Promise.all([
        voiceAgentsApi.getAll(),
        voiceAgentsApi.getElevenLabsVoices().catch(() => []),
      ]);
      console.log('[VoiceAgentsPage] Loaded:', { agents, voices });
      setVoiceAgents(agents);
      setElevenLabsVoices(voices);
    } catch (error) {
      console.error('[VoiceAgentsPage] Error loading data:', error);
      toast.error('Erro ao carregar agentes de voz');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    console.log('[VoiceAgentsPage] Component mounted, isDark:', isDark);
    loadData();
  }, [loadData]);

  const filteredAgents = voiceAgents.filter(agent =>
    agent.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (agent.description || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreate = () => {
    setSelectedAgent(null);
    setForm({
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
    setModalOpen(true);
  };

  const handleEdit = (agent: VoiceAgent) => {
    setSelectedAgent(agent);
    setForm({
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
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.name || !form.voice_config.voice_id || !form.call_config.api_key) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    try {
      setActionLoading(true);
      if (selectedAgent) {
        await voiceAgentsApi.update(selectedAgent.id, form);
        toast.success('Agente atualizado com sucesso!');
      } else {
        await voiceAgentsApi.create(form);
        toast.success('Agente criado com sucesso!');
      }
      setModalOpen(false);
      loadData();
    } catch (error: any) {
      console.error('[VoiceAgentsPage] Error saving agent:', error);
      toast.error(error.response?.data?.error || 'Erro ao salvar agente');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este agente?')) return;

    try {
      await voiceAgentsApi.delete(id);
      toast.success('Agente excluído com sucesso!');
      loadData();
    } catch (error) {
      console.error('[VoiceAgentsPage] Error deleting agent:', error);
      toast.error('Erro ao excluir agente');
    }
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    try {
      await voiceAgentsApi.toggle(id, !isActive);
      toast.success(isActive ? 'Agente desativado' : 'Agente ativado');
      loadData();
    } catch (error) {
      console.error('[VoiceAgentsPage] Error toggling agent:', error);
      toast.error('Erro ao alterar status');
    }
  };

  const handleTestCall = async (id: string) => {
    const phone = prompt('Digite o número de telefone para teste (com código do país):');
    if (!phone) return;

    try {
      await voiceAgentsApi.testCall(id, { phone_number: phone });
      toast.success('Chamada de teste iniciada!');
    } catch (error) {
      console.error('[VoiceAgentsPage] Error testing call:', error);
      toast.error('Erro ao iniciar chamada de teste');
    }
  };

  return (
    <div className={`w-full h-full flex flex-col ${isDark ? 'bg-slate-900' : 'bg-gray-50'}`}>
      {/* Header */}
      <div className={`flex-shrink-0 border-b p-6 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className={`text-2xl font-bold flex items-center gap-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              <PhoneCall className="w-7 h-7 text-purple-500" />
              Agentes de Voz
            </h1>
            <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              Crie agentes de voz usando ElevenLabs para gerar vozes realistas e Wavoip para efetuar chamadas automáticas
            </p>
          </div>
          <Button onClick={handleCreate} className="bg-purple-600 hover:bg-purple-700">
            <Plus className="w-4 h-4 mr-2" />
            Criar Agente
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
          <Input
            type="text"
            placeholder="Buscar agentes de voz..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`pl-10 ${isDark ? 'bg-slate-700 border-slate-600 text-white' : ''}`}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className={`w-8 h-8 animate-spin ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <PhoneCall className={`w-16 h-16 mb-4 ${isDark ? 'text-gray-600' : 'text-gray-400'}`} />
            <h3 className={`text-lg font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {searchTerm ? 'Nenhum agente encontrado' : 'Nenhum agente de voz configurado'}
            </h3>
            <p className={`text-sm mb-4 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              {searchTerm
                ? 'Tente buscar com outros termos'
                : 'Crie agentes de voz usando ElevenLabs para gerar vozes realistas e Wavoip para efetuar chamadas automáticas'}
            </p>
            {!searchTerm && (
              <Button onClick={handleCreate} className="bg-purple-600 hover:bg-purple-700">
                <Plus className="w-4 h-4 mr-2" />
                Criar Primeiro Agente
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAgents.map((agent) => (
              <div
                key={agent.id}
                className={`rounded-lg p-5 hover:shadow-lg transition-shadow ${isDark ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-gray-200'}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center">
                      <PhoneCall className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <h3 className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{agent.name}</h3>
                      <Badge variant={agent.is_active ? 'default' : 'secondary'} className="text-xs">
                        {agent.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </div>
                  </div>
                </div>

                {agent.description && (
                  <p className={`text-sm mb-4 line-clamp-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    {agent.description}
                  </p>
                )}

                <div className={`flex items-center gap-2 text-xs mb-4 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  <Mic className="w-3 h-3" />
                  <span>{agent.voice_provider}</span>
                  <span>•</span>
                  <Phone className="w-3 h-3" />
                  <span>{agent.call_provider}</span>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEdit(agent)}
                    className="flex-1"
                  >
                    <Edit3 className="w-3 h-3 mr-1" />
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleToggle(agent.id, agent.is_active)}
                  >
                    {agent.is_active ? (
                      <PowerOff className="w-3 h-3" />
                    ) : (
                      <Power className="w-3 h-3" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleTestCall(agent.id)}
                  >
                    <Phone className="w-3 h-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(agent.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className={`rounded-lg shadow-xl w-full max-w-[calc(100%-2rem)] sm:max-w-lg md:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
            <div className={`flex-shrink-0 px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between gap-3 border-b ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
              <h2 className={`text-base sm:text-lg md:text-xl font-bold flex-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {selectedAgent ? 'Editar Agente de Voz' : 'Criar Agente de Voz'}
              </h2>
              <button 
                type="button"
                onClick={() => setModalOpen(false)} 
                className={`flex-shrink-0 p-1 rounded-md transition-colors ${isDark ? 'text-gray-400 hover:text-white hover:bg-slate-700' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5 space-y-4">
              {/* Nome */}
              <div>
                <label className={`block text-xs sm:text-sm font-medium mb-1.5 sm:mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Nome do Agente *
                </label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex: Agente de Vendas"
                  className={`text-sm sm:text-base ${isDark ? 'bg-slate-700 border-slate-600 text-white' : ''}`}
                />
              </div>

              {/* Descrição */}
              <div>
                <label className={`block text-xs sm:text-sm font-medium mb-1.5 sm:mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Descrição
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Descreva a função deste agente..."
                  className={`w-full px-3 py-2 border rounded-md min-h-[60px] sm:min-h-[80px] text-sm sm:text-base ${isDark ? 'bg-slate-700 border-slate-600 text-white' : 'border-gray-300'}`}
                />
              </div>

              {/* Voz ElevenLabs */}
              <div>
                <label className={`block text-xs sm:text-sm font-medium mb-1.5 sm:mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Voz ElevenLabs *
                </label>
                <select
                  value={form.voice_config.voice_id}
                  onChange={(e) => setForm({
                    ...form,
                    voice_config: { ...form.voice_config, voice_id: e.target.value }
                  })}
                  className={`w-full px-3 py-2 border rounded-md text-sm sm:text-base ${isDark ? 'bg-slate-700 border-slate-600 text-white' : 'border-gray-300'}`}
                >
                  <option value="">Selecione uma voz</option>
                  {elevenLabsVoices.map((voice) => (
                    <option key={voice.voice_id} value={voice.voice_id}>
                      {voice.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* API Key Wavoip */}
              <div>
                <label className={`block text-xs sm:text-sm font-medium mb-1.5 sm:mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  API Key Wavoip *
                </label>
                <div className="relative">
                  <Input
                    type={showApiKey ? 'text' : 'password'}
                    value={form.call_config.api_key}
                    onChange={(e) => setForm({
                      ...form,
                      call_config: { ...form.call_config, api_key: e.target.value }
                    })}
                    placeholder="Sua chave de API do Wavoip"
                    className={`text-sm sm:text-base ${isDark ? 'bg-slate-700 border-slate-600 text-white' : ''}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className={`absolute right-3 top-1/2 transform -translate-y-1/2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Número de Origem */}
              <div>
                <label className={`block text-xs sm:text-sm font-medium mb-1.5 sm:mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Número de Origem
                </label>
                <Input
                  value={form.call_config.from_number}
                  onChange={(e) => setForm({
                    ...form,
                    call_config: { ...form.call_config, from_number: e.target.value }
                  })}
                  placeholder="+55 11 99999-9999"
                  className={`text-sm sm:text-base ${isDark ? 'bg-slate-700 border-slate-600 text-white' : ''}`}
                />
              </div>

              {/* Mensagem de Saudação */}
              <div>
                <label className={`block text-xs sm:text-sm font-medium mb-1.5 sm:mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Mensagem de Saudação
                </label>
                <textarea
                  value={form.greeting_message}
                  onChange={(e) => setForm({ ...form, greeting_message: e.target.value })}
                  placeholder="Olá! Sou o agente de voz da empresa..."
                  className={`w-full px-3 py-2 border rounded-md min-h-[60px] sm:min-h-[80px] text-sm sm:text-base ${isDark ? 'bg-slate-700 border-slate-600 text-white' : 'border-gray-300'}`}
                />
              </div>

              {/* Instruções */}
              <div>
                <label className={`block text-xs sm:text-sm font-medium mb-1.5 sm:mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Instruções para o Agente
                </label>
                <textarea
                  value={form.instructions}
                  onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                  placeholder="Você é um assistente de vendas que deve..."
                  className={`w-full px-3 py-2 border rounded-md min-h-[80px] sm:min-h-[100px] text-sm sm:text-base ${isDark ? 'bg-slate-700 border-slate-600 text-white' : 'border-gray-300'}`}
                />
              </div>

              {/* Idioma */}
              <div>
                <label className={`block text-xs sm:text-sm font-medium mb-1.5 sm:mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Idioma
                </label>
                <select
                  value={form.language}
                  onChange={(e) => setForm({ ...form, language: e.target.value })}
                  className={`w-full px-3 py-2 border rounded-md text-sm sm:text-base ${isDark ? 'bg-slate-700 border-slate-600 text-white' : 'border-gray-300'}`}
                >
                  <option value="pt-BR">Português (Brasil)</option>
                  <option value="en-US">English (US)</option>
                  <option value="es-ES">Español</option>
                </select>
              </div>
            </form>

            <div className={`flex-shrink-0 px-4 py-3 sm:px-6 sm:py-4 flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 border-t ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
              <Button 
                type="button"
                variant="outline" 
                onClick={() => setModalOpen(false)} 
                className="w-full sm:w-auto text-sm sm:text-base"
              >
                Cancelar
              </Button>
              <Button 
                type="submit"
                onClick={handleSubmit} 
                disabled={actionLoading} 
                className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700 text-sm sm:text-base"
              >
                {actionLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    {selectedAgent ? 'Atualizar' : 'Criar Agente'}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
