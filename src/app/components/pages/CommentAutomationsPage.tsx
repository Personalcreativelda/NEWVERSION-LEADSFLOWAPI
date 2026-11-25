// Respostas a comentários: quem comenta uma publicação do Instagram ou do Facebook recebe uma
// mensagem privada (API oficial da Meta) e entra como lead.
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { MessageCircle, Pencil, Plus } from 'lucide-react';
import { apiRequest } from '../../utils/api';
import { PageHeader } from '../base/PageHeader';
import { EmptyState } from '../base/EmptyState';
import { AppModal } from '../base/AppModal';
import { LogoBox } from '../base/LogoBox';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Textarea } from '../ui/textarea';

interface Channel { id: string; name: string; type: 'instagram' | 'facebook'; status: string }
interface Rule {
  id: string;
  channel_id: string;
  channel_name: string;
  channel_type: 'instagram' | 'facebook';
  name: string;
  enabled: boolean;
  keywords: string[];
  dm_message: string;
  public_reply: string | null;
  tag: string | null;
  sent: number;
}
interface Reply {
  id: string;
  platform: 'instagram' | 'facebook';
  commenter_name: string | null;
  comment_text: string | null;
  status: 'sent' | 'failed' | 'pending';
  error: string | null;
  created_at: string;
}

const emptyForm = { channel_id: '', name: '', keywords: '', dm_message: '', public_reply: '', tag: '', enabled: true };

export default function CommentAutomationsPage() {
  const [loading, setLoading] = useState(true);
  const [publicReplies, setPublicReplies] = useState(false);
  const [rules, setRules] = useState<Rule[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, rep] = await Promise.all([
        apiRequest('/comment-automations', 'GET'),
        apiRequest('/comment-automations/replies', 'GET').catch(() => ({ replies: [] })),
      ]);
      setPublicReplies(r?.public_replies === true);
      setRules(r?.automations || []);
      setChannels(r?.channels || []);
      setReplies(rep?.replies || []);
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível carregar');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm, channel_id: channels[0]?.id || '' });
    setConfirmDelete(false);
    setOpen(true);
  };

  const openEdit = (rule: Rule) => {
    setEditing(rule);
    setForm({
      channel_id: rule.channel_id,
      name: rule.name || '',
      keywords: (rule.keywords || []).join(', '),
      dm_message: rule.dm_message,
      public_reply: rule.public_reply || '',
      tag: rule.tag || '',
      enabled: rule.enabled,
    });
    setConfirmDelete(false);
    setOpen(true);
  };

  const save = async () => {
    if (!form.channel_id || !form.dm_message.trim()) return;
    setSaving(true);
    try {
      const body = { ...form, keywords: form.keywords.split(',').map((w) => w.trim()).filter(Boolean) };
      if (editing) await apiRequest(`/comment-automations/${editing.id}`, 'PUT', body);
      else await apiRequest('/comment-automations', 'POST', body);
      toast.success(editing ? 'Regra guardada' : 'Regra criada');
      setOpen(false);
      void load();
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível guardar');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setSaving(true);
    try {
      await apiRequest(`/comment-automations/${editing.id}`, 'DELETE');
      toast.success('Regra apagada');
      setOpen(false);
      void load();
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível apagar');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (rule: Rule, value: boolean) => {
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled: value } : r)));
    try {
      await apiRequest(`/comment-automations/${rule.id}`, 'PUT', { enabled: value });
    } catch (err: any) {
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled: !value } : r)));
      toast.error(err?.message || 'Não foi possível guardar');
    }
  };

  const modalChannel = channels.find((c) => c.id === form.channel_id);

  return (
    <div className="space-y-6 pb-24">
      <PageHeader
        title="Respostas a comentários"
        description="Quem comenta recebe uma mensagem privada e entra como lead"
        icon={MessageCircle}
        create={channels.length ? { label: 'Nova regra', onClick: openNew, icon: Plus } : undefined}
      />


      {!loading && channels.length === 0 && (
        <EmptyState icon={MessageCircle} title="Ligue o Instagram ou o Facebook" description="Na caixa de entrada → Canais" />
      )}

      {!loading && channels.length > 0 && rules.length === 0 && (
        <EmptyState
          icon={MessageCircle}
          title="Ainda sem regras"
          action={<Button onClick={openNew}>Nova regra</Button>}
        />
      )}

      {rules.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
          {rules.map((rule) => (
            <li key={rule.id} className="flex items-center gap-3 px-4 py-3">
              <LogoBox brand={rule.channel_type} />
              <button type="button" onClick={() => openEdit(rule)} className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-medium text-foreground">
                  {rule.name || (rule.keywords?.length ? rule.keywords.join(', ') : 'Qualquer comentário')}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  <span translate="no">{rule.channel_name}</span>
                  <span className="tabular-nums"> · {rule.sent} {rule.sent === 1 ? 'resposta' : 'respostas'}</span>
                </p>
              </button>
              <button type="button" onClick={() => openEdit(rule)} aria-label="Editar" className="p-2 rounded-lg text-muted-foreground hover:bg-muted transition-colors">
                <Pencil className="h-4 w-4" />
              </button>
              <Switch checked={rule.enabled} onCheckedChange={(v) => void toggle(rule, v)} aria-label="Ativa" />
            </li>
          ))}
        </ul>
      )}

      {replies.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-foreground">Últimas respostas</h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
            {replies.slice(0, 20).map((r) => (
              <li key={r.id} className="flex items-start gap-3 px-4 py-3">
                <LogoBox brand={r.platform} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground" translate="no">{r.commenter_name || 'Sem nome'}</p>
                  {r.comment_text && <p className="truncate text-xs text-muted-foreground" translate="no">{r.comment_text}</p>}
                  {r.status === 'failed' && r.error && <p className="mt-0.5 text-xs text-red-600 dark:text-red-400">{r.error}</p>}
                </div>
                <span className={`flex-shrink-0 text-xs ${r.status === 'failed' ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
                  {r.status === 'sent' ? 'Enviada' : r.status === 'failed' ? 'Falhou' : 'A enviar'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <AppModal
        open={open}
        onOpenChange={(v) => { if (!saving) setOpen(v); }}
        size="md"
        title={editing ? 'Editar regra' : 'Nova regra'}
        logo={modalChannel ? <LogoBox brand={modalChannel.type} /> : undefined}
        footer={(
          <>
            {editing && (
              <Button variant="outline" onClick={remove} disabled={saving} className="sm:mr-auto text-red-600 dark:text-red-400">
                {confirmDelete ? 'Confirmar' : 'Apagar'}
              </Button>
            )}
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={save} disabled={saving || !form.channel_id || !form.dm_message.trim()}>
              {saving ? 'A guardar…' : 'Guardar'}
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="ca-channel" className="mb-1.5 block">Canal</Label>
            <select
              id="ca-channel"
              value={form.channel_id}
              onChange={(e) => setForm({ ...form, channel_id: e.target.value })}
              className="w-full text-sm"
            >
              {channels.map((c) => (
                <option key={c.id} value={c.id}>{c.type === 'instagram' ? 'Instagram' : 'Facebook'} · {c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="ca-keywords" className="mb-1.5 block">Palavras no comentário</Label>
            <Input
              id="ca-keywords"
              value={form.keywords}
              onChange={(e) => setForm({ ...form, keywords: e.target.value })}
              placeholder="preço, quero, info (vazio = qualquer comentário)"
            />
          </div>

          <div>
            <Label htmlFor="ca-dm" className="mb-1.5 block">Mensagem privada</Label>
            <Textarea
              id="ca-dm"
              rows={4}
              maxLength={1000}
              value={form.dm_message}
              onChange={(e) => setForm({ ...form, dm_message: e.target.value })}
              placeholder="Olá {{nome}}, obrigado pelo comentário. Envio-lhe aqui os detalhes…"
            />
          </div>

          {publicReplies && (
          <div>
            <Label htmlFor="ca-public" className="mb-1.5 block">Resposta pública (opcional)</Label>
            <Input
              id="ca-public"
              maxLength={1000}
              value={form.public_reply}
              onChange={(e) => setForm({ ...form, public_reply: e.target.value })}
              placeholder="Enviámos-lhe uma mensagem privada"
            />
          </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="ca-name" className="mb-1.5 block">Nome (opcional)</Label>
              <Input id="ca-name" maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="ca-tag" className="mb-1.5 block">Etiqueta do lead (opcional)</Label>
              <Input id="ca-tag" maxLength={60} value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} placeholder="promo-novembro" />
            </div>
          </div>

          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <span className="text-sm text-foreground">Ativa</span>
            <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
          </label>
        </div>
      </AppModal>
    </div>
  );
}
