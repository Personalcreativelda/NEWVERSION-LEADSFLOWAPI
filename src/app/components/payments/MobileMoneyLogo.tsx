import { useState } from 'react';
import { cn } from '../ui/utils';
import { getApiBaseUrl } from '../../utils/api-client';
import type { MobileMethod } from '../../utils/mobileMoney';

// Cores das marcas (não há logótipo do M-Pesa/e-Mola no simple-icons)
const BRAND: Record<MobileMethod, { bg: string; label: string }> = {
  mpesa: { bg: '#E60000', label: 'M-Pesa' },
  emola: { bg: '#F39200', label: 'e-Mola' },
};

/**
 * Logótipo do M-Pesa / e-Mola na caixa de 40px, igual ao LogoBox dos outros métodos.
 * Usa a imagem carregada em Admin → Pagamentos; sem imagem, o nome com a cor da marca.
 */
/**
 * Endereço da imagem para o <img>: "/api/files/…" vem sem host (junta-se o da API, que no app
 * não é o da página) e "http://" passa a "https://" (o WebView do Android bloqueia imagens http).
 */
export function logoSrc(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('/api/files/')) return `${getApiBaseUrl() || ''}${url}`;
  if (url.startsWith('http://')) return `https://${url.slice(7)}`;
  return url;
}

export function MobileMoneyLogo({ method, logoUrl, className }: { method: MobileMethod; logoUrl?: string | null; className?: string }) {
  const b = BRAND[method];
  const src = logoSrc(logoUrl);
  // Se a imagem não carregar, mostra a cor da marca em vez do ícone de imagem partida
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (src && failedSrc !== src) {
    return (
      <span className={cn('flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white', className)}>
        <img src={src} alt="" className="h-full w-full object-contain" loading="lazy" onError={() => setFailedSrc(src)} />
      </span>
    );
  }
  return (
    <span
      className={cn('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-[10px] font-extrabold leading-none tracking-tight text-white', className)}
      style={{ background: b.bg }}
      aria-hidden="true"
      translate="no"
    >
      {b.label}
    </span>
  );
}
