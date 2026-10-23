// Canais em lista nativa: linha, detalhe (folha) e escolha de canal novo (folha).
import { useEffect, useState } from 'react';
import { ChevronRight, Cloud, Facebook, Globe, Instagram, Loader2, Mail, MessageCircle, RefreshCcw, Send, Settings, Smartphone, Trash2, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { Channel } from '../../../types/inbox';
import { channelsApi } from '../../../services/api/inbox';
import { AppModal } from '../../base/AppModal';
import { WhatsAppIcon } from '../../dashboard/leadDisplay';
import { brandIcon } from '../../base/BrandIcon';
import type { ComponentType } from 'react';

interface ChannelTypeInfo {
  label: string;
  subtitle: string;
  Icon: LucideIcon | ComponentType<{ className?: string }>;
  color: string;
}

const TYPE_INFO: Record<string, ChannelTypeInfo> = {
  whatsapp: { label: 'WhatsApp', subtitle: 'WhatsApp · API não oficial', Icon: brandIcon('whatsapp'), color: 'text-green-600 dark:text-green-400' },
  whatsapp_cloud: { label: 'WhatsApp Cloud', subtitle: 'WhatsApp · API oficial da Meta', Icon: brandIcon('whatsapp'), color: 'text-green-600 dark:text-green-400' },
  facebook: { label: 'Facebook Messenger', subtitle: 'Facebook · Messenger', Icon: brandIcon('messenger'), color: 'text-blue-600 dark:text-blue-400' },
  instagram: { label: 'Instagram', subtitle: 'Instagram · Direct', Icon: brandIcon('instagram'), color: 'text-pink-600 dark:text-pink-400' },
  telegram: { label: 'Telegram', subtitle: 'Telegram · Bot', Icon: brandIcon('telegram'), color: 'text-sky-600 dark:text-sky-400' },
  website: { label: 'Chat do site', subtitle: 'Chat do site · Widget', Icon: Globe, color: 'text-violet-600 dark:text-violet-400' },
  email: { label: 'Email', subtitle: 'Email · Caixa de entrada', Icon: Mail, color: 'text-cyan-600 dark:text-cyan-400' },
  twilio_sms: { label: 'SMS', subtitle: 'SMS · Twilio', Icon: Smartphone, color: 'text-teal-600 dark:text-teal-400' },
  sms: { label: 'SMS', subtitle: 'SMS · Twilio', Icon: Smartphone, color: 'text-teal-600 dark:text-teal-400' },
};

export function channelTypeInfo(type: string): ChannelTypeInfo {
  return TYPE_INFO[type] || { label: 'Canal', subtitle: type, Icon: MessageCircle, color: 'text-muted-foreground' };
}

/** Nome a mostrar: o canal sem nome (ou só com "|", espaços…) usa o nome do tipo */
export function channelDisplayName(channel: Channel): string {
  const name = (channel.name || '').trim();
  return /[\p{L}\p{N}]/u.test(name) ? name : channelTypeInfo(channel.type).label;
}

const isConnected = (channel: Channel) => channel.status === 'active';

export function ChannelRow({ channel, onOpen }: { channel: Channel; onOpen: (c: Channel) => void }) {
  const info = channelTypeInfo(channel.type);
  const Icon = info.Icon;
  const connected = isConnected(channel);
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(channel)}
        className="flex w-full min-h-[64px] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 active:bg-muted"
      >
        <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-muted ${info.color}`}>
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block break-words text-[15px] font-medium leading-snug text-foreground">{channelDisplayName(channel)}</span>
          <span className="block text-[13px] text-muted-foreground">{info.subtitle}</span>
        </span>
        <span className={`flex flex-shrink-0 items-center gap-1.5 text-xs font-medium ${connected ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-500'}`} />
          {connected ? 'Ligado' : 'Desligado'}
        </span>
        <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
      </button>
    </li>
  );
}

interface ChannelDetailSheetProps {
  channel: Channel | null;
  onClose: () => void;
  onRename: (channel: Channel, name: string) => Promise<void> | void;
  onOpenSettings: (channel: Channel) => void;
  onDisconnect: (channel: Channel) => Promise<void> | void;
  onSynced: () => void;
}

/** Detalhe do canal: editar nome, definições, sincronizar e desligar */
export function ChannelDetailSheet({ channel, onClose, onRename, onOpenSettings, onDisconnect, onSynced }: ChannelDetailSheetProps) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (channel) setName(channelDisplayName(channel));
  }, [channel]);

  if (!channel) return null;
  const info = channelTypeInfo(channel.type);
  const Icon = info.Icon;
  const connected = isConnected(channel);
  const instance = channel.credentials?.instance_name || channel.credentials?.instance_id;

  const saveName = async () => {
    const next = name.trim();
    if (!next || next === channelDisplayName(channel)) return;
    setSaving(true);
    try {
      await onRename(channel, next);
    } finally {
      setSaving(false);
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      await channelsApi.sync(channel.id);
      toast.success('Canal sincronizado');
      onSynced();
    } catch {
      toast.error('Erro ao sincronizar o canal');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <AppModal
      open={!!channel}
      onOpenChange={(open) => !open && onClose()}
      size="md"
      title={
        <span className="flex items-center gap-3">
          <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-muted ${info.color}`}>
            <Icon className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block break-words">{channelDisplayName(channel)}</span>
            <span className="block text-sm font-normal text-muted-foreground">{info.subtitle}</span>
          </span>
        </span>
      }
    >
      <div className="space-y-5">
        <div className={`flex items-center gap-2 text-sm font-medium ${connected ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-500'}`} />
          {connected ? 'Ligado' : 'Desligado'}
          {instance && <span className="ml-auto truncate font-mono text-xs font-normal text-muted-foreground">{instance}</span>}
        </div>

        <label className="block text-sm font-medium text-foreground">
          Nome do canal
          <div className="mt-1.5 flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveName()}
              className="h-11 flex-1 rounded-lg border border-border bg-card px-3 text-[15px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
            />
            <button
              type="button"
              onClick={saveName}
              disabled={saving || !name.trim() || name.trim() === channelDisplayName(channel)}
              className="h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
            </button>
          </div>
        </label>

        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          <button type="button" onClick={() => onOpenSettings(channel)} className="flex w-full min-h-[52px] items-center gap-3 px-4 text-left text-[15px] text-foreground hover:bg-muted/50">
            <Settings className="h-[18px] w-[18px] text-muted-foreground" />
            <span className="flex-1">{channel.type === 'whatsapp' ? 'Ligar de novo (código QR)' : 'Definições do canal'}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
          <button type="button" onClick={sync} disabled={syncing} className="flex w-full min-h-[52px] items-center gap-3 px-4 text-left text-[15px] text-foreground hover:bg-muted/50 disabled:opacity-60">
            {syncing ? <Loader2 className="h-[18px] w-[18px] animate-spin text-muted-foreground" /> : <RefreshCcw className="h-[18px] w-[18px] text-muted-foreground" />}
            <span className="flex-1">Sincronizar</span>
          </button>
          <button type="button" onClick={() => onDisconnect(channel)} className="flex w-full min-h-[52px] items-center gap-3 px-4 text-left text-[15px] text-red-600 hover:bg-red-500/5 dark:text-red-400">
            <Trash2 className="h-[18px] w-[18px]" />
            <span className="flex-1">Desligar canal</span>
          </button>
        </div>
      </div>
    </AppModal>
  );
}

export interface AvailableChannel {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon | ComponentType<{ className?: string }>;
  color: string;
  available: boolean;
}

/** Escolher o canal a ligar */
export function AddChannelSheet({ open, onClose, channels, onPick }: {
  open: boolean;
  onClose: () => void;
  channels: AvailableChannel[];
  onPick: (id: string) => void;
}) {
  return (
    <AppModal open={open} onOpenChange={(o) => !o && onClose()} size="md" title="Adicionar canal" description="Escolha o canal que quer ligar">
      <ul className="-mx-1 divide-y divide-border">
        {channels.filter((c) => c.available).map((c) => {
          const Icon = c.icon;
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => { onClose(); onPick(c.id); }}
                className="flex w-full min-h-[60px] items-center gap-3 rounded-lg px-1 py-2.5 text-left hover:bg-muted/50 active:bg-muted"
              >
                <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-muted ${c.color}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium text-foreground">{c.name}</span>
                  <span className="block text-[13px] text-muted-foreground">{c.description}</span>
                </span>
                <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              </button>
            </li>
          );
        })}
      </ul>
    </AppModal>
  );
}
