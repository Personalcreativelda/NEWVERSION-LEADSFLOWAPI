// Tipos e textos partilhados dos fluxos de remarketing (página, editor e modelos).
export type FlowStatus = 'active' | 'paused' | 'draft';
export type TriggerType = 'funnel_stage' | 'tag' | 'inactivity' | 'purchase' | 'lead_score' | 'conversation_idle';
export type ActionType =
  | 'message' | 'whatsapp' | 'facebook' | 'instagram' | 'telegram' | 'email' | 'dynamic_audio' | 'ab_test'
  | 'wait' | 'condition'
  | 'move_stage' | 'tag' | 'remove_tag' | 'create_task' | 'add_note' | 'notify' | 'score';

export interface FlowStep {
  id: string;
  type: ActionType;
  label: string;
  config?: Record<string, any>;
}

export interface FlowSettings {
  /** Parar a sequência quando o lead responde */
  stop_on_reply?: boolean;
  /** O que acontece quando o lead responde */
  on_reply?: { stage?: string; tag?: string; notify?: boolean; task?: boolean; auto_reply?: string };
  /** A IA adapta as mensagens ao que já foi conversado */
  personalize?: boolean;
  /** Horário de envio (hora local do fuso abaixo) */
  window_start?: number;
  window_end?: number;
  weekdays_only?: boolean;
  timezone?: string;
  /** Dias até o mesmo lead poder repetir o fluxo */
  reentry_days?: number;
  /** Só leads deste canal; "any" = o canal da última conversa */
  channel?: string;
  /** Usado em {{minha_empresa}} */
  business_name?: string;
  /** Máximo de envios destes fluxos por conta em 24 horas */
  daily_limit?: number;
}

export interface RemarketingFlow {
  id: string;
  name: string;
  description: string;
  status: FlowStatus;
  trigger: TriggerType;
  triggerLabel: string;
  steps: FlowStep[];
  settings?: FlowSettings;
  enrolledLeads: number;
  conversions: number;
  createdAt: string;
  templateId?: string;
}

export const DEFAULT_FUNNEL_STAGES = [
  { value: 'novo', label: 'Novo lead' },
  { value: 'contatado', label: 'Contactado' },
  { value: 'qualificado', label: 'Qualificado' },
  { value: 'negociacao', label: 'Em negociação' },
  { value: 'convertido', label: 'Convertido' },
  { value: 'perdido', label: 'Perdido' },
];

export const TRIGGER_OPTIONS: { value: TriggerType; label: string; description: string }[] = [
  { value: 'funnel_stage', label: 'Etapa do funil', description: 'Quando o lead entra na etapa ou fica lá parado.' },
  { value: 'inactivity', label: 'Inatividade', description: 'Sem mensagens há X dias.' },
  { value: 'conversation_idle', label: 'Conversa parada', description: 'A conversa parou há X horas (Instagram e Messenger: até 24 horas).' },
  { value: 'tag', label: 'Tag aplicada', description: 'Quando o lead recebe esta tag.' },
  { value: 'purchase', label: 'Compra realizada', description: 'Quando o lead passa a Convertido.' },
  { value: 'lead_score', label: 'Pontuação do lead', description: 'Quando o Assistente de vendas IA dá esta pontuação ou mais.' },
];

export const STEP_GROUPS: { label: string; options: { value: ActionType; label: string }[] }[] = [
  {
    label: 'Mensagens',
    options: [
      { value: 'message', label: 'Mensagem' },
      { value: 'dynamic_audio', label: 'Áudio' },
      { value: 'ab_test', label: 'Teste A/B' },
      { value: 'whatsapp', label: 'Mensagem só por WhatsApp' },
      { value: 'instagram', label: 'Mensagem só por Instagram' },
      { value: 'facebook', label: 'Mensagem só por Messenger' },
      { value: 'telegram', label: 'Mensagem só por Telegram' },
      { value: 'email', label: 'Email' },
    ],
  },
  {
    label: 'Tempo e lógica',
    options: [
      { value: 'wait', label: 'Aguardar' },
      { value: 'condition', label: 'Condição' },
    ],
  },
  {
    label: 'Ações no painel',
    options: [
      { value: 'move_stage', label: 'Mover no funil' },
      { value: 'tag', label: 'Aplicar tag' },
      { value: 'remove_tag', label: 'Remover tag' },
      { value: 'create_task', label: 'Criar tarefa' },
      { value: 'add_note', label: 'Adicionar nota' },
      { value: 'notify', label: 'Avisar a equipa' },
      { value: 'score', label: 'Alterar pontuação' },
    ],
  },
];

export const STEP_NAMES: Record<ActionType, string> = {
  message: 'Mensagem',
  whatsapp: 'WhatsApp',
  facebook: 'Messenger',
  instagram: 'Instagram',
  telegram: 'Telegram',
  email: 'Email',
  dynamic_audio: 'Áudio',
  ab_test: 'Teste A/B',
  wait: 'Aguardar',
  condition: 'Condição',
  move_stage: 'Mover no funil',
  tag: 'Aplicar tag',
  remove_tag: 'Remover tag',
  create_task: 'Criar tarefa',
  add_note: 'Adicionar nota',
  notify: 'Avisar a equipa',
  score: 'Pontuação',
};

export const CONDITION_OPTIONS = [
  { value: 'replied', label: 'O lead respondeu' },
  { value: 'not_replied', label: 'O lead não respondeu' },
  { value: 'stage', label: 'Está na etapa' },
  { value: 'not_stage', label: 'Não está na etapa' },
  { value: 'tag', label: 'Tem a tag' },
  { value: 'not_tag', label: 'Não tem a tag' },
];

export const DEFAULT_AUTO_REPLY = 'Obrigado pela resposta, {{nome}}! Já passei à nossa equipa e falamos consigo muito em breve.';

export const CHANNEL_OPTIONS = [
  { value: 'any', label: 'Canal da última conversa' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Messenger' },
  { value: 'telegram', label: 'Telegram' },
];

export const MESSAGE_VARIABLES = [
  { key: '{{nome}}', label: 'Nome' },
  { key: '{{nome_completo}}', label: 'Nome completo' },
  { key: '{{empresa}}', label: 'Empresa do lead' },
  { key: '{{minha_empresa}}', label: 'O seu negócio' },
];

const short = (text: string, max = 60) => (text.length > max ? `${text.slice(0, max)}…` : text);

/** Resumo de um passo para as listas */
export function stepSummary(type: ActionType, config: Record<string, any> = {}, stages = DEFAULT_FUNNEL_STAGES): string {
  const stageLabel = (value: string) => stages.find((s) => s.value === value)?.label ?? value;
  switch (type) {
    case 'message': case 'whatsapp': case 'facebook': case 'instagram': case 'telegram':
      return config.message ? short(config.message) : 'Sem mensagem';
    case 'email': return config.subject ? short(config.subject) : 'Sem assunto';
    case 'dynamic_audio':
      if (config.audio_url) return 'Áudio gravado';
      return config.text ? short(config.text) : 'Sem áudio';
    case 'ab_test': return config.messageA ? short(config.messageA) : 'Sem versões';
    case 'wait': {
      if (!config.duration) return 'Sem tempo';
      const unit = config.unit ?? 'dias';
      return `${config.duration} ${Number(config.duration) === 1 ? unit.replace(/s$/, '') : unit}`;
    }
    case 'condition': {
      const option = CONDITION_OPTIONS.find((o) => o.value === config.check);
      if (!option) return 'Por configurar';
      const value = config.check === 'stage' || config.check === 'not_stage' ? stageLabel(config.value || '') : config.value;
      return value ? `${option.label}: ${value}` : option.label;
    }
    case 'move_stage': return config.stage ? stageLabel(config.stage) : 'Sem etapa';
    case 'tag': case 'remove_tag': return config.tag || 'Sem tag';
    case 'create_task': return config.title ? short(config.title) : 'Sem título';
    case 'add_note': return config.text ? short(config.text) : 'Sem texto';
    case 'notify': return config.title ? short(config.title) : 'Sem aviso';
    case 'score': return config.points ? `${Number(config.points) > 0 ? '+' : ''}${config.points} pontos` : 'Sem pontos';
    default: return '';
  }
}

/** Gatilho para mostrar: "negociacao +3 dias" → "Em negociação há 3 dias" */
export function triggerSummary(trigger: TriggerType, label: string, stages = DEFAULT_FUNNEL_STAGES): string {
  const number = label.match(/\+?\s*(\d+)/)?.[1];
  switch (trigger) {
    case 'funnel_stage': {
      const raw = label.split(' +')[0].trim();
      const stage = stages.find((s) => s.value === raw.toLowerCase())?.label ?? raw;
      return Number(number) > 0 ? `${stage} há ${number} dias` : `Entrou em ${stage}`;
    }
    case 'inactivity': return `Sem mensagens há ${number ?? '?'} dias`;
    case 'conversation_idle': return `Conversa parada há ${number ?? '?'} horas`;
    case 'lead_score': return `Pontuação ≥ ${number ?? '?'}`;
    case 'purchase': return 'Compra realizada';
    default: return label;
  }
}
