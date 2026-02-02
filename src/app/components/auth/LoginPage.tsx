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

export default function LoginPage({ onSuccess, onSwitchToSignup, onSetup, onForgotPassword, onBackToHome }: LoginPageProps) {
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
  
  // ✅ REF para foco em erros (acessibilidade)
  const errorRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const verificationInputRef = useRef<HTMLInputElement>(null);

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

    if (!validateForm()) {
      setLoading(false);
      return;
    }

    const trimmedEmail = email.trim();

    try {
      const response = await authApi.signin(trimmedEmail, password);
      if (response.success) {
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
        setError({
          message: 'Email ou senha incorretos. Verifique suas credenciais e tente novamente.',
          type: 'invalid_credentials',
        });
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
      {/* Left Column - Visual */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-[#111111] overflow-hidden">
        {/* Background Image with Overlay */}
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: 'url(https://images.unsplash.com/photo-1557804506-669a67965ba0?w=1200&q=80)',
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0a]/95 via-[#111111]/90 to-[#0a0a0a]/95"></div>
        </div>

        {/* Logo */}
        <div className="absolute top-8 left-8 z-10">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-[#00C48C] rounded-lg flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <span className="text-white text-2xl font-semibold">LeadsFlow</span>
          </div>
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center justify-center w-full px-12 text-center">
          <h2 className="text-white text-5xl font-semibold mb-4 leading-tight">
            Gerencie seus Leads,<br />
            Cresça seu Negócio
          </h2>
          <p className="text-gray-400 text-lg max-w-md">
            A solução CRM completa para empresas modernas
          </p>

          {/* Slide Indicators */}
          <div className="flex gap-2 mt-12">
            <div className="w-8 h-1 bg-[#00C48C] rounded-full"></div>
            <div className="w-8 h-1 bg-white/20 rounded-full"></div>
            <div className="w-8 h-1 bg-white/20 rounded-full"></div>
          </div>
        </div>
      </div>

      {/* Right Column - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-6 py-12 lg:px-16 bg-[#0a0a0a] overflow-y-auto">
        <div className="w-full max-w-md">
          {/* Title */}
          <div className="mb-8">
            {/* Mobile Logo */}
            <div className="lg:hidden flex items-center gap-2 mb-8">
              <div className="w-8 h-8 bg-[#00C48C] rounded-lg flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <span className="text-white text-xl font-semibold">LeadsFlow</span>
            </div>

            <h1 className="text-white text-3xl sm:text-4xl font-semibold mb-3">Entrar na conta</h1>
            <p className="text-gray-400 text-sm sm:text-base">
              Não tem uma conta?{' '}
              <button
                onClick={onSwitchToSignup}
                className="text-[#00C48C] hover:text-[#00a576] font-medium"
              >
                Criar conta
              </button>
            </p>
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
              <Label htmlFor="email" className="text-sm text-gray-300 mb-2 block">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500" />
                <Input
                  ref={emailRef}
                  id="email"
                  type="email"
                  placeholder="Digite seu email"
                  value={email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  className={`w-full pl-12 pr-4 py-3 bg-[#1a1a1a] text-white placeholder:text-gray-500 rounded-xl focus:ring-2 focus:ring-[#00C48C] transition-all ${
                    fieldErrors.email 
                      ? 'border-red-500/50 focus:border-red-500' 
                      : 'border-[#2a2a2a] focus:border-[#00C48C]'
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
                <Label htmlFor="password" className="text-sm text-gray-300">
                  Senha
                </Label>
                <button
                  type="button"
                  onClick={() => onForgotPassword ? onForgotPassword() : setShowForgotPassword(true)}
                  className="text-sm text-[#00C48C] hover:text-[#00a576]"
                >
                  Esqueceu a senha?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500" />
                <Input
                  ref={passwordRef}
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Digite sua senha"
                  value={password}
                  onChange={(e) => handlePasswordChange(e.target.value)}
                  className={`w-full pl-12 pr-12 py-3 bg-[#1a1a1a] text-white placeholder:text-gray-500 rounded-xl focus:ring-2 focus:ring-[#00C48C] transition-all ${
                    fieldErrors.password 
                      ? 'border-red-500/50 focus:border-red-500' 
                      : 'border-[#2a2a2a] focus:border-[#00C48C]'
                  }`}
                  required
                  aria-invalid={!!fieldErrors.password}
                  aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-600 dark:text-gray-400 hover:text-gray-500 dark:text-gray-400"
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
              disabled={loading}
              className="w-full py-3 bg-[#00C48C] hover:bg-[#00a576] text-white font-medium rounded-xl"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#2a2a2a]"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-[#0a0a0a] text-gray-500">Ou continue com</span>
            </div>
          </div>

          {/* Google Sign In Button */}
          <Button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full py-3 mb-6 bg-gray-50 hover:bg-gray-50 text-gray-900 font-medium rounded-xl flex items-center justify-center gap-3 border border-gray-300 transition-transform hover:scale-[1.02]"
          >
            <GoogleIcon />
            <span>Entrar com Google</span>
          </Button>

          {/* Footer Debug Buttons */}
          {debugMode && (
            <div className="mt-8 flex flex-col gap-2">
              <button
                onClick={handleDebugSetup}
                className="text-xs text-gray-700 dark:text-gray-300 hover:text-gray-600 dark:text-gray-400 transition-colors"
              >
                Debug Setup
              </button>
              <button
                onClick={handleAdminSetup}
                className="text-xs text-gray-700 dark:text-gray-300 hover:text-gray-600 dark:text-gray-400 transition-colors"
              >
                Admin Setup
              </button>
            </div>
          )}
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
              <p className="text-sm text-gray-400">
                Digite o código enviado para <span className="text-gray-200 font-medium">{verificationEmail}</span> para concluir o acesso.
              </p>
            </div>

            <form onSubmit={handleVerificationSubmit} className="space-y-4">
              <div>
                <Label htmlFor="verification-code" className="text-sm text-gray-300 mb-2 block">
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
                  className="w-full px-4 py-3 bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder:text-gray-500 rounded-xl focus:ring-2 focus:ring-[#00C48C] focus:border-[#00C48C] tracking-widest text-center"
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
                  className="flex-1 py-3 bg-transparent border-[#2a2a2a] text-gray-300 hover:bg-[#1a1a1a] rounded-xl"
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
              className="text-sm text-gray-500 hover:text-gray-300"
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
              <p className="text-gray-400 text-sm">
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
                <Label htmlFor="reset-email" className="text-sm text-gray-300 mb-2 block">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder="Digite seu email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder:text-gray-500 rounded-xl focus:ring-2 focus:ring-[#00C48C]"
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
                  className="flex-1 py-3 bg-transparent border-[#2a2a2a] text-gray-300 hover:bg-[#0a0a0a] rounded-xl"
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

