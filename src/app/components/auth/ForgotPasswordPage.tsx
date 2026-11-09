import { useState, type FormEvent } from 'react';
import { Input } from '../ui/input';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { authApi } from '../../utils/api';
import { AuthShell, AuthTitle, AuthNotice, AuthPrimaryButton, AuthLink, useAuthColors, PRIMARY } from './AuthShared';

interface ForgotPasswordPageProps {
  onBackToLogin: () => void;
  /** Já tem o código: abre a página para o escrever e escolher a nova palavra-passe */
  onHaveCode?: () => void;
}

/** Email da recuperação em curso (a página do código preenche-o sozinha) */
export const RESET_EMAIL_KEY = 'leadsflow_reset_email';

export default function ForgotPasswordPage({ onBackToLogin, onHaveCode }: ForgotPasswordPageProps) {
  const c = useAuthColors();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const trimmedEmail = email.trim();
      if (!trimmedEmail) throw new Error('Por favor, insira o seu email.');
      await authApi.requestPasswordReset(trimmedEmail);
      try { localStorage.setItem(RESET_EMAIL_KEY, trimmedEmail); } catch { /* sem armazenamento */ }
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Erro ao enviar o email de recuperação');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <AuthShell>
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: 'rgba(103,93,255,0.12)' }}>
          <MailCheck className="h-6 w-6" style={{ color: PRIMARY }} />
        </div>
        <AuthTitle
          title="Veja o seu email"
          subtitle={<>Se existir uma conta com <span translate="no" style={{ color: c.title, fontWeight: 500 }}>{email.trim()}</span>, enviámos um código de 6 dígitos. É válido durante 1 hora.</>}
        />
        <AuthPrimaryButton type="button" onClick={() => onHaveCode ? onHaveCode() : onBackToLogin()}>
          Introduzir o código
        </AuthPrimaryButton>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <AuthLink onClick={onBackToLogin}><ArrowLeft className="h-4 w-4" />Voltar ao login</AuthLink>
          <AuthLink onClick={() => { setSuccess(false); }}>Usar outro email</AuthLink>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <AuthTitle title="Recuperar palavra-passe" subtitle="Enviamos um código para o seu email." />
      {error && <AuthNotice type="error">{error}</AuthNotice>}
      <form onSubmit={handleSubmit} className="space-y-5 mb-6">
        <div>
          <label htmlFor="email" style={{ display: 'block', fontSize: '14px', color: c.label, marginBottom: '8px', fontWeight: 500 }}>
            Email
          </label>
          <Input
            id="email" type="email" autoComplete="email" placeholder="seu@email.com" value={email}
            onChange={(e) => { setEmail(e.target.value); if (error) setError(''); }}
            required
            style={{
              width: '100%', height: '48px', paddingLeft: '14px', paddingRight: '14px',
              background: c.inputBg, border: `1px solid ${c.border}`,
              borderRadius: '6px', fontSize: '16px', color: c.inputText, caretColor: PRIMARY,
            }}
            className="placeholder:text-[#BFC8D6] transition-all focus:outline-none focus:border-[#635BFF] focus:shadow-[0_0_0_4px_rgba(99,91,255,0.1)]"
          />
        </div>
        <AuthPrimaryButton disabled={!email.trim()} loading={loading}>
          {loading ? 'A enviar...' : 'Enviar código'}
        </AuthPrimaryButton>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AuthLink onClick={onBackToLogin}><ArrowLeft className="h-4 w-4" />Voltar ao login</AuthLink>
        {onHaveCode && <AuthLink onClick={onHaveCode}>Já tenho o código</AuthLink>}
      </div>
    </AuthShell>
  );
}
