import { useState } from 'react';
import { Input } from '../ui/input';
import { CheckCircle2, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { authApi } from '../../utils/api';
import { AuthShell, AuthTitle, AuthNotice, AuthPrimaryButton, AuthLink, CodeInput, useAuthColors, PRIMARY } from './AuthShared';
import { RESET_EMAIL_KEY } from './ForgotPasswordPage';

interface ResetPasswordPageProps {
  onSuccess: () => void;
  onBackToLogin: () => void;
}

/** Código que veio no link do email (App guarda-o antes de limpar o endereço) */
export const RESET_TOKEN_KEY = 'password_reset_token';

const read = (store: 'local' | 'session', key: string) => {
  try { return (store === 'local' ? localStorage : sessionStorage).getItem(key) || ''; } catch { return ''; }
};

export default function ResetPasswordPage({ onSuccess, onBackToLogin }: ResetPasswordPageProps) {
  const c = useAuthColors();
  const savedEmail = read('local', RESET_EMAIL_KEY);
  const [email, setEmail] = useState(savedEmail);
  const [editEmail, setEditEmail] = useState(!savedEmail);
  const [token, setToken] = useState(() => {
    // Código do link do email (#type=recovery&token=…); depois sai do endereço
    const fromLink = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token')
      || new URLSearchParams(window.location.search).get('token') || '';
    if (fromLink) {
      // Guardado já: a página pode montar outra vez enquanto o App carrega
      try { sessionStorage.setItem(RESET_TOKEN_KEY, fromLink); } catch { /* sem armazenamento */ }
      try { window.history.replaceState(null, '', window.location.pathname); } catch { /* sem histórico */ }
    }
    return (fromLink || read('session', RESET_TOKEN_KEY)).replace(/\D/g, '').slice(0, 6);
  });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const canSubmit = !!email.trim() && token.length === 6 && password.length >= 6 && password === confirmPassword;

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError('');
    setLoading(true);
    try {
      await authApi.completePasswordReset(email.trim(), token, password);
      try {
        sessionStorage.removeItem('password_reset_mode');
        sessionStorage.removeItem(RESET_TOKEN_KEY);
        localStorage.removeItem(RESET_EMAIL_KEY);
      } catch { /* sem armazenamento */ }
      setSuccess(true);
      // A alteração não abre sessão: entra com a palavra-passe nova (com 2 passos, vai ao login)
      try {
        const r: any = await authApi.signin(email.trim(), password);
        if (r?.success && !r?.requires_2fa) { onSuccess(); return; }
      } catch { /* segue para o login */ }
      setTimeout(onBackToLogin, 1200);
    } catch (err: any) {
      setError(err.message || 'Código inválido ou expirado.');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%', height: '48px', paddingLeft: '14px', paddingRight: '48px',
    background: c.inputBg, border: `1px solid ${c.border}`, borderRadius: '6px',
    fontSize: '16px', color: c.inputText, caretColor: PRIMARY,
  } as const;
  const inputClass = 'placeholder:text-[#BFC8D6] transition-all focus:outline-none focus:border-[#635BFF] focus:shadow-[0_0_0_4px_rgba(99,91,255,0.1)]';
  const labelStyle = { display: 'block', fontSize: '14px', color: c.label, marginBottom: '8px', fontWeight: 500 } as const;

  if (success) {
    return (
      <AuthShell>
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: 'rgba(5,150,105,0.12)' }}>
          <CheckCircle2 className="h-6 w-6" style={{ color: '#059669' }} />
        </div>
        <AuthTitle title="Palavra-passe alterada" subtitle="A entrar na sua conta..." />
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <AuthTitle
        title="Nova palavra-passe"
        subtitle={email && !editEmail
          ? <>Código enviado para <span translate="no" style={{ color: c.title, fontWeight: 500 }}>{email}</span>. <button type="button" onClick={() => setEditEmail(true)} style={{ color: c.link }}>Alterar</button></>
          : 'Escreva o código que recebeu por email e a nova palavra-passe.'}
      />
      {error && <AuthNotice type="error">{error}</AuthNotice>}

      <form onSubmit={handleResetPassword} className="space-y-5 mb-6">
        {editEmail && (
          <div>
            <label htmlFor="email" style={labelStyle}>Email</label>
            <Input id="email" type="email" autoComplete="email" placeholder="seu@email.com" value={email}
              onChange={(e) => setEmail(e.target.value)} required
              style={{ ...inputStyle, paddingRight: '14px' }} className={inputClass} />
          </div>
        )}

        <div>
          <label style={labelStyle}>Código</label>
          <CodeInput value={token} onChange={(v) => { setToken(v); if (error) setError(''); }} invalid={!!error} autoFocus={!editEmail && token.length < 6} />
        </div>

        <div>
          <label htmlFor="password" style={labelStyle}>Nova palavra-passe</label>
          <div className="relative">
            <Input id="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Pelo menos 6 caracteres"
              value={password} onChange={(e) => setPassword(e.target.value)} required
              style={inputStyle} className={inputClass} />
            <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Esconder' : 'Mostrar'}
              className="absolute right-3.5 top-1/2 -translate-y-1/2" style={{ color: c.subtle }}>
              {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="confirmPassword" style={labelStyle}>Confirmar palavra-passe</label>
          <Input id="confirmPassword" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Repita a palavra-passe"
            value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required
            style={{ ...inputStyle, paddingRight: '14px', borderColor: mismatch ? '#E61947' : c.border }} className={inputClass} />
          {mismatch && <p className="mt-1.5" style={{ fontSize: '13px', color: c.errorIcon }}>As palavras-passe não coincidem</p>}
        </div>

        <AuthPrimaryButton disabled={!canSubmit} loading={loading}>
          {loading ? 'A guardar...' : 'Guardar e entrar'}
        </AuthPrimaryButton>
      </form>

      <AuthLink onClick={onBackToLogin}><ArrowLeft className="h-4 w-4" />Voltar ao login</AuthLink>
    </AuthShell>
  );
}
