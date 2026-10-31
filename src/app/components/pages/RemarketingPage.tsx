import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../../../lib/api';
import { toast } from 'sonner';
import {
  GitBranch, Zap, ChevronRight, Play, Pause, Copy, Trash2, BarChart3, ArrowRight,
  Layers, Repeat2, Pencil, UploadCloud, MoreHorizontal, FlaskConical, Loader2,
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { PageHeader, PageAction } from '../base/PageHeader';
import { EmptyState } from '../base/EmptyState';
import { SkeletonFlowCard, UpdatingBadge } from '../ui/skeletons';
import { AppModal } from '../base/AppModal';
import { AppButton } from '../base/AppButton';
import { DashboardCard } from '../base/DashboardCard';
import { StatusBadge } from '../base/StatusBadge';
import { formatNumber, formatPercent } from '../../utils/format';
import { ChannelLogo } from '../base/ChannelLogo';
import { LogoBox } from '../base/LogoBox';
import type { Brand } from '../base/BrandIcon';
import { FlowEditor } from '../remarketing/FlowEditor';
import { FLOW_TEMPLATES, type FlowTemplate, type TemplateChannel } from '../remarketing/flowTemplates';
import { STEP_COLORS, STEP_ICONS } from '../remarketing/flowVisuals';
import {
  DEFAULT_FUNNEL_STAGES, STEP_NAMES, stepSummary, triggerSummary,
  type FlowStep, type RemarketingFlow,
} from '../remarketing/flowTypes';
import { matchesSearch } from '../../utils/search';
import { useConfirm } from '../ui/ConfirmDialog';

// ─── localStorage helpers ────────────────────────────────────────────────────

const LS_KEY = 'remarketing_flows_local';
function loadLocal(): RemarketingFlow[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}
function saveLocal(flows: RemarketingFlow[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(flows)); } catch { /* ignore */ }
}

// Abaixo disto a taxa de conversão não diz nada
const MIN_ENROLLED_FOR_RATE = 10;

const stepsFromTemplate = (template: FlowTemplate): FlowStep[] =>
  template.steps.map((step) => ({ ...step, config: { ...step.config }, label: stepSummary(step.type, step.config) }));

/** Rascunhos criados com os modelos antigos (só nomes, sem mensagens) recebem o conteúdo do modelo */
function hydrateLegacyDraft(flow: RemarketingFlow): RemarketingFlow {
  if (flow.status !== 'draft' || !flow.templateId || flow.steps.length === 0) return flow;
  if (flow.steps.some((step) => step.config && Object.keys(step.config).length > 0)) {
    // Rascunhos de modelos anteriores a esta opção também passam a adaptar-se à conversa
    if (flow.settings?.personalize !== undefined || !FLOW_TEMPLATES.some((t) => t.id === flow.templateId)) return flow;
    const settings = { ...flow.settings, personalize: true };
    void api.remarketing.update(flow.id, { settings }).catch(() => { /* tenta na próxima atualização */ });
    return { ...flow, settings };
  }
  const template = FLOW_TEMPLATES.find((t) => t.id === flow.templateId);
  if (!template) return flow;
  const upgraded: RemarketingFlow = {
    ...flow,
    description: template.description,
    trigger: template.trigger,
    triggerLabel: template.triggerLabel,
    steps: stepsFromTemplate(template),
    settings: template.settings,
  };
  void api.remarketing.update(flow.id, {
    description: upgraded.description,
    trigger_type: upgraded.trigger,
    trigger_label: upgraded.triggerLabel,
    steps: upgraded.steps,
    settings: upgraded.settings,
  }).catch(() => { /* tenta na próxima atualização */ });
  return upgraded;
}

const TEMPLATE_FILTERS: { value: 'all' | TemplateChannel; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Messenger' },
  { value: 'telegram', label: 'Telegram' },
];

const CHANNEL_BRAND: Record<TemplateChannel, Brand> = {
  whatsapp: 'whatsapp',
  instagram: 'instagram',
  facebook: 'messenger',
  telegram: 'telegram',
};

/** Conteúdo inteiro de um passo, para ler o modelo antes de o usar */
function stepDetail(step: FlowStep): string {
  const c = step.config ?? {};
  return c.message || c.text || c.title || stepSummary(step.type, c);
}

const STOP_REASONS: Record<string, string> = {
  replied: 'Respondeu',
  converted: 'Comprou',
  opt_out: 'Pediu para sair',
  lost: 'Perdido',
  stage_changed: 'Mudou de etapa',
  no_interest: 'Sem interesse',
  later: 'Pediu mais tarde',
  client_waiting: 'À espera de resposta',
  human_took_over: 'A equipa assumiu',
  human_mode: 'Com a equipa',
  restarted: 'Reiniciado',
  lead_removed: 'Lead apagado',
  flow_removed: 'Fluxo apagado',
  loop: 'Parou numa condição',
};

function enrollmentState(row: any): string {
  if (row.status === 'active') return 'Em curso';
  if (row.status === 'completed') return 'Concluiu';
  return STOP_REASONS[row.stop_reason] || 'Parou';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RemarketingPage() {
  const [flows, setFlows] = useState<RemarketingFlow[]>([]);
  const [activeTab, setActiveTab] = useState<'flows' | 'templates'>('flows');
  const [selectedTemplate, setSelectedTemplate] = useState<FlowTemplate | null>(null);
  const [templateFilter, setTemplateFilter] = useState<'all' | TemplateChannel>('all');
  const [analysisStats, setAnalysisStats] = useState<any | null>(null);
  const [testFlow, setTestFlow] = useState<RemarketingFlow | null>(null);
  const [testLeads, setTestLeads] = useState<any[] | null>(null);
  const [testSearch, setTestSearch] = useState('');
  const [testLeadId, setTestLeadId] = useState<string | null>(null);
  const [testSending, setTestSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingFlow, setEditingFlow] = useState<RemarketingFlow | null>(null);
  const [analysisFlow, setAnalysisFlow] = useState<RemarketingFlow | null>(null);

  // ── Dynamic funnel stages from the real leads table ───────────────────────
  const [funnelStages, setFunnelStages] = useState<{ value: string; label: string }[]>(DEFAULT_FUNNEL_STAGES);

  useEffect(() => {
    api.leads.funnelStages()
      .then(rows => {
        const LABEL_MAP: Record<string, string> = {
          novo: 'Novo lead',
          contatado: 'Contatado',
          qualificado: 'Qualificado',
          negociacao: 'Em Negociação',
          convertido: 'Convertido',
          perdido: 'Perdido',
        };

        // Start with all defaults, then add any custom stages from the API not already in defaults
        const defaultValues = new Set(DEFAULT_FUNNEL_STAGES.map(s => s.value));
        const extra = (rows || [])
          .filter(r => !defaultValues.has(r.value))
          .map(r => ({
            value: r.value,
            label: LABEL_MAP[r.value] ?? (r.value.charAt(0).toUpperCase() + r.value.slice(1)),
          }));

        const merged = [...DEFAULT_FUNNEL_STAGES, ...extra];
        setFunnelStages(merged);
      })
      .catch(() => { /* keep defaults */ });
  }, []);

  // ── Persist helper — keeps localStorage in sync with every state update ──
  const updateFlows = useCallback((updater: (prev: RemarketingFlow[]) => RemarketingFlow[]) => {
    setFlows(prev => {
      const next = updater(prev);
      saveLocal(next);
      return next;
    });
  }, []);

  // Eliminados nesta sessão: uma atualização já a caminho não os traz de volta
  const deletedIdsRef = useRef(new Set<string>());
  const confirm = useConfirm();

  // ── Load on mount: try API, fall back to localStorage ────────────────────
  const fetchFlows = useCallback(async (silent = false) => {
    try {
      const data = await api.remarketing.list();
      const mapped: RemarketingFlow[] = data.map((r: any) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        status: r.status,
        trigger: r.trigger_type,
        triggerLabel: r.trigger_label,
        steps: Array.isArray(r.steps) ? r.steps : [],
        enrolledLeads: r.enrolled_leads ?? 0,
        conversions: r.conversions ?? 0,
        createdAt: r.created_at,
        templateId: r.template_id,
        settings: r.settings,
      })).map(hydrateLegacyDraft);
      const local = loadLocal();
      // O servidor manda: da cópia local só ficam os fluxos que ainda não chegaram lá (id
      // temporário). Antes, com o servidor vazio, voltavam os fluxos já eliminados.
      const merged = [
        ...local.filter(f => f.id.startsWith('flow-')),
        ...mapped.filter(f => !deletedIdsRef.current.has(f.id)),
      ];
      setFlows(merged);
      saveLocal(merged);
      return { mapped, local };
    } catch {
      if (!silent) setFlows(loadLocal());
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchFlows();
      if (cancelled) return;

      // Sync local-only flows (temp ids) to backend
      if (result && result.mapped.length === 0 && result.local.length > 0) {
        for (const f of result.local) {
          if (!f.id.startsWith('flow-')) continue;
          try {
            const created = await api.remarketing.create({
              name: f.name,
              description: f.description,
              status: f.status,
              trigger_type: f.trigger,
              trigger_label: f.triggerLabel,
              steps: f.steps,
              template_id: f.templateId,
              settings: f.settings,
            });
            setFlows(prev => {
              const next = prev.map(x => x.id === f.id ? { ...x, id: created.id, createdAt: created.created_at } : x);
              saveLocal(next);
              return next;
            });
          } catch { /* keep local id */ }
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [fetchFlows]);

  // ── Auto-refresh stats (enrolled_leads / conversions) every 30s ──────────
  useEffect(() => {
    const id = setInterval(() => { fetchFlows(true); }, 30_000);
    return () => clearInterval(id);
  }, [fetchFlows]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleUseTemplate = async (template: FlowTemplate) => {
    const newFlow: RemarketingFlow = {
      id: `flow-${Date.now()}`,
      name: template.name,
      description: template.description,
      status: 'draft',
      trigger: template.trigger,
      triggerLabel: template.triggerLabel,
      steps: stepsFromTemplate(template),
      settings: { ...template.settings, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      enrolledLeads: 0,
      conversions: 0,
      createdAt: new Date().toISOString(),
      templateId: template.id,
    };

    // Optimistically add to local state + localStorage immediately
    updateFlows(prev => [newFlow, ...prev]);
    setActiveTab('flows');
    setSelectedTemplate(null);
    // Abre logo para rever as mensagens antes de ativar
    setEditingFlow(newFlow);

    // Best-effort sync to API (silently ignored if backend is not ready)
    try {
      const created = await api.remarketing.create({
        name: newFlow.name,
        description: newFlow.description,
        status: newFlow.status,
        trigger_type: newFlow.trigger,
        trigger_label: newFlow.triggerLabel,
        steps: newFlow.steps,
        template_id: newFlow.templateId,
        settings: newFlow.settings,
      });
      // Replace local temp id with DB id
      updateFlows(prev => prev.map(f =>
        f.id === newFlow.id
          ? { ...f, id: created.id, createdAt: created.created_at }
          : f
      ));
      setEditingFlow(prev => (prev?.id === newFlow.id ? { ...prev, id: created.id } : prev));
    } catch { /* table not yet created — local version persists */ }
  };

  const handleToggleStatus = async (id: string) => {
    const previous = flows.find(f => f.id === id)?.status;
    if (id.startsWith('flow-')) {
      toast.error('Este fluxo ainda não chegou ao servidor. Use Sincronizar.');
      return;
    }
    updateFlows(prev => prev.map(f =>
      f.id === id
        ? { ...f, status: f.status === 'active' ? 'paused' : 'active' }
        : f
    ));
    try {
      const updated = await api.remarketing.toggle(id);
      updateFlows(prev => prev.map(f => f.id === id ? { ...f, status: updated.status } : f));
    } catch (err: any) {
      if (previous) updateFlows(prev => prev.map(f => f.id === id ? { ...f, status: previous } : f));
      toast.error(err?.message || 'Não foi possível alterar o fluxo');
    }
  };

  const openAnalysis = (flow: RemarketingFlow) => {
    setAnalysisFlow(flow);
    setAnalysisStats(null);
    if (flow.id.startsWith('flow-')) return;
    api.remarketing.stats(flow.id).then(setAnalysisStats).catch(() => {});
  };

  const openTest = (flow: RemarketingFlow) => {
    setTestFlow(flow);
    setTestLeadId(null);
    setTestSearch('');
    if (testLeads) return;
    api.leads.list({ limit: 500 })
      .then((data: any) => setTestLeads(Array.isArray(data) ? data : (data?.leads ?? [])))
      .catch(() => setTestLeads([]));
  };

  const runTest = async () => {
    if (!testFlow || !testLeadId) return;
    setTestSending(true);
    try {
      await api.remarketing.test(testFlow.id, testLeadId);
      toast.success('Teste iniciado');
      setTestFlow(null);
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível iniciar o teste');
    } finally {
      setTestSending(false);
    }
  };

  const handleDelete = async (flow: RemarketingFlow) => {
    const ok = await confirm(`Eliminar "${flow.name || 'Sem nome'}"?`, { title: 'Eliminar fluxo', variant: 'danger', confirmLabel: 'Eliminar' });
    if (!ok) return;
    deletedIdsRef.current.add(flow.id);
    updateFlows(prev => prev.filter(f => f.id !== flow.id));
    // Ainda só existe neste aparelho
    if (flow.id.startsWith('flow-')) return;
    try {
      await api.remarketing.delete(flow.id);
      toast.success('Fluxo eliminado');
    } catch (err: any) {
      // Já não existe no servidor (eliminado noutro aparelho): está feito
      if (/not found/i.test(err?.message || '')) return;
      deletedIdsRef.current.delete(flow.id);
      updateFlows(prev => [flow, ...prev]);
      toast.error('Não foi possível eliminar o fluxo');
    }
  };

  const handleDuplicate = async (flow: RemarketingFlow) => {
    const copy: RemarketingFlow = {
      ...flow,
      id: `flow-${Date.now()}`,
      name: `${flow.name} (Cópia)`,
      status: 'draft',
      enrolledLeads: 0,
      conversions: 0,
      createdAt: new Date().toISOString(),
    };
    updateFlows(prev => [copy, ...prev]);
    try {
      const created = await api.remarketing.duplicate(flow.id);
      updateFlows(prev => prev.map(f =>
        f.id === copy.id
          ? { ...f, id: created.id, createdAt: created.created_at }
          : f
      ));
    } catch { /* keep local copy */ }
  };

  const handleCreateBlank = () => {
    const blank: RemarketingFlow = {
      id: `flow-${Date.now()}`,
      name: '',
      description: '',
      status: 'draft',
      trigger: 'inactivity',
      triggerLabel: '',
      steps: [],
      enrolledLeads: 0,
      conversions: 0,
      createdAt: new Date().toISOString(),
    };
    setEditingFlow(blank);
  };

  const handleSaveEdit = async (updated: RemarketingFlow) => {
    // New flow (created blank) — add to list
    const isNew = !flows.some(f => f.id === updated.id);
    if (isNew) {
      updateFlows(prev => [updated, ...prev]);
      setActiveTab('flows');
      setEditingFlow(null);
      try {
        const created = await api.remarketing.create({
          name: updated.name,
          description: updated.description,
          status: updated.status,
          trigger_type: updated.trigger,
          trigger_label: updated.triggerLabel,
          steps: updated.steps,
          settings: updated.settings,
        });
        updateFlows(prev => prev.map(f =>
          f.id === updated.id ? { ...f, id: created.id, createdAt: created.created_at } : f
        ));
      } catch (err: any) {
        console.error('[Remarketing] ❌ Falha ao salvar flow na API:', err);
        // Show the real error so we can diagnose it
        const msg = err?.message || JSON.stringify(err);
        toast.error(`Fluxo guardado localmente. Erro da API: ${msg}`);
      }
      return;
    }
    updateFlows(prev => prev.map(f => f.id === updated.id ? updated : f));
    setEditingFlow(null);
    try {
      await api.remarketing.update(updated.id, {
        name: updated.name,
        description: updated.description,
        trigger_type: updated.trigger,
        trigger_label: updated.triggerLabel,
        steps: updated.steps,
        settings: updated.settings,
      });
    } catch (err: any) {
      console.error('[Remarketing] ❌ Falha ao atualizar flow na API:', err);
      const msg = err?.message || JSON.stringify(err);
      toast.error(`Erro ao guardar no servidor: ${msg}`);
    }
  };

  // ── Force-sync localStorage flows → DB ───────────────────────────────────
  const [syncing, setSyncing] = useState(false);
  const syncToDB = async () => {
    setSyncing(true);
    let ok = 0, fail = 0;
    for (const f of flows) {
      // Only push flows that still have a local temp ID
      if (!f.id.startsWith('flow-')) continue;
      try {
        const created = await api.remarketing.create({
          name: f.name,
          description: f.description,
          status: f.status,
          trigger_type: f.trigger,
          trigger_label: f.triggerLabel,
          steps: f.steps,
          template_id: f.templateId,
          settings: f.settings,
        });
        updateFlows(prev => prev.map(x =>
          x.id === f.id ? { ...x, id: created.id, createdAt: created.created_at } : x
        ));
        ok++;
      } catch (err: any) {
        console.error('[Remarketing] Sync error for flow', f.name, err);
        fail++;
      }
    }
    setSyncing(false);
    if (ok > 0) toast.success(`${ok} fluxo(s) sincronizados com o servidor!`);
    if (fail > 0) toast.error(`${fail} fluxo(s) falharam — veja o console para detalhes.`);
    if (ok === 0 && fail === 0) toast.info('Todos os fluxos já estão no servidor.');
    fetchFlows(true);
  };

  return (
    <>
      <div className="w-full">
        <main className="space-y-6">

          <PageHeader
            title="Remarketing"
            description="Fluxos automáticos para reativar leads"
            icon={Repeat2}
            actions={<PageAction icon={UploadCloud} label={syncing ? 'A sincronizar…' : 'Sincronizar'} onClick={syncToDB} disabled={syncing} />}
            create={{ label: 'Novo fluxo', onClick: handleCreateBlank }}
          />


          {/* Tabs */}
          <div className="flex gap-1 border-b border-border">
            {(['flows', 'templates'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${activeTab === tab
                    ? 'border-foreground text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
              >
                {tab === 'flows' && `Os meus fluxos (${flows.length})`}
                {tab === 'templates' && 'Modelos'}
              </button>
            ))}
          </div>

          {/* ── FLOWS TAB ── */}
          {activeTab === 'flows' && (
            <>
              {loading && flows.length === 0 ? (
                <div className="grid gap-4">
                  {Array.from({ length: 3 }).map((_, i) => <SkeletonFlowCard key={i} />)}
                </div>
              ) : flows.length === 0 ? (
                <EmptyState
                  icon={GitBranch}
                  title="Ainda sem fluxos"
                  description="Comece por um modelo ou crie um fluxo do zero."
                  action={<PageAction variant="primary" icon={Layers} label="Ver modelos" onClick={() => setActiveTab('templates')} />}
                />
              ) : (
                <>
                  {loading && (
                    <div className="flex items-center justify-end mb-2">
                      <UpdatingBadge />
                    </div>
                  )}
                <div className="grid gap-4">
                  {flows.map(flow => {
                    const convRate = flow.enrolledLeads >= MIN_ENROLLED_FOR_RATE
                      ? Math.round((Math.min(flow.conversions, flow.enrolledLeads) / flow.enrolledLeads) * 100)
                      : null;
                    return (
                      <DashboardCard key={flow.id} disableContentPadding className="hover:border-border/80 transition-all">
                        <div className="p-5">
                        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                          {/* Left */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="font-semibold text-foreground text-sm" translate="no">{flow.name}</span>
                              <StatusBadge
                                label={flow.status === 'active' ? 'Ativo' : flow.status === 'paused' ? 'Pausado' : 'Rascunho'}
                                tone={flow.status === 'active' ? 'success' : flow.status === 'paused' ? 'warning' : 'default'}
                              />
                            </div>
                            

                            {/* Trigger pill */}
                            <div className="flex items-center gap-1.5 mb-3">
                              <Zap className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">Gatilho:</span>
                              <span className="text-xs font-medium text-foreground">{triggerSummary(flow.trigger, flow.triggerLabel, funnelStages)}</span>
                            </div>

                            {/* Step trail */}
                            <div className="flex items-center gap-1 flex-wrap">
                              {flow.steps.map((step, i) => {
                                const StepIcon = STEP_ICONS[step.type] ?? GitBranch;
                                const colorClass = STEP_COLORS[step.type] ?? '';
                                return (
                                  <React.Fragment key={step.id}>
                                    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium ${colorClass}`}>
                                      <StepIcon className="w-3 h-3" />
                                      <span>{STEP_NAMES[step.type] || step.label.split(':')[0]}</span>
                                    </div>
                                    {i < flow.steps.length - 1 && (
                                      <ArrowRight className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </div>
                          </div>

                          {/* Stats */}
                          <div className="flex sm:flex-col gap-4 sm:gap-2 sm:items-end flex-shrink-0">
                            <div className="text-center sm:text-right">
                              <p className="text-xs text-muted-foreground">Inscritos</p>
                              <p className="text-lg font-semibold text-foreground">{flow.enrolledLeads}</p>
                            </div>
                            <div className="text-center sm:text-right">
                              <p className="text-xs text-muted-foreground">Conversão</p>
                              {convRate === null ? (
                                <>
                                  <p className="text-lg font-semibold text-muted-foreground">—</p>
                                  <p className="text-[11px] text-muted-foreground">dados insuficientes</p>
                                </>
                              ) : (
                                <p className="text-lg font-semibold text-foreground">{convRate}%</p>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border">
                          <AppButton
                            size="sm"
                            variant="outline"
                            onClick={() => handleToggleStatus(flow.id)}
                          >
                            {flow.status === 'active'
                              ? <><Pause className="w-3.5 h-3.5" /> Pausar</>
                              : <><Play className="w-3.5 h-3.5" /> Ativar</>
                            }
                          </AppButton>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <AppButton size="sm" variant="ghost" className="ml-auto" aria-label="Mais ações">
                                <MoreHorizontal className="w-4 h-4" />
                              </AppButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setEditingFlow(flow)}>
                                <Pencil className="w-4 h-4 mr-2" /> Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDuplicate(flow)}>
                                <Copy className="w-4 h-4 mr-2" /> Duplicar
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openTest(flow)}>
                                <FlaskConical className="w-4 h-4 mr-2" /> Testar com um lead
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openAnalysis(flow)}>
                                <BarChart3 className="w-4 h-4 mr-2" /> Ver resultados
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <AppButton
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            aria-label="Eliminar fluxo"
                            title="Eliminar fluxo"
                            onClick={() => handleDelete(flow)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </AppButton>
                        </div>
                        </div>
                      </DashboardCard>
                    );
                  })}
                </div>
                </>
              )}
            </>
          )}

          {/* ── TEMPLATES TAB ── */}
          {activeTab === 'templates' && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {TEMPLATE_FILTERS.map(filter => (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setTemplateFilter(filter.value)}
                    className={`h-9 rounded-full border px-3.5 text-sm transition-colors ${templateFilter === filter.value
                      ? 'border-foreground/25 bg-muted font-medium text-foreground'
                      : 'border-border text-muted-foreground hover:bg-muted/50'}`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {FLOW_TEMPLATES
                  .filter(template => templateFilter === 'all' || template.channels.includes(templateFilter))
                  .map(template => (
                    <div
                      key={template.id}
                      className="bg-card border border-border rounded-xl p-5 flex flex-col hover:border-foreground/20 hover:shadow-sm transition-all cursor-pointer"
                      onClick={() => setSelectedTemplate(template)}
                    >
                      <div className="flex items-start gap-3 mb-3">
                        <ChannelLogo type={template.channels[0]} className="h-10 w-10" />
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground text-sm">{template.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-3">{template.description}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 mb-3">
                        <Zap className="w-3 h-3 flex-shrink-0 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{triggerSummary(template.trigger, template.triggerLabel, funnelStages)}</span>
                      </div>

                      <div className="flex items-center gap-1 mb-4 flex-wrap">
                        {template.steps.map((step, i) => {
                          const StepIcon = STEP_ICONS[step.type];
                          return (
                            <React.Fragment key={step.id}>
                              <div className={`w-6 h-6 rounded-md flex items-center justify-center ${STEP_COLORS[step.type]}`}>
                                <StepIcon className="w-3 h-3" />
                              </div>
                              {i < template.steps.length - 1 && (
                                <ChevronRight className="w-3 h-3 text-muted-foreground/30" />
                              )}
                            </React.Fragment>
                          );
                        })}
                      </div>

                      <AppButton
                        size="sm"
                        variant="outline"
                        className="mt-auto w-full"
                        onClick={(e) => { e.stopPropagation(); setSelectedTemplate(template); }}
                      >
                        Ver modelo
                      </AppButton>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Modelo por dentro */}
      <AppModal
        open={!!selectedTemplate}
        onOpenChange={(o) => !o && setSelectedTemplate(null)}
        size="md"
        title={selectedTemplate?.name}
        description={selectedTemplate?.description}
        logo={selectedTemplate ? <LogoBox brand={CHANNEL_BRAND[selectedTemplate.channels[0]]} /> : undefined}
        footer={(
          <>
            <AppButton variant="outline" onClick={() => setSelectedTemplate(null)}>Cancelar</AppButton>
            <AppButton onClick={() => selectedTemplate && handleUseTemplate(selectedTemplate)}>Usar modelo</AppButton>
          </>
        )}
      >
        {selectedTemplate && (
          <div className="space-y-3">
            <div className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{triggerSummary(selectedTemplate.trigger, selectedTemplate.triggerLabel, funnelStages)}</span>
            </div>
            <ol className="space-y-2">
              {selectedTemplate.steps.map((step, i) => {
                const StepIcon = STEP_ICONS[step.type];
                return (
                  <li key={step.id} className="flex gap-3 rounded-lg border border-border p-3">
                    <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${STEP_COLORS[step.type]}`}>
                      <StepIcon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{`${i + 1}. ${STEP_NAMES[step.type]}`}</p>
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-muted-foreground" translate="no">{stepDetail(step)}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </AppModal>

      {/* Resultados */}
      <AppModal
        open={!!analysisFlow}
        onOpenChange={(o) => !o && setAnalysisFlow(null)}
        size="md"
        title="Resultados do fluxo"
        description={analysisFlow?.name}
      >
        {analysisFlow && (
          <div className="space-y-4">
            <dl className="divide-y divide-border">
              {[
                ['Leads inscritos', formatNumber(analysisFlow.enrolledLeads)],
                ['Em curso', analysisStats ? formatNumber(analysisStats.active) : '—'],
                ['Responderam', analysisStats ? formatNumber(analysisStats.replied) : '—'],
                ['Convertidos', formatNumber(Math.min(analysisFlow.conversions, analysisFlow.enrolledLeads))],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between py-2.5">
                  <dt className="text-sm text-muted-foreground">{label}</dt>
                  <dd className="text-sm font-semibold tabular-nums text-foreground">{value}</dd>
                </div>
              ))}
              <div className="flex items-center justify-between py-2.5">
                <dt className="text-sm text-muted-foreground">Taxa de conversão</dt>
                <dd className="text-sm font-semibold tabular-nums text-foreground">
                  {analysisFlow.enrolledLeads >= MIN_ENROLLED_FOR_RATE
                    ? formatPercent((Math.min(analysisFlow.conversions, analysisFlow.enrolledLeads) / analysisFlow.enrolledLeads) * 100)
                    : <span className="font-normal text-muted-foreground">Dados insuficientes</span>}
                </dd>
              </div>
            </dl>
            {analysisStats?.recent?.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-foreground">Últimos leads</h3>
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {analysisStats.recent.map((row: any) => (
                    <li key={row.id} className="px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate text-sm text-foreground" translate="no">{row.lead_name || '—'}</span>
                        <span className="flex-shrink-0 text-xs font-medium text-muted-foreground">
                          {row.is_test ? `Teste · ${enrollmentState(row)}` : enrollmentState(row)}
                        </span>
                      </div>
                      {row.last_event?.note && (
                        <p className="mt-0.5 break-words text-xs text-muted-foreground">{row.last_event.note}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </AppModal>

      {/* Testar com um lead */}
      <AppModal
        open={!!testFlow}
        onOpenChange={(o) => !o && setTestFlow(null)}
        size="md"
        title="Testar com um lead"
        description="As mensagens são enviadas mesmo a este lead, com esperas de 20 segundos."
        footer={(
          <>
            <AppButton variant="outline" onClick={() => setTestFlow(null)}>Cancelar</AppButton>
            <AppButton onClick={runTest} disabled={!testLeadId} loading={testSending}>Iniciar teste</AppButton>
          </>
        )}
      >
        <div className="space-y-3">
          <input value={testSearch} onChange={(e) => setTestSearch(e.target.value)} placeholder="Pesquisar lead" className="w-full px-3" />
          {testLeads === null ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {testLeads
                .filter((lead) => matchesSearch(testSearch, lead.name, lead.nome, lead.phone, lead.whatsapp, lead.email))
                .slice(0, 30)
                .map((lead) => (
                  <li key={lead.id}>
                    <button
                      type="button"
                      onClick={() => setTestLeadId(lead.id)}
                      className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50 ${testLeadId === lead.id ? 'bg-muted' : ''}`}
                    >
                      <span className="min-w-0 truncate text-sm text-foreground" translate="no">{lead.name || lead.nome || '—'}</span>
                      <span className="flex-shrink-0 text-xs text-muted-foreground" translate="no">{lead.whatsapp || lead.phone || ''}</span>
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </AppModal>

      {editingFlow && (
        <FlowEditor
          flow={editingFlow}
          isNew={!flows.some(f => f.id === editingFlow.id)}
          onSave={handleSaveEdit}
          onClose={() => setEditingFlow(null)}
          funnelStages={funnelStages}
        />
      )}
    </>
  );
}
