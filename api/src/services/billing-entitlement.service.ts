import type { PoolClient } from 'pg';
import { query } from '../database/connection';
import { clearPlanEnforcementCache } from '../middleware/plan-enforcement.middleware';

type Db = Pick<PoolClient, 'query'>;

const defaultDb: Db = { query: (text: string, params?: any[]) => query(text, params) } as Db;

const ENTITLED_STATUSES = ['active', 'trialing', 'grace_period', 'cancel_at_period_end', 'cancelled'];
const END_DATE_OPTIONAL_STATUSES = ['active', 'trialing', 'grace_period'];
const END_DATE_REQUIRED_STATUSES = ['cancel_at_period_end', 'cancelled'];

function isEntitledSource(status: string, currentPeriodEnd: unknown): boolean {
  if (END_DATE_OPTIONAL_STATUSES.includes(status)) {
    return !currentPeriodEnd || new Date(String(currentPeriodEnd)).getTime() > Date.now();
  }
  return END_DATE_REQUIRED_STATUSES.includes(status)
    && Boolean(currentPeriodEnd)
    && new Date(String(currentPeriodEnd)).getTime() > Date.now();
}

export interface BillingSubscriptionInput {
  userId: string;
  provider: 'stripe' | 'google_play' | 'mobile_money' | 'manual';
  providerReference: string;
  linkedProviderReference?: string | null;
  productId?: string | null;
  basePlanId?: string | null;
  planId: string;
  billingCycle?: 'monthly' | 'annual' | null;
  status: string;
  currentPeriodStart?: Date | string | null;
  currentPeriodEnd?: Date | string | null;
  autoRenew?: boolean | null;
  acknowledged?: boolean;
  metadata?: Record<string, unknown>;
}

export interface EffectiveEntitlement {
  planId: string;
  provider: string | null;
  providerReference: string | null;
  status: string;
  expiresAt: string | null;
}

/**
 * Regista a subscrição sem permitir que um recibo já ligado a uma conta mude de dono.
 */
export async function upsertBillingSubscription(input: BillingSubscriptionInput, db: Db = defaultDb) {
  const result = await db.query(
    `INSERT INTO billing_subscriptions (
       user_id, provider, provider_reference, linked_provider_reference,
       product_id, base_plan_id, plan_id, billing_cycle, status,
       current_period_start, current_period_end, auto_renew, acknowledged,
       metadata, last_verified_at, updated_at
     ) VALUES (
       $1, $2, $3, $4,
       $5, $6, $7, $8, $9,
       $10, $11, $12, $13,
       $14, NOW(), NOW()
     )
     ON CONFLICT (provider, provider_reference) DO UPDATE SET
       linked_provider_reference = EXCLUDED.linked_provider_reference,
       product_id = EXCLUDED.product_id,
       base_plan_id = EXCLUDED.base_plan_id,
       plan_id = EXCLUDED.plan_id,
       billing_cycle = EXCLUDED.billing_cycle,
       status = EXCLUDED.status,
       current_period_start = COALESCE(EXCLUDED.current_period_start, billing_subscriptions.current_period_start),
       current_period_end = EXCLUDED.current_period_end,
       auto_renew = EXCLUDED.auto_renew,
       acknowledged = EXCLUDED.acknowledged,
       metadata = EXCLUDED.metadata,
       last_verified_at = NOW(),
       updated_at = NOW()
     WHERE billing_subscriptions.user_id = EXCLUDED.user_id
     RETURNING *`,
    [
      input.userId,
      input.provider,
      input.providerReference,
      input.linkedProviderReference || null,
      input.productId || null,
      input.basePlanId || null,
      input.planId,
      input.billingCycle || null,
      input.status,
      input.currentPeriodStart || null,
      input.currentPeriodEnd || null,
      input.autoRenew ?? null,
      input.acknowledged ?? false,
      JSON.stringify(input.metadata || {}),
    ],
  );

  const row = result.rows[0];
  if (!row || row.user_id !== input.userId) {
    const error: any = new Error('Esta compra já está associada a outra conta.');
    error.status = 409;
    error.code = 'PURCHASE_ALREADY_LINKED';
    throw error;
  }
  return row;
}

export async function setBillingSubscriptionStatus(
  provider: BillingSubscriptionInput['provider'],
  providerReference: string,
  status: string,
  currentPeriodEnd?: Date | string | null,
  db: Db = defaultDb,
) {
  const result = await db.query(
    `UPDATE billing_subscriptions
     SET status = $3,
         current_period_end = COALESCE($4, current_period_end),
         auto_renew = CASE WHEN $3 IN ('cancelled', 'expired', 'revoked') THEN FALSE ELSE auto_renew END,
         last_verified_at = NOW(),
         updated_at = NOW()
     WHERE provider = $1 AND provider_reference = $2
     RETURNING *`,
    [provider, providerReference, status, currentPeriodEnd || null],
  );
  return result.rows[0] || null;
}

export async function getSubscriptionOwner(provider: string, providerReference: string, db: Db = defaultDb) {
  const result = await db.query(
    `SELECT user_id FROM billing_subscriptions WHERE provider = $1 AND provider_reference = $2 LIMIT 1`,
    [provider, providerReference],
  );
  return result.rows[0]?.user_id as string | undefined;
}

/**
 * Recalcula a cópia efetiva em `users`. Se houver duas fontes válidas, prevalece o
 * plano de maior valor; cancelar uma fonte nunca apaga o direito dado pela outra.
 */
export async function recomputeEffectiveEntitlement(
  userId: string,
  db: Db = defaultDb,
  emptyStatus: 'cancelled' | 'expired' | 'free' = 'expired',
): Promise<EffectiveEntitlement> {
  const active = await db.query(
    `SELECT bs.*, p.limits, p.price_monthly
     FROM billing_subscriptions bs
     JOIN plans p ON p.id = bs.plan_id AND p.is_active = TRUE
     WHERE bs.user_id = $1
       AND bs.status = ANY($2::varchar[])
       AND (
         (bs.status = ANY($3::varchar[])
           AND (bs.current_period_end IS NULL OR bs.current_period_end > NOW()))
         OR
         (bs.status = ANY($4::varchar[])
           AND bs.current_period_end > NOW())
       )
     ORDER BY p.price_monthly DESC,
              bs.current_period_end DESC NULLS FIRST,
              bs.updated_at DESC
     LIMIT 1`,
    [userId, ENTITLED_STATUSES, END_DATE_OPTIONAL_STATUSES, END_DATE_REQUIRED_STATUSES],
  );

  const source = active.rows[0];
  if (source) {
    await db.query(
      `UPDATE users
       SET plan = $1,
           subscription_plan = $1,
           plan_limits = $2,
           plan_activated_at = COALESCE(plan_activated_at, $3, NOW()),
           plan_expires_at = $4,
           subscription_status = CASE WHEN $5 = 'grace_period' THEN 'past_due' ELSE 'active' END,
           updated_at = NOW()
       WHERE id = $6`,
      [
        source.plan_id,
        JSON.stringify(source.limits || {}),
        source.current_period_start || null,
        source.current_period_end || null,
        source.status,
        userId,
      ],
    );
    clearPlanEnforcementCache(userId);
    return {
      planId: source.plan_id,
      provider: source.provider,
      providerReference: source.provider_reference,
      status: source.status,
      expiresAt: source.current_period_end ? new Date(source.current_period_end).toISOString() : null,
    };
  }

  const free = await db.query(`SELECT limits FROM plans WHERE id = 'free' LIMIT 1`);
  const freeLimits = free.rows[0]?.limits || { leads: 100, messages: 100, massMessages: 200 };
  await db.query(
    `UPDATE users
     SET plan = 'free',
         subscription_plan = 'free',
         plan_limits = $1,
         plan_activated_at = NULL,
         plan_expires_at = NULL,
         subscription_status = $2,
         updated_at = NOW()
     WHERE id = $3`,
    [JSON.stringify(freeLimits), emptyStatus, userId],
  );
  clearPlanEnforcementCache(userId);
  return { planId: 'free', provider: null, providerReference: null, status: emptyStatus, expiresAt: null };
}

export async function getEffectiveBillingStatus(userId: string): Promise<{
  effective: EffectiveEntitlement;
  sources: Array<{ provider: string; planId: string; status: string; expiresAt: string | null }>;
}> {
  const result = await query(
    `SELECT bs.provider, bs.provider_reference, bs.plan_id, bs.status, bs.current_period_end
     FROM billing_subscriptions bs
     LEFT JOIN plans p ON p.id = bs.plan_id
     WHERE bs.user_id = $1
     ORDER BY
       CASE
         WHEN bs.status = ANY($2::varchar[])
          AND (
            (bs.status = ANY($3::varchar[])
              AND (bs.current_period_end IS NULL OR bs.current_period_end > NOW()))
            OR
            (bs.status = ANY($4::varchar[])
              AND bs.current_period_end > NOW())
          ) THEN 0
         ELSE 1
       END,
       p.price_monthly DESC NULLS LAST,
       bs.updated_at DESC`,
    [userId, ENTITLED_STATUSES, END_DATE_OPTIONAL_STATUSES, END_DATE_REQUIRED_STATUSES],
  );
  const sources = result.rows.map((row: any) => ({
    provider: row.provider,
    planId: row.plan_id,
    status: row.status,
    expiresAt: row.current_period_end ? new Date(row.current_period_end).toISOString() : null,
  }));
  const entitled = result.rows.find((row: any) =>
    isEntitledSource(row.status, row.current_period_end),
  );
  return {
    effective: entitled
      ? {
          planId: entitled.plan_id,
          provider: entitled.provider,
          providerReference: entitled.provider_reference,
          status: entitled.status,
          expiresAt: entitled.current_period_end ? new Date(entitled.current_period_end).toISOString() : null,
        }
      : { planId: 'free', provider: null, providerReference: null, status: 'free', expiresAt: null },
    sources,
  };
}
