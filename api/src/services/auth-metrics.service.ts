/**
 * In-memory auth metrics tracker.
 * Keeps a rolling window of the last hour of auth events so the diagnostic
 * system can surface repeated failures without needing a DB write.
 */

export interface AuthEvent {
  type: 'oauth_success' | 'oauth_failure' | 'login_success' | 'login_failure' | 'frontend_error';
  code?: string;
  detail?: string;
  userAgent?: string;
  at: number; // epoch ms
}

const WINDOW_MS = 60 * 60 * 1000; // 1 hour rolling window
const MAX_EVENTS = 500;            // cap memory usage

const events: AuthEvent[] = [];

export function recordAuthEvent(event: Omit<AuthEvent, 'at'>): void {
  const now = Date.now();
  events.push({ ...event, at: now });
  // Trim old entries
  const cutoff = now - WINDOW_MS;
  while (events.length > 0 && events[0].at < cutoff) events.shift();
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
}

export interface AuthMetricsSummary {
  windowMinutes: number;
  oauthSuccesses: number;
  oauthFailures: number;
  loginSuccesses: number;
  loginFailures: number;
  frontendErrors: AuthEvent[];
  oauthFailureRate: number | null; // 0-1, null if no attempts
}

export function getAuthMetrics(): AuthMetricsSummary {
  const cutoff = Date.now() - WINDOW_MS;
  const recent = events.filter(e => e.at >= cutoff);

  const oauthSuccesses = recent.filter(e => e.type === 'oauth_success').length;
  const oauthFailures  = recent.filter(e => e.type === 'oauth_failure').length;
  const loginSuccesses = recent.filter(e => e.type === 'login_success').length;
  const loginFailures  = recent.filter(e => e.type === 'login_failure').length;
  const frontendErrors = recent.filter(e => e.type === 'frontend_error').slice(-10);

  const oauthTotal = oauthSuccesses + oauthFailures;
  const oauthFailureRate = oauthTotal > 0 ? oauthFailures / oauthTotal : null;

  return {
    windowMinutes: Math.round(WINDOW_MS / 60000),
    oauthSuccesses,
    oauthFailures,
    loginSuccesses,
    loginFailures,
    frontendErrors,
    oauthFailureRate,
  };
}
