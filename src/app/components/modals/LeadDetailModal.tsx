import { useState, useEffect, useCallback } from 'react';
import { X, StickyNote, Calendar, MessageSquare, DollarSign, Plus, Edit2, Trash2, Check, Clock, Send, Upload } from 'lucide-react';
import { leadNotesApi, scheduledConversationsApi, inboxApi, leadsApi } from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';
import AvatarUploadModal from './AvatarUploadModal';
import type { Lead, LeadNote, ScheduledConversation, Message } from '../../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TabKey = 'notas' | 'agendamentos' | 'historico' | 'valor';

interface LeadDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  lead: Lead | null;
  isDark?: boolean;
  initialTab?: TabKey;
  onLeadUpdated?: (updatedLead: Lead) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<string, { label: string; color: string; darkColor: string }> = {
  novo: { label: 'Novo', color: 'bg-blue-100 text-blue-700 border-blue-200', darkColor: 'bg-blue-900/40 text-blue-300 border-blue-700/50' },
  qualificado: { label: 'Qualificado', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', darkColor: 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50' },
  em_negociacao: { label: 'Em Negociacao', color: 'bg-amber-100 text-amber-700 border-amber-200', darkColor: 'bg-amber-900/40 text-amber-300 border-amber-700/50' },
  aguardando_resposta: { label: 'Aguardando', color: 'bg-orange-100 text-orange-700 border-orange-200', darkColor: 'bg-orange-900/40 text-orange-300 border-orange-700/50' },
  convertido: { label: 'Convertido', color: 'bg-green-100 text-green-700 border-green-200', darkColor: 'bg-green-900/40 text-green-300 border-green-700/50' },
  perdido: { label: 'Perdido', color: 'bg-red-100 text-red-700 border-red-200', darkColor: 'bg-red-900/40 text-red-300 border-red-700/50' },
};

const PIPELINE_STAGES = ['novo', 'qualificado', 'em_negociacao', 'aguardando_resposta', 'convertido'];

function getStatusConfig(status: string, isDark: boolean) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.novo;
  return { label: cfg.label, className: isDark ? cfg.darkColor : cfg.color };
}

// Currency support - default to USD
type CurrencyCode = 'USD' | 'MZN' | 'BRL';

const CURRENCY_CONFIG: Record<CurrencyCode, { locale: string; symbol: string }> = {
  USD: { locale: 'en-US', symbol: '$' },
  MZN: { locale: 'pt-MZ', symbol: 'MT' },
  BRL: { locale: 'pt-BR', symbol: 'R$' },
};

function formatCurrency(value: number | undefined | null, currency: CurrencyCode = 'USD'): string {
  const numValue = typeof value === 'number' && !isNaN(value) ? value : 0;
  const config = CURRENCY_CONFIG[currency];

  try {
    return new Intl.NumberFormat(config.locale, {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numValue);
  } catch {
    if (currency === 'MZN') {
      return `${config.symbol} ${numValue.toLocaleString(config.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `${config.symbol} ${numValue.toFixed(2)}`;
  }
}

function formatDate(dateString: string): string {
  try {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
}

function formatRelativeDate(dateString: string): string {
  try {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) return 'Agora';
    if (diffMinutes < 60) return `${diffMinutes}min atras`;
    if (diffHours < 24) return `${diffHours}h atras`;
    if (diffDays < 7) return `${diffDays}d atras`;
    return formatDate(dateString);
  } catch {
    return dateString;
  }
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '?';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Spinner({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <div
      className={`${className} border-2 border-current border-t-transparent rounded-full animate-spin`}
    />
  );
}

function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
      <Icon className="w-10 h-10 opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Notas
// ---------------------------------------------------------------------------

function NotasTab({ lead, isDark }: { lead: Lead; isDark: boolean }) {
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [newContent, setNewContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchNotes = useCallback(async () => {
    if (!lead.id) return;
    setLoading(true);
    try {
      const data = await leadNotesApi.getAll(lead.id);
      setNotes(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('[LeadDetail] Error fetching notes:', err);
      toast.error('Erro ao carregar notas');
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [lead.id]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const handleCreate = async () => {
    if (!newContent.trim() || !lead.id) return;
    setSubmitting(true);
    try {
      const created = await leadNotesApi.create(lead.id, newContent.trim());
      setNotes((prev) => [created, ...prev]);
      setNewContent('');
      toast.success('Nota adicionada');
    } catch (err) {
      console.error('[LeadDetail] Error creating note:', err);
      toast.error('Erro ao adicionar nota');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (noteId: string) => {
    if (!editContent.trim()) return;
    try {
      const updated = await leadNotesApi.update(noteId, editContent.trim());
      setNotes((prev) => prev.map((n) => (n.id === noteId ? updated : n)));
      setEditingId(null);
      setEditContent('');
      toast.success('Nota atualizada');
    } catch (err) {
      console.error('[LeadDetail] Error updating note:', err);
      toast.error('Erro ao atualizar nota');
    }
  };

  const handleDelete = async (noteId: string) => {
    try {
      await leadNotesApi.delete(noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      setDeletingId(null);
      toast.success('Nota removida');
    } catch (err) {
      console.error('[LeadDetail] Error deleting note:', err);
      toast.error('Erro ao remover nota');
    }
  };

  const startEdit = (note: LeadNote) => {
    setEditingId(note.id);
    setEditContent(note.content);
    setDeletingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditContent('');
  };

  return (
    <div className="flex flex-col gap-4">
      {/* New note form */}
      <div className="flex flex-col gap-2">
        <textarea
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder="Escreva uma nota..."
          rows={3}
          className={`w-full px-3 py-2 rounded-lg border text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${isDark
            ? 'bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-500'
            : 'bg-white border-gray-200 text-gray-900 placeholder:text-gray-400'
            }`}
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={submitting || !newContent.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {submitting ? <Spinner /> : <Plus className="w-4 h-4" />}
            Adicionar nota
          </Button>
        </div>
      </div>

      {/* Notes list */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Spinner className="w-6 h-6 text-blue-500" />
        </div>
      ) : notes.length === 0 ? (
        <EmptyState icon={StickyNote} message="Nenhuma nota encontrada" />
      ) : (
        <div className="flex flex-col gap-3">
          {notes.map((note) => (
            <div
              key={note.id}
              className={`rounded-lg border p-3 transition-colors ${isDark
                ? 'bg-gray-800/60 border-gray-700 hover:border-gray-600'
                : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                }`}
            >
              {editingId === note.id ? (
                /* Inline edit mode */
                <div className="flex flex-col gap-2">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={3}
                    className={`w-full px-3 py-2 rounded-lg border text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${isDark
                      ? 'bg-gray-900 border-gray-600 text-gray-100'
                      : 'bg-white border-gray-300 text-gray-900'
                      }`}
                    autoFocus
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={cancelEdit}>
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleUpdate(note.id)}
                      disabled={!editContent.trim()}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Salvar
                    </Button>
                  </div>
                </div>
              ) : deletingId === note.id ? (
                /* Delete confirmation */
                <div className="flex flex-col gap-2">
                  <p className={`text-sm ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                    Tem certeza que deseja excluir esta nota?
                  </p>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setDeletingId(null)}>
                      Cancelar
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(note.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Excluir
                    </Button>
                  </div>
                </div>
              ) : (
                /* Display mode */
                <>
                  <p className={`text-sm whitespace-pre-wrap break-words ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                    {note.content}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                      {formatRelativeDate(note.created_at)}
                      {note.updated_at && note.updated_at !== note.created_at && ' (editada)'}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => startEdit(note)}
                        className={`p-1.5 rounded-md transition-colors ${isDark ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200' : 'hover:bg-gray-200 text-gray-400 hover:text-gray-600'
                          }`}
                        title="Editar nota"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => { setDeletingId(note.id); setEditingId(null); }}
                        className={`p-1.5 rounded-md transition-colors ${isDark ? 'hover:bg-red-900/40 text-gray-400 hover:text-red-400' : 'hover:bg-red-50 text-gray-400 hover:text-red-500'
                          }`}
                        title="Excluir nota"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Agendamentos
// ---------------------------------------------------------------------------

function AgendamentosTab({ lead, isDark }: { lead: Lead; isDark: boolean }) {
  const [conversations, setConversations] = useState<ScheduledConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDate, setFormDate] = useState('');

  const fetchConversations = useCallback(async () => {
    if (!lead.id) return;
    setLoading(true);
    try {
      const data = await scheduledConversationsApi.getAll({ lead_id: lead.id });
      setConversations(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('[LeadDetail] Error fetching scheduled conversations:', err);
      toast.error('Erro ao carregar agendamentos');
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, [lead.id]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const handleCreate = async () => {
    if (!formTitle.trim() || !formDate || !lead.id) return;
    setSubmitting(true);
    try {
      const created = await scheduledConversationsApi.create({
        lead_id: lead.id,
        title: formTitle.trim(),
        description: formDescription.trim() || undefined,
        scheduled_at: new Date(formDate).toISOString(),
      });
      setConversations((prev) => [created, ...prev]);
      setFormTitle('');
      setFormDescription('');
      setFormDate('');
      setShowForm(false);
      toast.success('Agendamento criado');
    } catch (err) {
      console.error('[LeadDetail] Error creating scheduled conversation:', err);
      toast.error('Erro ao criar agendamento');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (id: string, newStatus: 'completed' | 'cancelled') => {
    try {
      const updated = await scheduledConversationsApi.update(id, { status: newStatus });
      setConversations((prev) => prev.map((c) => (c.id === id ? updated : c)));
      toast.success(newStatus === 'completed' ? 'Marcado como concluido' : 'Agendamento cancelado');
    } catch (err) {
      console.error('[LeadDetail] Error updating scheduled conversation:', err);
      toast.error('Erro ao atualizar agendamento');
    }
  };

  const scheduledStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${isDark ? 'bg-green-900/40 text-green-300' : 'bg-green-100 text-green-700'
            }`}>
            <Check className="w-3 h-3" /> Concluido
          </span>
        );
      case 'cancelled':
        return (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${isDark ? 'bg-red-900/40 text-red-300' : 'bg-red-100 text-red-700'
            }`}>
            <X className="w-3 h-3" /> Cancelado
          </span>
        );
      default:
        return (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${isDark ? 'bg-amber-900/40 text-amber-300' : 'bg-amber-100 text-amber-700'
            }`}>
            <Clock className="w-3 h-3" /> Pendente
          </span>
        );
    }
  };

  const inputClasses = `w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${isDark
    ? 'bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-500'
    : 'bg-white border-gray-200 text-gray-900 placeholder:text-gray-400'
    }`;

  return (
    <div className="flex flex-col gap-4">
      {/* Toggle new form */}
      {!showForm ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowForm(true)}
          className="self-start"
        >
          <Plus className="w-4 h-4" />
          Novo agendamento
        </Button>
      ) : (
        <div className="rounded-lg border p-4 flex flex-col gap-3 bg-muted border-border">
          <input
            type="text"
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            placeholder="Titulo do agendamento"
            className={inputClasses}
          />
          <textarea
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
            placeholder="Descricao (opcional)"
            rows={2}
            className={`${inputClasses} resize-none`}
          />
          <input
            type="datetime-local"
            value={formDate}
            onChange={(e) => setFormDate(e.target.value)}
            className={inputClasses}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowForm(false);
                setFormTitle('');
                setFormDescription('');
                setFormDate('');
              }}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={submitting || !formTitle.trim() || !formDate}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {submitting ? <Spinner /> : <Calendar className="w-4 h-4" />}
              Agendar
            </Button>
          </div>
        </div>
      )}

      {/* Conversations list */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Spinner className="w-6 h-6 text-blue-500" />
        </div>
      ) : conversations.length === 0 ? (
        <EmptyState icon={Calendar} message="Nenhum agendamento encontrado" />
      ) : (
        <div className="flex flex-col gap-3">
          {conversations.map((conv) => {
            const isPending = conv.status === 'pending';
            return (
              <div
                key={conv.id}
                className={`rounded-lg border p-3 transition-colors ${isDark
                  ? 'bg-gray-800/60 border-gray-700 hover:border-gray-600'
                  : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                  } ${!isPending ? 'opacity-70' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h4 className={`text-sm font-medium truncate ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                      {conv.title}
                    </h4>
                    {conv.description && (
                      <p className={`text-xs mt-1 line-clamp-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        {conv.description}
                      </p>
                    )}
                  </div>
                  {scheduledStatusBadge(conv.status)}
                </div>

                <div className="flex items-center justify-between mt-3">
                  <span className={`text-xs flex items-center gap-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                    <Clock className="w-3 h-3" />
                    {formatDate(conv.scheduled_at)}
                  </span>

                  {isPending && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleStatusChange(conv.id, 'completed')}
                        className={`p-1.5 rounded-md text-xs transition-colors ${isDark
                          ? 'hover:bg-green-900/40 text-gray-400 hover:text-green-400'
                          : 'hover:bg-green-50 text-gray-400 hover:text-green-600'
                          }`}
                        title="Marcar como concluido"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleStatusChange(conv.id, 'cancelled')}
                        className={`p-1.5 rounded-md text-xs transition-colors ${isDark
                          ? 'hover:bg-red-900/40 text-gray-400 hover:text-red-400'
                          : 'hover:bg-red-50 text-gray-400 hover:text-red-500'
                          }`}
                        title="Cancelar agendamento"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Historico
// ---------------------------------------------------------------------------

function HistoricoTab({ lead, isDark }: { lead: Lead; isDark: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMessages = useCallback(async () => {
    if (!lead.id) return;
    setLoading(true);
    try {
      const data = await inboxApi.getMessages(lead.id);
      setMessages(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('[LeadDetail] Error fetching messages:', err);
      toast.error('Erro ao carregar historico');
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [lead.id]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const channelLabel = (channel: string) => {
    switch (channel?.toLowerCase()) {
      case 'whatsapp': return 'WhatsApp';
      case 'email': return 'Email';
      case 'sms': return 'SMS';
      case 'twilio_sms': return 'SMS';
      case 'twilio': return 'SMS';
      case 'instagram': return 'Instagram';
      case 'facebook': return 'Facebook';
      default: return channel || 'Desconhecido';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Spinner className="w-6 h-6 text-blue-500" />
      </div>
    );
  }

  if (messages.length === 0) {
    return <EmptyState icon={MessageSquare} message="Nenhuma mensagem encontrada" />;
  }

  return (
    <div className="flex flex-col gap-2">
      {messages.map((msg) => {
        const isOut = msg.direction === 'out';
        return (
          <div key={msg.id} className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-xl px-3.5 py-2.5 ${isOut
                ? isDark
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-blue-500 text-white rounded-br-sm'
                : isDark
                  ? 'bg-gray-700 text-gray-100 rounded-bl-sm'
                  : 'bg-gray-200 text-gray-900 rounded-bl-sm'
                }`}
            >
              <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
              <div
                className={`flex items-center gap-2 mt-1.5 text-[11px] ${isOut
                  ? 'text-blue-100 justify-end'
                  : isDark
                    ? 'text-gray-400'
                    : 'text-gray-500'
                  }`}
              >
                <span>{channelLabel(msg.channel)}</span>
                <span>&#183;</span>
                <span>{formatRelativeDate(msg.created_at)}</span>
                {isOut && (
                  <>
                    <span>&#183;</span>
                    <Send className="w-3 h-3" />
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Valor
// ---------------------------------------------------------------------------

function ValorTab({ lead, isDark, onLeadUpdated }: { lead: Lead; isDark: boolean; onLeadUpdated: (updated: Lead) => void }) {
  const currentValue = lead.deal_value ?? lead.valor ?? 0;
  const [dealValue, setDealValue] = useState<string>(String(currentValue || ''));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const val = lead.deal_value ?? lead.valor ?? 0;
    setDealValue(String(val || ''));
  }, [lead.deal_value, lead.valor]);

  const handleSave = async () => {
    if (!lead.id) return;
    setSaving(true);
    try {
      const numericValue = parseFloat(dealValue) || 0;
      const result = await leadsApi.update(lead.id, {
        ...lead,
        deal_value: numericValue,
        valor: numericValue,
      });
      if (result?.lead) {
        onLeadUpdated(result.lead);
      }
      toast.success('Valor atualizado');
    } catch (err) {
      console.error('[LeadDetail] Error updating deal value:', err);
      toast.error('Erro ao atualizar valor');
    } finally {
      setSaving(false);
    }
  };

  const parsedValue = parseFloat(dealValue) || 0;
  const statusCfg = getStatusConfig(lead.status, isDark);
  const currentStageIndex = PIPELINE_STAGES.indexOf(lead.status);

  return (
    <div className="flex flex-col gap-6">
      {/* Deal value card */}
      <div className="rounded-xl border p-5 text-center bg-muted border-border">
        <p className={`text-xs uppercase tracking-wider font-medium mb-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          Valor do negocio
        </p>
        <p className={`text-3xl font-bold ${parsedValue > 0 ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : (isDark ? 'text-gray-500' : 'text-gray-400')}`}>
          {formatCurrency(parsedValue)}
        </p>
      </div>

      {/* Update form */}
      <div className="flex flex-col gap-3">
        <label className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
          Atualizar valor
        </label>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              $
            </span>
            <input
              type="number"
              value={dealValue}
              onChange={(e) => setDealValue(e.target.value)}
              min="0"
              step="0.01"
              placeholder="0,00"
              className={`w-full pl-9 pr-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${isDark
                ? 'bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-500'
                : 'bg-white border-gray-200 text-gray-900 placeholder:text-gray-400'
                }`}
            />
          </div>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {saving ? <Spinner /> : <DollarSign className="w-4 h-4" />}
            Salvar
          </Button>
        </div>
      </div>

      {/* Status pipeline visual */}
      <div className="flex flex-col gap-3">
        <label className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
          Pipeline de status
        </label>
        <div className="rounded-xl border p-4 bg-muted border-border">
          {/* Current status */}
          <div className="flex items-center gap-2 mb-4">
            <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Status atual:</span>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusCfg.className}`}>
              {statusCfg.label}
            </span>
          </div>

          {/* Pipeline steps */}
          <div className="flex items-center gap-1">
            {PIPELINE_STAGES.map((stage, idx) => {
              const stageCfg = getStatusConfig(stage, isDark);
              const isActive = idx <= currentStageIndex && currentStageIndex >= 0;
              const isCurrent = stage === lead.status;

              return (
                <div key={stage} className="flex items-center flex-1 min-w-0">
                  <div className="flex flex-col items-center w-full gap-1">
                    {/* Bar */}
                    <div
                      className={`h-2 w-full rounded-full transition-colors ${isActive
                        ? isCurrent
                          ? 'bg-blue-500'
                          : isDark
                            ? 'bg-blue-700'
                            : 'bg-blue-300'
                        : isDark
                          ? 'bg-gray-700'
                          : 'bg-gray-200'
                        }`}
                    />
                    {/* Label */}
                    <span
                      className={`text-[10px] leading-tight text-center truncate w-full ${isCurrent
                        ? isDark ? 'text-blue-400 font-semibold' : 'text-blue-600 font-semibold'
                        : isDark ? 'text-gray-500' : 'text-gray-400'
                        }`}
                    >
                      {stageCfg.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Lead info summary */}
      <div className="rounded-xl border p-4 bg-muted border-border">
        <p className={`text-xs uppercase tracking-wider font-medium mb-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          Informacoes do lead
        </p>
        <div className="grid grid-cols-2 gap-3">
          {lead.empresa && (
            <div>
              <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Empresa</p>
              <p className={`text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{lead.empresa}</p>
            </div>
          )}
          {lead.email && (
            <div>
              <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Email</p>
              <p className={`text-sm font-medium truncate ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{lead.email}</p>
            </div>
          )}
          {lead.telefone && (
            <div>
              <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Telefone</p>
              <p className={`text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{lead.telefone}</p>
            </div>
          )}
          {lead.createdAt && (
            <div>
              <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Criado em</p>
              <p className={`text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{formatDate(lead.createdAt)}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Modal
// ---------------------------------------------------------------------------

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'notas', label: 'Notas', icon: StickyNote },
  { key: 'agendamentos', label: 'Agendamentos', icon: Calendar },
  { key: 'historico', label: 'Historico', icon: MessageSquare },
  { key: 'valor', label: 'Valor', icon: DollarSign },
];

export default function LeadDetailModal({ isOpen, onClose, lead, isDark = false, initialTab = 'notas', onLeadUpdated }: LeadDetailModalProps) {
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [currentLead, setCurrentLead] = useState<Lead | null>(lead);
  const [tabBadges, setTabBadges] = useState<Record<TabKey, number>>({
    notas: 0,
    agendamentos: 0,
    historico: 0,
    valor: 0,
  });
  const [showAvatarUpload, setShowAvatarUpload] = useState(false);

  // Sync currentLead with prop
  useEffect(() => {
    setCurrentLead(lead);
  }, [lead]);

  // Fetch badge counts when modal opens
  useEffect(() => {
    if (!isOpen || !currentLead?.id) return;

    const fetchBadges = async () => {
      try {
        const [notes, schedules, messages] = await Promise.all([
          leadNotesApi.getAll(currentLead.id).catch(() => []),
          scheduledConversationsApi.getAll({ lead_id: currentLead.id }).catch(() => []),
          inboxApi.getMessages(currentLead.id).catch(() => []),
        ]);

        setTabBadges({
          notas: Array.isArray(notes) ? notes.length : 0,
          agendamentos: Array.isArray(schedules) ? schedules.filter((s: any) => s.status === 'pending').length : 0,
          historico: Array.isArray(messages) ? messages.filter((m: any) => m.direction === 'in' && !m.read).length : 0,
          valor: 0,
        });
      } catch (error) {
        console.error('[LeadDetailModal] Error fetching badges:', error);
      }
    };

    fetchBadges();
  }, [isOpen, currentLead?.id]);

  // Set initial tab when opening
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, lead?.id, initialTab]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleLeadUpdated = useCallback((updated: Lead) => {
    setCurrentLead(updated);
    // Notify parent component so it can update its leads state
    onLeadUpdated?.(updated);
  }, [onLeadUpdated]);

  if (!isOpen || !currentLead) return null;

  const displayLead = currentLead;
  const statusCfg = getStatusConfig(displayLead.status, isDark);
  const dealValue = displayLead.deal_value ?? displayLead.valor ?? 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Centered compact modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="w-full max-w-md rounded-2xl shadow-2xl transition-transform duration-300 ease-out flex flex-col max-h-[90vh] bg-card text-foreground"
          role="dialog"
          aria-modal="true"
          aria-label={`Detalhes do lead ${displayLead.nome}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* ===== Header ===== */}
          <div className={`flex-shrink-0 border-b ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
            {/* Lead identity card - Compact */}
            <div className="p-4 flex items-center gap-3">
              {/* Avatar clicável com overlay de upload */}
              <div
                className="relative group cursor-pointer"
                onClick={() => setShowAvatarUpload(true)}
                title="Clique para alterar avatar"
              >
                <Avatar className="w-10 h-10">
                  {displayLead.avatarUrl ? (
                    <AvatarImage src={displayLead.avatarUrl} alt={displayLead.nome} />
                  ) : null}
                  <AvatarFallback className="bg-muted text-muted-foreground text-xs font-medium">
                    {getInitials(displayLead.nome)}
                  </AvatarFallback>
                </Avatar>
                {/* Overlay de upload no hover */}
                <div className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Upload className="w-4 h-4 text-white" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className={`text-sm font-semibold truncate ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                  {displayLead.nome}
                </h3>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {displayLead.empresa && (
                    <span className={`text-xs truncate ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      {displayLead.empresa}
                    </span>
                  )}
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${statusCfg.className}`}>
                    {statusCfg.label}
                  </span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-muted text-muted-foreground hover:text-foreground"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tab bar - Compact */}
            <div className={`flex px-4 gap-1 ${isDark ? 'border-gray-800' : ''}`}>
              {TABS.map((tab) => {
                const isActive = activeTab === tab.key;
                const Icon = tab.icon;
                const badgeCount = tabBadges[tab.key] || 0;

                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg transition-colors relative ${isActive
                      ? isDark
                        ? 'text-blue-400'
                        : 'text-blue-600'
                      : isDark
                        ? 'text-gray-500 hover:text-gray-300'
                        : 'text-gray-500 hover:text-gray-700'
                      }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>

                    {/* Badge de notificação */}
                    {badgeCount > 0 && (
                      <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold text-white bg-red-500 rounded-full shadow-lg">
                        {badgeCount > 9 ? '9+' : badgeCount}
                      </span>
                    )}

                    {isActive && (
                      <span className={`absolute bottom-0 left-0 right-0 h-0.5 rounded-full ${isDark ? 'bg-blue-400' : 'bg-blue-600'}`} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ===== Content ===== */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {activeTab === 'notas' && <NotasTab lead={displayLead} isDark={isDark} />}
            {activeTab === 'agendamentos' && <AgendamentosTab lead={displayLead} isDark={isDark} />}
            {activeTab === 'historico' && <HistoricoTab lead={displayLead} isDark={isDark} />}
            {activeTab === 'valor' && <ValorTab lead={displayLead} isDark={isDark} onLeadUpdated={handleLeadUpdated} />}
          </div>
        </div>
      </div>

      {/* Modal de upload de avatar */}
      <AvatarUploadModal
        isOpen={showAvatarUpload}
        onClose={() => setShowAvatarUpload(false)}
        leadId={displayLead.id}
        currentAvatarUrl={displayLead.avatarUrl}
        onAvatarUpdated={(newUrl) => {
          handleLeadUpdated({ ...displayLead, avatarUrl: newUrl });
        }}
        isDark={isDark}
      />
    </>
  );
}
