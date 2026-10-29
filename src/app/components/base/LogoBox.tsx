import type { ComponentType } from 'react';
import { BrandIcon, type Brand } from './BrandIcon';
import { MailProviderLogo, type MailProvider } from './MailProviderLogo';
import { cn } from '../ui/utils';

interface LogoBoxProps {
  /** Logótipo de uma marca (WhatsApp, Instagram…) */
  brand?: Brand;
  /** Logótipo de um fornecedor de email (Gmail, Outlook, Yahoo) */
  mail?: MailProvider;
  /** Sem marca (chat do site, SMS, email genérico): ícone com a cor do canal */
  icon?: ComponentType<{ className?: string }>;
  /** Cor do ícone genérico, ex.: 'text-violet-600 dark:text-violet-400' */
  tone?: string;
  className?: string;
}

/**
 * Logótipo do que está a ser configurado, igual em listas e cabeçalhos de modais:
 * caixa de 40px com o logótipo a 28px (ícones genéricos a 24px).
 */
export function LogoBox({ brand, mail, icon: Icon, tone = 'text-muted-foreground', className }: LogoBoxProps) {
  return (
    <span className={cn('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-muted', className)}>
      {brand ? (
        <BrandIcon brand={brand} className="h-7 w-7" />
      ) : mail ? (
        <MailProviderLogo provider={mail} className="h-7 w-7" />
      ) : Icon ? (
        <Icon className={cn('h-6 w-6', tone)} />
      ) : null}
    </span>
  );
}
