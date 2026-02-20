import { useState, useEffect, useCallback } from 'react';
import {
  Phone, Search, Plus, Power, PowerOff, Trash2, Edit3,
  Loader2, X, Check, Eye, EyeOff, Mic, PhoneCall, Settings
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
  
  // LocalStorage helper functions for API keys
  const getStoredApiKey = (keyName: string): string | null => {
    try {
      return localStorage.getItem(`voice_agent_${keyName}`);
    } catch (e) {
      return null;
    }
  };

  const setStoredApiKey = (keyName: string, value: string | null): void => {
    try {
      if (value) {
        localStorage.setItem(`voice_agent_${keyName}`, value);
      } else {
        localStorage.removeItem(`voice_agent_${keyName}`);
      }
    } catch (e) {
      console.warn(`Failed to store ${keyName} in localStorage:`, e);
    }
  };
  
  const [voiceAgents, setVoiceAgents] = useState<VoiceAgent[]>([]);
  const [elevenLabsVoices, setElevenLabsVoices] = useState<ElevenLabsVoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<VoiceAgent | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showSettingsApiKey, setShowSettingsApiKey] = useState<Record<string, boolean>>({
    elevenlabs: false,
    openai: false,
    anthropic: false,
    google: false,
  });
  const [elevenLabsConfigured, setElevenLabsConfigured] = useState(false);
  const [savedApiKeys, setSavedApiKeys] = useState<{
    elevenlabs: boolean;
    openai: boolean;
    anthropic: boolean;
    google: boolean;
  }>({
    elevenlabs: false,
    openai: false,
    anthropic: false,
    google: false,
  });

  const [settingsForm, setSettingsForm] = useState({
    elevenlabs_api_key: '',
    openai_api_key: '',
    anthropic_api_key: '',
    google_api_key: '',
    preferred_ai_model: 'elevenlabs', // elevenlabs | openai | anthropic | google
  });

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
      
      // Load settings first to know if ElevenLabs is configured
      let settings: any = { elevenlabs_configured: false, elevenlabs_api_key_preview: null, voice_settings: {} };
      try {
        settings = await voiceAgentsApi.getSettings();
        console.log('[VoiceAgentsPage] Settings loaded:', {
          elevenlabs_configured: settings.elevenlabs_configured,
          openai_configured: settings.openai_configured,
          anthropic_configured: settings.anthropic_configured,
          google_configured: settings.google_configured,
          preferred_ai_model: settings.preferred_ai_model,
        });
      } catch (settingsError) {
        console.error('[VoiceAgentsPage] Error loading settings:', settingsError);
        // Continue even if settings fail to load
      }

      // Load agents and voices in parallel
      const [agents, voicesResponse] = await Promise.all([
        voiceAgentsApi.getAll().catch((error) => {
          console.error('[VoiceAgentsPage] Error loading agents:', error);
          return [];
        }),
        // Only load voices if ElevenLabs is configured
        settings.elevenlabs_configured 
          ? voiceAgentsApi.getElevenLabsVoices().catch((error) => {
              console.error('[VoiceAgentsPage] Error loading voices:', error);
              return { voices: [], configured: false };
            })
          : Promise.resolve({ voices: [], configured: settings.elevenlabs_configured })
      ]);

      console.log('[VoiceAgentsPage] Data loaded:', { 
        agentsCount: agents.length, 
        voicesCount: Array.isArray(voicesResponse) ? voicesResponse.length : voicesResponse.voices?.length || 0,
        elevenLabsConfigured: settings.elevenlabs_configured
      });
      
      // Update agents
      setVoiceAgents(agents);
      
      // Handle voices response (can be old format array or new format object)
      if (Array.isArray(voicesResponse)) {
        console.log('[VoiceAgentsPage] Using old voices format (array)');
        setElevenLabsVoices(voicesResponse);
      } else {
        console.log('[VoiceAgentsPage] Using new voices format:', {
          configured: voicesResponse.configured,
          voicesCount: voicesResponse.voices?.length || 0
        });
        setElevenLabsVoices(voicesResponse.voices || []);
      }
      
      // Update ElevenLabs configured status
      const configuredStatus = settings.elevenlabs_configured || (Array.isArray(voicesResponse) ? false : voicesResponse.configured);
      setElevenLabsConfigured(configuredStatus);
      
      // Save which APIs are configured for UI indicators
      setSavedApiKeys({
        elevenlabs: settings.elevenlabs_configured || false,
        openai: settings.openai_configured || false,
        anthropic: settings.anthropic_configured || false,
        google: settings.google_configured || false,
      });
      
      console.log('[VoiceAgentsPage] Configuration Status:', {
        elevenLabsConfigured: configuredStatus,
        agentsLoaded: agents.length,
        voicesAvailable: Array.isArray(voicesResponse) ? voicesResponse.length : voicesResponse.voices?.length || 0
      });
    } catch (error) {
      console.error('[VoiceAgentsPage] Error in loadData:', error);
      toast.error('Erro ao carregar agentes de voz. Tente atualizar a página.');
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
    if (!form.name || !form.voice_config.voice_id || !form.call_config.api_key || !form.call_config.from_number) {
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

  const handleOpenSettings = async () => {
    try {
      console.log('[VoiceAgentsPage] 🔧 Opening settings modal...');
      
      // Load current settings from server
      const currentSettings = await voiceAgentsApi.getSettings();
      console.log('[VoiceAgentsPage] Current settings from server:', {
        elevenlabs: currentSettings.elevenlabs_configured,
        openai: currentSettings.openai_configured,
        anthropic: currentSettings.anthropic_configured,
        google: currentSettings.google_configured,
      });
      
      // Update saved API keys status
      setSavedApiKeys({
        elevenlabs: currentSettings.elevenlabs_configured || false,
        openai: currentSettings.openai_configured || false,
        anthropic: currentSettings.anthropic_configured || false,
        google: currentSettings.google_configured || false,
      });
      
      // Try to load from localStorage first (full keys), fallback to preview from server
      const storedElevenLabs = getStoredApiKey('elevenlabs_api_key');
      const storedOpenAI = getStoredApiKey('openai_api_key');
      const storedAnthropic = getStoredApiKey('anthropic_api_key');
      const storedGoogle = getStoredApiKey('google_api_key');

      // Pre-fill fields with stored values or previews
      setSettingsForm({
        elevenlabs_api_key: storedElevenLabs || currentSettings.elevenlabs_api_key_preview || '',
        openai_api_key: storedOpenAI || currentSettings.openai_api_key_preview || '',
        anthropic_api_key: storedAnthropic || currentSettings.anthropic_api_key_preview || '',
        google_api_key: storedGoogle || currentSettings.google_api_key_preview || '',
        preferred_ai_model: currentSettings.preferred_ai_model || 'elevenlabs',
      });
      
      setShowSettingsApiKey({
        elevenlabs: false,
        openai: false,
        anthropic: false,
        google: false,
      });
      
      setSettingsModalOpen(true);
      console.log('[VoiceAgentsPage] Settings modal opened with saved status:', currentSettings);
    } catch (error) {
      console.error('[VoiceAgentsPage] Error loading settings for modal:', error);
      // If error, start with empty form
      setSettingsForm({ 
        elevenlabs_api_key: '',
        openai_api_key: '',
        anthropic_api_key: '',
        google_api_key: '',
        preferred_ai_model: 'elevenlabs',
      });
      setShowSettingsApiKey({
        elevenlabs: false,
        openai: false,
        anthropic: false,
        google: false,
      });
      setSettingsModalOpen(true);
      toast.error('Erro ao carregar configurações atuais');
    }
  };

  const handleSaveSettings = async () => {
    // Helper function to determine if a value is a preview or actual key
    const isPreview = (value: string | undefined): boolean => {
      return !!value?.endsWith('...');
    };

    // Prepare data - only send keys that were actually modified (not previews)
    const dataToSave = {
      elevenlabs_api_key: (settingsForm.elevenlabs_api_key && !isPreview(settingsForm.elevenlabs_api_key)) 
        ? settingsForm.elevenlabs_api_key 
        : null,
      openai_api_key: (settingsForm.openai_api_key && !isPreview(settingsForm.openai_api_key)) 
        ? settingsForm.openai_api_key 
        : null,
      anthropic_api_key: (settingsForm.anthropic_api_key && !isPreview(settingsForm.anthropic_api_key)) 
        ? settingsForm.anthropic_api_key 
        : null,
      google_api_key: (settingsForm.google_api_key && !isPreview(settingsForm.google_api_key)) 
        ? settingsForm.google_api_key 
        : null,
      preferred_ai_model: settingsForm.preferred_ai_model,
    };

    // Validations: at least one key must be provided (either already saved or newly provided)
    const hasAnySavedKey = 
      savedApiKeys.elevenlabs || savedApiKeys.openai || savedApiKeys.anthropic || savedApiKeys.google;
    const hasAnyNewKey = 
      dataToSave.elevenlabs_api_key || 
      dataToSave.openai_api_key || 
      dataToSave.anthropic_api_key || 
      dataToSave.google_api_key;

    if (!hasAnySavedKey && !hasAnyNewKey) {
      toast.error('Forneça pelo menos uma API key válida');
      return;
    }

    try {
      setActionLoading(true);
      console.log('[VoiceAgentsPage] 🔄 Saving API keys...');
      
      console.log('[VoiceAgentsPage] Submitting:', {
        hasElevenLabs: !!dataToSave.elevenlabs_api_key,
        hasOpenAI: !!dataToSave.openai_api_key,
        hasAnthropic: !!dataToSave.anthropic_api_key,
        hasGoogle: !!dataToSave.google_api_key,
        keepingExisting: `${[
          savedApiKeys.elevenlabs && !dataToSave.elevenlabs_api_key ? 'ElevenLabs' : '',
          savedApiKeys.openai && !dataToSave.openai_api_key ? 'OpenAI' : '',
          savedApiKeys.anthropic && !dataToSave.anthropic_api_key ? 'Anthropic' : '',
          savedApiKeys.google && !dataToSave.google_api_key ? 'Google' : '',
        ].filter(Boolean).join(', ')}`,
      });
      
      const response = await voiceAgentsApi.updateSettings(dataToSave);
      
      console.log('[VoiceAgentsPage] ✅ Settings saved:', response);
      
      // Store new/updated keys in localStorage for future reference
      if (dataToSave.elevenlabs_api_key) {
        setStoredApiKey('elevenlabs_api_key', dataToSave.elevenlabs_api_key);
      }
      if (dataToSave.openai_api_key) {
        setStoredApiKey('openai_api_key', dataToSave.openai_api_key);
      }
      if (dataToSave.anthropic_api_key) {
        setStoredApiKey('anthropic_api_key', dataToSave.anthropic_api_key);
      }
      if (dataToSave.google_api_key) {
        setStoredApiKey('google_api_key', dataToSave.google_api_key);
      }
      
      // Update saved API keys status immediately
      setSavedApiKeys({
        elevenlabs: savedApiKeys.elevenlabs || !!dataToSave.elevenlabs_api_key,
        openai: savedApiKeys.openai || !!dataToSave.openai_api_key,
        anthropic: savedApiKeys.anthropic || !!dataToSave.anthropic_api_key,
        google: savedApiKeys.google || !!dataToSave.google_api_key,
      });
      
      toast.success('Configurações salvas com sucesso! Recarregando...');
      
      // Keep modal open for a moment while showing loading state
      // This prevents UI flicker
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Close modal
      setSettingsModalOpen(false);
      
      // Wait a bit more for cleanup
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Reload ALL data including agents and voices
      console.log('[VoiceAgentsPage] 🔄 Reloading all data after settings save...');
      setLoading(true);
      
      // Load fresh data with explicit error handling
      try {
        const [agents, settings] = await Promise.all([
          voiceAgentsApi.getAll(),
          voiceAgentsApi.getSettings(),
        ]);
        
        console.log('[VoiceAgentsPage] ✅ Fresh data loaded:', {
          agentsCount: agents.length,
          elevenLabsConfigured: settings.elevenlabs_configured,
          openAIConfigured: settings.openai_configured,
        });
        
        // Update state with fresh data
        setVoiceAgents(agents);
        setElevenLabsConfigured(settings.elevenlabs_configured);
        
        // Load voices if ElevenLabs is configured
        if (settings.elevenlabs_configured) {
          try {
            const voicesData = await voiceAgentsApi.getElevenLabsVoices();
            console.log('[VoiceAgentsPage] Voices loaded:', voicesData);
            const voiceList = Array.isArray(voicesData) ? voicesData : (voicesData as any).voices || [];
            setElevenLabsVoices(voiceList);
          } catch (voiceError) {
            console.warn('[VoiceAgentsPage] Could not load voices:', voiceError);
          }
        }
        
        console.log('[VoiceAgentsPage] ✅ All data refreshed successfully');
      } catch (reloadError) {
        console.error('[VoiceAgentsPage] Error reloading data:', reloadError);
        toast.error('Configurações salvas, mas houve erro ao recarregar. Atualize a página.');
      } finally {
        setLoading(false);
      }
      
    } catch (error: any) {
      console.error('[VoiceAgentsPage] ❌ Error saving settings:', error);
      
      // Improved error handling with diagnostics
      const status = error.response?.status;
      const data = error.response?.data;
      const errorMsg = data?.error || error.message || 'Erro ao salvar configurações';
      
      // Log detailed error information
      console.error('[VoiceAgentsPage] Error details:', {
        status,
        statusText: error.response?.statusText,
        errorMessage: errorMsg,
        receivedFields: data?.receivedFields,
        schemaError: data?.error?.includes('schema'),
      });
      
      // If it's a 400 or 500 error related to schema/database
      if ((status === 400 || status === 500) && errorMsg.includes('schema')) {
        console.warn('[VoiceAgentsPage] ⚠️ Appears to be a database schema issue');
        toast.error(
          'Erro de schema do banco de dados\n\n' +
          'Possível solução:\n' +
          '1. Abra o console (F12) e procure por logs de erro\n' +
          '2. Verifique se a migração 014 foi aplicada\n' +
          '3. Contate o administrador do sistema'
        );
        
        // Attempt to run diagnosis
        try {
          console.log('[VoiceAgentsPage] 🔍 Running diagnosis...');
          const diagResponse = await voiceAgentsApi.diagnose();
          console.log('[VoiceAgentsPage] Diagnosis result:', diagResponse);
          if (diagResponse.diagnosis?.missingColumns?.length > 0) {
            toast.error(
              `❌ Colunas faltando no banco:\n${diagResponse.diagnosis.missingColumns.join(', ')}\n\n` +
              `Execute a migração 014_add_ai_models_support.sql`
            );
          }
        } catch (diagError) {
          console.error('[VoiceAgentsPage] Diagnosis failed:', diagError);
        }
      } else if (status === 400 && data?.receivedFields) {
        // Debug info for empty fields
        console.warn('[VoiceAgentsPage] Empty request body?', data.receivedFields);
        toast.error(
          'Nenhum campo de API foi enviado.\n\n' +
          'Verifique:\n' +
          '- Você preencheu alguma chave de API?\n' +
          '- Clicou em "Salvar Configurações"?'
        );
      } else {
        toast.error(errorMsg);
      }
    } finally {
      setActionLoading(false);
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
              {!elevenLabsConfigured && (
                <Badge variant="outline" className="text-xs bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                  Configure API
                </Badge>
              )}
            </h1>
            <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              Crie agentes de voz usando ElevenLabs para gerar vozes realistas e Wavoip para efetuar chamadas automáticas
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={handleOpenSettings} 
              variant="outline"
              className={isDark ? 'border-slate-600 hover:bg-slate-700' : ''}
            >
              <Settings className="w-4 h-4 mr-2" />
              Configurações
            </Button>
            <Button onClick={handleCreate} className="bg-purple-600 hover:bg-purple-700">
              <Plus className="w-4 h-4 mr-2" />
              Criar Agente
            </Button>
          </div>
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
                  Número de Origem (Wavoip)
                </label>
                <Input
                  value={form.call_config.from_number}
                  onChange={(e) => setForm({
                    ...form,
                    call_config: { ...form.call_config, from_number: e.target.value }
                  })}
                  placeholder="+5511999999999"
                  className={`text-sm sm:text-base ${isDark ? 'bg-slate-700 border-slate-600 text-white' : ''}`}
                />
                <p className={`mt-1.5 text-[10px] sm:text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Formato E.164 obrigatório: +CCNNNNNNNNN (ex: +5511999999999 para Brasil)
                </p>
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

      {/* Settings Modal */}
      {settingsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Overlay */}
          <div 
            className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" 
            onClick={() => setSettingsModalOpen(false)}
          ></div>
          
          {/* Modal Content */}
          <div className={`relative rounded-lg shadow-xl w-full max-w-lg z-10 ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
            
            {/* Header */}
              <div className={`px-4 py-3 sm:px-6 sm:py-4 border-b ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                <div className="flex items-center justify-between">
                  <h3 className={`text-base sm:text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Configurações de API
                  </h3>
                  <button
                    onClick={() => setSettingsModalOpen(false)}
                    className={`p-1.5 rounded-md transition-colors w-6 h-6 flex items-center justify-center ${isDark ? 'hover:bg-slate-700' : 'hover:bg-gray-100'}`}
                  >
                    <X className={`w-4 h-4 ${isDark ? 'text-gray-300' : 'text-gray-600'}`} />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="px-4 py-4 sm:px-6 sm:py-5 space-y-5 max-h-[70vh] overflow-y-auto">
                
                {/* Model Selector */}
                <div>
                  <label className={`block text-xs sm:text-sm font-medium mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Modelo de IA Preferido
                  </label>
                  <select
                    value={settingsForm.preferred_ai_model}
                    onChange={(e) => setSettingsForm({ ...settingsForm, preferred_ai_model: e.target.value })}
                    className={`w-full px-3 py-2 border rounded-md text-sm sm:text-base ${isDark ? 'bg-slate-700 border-slate-600 text-white' : 'border-gray-300'}`}
                  >
                    <option value="elevenlabs">ElevenLabs (Voz)</option>
                    <option value="openai">OpenAI (GPT-4, GPT-3.5)</option>
                    <option value="anthropic">Anthropic (Claude)</option>
                    <option value="google">Google (Gemini)</option>
                  </select>
                </div>

                {/* ElevenLabs API Key */}
                <div>
                  <div className="flex items-center gap-2">
                    <label className={`block text-xs sm:text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      ElevenLabs API Key
                    </label>
                    {savedApiKeys.elevenlabs && (
                      <span className="px-2 py-1 text-[10px] bg-green-500/20 text-green-600 rounded-full font-semibold">✓ Salvo</span>
                    )}
                  </div>
                  <div className="relative mt-1.5 sm:mt-2">
                    <input
                      type={showSettingsApiKey.elevenlabs ? 'text' : 'password'}
                      value={settingsForm.elevenlabs_api_key}
                      onChange={(e) => setSettingsForm({ ...settingsForm, elevenlabs_api_key: e.target.value })}
                      placeholder={savedApiKeys.elevenlabs ? "Digite uma nova chave para atualizar..." : "sk_..."}
                      className={`w-full px-3 py-2 pr-10 border rounded-md text-sm sm:text-base ${isDark ? 'bg-slate-700 border-slate-600 text-white placeholder:text-gray-500' : 'border-gray-300'}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSettingsApiKey({ ...showSettingsApiKey, elevenlabs: !showSettingsApiKey.elevenlabs })}
                      className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded transition-colors ${isDark ? 'hover:bg-slate-600' : 'hover:bg-gray-100'}`}
                    >
                      {showSettingsApiKey.elevenlabs ? (
                        <EyeOff className={`w-4 h-4 ${isDark ? 'text-gray-300' : 'text-gray-600'}`} />
                      ) : (
                        <Eye className={`w-4 h-4 ${isDark ? 'text-gray-300' : 'text-gray-600'}`} />
                      )}
                    </button>
                  </div>
                  <p className={`mt-1.5 text-[10px] sm:text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Obtenha sua chave em <a href="https://elevenlabs.io/app/settings/api-keys" target="_blank" rel="noopener noreferrer" className="text-purple-500 hover:underline">elevenlabs.io</a>
                  </p>
                </div>

                {/* OpenAI API Key */}
                <div>
                  <div className="flex items-center gap-2">
                    <label className={`block text-xs sm:text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      OpenAI API Key
                    </label>
                    {savedApiKeys.openai && (
                      <span className="px-2 py-1 text-[10px] bg-green-500/20 text-green-600 rounded-full font-semibold">✓ Salvo</span>
                    )}
                  </div>
                  <div className="relative mt-1.5 sm:mt-2">
                    <input
                      type={showSettingsApiKey.openai ? 'text' : 'password'}
                      value={settingsForm.openai_api_key}
                      onChange={(e) => setSettingsForm({ ...settingsForm, openai_api_key: e.target.value })}
                      placeholder={savedApiKeys.openai ? "Digite uma nova chave para atualizar..." : "sk-..."}
                      className={`w-full px-3 py-2 pr-10 border rounded-md text-sm sm:text-base ${isDark ? 'bg-slate-700 border-slate-600 text-white placeholder:text-gray-500' : 'border-gray-300'}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSettingsApiKey({ ...showSettingsApiKey, openai: !showSettingsApiKey.openai })}
                      className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded transition-colors ${isDark ? 'hover:bg-slate-600' : 'hover:bg-gray-100'}`}
                    >
                      {showSettingsApiKey.openai ? (
                        <EyeOff className={`w-4 h-4 ${isDark ? 'text-gray-300' : 'text-gray-600'}`} />
                      ) : (
                        <Eye className={`w-4 h-4 ${isDark ? 'text-gray-300' : 'text-gray-600'}`} />
                      )}
                    </button>
                  </div>
                  <p className={`mt-1.5 text-[10px] sm:text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Obtenha sua chave em <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-cyan-500 hover:underline">platform.openai.com</a>
                  </p>
                </div>

                {/* Anthropic API Key */}
                <div>
                  <div className="flex items-center gap-2">
                    <label className={`block text-xs sm:text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      Anthropic API Key (Claude)
                    </label>
                    {savedApiKeys.anthropic && (
                      <span className="px-2 py-1 text-[10px] bg-green-500/20 text-green-600 rounded-full font-semibold">✓ Salvo</span>
                    )}
                  </div>
                  <div className="relative mt-1.5 sm:mt-2">
                    <input
                      type={showSettingsApiKey.anthropic ? 'text' : 'password'}
                      value={settingsForm.anthropic_api_key}
                      onChange={(e) => setSettingsForm({ ...settingsForm, anthropic_api_key: e.target.value })}
                      placeholder={savedApiKeys.anthropic ? "Digite uma nova chave para atualizar..." : "sk-ant-..."}
                      className={`w-full px-3 py-2 pr-10 border rounded-md text-sm sm:text-base ${isDark ? 'bg-slate-700 border-slate-600 text-white placeholder:text-gray-500' : 'border-gray-300'}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSettingsApiKey({ ...showSettingsApiKey, anthropic: !showSettingsApiKey.anthropic })}
                      className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded transition-colors ${isDark ? 'hover:bg-slate-600' : 'hover:bg-gray-100'}`}
                    >
                      {showSettingsApiKey.anthropic ? (
                        <EyeOff className={`w-4 h-4 ${isDark ? 'text-gray-300' : 'text-gray-600'}`} />
                      ) : (
                        <Eye className={`w-4 h-4 ${isDark ? 'text-gray-300' : 'text-gray-600'}`} />
                      )}
                    </button>
                  </div>
                  <p className={`mt-1.5 text-[10px] sm:text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Obtenha sua chave em <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:underline">console.anthropic.com</a>
                  </p>
                </div>

                {/* Google API Key */}
                <div>
                  <div className="flex items-center gap-2">
                    <label className={`block text-xs sm:text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      Google API Key (Gemini)
                    </label>
                    {savedApiKeys.google && (
                      <span className="px-2 py-1 text-[10px] bg-green-500/20 text-green-600 rounded-full font-semibold">✓ Salvo</span>
                    )}
                  </div>
                  <div className="relative mt-1.5 sm:mt-2">
                    <input
                      type={showSettingsApiKey.google ? 'text' : 'password'}
                      value={settingsForm.google_api_key}
                      onChange={(e) => setSettingsForm({ ...settingsForm, google_api_key: e.target.value })}
                      placeholder={savedApiKeys.google ? "Digite uma nova chave para atualizar..." : "AIza..."}
                      className={`w-full px-3 py-2 pr-10 border rounded-md text-sm sm:text-base ${isDark ? 'bg-slate-700 border-slate-600 text-white placeholder:text-gray-500' : 'border-gray-300'}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSettingsApiKey({ ...showSettingsApiKey, google: !showSettingsApiKey.google })}
                      className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded transition-colors ${isDark ? 'hover:bg-slate-600' : 'hover:bg-gray-100'}`}
                    >
                      {showSettingsApiKey.google ? (
                        <EyeOff className={`w-4 h-4 ${isDark ? 'text-gray-300' : 'text-gray-600'}`} />
                      ) : (
                        <Eye className={`w-4 h-4 ${isDark ? 'text-gray-300' : 'text-gray-600'}`} />
                      )}
                    </button>
                  </div>
                  <p className={`mt-1.5 text-[10px] sm:text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Obtenha sua chave em <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-red-500 hover:underline">aistudio.google.com</a>
                  </p>
                </div>

              </div>

              {/* Footer */}
              <div className={`flex-shrink-0 px-4 py-3 sm:px-6 sm:py-4 flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 border-t ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                <Button 
                  type="button"
                  variant="outline" 
                  onClick={() => setSettingsModalOpen(false)} 
                  className="w-full sm:w-auto text-sm sm:text-base"
                >
                  Cancelar
                </Button>
                <Button 
                  type="submit"
                  onClick={handleSaveSettings} 
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
                      Salvar Configurações
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
