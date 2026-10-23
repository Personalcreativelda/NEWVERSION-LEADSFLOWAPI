// Logótipos reais das marcas (simple-icons), com a cor oficial de cada uma.
// Usar sempre estes em vez de ícones genéricos para canais, origens e integrações.
import {
  siWhatsapp, siFacebook, siMessenger, siInstagram, siTelegram, siGoogle, siGooglesheets,
  siMeta, siGoogleanalytics, siN8n, siTiktok, siX, siYoutube, siGmail,
  type SimpleIcon,
} from 'simple-icons';

const BRANDS = {
  whatsapp: siWhatsapp,
  facebook: siFacebook,
  messenger: siMessenger,
  instagram: siInstagram,
  telegram: siTelegram,
  google: siGoogle,
  googlesheets: siGooglesheets,
  meta: siMeta,
  googleanalytics: siGoogleanalytics,
  n8n: siN8n,
  tiktok: siTiktok,
  x: siX,
  youtube: siYoutube,
  gmail: siGmail,
} satisfies Record<string, SimpleIcon>;

export type Brand = keyof typeof BRANDS;

interface BrandIconProps {
  brand: Brand;
  className?: string;
  /** Usa a cor do texto em vez da cor da marca (ex.: sobre fundo colorido) */
  mono?: boolean;
  style?: React.CSSProperties;
}

export function BrandIcon({ brand, className = 'h-5 w-5', mono, style }: BrandIconProps) {
  const icon = BRANDS[brand];
  // Marcas pretas (X, TikTok) seguem a cor do texto para se verem no tema escuro
  const fill = mono || icon.hex === '000000' ? 'currentColor' : `#${icon.hex}`;
  return (
    <svg role="img" aria-label={icon.title} viewBox="0 0 24 24" className={className} fill={fill} style={style}>
      <path d={icon.path} />
    </svg>
  );
}

/** Componente com a mesma forma de um ícone do lucide ({ className }) para listas de configuração */
export function brandIcon(brand: Brand, mono?: boolean) {
  const Icon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
    <BrandIcon brand={brand} className={className} mono={mono} style={style} />
  );
  Icon.displayName = `BrandIcon(${brand})`;
  return Icon;
}

/** Marca de um tipo de canal/origem (whatsapp_cloud → whatsapp, etc.), ou null se não for marca */
export function brandForChannel(type?: string | null): Brand | null {
  const t = (type || '').toLowerCase();
  if (t.includes('whatsapp')) return 'whatsapp';
  if (t.includes('instagram')) return 'instagram';
  if (t.includes('messenger')) return 'messenger';
  if (t.includes('facebook') || t === 'fb') return 'facebook';
  if (t.includes('telegram')) return 'telegram';
  if (t.includes('tiktok')) return 'tiktok';
  if (t.includes('youtube')) return 'youtube';
  if (t.includes('google')) return 'google';
  return null;
}
