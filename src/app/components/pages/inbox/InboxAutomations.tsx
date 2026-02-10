import { useState, useEffect, useCallback } from 'react';
import {
  Webhook, Plus, Settings, Power, PowerOff, Trash2, X, Check, Loader2,
  Copy, Eye, EyeOff, RefreshCw, Play, Clock, AlertCircle, CheckCircle2,
  ChevronDown, ChevronRight, Link2, Key, FileJson, History, ExternalLink
} from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Badge } from '../../ui/badge';
import { toast } from 'sonner';
import {
  userWebhooksApi,
  type UserWebhook,
  type CreateWebhookInput,
  type WebhookEventsResponse,
  type WebhookLog,
} from '../../../services/api/user-webhooks';
import { channelsApi } from '../../../services/api/inbox';
import type { Channel } from '../../../types/inbox';

// Cores e ícones por categoria de evento
const CATEGORY_CONFIG: Record<string, { color: string; bgColor: string; label: string }> = {
  messages: { color: 'text-blue-500', bgColor: 'bg-blue-500/10', label: 'Mensagens' },
  conversations: { color: 'text-green-500', bgColor: 'bg-green-500/10', label: 'Conversas' },
  contacts: { color: 'text-purple-500', bgColor: 'bg-purple-500/10', label: 'Contatos' },
  channels: { color: 'text-orange-500', bgColor: 'bg-orange-500/10', label: 'Canais' },
  whatsapp: { color: 'text-emerald-500', bgColor: 'bg-emerald-500/10', label: 'WhatsApp' },
};

// Eventos estáticos como fallback (caso a API não responda)
const STATIC_EVENTS: WebhookEventsResponse = {
  events: {
    'message.received': { name: 'Mensagem Recebida', description: 'Quando uma nova mensagem é recebida de um contato', category: 'messages' },
    'message.sent': { name: 'Mensagem Enviada', description: 'Quando uma mensagem é enviada para um contato', category: 'messages' },
    'message.updated': { name: 'Mensagem Atualizada', description: 'Quando o status de uma mensagem é atualizado (entregue, lida)', category: 'messages' },
    'message.deleted': { name: 'Mensagem Deletada', description: 'Quando uma mensagem é deletada', category: 'messages' },
    'conversation.created': { name: 'Conversa Criada', description: 'Quando uma nova conversa é iniciada', category: 'conversations' },
    'conversation.updated': { name: 'Conversa Atualizada', description: 'Quando uma conversa é atualizada (status, tags, etc.)', category: 'conversations' },
    'conversation.resolved': { name: 'Conversa Resolvida', description: 'Quando uma conversa é marcada como resolvida/fechada', category: 'conversations' },
    'conversation.reopened': { name: 'Conversa Reaberta', description: 'Quando uma conversa fechada é reaberta', category: 'conversations' },
    'contact.created': { name: 'Contato Criado', description: 'Quando um novo contato/lead é criado', category: 'contacts' },
    'contact.updated': { name: 'Contato Atualizado', description: 'Quando dados de um contato são atualizados', category: 'contacts' },
    'channel.connected': { name: 'Canal Conectado', description: 'Quando um canal é conectado com sucesso', category: 'channels' },
    'channel.disconnected': { name: 'Canal Desconectado', description: 'Quando um canal é desconectado', category: 'channels' },
    'channel.qr_updated': { name: 'QR Code Atualizado', description: 'Quando o QR Code do WhatsApp é atualizado', category: 'channels' },
    'whatsapp.connection.update': { name: 'Status da Conexão', description: 'Atualizações de conexão do WhatsApp', category: 'whatsapp' },
    'whatsapp.presence.update': { name: 'Presença Atualizada', description: 'Quando o status de presença muda (online, digitando, etc.)', category: 'whatsapp' },
    'whatsapp.groups.update': { name: 'Grupo Atualizado', description: 'Atualizações em grupos do WhatsApp', category: 'whatsapp' },
  },
  categories: {
    messages: [
      { event: 'message.received', name: 'Mensagem Recebida', description: 'Quando uma nova mensagem é recebida de um contato' },
      { event: 'message.sent', name: 'Mensagem Enviada', description: 'Quando uma mensagem é enviada para um contato' },
      { event: 'message.updated', name: 'Mensagem Atualizada', description: 'Quando o status de uma mensagem é atualizado (entregue, lida)' },
      { event: 'message.deleted', name: 'Mensagem Deletada', description: 'Quando uma mensagem é deletada' },
    ],
    conversations: [
      { event: 'conversation.created', name: 'Conversa Criada', description: 'Quando uma nova conversa é iniciada' },
      { event: 'conversation.updated', name: 'Conversa Atualizada', description: 'Quando uma conversa é atualizada (status, tags, etc.)' },
      { event: 'conversation.resolved', name: 'Conversa Resolvida', description: 'Quando uma conversa é marcada como resolvida/fechada' },
      { event: 'conversation.reopened', name: 'Conversa Reaberta', description: 'Quando uma conversa fechada é reaberta' },
    ],
    contacts: [
      { event: 'contact.created', name: 'Contato Criado', description: 'Quando um novo contato/lead é criado' },
      { event: 'contact.updated', name: 'Contato Atualizado', description: 'Quando dados de um contato são atualizados' },
    ],
    channels: [
      { event: 'channel.connected', name: 'Canal Conectado', description: 'Quando um canal é conectado com sucesso' },
      { event: 'channel.disconnected', name: 'Canal Desconectado', description: 'Quando um canal é desconectado' },
      { event: 'channel.qr_updated', name: 'QR Code Atualizado', description: 'Quando o QR Code do WhatsApp é atualizado' },
    ],
    whatsapp: [
      { event: 'whatsapp.connection.update', name: 'Status da Conexão', description: 'Atualizações de conexão do WhatsApp' },
      { event: 'whatsapp.presence.update', name: 'Presença Atualizada', description: 'Quando o status de presença muda (online, digitando, etc.)' },
      { event: 'whatsapp.groups.update', name: 'Grupo Atualizado', description: 'Atualizações em grupos do WhatsApp' },
    ],
  },
};

export default function InboxAutomations() {
  const [webhooks, setWebhooks] = useState<UserWebhook[]>([]);
  const [eventsData, setEventsData] = useState<WebhookEventsResponse | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Modal states
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [logsModalOpen, setLogsModalOpen] = useState(false);
  const [selectedWebhook, setSelectedWebhook] = useState<UserWebhook | null>(null);
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Form state
  const [formData, setFormData] = useState<CreateWebhookInput>({
    name: '',
    url: '',
    events: [],
    headers: {},
    channel_ids: [],
  });
  const [showSecret, setShowSecret] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['messages', 'conversations']);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Headers editing
  const [headerKey, setHeaderKey] = useState('');
  const [headerValue, setHeaderValue] = useState('');

  // Load data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      // Carregar webhooks e canais
      const [webhooksData, channelsList] = await Promise.all([
        userWebhooksApi.getAll().catch(() => []),
        channelsApi.getAll().catch(() => []),
      ]);
      setWebhooks(webhooksData);
      setChannels(channelsList);

      // Tentar carregar eventos da API, usar fallback estático se falhar
      try {
        const events = await userWebhooksApi.getEvents();
        setEventsData(events);
      } catch {
        console.log('[Webhooks] Using static events fallback');
        setEventsData(STATIC_EVENTS);
      }
    } catch (error) {
      console.error('[Webhooks] Error loading data:', error);
      // Usar eventos estáticos mesmo em caso de erro total
      setEventsData(STATIC_EVENTS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reset form
  const resetForm = () => {
    setFormData({
      name: '',
      url: '',
      events: [],
      headers: {},
      channel_ids: [],
    });
    setEditingId(null);
    setHeaderKey('');
    setHeaderValue('');
  };

  // Open edit modal
  const openEditModal = (webhook: UserWebhook) => {
    setEditingId(webhook.id);
    setFormData({
      name: webhook.name,
      url: webhook.url,
      events: webhook.events,
      headers: webhook.headers || {},
      channel_ids: webhook.channel_ids || [],
    });
    setCreateModalOpen(true);
  };

  // Toggle event selection
  const toggleEvent = (event: string) => {
    setFormData(prev => ({
      ...prev,
      events: prev.events.includes(event)
        ? prev.events.filter(e => e !== event)
        : [...prev.events, event],
    }));
  };

  // Toggle all events in category
  const toggleCategory = (categoryEvents: string[]) => {
    const allSelected = categoryEvents.every(e => formData.events.includes(e));
    setFormData(prev => ({
      ...prev,
      events: allSelected
        ? prev.events.filter(e => !categoryEvents.includes(e))
        : [...new Set([...prev.events, ...categoryEvents])],
    }));
  };

  // Toggle channel selection
  const toggleChannel = (channelId: string) => {
    setFormData(prev => ({
      ...prev,
      channel_ids: prev.channel_ids?.includes(channelId)
        ? prev.channel_ids.filter(id => id !== channelId)
        : [...(prev.channel_ids || []), channelId],
    }));
  };

  // Add header
  const addHeader = () => {
    if (headerKey.trim() && headerValue.trim()) {
      setFormData(prev => ({
        ...prev,
        headers: { ...prev.headers, [headerKey.trim()]: headerValue.trim() },
      }));
      setHeaderKey('');
      setHeaderValue('');
    }
  };

  // Remove header
  const removeHeader = (key: string) => {
    setFormData(prev => {
      const newHeaders = { ...prev.headers };
      delete newHeaders[key];
      return { ...prev, headers: newHeaders };
    });
  };

  // Save webhook
  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }
    if (!formData.url.trim()) {
      toast.error('URL é obrigatória');
      return;
    }
    if (formData.events.length === 0) {
      toast.error('Selecione pelo menos um evento');
      return;
    }

    try {
      setActionLoading('save');
      if (editingId) {
        await userWebhooksApi.update(editingId, formData);
        toast.success('Webhook atualizado com sucesso!');
      } else {
        await userWebhooksApi.create(formData);
        toast.success('Webhook criado com sucesso!');
      }
      setCreateModalOpen(false);
      resetForm();
      loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Erro ao salvar webhook');
    } finally {
      setActionLoading(null);
    }
  };

  // Toggle webhook active
  const handleToggle = async (webhook: UserWebhook) => {
    try {
      setActionLoading(webhook.id);
      await userWebhooksApi.toggle(webhook.id, !webhook.is_active);
      toast.success(webhook.is_active ? 'Webhook desativado' : 'Webhook ativado');
      loadData();
    } catch (error) {
      toast.error('Erro ao alterar status');
    } finally {
      setActionLoading(null);
    }
  };

  // Test webhook
  const handleTest = async (webhook: UserWebhook) => {
    try {
      setActionLoading(`test-${webhook.id}`);
      const result = await userWebhooksApi.test(webhook.id);
      if (result.success) {
        toast.success(`Teste enviado! Status: ${result.status}`);
      } else {
        toast.error(`Falha no teste: ${result.error}`);
      }
      loadData();
    } catch (error) {
      toast.error('Erro ao testar webhook');
    } finally {
      setActionLoading(null);
    }
  };

  // Delete webhook
  const handleDelete = async (webhook: UserWebhook) => {
    if (!confirm(`Deseja realmente excluir o webhook "${webhook.name}"?`)) return;

    try {
      setActionLoading(webhook.id);
      await userWebhooksApi.delete(webhook.id);
      toast.success('Webhook excluído');
      loadData();
    } catch (error) {
      toast.error('Erro ao excluir webhook');
    } finally {
      setActionLoading(null);
    }
  };

  // View logs
  const handleViewLogs = async (webhook: UserWebhook) => {
    setSelectedWebhook(webhook);
    setLogsModalOpen(true);
    setLogsLoading(true);
    try {
      const logsData = await userWebhooksApi.getLogs(webhook.id, 50);
      setLogs(logsData);
    } catch (error) {
      toast.error('Erro ao carregar logs');
    } finally {
      setLogsLoading(false);
    }
  };

  // Copy to clipboard
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  // Toggle category expansion
  const toggleCategoryExpand = (category: string) => {
    setExpandedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  return (
    <div
      className="h-full p-6 overflow-y-auto"
      style={{ backgroundColor: 'hsl(var(--background))' }}
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1
            className="text-2xl font-bold mb-2 flex items-center gap-2"
            style={{ color: 'hsl(var(--foreground))' }}
          >
            <Webhook className="w-6 h-6 text-purple-500" />
            Webhooks
          </h1>
          <p className="max-w-2xl" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Configure webhooks para integrar com n8n, Make, Zapier e outras ferramentas de automação.
            Receba eventos em tempo real dos seus canais conectados.
          </p>
        </div>

        <Button
          onClick={() => {
            resetForm();
            setCreateModalOpen(true);
          }}
          className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          Novo Webhook
        </Button>
      </div>

      {/* Webhooks List */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'hsl(var(--muted-foreground))' }} />
        </div>
      ) : webhooks.length === 0 ? (
        <div
          className="text-center py-16 rounded-xl border-2 border-dashed"
          style={{
            borderColor: 'hsl(var(--border))',
            backgroundColor: 'hsl(var(--card))',
          }}
        >
          <Webhook className="w-12 h-12 mx-auto mb-4 opacity-50" style={{ color: 'hsl(var(--muted-foreground))' }} />
          <h3 className="text-lg font-medium mb-2" style={{ color: 'hsl(var(--foreground))' }}>
            Nenhum webhook configurado
          </h3>
          <p className="mb-4" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Crie webhooks para receber eventos dos seus canais em sistemas externos como n8n, Make ou Zapier.
          </p>
          <Button
            onClick={() => {
              resetForm();
              setCreateModalOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            Criar primeiro webhook
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {webhooks.map(webhook => (
            <div
              key={webhook.id}
              className="rounded-xl border p-5 transition-all hover:shadow-md"
              style={{
                backgroundColor: 'hsl(var(--card))',
                borderColor: 'hsl(var(--border))',
              }}
            >
              <div className="flex items-start justify-between gap-4">
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        webhook.is_active ? 'bg-purple-500/10' : 'bg-gray-500/10'
                      }`}
                    >
                      <Webhook className={`w-5 h-5 ${webhook.is_active ? 'text-purple-500' : 'text-gray-500'}`} />
                    </div>
                    <div>
                      <h3 className="font-semibold flex items-center gap-2" style={{ color: 'hsl(var(--foreground))' }}>
                        {webhook.name}
                        <Badge variant={webhook.is_active ? 'default' : 'secondary'} className="text-xs">
                          {webhook.is_active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </h3>
                      <div className="flex items-center gap-2 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        <Link2 className="w-3 h-3" />
                        <span className="truncate max-w-md">{webhook.url}</span>
                        <button
                          onClick={() => copyToClipboard(webhook.url, 'URL')}
                          className="hover:text-foreground"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Events */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {webhook.events.slice(0, 5).map(event => (
                      <span
                        key={event}
                        className="text-[10px] px-2 py-0.5 rounded-full"
                        style={{
                          backgroundColor: 'hsl(var(--secondary))',
                          color: 'hsl(var(--secondary-foreground))',
                        }}
                      >
                        {event}
                      </span>
                    ))}
                    {webhook.events.length > 5 && (
                      <span className="text-[10px] px-2 py-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        +{webhook.events.length - 5} mais
                      </span>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-4 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    <span className="flex items-center gap-1">
                      <Play className="w-3 h-3" />
                      {webhook.trigger_count} disparos
                    </span>
                    {webhook.last_triggered_at && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Último: {new Date(webhook.last_triggered_at).toLocaleString('pt-BR')}
                      </span>
                    )}
                    {webhook.last_error ? (
                      <span className="flex items-center gap-1 text-red-500">
                        <AlertCircle className="w-3 h-3" />
                        Erro: {webhook.last_error}
                      </span>
                    ) : webhook.trigger_count > 0 ? (
                      <span className="flex items-center gap-1 text-green-500">
                        <CheckCircle2 className="w-3 h-3" />
                        Funcionando
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleTest(webhook)}
                    disabled={actionLoading === `test-${webhook.id}`}
                    title="Testar webhook"
                  >
                    {actionLoading === `test-${webhook.id}` ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleViewLogs(webhook)}
                    title="Ver logs"
                  >
                    <History className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditModal(webhook)}
                    title="Editar"
                  >
                    <Settings className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={webhook.is_active ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleToggle(webhook)}
                    disabled={actionLoading === webhook.id}
                    className={webhook.is_active ? 'bg-green-600 hover:bg-green-700' : ''}
                  >
                    {actionLoading === webhook.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : webhook.is_active ? (
                      <Power className="w-4 h-4" />
                    ) : (
                      <PowerOff className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(webhook)}
                    disabled={actionLoading === webhook.id}
                    className="text-red-500 hover:text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl"
            style={{
              backgroundColor: 'hsl(var(--card))',
              borderColor: 'hsl(var(--border))',
            }}
          >
            {/* Modal Header */}
            <div
              className="sticky top-0 z-10 flex items-center justify-between p-4 border-b"
              style={{
                backgroundColor: 'hsl(var(--card))',
                borderColor: 'hsl(var(--border))',
              }}
            >
              <h3 className="text-lg font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                {editingId ? 'Editar Webhook' : 'Novo Webhook'}
              </h3>
              <button
                onClick={() => {
                  setCreateModalOpen(false);
                  resetForm();
                }}
                className="p-2 rounded-lg transition-colors hover:bg-secondary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-6">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                  Nome *
                </label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex: Webhook n8n - Vendas"
                />
              </div>

              {/* URL */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                  URL do Webhook *
                </label>
                <Input
                  value={formData.url}
                  onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
                  placeholder="https://seu-n8n.com/webhook/xxx"
                />
                <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Cole a URL do webhook do n8n, Make, Zapier ou outro serviço de automação
                </p>
              </div>

              {/* Events Selection */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                  Eventos *
                </label>
                <p className="text-xs mb-3" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Selecione os eventos que deseja receber no webhook
                </p>

                {Object.entries((eventsData || STATIC_EVENTS).categories).map(([category, events]) => {
                  const config = CATEGORY_CONFIG[category] || { color: 'text-gray-500', bgColor: 'bg-gray-500/10', label: category };
                  const categoryEventKeys = events.map(e => e.event);
                  const allSelected = categoryEventKeys.every(e => formData.events.includes(e));
                  const someSelected = categoryEventKeys.some(e => formData.events.includes(e));
                  const isExpanded = expandedCategories.includes(category);

                  return (
                    <div
                      key={category}
                      className="border rounded-lg mb-2"
                      style={{ borderColor: 'hsl(var(--border))' }}
                    >
                      {/* Category Header */}
                      <button
                        type="button"
                        className="w-full flex items-center justify-between p-3 hover:bg-secondary/50 transition-colors"
                        onClick={() => toggleCategoryExpand(category)}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-colors ${
                              allSelected
                                ? 'bg-purple-600 border-purple-600'
                                : someSelected
                                  ? 'bg-purple-600/50 border-purple-600'
                                  : ''
                            }`}
                            style={{ borderColor: allSelected || someSelected ? undefined : 'hsl(var(--border))' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleCategory(categoryEventKeys);
                            }}
                          >
                            {(allSelected || someSelected) && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <span className={`text-sm font-medium ${config.color}`}>{config.label}</span>
                          <Badge variant="secondary" className="text-xs">
                            {categoryEventKeys.filter(e => formData.events.includes(e)).length}/{events.length}
                          </Badge>
                        </div>
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>

                      {/* Events List */}
                      {isExpanded && (
                        <div className="px-3 pb-3 space-y-1">
                          {events.map(event => (
                            <button
                              key={event.event}
                              type="button"
                              onClick={() => toggleEvent(event.event)}
                              className={`w-full flex items-start gap-3 p-2 rounded-lg text-left transition-colors ${
                                formData.events.includes(event.event)
                                  ? config.bgColor
                                  : 'hover:bg-secondary/50'
                              }`}
                            >
                              <div
                                className={`w-4 h-4 mt-0.5 rounded flex items-center justify-center border-2 flex-shrink-0 transition-colors ${
                                  formData.events.includes(event.event)
                                    ? 'bg-purple-600 border-purple-600'
                                    : ''
                                }`}
                                style={{ borderColor: formData.events.includes(event.event) ? undefined : 'hsl(var(--border))' }}
                              >
                                {formData.events.includes(event.event) && <Check className="w-2.5 h-2.5 text-white" />}
                              </div>
                              <div>
                                <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>
                                  {event.name}
                                </p>
                                <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                  {event.description}
                                </p>
                                <code className="text-[10px] px-1 py-0.5 rounded bg-secondary mt-1 inline-block">
                                  {event.event}
                                </code>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Channel Filter */}
              {channels.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                    Filtrar por Canais (opcional)
                  </label>
                  <p className="text-xs mb-3" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    Deixe vazio para receber eventos de todos os canais
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {channels.map(channel => (
                      <button
                        key={channel.id}
                        type="button"
                        onClick={() => toggleChannel(channel.id)}
                        className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                          formData.channel_ids?.includes(channel.id)
                            ? 'bg-purple-600 border-purple-600 text-white'
                            : 'hover:bg-secondary'
                        }`}
                        style={{
                          borderColor: formData.channel_ids?.includes(channel.id) ? undefined : 'hsl(var(--border))',
                        }}
                      >
                        {channel.name || channel.type}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom Headers */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                  <FileJson className="w-4 h-4 inline mr-1" />
                  Headers Customizados (opcional)
                </label>
                <p className="text-xs mb-3" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Adicione headers personalizados para autenticação ou identificação
                </p>

                {/* Existing headers */}
                {Object.entries(formData.headers || {}).length > 0 && (
                  <div className="space-y-2 mb-3">
                    {Object.entries(formData.headers || {}).map(([key, value]) => (
                      <div
                        key={key}
                        className="flex items-center gap-2 p-2 rounded-lg"
                        style={{ backgroundColor: 'hsl(var(--secondary))' }}
                      >
                        <code className="text-xs flex-1">{key}: {value}</code>
                        <button
                          type="button"
                          onClick={() => removeHeader(key)}
                          className="text-red-500 hover:text-red-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add header */}
                <div className="flex gap-2">
                  <Input
                    value={headerKey}
                    onChange={(e) => setHeaderKey(e.target.value)}
                    placeholder="Nome do header"
                    className="flex-1"
                  />
                  <Input
                    value={headerValue}
                    onChange={(e) => setHeaderValue(e.target.value)}
                    placeholder="Valor"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addHeader}
                    disabled={!headerKey.trim() || !headerValue.trim()}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Info Box */}
              <div
                className="p-4 rounded-lg border"
                style={{
                  backgroundColor: 'hsl(var(--secondary))',
                  borderColor: 'hsl(var(--border))',
                }}
              >
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2" style={{ color: 'hsl(var(--foreground))' }}>
                  <Key className="w-4 h-4" />
                  Segurança
                </h4>
                <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Um secret único será gerado automaticamente. Use-o para verificar que as requisições
                  vêm do LeadsFlow. O secret será enviado no header <code className="px-1 bg-background rounded">X-Webhook-Secret</code>.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div
              className="sticky bottom-0 flex items-center justify-end gap-2 p-4 border-t"
              style={{
                backgroundColor: 'hsl(var(--card))',
                borderColor: 'hsl(var(--border))',
              }}
            >
              <Button
                variant="outline"
                onClick={() => {
                  setCreateModalOpen(false);
                  resetForm();
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                disabled={actionLoading === 'save'}
                className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white"
              >
                {actionLoading === 'save' ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                {editingId ? 'Salvar' : 'Criar Webhook'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Logs Modal */}
      {logsModalOpen && selectedWebhook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div
            className="w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-2xl shadow-2xl flex flex-col"
            style={{
              backgroundColor: 'hsl(var(--card))',
              borderColor: 'hsl(var(--border))',
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between p-4 border-b"
              style={{ borderColor: 'hsl(var(--border))' }}
            >
              <div>
                <h3 className="text-lg font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                  Logs - {selectedWebhook.name}
                </h3>
                <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Últimos 50 disparos do webhook
                </p>
              </div>
              <div className="flex items-center gap-2">
                {selectedWebhook.secret && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(selectedWebhook.secret!, 'Secret')}
                    className="text-xs"
                  >
                    <Key className="w-3 h-3 mr-1" />
                    Copiar Secret
                  </Button>
                )}
                <button
                  onClick={() => {
                    setLogsModalOpen(false);
                    setSelectedWebhook(null);
                    setLogs([]);
                  }}
                  className="p-2 rounded-lg transition-colors hover:bg-secondary"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Logs List */}
            <div className="flex-1 overflow-y-auto p-4">
              {logsLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : logs.length === 0 ? (
                <div className="text-center py-12" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  <History className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p>Nenhum log encontrado</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {logs.map(log => (
                    <div
                      key={log.id}
                      className="p-3 rounded-lg border"
                      style={{ borderColor: 'hsl(var(--border))' }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={log.error ? 'destructive' : log.response_status && log.response_status < 300 ? 'default' : 'secondary'}
                          >
                            {log.error ? 'Erro' : `HTTP ${log.response_status}`}
                          </Badge>
                          <code className="text-xs px-1.5 py-0.5 rounded bg-secondary">{log.event}</code>
                        </div>
                        <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          {new Date(log.created_at).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      {log.error && (
                        <p className="text-xs text-red-500 mb-2">{log.error}</p>
                      )}
                      <details className="text-xs">
                        <summary className="cursor-pointer" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          Ver payload
                        </summary>
                        <pre
                          className="mt-2 p-2 rounded overflow-x-auto text-[10px]"
                          style={{ backgroundColor: 'hsl(var(--secondary))' }}
                        >
                          {JSON.stringify(log.payload, null, 2)}
                        </pre>
                      </details>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
