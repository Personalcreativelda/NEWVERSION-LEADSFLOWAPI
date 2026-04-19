import { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Shield, AlertCircle, CheckCircle, ArrowLeft, Mail } from 'lucide-react';
import { authApi } from '../../utils/api';

interface ForgotPasswordPageProps {
  onBackToLogin: () => void;
}

export default function ForgotPasswordPage({ onBackToLogin }: ForgotPasswordPageProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const trimmedEmail = email.trim();

      if (!trimmedEmail) {
        throw new Error('Por favor, insira seu email.');
      }

      await authApi.requestPasswordReset(trimmedEmail);

      setSuccess(true);
      console.log('[Forgot Password] ✅ Email enviado com sucesso!');
    } catch (err: any) {
      console.error('[Forgot Password] Erro ao enviar email:', err);
      setError(err.message || 'Erro ao enviar email de recuperação');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-md">
          <div className="bg-card border border-border rounded-2xl shadow-lg p-10 space-y-6 text-center">
            <div className="flex justify-center">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-green-400" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-foreground">Email Enviado!</h2>
              <p className="text-sm text-muted-foreground/70">
                Se existe uma conta com o email <strong className="text-foreground">{email}</strong>,
                você receberá um link para redefinir sua senha.
              </p>
              <p className="text-xs text-muted-foreground mt-4">
                Verifique sua caixa de entrada e spam. O link é válido por 1 hora.
              </p>
            </div>
            <Button
              onClick={onBackToLogin}
              className="w-full py-3 bg-primary text-primary-foreground hover:opacity-90 transition-all duration-150 font-medium rounded-lg"
            >
              Voltar ao Login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md">
        <div className="bg-card border border-border rounded-2xl shadow-lg p-8 sm:p-10 space-y-6">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center">
              <Shield className="w-8 h-8 text-primary" />
            </div>
          </div>

          <div className="text-center space-y-2">
            <h2 className="text-foreground text-2xl sm:text-3xl font-semibold">Recuperar Senha</h2>
            <p className="text-muted-foreground/70 text-sm">
              Digite seu email para receber o link de recuperação.
            </p>
          </div>

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email" className="text-sm text-foreground/80 mb-2 block">Email</Label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="Digite seu email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-background border-border text-foreground placeholder:text-muted-foreground rounded-xl focus:ring-2 focus:ring-ring"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading || !email}
              className="w-full py-3 bg-primary text-primary-foreground hover:opacity-90 transition-all duration-150 font-medium rounded-lg disabled:opacity-50"
            >
              {loading ? 'Enviando...' : 'Enviar Link de Recuperação'}
            </Button>
          </form>

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

        <div className="mt-6 text-center">
          <p className="text-xs text-foreground/80">
            © {new Date().getFullYear()} PersonalCreativeLda. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </div>
  );
}
