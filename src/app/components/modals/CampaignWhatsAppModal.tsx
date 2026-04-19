// Campaign WhatsApp Modal - Versão Completa com Drag & Drop e Preview
import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef, useMemo } from 'react';
import {
  X, MessageSquare, Users, Send, Clock, Settings,
  Paperclip, Image as ImageIcon, ChevronDown, ChevronUp,
  Smile, Bold, Italic, Link2, Check, Eye, Save, Trash2, Video, Smartphone
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { useConfirm } from '../ui/ConfirmDialog';
import { toast } from "sonner";
import EmojiPicker from 'emoji-picker-react';
import { channelsApi } from '../../services/api/inbox';

interface Lead {
  id: string;
  nome: string;
  telefone?: string;
  email?: string;
  empresa?: string;
  status?: string;
}

interface Attachment {
  name: string;
  size: number;
  type: string;
  file: File;
  preview?: string;
  caption?: string;
  isExisting?: boolean;
  url?: string;
}

interface CampaignWhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  leads: Lead[];
  onCampaignCreated?: (campaign: any) => void;
  onCampaignUpdated?: (campaign: any) => void; // ✅ Novo callback para atualizar campanha
  editingCampaign?: any; // ✅ Prop para edição
  isDark?: boolean; // ✅ Nova prop para controle explícito de tema
  userPlan?: 'free' | 'business' | 'enterprise'; // ✅ Adicionado para evitar erro de lint
}

export default function CampaignWhatsAppModal({ isOpen, onClose, leads, onCampaignCreated, onCampaignUpdated, editingCampaign, isDark = false }: CampaignWhatsAppModalProps) {
  const confirm = useConfirm();
  const [campaignName, setCampaignName] = useState('');
  const [recipientMode, setRecipientMode] = useState<'all' | 'segments' | 'custom'>('all');
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(['novo']);
  const [customNumbers, setCustomNumbers] = useState('');
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [scheduleMode, setScheduleMode] = useState<'now' | 'scheduled'>('now');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [sendSpeed, setSendSpeed] = useState<'slow' | 'normal' | 'fast'>('slow');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [stopOnError, setStopOnError] = useState(true);
  const [skipInvalid, setSkipInvalid] = useState(true);
  const [randomDelay, setRandomDelay] = useState(false);
  const [minDelay, setMinDelay] = useState('15');
  const [maxDelay, setMaxDelay] = useState('45');
  const [isSending, setIsSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showVariableDropdown, setShowVariableDropdown] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [autoSaveIndicator, setAutoSaveIndicator] = useState(false);
  
  // ✅ Estado para canais WhatsApp conectados
  const [whatsappChannels, setWhatsappChannels] = useState<any[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string>('');
  const [loadingChannels, setLoadingChannels] = useState(false);

  // ✅ Estado para API Oficial (WhatsApp Cloud) — template messages
  const [useTemplate, setUseTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateLanguage, setTemplateLanguage] = useState('pt_BR');

  // ✅ Canal selecionado atualmente
  const selectedChannelData = whatsappChannels.find(ch => ch.id === selectedChannel) || null;
  const isCloudChannel = selectedChannelData?.type === 'whatsapp_cloud';

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const variableDropdownRef = useRef<HTMLDivElement>(null);

  // ✅ CARREGAR DADOS DA CAMPANHA AO EDITAR
  useEffect(() => {
    if (editingCampaign) {
      console.log('🔧 MODO EDIÇÃO - Carregando dados da campanha:', editingCampaign);

      try {
        // Carregar dados do banco de dados
        setCampaignName(editingCampaign.name || '');
        setMessage(editingCampaign.template || '');

        // Carregar settings se existirem
        let settings: any = {};
        if (editingCampaign.settings) {
          try {
            settings = typeof editingCampaign.settings === 'string'
              ? JSON.parse(editingCampaign.settings)
              : editingCampaign.settings;
          } catch (e) {
            console.warn('⚠️ Erro ao parsear settings:', e);
            settings = {};
          }
        }

        setRecipientMode(settings.recipientMode || 'all');
        setSelectedStatuses(settings.selectedStatuses || ['novo']);
        setCustomNumbers(settings.customNumbers || '');
        setScheduleMode(settings.scheduleMode || 'now');
        setScheduleDate(settings.scheduleDate || '');
        setScheduleTime(settings.scheduleTime || '');
        setSendSpeed(settings.sendSpeed || 'slow');
        setUseTemplate(settings.useTemplate || false);
        setTemplateName(settings.templateName || '');
        setTemplateLanguage(settings.templateLanguage || 'pt_BR');
        if (settings.channelId) setSelectedChannel(settings.channelId);

        // ✅ Carregar arquivos anexados (media_urls) como attachments
        if (editingCampaign.media_urls && Array.isArray(editingCampaign.media_urls) && editingCampaign.media_urls.length > 0) {
          console.log('📎 Carregando arquivos anexados:', editingCampaign.media_urls);

          // Criar attachments a partir das URLs
          const existingAttachments = editingCampaign.media_urls.map((url: string, index: number) => {
            // Extrair nome do arquivo da URL
            const fileName = url.split('/').pop() || `arquivo-${index + 1}`;
            const fileExt = fileName.split('.').pop()?.toLowerCase() || '';

            // Determinar tipo MIME baseado na extensão
            let mimeType = 'application/octet-stream';
            if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExt)) {
              mimeType = `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`;
            } else if (['mp4', 'avi', 'mov', 'wmv'].includes(fileExt)) {
              mimeType = `video/${fileExt}`;
            } else if (fileExt === 'pdf') {
              mimeType = 'application/pdf';
            }

            return {
              name: fileName,
              size: 0, // Não sabemos o tamanho, mas não é crítico
              type: mimeType,
              file: new File([], fileName, { type: mimeType }), // Arquivo vazio placeholder
              preview: url, // Usar a URL do MinIO como preview
              caption: '',
              isExisting: true, // Flag para indicar que já existe no servidor
              url: url // Manter URL original
            };
          });

          setAttachments(existingAttachments);
        } else {
          setAttachments([]);
        }
      } catch (error) {
        console.error('❌ Erro ao carregar dados da campanha:', error);
        // Mesmo com erro, tentar carregar dados básicos
        setCampaignName(editingCampaign.name || '');
      }
    } else {
      // Modo criação - limpar campos
      setCampaignName('');
      setMessage('');
      setRecipientMode('all');
      setSelectedStatuses(['novo']);
      setCustomNumbers('');
      setScheduleMode('now');
      setScheduleDate('');
      setScheduleTime('');
      setSendSpeed('slow');
      setAttachments([]);
      setUseTemplate(false);
      setTemplateName('');
      setTemplateLanguage('pt_BR');
    }
  }, [editingCampaign]);

  // ✅ AUTO-SAVE a cada 30 segundos
  useEffect(() => {
    if (!isOpen || (!campaignName && !message)) return;

    const autoSaveInterval = setInterval(() => {
      const draftData = {
        campaignName,
        message,
        recipientMode,
        selectedStatuses,
        customNumbers,
        scheduleMode,
        scheduleDate,
        scheduleTime,
        sendSpeed,
        autoSavedAt: new Date().toISOString()
      };

      localStorage.setItem('whatsapp_campaign_draft', JSON.stringify(draftData));

      // Mostrar indicador discreto
      setAutoSaveIndicator(true);
      setTimeout(() => setAutoSaveIndicator(false), 2000);
    }, 30000); // 30 segundos

    return () => clearInterval(autoSaveInterval);
  }, [isOpen, campaignName, message, recipientMode, selectedStatuses, customNumbers, scheduleMode, scheduleDate, scheduleTime, sendSpeed]);

  // ✅ CARREGAR RASCUNHO com confirmação
  useEffect(() => {
    const loadDraft = async () => {
      if (isOpen && !editingCampaign) { // ✅ Só carregar rascunho se NÃO estiver editando
        const draft = localStorage.getItem('whatsapp_campaign_draft');
        if (draft) {
          try {
            const parsed = JSON.parse(draft);

            // ✅ Verificar se o rascunho é recente (máximo 24 horas)
            const savedAt = parsed.autoSavedAt || parsed.savedAt;
            if (savedAt) {
              const hoursSinceSave = (Date.now() - new Date(savedAt).getTime()) / (1000 * 60 * 60);
              if (hoursSinceSave > 24) {
                // Rascunho muito antigo, remover automaticamente
                localStorage.removeItem('whatsapp_campaign_draft');
                console.log('[Campaign Draft] Rascunho antigo removido (>24h)');
                return;
              }
            }

            // ✅ Verificar se tem conteúdo significativo
            const hasContent = (parsed.campaignName && parsed.campaignName.trim()) ||
              (parsed.message && parsed.message.trim());

            if (!hasContent) {
              // Rascunho vazio, remover sem perguntar
              localStorage.removeItem('whatsapp_campaign_draft');
              console.log('[Campaign Draft] Rascunho vazio removido');
              return;
            }

            const confirmRestore = await confirm(
              '💾 Encontramos um rascunho salvo.\n\n' +
              `📝 Nome: ${parsed.campaignName || 'Sem nome'}\n` +
              `📅 Salvo em: ${new Date(parsed.autoSavedAt || parsed.savedAt).toLocaleString('pt-BR')}\n\n` +
              'Deseja restaurar?',
              {
                title: 'Restaurar rascunho',
                confirmLabel: 'Restaurar',
                cancelLabel: 'Descartar',
                variant: 'info',
              }
            );

            if (confirmRestore) {
              setCampaignName(parsed.campaignName || '');
              setMessage(parsed.message || '');
              setRecipientMode(parsed.recipientMode || 'all');
              setSelectedStatuses(parsed.selectedStatuses || ['novo']);
              setCustomNumbers(parsed.customNumbers || '');
              setScheduleMode(parsed.scheduleMode || 'now');
              setScheduleDate(parsed.scheduleDate || '');
              setScheduleTime(parsed.scheduleTime || '');
              setSendSpeed(parsed.sendSpeed || 'normal');
              toast.success('✅ Rascunho restaurado!');
            } else {
              localStorage.removeItem('whatsapp_campaign_draft');
              toast.info('Rascunho descartado');
            }
          } catch (e) {
            console.error('Failed to load draft:', e);
            // Remover rascunho corrompido
            localStorage.removeItem('whatsapp_campaign_draft');
          }
        }
      }
    };
    loadDraft();
  }, [isOpen, editingCampaign]); // ✅ Adicionar editingCampaign como dependência

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
      if (variableDropdownRef.current && !variableDropdownRef.current.contains(event.target as Node)) {
        setShowVariableDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ✅ BUSCAR CANAIS WHATSAPP CONECTADOS
  useEffect(() => {
    const fetchWhatsAppChannels = async () => {
      if (!isOpen) return;
      
      setLoadingChannels(true);
      try {
        const response = await channelsApi.getAll();
        // Filtrar canais WhatsApp e WhatsApp Cloud conectados (qualquer status ativo)
        const whatsappOnly = response.filter(
          (ch: any) => (ch.type === 'whatsapp' || ch.type === 'whatsapp_cloud') &&
            (ch.status === 'connected' || ch.status === 'active' || ch.status === 'pending')
        );
        setWhatsappChannels(whatsappOnly);

        // Se tiver canais, selecionar o primeiro por padrão
        if (whatsappOnly.length > 0 && !selectedChannel) {
          setSelectedChannel(whatsappOnly[0].id);
        }

        console.log('📱 Canais WhatsApp encontrados:', whatsappOnly.length, whatsappOnly);
      } catch (error) {
        console.error('❌ Erro ao buscar canais WhatsApp:', error);
        toast.error('Erro ao carregar instâncias WhatsApp');
      } finally {
        setLoadingChannels(false);
      }
    };

    fetchWhatsAppChannels();
  }, [isOpen]);

  // ✅ Status normalization + dynamic funnel stages
  const statusNormalize: Record<string, string> = {
    'new': 'novo', 'novos': 'novo',
    'contacted': 'contatado', 'contatados': 'contatado',
    'qualified': 'qualificado', 'qualificados': 'qualificado', 'qualificacao': 'qualificado',
    'negotiation': 'negociacao', 'in_negotiation': 'negociacao',
    'converted': 'convertido', 'convertidos': 'convertido',
    'lost': 'perdido', 'perdidos': 'perdido', 'rejected': 'perdido', 'discarded': 'perdido',
    'ganho': 'convertido',
  };

  const statusLabels: Record<string, string> = {
    novo: 'Novos', contatado: 'Contatados', qualificado: 'Qualificados',
    negociacao: 'Negociação', convertido: 'Convertidos', perdido: 'Perdidos',
  };

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    // Initialize with standard funnel stages
    ['novo', 'contatado', 'qualificado', 'negociacao', 'convertido', 'perdido'].forEach(s => { counts[s] = 0; });
    leads.forEach(l => {
      const raw = (l.status || 'novo').toLowerCase().trim();
      const normalized = statusNormalize[raw] || raw;
      // Only count known funnel stages
      if (counts[normalized] !== undefined) {
        counts[normalized]++;
      } else {
        // Unknown statuses go to 'novo'
        counts['novo']++;
      }
    });
    return counts;
  }, [leads]);

  const getRecipientCount = () => {
    if (recipientMode === 'all') return leads.length;
    if (recipientMode === 'segments') {
      return leads.filter(lead => {
        const raw = (lead.status || 'novo').toLowerCase().trim();
        const normalized = statusNormalize[raw] || raw;
        return selectedStatuses.includes(normalized);
      }).length;
    }
    const numbers = customNumbers.split(',').map(n => n.trim()).filter(n => n.length > 0);
    return numbers.length;
  };

  const recipientCount = getRecipientCount();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    const validFiles = files.filter(file => {
      // ✅ LIMITE GERAL: 16MB
      if (file.size > 16 * 1024 * 1024) {
        toast.error(`${file.name} excede 16MB`);
        return false;
      }

      // ✅ LIMITE ESPECIAL PARA VÍDEOS: 5MB (para evitar demora no N8N)
      if (file.type.startsWith('video/') && file.size > 5 * 1024 * 1024) {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
        toast.error(`🎥 Vídeo muito grande: ${file.name} (${sizeMB}MB)\n\n⚠️ Limite para vídeos: 5MB\n💡 Comprima em: handbrake.fr ou freeconvert.com`, { duration: 6000 });
        return false;
      }

      return true;
    });

    // ✅ Criar previews para imagens e vídeos
    const processFiles = async () => {
      const newAttachments = await Promise.all(
        validFiles.map(async (file) => {
          let preview: string | undefined;

          // Se for imagem ou vídeo, criar preview
          if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
            preview = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = (e) => resolve(e.target?.result as string);
              reader.readAsDataURL(file);
            });
          }

          return {
            name: file.name,
            size: file.size,
            type: file.type,
            file,
            preview, // ✅ URL de preview
            caption: '', // ✅ Legenda vazia inicialmente
          };
        })
      );

      setAttachments([...attachments, ...newAttachments]);

      if (newAttachments.length > 0) {
        // ✅ Avisar sobre vídeos grandes
        const videos = newAttachments.filter(a => a.type.startsWith('video/'));
        if (videos.length > 0) {
          const totalVideoSize = videos.reduce((sum, v) => sum + v.size, 0);
          const totalVideoSizeMB = (totalVideoSize / (1024 * 1024)).toFixed(2);

          if (totalVideoSize > 3 * 1024 * 1024) {
            toast.warning(`⏳ ${videos.length} vídeo(s) anexado(s) (${totalVideoSizeMB}MB)\n\nO envio pode demorar alguns minutos...`, { duration: 4000 });
          } else {
            toast.success(`✅ ${newAttachments.length} arquivo(s) anexado(s)`);
          }
        } else {
          toast.success(`✅ ${newAttachments.length} arquivo(s) anexado(s)`);
        }
      }
    };

    processFiles();
  };

  const removeAttachment = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index));
    toast.success('Arquivo removido');
  };

  // ✅ Atualizar legenda de um anexo
  const updateCaption = (index: number, caption: string) => {
    const updated = [...attachments];
    updated[index] = { ...updated[index], caption };
    setAttachments(updated);
  };

  // ✅ LIMPAR CAMPANHAS ANTIGAS DO LOCALSTORAGE (para liberar espaço)
  const cleanOldCampaigns = () => {
    try {
      const keys = Object.keys(localStorage);
      const campaignKeys = keys.filter(key => key.startsWith('campaign_') && key.endsWith('_data'));

      // Se tiver mais de 20 campanhas, remover as mais antigas
      if (campaignKeys.length > 20) {
        console.log('[Campaign WhatsApp] 🧹 Limpando campanhas antigas do localStorage...');

        // Ordenar por data (extrair timestamp do ID)
        const sorted = campaignKeys.sort((a, b) => {
          const tsA = parseInt(a.split('_')[1]) || 0;
          const tsB = parseInt(b.split('_')[1]) || 0;
          return tsA - tsB; // Mais antigas primeiro
        });

        // Remover as 10 mais antigas
        const toRemove = sorted.slice(0, 10);
        toRemove.forEach(key => {
          localStorage.removeItem(key);
          console.log('[Campaign WhatsApp] 🗑️ Removido:', key);
        });

        console.log('[Campaign WhatsApp] ✅ Limpeza concluída. Removidos:', toRemove.length);
      }
    } catch (error) {
      console.warn('[Campaign WhatsApp] ⚠️ Erro ao limpar localStorage:', error);
    }
  };

  // ✅ INSERIR VARIÁVEL NO CURSOR
  const insertVariable = (variable: string) => {
    const textarea = messageRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = message;
    const before = text.substring(0, start);
    const after = text.substring(end);

    const newMessage = before + variable + after;
    setMessage(newMessage);

    setTimeout(() => {
      textarea.focus();
      const newPosition = start + variable.length;
      textarea.setSelectionRange(newPosition, newPosition);
    }, 10);

    setShowVariableDropdown(false);
  };

  // ✅ DRAG & DROP - Drag Start
  const handleVariableDragStart = (e: React.DragEvent, variable: string) => {
    e.dataTransfer.setData('text/plain', variable);
    e.dataTransfer.effectAllowed = 'copy';
  };

  // ✅ DRAG & DROP - Drop no editor
  const handleEditorDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);

    const variable = e.dataTransfer.getData('text/plain');
    const textarea = messageRef.current;

    if (!textarea || !variable) return;

    const cursorPos = textarea.selectionStart;
    const textBefore = message.substring(0, cursorPos);
    const textAfter = message.substring(cursorPos);

    const newMessage = textBefore + variable + textAfter;
    setMessage(newMessage);

    setTimeout(() => {
      textarea.focus();
      const newPos = cursorPos + variable.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 10);

    toast.success(`Variável ${variable} inserida!`);
  };

  const handleEditorDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDraggingOver(true);
  };

  const handleEditorDragLeave = () => {
    setIsDraggingOver(false);
  };

  // ✅ INSERIR EMOJI
  const handleEmojiClick = (emojiObject: any) => {
    const textarea = messageRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = message;
    const before = text.substring(0, start);
    const after = text.substring(end);

    const newMessage = before + emojiObject.emoji + after;
    setMessage(newMessage);

    setTimeout(() => {
      textarea.focus();
      const newPosition = start + emojiObject.emoji.length;
      textarea.setSelectionRange(newPosition, newPosition);
    }, 10);

    setShowEmojiPicker(false);
  };

  // ✅ APLICAR FORMATAÇÃO (NEGRITO/ITÁLICO/LINK)
  const applyFormatting = (format: 'bold' | 'italic' | 'link') => {
    const textarea = messageRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = message.substring(start, end);

    if (!selectedText && format !== 'bold' && format !== 'italic') {
      toast.info('Selecione um texto primeiro');
      return;
    }

    let formattedText = '';

    switch (format) {
      case 'bold':
        if (selectedText) {
          formattedText = `*${selectedText}*`;
          toast.success('Negrito aplicado');
        } else {
          // Inserir ** no cursor
          formattedText = '**';
          const before = message.substring(0, start);
          const after = message.substring(start);
          const newMessage = before + formattedText + after;
          setMessage(newMessage);
          setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + 1, start + 1);
          }, 10);
          return;
        }
        break;
      case 'italic':
        if (selectedText) {
          formattedText = `_${selectedText}_`;
          toast.success('Itálico aplicado');
        } else {
          // Inserir __ no cursor
          formattedText = '__';
          const before = message.substring(0, start);
          const after = message.substring(start);
          const newMessage = before + formattedText + after;
          setMessage(newMessage);
          setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + 1, start + 1);
          }, 10);
          return;
        }
        break;
      case 'link':
        const url = prompt('Digite a URL:');
        if (url) {
          formattedText = `${selectedText} (${url})`;
          toast.success('Link inserido');
        } else {
          return;
        }
        break;
    }

    const before = message.substring(0, start);
    const after = message.substring(end);
    const newMessage = before + formattedText + after;

    setMessage(newMessage);

    setTimeout(() => {
      textarea.focus();
      const newPosition = start + formattedText.length;
      textarea.setSelectionRange(newPosition, newPosition);
    }, 10);
  };

  // ✅ RENDERIZAR PREVIEW COM FORMATAÇÃO
  const renderFormattedPreview = (text: string) => {
    // Substituir variáveis (usando inline styles para evitar styled-jsx)
    const variableStyle = 'background:#DBEAFE;color:#1E40AF;padding:2px 6px;border-radius:4px;font-family:Monaco,monospace;font-size:0.85em';
    let formatted = text
      .replace(/{name}/gi, `<span style="${variableStyle}">João Silva</span>`)
      .replace(/{phone}/gi, `<span style="${variableStyle}">+258843210987</span>`)
      .replace(/{email}/gi, `<span style="${variableStyle}">joao@exemplo.com</span>`)
      .replace(/{company}/gi, `<span style="${variableStyle}">Empresa XYZ</span>`);

    // Aplicar negrito
    formatted = formatted.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');

    // Aplicar itálico
    formatted = formatted.replace(/_([^_]+)_/g, '<em>$1</em>');

    // Quebras de linha
    formatted = formatted.replace(/\n/g, '<br/>');

    return formatted;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getEstimatedTime = () => {
    // Slow: 15-45s (média 30s = ~2 msgs/min) | Normal: 10-25s (~3.5/min) | Fast: 6-15s (~5.5/min)
    const messagesPerMinute = sendSpeed === 'slow' ? 2 : sendSpeed === 'normal' ? 3.5 : 5.5;
    const totalMinutes = Math.ceil(recipientCount / messagesPerMinute);

    if (totalMinutes < 1) return '< 1 minuto';
    if (totalMinutes < 60) return `~${totalMinutes} min`;

    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `~${hours}h ${mins}min`;
  };

  const resetForm = () => {
    setCampaignName('');
    setMessage('');
    setAttachments([]);
    setRecipientMode('all');
    setSelectedStatuses(['novo']);
    setCustomNumbers('');
    setScheduleMode('now');
    setScheduleDate('');
    setScheduleTime('');
    setSendSpeed('slow');
    setAdvancedOpen(false);
    setStopOnError(true);
    setSkipInvalid(true);
    setRandomDelay(false);
    setUseTemplate(false);
    setTemplateName('');
    setTemplateLanguage('pt_BR');
  };

  // ✅ ENVIAR CAMPANHA
  const handleSend = async () => {
    console.log('[Campaign WhatsApp] 🚀 ========== INICIANDO ENVIO ==========');
    console.log('[Campaign WhatsApp] 📋 Nome:', campaignName);
    console.log('[Campaign WhatsApp] 💬 Mensagem:', message);
    console.log('[Campaign WhatsApp] 👥 Destinatários:', recipientCount);

    // Validações
    if (!campaignName.trim()) {
      toast.error('⚠️ Digite um nome para a campanha');
      console.log('[Campaign WhatsApp] ❌ Validação falhou: Nome vazio');
      return;
    }

    // ✅ Validar instância WhatsApp selecionada
    if (!selectedChannel && whatsappChannels.length > 0) {
      toast.error('⚠️ Selecione uma instância WhatsApp');
      console.log('[Campaign WhatsApp] ❌ Validação falhou: Nenhuma instância selecionada');
      return;
    }

    if (whatsappChannels.length === 0) {
      toast.error('⚠️ Nenhuma instância WhatsApp conectada. Configure em Canais.');
      console.log('[Campaign WhatsApp] ❌ Validação falhou: Nenhuma instância disponível');
      return;
    }

    // ✅ Permitir envio com: mensagem OU imagem/vídeo com legenda OU qualquer anexo
    const hasMessage = message.trim().length > 0;
    const hasMediaWithCaption = attachments.some(att =>
      (att.type.startsWith('image/') || att.type.startsWith('video/')) &&
      att.caption &&
      att.caption.trim().length > 0
    );
    const hasAttachment = attachments.length > 0;

    if (!hasMessage && !hasMediaWithCaption && !hasAttachment) {
      toast.error('⚠️ Digite uma mensagem, adicione mídia com legenda ou anexe um arquivo');
      console.log('[Campaign WhatsApp] ❌ Validação falhou: Sem conteúdo');
      return;
    }

    if (recipientCount === 0) {
      toast.error('⚠️ Selecione ao menos um destinatário');
      console.log('[Campaign WhatsApp] ❌ Validação falhou: Sem destinatários');
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

    console.log('[Campaign WhatsApp] ✅ Todas as validações passaram!');

    // Confirmar envio
    const confirmMessage = scheduleMode === 'now'
      ? `📤 Você está prestes a enviar para ${recipientCount} destinatário(s).\n\n✅ Confirmar envio?`
      : `📅 Agendar campanha para ${new Date(`${scheduleDate}T${scheduleTime}`).toLocaleString('pt-BR')}?\n\n📤 ${recipientCount} destinatário(s)`;

    const confirmed = await confirm(confirmMessage, {
      title: scheduleMode === 'now' ? 'Confirmar envio' : 'Confirmar agendamento',
      confirmLabel: scheduleMode === 'now' ? 'Enviar' : 'Agendar',
      variant: 'info',
      detail: `${recipientCount} destinatário(s)`
    });

    if (!confirmed) {
      console.log('[Campaign WhatsApp] ❌ Usuário cancelou o envio');
      return;
    }

    console.log('[Campaign WhatsApp] ✅ Usuário confirmou o envio');
    setIsSending(true);

    try {
      // Preparar destinatários
      let recipients: any[] = [];

      if (recipientMode === 'all') {
        recipients = leads.filter(l => l.telefone).map(l => ({
          phone: l.telefone,
          name: l.nome,
          email: l.email,
          company: l.empresa
        }));
      } else if (recipientMode === 'segments') {
        recipients = leads
          .filter(l => {
            if (!l.telefone) return false;
            const raw = (l.status || 'novo').toLowerCase().trim();
            const normalized = statusNormalize[raw] || raw;
            return selectedStatuses.includes(normalized);
          })
          .map(l => ({
            phone: l.telefone,
            name: l.nome,
            email: l.email,
            company: l.empresa
          }));
      } else if (recipientMode === 'custom') {
        const numbers = customNumbers.split(',').map(n => n.trim()).filter(n => n.length > 0);
        recipients = numbers.map(phone => ({ phone, name: phone }));
      }

      console.log('[Campaign WhatsApp] 📋 Total de destinatários preparados:', recipients.length);
      console.log('[Campaign WhatsApp] 📋 Destinatários:', recipients);

      // Verificar token de autenticação
      const token = localStorage.getItem('leadflow_access_token');
      if (!token) {
        toast.error('Você precisa estar autenticado');
        setIsSending(false);
        return;
      }

      // ✅ Obter instância/credenciais do canal selecionado (usa variável do componente)
      let evolutionInstance = '';
      const isWhatsAppCloud = selectedChannelData?.type === 'whatsapp_cloud';

      if (selectedChannelData) {
        const credentials = typeof selectedChannelData.credentials === 'string'
          ? JSON.parse(selectedChannelData.credentials)
          : selectedChannelData.credentials;

        if (isWhatsAppCloud) {
          // WhatsApp Cloud: usa phone_number_id como identificador
          evolutionInstance = credentials?.phone_number_id || selectedChannelData.name || '';
          console.log('[Campaign WhatsApp] ☁️ Canal WhatsApp Cloud selecionado:', evolutionInstance, '(Canal:', selectedChannelData.name, ')');
        } else {
          // Evolution API: usa instance_id
          evolutionInstance = credentials?.instance_id || credentials?.instance_name || selectedChannelData.name || '';
          console.log('[Campaign WhatsApp] 📱 Instância Evolution selecionada:', evolutionInstance, '(Canal:', selectedChannelData.name, ')');
        }
      } else {
        evolutionInstance = localStorage.getItem('evolution_instance_name') || '';
        console.log('[Campaign WhatsApp] 📱 Usando instância do localStorage:', evolutionInstance);
      }

      if (!evolutionInstance) {
        toast.error('⚠️ Selecione uma instância WhatsApp conectada!');
        setIsSending(false);
        console.log('[Campaign WhatsApp] ❌ Nenhuma instância selecionada');
        return;
      }

      // ✅ CONVERTER ARQUIVOS PARA BASE64 (com otimização para vídeos)
      const attachmentsData = await Promise.all(
        attachments.map(async (att) => {
          // ✅ OTIMIZAÇÃO ESPECIAL PARA VÍDEOS
          if (att.type.startsWith('video/')) {
            const videoSizeMB = att.size / (1024 * 1024);
            console.log(`[Campaign WhatsApp] 🎥 Processando vídeo: ${att.name} (${videoSizeMB.toFixed(2)}MB original)`);

            // Se vídeo > 3MB, avisar que pode demorar
            if (videoSizeMB > 3) {
              console.warn(`[Campaign WhatsApp] ⚠️ Vídeo grande detectado! ${videoSizeMB.toFixed(2)}MB - Pode demorar...`);
              toast.info(`⏳ Processando vídeo (${videoSizeMB.toFixed(2)}MB)...`, { duration: 2000 });
            }
          }

          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const result = reader.result as string;
              const base64Data = result.split(',')[1];

              // ✅ CALCULAR TAMANHO REAL DO BASE64 (para vídeos apenas)
              if (att.type.startsWith('video/')) {
                const base64SizeMB = (base64Data.length * 0.75) / (1024 * 1024);
                const originalSizeMB = att.size / (1024 * 1024);
                console.log(`[Campaign WhatsApp] 📊 Vídeo convertido:`);
                console.log(`   • Tamanho original: ${originalSizeMB.toFixed(2)}MB`);
                console.log(`   • Tamanho base64: ${base64SizeMB.toFixed(2)}MB`);
                console.log(`   • Aumento: ${((base64SizeMB / originalSizeMB - 1) * 100).toFixed(1)}%`);
              }

              resolve(base64Data);
            };
            reader.readAsDataURL(att.file);
          });

          return {
            name: att.name,
            type: att.type,
            size: att.size,
            base64: base64,
            caption: att.caption || undefined, // ✅ Incluir legenda se existir
          };
        })
      );

      // ✅ MODO EDIÇÃO vs CRIAÇÃO
      const isEditing = !!editingCampaign;
      const campaignId = isEditing ? editingCampaign.id : `campaign_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      console.log(`[Campaign WhatsApp] ${isEditing ? '✏️ EDITANDO' : '🆔 CRIANDO'} campanha:`, campaignId);

      // ✅ CRIAR/ATUALIZAR OBJETO DA CAMPANHA
      const campaignObject = {
        id: campaignId,
        name: campaignName,
        type: 'whatsapp' as const,
        status: scheduleMode === 'scheduled' ? 'scheduled' as const : 'active' as const,
        totalRecipients: recipients.length,
        sent: isEditing ? editingCampaign.sent || 0 : 0,
        delivered: isEditing ? editingCampaign.delivered || 0 : 0,
        read: isEditing ? editingCampaign.read || 0 : 0,
        progress: isEditing ? editingCampaign.progress || 0 : 0,
        estimatedTime: scheduleMode === 'now' ? parseInt(getEstimatedTime().replace(/\D/g, '')) || 1 : undefined,
        deliveryRate: isEditing ? editingCampaign.deliveryRate || 0 : 0,
        scheduledDate: scheduleMode === 'scheduled' ? `${scheduleDate}T${scheduleTime}` : undefined,
        createdAt: isEditing ? editingCampaign.createdAt : new Date().toISOString(),
      };

      console.log(`[Campaign WhatsApp] ${isEditing ? '✏️' : '🎉'} Objeto da campanha ${isEditing ? 'atualizado' : 'criado'}:`, campaignObject);

      // ✅ LIMPAR CAMPANHAS ANTIGAS ANTES DE SALVAR (liberar espaço)
      if (!isEditing) {
        cleanOldCampaigns();
      }

      // ✅ SALVAR DADOS DA CAMPANHA NO LOCALSTORAGE (SEM base64 para evitar QuotaExceededError)
      const campaignFullData = {
        campaignName,
        message,
        recipientMode,
        selectedStatuses,
        customNumbers,
        scheduleMode,
        scheduleDate,
        scheduleTime,
        sendSpeed,
        // ✅ Salvar apenas metadados dos attachments (sem base64)
        attachments: attachments.map(att => ({
          name: att.name,
          type: att.type,
          size: att.size,
          caption: att.caption,
          // ❌ NÃO salvar base64 (muito grande para localStorage)
        })),
      };

      try {
        localStorage.setItem(`campaign_${campaignId}_data`, JSON.stringify(campaignFullData));
        console.log('[Campaign WhatsApp] 💾 Dados da campanha salvos no localStorage:', campaignId);
      } catch (error) {
        console.warn('[Campaign WhatsApp] ⚠️ Não foi possível salvar no localStorage (provavelmente excedeu quota):', error);
        // Não bloquear o envio por erro no localStorage
      }

      // ✅ CHAMAR CALLBACK CORRETO (CRIAR vs ATUALIZAR)
      if (isEditing && onCampaignUpdated) {
        console.log('[Campaign WhatsApp] ✏️ Chamando onCampaignUpdated...');
        onCampaignUpdated(campaignObject);
        console.log('[Campaign WhatsApp] ✅ Campanha atualizada na lista!');
      } else if (!isEditing && onCampaignCreated) {
        console.log('[Campaign WhatsApp] 📌 Chamando onCampaignCreated...');
        onCampaignCreated(campaignObject);
        console.log('[Campaign WhatsApp] ✅ Campanha adicionada à lista!');
      } else {
        console.warn('[Campaign WhatsApp] ⚠️ Callback não está definido!');
      }

      // ✅ PREPARAR DELAYS EM SEGUNDOS (anti-ban WhatsApp)
      // Slow: 15-45s | Normal: 10-25s | Fast: 6-15s
      let minDelaySeconds: number;
      let maxDelaySeconds: number;
      let batchSize: number;
      let batchPauseMinSeconds: number;
      let batchPauseMaxSeconds: number;
      let dailyLimit: number;

      if (randomDelay) {
        // Usar delays customizados do usuário
        minDelaySeconds = parseInt(minDelay);
        maxDelaySeconds = parseInt(maxDelay);
        batchSize = 20;
        batchPauseMinSeconds = 90;
        batchPauseMaxSeconds = 180;
        dailyLimit = 150;
      } else {
        if (sendSpeed === 'slow') {
          // ~2 msgs/min — conta nova ou histórico de ban — MÁXIMA segurança
          minDelaySeconds = 15;
          maxDelaySeconds = 45;
          batchSize = 15;
          batchPauseMinSeconds = 120;
          batchPauseMaxSeconds = 240;
          dailyLimit = 100;
        } else if (sendSpeed === 'normal') {
          // ~3.5 msgs/min — conta com alguma actividade
          minDelaySeconds = 10;
          maxDelaySeconds = 25;
          batchSize = 20;
          batchPauseMinSeconds = 90;
          batchPauseMaxSeconds = 180;
          dailyLimit = 200;
        } else {
          // fast — ~5.5 msgs/min — conta estabelecida, risco moderado
          minDelaySeconds = 6;
          maxDelaySeconds = 15;
          batchSize = 25;
          batchPauseMinSeconds = 60;
          batchPauseMaxSeconds = 120;
          dailyLimit = 300;
        }
      }

      console.log('[Campaign WhatsApp] ⏱️ Delays configurados:', { minDelaySeconds, maxDelaySeconds });

      // ✅ SEPARAR ATTACHMENTS POR TIPO (para Router do N8N)
      const images = attachmentsData.filter(att => att.type.startsWith('image/'));
      const videos = attachmentsData.filter(att => att.type.startsWith('video/'));
      const documents = attachmentsData.filter(att =>
        !att.type.startsWith('image/') && !att.type.startsWith('video/')
      );

      console.log('[Campaign WhatsApp] 📊 Attachments separados:', {
        images: images.length,
        videos: videos.length,
        documents: documents.length
      });

      // Preparar dados da campanha para N8N
      const campaignData = {
        id: campaignId,
        campaignName,
        message,
        recipients,
        instancia: evolutionInstance,
        instanceName: evolutionInstance,
        scheduleMode,
        scheduledDateTime: scheduleMode === 'scheduled' ? `${scheduleDate}T${scheduleTime}` : null,
        sendSpeed,
        stopOnError,
        skipInvalid,
        // ✅ DELAYS EM SEGUNDOS
        minDelaySeconds,
        maxDelaySeconds,
        delayBetweenMessagesSeconds: Math.floor((minDelaySeconds + maxDelaySeconds) / 2), // Média

        // ✅ ATTACHMENTS SEPARADOS POR TIPO (para Router do N8N direcionar corretamente)
        // Imagens: send-image node
        images: images.length > 0 ? images : undefined,
        // Vídeos: send-video node
        videos: videos.length > 0 ? videos : undefined,
        // Documentos: send-document node
        documents: documents.length > 0 ? documents : undefined,

        // ✅ Array completo (para compatibilidade)
        attachments: attachmentsData,

        recipientCount: recipients.length,
        messagesPerMinute: Math.floor(60 / ((minDelaySeconds + maxDelaySeconds) / 2)),
      };

      console.log('[Campaign WhatsApp] 📤 Payload preparado:', JSON.stringify(campaignData, null, 2));

      // ✅ DECISÃO: Enviar agora OU agendar para depois
      if (scheduleMode === 'scheduled') {
        // ✅ MODO AGENDADO: Salvar no banco e deixar o scheduler disparar
        console.log('[Campaign WhatsApp] 📅 Modo agendado detectado - salvando no banco...');

        // Obter token de autenticação
        const token = localStorage.getItem('leadflow_access_token');
        if (!token) {
          toast.error('Você precisa estar autenticado');
          setIsSending(false);
          return;
        }

        // ✅ Upload de arquivos novos para MinIO
        const uploadedMediaUrls: string[] = [];

        for (const attachment of attachments.filter(a => !a.isExisting)) {
          const formData = new FormData();
          formData.append('file', attachment.file);

          console.log('[Campaign WhatsApp] 📤 Upload para MinIO:', attachment.name);

          const uploadResponse = await fetch(`${(import.meta as any).env.VITE_API_URL}/api/campaigns/upload-media`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData,
          });

          if (!uploadResponse.ok) {
            throw new Error(`Erro ao fazer upload de ${attachment.name}`);
          }

          const uploadData = await uploadResponse.json();
          uploadedMediaUrls.push(uploadData.url);
          console.log('[Campaign WhatsApp] ✅ Arquivo enviado:', uploadData.url);
        }

        // ✅ Combinar URLs existentes + novas
        const existingUrls = attachments.filter(a => a.isExisting && a.url).map(a => a.url!);
        const allMediaUrls = [...existingUrls, ...uploadedMediaUrls];

        // ✅ Preparar dados para salvar no banco
        const campaignDataForDB = {
          name: campaignName,
          description: `Campanha com ${recipientCount} destinatários`,
          type: 'whatsapp',
          status: 'scheduled',
          template: message,
          settings: {
            recipientMode,
            selectedStatuses,
            // Só aplica segmentos quando o modo é efetivamente por segmentos
            segments: recipientMode === 'segments' ? selectedStatuses : [],
            customNumbers,
            scheduleMode,
            scheduleDate,
            scheduleTime,
            sendSpeed,
            recipientCount,
            stopOnError,
            skipInvalid,
            minDelaySeconds,
            maxDelaySeconds,
            batchSize,
            batchPauseMinSeconds,
            batchPauseMaxSeconds,
            dailyLimit,
            channelId: selectedChannel,
            channelType: selectedChannelData?.type || 'whatsapp',
            // API Oficial (Cloud API) — template messages
            useTemplate: isCloudChannel ? useTemplate : false,
            templateName: isCloudChannel && useTemplate ? templateName.trim() : undefined,
            templateLanguage: isCloudChannel && useTemplate ? templateLanguage : undefined,
          },
          media_urls: allMediaUrls,
          // Construir data com timezone local do usuário
          scheduled_at: (() => {
            // Parse date components and create Date in local timezone
            const [year, month, day] = scheduleDate.split('-').map(Number);
            const [hour, minute] = scheduleTime.split(':').map(Number);
            // Date constructor with parameters uses local timezone
            const localDate = new Date(year, month - 1, day, hour, minute);
            // toISOString() automatically converts to UTC
            return localDate.toISOString();
          })(),
        };

        console.log('[Campaign WhatsApp] 💾 Salvando campanha agendada:', campaignDataForDB);

        // ✅ Salvar no banco de dados
        const isEditing = !!editingCampaign;
        const url = isEditing
          ? `${(import.meta as any).env.VITE_API_URL}/api/campaigns/${editingCampaign.id}`
          : `${(import.meta as any).env.VITE_API_URL}/api/campaigns`;
        const method = isEditing ? 'PUT' : 'POST';

        const saveResponse = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(campaignDataForDB),
        });

        if (!saveResponse.ok) {
          const errorData = await saveResponse.json();
          throw new Error(errorData.error || 'Erro ao salvar campanha');
        }

        const savedCampaign = await saveResponse.json();
        console.log('[Campaign WhatsApp] ✅ Campanha agendada salva no banco:', savedCampaign);

        // ✅ Notificar componente pai
        if (isEditing && onCampaignUpdated) {
          await onCampaignUpdated(savedCampaign);
        } else if (!isEditing && onCampaignCreated) {
          await onCampaignCreated(savedCampaign);
        }

      } else {
        // ✅ MODO IMEDIATO: Salvar no banco e disparar via executor do backend
        console.log('[Campaign WhatsApp] 🚀 Modo imediato - salvando e disparando via backend...');

        // 1. Upload de arquivos novos (se houver)
        const uploadedMediaUrls: string[] = [];
        for (const attachment of attachments.filter(a => !a.isExisting)) {
          const formData = new FormData();
          formData.append('file', attachment.file);
          const uploadResponse = await fetch(`${(import.meta as any).env.VITE_API_URL}/api/campaigns/upload-media`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData,
          });
          if (uploadResponse.ok) {
            const uploadData = await uploadResponse.json();
            uploadedMediaUrls.push(uploadData.url);
          }
        }

        const existingUrls = attachments.filter(a => a.isExisting && a.url).map(a => a.url!);
        const allMediaUrls = [...existingUrls, ...uploadedMediaUrls];

        // 2. Salvar no Banco como 'pending' — o executor mudará para 'active'
        const campaignDataForDB = {
          name: campaignName,
          description: `Disparo imediato para ${recipientCount} destinatários`,
          type: 'whatsapp',
          status: 'pending',
          template: message,
          settings: {
            recipientMode,
            selectedStatuses,
            // Só envia 'segments' quando o modo é efetivamente por segmentos
            segments: recipientMode === 'segments' ? selectedStatuses : [],
            customNumbers,
            scheduleMode: 'now',
            sendSpeed,
            recipientCount,
            stopOnError,
            skipInvalid,
            minDelaySeconds,
            maxDelaySeconds,
            batchSize,
            batchPauseMinSeconds,
            batchPauseMaxSeconds,
            dailyLimit,
            channelId: selectedChannel,
            channelType: selectedChannelData?.type || 'whatsapp',
            // API Oficial (Cloud API) — template messages
            useTemplate: isCloudChannel ? useTemplate : false,
            templateName: isCloudChannel && useTemplate ? templateName.trim() : undefined,
            templateLanguage: isCloudChannel && useTemplate ? templateLanguage : undefined,
          },
          media_urls: allMediaUrls
        };

        let savedCampaignId = campaignId;
        try {
          const isEditing = !!editingCampaign;
          const url = isEditing
            ? `${(import.meta as any).env.VITE_API_URL}/api/campaigns/${editingCampaign.id}`
            : `${(import.meta as any).env.VITE_API_URL}/api/campaigns`;
          const method = isEditing ? 'PUT' : 'POST';

          const saveResponse = await fetch(url, {
            method,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(campaignDataForDB),
          });

          if (saveResponse.ok) {
            const savedCampaign = await saveResponse.json();
            savedCampaignId = savedCampaign.id;
            console.log('[Campaign WhatsApp] ✅ Campanha salva no banco:', savedCampaignId);
            // Não notifica a UI ainda — aguarda o execute setar status 'active'
          }
        } catch (err) {
          console.warn('[Campaign WhatsApp] ⚠️ Erro ao salvar no banco, mas prosseguindo com trigger:', err);
        }

        // 3. Disparar via executor do backend (atualiza stats e status em tempo real)
        try {
          const executeResponse = await fetch(
            `${(import.meta as any).env.VITE_API_URL}/api/campaigns/${savedCampaignId}/execute`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
              },
            }
          );
          if (executeResponse.ok) {
            console.log('[Campaign WhatsApp] ✅ Execução iniciada pelo backend');
            toast.success('🚀 Disparo iniciado com sucesso!');
            // Notificar UI agora que a campanha está 'active' no banco
            const isEditing = !!editingCampaign;
            if (isEditing && onCampaignUpdated) {
              onCampaignUpdated({ id: savedCampaignId, status: 'active' });
            } else if (!isEditing && onCampaignCreated) {
              onCampaignCreated({ id: savedCampaignId, status: 'active' });
            }
          } else {
            const err = await executeResponse.json().catch(() => ({ error: 'Erro desconhecido' }));
            console.error('[Campaign WhatsApp] ❌ Erro ao executar:', err);
            toast.warning(`⚠️ Campanha salva, mas erro ao iniciar: ${err.error || 'Verifique os logs'}`);
          }
        } catch (execError: any) {
          console.error('[Campaign WhatsApp] ❌ Erro de rede ao executar:', execError);
          toast.warning('⚠️ Campanha salva. Iniciando em segundo plano...');
        }
      }

      // ✅ MOSTRAR TOAST DE SUCESSO
      if (scheduleMode === 'scheduled') {
        const scheduledDateObj = new Date(`${scheduleDate}T${scheduleTime}`);
        toast.success(
          `📅 Campanha "${campaignName}" agendada!\n\n` +
          `🗓️ ${scheduledDateObj.toLocaleString('pt-BR')}\n` +
          `📤 ${recipientCount} destinatário(s)`,
          { duration: 6000 }
        );
        console.log('[Campaign WhatsApp] 📅 Toast de agendamento exibido');
      } else {
        toast.success(
          `✅ Campanha "${campaignName}" iniciada!\n\n` +
          `📤 Enviando para ${recipientCount} contato(s)...\n` +
          `⏱️ Tempo estimado: ${getEstimatedTime()}`,
          { duration: 5000 }
        );
        console.log('[Campaign WhatsApp] ✅ Toast de envio exibido');
      }

      // ✅ LIMPAR RASCUNHO
      localStorage.removeItem('whatsapp_campaign_draft');
      console.log('[Campaign WhatsApp] 🗑️ Rascunho removido do localStorage');

      // ✅ RESETAR FORMULÁRIO
      resetForm();
      console.log('[Campaign WhatsApp] 🔄 Formulário resetado');

      // Fechar modal
      console.log('[Campaign WhatsApp] 🚪 Fechando modal...');
      onClose();
      console.log('[Campaign WhatsApp] ========== ENVIO CONCLUÍDO ==========');

    } catch (error) {
      console.error('[Campaign WhatsApp] ❌ Erro ao processar campanha:', error);
      toast.error(
        `❌ Erro ao processar campanha\n\n` +
        `${error instanceof Error ? error.message : 'Verifique as configurações.'}`,
        { duration: 5000 }
      );
    } finally {
      setIsSending(false);
    }
  };

  // ✅ SALVAR RASCUNHO MANUALMENTE (NO BANCO DE DADOS)
  const handleSaveDraft = async () => {
    try {
      const isEditing = editingCampaign && editingCampaign.id;
      console.log(`[Campaign Save] 💾 ${isEditing ? 'Atualizando' : 'Salvando'} campanha no banco de dados...`);

      const token = localStorage.getItem('leadflow_access_token');
      if (!token) {
        toast.error('Você precisa estar autenticado');
        return;
      }

      // ✅ Separar arquivos novos dos existentes
      const newAttachments = attachments.filter(a => !a.isExisting);
      const existingUrls = attachments.filter(a => a.isExisting && a.url).map(a => a.url!);

      console.log('[Campaign Save] Arquivos novos:', newAttachments.length);
      console.log('[Campaign Save] Arquivos existentes:', existingUrls.length);

      // Upload apenas dos arquivos novos para o MinIO
      const uploadedMediaUrls: string[] = [];

      for (const attachment of newAttachments) {
        const formData = new FormData();
        formData.append('file', attachment.file);

        console.log('[Campaign Save] Uploading file to MinIO:', attachment.name);

        const uploadResponse = await fetch(`${(import.meta as any).env.VITE_API_URL}/api/campaigns/upload-media`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          body: formData,
        });

        if (!uploadResponse.ok) {
          throw new Error(`Erro ao fazer upload de ${attachment.name}`);
        }

        const uploadData = await uploadResponse.json();
        uploadedMediaUrls.push(uploadData.url);
        console.log('[Campaign Save] File uploaded:', uploadData.url);
      }

      // ✅ Combinar URLs existentes + novas
      const allMediaUrls = [...existingUrls, ...uploadedMediaUrls];

      // Preparar dados da campanha
      const campaignData = {
        name: campaignName || 'Nova Campanha WhatsApp',
        description: `Campanha com ${recipientCount} destinatários`,
        type: 'whatsapp',
        status: editingCampaign?.status || 'draft',
        template: message,
        settings: {
          recipientMode,
          selectedStatuses,
          customNumbers,
          scheduleMode,
          scheduleDate: scheduleMode === 'scheduled' ? scheduleDate : null,
          scheduleTime: scheduleMode === 'scheduled' ? scheduleTime : null,
          sendSpeed,
          recipientCount,
        },
        media_urls: allMediaUrls,
        // Construir data com timezone local do usuário
        scheduled_at: scheduleMode === 'scheduled' ? (() => {
          // Parse date components and create Date in local timezone
          const [year, month, day] = scheduleDate.split('-').map(Number);
          const [hour, minute] = scheduleTime.split(':').map(Number);
          // Date constructor with parameters uses local timezone
          const localDate = new Date(year, month - 1, day, hour, minute);
          // toISOString() automatically converts to UTC
          return localDate.toISOString();
        })() : null,
      };

      console.log('[Campaign Save] Dados a serem salvos:', campaignData);
      if (scheduleMode === 'scheduled') {
        console.log('[Campaign Save] 🌍 Timezone offset:', new Date().getTimezoneOffset(), 'minutos');
        console.log('[Campaign Save] 📅 Data local selecionada:', `${scheduleDate}T${scheduleTime}`);
        console.log('[Campaign Save] 📅 Data UTC salva:', campaignData.scheduled_at);
      }

      // ✅ Decidir entre POST (criar) ou PUT (atualizar)
      const url = isEditing
        ? `${(import.meta as any).env.VITE_API_URL}/api/campaigns/${editingCampaign.id}`
        : `${(import.meta as any).env.VITE_API_URL}/api/campaigns`;

      const method = isEditing ? 'PUT' : 'POST';

      // Salvar no banco de dados
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(campaignData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao salvar campanha');
      }

      const savedCampaign = await response.json();
      console.log(`[Campaign Save] ✅ Campanha ${isEditing ? 'atualizada' : 'salva'} com sucesso:`, savedCampaign);

      toast.success(`💾 ${isEditing ? 'Alterações salvas' : 'Rascunho salvo'} com sucesso!`, { duration: 3000 });

      // ✅ Notificar componente pai
      if (isEditing && onCampaignUpdated) {
        onCampaignUpdated(savedCampaign);
      } else if (!isEditing && onCampaignCreated) {
        onCampaignCreated(savedCampaign);
      }

      // Fechar modal após salvar
      setTimeout(() => {
        onClose();
      }, 1000);

    } catch (error) {
      console.error('[Campaign Save] ❌ Erro ao salvar campanha:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar campanha');
    }
  };

  // ✅ FECHAR COM CONFIRMAÇÃO
  const handleClose = async () => {
    if (message.trim() || campaignName.trim() || attachments.length > 0) {
      const confirmDiscard = await confirm(
        '⚠️ Você tem alterações não salvas.\n\n' +
        '💾 Deseja salvar como rascunho antes de fechar?',
        {
          title: 'Alterações não salvas',
          confirmLabel: 'Salvar rascunho',
          cancelLabel: 'Não salvar',
          variant: 'warning',
        }
      );

      if (confirmDiscard) {
        handleSaveDraft();
      } else {
        const confirmDelete = await confirm('❌ Descartar todas as alterações?', {
          title: 'Descartar alterações',
          confirmLabel: 'Descartar',
          variant: 'danger',
        });
        if (confirmDelete) {
          localStorage.removeItem('whatsapp_campaign_draft');
          resetForm();
        } else {
          return; // Não fechar
        }
      }
    }

    onClose();
  };

  if (!isOpen) return null;

  // Obter data mínima (hoje)
  const today = new Date();
  const minDate = today.toISOString().split('T')[0];
  const minTime = scheduleDate === minDate ? today.toTimeString().slice(0, 5) : '00:00';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4">
      <div className="campaign-modal rounded-2xl shadow-lg w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-[#25D366] to-[#128C7E] px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl text-white font-bold">💬 NOVA CAMPANHA (WhatsApp)</h2>
              {autoSaveIndicator && (
                <p className="text-xs text-white/80">💾 Auto-salvando...</p>
              )}
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-white/80 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* COLUNA ESQUERDA - EDITOR */}
            <div className="space-y-6">

              {/* Nome da Campanha */}
              <div>
                <Label className="text-sm font-medium text-foreground/80 mb-2 block">
                  Nome da Campanha *
                </Label>
                <Input
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="Ex: Promoção Black Friday"
                  className="h-11 !bg-card !text-foreground dark:!text-foreground !border-border dark:!border-border"
                />
              </div>

              {/* ✅ Seletor de Instância WhatsApp */}
              <div>
                <Label className="text-sm font-medium text-foreground/80 mb-2 flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-green-600" />
                  Instância WhatsApp *
                </Label>
                {loadingChannels ? (
                  <div className="h-11 flex items-center justify-center bg-muted/50 rounded-lg border border-border">
                    <span className="text-sm text-muted-foreground">Carregando instâncias...</span>
                  </div>
                ) : whatsappChannels.length === 0 ? (
                  <div className="h-11 flex items-center justify-center bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-700">
                    <span className="text-sm text-yellow-600 dark:text-yellow-400">
                      ⚠️ Nenhuma instância conectada. Configure em Canais.
                    </span>
                  </div>
                ) : (
                  <select
                    value={selectedChannel}
                    onChange={(e) => setSelectedChannel(e.target.value)}
                    className="w-full h-11 px-3 rounded-lg border border-border bg-card text-foreground focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                  >
                    {whatsappChannels.map((channel) => {
                      const credentials = typeof channel.credentials === 'string'
                        ? JSON.parse(channel.credentials)
                        : channel.credentials;
                      const isCloud = channel.type === 'whatsapp_cloud';
                      const instanceName = isCloud
                        ? (credentials?.display_phone_number || credentials?.phone_number_id || 'Cloud')
                        : (credentials?.instance_name || channel.name);
                      return (
                        <option key={channel.id} value={channel.id}>
                          {isCloud ? '☁️' : '📱'} {channel.name} ({instanceName})
                        </option>
                      );
                    })}
                  </select>
                )}
              </div>

              {/* ☁️ Painel de API Oficial (WhatsApp Cloud) */}
              {isCloudChannel && (
                <div className="rounded-xl border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-base">☁️</span>
                    <span className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                      API Oficial Meta — WhatsApp Cloud
                    </span>
                  </div>

                  {/* Toggle: Template ou Mensagem Livre */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-blue-700 dark:text-blue-400">Usar Template Aprovado</p>
                      <p className="text-xs text-blue-600 dark:text-blue-500">
                        Obrigatório para contatos fora da janela de 24 h
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setUseTemplate(v => !v)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${useTemplate ? 'bg-blue-600' : 'bg-muted'}`}
                    >
                      <span className={`inline-block h-4 w-4 rounded-full bg-card shadow transform transition-transform ${useTemplate ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </div>

                  {useTemplate && (
                    <div className="space-y-2">
                      <div>
                        <Label className="text-xs font-medium text-blue-700 dark:text-blue-400 mb-1 block">
                          Nome do Template *
                        </Label>
                        <Input
                          value={templateName}
                          onChange={e => setTemplateName(e.target.value)}
                          placeholder="ex: campaign_promo"
                          className="h-9 text-sm !bg-card !text-foreground !border-blue-300"
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-medium text-blue-700 dark:text-blue-400 mb-1 block">
                          Idioma
                        </Label>
                        <select
                          value={templateLanguage}
                          onChange={e => setTemplateLanguage(e.target.value)}
                          className="w-full h-9 px-3 text-sm rounded-lg border border-blue-300 bg-card text-foreground focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="pt_BR">Português (Brasil)</option>
                          <option value="en_US">English (US)</option>
                          <option value="es_ES">Español</option>
                          <option value="pt_PT">Português (Portugal)</option>
                          <option value="fr_FR">Français</option>
                        </select>
                      </div>
                      <p className="text-xs text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40 rounded p-2">
                        💡 O conteúdo da mensagem abaixo será usado como parâmetro <code>{'{{1}}'}</code> do template.
                        Certifique-se que o template esteja aprovado no Meta Business Manager.
                      </p>
                    </div>
                  )}

                  {!useTemplate && (
                    <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 rounded p-2 border border-amber-200">
                      ⚠️ Mensagem livre funciona apenas para contatos que interagiram nas últimas 24 h.
                      Para campanhas em frio, ative "Usar Template Aprovado".
                    </p>
                  )}
                </div>
              )}

              <div className="border-t border-border"></div>

              {/* Mensagem com Preview */}
              <div>
                <Label className="text-sm font-semibold text-foreground mb-3 block">
                  MENSAGEM *
                </Label>

                {/* Toolbar */}
                <div className="flex gap-2 p-2 bg-muted/50 rounded-t-lg border border-border border-b-0 relative">
                  {/* Dropdown de Variáveis */}
                  <div className="relative" ref={variableDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setShowVariableDropdown(!showVariableDropdown)}
                      className="p-2 hover:bg-muted/50 rounded-md transition-colors group"
                      title="Inserir variável"
                    >
                      <span className="text-sm font-medium text-foreground/80 group-hover:text-foreground">
                        {'{x}'}
                      </span>
                    </button>

                    {showVariableDropdown && (
                      <div className="absolute top-full left-0 mt-1 w-48 bg-card border border-border rounded-lg shadow-lg z-10">
                        {[
                          { value: '{name}', label: 'Nome' },
                          { value: '{phone}', label: 'Telefone' },
                          { value: '{email}', label: 'Email' },
                          { value: '{company}', label: 'Empresa' },
                        ].map(variable => (
                          <button
                            key={variable.value}
                            type="button"
                            onClick={() => insertVariable(variable.value)}
                            className="w-full text-left px-4 py-2 text-sm text-foreground/80 hover:bg-muted/50 transition-colors first:rounded-t-lg last:rounded-b-lg"
                          >
                            {variable.label} <span className="text-blue-600 dark:text-blue-400 font-mono">{variable.value}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Emoji Picker */}
                  <div className="relative" ref={emojiPickerRef}>
                    <button
                      type="button"
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                      className="p-2 hover:bg-muted/50 rounded-md transition-colors"
                      title="Emoji"
                    >
                      <Smile className="w-4 h-4 text-muted-foreground" />
                    </button>

                    {showEmojiPicker && (
                      <div className="absolute top-full left-0 mt-1 z-10">
                        <EmojiPicker onEmojiClick={handleEmojiClick} />
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => applyFormatting('bold')}
                    className="p-2 hover:bg-muted/50 rounded-md transition-colors"
                    title="Negrito (selecione o texto ou pressione para inserir)"
                  >
                    <Bold className="w-4 h-4 text-muted-foreground" />
                  </button>
                  <button
                    type="button"
                    onClick={() => applyFormatting('italic')}
                    className="p-2 hover:bg-muted/50 rounded-md transition-colors"
                    title="Itálico (selecione o texto ou pressione para inserir)"
                  >
                    <Italic className="w-4 h-4 text-muted-foreground" />
                  </button>
                  <button
                    type="button"
                    onClick={() => applyFormatting('link')}
                    className="p-2 hover:bg-muted/50 rounded-md transition-colors"
                    title="Link (selecione o texto)"
                  >
                    <Link2 className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>

                {/* Editor com Drag & Drop */}
                <Textarea
                  ref={messageRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onDrop={handleEditorDrop}
                  onDragOver={handleEditorDragOver}
                  onDragLeave={handleEditorDragLeave}
                  placeholder="Digite sua mensagem aqui ou arraste variáveis...&#10;&#10;Use {name} para inserir o nome do lead"
                  className={`min-h-[180px] rounded-t-none border-border focus:ring-[#25D366] focus:border-[#25D366] transition-all !bg-card !text-foreground dark:!text-foreground !border-border dark:!border-border ${isDraggingOver ? 'border-[#25D366] bg-green-50 dark:bg-green-900/10 border-2' : ''
                    }`}
                  maxLength={4096}
                />

                {/* Variáveis como badges arrastáveis */}
                <div className="mt-2 flex flex-wrap gap-2 items-center">
                  <span className="text-xs text-muted-foreground">💡 Arraste ou clique:</span>
                  {[
                    { value: '{name}', label: 'Nome' },
                    { value: '{phone}', label: 'Telefone' },
                    { value: '{email}', label: 'Email' },
                    { value: '{company}', label: 'Empresa' }
                  ].map(v => (
                    <button
                      key={v.value}
                      type="button"
                      draggable
                      onDragStart={(e) => handleVariableDragStart(e, v.value)}
                      onClick={() => insertVariable(v.value)}
                      className="px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded text-xs hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-all hover:shadow-sm hover:-translate-y-0.5 active:translate-y-0 font-mono border border-blue-200 dark:border-blue-800 cursor-grab active:cursor-grabbing select-none"
                    >
                      {v.value}
                    </button>
                  ))}
                </div>

                {/* Contador */}
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>📝 {message.length} / 4096 caracteres</span>
                  {message.length > 1000 && (
                    <span className="text-amber-600 dark:text-amber-400">
                      ⚠️ Mensagens longas podem ser divididas
                    </span>
                  )}
                </div>
              </div>

              <div className="border-t border-border"></div>

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
                    size="sm"
                  >
                    <Paperclip className="w-4 h-4" />
                    Arquivo
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => imageInputRef.current?.click()}
                    className="flex items-center gap-2"
                    size="sm"
                  >
                    <ImageIcon className="w-4 h-4" />
                    Imagem
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => videoInputRef.current?.click()}
                    className="flex items-center gap-2"
                    size="sm"
                  >
                    <Video className="w-4 h-4" />
                    Vídeo
                  </Button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.txt"
                />
                <input
                  ref={imageInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                  multiple
                  accept="image/*"
                />
                <input
                  ref={videoInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                  multiple
                  accept="video/*"
                />

                {attachments.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {attachments.map((att, index) => (
                      <div key={index} className="border border-border rounded-lg p-3 bg-muted/50">
                        {/* ✅ Info do arquivo */}
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-xl">
                            {att.type.startsWith('image/') ? '🖼️' :
                              att.type.startsWith('video/') ? '🎥' : '📄'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground/80 truncate">{att.name}</p>
                            <p className="text-xs text-muted-foreground">{formatFileSize(att.size)}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeAttachment(index)}
                            className="text-red-500 hover:text-red-700 dark:text-red-400 p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {/* ✅ Campo de legenda para imagens e vídeos */}
                        {(att.type.startsWith('image/') || att.type.startsWith('video/')) && (
                          <div className="mt-2">
                            <Label className="text-xs text-foreground/80 mb-1 block">
                              💬 Legenda {att.type.startsWith('image/') ? 'da imagem' : 'do vídeo'} (opcional)
                            </Label>
                            <Textarea
                              value={att.caption || ''}
                              onChange={(e) => updateCaption(index, e.target.value)}
                              placeholder="Ex: Confira nossa promoção! 🔥"
                              className="text-sm resize-none"
                              rows={2}
                            />
                            <p className="text-xs text-foreground/80 mt-1">
                              💡 A legenda será exibida junto com {att.type.startsWith('image/') ? 'a imagem' : 'o vídeo'} (estilo WhatsApp)
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-xs text-foreground/80 mt-2">
                  ⚠️ Limite: 16 MB • ✓ PDF, JPG, PNG, DOC, XLS, MP4, AVI
                </p>
              </div>
            </div>

            {/* COLUNA DIREITA - PREVIEW + CONFIG */}
            <div className="space-y-6">

              {/* Preview em Tempo Real */}
              <div>
                <Label className="text-sm font-semibold text-foreground mb-3 block flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  PREVIEW EM TEMPO REAL
                </Label>

                <div className="bg-[#ECE5DD] dark:bg-[#0B141A] p-4 rounded-lg border border-[var(--border-input)]">
                  <div className="space-y-2 max-w-[320px]">
                    {/* ✅ PREVIEW DE IMAGENS COM LEGENDA */}
                    {attachments.filter(att => att.type.startsWith('image/')).map((att, i) => (
                      <div key={i} className="bg-[#DCF8C6] dark:bg-[#005C4B] rounded-lg shadow-sm overflow-hidden">
                        {/* Imagem */}
                        {att.preview && (
                          <img
                            src={att.preview}
                            alt={att.name}
                            className="w-full h-auto"
                          />
                        )}

                        {/* Legenda da imagem (se tiver) */}
                        {att.caption && (
                          <div className="bg-[#DCF8C6] dark:bg-[#005C4B] p-3">
                            <div
                              className="text-sm text-foreground whitespace-pre-wrap break-words"
                              dangerouslySetInnerHTML={{ __html: renderFormattedPreview(att.caption) }}
                              style={{
                                fontFamily: 'system-ui, -apple-system, sans-serif',
                                lineHeight: '1.5'
                              }}
                            />
                            <div className="flex items-center justify-end gap-1 mt-2">
                              <span className="text-xs text-muted-foreground">14:30</span>
                              <Check className="w-3 h-3 text-blue-500" />
                            </div>
                          </div>
                        )}

                        {/* Se não tiver legenda, mostrar apenas checkmark */}
                        {!att.caption && (
                          <div className="flex items-center justify-end gap-1 p-2 bg-[#DCF8C6] dark:bg-[#005C4B]">
                            <span className="text-xs text-muted-foreground">14:30</span>
                            <Check className="w-3 h-3 text-blue-500" />
                          </div>
                        )}
                      </div>
                    ))}

                    {/* ✅ PREVIEW DE VÍDEOS COM LEGENDA */}
                    {attachments.filter(att => att.type.startsWith('video/')).map((att, i) => (
                      <div key={i} className="bg-[#DCF8C6] dark:bg-[#005C4B] rounded-lg shadow-sm overflow-hidden">
                        {/* Vídeo */}
                        {att.preview && (
                          <div className="relative">
                            <video
                              src={att.preview}
                              className="w-full h-auto"
                              controls
                            />
                            <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                              🎥 Vídeo
                            </div>
                          </div>
                        )}

                        {/* Legenda do vídeo (se tiver) */}
                        {att.caption && (
                          <div className="bg-[#DCF8C6] dark:bg-[#005C4B] p-3">
                            <div
                              className="text-sm text-foreground whitespace-pre-wrap break-words"
                              dangerouslySetInnerHTML={{ __html: renderFormattedPreview(att.caption) }}
                              style={{
                                fontFamily: 'system-ui, -apple-system, sans-serif',
                                lineHeight: '1.5'
                              }}
                            />
                            <div className="flex items-center justify-end gap-1 mt-2">
                              <span className="text-xs text-muted-foreground">14:30</span>
                              <Check className="w-3 h-3 text-blue-500" />
                            </div>
                          </div>
                        )}

                        {/* Se não tiver legenda, mostrar apenas checkmark */}
                        {!att.caption && (
                          <div className="flex items-center justify-end gap-1 p-2 bg-[#DCF8C6] dark:bg-[#005C4B]">
                            <span className="text-xs text-muted-foreground">14:30</span>
                            <Check className="w-3 h-3 text-blue-500" />
                          </div>
                        )}
                      </div>
                    ))}

                    {/* ✅ MENSAGEM DE TEXTO (separada - sempre em balão verde) */}
                    {message && (
                      <div className="bg-[#DCF8C6] dark:bg-[#005C4B] p-3 rounded-lg shadow-sm">
                        <div
                          className="text-sm text-foreground whitespace-pre-wrap break-words"
                          dangerouslySetInnerHTML={{ __html: renderFormattedPreview(message) }}
                          style={{
                            fontFamily: 'system-ui, -apple-system, sans-serif',
                            lineHeight: '1.5'
                          }}
                        />
                        <div className="flex items-center justify-end gap-1 mt-2">
                          <span className="text-xs text-muted-foreground">14:31</span>
                          <Check className="w-3 h-3 text-blue-500" />
                        </div>
                      </div>
                    )}

                    {/* ✅ ARQUIVOS (documentos, PDFs, etc - NÃO imagem nem vídeo) */}
                    {attachments.filter(att => !att.type.startsWith('image/') && !att.type.startsWith('video/')).map((att, i) => (
                      <div key={i} className="bg-[#DCF8C6] dark:bg-[#005C4B] p-3 rounded-lg shadow-sm">
                        <div className="flex items-center gap-2 text-sm text-foreground bg-white/50 dark:bg-black/20 p-2 rounded">
                          📄
                          <span className="truncate font-medium">{att.name}</span>
                        </div>
                        <div className="flex items-center justify-end gap-1 mt-2">
                          <span className="text-xs text-muted-foreground">14:32</span>
                          <Check className="w-3 h-3 text-blue-500" />
                        </div>
                      </div>
                    ))}

                    {/* ✅ PLACEHOLDER quando não há conteúdo */}
                    {!message && attachments.length === 0 && (
                      <div className="bg-[#DCF8C6] dark:bg-[#005C4B] p-3 rounded-lg shadow-sm">
                        <p className="text-sm text-muted-foreground italic">Digite uma mensagem ou adicione uma imagem...</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t border-border"></div>

              {/* Destinatários */}
              <div>
                <Label className="text-sm font-semibold text-foreground mb-3 block">
                  DESTINATÁRIOS *
                </Label>

                <div className="space-y-2">
                  {/* Todos */}
                  <label className="flex items-center gap-3 p-2 rounded-lg border border-border hover:border-[#25D366] cursor-pointer transition-colors">
                    <input
                      type="radio"
                      name="recipient"
                      checked={recipientMode === 'all'}
                      onChange={() => setRecipientMode('all')}
                      className="w-4 h-4 text-[#25D366] focus:ring-[#25D366]"
                    />
                    <span className="flex-1 text-sm text-foreground/80">
                      Todos ({leads.length})
                    </span>
                  </label>

                  {/* Segmentos */}
                  <div className="border border-border rounded-lg overflow-hidden">
                    <label className="flex items-center gap-3 p-2 hover:bg-muted/50 cursor-pointer transition-colors">
                      <input
                        type="radio"
                        name="recipient"
                        checked={recipientMode === 'segments'}
                        onChange={() => setRecipientMode('segments')}
                        className="w-4 h-4 text-[#25D366] focus:ring-[#25D366]"
                      />
                      <span className="flex-1 text-sm text-foreground/80">
                        Filtrar por segmentos
                      </span>
                    </label>

                    {recipientMode === 'segments' && (
                      <div className="px-2 pb-2 space-y-1 bg-muted/50">
                        {Object.entries(statusCounts).map(([status, count]) => (
                          <label key={status} className="flex items-center gap-2 pl-7 py-1">
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
                              className="w-3 h-3 text-[#25D366] focus:ring-[#25D366] rounded"
                            />
                            <span className="text-xs text-foreground/80">
                              {statusLabels[status] || status} ({count})
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Lista personalizada */}
                  <div className="border border-border rounded-lg overflow-hidden">
                    <label className="flex items-center gap-3 p-2 hover:bg-muted/50 cursor-pointer transition-colors">
                      <input
                        type="radio"
                        name="recipient"
                        checked={recipientMode === 'custom'}
                        onChange={() => setRecipientMode('custom')}
                        className="w-4 h-4 text-[#25D366] focus:ring-[#25D366]"
                      />
                      <span className="flex-1 text-sm text-foreground/80">
                        Lista personalizada
                      </span>
                    </label>

                    {recipientMode === 'custom' && (
                      <div className="px-2 pb-2 bg-muted/50">
                        <Textarea
                          value={customNumbers}
                          onChange={(e) => setCustomNumbers(e.target.value)}
                          placeholder="+258843210987, +258847654321..."
                          className="min-h-[60px] text-xs"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Total */}
                <div className="mt-2 flex items-center gap-2 text-[#25D366] bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded-lg">
                  <Users className="w-4 h-4" />
                  <span className="text-sm font-semibold">
                    Total: {recipientCount.toLocaleString()} destinatários
                  </span>
                </div>
              </div>

              <div className="border-t border-border"></div>

              {/* Agendamento */}
              <div>
                <Label className="text-sm font-semibold text-foreground mb-3 block">
                  AGENDAMENTO
                </Label>

                <div className="space-y-2">
                  <label className="flex items-center gap-3 p-2 rounded-lg border border-border hover:border-[#25D366] cursor-pointer transition-colors">
                    <input
                      type="radio"
                      name="schedule"
                      checked={scheduleMode === 'now'}
                      onChange={() => setScheduleMode('now')}
                      className="w-4 h-4 text-[#25D366] focus:ring-[#25D366]"
                    />
                    <span className="text-sm text-foreground/80">
                      ✅ Enviar agora
                    </span>
                  </label>

                  <div className="border border-border rounded-lg overflow-hidden">
                    <label className="flex items-center gap-3 p-2 hover:bg-muted/50 cursor-pointer transition-colors">
                      <input
                        type="radio"
                        name="schedule"
                        checked={scheduleMode === 'scheduled'}
                        onChange={() => setScheduleMode('scheduled')}
                        className="w-4 h-4 text-[#25D366] focus:ring-[#25D366]"
                      />
                      <span className="flex-1 text-sm text-foreground/80">
                        📅 Agendar envio
                      </span>
                    </label>

                    {scheduleMode === 'scheduled' && (
                      <div className="px-2 pb-2 bg-muted/50">
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <div>
                            <Label className="text-xs text-foreground/80 mb-1 block">
                              📅 Data
                            </Label>
                            <Input
                              type="date"
                              value={scheduleDate}
                              onChange={(e) => setScheduleDate(e.target.value)}
                              min={minDate}
                              className="h-9 text-sm !bg-card !text-foreground dark:!text-foreground !border-border dark:!border-border"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-foreground/80 mb-1 block">
                              ⏰ Hora
                            </Label>
                            <Input
                              type="time"
                              value={scheduleTime}
                              onChange={(e) => setScheduleTime(e.target.value)}
                              min={scheduleDate === minDate ? minTime : undefined}
                              className="h-9 text-sm !bg-card !text-foreground dark:!text-foreground !border-border dark:!border-border"
                            />
                          </div>
                        </div>
                        {scheduleDate && scheduleTime && (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-2 font-medium">
                            ✓ {new Date(`${scheduleDate}T${scheduleTime}`).toLocaleString('pt-BR')}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t border-border"></div>

              {/* Configurações Avançadas */}
              <div>
                <button
                  type="button"
                  onClick={() => setAdvancedOpen(!advancedOpen)}
                  className="w-full flex items-center justify-between p-2 hover:bg-muted/50 rounded-lg transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Settings className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-semibold text-foreground">
                      Configurações Avançadas
                    </span>
                  </div>
                  {advancedOpen ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>

                {advancedOpen && (
                  <div className="mt-2 p-3 bg-muted/50 rounded-lg space-y-3">

                    {/* Velocidade */}
                    <div>
                      <Label className="text-xs font-medium text-foreground/80 mb-1 block">
                        Velocidade de Envio
                      </Label>
                      <div className="space-y-1">
                        {[
                          { value: 'slow', label: 'Seguro (~2/min)', desc: 'Recomendado — menos risco de ban' },
                          { value: 'normal', label: 'Normal (~3.5/min)', desc: 'Conta com actividade regular' },
                          { value: 'fast', label: 'Rápido (~5.5/min)', desc: '⚠️ Risco moderado de ban' },
                        ].map(({ value, label, desc }) => (
                          <label key={value} className="flex items-start gap-2 p-1.5 rounded hover:bg-muted/50 cursor-pointer transition-colors">
                            <input
                              type="radio"
                              name="speed"
                              checked={sendSpeed === value}
                              onChange={() => setSendSpeed(value as any)}
                              className="w-3 h-3 mt-0.5 text-[#25D366] focus:ring-[#25D366]"
                            />
                            <div className="flex-1">
                              <p className="text-xs font-medium text-foreground/80">{label}</p>
                              <p className="text-xs text-muted-foreground">{desc}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Opções */}
                    <div className="space-y-1">
                      {[
                        { checked: stopOnError, onChange: setStopOnError, label: 'Parar ao detectar erro' },
                        { checked: skipInvalid, onChange: setSkipInvalid, label: 'Pular números inválidos' },
                        { checked: randomDelay, onChange: setRandomDelay, label: 'Delay aleatório (mais humano)' },
                      ].map(({ checked, onChange, label }, i) => (
                        <label key={i} className="flex items-center gap-2 p-1">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => onChange(e.target.checked)}
                            className="w-3 h-3 text-[#25D366] focus:ring-[#25D366] rounded"
                          />
                          <span className="text-xs text-muted-foreground">{label}</span>
                        </label>
                      ))}
                    </div>

                    {randomDelay && (
                      <div>
                        <Label className="text-xs text-foreground/80 mb-1 block">
                          Intervalo entre mensagens (segundos)
                        </Label>
                        <div className="flex items-center gap-2">
                          <Input type="number" value={minDelay} onChange={(e) => setMinDelay(e.target.value)} min="6" max="300" className="w-16 h-8 text-sm" />
                          <span className="text-xs text-muted-foreground">a</span>
                          <Input type="number" value={maxDelay} onChange={(e) => setMaxDelay(e.target.value)} min="6" max="300" className="w-16 h-8 text-sm" />
                        </div>
                        <p className="text-[10px] text-orange-500 mt-1">Mínimo recomendado: 15s. Valores abaixo de 6s aumentam risco de ban.</p>
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-xs text-foreground/80 pt-2 border-t border-border">
                      <Clock className="w-3 h-3" />
                      <span>Tempo estimado: {getEstimatedTime()}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-[var(--bg-modal)] border-t border-[var(--border-input)] px-6 py-4 flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={handleClose} disabled={isSending}>
            Cancelar
          </Button>

          <Button type="button" variant="outline" onClick={handleSaveDraft} disabled={isSending} className="flex items-center gap-2">
            <Save className="w-4 h-4" />
            Salvar
          </Button>

          <Button
            type="button"
            onClick={handleSend}
            disabled={
              isSending ||
              !campaignName.trim() ||
              recipientCount === 0 ||
              (!message.trim() && attachments.length === 0)
            }
            className="flex items-center gap-2 bg-[#10B981] hover:bg-[#059669] text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSending ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {scheduleMode === 'now' ? 'Enviando...' : 'Agendando...'}
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                {scheduleMode === 'now' ? 'Enviar Campanha' : 'Agendar Campanha'}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}



