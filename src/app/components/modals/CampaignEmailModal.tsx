import React, { useState, useEffect, useRef } from 'react';
import {
  X, Mail, Users, Send, Clock, Settings,
  Paperclip, Image as ImageIcon, ChevronDown, ChevronUp,
  Smile, Bold, Italic, Link2, Check, Eye, Save, Trash2, Type
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { toast } from "sonner";
import { emailsApi } from '../../utils/api';
import { EMAIL_TEMPLATES } from '../../utils/emailTemplates';
import { Layout } from 'lucide-react';

interface Lead {
  id: string;
  nome: string;
  telefone?: string;
  email?: string;
  empresa?: string;
  status?: string;
}

interface CampaignEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  leads: Lead[];
  onCampaignCreated?: (campaign: any) => void;
  onCampaignUpdated?: (campaign: any) => void;
  editingCampaign?: any;
}

interface Attachment {
  name: string;
  size: number;
  type: string;
  file: File;
}

export default function CampaignEmailModal({ isOpen, onClose, leads, onCampaignCreated, onCampaignUpdated, editingCampaign }: CampaignEmailModalProps) {
  const [campaignName, setCampaignName] = useState('');
  const [recipientMode, setRecipientMode] = useState<'all' | 'segments' | 'custom'>('all');
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(['novo']);
  const [customEmails, setCustomEmails] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [useHtml, setUseHtml] = useState(false);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [scheduleMode, setScheduleMode] = useState<'now' | 'scheduled'>('now');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [sendSpeed, setSendSpeed] = useState<'slow' | 'normal' | 'fast'>('normal');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [trackOpens, setTrackOpens] = useState(true);
  const [trackClicks, setTrackClicks] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [campaignId, setCampaignId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const htmlInputRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  const handleImportHtml = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (htmlContent.trim() && !confirm('Isso irá substituir o conteúdo atual. Continuar?')) {
        return;
      }
      setHtmlContent(content);
      setUseHtml(true);
      toast.success('Template HTML importado!');
    };
    reader.readAsText(file);
  };

  const applyTemplate = (templateHtml: string) => {
    if (htmlContent.trim() && !confirm('Isso irá substituir o conteúdo HTML atual. Deseja continuar?')) {
      return;
    }
    setHtmlContent(templateHtml);
    setUseHtml(true);
    setShowTemplates(false);
    toast.success('Modelo aplicado com sucesso!');
  };

  // ✅ Efeito para carregar dados da campanha ao editar
  useEffect(() => {
    if (editingCampaign) {
      console.log('[CampaignEmailModal] 📝 Carregando campanha para edição:', editingCampaign);

      const settings = editingCampaign.settings || {};

      setCampaignId(editingCampaign.id || null);
      setCampaignName(editingCampaign.name || '');
      setSubject(editingCampaign.template || settings.subject || '');

      // Carregar configurações do objeto settings mapeado no CampaignsPage
      setRecipientMode(settings.recipientMode || 'all');
      setSelectedStatuses(settings.selectedStatuses || ['novo']);
      setCustomEmails(settings.customEmails || '');
      setMessage(settings.message || '');
      setHtmlContent(settings.htmlContent || '');
      setUseHtml(settings.isHtml || false);
      setAttachments(settings.attachments || []);
      setScheduleMode(settings.scheduleMode || 'now');
      setScheduleDate(settings.scheduledDate || '');
      setScheduleTime(settings.scheduledTime || '');
      setTrackOpens(settings.trackOpens !== undefined ? settings.trackOpens : true);
      setTrackClicks(settings.trackClicks !== undefined ? settings.trackClicks : true);
    } else {
      // Limpar formulário se não estiver editando
      setCampaignId(null);
      setCampaignName('');
      setSubject('');
      setRecipientMode('all');
      setSelectedStatuses(['novo']);
      setCustomEmails('');
      setMessage('');
      setHtmlContent('');
      setUseHtml(false);
      setAttachments([]);
      setScheduleMode('now');
      setScheduleDate('');
      setScheduleTime('');
    }
  }, [editingCampaign]);





  const getRecipientCount = () => {
    if (recipientMode === 'all') return leads.filter(l => l.email).length;
    if (recipientMode === 'segments') {
      return leads.filter(lead => lead.email && selectedStatuses.includes(lead.status || 'novo')).length;
    }
    const emails = customEmails.split(',').map(e => e.trim()).filter(e => e.length > 0);
    return emails.length;
  };

  const recipientCount = getRecipientCount();

  const statusCounts = {
    novo: leads.filter(l => l.status === 'novo' && l.email).length,
    contatado: leads.filter(l => l.status === 'contatado' && l.email).length,
    qualificado: leads.filter(l => l.status === 'qualificado' && l.email).length,
    negociacao: leads.filter(l => l.status === 'negociacao' && l.email).length,
    ganho: leads.filter(l => l.status === 'ganho' && l.email).length,
    perdido: leads.filter(l => l.status === 'perdido' && l.email).length,
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    const validFiles = files.filter(file => {
      if (file.size > 25 * 1024 * 1024) {
        toast.error(`${file.name} excede 25MB`);
        return false;
      }
      return true;
    });

    const newAttachments = validFiles.map(file => ({
      name: file.name,
      size: file.size,
      type: file.type,
      file
    }));

    setAttachments([...attachments, ...newAttachments]);
    if (newAttachments.length > 0) {
      toast.success(`${newAttachments.length} arquivo(s) anexado(s)`);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  const getAttachmentUrl = (att: any) => {
    if (att.url) return att.url;
    if (att.file) return URL.createObjectURL(att.file);
    if (att.content) {
      try {
        const byteCharacters = atob(att.content);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: att.type });
        return URL.createObjectURL(blob);
      } catch (err) {
        console.error('Error generating preview URL:', err);
        return null;
      }
    }
    return null;
  };

  const processAttachments = async (attachments: any[]) => {
    const token = localStorage.getItem('leadflow_access_token');
    return await Promise.all(attachments.map(async (a) => {
      if (a.url) return a; // Já está no MinIO/S3

      if (a.file) {
        try {
          const formData = new FormData();
          formData.append('file', a.file);

          const response = await fetch(`${(import.meta as any).env.VITE_API_URL}/api/email-campaigns/upload-attachment`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`
            },
            body: formData
          });

          if (response.ok) {
            const data = await response.json();
            return {
              name: data.name,
              type: data.type,
              size: data.size,
              url: data.url
            };
          }
        } catch (err) {
          console.error(`[Upload] Falha ao subir ${a.name}:`, err);
        }

        // Fallback para base64 se o upload falhar e for um arquivo pequeno (< 3MB)
        if (a.size < 3 * 1024 * 1024) {
          try {
            const content = await fileToBase64(a.file);
            return {
              name: a.name,
              type: a.type,
              size: a.size,
              content
            };
          } catch (e) {
            console.error('Fallback base64 falhou:', e);
          }
        }
      }

      return a;
    }));
  };

  const insertVariable = (variable: string) => {
    const textarea = messageRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = useHtml ? htmlContent : message;
    const before = text.substring(0, start);
    const after = text.substring(end);

    if (useHtml) {
      setHtmlContent(before + variable + after);
    } else {
      setMessage(before + variable + after);
    }

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + variable.length, start + variable.length);
    }, 0);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getEstimatedTime = () => {
    const emailsPerMinute = sendSpeed === 'slow' ? 60 : sendSpeed === 'normal' ? 120 : 240;
    const totalMinutes = Math.ceil(recipientCount / emailsPerMinute);

    if (totalMinutes < 1) return '< 1 minuto';
    if (totalMinutes < 60) return `~${totalMinutes} min`;

    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `~${hours}h ${mins}min`;
  };

  const handleSend = async () => {
    if (!campaignName.trim()) {
      toast.error('Digite um nome para a campanha');
      return;
    }

    if (!subject.trim()) {
      toast.error('Digite o assunto do email');
      return;
    }

    if (!message.trim() && !htmlContent.trim()) {
      toast.error('Digite o conteúdo do email');
      return;
    }

    if (recipientCount === 0) {
      toast.error('Selecione ao menos um destinatário com email');
      return;
    }

    // Validar agendamento
    if (scheduleMode === 'scheduled') {
      if (!scheduleDate || !scheduleTime) {
        toast.error('⏰ Defina a data e hora do agendamento');
        return;
      }

      const scheduledDateTime = new Date(`${scheduleDate}T${scheduleTime}`);
      const now = new Date();

      if (scheduledDateTime <= now) {
        toast.error('⚠️ A data/hora do agendamento deve ser futura');
        return;
      }
    }

    setIsSending(true);

    try {
      // 1. Processar anexos (subir para MinIO se necessário)
      const processedAttachments = await processAttachments(attachments);

      // 2. PRIMEIRO SALVAR OU ATUALIZAR NO BANCO DE DADOS
      const campaignData = {
        campaign_name: campaignName,
        subject,
        from_email: localStorage.getItem('smtp_from_email') || '',
        from_name: localStorage.getItem('smtp_from_name') || '',
        message,
        html_content: htmlContent,
        is_html: useHtml,
        recipient_mode: recipientMode,
        selected_statuses: selectedStatuses,
        custom_emails: customEmails,
        recipient_count: recipientCount,
        schedule_mode: scheduleMode,
        scheduled_date: scheduleDate,
        scheduled_time: scheduleTime,
        attachments: processedAttachments,
        status: scheduleMode === 'now' ? 'active' : 'scheduled'
      };

      let result;
      if (campaignId) {
        result = await emailsApi.update(campaignId, campaignData);
      } else {
        result = await emailsApi.create(campaignData);
      }

      if (!result.success) {
        throw new Error(result.error || 'Erro ao salvar campanha no banco');
      }

      const activeCampaignId = campaignId || result.campaign?.id;
      if (!campaignId && result.campaign?.id) {
        setCampaignId(result.campaign.id);
      }

      // 2. DISPARAR ENVIO DIRETO PELO BACKEND
      const smtp_settings = {
        host: localStorage.getItem('smtp_host'),
        port: localStorage.getItem('smtp_port'),
        user: localStorage.getItem('smtp_user'),
        pass: localStorage.getItem('smtp_password'),
        fromEmail: localStorage.getItem('smtp_from_email'),
        fromName: localStorage.getItem('smtp_from_name')
      };

      if (!smtp_settings.host || !smtp_settings.user || !smtp_settings.pass) {
        toast.warning('⚠️ Campanha salva, mas configurações SMTP não encontradas.');
        toast.info('Configure o SMTP em Ajustes > Integrações.');
        setIsSending(false);
        return;
      }

      if (scheduleMode === 'now') {
        const token = localStorage.getItem('leadflow_access_token');
        const response = await fetch(`${(import.meta as any).env.VITE_API_URL}/api/email-campaigns/${activeCampaignId}/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ smtp_settings })
        });

        if (!response.ok) {
          throw new Error('Erro ao processar envio no servidor');
        }

        toast.success(`✅ Campanha "${campaignName}" iniciada com sucesso!`);
      } else {
        toast.success(`📅 Campanha "${campaignName}" agendada com sucesso!`);
      }

      localStorage.removeItem('email_campaign_draft');

      // Notificar pai sobre a mudança
      if (campaignId) {
        onCampaignUpdated?.({ ...campaignData, id: activeCampaignId });
      } else {
        onCampaignCreated?.({ ...campaignData, id: activeCampaignId });
      }

      onClose();
    } catch (error: any) {
      console.error('Error processing campaign:', error);
      toast.error(`❌ Erro: ${error.message || 'Erro ao processar campanha'}`);
    } finally {
      setIsSending(false);
    }
  };
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove the "data:mime/type;base64," prefix
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  };

  const handleSaveDraft = async () => {
    if (!campaignName.trim() || !subject.trim()) {
      toast.error('Preencha pelo menos o nome da campanha e o assunto');
      return;
    }

    setIsSending(true);

    try {
      // 1. Processar anexos (subir para MinIO se necessário)
      const processedAttachments = await processAttachments(attachments);

      const campaignData = {
        campaign_name: campaignName,
        subject,
        from_email: localStorage.getItem('smtp_from_email') || '',
        from_name: localStorage.getItem('smtp_from_name') || '',
        message,
        html_content: htmlContent,
        is_html: useHtml,
        recipient_mode: recipientMode,
        selected_statuses: selectedStatuses,
        custom_emails: customEmails,
        recipient_count: recipientCount,
        schedule_mode: scheduleMode,
        scheduled_date: scheduleDate,
        scheduled_time: scheduleTime,
        attachments: processedAttachments,
        metadata: {},
        status: 'active'
      };

      let result;
      if (campaignId) {
        result = await emailsApi.update(campaignId, campaignData);
      } else {
        result = await emailsApi.create(campaignData);
      }

      if (result.success || result.id) {
        if (!campaignId && (result.campaign?.id || result.id)) {
          const newId = result.campaign?.id || result.id;
          setCampaignId(newId);
          onCampaignCreated?.({ ...campaignData, id: newId });
        } else if (campaignId) {
          onCampaignUpdated?.({ ...campaignData, id: campaignId });
        }
        toast.success('💾 Rascunho salvo no banco de dados!');
      } else {
        throw new Error(result.error || 'Erro ao salvar');
      }
    } catch (error: any) {
      console.error('Error saving draft:', error);
      toast.error(`❌ Erro ao salvar rascunho: ${error.message || 'Erro desconhecido'}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleTestEmail = async () => {
    if (!subject.trim()) {
      toast.error('Digite o assunto do email');
      return;
    }

    if (!message.trim() && !htmlContent.trim()) {
      toast.error('Digite o conteúdo do email');
      return;
    }

    // Get user email from localStorage or prompt
    const userEmail = localStorage.getItem('user_email') || prompt('Digite seu email para receber o teste:');

    if (!userEmail) {
      toast.error('Email não fornecido');
      return;
    }

    setIsSending(true);

    try {
      const smtp_settings = {
        host: localStorage.getItem('smtp_host'),
        port: localStorage.getItem('smtp_port'),
        user: localStorage.getItem('smtp_user'),
        pass: localStorage.getItem('smtp_password'),
        fromEmail: localStorage.getItem('smtp_from_email'),
        fromName: localStorage.getItem('smtp_from_name')
      };

      if (!smtp_settings.host || !smtp_settings.user || !smtp_settings.pass) {
        toast.error('⚠️ Configure o SMTP em Ajustes > Integrações antes de testar.');
        setIsSending(false);
        return;
      }

      // 0. Processar anexos (subir para MinIO se necessário)
      const processedAttachments = await processAttachments(attachments);

      const token = localStorage.getItem('leadflow_access_token');
      const response = await fetch(`${(import.meta as any).env.VITE_API_URL}/api/email-campaigns/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          smtp_settings,
          subject,
          message: useHtml ? htmlContent : message,
          is_html: useHtml,
          recipient_email: userEmail,
          attachments: processedAttachments
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao enviar email de teste');
      }

      toast.success(`✅ Email de teste enviado para ${userEmail}!`);
    } catch (error: any) {
      console.error('Error sending test email:', error);
      toast.error(`❌ Erro no teste: ${error.message || 'Erro desconhecido'}`);
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
      <div
        style={{
          backgroundColor: 'hsl(var(--card))',
          color: 'hsl(var(--card-foreground))',
        }}
        className="bg-card text-card-foreground rounded-2xl shadow-lg w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
      >

        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-[#3B82F6] to-[#2563EB] px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-xl text-white font-bold">Nova Campanha de Email</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Nome da Campanha */}
          <div>
            <Label className="text-sm font-medium text-foreground mb-2">
              Nome da Campanha
            </Label>
            <Input
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              placeholder="Ex: Newsletter Dezembro 2024"
              className="h-11"
            />
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700"></div>

          {/* Destinatários */}
          <div>
            <Label className="text-sm font-semibold text-foreground mb-3 block">
              DESTINATÁRIOS
            </Label>

            <div className="space-y-3">
              {/* Todos */}
              <label className="flex items-center gap-3 p-3 rounded-lg border-2 border-gray-200 dark:border-gray-700 hover:border-[#3B82F6] cursor-pointer transition-colors">
                <input
                  type="radio"
                  name="recipient"
                  checked={recipientMode === 'all'}
                  onChange={() => setRecipientMode('all')}
                  className="w-4 h-4 text-[#3B82F6] focus:ring-[#3B82F6]"
                />
                <span className="flex-1 text-sm font-medium text-foreground">
                  Todos os leads com email ({leads.filter(l => l.email).length})
                </span>
              </label>

              {/* Segmentos */}
              <div className="border-2 border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <label className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="recipient"
                    checked={recipientMode === 'segments'}
                    onChange={() => setRecipientMode('segments')}
                    className="w-4 h-4 text-[#3B82F6] focus:ring-[#3B82F6]"
                  />
                  <span className="flex-1 text-sm font-medium text-foreground">
                    Filtrar por segmentos
                  </span>
                </label>

                {recipientMode === 'segments' && (
                  <div className="px-3 pb-3 space-y-2 bg-gray-50 dark:bg-gray-800/50">
                    {Object.entries(statusCounts).map(([status, count]) => (
                      <label key={status} className="flex items-center gap-2 pl-7">
                        <input
                          type="checkbox"
                          checked={selectedStatuses.includes(status)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedStatuses([...selectedStatuses, status]);
                            } else {
                              setSelectedStatuses(selectedStatuses.filter(s => s !== status));
                            }
                          }}
                          className="w-4 h-4 text-[#3B82F6] focus:ring-[#3B82F6] rounded"
                        />
                        <span className="text-sm text-foreground capitalize">
                          {status} ({count})
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Lista personalizada */}
              <div className="border-2 border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <label className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="recipient"
                    checked={recipientMode === 'custom'}
                    onChange={() => setRecipientMode('custom')}
                    className="w-4 h-4 text-[#3B82F6] focus:ring-[#3B82F6]"
                  />
                  <span className="flex-1 text-sm font-medium text-foreground">
                    Lista personalizada
                  </span>
                </label>

                {recipientMode === 'custom' && (
                  <div className="px-3 pb-3 bg-gray-50 dark:bg-gray-800/50">
                    <Textarea
                      value={customEmails}
                      onChange={(e) => setCustomEmails(e.target.value)}
                      placeholder="Digite os emails separados por vírgula&#10;Ex: email1@example.com, email2@example.com, email3@example.com"
                      className="min-h-[100px] text-sm"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Total Recipients */}
            <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                {recipientCount} destinatário(s) selecionado(s)
              </span>
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700"></div>

          {/* Assunto */}
          <div>
            <Label className="text-sm font-semibold text-foreground mb-2 block">
              ASSUNTO DO EMAIL
            </Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Ex: Novidades desta semana - Promoções imperdíveis!"
              className="h-11"
            />
            <p className="text-xs text-muted-foreground mt-1">
              💡 Assuntos curtos e atrativos têm maior taxa de abertura
            </p>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700"></div>

          {/* Conteúdo */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <Label className="text-sm font-semibold text-foreground">
                CONTEÚDO DO EMAIL
              </Label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setUseHtml(false)}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${!useHtml
                    ? 'bg-[#3B82F6] text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-foreground hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                >
                  <Type className="w-3 h-3 inline mr-1" />
                  Texto
                </button>
                <button
                  type="button"
                  onClick={() => setUseHtml(true)}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${useHtml
                    ? 'bg-[#3B82F6] text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-foreground hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                >
                  {'</>'} HTML
                </button>
              </div>
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-1 p-2 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-t-lg">
              <button
                type="button"
                onClick={() => insertVariable('{name}')}
                className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors group"
                title="Inserir variável"
              >
                <span className="text-sm font-medium text-foreground group-hover:text-gray-900 dark:group-hover:text-white">
                  {'{x}'}
                </span>
              </button>
              <button type="button" className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors" title="Emoji">
                <Smile className="w-4 h-4 text-gray-600 dark:text-foreground" />
              </button>
              {!useHtml && (
                <>
                  <button type="button" className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors" title="Negrito">
                    <Bold className="w-4 h-4 text-gray-600 dark:text-foreground" />
                  </button>
                  <button type="button" className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors" title="Itálico">
                    <Italic className="w-4 h-4 text-gray-600 dark:text-foreground" />
                  </button>
                  <button type="button" className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors" title="Link">
                    <Link2 className="w-4 h-4 text-gray-600 dark:text-foreground" />
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setShowTemplates(!showTemplates)}
                className={`flex items-center gap-1.5 px-2 py-1 ml-2 rounded-md transition-colors ${showTemplates
                  ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                  : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-foreground'
                  }`}
                title="Escolher modelo"
              >
                <Layout className="w-4 h-4" />
                <span className="text-xs font-medium">Modelos</span>
              </button>
              <button
                type="button"
                onClick={() => htmlInputRef.current?.click()}
                className="flex items-center gap-1.5 px-2 py-1 ml-1 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-foreground rounded-md transition-colors"
                title="Importar arquivo HTML"
              >
                <div className="w-4 h-4 rounded border border-gray-400 flex items-center justify-center text-[10px] font-bold">
                  ↓
                </div>
                <span className="text-xs font-medium">Importar</span>
              </button>
              <input
                ref={htmlInputRef}
                type="file"
                className="hidden"
                accept=".html,.htm"
                onChange={handleImportHtml}
              />
            </div>

            {/* Template Selection UI */}
            {showTemplates && (
              <div className="absolute z-50 mt-2 left-0 right-0 p-5 bg-card border-2 border-primary/20 rounded-xl shadow-2xl grid grid-cols-1 sm:grid-cols-3 gap-4 animate-in fade-in zoom-in duration-200">
                <div className="col-span-1 sm:col-span-3 flex justify-between items-center mb-1 border-b pb-2 border-border">
                  <div className="flex items-center gap-2">
                    <Layout className="w-4 h-4 text-primary" />
                    <h4 className="text-sm font-bold">Modelos de E-mail</h4>
                  </div>
                  <button onClick={() => setShowTemplates(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                {EMAIL_TEMPLATES.map((tmpl) => (
                  <button
                    key={tmpl.id}
                    onClick={() => applyTemplate(tmpl.html)}
                    className="flex flex-col items-center gap-3 p-4 border border-border rounded-xl hover:border-primary hover:bg-primary/5 dark:hover:bg-primary/10 transition-all text-center group relative overflow-hidden"
                  >
                    <div className="w-full h-24 bg-muted border border-dashed border-border rounded-lg flex items-center justify-center group-hover:bg-primary/10 group-hover:border-primary/50 transition-colors">
                      <Layout className="w-10 h-10 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <div>
                      <span className="text-xs font-bold block mb-1">{tmpl.name}</span>
                      <span className="text-[10px] text-muted-foreground">Clique para aplicar</span>
                    </div>
                    <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/5 pointer-events-none transition-colors" />
                  </button>
                ))}
              </div>
            )}

            <div className="relative">
              <Textarea
                ref={messageRef}
                value={useHtml ? htmlContent : message}
                onChange={(e) => useHtml ? setHtmlContent(e.target.value) : setMessage(e.target.value)}
                placeholder={useHtml
                  ? "Digite o código HTML do email...&#10;&#10;<h1>Olá {name}!</h1>&#10;<p>Confira nossas novidades...</p>"
                  : "Digite o conteúdo do email aqui...&#10;&#10;Use {name} para inserir o nome do destinatário"}
                className="min-h-[200px] rounded-t-none focus:ring-[#3B82F6] focus:border-[#3B82F6] font-mono text-sm"
              />

              {/* Variáveis */}
              <div className="mt-2 flex flex-wrap gap-2 items-center">
                <span className="text-xs text-gray-500 dark:text-foreground">💡 Variáveis:</span>
                {['{name}', '{email}', '{phone}', '{company}'].map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => insertVariable(v)}
                    className="px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded text-xs hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                  >
                    {v}
                  </button>
                ))}
              </div>

              {/* Contador */}
              <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-foreground">
                <span>📝 {(useHtml ? htmlContent : message).length} caracteres</span>
                {!useHtml && message.length > 1000 && (
                  <span className="text-amber-600 dark:text-amber-400">
                    💡 Considere usar HTML para emails mais elaborados
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700"></div>

          {/* Anexos */}
          <div>
            <Label className="text-sm font-semibold text-foreground mb-3 block">
              ANEXOS (Opcional)
            </Label>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2"
              >
                <Paperclip className="w-4 h-4" />
                Adicionar anexo
              </Button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileUpload}
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.gif"
            />

            {attachments.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-foreground font-medium">
                  Arquivos anexados:
                </p>
                {attachments.map((att, index) => (
                  <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg group/att">
                    <div className="w-10 h-10 rounded flex-shrink-0 overflow-hidden bg-gray-200 dark:bg-gray-700 flex items-center justify-center border border-border">
                      {att.type.startsWith('image/') ? (
                        <img
                          src={getAttachmentUrl(att) || ''}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-xl">📄</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground truncate">{att.name}</p>
                        <a
                          href={getAttachmentUrl(att) || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:text-primary/80 transition-colors"
                          title="Visualizar arquivo"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </a>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-foreground">{formatFileSize(att.size)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(index)}
                      className="text-red-500 hover:text-red-700 dark:text-red-400 p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-foreground mt-2">
              ⚠️ Limite: 25 MB por arquivo • ✓ Formatos: PDF, DOC, XLS, JPG, PNG
            </p>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700"></div>

          {/* Agendamento */}
          <div>
            <Label className="text-sm font-semibold text-foreground mb-3 block">
              AGENDAMENTO
            </Label>

            <div className="space-y-3">
              <label className="flex items-center gap-3 p-3 rounded-lg border-2 border-gray-200 dark:border-gray-700 hover:border-[#3B82F6] cursor-pointer transition-colors">
                <input
                  type="radio"
                  name="schedule"
                  checked={scheduleMode === 'now'}
                  onChange={() => setScheduleMode('now')}
                  className="w-4 h-4 text-[#3B82F6] focus:ring-[#3B82F6]"
                />
                <span className="text-sm font-medium text-foreground">
                  Enviar agora
                </span>
              </label>

              <div className="border-2 border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <label className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="schedule"
                    checked={scheduleMode === 'scheduled'}
                    onChange={() => setScheduleMode('scheduled')}
                    className="w-4 h-4 text-[#3B82F6] focus:ring-[#3B82F6]"
                  />
                  <span className="flex-1 text-sm font-medium text-foreground">
                    Agendar:
                  </span>
                </label>

                {scheduleMode === 'scheduled' && (
                  <div className="px-3 pb-3 bg-gray-50 dark:bg-gray-800/50 flex gap-2">
                    <Input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} className="h-9 flex-1" />
                    <Input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} className="h-9 flex-1" />
                  </div>
                )}
              </div>
            </div>
          </div>



          {/* Summary */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 p-4 rounded-lg border-2 border-blue-200 dark:border-blue-800">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <Send className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-foreground mb-2">Resumo da Campanha</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-600 dark:text-foreground">Destinatários:</span>
                    <p className="font-semibold text-foreground">{recipientCount} emails</p>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-foreground">Tempo estimado:</span>
                    <p className="font-semibold text-foreground">{getEstimatedTime()}</p>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-foreground">Anexos:</span>
                    <p className="font-semibold text-foreground">{attachments.length} arquivo(s)</p>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-foreground">Formato:</span>
                    <p className="font-semibold text-foreground">{useHtml ? 'HTML' : 'Texto'}</p>
                  </div>
                  <div className="col-span-2 mt-2 pt-2 border-t border-blue-200 dark:border-blue-800">
                    <span className="text-gray-600 dark:text-foreground">Enviando de:</span>
                    <p className="font-semibold text-foreground text-xs truncate">
                      {localStorage.getItem('smtp_from_name') || 'Não configurado'} ({localStorage.getItem('smtp_from_email') || 'Não configurado'})
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            backgroundColor: 'hsl(var(--card))',
            borderTopColor: 'hsl(var(--border))',
          }}
          className="sticky bottom-0 bg-card border-t border-border px-6 py-4 flex items-center justify-between gap-3"
        >
          <Button
            type="button"
            variant="outline"
            onClick={handleSaveDraft}
            className="flex items-center gap-2 border-gray-200 dark:border-gray-700 text-foreground hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <Save className="w-4 h-4" />
            Salvar Rascunho
          </Button>

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleTestEmail}
              disabled={isSending || !subject.trim() || (!message.trim() && !htmlContent.trim())}
              className="border-gray-200 dark:border-gray-700 text-foreground hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <Eye className="w-4 h-4 mr-2" />
              Enviar Teste
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSending}
              className="border-gray-200 dark:border-gray-700 text-foreground hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSend}
              disabled={isSending || recipientCount === 0}
              className="bg-gradient-to-r from-[#3B82F6] to-[#2563EB] hover:from-[#2563EB] hover:to-[#1D4ED8] text-white font-semibold px-6 min-w-[140px]"
            >
              {isSending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                  Processando...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  {scheduleMode === 'scheduled' ? 'Agendar' : 'Enviar Agora'}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}



