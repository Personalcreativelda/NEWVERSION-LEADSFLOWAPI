import React, { useState, useEffect } from 'react';
import { teamApi } from '../../../services/api/inbox';
import type { TeamMember } from '../../../types/inbox';
import { UserCheck, UserPlus, Trash2, Pencil, X, Check, Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';

const ROLE_LABELS: Record<string, string> = {
    agent: 'Agente',
    supervisor: 'Supervisor',
    admin: 'Admin',
};

const ROLE_COLORS: Record<string, string> = {
    agent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    supervisor: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
    admin: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};

interface AddMemberForm {
    name: string;
    email: string;
    role: string;
    team: string;
}

const emptyForm: AddMemberForm = { name: '', email: '', role: 'agent', team: '' };

export default function InboxTeam() {
    const [members, setMembers] = useState<TeamMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [form, setForm] = useState<AddMemberForm>(emptyForm);
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Partial<AddMemberForm>>({});
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const load = () => {
        setLoading(true);
        teamApi.getMembers().then(setMembers).catch(() => toast.error('Erro ao carregar membros')).finally(() => setLoading(false));
    };

    useEffect(() => { load(); }, []);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name.trim() || !form.email.trim()) return;
        setSaving(true);
        try {
            const m = await teamApi.addMember(form);
            setMembers(prev => [...prev, m]);
            setForm(emptyForm);
            setShowAdd(false);
            toast.success('Membro adicionado');
        } catch { toast.error('Erro ao adicionar membro'); }
        setSaving(false);
    };

    const handleEdit = async (id: string) => {
        setSaving(true);
        try {
            const m = await teamApi.updateMember(id, editForm);
            setMembers(prev => prev.map(x => x.id === id ? { ...x, ...m } : x));
            setEditingId(null);
            toast.success('Membro atualizado');
        } catch { toast.error('Erro ao atualizar membro'); }
        setSaving(false);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Remover este membro da equipa?')) return;
        setDeletingId(id);
        try {
            await teamApi.removeMember(id);
            setMembers(prev => prev.filter(x => x.id !== id));
            toast.success('Membro removido');
        } catch { toast.error('Erro ao remover membro'); }
        setDeletingId(null);
    };

    const getInitials = (name: string) => name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();

    return (
        <div className="p-6 max-w-3xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center">
                        <Users className="w-5 h-5 text-violet-500" />
                    </div>
                    <div>
                        <h1 className="text-lg font-semibold text-foreground">Equipa da Inbox</h1>
                        <p className="text-sm text-muted-foreground">{members.length} membro{members.length !== 1 ? 's' : ''}</p>
                    </div>
                </div>
                <button
                    onClick={() => setShowAdd(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
                >
                    <UserPlus className="w-4 h-4" />
                    Adicionar Membro
                </button>
            </div>

            {/* Add member form */}
            {showAdd && (
                <form onSubmit={handleAdd} className="mb-6 rounded-xl border border-border bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-foreground">Novo Membro</h2>
                        <button type="button" onClick={() => { setShowAdd(false); setForm(emptyForm); }} className="text-muted-foreground hover:text-foreground">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <input
                            required
                            type="text"
                            placeholder="Nome"
                            value={form.name}
                            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                            className="px-3 py-2 rounded-lg text-sm border border-border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                        />
                        <input
                            required
                            type="email"
                            placeholder="Email"
                            value={form.email}
                            onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                            className="px-3 py-2 rounded-lg text-sm border border-border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                        />
                        <select
                            value={form.role}
                            onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                            className="px-3 py-2 rounded-lg text-sm border border-border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                        >
                            <option value="agent">Agente</option>
                            <option value="supervisor">Supervisor</option>
                            <option value="admin">Admin</option>
                        </select>
                        <input
                            type="text"
                            placeholder="Equipa (opcional)"
                            value={form.team}
                            onChange={e => setForm(p => ({ ...p, team: e.target.value }))}
                            className="px-3 py-2 rounded-lg text-sm border border-border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                        />
                    </div>
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => { setShowAdd(false); setForm(emptyForm); }} className="px-4 py-2 rounded-lg text-sm border border-border text-foreground hover:bg-muted/50">
                            Cancelar
                        </button>
                        <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground disabled:opacity-50 flex items-center gap-1.5">
                            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            Guardar
                        </button>
                    </div>
                </form>
            )}

            {/* Members list */}
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            ) : members.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                    <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                        <Users className="w-7 h-7 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">Nenhum membro adicionado ainda.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {members.map(m => (
                        <div key={m.id} className="rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-3">
                            {/* Avatar */}
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                                {getInitials(m.name || m.email)}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                {editingId === m.id ? (
                                    <div className="flex gap-2 flex-wrap">
                                        <input
                                            type="text"
                                            defaultValue={m.name}
                                            onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                                            placeholder="Nome"
                                            className="px-2 py-1 rounded text-sm border border-border bg-background text-foreground outline-none w-32"
                                        />
                                        <select
                                            defaultValue={m.role || 'agent'}
                                            onChange={e => setEditForm(p => ({ ...p, role: e.target.value }))}
                                            className="px-2 py-1 rounded text-sm border border-border bg-background text-foreground outline-none"
                                        >
                                            <option value="agent">Agente</option>
                                            <option value="supervisor">Supervisor</option>
                                            <option value="admin">Admin</option>
                                        </select>
                                        <input
                                            type="text"
                                            defaultValue={m.team || ''}
                                            onChange={e => setEditForm(p => ({ ...p, team: e.target.value }))}
                                            placeholder="Equipa"
                                            className="px-2 py-1 rounded text-sm border border-border bg-background text-foreground outline-none w-28"
                                        />
                                    </div>
                                ) : (
                                    <>
                                        <p className="text-sm font-medium text-foreground truncate">{m.name || '—'}</p>
                                        <p className="text-[12px] text-muted-foreground truncate">{m.email}</p>
                                    </>
                                )}
                            </div>

                            {/* Badges */}
                            {editingId !== m.id && (
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                    {m.role && (
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${ROLE_COLORS[m.role] || 'bg-muted text-muted-foreground'}`}>
                                            {ROLE_LABELS[m.role] || m.role}
                                        </span>
                                    )}
                                    {m.team && (
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
                                            {m.team}
                                        </span>
                                    )}
                                    {typeof (m as any).open_conversations === 'number' && (
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                            {(m as any).open_conversations} abertas
                                        </span>
                                    )}
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex items-center gap-1 flex-shrink-0">
                                {editingId === m.id ? (
                                    <>
                                        <button
                                            onClick={() => handleEdit(m.id)}
                                            disabled={saving}
                                            className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                                        >
                                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                        </button>
                                        <button onClick={() => setEditingId(null)} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted">
                                            <X className="w-4 h-4" />
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button
                                            onClick={() => { setEditingId(m.id); setEditForm({ name: m.name, role: m.role, team: m.team }); }}
                                            className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                                        >
                                            <Pencil className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(m.id)}
                                            disabled={deletingId === m.id}
                                            className="p-1.5 rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 disabled:opacity-50"
                                        >
                                            {deletingId === m.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
