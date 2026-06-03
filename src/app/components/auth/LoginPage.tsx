import { useState, useEffect, useRef } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Mail, Lock, AlertCircle, Eye, EyeOff, Zap, Loader2, Star } from 'lucide-react';
import { authApi } from '../../utils/api';

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


export default function LoginPage({ onSuccess, onSwitchToSignup, onSetup, onForgotPassword, onBackToHome }: LoginPageProps) {
  const [ratings, setRatings] = useState<RatingSummary | null>(null);
  const [currentReview, setCurrentReview] = useState(0);
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

  // Fetch real ratings summary
  useEffect(() => {
    fetch(`${API_URL}/api/feedback/summary`)
      .then(r => r.json())
      .then(data => { if (data.success) setRatings(data); })
      .catch(() => {});
  }, []);

  // Auto-rotate reviews
  useEffect(() => {
    if (!ratings?.reviews?.length) return;
    const t = setInterval(() => {
      setCurrentReview(prev => (prev + 1) % ratings.reviews.length);
    }, 4000);
    return () => clearInterval(t);
  }, [ratings?.reviews?.length]);

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

  const FONT = 'sohne-var, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';

  return (
    <div className="min-h-screen relative flex items-center justify-center py-16 px-4 overflow-hidden"
      style={{ background: 'transparent', fontFamily: FONT }}>

      {/* ── CARD + LOGO (coluna centrada) ─────────────────────────── */}
      <div className="relative z-10 w-full max-w-[520px] flex flex-col">

        {/* Logo — acima do card, alinhado à esquerda */}
        <div className="flex items-center gap-2.5 mb-8">
          <div className="w-9 h-9 rounded-[10px] flex items-center justify-center"
            style={{ background: '#675DFF', boxShadow: '0 2px 12px rgba(103,93,255,0.45)' }}>
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="text-[19px] font-semibold text-white tracking-tight">LeadsFlow</span>
        </div>

        <div className="rounded-[12px] p-10"
          style={{
            background: 'rgba(255,255,255,0.97)',
            border: '1px solid rgba(255,255,255,0.3)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.08), 0 8px 32px rgba(0,0,0,0.06)',
            backdropFilter: 'blur(20px)',
          }}>

          {/* Title */}
          <h1 className="text-[28px] font-semibold leading-[36px] mb-2" style={{ color: '#1A2C44' }}>
            Entrar na conta
          </h1>
          <p className="text-[15px] mb-7" style={{ color: '#6B7280', fontWeight: 300 }}>
            Bem-vindo de volta
          </p>

          {/* Error */}
          {error && (
            <div ref={errorRef} role="alert" aria-live="assertive" tabIndex={-1}
              className="mb-5 p-4 rounded-[8px] flex items-start gap-3 animate-in fade-in duration-200"
              style={{
                background: error.type === 'rate_limit' ? '#FFF8E6' : '#FFF0F3',
                border: `1px solid ${error.type === 'rate_limit' ? 'rgba(204,75,0,0.3)' : 'rgba(230,25,71,0.3)'}`,
              }}>
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: error.type === 'rate_limit' ? '#CC4B00' : '#E61947' }} />
              <p className="text-[13px] leading-[18px] whitespace-pre-line" style={{ color: error.type === 'rate_limit' ? '#CC4B00' : '#C0123C', fontWeight: 300 }}>
                {error.message}
              </p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleEmailLogin} className="space-y-5 mb-6">
            {/* Email */}
            <div>
              <label htmlFor="email" style={{ display: 'block', fontSize: '14px', color: '#414552', marginBottom: '8px', fontWeight: 500 }}>Email</label>
              <Input ref={emailRef} id="email" type="email" placeholder="seu@email.com" value={email}
                onChange={(e) => handleEmailChange(e.target.value)} required
                aria-invalid={!!fieldErrors.email} aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                style={{
                  width: '100%', height: '48px', paddingLeft: '14px', paddingRight: '14px',
                  background: '#FFFFFF', border: `1px solid ${fieldErrors.email ? '#E61947' : '#D4DEE9'}`,
                  borderRadius: '6px', fontSize: '16px', color: '#273951', caretColor: '#675DFF',
                  boxShadow: fieldErrors.email ? '0 0 0 4px rgba(230,25,71,0.1)' : 'none',
                }}
                className="placeholder:text-[#BFC8D6] transition-all focus:outline-none focus:border-[#635BFF] focus:shadow-[0_0_0_4px_rgba(99,91,255,0.1)]"
              />
              {fieldErrors.email && (
                <p id="email-error" className="mt-1.5 flex items-center gap-1" style={{ fontSize: '13px', color: '#E61947', fontWeight: 300 }}>
                  <AlertCircle className="w-3.5 h-3.5" />{fieldErrors.email}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="password" style={{ fontSize: '14px', color: '#414552', fontWeight: 500 }}>Senha</label>
                <button type="button"
                  onClick={() => onForgotPassword ? onForgotPassword() : setShowForgotPassword(true)}
                  style={{ fontSize: '14px', color: '#533AFD', fontWeight: 300 }}
                  className="transition-colors hover:text-[#635BFF]">
                  Esqueceu a senha?
                </button>
              </div>
              <div className="relative">
                <Input ref={passwordRef} id="password" type={showPassword ? 'text' : 'password'}
                  placeholder="Sua senha" value={password}
                  onChange={(e) => handlePasswordChange(e.target.value)} required
                  aria-invalid={!!fieldErrors.password} aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                  style={{
                    width: '100%', height: '48px', paddingLeft: '14px', paddingRight: '48px',
                    background: '#FFFFFF', border: `1px solid ${fieldErrors.password ? '#E61947' : '#D4DEE9'}`,
                    borderRadius: '6px', fontSize: '16px', color: '#273951', caretColor: '#675DFF',
                    boxShadow: fieldErrors.password ? '0 0 0 4px rgba(230,25,71,0.1)' : 'none',
                  }}
                  className="placeholder:text-[#BFC8D6] transition-all focus:outline-none focus:border-[#635BFF] focus:shadow-[0_0_0_4px_rgba(99,91,255,0.1)]"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: '#8A9BB0' }}>
                  {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                </button>
              </div>
              {fieldErrors.password && (
                <p id="password-error" className="mt-1.5 flex items-center gap-1" style={{ fontSize: '13px', color: '#E61947', fontWeight: 300 }}>
                  <AlertCircle className="w-3.5 h-3.5" />{fieldErrors.password}
                </p>
              )}
            </div>

            {/* Primary button */}
            <Button type="submit"
              disabled={loading || (lockUntil !== null && Date.now() < lockUntil)}
              style={{
                width: '100%', height: '50px', fontSize: '16px', fontWeight: 500,
                borderRadius: '6px', border: 'none', marginTop: '8px',
                background: loading || (lockUntil !== null && Date.now() < lockUntil) ? '#D4DEE9' : '#675DFF',
                color: loading || (lockUntil !== null && Date.now() < lockUntil) ? '#3C4257' : '#FFFFFF',
                boxShadow: loading || (lockUntil !== null && Date.now() < lockUntil) ? 'none' : '0 0 0 1px #675DFF',
                transition: 'background-color 200ms ease',
              }}
              className="transition-all hover:brightness-110 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-60">
              {loading
                ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Entrando...</span>
                : lockUntil && Date.now() < lockUntil
                  ? `Aguarde ${lockCountdown}s`
                  : 'Entrar'
              }
            </Button>
          </form>

          {/* Create account */}
          <p className="text-center mb-6" style={{ fontSize: '14px', color: '#3C4257', fontWeight: 300 }}>
            Não tem uma conta?{' '}
            <button onClick={onSwitchToSignup} style={{ color: '#533AFD', fontWeight: 400 }} className="transition-colors hover:text-[#635BFF]">
              Criar conta
            </button>
          </p>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 border-t" style={{ borderColor: '#D4DEE9' }} />
            <span style={{ fontSize: '13px', color: '#8A9BB0', fontWeight: 300 }}>ou continue com</span>
            <div className="flex-1 border-t" style={{ borderColor: '#D4DEE9' }} />
          </div>

          {/* Google button */}
          <Button type="button" onClick={handleGoogleSignIn} disabled={loading}
            style={{
              width: '100%', height: '48px', fontSize: '15px', fontWeight: 400,
              borderRadius: '6px', background: '#FFFFFF', border: '1px solid #D4DEE9',
              color: '#414552', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
            className="flex items-center justify-center gap-3 transition-all hover:border-[#A497FC] hover:shadow-sm disabled:opacity-50">
            <GoogleIcon /><span>Entrar com Google</span>
          </Button>

          {/* Rating — dentro do card */}
          {ratings && ratings.total > 0 && (
            <div className="flex items-center justify-center gap-2 mt-5 pt-4 border-t" style={{ borderColor: '#EEF0F3' }}>
              <div className="flex gap-0.5">
                {[1,2,3,4,5].map(n => (
                  <Star key={n} className="w-3.5 h-3.5"
                    fill={n <= Math.round(ratings.average) ? '#FBBF24' : 'none'}
                    stroke={n <= Math.round(ratings.average) ? '#FBBF24' : '#D4DEE9'} strokeWidth={1.5} />
                ))}
              </div>
              <span style={{ fontSize: '13px', color: '#8A9BB0', fontWeight: 300 }}>
                {ratings.average.toFixed(1)} de 5 · <span style={{ color: '#B0B8C4' }}>{ratings.total} avaliações</span>
              </span>
            </div>
          )}

          {debugMode && (
            <div className="flex flex-col gap-2 mt-4">
              <button onClick={handleDebugSetup} style={{ fontSize: '12px', color: '#8A9BB0' }}>Debug Setup</button>
              <button onClick={handleAdminSetup} style={{ fontSize: '12px', color: '#8A9BB0' }}>Admin Setup</button>
            </div>
          )}
        </div>
      </div>

      {/* ── VERIFICATION MODAL ─────────────────────────────────────── */}
      {verificationModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-50 px-4"
          style={{ background: 'rgba(26,44,68,0.55)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-md rounded-[12px] p-8 space-y-6"
            style={{ background: '#FFFFFF', border: '1px solid #D4DEE9', boxShadow: '0 10px 40px rgba(0,0,0,0.15), 0 30px 80px rgba(48,49,61,0.1)', fontFamily: FONT }}>
            <div className="text-center space-y-2">
              <div className="w-12 h-12 mx-auto rounded-full flex items-center justify-center"
                style={{ background: 'rgba(103,93,255,0.08)', border: '1px solid rgba(103,93,255,0.15)' }}>
                <Mail className="w-6 h-6" style={{ color: '#675DFF' }} />
              </div>
              <h3 style={{ fontSize: '24px', fontWeight: 600, color: '#1A2C44' }}>Confirmar email</h3>
              <p style={{ fontSize: '14px', color: '#3C4257', fontWeight: 300 }}>
                Código enviado para <span style={{ fontWeight: 500, color: '#1A2C44' }}>{verificationEmail}</span>
              </p>
            </div>
            <form onSubmit={handleVerificationSubmit} className="space-y-4">
              <div>
                <label style={{ display: 'block', fontSize: '14px', color: '#414552', marginBottom: '8px' }}>Código de verificação</label>
                <Input ref={verificationInputRef} id="verification-code" inputMode="numeric" placeholder="000000"
                  value={verificationCode} onChange={(e) => setVerificationCode(e.target.value.replace(/[^0-9]/g, ''))} maxLength={6}
                  style={{ width: '100%', height: '48px', background: '#FFFFFF', border: '1px solid #D4DEE9', borderRadius: '6px', fontSize: '22px', letterSpacing: '0.4em', textAlign: 'center', color: '#273951', caretColor: '#675DFF' }}
                  className="placeholder:text-[#BFC8D6] focus:outline-none focus:border-[#635BFF] focus:shadow-[0_0_0_4px_rgba(99,91,255,0.1)] transition-all"
                />
              </div>
              {verificationFeedback && (
                <p style={{ fontSize: '13px', color: verificationFeedback.type === 'error' ? '#E61947' : '#059669' }}>{verificationFeedback.text}</p>
              )}
              <div className="flex flex-col sm:flex-row gap-3">
                <Button type="submit" disabled={verificationStatus === 'loading'}
                  style={{ flex: 1, background: '#675DFF', borderRadius: '6px', height: '44px', fontSize: '14px', fontWeight: 500, border: 'none', color: '#fff', boxShadow: '0 0 0 1px #675DFF' }}
                  className="transition-all hover:brightness-110 disabled:opacity-60">
                  {verificationStatus === 'loading' ? 'Confirmando...' : 'Confirmar código'}
                </Button>
                <Button type="button" onClick={handleVerificationResend} disabled={resendStatus === 'loading'}
                  style={{ flex: 1, background: 'rgba(239,239,239,0.3)', border: '1px solid #D4DEE9', borderRadius: '6px', height: '44px', fontSize: '14px', color: '#414552', fontWeight: 300 }}
                  className="transition-all hover:border-[#A497FC] disabled:opacity-60">
                  {resendStatus === 'loading' ? 'Reenviando...' : 'Reenviar email'}
                </Button>
              </div>
              {resendFeedback && (
                <p style={{ fontSize: '13px', color: resendFeedback.type === 'error' ? '#E61947' : '#059669' }}>{resendFeedback.text}</p>
              )}
            </form>
            <button type="button" style={{ fontSize: '13px', color: '#8A9BB0', fontWeight: 300 }}
              className="transition-colors hover:text-[#533AFD]"
              onClick={() => { setVerificationModalOpen(false); setVerificationCode(''); setVerificationFeedback(null); setResendFeedback(null); setResendStatus('idle'); setVerificationStatus('idle'); }}>
              Cancelar e voltar
            </button>
          </div>
        </div>
      )}

      {/* ── 2FA MODAL ──────────────────────────────────────────────── */}
      {show2FAModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 px-4"
          style={{ background: 'rgba(26,44,68,0.55)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-sm rounded-[12px] p-8 space-y-6"
            style={{ background: '#FFFFFF', border: '1px solid #D4DEE9', boxShadow: '0 10px 40px rgba(0,0,0,0.15), 0 30px 80px rgba(48,49,61,0.1)', fontFamily: FONT }}>
            <div className="text-center space-y-2">
              <div className="w-12 h-12 mx-auto rounded-full flex items-center justify-center"
                style={{ background: 'rgba(103,93,255,0.08)', border: '1px solid rgba(103,93,255,0.15)' }}>
                <Lock className="w-5 h-5" style={{ color: '#675DFF' }} />
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: 600, color: '#1A2C44' }}>Verificação em dois fatores</h3>
              <p style={{ fontSize: '14px', color: '#3C4257', fontWeight: 300 }}>Insira o código de 6 dígitos do seu app autenticador.</p>
            </div>
            <form onSubmit={handle2FASubmit} className="space-y-4">
              <Input ref={twoFAInputRef} inputMode="numeric" placeholder="000000"
                value={twoFACode} onChange={(e) => { setTwoFACode(e.target.value.replace(/\D/g, '').slice(0, 6)); setTwoFAError(null); }} maxLength={6}
                style={{ width: '100%', height: '56px', background: '#FFFFFF', border: '1px solid #D4DEE9', borderRadius: '6px', fontSize: '24px', letterSpacing: '0.5em', textAlign: 'center', color: '#273951', caretColor: '#675DFF' }}
                className="placeholder:text-[#BFC8D6] focus:outline-none focus:border-[#635BFF] focus:shadow-[0_0_0_4px_rgba(99,91,255,0.1)] transition-all"
              />
              {twoFAError && (
                <p className="flex items-center gap-1" style={{ fontSize: '13px', color: '#E61947' }}>
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />{twoFAError}
                </p>
              )}
              <Button type="submit" disabled={twoFAStatus === 'loading' || twoFACode.length < 6}
                style={{ width: '100%', background: '#675DFF', borderRadius: '6px', height: '44px', fontWeight: 500, border: 'none', color: '#fff', boxShadow: '0 0 0 1px #675DFF' }}
                className="transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed">
                {twoFAStatus === 'loading' ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Verificando...</span> : 'Verificar'}
              </Button>
            </form>
            <button type="button" style={{ width: '100%', textAlign: 'center', fontSize: '13px', color: '#8A9BB0', fontWeight: 300 }}
              className="transition-colors hover:text-[#533AFD]"
              onClick={() => { setShow2FAModal(false); setTwoFACode(''); setTwoFAError(null); }}>
              Cancelar e voltar
            </button>
          </div>
        </div>
      )}

      {/* ── FORGOT PASSWORD MODAL ──────────────────────────────────── */}
      {showForgotPassword && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
          style={{ background: 'rgba(26,44,68,0.55)', backdropFilter: 'blur(6px)' }}>
          <div className="rounded-[12px] p-8 max-w-md w-full space-y-6"
            style={{ background: '#FFFFFF', border: '1px solid #D4DEE9', boxShadow: '0 10px 40px rgba(0,0,0,0.15), 0 30px 80px rgba(48,49,61,0.1)', fontFamily: FONT }}>
            <div className="text-center space-y-1.5">
              <h3 style={{ fontSize: '24px', fontWeight: 600, color: '#1A2C44' }}>Recuperar senha</h3>
              <p style={{ fontSize: '14px', color: '#3C4257', fontWeight: 300 }}>Digite seu email para receber o link de recuperação</p>
            </div>
            {resetSuccess && (
              <div className="p-4 rounded-[8px]" style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                <p style={{ fontSize: '14px', color: '#15803D' }}>✅ Email enviado! Verifique sua caixa de entrada.</p>
              </div>
            )}
            {error && (
              <div className="p-4 rounded-[8px] flex items-start gap-3" style={{ background: '#FFF0F3', border: '1px solid rgba(230,25,71,0.25)' }}>
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#E61947' }} />
                <p style={{ fontSize: '13px', color: '#C0123C' }}>{error.message}</p>
              </div>
            )}
            <form onSubmit={(e) => { e.preventDefault(); handleForgotPassword(); }} className="space-y-4">
              <div>
                <label style={{ display: 'block', fontSize: '14px', color: '#414552', marginBottom: '8px' }}>Email</label>
                <Input id="reset-email" type="email" placeholder="seu@email.com" value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  style={{ width: '100%', height: '44px', paddingLeft: '12px', background: '#FFFFFF', border: '1px solid #D4DEE9', borderRadius: '6px', fontSize: '16px', color: '#273951', caretColor: '#675DFF' }}
                  className="placeholder:text-[#BFC8D6] focus:outline-none focus:border-[#635BFF] focus:shadow-[0_0_0_4px_rgba(99,91,255,0.1)] transition-all" required />
              </div>
              <div className="flex gap-3">
                <Button type="button" onClick={() => { setShowForgotPassword(false); setResetEmail(''); setError(null); }}
                  style={{ flex: 1, background: 'rgba(239,239,239,0.3)', border: '1px solid #D4DEE9', borderRadius: '6px', height: '44px', fontSize: '14px', color: '#414552', fontWeight: 300 }}
                  className="transition-all hover:border-[#A497FC]">Cancelar
                </Button>
                <Button type="submit" disabled={loading}
                  style={{ flex: 1, background: '#675DFF', borderRadius: '6px', height: '44px', fontSize: '14px', fontWeight: 500, border: 'none', color: '#fff', boxShadow: '0 0 0 1px #675DFF' }}
                  className="transition-all hover:brightness-110 disabled:opacity-60">
                  {loading ? 'Enviando...' : 'Enviar link'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
