import { useState, useEffect } from 'react';
import {
  Smartphone, Users, Send, Clock, AlertCircle, Loader2
} from 'lucide-react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { toast } from 'sonner';
import { smsCampaignsApi } from '../../utils/api';
import { channelsApi } from '../../services/api/inbox';
import type { Channel } from '../../types/inbox';
import { AppModal } from '../base/AppModal';
import { AppButton } from '../base/AppButton';
import { ChoiceList, CheckList } from '../base/ChoiceList';

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
  novo: 'Novos',
  contatado: 'Contactados',
  qualificado: 'Qualificados',
  negociacao: 'Em negociação',
  ganho: 'Convertidos',
  perdido: 'Perdidos',
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
        toast.success(`Campanha "${campaignName}" iniciada! A enviar para ${sendResult.recipientCount} contactos via Twilio.`);
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
    <AppModal
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      className="campaign-modal p-0 gap-0 max-h-[90vh] flex flex-col"
      title={editingCampaign ? 'Editar campanha de SMS' : 'Nova campanha de SMS'}
      footer={
        <>
          <AppButton type="button" variant="outline" onClick={onClose} disabled={isSending}>
            Cancelar
          </AppButton>
          <AppButton
            onClick={handleSend}
            disabled={isSending || twilioChannels.length === 0 || !message.trim() || recipientCount === 0}
            loading={isSending}
          >
            {isSending ? 'A enviar…' : scheduleMode === 'now' ? 'Enviar' : 'Agendar'}
          </AppButton>
        </>
      }
    >
        <div className="px-6 pb-2 space-y-6">
          {/* No Twilio channels warning */}
          {!loadingChannels && twilioChannels.length === 0 && (
            <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Ainda não tem um canal de SMS</p>
                <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">Ligue um em Definições → Canais ligados.</p>
              </div>
            </div>
          )}

          {/* Campaign Name */}
          <div>
            <Label className="text-sm font-semibold text-foreground mb-2 block">Nome da campanha</Label>
            <Input
              value={campaignName}
              onChange={e => setCampaignName(e.target.value)}
              placeholder="Ex.: Promoção de setembro"
            />
          </div>

          {/* Twilio Channel Selector */}
          <div>
            <Label className="text-sm font-semibold text-foreground mb-2 block">Enviar de</Label>
            {loadingChannels ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                A carregar canais...
              </div>
            ) : twilioChannels.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum canal disponível</p>
            ) : (
              <select
                value={selectedChannelId}
                onChange={e => setSelectedChannelId(e.target.value)}
                className="w-full px-3 text-sm text-foreground"
              >
                {twilioChannels.map(c => {
                  const phone = (c.credentials as any)?.phoneNumber;
                  return <option key={c.id} value={c.id}>{phone ? `${c.name} · ${phone}` : c.name}</option>;
                })}
              </select>
            )}
          </div>

          {/* Message */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-semibold text-foreground">Mensagem</Label>
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
              placeholder="Olá {{nome}}, temos uma oferta especial!"
              className="min-h-[120px] resize-none"
              maxLength={1600}
            />
            <div className="flex justify-end mt-1">
              <p className="text-xs text-muted-foreground">{message.length}/1600</p>
            </div>
          </div>

          {/* Recipients */}
          <div>
            <Label className="text-sm font-semibold text-foreground mb-3 block">Destinatários</Label>
            <ChoiceList
              value={recipientMode}
              onChange={setRecipientMode}
              options={[
                { value: 'all', label: 'Todos os leads com telefone' },
                {
                  value: 'segments',
                  label: 'Por etapa do funil',
                  children: (
                    <CheckList
                      items={Object.entries(STATUS_LABELS).map(([status, label]) => ({ value: status, label, meta: statusCounts[status] || 0 }))}
                      selected={selectedStatuses}
                      onToggle={toggleStatus}
                    />
                  ),
                },
                {
                  value: 'custom',
                  label: 'Lista de números',
                  children: (
                    <Textarea
                      value={customPhones}
                      onChange={e => setCustomPhones(e.target.value)}
                      placeholder="+258 84 321 0987, +258 84 765 4321"
                      className="min-h-[80px] resize-none"
                    />
                  ),
                },
              ]}
            />
            <p className="mt-3 text-sm text-muted-foreground">{recipientCount} destinatários</p>
          </div>

          {/* Schedule */}
          <div>
            <Label className="text-sm font-semibold text-foreground mb-3 block">Envio</Label>
            <ChoiceList
              value={scheduleMode}
              onChange={setScheduleMode}
              options={[
                { value: 'now', label: 'Enviar agora' },
                {
                  value: 'scheduled',
                  label: 'Agendar',
                  children: (
                    <div className="grid grid-cols-2 gap-3">
                      <Input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} />
                      <Input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} />
                    </div>
                  ),
                },
              ]}
            />
          </div>

        </div>
    </AppModal>
  );
}
