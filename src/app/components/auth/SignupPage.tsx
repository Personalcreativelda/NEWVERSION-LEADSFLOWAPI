import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { AlertCircle, CheckCircle, Eye, EyeOff, Lock, Mail, Building2, MailCheck, Zap, Loader2 } from 'lucide-react';
import { authApi } from '../../utils/api';
import { metaEvents } from '../MetaPixel';

// Google icon SVG
const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const SLIDES = [
  {
    image: 'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=1200&q=80',
    title: 'Comece a Crescer Hoje,\nTransforme seu Negócio',
    subtitle: 'Junte-se a milhares de empresas gerenciando seus leads de forma eficiente',
  },
  {
    image: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=1200&q=80',
    title: 'Automatize suas\nComunicações',
    subtitle: 'WhatsApp, e-mail e muito mais em um só lugar',
  },
  {
    image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80',
    title: 'Acompanhe Resultados\nem Tempo Real',
    subtitle: 'Métricas e relatórios que impulsionam decisões',
  },
];

interface SignupPageProps {
  onSuccess: () => void;
  onSwitchToLogin: () => void;
  onBackToHome?: () => void;
}

export default function SignupPage({ onSuccess, onSwitchToLogin }: SignupPageProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
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

  // Slideshow auto-advance
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % SLIDES.length);
    }, 5000);
    return () => clearInterval(timer);
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

        if (response.requiresEmailConfirmation) {
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

  if (status !== 'idle') {
    const isConfirmation = status === 'confirmation';
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] px-4">
        <div className="w-full max-w-md">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl shadow-lg p-10 space-y-6 text-center">
            <div className="flex justify-center">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center ${isConfirmation ? 'bg-[#00C48C]/15' : 'bg-[#00C48C]/20'}`}>
                {isConfirmation ? (
                  <MailCheck className="w-8 h-8 text-[#00C48C]" />
                ) : (
                  <CheckCircle className="w-8 h-8 text-[#00C48C]" />
                )}
              </div>
            </div>
            <div className="space-y-3">
              <h2 className="text-2xl font-semibold text-white">
                {isConfirmation ? 'Confirme seu email' : 'Conta Criada!'}
              </h2>
              {isConfirmation ? (
                <div className="space-y-3 text-sm text-muted-foreground/70">
                  <p>Verifique seu email para confirmar a conta antes de acessar o painel.</p>
                  {pendingEmail && (
                    <p className="text-foreground/80">
                      Enviamos o link para <span className="text-white font-medium">{pendingEmail}</span>.
                    </p>
                  )}
                  <p>Se não encontrar o email, verifique a pasta de spam ou promoções.</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground/70">
                  Bem-vindo ao LeadFlow CRM. Redirecionando para o painel...
                </p>
              )}
            </div>

            {isConfirmation ? (
              <div className="flex flex-col gap-3">
                <Button
                  onClick={async () => {
                    if (!pendingEmail || resendState === 'loading') return;
                    try {
                      setResendState('loading');
                      setResendMessage('');
                      await authApi.resendConfirmation(pendingEmail);
                      setResendState('sent');
                      setResendMessage('Email reenviado! Verifique sua caixa de entrada ou spam.');
                    } catch (resendErr: any) {
                      console.error('[Signup] Resend confirmation error:', resendErr);
                      setResendState('error');
                      setResendMessage(resendErr?.message || 'Não foi possível reenviar o email. Tente novamente em instantes.');
                    }
                  }}
                  disabled={!pendingEmail || resendState === 'loading'}
                  variant="outline"
                  className="w-full py-3 bg-transparent border border-[#2a2a2a] text-foreground/80 hover:bg-[#1a1a1a] rounded-xl"
                >
                  {resendState === 'loading' ? 'Reenviando...' : 'Reenviar email de confirmação'}
                </Button>
                {resendMessage && (
                  <p className={`text-xs ${resendState === 'error' ? 'text-red-300' : 'text-[#00C48C]'}`}>
                    {resendMessage}
                  </p>
                )}
                <Button
                  onClick={onSwitchToLogin}
                  className="w-full py-3 bg-[#00C48C] hover:bg-[#00a576] text-white rounded-xl"
                >
                  Ir para o login
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setStatus('idle');
                    setPendingEmail('');
                    setError('');
                    setResendState('idle');
                    setResendMessage('');
                  }}
                  className="text-sm text-zinc-500 hover:text-white"
                >
                  Voltar e tentar outro email
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <div className="w-2 h-2 bg-[#00C48C] rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-[#00C48C] rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-[#00C48C] rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-[#0a0a0a] relative">
      {/* Left Column - Premium Visual */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden" style={{ background: '#07100d' }}>
        {/* Dot grid pattern */}
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.055) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }} />

        {/* Brand glow orbs */}
        <div className="absolute" style={{
          top: '10%', left: '-5%',
          width: '560px', height: '560px',
          background: 'radial-gradient(circle, rgba(0,196,140,0.13) 0%, transparent 65%)',
        }} />
        <div className="absolute" style={{
          bottom: '5%', right: '-10%',
          width: '380px', height: '380px',
          background: 'radial-gradient(circle, rgba(0,196,140,0.07) 0%, transparent 65%)',
        }} />

        {/* Right edge separator */}
        <div className="absolute inset-y-0 right-0 w-px bg-white/5" />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between w-full p-14 h-full">

          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-[#00C48C] rounded-lg flex items-center justify-center shadow-lg shadow-[#00C48C]/40">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-white text-xl font-semibold tracking-tight">LeadsFlow</span>
          </div>

          {/* Slide content */}
          <div className="relative min-h-[280px] flex items-center">
            {SLIDES.map((slide, i) => (
              <div
                key={i}
                className="absolute inset-0 flex flex-col justify-center transition-all duration-700"
                style={{
                  opacity: i === currentSlide ? 1 : 0,
                  transform: i === currentSlide ? 'translateY(0)' : 'translateY(18px)',
                  pointerEvents: i === currentSlide ? 'auto' : 'none',
                }}
              >
                <h2 className="text-white text-[2.6rem] font-semibold leading-snug mb-4 whitespace-pre-line tracking-tight">
                  {slide.title}
                </h2>
                <p className="text-zinc-400 text-base leading-relaxed max-w-[300px]">
                  {slide.subtitle}
                </p>
              </div>
            ))}
          </div>

          {/* Bottom: stats + indicators */}
          <div className="space-y-7">
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: '10k+', label: 'Leads gerenciados' },
                { value: '98%', label: 'Taxa de entrega' },
                { value: '5★', label: 'Avaliação média' },
              ].map((stat) => (
                <div key={stat.label} className="px-4 py-3.5 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="text-white text-xl font-bold mb-0.5">{stat.value}</div>
                  <div className="text-zinc-500 text-xs">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Slide indicators */}
            <div className="flex gap-2">
              {SLIDES.map((_, j) => (
                <button
                  key={j}
                  onClick={() => setCurrentSlide(j)}
                  className={`h-[2px] rounded-full transition-all duration-500 ${
                    j === currentSlide ? 'w-10 bg-[#00C48C]' : 'w-4 bg-white/15 hover:bg-white/30'
                  }`}
                  aria-label={`Slide ${j + 1}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right Column - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-4 py-10 sm:px-6 sm:py-12 lg:px-16 bg-[#0a0a0a] overflow-y-auto">
        <div className="w-full max-w-md">

          {/* Mobile Logo */}
          <div className="lg:hidden flex justify-center mb-6">
            <div className="w-16 h-16 bg-[#00C48C] rounded-2xl flex items-center justify-center shadow-lg shadow-[#00C48C]/30">
              <Zap className="w-9 h-9 text-white" />
            </div>
          </div>

          {/* Card wrapper */}
          <div className="bg-[#0d0d0d] border border-zinc-800 rounded-3xl p-6 sm:p-8 lg:p-0 lg:bg-transparent lg:border-0 lg:rounded-none">

            {/* Title */}
            <div className="mb-8">
              <h1 className="text-white text-3xl sm:text-4xl font-semibold mb-2 tracking-tight">Criar uma conta</h1>
              <p className="text-zinc-500 text-sm">
                Já tem uma conta?{' '}
                <button
                  onClick={onSwitchToLogin}
                  className="text-[#00C48C] hover:text-[#00a576] font-medium"
                >
                  Entrar
                </button>
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-6 p-4 rounded-xl border bg-red-500/10 border-red-500/30 flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleEmailSignup} className="space-y-5 mb-6">

              {/* Email */}
              <div>
                <Label htmlFor="email" className="text-sm font-medium text-zinc-200 mb-2 block">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-zinc-500 pointer-events-none" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); if (error) setError(''); }}
                    style={{ color: '#fff', caretColor: '#00C48C' }}
                    className="w-full pl-12 pr-4 h-14 text-base bg-zinc-900 border border-zinc-700 placeholder:text-zinc-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#00C48C]/20 focus:border-[#00C48C] transition-all"
                    required
                  />
                </div>
              </div>

              {/* Company Name */}
              <div>
                <Label htmlFor="name" className="text-sm font-medium text-zinc-200 mb-2 block">
                  Nome da Empresa
                </Label>
                <div className="relative">
                  <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-zinc-500 pointer-events-none" />
                  <Input
                    id="name"
                    type="text"
                    placeholder="Nome da sua empresa"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={{ color: '#fff', caretColor: '#00C48C' }}
                    className="w-full pl-12 pr-4 h-14 text-base bg-zinc-900 border border-zinc-700 placeholder:text-zinc-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#00C48C]/20 focus:border-[#00C48C] transition-all"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <Label htmlFor="password" className="text-sm font-medium text-zinc-200 mb-2 block">
                  Senha
                </Label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-zinc-500 pointer-events-none" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Mínimo 6 caracteres"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); if (error) setError(''); }}
                    style={{ color: '#fff', caretColor: '#00C48C' }}
                    className="w-full pl-12 pr-14 h-14 text-base bg-zinc-900 border border-zinc-700 placeholder:text-zinc-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#00C48C]/20 focus:border-[#00C48C] transition-all"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Terms */}
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="terms"
                  checked={agreeTerms}
                  onChange={(e) => setAgreeTerms(e.target.checked)}
                  className="mt-1 w-4 h-4 border border-zinc-700 rounded bg-zinc-900 text-[#00C48C] focus:ring-[#00C48C] accent-[#00C48C]"
                />
            <label htmlFor="terms" className="text-sm text-zinc-500">
                  Eu concordo com os{' '}
                  <a href="#terms" className="text-[#00C48C] hover:text-[#00a576] underline">
                    Termos e Condições
                  </a>
                </label>
              </div>

              {/* Submit */}
              <Button
                type="submit"
                disabled={loading || !agreeTerms}
                style={{
                  background: (loading || !agreeTerms) ? '' : 'linear-gradient(135deg, #00C48C 0%, #00a576 100%)',
                  boxShadow: (loading || !agreeTerms) ? 'none' : '0 4px 24px rgba(0,196,140,0.28)',
                }}
                className="w-full h-14 text-base bg-[#00C48C] text-white font-semibold rounded-xl transition-all hover:brightness-110 hover:shadow-[0_6px_28px_rgba(0,196,140,0.38)] active:scale-[0.985] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Criando conta...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">Criar conta <span className="opacity-70 text-lg leading-none">→</span></span>
                )}
              </Button>
            </form>

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-zinc-800"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-3 bg-[#0a0a0a] text-zinc-600 uppercase tracking-wider font-medium">ou registre-se com</span>
              </div>
            </div>

            {/* Google */}
            <Button
              type="button"
              onClick={handleGoogleSignup}
              disabled={loading}
              className="w-full h-14 text-base bg-white hover:bg-zinc-100 text-zinc-900 font-semibold rounded-xl flex items-center justify-center gap-3 transition-all hover:shadow-lg active:scale-[0.985] shadow-sm disabled:opacity-50"
            >
              <GoogleIcon />
              <span>Registrar com Google</span>
            </Button>

          </div>{/* end card */}
        </div>
      </div>
    </div>
  );
}

