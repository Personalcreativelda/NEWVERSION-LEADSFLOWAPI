import React, { useEffect, useState } from 'react';
import { X, Mail, MessageSquare, Phone, User, Calendar, Activity,
  Wifi, WifiOff, Crown, Rocket, Send, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { apiRequest } from '../../../utils/api';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Channel {
  id: string;
  name: string;
  type: string;
  phone_number?: string;
  status: string;
  created_at: string;
}

interface Activity {
  type: string;
  description: string;
  metadata: any;
  created_at: string;
}

interface UserDetails {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  role: string;
  is_active: boolean;
  plan: string;
  plan_expires_at?: string;
  created_at: string;
  last_active_at?: string;
  leads_count: number;
  messages_count: number;
  campaigns_count: number;
}

interface UserDetailsModalProps {
  userId: string;
  onClose: () => void;
}

type SendTab = 'email' | 'whatsapp';

export const UserDetailsModal: React.FC<UserDetailsModalProps> = ({ userId, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [recentActivities, setRecentActivities] = useState<Activity[]>([]);

  const [sendTab, setSendTab] = useState<SendTab>('email');
  const [sending, setSending] = useState(false);

  // Email form
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');

  // WhatsApp form
  const [waPhone, setWaPhone] = useState('');
  const [waMessage, setWaMessage] = useState('');
  const [selectedChannelId, setSelectedChannelId] = useState('');

  useEffect(() => {
    loadDetails();
  }, [userId]);

  const loadDetails = async () => {
    setLoading(true);
    try {
      const res = await apiRequest(`/admin/users/${userId}/details`, 'GET');
      if (res.success) {
        setUserDetails(res.user);
        setChannels(res.channels || []);
        setRecentActivities(res.recentActivities || []);
        // Pre-fill phone from first channel
        const firstChannel = res.channels?.find((c: Channel) => c.phone_number);
        if (firstChannel) {
          setWaPhone(firstChannel.phone_number || '');
          setSelectedChannelId(firstChannel.id);
        }
      }
    } catch {
      toast.error('Erro ao carregar dados do usuário');
    } finally {
      setLoading(false);
    }
  };

  const handleSendEmail = async () => {
    if (!emailSubject.trim() || !emailMessage.trim()) {
      toast.error('Preencha o assunto e a mensagem');
      return;
    }
    setSending(true);
    try {
      const res = await apiRequest(`/admin/users/${userId}/send-email`, 'POST', {
        subject: emailSubject,
        message: emailMessage,
        is_html: false,
      });
      if (res.success) {
        toast.success(res.message || 'Email enviado com sucesso!');
        setEmailSubject('');
        setEmailMessage('');
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar email');
    } finally {
      setSending(false);
    }
  };

  const handleSendWhatsApp = async () => {
    if (!waPhone.trim() || !waMessage.trim()) {
      toast.error('Preencha o número e a mensagem');
      return;
    }
    setSending(true);
    try {
      const res = await apiRequest(`/admin/users/${userId}/send-whatsapp`, 'POST', {
        phone: waPhone,
        message: waMessage,
        channel_id: selectedChannelId || undefined,
      });
      if (res.success) {
        toast.success(res.message || 'WhatsApp enviado com sucesso!');
        setWaMessage('');
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar WhatsApp');
    } finally {
      setSending(false);
    }
  };

  const getPlanIcon = (plan: string) => {
    if (plan === 'enterprise') return <Crown className="w-4 h-4 text-violet-500" />;
    if (plan === 'business') return <Rocket className="w-4 h-4 text-primary" />;
    return null;
  };

  const whatsappChannels = channels.filter(c => c.type === 'whatsapp' || !c.type);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border flex-shrink-0">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            Detalhes do Usuário
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : !userDetails ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              Usuário não encontrado
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {/* User info card */}
              <div className="flex items-start gap-4 p-4 rounded-xl bg-muted/30 border border-border/50">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 flex-shrink-0 overflow-hidden">
                  {userDetails.avatar_url ? (
                    <img src={userDetails.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-7 h-7 text-primary" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-lg text-foreground">{userDetails.name || '—'}</h3>
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${
                      userDetails.is_active
                        ? 'bg-green-500/10 text-green-600 border-green-500/20'
                        : 'bg-red-500/10 text-red-600 border-red-500/20'
                    }`}>
                      {userDetails.is_active ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                      {userDetails.is_active ? 'Ativo' : 'Suspenso'}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-sm mt-0.5">{userDetails.email}</p>
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground/80">
                      {getPlanIcon(userDetails.plan)}
                      Plano: <strong>{userDetails.plan}</strong>
                    </span>
                    {userDetails.plan_expires_at && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Expira: {new Date(userDetails.plan_expires_at).toLocaleDateString('pt-BR')}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Cadastro: {new Date(userDetails.created_at).toLocaleDateString('pt-BR')}
                    </span>
                    {userDetails.last_active_at && (
                      <span className="text-xs text-muted-foreground">
                        Último acesso: {formatDistanceToNow(new Date(userDetails.last_active_at), { addSuffix: true, locale: ptBR })}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Leads', value: userDetails.leads_count },
                  { label: 'Mensagens', value: userDetails.messages_count },
                  { label: 'Campanhas', value: userDetails.campaigns_count },
                ].map(stat => (
                  <div key={stat.label} className="p-3 rounded-xl bg-muted/30 border border-border/50 text-center">
                    <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
                  </div>
                ))}
              </div>

              {/* Channels */}
              <div>
                <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  Canais Conectados ({channels.length})
                </h4>
                {channels.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-1">Nenhum canal configurado.</p>
                ) : (
                  <div className="space-y-2">
                    {channels.map(ch => (
                      <div key={ch.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/20 border border-border/50">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${ch.status === 'connected' ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{ch.name}</p>
                          {ch.phone_number && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Phone className="w-3 h-3" /> {ch.phone_number}
                            </p>
                          )}
                        </div>
                        <span className={`text-xs flex items-center gap-1 ${ch.status === 'connected' ? 'text-green-600' : 'text-muted-foreground'}`}>
                          {ch.status === 'connected' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                          {ch.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent activity */}
              {recentActivities.length > 0 && (
                <div>
                  <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" />
                    Atividade Recente
                  </h4>
                  <div className="space-y-1.5">
                    {recentActivities.slice(0, 5).map((act, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary/40 flex-shrink-0" />
                        <span className="truncate">{act.description}</span>
                        <span className="text-xs text-muted-foreground/60 whitespace-nowrap ml-auto">
                          {formatDistanceToNow(new Date(act.created_at), { addSuffix: true, locale: ptBR })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Messaging section */}
              <div className="border border-border/60 rounded-xl overflow-hidden">
                <div className="flex border-b border-border/60">
                  <button
                    onClick={() => setSendTab('email')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
                      sendTab === 'email' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/30'
                    }`}
                  >
                    <Mail className="w-4 h-4" />
                    Enviar Email
                  </button>
                  <button
                    onClick={() => setSendTab('whatsapp')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
                      sendTab === 'whatsapp' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/30'
                    }`}
                  >
                    <MessageSquare className="w-4 h-4" />
                    Enviar WhatsApp
                  </button>
                </div>

                <div className="p-4 space-y-3">
                  {sendTab === 'email' ? (
                    <>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Para</label>
                        <Input value={userDetails.email} disabled className="bg-muted/30 text-sm" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Assunto</label>
                        <Input
                          placeholder="Assunto do email..."
                          value={emailSubject}
                          onChange={e => setEmailSubject(e.target.value)}
                          className="text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Mensagem</label>
                        <textarea
                          rows={4}
                          placeholder="Digite sua mensagem..."
                          value={emailMessage}
                          onChange={e => setEmailMessage(e.target.value)}
                          className="w-full resize-none rounded-lg border border-border bg-card text-foreground px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                      <Button
                        onClick={handleSendEmail}
                        disabled={sending}
                        className="w-full gap-2"
                      >
                        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        Enviar Email
                      </Button>
                    </>
                  ) : (
                    <>
                      {whatsappChannels.length === 0 && (
                        <p className="text-sm text-orange-500 bg-orange-500/10 px-3 py-2 rounded-lg">
                          Este usuário não tem canais WhatsApp conectados. A mensagem será enviada via canal do próprio usuário se disponível.
                        </p>
                      )}
                      {whatsappChannels.length > 1 && (
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">Canal de envio</label>
                          <select
                            value={selectedChannelId}
                            onChange={e => setSelectedChannelId(e.target.value)}
                            className="w-full rounded-lg border border-border bg-card text-foreground px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                          >
                            {whatsappChannels.map(ch => (
                              <option key={ch.id} value={ch.id}>{ch.name} {ch.phone_number ? `(${ch.phone_number})` : ''}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Número do destinatário</label>
                        <Input
                          placeholder="Ex: 5511999999999"
                          value={waPhone}
                          onChange={e => setWaPhone(e.target.value)}
                          className="text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Mensagem</label>
                        <textarea
                          rows={4}
                          placeholder="Digite sua mensagem..."
                          value={waMessage}
                          onChange={e => setWaMessage(e.target.value)}
                          className="w-full resize-none rounded-lg border border-border bg-card text-foreground px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                      <Button
                        onClick={handleSendWhatsApp}
                        disabled={sending}
                        className="w-full gap-2"
                      >
                        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        Enviar WhatsApp
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
