// Regras para um fluxo poder ficar ativo. Cada texto diz o passo e o que falta, para quem o
// está a editar. O motor (flow-execution.service) nunca envia uma mensagem vazia.

export const SEND_STEP_TYPES = new Set([
  'message', 'whatsapp', 'facebook', 'instagram', 'telegram', 'email', 'ab_test', 'dynamic_audio',
]);

const hasText = (value: unknown) => typeof value === 'string' && value.trim().length > 0;

function stepProblem(step: any, steps: any[]): string | null {
  const cfg = step?.config || {};
  switch (step?.type) {
    case 'message':
    case 'whatsapp':
    case 'facebook':
    case 'instagram':
    case 'telegram':
      if (cfg.requires_template && !cfg.wa_template?.name) return 'falta escolher o modelo aprovado do WhatsApp Business';
      return hasText(cfg.message) ? null : 'falta escrever a mensagem';
    case 'email':
      return hasText(cfg.subject) && hasText(cfg.body) ? null : 'falta o assunto ou o texto do email';
    case 'ab_test':
      return hasText(cfg.messageA) && hasText(cfg.messageB) ? null : 'faltam as duas versões da mensagem';
    case 'dynamic_audio':
      return hasText(cfg.text) || hasText(cfg.audio_url) ? null : 'falta o texto ou o ficheiro do áudio';
    case 'wait':
      return Number(cfg.duration) > 0 ? null : 'falta o tempo de espera';
    case 'tag':
    case 'remove_tag':
      return hasText(cfg.tag) ? null : 'falta o nome da tag';
    case 'move_stage':
      return hasText(cfg.stage) ? null : 'falta escolher a etapa';
    case 'create_task':
      return hasText(cfg.title) ? null : 'falta o título da tarefa';
    case 'add_note':
      return hasText(cfg.text) ? null : 'falta o texto da nota';
    case 'notify':
      return hasText(cfg.title) ? null : 'falta o texto do aviso';
    case 'score':
      return Number.isFinite(Number(cfg.points)) && Number(cfg.points) !== 0 ? null : 'faltam os pontos';
    case 'condition': {
      if (!hasText(cfg.check)) return 'falta escolher a condição';
      if (['stage', 'not_stage', 'tag', 'not_tag'].includes(cfg.check) && !hasText(cfg.value)) return 'falta o valor da condição';
      const validTarget = (t: unknown) => !t || t === 'continue' || t === 'end' || steps.some((s) => s?.id === t);
      return validTarget(cfg.if_true) && validTarget(cfg.if_false) ? null : 'a condição aponta para um passo que já não existe';
    }
    default:
      return 'tipo de passo desconhecido';
  }
}

export function flowProblems(flow: { steps?: any; trigger_type?: string; trigger_label?: string }): string[] {
  const steps = Array.isArray(flow.steps) ? flow.steps : [];
  const problems: string[] = [];
  if (steps.length === 0) problems.push('O fluxo não tem passos');
  if (!steps.some((s) => SEND_STEP_TYPES.has(s?.type)) && !steps.some((s) => ['tag', 'remove_tag', 'move_stage', 'create_task', 'add_note', 'notify', 'score'].includes(s?.type))) {
    if (steps.length > 0) problems.push('O fluxo não faz nenhuma ação');
  }
  steps.forEach((step, i) => {
    const problem = stepProblem(step, steps);
    if (problem) problems.push(`Passo ${i + 1}: ${problem}`);
  });
  return problems;
}
