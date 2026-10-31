// Modelos prontos a usar: mensagens escritas, tempos, ações no funil e regras.
//
// Princípios: uma pergunta por mensagem, sem pressão, um áudio a meio (é o que mais recebe
// resposta), última mensagem que dá saída ao lead e, no fim, uma ação para a equipa.
// Instagram e Messenger só aceitam mensagens até 24 horas depois da última mensagem do cliente:
// as sequências desses canais cabem nesse prazo.
import type { ActionType, FlowSettings, FlowStep, TriggerType } from './flowTypes';

export type TemplateChannel = 'whatsapp' | 'instagram' | 'facebook' | 'telegram';

export interface FlowTemplate {
  id: string;
  name: string;
  description: string;
  channels: TemplateChannel[];
  trigger: TriggerType;
  triggerLabel: string;
  settings: FlowSettings;
  steps: FlowStep[];
}

let counter = 0;
const step = (type: ActionType, config: Record<string, any>): FlowStep => {
  counter += 1;
  return { id: `s${counter}`, type, label: '', config };
};
const wait = (duration: number, unit: 'minutos' | 'horas' | 'dias' | 'semanas' = 'dias') => step('wait', { duration: String(duration), unit });
const msg = (message: string, extra: Record<string, any> = {}) => step('message', { message, ...extra });
const audio = (text: string) => step('dynamic_audio', { text });
const moveTo = (stage: string) => step('move_stage', { stage });
const tag = (name: string) => step('tag', { tag: name });
const task = (title: string, due_hours = 4) => step('create_task', { title, due_hours: String(due_hours), task_type: 'call', priority: 'high' });
const note = (text: string) => step('add_note', { text });
const notify = (title: string) => step('notify', { title });
const score = (points: number) => step('score', { points: String(points) });

const TEMPLATES: FlowTemplate[] = [
  {
    id: 'speed-to-lead',
    name: 'Primeiro contacto em 5 minutos',
    description: 'Fala com cada lead novo enquanto o interesse está quente e passa-o a Contactado.',
    channels: ['whatsapp'],
    trigger: 'funnel_stage',
    triggerLabel: 'novo +0 dias',
    settings: { channel: 'whatsapp', stop_on_reply: true, on_reply: { stage: 'qualificado', tag: 'respondeu', notify: true } },
    steps: [
      wait(5, 'minutos'),
      msg('Olá {{nome}}! Aqui é da {{minha_empresa}}. Recebemos o seu contacto e queria perceber melhor o que procura. Qual foi o motivo do seu contacto?'),
      moveTo('contatado'),
      wait(1),
      msg('{{nome}}, ficou com alguma dúvida? Se preferir, diga-me a melhor hora e ligo-lhe.'),
      wait(2),
      audio('Olá {{nome}}, fala a equipa da {{minha_empresa}}. Deixei-lhe uma mensagem há uns dias e não queria que ficasse sem resposta. Se ainda faz sentido, responda aqui com um sim e tratamos disto de forma rápida.'),
      wait(2),
      tag('sem-resposta'),
      task('Ligar a {{nome_completo}}: não respondeu às mensagens', 24),
    ],
  },
  {
    id: 'abandoned-lead',
    name: 'Reativar lead inativo',
    description: 'Retoma a conversa com quem deixou de responder: pergunta, áudio e última mensagem. Sem resposta, fica como frio.',
    channels: ['whatsapp'],
    trigger: 'inactivity',
    triggerLabel: 'Inatividade +7 dias',
    settings: { channel: 'whatsapp', stop_on_reply: true, on_reply: { stage: 'qualificado', tag: 'reativado', notify: true } },
    steps: [
      msg('Olá {{nome}}, tudo bem? Falámos há algum tempo e fiquei a pensar: ainda está à procura de uma solução ou já resolveu?'),
      wait(2),
      audio('Olá {{nome}}, é da {{minha_empresa}}. Não quero tomar-lhe muito tempo. Só queria saber se ainda posso ajudar, porque da última vez ficámos a meio. Responda-me aqui, mesmo que seja só para dizer que já não precisa.'),
      wait(3),
      msg('{{nome}}, não quero incomodar. Se já não for o momento, é só dizer e deixo de enviar mensagens. Se ainda tiver interesse, responda com um SIM.'),
      wait(2),
      tag('frio'),
      score(-10),
      note('Não respondeu à sequência de reativação.'),
    ],
  },
  {
    id: 'funnel-stalled',
    name: 'Negociação parada',
    description: 'Quando uma negociação fica 3 dias sem mexer: descobre o que falta e, sem resposta, passa o lead ao vendedor.',
    channels: ['whatsapp'],
    trigger: 'funnel_stage',
    triggerLabel: 'negociacao +3 dias',
    settings: { channel: 'whatsapp', stop_on_reply: true, on_reply: { tag: 'negociacao-ativa', notify: true } },
    steps: [
      msg('Olá {{nome}}, ficou alguma dúvida sobre o que conversámos? Diga-me o que falta para decidir e resolvo já.'),
      wait(2),
      audio('{{nome}}, é da {{minha_empresa}}. Sei que estas decisões levam tempo, por isso diga-me com franqueza: é o preço, o prazo ou outra coisa que está a travar? Assim consigo ajudar de verdade.'),
      wait(1),
      task('Ligar a {{nome_completo}}: negociação parada'),
      notify('Negociação parada: {{nome_completo}}'),
      wait(3),
      msg('{{nome}}, vou deixar o seu processo em pausa para não insistir. Quando quiser retomar, é só responder aqui.'),
      tag('negociacao-fria'),
    ],
  },
  {
    id: 'proposal-followup',
    name: 'Seguimento de proposta',
    description: 'Aplique a tag proposta-enviada e o seguimento fica feito. Quando o lead responde, passa a Em negociação.',
    channels: ['whatsapp'],
    trigger: 'tag',
    triggerLabel: 'Tag: proposta-enviada',
    settings: { channel: 'whatsapp', stop_on_reply: true, on_reply: { stage: 'negociacao', notify: true } },
    steps: [
      wait(1),
      msg('Olá {{nome}}, conseguiu ver a proposta que lhe enviei? Quero garantir que ficou tudo claro.'),
      wait(2),
      audio('{{nome}}, é só para saber o que achou da proposta. Se alguma coisa não encaixar, diga-me e ajustamos. O importante é que faça sentido para si.'),
      wait(3),
      msg('{{nome}}, a proposta continua disponível. Prefere avançar, ajustar ou deixar para mais tarde? Qualquer resposta ajuda-me.'),
      wait(2),
      task('Rever proposta de {{nome_completo}}: sem resposta', 24),
    ],
  },
  {
    id: 'hot-lead',
    name: 'Lead quente',
    description: 'Quando a pontuação chega a 80: move para Em negociação, cria uma tarefa urgente e avisa a equipa.',
    channels: ['whatsapp'],
    trigger: 'lead_score',
    triggerLabel: 'Score ≥ 80',
    settings: { channel: 'whatsapp', stop_on_reply: true, on_reply: { notify: true } },
    steps: [
      tag('quente'),
      moveTo('negociacao'),
      notify('Lead quente: {{nome_completo}}'),
      task('Falar hoje com {{nome_completo}}: lead quente', 1),
      wait(15, 'minutos'),
      audio('Olá {{nome}}, é da {{minha_empresa}}. Vi o seu interesse e queria dar-lhe atenção pessoalmente. Tem dois minutos para falarmos hoje? Diga-me a melhor hora.'),
    ],
  },
  {
    id: 'post-purchase',
    name: 'Pós-venda',
    description: 'Agradece, confirma que está tudo bem, pede avaliação e, um mês depois, abre a porta à próxima compra.',
    channels: ['whatsapp'],
    trigger: 'purchase',
    triggerLabel: 'Compra realizada',
    settings: { channel: 'any', stop_on_reply: false, on_reply: { notify: true }, reentry_days: 90 },
    steps: [
      tag('cliente'),
      wait(1, 'horas'),
      msg('{{nome}}, agradecemos a sua confiança! Se precisar de alguma coisa, é só responder a esta mensagem.'),
      wait(3),
      msg('Olá {{nome}}, está tudo a correr bem? Se houver alguma dificuldade, quero saber para resolver.'),
      wait(7),
      msg('{{nome}}, de 0 a 10, quanto recomendaria a {{minha_empresa}} a um amigo? A sua opinião ajuda-nos a melhorar.'),
      wait(30),
      audio('Olá {{nome}}, é da {{minha_empresa}}. Já passou um mês e queria saber como tem corrido. Temos algumas novidades que podem interessar-lhe. Quer que lhe conte?'),
      task('Propor nova compra a {{nome_completo}}', 48),
    ],
  },
  {
    id: 'winback',
    name: 'Recuperar leads perdidos',
    description: 'Um mês depois de perder o lead, tenta de novo com calma. Se responder, volta ao funil como Qualificado.',
    channels: ['whatsapp'],
    trigger: 'funnel_stage',
    triggerLabel: 'perdido +30 dias',
    settings: { channel: 'whatsapp', stop_on_reply: true, on_reply: { stage: 'qualificado', tag: 'recuperado', notify: true }, reentry_days: 180 },
    steps: [
      msg('Olá {{nome}}, há algum tempo que não falamos. Da última vez não avançámos e queria saber: a situação mudou desde então?'),
      wait(3),
      audio('{{nome}}, é da {{minha_empresa}}. Sem compromisso nenhum: mudámos algumas coisas desde a última vez e pode ser que agora faça sentido. Quer que lhe explique em dois minutos?'),
      wait(4),
      msg('{{nome}}, esta é a minha última mensagem sobre isto. Se um dia quiser retomar, estou aqui.'),
    ],
  },
  {
    id: 'nurture',
    name: 'Nutrição de leads frios',
    description: 'Mantém os leads com a tag frio por perto com mensagens úteis, sem vender, até voltarem a responder.',
    channels: ['whatsapp'],
    trigger: 'tag',
    triggerLabel: 'Tag: frio',
    settings: { channel: 'whatsapp', stop_on_reply: true, on_reply: { stage: 'qualificado', tag: 'reativado', notify: true }, reentry_days: 90 },
    steps: [
      wait(7),
      msg('Olá {{nome}}, deixo-lhe uma dica rápida da {{minha_empresa}}: antes de escolher, compare sempre o que está incluído, não só o preço. Tem alguma dúvida sobre isto?'),
      wait(1, 'semanas'),
      msg('{{nome}}, qual é hoje a sua maior dificuldade neste assunto? Se me disser, envio-lhe uma sugestão sem compromisso.'),
      wait(2, 'semanas'),
      audio('Olá {{nome}}, é da {{minha_empresa}}. Só para saber como estão as coisas. Se o momento for agora, responda aqui e falamos.'),
    ],
  },
  {
    id: 'instagram-idle',
    name: 'Instagram: conversa parada',
    description: 'Recupera quem falou nas mensagens diretas e parou. Tudo dentro das 24 horas que a Meta permite.',
    channels: ['instagram'],
    trigger: 'conversation_idle',
    triggerLabel: 'Conversa parada +2 horas',
    settings: { channel: 'instagram', stop_on_reply: true, on_reply: { stage: 'qualificado', tag: 'instagram-ativo', notify: true }, window_start: 7, window_end: 22, reentry_days: 7 },
    steps: [
      msg('Olá {{nome}}! Ficou alguma dúvida? Se me disser o que procura, ajudo já por aqui 🙂'),
      wait(18, 'horas'),
      msg('{{nome}}, para não perder o fio à conversa: quer que lhe envie mais informações ou prefere falar por WhatsApp? Diga-me o seu número se preferir.'),
      tag('instagram-sem-resposta'),
    ],
  },
  {
    id: 'messenger-idle',
    name: 'Messenger: conversa parada',
    description: 'Mensagem, áudio e último toque para quem falou com a sua página e parou, dentro das 24 horas.',
    channels: ['facebook'],
    trigger: 'conversation_idle',
    triggerLabel: 'Conversa parada +2 horas',
    settings: { channel: 'facebook', stop_on_reply: true, on_reply: { stage: 'qualificado', tag: 'messenger-ativo', notify: true }, window_start: 7, window_end: 22, reentry_days: 7 },
    steps: [
      msg('Olá {{nome}}! Vi que falou connosco há pouco. Ficou alguma dúvida que possa esclarecer?'),
      wait(6, 'horas'),
      audio('Olá {{nome}}, é da {{minha_empresa}}. Respondo-lhe por aqui com todo o gosto. Diga-me só o que procura e digo-lhe logo se conseguimos ajudar.'),
      wait(12, 'horas'),
      msg('{{nome}}, deixe-me o seu número de WhatsApp se preferir continuar por lá. Fico à espera!'),
      tag('messenger-sem-resposta'),
    ],
  },
  {
    id: 'telegram-reactivate',
    name: 'Telegram: reativar contactos',
    description: 'No Telegram não há limite de 24 horas: mensagem, nota de voz e última mensagem para quem ficou inativo.',
    channels: ['telegram'],
    trigger: 'inactivity',
    triggerLabel: 'Inatividade +5 dias',
    settings: { channel: 'telegram', stop_on_reply: true, on_reply: { stage: 'qualificado', tag: 'telegram-ativo', notify: true } },
    steps: [
      msg('Olá {{nome}}! Já há uns dias que não falamos. Ainda posso ajudar com o que procurava?'),
      wait(2),
      audio('Olá {{nome}}, é da {{minha_empresa}}. Deixo-lhe esta nota de voz porque é mais fácil do que escrever. Diga-me como está a situação e vemos o próximo passo.'),
      wait(3),
      msg('{{nome}}, fico por aqui para não incomodar. Quando quiser retomar, é só escrever.'),
      tag('frio'),
    ],
  },
  {
    id: 'whatsapp-business-reopen',
    name: 'WhatsApp Business: reabrir conversa',
    description: 'No WhatsApp oficial só um modelo aprovado reabre a conversa. Se o lead responder, o fluxo para e a conversa é sua.',
    channels: ['whatsapp'],
    trigger: 'inactivity',
    triggerLabel: 'Inatividade +14 dias',
    settings: { channel: 'whatsapp', stop_on_reply: true, on_reply: { stage: 'qualificado', tag: 'reativado', notify: true } },
    steps: [
      msg('Olá {{nome}}, tudo bem? Ainda posso ajudar com o que procurava?', { requires_template: true }),
      wait(3),
      task('Ligar a {{nome_completo}}: não respondeu ao modelo', 24),
    ],
  },
];

// Todos os modelos adaptam as mensagens à conversa (sem IA segue o texto escrito aqui)
export const FLOW_TEMPLATES: FlowTemplate[] = TEMPLATES.map((template) => ({
  ...template,
  settings: { personalize: true, ...template.settings },
}));
