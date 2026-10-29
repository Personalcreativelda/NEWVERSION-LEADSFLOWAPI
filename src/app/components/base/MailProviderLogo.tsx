// Logótipos atuais dos fornecedores de email (a cores). O simple-icons só tem o "M" do Gmail
// numa cor e não tem Outlook nem Yahoo, por isso ficam aqui em SVG.
import { useId } from 'react';

export type MailProvider = 'gmail' | 'outlook' | 'yahoo';

/** Gmail (2020): "M" com as quatro cores da Google */
function GmailLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="52 42 88 66" className={className} role="img" aria-label="Gmail">
      <path fill="#4285F4" d="M58 108h14V74L52 59v43c0 3.32 2.69 6 6 6" />
      <path fill="#34A853" d="M120 108h14c3.32 0 6-2.69 6-6V59l-20 15" />
      <path fill="#FBBC04" d="M120 48v26l20-15v-8c0-7.42-8.47-11.65-14.4-7.2" />
      <path fill="#EA4335" d="M72 74V48l24 18 24-18v26L96 92" />
      <path fill="#C5221F" d="M52 51v8l20 15V48l-5.6-4.2c-5.94-4.45-14.4-.22-14.4 7.2" />
    </svg>
  );
}

/** Outlook: envelope azul com a placa do "O" à frente */
function OutlookLogo({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="Outlook">
      <defs>
        <linearGradient id={`${id}o`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1C8EF0" />
          <stop offset="1" stopColor="#0A4FB5" />
        </linearGradient>
        <linearGradient id={`${id}e`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3CC3FB" />
          <stop offset="1" stopColor="#1A86E4" />
        </linearGradient>
      </defs>
      {/* Folha dentro do envelope */}
      <rect x="11" y="4" width="18" height="14" rx="2" fill="#9BE3FF" />
      {/* Envelope */}
      <path d="M8 12.2 19.5 19.6 31 12.2v14A2.8 2.8 0 0 1 28.2 29H10.8A2.8 2.8 0 0 1 8 26.2z" fill={`url(#${id}e)`} />
      <path d="M8.6 27.8 19.5 20.6l10.9 7.2a2.8 2.8 0 0 1-2.2 1.2H10.8a2.8 2.8 0 0 1-2.2-1.2z" fill="#0F6FD6" opacity="0.55" />
      {/* Placa do O */}
      <rect x="1" y="8.5" width="16" height="16" rx="3.2" fill={`url(#${id}o)`} />
      <ellipse cx="9" cy="16.5" rx="3.9" ry="4.5" fill="none" stroke="#fff" strokeWidth="2.3" />
    </svg>
  );
}

/** Yahoo Mail: envelope branco sobre o roxo da Yahoo */
function YahooMailLogo({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="Yahoo Mail">
      <defs>
        <linearGradient id={`${id}y`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8A3FFC" />
          <stop offset="1" stopColor="#5F01D1" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="7" fill={`url(#${id}y)`} />
      <rect x="7" y="10" width="18" height="13" rx="2" fill="#fff" />
      <path d="M7.8 11.2 16 17.4l8.2-6.2" fill="none" stroke="#6001D2" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MailProviderLogo({ provider, className = 'h-7 w-7' }: { provider: MailProvider; className?: string }) {
  if (provider === 'gmail') return <GmailLogo className={className} />;
  if (provider === 'outlook') return <OutlookLogo className={className} />;
  return <YahooMailLogo className={className} />;
}
