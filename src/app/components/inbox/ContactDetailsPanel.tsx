import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, Mail, Phone, Building2, Calendar, FileText, User, Loader2, AlertCircle, Edit2, Save, Camera, Check, Upload, StickyNote, ChevronDown, Clock, MessageSquare, Briefcase, ListTodo } from 'lucide-react';
import { leadsApi, scheduledConversationsApi, leadNotesApi } from '../../utils/api';
import { Lead } from '../../types';
import { toast } from 'sonner';

interface Conversation {
  id: string;
  lead_id?: string;
  contact: {
    id: string;
    name: string;
    phone?: string;
    email?: string;
    avatar_url?: string;
    avatar?: string;
    status?: string;
    leadId?: string;
    source?: string;
    company?: string;
  };
  metadata?: {
    jid?: string;
    leadId?: string;
  };
}

interface ContactDetailsPanelProps {
  conversation: Conversation;
  onClose: () => void;
  isEditingExternal?: boolean;
  onEditingChange?: (editing: boolean) => void;
}

// Default funnel stages (fallback)
const DEFAULT_STATUS_OPTIONS = [
  { value: 'novo', label: 'Novo', color: 'bg-cyan-500' },
  { value: 'contatado', label: 'Contatado', color: 'bg-purple-500' },
  { value: 'qualificado', label: 'Qualificado', color: 'bg-yellow-500' },
  { value: 'negociacao', label: 'Negociação', color: 'bg-orange-500' },
  { value: 'convertido', label: 'Convertido', color: 'bg-green-500' },
  { value: 'perdido', label: 'Perdido', color: 'bg-red-500' },
];

// Load funnel stages from localStorage (synced with SalesFunnel)
const loadStatusOptions = () => {
  try {
    const saved = localStorage.getItem('funnelStages');
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.map((stage: any) => ({
        value: stage.id,
        label: stage.label,
        color: stage.color || 'bg-gray-500',
      }));
    }
  } catch (e) {
    console.error('Error loading funnel stages:', e);
  }
  return DEFAULT_STATUS_OPTIONS;
};

export function ContactDetailsPanel({ conversation, onClose, isEditingExternal, onEditingChange }: ContactDetailsPanelProps) {
  const contact = conversation.contact;
  const leadId = conversation.lead_id || conversation.metadata?.leadId || contact.leadId || contact.id;
  
  const [leadDetails, setLeadDetails] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle external editing trigger
  useEffect(() => {
    if (isEditingExternal) {
      setIsEditing(true);
      onEditingChange?.(false); // Reset external trigger
    }
  }, [isEditingExternal, onEditingChange]);
  
  // Action menu state
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [activeAction, setActiveAction] = useState<'task' | 'schedule' | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDate, setTaskDate] = useState('');
  const [scheduleTitle, setScheduleTitle] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);
  
  // Schedules and tasks list
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  
  // Edit form state
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [editPosition, setEditPosition] = useState('');
  const [editStatus, setEditStatus] = useState('novo');
  const [editNotes, setEditNotes] = useState('');
  const [editValue, setEditValue] = useState('');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');

  // Fetch lead data
  useEffect(() => {
    const fetchLeadData = async () => {
      if (!leadId) return;
      
      setLoading(true);
      setError(null);
      
      try {
        const lead = await leadsApi.getById(leadId);
        setLeadDetails(lead);
        
        // Initialize edit form with lead data (API returns snake_case)
        const leadAny = lead as any;
        setEditName(leadAny?.name || lead?.nome || contact.name || '');
        setEditPhone(leadAny?.phone || lead?.telefone || contact.phone || '');
        setEditEmail(leadAny?.email || lead?.email || contact.email || '');
        setEditCompany(leadAny?.company || lead?.empresa || contact.company || '');
        setEditPosition(leadAny?.position || leadAny?.cargo || '');
        setEditStatus(leadAny?.status || lead?.status || contact.status || 'novo');
        setEditNotes(leadAny?.notes || lead?.observacao || lead?.observacoes || '');
        setEditValue(leadAny?.deal_value?.toString() || lead?.valor?.toString() || '');
        setEditAvatarUrl(leadAny?.avatar_url || lead?.avatarUrl || contact.avatar_url || contact.avatar || '');
      } catch (err) {
        console.error('Error fetching lead details:', err);
        // Use contact data as fallback
        setEditName(contact.name || '');
        setEditPhone(contact.phone || '');
        setEditEmail(contact.email || '');
        setEditCompany(contact.company || '');
        setEditPosition('');
        setEditStatus(contact.status || 'novo');
        setEditAvatarUrl(contact.avatar_url || contact.avatar || '');
      } finally {
        setLoading(false);
      }
    };

    fetchLeadData();
  }, [leadId, contact]);

  // Fetch schedules/tasks
  const fetchSchedules = useCallback(async () => {
    if (!leadId) return;
    setLoadingSchedules(true);
    try {
      const data = await scheduledConversationsApi.getAll({ lead_id: leadId });
      setSchedules(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching schedules:', err);
      setSchedules([]);
    } finally {
      setLoadingSchedules(false);
    }
  }, [leadId]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Por favor, selecione uma imagem válida');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('A imagem deve ter no máximo 5MB');
      return;
    }

    setUploadingAvatar(true);
    setError(null);

    try {
      // Upload to Minio via inbox API
      const { inboxApi } = await import('../../services/api/inbox');
      const uploadResult = await inboxApi.uploadFile(file);
      
      // Set the uploaded URL
      setAvatarPreview(uploadResult.url);
      setEditAvatarUrl(uploadResult.url);
      console.log('[ContactDetailsPanel] Avatar uploaded:', uploadResult.url);

    } catch (err) {
      console.error('Error uploading avatar:', err);
      setError('Erro ao carregar imagem');
      
      // Fallback to data URL if upload fails
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setAvatarPreview(result);
        setEditAvatarUrl(result);
      };
      reader.readAsDataURL(file);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    if (!leadId) return;
    
    setSaving(true);
    try {
      const updateData = {
        name: editName,
        phone: editPhone,
        email: editEmail || undefined,
        company: editCompany || undefined,
        position: editPosition || undefined,
        status: editStatus,
        notes: editNotes || undefined,
        deal_value: editValue ? parseFloat(editValue) : undefined,
        avatar_url: editAvatarUrl || undefined,
      };
      
      await leadsApi.update(leadId, updateData);
      
      // Update local state
      setLeadDetails((prev: any) => ({
        ...prev,
        ...updateData,
      }));
      
      setAvatarPreview(null);
      setIsEditing(false);
      toast.success('Lead atualizado com sucesso!');
    } catch (err) {
      console.error('Error saving lead:', err);
      setError('Erro ao salvar alterações');
      toast.error('Erro ao salvar alterações');
    } finally {
      setSaving(false);
    }
  };

  // Criar tarefa
  const handleCreateTask = async () => {
    if (!leadId || !taskTitle.trim() || !taskDate) return;
    setSubmittingAction(true);
    try {
      await scheduledConversationsApi.create({
        lead_id: leadId,
        title: `📋 ${taskTitle.trim()}`,
        description: 'Tarefa',
        scheduled_at: new Date(taskDate).toISOString(),
      });
      toast.success('Tarefa criada com sucesso!');
      setTaskTitle('');
      setTaskDate('');
      setActiveAction(null);
      fetchSchedules(); // Refresh list
    } catch (err) {
      console.error('Error creating task:', err);
      toast.error('Erro ao criar tarefa');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Criar agendamento
  const handleCreateSchedule = async () => {
    if (!leadId || !scheduleTitle.trim() || !scheduleDate) return;
    setSubmittingAction(true);
    try {
      await scheduledConversationsApi.create({
        lead_id: leadId,
        title: scheduleTitle.trim(),
        scheduled_at: new Date(scheduleDate).toISOString(),
      });
      toast.success('Agendamento criado com sucesso!');
      setScheduleTitle('');
      setScheduleDate('');
      setActiveAction(null);
      fetchSchedules(); // Refresh list
    } catch (err) {
      console.error('Error creating schedule:', err);
      toast.error('Erro ao criar agendamento');
    } finally {
      setSubmittingAction(false);
    }
  };

  const displayAvatar = avatarPreview || editAvatarUrl || leadDetails?.avatar_url || leadDetails?.avatarUrl || contact.avatar_url || contact.avatar;

  // Load status options from funnel configuration
  const statusOptions = useMemo(() => loadStatusOptions(), []);

  const getStatusColor = (status: string) => {
    const option = statusOptions.find(s => s.value === status);
    return option?.color || 'bg-gray-500';
  };

  const formatStatus = (status: string) => {
    const option = statusOptions.find(s => s.value === status);
    return option?.label || status;
  };

  const formatDate = (dateStr: string | undefined | null) => {
    if (!dateStr) return null;
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return null;
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch {
      return null;
    }
  };

  const createdAt = leadDetails?.created_at || leadDetails?.createdAt || leadDetails?.data;

  return (
    <div 
      className="w-full h-full flex flex-col border-l overflow-hidden"
      style={{
        backgroundColor: 'hsl(var(--card))',
        borderColor: 'hsl(var(--border))'
      }}
    >
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleAvatarChange}
        accept="image/*"
        className="hidden"
      />

      {/* Header */}
      <div 
        className="flex-shrink-0 p-3 border-b flex items-center justify-between"
        style={{ borderColor: 'hsl(var(--border))' }}
      >
        <h3 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
          {isEditing ? 'Editar Contacto' : 'Detalhes do Lead'}
        </h3>
        <div className="flex items-center gap-1">
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="p-1.5 rounded-lg transition-colors hover:bg-[hsl(var(--muted))]"
              style={{ color: 'hsl(var(--primary))' }}
              title="Editar"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving}
              className="p-1.5 rounded-lg transition-colors hover:bg-green-500/20 text-green-500"
              title="Salvar"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            </button>
          )}
          <button
            onClick={() => {
              if (isEditing) {
                setIsEditing(false);
                setAvatarPreview(null);
              } else {
                onClose();
              }
            }}
            className="p-1.5 rounded-lg hover:bg-[hsl(var(--muted))] transition-colors"
            style={{ color: 'hsl(var(--muted-foreground))' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 pb-8 space-y-4 custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'hsl(var(--primary))' }} />
          </div>
        ) : error && !leadDetails ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <AlertCircle className="w-8 h-8 text-red-400 mb-2" />
            <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>{error}</p>
          </div>
        ) : isEditing ? (
          /* EDIT MODE */
          <div className="space-y-4">
            {/* Avatar with upload */}
            <div className="flex flex-col items-center">
              <div className="relative group cursor-pointer" onClick={handleAvatarClick}>
                {displayAvatar ? (
                  <img
                    src={displayAvatar}
                    alt={editName}
                    className="w-20 h-20 rounded-full object-cover transition-opacity group-hover:opacity-70"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center transition-opacity group-hover:opacity-70">
                    <span className="text-white text-2xl font-semibold">
                      {editName?.charAt(0)?.toUpperCase() || '?'}
                    </span>
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                  {uploadingAvatar ? (
                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                  ) : (
                    <Camera className="w-6 h-6 text-white" />
                  )}
                </div>
              </div>
              <p className="text-xs mt-2" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Clique para alterar a foto
              </p>
            </div>

            {/* Status Selector */}
            <div>
              <label className="text-xs font-medium mb-2 block" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Status
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {statusOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setEditStatus(option.value)}
                    className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                      editStatus === option.value
                        ? `${option.color} text-white border-transparent`
                        : 'border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]'
                    }`}
                    style={editStatus !== option.value ? { color: 'hsl(var(--foreground))' } : {}}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Nome
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm border outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
                style={{
                  backgroundColor: 'hsl(var(--muted))',
                  borderColor: 'hsl(var(--border))',
                  color: 'hsl(var(--foreground))'
                }}
                placeholder="Nome do lead"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Telefone
              </label>
              <input
                type="tel"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm border outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
                style={{
                  backgroundColor: 'hsl(var(--muted))',
                  borderColor: 'hsl(var(--border))',
                  color: 'hsl(var(--foreground))'
                }}
                placeholder="+55 00 00000-0000"
              />
            </div>

            {/* Email */}
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Email
              </label>
              <input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm border outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
                style={{
                  backgroundColor: 'hsl(var(--muted))',
                  borderColor: 'hsl(var(--border))',
                  color: 'hsl(var(--foreground))'
                }}
                placeholder="email@exemplo.com"
              />
            </div>

            {/* Company */}
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Empresa
              </label>
              <input
                type="text"
                value={editCompany}
                onChange={(e) => setEditCompany(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm border outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
                style={{
                  backgroundColor: 'hsl(var(--muted))',
                  borderColor: 'hsl(var(--border))',
                  color: 'hsl(var(--foreground))'
                }}
                placeholder="Nome da empresa"
              />
            </div>

            {/* Position/Cargo */}
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Cargo
              </label>
              <input
                type="text"
                value={editPosition}
                onChange={(e) => setEditPosition(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm border outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
                style={{
                  backgroundColor: 'hsl(var(--muted))',
                  borderColor: 'hsl(var(--border))',
                  color: 'hsl(var(--foreground))'
                }}
                placeholder="Ex: Gerente, Diretor, CEO..."
              />
            </div>

            {/* Value */}
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Valor do Negócio
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>R$</span>
                <input
                  type="number"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 rounded-lg text-sm border outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
                  style={{
                    backgroundColor: 'hsl(var(--muted))',
                    borderColor: 'hsl(var(--border))',
                    color: 'hsl(var(--foreground))'
                  }}
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Observações
              </label>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-lg text-sm border outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 resize-none"
                style={{
                  backgroundColor: 'hsl(var(--muted))',
                  borderColor: 'hsl(var(--border))',
                  color: 'hsl(var(--foreground))'
                }}
                placeholder="Adicione observações sobre o lead..."
              />
            </div>

            {/* Error message */}
            {error && (
              <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                <p className="text-xs text-red-500">{error}</p>
              </div>
            )}

            {/* Save Button */}
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
              style={{
                backgroundColor: 'hsl(var(--primary))',
                color: 'hsl(var(--primary-foreground))'
              }}
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Salvar Alterações
                </>
              )}
            </button>
          </div>
        ) : (
          /* VIEW MODE */
          <>
            {/* Avatar Section - Card Style */}
            <div 
              className="rounded-xl p-4 text-center"
              style={{ backgroundColor: 'hsl(var(--muted))' }}
            >
              <div 
                className="relative group cursor-pointer mx-auto w-fit"
                onClick={() => setIsEditing(true)}
              >
                {displayAvatar ? (
                  <img
                    src={displayAvatar}
                    alt={editName}
                    className="w-20 h-20 rounded-full object-cover transition-opacity group-hover:opacity-70 ring-4 ring-white dark:ring-gray-800 mx-auto"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center transition-opacity group-hover:opacity-70 ring-4 ring-white dark:ring-gray-800 mx-auto">
                    <span className="text-white text-2xl font-semibold">
                      {editName?.charAt(0)?.toUpperCase() || '?'}
                    </span>
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity mx-auto">
                  <Edit2 className="w-5 h-5 text-white" />
                </div>
              </div>
              
              <h4 className="font-semibold text-base mt-3" style={{ color: 'hsl(var(--foreground))' }}>{editName}</h4>
              
              {/* Position/Cargo */}
              {editPosition && (
                <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {editPosition}
                </p>
              )}

              {/* Status Badge */}
              <div className={`mt-2 inline-flex px-3 py-1 text-xs rounded-full text-white font-medium ${getStatusColor(editStatus)}`}>
                {formatStatus(editStatus)}
              </div>

              {/* Deal Value - Prominent */}
              {editValue && parseFloat(editValue) > 0 && (
                <div className="mt-3 text-xl font-bold text-green-500">
                  R$ {parseFloat(editValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
              )}
            </div>

            {/* Contact Info - List Style */}
            <div className="space-y-2 mt-4">
              <h5 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Informações de Contato
              </h5>
              
              {editPhone && (
                <div 
                  className="flex items-center gap-3 text-sm p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                  style={{ backgroundColor: 'hsl(var(--muted) / 0.5)' }}
                >
                  <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <Phone className="w-4 h-4 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Telefone</p>
                    <p className="font-medium" style={{ color: 'hsl(var(--foreground))' }}>{editPhone}</p>
                  </div>
                </div>
              )}
              
              {editEmail && (
                <div 
                  className="flex items-center gap-3 text-sm p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                  style={{ backgroundColor: 'hsl(var(--muted) / 0.5)' }}
                >
                  <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                    <Mail className="w-4 h-4 text-purple-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Email</p>
                    <p className="font-medium truncate" style={{ color: 'hsl(var(--foreground))' }}>{editEmail}</p>
                  </div>
                </div>
              )}

              {editCompany && (
                <div 
                  className="flex items-center gap-3 text-sm p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                  style={{ backgroundColor: 'hsl(var(--muted) / 0.5)' }}
                >
                  <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-orange-500" />
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Empresa</p>
                    <p className="font-medium" style={{ color: 'hsl(var(--foreground))' }}>{editCompany}</p>
                  </div>
                </div>
              )}

              {leadDetails?.source && (
                <div 
                  className="flex items-center gap-3 text-sm p-3 rounded-lg"
                  style={{ backgroundColor: 'hsl(var(--muted) / 0.5)' }}
                >
                  <div className="w-8 h-8 rounded-full bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center">
                    <User className="w-4 h-4 text-cyan-500" />
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Origem</p>
                    <p className="font-medium" style={{ color: 'hsl(var(--foreground))' }}>{leadDetails.source}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Timeline Section */}
            {formatDate(createdAt) && (
              <div className="mt-4">
                <h5 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Timeline
                </h5>
                <div 
                  className="rounded-lg p-3 flex items-center gap-3"
                  style={{ backgroundColor: 'hsl(var(--muted) / 0.5)' }}
                >
                  <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <Calendar className="w-4 h-4 text-green-500" />
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Criado em</p>
                    <p className="font-medium text-sm" style={{ color: 'hsl(var(--foreground))' }}>{formatDate(createdAt)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Notes */}
            {editNotes && (
              <div className="mt-4">
                <h5 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Observações
                </h5>
                <div 
                  className="rounded-lg p-3"
                  style={{ backgroundColor: 'hsl(var(--muted) / 0.5)' }}
                >
                  <p className="text-sm leading-relaxed" style={{ color: 'hsl(var(--foreground))' }}>
                    {editNotes}
                  </p>
                </div>
              </div>
            )}

            {/* Schedules and Tasks List - After Notes */}
            {schedules.length > 0 && (
              <div className="mt-4">
                <h5 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Compromissos e Tarefas
                </h5>
                <div className="space-y-2">
                  {schedules.filter(s => s.status === 'pending').slice(0, 5).map((schedule: any) => (
                    <div 
                      key={schedule.id}
                      className="rounded-lg p-3 flex items-start gap-3"
                      style={{ backgroundColor: 'hsl(var(--muted) / 0.5)' }}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        schedule.title?.startsWith('📋') 
                          ? 'bg-blue-100 dark:bg-blue-900/30' 
                          : 'bg-purple-100 dark:bg-purple-900/30'
                      }`}>
                        {schedule.title?.startsWith('📋') 
                          ? <ListTodo className="w-4 h-4 text-blue-500" />
                          : <Calendar className="w-4 h-4 text-purple-500" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'hsl(var(--foreground))' }}>
                          {schedule.title?.replace('📋 ', '')}
                        </p>
                        <p className="text-xs flex items-center gap-1 mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          <Clock className="w-3 h-3" />
                          {new Date(schedule.scheduled_at).toLocaleDateString('pt-BR', { 
                            day: '2-digit', 
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="mt-6 space-y-2">
              <button
                onClick={() => setIsEditing(true)}
                className="w-full py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 hover:opacity-90"
                style={{
                  backgroundColor: 'hsl(var(--primary))',
                  color: 'hsl(var(--primary-foreground))'
                }}
              >
                <Edit2 className="w-4 h-4" />
                Editar Contacto
              </button>
              
              {/* Action Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowActionMenu(!showActionMenu)}
                  className="w-full py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 border hover:bg-gray-100 dark:hover:bg-gray-800"
                  style={{
                    borderColor: 'hsl(var(--border))',
                    color: 'hsl(var(--foreground))'
                  }}
                >
                  <Calendar className="w-4 h-4" />
                  Ações Rápidas
                  <ChevronDown className={`w-4 h-4 transition-transform ${showActionMenu ? 'rotate-180' : ''}`} />
                </button>
                
                {showActionMenu && (
                  <div 
                    className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border shadow-lg overflow-hidden z-10"
                    style={{
                      backgroundColor: 'hsl(var(--card))',
                      borderColor: 'hsl(var(--border))'
                    }}
                  >
                    <button
                      onClick={() => { setActiveAction('schedule'); setShowActionMenu(false); }}
                      className="w-full px-4 py-3 flex items-center gap-3 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      style={{ color: 'hsl(var(--foreground))' }}
                    >
                      <Calendar className="w-4 h-4 text-purple-500" />
                      Agendar Reunião
                    </button>
                    <button
                      onClick={() => { setActiveAction('task'); setShowActionMenu(false); }}
                      className="w-full px-4 py-3 flex items-center gap-3 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border-t"
                      style={{ color: 'hsl(var(--foreground))', borderColor: 'hsl(var(--border))' }}
                    >
                      <ListTodo className="w-4 h-4 text-blue-500" />
                      Criar Tarefa
                    </button>
                  </div>
                )}
              </div>

              {/* Task Form */}
              {activeAction === 'task' && (
                <div 
                  className="rounded-lg border p-3 space-y-3"
                  style={{ borderColor: 'hsl(var(--border))' }}
                >
                  <div className="flex items-center gap-2">
                    <ListTodo className="w-4 h-4 text-blue-500" />
                    <span className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>Nova Tarefa</span>
                  </div>
                  <input
                    type="text"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder="Título da tarefa"
                    className="w-full px-3 py-2 rounded-lg text-sm border outline-none focus:ring-2 focus:ring-blue-500/30"
                    style={{
                      backgroundColor: 'hsl(var(--muted))',
                      borderColor: 'hsl(var(--border))',
                      color: 'hsl(var(--foreground))'
                    }}
                  />
                  <input
                    type="datetime-local"
                    value={taskDate}
                    onChange={(e) => setTaskDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm border outline-none focus:ring-2 focus:ring-blue-500/30"
                    style={{
                      backgroundColor: 'hsl(var(--muted))',
                      borderColor: 'hsl(var(--border))',
                      color: 'hsl(var(--foreground))'
                    }}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setActiveAction(null)}
                      className="flex-1 py-2 rounded-lg text-sm border hover:bg-gray-100 dark:hover:bg-gray-800"
                      style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleCreateTask}
                      disabled={submittingAction || !taskTitle.trim() || !taskDate}
                      className="flex-1 py-2 rounded-lg text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {submittingAction ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      Criar
                    </button>
                  </div>
                </div>
              )}

              {/* Schedule Form */}
              {activeAction === 'schedule' && (
                <div 
                  className="rounded-lg border p-3 space-y-3"
                  style={{ borderColor: 'hsl(var(--border))' }}
                >
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-purple-500" />
                    <span className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>Novo Agendamento</span>
                  </div>
                  <input
                    type="text"
                    value={scheduleTitle}
                    onChange={(e) => setScheduleTitle(e.target.value)}
                    placeholder="Título do agendamento"
                    className="w-full px-3 py-2 rounded-lg text-sm border outline-none focus:ring-2 focus:ring-purple-500/30"
                    style={{
                      backgroundColor: 'hsl(var(--muted))',
                      borderColor: 'hsl(var(--border))',
                      color: 'hsl(var(--foreground))'
                    }}
                  />
                  <input
                    type="datetime-local"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm border outline-none focus:ring-2 focus:ring-purple-500/30"
                    style={{
                      backgroundColor: 'hsl(var(--muted))',
                      borderColor: 'hsl(var(--border))',
                      color: 'hsl(var(--foreground))'
                    }}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setActiveAction(null)}
                      className="flex-1 py-2 rounded-lg text-sm border hover:bg-gray-100 dark:hover:bg-gray-800"
                      style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleCreateSchedule}
                      disabled={submittingAction || !scheduleTitle.trim() || !scheduleDate}
                      className="flex-1 py-2 rounded-lg text-sm font-medium text-white bg-purple-500 hover:bg-purple-600 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {submittingAction ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
                      Agendar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
