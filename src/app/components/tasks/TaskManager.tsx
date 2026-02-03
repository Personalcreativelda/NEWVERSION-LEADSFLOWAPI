import { useState, useEffect } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Calendar } from '../ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import {
  Plus,
  Calendar as CalendarIcon,
  Clock,
  CheckCircle2,
  Circle,
  Trash2,
  Edit2,
  Bell,
  User,
  Phone,
  Mail,
  MessageCircle,
  AlertCircle,
  Filter,
  X
} from 'lucide-react';
import { format, isAfter, isBefore, isToday, isPast, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from "sonner";

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
}

interface TaskManagerProps {
  leads: any[];
  isDark?: boolean;
}

const TASK_TYPES = [
  { value: 'call', label: 'Ligar', icon: Phone, color: 'text-blue-600' },
  { value: 'email', label: 'Enviar Email', icon: Mail, color: 'text-purple-600' },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, color: 'text-green-600' },
  { value: 'meeting', label: 'Reunião', icon: User, color: 'text-orange-600' },
  { value: 'follow-up', label: 'Follow-up', icon: Bell, color: 'text-pink-600' },
  { value: 'other', label: 'Outro', icon: Circle, color: 'text-gray-700 dark:text-gray-300' },
];

const PRIORITY_LEVELS = [
  { value: 'low', label: 'Baixa', color: 'bg-gray-100 text-gray-700', dot: 'bg-gray-400' },
  { value: 'medium', label: 'Média', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  { value: 'high', label: 'Alta', color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  { value: 'urgent', label: 'Urgente', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
];

export default function TaskManager({ leads, isDark = false }: TaskManagerProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
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

  // Load tasks from localStorage
  useEffect(() => {
    const savedTasks = localStorage.getItem('leadsflow_tasks');
    if (savedTasks) {
      setTasks(JSON.parse(savedTasks));
    }
  }, []);

  // Save tasks to localStorage
  useEffect(() => {
    localStorage.setItem('leadsflow_tasks', JSON.stringify(tasks));
  }, [tasks]);

  // Filtrar tarefas
  const filteredTasks = tasks.filter(task => {
    // Filtro de status
    if (filter === 'today' && !isToday(new Date(task.dueDate))) return false;
    if (filter === 'overdue' && !isPast(new Date(task.dueDate)) && task.status === 'pending') return false;
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
    overdue: tasks.filter(t => isPast(new Date(t.dueDate)) && !isToday(new Date(t.dueDate)) && t.status === 'pending').length,
    completed: tasks.filter(t => t.status === 'completed').length,
  };

  const handleCreateTask = () => {
    if (!newTask.title.trim()) {
      toast.error('Por favor, preencha o título da tarefa');
      return;
    }

    const lead = leads.find(l => l.id === newTask.leadId);

    const task: Task = {
      id: `task-${Date.now()}`,
      title: newTask.title,
      description: newTask.description,
      leadId: newTask.leadId,
      leadName: lead?.nome,
      type: newTask.type as any,
      priority: newTask.priority as any,
      status: 'pending',
      dueDate: newTask.dueDate.toISOString(),
      reminderDate: newTask.reminderDate?.toISOString(),
      createdAt: new Date().toISOString(),
      notes: newTask.notes,
    };

    setTasks([task, ...tasks]);
    setShowNewTaskModal(false);
    resetNewTaskForm();
    toast.success('Tarefa criada com sucesso!');
  };

  const handleToggleTask = (taskId: string) => {
    setTasks(tasks.map(task => {
      if (task.id === taskId) {
        const newStatus = task.status === 'completed' ? 'pending' : 'completed';
        return {
          ...task,
          status: newStatus,
          completedAt: newStatus === 'completed' ? new Date().toISOString() : undefined,
        };
      }
      return task;
    }));
  };

  const handleDeleteTask = (taskId: string) => {
    if (confirm('Tem certeza que deseja deletar esta tarefa?')) {
      setTasks(tasks.filter(t => t.id !== taskId));
      toast.success('Tarefa deletada');
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
    <div className="space-y-6 px-4 md:px-0">
      {/* Header com ação destacada */}
      <div className="pt-6 pb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2 min-w-0">
          <h1
            className="text-2xl md:text-[32px] font-semibold text-[#1F2937] dark:text-[#F1F5F9] truncate"
            style={{ letterSpacing: '-0.5px' }}
          >
            Tarefas e Follow-ups
          </h1>
          <p className="text-sm md:text-[15px] text-[#6B7280] dark:text-[#6B7280]">
            Gerencie suas atividades e lembretes
          </p>
        </div>
        <Button
          onClick={() => setShowNewTaskModal(true)}
          className="gap-2 px-4 md:px-5 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white shadow-sm shadow-[#2563EB]/15 transition flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nova Tarefa</span>
          <span className="sm:hidden">Nova</span>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 bg-card dark:bg-card border-border dark:border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground dark:text-muted-foreground">Total Pendentes</p>
              <p className="text-2xl mt-1 text-foreground dark:text-foreground">{stats.total}</p>
            </div>
            <Circle className="w-8 h-8 text-blue-600" />
          </div>
        </Card>

        <Card className="p-4 bg-card dark:bg-card border-border dark:border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground dark:text-muted-foreground">Para Hoje</p>
              <p className={`text-2xl mt-1 text-orange-600`}>{stats.today}</p>
            </div>
            <Clock className="w-8 h-8 text-orange-600" />
          </div>
        </Card>

        <Card className="p-4 bg-card dark:bg-card border-border dark:border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground dark:text-muted-foreground">Atrasadas</p>
              <p className={`text-2xl mt-1 text-red-600`}>{stats.overdue}</p>
            </div>
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
        </Card>

        <Card className="p-4 bg-card dark:bg-card border-border dark:border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground dark:text-muted-foreground">Concluídas</p>
              <p className={`text-2xl mt-1 text-green-600`}>{stats.completed}</p>
            </div>
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
        </Card>
      </div>


      {/* Filtros */}
      <Card className="p-4 bg-card border-border overflow-hidden">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex items-center gap-3">
            <Filter className="w-5 h-5 text-gray-500 dark:text-gray-400 flex-shrink-0 hidden md:block" />

            <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide">
              {['all', 'today', 'overdue', 'upcoming', 'completed'].map(f => (
                <Button
                  key={f}
                  variant="ghost"
                  size="sm"
                  onClick={() => setFilter(f as any)}
                  className={`transition-colors flex-shrink-0 ${filter === f
                    ? '!bg-blue-600 !text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                >
                  {f === 'all' && 'Todas'}
                  {f === 'today' && 'Hoje'}
                  {f === 'overdue' && 'Atrasadas'}
                  {f === 'upcoming' && 'Próximas'}
                  {f === 'completed' && 'Concluídas'}
                </Button>
              ))}
            </div>
          </div>

          <div className="hidden md:block h-6 w-px bg-gray-300 dark:bg-gray-600" />

          <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide">
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-[140px] bg-background text-foreground border-border flex-shrink-0">
                <SelectValue placeholder="Prioridade" />
              </SelectTrigger>
              <SelectContent className="text-popover-foreground border-border shadow-md">
                <SelectItem value="all" className="text-popover-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer">Todas Prioridades</SelectItem>
                {PRIORITY_LEVELS.map(p => (
                  <SelectItem key={p.value} value={p.value} className="text-popover-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer">{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[140px] bg-background text-foreground border-border flex-shrink-0">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent className="text-popover-foreground border-border shadow-md">
                <SelectItem value="all" className="text-popover-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer">Todos os Tipos</SelectItem>
                {TASK_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value} className="text-popover-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer">{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Lista de Tarefas */}
      <div className="space-y-3">
        {filteredTasks.length === 0 ? (
          <Card className="p-12 text-center bg-card dark:bg-card border-border dark:border-border">
            <div className="w-16 h-16 rounded-full bg-muted dark:bg-muted mx-auto flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-lg text-foreground dark:text-foreground">
              Nenhuma tarefa encontrada
            </p>
            <p className="text-sm text-muted-foreground dark:text-muted-foreground mt-1">
              {filter === 'all' ? 'Crie uma nova tarefa para começar' : 'Tente ajustar os filtros'}
            </p>
          </Card>
        ) : (
          filteredTasks.map(task => {
            const typeInfo = getTaskTypeInfo(task.type);
            const priorityInfo = getPriorityInfo(task.priority);
            const Icon = typeInfo.icon;
            const isOverdue = isPast(new Date(task.dueDate)) && !isToday(new Date(task.dueDate)) && task.status === 'pending';
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
                            className={`${isDark ? 'text-white' : 'text-gray-900'} ${task.status === 'completed' ? 'line-through' : ''
                              }`}
                          >
                            {task.title}
                          </h3>
                        </div>

                        {task.description && (
                          <p className={`text-sm ${isDark ? 'text-gray-500 dark:text-gray-400' : 'text-gray-700 dark:text-gray-300'} mb-2`}>
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
        <DialogContent className="max-w-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-foreground dark:text-foreground">Nova Tarefa</DialogTitle>
            <DialogDescription className="text-muted-foreground dark:text-muted-foreground">
              Crie uma nova tarefa ou lembrete
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div>
              <label className={`text-sm mb-2 block ${isDark ? 'text-gray-300' : 'text-muted-foreground'}`}>
                Título *
              </label>
              <Input
                value={newTask.title}
                onChange={e => setNewTask({ ...newTask, title: e.target.value })}
                placeholder="Ex: Ligar para cliente..."
                className="!bg-white dark:!bg-white !text-gray-900 dark:!text-gray-900 !border-gray-200 dark:!border-gray-200"
              />
            </div>

            <div>
              <label className={`text-sm mb-2 block ${isDark ? 'text-gray-300' : 'text-muted-foreground'}`}>
                Descrição
              </label>
              <Textarea
                value={newTask.description}
                onChange={e => setNewTask({ ...newTask, description: e.target.value })}
                placeholder="Detalhes da tarefa..."
                rows={3}
                className="!bg-white dark:!bg-white !text-gray-900 dark:!text-gray-900 !border-gray-200 dark:!border-gray-200"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={`text-sm mb-2 block ${isDark ? 'text-gray-300' : 'text-muted-foreground'}`}>
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
                <label className={`text-sm mb-2 block ${isDark ? 'text-gray-300' : 'text-muted-foreground'}`}>
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
              <label className={`text-sm mb-2 block ${isDark ? 'text-gray-300' : 'text-muted-foreground'}`}>
                Lead Relacionado (opcional)
              </label>
              <Select
                value={newTask.leadId || 'none'}
                onValueChange={leadId => setNewTask({ ...newTask, leadId: leadId === 'none' ? '' : leadId })}
              >
                <SelectTrigger className="!bg-white dark:!bg-white !text-gray-900 dark:!text-gray-900 !border-gray-200 dark:!border-gray-200">
                  <SelectValue placeholder="Selecione um lead..." />
                </SelectTrigger>
                <SelectContent className="!bg-white dark:!bg-white border border-gray-200 dark:border-gray-700 shadow-lg max-h-[200px] z-[9999]">
                  <SelectItem value="none" className="cursor-pointer !text-gray-900 dark:!text-gray-900 hover:bg-gray-100 dark:hover:bg-gray-100 focus:bg-gray-100 dark:focus:bg-gray-100">Nenhum lead</SelectItem>
                  {leads.filter(lead => lead.id).map(lead => (
                    <SelectItem key={lead.id} value={lead.id} className="cursor-pointer !text-gray-900 dark:!text-gray-900 hover:bg-gray-100 dark:hover:bg-gray-100 focus:bg-gray-100 dark:focus:bg-gray-100">
                      {lead.nome} {lead.empresa ? `- ${lead.empresa}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className={`text-sm mb-2 block ${isDark ? 'text-gray-300' : 'text-muted-foreground'}`}>
                Data de Vencimento
              </label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start !bg-white dark:!bg-white !text-gray-900 dark:!text-gray-900 !border-gray-200 dark:!border-gray-200 font-normal text-left">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(newTask.dueDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 !bg-white dark:!bg-white border border-gray-200 dark:border-gray-700 shadow-lg z-[9999]">
                  <Calendar
                    mode="single"
                    selected={newTask.dueDate}
                    onSelect={date => date && setNewTask({ ...newTask, dueDate: date })}
                    locale={ptBR}
                    className="rounded-md border-0"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setShowNewTaskModal(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreateTask}>
                Criar Tarefa
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

