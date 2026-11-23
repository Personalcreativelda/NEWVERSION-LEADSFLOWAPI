import { useState, useEffect } from 'react';
import { Input } from '../ui/input';
import { AlertCircle, CheckCircle, Eye, EyeOff, MailCheck, Zap, Star } from 'lucide-react';
import { authApi } from '../../utils/api';
import { metaEvents } from '../MetaPixel';
import { AppButton } from '../base/AppButton';
import { EmailCodeStep, useAuthColors } from './AuthShared';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.leadsflowapi.com';

interface RatingSummary {
  average: number;
  total: number;
  reviews: { stars: number; message: string; user_name: string; created_at: string }[];
}

// Google icon SVG
const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const FONT = 'var(--font-sans)';

interface SignupPageProps {
  onSuccess: () => void;
  onSwitchToLogin: () => void;
  onBackToHome?: () => void;
}

export default function SignupPage({ onSuccess, onSwitchToLogin }: SignupPageProps) {
  const c = useAuthColors();
  const [ratings, setRatings] = useState<RatingSummary | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState<'idle' | 'success' | 'confirmation'>('idle');
  const [pendingEmail, setPendingEmail] = useState('');
  const [resendState, setResendState] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle');
  const [resendMessage, setResendMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);

  // Fetch real ratings summary
  useEffect(() => {
    fetch(`${API_URL}/api/feedback/summary`)
      .then(r => r.json())
      .then(data => { if (data.success) setRatings(data); })
      .catch(() => {});
  }, []);


  const isValidEmail = (value: string) => {
    const normalized = value.trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
  };

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const trimmedEmail = email.trim();
      const trimmedName = name.trim();

      if (!isValidEmail(trimmedEmail)) {
        throw new Error('Por favor, insira um email válido.');
      }

      if (password.length < 6) {
        throw new Error('A senha deve ter pelo menos 6 caracteres');
      }

      // Signup now auto-signs in on success
      const response = await authApi.signup(trimmedEmail, password, trimmedName);
      if (response.success) {
        metaEvents.completeRegistration({
          content_name: 'LeadsFlow Account',
          currency: 'BRL',
          value: 0,
          status: 'success'
        });

        if ((response as any).requiresEmailConfirmation) {
          setPendingEmail(trimmedEmail);
          setResendState('idle');
          setResendMessage('');
          setStatus('confirmation');
          return;
        }

        setStatus('success');
        setTimeout(() => {
          onSuccess();
        }, 1000);
      }
    } catch (err: any) {
      console.error('Signup error in component:', err);
      
      // Show user-friendly error messages
      if (err.message?.includes('já está cadastrado')) {
        setError(err.message);
      } else {
        setError(err.message || 'Erro ao criar conta');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    setError('');
    setLoading(true);

    try {
      // Use direct Google OAuth via backend (without Supabase)
      await authApi.signInWithGoogle();
      // Redirect will happen automatically
      console.log('[Google Signup] Redirecting to Google via backend...');
    } catch (err: any) {
      console.error('[Google Signup Error]', err);
      setError(err.message || 'Erro ao criar conta com Google');
      setLoading(false);
    }
  };


  if (status === 'confirmation' && pendingEmail) {
    return (
      <EmailCodeStep
        email={pendingEmail}
        password={password}
        onVerified={onSuccess}
        onBack={() => { setStatus('idle'); setPendingEmail(''); setError(''); }}
        backLabel="Usar outro email"
      />
    );
  }

  if (status !== 'idle') {
    const isConfirmation = status === 'confirmation';
    return (
      <div className="min-h-screen relative flex items-center justify-center px-4 overflow-hidden"
        style={{ background: 'transparent', fontFamily: FONT }}>
        {/* Logo */}
        <div className="relative z-10 w-full max-w-[520px] flex flex-col">
          <div className="flex items-center gap-2.5 mb-8">
            <div className="w-9 h-9 rounded-[10px] flex items-center justify-center"
              style={{ background: '#2563EB' }}>
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-[19px] font-semibold text-white tracking-tight">LeadsFlow</span>
          </div>
          <div className="rounded-[12px] p-6 sm:p-10 space-y-6 text-center" style={{ background: c.card, border: `1px solid ${c.cardBorder}`, boxShadow: '0 4px 16px rgba(0,0,0,0.08), 0 8px 32px rgba(0,0,0,0.06)', backdropFilter: 'blur(20px)' }}>
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.15)' }}>
                {isConfirmation
                  ? <MailCheck className="w-8 h-8" style={{ color: '#2563EB' }} />
                  : <CheckCircle className="w-8 h-8" style={{ color: '#2563EB' }} />
                }
              </div>
            </div>
            <div className="space-y-3">
              <h2 className="font-serif" style={{ fontSize: '28px', fontWeight: 500, color: c.title }}>
                {isConfirmation ? 'Confirme seu email' : 'Conta criada'}
              </h2>
              {isConfirmation ? (
                <div className="space-y-2" style={{ fontSize: '14px', color: c.body, fontWeight: 400 }}>
                  <p>Verifique seu email para confirmar a conta antes de acessar o painel.</p>
                  {pendingEmail && <p>Enviamos o link para <span style={{ fontWeight: 500, color: c.title }}>{pendingEmail}</span>.</p>}
                  <p>Verifique também a pasta de spam ou promoções.</p>
                </div>
              ) : (
                <p style={{ fontSize: '14px', color: c.body, fontWeight: 400 }}>
                  A abrir o painel…
                </p>
              )}
            </div>
            {isConfirmation ? (
              <div className="flex flex-col gap-3">
                <AppButton
                  onClick={async () => {
                    if (!pendingEmail || resendState === 'loading') return;
                    try {
                      setResendState('loading'); setResendMessage('');
                      await authApi.resendConfirmation(pendingEmail);
                      setResendState('sent'); setResendMessage('Email reenviado. Veja a caixa de entrada ou o spam.');
                    } catch (resendErr: any) {
                      setResendState('error');
                      setResendMessage(resendErr?.message || 'Não foi possível reenviar o email.');
                    }
                  }}
                  disabled={!pendingEmail}
                  loading={resendState === 'loading'}
                  style={{ width: '100%', background: 'rgba(239,239,239,0.3)', border: `1px solid ${c.border}`, borderRadius: '6px', height: '44px', fontSize: '14px', color: c.label, fontWeight: 400 }}
                  className="transition-colors hover:border-[#93C5FD] disabled:opacity-60">
                  {resendState === 'loading' ? 'Reenviando...' : 'Reenviar email de confirmação'}
                </AppButton>
                {resendMessage && (
                  <p style={{ fontSize: '13px', color: resendState === 'error' ? c.errorIcon : '#059669' }}>{resendMessage}</p>
                )}
                <AppButton onClick={onSwitchToLogin}
                  style={{ width: '100%', background: '#2563EB', borderRadius: '6px', height: '44px', fontSize: '14px', fontWeight: 500, border: 'none', color: '#fff', boxShadow: '0 0 0 1px #2563EB' }}
                  className="transition-colors hover:brightness-110">
                  Ir para o login
                </AppButton>
                <button type="button" style={{ fontSize: '13px', color: c.subtle, fontWeight: 400 }}
                  className="transition-colors hover:underline"
                  onClick={() => { setStatus('idle'); setPendingEmail(''); setError(''); setResendState('idle'); setResendMessage(''); }}>
                  Voltar e tentar outro email
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                {[0, 0.1, 0.2].map((delay, i) => (
                  <div key={i} className="w-2 h-2 rounded-full animate-bounce" style={{ background: '#2563EB', animationDelay: `${delay}s` }} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center py-16 px-4 overflow-hidden"
      style={{ background: 'transparent', fontFamily: FONT }}>

      {/* Column: Logo + Card */}
      <div className="relative z-10 w-full max-w-[520px] flex flex-col">

        {/* Logo acima do card */}
        <div className="flex items-center gap-2.5 mb-8">
          <div className="w-9 h-9 rounded-[10px] flex items-center justify-center"
            style={{ background: '#2563EB' }}>
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="text-[19px] font-semibold text-white tracking-tight">LeadsFlow</span>
        </div>

        <div className="rounded-[12px] p-6 sm:p-10"
          style={{ background: c.card, border: `1px solid ${c.cardBorder}`, boxShadow: '0 4px 16px rgba(0,0,0,0.08), 0 8px 32px rgba(0,0,0,0.06)', backdropFilter: 'blur(20px)' }}>

          {/* Title */}
          <h1 className="font-serif" style={{ fontSize: '32px', lineHeight: '40px', fontWeight: 500, color: c.title, marginBottom: '8px' }}>Criar uma conta</h1>
          <p style={{ fontSize: '15px', color: c.muted, fontWeight: 400, marginBottom: '28px' }}>
            Já tem uma conta?{' '}
            <button onClick={onSwitchToLogin} style={{ color: c.link, fontWeight: 400 }} className="transition-colors hover:text-[#2563EB]">Entrar</button>
          </p>

          {/* Error */}
          {error && (
            <div className="mb-5 p-4 rounded-[8px] flex items-start gap-3 animate-in fade-in duration-200"
              style={{ background: c.errorBg, border: '1px solid rgba(230,25,71,0.3)' }}>
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: c.errorIcon }} />
              <p style={{ fontSize: '13px', color: c.errorText, fontWeight: 400 }}>{error}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleEmailSignup} className="space-y-5 mb-6">
            {/* Email */}
            <div>
              <label htmlFor="email" style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: c.label, marginBottom: '8px' }}>Email</label>
              <Input id="email" type="email" placeholder="seu@email.com" value={email}
                onChange={(e) => { setEmail(e.target.value); if (error) setError(''); }}
                style={{ width: '100%', height: '48px', paddingLeft: '14px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '6px', fontSize: '16px', color: c.inputText, caretColor: '#2563EB' }}
                className="placeholder:text-[#BFC8D6] transition-colors focus:outline-none focus:border-[#2563EB] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.1)]" required />
            </div>

            {/* Company name */}
            <div>
              <label htmlFor="name" style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: c.label, marginBottom: '8px' }}>Nome da empresa</label>
              <Input id="name" type="text" placeholder="Nome da sua empresa" value={name} onChange={(e) => setName(e.target.value)}
                style={{ width: '100%', height: '48px', paddingLeft: '14px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '6px', fontSize: '16px', color: c.inputText, caretColor: '#2563EB' }}
                className="placeholder:text-[#BFC8D6] transition-colors focus:outline-none focus:border-[#2563EB] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.1)]" required />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: c.label, marginBottom: '8px' }}>Palavra-passe</label>
              <div className="relative">
                <Input id="password" type={showPassword ? 'text' : 'password'} placeholder="Mínimo 6 caracteres" value={password}
                  onChange={(e) => { setPassword(e.target.value); if (error) setError(''); }}
                  style={{ width: '100%', height: '48px', paddingLeft: '14px', paddingRight: '48px', background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '6px', fontSize: '16px', color: c.inputText, caretColor: '#2563EB' }}
                  className="placeholder:text-[#BFC8D6] transition-colors focus:outline-none focus:border-[#2563EB] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.1)]" required />
                <button aria-label={showPassword ? 'Esconder' : 'Mostrar'} type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: c.subtle }}>
                  {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                </button>
              </div>
            </div>

            {/* Terms */}
            <div className="flex items-start gap-3">
              <input type="checkbox" id="terms" checked={agreeTerms} onChange={(e) => setAgreeTerms(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded cursor-pointer accent-[#2563EB]" />
              <label htmlFor="terms" className="cursor-pointer" style={{ fontSize: '13px', color: c.body, fontWeight: 400 }}>
                Concordo com os{' '}
                <a href="/termos" target="_blank" rel="noopener" style={{ color: c.link }} className="underline transition-colors hover:text-[#2563EB]">Termos de uso</a>
                {' '}e a{' '}
                <a href="/privacidade" target="_blank" rel="noopener" style={{ color: c.link }} className="underline transition-colors hover:text-[#2563EB]">Política de privacidade</a>
              </label>
            </div>

            {/* Submit */}
            <AppButton type="submit" disabled={!agreeTerms} loading={loading}
              style={{
                width: '100%', height: '50px', fontSize: '16px', fontWeight: 500,
                borderRadius: '6px', border: 'none', marginTop: '8px',
                background: loading || !agreeTerms ? c.border : '#2563EB',
                color: loading || !agreeTerms ? c.body : c.inputBg,
                boxShadow: loading || !agreeTerms ? 'none' : '0 0 0 1px #2563EB',
                transition: 'background-color 200ms ease',
              }}
              className="transition-colors hover:brightness-110 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-60">
              {loading ? 'A criar conta...' : 'Criar conta'}
            </AppButton>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 border-t" style={{ borderColor: c.border }} />
            <span style={{ fontSize: '13px', color: c.subtle, fontWeight: 400 }}>ou registre-se com</span>
            <div className="flex-1 border-t" style={{ borderColor: c.border }} />
          </div>

          {/* Google */}
          <AppButton type="button" onClick={handleGoogleSignup} disabled={loading}
            style={{ width: '100%', height: '48px', fontSize: '15px', fontWeight: 400, borderRadius: '6px', background: c.inputBg, border: `1px solid ${c.border}`, color: c.label, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
            className="flex items-center justify-center gap-3 transition-colors hover:border-[#93C5FD] hover:shadow-sm disabled:opacity-50">
            <GoogleIcon /><span>Registrar com Google</span>
          </AppButton>

          {/* Rating — dentro do card */}
          {ratings && ratings.total > 0 && (
            <div className="flex items-center justify-center gap-2 mt-5 pt-4 border-t" style={{ borderColor: c.divider }}>
              <div className="flex gap-0.5">
                {[1,2,3,4,5].map(n => (
                  <Star key={n} className="w-3.5 h-3.5"
                    fill={n <= Math.round(ratings.average) ? '#FBBF24' : 'none'}
                    stroke={n <= Math.round(ratings.average) ? '#FBBF24' : c.border} strokeWidth={1.5} />
                ))}
              </div>
              <span style={{ fontSize: '13px', color: c.subtle, fontWeight: 400 }}>
                {ratings.average.toFixed(1)} de 5 · <span style={{ color: c.faint }}>{ratings.total} avaliações</span>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


