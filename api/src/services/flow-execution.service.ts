import { query as dbQuery } from '../database/connection';
import { RemarketingService } from './remarketing.service';
import { WhatsAppService } from './whatsapp.service';
import { ChannelsService } from './channels.service';
import pino from 'pino';

const logger = pino().child({ module: 'FlowExecutionService' });

// Stage value → display label mapping (matches frontend FUNNEL_STAGES)
const STAGE_LABEL: Record<string, string> = {
  novo:        'Novo Lead',
  contatado:   'Contatado',
  qualificado: 'Qualificado',
  negociacao:  'Em Negociação',
  convertido:  'Convertido',
  perdido:     'Perdido',
};

interface ExecutionContext {
  leadId: string;
  userId: string;
  flowId: string;
  leadName?: string;
  leadPhone?: string;
  conversationId?: string;
  remoteJid?: string;
  /** The channel type the lead last used — determines which API to call */
  channelType?: 'whatsapp' | 'whatsapp_cloud' | 'facebook' | 'instagram' | 'telegram' | string;
  channelId?: string;
  channelCredentials?: any;
}

export class FlowExecutionService {
  private remarketingService = new RemarketingService();
  private whatsappService    = new WhatsAppService();
  private channelsService    = new ChannelsService();

  /**
   * Check if there are any active flows triggered by this event
   * and execute them asynchronously (fire and forget)
   */
  async triggerFlowsForLead(
    userId: string,
    leadId: string,
    triggerType: 'funnel_stage' | 'tag' | 'inactivity' | 'purchase' | 'lead_score',
    triggerValue: string
  ) {
    try {
      let flowsResult;

      if (triggerType === 'funnel_stage') {
        // match trigger_label that starts with the stage name
        const stageLabel = STAGE_LABEL[triggerValue] ?? triggerValue;
        flowsResult = await dbQuery(
          `SELECT id, name, steps FROM remarketing_flows
           WHERE user_id = $1 AND status = 'active'
           AND trigger_type = $2
           AND trigger_label ILIKE $3 || '%'`,
          [userId, triggerType, stageLabel],
        );

      } else if (triggerType === 'inactivity' || triggerType === 'lead_score') {
        // triggerValue = numeric value (days inactive / actual score)
        // match flows whose numeric threshold ≤ actual value
        const numVal = parseInt(triggerValue, 10);
        if (isNaN(numVal)) return;
        flowsResult = await dbQuery(
          `SELECT id, name, steps FROM remarketing_flows
           WHERE user_id = $1 AND status = 'active' AND trigger_type = $2
           AND CAST(regexp_replace(trigger_label, '[^0-9]', '', 'g') AS INTEGER) <= $3`,
          [userId, triggerType, numVal],
        );

      } else if (triggerType === 'purchase') {
        // fires for all active purchase flows — no threshold
        flowsResult = await dbQuery(
          `SELECT id, name, steps FROM remarketing_flows
           WHERE user_id = $1 AND status = 'active' AND trigger_type = 'purchase'`,
          [userId],
        );

      } else {
        // tag: trigger_label is stored as "Tag: <tagname>"
        flowsResult = await dbQuery(
          `SELECT id, name, steps FROM remarketing_flows
           WHERE user_id = $1 AND status = 'active' AND trigger_type = 'tag'
           AND (trigger_label = $2 OR trigger_label ILIKE 'tag: ' || $3)`,
          [userId, `Tag: ${triggerValue}`, triggerValue],
        );
      }

      if (!flowsResult.rows || flowsResult.rows.length === 0) {
        logger.debug(`[FlowExecution] No active flows found for ${triggerType}="${triggerValue}"`);
        return;
      }

      // Get lead details for variable replacement
      const leadResult = await dbQuery(
        'SELECT id, name, phone, company FROM leads WHERE id = $1 AND user_id = $2',
        [leadId, userId]
      );

      if (!leadResult.rows || !leadResult.rows[0]) {
        logger.warn(`[FlowExecution] Lead not found: ${leadId}`);
        return;
      }

      const lead = leadResult.rows[0];

      // Get the lead's most recent conversation together with its channel info
      let conversationId: string | undefined;
      let remoteJid: string | undefined;
      let channelType: string | undefined;
      let channelId: string | undefined;
      let channelCredentials: any;

      const convResult = await dbQuery(
        `SELECT c.id, c.remote_jid, c.channel_id,
                ch.type  AS channel_type,
                ch.credentials AS channel_credentials
         FROM conversations c
         LEFT JOIN channels ch ON ch.id = c.channel_id
         WHERE c.lead_id = $1 AND c.user_id = $2
         ORDER BY c.updated_at DESC LIMIT 1`,
        [leadId, userId],
      );
      if (convResult.rows?.[0]) {
        const row = convResult.rows[0];
        conversationId  = row.id;
        remoteJid       = row.remote_jid;
        channelId       = row.channel_id;
        channelType     = row.channel_type;
        channelCredentials = row.channel_credentials;
        if (channelCredentials && typeof channelCredentials === 'string') {
          try { channelCredentials = JSON.parse(channelCredentials); } catch (_) {}
        }
      } else if (lead.phone) {
        // No conversation yet — default to WhatsApp with the lead's phone
        remoteJid = `${lead.phone.replace(/\D/g, '')}@s.whatsapp.net`;
      }

      logger.info(`[FlowExecution] Executing ${flowsResult.rows.length} flows for lead "${lead.name || leadId}"`);

      // Ensure enrollment-dedup table exists (idempotent)
      await dbQuery(`
        CREATE TABLE IF NOT EXISTS flow_enrollments (
          id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          flow_id     UUID NOT NULL,
          lead_id     UUID NOT NULL,
          user_id     UUID NOT NULL,
          enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_flow_enrollments ON flow_enrollments(flow_id, lead_id, enrolled_at DESC);
      `).catch(() => {}); // ignore if already exists

      // Increment enrolled_leads and record enrollment (with dedup)
      for (const flowRow of flowsResult.rows) {
        // Dedup: skip if this lead was enrolled in this flow within the last 12h
        const dupeRes = await dbQuery(
          `SELECT 1 FROM flow_enrollments
           WHERE flow_id = $1 AND lead_id = $2
           AND enrolled_at > NOW() - INTERVAL '12 hours' LIMIT 1`,
          [flowRow.id, leadId],
        );
        if (dupeRes.rows?.length > 0) {
          logger.debug(`[FlowExecution] Skipping duplicate enrollment for flow ${flowRow.id} lead ${leadId}`);
          continue;
        }
        dbQuery('UPDATE remarketing_flows SET enrolled_leads = enrolled_leads + 1 WHERE id = $1', [flowRow.id])
          .catch(e => logger.warn(`[FlowExecution] Could not increment enrolled_leads: ${e.message}`));
        dbQuery(
          `INSERT INTO flow_enrollments (flow_id, lead_id, user_id) VALUES ($1, $2, $3)`,
          [flowRow.id, leadId, userId],
        ).catch(() => {});
      }

      // Execute each flow asynchronously (don't wait for response)
      for (const flowRow of flowsResult.rows) {
        setImmediate(() => {
          this.executeFlow({
            leadId,
            userId,
            flowId: flowRow.id,
            leadName: lead.name,
            leadPhone: lead.phone,
            conversationId,
            remoteJid,
            channelType,
            channelId,
            channelCredentials,
          }).catch(err => {
            logger.error(`[FlowExecution] Flow ${flowRow.id} error: ${(err as any).message}`);
          });
        });
      }
    } catch (err) {
      logger.error(`[FlowExecution] Error triggering flows: ${(err as any).message}`);
    }
  }

  /**
   * Execute a single flow for a lead
   * Processes steps sequentially, respecting delays
   */
  private async executeFlow(ctx: ExecutionContext) {
    try {
      const flow = await this.remarketingService.findById(ctx.flowId, ctx.userId);
      if (!flow) {
        logger.warn(`[FlowExecution] Flow not found: ${ctx.flowId}`);
        return;
      }

      const steps = Array.isArray(flow.steps) ? flow.steps : [];
      logger.info(`[FlowExecution] Starting flow "${flow.name}" (${steps.length} steps) for lead "${ctx.leadName || ctx.leadId}"`);

      let stepIndex = 0;
      for (const step of steps) {
        stepIndex++;
        logger.debug(`[FlowExecution] Step ${stepIndex}/${steps.length}: ${step.label}`);
        try {
          await this.executeStep(step, ctx);
        } catch (err) {
          logger.warn(`[FlowExecution] Step ${stepIndex} failed: ${(err as any).message}, continuing...`);
          // Continue to next step even if current fails
        }
      }

      // Mark as conversion (successful completion)
      await dbQuery(
        'UPDATE remarketing_flows SET conversions = conversions + 1 WHERE id = $1',
        [ctx.flowId]
      );

      logger.info(`[FlowExecution] ✅ Flow "${flow.name}" completed`);
    } catch (err) {
      logger.error(`[FlowExecution] Flow execution error: ${(err as any).message}`);
    }
  }

  /**
   * Execute a single step
   */
  private async executeStep(step: any, ctx: ExecutionContext): Promise<void> {
    const { type, label, config = {} } = step;
    logger.debug(`[FlowExecution] Executing step: "${label}" (type=${type})`);

    switch (type) {
      case 'wait':
        await this.stepWait(config);
        break;

      case 'whatsapp':
        await this.stepWhatsapp(config, ctx);
        break;

      case 'facebook':
        await this.stepWhatsapp({ ...config, _forceChannel: 'facebook' }, { ...ctx, channelType: 'facebook' });
        break;

      case 'instagram':
        await this.stepWhatsapp({ ...config, _forceChannel: 'instagram' }, { ...ctx, channelType: 'instagram' });
        break;

      case 'telegram':
        await this.stepWhatsapp({ ...config, _forceChannel: 'telegram' }, { ...ctx, channelType: 'telegram' });
        break;

      case 'email':
        await this.stepEmail(config, ctx);
        break;

      case 'tag':
        await this.stepTag(config, ctx);
        break;

      case 'move_stage':
        await this.stepMoveStage(config, ctx);
        break;

      case 'condition':
        logger.warn(`[FlowExecution] Condition steps not yet implemented`);
        break;

      default:
        logger.warn(`[FlowExecution] Unknown step type: ${type}`);
    }
  }

  /**
   * Wait for a duration.
   * Supports new format { duration: '1', unit: 'dias'|'horas'|'semanas' }
   * and old format string like '7d', '24h'.
   */
  private async stepWait(config: any): Promise<void> {
    let millis: number;
    if (config.unit) {
      const n = parseInt(String(config.duration ?? '1'), 10) || 1;
      const unitMap: Record<string, number> = {
        horas:   3_600_000,
        dias:   86_400_000,
        semanas: 604_800_000,
      };
      millis = n * (unitMap[config.unit] ?? 86_400_000);
    } else {
      millis = this.parseDuration(config.duration || '24h');
    }
    const label = config.unit ? `${config.duration ?? 1} ${config.unit}` : (config.duration || '24h');
    logger.info(`[FlowExecution] ⏳ Waiting ${label}...`);
    return new Promise(resolve => setTimeout(resolve, millis));
  }

  /**
   * Send a message via the channel the lead originally came from.
   * Falls back to the best available WhatsApp channel when no conversation exists yet.
   */
  private async stepWhatsapp(config: any, ctx: ExecutionContext): Promise<void> {
    const message = config.message || 'Olá! Esta é uma mensagem automática.';
    const resolved = this.replaceVariables(message, ctx);
    const chType = ctx.channelType || 'whatsapp';

    logger.info(`[FlowExecution] 📱 Sending via channel "${chType}" for lead ${ctx.leadId}`);

    try {
      // ── Resolve conversation ID ───────────────────────────────────────────
      let convId = ctx.conversationId;
      let usedChannelId = ctx.channelId;
      let credentials = ctx.channelCredentials;

      // ── Dispatch per channel type ─────────────────────────────────────────
      if (chType === 'whatsapp_cloud') {
        await this._sendWhatsappCloud(resolved, ctx, credentials);

      } else if (chType === 'facebook' || chType === 'instagram' || chType === 'messenger') {
        await this._sendMetaMessenger(resolved, ctx, credentials, chType);

      } else if (chType === 'telegram') {
        await this._sendTelegram(resolved, ctx, credentials);

      } else {
        // Default: Evolution API (whatsapp)
        if (!ctx.leadPhone && !ctx.remoteJid) {
          logger.warn(`[FlowExecution] Cannot send: lead has no phone number`);
          return;
        }
        // If we don't have a channel yet, find the first connected WhatsApp channel
        if (!usedChannelId || !credentials) {
          const allChannels = await this.channelsService.findAll(ctx.userId);
          const waCh = allChannels.find(
            (c: any) => (c.type === 'whatsapp' || c.channel_type === 'whatsapp') &&
                        (c.status === 'active' || c.status === 'connected'),
          );
          if (!waCh) {
            logger.warn(`[FlowExecution] No connected WhatsApp channel found for user ${ctx.userId}`);
            return;
          }
          usedChannelId = waCh.id;
          credentials   = waCh.credentials;
          if (credentials && typeof credentials === 'string') {
            try { credentials = JSON.parse(credentials); } catch (_) {}
          }
        }
        const instanceId: string =
          credentials?.instance_name || credentials?.instanceId || credentials?.instance_id ||
          (await this._getInstanceName(usedChannelId!));
        const phone = ctx.leadPhone?.replace(/\D/g, '') ?? '';
        await this.whatsappService.sendMessage({ instanceId, number: phone, text: resolved });
        logger.info(`[FlowExecution] ✅ Sent via Evolution API (instance: ${instanceId})`);
      }

      // ── Save to inbox ─────────────────────────────────────────────────────
      if (!convId && ctx.remoteJid && usedChannelId) {
        const look = await dbQuery(
          `SELECT id FROM conversations
           WHERE lead_id = $1 AND user_id = $2 AND remote_jid = $3
           ORDER BY updated_at DESC LIMIT 1`,
          [ctx.leadId, ctx.userId, ctx.remoteJid],
        );
        if (look.rows?.[0]) {
          convId = look.rows[0].id;
        } else {
          const ins = await dbQuery(
            `INSERT INTO conversations (user_id, lead_id, remote_jid, channel_id, status)
             VALUES ($1, $2, $3, $4, 'open') RETURNING id`,
            [ctx.userId, ctx.leadId, ctx.remoteJid, usedChannelId],
          );
          convId = ins.rows?.[0]?.id;
        }
      }
      if (convId) {
        await dbQuery(
          `INSERT INTO messages (conversation_id, user_id, direction, channel, content, status)
           VALUES ($1, $2, 'out', $3, $4, 'sent') RETURNING id`,
          [convId, ctx.userId, chType, resolved],
        );
        logger.info(`[FlowExecution] ✅ Message saved to inbox (conv: ${convId})`);
      }
    } catch (err) {
      logger.error(`[FlowExecution] Send error (${chType}): ${(err as any).message}`);
      throw err;
    }
  }

  /** WhatsApp Business Cloud (Graph API) */
  private async _sendWhatsappCloud(text: string, ctx: ExecutionContext, creds: any): Promise<void> {
    const phoneNumberId = creds?.phone_number_id;
    const accessToken   = creds?.access_token;
    if (!phoneNumberId || !accessToken) {
      logger.warn(`[FlowExecution] WhatsApp Cloud: missing phone_number_id or access_token`);
      return;
    }
    const phone = ctx.leadPhone?.replace(/\D/g, '') ||
                  ctx.remoteJid?.replace('@s.whatsapp.net', '') || '';
    if (!phone) { logger.warn(`[FlowExecution] WhatsApp Cloud: no phone`); return; }

    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { body: text },
      }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(`WhatsApp Cloud error ${res.status}: ${e?.error?.message || res.statusText}`);
    }
    logger.info(`[FlowExecution] ✅ Sent via WhatsApp Cloud`);
  }

  /** Facebook Messenger / Instagram DM (Graph API) */
  private async _sendMetaMessenger(
    text: string, ctx: ExecutionContext, creds: any, channelType: string,
  ): Promise<void> {
    const recipientId = ctx.remoteJid; // PSID / IGSID
    if (!recipientId) { logger.warn(`[FlowExecution] ${channelType}: no recipientId (remoteJid)`); return; }

    const accessToken = creds?.page_access_token || creds?.access_token;
    if (!accessToken) {
      logger.warn(`[FlowExecution] ${channelType}: no access token in channel credentials`);
      return;
    }
    const pageId = creds?.page_id;
    const apiUrl = pageId
      ? `https://graph.facebook.com/v21.0/${pageId}/messages`
      : 'https://graph.facebook.com/v21.0/me/messages';

    const res = await fetch(`${apiUrl}?access_token=${accessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(`${channelType} Graph API error ${res.status}: ${e?.error?.message || res.statusText}`);
    }
    logger.info(`[FlowExecution] ✅ Sent via ${channelType} (Messenger Graph API)`);
  }

  /** Telegram Bot API */
  private async _sendTelegram(text: string, ctx: ExecutionContext, creds: any): Promise<void> {
    const botToken = creds?.bot_token || creds?.token;
    const chatId   = ctx.remoteJid;
    if (!botToken) { logger.warn(`[FlowExecution] Telegram: no bot_token`); return; }
    if (!chatId)   { logger.warn(`[FlowExecution] Telegram: no chatId (remoteJid)`); return; }

    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(`Telegram error ${res.status}: ${e?.description || res.statusText}`);
    }
    logger.info(`[FlowExecution] ✅ Sent via Telegram`);
  }

  /** Get instance name from channels table when not in credentials */
  private async _getInstanceName(channelId: string): Promise<string> {
    const r = await dbQuery(
      `SELECT credentials->>'instance_name' AS name FROM channels WHERE id = $1`,
      [channelId],
    );
    return r.rows?.[0]?.name || channelId;
  }

  /**
   * Send email (placeholder for now)
   */
  private async stepEmail(config: any, ctx: ExecutionContext): Promise<void> {
    try {
      const subject = config.subject || 'Mensagem automática';
      const body = config.body || '';
      const resolved = this.replaceVariables(body, ctx);

      logger.info(`[FlowExecution] 📧 Email: "${subject}"`);
      logger.warn(`[FlowExecution] Email sending not yet implemented`);
      // TODO: Implement email sending
    } catch (err) {
      logger.error(`[FlowExecution] Email error: ${(err as any).message}`);
      throw err;
    }
  }

  /**
   * Apply a tag to the lead
   */
  private async stepTag(config: any, ctx: ExecutionContext): Promise<void> {
    const tag = config.tag || '';
    if (!tag) return;

    try {
      logger.info(`[FlowExecution] 🏷️  Applying tag "${tag}"`);

      await dbQuery(
        `UPDATE leads SET tags = array_append(tags, $1)
         WHERE id = $2 AND user_id = $3 AND NOT $1 = ANY(tags)`,
        [tag, ctx.leadId, ctx.userId]
      );

      logger.info(`[FlowExecution] ✅ Tag "${tag}" applied`);
    } catch (err) {
      logger.error(`[FlowExecution] Tag error: ${(err as any).message}`);
      throw err;
    }
  }

  /**
   * Move lead to a different funnel stage
   */
  private async stepMoveStage(config: any, ctx: ExecutionContext): Promise<void> {
    const stage = config.stage || '';
    if (!stage) return;

    try {
      logger.info(`[FlowExecution] 📊 Moving to stage "${stage}"`);

      await dbQuery(
        'UPDATE leads SET status = $1 WHERE id = $2 AND user_id = $3',
        [stage, ctx.leadId, ctx.userId]
      );

      logger.info(`[FlowExecution] ✅ Lead moved to "${stage}"`);
    } catch (err) {
      logger.error(`[FlowExecution] Stage move error: ${(err as any).message}`);
      throw err;
    }
  }

  /**
   * Parse duration string to milliseconds
   * Examples: "7d", "24h", "1h", "30m"
   */
  private parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)([dhms])$/);
    if (!match) return 86400000; // default 1 day

    const [, num, unit] = match;
    const n = parseInt(num, 10);

    switch (unit) {
      case 'd':
        return n * 86400000; // days
      case 'h':
        return n * 3600000; // hours
      case 'm':
        return n * 60000; // minutes
      case 's':
        return n * 1000; // seconds
      default:
        return 86400000;
    }
  }

  /**
   * Replace {{nome}} and {{empresa}} variables
   */
  private replaceVariables(text: string, ctx: ExecutionContext): string {
    const firstName = ctx.leadName?.split(' ')[0] || 'Cliente';
    const company = ''; // TODO: get from lead details

    return text
      .replace(/\{\{nome\}\}/g, firstName)
      .replace(/\{\{empresa\}\}/g, company);
  }
}

export const flowExecutionService = new FlowExecutionService();
