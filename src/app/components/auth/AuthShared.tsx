// Peças comuns das páginas de entrada (login, criar conta, recuperar palavra-passe, confirmar
// email): as mesmas cores por tema, o mesmo cartão com o logótipo e o campo do código.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Zap } from 'lucide-react';
import { useThemeMode } from '../../context/ThemeModeContext';
import { AppButton } from '../base/AppButton';
import { authApi } from '../../utils/api';

export const AUTH_FONT = 'var(--font-sans)';

// Cores do cartão por tema (o tema segue o telemóvel — ver utils/theme.ts)
export const AUTH_COLORS = {
  light: {
    card: 'rgba(255,255,255,0.97)', cardBorder: 'rgba(255,255,255,0.3)',
    title: '#1A2C44', muted: '#6B7280', label: '#414552', body: '#3C4257', link: '#533AFD',
    inputBg: '#FFFFFF', inputText: '#273951', border: '#D4DEE9',
    subtle: '#8A9BB0', faint: '#B0B8C4', divider: '#EEF0F3',
    errorBg: '#FFF0F3', errorIcon: '#E61947', errorText: '#C0123C', warnBg: '#FFF8E6', warnText: '#CC4B00',
    okBg: '#ECFDF5', okText: '#047857',
  },
  dark: {
    card: 'rgba(22,23,27,0.95)', cardBorder: 'rgba(255,255,255,0.08)',
    title: '#F1F5F9', muted: '#9CA3AF', label: '#D1D5DB', body: '#C7CBD4', link: '#A5B4FC',
    inputBg: '#0F1013', inputText: '#F1F5F9', border: '#2E3240',
    subtle: '#8B93A7', faint: '#6B7280', divider: '#24262B',
    errorBg: 'rgba(230,25,71,0.12)', errorIcon: '#FB7185', errorText: '#FDA4AF', warnBg: 'rgba(204,75,0,0.14)', warnText: '#FDBA74',
    okBg: 'rgba(5,150,105,0.14)', okText: '#6EE7B7',
  },
} as const;

export type AuthColors = (typeof AUTH_COLORS)['light'] | (typeof AUTH_COLORS)['dark'];

export function useAuthColors(): AuthColors {
  return AUTH_COLORS[useThemeMode()];
}

export const PRIMARY = '#675DFF';

/** Logótipo + cartão, igual em todas as páginas de entrada */
export function AuthShell({ children }: { children: ReactNode }) {
  const c = useAuthColors();
  return (
    <div className="min-h-[100dvh] relative flex items-center justify-center py-6 sm:py-16 px-4 overflow-hidden"
      style={{ background: 'transparent', fontFamily: AUTH_FONT }}>
      <div className="relative z-10 w-full max-w-[520px] flex flex-col">
        <div className="flex items-center gap-2.5 mb-5 sm:mb-8">
          <div className="w-9 h-9 rounded-[10px] flex items-center justify-center"
            style={{ background: PRIMARY, boxShadow: '0 2px 12px rgba(103,93,255,0.45)' }}>
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="text-[19px] font-semibold text-white tracking-tight">LeadsFlow</span>
        </div>
        <div className="rounded-[12px] p-6 sm:p-10"
          style={{
            background: c.card,
            border: `1px solid ${c.cardBorder}`,
            boxShadow: '0 4px 16px rgba(0,0,0,0.08), 0 8px 32px rgba(0,0,0,0.06)',
            backdropFilter: 'blur(20px)',
          }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Título e subtítulo do cartão */
export function AuthTitle({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  const c = useAuthColors();
  return (
    <>
      <h1 className="text-[24px] leading-[32px] sm:text-[28px] sm:leading-[36px] font-semibold mb-1 sm:mb-2" style={{ color: c.title }}>
        {title}
      </h1>
      {subtitle && (
        <p className="text-[15px] mb-5 sm:mb-7" style={{ color: c.muted, fontWeight: 300 }}>{subtitle}</p>
      )}
    </>
  );
}

/** Aviso de erro ou de sucesso dentro do cartão */
export function AuthNotice({ type, children }: { type: 'error' | 'success'; children: ReactNode }) {
  const c = useAuthColors();
  const isError = type === 'error';
  const Icon = isError ? AlertCircle : CheckCircle2;
  return (
    <div role={isError ? 'alert' : 'status'} className="mb-5 p-3.5 rounded-[8px] flex items-start gap-3 animate-in fade-in duration-200"
      style={{ background: isError ? c.errorBg : c.okBg, border: `1px solid ${isError ? 'rgba(230,25,71,0.3)' : 'rgba(5,150,105,0.3)'}` }}>
      <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: isError ? c.errorIcon : c.okText }} />
      <p className="text-[13px] leading-[18px]" style={{ color: isError ? c.errorText : c.okText }}>{children}</p>
    </div>
  );
}

/** Botão principal (largura toda) das páginas de entrada */
export function AuthPrimaryButton({ children, disabled, loading, type = 'submit', onClick }: {
  children: ReactNode; disabled?: boolean; loading?: boolean; type?: 'submit' | 'button'; onClick?: () => void;
}) {
  const c = useAuthColors();
  const off = disabled || loading;
  return (
    <AppButton type={type} onClick={onClick} disabled={disabled} loading={loading}
      style={{
        width: '100%', height: '50px', fontSize: '16px', fontWeight: 500, borderRadius: '6px', border: 'none',
        background: off ? c.border : PRIMARY, color: off ? c.body : '#FFFFFF',
        boxShadow: off ? 'none' : `0 0 0 1px ${PRIMARY}`, transition: 'background-color 200ms ease',
      }}
      className="transition-all hover:brightness-110 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-70">
      {children}
    </AppButton>
  );
}

/** Ligação discreta (voltar, reenviar…) */
export function AuthLink({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  const c = useAuthColors();
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="inline-flex items-center gap-1.5 transition-colors hover:brightness-125 disabled:opacity-50 disabled:cursor-not-allowed"
      style={{ fontSize: '14px', color: c.link, fontWeight: 400 }}>
      {children}
    </button>
  );
}

/**
 * Código de 6 dígitos em caixas (como nos bancos): colar o código preenche tudo, apagar volta
 * à caixa anterior, e no telemóvel abre o teclado numérico e sugere o código do SMS/email.
 */
export function CodeInput({ value, onChange, length = 6, autoFocus = true, invalid = false, disabled = false }: {
  value: string; onChange: (v: string) => void; length?: number; autoFocus?: boolean; invalid?: boolean; disabled?: boolean;
}) {
  const c = useAuthColors();
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, i) => value[i] || '');

  useEffect(() => {
    // Sem foco automático em ecrã tátil abria o teclado sem pedir; aqui o código é o único campo
    if (autoFocus) refs.current[Math.min(value.length, length - 1)]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setAt = (i: number, raw: string) => {
    const clean = raw.replace(/\D/g, '');
    if (!clean) return;
    // Colar ou preenchimento automático: vários dígitos de uma vez
    const next = (value.slice(0, i) + clean).slice(0, length);
    onChange(next);
    refs.current[Math.min(next.length, length - 1)]?.focus();
  };

  return (
    <div className="flex justify-between gap-2 sm:gap-3" onPaste={(e) => {
      const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
      if (text) { e.preventDefault(); onChange(text); refs.current[Math.min(text.length, length - 1)]?.focus(); }
    }}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          data-bare
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Dígito ${i + 1}`}
          maxLength={length}
          disabled={disabled}
          value={d}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            if (e.target.value === '') { onChange(value.slice(0, i) + value.slice(i + 1)); return; }
            setAt(i, e.target.value.slice(-length));
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !d && i > 0) {
              e.preventDefault();
              onChange(value.slice(0, i - 1));
              refs.current[i - 1]?.focus();
            } else if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
            else if (e.key === 'ArrowRight' && i < length - 1) refs.current[i + 1]?.focus();
          }}
          className="h-14 w-full min-w-0 rounded-[8px] text-center text-[24px] font-semibold tabular-nums transition-all focus:outline-none focus:border-[#635BFF] focus:shadow-[0_0_0_4px_rgba(99,91,255,0.15)] disabled:opacity-60"
          style={{
            background: c.inputBg, color: c.inputText, caretColor: PRIMARY,
            border: `1px solid ${invalid ? '#E61947' : d ? PRIMARY : c.border}`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * Confirmar o email com o código de 6 dígitos (depois de criar conta, ou ao entrar com uma
 * conta por confirmar). Com a palavra-passe, entra logo a seguir.
 */
export function EmailCodeStep({ email, password, onVerified, onBack, backLabel = 'Voltar ao login' }: {
  email: string;
  password?: string;
  onVerified: () => void;
  onBack: () => void;
  backLabel?: string;
}) {
  const c = useAuthColors();
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cooldown, setCooldown] = useState(30);
  const submitted = useRef('');

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const verify = async (value = code) => {
    if (value.length < 6 || status === 'loading') return;
    submitted.current = value;
    setStatus('loading');
    setError('');
    setNotice('');
    try {
      await authApi.verifyEmail(email, value);
      setStatus('done');
      if (password) {
        try {
          const r = await authApi.signin(email, password);
          if ((r as any)?.success) { onVerified(); return; }
        } catch { /* entra pelo login */ }
      }
      setNotice('Email confirmado. Já pode entrar.');
      setTimeout(onBack, 1200);
    } catch (err: any) {
      setStatus('idle');
      setError(err?.message || 'Código inválido ou expirado.');
    }
  };

  // Ao completar os 6 dígitos confirma sozinho (uma vez por código)
  useEffect(() => {
    if (code.length === 6 && submitted.current !== code) void verify(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const resend = async () => {
    setError('');
    setNotice('');
    try {
      await authApi.resendConfirmation(email);
      setNotice('Enviámos um código novo. Veja também o spam.');
      setCooldown(60);
      setCode('');
      submitted.current = '';
    } catch (err: any) {
      setError(err?.message || 'Não foi possível reenviar o código.');
    }
  };

  return (
    <AuthShell>
      <AuthTitle
        title="Confirme o seu email"
        subtitle={<>Enviámos um código de 6 dígitos para <span translate="no" style={{ color: c.title, fontWeight: 500 }}>{email}</span>.</>}
      />
      {error && <AuthNotice type="error">{error}</AuthNotice>}
      {notice && <AuthNotice type="success">{notice}</AuthNotice>}
      <form onSubmit={(e) => { e.preventDefault(); void verify(); }} className="space-y-5">
        <CodeInput value={code} onChange={(v) => { setCode(v); if (error) setError(''); }} invalid={!!error} disabled={status === 'done'} />
        <AuthPrimaryButton disabled={code.length < 6 || status === 'done'} loading={status === 'loading'}>
          {status === 'loading' ? 'A confirmar...' : 'Confirmar'}
        </AuthPrimaryButton>
      </form>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <AuthLink onClick={onBack}>{backLabel}</AuthLink>
        <AuthLink onClick={() => void resend()} disabled={cooldown > 0}>
          {cooldown > 0 ? `Reenviar código (${cooldown}s)` : 'Reenviar código'}
        </AuthLink>
      </div>
    </AuthShell>
  );
}
