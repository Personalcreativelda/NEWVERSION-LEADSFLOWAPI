// Administração → Cópias de segurança da base de dados (api/src/routes/admin-backups.routes.ts).
// Criar e restaurar correm em segundo plano na API: este ecrã acompanha pelo GET (busy / last).
import { useCallback, useEffect, useRef, useState } from 'react';
import { DatabaseBackup, Download, Loader2, RotateCcw, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { PageAction, PageHeader } from '../../base/PageHeader';
import { AppModal } from '../../base/AppModal';
import { EmptyState } from '../../base/EmptyState';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { useConfirm } from '../../ui/ConfirmDialog';
import { apiRequest, apiUpload } from '../../../utils/api';
import { saveRemoteFile } from '../../../lib/saveFile';

interface Backup {
  name: string;
  size: number;
  created_at: string;
  trigger: 'manual' | 'auto' | 'pre_restore';
  local: boolean;
  offsite: boolean;
}
interface State {
  status: { local: boolean; offsite: boolean; encryption: boolean; keep: number; hour: number };
  busy: string | null;
  last: { op: 'backup' | 'restore'; ok: boolean; at: string; message: string; name?: string } | null;
  backups: Backup[];
}

const TRIGGER: Record<Backup['trigger'], string> = { manual: 'Manual', auto: 'Automática', pre_restore: 'Antes de restaurar' };
const fmtSize = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)} GB` : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const fmtDate = (iso: string) => (iso ? new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
/** Hora UTC da cópia automática → hora local deste aparelho */
const localHour = (utcHour: number) => {
  const d = new Date();
  d.setUTCHours(utcHour, 0, 0, 0);
  return d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-h-[48px] items-center justify-between gap-3 px-4 py-2">
      <span className="text-sm text-foreground">{label}</span>
      <span className="text-right text-sm text-muted-foreground">{value}</span>
    </div>
  );
}

export function AdminBackupsTab() {
  const confirm = useConfirm();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState(false);
  const [restoring, setRestoring] = useState<{ name?: string; file?: File } | null>(null);
  const [phrase, setPhrase] = useState('');
  const [password, setPassword] = useState('');
  const [sending, setSending] = useState(false);
  const [waiting, setWaiting] = useState<'backup' | 'restore' | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const seenLast = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const s: State = await apiRequest('/api/admin/backups');
      setState(s);
      setError(false);
      // Terminou uma operação que estávamos a acompanhar
      if (s.last && s.last.at !== seenLast.current) {
        if (seenLast.current !== null && !s.busy) {
          if (s.last.ok) toast.success(s.last.message); else toast.error(s.last.message);
          setWaiting(null);
        }
        seenLast.current = s.last.at;
      } else if (seenLast.current === null) {
        seenLast.current = s.last?.at || '';
      }
      return s;
    } catch {
      setError(true);
      return null;
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // A decorrer (ou à espera da API reiniciar depois de restaurar): atualiza a cada 3 s
  const active = !!state?.busy || !!waiting;
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => { void load(); }, 3000);
    return () => clearInterval(t);
  }, [active, load]);

  const create = async () => {
    try {
      await apiRequest('/api/admin/backups', 'POST');
      setWaiting('backup');
      setState((s) => (s ? { ...s, busy: 'cópia de segurança' } : s));
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível criar a cópia');
    }
  };

  const download = async (b: Backup) => {
    try {
      const { url } = await apiRequest(`/api/admin/backups/${encodeURIComponent(b.name)}/download`);
      await saveRemoteFile(url, b.name);
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível descarregar');
    }
  };

  const remove = async (b: Backup) => {
    const ok = await confirm(`A cópia de ${fmtDate(b.created_at)} é apagada no servidor e fora dele.`, {
      title: 'Apagar cópia', confirmLabel: 'Apagar', variant: 'danger',
    });
    if (!ok) return;
    try {
      await apiRequest(`/api/admin/backups/${encodeURIComponent(b.name)}`, 'DELETE');
      toast.success('Cópia apagada');
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível apagar');
    }
  };

  const openRestore = (target: { name?: string; file?: File }) => {
    setPhrase('');
    setPassword('');
    setRestoring(target);
  };

  const restore = async () => {
    if (!restoring) return;
    setSending(true);
    try {
      const form = new FormData();
      form.append('confirm', phrase);
      form.append('password', password);
      if (restoring.file) form.append('file', restoring.file);
      else form.append('name', restoring.name || '');
      await apiUpload('/api/admin/backups/restore', form);
      setRestoring(null);
      setWaiting('restore');
      setState((s) => (s ? { ...s, busy: 'restauro' } : s));
      toast.message('A restaurar… a API reinicia no fim.');
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível restaurar');
    } finally {
      setSending(false);
    }
  };

  const busyLabel = state?.busy || (waiting === 'restore' ? 'restauro' : waiting === 'backup' ? 'cópia de segurança' : null);

  return (
    <div>
      <PageHeader
        title="Cópias de segurança"
        description="Base de dados dos clientes"
        icon={DatabaseBackup}
        actions={<PageAction icon={Upload} label="Importar cópia" onClick={() => fileInput.current?.click()} disabled={!!busyLabel} />}
        create={{ label: 'Criar cópia agora', icon: DatabaseBackup, onClick: () => void create(), disabled: !!busyLabel }}
      />
      <input
        ref={fileInput}
        type="file"
        accept=".lfbak"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) openRestore({ file });
        }}
      />

      {!state && !error && <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
      {error && !state && <EmptyState icon={DatabaseBackup} title="Não foi possível carregar" action={<Button onClick={() => void load()}>Tentar de novo</Button>} />}

      {state && (
        <div className="space-y-6">
          {busyLabel && (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 text-sm text-foreground">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              {busyLabel === 'restauro' ? 'A restaurar a base de dados…' : 'A criar a cópia…'}
            </div>
          )}

          <section>
            <h2 className="mb-3 text-base font-semibold text-foreground">Proteção</h2>
            <div className="divide-y divide-border rounded-lg border border-border bg-card">
              <Row label="Cópia automática" value={`Todos os dias às ${localHour(state.status.hour)}`} />
              <Row label="Guardadas" value={`${state.status.keep} automáticas`} />
              <Row label="No servidor" value={state.status.local ? 'Ativo' : 'Desligado'} />
              <Row
                label="Fora do servidor"
                value={state.status.offsite
                  ? <span className="text-emerald-600 dark:text-emerald-400">Ativo</span>
                  : <span className="text-amber-600 dark:text-amber-400">Não configurado</span>}
              />
              <Row label="Cifra" value={state.status.encryption ? 'Ativa' : <span className="text-red-600">Sem chave</span>} />
            </div>
            {!state.status.offsite && (
              <details className="mt-3 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
                <summary className="cursor-pointer text-foreground">Guardar fora do servidor</summary>
                <ol className="mt-3 list-decimal space-y-1.5 pl-5">
                  <li>Crie um bucket num serviço S3 (Cloudflare R2, Backblaze B2 ou AWS S3) e uma chave de acesso.</li>
                  <li>No Coolify (API), defina <code>BACKUP_S3_ENDPOINT</code>, <code>BACKUP_S3_BUCKET</code>, <code>BACKUP_S3_ACCESS_KEY</code> e <code>BACKUP_S3_SECRET_KEY</code>.</li>
                  <li>Guarde a chave de cifra (<code>BACKUP_ENCRYPTION_KEY</code> ou <code>CHANNEL_SECRETS_KEY</code>) fora da VPS: sem ela as cópias não abrem.</li>
                  <li>Até lá, descarregue as cópias para o seu computador.</li>
                </ol>
              </details>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-foreground">Cópias</h2>
            {state.backups.length === 0 ? (
              <EmptyState icon={DatabaseBackup} title="Ainda sem cópias" action={<Button onClick={() => void create()} disabled={!!busyLabel}>Criar cópia agora</Button>} />
            ) : (
              <div className="divide-y divide-border rounded-lg border border-border bg-card">
                {state.backups.map((b) => (
                  <div key={b.name} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{fmtDate(b.created_at)}</p>
                      <p className="text-xs text-muted-foreground">
                        {TRIGGER[b.trigger]} · {fmtSize(b.size)} · {[b.local && 'Servidor', b.offsite && 'Fora do servidor'].filter(Boolean).join(' + ')}
                      </p>
                    </div>
                    <div className="-ml-2 flex shrink-0 items-center gap-1 sm:ml-0">
                      <button type="button" onClick={() => void download(b)} className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Descarregar" title="Descarregar">
                        <Download className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => openRestore({ name: b.name })} disabled={!!busyLabel} className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40" aria-label="Restaurar" title="Restaurar">
                        <RotateCcw className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => void remove(b)} disabled={!!busyLabel} className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-red-600 disabled:opacity-40" aria-label="Apagar" title="Apagar">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <AppModal
        open={!!restoring}
        onOpenChange={(v) => { if (!sending && !v) setRestoring(null); }}
        size="sm"
        title="Restaurar base de dados"
        footer={(
          <>
            <Button variant="outline" onClick={() => setRestoring(null)} disabled={sending}>Cancelar</Button>
            <Button variant="destructive" onClick={() => void restore()} disabled={sending || phrase.trim().toUpperCase() !== 'RESTAURAR'}>
              {sending ? 'A enviar…' : 'Restaurar'}
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          <p className="text-sm text-foreground">
            Todos os dados atuais de todos os clientes são substituídos pelos desta cópia
            {restoring?.file ? <> (<span translate="no">{restoring.file.name}</span>)</> : restoring?.name ? <> de {fmtDate(state?.backups.find((b) => b.name === restoring.name)?.created_at || '')}</> : null}.
            Antes, é feita uma cópia do estado atual.
          </p>
          <div>
            <Label htmlFor="restore-phrase" className="mb-1.5 block">Escreva RESTAURAR</Label>
            <Input id="restore-phrase" value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" />
          </div>
          <div>
            <Label htmlFor="restore-password" className="mb-1.5 block">A sua palavra-passe</Label>
            <Input id="restore-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
        </div>
      </AppModal>
    </div>
  );
}
