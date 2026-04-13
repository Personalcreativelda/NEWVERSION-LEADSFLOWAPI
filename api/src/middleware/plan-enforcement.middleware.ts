import type { Request, Response, NextFunction } from 'express';
import { query } from '../database/connection';

// ─────────────────────────────────────────────────────────────────────────────
// In-memory cache to avoid a DB round-trip on every mutating request.
// TTL: 60 seconds.  Cleared on plan upgrades / Stripe webhook processing.
// ─────────────────────────────────────────────────────────────────────────────
type CacheEntry = {
  lastCheck: number;
  isBlocked: boolean;
  code: string;
  message: string;
};

const CACHE_TTL = 60 * 1_000;
const enforcementCache = new Map<string, CacheEntry>();

/** Call this after a user upgrades or a Stripe webhook confirms a paid plan. */
export const clearPlanEnforcementCache = (userId: string): void => {
  enforcementCache.delete(userId);
};

// Hard-coded fallback lead limits if plan_limits column is NULL.
const hardcodedLeadLimit = (plan: string): number => {
  const map: Record<string, number> = { free: 100, business: 1000, enterprise: -1 };
  return map[plan] ?? 100;
};

// ─────────────────────────────────────────────────────────────────────────────
// planEnforcement middleware
//
// Blocks mutating requests (POST / PUT / PATCH / DELETE) when:
//   1. The user's plan has expired (paid plans with plan_expires_at in the past)
//   2. The subscription status is "past_due"
//   3. The user has reached or exceeded their lead limit
//
// GET / HEAD / OPTIONS pass through unconditionally.
// Requires req.user to be set (i.e. run AFTER requireAuth).
// ─────────────────────────────────────────────────────────────────────────────
export const planEnforcement = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Read-only requests are always allowed
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }

  const user = (req as any).user as { id: string } | undefined;
  if (!user?.id) {
    // Not yet authenticated — let requireAuth handle the 401
    next();
    return;
  }

  try {
    const now = Date.now();
    const cached = enforcementCache.get(user.id);

    if (cached && now - cached.lastCheck < CACHE_TTL) {
      if (cached.isBlocked) {
        res.status(403).json({
          error: cached.code === 'LEAD_LIMIT_EXCEEDED' ? 'plan_limit_exceeded' : 'plan_expired',
          code: cached.code,
          message: cached.message,
        });
        return;
      }
      next();
      return;
    }

    // Parallel: fetch user plan data + current lead count
    const [userResult, leadCountResult] = await Promise.all([
      query(
        'SELECT plan, plan_limits, plan_expires_at, subscription_status FROM users WHERE id = $1',
        [user.id]
      ),
      query('SELECT COUNT(*) AS count FROM leads WHERE user_id = $1', [user.id]),
    ]);

    const userData = userResult.rows[0];
    if (!userData) {
      next();
      return;
    }

    const plan = (userData.plan || 'free').toLowerCase();
    let isBlocked = false;
    let code = '';
    let message = '';

    // ── Check 1: plan expiry (paid plans only) ──────────────────────────────
    if (!isBlocked && plan !== 'free' && userData.plan_expires_at) {
      if (new Date(userData.plan_expires_at) < new Date()) {
        isBlocked = true;
        code = 'PLAN_EXPIRED';
        message = 'Seu plano expirou. Renove sua assinatura para continuar usando a plataforma.';
      }
    }

    // ── Check 2: payment overdue ────────────────────────────────────────────
    if (!isBlocked && plan !== 'free' && userData.subscription_status === 'past_due') {
      isBlocked = true;
      code = 'PAYMENT_OVERDUE';
      message = 'Pagamento em atraso. Regularize sua assinatura para continuar.';
    }

    // ── Check 3: lead limit exceeded ────────────────────────────────────────
    if (!isBlocked) {
      const storedLimits = userData.plan_limits;
      const leadLimit: number =
        storedLimits && typeof storedLimits.leads === 'number'
          ? storedLimits.leads
          : hardcodedLeadLimit(plan);

      if (leadLimit !== -1) {
        const currentLeads = parseInt(leadCountResult.rows[0]?.count ?? '0', 10);
        if (currentLeads >= leadLimit) {
          isBlocked = true;
          code = 'LEAD_LIMIT_EXCEEDED';
          message = `Você atingiu o limite de ${leadLimit} leads do seu plano. Faça upgrade para continuar.`;
        }
      }
    }

    // Store in cache
    enforcementCache.set(user.id, { lastCheck: now, isBlocked, code, message });

    if (isBlocked) {
      res.status(403).json({
        error: code === 'LEAD_LIMIT_EXCEEDED' ? 'plan_limit_exceeded' : 'plan_expired',
        code,
        message,
      });
      return;
    }

    next();
  } catch (error) {
    // Don't block the request on enforcement errors — fail open intentionally
    console.error('[PlanEnforcement] Unexpected error, allowing request:', error);
    next();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// checkMessageLimit
//
// Checks whether a user has remaining quota for individual or mass messages.
// Returns { allowed: true } or { allowed: false, code, message, current, limit }.
// Call this at the start of any message-sending route/service.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_MSG_LIMITS: Record<string, { messages: number; massMessages: number }> = {
  free:       { messages: 100,  massMessages: 200  },
  business:   { messages: 500,  massMessages: 1000 },
  enterprise: { messages: -1,   massMessages: -1   },
};

export interface MessageLimitResult {
  allowed: boolean;
  current: number;
  limit: number;
  code: string;
  message: string;
}

export async function checkMessageLimit(
  userId: string,
  type: 'messages' | 'massMessages'
): Promise<MessageLimitResult> {
  try {
    const userResult = await query(
      'SELECT plan, plan_limits, plan_activated_at FROM users WHERE id = $1',
      [userId]
    );

    const userData = userResult.rows[0];
    if (!userData) return { allowed: true, current: 0, limit: -1, code: '', message: '' };

    const plan = (userData.plan || 'free').toLowerCase();

    // Billing period start (same logic as users.service)
    let periodStart: Date;
    if (plan !== 'free' && userData.plan_activated_at) {
      periodStart = new Date(userData.plan_activated_at);
    } else {
      const now = new Date();
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const countResult = await (type === 'messages'
      ? query(
          "SELECT COUNT(*) AS count FROM messages WHERE user_id = $1 AND direction = 'out' AND campaign_id IS NULL AND created_at >= $2 AND NOT (metadata @> '{\"automated\":true}'::jsonb)",
          [userId, periodStart]
        )
      : query(
          "SELECT COALESCE(SUM((stats->>'sent')::int), 0) AS count FROM campaigns WHERE user_id = $1 AND created_at >= $2",
          [userId, periodStart]
        ));

    const storedLimits = userData.plan_limits;
    const defaults = DEFAULT_MSG_LIMITS[plan] ?? DEFAULT_MSG_LIMITS.free;
    const limit: number =
      storedLimits && typeof storedLimits[type] === 'number'
        ? storedLimits[type]
        : defaults[type];

    const current = parseInt(countResult.rows[0]?.count ?? '0', 10);

    if (limit !== -1 && current >= limit) {
      const isIndividual = type === 'messages';
      return {
        allowed: false,
        current,
        limit,
        code: isIndividual ? 'MESSAGE_LIMIT_EXCEEDED' : 'MASS_MESSAGE_LIMIT_EXCEEDED',
        message: isIndividual
          ? `Você atingiu o limite de ${limit} mensagens individuais do seu plano. Faça upgrade para continuar.`
          : `Você atingiu o limite de ${limit} mensagens em massa do seu plano. Faça upgrade para continuar.`,
      };
    }

    return { allowed: true, current, limit, code: '', message: '' };
  } catch (err) {
    // Fail open — never block because of a monitoring error
    console.error('[checkMessageLimit] Error:', err);
    return { allowed: true, current: 0, limit: -1, code: '', message: '' };
  }
}
