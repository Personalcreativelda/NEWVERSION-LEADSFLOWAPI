import { useState } from 'react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Shield, Lock, AlertCircle, CheckCircle, Eye, EyeOff, ArrowLeft, Key, Zap } from 'lucide-react';
import { authApi } from '../../utils/api';
import { AppButton } from '../base/AppButton';

interface ResetPasswordPageProps {
  onSuccess: () => void;
  onBackToLogin: () => void;
}

const FONT = '"Public Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';

const fieldStyle = {
  width: '100%', height: '48px', paddingLeft: '44px', paddingRight: '14px',
  background: '#FFFFFF', border: '1px solid #D4DEE9', borderRadius: '6px',
  fontSize: '16px', color: '#273951', caretColor: '#675DFF',
} as const;

const fieldClassName = 'placeholder:text-[#BFC8D6] transition-all focus:outline-none focus:border-[#635BFF] focus:shadow-[0_0_0_4px_rgba(99,91,255,0.1)]';

export default function ResetPasswordPage({ onSuccess, onBackToLogin }: ResetPasswordPageProps) {
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Validações
      if (password.length < 6) {
        throw new Error('A senha deve ter pelo menos 6 caracteres');
      }

      if (password !== confirmPassword) {
        throw new Error('As senhas não coincidem');
      }

      const trimmedEmail = email.trim();
      const trimmedToken = token.trim();

      if (!trimmedEmail || !trimmedToken) {
        throw new Error('Email e código de verificação são obrigatórios.');
      }

      await authApi.completePasswordReset(trimmedEmail, trimmedToken, password);

      console.log('✅ Password updated successfully via API');

      // Clear the password reset mode flag
      sessionStorage.removeItem('password_reset_mode');
      console.log('✅ Cleared password_reset_mode flag');

      setSuccess(true);

      // Redirect to dashboard after 2 seconds
      setTimeout(() => {
        onSuccess();
      }, 2000);
    } catch (err: any) {
      console.error('Reset password error:', err);
      setError(err.message || 'Erro ao redefinir palavra-passe');
    } finally {
      setLoading(false);
    }
  };

  const getPasswordStrength = (pass: string) => {
    if (pass.length === 0) return { strength: 0, label: '', color: '' };
    if (pass.length < 6) return { strength: 33, label: 'Fraca', color: '#E61947' };
    if (pass.length < 10) return { strength: 66, label: 'Média', color: '#CC4B00' };
    return { strength: 100, label: 'Forte', color: '#059669' };
  };

  const passwordStrength = getPasswordStrength(password);

  if (success) {
    return (
      <div className="min-h-screen relative flex items-center justify-center px-4 overflow-hidden"
        style={{ background: 'transparent', fontFamily: FONT }}>
        <div className="relative z-10 w-full max-w-[520px] flex flex-col">
          <div className="flex items-center gap-2.5 mb-8">
            <div className="w-9 h-9 rounded-[10px] flex items-center justify-center"
              style={{ background: '#675DFF', boxShadow: '0 2px 12px rgba(103,93,255,0.45)' }}>
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-[19px] font-semibold text-white tracking-tight">LeadsFlow</span>
          </div>
          <div className="rounded-[12px] p-10 space-y-6 text-center"
            style={{
              background: 'rgba(255,255,255,0.97)', border: '1px solid rgba(255,255,255,0.3)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.08), 0 8px 32px rgba(0,0,0,0.06)', backdropFilter: 'blur(20px)',
            }}>
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(5,150,105,0.08)', border: '1px solid rgba(5,150,105,0.2)' }}>
                <CheckCircle className="w-8 h-8" style={{ color: '#059669' }} />
              </div>
            </div>
            <div className="space-y-2">
              <h2 style={{ fontSize: '24px', fontWeight: 600, color: '#1A2C44' }}>Palavra-passe redefinida!</h2>
              <p style={{ fontSize: '14px', color: '#3C4257', fontWeight: 300 }}>
                Sua palavra-passe foi alterada com sucesso. A redirecionar...
              </p>
            </div>
            <div className="flex items-center justify-center gap-2">
              {[0, 0.1, 0.2].map((delay, i) => (
                <div key={i} className="w-2 h-2 rounded-full animate-bounce" style={{ background: '#675DFF', animationDelay: `${delay}s` }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center py-16 px-4 overflow-hidden"
      style={{ background: 'transparent', fontFamily: FONT }}>

      <div className="relative z-10 w-full max-w-[520px] flex flex-col">

        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-8">
          <div className="w-9 h-9 rounded-[10px] flex items-center justify-center"
            style={{ background: '#675DFF', boxShadow: '0 2px 12px rgba(103,93,255,0.45)' }}>
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="text-[19px] font-semibold text-white tracking-tight">LeadsFlow</span>
        </div>

        <div className="rounded-[12px] p-10"
          style={{
            background: 'rgba(255,255,255,0.97)', border: '1px solid rgba(255,255,255,0.3)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.08), 0 8px 32px rgba(0,0,0,0.06)', backdropFilter: 'blur(20px)',
          }}>

          {/* Icon */}
          <div className="flex justify-center mb-5">
            <div className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(103,93,255,0.08)', border: '1px solid rgba(103,93,255,0.15)' }}>
              <Shield className="w-7 h-7" style={{ color: '#675DFF' }} />
            </div>
          </div>

          {/* Title */}
          <h1 className="text-[28px] font-semibold leading-[36px] mb-2 text-center" style={{ color: '#1A2C44' }}>
            Redefinir palavra-passe
          </h1>
          <p className="text-[15px] mb-7 text-center" style={{ color: '#6B7280', fontWeight: 300 }}>
            Digite o código recebido por email e sua nova palavra-passe para concluir a recuperação.
          </p>

          {/* Error */}
          {error && (
            <div className="mb-5 p-4 rounded-[8px] flex items-start gap-3 animate-in fade-in duration-200"
              style={{ background: '#FFF0F3', border: '1px solid rgba(230,25,71,0.3)' }}>
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#E61947' }} />
              <p className="text-[13px] leading-[18px]" style={{ color: '#C0123C', fontWeight: 300 }}>{error}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleResetPassword} className="space-y-5 mb-6">
            {/* Email */}
            <div>
              <Label htmlFor="email" style={{ display: 'block', fontSize: '14px', color: '#414552', marginBottom: '8px', fontWeight: 500 }}>
                Email
              </Label>
              <Input
                id="email" type="email" placeholder="seu@email.com" value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ ...fieldStyle, paddingLeft: '14px' }}
                className={fieldClassName}
                required
              />
            </div>

            {/* Token */}
            <div>
              <Label htmlFor="token" style={{ display: 'block', fontSize: '14px', color: '#414552', marginBottom: '8px', fontWeight: 500 }}>
                Código de verificação
              </Label>
              <div className="relative">
                <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px]" style={{ color: '#8A9BB0' }} />
                <Input
                  id="token" type="text" placeholder="Ex: 76414021" value={token}
                  onChange={(e) => setToken(e.target.value)}
                  style={fieldStyle}
                  className={fieldClassName}
                  required
                />
              </div>
              <p className="mt-1.5" style={{ fontSize: '13px', color: '#8A9BB0', fontWeight: 300 }}>
                Copie o código de 8 dígitos enviado no email de recuperação e informe aqui.
              </p>
            </div>

            {/* Password */}
            <div>
              <Label htmlFor="password" style={{ display: 'block', fontSize: '14px', color: '#414552', marginBottom: '8px', fontWeight: 500 }}>
                Nova palavra-passe
              </Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px]" style={{ color: '#8A9BB0' }} />
                <Input
                  id="password" type={showPassword ? 'text' : 'password'} placeholder="Digite sua nova palavra-passe" value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ ...fieldStyle, paddingRight: '48px' }}
                  className={fieldClassName}
                  required
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors" style={{ color: '#8A9BB0' }}>
                  {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                </button>
              </div>

              {/* Password Strength Indicator */}
              {password.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: '#EEF0F3' }}>
                      <div
                        className="h-full transition-all duration-300"
                        style={{ width: `${passwordStrength.strength}%`, background: passwordStrength.color }}
                      />
                    </div>
                    <span className="min-w-[50px]" style={{ fontSize: '13px', color: '#8A9BB0', fontWeight: 300 }}>
                      {passwordStrength.label}
                    </span>
                  </div>
                  <p style={{ fontSize: '13px', color: '#8A9BB0', fontWeight: 300 }}>
                    Força da palavra-passe: Use pelo menos 6 caracteres
                  </p>
                </div>
              )}
            </div>

            {/* Confirm password */}
            <div>
              <Label htmlFor="confirmPassword" style={{ display: 'block', fontSize: '14px', color: '#414552', marginBottom: '8px', fontWeight: 500 }}>
                Confirmar nova palavra-passe
              </Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px]" style={{ color: '#8A9BB0' }} />
                <Input
                  id="confirmPassword" type={showConfirmPassword ? 'text' : 'password'} placeholder="Confirme sua nova palavra-passe" value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  style={{ ...fieldStyle, paddingRight: '48px' }}
                  className={fieldClassName}
                  required
                />
                <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors" style={{ color: '#8A9BB0' }}>
                  {showConfirmPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                </button>
              </div>

              {/* Password Match Indicator */}
              {confirmPassword.length > 0 && (
                <div className="mt-1.5">
                  {password === confirmPassword ? (
                    <p className="flex items-center gap-1" style={{ fontSize: '13px', color: '#059669' }}>
                      <CheckCircle className="w-3.5 h-3.5" />
                      As palavras-passe coincidem
                    </p>
                  ) : (
                    <p className="flex items-center gap-1" style={{ fontSize: '13px', color: '#E61947' }}>
                      <AlertCircle className="w-3.5 h-3.5" />
                      As palavras-passe não coincidem
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Submit */}
            <AppButton
              type="submit"
              disabled={password !== confirmPassword || password.length < 6 || !email || !token}
              loading={loading}
              style={{
                width: '100%', height: '50px', fontSize: '16px', fontWeight: 500,
                borderRadius: '6px', border: 'none', marginTop: '8px',
                background: loading || password !== confirmPassword || password.length < 6 || !email || !token ? '#D4DEE9' : '#675DFF',
                color: loading || password !== confirmPassword || password.length < 6 || !email || !token ? '#3C4257' : '#FFFFFF',
                boxShadow: loading || password !== confirmPassword || password.length < 6 || !email || !token ? 'none' : '0 0 0 1px #675DFF',
                transition: 'background-color 200ms ease',
              }}
              className="transition-all hover:brightness-110 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'A guardar...' : 'Guardar nova palavra-passe'}
            </AppButton>
          </form>

          {/* Back to Login */}
          <div className="text-center">
            <button
              onClick={onBackToLogin}
              className="inline-flex items-center gap-1.5 transition-colors hover:text-[#533AFD]"
              style={{ fontSize: '14px', color: '#8A9BB0', fontWeight: 300 }}
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar ao login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
