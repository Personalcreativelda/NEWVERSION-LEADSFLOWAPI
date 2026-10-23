// Ligar Facebook Messenger e Instagram com um toque: abre o login da Meta, e no regresso
// mostra as páginas/contas da pessoa para escolher. Sem tokens nem URLs para copiar.
import { useEffect, useState } from 'react';
import { Browser } from '@capacitor/browser';
import { Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { AppModal } from '../../base/AppModal';
import { BrandIcon } from '../../base/BrandIcon';
import { isNativeApp } from '../../../../native';
import { instagramOAuthApi, metaOAuthApi, whatsappSignupApi, type InstagramLoginAccount, type MetaConnectResult, type MetaOAuthPage } from '../../../services/api/inbox';

export type MetaProduct = 'facebook' | 'instagram';

/**
 * Abre o login da Meta. Devolve false quando a ligação automática ainda não está
 * configurada no servidor (o app usa então o formulário manual).
 */
export async function startMetaConnect(product: MetaProduct): Promise<boolean> {
  try {
    const native = isNativeApp();
    const url = await metaOAuthApi.start(native ? 'app' : 'web');
    if (native) await Browser.open({ url, presentationStyle: 'popover' });
    else window.location.assign(url);
    return true;
  } catch (err: any) {
    if (err?.response?.data?.code === 'meta_not_configured') return false;
    toast.error(err?.message || 'Não foi possível abrir o login do Facebook');
    return true;
  }
}

/**
 * Instagram com o login do próprio Instagram (sem página do Facebook). Sem esse login
 * configurado no servidor, usa o login do Facebook (Instagram associado à página).
 * Devolve false quando nenhum dos dois está configurado (o app usa o formulário manual).
 */
export async function startInstagramConnect(): Promise<boolean> {
  try {
    const native = isNativeApp();
    const url = await instagramOAuthApi.start(native ? 'app' : 'web');
    if (native) await Browser.open({ url, presentationStyle: 'popover' });
    else window.location.assign(url);
    return true;
  } catch (err: any) {
    if (err?.response?.data?.code === 'ig_not_configured') return startMetaConnect('instagram');
    toast.error(err?.message || 'Não foi possível abrir o login do Instagram');
    return true;
  }
}

/**
 * WhatsApp Business oficial (Embedded Signup): abre a página da LeadsFlow com o login da Meta.
 * Devolve false quando ainda não está configurado no servidor (o app usa o formulário manual).
 */
export async function startWhatsAppConnect(): Promise<boolean> {
  try {
    const native = isNativeApp();
    const url = await whatsappSignupApi.start(native ? 'app' : 'web');
    if (native) await Browser.open({ url, presentationStyle: 'popover' });
    else window.location.assign(url);
    return true;
  } catch (err: any) {
    if (err?.response?.data?.code === 'wa_not_configured') return false;
    toast.error(err?.message || 'Não foi possível abrir a ligação do WhatsApp');
    return true;
  }
}

const ERRORS: Record<string, string> = {
  cancelled: 'A ligação foi cancelada.',
  no_pages: 'Esta conta do Facebook não gere nenhuma página. Crie ou peça acesso a uma página e tente de novo.',
  invalid_state: 'O pedido expirou. Toque em "Ligar" de novo.',
  exchange_failed: 'O Facebook não confirmou a autorização. Tente de novo.',
  ig_exchange_failed: 'O Instagram não confirmou a autorização. Tente de novo.',
  ig_not_professional: 'Esta conta do Instagram é pessoal. Mude para uma conta profissional (Empresa ou Criador de conteúdo) nas definições do Instagram e tente de novo.',
  ig_not_tester: 'Enquanto a app está em testes, só ligam contas do Instagram adicionadas como testadoras. Adicione a conta em Funções do app → Testadores do Instagram e aceite o convite no Instagram.',
};

/** Lê o regresso do Facebook/WhatsApp do URL (?meta_session, ?meta_error, ?wa_connected) e limpa-o */
export function readMetaReturn(): { session?: string; error?: string; whatsapp?: string } | null {
  const params = new URLSearchParams(window.location.search);
  const session = params.get('meta_session') || undefined;
  const error = params.get('meta_error') || undefined;
  const whatsapp = params.get('wa_connected') || undefined;
  if (!session && !error && !whatsapp) return null;
  params.delete('meta_session');
  params.delete('meta_error');
  params.delete('wa_connected');
  const qs = params.toString();
  window.history.replaceState(window.history.state, '', window.location.pathname + (qs ? `?${qs}` : ''));
  if (error) return { error: ERRORS[error] || 'Não foi possível ligar ao Facebook. Tente de novo.' };
  if (whatsapp) return { whatsapp };
  return { session };
}

function Avatar({ src, brand }: { src: string | null; brand: 'messenger' | 'instagram' }) {
  return (
    <span className="relative flex h-10 w-10 flex-shrink-0">
      {src ? <img src={src} alt="" className="h-10 w-10 rounded-full object-cover" /> : <span className="h-10 w-10 rounded-full bg-muted" />}
      <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-card ring-2 ring-card">
        <BrandIcon brand={brand} className="h-3.5 w-3.5" />
      </span>
    </span>
  );
}

function Row({ selected, onToggle, title, subtitle, picture, brand, connected }: {
  selected: boolean; onToggle: () => void; title: string; subtitle: string;
  picture: string | null; brand: 'messenger' | 'instagram'; connected: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className="flex w-full min-h-[60px] items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted/60 active:bg-muted"
    >
      <Avatar src={picture} brand={brand} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-foreground">{title}</span>
        <span className="block text-xs text-muted-foreground">{connected ? `${subtitle} · já ligado` : subtitle}</span>
      </span>
      <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border ${selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>
        {selected && <Check className="h-4 w-4" />}
      </span>
    </button>
  );
}

/** Escolher as páginas (Messenger) e contas do Instagram a ligar */
export function MetaPagesSheet({ sessionId, onClose, onConnected }: {
  sessionId: string | null;
  onClose: () => void;
  onConnected: (result: MetaConnectResult) => void;
}) {
  const [pages, setPages] = useState<MetaOAuthPage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selPages, setSelPages] = useState<Set<string>>(new Set());
  const [selIg, setSelIg] = useState<Set<string>>(new Set());
  const [accounts, setAccounts] = useState<InstagramLoginAccount[]>([]);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<MetaConnectResult['failed']>([]);

  useEffect(() => {
    if (!sessionId) return;
    setPages(null);
    setError(null);
    setFailed([]);
    // Nada vem marcado: a pessoa escolhe o que quer ligar
    setSelPages(new Set());
    setSelIg(new Set());
    metaOAuthApi.getSession(sessionId)
      .then((session) => {
        setPages(session.pages);
        setAccounts(session.instagram_accounts);
      })
      .catch((err) => setError(err?.message || 'A autorização expirou. Toque em "Ligar" de novo.'));
  }, [sessionId]);

  const toggle = (set: Set<string>, id: string, update: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    update(next);
  };

  const total = selPages.size + selIg.size;

  const connect = async () => {
    if (!sessionId || !total) return;
    setSaving(true);
    setFailed([]);
    try {
      const result = await metaOAuthApi.connect(sessionId, { pages: [...selPages], instagram: [...selIg] });
      setFailed(result.failed);
      onConnected(result);
    } catch (err: any) {
      const data = err?.response?.data;
      if (data?.failed?.length) setFailed(data.failed);
      else setError(err?.message || 'Não foi possível ligar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal
      open={!!sessionId}
      onOpenChange={(open) => !open && onClose()}
      size="md"
      title="Escolha o que quer ligar"
      description="As mensagens destas páginas e contas passam a chegar à caixa de entrada."
      footer={
        pages && (pages.length > 0 || accounts.length > 0) ? (
          <>
            <button type="button" onClick={onClose} className="h-10 rounded-lg border border-border px-4 text-sm font-medium text-foreground hover:bg-muted">
              Cancelar
            </button>
            <button
              type="button"
              onClick={connect}
              disabled={!total || saving}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {total ? `Ligar (${total})` : 'Ligar'}
            </button>
          </>
        ) : undefined
      }
    >
      {error ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{error}</p>
      ) : !pages ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> A carregar as suas contas…
        </div>
      ) : (
        <div className="-mx-2 space-y-1">
          {pages.map((p) => (
            <div key={p.id}>
              <Row
                selected={selPages.has(p.id)}
                onToggle={() => toggle(selPages, p.id, setSelPages)}
                title={p.name}
                subtitle="Facebook Messenger"
                picture={p.picture}
                brand="messenger"
                connected={p.connected}
              />
              {p.instagram && (
                <Row
                  selected={selIg.has(p.instagram.id)}
                  onToggle={() => toggle(selIg, p.instagram!.id, setSelIg)}
                  title={p.instagram.username ? `@${p.instagram.username}` : 'Instagram'}
                  subtitle="Instagram Direct"
                  picture={p.instagram.picture}
                  brand="instagram"
                  connected={p.instagram.connected}
                />
              )}
            </div>
          ))}
          {accounts.map((a) => (
            <Row
              key={a.id}
              selected={selIg.has(a.id)}
              onToggle={() => toggle(selIg, a.id, setSelIg)}
              title={a.username ? `@${a.username}` : 'Instagram'}
              subtitle="Instagram Direct"
              picture={a.picture}
              brand="instagram"
              connected={a.connected}
            />
          ))}
          {pages.length === 0 && accounts.length === 0 && (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">Não há páginas nem contas para ligar.</p>
          )}
          {failed.length > 0 && (
            <div className="mx-2 mt-3 space-y-1 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
              {failed.map((f) => (
                <p key={f.id} className="text-sm text-red-600 dark:text-red-400"><strong>{f.name}:</strong> {f.error}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </AppModal>
  );
}
