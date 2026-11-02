// Fluxo de reativação feito pela IA para os leads parados: a IA lê o negócio (instruções dos
// assistentes) e o que estes clientes perguntaram, e propõe a sequência. O utilizador revê os
// textos e ativa — os leads parados entram logo e os próximos a parar entram sozinhos.
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AppModal } from '../base/AppModal';
import { AppButton } from '../base/AppButton';
import { api } from '../../../lib/api';
import { formatNumber } from '../../utils/format';
import { cn } from '../ui/utils';
import { STEP_COLORS, STEP_ICONS } from './flowVisuals';
import { stepSummary, type ActionType } from './flowTypes';

interface DraftStep { id: string; type: ActionType; label: string; config: Record<string, any> }

interface Draft {
  name: string;
  summary: string;
  trigger_type: string;
  trigger_label: string;
  settings: Record<string, any>;
  steps: DraftStep[];
  ai: boolean;
  reach: { total: number; reachable: number; needs_template: number; outside_window: number; no_channel: number };
  lead_ids: string[];
  replaces: { id: string; name: string } | null;
}

const TEXT_FIELD: Partial<Record<ActionType, string>> = { message: 'message', dynamic_audio: 'text' };

function stepTitle(step: DraftStep, index: number, steps: DraftStep[]) {
  if (step.type === 'dynamic_audio') return 'Nota de voz';
  if (step.type === 'message') {
    const sends = steps.filter((s) => s.type === 'message' || s.type === 'dynamic_audio');
    const pos = sends.indexOf(step);
    if (pos === 0) return 'Primeira mensagem';
    if (pos === sends.length - 1) return 'Última mensagem';
    return 'Segunda mensagem';
  }
  if (step.type === 'wait') return `Aguardar ${stepSummary('wait', step.config)}`;
  if (step.type === 'tag') return `Aplicar tag: ${step.config.tag}`;
  return stepSummary(step.type, step.config) || String(index + 1);
}

export function AIReactivationModal({ open, onOpenChange, onCreated }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Depois de criar: active=false (rascunho) leva o utilizador ao editor */
  onCreated: (active: boolean) => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<'active' | 'draft' | null>(null);

  const generate = useCallback(async () => {
    setLoading(true);
    try {
      setDraft(await api.aiRemarketing.reactivationFlow());
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível preparar o fluxo');
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }, [onOpenChange]);

  useEffect(() => {
    if (open) { setDraft(null); generate(); }
  }, [open, generate]);

  const editText = (id: string, value: string) => setDraft((d) => d && {
    ...d,
    steps: d.steps.map((s) => (s.id === id ? { ...s, config: { ...s.config, [TEXT_FIELD[s.type]!]: value } } : s)),
  });

  const save = async (status: 'active' | 'draft') => {
    if (!draft) return;
    const empty = draft.steps.some((s) => TEXT_FIELD[s.type] && !String(s.config[TEXT_FIELD[s.type]!] || '').trim());
    if (empty) { toast.error('Escreva o texto de todas as mensagens'); return; }
    setSaving(status);
    try {
      const flow = await api.remarketing.create({
        name: draft.name,
        description: draft.summary,
        status,
        trigger_type: draft.trigger_type,
        trigger_label: draft.trigger_label,
        steps: draft.steps,
        settings: draft.settings,
      });
      // Um só fluxo de reativação ativo: o anterior fica em pausa
      if (status === 'active' && draft.replaces) await api.remarketing.toggle(draft.replaces.id).catch(() => {});
      if (status === 'active' && flow?.id && draft.lead_ids.length > 0) {
        const res = await api.remarketing.enroll(flow.id, draft.lead_ids);
        toast.success(res.enrolled === 1 ? 'Fluxo ativado: 1 lead adicionado' : `Fluxo ativado: ${formatNumber(res.enrolled)} leads adicionados`);
      } else {
        toast.success(status === 'active' ? 'Fluxo ativado' : 'Fluxo guardado como rascunho');
      }
      onOpenChange(false);
      onCreated(status === 'active');
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível criar o fluxo');
    } finally {
      setSaving(null);
    }
  };

  const reach = draft?.reach;
  const reachNotes = reach ? [
    reach.outside_window > 0 && `${formatNumber(reach.outside_window)} no Instagram ou Messenger: só quando voltarem a escrever`,
    reach.needs_template > 0 && `${formatNumber(reach.needs_template)} no WhatsApp Business: precisam de um modelo aprovado`,
    reach.no_channel > 0 && `${formatNumber(reach.no_channel)} sem canal para mensagens`,
  ].filter(Boolean) as string[] : [];

  return (
    <AppModal
      open={open}
      onOpenChange={(v) => { if (!saving) onOpenChange(v); }}
      title="Reativar leads parados"
      size="lg"
      footer={(
        <>
          <AppButton variant="outline" onClick={() => save('draft')} disabled={!draft || loading || !!saving}>
            {saving === 'draft' ? 'A guardar…' : 'Guardar rascunho'}
          </AppButton>
          <AppButton onClick={() => save('active')} disabled={!draft || loading || !!saving}>
            {saving === 'active' ? 'A ativar…' : 'Ativar fluxo'}
          </AppButton>
        </>
      )}
    >
      {loading || !draft ? (
        <div className="space-y-4" aria-busy="true">
          <p className="text-sm text-muted-foreground">A preparar o fluxo a partir das suas conversas…</p>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <div className="h-9 w-9 flex-shrink-0 rounded-lg skeleton-shimmer" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/3 rounded skeleton-shimmer" />
                {i % 2 === 0 && <div className="h-16 w-full rounded-lg skeleton-shimmer" />}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="space-y-1.5">
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              aria-label="Nome do fluxo"
              className="w-full text-[15px] font-semibold"
            />
            {draft.summary && <p className="text-sm text-muted-foreground" translate="no">{draft.summary}</p>}
          </div>

          {draft.replaces && (
            <p className="text-sm text-muted-foreground">
              Ao ativar, este fluxo substitui <span className="font-medium text-foreground" translate="no">{draft.replaces.name}</span>, que fica em pausa.
            </p>
          )}

          {reach && reach.total > 0 && (
            <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
              <p className="text-sm text-foreground">
                <span className="font-semibold tabular-nums">{formatNumber(reach.reachable)}</span> de {formatNumber(reach.total)} podem receber mensagens agora
              </p>
              {reachNotes.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {reachNotes.map((n) => <li key={n} className="text-xs text-muted-foreground">{n}</li>)}
                </ul>
              )}
            </div>
          )}

          <ol className="space-y-3">
            {draft.steps.map((step, i) => {
              const Icon = STEP_ICONS[step.type];
              const field = TEXT_FIELD[step.type];
              return (
                <li key={step.id} className="flex gap-3">
                  <span className={cn('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg', STEP_COLORS[step.type])}>
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1 space-y-1.5 pt-1.5">
                    <p className="text-sm font-medium text-foreground">{stepTitle(step, i, draft.steps)}</p>
                    {field && (
                      <textarea
                        value={step.config[field] || ''}
                        onChange={(e) => editText(step.id, e.target.value)}
                        rows={3}
                        className="w-full resize-none text-sm"
                        aria-label={stepTitle(step, i, draft.steps)}
                        translate="no"
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ol>

          <p className="text-sm text-muted-foreground">
            Se o cliente responder, o fluxo para, o lead passa a Qualificado e a equipa é avisada.
          </p>

          <AppButton variant="ghost" size="sm" onClick={generate} disabled={!!saving}>Gerar outra versão</AppButton>
        </div>
      )}
    </AppModal>
  );
}
