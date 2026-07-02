import { Router, Request, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.middleware';
import { diagnosticAlertService } from '../services/diagnostic-alert.service';
import { sessionCleanupService } from '../services/session-cleanup.service';

const router = Router();

/**
 * GET /api/diagnostics
 * Admin-only: run all health checks and return the report.
 * Also accepts ?secret=<DIAGNOSTIC_SECRET> as an alternative to Bearer auth
 * so external uptime monitors (UptimeRobot, Betterstack, etc.) can call it.
 */
router.get('/', async (req: Request, res: Response) => {
  // Allow either admin Bearer token OR a pre-shared secret query param
  const secretParam = req.query.secret as string | undefined;
  const configuredSecret = process.env.DIAGNOSTIC_SECRET;

  const hasValidSecret =
    configuredSecret && secretParam && secretParam === configuredSecret;

  if (!hasValidSecret) {
    // Fall back to Bearer auth — reuse requireAuth inline
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized. Use Bearer token or ?secret=<DIAGNOSTIC_SECRET>',
      });
    }

    // Let requireAuth validate the token by running it as middleware
    await new Promise<void>((resolve, reject) => {
      requireAuth(req, res, (err?: any) => {
        if (err) reject(err);
        else resolve();
      });
    }).catch(() => null);

    const authedReq = req as AuthenticatedRequest;
    if (!authedReq.user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    if (authedReq.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
  }

  try {
    const report = await diagnosticAlertService.runNow();
    const statusCode = report.overall === 'error' ? 503 : report.overall === 'warn' ? 207 : 200;
    return res.status(statusCode).json(report);
  } catch (err: any) {
    return res.status(500).json({ error: 'Diagnostic run failed', message: err.message });
  }
});

/**
 * POST /api/diagnostics/test-alert
 * Admin-only: send a test diagnostic email immediately.
 */
router.post('/test-alert', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const { emailService } = await import('../services/email.service');
    const report = await diagnosticAlertService.runNow();
    const alertEmail = process.env.ALERT_EMAIL || process.env.ADMIN_EMAIL || req.user.email;

    if (!alertEmail) {
      return res.status(400).json({ error: 'No ALERT_EMAIL or ADMIN_EMAIL configured' });
    }

    const problems = report.checks.filter(c => c.status !== 'ok');
    const subject = problems.length > 0
      ? `🧪 [TEST] LeadsFlow Alert — ${problems.length} issue(s)`
      : '🧪 [TEST] LeadsFlow — All systems OK';

    const text = [
      'This is a test alert from LeadsFlow Diagnostic Monitor.',
      '',
      `Overall: ${report.overall.toUpperCase()}`,
      `Timestamp: ${report.timestamp}`,
      '',
      'Checks:',
      ...report.checks.map(c => `  [${c.status.toUpperCase()}] ${c.name}: ${c.message}`),
    ].join('\n');

    await emailService.sendRaw({ to: alertEmail, subject, html: `<pre>${text}</pre>`, text });
    return res.json({ success: true, sentTo: alertEmail, overall: report.overall, checks: report.checks.length });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/diagnostics/cleanup-sessions
 * Admin-only: immediately delete all expired sessions from the DB.
 */
router.post('/cleanup-sessions', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  try {
    const deleted = await sessionCleanupService.runNow();
    return res.json({ success: true, deletedSessions: deleted });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
