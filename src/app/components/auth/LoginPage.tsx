import { useState, useEffect, useRef } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Mail, Lock, AlertCircle, LogIn, Eye, EyeOff, Zap, X, Loader2 } from 'lucide-react';
import { authApi } from '../../utils/api';

// Google icon SVG
const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

interface LoginPageProps {
  onSuccess: () => void;
  onSwitchToSignup: () => void;
  onSetup?: () => void;
  onForgotPassword?: () => void;
  onBackToHome?: () => void;
}

// ✅ TIPOS DE ERRO
type ErrorType = 'invalid_credentials' | 'not_found' | 'rate_limit' | 'network' | 'validation' | 'general';

interface ErrorState {
  message: string;
  type: ErrorType;
}

const SLIDES = [
  {
    image: 'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=1200&q=80',
    title: 'Gerencie seus Leads,\nCresça seu Negócio',
    subtitle: 'A solução CRM completa para empresas modernas',
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

export default function LoginPage({ onSuccess, onSwitchToSignup, onSetup, onForgotPassword, onBackToHome }: LoginPageProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<ErrorState | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [keyPresses, setKeyPresses] = useState<number[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const [verificationFeedback, setVerificationFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [resendStatus, setResendStatus] = useState<'idle' | 'loading'>('idle');
  const [resendFeedback, setResendFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [pendingCredentials, setPendingCredentials] = useState<{ email: string; password: string } | null>(null);

  // Rate limiting
  const MAX_ATTEMPTS = 5;
  const LOCKOUT_SECONDS = 30;
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockUntil, setLockUntil] = useState<number | null>(null);
  const [lockCountdown, setLockCountdown] = useState(0);

  // 2FA
  const [show2FAModal, setShow2FAModal] = useState(false);
  const [twoFACode, setTwoFACode] = useState('');
  const [twoFATempToken, setTwoFATempToken] = useState('');
  const [twoFAStatus, setTwoFAStatus] = useState<'idle' | 'loading'>('idle');
  const [twoFAError, setTwoFAError] = useState<string | null>(null);
  
  // ✅ REF para foco em erros (acessibilidade)
  const errorRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const verificationInputRef = useRef<HTMLInputElement>(null);
  const twoFAInputRef = useRef<HTMLInputElement>(null);

  // Add keyboard listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key && e.key.toLowerCase() === 'd') {
        const now = Date.now();
        setKeyPresses(prev => {
          const newPresses = [...prev, now].filter(t => now - t < 1000);
          
          if (newPresses.length >= 3) {
            setDebugMode(true);
            console.log('🔧 Debug mode activated!');
            return [];
          }
          
          return newPresses;
        });
      }
    };
    
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Slideshow auto-advance
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % SLIDES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // ✅ Focar no erro quando aparecer (acessibilidade)
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.focus();
    }
  }, [error]);

  useEffect(() => {
    if (verificationModalOpen) {
      const timeout = setTimeout(() => {
        verificationInputRef.current?.focus();
      }, 120);
      return () => clearTimeout(timeout);
    }
  }, [verificationModalOpen]);

  // Lockout countdown
  useEffect(() => {
    if (!lockUntil) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));
      setLockCountdown(remaining);
      if (remaining === 0) {
        setLockUntil(null);
        setFailedAttempts(0);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lockUntil]);

  // Focus 2FA input when modal opens
  useEffect(() => {
    if (show2FAModal) {
      const timeout = setTimeout(() => twoFAInputRef.current?.focus(), 120);
      return () => clearTimeout(timeout);
    }
  }, [show2FAModal]);

  // ✅ VALIDAÇÃO DE EMAIL
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // ✅ LIMPAR ERROS quando usuário digitar
  const handleEmailChange = (value: string) => {
    setEmail(value);
    if (error) setError(null);
    if (fieldErrors.email) setFieldErrors(prev => ({ ...prev, email: undefined }));
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    if (error) setError(null);
    if (fieldErrors.password) setFieldErrors(prev => ({ ...prev, password: undefined }));
  };

  // ✅ VALIDAÇÃO DOS CAMPOS
  const validateForm = (): boolean => {
    const errors: { email?: string; password?: string } = {};
    
    if (!email.trim()) {
      errors.email = 'Por favor, insira seu email';
    } else if (!validateEmail(email)) {
      errors.email = 'Por favor, insira um email válido';
    }
    
    if (!password.trim()) {
      errors.password = 'A senha é obrigatória';
    } else if (password.length < 6) {
      errors.password = 'A senha deve ter no mínimo 6 caracteres';
    }
    
    setFieldErrors(errors);
    
    // Focar no primeiro campo com erro
    if (errors.email) {
      emailRef.current?.focus();
    } else if (errors.password) {
      passwordRef.current?.focus();
    }
    
    return Object.keys(errors).length === 0;
  };

  // Debug: Setup test account
  const handleDebugSetup = async () => {
    setError(null);
    setLoading(true);
    
    try {
      console.log('🧪 Creating test account via backend...');
      const response = await authApi.setupDemo();
      
      if (response.success) {
        console.log('✅ Test account created successfully');
        // Auto-fill credentials
        setEmail('demo@leadflow.com');
        setPassword('demo123456');
        
        // If the response indicates we need to wait, show message
        if (response.needsWait) {
          setError({ message: '✅ Conta de teste criada! Aguarde 10 segundos e clique em "Entrar".\n\nEmail: demo@leadflow.com\nSenha: demo123456', type: 'general' });
          setLoading(false);
          return;
        }
        
        // Try to login after delay
        console.log('Waiting 3 seconds before attempting login...');
        setTimeout(async () => {
          try {
            console.log('Attempting auto-login...');
            await authApi.signin('demo@leadflow.com', 'demo123456');
            onSuccess();
          } catch (loginErr: any) {
            console.error('Auto-login failed:', loginErr);
            setError({ message: '✅ Conta criada! Clique em "Entrar" para acessar.\n\nEmail: demo@leadflow.com\nSenha: demo123456', type: 'general' });
            setLoading(false);
          }
        }, 3000);
      }
    } catch (err: any) {
      console.error('Debug setup error:', err);
      setError({ message: 'Erro ao criar conta de teste: ' + err.message, type: 'general' });
      setLoading(false);
    }
  };

  // Setup Admin Account
  const handleAdminSetup = async () => {
    setError(null);
    setLoading(true);
    
    try {
      console.log('🔐 Creating admin account via backend...');
      const response = await authApi.setupAdmin();

      if (!response?.success) {
        throw new Error(response?.error || 'Admin setup failed');
      }

      console.log('✅ Backend says admin account ready');

      // Auto-fill credentials
      setEmail('admin@leadflow.com');
      setPassword('admin123456');

      // Show success message
      setError({ message: '✅ Conta admin criada/atualizada!\n\n📧 Email: admin@leadflow.com\n🔑 Senha: admin123456\n\n⏳ Fazendo login em 6 segundos...', type: 'general' });

      // Wait 6 seconds then try login
      console.log('Waiting 6 seconds before login attempt...');
      setTimeout(async () => {
        try {
          console.log('>>> Attempting admin login...');
          const loginResponse = await authApi.signin('admin@leadflow.com', 'admin123456');
          console.log('>>> Login response:', loginResponse);

          if (loginResponse.success) {
            console.log('✅✅✅ Auto-login successful!');
            onSuccess();
          } else {
            throw new Error('Login returned false');
          }
        } catch (loginErr: any) {
          console.error('❌ Auto-login failed:', loginErr);
          setError({ message: '✅ Conta admin criada!\n\n📧 Email: admin@leadflow.com\n🔑 Senha: admin123456\n\n👆 Os campos estão preenchidos - clique em "Sign in"', type: 'general' });
          setLoading(false);
        }
      }, 6000);
    } catch (err: any) {
      console.error('❌ Admin setup error:', err);
      setError({ message: '❌ Erro:\n' + (err.message || 'Não foi possível criar a conta admin.'), type: 'general' });
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Rate limit check
    if (lockUntil && Date.now() < lockUntil) {
      setError({ message: `Muitas tentativas incorretas. Aguarde ${lockCountdown}s para tentar novamente.`, type: 'rate_limit' });
      setLoading(false);
      return;
    }

    if (!validateForm()) {
      setLoading(false);
      return;
    }

    const trimmedEmail = email.trim();

    try {
      const response = await authApi.signin(trimmedEmail, password);

      // 2FA required
      if ('requires_2fa' in response && response.requires_2fa) {
        setTwoFATempToken(response.temp_token);
        setTwoFACode('');
        setTwoFAError(null);
        setTwoFAStatus('idle');
        setShow2FAModal(true);
        setLoading(false);
        return;
      }

      if (response.success) {
        setFailedAttempts(0);
        setLockUntil(null);
        setVerificationModalOpen(false);
        setPendingCredentials(null);
        setVerificationFeedback(null);
        onSuccess();
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Erro ao fazer login';
      const errorCode = (err as any)?.code ? String((err as any).code) : '';
      
      console.error('Login error details:', err);
      
      const normalizedMessage = errorMessage.toLowerCase();
      if (errorCode === 'EMAIL_NOT_CONFIRMED' ||
          normalizedMessage.includes('email não confirmado') ||
          normalizedMessage.includes('email not confirmed')) {
        setPendingCredentials({ email: trimmedEmail, password });
        setVerificationEmail(trimmedEmail);
        setVerificationCode('');
        setVerificationStatus('idle');
        setVerificationFeedback({ type: 'error', text: 'Confirme seu email com o código recebido para continuar.' });
        setResendFeedback(null);
        setResendStatus('idle');
        setVerificationModalOpen(true);
        setError(null);
        return;
      }

      // Check if it's invalid credentials and suggest creating account
      if (errorMessage.includes('Invalid login credentials') ||
          errorMessage.includes('Invalid credentials') ||
          errorMessage.includes('Email ou senha incorretos') ||
          normalizedMessage.includes('wrong password') ||
          normalizedMessage.includes('senha incorreta')) {
        const newAttempts = failedAttempts + 1;
        setFailedAttempts(newAttempts);
        if (newAttempts >= MAX_ATTEMPTS) {
          const until = Date.now() + LOCKOUT_SECONDS * 1000;
          setLockUntil(until);
          setLockCountdown(LOCKOUT_SECONDS);
          setError({ message: `Muitas tentativas incorretas. Aguarde ${LOCKOUT_SECONDS} segundos para tentar novamente.`, type: 'rate_limit' });
        } else {
          setError({
            message: `Email ou senha incorretos. ${MAX_ATTEMPTS - newAttempts} tentativa${MAX_ATTEMPTS - newAttempts === 1 ? '' : 's'} restante${MAX_ATTEMPTS - newAttempts === 1 ? '' : 's'}.`,
            type: 'invalid_credentials',
          });
        }
      } else if (errorMessage.includes('não encontrado') || errorMessage.includes('not found')) {
        setError({ message: 'Email não encontrado. Por favor, crie uma conta clicando em "Criar conta".', type: 'not_found' });
      } else if (errorMessage.includes('Backend indisponível') || errorMessage.includes('servidor')) {
        setError({ message: errorMessage, type: 'network' });
      } else {
        setError({ message: errorMessage, type: 'general' });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    console.log('[Forgot Password] 📧 Starting password reset flow...');
    console.log('[Forgot Password] Email:', resetEmail);
    
    if (!resetEmail.trim()) {
      console.log('[Forgot Password] ❌ Empty email');
      setError({ message: 'Por favor, insira seu email.', type: 'validation' });
      return;
    }
    
    setError(null);
    setLoading(true);

    try {
      // Use the exact current URL without hash for better reliability
      const baseUrl = window.location.origin + window.location.pathname;
      const redirectUrl = `${baseUrl}#type=recovery`;
      
      console.log('[Forgot Password] 📍 Base URL:', baseUrl);
      console.log('[Forgot Password] 📍 Redirect URL:', redirectUrl);
      console.log('[Forgot Password] 📤 Sending reset email via API...');
      
      await authApi.requestPasswordReset(resetEmail, redirectUrl);
      
      console.log('[Forgot Password] ✅ Email sent successfully!');
      
      // ✅ SET FLAG to help detect password reset flow when user returns from email
      sessionStorage.setItem('password_reset_requested', 'true');
      console.log('[Forgot Password] ✅ Set password_reset_requested flag in sessionStorage');
      
      setResetSuccess(true);
      console.log('[Forgot Password] ✅ Showing success message...');
      
      setTimeout(() => {
        console.log('[Forgot Password] ✅ Closing modal...');
        setShowForgotPassword(false);
        setResetSuccess(false);
        setResetEmail('');
      }, 3000);
    } catch (err: any) {
      console.error('[Forgot Password] ❌ Error:', err);
      setError({ message: err.message || 'Erro ao enviar email de recuperação', type: 'general' });
    } finally {
      setLoading(false);
    }
  };

  const handleVerificationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (verificationStatus === 'loading') {
      return;
    }

    const trimmedCode = verificationCode.trim();

    if (!trimmedCode) {
      setVerificationFeedback({ type: 'error', text: 'Digite o código recebido no email.' });
      return;
    }

    try {
      setVerificationStatus('loading');
      setVerificationFeedback(null);

      await authApi.verifyEmail(verificationEmail, trimmedCode);

      setVerificationStatus('success');
      setVerificationFeedback({ type: 'success', text: 'Email confirmado com sucesso! Autenticando...' });

      if (pendingCredentials) {
        try {
          const response = await authApi.signin(pendingCredentials.email, pendingCredentials.password);
          if (response.success) {
            setVerificationModalOpen(false);
            setPendingCredentials(null);
            setVerificationCode('');
            setResendFeedback(null);
            setResendStatus('idle');
            setVerificationFeedback(null);
            onSuccess();
            return;
          }
        } catch (loginErr: any) {
          console.error('Login after verification failed:', loginErr);
          const message = loginErr?.message || 'Erro ao fazer login após confirmar o email. Faça login novamente.';
          setError({ message, type: 'general' });
        }
      }

      setVerificationStatus('idle');
      setVerificationModalOpen(false);
      setPendingCredentials(null);
      setResendStatus('idle');
    } catch (verifyErr: any) {
      console.error('Email verification failed:', verifyErr);
      setVerificationStatus('idle');
      setVerificationFeedback({ type: 'error', text: verifyErr?.message || 'Código inválido ou expirado.' });
    }
  };

  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = twoFACode.trim();
    if (trimmed.length < 6) { setTwoFAError('Digite os 6 dígitos do seu autenticador.'); return; }
    setTwoFAStatus('loading');
    setTwoFAError(null);
    try {
      const response = await authApi.verify2FALogin(twoFATempToken, trimmed);
      if (response.success) {
        setShow2FAModal(false);
        setFailedAttempts(0);
        setLockUntil(null);
        onSuccess();
      }
    } catch (err: any) {
      setTwoFAError(err.message || 'Código inválido. Tente novamente.');
      setTwoFAStatus('idle');
    }
  };

  const handleVerificationResend = async () => {
    if (!verificationEmail || resendStatus === 'loading') {
      return;
    }

    try {
      setResendStatus('loading');
      setResendFeedback(null);
      await authApi.resendConfirmation(verificationEmail);
      setResendStatus('idle');
      setResendFeedback({ type: 'success', text: 'Email reenviado. Verifique sua caixa de entrada ou spam.' });
    } catch (resendErr: any) {
      console.error('Resend confirmation failed:', resendErr);
      setResendStatus('idle');
      setResendFeedback({ type: 'error', text: resendErr?.message || 'Não foi possível reenviar o email.' });
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);

    try {
      await authApi.signInWithGoogle();
      // OAuth will redirect, so no need to call onSuccess here
    } catch (err: any) {
      console.error('Google sign-in error:', err);
      setError({
        message: err.message || 'Erro ao conectar com Google. Verifique se o Supabase está configurado corretamente.',
        type: 'general',
      });
      setLoading(false);
    }
  };

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

          {/* Mobile Logo — outside the card, centered above it */}
          <div className="lg:hidden flex justify-center mb-6">
            <div className="w-16 h-16 bg-[#00C48C] rounded-2xl flex items-center justify-center shadow-lg shadow-[#00C48C]/30">
              <Zap className="w-9 h-9 text-white" />
            </div>
          </div>

          {/* Mobile card wrapper */}
          <div className="bg-[#0d0d0d] border border-zinc-800 rounded-3xl p-6 sm:p-8 lg:p-0 lg:bg-transparent lg:border-0 lg:rounded-none">
          {/* Title */}
          <div className="mb-8">
            <h1 className="text-white text-3xl sm:text-4xl font-semibold mb-2 tracking-tight">Entrar na conta</h1>
            <p className="text-zinc-500 text-sm">Bem-vindo de volta</p>
          </div>

          {/* ✅ ALERTA DE ERRO MELHORADO */}
          {error && (
            <div 
              ref={errorRef}
              role="alert"
              aria-live="assertive"
              tabIndex={-1}
              className={`mb-6 p-4 rounded-xl border flex items-start gap-3 transition-all animate-in fade-in slide-in-from-top-2 duration-300 ${
                error.type === 'invalid_credentials' || error.type === 'not_found' || error.type === 'network'
                  ? 'bg-red-500/10 border-red-500/30'
                  : error.type === 'rate_limit'
                  ? 'bg-yellow-500/10 border-yellow-500/30'
                  : 'bg-red-500/10 border-red-500/30'
              }`}
            >
              <AlertCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                error.type === 'rate_limit' ? 'text-yellow-400' : 'text-red-400'
              }`} />
              <div className="flex-1">
                <p className={`text-sm whitespace-pre-line ${
                  error.type === 'rate_limit' ? 'text-yellow-300' : 'text-red-300'
                }`}>
                  {error.message}
                </p>
              </div>
            </div>
          )}

          {/* Email Login Form */}
          <form onSubmit={handleEmailLogin} className="space-y-5 mb-6">
            <div>
              <Label htmlFor="email" className="text-sm font-medium text-zinc-200 mb-2 block">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-zinc-500 pointer-events-none" />
                <Input
                  ref={emailRef}
                  id="email"
                  type="email"
                  placeholder="Digite seu email"
                  value={email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  style={{ color: '#fff', caretColor: '#00C48C' }}
                  className={`w-full pl-12 pr-4 h-14 text-base bg-zinc-900 placeholder:text-zinc-600 rounded-xl border transition-all focus:outline-none focus:ring-2 focus:ring-[#00C48C]/20 ${
                    fieldErrors.email
                      ? 'border-red-500/60 focus:border-red-500 focus:ring-red-500/20'
                      : 'border-zinc-700 focus:border-[#00C48C]'
                  }`}
                  required
                  aria-invalid={!!fieldErrors.email}
                  aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                />
                {fieldErrors.email && (
                  <p id="email-error" className="text-sm text-red-400 mt-1.5 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {fieldErrors.email}
                  </p>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="password" className="text-sm font-medium text-zinc-200">
                  Senha
                </Label>
                <button
                  type="button"
                  onClick={() => onForgotPassword ? onForgotPassword() : setShowForgotPassword(true)}
                  className="text-sm text-[#00C48C] hover:text-[#00a576] transition-colors"
                >
                  Esqueceu a senha?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-zinc-500 pointer-events-none" />
                <Input
                  ref={passwordRef}
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Digite sua senha"
                  value={password}
                  onChange={(e) => handlePasswordChange(e.target.value)}
                  style={{ color: '#fff', caretColor: '#00C48C' }}
                  className={`w-full pl-12 pr-14 h-14 text-base bg-zinc-900 placeholder:text-zinc-600 rounded-xl border transition-all focus:outline-none focus:ring-2 focus:ring-[#00C48C]/20 ${
                    fieldErrors.password
                      ? 'border-red-500/60 focus:border-red-500 focus:ring-red-500/20'
                      : 'border-zinc-700 focus:border-[#00C48C]'
                  }`}
                  required
                  aria-invalid={!!fieldErrors.password}
                  aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {fieldErrors.password && (
                <p id="password-error" className="text-sm text-red-400 mt-1.5 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {fieldErrors.password}
                </p>
              )}
            </div>

            <Button
              type="submit"
              disabled={loading || (lockUntil !== null && Date.now() < lockUntil)}
              style={{
                background: loading ? '#00a576' : 'linear-gradient(135deg, #00C48C 0%, #00a576 100%)',
                boxShadow: loading ? 'none' : '0 4px 24px rgba(0,196,140,0.28)',
              }}
              className="w-full h-14 text-base text-white font-semibold rounded-xl transition-all hover:brightness-110 hover:shadow-[0_6px_28px_rgba(0,196,140,0.38)] active:scale-[0.985] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading
                ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Entrando...</span>
                : lockUntil && Date.now() < lockUntil
                  ? `Aguarde ${lockCountdown}s`
                  : <span className="flex items-center gap-2">Entrar <span className="opacity-70 text-lg leading-none">→</span></span>
              }
            </Button>
          </form>

          {/* Link criar conta */}
          <p className="text-center text-zinc-500 text-sm mt-4 mb-2">
            Não tem uma conta?{' '}
            <button
              onClick={onSwitchToSignup}
              className="text-[#00C48C] hover:text-[#00a576] font-medium"
            >
              Criar conta
            </button>
          </p>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-800"></div>
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-[#0a0a0a] text-zinc-600 uppercase tracking-wider font-medium">ou continue com</span>
            </div>
          </div>

          {/* Google Sign In Button */}
          <Button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full h-14 mb-6 text-base bg-white hover:bg-zinc-100 text-zinc-900 font-semibold rounded-xl flex items-center justify-center gap-3 transition-all hover:shadow-lg active:scale-[0.985] shadow-sm disabled:opacity-50"
          >
            <GoogleIcon />
            <span>Entrar com Google</span>
          </Button>

          {/* Footer Debug Buttons */}
          {debugMode && (
            <div className="mt-8 flex flex-col gap-2">
              <button
                onClick={handleDebugSetup}
                className="text-xs text-foreground/80 hover:text-muted-foreground transition-colors"
              >
                Debug Setup
              </button>
              <button
                onClick={handleAdminSetup}
                className="text-xs text-foreground/80 hover:text-muted-foreground transition-colors"
              >
                Admin Setup
              </button>
            </div>
          )}
          </div>{/* end mobile card */}
        </div>
      </div>

      {verificationModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
          <div className="w-full max-w-md bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl shadow-2xl p-8 space-y-6">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 mx-auto rounded-full bg-[#00C48C]/10 flex items-center justify-center">
                <Mail className="w-6 h-6 text-[#00C48C]" />
              </div>
              <h3 className="text-white text-2xl font-semibold">Confirmar email</h3>
              <p className="text-sm text-zinc-400">
                Digite o código enviado para <span className="text-white font-medium">{verificationEmail}</span> para concluir o acesso.
              </p>
            </div>

            <form onSubmit={handleVerificationSubmit} className="space-y-4">
              <div>
                <Label htmlFor="verification-code" className="text-sm text-zinc-400 mb-2 block">
                  Código de verificação
                </Label>
                <Input
                  ref={verificationInputRef}
                  id="verification-code"
                  inputMode="numeric"
                  placeholder="000000"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/[^0-9]/g, ''))}
                  maxLength={6}
                  style={{ color: '#fff', caretColor: '#00C48C' }}
                  className="w-full px-4 py-3 bg-[#0a0a0a] border-[#2a2a2a] placeholder:text-zinc-600 rounded-xl focus:ring-2 focus:ring-[#00C48C] focus:border-[#00C48C] tracking-widest text-center"
                />
              </div>

              {verificationFeedback && (
                <p className={`text-sm ${verificationFeedback.type === 'error' ? 'text-red-300' : 'text-green-300'}`}>
                  {verificationFeedback.text}
                </p>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  type="submit"
                  disabled={verificationStatus === 'loading'}
                  className="flex-1 py-3 bg-[#00C48C] hover:bg-[#00a576] text-white rounded-xl"
                >
                  {verificationStatus === 'loading' ? 'Confirmando...' : 'Confirmar código'}
                </Button>
                <Button
                  type="button"
                  onClick={handleVerificationResend}
                  disabled={resendStatus === 'loading'}
                  variant="outline"
                  className="flex-1 py-3 bg-transparent border-[#2a2a2a] text-foreground/80 hover:bg-[#1a1a1a] rounded-xl"
                >
                  {resendStatus === 'loading' ? 'Reenviando...' : 'Reenviar email'}
                </Button>
              </div>

              {resendFeedback && (
                <p className={`text-xs ${resendFeedback.type === 'error' ? 'text-red-300' : 'text-green-300'}`}>
                  {resendFeedback.text}
                </p>
              )}
            </form>

            <button
              type="button"
              onClick={() => {
                setVerificationModalOpen(false);
                setVerificationCode('');
                setVerificationFeedback(null);
                setResendFeedback(null);
                setResendStatus('idle');
                setVerificationStatus('idle');
              }}
              className="text-sm text-zinc-500 hover:text-white"
            >
              Cancelar e voltar
            </button>
          </div>
        </div>
      )}

      {/* 2FA Modal */}
      {show2FAModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="w-full max-w-sm bg-[#0d0d0d] border border-zinc-800 rounded-2xl shadow-2xl p-8 space-y-6">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 mx-auto rounded-full bg-[#00C48C]/10 border border-[#00C48C]/20 flex items-center justify-center">
                <Lock className="w-5 h-5 text-[#00C48C]" />
              </div>
              <h3 className="text-white text-xl font-semibold">Verificação em dois fatores</h3>
              <p className="text-zinc-400 text-sm">Abra o seu app autenticador e insira o código de 6 dígitos.</p>
            </div>
            <form onSubmit={handle2FASubmit} className="space-y-4">
              <Input
                ref={twoFAInputRef}
                inputMode="numeric"
                placeholder="000000"
                value={twoFACode}
                onChange={(e) => { setTwoFACode(e.target.value.replace(/\D/g, '').slice(0, 6)); setTwoFAError(null); }}
                maxLength={6}
                style={{ color: '#fff', caretColor: '#00C48C' }}
                className="w-full px-4 h-14 text-center text-2xl tracking-[0.5em] bg-zinc-900 border border-zinc-700 placeholder:text-zinc-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#00C48C]/20 focus:border-[#00C48C] transition-all"
              />
              {twoFAError && (
                <p className="text-sm text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />{twoFAError}
                </p>
              )}
              <Button
                type="submit"
                disabled={twoFAStatus === 'loading' || twoFACode.length < 6}
                style={{ background: 'linear-gradient(135deg, #00C48C 0%, #00a576 100%)', boxShadow: '0 4px 24px rgba(0,196,140,0.25)' }}
                className="w-full h-12 text-white font-semibold rounded-xl transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {twoFAStatus === 'loading'
                  ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Verificando...</span>
                  : 'Verificar'
                }
              </Button>
            </form>
            <button
              type="button"
              onClick={() => { setShow2FAModal(false); setTwoFACode(''); setTwoFAError(null); }}
              className="w-full text-sm text-zinc-500 hover:text-white transition-colors"
            >
              Cancelar e voltar
            </button>
          </div>
        </div>
      )}

      {/* Forgot Password Modal */}
      {showForgotPassword && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a1a1a] rounded-2xl shadow-lg p-10 max-w-md w-full space-y-6 border border-[#2a2a2a]">
            <div className="text-center space-y-2">
              <h3 className="text-white text-2xl font-semibold">Recuperar Senha</h3>
              <p className="text-zinc-400 text-sm">
                Digite seu email para receber o código de recuperação
              </p>
            </div>

            {resetSuccess && (
              <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
                <p className="text-sm text-green-400">
                  ✅ Email enviado com sucesso! Verifique sua caixa de entrada.
                </p>
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-300">{error.message}</p>
              </div>
            )}

            <form onSubmit={(e) => { e.preventDefault(); handleForgotPassword(); }} className="space-y-4">
              <div>
                <Label htmlFor="reset-email" className="text-sm text-zinc-400 mb-2 block">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder="Digite seu email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    style={{ color: '#fff', caretColor: '#00C48C' }}
                    className="w-full pl-12 pr-4 py-3 bg-[#0a0a0a] border-[#2a2a2a] placeholder:text-zinc-600 rounded-xl focus:ring-2 focus:ring-[#00C48C]"
                    required
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  onClick={() => {
                    setShowForgotPassword(false);
                    setResetEmail('');
                    setError(null);
                  }}
                  variant="outline"
                  className="flex-1 py-3 bg-transparent border-[#2a2a2a] text-foreground/80 hover:bg-[#0a0a0a] rounded-xl"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-3 bg-[#00C48C] hover:bg-[#00a576] text-white font-medium rounded-xl"
                >
                  {loading ? 'Enviando...' : 'Enviar Código'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

