import { query as dbQuery } from '../database/connection';
import { RemarketingService } from './remarketing.service';
import pino from 'pino';

const logger = pino().child({ module: 'FlowExecutionService' });

interface ExecutionContext {
  leadId: string;
  userId: string;
  flowId: string;
  leadName?: string;
  leadPhone?: string;
  conversationId?: string;
  remoteJid?: string;
}

export class FlowExecutionService {
  private remarketingService = new RemarketingService();

  /**
   * Check if there are any active flows triggered by this event
   * and execute them asynchronously (fire and forget)
   */
  async triggerFlowsForLead(
    userId: string,
    leadId: string,
    triggerType: 'funnel_stage' | 'tag' | 'inactivity',
    triggerValue: string
  ) {
    try {
      // Find all active flows with this trigger
      const flowsResult = await dbQuery(
        `SELECT id, name, steps FROM remarketing_flows
         WHERE user_id = $1 AND status = 'active' 
         AND trigger_type = $2 AND trigger_label = $3`,
        [userId, triggerType, triggerValue]
      );

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

      // Get or create conversation for this lead (try to find by phone)
      let conversationId: string | undefined;
      let remoteJid: string | undefined;

      if (lead.phone) {
        const phone = lead.phone.replace(/\D/g, '');
        remoteJid = `${phone}@s.whatsapp.net`;

        const convResult = await dbQuery(
          `SELECT id FROM conversations 
           WHERE lead_id = $1 AND user_id = $2 AND remote_jid = $3
           ORDER BY updated_at DESC LIMIT 1`,
          [leadId, userId, remoteJid]
        );
        if (convResult.rows?.[0]) {
          conversationId = convResult.rows[0].id;
        }
      }

      logger.info(`[FlowExecution] Executing ${flowsResult.rows.length} flows for lead "${lead.name || leadId}"`);

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
   * Wait for a duration (7d, 24h, 1h, etc.)
   */
  private async stepWait(config: any): Promise<void> {
    const duration = config.duration || '24h';
    const millis = this.parseDuration(duration);
    logger.info(`[FlowExecution] ⏳ Waiting ${duration}...`);
    return new Promise(resolve => setTimeout(resolve, millis));
  }

  /**
   * Send WhatsApp message
   */
  private async stepWhatsapp(config: any, ctx: ExecutionContext): Promise<void> {
    if (!ctx.conversationId || !ctx.remoteJid) {
      logger.warn(`[FlowExecution] Cannot send WhatsApp: missing conversation or remoteJid`);
      return;
    }

    try {
      const message = config.message || 'Olá! Esta é uma mensagem automática.';
      const resolved = this.replaceVariables(message, ctx);

      logger.info(`[FlowExecution] 📱 Sending WhatsApp: "${resolved.substring(0, 50)}..."`);

      // Insert message into database
      const msgResult = await dbQuery(
        `INSERT INTO messages 
         (conversation_id, user_id, direction, channel, content, status)
         VALUES ($1, $2, 'out', 'whatsapp', $3, 'sent')
         RETURNING id`,
        [ctx.conversationId, ctx.userId, resolved]
      );

      if (msgResult.rows?.[0]) {
        logger.info(`[FlowExecution] ✅ WhatsApp message sent (${msgResult.rows[0].id})`);
      }
    } catch (err) {
      logger.error(`[FlowExecution] WhatsApp send error: ${(err as any).message}`);
      throw err;
    }
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
