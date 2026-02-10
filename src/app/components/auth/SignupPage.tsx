import { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { AlertCircle, CheckCircle, Eye, EyeOff, MailCheck, Zap, X } from 'lucide-react';
import { authApi } from '../../utils/api';
import { metaEvents } from '../MetaPixel';

interface SignupPageProps {
  onSuccess: () => void;
  onSwitchToLogin: () => void;
  onBackToHome?: () => void;
}

export default function SignupPage({ onSuccess, onSwitchToLogin, onBackToHome }: SignupPageProps) {
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
                <div className="space-y-3 text-sm text-gray-400">
                  <p>Verifique seu email para confirmar a conta antes de acessar o painel.</p>
                  {pendingEmail && (
                    <p className="text-gray-300">
                      Enviamos o link para <span className="text-white font-medium">{pendingEmail}</span>.
                    </p>
                  )}
                  <p>Se não encontrar o email, verifique a pasta de spam ou promoções.</p>
                </div>
              ) : (
                <p className="text-sm text-gray-400">
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
                  className="w-full py-3 bg-transparent border border-[#2a2a2a] text-gray-300 hover:bg-[#1a1a1a] rounded-xl"
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
                  className="text-sm text-gray-500 hover:text-gray-300"
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
      {/* Left Column - Visual */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-[#111111] overflow-hidden">
        {/* Background Image with Overlay */}
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: 'url(https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=1200&q=80)',
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
            Comece a Crescer Hoje,<br />
            Transforme seu Negócio
          </h2>
          <p className="text-gray-400 text-lg max-w-md">
            Junte-se a milhares de empresas gerenciando seus leads de forma eficiente
          </p>

          {/* Slide Indicators */}
          <div className="flex gap-2 mt-12">
            <div className="w-8 h-1 bg-white/20 rounded-full"></div>
            <div className="w-8 h-1 bg-[#00C48C] rounded-full"></div>
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

            <h1 className="text-white text-3xl sm:text-4xl font-semibold mb-3">Criar uma conta</h1>
            <p className="text-gray-400 text-sm sm:text-base">
              Já tem uma conta?{' '}
              <button
                onClick={onSwitchToLogin}
                className="text-[#00C48C] hover:text-[#00a576] font-medium"
              >
                Entrar
              </button>
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleEmailSignup} className="space-y-5 mb-6">
            {/* Email Field */}
            <div>
              <Label htmlFor="email" className="text-sm text-gray-300 mb-2 block">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder:text-gray-500 rounded-xl focus:ring-2 focus:ring-[#00C48C] focus:border-[#00C48C]"
                required
              />
            </div>

            {/* Company Name Field */}
            <div>
              <Label htmlFor="name" className="text-sm text-gray-300 mb-2 block">
                Nome da Empresa
              </Label>
              <Input
                id="name"
                type="text"
                placeholder="Nome da sua empresa"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder:text-gray-500 rounded-xl focus:ring-2 focus:ring-[#00C48C] focus:border-[#00C48C]"
                required
              />
            </div>

            {/* Password Field */}
            <div>
              <Label htmlFor="password" className="text-sm text-gray-300 mb-2 block">
                Senha
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-12 bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder:text-gray-500 rounded-xl focus:ring-2 focus:ring-[#00C48C] focus:border-[#00C48C]"
                  required
                />
                <button
                  type="button"
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-400"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Terms Checkbox */}
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="terms"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                className="mt-1 w-4 h-4 border-gray-600 rounded bg-[#1a1a1a] text-[#00C48C] focus:ring-[#00C48C]"
              />
              <label htmlFor="terms" className="text-sm text-gray-400">
                Eu concordo com os{' '}
                <a href="#terms" className="text-[#00C48C] hover:text-[#00a576] underline">
                  Termos e Condições
                </a>
              </label>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={loading || !agreeTerms}
              className="w-full py-3 bg-[#00C48C] hover:bg-[#00a576] text-white rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Criando conta...' : 'Criar conta'}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#2a2a2a]"></div>
            </div>
            <div className="relative flex justify-center">
              <span className="px-4 bg-[#0a0a0a] text-sm text-gray-500">ou registre-se com</span>
            </div>
          </div>

          {/* Social Login */}
          <div className="flex gap-4">
            <Button
              onClick={handleGoogleSignup}
              disabled={loading}
              variant="outline"
              className="flex-1 py-3 bg-[#1a1a1a] border-[#2a2a2a] hover:bg-[#222222] text-white rounded-xl"
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Google
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

