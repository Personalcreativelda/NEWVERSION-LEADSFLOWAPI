// Destinatários de uma campanha de WhatsApp com o que aconteceu a cada mensagem:
// lida (visto azul), entregue, enviada, falhou ou ficou de fora. As leituras vêm das confirmações do WhatsApp;
// quem tem os recibos de leitura desligados aparece como "Entregue".
import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../../utils/api';
import { getLocale } from '../../utils/format';
import { matchesSearch } from '../../utils/search';

interface Recipient {
  id: string;
  phone: string;
  name: string | null;
  status: string;
  error: string | null;
  sent_at: string | null;
  replied_at: string | null;
  message_status: string | null;
  delivered_at: string | null;
  read_at: string | null;
}

type Filter = 'all' | 'read' | 'unread' | 'replied';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'read', label: 'Viram' },
  { value: 'unread', label: 'Não viram' },
  { value: 'replied', label: 'Responderam' },
];

const isRead = (r: Recipient) => r.message_status === 'read' || !!r.read_at;

function stateOf(r: Recipient): { label: string; className: string; at: string | null } {
  if (r.status === 'failed') return { label: 'Falhou', className: 'text-red-600 dark:text-red-400', at: null };
  if (r.status === 'skipped' || r.status === 'excluded') return { label: 'Fora do envio', className: 'text-muted-foreground', at: null };
  if (r.status === 'pending' || r.status === 'sending') return { label: 'Por enviar', className: 'text-muted-foreground', at: null };
  if (isRead(r)) return { label: 'Viu', className: 'text-sky-600 dark:text-sky-400', at: r.read_at };
  if (r.message_status === 'delivered' || r.delivered_at) return { label: 'Entregue', className: 'text-foreground', at: r.delivered_at };
  return { label: 'Enviada', className: 'text-muted-foreground', at: r.sent_at };
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(getLocale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

export function CampaignRecipientsList({ campaignId }: { campaignId: string }) {
  const [rows, setRows] = useState<Recipient[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let alive = true;
    setRows(null);
    apiRequest(`/campaigns/${campaignId}/recipients`, 'GET')
      .then((d: any) => { if (alive) setRows(Array.isArray(d?.recipients) ? d.recipients : []); })
      .catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [campaignId]);

  const visible = useMemo(() => (rows || []).filter((r) => {
    if (filter === 'read' && !isRead(r)) return false;
    if (filter === 'unread' && (isRead(r) || r.status !== 'sent')) return false;
    if (filter === 'replied' && !r.replied_at) return false;
    return !search || matchesSearch(`${r.name || ''} ${r.phone}`, search);
  }), [rows, filter, search]);

  if (rows === null) return <p className="text-sm text-muted-foreground">A carregar…</p>;
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Sem destinatários.</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`h-9 rounded-full border px-3 text-sm ${filter === f.value
                ? 'border-foreground/25 bg-muted font-medium text-foreground'
                : 'border-border text-muted-foreground hover:bg-muted/50'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Pesquisar"
          className="sm:ml-auto sm:w-56"
          aria-label="Pesquisar destinatários"
        />
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ninguém nesta lista.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {visible.slice(0, 500).map((r) => {
            const st = stateOf(r);
            return (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground" translate="no">{r.name || r.phone}</p>
                  {r.name && <p className="truncate text-xs text-muted-foreground" translate="no">{r.phone}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-sm font-medium ${st.className}`}>{`${st.label}${r.replied_at ? ' · Respondeu' : ''}`}</p>
                  {st.at && <p className="text-xs tabular-nums text-muted-foreground">{fmt(st.at)}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {visible.length > 500 && <p className="text-xs text-muted-foreground">A mostrar 500 de {visible.length}.</p>}
    </div>
  );
}
