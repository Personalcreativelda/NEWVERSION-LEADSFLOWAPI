import { useState, useEffect } from 'react';
import { Loader2, Users, CheckCircle, AlertCircle, Eye, EyeOff, Lock, User } from 'lucide-react';
import { startSessionExpiryTimer } from '../../utils/api';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '');

interface InviteDetails {
    email: string;
    role: string;
    workspace_name: string;
    invited_by_name?: string;
}

interface AcceptInvitePageProps {
    onSuccess: (user: any) => void;
}

const ROLE_LABELS: Record<string, string> = {
    owner: 'Owner', admin: 'Admin', manager: 'Manager', agent: 'Agente', viewer: 'Viewer',
};

export default function AcceptInvitePage({ onSuccess }: AcceptInvitePageProps) {
    const token = new URLSearchParams(window.location.search).get('token') || '';

    const [invite, setInvite] = useState<InviteDetails | null>(null);
    const [loadingInvite, setLoadingInvite] = useState(true);
    const [inviteError, setInviteError] = useState<string | null>(null);
    const [hasAccount, setHasAccount] = useState(false);

    // Form fields
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState('');
    const [accepted, setAccepted] = useState(false);
    const [acceptedWorkspace, setAcceptedWorkspace] = useState('');

    // Load invite details
    useEffect(() => {
        if (!token) {
            setInviteError('Link de convite inválido ou em falta.');
            setLoadingInvite(false);
            return;
        }
        fetch(`${API_URL}/api/auth/invite/${token}`)
            .then(r => r.json())
            .then(data => {
                if (data.error) {
                    const msg = data.error.includes('expirado')
                        ? 'Este convite expirou. Pede ao administrador que envie um novo.'
                        : data.error.includes('aceito') || data.error.includes('accepted')
                        ? 'Este convite já foi aceite.'
                        : data.error;
                    setInviteError(msg);
                } else {
                    setInvite(data);
                }
            })
            .catch(() => setInviteError('Erro ao carregar detalhes do convite.'))
            .finally(() => setLoadingInvite(false));
    }, [token]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');

        if (!hasAccount && !name.trim()) {
            setFormError('O nome é obrigatório');
            return;
        }
        if (!password) {
            setFormError('A senha é obrigatória');
            return;
        }
        if (!hasAccount && password !== confirmPassword) {
            setFormError('As senhas não coincidem');
            return;
        }
        if (!hasAccount && password.length < 6) {
            setFormError('A senha deve ter pelo menos 6 caracteres');
            return;
        }

        setSubmitting(true);
        try {
            const res = await fetch(`${API_URL}/api/auth/accept-invite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token,
                    password,
                    name: hasAccount ? undefined : name.trim(),
                }),
            });
            const data = await res.json();

            if (!res.ok) {
                // If backend says account exists, switch to login mode
                if (data.has_account) {
                    setHasAccount(true);
                    setFormError('Esta conta já existe. Introduz a tua senha para aceitar o convite.');
                    setSubmitting(false);
                    return;
                }
                setFormError(data.error || 'Erro ao aceitar convite');
                setSubmitting(false);
                return;
            }

            // Save session
            if (data.session?.access_token) {
                localStorage.setItem('leadflow_access_token', data.session.access_token);
                if (data.session.refresh_token) {
                    localStorage.setItem('leadflow_refresh_token', data.session.refresh_token);
                }
                startSessionExpiryTimer();
            }

            setAcceptedWorkspace(data.workspace_name || invite?.workspace_name || '');
            setAccepted(true);

            // Redirect to dashboard after short delay
            setTimeout(() => {
                // Trigger re-auth in parent
                onSuccess(null);
            }, 2000);
        } catch {
            setFormError('Erro de rede. Tenta novamente.');
        } finally {
            setSubmitting(false);
        }
    };

    // ── Loading ────────────────────────────────────────────────────────────────
    if (loadingInvite) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    // ── Error ──────────────────────────────────────────────────────────────────
    if (inviteError) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <div className="w-full max-w-md text-center">
                    <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="w-8 h-8 text-red-500" />
                    </div>
                    <h1 className="text-xl font-semibold text-foreground mb-2">Convite inválido</h1>
                    <p className="text-muted-foreground mb-6">{inviteError}</p>
                    <a
                        href="/login"
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                        Ir para o login
                    </a>
                </div>
            </div>
        );
    }

    // ── Accepted ───────────────────────────────────────────────────────────────
    if (accepted) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <div className="w-full max-w-md text-center">
                    <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                        <CheckCircle className="w-8 h-8 text-green-500" />
                    </div>
                    <h1 className="text-xl font-semibold text-foreground mb-2">Convite aceite!</h1>
                    <p className="text-muted-foreground">Bem-vindo à equipa <strong>{acceptedWorkspace}</strong>. A redirecionar…</p>
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mx-auto mt-4" />
                </div>
            </div>
        );
    }

    // ── Form ───────────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Logo / Brand */}
                <div className="text-center mb-8">
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                        <Users className="w-7 h-7 text-primary" />
                    </div>
                    <h1 className="text-2xl font-bold text-foreground">LeadsFlow</h1>
                </div>

                {/* Invite card */}
                <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
                    {/* Header */}
                    <div className="bg-primary/5 border-b border-border px-6 py-5">
                        <p className="text-sm text-muted-foreground mb-1">
                            {invite?.invited_by_name
                                ? <><strong className="text-foreground">{invite.invited_by_name}</strong> convidou-te para</>
                                : 'Foste convidado para'
                            }
                        </p>
                        <h2 className="text-lg font-semibold text-foreground">{invite?.workspace_name}</h2>
                        <span className="inline-block mt-1.5 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                            Papel: {ROLE_LABELS[invite?.role || ''] || invite?.role}
                        </span>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="p-6 space-y-4">
                        <p className="text-sm text-muted-foreground">
                            {hasAccount
                                ? <>A conta <strong className="text-foreground">{invite?.email}</strong> já existe. Introduz a tua senha para aceitar.</>
                                : <>Cria a tua conta para <strong className="text-foreground">{invite?.email}</strong> e junta-te à equipa.</>
                            }
                        </p>

                        {/* Name (only for new accounts) */}
                        {!hasAccount && (
                            <div>
                                <label className="block text-sm font-medium mb-1.5 text-foreground">
                                    Nome completo *
                                </label>
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        placeholder="O teu nome"
                                        className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                                        autoFocus
                                    />
                                </div>
                            </div>
                        )}

                        {/* Password */}
                        <div>
                            <label className="block text-sm font-medium mb-1.5 text-foreground">
                                {hasAccount ? 'Senha *' : 'Cria uma senha *'}
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder={hasAccount ? 'A tua senha' : 'Mínimo 6 caracteres'}
                                    className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                                    autoFocus={hasAccount}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(p => !p)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        {/* Confirm password (new accounts only) */}
                        {!hasAccount && (
                            <div>
                                <label className="block text-sm font-medium mb-1.5 text-foreground">
                                    Confirmar senha *
                                </label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={confirmPassword}
                                        onChange={e => setConfirmPassword(e.target.value)}
                                        placeholder="Repete a senha"
                                        className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Error */}
                        {formError && (
                            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                {formError}
                            </div>
                        )}

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {submitting ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> A processar…</>
                            ) : hasAccount ? (
                                'Aceitar convite'
                            ) : (
                                'Criar conta e aceitar convite'
                            )}
                        </button>

                        {/* Switch between modes */}
                        <p className="text-center text-xs text-muted-foreground">
                            {hasAccount ? (
                                <>
                                    Não tens conta?{' '}
                                    <button type="button" onClick={() => { setHasAccount(false); setFormError(''); }}
                                        className="text-primary hover:underline font-medium">
                                        Cria uma agora
                                    </button>
                                </>
                            ) : (
                                <>
                                    Já tens conta com este email?{' '}
                                    <button type="button" onClick={() => { setHasAccount(true); setFormError(''); }}
                                        className="text-primary hover:underline font-medium">
                                        Inicia sessão
                                    </button>
                                </>
                            )}
                        </p>
                    </form>
                </div>
            </div>
        </div>
    );
}
