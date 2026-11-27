// Ferramentas dos agentes de voz: durante a chamada o agente pode agir no LeadsFlow, como os
// assistentes do WhatsApp (marcar, mover o lead no funil, etiquetar, guardar dados, passar à equipa…).
//
//   ElevenLabs ──client_tool_call──► ponte ──POST /api/webhooks/voice-bridge/tool──► runVoiceTool()
//            ◄─client_tool_result──        ◄──────────── { result, is_error } ─────────────
//
// As ferramentas são "client tools" criadas uma vez na conta ElevenLabs da plataforma
// (POST /v1/convai/tools) e ligadas a cada agente por tool_ids (whatsapp-calls.service → agentBody).
// A tabela voice_tools guarda a id de cada uma; mudar TOOLS → atualizadas ao arrancar (impressão digital).
//
// Cada chamada fica ligada a um lead e a uma conversa do WhatsApp desse número (callContext): as
// marcações, notas e mudanças de etapa aparecem na caixa de entrada e no funil como as do assistente.
import { createHash } from 'crypto';
import { query } from '../database/connection';
import { ConversationsService } from './conversations.service';
import { findOrCreateLead } from './leads-dedup.service';
import { agendaBlock, agendaOptions, applyDecision } from './appointments.service';
import { flowExecutionService } from './flow-execution.service';
import { notificationsService } from './notifications.service';
import { META_EVENTS, queueEvent } from './meta-conversions.service';
import { conversationWindow } from './whatsapp-window.service';
import { getWebSocketService } from './websocket.service';
import { userTimezone } from '../utils/user-timezone';

const ELEVEN = 'https://api.elevenlabs.io/v1';
const conversations = new ConversationsService();
const parse = (v: any) => (typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch { return {}; } })() : v || {});
const digits = (s: string) => String(s || '').replace(/\D/g, '');

export const STAGES: Record<string, string> = {
  novo: 'Novo', contatado: 'Contactado', qualificado: 'Qualificado', negociacao: 'Negociação', convertido: 'Convertido', perdido: 'Perdido',
};

// ── Definições (as descrições são o que o agente lê para decidir quando usar) ──
const str = (description: string) => ({ type: 'string', description });
const TOOLS: { name: string; description: string; parameters: any }[] = [
  {
    name: 'ver_horarios',
    description: 'Vê a agenda: data e hora de agora, horário de funcionamento, horários ocupados nos próximos 14 dias e as marcações deste cliente. Usa sempre antes de propor ou confirmar uma hora.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'marcar',
    description: 'Marca uma consulta, reunião ou visita depois de o cliente CONFIRMAR o dia e a hora. Devolve se ficou marcado ou porque não deu.',
    parameters: {
      type: 'object',
      properties: {
        data_hora: str('Dia e hora local no formato AAAA-MM-DDTHH:mm'),
        assunto: str('Título curto, ex.: Consulta de limpeza - Ana'),
        notas: str('O que ficou combinado (opcional)'),
      },
      required: ['data_hora', 'assunto'],
    },
  },
  {
    name: 'remarcar',
    description: 'Muda a hora de uma marcação deste cliente, depois de ele confirmar a nova hora.',
    parameters: { type: 'object', properties: { data_hora: str('Novo dia e hora local, AAAA-MM-DDTHH:mm') }, required: ['data_hora'] },
  },
  {
    name: 'desmarcar',
    description: 'Cancela a marcação deste cliente quando ele pede para desmarcar.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'mover_etapa',
    description: 'Muda a etapa do cliente no funil de vendas: contatado (conversou), qualificado (tem interesse real e perfil), negociacao (a discutir preço ou condições), convertido (comprou ou fechou), perdido (não quer).',
    parameters: {
      type: 'object',
      properties: { etapa: { type: 'string', description: 'Uma de: contatado, qualificado, negociacao, convertido, perdido' } },
      required: ['etapa'],
    },
  },
  {
    name: 'etiquetar',
    description: 'Põe uma etiqueta no cliente (ex.: interessado, pediu-orcamento, voltar-a-ligar). As etiquetas podem iniciar fluxos de remarketing.',
    parameters: { type: 'object', properties: { etiqueta: str('Etiqueta curta, minúsculas, com hífenes') }, required: ['etiqueta'] },
  },
  {
    name: 'guardar_contacto',
    description: 'Guarda dados que o cliente disse: nome, email ou uma nota (o que procura, orçamento, morada, prazo).',
    parameters: {
      type: 'object',
      properties: { nome: str('Nome do cliente'), email: str('Email'), nota: str('Informação útil para a equipa') },
      required: [],
    },
  },
  {
    name: 'registar_conversao',
    description: 'Regista uma conversão para a Meta quando acontece na chamada: Purchase (compra, com valor), Lead, QualifiedLead, AddToCart, InitiateCheckout, OrderCreated, OrderDelivered.',
    parameters: {
      type: 'object',
      properties: { evento: str('Nome do evento'), valor: { type: 'number', description: 'Valor (compras)' }, moeda: str('Moeda, ex.: MZN') },
      required: ['evento'],
    },
  },
  {
    name: 'enviar_mensagem',
    description: 'Envia uma mensagem escrita ao cliente pelo WhatsApp (ex.: link, preço, morada) quando ele pede ou quando ajuda. Pode não ser possível se o cliente não escreveu nas últimas 24 horas.',
    parameters: { type: 'object', properties: { texto: str('Texto da mensagem') }, required: ['texto'] },
  },
  {
    name: 'passar_equipa',
    description: 'Avisa a equipa que este cliente precisa de uma pessoa (pediu para falar com alguém, reclamação, caso que não sabes resolver).',
    parameters: { type: 'object', properties: { motivo: str('Porque precisa da equipa') }, required: ['motivo'] },
  },
];

/** Nomes das ferramentas */
export const TOOL_NAMES = TOOLS.map((t) => t.name);
/** Ações que o painel mostra, em grupos (agenda = ver_horarios + marcar + remarcar + desmarcar) */
export const TOOL_GROUPS: Record<string, string[]> = {
  agenda: ['ver_horarios', 'marcar', 'remarcar', 'desmarcar'],
  funil: ['mover_etapa'],
  etiquetas: ['etiquetar'],
  contacto: ['guardar_contacto'],
  conversoes: ['registar_conversao'],
  mensagens: ['enviar_mensagem'],
  equipa: ['passar_equipa'],
};
/** Grupos ligados no agente (call_config.tools) → ferramentas; sem escolha: todas */
export function enabledTools(groups?: unknown): string[] {
  if (!Array.isArray(groups)) return TOOL_NAMES;
  return groups.flatMap((g) => TOOL_GROUPS[String(g)] || []);
}

const HINTS: Record<string, string> = {
  agenda: 'Antes de propor ou confirmar uma hora usa ver_horarios; marca, remarca ou desmarca só depois de o cliente confirmar.',
  funil: 'Quando o cliente mostra interesse, pede preço ou fecha negócio, usa mover_etapa.',
  etiquetas: 'Usa etiquetar para marcar o que o cliente quer (ex.: pediu-orcamento).',
  contacto: 'Guarda nome, email e o que ele procura com guardar_contacto.',
  conversoes: 'Quando houver uma compra ou outra conversão, usa registar_conversao.',
  mensagens: 'Se ele pedir um link ou informação por escrito, usa enviar_mensagem.',
  equipa: 'Se pedir uma pessoa ou não souberes resolver, usa passar_equipa e diz que a equipa vai contactá-lo.',
};

/** Instruções sobre as ferramentas, só das que este agente tem */
export function toolsPrompt(groups?: unknown): string {
  const list = Array.isArray(groups) ? groups.map(String) : Object.keys(TOOL_GROUPS);
  const hints = list.map((g) => HINTS[g]).filter(Boolean);
  if (!hints.length) return '';
  return '\n\nFerramentas: usa-as em silêncio, sem dizer o nome delas ao cliente. ' + hints.join(' ')
    + ' Depois de cada ferramenta, segue a conversa com o resultado.';
}

const toolConfig = (t: typeof TOOLS[number]) => ({
  type: 'client',
  name: t.name,
  description: t.description,
  parameters: t.parameters,
  expects_response: true,
  response_timeout_secs: 20,
});
const fingerprint = (cfg: any) => createHash('sha1').update(JSON.stringify(cfg)).digest('hex').slice(0, 16);

// ── Criar / atualizar na conta ElevenLabs da plataforma ──
let cachedIds: Record<string, string> | null = null;

async function eleven(method: string, path: string, body?: unknown) {
  const key = process.env.ELEVENLABS_API_KEY || '';
  if (!key) throw new Error('sem ELEVENLABS_API_KEY');
  const res = await fetch(`${ELEVEN}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'xi-api-key': key },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`ElevenLabs ${method} ${path}: ${res.status} ${JSON.stringify(data?.detail || data).slice(0, 300)}`);
  return data;
}

/** Ids das ferramentas no ElevenLabs para estes grupos (cria as que faltam, atualiza as que mudaram) */
export async function voiceToolIds(groups?: unknown): Promise<string[]> {
  const map = await toolIdMap();
  return enabledTools(groups).map((n) => map[n]).filter(Boolean);
}

async function toolIdMap(): Promise<Record<string, string>> {
  if (cachedIds) return cachedIds;
  if (!process.env.ELEVENLABS_API_KEY) return {};
  try {
    const saved = new Map<string, { tool_id: string; fp: string }>(
      (await query('SELECT name, tool_id, fingerprint AS fp FROM voice_tools')).rows.map((r: any) => [r.name, r]),
    );
    const ids: Record<string, string> = {};
    for (const t of TOOLS) {
      const cfg = toolConfig(t);
      const fp = fingerprint(cfg);
      const have = saved.get(t.name);
      let id = have?.tool_id;
      if (id && have!.fp !== fp) {
        await eleven('PATCH', `/convai/tools/${encodeURIComponent(id)}`, { tool_config: cfg }).catch(() => { id = undefined; });
      }
      if (!id) id = (await eleven('POST', '/convai/tools', { tool_config: cfg }))?.id;
      if (!id) continue;
      await query(
        `INSERT INTO voice_tools (name, tool_id, fingerprint, updated_at) VALUES ($1, $2, $3, NOW())
         ON CONFLICT (name) DO UPDATE SET tool_id = EXCLUDED.tool_id, fingerprint = EXCLUDED.fingerprint, updated_at = NOW()`,
        [t.name, id, fp],
      );
      ids[t.name] = id;
    }
    cachedIds = ids;
    return ids;
  } catch (err: any) {
    console.warn('[VoiceTools] Ferramentas indisponíveis:', err?.message);
    return {};
  }
}

// ── Contexto da chamada: lead + conversa do WhatsApp deste número ──
export interface CallContext {
  callId: string;
  userId: string;
  agentName: string;
  agentConfig: any;
  channelId: string;
  phone: string;
  leadId: string;
  leadName: string;
  conversationId: string;
}

/** Liga a chamada a um lead e a uma conversa (cria-os se faltarem). Guarda na linha da chamada. */
export async function callContext(rowOrKey: any): Promise<CallContext | null> {
  const row = typeof rowOrKey === 'string'
    ? (await query(
        `SELECT * FROM voice_agent_calls WHERE (call_provider_id = $1 OR metadata->>'bridge_key' = $1)
           AND metadata->>'source' = 'whatsapp_call' ORDER BY created_at DESC LIMIT 1`,
        [rowOrKey],
      )).rows[0]
    : rowOrKey;
  if (!row) return null;
  const meta = parse(row.metadata);
  const phone = digits(row.phone_number);
  if (!meta.channel_id || phone.length < 7) return null;
  const agent = row.voice_agent_id
    ? (await query('SELECT name, call_config FROM voice_agents WHERE id = $1', [row.voice_agent_id])).rows[0]
    : null;

  let leadId: string | null = row.lead_id;
  let leadName = meta.caller_name || `+${phone}`;
  if (!leadId) {
    const lead = await findOrCreateLead({ userId: row.user_id, phone, name: meta.caller_name || undefined, source: 'whatsapp' } as any);
    leadId = lead.id;
    leadName = lead.name || leadName;
  } else {
    leadName = (await query('SELECT name FROM leads WHERE id = $1', [leadId])).rows[0]?.name || leadName;
  }
  let conversationId: string | null = row.conversation_id;
  if (!conversationId) {
    const conv = await conversations.findOrCreate(row.user_id, meta.channel_id, `${phone}@s.whatsapp.net`, leadId!,
      meta.caller_name ? { contact_name: meta.caller_name } : undefined);
    conversationId = conv.id;
  }
  if (row.lead_id !== leadId || row.conversation_id !== conversationId) {
    await query('UPDATE voice_agent_calls SET lead_id = $2, conversation_id = $3 WHERE id = $1', [row.id, leadId, conversationId]);
    row.lead_id = leadId;
    row.conversation_id = conversationId;
  }
  return {
    callId: row.id,
    userId: row.user_id,
    agentName: agent?.name || 'Agente de voz',
    agentConfig: parse(agent?.call_config),
    channelId: meta.channel_id,
    phone,
    leadId: leadId!,
    leadName,
    conversationId: conversationId!,
  };
}

/** Nota de sistema na conversa (como as do assistente) */
async function note(ctx: CallContext, text: string, extra: Record<string, any> = {}) {
  await query(
    `INSERT INTO messages (user_id, conversation_id, lead_id, direction, channel, content, status, metadata)
     VALUES ($1, $2, $3, 'out', 'whatsapp_cloud', $4, 'sent', $5)`,
    [ctx.userId, ctx.conversationId, ctx.leadId, text, JSON.stringify({ source: 'voice_agent', is_system: true, call_id: ctx.callId, ...extra })],
  ).catch(() => {});
}

// ── Execução ──
export async function runVoiceTool(callKey: string, tool: string, params: any): Promise<{ result: string; is_error: boolean }> {
  const ok = (result: string) => ({ result, is_error: false });
  const fail = (result: string) => ({ result, is_error: true });
  try {
    const ctx = await callContext(callKey);
    if (!ctx) return fail('Não foi possível identificar o cliente desta chamada.');
    const p = parse(params);
    // O dono do agente pode ter desligado esta ação (call_config.tools)
    if (!enabledTools(ctx.agentConfig.tools).includes(tool)) return fail('Esta ação não está disponível para este agente.');
    const opts = agendaOptions(ctx.agentConfig.agenda || {}, {}, await userTimezone(ctx.userId));
    const apptCtx = {
      userId: ctx.userId, conversationId: ctx.conversationId, leadId: ctx.leadId, leadName: ctx.leadName,
      contactPhone: `+${ctx.phone}`, channelType: 'whatsapp_cloud', assistantName: ctx.agentName,
    };
    console.log(`[VoiceTools] ${tool} (chamada ${ctx.callId})`, JSON.stringify(p).slice(0, 300));

    switch (tool) {
      case 'ver_horarios': {
        const block = await agendaBlock(ctx.userId, ctx.conversationId, opts);
        return ok(block.replace(/---|\[AGENDA\]/g, '').trim());
      }
      case 'marcar':
      case 'remarcar': {
        const r = await applyDecision(apptCtx, {
          action: tool === 'marcar' ? 'create' : 'reschedule',
          local_datetime: String(p.data_hora || ''),
          title: p.assunto ? String(p.assunto) : undefined,
          description: p.notas ? String(p.notas) : 'Marcado pelo agente de voz numa chamada.',
          task_type: 'meeting',
        }, opts);
        if (r.done === 'created') return ok('Marcado. Confirma ao cliente o dia e a hora.');
        if (r.done === 'rescheduled') return ok('Remarcado. Confirma ao cliente a nova hora.');
        const why: Record<string, string> = {
          ocupado: 'Esse horário não está livre (ocupado, fora do horário ou no passado). Usa ver_horarios e propõe outro.',
          'já marcada': 'Este cliente já tem uma marcação a essa hora.',
          'sem data': 'Falta o dia e a hora no formato AAAA-MM-DDTHH:mm.',
          'mesma hora': 'A marcação já está a essa hora.',
        };
        return fail(why[r.reason || ''] || 'Não foi possível marcar.');
      }
      case 'desmarcar': {
        const r = await applyDecision(apptCtx, { action: 'cancel' }, opts);
        return r.done === 'cancelled' ? ok('Desmarcado.') : fail('Este cliente não tem marcações para desmarcar.');
      }
      case 'mover_etapa': {
        const stage = String(p.etapa || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace('contactado', 'contatado');
        if (!STAGES[stage] || stage === 'novo') return fail('Etapa inválida. Usa: contatado, qualificado, negociacao, convertido ou perdido.');
        const cur = (await query('SELECT status, name FROM leads WHERE id = $1 AND user_id = $2', [ctx.leadId, ctx.userId])).rows[0];
        const prev = cur?.status || 'novo';
        if (prev === stage) return ok(`O cliente já está em ${STAGES[stage]}.`);
        await query('UPDATE leads SET status = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3', [stage, ctx.leadId, ctx.userId]);
        await note(ctx, `📞 ${ctx.agentName} moveu o lead de "${STAGES[prev] || prev}" para "${STAGES[stage]}" durante a chamada.`,
          { previous_status: prev, new_status: stage });
        void notificationsService.notifyLeadStageChange(ctx.userId, { id: ctx.leadId, name: cur?.name || ctx.leadName }, prev, stage, 'ai').catch(() => {});
        void flowExecutionService.triggerFlowsForLead(ctx.userId, ctx.leadId, 'funnel_stage', stage).catch(() => {});
        if (stage === 'convertido') void flowExecutionService.triggerFlowsForLead(ctx.userId, ctx.leadId, 'purchase', 'convertido').catch(() => {});
        try {
          (getWebSocketService() as any)?.io?.to(`user:${ctx.userId}`).emit('lead_funnel_update', {
            leadId: ctx.leadId, leadName: ctx.leadName, previousStatus: prev, newStatus: stage,
            conversationId: ctx.conversationId, triggeredBy: 'voice_agent', assistantName: ctx.agentName, timestamp: new Date().toISOString(),
          });
        } catch { /* só o ecrã */ }
        return ok(`Lead movido para ${STAGES[stage]}.`);
      }
      case 'etiquetar': {
        const tag = String(p.etiqueta || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
          .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
        if (!tag) return fail('Etiqueta vazia.');
        const r = await query(
          `UPDATE leads SET tags = CASE WHEN tags IS NULL THEN ARRAY[$1] WHEN NOT ($1 = ANY(tags)) THEN array_append(tags, $1) ELSE tags END,
                  updated_at = NOW()
            WHERE id = $2 AND user_id = $3 AND NOT ($1 = ANY(COALESCE(tags, ARRAY[]::text[])))`,
          [tag, ctx.leadId, ctx.userId],
        );
        if (r.rowCount) {
          void flowExecutionService.triggerFlowsForLead(ctx.userId, ctx.leadId, 'tag', tag).catch(() => {});
          await note(ctx, `📞 ${ctx.agentName} pôs a etiqueta "${tag}".`, { tag });
        }
        return ok(`Etiqueta ${tag} guardada.`);
      }
      case 'guardar_contacto': {
        const name = String(p.nome || '').trim().slice(0, 120);
        const email = String(p.email || '').trim().toLowerCase().slice(0, 160);
        const text = String(p.nota || '').trim().slice(0, 2000);
        if (name) {
          // Só substitui nomes que não são nomes (o número ou "Anónimo")
          await query(
            `UPDATE leads SET name = $1, updated_at = NOW()
              WHERE id = $2 AND user_id = $3 AND (name IS NULL OR name = '' OR name ~ '^[+0-9 ]+$' OR name IN ('Anónimo', 'Desconhecido'))`,
            [name, ctx.leadId, ctx.userId],
          );
        }
        if (email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
          await query(`UPDATE leads SET email = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 AND (email IS NULL OR email = '')`,
            [email, ctx.leadId, ctx.userId]);
        }
        if (text) {
          await query('INSERT INTO lead_notes (user_id, lead_id, content) VALUES ($1, $2, $3)',
            [ctx.userId, ctx.leadId, `📞 ${ctx.agentName}: ${text}`]);
        }
        return ok('Guardado.');
      }
      case 'registar_conversao': {
        const event = META_EVENTS.find((e) => e.toLowerCase() === String(p.evento || '').toLowerCase());
        if (!event) return fail('Evento desconhecido.');
        const r = await queueEvent(ctx.userId, ctx.leadId, event, 'assistant', {
          value: p.valor != null ? Number(p.valor) : null, currency: p.moeda ? String(p.moeda) : null,
        });
        return r.queued ? ok('Registado.') : fail(r.reason || 'Não registado.');
      }
      case 'enviar_mensagem': {
        const text = String(p.texto || '').trim().slice(0, 4000);
        if (!text) return fail('Mensagem vazia.');
        const win = await conversationWindow(ctx.conversationId);
        if (win.applies && !win.open) {
          return fail('Não é possível escrever a este cliente agora (não escreveu nas últimas 24 horas). Diz-lhe que pode pedir por mensagem no WhatsApp.');
        }
        const ch = (await query('SELECT credentials FROM channels WHERE id = $1', [ctx.channelId])).rows[0];
        const cred = parse(ch?.credentials);
        if (!cred.phone_number_id || !cred.access_token) return fail('Não foi possível enviar.');
        const res = await fetch(`https://graph.facebook.com/v23.0/${encodeURIComponent(cred.phone_number_id)}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cred.access_token}` },
          body: JSON.stringify({ messaging_product: 'whatsapp', to: ctx.phone, type: 'text', text: { body: text, preview_url: true } }),
          signal: AbortSignal.timeout(15_000),
        });
        const data: any = await res.json().catch(() => ({}));
        const wamid = data?.messages?.[0]?.id;
        if (!res.ok || !wamid) return fail('Não foi possível enviar a mensagem.');
        await query(
          `INSERT INTO messages (user_id, conversation_id, lead_id, direction, channel, content, status, external_id, metadata)
           VALUES ($1, $2, $3, 'out', 'whatsapp_cloud', $4, 'pending', $5, $6)`,
          [ctx.userId, ctx.conversationId, ctx.leadId, text, wamid, JSON.stringify({ source: 'voice_agent', call_id: ctx.callId })],
        ).catch(() => {});
        return ok('Mensagem enviada pelo WhatsApp.');
      }
      case 'passar_equipa': {
        const why = String(p.motivo || '').trim().slice(0, 500) || 'Pediu para falar com alguém';
        await note(ctx, `📞 ${ctx.agentName} pediu a ajuda da equipa: ${why}`, { handoff: true });
        await notificationsService.createNotification(
          ctx.userId, 'voice_handoff', `${ctx.leadName} precisa da equipa`, why, 'phone',
          { leadId: ctx.leadId, conversationId: ctx.conversationId },
          { actionUrl: '/dashboard/inbox', priority: 'high' },
        ).catch(() => {});
        return ok('A equipa foi avisada.');
      }
      default:
        return fail('Ferramenta desconhecida.');
    }
  } catch (err: any) {
    console.warn(`[VoiceTools] ${tool} falhou:`, err?.message);
    return fail('Não foi possível concluir agora.');
  }
}

/** Fim da chamada: fica na conversa (com a transcrição), para a equipa ver o que se passou */
export async function noteCallInConversation(rowId: string) {
  try {
    const row = (await query('SELECT * FROM voice_agent_calls WHERE id = $1', [rowId])).rows[0];
    if (!row || !['completed', 'answered'].includes(row.status)) return;
    const ctx = await callContext(row);
    if (!ctx) return;
    const secs = Number(row.duration_seconds) || 0;
    const dur = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    const head = `📞 Chamada ${row.direction === 'outbound' ? 'feita' : 'recebida'} com ${ctx.agentName} (${dur})`;
    const transcript = String(row.transcript || '').slice(0, 3500);
    await note(ctx, transcript ? `${head}\n\n${transcript}` : head, { voice_call: true });
  } catch (err: any) {
    console.warn('[VoiceTools] Nota da chamada:', err?.message);
  }
}

export const _test = { TOOLS };
