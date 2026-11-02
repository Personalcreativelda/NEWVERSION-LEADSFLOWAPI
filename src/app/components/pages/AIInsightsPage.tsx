import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Copy, RefreshCw, Workflow } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, PageAction } from '../base/PageHeader';
import { EmptyState } from '../base/EmptyState';
import { ChannelLogo } from '../base/ChannelLogo';
import { ChoiceList } from '../base/ChoiceList';
import { Button } from '../ui/button';
import { SkeletonStatCardsRow, SkeletonInsightRow, UpdatingBadge } from '../ui/skeletons';
import { api } from '../../../lib/api';
import { formatMoney, formatNumber, formatRelativeDay } from '../../utils/format';
import { formatLeadStatus } from '../dashboard/leadDisplay';
import { cn } from '../ui/utils';

export type Bucket = 'waiting_reply' | 'ready_to_close' | 'cooling' | 'never_contacted';

export interface Opportunity {
  lead_id: string;
  name: string;
  status: string;
  deal_value: number;
  bucket: Bucket;
  priority: number;
  reason: string;
  since: string;
  action: string;
  channel: string | null;
  conversation_id: string | null;
  last_client_message: string | null;
  in_flow: boolean;
  window_closed: boolean;
}

export interface SalesQueue {
  items: Opportunity[];
  counts: Record<Bucket, number>;
  stale: number;
  value_at_stake: number;
}

interface Suggestion { label: string; text: string }

interface Composer {
  loading: boolean;
  suggestions: Suggestion[];
  selected: string;
  draft: string;
  sending: boolean;
}

export const BUCKETS: { key: Bucket; label: string; dot: string }[] = [
  { key: 'waiting_reply', label: 'Aguardam resposta', dot: 'bg-red-500' },
  { key: 'ready_to_close', label: 'Prontos a fechar', dot: 'bg-emerald-500' },
  { key: 'cooling', label: 'A arrefecer', dot: 'bg-amber-500' },
  { key: 'never_contacted', label: 'Por contactar', dot: 'bg-sky-500' },
];
export const bucketDot = (b: Bucket) => BUCKETS.find((x) => x.key === b)?.dot || 'bg-muted-foreground';

const PAGE = 20;

// Nomes guardados todos em maiúsculas (ex.: "JOAO SILVA") passam a "Joao Silva"
export function displayName(name?: string) {
  const n = (name || '').trim();
  if (!n || n !== n.toUpperCase() || !/\p{L}/u.test(n)) return n || 'Lead';
  return n.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, sp, c) => sp + c.toUpperCase());
}

interface AIInsightsPageProps {
  /** Abre a conversa do lead na inbox (cria-a se ainda não existir) */
  onOpenConversation?: (leadId: string, conversationId: string | null) => void;
  onOpenLead?: (leadId: string) => void;
  onNavigate?: (page: string) => void;
}

export default function AIInsightsPage({ onOpenConversation, onOpenLead, onNavigate }: AIInsightsPageProps) {
  const [queue, setQueue] = useState<SalesQueue | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Bucket | null>(null);
  const [visible, setVisible] = useState(PAGE);
  const [composers, setComposers] = useState<Record<string, Composer>>({});
  const [sent, setSent] = useState<Record<string, true>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.aiRemarketing.opportunities();
      if (data?.items) setQueue(data);
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível carregar as prioridades');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const items = useMemo(
    () => (queue?.items || []).filter((o) => !filter || o.bucket === filter),
    [queue, filter],
  );

  const patch = (leadId: string, change: Partial<Composer>) =>
    setComposers((prev) => ({ ...prev, [leadId]: { ...prev[leadId], ...change } }));

  const generate = async (o: Opportunity) => {
    setComposers((prev) => ({
      ...prev,
      [o.lead_id]: { suggestions: prev[o.lead_id]?.suggestions || [], selected: '0', draft: '', sending: false, loading: true },
    }));
    try {
      const res = await api.aiRemarketing.generateMessage({ leadId: o.lead_id, bucket: o.bucket });
      const suggestions: Suggestion[] = res?.suggestions || [];
      if (suggestions.length === 0) throw new Error('Sem sugestões');
      patch(o.lead_id, { loading: false, suggestions, selected: '0', draft: suggestions[0].text });
    } catch (err: any) {
      setComposers((prev) => {
        const next = { ...prev };
        if (!next[o.lead_id]?.suggestions.length) delete next[o.lead_id];
        else next[o.lead_id] = { ...next[o.lead_id], loading: false };
        return next;
      });
      toast.error(err?.message || 'Não foi possível gerar a mensagem');
    }
  };

  const choose = (leadId: string, index: string) => {
    const c = composers[leadId];
    if (!c) return;
    patch(leadId, { selected: index, draft: c.suggestions[Number(index)]?.text || '' });
  };

  const send = async (o: Opportunity) => {
    const c = composers[o.lead_id];
    const content = c?.draft.trim();
    if (!content) return;
    patch(o.lead_id, { sending: true });
    try {
      await api.aiRemarketing.sendMessage({ leadId: o.lead_id, content });
      setSent((prev) => ({ ...prev, [o.lead_id]: true }));
      setComposers((prev) => {
        const next = { ...prev };
        delete next[o.lead_id];
        return next;
      });
      toast.success(`Mensagem enviada a ${displayName(o.name)}`);
    } catch (err: any) {
      patch(o.lead_id, { sending: false });
      toast.error(err?.message || 'Não foi possível enviar');
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Mensagem copiada');
    } catch {
      toast.error('Não foi possível copiar');
    }
  };

  const refresh = () => {
    setSent({});
    setComposers({});
    load();
  };

  const total = queue ? Object.values(queue.counts).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="w-full">
      <PageHeader
        title="Assistente de vendas IA"
        description="Quem precisa de si agora e o que lhe dizer"
        actions={
          <PageAction
            icon={RefreshCw}
            label="Atualizar"
            onClick={refresh}
            disabled={loading}
            className={loading ? '[&>svg]:animate-spin' : undefined}
          />
        }
      />

      <main className="space-y-5">
        {loading && !queue ? (
          <div className="space-y-5">
            <SkeletonStatCardsRow count={4} />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <SkeletonInsightRow key={i} />)}
            </div>
          </div>
        ) : !queue ? (
          <EmptyState
            icon={RefreshCw}
            title="Não foi possível carregar"
            action={<Button onClick={load}>Tentar de novo</Button>}
          />
        ) : (
          <>
            {/* Situações: tocar filtra a lista */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
              {BUCKETS.map((b) => {
                const active = filter === b.key;
                return (
                  <button
                    key={b.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => { setFilter(active ? null : b.key); setVisible(PAGE); }}
                    className={cn(
                      'min-w-0 rounded-xl border bg-card p-3 text-left transition-colors sm:p-4',
                      active ? 'border-foreground/25 bg-muted/60' : 'border-border hover:bg-muted/40',
                    )}
                  >
                    <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <span className={cn('h-2 w-2 flex-shrink-0 rounded-full', b.dot)} />
                      <span className="truncate">{b.label}</span>
                    </span>
                    <span className="mt-1 block text-2xl font-semibold tabular-nums text-foreground">
                      {formatNumber(queue.counts[b.key] ?? 0)}
                    </span>
                  </button>
                );
              })}
            </div>

            {(queue.value_at_stake > 0 || loading) && (
              <div className="flex items-center justify-between gap-3">
                {queue.value_at_stake > 0 ? (
                  <p className="min-w-0 text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground tabular-nums">{formatMoney(queue.value_at_stake)}</span> em negócios à espera de si
                  </p>
                ) : <span />}
                {loading && <UpdatingBadge />}
              </div>
            )}

            {total === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="Está tudo em dia"
                description="Nenhum cliente à espera de resposta"
              />
            ) : items.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="Nada nesta situação" />
            ) : (
              <div className="space-y-3">
                {items.slice(0, visible).map((o) => (
                  <OpportunityCard
                    key={o.lead_id}
                    o={o}
                    composer={composers[o.lead_id]}
                    sent={!!sent[o.lead_id]}
                    onGenerate={() => generate(o)}
                    onChoose={(i) => choose(o.lead_id, i)}
                    onDraft={(draft) => patch(o.lead_id, { draft })}
                    onCancel={() => setComposers((prev) => { const n = { ...prev }; delete n[o.lead_id]; return n; })}
                    onSend={() => send(o)}
                    onCopy={copy}
                    onOpenConversation={onOpenConversation ? () => onOpenConversation(o.lead_id, o.conversation_id) : undefined}
                    onOpenLead={onOpenLead ? () => onOpenLead(o.lead_id) : undefined}
                  />
                ))}
                {items.length > visible && (
                  <Button variant="outline" className="w-full" onClick={() => setVisible((v) => v + PAGE)}>
                    Ver mais ({formatNumber(items.length - visible)})
                  </Button>
                )}
              </div>
            )}

            {queue.stale > 0 && (
              <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Workflow className="h-5 w-5" />
                  </span>
                  <p className="min-w-0 text-sm text-foreground">
                    {queue.stale === 1 ? '1 lead parado' : `${formatNumber(queue.stale)} leads parados`} há mais de 30 dias
                  </p>
                </div>
                {onNavigate && (
                  <Button variant="outline" onClick={() => onNavigate('remarketing')}>Reativar com um fluxo</Button>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function OpportunityCard({
  o, composer, sent, onGenerate, onChoose, onDraft, onCancel, onSend, onCopy, onOpenConversation, onOpenLead,
}: {
  o: Opportunity;
  composer?: Composer;
  sent: boolean;
  onGenerate: () => void;
  onChoose: (index: string) => void;
  onDraft: (text: string) => void;
  onCancel: () => void;
  onSend: () => void;
  onCopy: (text: string) => void;
  onOpenConversation?: () => void;
  onOpenLead?: () => void;
}) {
  const ready = composer && !composer.loading && composer.suggestions.length > 0;

  return (
    <article className={cn('rounded-xl border border-border bg-card p-4 transition-opacity', sent && 'opacity-70')}>
      <div className="flex items-start gap-3">
        <div className="relative flex-shrink-0">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground" translate="no">
            {displayName(o.name).charAt(0).toUpperCase()}
          </span>
          {o.channel && (
            <ChannelLogo type={o.channel} className="absolute -bottom-1 -right-1 h-5 w-5 ring-2 ring-card" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              onClick={onOpenLead}
              disabled={!onOpenLead}
              className="min-w-0 truncate text-left text-[15px] font-semibold text-foreground hover:underline disabled:no-underline"
              translate="no"
            >
              {displayName(o.name)}
            </button>
            {o.deal_value > 0 && (
              <span className="flex-shrink-0 text-sm font-semibold tabular-nums text-foreground">{formatMoney(o.deal_value)}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {formatLeadStatus(o.status)}
            {o.in_flow && ' · Num fluxo'}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-start gap-2 text-sm">
        <span className={cn('mt-1.5 h-2 w-2 flex-shrink-0 rounded-full', bucketDot(o.bucket))} />
        <span className="min-w-0 flex-1 text-foreground">{o.reason}</span>
        <span className="flex-shrink-0 text-xs text-muted-foreground tabular-nums">{formatRelativeDay(o.since, 'time')}</span>
      </div>

      {o.last_client_message && (
        <p className="mt-2 rounded-lg bg-muted/60 px-3 py-2 text-sm text-foreground/80" translate="no">
          <span className="line-clamp-2">“{o.last_client_message}”</span>
        </p>
      )}

      {sent ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" /> Mensagem enviada
          </span>
          {onOpenConversation && <Button variant="outline" size="sm" onClick={onOpenConversation}>Abrir conversa</Button>}
        </div>
      ) : ready ? (
        <div className="mt-4 space-y-3">
          <ChoiceList
            value={composer.selected}
            onChange={onChoose}
            options={composer.suggestions.map((s, i) => ({
              value: String(i),
              label: (
                <span className="block min-w-0">
                  <span className="block text-xs font-medium text-muted-foreground">{s.label}</span>
                  {composer.selected !== String(i) && <span className="line-clamp-2 text-sm" translate="no">{s.text}</span>}
                </span>
              ),
              children: (
                <textarea
                  value={composer.draft}
                  onChange={(e) => onDraft(e.target.value)}
                  rows={Math.min(6, Math.max(3, Math.ceil(composer.draft.length / 48)))}
                  className="w-full resize-none text-sm"
                  aria-label="Mensagem"
                  translate="no"
                />
              ),
            }))}
          />
          {o.window_closed && (
            <p className="text-xs text-muted-foreground">
              Passaram mais de 24 horas desde a última mensagem do cliente: neste canal só pode responder quando ele voltar a escrever.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onGenerate}>Gerar outras</Button>
            <Button variant="ghost" size="icon" onClick={() => onCopy(composer.draft)} aria-label="Copiar" title="Copiar">
              <Copy className="h-4 w-4" />
            </Button>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" onClick={onCancel}>Cancelar</Button>
              <Button
                size="sm"
                onClick={onSend}
                disabled={composer.sending || !composer.draft.trim() || o.window_closed}
              >
                {composer.sending ? 'A enviar…' : 'Enviar'}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
          <Button size="sm" onClick={onGenerate} disabled={composer?.loading}>
            {composer?.loading ? 'A escrever…' : o.action}
          </Button>
          {onOpenConversation && (
            <Button variant="outline" size="sm" onClick={onOpenConversation}>Abrir conversa</Button>
          )}
        </div>
      )}
    </article>
  );
}
