// Logótipo atual de um canal em forma de ícone de app (redondo): fundo da marca com o símbolo
// branco — Instagram e Messenger com o gradiente oficial; Gmail/Outlook/Yahoo a cores.
// Usado no selo do avatar das conversas e onde se mostram os canais lado a lado.
import { Globe, Mail, MessageCircle, Smartphone } from 'lucide-react';
import { BrandIcon, type Brand } from './BrandIcon';
import { MailProviderLogo, type MailProvider } from './MailProviderLogo';
import { cn } from '../ui/utils';

const INSTAGRAM_BG = 'radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285aeb 90%)';
const MESSENGER_BG = 'radial-gradient(circle at 19% 99%, #0099ff 0%, #a033ff 61%, #ff5280 93%, #ff7061 100%)';

type Look =
  | { kind: 'brand'; brand: Brand; bg: string; scale: number }
  | { kind: 'mail'; provider: MailProvider }
  | { kind: 'icon'; Icon: typeof Mail; bg: string };

function lookFor(type: string, provider?: string | null): Look {
  const t = (type || '').toLowerCase();
  if (t === 'email') {
    const p = (provider || '').toLowerCase();
    if (p === 'gmail' || p === 'outlook' || p === 'yahoo') return { kind: 'mail', provider: p };
    return { kind: 'icon', Icon: Mail, bg: '#6b7280' };
  }
  if (t.includes('whatsapp')) return { kind: 'brand', brand: 'whatsapp', bg: '#25d366', scale: 0.62 };
  if (t.includes('instagram')) return { kind: 'brand', brand: 'instagram', bg: INSTAGRAM_BG, scale: 0.56 };
  if (t.includes('facebook') || t.includes('messenger')) return { kind: 'brand', brand: 'messenger', bg: MESSENGER_BG, scale: 0.6 };
  // O símbolo do Telegram já é o círculo azul com o avião
  if (t.includes('telegram')) return { kind: 'brand', brand: 'telegram', bg: '#ffffff', scale: 1 };
  if (t.includes('tiktok')) return { kind: 'brand', brand: 'tiktok', bg: '#000000', scale: 0.56 };
  if (t === 'website') return { kind: 'icon', Icon: Globe, bg: '#7c3aed' };
  if (t.includes('sms') || t.includes('twilio')) return { kind: 'icon', Icon: Smartphone, bg: '#0ea5e9' };
  return { kind: 'icon', Icon: MessageCircle, bg: '#6b7280' };
}

interface ChannelLogoProps {
  /** Tipo do canal (whatsapp, whatsapp_cloud, instagram, facebook, telegram, email, website…) */
  type: string;
  /** Fornecedor do email (gmail, outlook, yahoo) */
  provider?: string | null;
  className?: string;
}

export function ChannelLogo({ type, provider, className = 'h-6 w-6' }: ChannelLogoProps) {
  const look = lookFor(type, provider);
  const box = cn('inline-flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full', className);

  if (look.kind === 'mail') {
    return (
      <span className={box} style={{ background: look.provider === 'yahoo' ? '#6001d2' : '#ffffff' }}>
        <MailProviderLogo provider={look.provider} className="h-[64%] w-[64%]" />
      </span>
    );
  }
  if (look.kind === 'icon') {
    const { Icon } = look;
    return (
      <span className={box} style={{ background: look.bg }}>
        <Icon className="h-[58%] w-[58%] text-white" strokeWidth={2.2} />
      </span>
    );
  }
  const size = `${look.scale * 100}%`;
  return (
    <span className={box} style={{ background: look.bg }}>
      <BrandIcon
        brand={look.brand}
        mono={look.brand !== 'telegram'}
        className="text-white"
        style={{ width: size, height: size }}
      />
    </span>
  );
}
