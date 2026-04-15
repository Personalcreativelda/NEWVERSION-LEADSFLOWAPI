import React, { useState, useEffect } from 'react';
import {
  X, Smartphone, Users, Send, Clock, ChevronDown, ChevronUp,
  Check, Save, AlertCircle, Loader2
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { toast } from 'sonner';
import { smsCampaignsApi } from '../../utils/api';
import { channelsApi } from '../../services/api/inbox';
import type { Channel } from '../../types/inbox';

interface Lead {
  id: string;
  nome: string;
  telefone?: string;
  email?: string;
  empresa?: string;
  status?: string;
}

interface CampaignSMSModalProps {
  isOpen: boolean;
  onClose: () => void;
  leads: Lead[];
  onCampaignCreated?: (campaign: any) => void;
  onCampaignUpdated?: (campaign: any) => void;
  editingCampaign?: any;
}

const STATUS_LABELS: Record<string, string> = {
  novo: 'Novo',
  contatado: 'Contatado',
  qualificado: 'Qualificado',
  negociacao: 'Negociação',
  ganho: 'Ganho',
  perdido: 'Perdido',
};

export default function CampaignSMSModal({
  isOpen,
  onClose,
  leads,
  onCampaignCreated,
  onCampaignUpdated,
  editingCampaign,
}: CampaignSMSModalProps) {
  const [campaignName, setCampaignName] = useState('');
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [twilioChannels, setTwilioChannels] = useState<Channel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [message, setMessage] = useState('');
  const [recipientMode, setRecipientMode] = useState<'all' | 'segments' | 'custom'>('all');
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(['novo']);
  const [customPhones, setCustomPhones] = useState('');
  const [scheduleMode, setScheduleMode] = useState<'now' | 'scheduled'>('now');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [campaignId, setCampaignId] = useState<string | null>(null);

  // Load Twilio channels
  useEffect(() => {
    if (!isOpen) return;
    setLoadingChannels(true);
    channelsApi.getAll()
      .then(channels => {
        const twilio = channels.filter(c => c.type === 'twilio_sms' && c.status === 'active');
        setTwilioChannels(twilio);
        if (twilio.length > 0 && !selectedChannelId) {
          setSelectedChannelId(twilio[0].id);
        }
      })
      .catch(() => toast.error('Erro ao carregar canais Twilio'))
      .finally(() => setLoadingChannels(false));
  }, [isOpen]);

  // Load editing campaign data
  useEffect(() => {
    if (editingCampaign) {
      const s = editingCampaign.settings || {};
      setCampaignId(editingCampaign.id || null);
      setCampaignName(editingCampaign.name || '');
      setSelectedChannelId(s.channelId || '');
      setMessage(s.message || '');
      setRecipientMode(s.recipientMode || 'all');
      setSelectedStatuses(s.selectedStatuses || ['novo']);
      setCustomPhones(s.customPhones || '');
      setScheduleMode(s.scheduleMode || 'now');
      setScheduleDate(s.scheduledDate || '');
      setScheduleTime(s.scheduledTime || '');
    } else {
      setCampaignId(null);
      setCampaignName('');
      setMessage('');
      setRecipientMode('all');
      setSelectedStatuses(['novo']);
      setCustomPhones('');
      setScheduleMode('now');
      setScheduleDate('');
      setScheduleTime('');
    }
  }, [editingCampaign, isOpen]);

  if (!isOpen) return null;

  const getRecipientCount = () => {
    if (recipientMode === 'all') return leads.filter(l => l.telefone).length;
    if (recipientMode === 'segments') {
      return leads.filter(l => l.telefone && selectedStatuses.includes(l.status || 'novo')).length;
    }
    return customPhones.split(',').map(p => p.trim()).filter(p => p.length > 6).length;
  };

  const recipientCount = getRecipientCount();

  const statusCounts: Record<string, number> = {};
  Object.keys(STATUS_LABELS).forEach(s => {
    statusCounts[s] = leads.filter(l => l.status === s && l.telefone).length;
  });

  const toggleStatus = (status: string) => {
    setSelectedStatuses(prev =>
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
  };

  const insertVariable = (variable: string) => {
    setMessage(prev => prev + variable);
  };

  const handleSend = async () => {
    if (!campaignName.trim()) {
      toast.error('Digite um nome para a campanha');
      return;
    }
    if (!selectedChannelId) {
      toast.error('Selecione um canal Twilio SMS');
      return;
    }
    if (!message.trim()) {
      toast.error('Digite o conteúdo da mensagem');
      return;
    }
    if (recipientCount === 0) {
      toast.error('Selecione ao menos um destinatário com telefone');
      return;
    }
    if (scheduleMode === 'scheduled') {
      if (!scheduleDate || !scheduleTime) {
        toast.error('Defina a data e hora do agendamento');
        return;
      }
      if (new Date(`${scheduleDate}T${scheduleTime}`) <= new Date()) {
        toast.error('A data/hora de agendamento deve ser futura');
        return;
      }
    }

    setIsSending(true);
    try {
      const campaignData = {
        campaign_name: campaignName,
        channel_id: selectedChannelId,
        message,
        recipient_mode: recipientMode,
        selected_statuses: selectedStatuses,
        custom_phones: customPhones,
        recipient_count: recipientCount,
        schedule_mode: scheduleMode,
        scheduled_date: scheduleDate,
        scheduled_time: scheduleTime,
        status: scheduleMode === 'now' ? 'active' : 'scheduled',
      };

      let result: any;
      if (campaignId) {
        result = await smsCampaignsApi.update(campaignId, campaignData);
      } else {
        result = await smsCampaignsApi.create(campaignData);
      }

      if (!result.success) {
        throw new Error(result.error || 'Erro ao salvar campanha');
      }

      const activeCampaignId = campaignId || result.campaign?.id;
      if (!campaignId && result.campaign?.id) {
        setCampaignId(result.campaign.id);
      }

      if (scheduleMode === 'now') {
        const sendResult = await smsCampaignsApi.send(activeCampaignId);
        if (!sendResult.success) {
          throw new Error(sendResult.error || 'Erro ao iniciar envio');
        }
        toast.success(`Campanha "${campaignName}" iniciada! Enviando para ${sendResult.recipientCount} contatos via Twilio.`);
      } else {
        toast.success(`Campanha "${campaignName}" agendada com sucesso!`);
      }

      if (campaignId) {
        onCampaignUpdated?.({ ...campaignData, id: activeCampaignId });
      } else {
        onCampaignCreated?.({ ...campaignData, id: activeCampaignId });
      }

      onClose();
    } catch (error: any) {
      console.error('[CampaignSMSModal] Error:', error);
      toast.error(`Erro: ${error.message || 'Falha ao processar campanha'}`);
    } finally {
      setIsSending(false);
    }
  };

  const selectedChannel = twilioChannels.find(c => c.id === selectedChannelId);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="campaign-modal relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl border border-border">
        {/* Header */}
        <div className="campaign-modal flex items-center justify-between p-6 border-b border-border sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#F22F46' }}>
              <Smartphone className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">
                {editingCampaign ? 'Editar Campanha SMS' : 'Nova Campanha SMS'}
              </h2>
              <p className="text-sm text-muted-foreground">Via Twilio — envio em massa de SMS</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* No Twilio channels warning */}
          {!loadingChannels && twilioChannels.length === 0 && (
            <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Nenhum canal Twilio SMS configurado</p>
                <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                  Para enviar SMS em massa, configure um canal Twilio SMS em{' '}
                  <strong>Configurações → Canais → Twilio SMS</strong>.
                </p>
              </div>
            </div>
          )}

          {/* Campaign Name */}
          <div>
            <Label className="text-sm font-medium text-foreground mb-2 block">Nome da campanha *</Label>
            <Input
              value={campaignName}
              onChange={e => setCampaignName(e.target.value)}
              placeholder="Ex: Promoção Setembro — SMS"
              className="bg-background"
            />
          </div>

          {/* Twilio Channel Selector */}
          <div>
            <Label className="text-sm font-medium text-foreground mb-2 block">Canal Twilio *</Label>
            {loadingChannels ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Carregando canais...
              </div>
            ) : twilioChannels.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum canal disponível</p>
            ) : (
              <select
                value={selectedChannelId}
                onChange={e => setSelectedChannelId(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#10B981]"
              >
                {twilioChannels.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
            {selectedChannel && (
              <p className="text-xs text-muted-foreground mt-1">
                Número de origem: {(selectedChannel.credentials as any)?.phoneNumber || '—'}
              </p>
            )}
          </div>

          {/* Message */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium text-foreground">Mensagem *</Label>
              <div className="flex gap-1">
                {['{{nome}}', '{{empresa}}', '{{telefone}}'].map(v => (
                  <button
                    key={v}
                    onClick={() => insertVariable(v)}
                    className="text-xs px-2 py-1 bg-muted hover:bg-muted/80 text-muted-foreground rounded-md transition-colors"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <Textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Olá {{nome}}, temos uma oferta especial para você!"
              className="min-h-[120px] bg-background resize-none"
              maxLength={1600}
            />
            <div className="flex justify-between mt-1">
              <p className="text-xs text-muted-foreground">
                Personalize com {'{{nome}}'}, {'{{empresa}}'}, {'{{telefone}}'}
              </p>
              <p className="text-xs text-muted-foreground">{message.length}/1600</p>
            </div>
          </div>

          {/* Recipients */}
          <div>
            <Label className="text-sm font-medium text-foreground mb-3 block">Destinatários</Label>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {(['all', 'segments', 'custom'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setRecipientMode(mode)}
                  className={`p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                    recipientMode === mode
                      ? 'border-[#F22F46] bg-red-50 dark:bg-red-900/20 text-[#F22F46]'
                      : 'border-border bg-card text-muted-foreground hover:border-[#F22F46]/50'
                  }`}
                >
                  {mode === 'all' && 'Todos os leads'}
                  {mode === 'segments' && 'Segmentos'}
                  {mode === 'custom' && 'Personalizado'}
                </button>
              ))}
            </div>

            {recipientMode === 'segments' && (
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(STATUS_LABELS).map(([status, label]) => (
                  <button
                    key={status}
                    onClick={() => toggleStatus(status)}
                    className={`flex items-center justify-between p-2.5 rounded-lg border text-sm transition-all ${
                      selectedStatuses.includes(status)
                        ? 'border-[#F22F46] bg-red-50 dark:bg-red-900/20 text-[#F22F46]'
                        : 'border-border bg-card text-muted-foreground hover:border-[#F22F46]/50'
                    }`}
                  >
                    <span>{label}</span>
                    <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                      {statusCounts[status] || 0}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {recipientMode === 'custom' && (
              <Textarea
                value={customPhones}
                onChange={e => setCustomPhones(e.target.value)}
                placeholder="+5511999887766, +5521987654321"
                className="min-h-[80px] bg-background text-sm"
              />
            )}

            <div className="mt-3 flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-foreground font-medium">
                {recipientCount} destinatário{recipientCount !== 1 ? 's' : ''} com telefone
              </span>
            </div>
          </div>

          {/* Schedule */}
          <div>
            <Label className="text-sm font-medium text-foreground mb-3 block">Envio</Label>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {(['now', 'scheduled'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setScheduleMode(mode)}
                  className={`p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                    scheduleMode === mode
                      ? 'border-[#F22F46] bg-red-50 dark:bg-red-900/20 text-[#F22F46]'
                      : 'border-border bg-card text-muted-foreground hover:border-[#F22F46]/50'
                  }`}
                >
                  {mode === 'now' ? (
                    <span className="flex items-center justify-center gap-2"><Send className="w-4 h-4" />Enviar agora</span>
                  ) : (
                    <span className="flex items-center justify-center gap-2"><Clock className="w-4 h-4" />Agendar</span>
                  )}
                </button>
              ))}
            </div>
            {scheduleMode === 'scheduled' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Data</Label>
                  <Input
                    type="date"
                    value={scheduleDate}
                    onChange={e => setScheduleDate(e.target.value)}
                    className="bg-background"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Hora</Label>
                  <Input
                    type="time"
                    value={scheduleTime}
                    onChange={e => setScheduleTime(e.target.value)}
                    className="bg-background"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="p-4 bg-muted/30 rounded-xl border border-border text-sm space-y-1.5">
            <p className="font-medium text-foreground">Resumo</p>
            <p className="text-muted-foreground">
              Canal: <span className="text-foreground">{selectedChannel?.name || '—'}</span>
            </p>
            <p className="text-muted-foreground">
              Destinatários: <span className="text-foreground">{recipientCount}</span>
            </p>
            <p className="text-muted-foreground">
              Envio: <span className="text-foreground">
                {scheduleMode === 'now' ? 'Imediato' : scheduleDate && scheduleTime ? `${scheduleDate} às ${scheduleTime}` : 'Agendado (definir data)'}
              </span>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="campaign-modal flex items-center justify-between p-6 border-t border-border sticky bottom-0">
          <button
            onClick={onClose}
            disabled={isSending}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancelar
          </button>
          <div className="flex gap-3">
            <Button
              onClick={handleSend}
              disabled={isSending || twilioChannels.length === 0 || !message.trim() || recipientCount === 0}
              className="text-white font-medium px-6"
              style={{ backgroundColor: '#F22F46' }}
            >
              {isSending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Enviando...</>
              ) : scheduleMode === 'now' ? (
                <><Send className="w-4 h-4 mr-2" />Disparar SMS</>
              ) : (
                <><Clock className="w-4 h-4 mr-2" />Agendar</>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
