import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    Users, UserPlus, Mail, Shield, Trash2, RefreshCw,
    Check, X, Crown, ChevronDown, Loader2, AlertCircle,
    MessageSquare, Clock, UserCheck, Copy, ExternalLink
} from 'lucide-react';
import { apiRequest } from '../../utils/api';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TeamMember {
    id: string;
    user_id: string | null;
    email: string;
    name: string;
    role: 'owner' | 'admin' | 'manager' | 'agent' | 'viewer';
    status: 'active' | 'pending' | 'inactive';
    is_active: boolean;
    open_conversations: number;
    user_email?: string;
    user_name?: string;
    user_avatar?: string;
    accepted_at?: string;
    joined_at?: string;
    invited_at: string;
}

interface WorkspaceInvite {
    id: string;
    email: string;
    role: string;
    status: 'pending' | 'accepted' | 'expired' | 'revoked';
    invited_by_name?: string;
    expires_at: string;
    created_at: string;
    invite_url?: string;
}

interface WorkspaceInfo {
    id: string;
    name: string;
    owner_email: string;
    owner_name: string;
    current_user_role: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLES: { value: string; label: string; description: string }[] = [
    { value: 'admin',   label: 'Admin',    description: 'Acesso total, pode gerir membros' },
    { value: 'manager', label: 'Manager',  description: 'Vê todas as conversas, pode atribuir' },
    { value: 'agent',   label: 'Agente',   description: 'Vê as suas conversas e não atribuídas' },
    { value: 'viewer',  label: 'Viewer',   description: 'Apenas leitura, não pode responder' },
];

const ROLE_COLORS: Record<string, string> = {
    owner:   'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    admin:   'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    manager: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    agent:   'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    viewer:  'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
};

const ROLE_LABELS: Record<string, string> = {
    owner: 'Owner', admin: 'Admin', manager: 'Manager', agent: 'Agente', viewer: 'Viewer',
};

function getInitials(name: string): string {
    return (name || '?')
        .split(' ')
        .map(w => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
}

// ── Invite Modal ──────────────────────────────────────────────────────────────

function InviteModal({
    onClose,
    onInvited,
}: {
    onClose: () => void;
    onInvited: (member: TeamMember & { invite_url?: string }) => void;
}) {
    const [email, setEmail] = useState('');
    const [name, setName]   = useState('');
    const [role, setRole]   = useState('agent');
    const [loading, setLoading] = useState(false);
    const [error, setError]     = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!email.trim() || !name.trim()) {
            setError('Email e nome são obrigatórios');
            return;
        }
        setLoading(true);
        try {
            const result = await apiRequest('/team/members', 'POST', {
                email: email.trim().toLowerCase(),
                name:  name.trim(),
                role,
            });
            onInvited(result);
            onClose();
        } catch (err: any) {
            setError(err.message || 'Erro ao convidar membro');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60" onClick={onClose} />
            <div className="relative w-full max-w-md bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                    <h2 className="text-base font-semibold flex items-center gap-2">
                        <UserPlus size={16} className="text-primary" />
                        Convidar membro
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-muted/50 rounded">
                        <X size={18} className="text-muted-foreground" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1.5">Nome *</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="Nome do atendente"
                            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/30"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1.5">Email *</label>
                        <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="atendente@empresa.com"
                            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/30"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1.5">Papel</label>
                        <div className="space-y-2">
                            {ROLES.map(r => (
                                <label
                                    key={r.value}
                                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                        role === r.value
                                            ? 'border-primary bg-primary/5'
                                            : 'border-border hover:bg-muted/40'
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="role"
                                        value={r.value}
                                        checked={role === r.value}
                                        onChange={() => setRole(r.value)}
                                        className="mt-0.5"
                                    />
                                    <div>
                                        <p className="text-sm font-medium">{r.label}</p>
                                        <p className="text-xs text-muted-foreground">{r.description}</p>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                            <AlertCircle size={14} />
                            {error}
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted/50 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                            {loading ? 'Enviando...' : 'Enviar convite'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ── Role Selector Dropdown ────────────────────────────────────────────────────

function RoleSelector({
    memberId,
    currentRole,
    onChanged,
    disabled,
}: {
    memberId: string;
    currentRole: string;
    onChanged: (newRole: string) => void;
    disabled?: boolean;
}) {
    const [open, setOpen]       = useState(false);
    const [loading, setLoading] = useState(false);
    const [pos, setPos]         = useState({ top: 0, left: 0 });
    const buttonRef             = useRef<HTMLButtonElement>(null);

    const handleOpen = () => {
        if (disabled || loading) return;
        if (!open && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setPos({ top: rect.bottom + 4, left: rect.left });
        }
        setOpen(o => !o);
    };

    const handleSelect = async (newRole: string) => {
        if (newRole === currentRole) { setOpen(false); return; }
        setLoading(true);
        try {
            await apiRequest(`/team/members/${memberId}`, 'PATCH', { role: newRole });
            onChanged(newRole);
            toast.success('Papel atualizado');
        } catch (err: any) {
            toast.error(err.message || 'Erro ao atualizar papel');
        } finally {
            setLoading(false);
            setOpen(false);
        }
    };

    return (
        <div className="relative">
            <button
                ref={buttonRef}
                onClick={handleOpen}
                disabled={disabled || loading}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                    ROLE_COLORS[currentRole] || ROLE_COLORS.viewer
                } ${!disabled ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
            >
                {loading ? <Loader2 size={10} className="animate-spin" /> : null}
                {ROLE_LABELS[currentRole] || currentRole}
                {!disabled && <ChevronDown size={10} />}
            </button>

            {open && createPortal(
                <>
                    <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
                    <div
                        className="fixed z-[9999] bg-card border border-border rounded-lg shadow-xl py-1 min-w-[160px]"
                        style={{ top: pos.top, left: pos.left }}
                    >
                        {ROLES.map(r => (
                            <button
                                key={r.value}
                                onClick={() => handleSelect(r.value)}
                                className="w-full px-3 py-2 text-left text-xs hover:bg-muted/50 flex items-center justify-between gap-4"
                            >
                                <span className={`font-medium px-1.5 py-0.5 rounded ${ROLE_COLORS[r.value] || ROLE_COLORS.viewer}`}>
                                    {r.label}
                                </span>
                                {r.value === currentRole && <Check size={12} className="text-primary flex-shrink-0" />}
                            </button>
                        ))}
                    </div>
                </>,
                document.body
            )}
        </div>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface TeamSettingsPageProps {
    currentUser: any;
}

export function TeamSettingsPage({ currentUser }: TeamSettingsPageProps) {
    const [workspace, setWorkspace]   = useState<WorkspaceInfo | null>(null);
    const [members, setMembers]       = useState<TeamMember[]>([]);
    const [invites, setInvites]       = useState<WorkspaceInvite[]>([]);
    const [loading, setLoading]       = useState(true);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [lastInviteUrl, setLastInviteUrl]     = useState<string | null>(null);
    const [lastEmailSent, setLastEmailSent]     = useState<boolean | null>(null);

    const isOwnerOrAdmin = workspace
        ? ['owner', 'admin'].includes(workspace.current_user_role)
        : false;

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const [wsData, membersData, invitesData] = await Promise.all([
                apiRequest('/team/workspace'),
                apiRequest('/team/members'),
                apiRequest('/team/invites'),
            ]);
            setWorkspace(wsData);
            setMembers(Array.isArray(membersData) ? membersData : []);
            setInvites(Array.isArray(invitesData) ? invitesData : []);
        } catch (err: any) {
            toast.error(err.message || 'Erro ao carregar dados da equipa');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    const handleInvited = (member: TeamMember & { invite_url?: string; email_sent?: boolean; email_source?: string }) => {
        setMembers(prev => {
            const exists = prev.find(m => m.id === member.id);
            return exists ? prev.map(m => m.id === member.id ? member : m) : [...prev, member];
        });
        if (member.invite_url) {
            setLastInviteUrl(member.invite_url);
            setLastEmailSent(member.email_sent ?? false);
        }
        if (member.email_sent) {
            const sourceLabel = member.email_source === 'channel' ? ' (canal de email)' : member.email_source === 'smtp_settings' ? ' (SMTP)' : '';
            toast.success(`Email de convite enviado para ${member.email}${sourceLabel}!`);
        } else {
            toast.warning(
                `Membro adicionado! Sem SMTP configurado — email não enviado. Partilha o link manualmente.`,
                { duration: 8000 }
            );
        }
        fetchAll();
    };

    const handleRoleChanged = (memberId: string, newRole: string) => {
        setMembers(prev =>
            prev.map(m => m.id === memberId ? { ...m, role: newRole as any } : m)
        );
    };

    const handleToggleActive = async (member: TeamMember) => {
        try {
            await apiRequest(`/team/members/${member.id}`, 'PATCH', {
                is_active: !member.is_active,
            });
            setMembers(prev =>
                prev.map(m => m.id === member.id ? { ...m, is_active: !m.is_active } : m)
            );
            toast.success(member.is_active ? 'Membro desactivado' : 'Membro reactivado');
        } catch (err: any) {
            toast.error(err.message || 'Erro ao actualizar membro');
        }
    };

    const handleRemove = async (member: TeamMember) => {
        if (!confirm(`Remover ${member.name} da equipa?`)) return;
        try {
            await apiRequest(`/team/members/${member.id}`, 'DELETE');
            setMembers(prev => prev.filter(m => m.id !== member.id));
            toast.success('Membro removido');
        } catch (err: any) {
            toast.error(err.message || 'Erro ao remover membro');
        }
    };

    const handleResendInvite = async (invite: WorkspaceInvite) => {
        try {
            const result = await apiRequest(`/team/invites/${invite.id}/resend`, 'POST');
            if (result.invite_url) { setLastInviteUrl(result.invite_url); setLastEmailSent(result.email_sent ?? false); }
            if (result.email_sent) {
                toast.success('Email de convite reenviado!');
            } else {
                toast.warning('Convite renovado! Sem SMTP — partilha o link manualmente.', { duration: 6000 });
            }
        } catch (err: any) {
            toast.error(err.message || 'Erro ao reenviar convite');
        }
    };

    const handleRevokeInvite = async (invite: WorkspaceInvite) => {
        if (!confirm(`Revogar convite de ${invite.email}?`)) return;
        try {
            await apiRequest(`/team/invites/${invite.id}`, 'DELETE');
            setInvites(prev => prev.filter(i => i.id !== invite.id));
            toast.success('Convite revogado');
        } catch (err: any) {
            toast.error(err.message || 'Erro ao revogar convite');
        }
    };

    const copyInviteUrl = (url: string) => {
        navigator.clipboard.writeText(url).then(() => toast.success('Link copiado!'));
    };

    const pendingInvites = invites.filter(i => i.status === 'pending');

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 size={28} className="animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Workspace header */}
            {workspace && (
                <div className="rounded-xl border border-border bg-card p-5 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Users size={22} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">{workspace.name}</h3>
                        <p className="text-sm text-muted-foreground">
                            {members.length} membro{members.length !== 1 ? 's' : ''} ·{' '}
                            {pendingInvites.length} convite{pendingInvites.length !== 1 ? 's' : ''} pendente{pendingInvites.length !== 1 ? 's' : ''}
                        </p>
                    </div>
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                        ROLE_COLORS[workspace.current_user_role] || ROLE_COLORS.viewer
                    }`}>
                        {ROLE_LABELS[workspace.current_user_role] || workspace.current_user_role}
                    </span>
                </div>
            )}

            {/* Last invite URL copy banner */}
            {lastInviteUrl && (
                <div className={`rounded-xl border p-4 ${
                    lastEmailSent
                        ? 'border-green-500/20 bg-green-500/5'
                        : 'border-amber-500/30 bg-amber-500/5'
                }`}>
                    <div className="flex items-start gap-3">
                        <ExternalLink size={16} className={`flex-shrink-0 mt-0.5 ${lastEmailSent ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`} />
                        <div className="flex-1 min-w-0">
                            {lastEmailSent ? (
                                <p className="text-sm font-medium text-green-700 dark:text-green-400">Email enviado! Link de convite (para partilhar também):</p>
                            ) : (
                                <div>
                                    <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Email não enviado — SMTP não configurado</p>
                                    <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
                                        Partilha este link diretamente com o convidado. Para envio automático, conecta um <strong>canal de email</strong> ou configura o SMTP em <strong>Integrações → Configurações SMTP</strong>.
                                    </p>
                                </div>
                            )}
                            <p className="text-xs text-muted-foreground truncate mt-1 font-mono">{lastInviteUrl}</p>
                        </div>
                        <button
                            onClick={() => copyInviteUrl(lastInviteUrl)}
                            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90"
                        >
                            <Copy size={12} />
                            Copiar
                        </button>
                        <button onClick={() => setLastInviteUrl(null)} className="p-1 hover:bg-muted/50 rounded">
                            <X size={14} className="text-muted-foreground" />
                        </button>
                    </div>
                </div>
            )}

            {/* Members section */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                    <h3 className="font-semibold text-sm">Membros da equipa</h3>
                    {isOwnerOrAdmin && (
                        <button
                            onClick={() => setShowInviteModal(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                        >
                            <UserPlus size={13} />
                            Convidar
                        </button>
                    )}
                </div>

                {members.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground text-sm">
                        Nenhum membro ainda. Convida a tua equipa!
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {members.map(member => {
                            const displayName   = member.user_name || member.name;
                            const displayEmail  = member.user_email || member.email;
                            const displayAvatar = member.user_avatar;
                            const isSelf        = member.user_id === currentUser?.id;
                            const isOwner       = member.role === 'owner';
                            const isPending     = member.status === 'pending';

                            return (
                                <div key={member.id} className={`flex items-center gap-3 px-5 py-3.5 ${!member.is_active ? 'opacity-50' : ''}`}>
                                    {/* Avatar */}
                                    <div className="w-9 h-9 rounded-full flex-shrink-0 overflow-hidden bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center">
                                        {displayAvatar ? (
                                            <img src={displayAvatar} alt={displayName} className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="text-white text-xs font-semibold">{getInitials(displayName)}</span>
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-medium truncate">{displayName}</span>
                                            {isSelf && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">Você</span>}
                                            {isPending && (
                                                <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 py-0.5 rounded">
                                                    <Clock size={9} />
                                                    Pendente
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground truncate">{displayEmail}</p>
                                    </div>

                                    {/* Conversations badge */}
                                    {!isPending && (
                                        <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                                            <MessageSquare size={11} />
                                            <span>{member.open_conversations || 0}</span>
                                        </div>
                                    )}

                                    {/* Role */}
                                    {isOwner || !isOwnerOrAdmin || isSelf ? (
                                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${ROLE_COLORS[member.role] || ROLE_COLORS.viewer}`}>
                                            {isOwner && <Crown size={10} className="inline mr-0.5" />}
                                            {ROLE_LABELS[member.role] || member.role}
                                        </span>
                                    ) : (
                                        <RoleSelector
                                            memberId={member.id}
                                            currentRole={member.role}
                                            onChanged={newRole => handleRoleChanged(member.id, newRole)}
                                        />
                                    )}

                                    {/* Actions */}
                                    {isOwnerOrAdmin && !isOwner && !isSelf && (
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            <button
                                                onClick={() => handleToggleActive(member)}
                                                title={member.is_active ? 'Desactivar' : 'Reactivar'}
                                                className="p-1.5 rounded hover:bg-muted/50 text-muted-foreground transition-colors"
                                            >
                                                {member.is_active ? <UserCheck size={14} /> : <Shield size={14} />}
                                            </button>
                                            <button
                                                onClick={() => handleRemove(member)}
                                                title="Remover"
                                                className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Pending invites section */}
            {isOwnerOrAdmin && pendingInvites.length > 0 && (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                        <h3 className="font-semibold text-sm flex items-center gap-2">
                            <Mail size={14} className="text-amber-500" />
                            Convites pendentes
                            <span className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                {pendingInvites.length}
                            </span>
                        </h3>
                    </div>
                    <div className="divide-y divide-border">
                        {pendingInvites.map(invite => {
                            const expiresAt  = new Date(invite.expires_at);
                            const isExpiring = expiresAt.getTime() - Date.now() < 24 * 60 * 60 * 1000;
                            return (
                                <div key={invite.id} className="flex items-center gap-3 px-5 py-3.5">
                                    <div className="w-9 h-9 rounded-full flex-shrink-0 bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                                        <Mail size={14} className="text-amber-600 dark:text-amber-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{invite.email}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {ROLE_LABELS[invite.role] || invite.role} ·{' '}
                                            {isExpiring
                                                ? <span className="text-amber-600">Expira em breve</span>
                                                : `Expira ${expiresAt.toLocaleDateString('pt', { day: '2-digit', month: 'short' })}`}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        <button
                                            onClick={() => handleResendInvite(invite)}
                                            title="Reenviar convite"
                                            className="p-1.5 rounded hover:bg-muted/50 text-muted-foreground transition-colors"
                                        >
                                            <RefreshCw size={13} />
                                        </button>
                                        <button
                                            onClick={() => handleRevokeInvite(invite)}
                                            title="Revogar convite"
                                            className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                        >
                                            <X size={13} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Role legend */}
            <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="font-semibold text-sm mb-3">Permissões por papel</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                        { role: 'owner',   perms: ['Todas as conversas', 'Gestão de membros', 'Configurações do workspace', 'Faturação'] },
                        { role: 'admin',   perms: ['Todas as conversas', 'Gestão de membros', 'Atribuição de conversas', 'Relatórios'] },
                        { role: 'manager', perms: ['Todas as conversas', 'Atribuição de conversas', 'Relatórios da equipa'] },
                        { role: 'agent',   perms: ['Conversas atribuídas', 'Conversas não atribuídas', 'Notas internas'] },
                        { role: 'viewer',  perms: ['Visualização apenas', 'Sem resposta nem atribuição'] },
                    ].map(({ role, perms }) => (
                        <div key={role} className="space-y-1">
                            <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${ROLE_COLORS[role]}`}>
                                {ROLE_LABELS[role]}
                            </span>
                            <ul className="space-y-0.5">
                                {perms.map(p => (
                                    <li key={p} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <Check size={10} className="text-green-500 flex-shrink-0" />
                                        {p}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </div>

            {showInviteModal && (
                <InviteModal
                    onClose={() => setShowInviteModal(false)}
                    onInvited={handleInvited}
                />
            )}
        </div>
    );
}
