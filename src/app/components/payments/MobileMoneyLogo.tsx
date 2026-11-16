import { cn } from '../ui/utils';
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
export function MobileMoneyLogo({ method, logoUrl, className }: { method: MobileMethod; logoUrl?: string | null; className?: string }) {
  const b = BRAND[method];
  if (logoUrl) {
    return (
      <span className={cn('flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white', className)}>
        <img src={logoUrl} alt="" className="h-full w-full object-contain" loading="lazy" />
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
