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
  const [filter, setFilter] = useState<'all' | 'today' | 'overdue' | 'upcoming' | 'completed'>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

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

  // O assistente de IA guarda o agendamento no servidor e avisa por WebSocket
  useWebSocket({
    onAiTaskCreated: ({ task }) => {
      void loadTasks();
      toast.success('Agendamento detectado automaticamente', { description: task?.title, duration: 6000 });
    },
  });

  // Filtrar tarefas
  const filteredTasks = tasks.filter(task => {
    // Filtro de status
    if (filter === 'today' && !isToday(new Date(task.dueDate))) return false;
    // Atrasada: hora já passou e continua pendente (também as de hoje)
    if (filter === 'overdue' && !(isPast(new Date(task.dueDate)) && task.status === 'pending')) return false;
    if (filter === 'upcoming' && (isPast(new Date(task.dueDate)) || isToday(new Date(task.dueDate)))) return false;
    if (filter === 'completed' && task.status !== 'completed') return false;
    if (filter === 'all' && task.status === 'completed') return false;

    // Filtro de prioridade
    if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false;

    // Filtro de tipo
    if (typeFilter !== 'all' && task.type !== typeFilter) return false;

    return true;
  });

  // Estatísticas
  const stats = {
    total: tasks.filter(t => t.status !== 'completed').length,
    today: tasks.filter(t => isToday(new Date(t.dueDate)) && t.status !== 'completed').length,
    overdue: tasks.filter(t => isPast(new Date(t.dueDate)) && t.status === 'pending').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    upcoming: tasks.filter(t => !isPast(new Date(t.dueDate)) && !isToday(new Date(t.dueDate)) && t.status !== 'completed').length,
  };
  const [showFilters, setShowFilters] = useState(false);
  const activeFilterCount = (priorityFilter !== 'all' ? 1 : 0) + (typeFilter !== 'all' ? 1 : 0);

  const handleCreateTask = async () => {
    if (!newTask.title.trim()) {
      toast.error('Preencha o título da tarefa');
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
      setShowNewTaskModal(false);
      resetNewTaskForm();
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
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
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

      {/* Lista de Tarefas */}
      <div className="space-y-3">
        {filteredTasks.length === 0 ? (
          tasks.length === 0 ? (
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
            const isOverdue = isPast(new Date(task.dueDate)) && task.status === 'pending';
            const isDueToday = isToday(new Date(task.dueDate));

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
                            <Badge className="gap-1 bg-violet-100 text-violet-700 border-violet-200">
                              IA
 </Badge>
                          )}

                          <Badge className={priorityInfo.color}>
                            <div className={`w-2 h-2 rounded-full ${priorityInfo.dot} mr-1`}></div>
                            {priorityInfo.label}
                          </Badge>

                          <Badge variant="outline" className={`gap-1 ${isOverdue ? 'border-red-500 text-red-600' : isDueToday ? 'border-orange-500 text-orange-600' : ''}`}>
                            <CalendarIcon className="w-3 h-3" />
                            {format(new Date(task.dueDate), "dd 'de' MMMM", { locale: ptBR })}
                          </Badge>

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
      <Dialog open={showNewTaskModal} onOpenChange={setShowNewTaskModal}>
        <DialogContent className="max-w-2xl bg-card border border-border shadow-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-foreground dark:text-foreground">Nova tarefa</DialogTitle>
            <DialogDescription className="sr-only">
              Nova tarefa
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
                disablePast
              />
            </div>

            <div className="flex gap-2 pt-2 [&>*]:flex-1 sm:[&>*]:flex-none sm:justify-end pt-4">
              <Button variant="outline" onClick={() => setShowNewTaskModal(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreateTask}>
                Criar tarefa
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

