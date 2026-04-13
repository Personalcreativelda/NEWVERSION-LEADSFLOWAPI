/**
 * AssistantQueueService
 *
 * Implementa o mesmo padrão do n8n:
 *   1. Enfileirar mensagem no banco
 *   2. Aguardar janela de debounce (3s) — agrupa mensagens rápidas do mesmo contato
 *   3. Adquirir lock atômico por conversa (evita respostas duplicadas)
 *   4. Buscar e limpar fila → processar com a IA
 *   5. Liberar lock ao terminar
 *
 * Isso resolve o problema de "ola" / "oi" gerando greeting mesmo no meio da conversa,
 * pois o lock garante que a resposta anterior já foi salva antes da próxima ser gerada.
 */
import { query } from '../database/connection';
import type { IncomingMessageContext } from './assistant-processor.service';

const DEBOUNCE_MS = 3000;   // janela de 3s para agrupar mensagens rápidas
const LOCK_TTL_S  = 90;     // lock expira em 90s (proteção contra travamentos)

export class AssistantQueueService {
    /**
     * Ponto de entrada: enfileira a mensagem e agenda o processamento com debounce.
     * Deve substituir a chamada direta a assistantProcessor.processIncomingMessage().
     */
    async enqueueAndSchedule(
        ctx: IncomingMessageContext,
        processCallback: (ctx: IncomingMessageContext) => Promise<boolean>
    ): Promise<void> {
        const queued = await this.enqueue(ctx);
        if (!queued) {
            // Tabela ainda não existe — processar diretamente como fallback
            setTimeout(() => {
                processCallback(ctx).catch(err =>
                    console.error('[AssistantQueue] Erro (fallback direto):', err.message)
                );
            }, DEBOUNCE_MS);
            return;
        }

        // Agendar processamento após debounce
        setTimeout(() => {
            this.tryProcess(ctx.conversationId, processCallback).catch(err =>
                console.error('[AssistantQueue] Erro no processamento agendado:', err.message)
            );
        }, DEBOUNCE_MS);
    }

    private async enqueue(ctx: IncomingMessageContext): Promise<boolean> {
        try {
            await query(
                `INSERT INTO assistant_message_queue
                    (conversation_id, user_id, channel_id, channel_type,
                     message_content, remote_jid, contact_phone, contact_name, credentials)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [
                    ctx.conversationId,
                    ctx.userId,
                    ctx.channelId,
                    ctx.channelType,
                    ctx.messageContent,
                    ctx.remoteJid   || null,
                    ctx.contactPhone || null,
                    ctx.contactName  || null,
                    ctx.credentials ? JSON.stringify(ctx.credentials) : null,
                ]
            );
            return true;
        } catch (err: any) {
            if (err.code === '42P01') {
                console.warn('[AssistantQueue] Tabela de fila não existe ainda — usando fallback direto');
                return false;
            }
            console.error('[AssistantQueue] Erro ao enfileirar:', err.message);
            return false;
        }
    }

    private async tryProcess(
        conversationId: string,
        processCallback: (ctx: IncomingMessageContext) => Promise<boolean>
    ): Promise<void> {
        try {
            // 1. Limpar locks expirados
            await query(`DELETE FROM assistant_processing_lock WHERE expires_at < NOW()`).catch(() => {});

            // 2. Tentar adquirir lock atômico (INSERT … ON CONFLICT DO NOTHING)
            const lockResult = await query(
                `INSERT INTO assistant_processing_lock (conversation_id, locked_at, expires_at)
                 VALUES ($1, NOW(), NOW() + INTERVAL '${LOCK_TTL_S} seconds')
                 ON CONFLICT (conversation_id) DO NOTHING
                 RETURNING conversation_id`,
                [conversationId]
            ).catch(() => ({ rows: [] as any[] }));

            if (lockResult.rows.length === 0) {
                // Outra instância já está processando esta conversa
                console.log(`[AssistantQueue] Conversa ${conversationId} já está sendo processada — ignorando`);
                return;
            }

            try {
                // 3. Buscar todas as mensagens enfileiradas desta conversa
                const queuedResult = await query(
                    `SELECT * FROM assistant_message_queue
                     WHERE conversation_id = $1
                     ORDER BY created_at ASC`,
                    [conversationId]
                );

                if (queuedResult.rows.length === 0) {
                    // Fila vazia — já foi processada por outro timer
                    return;
                }

                const rows = queuedResult.rows as Record<string, any>[];

                // 4. Limpar fila ANTES de chamar a IA (evita reprocessamento em caso de erro)
                await query(
                    `DELETE FROM assistant_message_queue WHERE conversation_id = $1`,
                    [conversationId]
                );

                // 5. Usar a última mensagem enfileirada como ctx principal.
                //    As anteriores já estão na tabela messages e aparecerão no rawHistory.
                const latest = rows[rows.length - 1];

                const mergedCtx: IncomingMessageContext = {
                    conversationId:  latest.conversation_id,
                    userId:          latest.user_id,
                    channelId:       latest.channel_id,
                    channelType:     latest.channel_type,
                    messageContent:  latest.message_content,
                    remoteJid:       latest.remote_jid   || undefined,
                    contactPhone:    latest.contact_phone || undefined,
                    contactName:     latest.contact_name  || undefined,
                    // credentials pode vir como string (JSONB) — safe-parse
                    credentials:     latest.credentials
                        ? (typeof latest.credentials === 'string'
                            ? JSON.parse(latest.credentials)
                            : latest.credentials)
                        : undefined,
                };

                console.log(
                    `[AssistantQueue] ✅ Processando ${rows.length} msg(ns) na fila ` +
                    `para conversa ${conversationId}` +
                    (rows.length > 1 ? ` (última: "${latest.message_content.substring(0, 40)}")` : '')
                );

                // 6. Chamar o processor da IA
                await processCallback(mergedCtx);

            } finally {
                // 7. Liberar lock sempre — mesmo em caso de erro
                await query(
                    `DELETE FROM assistant_processing_lock WHERE conversation_id = $1`,
                    [conversationId]
                ).catch(() => {});
            }
        } catch (err: any) {
            if (err.code !== '42P01') {
                console.error('[AssistantQueue] Erro em tryProcess:', err.message);
            }
        }
    }

    /**
     * Verifica se o assistente já enviou ao menos uma resposta nesta conversa.
     * Com o lock garantindo processamento sequencial, esta verificação é race-condition-proof.
     */
    async assistantHasReplied(conversationId: string): Promise<boolean> {
        try {
            const result = await query(
                `SELECT 1 FROM messages
                 WHERE conversation_id = $1
                   AND direction = 'out'
                   AND (metadata->>'source' = 'ai_assistant' OR metadata->>'automated' = 'true')
                 LIMIT 1`,
                [conversationId]
            );
            return result.rows.length > 0;
        } catch {
            return false;
        }
    }
}

export const assistantQueueService = new AssistantQueueService();
