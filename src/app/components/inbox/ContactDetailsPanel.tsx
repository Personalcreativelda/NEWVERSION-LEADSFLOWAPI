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
        color: stage.color || 'bg-muted-foreground',
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
    return option?.color || 'bg-muted-foreground';
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
    <div className="w-full h-full flex flex-col border-l border-border bg-card overflow-hidden">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleAvatarChange}
        accept="image/*"
        className="hidden"
      />

      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3.5 border-b border-border flex items-center justify-between bg-card">
        <h3 className="text-sm font-semibold text-foreground">
          {isEditing ? 'Editar Contato' : 'Contato'}
        </h3>
        <div className="flex items-center gap-1">
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="p-1.5 rounded-lg transition-colors hover:bg-muted text-primary"
              title="Editar"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving}
              className="p-1.5 rounded-lg transition-colors hover:bg-green-500/20 text-green-500"
              title="Salvar"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
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
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 pb-8 space-y-4 custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : error && !leadDetails ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <AlertCircle className="w-8 h-8 text-red-400 mb-2" />
            <p className="text-sm text-muted-foreground">{error}</p>
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
              <p className="text-xs mt-2 text-muted-foreground">
                Clique para alterar a foto
              </p>
            </div>

            {/* Status Selector */}
            <div>
              <label className="text-xs font-medium mb-2 block text-muted-foreground">
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
                        : 'border-border text-foreground hover:border-primary'
                    }`}
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
                className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-muted text-foreground outline-none focus:ring-2 focus:ring-primary/20 transition-all duration-150"
                placeholder="Nome do lead"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="text-xs font-medium mb-1.5 block text-muted-foreground">
                Telefone
              </label>
              <input
                type="tel"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-muted text-foreground outline-none focus:ring-2 focus:ring-primary/20 transition-all duration-150"
                placeholder="+55 00 00000-0000"
              />
            </div>

            {/* Email */}
            <div>
              <label className="text-xs font-medium mb-1.5 block text-muted-foreground">
                Email
              </label>
              <input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-muted text-foreground outline-none focus:ring-2 focus:ring-primary/20 transition-all duration-150"
                placeholder="email@exemplo.com"
              />
            </div>

            {/* Company */}
            <div>
              <label className="text-xs font-medium mb-1.5 block text-muted-foreground">
                Empresa
              </label>
              <input
                type="text"
                value={editCompany}
                onChange={(e) => setEditCompany(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-muted text-foreground outline-none focus:ring-2 focus:ring-primary/20 transition-all duration-150"
                placeholder="Nome da empresa"
              />
            </div>

            {/* Position/Cargo */}
            <div>
              <label className="text-xs font-medium mb-1.5 block text-muted-foreground">
                Cargo
              </label>
              <input
                type="text"
                value={editPosition}
                onChange={(e) => setEditPosition(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-muted text-foreground outline-none focus:ring-2 focus:ring-primary/20 transition-all duration-150"
                placeholder="Ex: Gerente, Diretor, CEO..."
              />
            </div>

            {/* Value */}
            <div>
              <label className="text-xs font-medium mb-1.5 block text-muted-foreground">
                Valor do Negócio
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                <input
                  type="number"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 rounded-lg text-sm border border-border bg-muted text-foreground outline-none focus:ring-2 focus:ring-primary/20 transition-all duration-150"
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs font-medium mb-1.5 block text-muted-foreground">
                Observações
              </label>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-muted text-foreground outline-none focus:ring-2 focus:ring-primary/20 resize-none transition-all duration-150"
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
              className="w-full py-2.5 rounded-lg text-sm font-medium transition-all duration-150 active:scale-[0.97] flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:opacity-90"
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
            {/* Avatar Section - ManyChat-style centered card */}
            <div className="text-center pt-2 pb-4">
              <div 
                className="relative group cursor-pointer mx-auto w-fit"
                onClick={() => setIsEditing(true)}
              >
                {displayAvatar ? (
                  <img
                    src={displayAvatar}
                    alt={editName}
                    className="w-16 h-16 rounded-full object-cover transition-opacity group-hover:opacity-70 mx-auto"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center transition-opacity group-hover:opacity-70 mx-auto">
                    <span className="text-white text-xl font-semibold">
                      {editName?.charAt(0)?.toUpperCase() || '?'}
                    </span>
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity mx-auto">
                  <Edit2 className="w-4 h-4 text-white" />
                </div>
              </div>
              
              <h4 className="font-semibold text-sm mt-3 text-foreground">{editName}</h4>
              
              {/* Position or "Customer since" */}
              <p className="text-[11px] mt-0.5 text-muted-foreground">
                {editPosition || (formatDate(createdAt) ? `Cliente desde ${formatDate(createdAt)}` : 'Lead')}
              </p>

              {/* Status Badge + Value row */}
              <div className="flex items-center justify-center gap-2 mt-2.5">
                <span className={`inline-flex px-2.5 py-0.5 text-[11px] rounded-full text-white font-medium ${getStatusColor(editStatus)}`}>
                  {formatStatus(editStatus)}
                </span>
                {editValue && parseFloat(editValue) > 0 && (
                  <span className="text-sm font-semibold text-green-500">
                    R$ {parseFloat(editValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                )}
              </div>
            </div>

            {/* Details Card */}
            <div className="rounded-xl border border-border/60 overflow-hidden">
              <div className="px-3 py-2.5 bg-muted/40 border-b border-border/40">
                <h5 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Detalhes
                </h5>
              </div>
              <div className="divide-y divide-border/30">
                {editPhone && (
                  <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors cursor-pointer">
                    <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                      <Phone className="w-3.5 h-3.5 text-blue-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-muted-foreground">Telefone</p>
                      <p className="text-sm font-medium truncate text-foreground">{editPhone}</p>
                    </div>
                  </div>
                )}
                {editEmail && (
                  <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors cursor-pointer">
                    <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                      <Mail className="w-3.5 h-3.5 text-purple-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-muted-foreground">Email</p>
                      <p className="text-sm font-medium truncate text-foreground">{editEmail}</p>
                    </div>
                  </div>
                )}
                {editCompany && (
                  <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors cursor-pointer">
                    <div className="w-7 h-7 rounded-lg bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-3.5 h-3.5 text-orange-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-muted-foreground">Empresa</p>
                      <p className="text-sm font-medium text-foreground">{editCompany}</p>
                    </div>
                  </div>
                )}
                {leadDetails?.source && (
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <div className="w-7 h-7 rounded-lg bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
                      <User className="w-3.5 h-3.5 text-cyan-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-muted-foreground">Origem</p>
                      <p className="text-sm font-medium text-foreground">{leadDetails.source}</p>
                    </div>
                  </div>
                )}
                {!editPhone && !editEmail && !editCompany && !leadDetails?.source && (
                  <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                    Nenhum detalhe disponível
                  </div>
                )}
              </div>
            </div>

            {/* Notes Card */}
            {editNotes && (
              <div className="rounded-xl border border-border/60 overflow-hidden">
                <div className="px-3 py-2.5 bg-muted/40 border-b border-border/40">
                  <h5 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Observações
                  </h5>
                </div>
                <div className="px-3 py-3 text-sm leading-relaxed text-foreground/80">
                  {editNotes}
                </div>
              </div>
            )}

            {/* Schedules Card */}
            {schedules.length > 0 && (
              <div className="rounded-xl border border-border/60 overflow-hidden">
                <div className="px-3 py-2.5 bg-muted/40 border-b border-border/40">
                  <h5 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Compromissos e Tarefas
                  </h5>
                </div>
                <div className="divide-y divide-border/30">
                  {schedules.filter(s => s.status === 'pending').slice(0, 5).map((schedule: any) => (
                    <div
                      key={schedule.id}
                      className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted/30 transition-colors"
                    >
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${schedule.title?.startsWith('📋') ? 'bg-blue-500/10' : 'bg-purple-500/10'}`}>
                        {schedule.title?.startsWith('📋')
                          ? <ListTodo className="w-3.5 h-3.5 text-blue-500" />
                          : <Calendar className="w-3.5 h-3.5 text-purple-500" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate text-foreground">
                          {schedule.title?.replace('📋 ', '')}
                        </p>
                        <p className="text-[11px] flex items-center gap-1 mt-0.5 text-muted-foreground">
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

            {/* Divider before actions */}
            <div className="border-t border-border/40" />

            {/* Action Buttons */}
            <div className="mt-3 space-y-2">
              <button
                onClick={() => setIsEditing(true)}
                className="w-full py-2 rounded-lg text-xs font-medium transition-all duration-150 active:scale-[0.97] flex items-center justify-center gap-2 hover:opacity-90 bg-primary text-primary-foreground"
              >
                <Edit2 className="w-3.5 h-3.5" />
                Editar Contacto
              </button>
              
              {/* Action Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowActionMenu(!showActionMenu)}
                  className="w-full py-2.5 rounded-lg text-sm font-medium transition-all duration-150 flex items-center justify-center gap-2 border border-border text-foreground hover:bg-muted/50"
                >
                  <Calendar className="w-4 h-4" />
                  Ações Rápidas
                  <ChevronDown className={`w-4 h-4 transition-transform ${showActionMenu ? 'rotate-180' : ''}`} />
                </button>
                
                {showActionMenu && (
                  <div className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border border-border shadow-lg bg-card overflow-hidden z-10">
                    <button
                      onClick={() => { setActiveAction('schedule'); setShowActionMenu(false); }}
                      className="w-full px-4 py-3 flex items-center gap-3 text-sm text-foreground hover:bg-muted/50 transition-colors"
                    >
                      <Calendar className="w-4 h-4 text-purple-500" />
                      Agendar Reunião
                    </button>
                    <button
                      onClick={() => { setActiveAction('task'); setShowActionMenu(false); }}
                      className="w-full px-4 py-3 flex items-center gap-3 text-sm text-foreground hover:bg-muted/50 transition-colors border-t border-border"
                    >
                      <ListTodo className="w-4 h-4 text-blue-500" />
                      Criar Tarefa
                    </button>
                  </div>
                )}
              </div>

              {/* Task Form */}
              {activeAction === 'task' && (
                <div className="rounded-lg border border-border p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <ListTodo className="w-4 h-4 text-blue-500" />
                    <span className="text-sm font-medium text-foreground">Nova Tarefa</span>
                  </div>
                  <input
                    type="text"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder="Título da tarefa"
                    className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-muted text-foreground outline-none focus:ring-2 focus:ring-blue-500/30 transition-all duration-150"
                  />
                  <input
                    type="datetime-local"
                    value={taskDate}
                    onChange={(e) => setTaskDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-muted text-foreground outline-none focus:ring-2 focus:ring-blue-500/30 transition-all duration-150"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setActiveAction(null)}
                      className="flex-1 py-2 rounded-lg text-sm border border-border text-foreground hover:bg-muted/50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleCreateTask}
                      disabled={submittingAction || !taskTitle.trim() || !taskDate}
                      className="flex-1 py-2 rounded-lg text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                    >
                      {submittingAction ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      Criar
                    </button>
                  </div>
                </div>
              )}

              {/* Schedule Form */}
              {activeAction === 'schedule' && (
                <div className="rounded-lg border border-border p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-purple-500" />
                    <span className="text-sm font-medium text-foreground">Novo Agendamento</span>
                  </div>
                  <input
                    type="text"
                    value={scheduleTitle}
                    onChange={(e) => setScheduleTitle(e.target.value)}
                    placeholder="Título do agendamento"
                    className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-muted text-foreground outline-none focus:ring-2 focus:ring-purple-500/30 transition-all duration-150"
                  />
                  <input
                    type="datetime-local"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm border border-border bg-muted text-foreground outline-none focus:ring-2 focus:ring-purple-500/30 transition-all duration-150"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setActiveAction(null)}
                      className="flex-1 py-2 rounded-lg text-sm border border-border text-foreground hover:bg-muted/50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleCreateSchedule}
                      disabled={submittingAction || !scheduleTitle.trim() || !scheduleDate}
                      className="flex-1 py-2 rounded-lg text-sm font-medium text-white bg-purple-500 hover:bg-purple-600 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
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
