// Estado real dos WhatsApp ligados por código QR.
// O canal ficava "Ligado" depois de o telemóvel desligar a sessão (aparelhos ligados → terminar sessão,
// número banido, WhatsApp reinstalado). Agora:
//   • a cada 5 min pergunta à Evolution o estado de cada instância (connectionState);
//   • o evento connection.update confirma logo (o "close" é confirmado 30 s depois: o Baileys fecha e
//     volta a abrir sozinho em quedas curtas);
//   • open → status 'active'; close ou instância inexistente → 'inactive' + aviso no sino.
// Sem resposta da Evolution (rede, 5xx) não muda nada: não marca desligado por um problema nosso.
// Reconectar usa a mesma instância: GET /api/whatsapp/qr/:instance (WhatsAppConnect em modo reconectar).
import { query } from '../database/connection';
import { WhatsAppService } from './whatsapp.service';
import { notificationsService } from './notifications.service';
import { getWebSocketService } from './websocket.service';

const whatsappService = new WhatsAppService();
const SWEEP_MS = 5 * 60_000;
const CLOSE_CONFIRM_MS = 30_000;

type LiveState = 'open' | 'close' | 'connecting' | 'unknown';

const parse = (v: any) => (typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch { return {}; } })() : v || {});
const instanceOf = (ch: any): string | null => {
  const c = parse(ch.credentials);
  return c.instance_id || c.instance_name || null;
};

async function liveState(instance: string): Promise<LiveState> {
  try {
    const r: any = await whatsappService.getStatus(instance);
    const raw = String(r?.instance?.state || r?.state || r?.instance?.status || r?.connectionStatus || '').toLowerCase();
    if (raw === 'open' || raw === 'connected') return 'open';
    if (raw === 'close' || raw === 'closed' || raw === 'disconnected') return 'close';
    if (raw === 'connecting') return 'connecting';
    return 'unknown';
  } catch (err: any) {
    // A instância já não existe na Evolution: o número tem de ser lido de novo
    if (/^404\b/.test(String(err?.message || ''))) return 'close';
    return 'unknown';
  }
}

class ChannelHealthService {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private pendingClose = new Map<string, NodeJS.Timeout>();

  start() {
    if (this.timer || process.env.DISABLE_CHANNEL_HEALTH === 'true') return;
    setTimeout(() => { void this.sweep(); }, 60_000).unref?.();
    this.timer = setInterval(() => { void this.sweep(); }, SWEEP_MS);
    this.timer.unref?.();
  }

  /** Verifica todos os WhatsApp por QR (um de cada vez, para não sobrecarregar a Evolution) */
  async sweep() {
    if (this.running) return;
    this.running = true;
    try {
      const r = await query(`SELECT * FROM channels WHERE type = 'whatsapp' AND status IN ('active', 'inactive', 'error')`);
      for (const ch of r.rows) {
        await this.check(ch).catch((err) => console.warn('[ChannelHealth]', ch.id, err?.message));
        await new Promise((res) => setTimeout(res, 200));
      }
    } catch (err: any) {
      console.warn('[ChannelHealth] Verificação:', err?.message);
    } finally {
      this.running = false;
    }
  }

  /** Verifica um canal e grava o estado; devolve o estado atual do canal */
  async check(channel: any): Promise<'active' | 'inactive' | string> {
    const instance = instanceOf(channel);
    if (!instance) return channel.status;
    const state = await liveState(instance);
    if (state === 'open') return this.apply(channel, 'active');
    if (state === 'close') return this.apply(channel, 'inactive');
    return channel.status;
  }

  /** Evento connection.update da Evolution */
  onConnectionUpdate(instance: string, rawState: string) {
    const state = String(rawState || '').toLowerCase();
    void (async () => {
      const r = await query(
        `SELECT * FROM channels WHERE type = 'whatsapp' AND (credentials->>'instance_id' = $1 OR credentials->>'instance_name' = $1)`,
        [instance],
      );
      for (const ch of r.rows) {
        const pending = this.pendingClose.get(ch.id);
        if (state === 'open') {
          if (pending) { clearTimeout(pending); this.pendingClose.delete(ch.id); }
          await this.apply(ch, 'active');
        } else if (state === 'close' && !pending) {
          const t = setTimeout(() => {
            this.pendingClose.delete(ch.id);
            void this.recheck(ch.id);
          }, CLOSE_CONFIRM_MS);
          t.unref?.();
          this.pendingClose.set(ch.id, t);
        }
      }
    })().catch((err) => console.warn('[ChannelHealth] connection.update:', err?.message));
  }

  /** Verifica de novo um canal pelo id (do utilizador, quando pedido pela API) */
  async recheck(channelId: string, userId?: string) {
    const r = await query(
      `SELECT * FROM channels WHERE id = $1 ${userId ? 'AND user_id = $2' : ''}`,
      userId ? [channelId, userId] : [channelId],
    );
    const ch = r.rows[0];
    if (!ch) return null;
    if (ch.type !== 'whatsapp') return ch.status;
    return this.check(ch);
  }

  private async apply(channel: any, status: 'active' | 'inactive') {
    if (channel.status === status) return status;
    const upd = await query(
      `UPDATE channels
          SET status = $2,
              settings = COALESCE(settings, '{}'::jsonb) || $3::jsonb,
              updated_at = NOW()
        WHERE id = $1 AND status <> $2
        RETURNING id`,
      [channel.id, status, JSON.stringify(status === 'inactive'
        ? { disconnected_at: new Date().toISOString() }
        : { disconnected_at: null, reconnected_at: new Date().toISOString() })],
    );
    if (!upd.rowCount) return status; // outro processo já mudou
    console.log(`[ChannelHealth] ${channel.name || channel.id}: ${channel.status} → ${status}`);

    getWebSocketService()?.emitToUser(channel.user_id, 'channel:status', { channelId: channel.id, status });
    if (status === 'inactive') {
      await notificationsService.createNotification(
        channel.user_id, 'channel_disconnected', `WhatsApp "${channel.name}" desligado`,
        'O telemóvel terminou a sessão. Abra o canal e leia o código QR de novo.', 'whatsapp',
        { channelId: channel.id, actionUrl: '/dashboard/inbox/settings' },
      ).catch(() => {});
    }
    return status;
  }
}

export const channelHealthService = new ChannelHealthService();
