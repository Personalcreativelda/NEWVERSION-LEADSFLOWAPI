// "Ligar": o agente de voz liga a um cliente pelo WhatsApp Business.
// A Meta só deixa ligar a quem autorizou (pedido por mensagem, válido 7 dias; 1 pedido por dia, 2 por semana).
// Se o cliente ainda não autorizou, o modal passa a "Pedir autorização" (whatsapp-calls.service).
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AppModal } from '../base/AppModal';
import { LogoBox } from '../base/LogoBox';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { voiceAgentsApi, type WhatsAppCallsState } from '../../services/api/voice-agents';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: WhatsAppCallsState;
  onStarted: () => void;
}

const DEFAULT_PERMISSION_TEXT = 'Podemos ligar-lhe pelo WhatsApp?';

export function CallModal({ open, onOpenChange, state, onStarted }: Props) {
  const numbers = state.channels.filter((c) => c.enabled && c.voice_agent_id);
  const agents = state.agents.filter((a) => a.ready);
  const [channelId, setChannelId] = useState('');
  const [agentId, setAgentId] = useState('');
  const [to, setTo] = useState('');
  const [greeting, setGreeting] = useState('');
  const [purpose, setPurpose] = useState('');
  const [busy, setBusy] = useState(false);
  // Cliente sem autorização: o modal passa a pedir autorização
  const [needsPermission, setNeedsPermission] = useState<{ canRequest: boolean } | null>(null);
  const [permissionText, setPermissionText] = useState(DEFAULT_PERMISSION_TEXT);

  useEffect(() => {
    if (!open) return;
    const ch = numbers[0];
    setChannelId(ch?.id || '');
    const agent = agents.find((a) => a.id === ch?.voice_agent_id) || agents[0];
    setAgentId(agent?.id || '');
    setGreeting(agent?.greeting || '');
    setTo('');
    setPurpose('');
    setNeedsPermission(null);
    setPermissionText(DEFAULT_PERMISSION_TEXT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pickAgent = (id: string) => {
    setAgentId(id);
    const agent = agents.find((a) => a.id === id);
    if (agent) setGreeting(agent.greeting);
  };

  const call = async () => {
    setBusy(true);
    try {
      await voiceAgentsApi.startCall({ channel_id: channelId, voice_agent_id: agentId, to, greeting, purpose: purpose || undefined });
      toast.success('A ligar…');
      onOpenChange(false);
      onStarted();
    } catch (err: any) {
      const data = err?.response?.data;
      if (data?.code === 'NEEDS_PERMISSION') {
        setNeedsPermission({ canRequest: !!data.can_request });
      } else if (data?.code === 'NO_MINUTES' || data?.code === 'PLAN') {
        toast.error(data.error);
        window.dispatchEvent(new CustomEvent('leadflow:show-upgrade'));
      } else {
        toast.error(data?.error || 'Não foi possível ligar');
      }
    } finally {
      setBusy(false);
    }
  };

  const askPermission = async () => {
    setBusy(true);
    try {
      await voiceAgentsApi.requestCallPermission(channelId, to, permissionText);
      toast.success('Pedido enviado. Vai receber um aviso quando o cliente responder.');
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Não foi possível pedir autorização');
    } finally {
      setBusy(false);
    }
  };

  const digits = to.replace(/\D/g, '');
  const canCall = channelId && agentId && digits.length >= 8 && greeting.trim();

  return (
    <AppModal
      open={open}
      onOpenChange={(v) => { if (!busy) onOpenChange(v); }}
      size="md"
      logo={<LogoBox brand="whatsapp" />}
      title={needsPermission ? 'Pedir autorização' : 'Ligar com agente'}
      footer={(
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          {needsPermission ? (
            <Button onClick={askPermission} disabled={busy || !needsPermission.canRequest || !permissionText.trim()}>
              {busy ? 'A enviar…' : 'Pedir autorização'}
            </Button>
          ) : (
            <Button onClick={call} disabled={busy || !canCall}>{busy ? 'A ligar…' : 'Ligar'}</Button>
          )}
        </>
      )}
    >
      {numbers.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ative "Atender" num número primeiro (secção Números).</p>
      ) : needsPermission ? (
        <div className="space-y-4">
          <p className="text-sm text-foreground">
            {needsPermission.canRequest
              ? 'Este cliente ainda não autorizou chamadas. Envie-lhe o pedido pelo WhatsApp; quando aceitar, pode ligar durante 7 dias.'
              : 'Este cliente ainda não autorizou chamadas e já recebeu um pedido recentemente. Tente amanhã.'}
          </p>
          {needsPermission.canRequest && (
            <div>
              <Label htmlFor="call-perm" className="mb-1.5 block">Mensagem</Label>
              <Textarea id="call-perm" rows={3} maxLength={1024} value={permissionText} onChange={(e) => setPermissionText(e.target.value)} />
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <Label htmlFor="call-to" className="mb-1.5 block">Número do cliente</Label>
            <Input id="call-to" inputMode="tel" value={to} onChange={(e) => setTo(e.target.value)} placeholder="258 84 123 4567" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {numbers.length > 1 && (
              <div>
                <Label htmlFor="call-channel" className="mb-1.5 block">Ligar de</Label>
                <select id="call-channel" value={channelId} onChange={(e) => setChannelId(e.target.value)} className="w-full text-sm">
                  {numbers.map((c) => <option key={c.id} value={c.id}>{c.phone || c.name}</option>)}
                </select>
              </div>
            )}
            <div className={numbers.length > 1 ? '' : 'sm:col-span-2'}>
              <Label htmlFor="call-agent" className="mb-1.5 block">Agente</Label>
              <select id="call-agent" value={agentId} onChange={(e) => pickAgent(e.target.value)} className="w-full text-sm">
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="call-greeting" className="mb-1.5 block">Primeira frase</Label>
            <Input
              id="call-greeting"
              value={greeting}
              maxLength={500}
              onChange={(e) => setGreeting(e.target.value)}
              placeholder="Olá, fala a assistente virtual da sua loja. Tem um minuto?"
            />
          </div>
          <div>
            <Label htmlFor="call-purpose" className="mb-1.5 block">Objetivo da chamada</Label>
            <Textarea
              id="call-purpose"
              rows={3}
              maxLength={1500}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="Ex.: confirmar a encomenda de ontem e a morada de entrega."
            />
          </div>
        </div>
      )}
    </AppModal>
  );
}
