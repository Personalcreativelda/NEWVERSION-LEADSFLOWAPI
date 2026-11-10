import { useState, useEffect, useCallback, useRef } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { DateTimePicker, toDateTimeValue } from '../base/DateTimePicker';
import {
  Plus,
  Calendar as CalendarIcon,
  CheckCircle2,
  Pencil,
  Circle,
  Trash2,
  Bell,
  User,
  Phone,
  Mail,
  MessageCircle,
  AlertCircle,
  CheckSquare,
  SlidersHorizontal,
  List,
  LayoutGrid,
} from 'lucide-react';
import { PageHeader } from '../base/PageHeader';
import { AppModal } from '../base/AppModal';
import { AppButton } from '../base/AppButton';
import { EmptyState } from '../base/EmptyState';
import { format, isToday, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from "sonner";
import { useWebSocket } from '../../hooks/useWebSocket';
import { useConfirm } from '../ui/ConfirmDialog';
import { scheduledConversationsApi } from '../../utils/api';
import type { ScheduledConversation } from '../../types';
import { SCHEDULES_CHANGED_EVENT } from '../dashboard/FunnelReminders';
import { googleCalendarApi, type GoogleCalendarEvent } from '../../services/api/assistants';
import { BrandIcon } from '../base/BrandIcon';
import { isNativeApp, openBrowser } from '../../../native';

const notifySchedulesChanged = () => window.dispatchEvent(new Event(SCHEDULES_CHANGED_EVENT));

interface Task {
  id: string;
  title: string;
  description?: string;
  leadId?: string;
  leadName?: string;
  type: 'call' | 'email' | 'whatsapp' | 'meeting' | 'follow-up' | 'other';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'completed' | 'cancelled';
  dueDate: string;
  reminderDate?: string;
  createdAt: string;
  completedAt?: string;
  notes?: string;
  /** Quem criou: assistente de IA, resumo da inbox, ficha do lead ou esta página */
  source?: string;
  /** Evento correspondente no Google Calendar (as tarefas vão para lá sozinhas) */
  calendarEventId?: string;
  /** Evento que só existe no Google Calendar: aparece na lista mas edita-se lá */
  external?: 'google';
  allDay?: boolean;
}

/** Evento do Google Calendar → item da lista (só leitura) */
function googleToTask(ev: GoogleCalendarEvent): Task {
  const start = ev.allDay ? `${ev.start}T00:00:00` : ev.start;
  const end = new Date(ev.allDay ? `${ev.end}T00:00:00` : ev.end);
  return {
    id: `google:${ev.id}`,
    title: ev.summary,
    description: ev.location || undefined,
    type: 'meeting',
    priority: 'medium',
    // Já acabou → vai para "Concluídas"; nunca fica "Atrasada"
    status: end.getTime() < Date.now() ? 'completed' : 'pending',
    dueDate: new Date(start).toISOString(),
    createdAt: new Date(start).toISOString(),
    external: 'google',
    allDay: ev.allDay,
  };
}

const LEGACY_KEY = 'leadsflow_tasks';
const MIGRATED_KEY = 'leadsflow_tasks_migrated';

/** Agendamento guardado no servidor → tarefa desta página */
function toTask(s: ScheduledConversation, leads: any[]): Task {
  const meta = s.metadata || {};
  const lead = s.lead_id ? leads.find((l) => l.id === s.lead_id) : undefined;
  return {
    id: s.id,
    title: s.title,
    description: s.description || undefined,
    leadId: s.lead_id || undefined,
    leadName: s.lead_name || lead?.nome || lead?.name,
    type: (meta.type as Task['type']) || 'follow-up',
    priority: (meta.priority as Task['priority']) || 'medium',
    status: s.status,
    dueDate: s.scheduled_at,
    reminderDate: typeof meta.reminder_at === 'string' ? meta.reminder_at : undefined,
    createdAt: s.created_at,
    completedAt: meta.completed_at,
    notes: meta.notes,
    source: meta.source,
    calendarEventId: typeof meta.calendar_event_id === 'string' ? meta.calendar_event_id : undefined,
  };
}

interface TaskManagerProps {
  leads: any[];
  isDark?: boolean;
}

const TASK_TYPES = [
  { value: 'call', label: 'Ligar', icon: Phone, color: 'text-blue-600' },
  { value: 'email', label: 'Enviar email', icon: Mail, color: 'text-purple-600' },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, color: 'text-green-600' },
  { value: 'meeting', label: 'Reunião', icon: User, color: 'text-orange-600' },
  { value: 'follow-up', label: 'Follow-up', icon: Bell, color: 'text-pink-600' },
  { value: 'other', label: 'Outro', icon: Circle, color: 'text-foreground/80' },
];

const PRIORITY_LEVELS = [
  { value: 'low', label: 'Baixa', color: 'bg-muted text-foreground/80', dot: 'bg-muted-foreground/70' },
  { value: 'medium', label: 'Média', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  { value: 'high', label: 'Alta', color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  { value: 'urgent', label: 'Urgente', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
];

export default function TaskManager({ leads, isDark = false }: TaskManagerProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  /** Tarefa a ser editada no mesmo formulário (null = nova) */
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'today' | 'overdue' | 'upcoming' | 'completed'>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  // Lista ou mosaico (cartões em grelha); fica guardado neste aparelho
  const [view, setView] = useState<'list' | 'tiles'>(() => {
    try { return localStorage.getItem('leadsflow_tasks_view') === 'tiles' ? 'tiles' : 'list'; } catch { return 'list'; }
  });
  const changeView = (v: 'list' | 'tiles') => {
    setView(v);
    try { localStorage.setItem('leadsflow_tasks_view', v); } catch { /* sem armazenamento */ }
  };

  // Formulário de nova tarefa
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    leadId: '',
    type: 'call',
    priority: 'medium',
    dueDate: new Date(),
    reminderDate: undefined as Date | undefined,
    notes: '',
  });

  const confirm = useConfirm();
  const leadsRef = useRef(leads);
  leadsRef.current = leads;

  // Agendamentos no servidor: os da ficha do lead, do assistente de IA e desta página
  const loadTasks = useCallback(async () => {
    try {
      const list = await scheduledConversationsApi.getAll();
      setTasks((Array.isArray(list) ? list : []).map((s) => toTask(s, leadsRef.current)));
    } catch {
      // Sem servidor: fica o que já está no ecrã
    }
  }, []);

  // Tarefas antigas que só existiam neste browser passam para o servidor. Quem decide é o
  // servidor (uma só vez por conta): feito por aparelho, cada telemóvel ou browser novo voltava
  // a criar as tarefas já apagadas e duplicava as outras.
  useEffect(() => {
    (async () => {
      let legacy: Task[] = [];
      try {
        if (!localStorage.getItem(MIGRATED_KEY)) legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
      } catch { legacy = []; }
      try {
        if (Array.isArray(legacy) && legacy.length > 0) {
          await scheduledConversationsApi.importLegacy(legacy.map((t) => ({
            lead_id: t.leadId || null,
            title: t.title || 'Tarefa',
            description: t.description,
            scheduled_at: t.dueDate,
            status: t.status,
            metadata: { type: t.type, priority: t.priority, notes: t.notes, source: (t as any).source || 'tasks_page', reminder_at: t.reminderDate },
          })));
        }
        localStorage.setItem(MIGRATED_KEY, new Date().toISOString());
      } catch { /* sem servidor ou sem armazenamento: tenta da próxima vez */ }
      await loadTasks();
    })();
  }, [loadTasks]);

  // O assistente de IA marca, remarca ou desmarca no servidor e avisa por WebSocket
  useWebSocket({
    onAiTaskCreated: ({ task }) => {
      void loadTasks();
      const change = task?.change;
      toast.success(
        change === 'cancelled' ? 'O assistente desmarcou uma marcação'
          : change === 'rescheduled' ? 'O assistente remarcou uma marcação'
          : 'Nova marcação do assistente',
        { description: task?.title, duration: 6000 },
      );
    },
  });

  // ── Google Calendar: os assistentes veem os horários ocupados e marcam lá ──
  const [calendar, setCalendar] = useState<{ configured: boolean; connected: boolean; email: string | null } | null>(null);
  const [calendarBusy, setCalendarBusy] = useState(false);
  const refreshCalendar = useCallback(() => { googleCalendarApi.status().then(setCalendar).catch(() => setCalendar(null)); }, []);
  useEffect(() => { refreshCalendar(); }, [refreshCalendar]);

  // Próximos 30 dias do calendário ligado: entram na lista junto com as tarefas
  const [calendarEvents, setCalendarEvents] = useState<GoogleCalendarEvent[] | null>(null);
  useEffect(() => {
    if (!calendar?.connected) { setCalendarEvents(null); return; }
    let alive = true;
    googleCalendarApi.events(30)
      .then((list) => { if (alive) setCalendarEvents(list); })
      .catch((err: any) => {
        if (!alive) return;
        setCalendarEvents([]);
        if (err?.response?.status === 409) toast.error('Ligue o Google Calendar de novo.');
        if (err?.response?.status === 404) refreshCalendar();
      });
    return () => { alive = false; };
  }, [calendar?.connected, refreshCalendar]);

  useEffect(() => {
    const done = (params: Record<string, string>) => {
      setCalendarBusy(false);
      if (params.calendar === 'connected') { toast.success('Google Calendar ligado'); refreshCalendar(); }
      else if (params.calendar === 'error') toast.error('Não foi possível ligar o Google Calendar. Tente de novo.');
    };
    const onApp = (e: Event) => done((e as CustomEvent).detail || {});
    const apiOrigin = (() => { try { return new URL(import.meta.env.VITE_API_URL || 'https://api.leadsflowapi.com').origin; } catch { return ''; } })();
    const onMessage = (e: MessageEvent) => { if (e.origin === apiOrigin && e.data?.type === 'leadsflow-calendar') done(e.data); };
    window.addEventListener('leadsflow-calendar', onApp);
    window.addEventListener('message', onMessage);
    return () => { window.removeEventListener('leadsflow-calendar', onApp); window.removeEventListener('message', onMessage); };
  }, [refreshCalendar]);

  const connectCalendar = async () => {
    const native = isNativeApp();
    const popup = native ? null : window.open('', 'leadsflow-calendar', 'width=560,height=720');
    try {
      setCalendarBusy(true);
      const url = await googleCalendarApi.start(native ? 'app' : 'web');
      if (native) { await openBrowser(url); return; }
      if (popup) {
        popup.location.href = url;
        const timer = window.setInterval(() => { if (popup.closed) { window.clearInterval(timer); setCalendarBusy(false); refreshCalendar(); } }, 800);
      } else {
        window.location.href = url;
      }
    } catch (err: any) {
      popup?.close();
      setCalendarBusy(false);
      toast.error(err?.response?.data?.error || 'Não foi possível abrir o Google Calendar.');
    }
  };

  const disconnectCalendar = async () => {
    const ok = await confirm('Os assistentes deixam de ver o Google Calendar e de marcar lá.', { title: 'Desligar o Google Calendar?', confirmLabel: 'Desligar', variant: 'danger' });
    if (!ok) return;
    try { await googleCalendarApi.disconnect(); refreshCalendar(); } catch { toast.error('Não foi possível desligar.'); }
  };

  // Tarefas + eventos que só existem no Google (os das tarefas já estão na lista)
  const linkedEvents = new Set(tasks.map((t) => t.calendarEventId).filter(Boolean));
  const googleItems = (calendarEvents || []).filter((ev) => !linkedEvents.has(ev.id)).map(googleToTask);
  const allItems = googleItems.length ? [...tasks, ...googleItems].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()) : tasks;
  const overdueOf = (t: Task) => !t.external && isPast(new Date(t.dueDate)) && t.status === 'pending';

  // Filtrar tarefas
  const filteredTasks = allItems.filter(task => {
    // Filtro de status
    if (filter === 'today' && !isToday(new Date(task.dueDate))) return false;
    // Atrasada: hora já passou e continua pendente (também as de hoje)
    if (filter === 'overdue' && !overdueOf(task)) return false;
    if (filter === 'upcoming' && (isPast(new Date(task.dueDate)) || isToday(new Date(task.dueDate)))) return false;
    if (filter === 'completed' && task.status === 'pending') return false;
    if (filter !== 'completed' && task.status === 'cancelled') return false;
    if (filter === 'all' && task.status === 'completed') return false;

    // Filtro de prioridade
    if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false;

    // Filtro de tipo
    if (typeFilter !== 'all' && task.type !== typeFilter) return false;

    return true;
  });

  // Estatísticas
  const stats = {
    total: allItems.filter(t => t.status === 'pending').length,
    today: allItems.filter(t => isToday(new Date(t.dueDate)) && t.status === 'pending').length,
    overdue: allItems.filter(overdueOf).length,
    completed: allItems.filter(t => t.status !== 'pending').length,
    upcoming: allItems.filter(t => !isPast(new Date(t.dueDate)) && !isToday(new Date(t.dueDate)) && t.status === 'pending').length,
  };
  const [showFilters, setShowFilters] = useState(false);
  const activeFilterCount = (priorityFilter !== 'all' ? 1 : 0) + (typeFilter !== 'all' ? 1 : 0);

  const openEditTask = (task: Task) => {
    setEditingTaskId(task.id);
    setNewTask({
      title: task.title,
      description: task.description || '',
      leadId: task.leadId || '',
      type: task.type,
      priority: task.priority,
      dueDate: new Date(task.dueDate),
      reminderDate: task.reminderDate ? new Date(task.reminderDate) : undefined,
      notes: task.notes || '',
    });
    setShowNewTaskModal(true);
  };

  const closeTaskModal = (open = false) => {
    setShowNewTaskModal(open);
    if (!open) {
      setEditingTaskId(null);
      resetNewTaskForm();
    }
  };

  const handleCreateTask = async () => {
    if (!newTask.title.trim()) {
      toast.error('Preencha o título da tarefa');
      return;
    }
    if (editingTaskId) {
      try {
        const updated = await scheduledConversationsApi.update(editingTaskId, {
          lead_id: newTask.leadId || null,
          title: newTask.title.trim(),
          description: newTask.description || '',
          scheduled_at: newTask.dueDate.toISOString(),
          metadata: { type: newTask.type, priority: newTask.priority, notes: newTask.notes || undefined },
        });
        setTasks((prev) => prev.map((t) => (t.id === editingTaskId ? toTask(updated, leads) : t)));
        closeTaskModal();
        toast.success('Tarefa atualizada');
        notifySchedulesChanged();
      } catch (err: any) {
        toast.error(err?.message || 'Não foi possível atualizar a tarefa');
      }
      return;
    }
    try {
      const created = await scheduledConversationsApi.create({
        lead_id: newTask.leadId || null,
        title: newTask.title.trim(),
        description: newTask.description || undefined,
        scheduled_at: newTask.dueDate.toISOString(),
        metadata: {
          type: newTask.type,
          priority: newTask.priority,
          notes: newTask.notes || undefined,
          reminder_at: newTask.reminderDate?.toISOString(),
          source: 'tasks_page',
        },
      });
      setTasks((prev) => [toTask(created, leads), ...prev]);
      closeTaskModal();
      toast.success('Tarefa criada');
      notifySchedulesChanged();
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível criar a tarefa');
    }
  };

  const handleToggleTask = async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const status: Task['status'] = task.status === 'completed' ? 'pending' : 'completed';
    const completedAt = status === 'completed' ? new Date().toISOString() : undefined;
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status, completedAt } : t)));
    try {
      await scheduledConversationsApi.update(taskId, { status, metadata: { completed_at: completedAt ?? null } as any });
      notifySchedulesChanged();
    } catch (err: any) {
      setTasks((prev) => prev.map((t) => (t.id === taskId ? task : t)));
      toast.error(err?.message || 'Não foi possível atualizar a tarefa');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    const ok = await confirm('Apagar esta tarefa?', { title: 'Apagar tarefa', variant: 'danger', confirmLabel: 'Apagar' });
    if (!ok) return;
    const before = tasks;
    // O evento sai do Google com a tarefa: não pode voltar a aparecer como evento solto
    const eventId = tasks.find((t) => t.id === taskId)?.calendarEventId;
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    if (eventId) setCalendarEvents((prev) => prev && prev.filter((ev) => ev.id !== eventId));
    try {
      await scheduledConversationsApi.delete(taskId);
      toast.success('Tarefa apagada');
      notifySchedulesChanged();
    } catch (err: any) {
      setTasks(before);
      toast.error(err?.message || 'Não foi possível apagar a tarefa');
    }
  };

  const resetNewTaskForm = () => {
    setNewTask({
      title: '',
      description: '',
      leadId: '',
      type: 'call',
      priority: 'medium',
      dueDate: new Date(),
      reminderDate: undefined,
      notes: '',
    });
  };

  const getTaskTypeInfo = (type: string) => {
    return TASK_TYPES.find(t => t.value === type) || TASK_TYPES[5];
  };

  const getPriorityInfo = (priority: string) => {
    return PRIORITY_LEVELS.find(p => p.value === priority) || PRIORITY_LEVELS[1];
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tarefas e lembretes"
        description="Atividades e lembretes da sua equipa"
        icon={CheckSquare}
        create={{ label: 'Nova tarefa', onClick: () => setShowNewTaskModal(true) }}
      />

      {calendar?.configured && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <BrandIcon brand="googlecalendar" className="h-5 w-5 flex-shrink-0" />
          {calendar.connected ? (
            <>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">Google Calendar</p>
                <p className="truncate text-xs text-muted-foreground" translate="no">{calendar.email || 'Ligado'}</p>
              </div>
              <button type="button" onClick={() => void disconnectCalendar()} className="h-10 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
                Desligar
              </button>
            </>
          ) : (
            <>
              <p className="min-w-0 flex-1 text-sm text-foreground">Google Calendar</p>
              <button
                type="button"
                onClick={() => void connectCalendar()}
                disabled={calendarBusy}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                Ligar
                {calendarBusy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
              </button>
            </>
          )}
        </div>
      )}

      {/* Separadores com o número de cada um (em vez de 4 cartões) + botão de filtros */}
      <div className="flex items-center gap-2 border-b border-border">
        <div
          className="flex min-w-0 flex-1 gap-1 overflow-x-auto scrollbar-none pr-6"
          style={{ maskImage: 'linear-gradient(to right, black calc(100% - 24px), transparent)', WebkitMaskImage: 'linear-gradient(to right, black calc(100% - 24px), transparent)' }}
        >
          {([
            ['all', 'Todas', stats.total],
            ['today', 'Hoje', stats.today],
            ['overdue', 'Atrasadas', stats.overdue],
            ['upcoming', 'Próximas', stats.upcoming],
            ['completed', 'Concluídas', stats.completed],
          ] as const).map(([f, label, count]) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`-mb-px flex flex-shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${filter === f ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              {label}
              <span className={`min-w-[20px] rounded-full px-1.5 text-center text-xs font-semibold tabular-nums ${filter === f ? 'bg-primary text-primary-foreground' : f === 'overdue' && count > 0 ? 'bg-red-500/15 text-red-600 dark:text-red-400' : 'bg-muted text-muted-foreground'}`}>
                {count}
              </span>
            </button>
          ))}
        </div>
        <div className="mb-1 flex flex-shrink-0 items-center rounded-lg bg-muted p-0.5" role="group" aria-label="Vista">
          {([['list', List, 'Lista'], ['tiles', LayoutGrid, 'Mosaico']] as const).map(([v, VIcon, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => changeView(v)}
              aria-pressed={view === v}
              aria-label={label}
              title={label}
              className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${view === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <VIcon className="h-4 w-4" />
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setShowFilters(true)}
          className={`relative mb-1 inline-flex h-9 flex-shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium hover:bg-muted ${activeFilterCount ? 'text-primary' : 'text-muted-foreground'}`}
          aria-label="Filtrar"
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span className="hidden sm:inline">Filtrar</span>
          {activeFilterCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">{activeFilterCount}</span>
          )}
        </button>
      </div>

      <AppModal
        open={showFilters}
        onOpenChange={setShowFilters}
        size="sm"
        title="Filtrar tarefas"
        footer={
          <>
            <button
              type="button"
              onClick={() => { setPriorityFilter('all'); setTypeFilter('all'); setShowFilters(false); }}
              className="h-10 rounded-lg border border-border px-4 text-sm font-medium text-foreground hover:bg-muted"
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={() => setShowFilters(false)}
              className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Ver tarefas
            </button>
          </>
        }
      >
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-sm font-medium text-foreground">Prioridade</p>
            <div className="flex flex-wrap gap-2">
              {[{ value: 'all', label: 'Todas' }, ...PRIORITY_LEVELS].map(p => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriorityFilter(p.value)}
                  className={`h-9 rounded-full border px-3.5 text-sm ${priorityFilter === p.value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-foreground">Tipo</p>
            <div className="flex flex-wrap gap-2">
              {[{ value: 'all', label: 'Todos' }, ...TASK_TYPES].map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTypeFilter(t.value)}
                  className={`h-9 rounded-full border px-3.5 text-sm ${typeFilter === t.value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </AppModal>

      {/* Lista de Tarefas (ou mosaico) */}
      <div className={filteredTasks.length > 0 && view === 'tiles' ? 'grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4' : 'space-y-3'}>
        {filteredTasks.length === 0 ? (
          allItems.length === 0 ? (
            <EmptyState
              icon={CheckSquare}
              title="Ainda não tem tarefas"
              description="Crie tarefas e lembretes para não perder nenhum seguimento."
              action={<AppButton onClick={() => setShowNewTaskModal(true)}><Plus />Criar tarefa</AppButton>}
            />
          ) : (
            <EmptyState
              icon={CheckCircle2}
              title="Nada por aqui"
              description={activeFilterCount ? 'Nenhuma tarefa com estes filtros.' : 'Não há tarefas neste separador.'}
              action={activeFilterCount ? <AppButton variant="outline" onClick={() => { setPriorityFilter('all'); setTypeFilter('all'); }}>Limpar filtros</AppButton> : undefined}
            />
          )
        ) : (
          filteredTasks.map(task => {
            const typeInfo = getTaskTypeInfo(task.type);
            const priorityInfo = getPriorityInfo(task.priority);
            const Icon = typeInfo.icon;
            const isOverdue = overdueOf(task);
            const isDueToday = isToday(new Date(task.dueDate));
            const done = task.status === 'completed';
            const when = task.allDay
              ? `${format(new Date(task.dueDate), view === 'tiles' ? 'dd MMM' : "dd 'de' MMMM", { locale: ptBR })} · Dia todo`
              : format(new Date(task.dueDate), view === 'tiles' ? 'dd MMM, HH:mm' : "dd 'de' MMMM, HH:mm", { locale: ptBR });

            // Evento só do Google Calendar: mostra-se aqui, edita-se no calendário
            if (task.external === 'google') {
              return (
                <Card
                  key={task.id}
                  className={`flex min-w-0 items-start gap-3 p-4 bg-card border-border ${done ? 'opacity-60' : ''} ${view === 'tiles' ? 'flex-col' : ''}`}
                >
                  <BrandIcon brand="googlecalendar" className="mt-0.5 h-5 w-5 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-medium text-foreground" translate="no">{task.title}</h3>
                    {task.description && <p className="truncate text-sm text-muted-foreground" translate="no">{task.description}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={`gap-1 ${isDueToday && !done ? 'border-orange-500 text-orange-600' : ''}`}>
                        <CalendarIcon className="w-3 h-3" />
                        {when}
                      </Badge>
                      <Badge variant="outline" className="text-muted-foreground">Google Calendar</Badge>
                    </div>
                  </div>
                </Card>
              );
            }

            if (view === 'tiles') {
              return (
                <Card
                  key={task.id}
                  className={`flex min-w-0 flex-col gap-3 p-4 transition-colors bg-card border-border hover:bg-muted/40 ${done ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={done}
                      onCheckedChange={() => handleToggleTask(task.id)}
                      aria-label={done ? 'Marcar por fazer' : 'Concluir'}
                    />
                    <span className={`flex h-7 w-7 items-center justify-center rounded-lg bg-muted ${typeInfo.color}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{typeInfo.label}</span>
                    <button
                      type="button"
                      onClick={() => openEditTask(task)}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label="Editar tarefa"
                      title="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteTask(task.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-red-600 hover:bg-red-500/10"
                      aria-label="Apagar tarefa"
                      title="Apagar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <button type="button" onClick={() => openEditTask(task)} className="flex min-w-0 flex-1 flex-col items-start justify-start text-left">
                    <h3 className={`line-clamp-2 font-medium text-foreground ${done ? 'line-through' : ''}`}>{task.title}</h3>
                    {task.description && (
                      <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{task.description}</p>
                    )}
                  </button>

                  <div className="space-y-2 border-t border-border pt-3 text-xs">
                    <div className={`flex items-center gap-1.5 font-medium ${isOverdue ? 'text-red-600 dark:text-red-400' : isDueToday ? 'text-orange-600 dark:text-orange-400' : 'text-muted-foreground'}`}>
                      {isOverdue ? <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" /> : <CalendarIcon className="h-3.5 w-3.5 flex-shrink-0" />}
                      <span className="truncate">{when}</span>
                      {isOverdue && <><span aria-hidden>·</span><span className="flex-shrink-0">Atrasada</span></>}
                      {task.status === 'cancelled' && <><span aria-hidden>·</span><span className="flex-shrink-0">Desmarcada</span></>}
                    </div>
                    <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
                      {task.leadName && (
                        <span className="flex min-w-0 items-center gap-1">
                          <User className="h-3.5 w-3.5 flex-shrink-0" />
                          <span translate="no" className="truncate">{task.leadName}</span>
                        </span>
                      )}
                      <span className="ml-auto flex flex-shrink-0 items-center gap-1.5">
                        {(task as any).source === 'ai_assistant' && (
                          <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-violet-600 dark:text-violet-400">IA</span>
                        )}
                        <span className="flex items-center gap-1" title="Prioridade">
                          <span className={`h-2 w-2 rounded-full ${priorityInfo.dot}`} />
                          {priorityInfo.label}
                        </span>
                      </span>
                    </div>
                  </div>
                </Card>
              );
            }

            return (
              <Card
                key={task.id}
                className={`p-4 transition-all bg-card dark:bg-card border-border dark:border-border hover:bg-muted/50 dark:hover:bg-muted/50 ${task.status === 'completed' ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start gap-4">
                  <Checkbox
                    checked={task.status === 'completed'}
                    onCheckedChange={() => handleToggleTask(task.id)}
                    className="mt-1"
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Icon className={`w-4 h-4 ${typeInfo.color}`} />
                          <h3
                            className={`text-foreground ${task.status === 'completed' ? 'line-through' : ''
                              }`}
                          >
                            {task.title}
                          </h3>
                        </div>

                        {task.description && (
                          <p className="text-sm text-foreground/80 mb-2">
                            {task.description}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          {task.leadName && (
                            <Badge variant="outline" className="gap-1">
                              <User className="w-3 h-3" />
                              {task.leadName}
                            </Badge>
                          )}

                          {(task as any).source === 'ai_assistant' && (
                            <Badge className="gap-1 bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30">
                              IA
 </Badge>
                          )}

                          <Badge className={priorityInfo.color}>
                            <div className={`w-2 h-2 rounded-full ${priorityInfo.dot} mr-1`}></div>
                            {priorityInfo.label}
                          </Badge>

                          <Badge variant="outline" className={`gap-1 ${isOverdue ? 'border-red-500 text-red-600' : isDueToday ? 'border-orange-500 text-orange-600' : ''}`}>
                            <CalendarIcon className="w-3 h-3" />
                            {when}
                          </Badge>

                          {task.status === 'cancelled' && (
                            <Badge variant="outline" className="text-muted-foreground">Desmarcada</Badge>
                          )}
                          {isOverdue && (
                            <Badge variant="destructive" className="gap-1">
                              <AlertCircle className="w-3 h-3" />
                              Atrasada
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Editar tarefa"
                          title="Editar"
                          onClick={() => openEditTask(task)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteTask(task.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Modal de Nova Tarefa */}
      <Dialog open={showNewTaskModal} onOpenChange={closeTaskModal}>
        <DialogContent className="max-w-2xl bg-card border border-border shadow-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-foreground dark:text-foreground">{editingTaskId ? 'Editar tarefa' : 'Nova tarefa'}</DialogTitle>
            <DialogDescription className="sr-only">
              {editingTaskId ? 'Editar tarefa' : 'Nova tarefa'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div>
              <label className="text-sm mb-2 block text-muted-foreground">
                Título *
              </label>
              <Input
                value={newTask.title}
                onChange={e => setNewTask({ ...newTask, title: e.target.value })}
                placeholder="Ex: Ligar para cliente..."
                className="!bg-card !text-foreground !border-border"
              />
            </div>

            <div>
              <label className="text-sm mb-2 block text-muted-foreground">
                Descrição
              </label>
              <Textarea
                value={newTask.description}
                onChange={e => setNewTask({ ...newTask, description: e.target.value })}
                placeholder="Detalhes da tarefa..."
                rows={3}
                className="!bg-card !text-foreground !border-border"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm mb-2 block text-muted-foreground">
                  Tipo
                </label>
                <Select value={newTask.type} onValueChange={type => setNewTask({ ...newTask, type })}>
                  <SelectTrigger className="bg-background text-foreground border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="text-popover-foreground border-border shadow-md max-h-[200px] z-[9999]">
                    {TASK_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value} className="text-popover-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer">{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm mb-2 block text-muted-foreground">
                  Prioridade
                </label>
                <Select value={newTask.priority} onValueChange={priority => setNewTask({ ...newTask, priority })}>
                  <SelectTrigger className="bg-background text-foreground border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="text-popover-foreground border-border shadow-md z-[9999]">
                    {PRIORITY_LEVELS.map(p => (
                      <SelectItem key={p.value} value={p.value} className="text-popover-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer">{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-sm mb-2 block text-muted-foreground">
                Lead relacionado
              </label>
              <Select
                value={newTask.leadId || 'none'}
                onValueChange={leadId => setNewTask({ ...newTask, leadId: leadId === 'none' ? '' : leadId })}
              >
                <SelectTrigger className="!bg-card !text-foreground !border-border">
                  <SelectValue placeholder="Selecione um lead..." />
                </SelectTrigger>
                <SelectContent className="!bg-card border border-border shadow-lg max-h-[200px] z-[9999]">
                  <SelectItem value="none" className="cursor-pointer !text-foreground hover:bg-muted focus:bg-muted">Nenhum lead</SelectItem>
                  {leads.filter(lead => lead.id).map(lead => (
                    <SelectItem key={lead.id} value={lead.id} className="cursor-pointer !text-foreground hover:bg-muted focus:bg-muted">
                      {lead.nome} {lead.empresa ? `- ${lead.empresa}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm mb-2 block text-muted-foreground">
                Data e hora
              </label>
              <DateTimePicker
                value={toDateTimeValue(newTask.dueDate)}
                onChange={(value) => setNewTask({ ...newTask, dueDate: new Date(value) })}
                disablePast={!editingTaskId}
              />
            </div>

            <div className="flex gap-2 pt-2 [&>*]:flex-1 sm:[&>*]:flex-none sm:justify-end pt-4">
              <Button variant="outline" onClick={() => closeTaskModal()}>
                Cancelar
              </Button>
              <Button onClick={handleCreateTask}>
                {editingTaskId ? 'Guardar' : 'Criar tarefa'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

