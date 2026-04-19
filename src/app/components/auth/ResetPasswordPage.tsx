import { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Shield, Lock, AlertCircle, CheckCircle, Eye, EyeOff, ArrowLeft, Key } from 'lucide-react';
import { authApi } from '../../utils/api';

interface ResetPasswordPageProps {
  onSuccess: () => void;
  onBackToLogin: () => void;
}

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
      setError(err.message || 'Erro ao redefinir senha');
    } finally {
      setLoading(false);
    }
  };

  const getPasswordStrength = (pass: string) => {
    if (pass.length === 0) return { strength: 0, label: '', color: '' };
    if (pass.length < 6) return { strength: 33, label: 'Fraca', color: 'bg-red-500' };
    if (pass.length < 10) return { strength: 66, label: 'Média', color: 'bg-yellow-500' };
    return { strength: 100, label: 'Forte', color: 'bg-green-500' };
  };

  const passwordStrength = getPasswordStrength(password);

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1a1625] px-4">
        <div className="w-full max-w-md">
          <div className="bg-[#2a2435] border border-[#3a3445] rounded-2xl shadow-lg p-10 space-y-6 text-center">
            <div className="flex justify-center">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-green-400" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-white">Senha Redefinida!</h2>
              <p className="text-sm text-muted-foreground">
                Sua senha foi alterada com sucesso. Redirecionando...
              </p>
            </div>
            <div className="flex items-center justify-center gap-2">
              <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
              <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1a1625] px-4 py-8">
      <div className="w-full max-w-md">
        {/* Reset Password Card */}
        <div className="bg-[#2a2435] border border-[#3a3445] rounded-2xl shadow-lg p-8 sm:p-10 space-y-6">
          {/* Ícone grande no topo */}
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center">
              <Shield className="w-8 h-8 text-primary" />
            </div>
          </div>

          {/* Título e Subtítulo */}
          <div className="text-center space-y-2">
            <h2 className="text-white text-2xl sm:text-3xl font-semibold">Reset Password</h2>
            <p className="text-muted-foreground/70 text-sm">
              Digite o código recebido por email e sua nova senha para concluir a recuperação.
            </p>
          </div>

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Reset Password Form */}
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <Label htmlFor="email" className="text-sm text-foreground/80 mb-2 block">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-[#1a1625] border-[#3a3445] text-white placeholder:text-muted-foreground rounded-xl focus:ring-2 focus:ring-ring"
                required
              />
            </div>

            <div>
              <Label htmlFor="token" className="text-sm text-foreground/80 mb-2 block">Código de verificação</Label>
              <div className="relative">
                <Key className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="token"
                  type="text"
                  placeholder="Ex: 76414021"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-[#1a1625] border-[#3a3445] text-white placeholder:text-muted-foreground rounded-xl focus:ring-2 focus:ring-ring"
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Copie o código de 8 dígitos enviado no email de recuperação e informe aqui.
              </p>
            </div>

            <div>
              <Label htmlFor="password" className="text-sm text-foreground/80 mb-2 block">Nova senha</Label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Digite sua nova senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-12 py-3 bg-[#1a1625] border-[#3a3445] text-white placeholder:text-muted-foreground rounded-xl focus:ring-2 focus:ring-ring"
                  required
                />
                <button
                  type="button"
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              
              {/* Password Strength Indicator */}
              {password.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${passwordStrength.color} transition-all duration-300`}
                        style={{ width: `${passwordStrength.strength}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground/70 font-medium min-w-[50px]">
                      {passwordStrength.label}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Força da senha: Use pelo menos 6 caracteres
                  </p>
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="confirmPassword" className="text-sm text-foreground/80 mb-2 block">Confirmar nova senha</Label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Confirme sua nova senha"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-12 pr-12 py-3 bg-[#1a1625] border-[#3a3445] text-white placeholder:text-muted-foreground rounded-xl focus:ring-2 focus:ring-ring"
                  required
                />
                <button
                  type="button"
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              
              {/* Password Match Indicator */}
              {confirmPassword.length > 0 && (
                <div className="mt-2">
                  {password === confirmPassword ? (
                    <p className="text-xs text-green-400 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      As senhas coincidem
                    </p>
                  ) : (
                    <p className="text-xs text-red-400 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      As senhas não coincidem
                    </p>
                  )}
                </div>
              )}
            </div>

            <Button
              type="submit"
              disabled={loading || password !== confirmPassword || password.length < 6 || !email || !token}
              className="w-full py-3 bg-primary text-primary-foreground hover:opacity-90 transition-all duration-150 font-medium rounded-lg disabled:opacity-50"
            >
              {loading ? 'Salvando...' : 'Salvar nova senha'}
            </Button>
          </form>

          {/* Back to Login */}
          <div className="text-center pt-2">
            <button
              onClick={onBackToLogin}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground/70 hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar ao login
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-xs text-foreground/80">
            © {new Date().getFullYear()} PersonalCreativeLda. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </div>
  );
}

