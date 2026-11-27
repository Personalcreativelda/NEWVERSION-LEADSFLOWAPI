// Estados das mensagens do WhatsApp oficial vindos da Meta (webhook entry[].changes[].value.statuses[]).
// A resposta 200 do envio só quer dizer "aceite": a mensagem fica 'pending' até a Meta dizer sent /
// delivered / read / failed. Regras:
//  - o estado só sobe (pending < sent < delivered < read); "failed" vale enquanto não houver entrega;
//  - eventos repetidos não mudam nada (idempotente);
//  - um estado que chega antes de a mensagem estar gravada fica guardado (wa_status_buffer) e é
//    aplicado logo que ela exista (no envio e numa volta periódica);
//  - nas falhas guarda-se o código, o título e os detalhes da Meta, e um texto em português.
import { query } from '../database/connection';
import { getWebSocketService } from './websocket.service';
import { cloudErrorText } from './whatsapp-cloud.service';

type CloudStatus = 'sent' | 'delivered' | 'read' | 'failed';
const STATUSES = new Set<CloudStatus>(['sent', 'delivered', 'read', 'failed']);
const SWEEP_MS = 20_000;

export interface CloudStatusEvent {
  id: string;
  status: string;
  timestamp?: string | number;
  errors?: any[];
  recipient_id?: string;
}

function errorOf(ev: CloudStatusEvent) {
  const e = Array.isArray(ev.errors) ? ev.errors[0] : null;
  if (!e) return null;
  const details = e.error_data?.details || e.message || e.title || '';
  return {
    code: e.code ?? null,
    title: e.title || null,
    details: details || null,
    message: cloudErrorText(Number(e.code) || undefined, details),
    href: e.href || null,
  };
}

/** Aplica um estado. Devolve true se a mensagem existe (mesmo que o estado não tenha mudado). */
export async function applyCloudStatus(ev: CloudStatusEvent, opts: { buffer?: boolean } = { buffer: true }): Promise<boolean> {
  const status = String(ev?.status || '').toLowerCase() as CloudStatus;
  if (!ev?.id || !STATUSES.has(status)) return true;
  const error = status === 'failed' ? errorOf(ev) : null;
  const at = ev.timestamp && Number(ev.timestamp) > 0 ? new Date(Number(ev.timestamp) * 1000) : new Date();

  const exists = await query(`SELECT id FROM messages WHERE external_id = $1 AND direction = 'out' LIMIT 1`, [ev.id]);
  if (!exists.rows.length) {
    // Chegou antes de a mensagem estar gravada: guarda para aplicar depois
    if (opts.buffer !== false) {
      await query(
        `INSERT INTO wa_status_buffer (external_id, status, payload) VALUES ($1, $2, $3)
         ON CONFLICT (external_id, status) DO NOTHING`,
        [ev.id, status, JSON.stringify(ev)],
      ).catch((err) => console.warn('[CloudStatus] Não guardei o estado adiantado:', err?.message));
    }
    return false;
  }

  const upd = await query(
    `UPDATE messages
        SET status = $1::text,
            sent_at = CASE WHEN $1::text IN ('sent', 'delivered', 'read') THEN COALESCE(sent_at, $3) ELSE sent_at END,
            delivered_at = CASE WHEN $1::text IN ('delivered', 'read') THEN COALESCE(delivered_at, $3) ELSE delivered_at END,
            read_at = CASE WHEN $1::text = 'read' THEN COALESCE(read_at, $3) ELSE read_at END,
            metadata = CASE WHEN $2::jsonb IS NULL THEN metadata
                            ELSE COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('error', $2::jsonb) END,
            updated_at = NOW()
      WHERE external_id = $4 AND direction = 'out'
        AND (
          ($1::text = 'failed' AND status NOT IN ('delivered', 'read', 'failed'))
          OR ($1::text <> 'failed' AND status <> 'failed'
              AND (CASE status WHEN 'read' THEN 3 WHEN 'delivered' THEN 2 WHEN 'sent' THEN 1 ELSE 0 END)
                < (CASE $1::text WHEN 'read' THEN 3 WHEN 'delivered' THEN 2 WHEN 'sent' THEN 1 ELSE 0 END))
          -- Entregue/lida depois de uma falha registada: a Meta acabou por entregar
          OR ($1::text IN ('delivered', 'read') AND status = 'failed')
        )
      RETURNING *`,
    [status, error ? JSON.stringify(error) : null, at, ev.id],
  );

  const ws = getWebSocketService();
  for (const row of upd.rows) {
    if (!ws) break;
    ws.emitMessageStatusUpdate(row.user_id, { messageId: row.id, conversationId: row.conversation_id, status });
    // Falha: a bolha mostra o motivo (vai a mensagem inteira, com metadata.error)
    if (status === 'failed') ws.emitToUser(row.user_id, 'message_updated', { conversationId: row.conversation_id, message: row });
  }
  return true;
}

/** Estados que chegaram antes da mensagem: aplica os desta mensagem (ou todos os pendentes) */
export async function drainBufferedStatuses(externalId?: string | null): Promise<void> {
  const r = await query(
    `SELECT b.external_id, b.status, b.payload FROM wa_status_buffer b
      WHERE ${externalId ? 'b.external_id = $1' : `EXISTS (SELECT 1 FROM messages m WHERE m.external_id = b.external_id AND m.direction = 'out')`}
      ORDER BY CASE b.status WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2 WHEN 'read' THEN 3 ELSE 4 END
      LIMIT 500`,
    externalId ? [externalId] : [],
  );
  for (const row of r.rows) {
    const ev = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
    const applied = await applyCloudStatus(ev, { buffer: false });
    if (applied) await query('DELETE FROM wa_status_buffer WHERE external_id = $1 AND status = $2', [row.external_id, row.status]);
  }
}

class CloudStatusWorker {
  private timer: NodeJS.Timeout | null = null;
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void drainBufferedStatuses().catch((err) => console.warn('[CloudStatus] Volta:', err?.message));
      // Estados de mensagens que nunca apareceram (ex.: enviadas por outra ferramenta) não ficam para sempre
      void query(`DELETE FROM wa_status_buffer WHERE received_at < NOW() - INTERVAL '2 days'`).catch(() => {});
    }, SWEEP_MS);
    this.timer.unref?.();
  }
}

export const cloudStatusWorker = new CloudStatusWorker();
