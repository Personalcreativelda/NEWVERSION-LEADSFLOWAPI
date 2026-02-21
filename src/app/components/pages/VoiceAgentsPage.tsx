import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Phone, Search, Plus, Power, PowerOff, Trash2, Edit3,
  Loader2, X, Check, Eye, EyeOff, Mic, PhoneCall, Settings,
  Bot, Link2, Unlink, RefreshCw, PhoneOutgoing, AlertCircle,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';
import { voiceAgentsApi } from '../../services/api/voice-agents';
import type {
  VoiceAgent,
  CreateVoiceAgentInput,
  ElevenLabsVoice,
  ElevenLabsConvAIAgent,
  ElevenLabsPhoneNumber,
  ConvAIConversation,
} from '../../types/voice-agents';

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
  const [convAIAgents, setConvAIAgents] = useState<ElevenLabsConvAIAgent[]>([]);
  const [phoneNumbers, setPhoneNumbers] = useState<ElevenLabsPhoneNumber[]>([]);
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
    sip_password: false,
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

  // Active AI call tracking
  const [activeCall, setActiveCall] = useState<{
    conversationId: string;
    agentName: string;
    phone: string;
    status: ConvAIConversation['status'];
    transcript: ConvAIConversation['transcript'];
  } | null>(null);
  const callPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // SIP registration form (inside Settings modal)
  const [sipForm, setSipForm] = useState({
    phone_number: '',
    sip_host: 'sipv2.wavoip.com',
    sip_username: '',
    sip_password: '',
    label: '',
  });
  const [sipLoading, setSipLoading] = useState(false);

  const [settingsForm, setSettingsForm] = useState({
    elevenlabs_api_key: '',
    openai_api_key: '',
    anthropic_api_key: '',
    google_api_key: '',
    preferred_ai_model: 'elevenlabs',
  });

  const emptyForm: CreateVoiceAgentInput = {
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
      elevenlabs_agent_id: '',
      phone_number_id: '',
    },
    greeting_message: '',
    instructions: '',
    language: 'pt-BR',
  };

  const [form, setForm] = useState<CreateVoiceAgentInput>(emptyForm);

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

      // Load agents, voices, ConvAI agents and phone numbers in parallel
      const [agents, voicesResponse, convAIRes, phoneNumRes] = await Promise.all([
        voiceAgentsApi.getAll().catch((err) => {
          console.error('[VoiceAgentsPage] Error loading agents:', err);
          return [];
        }),
        settings.elevenlabs_configured
          ? voiceAgentsApi.getElevenLabsVoices().catch((err) => {
              console.error('[VoiceAgentsPage] Error loading voices:', err);
              return { voices: [], configured: false };
            })
          : Promise.resolve({ voices: [], configured: false }),
        settings.elevenlabs_configured
          ? voiceAgentsApi.listConvAIAgents().catch(() => [])
          : Promise.resolve([]),
        settings.elevenlabs_configured
          ? voiceAgentsApi.listPhoneNumbers().catch(() => [])
          : Promise.resolve([]),
      ]);

      setVoiceAgents(agents);

      if (Array.isArray(voicesResponse)) {
        setElevenLabsVoices(voicesResponse);
      } else {
        setElevenLabsVoices((voicesResponse as any).voices || []);
      }

      setConvAIAgents(convAIRes);
      setPhoneNumbers(phoneNumRes);

      const configuredStatus = settings.elevenlabs_configured ||
        (!Array.isArray(voicesResponse) && (voicesResponse as any).configured);
      setElevenLabsConfigured(configuredStatus);

      setSavedApiKeys({
        elevenlabs: settings.elevenlabs_configured || false,
        openai: settings.openai_configured || false,
        anthropic: settings.anthropic_configured || false,
        google: settings.google_configured || false,
      });

      console.log('[VoiceAgentsPage] Loaded:', {
        agents: agents.length,
        convAIAgents: convAIRes.length,
        phoneNumbers: phoneNumRes.length,
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
    setForm(emptyForm);
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
      call_config: {
        api_key: agent.call_config.api_key || '',
        from_number: agent.call_config.from_number || '',
        elevenlabs_agent_id: agent.call_config.elevenlabs_agent_id || '',
        phone_number_id: agent.call_config.phone_number_id || '',
      },
      greeting_message: agent.greeting_message || '',
      instructions: agent.instructions || '',
      language: agent.language,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.name) {
      toast.error('Nome do agente é obrigatório');
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

  const stopCallPolling = () => {
    if (callPollRef.current) {
      clearInterval(callPollRef.current);
      callPollRef.current = null;
    }
  };

  const startCallPolling = (conversationId: string, agentName: string, phone: string) => {
    stopCallPolling();
    callPollRef.current = setInterval(async () => {
      try {
        const conv = await voiceAgentsApi.getConversation(conversationId);
        setActiveCall((prev) =>
          prev ? { ...prev, status: conv.status, transcript: conv.transcript } : prev,
        );
        if (conv.status === 'completed' || conv.status === 'failed') {
          stopCallPolling();
        }
      } catch {
        // ignore polling errors
      }
    }, 3000);
  };

  const handleTestCall = async (agentOrId: string | VoiceAgent) => {
    const agent = typeof agentOrId === 'string'
      ? voiceAgents.find((a) => a.id === agentOrId)
      : agentOrId;
    if (!agent) return;

    const phone = prompt('Digite o número de telefone para teste (com código do país, ex: +5511999999999):');
    if (!phone) return;

    if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
      toast.error('Formato inválido. Use +5511999999999 (com código do país).', { duration: 6000 });
      return;
    }

    const hasAIConfig =
      agent.call_config?.elevenlabs_agent_id && agent.call_config?.phone_number_id;

    try {
      setActionLoading(true);

      if (hasAIConfig) {
        // ── AI call via ElevenLabs ConvAI + Wavoip SIP ──────────────────────
        const result = await voiceAgentsApi.startAICall(agent.id, { phone_number: phone });

        if (!result.conversation_id) {
          toast.error('Chamada iniciada mas sem ID de conversa.', { duration: 5000 });
          return;
        }

        setActiveCall({
          conversationId: result.conversation_id,
          agentName: agent.name,
          phone,
          status: 'initiated',
          transcript: [],
        });
        startCallPolling(result.conversation_id, agent.name, phone);
        toast.success(`Chamada AI iniciada para ${phone}! O agente "${agent.name}" está ligando...`, { duration: 5000 });
      } else {
        // ── Fallback: Wavoip Click-to-Call (simple mode) ────────────────────
        const result = await voiceAgentsApi.testCall(agent.id, { phone_number: phone });

        if (!result.call_url) {
          toast.error(
            'Não foi possível gerar a URL de chamada.\n' +
            'Configure o Agente ElevenLabs e o Número SIP para usar chamadas com AI, ' +
            'ou preencha o Token Wavoip para o modo simples.',
            { duration: 8000 },
          );
          return;
        }

        const popup = window.open(result.call_url, `wavoip_call_${agent.id}`, 'width=480,height=680,resizable=yes,scrollbars=no');
        if (!popup) {
          toast.error('Popup bloqueado. Permita popups para este site.', { duration: 8000 });
        } else {
          popup.focus();
          toast.success('Webphone Wavoip aberto na nova janela.', { duration: 4000 });
        }
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Erro ao iniciar chamada';
      toast.error(msg, { duration: 6000 });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRegisterSip = async () => {
    if (!sipForm.phone_number || !sipForm.sip_host || !sipForm.sip_username || !sipForm.sip_password) {
      toast.error('Preencha todos os campos SIP: número, host, usuário e senha.');
      return;
    }
    try {
      setSipLoading(true);
      const result = await voiceAgentsApi.registerSipTrunk({
        phone_number: sipForm.phone_number,
        sip_host: sipForm.sip_host,
        sip_username: sipForm.sip_username,
        sip_password: sipForm.sip_password,
        label: sipForm.label || `Wavoip ${sipForm.phone_number}`,
      });
      toast.success(`Número SIP registrado: ${result.phone_number.phone_number_id}`);
      setSipForm({ phone_number: '', sip_host: 'sipv2.wavoip.com', sip_username: '', sip_password: '', label: '' });
      const updated = await voiceAgentsApi.listPhoneNumbers();
      setPhoneNumbers(updated);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Erro ao registrar SIP', { duration: 7000 });
    } finally {
      setSipLoading(false);
    }
  };

  const handleDeletePhoneNumber = async (phoneNumberId: string) => {
    if (!confirm('Remover este número do ElevenLabs?')) return;
    try {
      await voiceAgentsApi.deletePhoneNumber(phoneNumberId);
      toast.success('Número removido.');
      setPhoneNumbers((prev) => prev.filter((p) => p.phone_number_id !== phoneNumberId));
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Erro ao remover número', { duration: 5000 });
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
      
      // Also refresh ConvAI phone numbers list
      if (currentSettings.elevenlabs_configured) {
        voiceAgentsApi.listPhoneNumbers().then(setPhoneNumbers).catch(() => {});
        voiceAgentsApi.listConvAIAgents().then(setConvAIAgents).catch(() => {});
      }

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
                {/* Card header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${agent.call_config?.elevenlabs_agent_id ? 'bg-purple-100 dark:bg-purple-900/30' : 'bg-gray-100 dark:bg-slate-700'}`}>
                      {agent.call_config?.elevenlabs_agent_id
                        ? <Bot className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                        : <PhoneCall className="w-5 h-5 text-gray-500" />
                      }
                    </div>
                    <div>
                      <h3 className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{agent.name}</h3>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Badge variant={agent.is_active ? 'default' : 'secondary'} className="text-xs">
                          {agent.is_active ? 'Ativo' : 'Inativo'}
                        </Badge>
                        {agent.call_config?.elevenlabs_agent_id && (
                          <Badge variant="outline" className="text-[10px] text-purple-500 border-purple-400">
                            AI
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {agent.description && (
                  <p className={`text-sm mb-3 line-clamp-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    {agent.description}
                  </p>
                )}

                <div className={`flex items-center gap-2 text-xs mb-4 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  {agent.call_config?.elevenlabs_agent_id ? (
                    <>
                      <Bot className="w-3 h-3 text-purple-500" />
                      <span className="text-purple-500">ConvAI</span>
                      <span>•</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-3 h-3" />
                      <span>{agent.voice_provider}</span>
                      <span>•</span>
                    </>
                  )}
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
                    {agent.is_active ? <PowerOff className="w-3 h-3" /> : <Power className="w-3 h-3" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={actionLoading}
                    onClick={() => handleTestCall(agent)}
                    title={agent.call_config?.elevenlabs_agent_id ? 'Iniciar chamada AI' : 'Ligar (Click-to-Call)'}
                    className={agent.call_config?.elevenlabs_agent_id ? 'text-purple-600 border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20' : ''}
                  >
                    {agent.call_config?.elevenlabs_agent_id
                      ? <PhoneOutgoing className="w-3 h-3" />
                      : <Phone className="w-3 h-3" />
                    }
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

              {/* ── Seção: Agente AI (ElevenLabs ConvAI + Wavoip SIP) ── */}
              <div className={`rounded-lg p-3 border ${isDark ? 'bg-slate-700/50 border-purple-800/40' : 'bg-purple-50 border-purple-200'}`}>
                <div className="flex items-center gap-2 mb-3">
                  <Bot className="w-4 h-4 text-purple-500" />
                  <span className={`text-sm font-semibold ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>
                    Agente AI (ElevenLabs ConvAI + Wavoip SIP)
                  </span>
                  <Badge variant="outline" className="text-[10px] text-purple-500 border-purple-400">Recomendado</Badge>
                </div>
                <p className={`text-[11px] mb-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  O ElevenLabs conduz a conversa AI via WhatsApp usando o SIP do Wavoip.
                  Registre o SIP em <strong>Configurações → SIP Wavoip</strong> para ver os números disponíveis.
                </p>

                {/* ElevenLabs ConvAI Agent */}
                <div className="mb-3">
                  <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    Agente ElevenLabs (ConvAI)
                  </label>
                  <select
                    value={form.call_config.elevenlabs_agent_id || ''}
                    onChange={(e) => setForm({ ...form, call_config: { ...form.call_config, elevenlabs_agent_id: e.target.value } })}
                    className={`w-full px-3 py-2 border rounded-md text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-white' : 'border-gray-300'}`}
                  >
                    <option value="">— Selecione um agente ElevenLabs —</option>
                    {convAIAgents.map((a) => (
                      <option key={a.agent_id} value={a.agent_id}>{a.name}</option>
                    ))}
                  </select>
                  {convAIAgents.length === 0 && (
                    <p className={`mt-1 text-[10px] ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`}>
                      Nenhum agente ConvAI encontrado. Crie um em elevenlabs.io/app/conversational-ai
                    </p>
                  )}
                </div>

                {/* Phone Number / SIP Trunk */}
                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    Número de Saída (SIP Wavoip registrado)
                  </label>
                  <select
                    value={form.call_config.phone_number_id || ''}
                    onChange={(e) => setForm({ ...form, call_config: { ...form.call_config, phone_number_id: e.target.value } })}
                    className={`w-full px-3 py-2 border rounded-md text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-white' : 'border-gray-300'}`}
                  >
                    <option value="">— Selecione um número —</option>
                    {phoneNumbers.map((p) => (
                      <option key={p.phone_number_id} value={p.phone_number_id}>
                        {p.label || p.phone_number} ({p.phone_number})
                      </option>
                    ))}
                  </select>
                  {phoneNumbers.length === 0 && (
                    <p className={`mt-1 text-[10px] ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`}>
                      Nenhum número SIP registrado. Vá em Configurações → Integração SIP Wavoip.
                    </p>
                  )}
                </div>
              </div>

              {/* ── Separador ── */}
              <div className={`flex items-center gap-2 text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                <div className="flex-1 border-t border-current opacity-30" />
                <span>OU — Modo Simples (Click-to-Call)</span>
                <div className="flex-1 border-t border-current opacity-30" />
              </div>

              {/* ── Seção: Click-to-Call Wavoip (simples/legado) ── */}
              <div className={`rounded-lg p-3 border ${isDark ? 'bg-slate-700/30 border-slate-600' : 'bg-gray-50 border-gray-200'}`}>
                <p className={`text-[11px] mb-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Abre o webphone do Wavoip em popup. Não usa AI — apenas discagem simples.
                </p>
                {/* API Key Wavoip */}
                <div className="mb-3">
                  <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    Token Wavoip (Click-to-Call)
                  </label>
                  <div className="relative">
                    <Input
                      type={showApiKey ? 'text' : 'password'}
                      value={form.call_config.api_key || ''}
                      onChange={(e) => setForm({ ...form, call_config: { ...form.call_config, api_key: e.target.value } })}
                      placeholder="Token Wavoip"
                      className={`text-sm pr-10 ${isDark ? 'bg-slate-700 border-slate-600 text-white' : ''}`}
                    />
                    <button type="button" onClick={() => setShowApiKey(!showApiKey)}
                      className={`absolute right-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    Número de Origem
                  </label>
                  <Input
                    value={form.call_config.from_number || ''}
                    onChange={(e) => setForm({ ...form, call_config: { ...form.call_config, from_number: e.target.value } })}
                    placeholder="+5511999999999"
                    className={`text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-white' : ''}`}
                  />
                </div>
              </div>

              {/* Voz ElevenLabs TTS (opcional quando usando ConvAI) */}
              <div>
                <label className={`block text-xs sm:text-sm font-medium mb-1.5 sm:mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Voz ElevenLabs (TTS)
                </label>
                <select
                  value={form.voice_config.voice_id || ''}
                  onChange={(e) => setForm({ ...form, voice_config: { ...form.voice_config, voice_id: e.target.value } })}
                  className={`w-full px-3 py-2 border rounded-md text-sm sm:text-base ${isDark ? 'bg-slate-700 border-slate-600 text-white' : 'border-gray-300'}`}
                >
                  <option value="">Selecione uma voz (opcional para ConvAI)</option>
                  {elevenLabsVoices.map((voice) => (
                    <option key={voice.voice_id} value={voice.voice_id}>{voice.name}</option>
                  ))}
                </select>
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

                {/* ── Integração SIP Wavoip ── */}
                <div className={`mt-2 pt-4 border-t ${isDark ? 'border-slate-700' : 'border-gray-200'}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <Link2 className="w-4 h-4 text-purple-500" />
                    <h4 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      Integração SIP Wavoip → ElevenLabs
                    </h4>
                  </div>
                  <p className={`text-xs mb-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Registre as credenciais SIP do Wavoip no ElevenLabs para que o agente AI possa fazer chamadas via WhatsApp.
                    Encontre as credenciais em: <strong>Wavoip Dashboard → Dispositivos → SIP</strong>
                  </p>

                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Número WhatsApp</label>
                        <Input
                          value={sipForm.phone_number}
                          onChange={(e) => setSipForm({ ...sipForm, phone_number: e.target.value })}
                          placeholder="+5511999999999"
                          className={`text-xs ${isDark ? 'bg-slate-700 border-slate-600 text-white' : ''}`}
                        />
                      </div>
                      <div>
                        <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Label (opcional)</label>
                        <Input
                          value={sipForm.label}
                          onChange={(e) => setSipForm({ ...sipForm, label: e.target.value })}
                          placeholder="Ex: Vendas"
                          className={`text-xs ${isDark ? 'bg-slate-700 border-slate-600 text-white' : ''}`}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>SIP Host</label>
                      <Input
                        value={sipForm.sip_host}
                        onChange={(e) => setSipForm({ ...sipForm, sip_host: e.target.value })}
                        placeholder="sipv2.wavoip.com"
                        className={`text-xs ${isDark ? 'bg-slate-700 border-slate-600 text-white' : ''}`}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>SIP Usuário</label>
                        <Input
                          value={sipForm.sip_username}
                          onChange={(e) => setSipForm({ ...sipForm, sip_username: e.target.value })}
                          placeholder="UUID do Wavoip"
                          className={`text-xs ${isDark ? 'bg-slate-700 border-slate-600 text-white' : ''}`}
                        />
                      </div>
                      <div>
                        <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>SIP Senha</label>
                        <div className="relative">
                          <Input
                            type={showSettingsApiKey.sip_password ? 'text' : 'password'}
                            value={sipForm.sip_password}
                            onChange={(e) => setSipForm({ ...sipForm, sip_password: e.target.value })}
                            placeholder="Senha SIP"
                            className={`text-xs pr-8 ${isDark ? 'bg-slate-700 border-slate-600 text-white' : ''}`}
                          />
                          <button type="button"
                            onClick={() => setShowSettingsApiKey({ ...showSettingsApiKey, sip_password: !showSettingsApiKey.sip_password })}
                            className={`absolute right-2 top-1/2 -translate-y-1/2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            {showSettingsApiKey.sip_password ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                    </div>
                    <Button
                      type="button"
                      onClick={handleRegisterSip}
                      disabled={sipLoading}
                      className="w-full bg-purple-600 hover:bg-purple-700 text-xs"
                      size="sm"
                    >
                      {sipLoading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Link2 className="w-3 h-3 mr-1" />}
                      Registrar SIP no ElevenLabs
                    </Button>
                  </div>

                  {/* Registered phone numbers */}
                  {phoneNumbers.length > 0 && (
                    <div className="mt-3">
                      <p className={`text-xs font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        Números registrados ({phoneNumbers.length}):
                      </p>
                      <div className="space-y-1">
                        {phoneNumbers.map((pn) => (
                          <div key={pn.phone_number_id}
                            className={`flex items-center justify-between px-2 py-1.5 rounded text-xs ${isDark ? 'bg-slate-700 text-gray-300' : 'bg-gray-100 text-gray-700'}`}>
                            <div>
                              <span className="font-medium">{pn.label || pn.phone_number}</span>
                              <span className={`ml-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>({pn.phone_number})</span>
                              {pn.assigned_agent && (
                                <span className="ml-1 text-purple-500">→ {pn.assigned_agent.agent_name}</span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeletePhoneNumber(pn.phone_number_id)}
                              className="text-red-400 hover:text-red-600 ml-2"
                            >
                              <Unlink className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
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

      {/* ── Active AI Call Status Modal ───────────────────────────────────── */}
      {activeCall && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className={`rounded-xl shadow-2xl w-full max-w-md ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
            {/* Header */}
            <div className={`px-5 py-4 border-b ${isDark ? 'border-slate-700' : 'border-gray-200'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center ${activeCall.status === 'completed' ? 'bg-green-100' : activeCall.status === 'failed' ? 'bg-red-100' : 'bg-purple-100 animate-pulse'}`}>
                    {activeCall.status === 'completed'
                      ? <Check className="w-4 h-4 text-green-600" />
                      : activeCall.status === 'failed'
                      ? <AlertCircle className="w-4 h-4 text-red-600" />
                      : <PhoneOutgoing className="w-4 h-4 text-purple-600" />
                    }
                  </div>
                  <div>
                    <p className={`font-semibold text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      Chamada AI — {activeCall.agentName}
                    </p>
                    <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{activeCall.phone}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    activeCall.status === 'completed' ? 'bg-green-100 text-green-700' :
                    activeCall.status === 'failed' ? 'bg-red-100 text-red-700' :
                    activeCall.status === 'in-progress' ? 'bg-blue-100 text-blue-700' :
                    'bg-purple-100 text-purple-700'
                  }`}>
                    {activeCall.status === 'initiated' ? 'Iniciando...' :
                     activeCall.status === 'ringing' ? 'Chamando...' :
                     activeCall.status === 'in-progress' ? 'Em andamento' :
                     activeCall.status === 'completed' ? 'Concluída' : 'Falha'}
                  </span>
                  <button
                    onClick={() => { stopCallPolling(); setActiveCall(null); }}
                    className={`p-1 rounded ${isDark ? 'hover:bg-slate-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Transcript */}
            <div className={`px-5 py-4 max-h-64 overflow-y-auto space-y-2 ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
              {(!activeCall.transcript || activeCall.transcript.length === 0) ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  {activeCall.status !== 'completed' && activeCall.status !== 'failed' ? (
                    <>
                      <Loader2 className={`w-6 h-6 animate-spin mb-2 ${isDark ? 'text-purple-400' : 'text-purple-500'}`} />
                      <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        Aguardando início da conversa...
                      </p>
                    </>
                  ) : (
                    <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      Sem transcrição disponível
                    </p>
                  )}
                </div>
              ) : (
                activeCall.transcript.map((item, i) => (
                  <div key={i} className={`flex gap-2 ${item.role === 'agent' ? '' : 'flex-row-reverse'}`}>
                    <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold ${item.role === 'agent' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
                      {item.role === 'agent' ? 'AI' : 'U'}
                    </div>
                    <div className={`max-w-[80%] px-3 py-1.5 rounded-lg text-xs ${item.role === 'agent'
                      ? isDark ? 'bg-slate-700 text-gray-200' : 'bg-gray-100 text-gray-800'
                      : isDark ? 'bg-purple-900/40 text-purple-200' : 'bg-purple-50 text-purple-900'
                    }`}>
                      {item.message}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className={`px-5 py-3 border-t flex justify-between items-center ${isDark ? 'border-slate-700' : 'border-gray-200'}`}>
              {(activeCall.status !== 'completed' && activeCall.status !== 'failed') && (
                <Button size="sm" variant="outline" onClick={() => {
                  voiceAgentsApi.getConversation(activeCall.conversationId)
                    .then((c) => setActiveCall((prev) => prev ? { ...prev, status: c.status, transcript: c.transcript } : prev))
                    .catch(() => {});
                }}>
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Atualizar
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => { stopCallPolling(); setActiveCall(null); }} className="ml-auto">
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
