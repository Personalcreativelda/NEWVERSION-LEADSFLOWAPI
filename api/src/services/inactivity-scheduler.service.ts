/**
 * Inactivity Scheduler
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs every 6 hours.  For each active "inactivity" remarketing flow, finds
 * leads that have not been contacted in ≥ threshold days and fires the flow.
 *
 * Dedup is handled inside FlowExecutionService.triggerFlowsForLead via the
 * flow_enrollments table (12-hour cooldown per lead+flow pair).
 */

import { query as dbQuery } from '../database/connection';
import { FlowExecutionService } from './flow-execution.service';

const flowExecutionService = new FlowExecutionService();

const INTERVAL_MS = 6 * 3600 * 1000; // 6 hours

async function runInactivityCheck(): Promise<void> {
  try {
    // All active inactivity flows (across all users)
    const flowsResult = await dbQuery(
      `SELECT id, user_id, trigger_label
       FROM remarketing_flows
       WHERE status = 'active' AND trigger_type = 'inactivity'`,
    );

    if (!flowsResult.rows?.length) return;

    console.log(`[InactivityScheduler] Checking ${flowsResult.rows.length} active inactivity flow(s)…`);

    for (const flow of flowsResult.rows) {
      // Parse threshold from trigger_label: "Inatividade +7 dias" → 7
      const match = (flow.trigger_label as string).match(/(\d+)/);
      if (!match) continue;
      const threshold = parseInt(match[1], 10);
      if (isNaN(threshold) || threshold <= 0) continue;

      // Find leads that:
      //  - belong to this user
      //  - are NOT converted / lost (no point re-engaging)
      //  - have not been contacted in ≥ threshold days
      const leadsResult = await dbQuery(
        `SELECT id FROM leads
         WHERE user_id = $1
           AND status NOT IN ('convertido', 'perdido')
           AND (
             last_contact_at IS NULL
             OR last_contact_at < NOW() - ($2 || ' days')::INTERVAL
           )`,
        [flow.user_id, threshold],
      );

      if (!leadsResult.rows?.length) continue;

      console.log(
        `[InactivityScheduler] Flow "${flow.id}" (threshold ${threshold}d) → ${leadsResult.rows.length} inactive lead(s)`,
      );

      for (const lead of leadsResult.rows) {
        // triggerFlowsForLead will handle dedup (flow_enrollments table)
        flowExecutionService
          .triggerFlowsForLead(flow.user_id, lead.id, 'inactivity', String(threshold))
          .catch(err =>
            console.error(
              `[InactivityScheduler] Error for lead ${lead.id}:`,
              (err as any).message,
            ),
          );
      }
    }
  } catch (err) {
    console.error('[InactivityScheduler] Check failed:', (err as any).message);
  }
}

export const inactivityScheduler = {
  start() {
    console.log('[InactivityScheduler] Started — checking every 6 hours');
    // First run after 30s (give DB time to fully initialize)
    setTimeout(() => {
      runInactivityCheck();
      setInterval(runInactivityCheck, INTERVAL_MS);
    }, 30_000);
  },
};
