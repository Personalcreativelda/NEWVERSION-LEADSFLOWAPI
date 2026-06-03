import { useState, type FormEvent } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { AlertCircle, CheckCircle, ArrowLeft, Zap, Loader2 } from 'lucide-react';
import { authApi } from '../../utils/api';

interface ForgotPasswordPageProps {
  onBackToLogin: () => void;
}

const FONT = 'sohne-var, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';

export default function ForgotPasswordPage({ onBackToLogin }: ForgotPasswordPageProps) {
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

      if (!trimmedEmail) {
        throw new Error('Por favor, insira seu email.');
      }

      await authApi.requestPasswordReset(trimmedEmail);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Erro ao enviar email de recuperação');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen relative flex items-center justify-center py-16 px-4 overflow-hidden"
      style={{ background: 'transparent', fontFamily: FONT }}
    >

      <div className="relative z-10 w-full max-w-[520px] flex flex-col">

        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-8">
          <div
            className="w-9 h-9 rounded-[10px] flex items-center justify-center"
            style={{ background: '#675DFF', boxShadow: '0 2px 12px rgba(103,93,255,0.45)' }}
          >
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="text-[19px] font-semibold text-white tracking-tight">LeadsFlow</span>
        </div>

        {/* Card */}
        <div
          className="rounded-[12px] p-10"
          style={{
            background: 'rgba(255,255,255,0.97)',
            border: '1px solid rgba(255,255,255,0.3)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.08), 0 8px 32px rgba(0,0,0,0.06)',
            backdropFilter: 'blur(20px)',
          }}
        >
          {success ? (
            /* ── Success state ── */
            <div className="text-center space-y-5">
              <div
                className="w-14 h-14 mx-auto rounded-full flex items-center justify-center"
                style={{ background: 'rgba(5,150,105,0.08)', border: '1px solid rgba(5,150,105,0.2)' }}
              >
                <CheckCircle className="w-7 h-7" style={{ color: '#059669' }} />
              </div>
              <div className="space-y-2">
                <h1 className="text-[28px] font-semibold leading-[36px]" style={{ color: '#1A2C44' }}>
                  Email enviado!
                </h1>
                <p className="text-[15px]" style={{ color: '#6B7280', fontWeight: 300 }}>
                  Se existe uma conta com o email{' '}
                  <span style={{ fontWeight: 500, color: '#1A2C44' }}>{email}</span>,
                  você receberá um link para redefinir sua senha.
                </p>
                <p className="text-[13px] mt-2" style={{ color: '#8A9BB0', fontWeight: 300 }}>
                  Verifique sua caixa de entrada e spam. O link é válido por 1 hora.
                </p>
              </div>
              <Button
                onClick={onBackToLogin}
                style={{
                  width: '100%', height: '50px', fontSize: '16px', fontWeight: 500,
                  borderRadius: '6px', border: 'none', marginTop: '8px',
                  background: '#675DFF', color: '#FFFFFF',
                  boxShadow: '0 0 0 1px #675DFF',
                }}
                className="transition-all hover:brightness-110 active:brightness-95"
              >
                Voltar ao login
              </Button>
            </div>
          ) : (
            /* ── Form state ── */
            <>
              <h1 className="text-[28px] font-semibold leading-[36px] mb-2" style={{ color: '#1A2C44' }}>
                Recuperar senha
              </h1>
              <p className="text-[15px] mb-7" style={{ color: '#6B7280', fontWeight: 300 }}>
                Digite seu email para receber o link de recuperação.
              </p>

              {error && (
                <div
                  className="mb-5 p-4 rounded-[8px] flex items-start gap-3 animate-in fade-in duration-200"
                  style={{ background: '#FFF0F3', border: '1px solid rgba(230,25,71,0.3)' }}
                >
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#E61947' }} />
                  <p className="text-[13px] leading-[18px]" style={{ color: '#C0123C', fontWeight: 300 }}>
                    {error}
                  </p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5 mb-6">
                <div>
                  <label
                    htmlFor="email"
                    style={{ display: 'block', fontSize: '14px', color: '#414552', marginBottom: '8px', fontWeight: 500 }}
                  >
                    Email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); if (error) setError(''); }}
                    required
                    style={{
                      width: '100%', height: '48px', paddingLeft: '14px', paddingRight: '14px',
                      background: '#FFFFFF', border: '1px solid #D4DEE9',
                      borderRadius: '6px', fontSize: '16px', color: '#273951', caretColor: '#675DFF',
                    }}
                    className="placeholder:text-[#BFC8D6] transition-all focus:outline-none focus:border-[#635BFF] focus:shadow-[0_0_0_4px_rgba(99,91,255,0.1)]"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading || !email.trim()}
                  style={{
                    width: '100%', height: '50px', fontSize: '16px', fontWeight: 500,
                    borderRadius: '6px', border: 'none', marginTop: '8px',
                    background: loading || !email.trim() ? '#D4DEE9' : '#675DFF',
                    color: loading || !email.trim() ? '#3C4257' : '#FFFFFF',
                    boxShadow: loading || !email.trim() ? 'none' : '0 0 0 1px #675DFF',
                    transition: 'background-color 200ms ease',
                  }}
                  className="transition-all hover:brightness-110 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading
                    ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Enviando...</span>
                    : 'Enviar link de recuperação'
                  }
                </Button>
              </form>

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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
