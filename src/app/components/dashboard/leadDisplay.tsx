// Como um lead aparece nas listas: origem com ícone, telefone formatado, estado e nome.
import { Globe, Mail, Megaphone, MessageCircle, PenLine, Smartphone, type LucideIcon } from 'lucide-react';
import { brandIcon } from '../base/BrandIcon';
import type { ComponentType } from 'react';

// Logótipo do WhatsApp na cor do texto (para botões coloridos); nas listas usa-se a cor da marca
export const WhatsAppIcon = brandIcon('whatsapp', true);

const WhatsAppLogo = brandIcon('whatsapp');
const InstagramLogo = brandIcon('instagram');
const FacebookLogo = brandIcon('facebook');
const TelegramLogo = brandIcon('telegram');

export interface OriginInfo {
  key: string;
  label: string;
  Icon: LucideIcon | ComponentType<{ className?: string }>;
  /** Cor do ícone */
  color: string;
  /** Cor da barra de progresso */
  bar: string;
}

/** Origem normalizada (o mesmo canal pode vir escrito de várias formas) */
export function getOriginInfo(origem?: string, channelSource?: string): OriginInfo {
  const raw = (channelSource || origem || '').toLowerCase().trim();
  if (raw.includes('whatsapp') || raw.includes('wpp')) return { key: 'whatsapp', label: 'WhatsApp', Icon: WhatsAppLogo, color: 'text-green-600 dark:text-green-400', bar: 'bg-green-500' };
  if (raw.includes('instagram') || raw === 'ig' || raw.includes('insta')) return { key: 'instagram', label: 'Instagram', Icon: InstagramLogo, color: 'text-pink-600 dark:text-pink-400', bar: 'bg-pink-500' };
  if (raw.includes('facebook') || raw.includes('messenger') || raw === 'fb') return { key: 'facebook', label: 'Facebook', Icon: FacebookLogo, color: 'text-blue-600 dark:text-blue-400', bar: 'bg-blue-500' };
  if (raw.includes('telegram') || raw === 'tg') return { key: 'telegram', label: 'Telegram', Icon: TelegramLogo, color: 'text-sky-600 dark:text-sky-400', bar: 'bg-sky-500' };
  if (raw.includes('sms') || raw.includes('twilio')) return { key: 'sms', label: 'SMS', Icon: Smartphone, color: 'text-teal-600 dark:text-teal-400', bar: 'bg-teal-500' };
  if (raw.includes('email') || raw.includes('mail') || raw.includes('@')) return { key: 'email', label: 'Email', Icon: Mail, color: 'text-primary', bar: 'bg-primary' };
  if (raw.includes('site') || raw.includes('website') || raw.includes('widget')) return { key: 'website', label: 'Chat do site', Icon: Globe, color: 'text-indigo-600 dark:text-indigo-400', bar: 'bg-indigo-500' };
  if (raw.includes('campanha') || raw.includes('campaign')) return { key: 'campaign', label: 'Campanha', Icon: Megaphone, color: 'text-amber-600 dark:text-amber-400', bar: 'bg-amber-500' };
  if (raw.includes('manual') || !raw) return { key: 'manual', label: raw ? 'Manual' : 'Sem origem', Icon: PenLine, color: 'text-muted-foreground', bar: 'bg-muted-foreground' };
  const label = raw.charAt(0).toUpperCase() + raw.slice(1);
  return { key: raw, label, Icon: MessageCircle, color: 'text-muted-foreground', bar: 'bg-muted-foreground' };
}

/** +258 84 752 9228 (Moçambique) ou o número com + e espaços a cada 3 dígitos */
export function formatPhone(value?: string | null): string {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  if (!digits) return value;
  if (digits.startsWith('258') && digits.length === 12) {
    const n = digits.slice(3);
    return `+258 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}`;
  }
  if (digits.length === 9 && /^[82]/.test(digits)) {
    return `+258 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`;
  }
  if (digits.length > 9) {
    // código do país (até 3 dígitos) + resto em grupos de 3
    const cc = digits.length > 11 ? digits.slice(0, 3) : digits.slice(0, digits.length - 9);
    const rest = digits.slice(cc.length).replace(/(\d{3})(?=\d)/g, '$1 ');
    return `+${cc} ${rest}`;
  }
  return digits.replace(/(\d{3})(?=\d)/g, '$1 ');
}

/** Nome a mostrar: se for igual ao telefone (ou vazio), o telefone formatado */
export function leadDisplayName(lead: { nome?: string; name?: string; telefone?: string; phone?: string; email?: string }): string {
  const name = (lead.nome || lead.name || '').trim();
  const phone = lead.telefone || lead.phone || '';
  if (!name || name.replace(/\D/g, '') === phone.replace(/\D/g, '') && phone) return formatPhone(phone) || lead.email || 'Sem nome';
  return name;
}

const STATUS_LABELS: Record<string, string> = {
  novo: 'Novo', novos: 'Novo', new: 'Novo',
  contatado: 'Contactado', contactado: 'Contactado', contacted: 'Contactado',
  qualificado: 'Qualificado', qualified: 'Qualificado',
  negociacao: 'Em negociação', 'negociação': 'Em negociação', negotiation: 'Em negociação',
  convertido: 'Convertido', fechado: 'Convertido', converted: 'Convertido', won: 'Convertido',
  perdido: 'Perdido', lost: 'Perdido',
};

/** Estado com inicial maiúscula ("Novo") */
export function formatLeadStatus(status?: string): string {
  if (!status) return 'Novo';
  const key = status.toLowerCase().trim();
  if (STATUS_LABELS[key]) return STATUS_LABELS[key];
  const clean = status.replace(/[_-]+/g, ' ').trim();
  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
}

/** Cores do chip de estado */
export function leadStatusClass(status?: string): string {
  const s = (status || 'novo').toLowerCase();
  if (s.includes('novo') || s === 'new') return 'bg-sky-500/12 text-sky-700 dark:text-sky-300';
  if (s.includes('contat') || s.includes('contact')) return 'bg-violet-500/12 text-violet-700 dark:text-violet-300';
  if (s.includes('qualific')) return 'bg-amber-500/12 text-amber-700 dark:text-amber-300';
  if (s.includes('negoci')) return 'bg-orange-500/12 text-orange-700 dark:text-orange-300';
  if (s.includes('convert') || s.includes('fechado') || s === 'won') return 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300';
  if (s.includes('perdido') || s === 'lost') return 'bg-red-500/12 text-red-700 dark:text-red-300';
  return 'bg-muted text-muted-foreground';
}
