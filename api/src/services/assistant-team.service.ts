// Equipa de assistentes no mesmo canal: cada conversa tem UM responsável (nunca respondem dois).
//
// - Conversa nova: a IA escolhe o colega cuja função combina com o pedido do cliente (sem IA ou
//   sem resposta clara, fica o primeiro da equipa).
// - Durante a conversa: o responsável sabe quem são os colegas e o que cada um faz. Quando o pedido
//   é da área de outro, responde só [[PASSAR:n]] + uma nota interna; o colega recebe a conversa,
//   lê a nota e responde ao cliente na mesma mensagem — o cliente não vê a troca.
// - No máximo 2 passagens por mensagem e nunca de volta a quem acabou de passar (sem voltas).
// - O responsável fica em conversations.metadata.ai_team; os follow-ups usam o mesmo.
import { query } from '../database/connection';
import { AIService, type AIMessage, type ProviderConfig } from './ai.service';

const ai = new AIService();
export const MAX_HANDOFFS = 2;
const HANDOFF_RE = /\[\[\s*PASSAR\s*:\s*(\d+)\s*\]\]/i;

export interface TeamMember {
    user_assistant_id: string;
    assistant_name: string;
    config: any;
    default_config: any;
    short_description?: string | null;
    description?: string | null;
    category?: string | null;
    [k: string]: any;
}

export interface TeamState {
    owner?: string;
    since?: string;
    from?: string;
    note?: string;
    handoffs?: number;
}

/** Todos os assistentes ativos do canal (o mais recente primeiro) */
export async function teamForChannel(userId: string, channelId: string): Promise<TeamMember[]> {
    const r = await query(
        `SELECT ua.id as user_assistant_id, ua.config, ua.channel_ids, ua.assistant_id,
                a.name as assistant_name, a.default_config, a.is_custom,
                a.short_description, a.description, a.category,
                COALESCE(u.plan, 'free') as user_plan
           FROM user_assistants ua
           JOIN assistants a ON ua.assistant_id = a.id
           JOIN users u ON u.id = ua.user_id
          WHERE ua.user_id = $1
            AND ua.is_active = true
            AND ($2 = ANY(ua.channel_ids) OR ua.channel_id = $2)
          ORDER BY ua.updated_at DESC NULLS LAST, ua.created_at DESC`,
        [userId, channelId]
    );
    return r.rows;
}

/** O que este assistente faz na equipa (escrito pelo utilizador ou a descrição do assistente) */
export function memberRole(m: TeamMember): string {
    const own = String(m.config?.team_role || '').trim();
    const text = own || String(m.short_description || m.description || '').trim();
    return text.replace(/\s+/g, ' ').slice(0, 240) || 'atendimento geral';
}

export async function getTeamState(conversationId: string): Promise<TeamState> {
    if (!conversationId) return {};
    try {
        const r = await query(`SELECT metadata->'ai_team' AS team FROM conversations WHERE id = $1`, [conversationId]);
        const t = r.rows[0]?.team;
        return t && typeof t === 'object' ? t : {};
    } catch {
        return {};
    }
}

export async function saveTeamState(conversationId: string, state: TeamState): Promise<void> {
    if (!conversationId) return;
    await query(
        `UPDATE conversations SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('ai_team', $2::jsonb) WHERE id = $1`,
        [conversationId, JSON.stringify(state)]
    );
}

/** Escolha do primeiro responsável: a resposta da IA é o número do colega */
export function parseRouterChoice(text: string, size: number): number | null {
    const m = String(text || '').match(/\d+/);
    if (!m) return null;
    const n = Number(m[0]);
    return n >= 1 && n <= size ? n - 1 : null;
}

export function routerPrompt(team: TeamMember[], customerText: string, recent: string): AIMessage[] {
    const list = team.map((m, i) => `${i + 1}. ${m.assistant_name}: ${memberRole(m)}`).join('\n');
    return [
        {
            role: 'system',
            content: 'Escolha o assistente da equipa que deve atender este cliente, pela função de cada um.\n' +
                `${list}\n\nResponda só com o número. Se nenhum combinar claramente, responda 1.`,
        },
        { role: 'user', content: `${recent ? `Conversa recente:\n${recent}\n\n` : ''}Última mensagem do cliente: ${customerText.slice(0, 1200)}` },
    ];
}

/**
 * Quem responde a esta mensagem. Com um só assistente, ele. Com equipa: o responsável atual
 * (se ainda estiver no canal) ou o escolhido pela IA para uma conversa nova.
 */
export async function pickResponsible(
    team: TeamMember[],
    state: TeamState,
    customerText: string,
    recent: string,
    providers: ProviderConfig[],
): Promise<{ member: TeamMember; routed: boolean }> {
    if (team.length <= 1) return { member: team[0], routed: false };
    const current = state.owner ? team.find((m) => m.user_assistant_id === state.owner) : undefined;
    if (current) return { member: current, routed: false };
    if (providers.length > 0) {
        try {
            const res = await ai.generateResponseWithFallback(routerPrompt(team, customerText, recent), providers);
            const idx = parseRouterChoice(res.content, team.length);
            if (idx !== null) return { member: team[idx], routed: true };
        } catch (err: any) {
            console.warn('[Equipa] Escolha do assistente falhou:', err.message);
        }
    }
    return { member: team[0], routed: true };
}

/** Bloco do prompt: os colegas, o que fazem e como passar a conversa */
export function teamBlock(team: TeamMember[], current: TeamMember, allowHandoff: boolean, state: TeamState): string {
    const others = team
        .map((m, i) => ({ m, n: i + 1 }))
        .filter(({ m }) => m.user_assistant_id !== current.user_assistant_id);
    if (others.length === 0) return '';
    let block = '\n\n---\n[EQUIPA]\n' +
        `Você trabalha em equipa com outros assistentes da mesma empresa. A sua função: ${memberRole(current)}\n` +
        'Colegas:\n' + others.map(({ m, n }) => `${n}. ${m.assistant_name}: ${memberRole(m)}`).join('\n') + '\n';
    if (allowHandoff) {
        block += 'Se o que o cliente pede agora é claramente da função de um colega e não da sua, não responda ao cliente: ' +
            'escreva apenas [[PASSAR:n]] (n = número do colega) seguido de uma frase para o colega com o que o cliente quer e o que já se sabe. ' +
            'O cliente não vê isto e o colega continua a conversa. Na dúvida, ou se for da sua função, responda você.\n';
    } else {
        block += 'Nesta mensagem responda você ao cliente, sem passar a conversa.\n';
    }
    block += 'Nunca diga ao cliente que é um assistente diferente nem que vai passar a outro: para ele é sempre a mesma empresa.\n';
    if (state.note && state.from) {
        block += `\n[PASSAGEM] ${state.from} passou-lhe esta conversa: ${state.note.slice(0, 500)}\n`;
    }
    return block + '---';
}

/** A resposta pede para passar a conversa? (null = responde ao cliente) */
export function parseHandoff(text: string, team: TeamMember[], current: TeamMember): { to: TeamMember; note: string } | null {
    const m = String(text || '').match(HANDOFF_RE);
    if (!m) return null;
    const to = team[Number(m[1]) - 1];
    if (!to || to.user_assistant_id === current.user_assistant_id) return null;
    const note = String(text).slice((m.index || 0) + m[0].length).trim().replace(/\s+/g, ' ').slice(0, 500);
    return { to, note: note || 'O cliente precisa de si.' };
}

/** Tira qualquer marcador de passagem (nunca chega ao cliente) */
export function stripHandoff(text: string): string {
    const m = String(text || '').match(HANDOFF_RE);
    if (!m) return text;
    return String(text).slice(0, m.index).trim();
}

/** Nota na conversa (só a equipa vê): quem passou a quem */
export async function logHandoff(ctx: { userId: string; conversationId: string; channelType: string }, from: TeamMember, to: TeamMember, note: string) {
    try {
        await query(
            `INSERT INTO messages (user_id, conversation_id, direction, channel, content, status, metadata)
             VALUES ($1, $2, 'out', $3, $4, 'sent', $5)`,
            [
                ctx.userId, ctx.conversationId, ctx.channelType,
                `🤖 ${from.assistant_name} passou a conversa a ${to.assistant_name}: ${note}`,
                JSON.stringify({ source: 'funnel_automation', is_system: true, team_handoff: { from: from.user_assistant_id, to: to.user_assistant_id } }),
            ]
        );
    } catch (err: any) {
        console.warn('[Equipa] Nota de passagem não gravada:', err.message);
    }
}
