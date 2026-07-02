import jwt from 'jsonwebtoken';
import v8 from 'v8';
import { query } from '../database/connection';
import { config } from '../config/env';
import { getAuthMetrics } from './auth-metrics.service';

export interface CheckResult {
  name: string;
  status: 'ok' | 'warn' | 'error';
  message: string;
  latencyMs?: number;
  details?: Record<string, unknown>;
}

export interface DiagnosticReport {
  timestamp: string;
  overall: 'ok' | 'warn' | 'error';
  checks: CheckResult[];
  totalUsers?: number;
  environment: string;
}

// ── individual checks ─────────────────────────────────────────────────────────

async function checkDatabase(): Promise<CheckResult> {
  const t0 = Date.now();
  try {
    const result = await query('SELECT 1 AS ping, NOW() AS db_time', []);
    return {
      name: 'database',
      status: 'ok',
      message: `Connected. DB time: ${result.rows[0].db_time}`,
      latencyMs: Date.now() - t0,
    };
  } catch (err: any) {
    return {
      name: 'database',
      status: 'error',
      message: `Cannot connect to database: ${err.message}`,
      latencyMs: Date.now() - t0,
    };
  }
}

async function checkCriticalTables(): Promise<CheckResult> {
  const requiredTables = ['users', 'sessions', 'leads', 'channels', 'plans'];
  try {
    const result = await query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1)`,
      [requiredTables]
    );
    const found = result.rows.map((r: any) => r.table_name);
    const missing = requiredTables.filter(t => !found.includes(t));
    if (missing.length > 0) {
      return {
        name: 'database_tables',
        status: 'error',
        message: `Missing critical tables: ${missing.join(', ')}`,
        details: { missing, found },
      };
    }
    return {
      name: 'database_tables',
      status: 'ok',
      message: `All ${requiredTables.length} critical tables exist`,
    };
  } catch (err: any) {
    return {
      name: 'database_tables',
      status: 'error',
      message: `Table check failed: ${err.message}`,
    };
  }
}

async function checkJWT(): Promise<CheckResult> {
  try {
    if (!config.jwtSecret || config.jwtSecret.length < 16) {
      return {
        name: 'jwt',
        status: 'error',
        message: 'JWT_SECRET is missing or too short (< 16 chars)',
      };
    }
    const token = jwt.sign({ test: true }, config.jwtSecret, { expiresIn: '1m' });
    const decoded = jwt.verify(token, config.jwtSecret) as any;
    if (!decoded?.test) throw new Error('Decoded payload mismatch');
    return { name: 'jwt', status: 'ok', message: 'JWT sign/verify working correctly' };
  } catch (err: any) {
    return { name: 'jwt', status: 'error', message: `JWT failure: ${err.message}` };
  }
}

function checkGoogleOAuth(): CheckResult {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return {
      name: 'google_oauth',
      status: 'warn',
      message: 'GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set — Google login disabled',
    };
  }
  if (!clientId.endsWith('.apps.googleusercontent.com')) {
    return {
      name: 'google_oauth',
      status: 'warn',
      message: 'GOOGLE_CLIENT_ID format looks incorrect',
      details: { clientIdSuffix: clientId.slice(-30) },
    };
  }
  return {
    name: 'google_oauth',
    status: 'ok',
    message: 'Google OAuth credentials are configured',
  };
}

function checkBase64urlEncoding(): CheckResult {
  try {
    const sample = { id: 'test-123', email: 'check@test.com', name: 'Diag' };
    const encoded = Buffer.from(JSON.stringify(sample)).toString('base64url');
    const decoded = JSON.parse(
      Buffer.from(encoded.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice((encoded.length % 4 + 2) % 4), 'base64').toString('utf8')
    );
    if (decoded.id !== sample.id) throw new Error('Round-trip mismatch');
    if (encoded.includes('+') || encoded.includes('/') || encoded.includes('=')) {
      return {
        name: 'oauth_encoding',
        status: 'error',
        message: 'base64url output contains unsafe characters (+, /, =) — OAuth redirect will corrupt tokens',
      };
    }
    return {
      name: 'oauth_encoding',
      status: 'ok',
      message: 'base64url encoding round-trip OK — OAuth redirect is safe',
    };
  } catch (err: any) {
    return {
      name: 'oauth_encoding',
      status: 'error',
      message: `OAuth encoding check failed: ${err.message}`,
    };
  }
}

function checkSMTP(): CheckResult {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !port || !user || !pass) {
    return {
      name: 'smtp',
      status: 'warn',
      message: 'SMTP not fully configured — transactional emails (password reset, confirmation) disabled',
      details: { host: !!host, port: !!port, user: !!user, pass: !!pass },
    };
  }
  return {
    name: 'smtp',
    status: 'ok',
    message: `SMTP configured (${host}:${port})`,
  };
}

function checkEvolutionAPI(): CheckResult {
  const url = process.env.EVOLUTION_API_URL;
  const key = process.env.EVOLUTION_API_KEY;
  if (!url || !key) {
    return {
      name: 'evolution_api',
      status: 'warn',
      message: 'EVOLUTION_API_URL or EVOLUTION_API_KEY not set — WhatsApp disabled',
    };
  }
  return {
    name: 'evolution_api',
    status: 'ok',
    message: `Evolution API configured at ${url}`,
  };
}

function checkMinIO(): CheckResult {
  const endpoint = process.env.MINIO_ENDPOINT;
  const accessKey = process.env.MINIO_ACCESS_KEY || process.env.SERVICE_USER_MINIO;
  const secretKey = process.env.MINIO_SECRET_KEY || process.env.SERVICE_PASSWORD_MINIO;
  if (!endpoint || !accessKey || !secretKey) {
    return {
      name: 'minio_storage',
      status: 'warn',
      message: 'MinIO not configured — file uploads will use base64 in DB (higher DB load)',
      details: { endpoint: !!endpoint, accessKey: !!accessKey, secretKey: !!secretKey },
    };
  }
  return {
    name: 'minio_storage',
    status: 'ok',
    message: `MinIO configured at ${endpoint}`,
  };
}

function checkFrontendURL(): CheckResult {
  const frontendUrl = process.env.FRONTEND_URL || process.env.APP_URL;
  if (!frontendUrl) {
    return {
      name: 'frontend_url',
      status: 'warn',
      message: 'FRONTEND_URL not set — OAuth redirect will fall back to APP_URL or localhost:3000',
    };
  }
  if (frontendUrl.includes('localhost') && process.env.NODE_ENV === 'production') {
    return {
      name: 'frontend_url',
      status: 'error',
      message: `FRONTEND_URL points to localhost in production: ${frontendUrl}`,
    };
  }
  return {
    name: 'frontend_url',
    status: 'ok',
    message: `FRONTEND_URL = ${frontendUrl}`,
  };
}

async function checkSessionsTable(): Promise<CheckResult> {
  try {
    const result = await query(
      `SELECT
         COUNT(*) FILTER (WHERE expires_at < NOW()) AS expired,
         COUNT(*) AS total
       FROM sessions`,
      []
    );
    const { expired, total } = result.rows[0];
    const expiredPct = total > 0 ? Math.round((expired / total) * 100) : 0;
    if (expiredPct > 80) {
      return {
        name: 'sessions',
        status: 'warn',
        message: `${expiredPct}% of sessions are expired (${expired}/${total}) — cleanup may be stuck`,
        details: { expired: Number(expired), total: Number(total) },
      };
    }
    return {
      name: 'sessions',
      status: 'ok',
      message: `${total} sessions (${expired} expired, ${100 - expiredPct}% active)`,
    };
  } catch (err: any) {
    return { name: 'sessions', status: 'error', message: `Sessions check failed: ${err.message}` };
  }
}

async function checkUserCount(): Promise<{ check: CheckResult; count: number }> {
  try {
    const result = await query('SELECT COUNT(*) AS cnt FROM users WHERE is_active = true', []);
    const count = Number(result.rows[0].cnt);
    if (count === 0) {
      return {
        check: {
          name: 'users',
          status: 'warn',
          message: 'No active users found — DB may be empty or pointing to wrong database',
        },
        count,
      };
    }
    return {
      check: { name: 'users', status: 'ok', message: `${count} active users` },
      count,
    };
  } catch (err: any) {
    return {
      check: { name: 'users', status: 'error', message: `User count failed: ${err.message}` },
      count: 0,
    };
  }
}

function checkAuthMetrics(): CheckResult {
  const m = getAuthMetrics();

  const frontendErrorCount = m.frontendErrors.length;
  const recentCodes = m.frontendErrors.map(e => e.code ?? 'unknown').join(', ');

  // Alert if OAuth failure rate is over 50% with at least 3 attempts
  if (m.oauthFailureRate !== null && m.oauthFailureRate >= 0.5 && (m.oauthSuccesses + m.oauthFailures) >= 3) {
    return {
      name: 'auth_metrics',
      status: 'error',
      message: `OAuth failure rate ${Math.round(m.oauthFailureRate * 100)}% in last ${m.windowMinutes}min (${m.oauthFailures} failures / ${m.oauthSuccesses + m.oauthFailures} attempts)`,
      details: { ...m, recentFrontendErrorCodes: recentCodes },
    };
  }

  if (frontendErrorCount >= 5) {
    return {
      name: 'auth_metrics',
      status: 'warn',
      message: `${frontendErrorCount} frontend auth error(s) in last ${m.windowMinutes}min — codes: ${recentCodes || 'none'}`,
      details: { ...m },
    };
  }

  if (m.oauthFailures > 0 || m.loginFailures > 0) {
    return {
      name: 'auth_metrics',
      status: 'ok',
      message: `Auth OK — ${m.oauthSuccesses} OAuth, ${m.loginSuccesses} email logins, ${m.oauthFailures + m.loginFailures} failures in last ${m.windowMinutes}min`,
      details: { ...m },
    };
  }

  return {
    name: 'auth_metrics',
    status: 'ok',
    message: `Auth OK — ${m.oauthSuccesses} OAuth, ${m.loginSuccesses} email logins in last ${m.windowMinutes}min`,
    details: { ...m },
  };
}

function checkProcessMemory(): CheckResult {
  const mem = process.memoryUsage();
  const v8Stats = v8.getHeapStatistics();

  const heapUsedMB  = Math.round(mem.heapUsed / 1024 / 1024);
  const heapLimitMB = Math.round(v8Stats.heap_size_limit / 1024 / 1024);
  const rssMB       = Math.round(mem.rss / 1024 / 1024);

  // Use the real V8 heap limit (not heapTotal which is just currently committed pages)
  const pct = Math.round((mem.heapUsed / v8Stats.heap_size_limit) * 100);

  const details = { heapUsedMB, heapLimitMB, rssMB, pct };

  if (pct > 85) {
    return {
      name: 'memory',
      status: 'error',
      message: `Heap at ${pct}% (${heapUsedMB}MB / ${heapLimitMB}MB limit) — risk of OOM crash`,
      details,
    };
  }
  if (pct > 70) {
    return {
      name: 'memory',
      status: 'warn',
      message: `Heap at ${pct}% (${heapUsedMB}MB / ${heapLimitMB}MB limit) — monitor closely`,
      details,
    };
  }
  return {
    name: 'memory',
    status: 'ok',
    message: `Heap at ${pct}% (${heapUsedMB}MB used, ${heapLimitMB}MB limit, ${rssMB}MB RSS)`,
    details,
  };
}

// ── public runner ─────────────────────────────────────────────────────────────

export async function runAllChecks(): Promise<DiagnosticReport> {
  const [
    dbCheck,
    tablesCheck,
    sessionCheck,
    { check: userCheck, count: userCount },
    jwtCheck,
  ] = await Promise.all([
    checkDatabase(),
    checkCriticalTables(),
    checkSessionsTable(),
    checkUserCount(),
    checkJWT(),
  ]);

  const syncChecks: CheckResult[] = [
    checkGoogleOAuth(),
    checkBase64urlEncoding(),
    checkFrontendURL(),
    checkAuthMetrics(),
    checkSMTP(),
    checkEvolutionAPI(),
    checkMinIO(),
    checkProcessMemory(),
  ];

  const checks: CheckResult[] = [
    dbCheck,
    tablesCheck,
    sessionCheck,
    userCheck,
    jwtCheck,
    ...syncChecks,
  ];

  const hasError = checks.some(c => c.status === 'error');
  const hasWarn = checks.some(c => c.status === 'warn');

  return {
    timestamp: new Date().toISOString(),
    overall: hasError ? 'error' : hasWarn ? 'warn' : 'ok',
    checks,
    totalUsers: userCount,
    environment: process.env.NODE_ENV || 'development',
  };
}
