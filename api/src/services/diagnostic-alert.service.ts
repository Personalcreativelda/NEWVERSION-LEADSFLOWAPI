import { runAllChecks, CheckResult, DiagnosticReport } from './health-check.service';
import { emailService } from './email.service';

// How often to run checks (default: every 5 minutes)
const CHECK_INTERVAL_MS = Number(process.env.DIAGNOSTIC_INTERVAL_MS ?? 5 * 60 * 1000);

// Minimum gap between two emails for the same issue (default: 1 hour)
const ALERT_THROTTLE_MS = Number(process.env.DIAGNOSTIC_ALERT_THROTTLE_MS ?? 60 * 60 * 1000);

// Who receives alerts
const ALERT_EMAIL = process.env.ALERT_EMAIL || process.env.ADMIN_EMAIL || '';

// Track when each check name last triggered an alert
const lastAlertAt: Record<string, number> = {};

// Track last overall status to detect recoveries
let lastOverall: 'ok' | 'warn' | 'error' = 'ok';

// ── email builders ─────────────────────────────────────────────────────────────

function statusIcon(status: CheckResult['status']): string {
  return status === 'ok' ? '✅' : status === 'warn' ? '⚠️' : '❌';
}

function buildAlertEmail(report: DiagnosticReport, newProblems: CheckResult[]): { subject: string; html: string; text: string } {
  const appUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'https://app.leadsflowapi.com';
  const apiUrl = process.env.SERVICE_URL_API || `http://localhost:${process.env.PORT || 4000}`;
  const overallIcon = statusIcon(report.overall);

  const problemRows = newProblems.map(c =>
    `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #2a2a3a;color:${c.status === 'error' ? '#ff4444' : '#f59e0b'};font-weight:600;">${statusIcon(c.status)} ${c.name.replace(/_/g, ' ').toUpperCase()}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #2a2a3a;color:#e5e7eb;">${c.message}</td>
    </tr>`
  ).join('');

  const allRows = report.checks.map(c =>
    `<tr>
      <td style="padding:6px 12px;border-bottom:1px solid #1e1e2e;color:#9ca3af;font-size:12px;">${statusIcon(c.status)} ${c.name.replace(/_/g, ' ')}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #1e1e2e;color:#6b7280;font-size:12px;">${c.message}${c.latencyMs != null ? ` <span style="color:#4b5563">(${c.latencyMs}ms)</span>` : ''}</td>
    </tr>`
  ).join('');

  const subject = `${overallIcon} LeadsFlow Alert — ${newProblems.length} issue${newProblems.length !== 1 ? 's' : ''} detected`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#0a0a14;margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:640px;margin:0 auto;">
    <div style="background:#111827;border-radius:12px;overflow:hidden;border:1px solid #1e2a3a;">
      <!-- Header -->
      <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:24px 28px;border-bottom:1px solid #1e2a3a;">
        <div style="display:flex;align-items:center;gap:12px;">
          <span style="font-size:28px;">${overallIcon}</span>
          <div>
            <h2 style="margin:0;color:#ffffff;font-size:18px;">LeadsFlow — Diagnostic Alert</h2>
            <p style="margin:4px 0 0;color:#6b7280;font-size:13px;">${report.timestamp}</p>
          </div>
        </div>
      </div>

      <!-- New problems -->
      <div style="padding:20px 28px;">
        <h3 style="color:#f87171;margin:0 0 12px;font-size:15px;">🚨 Issues requiring attention</h3>
        <table style="width:100%;border-collapse:collapse;background:#1a0a0a;border-radius:8px;overflow:hidden;">
          <thead>
            <tr>
              <th style="padding:8px 12px;text-align:left;color:#9ca3af;font-size:12px;background:#1e1218;border-bottom:1px solid #2a2a3a;">SERVICE</th>
              <th style="padding:8px 12px;text-align:left;color:#9ca3af;font-size:12px;background:#1e1218;border-bottom:1px solid #2a2a3a;">ISSUE</th>
            </tr>
          </thead>
          <tbody>${problemRows}</tbody>
        </table>
      </div>

      <!-- Full report -->
      <div style="padding:0 28px 20px;">
        <h3 style="color:#9ca3af;margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Full System Status</h3>
        <table style="width:100%;border-collapse:collapse;background:#0f1623;border-radius:8px;overflow:hidden;">
          <tbody>${allRows}</tbody>
        </table>
      </div>

      <!-- Stats -->
      <div style="padding:0 28px 20px;display:flex;gap:16px;flex-wrap:wrap;">
        <div style="background:#0f1623;border-radius:8px;padding:12px 16px;flex:1;min-width:120px;">
          <div style="color:#6b7280;font-size:11px;text-transform:uppercase;">Active Users</div>
          <div style="color:#ffffff;font-size:20px;font-weight:700;">${report.totalUsers ?? '—'}</div>
        </div>
        <div style="background:#0f1623;border-radius:8px;padding:12px 16px;flex:1;min-width:120px;">
          <div style="color:#6b7280;font-size:11px;text-transform:uppercase;">Environment</div>
          <div style="color:#ffffff;font-size:20px;font-weight:700;">${report.environment}</div>
        </div>
        <div style="background:#0f1623;border-radius:8px;padding:12px 16px;flex:1;min-width:120px;">
          <div style="color:#6b7280;font-size:11px;text-transform:uppercase;">Checks</div>
          <div style="color:#ffffff;font-size:20px;font-weight:700;">${report.checks.length}</div>
        </div>
      </div>

      <!-- Actions -->
      <div style="padding:0 28px 24px;display:flex;gap:12px;flex-wrap:wrap;">
        <a href="${apiUrl}/api/diagnostics" style="background:#6366f1;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;">Ver Diagnóstico Completo</a>
        <a href="${appUrl}" style="background:#1e293b;color:#94a3b8;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:13px;">Abrir App</a>
      </div>

      <div style="padding:12px 28px;background:#0a0a14;border-top:1px solid #1e2a3a;">
        <p style="margin:0;color:#374151;font-size:11px;">LeadsFlow Diagnostic Monitor · Próxima verificação em ${Math.round(CHECK_INTERVAL_MS / 60000)} minutos</p>
      </div>
    </div>
  </div>
</body>
</html>`;

  const text = [
    `LeadsFlow Diagnostic Alert — ${report.overall.toUpperCase()}`,
    `Time: ${report.timestamp}`,
    '',
    'ISSUES:',
    ...newProblems.map(c => `  [${c.status.toUpperCase()}] ${c.name}: ${c.message}`),
    '',
    'FULL REPORT:',
    ...report.checks.map(c => `  ${c.status === 'ok' ? 'OK' : c.status.toUpperCase().padEnd(5)} ${c.name}: ${c.message}`),
    '',
    `Active users: ${report.totalUsers ?? 'unknown'}`,
    `Diagnostic API: ${apiUrl}/api/diagnostics`,
  ].join('\n');

  return { subject, html, text };
}

function buildRecoveryEmail(report: DiagnosticReport): { subject: string; html: string; text: string } {
  const subject = '✅ LeadsFlow — All systems recovered';
  const html = `
<!DOCTYPE html><html><body style="background:#0a0a14;padding:24px;font-family:-apple-system,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#0f1a0f;border:1px solid #166534;border-radius:12px;padding:28px;">
    <h2 style="color:#4ade80;margin:0 0 8px;">✅ All systems recovered</h2>
    <p style="color:#9ca3af;margin:0 0 16px;">${report.timestamp}</p>
    <p style="color:#d1fae5;">All ${report.checks.length} health checks are now passing. No further action required.</p>
    <p style="color:#6b7280;font-size:12px;margin-top:16px;">LeadsFlow Diagnostic Monitor</p>
  </div>
</body></html>`;
  const text = `LeadsFlow — All systems recovered\n${report.timestamp}\nAll ${report.checks.length} checks passing.`;
  return { subject, html, text };
}

// ── alert logic ───────────────────────────────────────────────────────────────

async function sendAlertEmail(report: DiagnosticReport, problems: CheckResult[]): Promise<void> {
  if (!ALERT_EMAIL) {
    console.warn('[DiagAlert] No ALERT_EMAIL or ADMIN_EMAIL configured — skipping email notification');
    return;
  }
  const { subject, html, text } = buildAlertEmail(report, problems);
  try {
    await emailService.sendRaw({ to: ALERT_EMAIL, subject, html, text });
    console.log(`[DiagAlert] ✉️  Alert email sent to ${ALERT_EMAIL}: ${subject}`);
  } catch (err) {
    console.error('[DiagAlert] Failed to send alert email:', err);
  }
}

async function sendRecoveryEmail(report: DiagnosticReport): Promise<void> {
  if (!ALERT_EMAIL) return;
  const { subject, html, text } = buildRecoveryEmail(report);
  try {
    await emailService.sendRaw({ to: ALERT_EMAIL, subject, html, text });
    console.log(`[DiagAlert] ✉️  Recovery email sent to ${ALERT_EMAIL}`);
  } catch (err) {
    console.error('[DiagAlert] Failed to send recovery email:', err);
  }
}

// ── main loop ─────────────────────────────────────────────────────────────────

async function runChecksAndAlert(): Promise<void> {
  let report: DiagnosticReport;
  try {
    report = await runAllChecks();
  } catch (err) {
    console.error('[DiagAlert] Health check threw unexpectedly:', err);
    return;
  }

  const problems = report.checks.filter(c => c.status !== 'ok');
  const now = Date.now();

  // Determine which problems are new (not recently alerted)
  const newProblems = problems.filter(c => {
    const lastAlert = lastAlertAt[c.name] ?? 0;
    return now - lastAlert > ALERT_THROTTLE_MS;
  });

  if (newProblems.length > 0) {
    console.warn(
      `[DiagAlert] ${newProblems.length} new issue(s): ${newProblems.map(c => c.name).join(', ')}`
    );
    // Update throttle timestamps
    for (const c of newProblems) {
      lastAlertAt[c.name] = now;
    }
    await sendAlertEmail(report, newProblems);
  }

  // Send recovery email when transitioning from degraded → ok
  if (report.overall === 'ok' && lastOverall !== 'ok') {
    // Clear all throttle timestamps so next issue isn't suppressed
    for (const key of Object.keys(lastAlertAt)) {
      delete lastAlertAt[key];
    }
    await sendRecoveryEmail(report);
  }

  lastOverall = report.overall;

  if (problems.length === 0) {
    console.log(`[DiagAlert] ✅ All checks OK (${report.checks.length} services healthy)`);
  } else {
    const icons = problems.map(c => `${c.status === 'error' ? '❌' : '⚠️'} ${c.name}`).join(' | ');
    console.warn(`[DiagAlert] ${icons}`);
  }
}

// ── public API ────────────────────────────────────────────────────────────────

let intervalId: ReturnType<typeof setInterval> | null = null;

export const diagnosticAlertService = {
  start() {
    if (intervalId) return;

    // Run once immediately on startup
    void runChecksAndAlert();

    intervalId = setInterval(() => {
      void runChecksAndAlert();
    }, CHECK_INTERVAL_MS);

    console.log(
      `[DiagAlert] 🩺 Diagnostic monitor started — checking every ${Math.round(CHECK_INTERVAL_MS / 60000)} min` +
      (ALERT_EMAIL ? ` · alerts → ${ALERT_EMAIL}` : ' · no ALERT_EMAIL set, logging only')
    );
  },

  stop() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  },

  /** Run a one-off check without touching the interval. */
  async runNow(): Promise<DiagnosticReport> {
    return runAllChecks();
  },
};
