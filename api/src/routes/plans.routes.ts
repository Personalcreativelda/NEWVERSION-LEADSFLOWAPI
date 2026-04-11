import { Router } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import { query } from '../database/connection';
import { plansService } from '../services/plans.service';
import { notificationsService } from '../services/notifications.service';
import { clearPlanEnforcementCache } from '../middleware/plan-enforcement.middleware';
import Stripe from 'stripe';

const router = Router();

// Get all available plans (public endpoint)
router.get('/', async (_req, res, next) => {
  try {
    const plans = await plansService.getAllPlans();
    res.json({ success: true, plans });
  } catch (error) {
    console.error('[Plans] Error fetching plans:', error);
    next(error);
  }
});

// Upgrade user plan (authenticated)
router.post('/upgrade', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { planId: rawPlanId } = req.body;
    const planId = rawPlanId?.toLowerCase?.() || rawPlanId;

    if (!planId) {
      return res.status(400).json({ error: 'Plan ID is required' });
    }

    // Validate plan exists in database
    const planExists = await plansService.validatePlanId(planId);
    if (!planExists) {
      return res.status(400).json({ error: 'Invalid plan ID' });
    }

    // Fetch plan limits from DB
    let limits: any = null;
    try {
      const plan = await plansService.getPlanById(planId);
      if (plan?.limits) limits = plan.limits;
    } catch (e) { /* fallback below */ }
    if (!limits) {
      const fallback: Record<string, any> = {
        free: { leads: 100, messages: 100, massMessages: 200 },
        business: { leads: 1000, messages: 500, massMessages: 1000 },
        enterprise: { leads: -1, messages: -1, massMessages: -1 },
      };
      limits = fallback[planId] || fallback.free;
    }

    // Update user's plan in database
    const result = await query(
      `UPDATE users
       SET plan = $1, subscription_plan = $1, plan_limits = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING id, email, name, avatar_url, plan, subscription_plan`,
      [planId, JSON.stringify(limits), req.user.id]
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`[Plans] User ${user.email} upgraded to plan: ${planId}`);

    // Clear plan enforcement cache so next request re-checks the new plan
    clearPlanEnforcementCache(req.user.id);

    // Create notification for user
    await notificationsService.createNotification(
      req.user.id,
      'plan_upgraded',
      'Plano Atualizado',
      `Você atualizou seu plano para ${user.plan.toUpperCase()}`,
      'zap',
      { planId, planName: user.plan }
    );

    // 🔔 Notify admins of upgrade
    void notificationsService.sendAdminNotification(
      'upgradeNotifications',
      'admin_plan_upgrade',
      'Upgrade de Plano',
      `${user.name || user.email} fez upgrade para o plano ${planId.toUpperCase()}.`,
      'trending-up',
      { userId: user.id, email: user.email, plan: planId }
    );

    res.json({
      success: true,
      message: `Plano atualizado para ${planId}`,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar_url: user.avatar_url,
        plan: user.plan,
        subscription_plan: user.subscription_plan,
      }
    });
  } catch (error) {
    console.error('[Plans] Error upgrading plan:', error);
    next(error);
  }
});

// Get payment history for the authenticated user
router.get('/payment-history', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const result = await query(
      `SELECT id, plan_id, amount, currency, billing_cycle, payment_method, payment_provider,
              card_brand, card_last4, stripe_subscription_id,
              status, provider_transaction_id, created_at
       FROM payment_history
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user.id]
    );

    res.json({ success: true, history: result.rows });
  } catch (error) {
    console.error('[Plans] Error fetching payment history:', error);
    next(error);
  }
});

// Create Stripe checkout session for a plan purchase
router.post('/stripe/checkout-session', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { planId, billingCycle = 'monthly' } = req.body;

    if (!planId) {
      return res.status(400).json({ error: 'Plan ID is required' });
    }

    if (!['monthly', 'annual'].includes(billingCycle)) {
      return res.status(400).json({ error: 'Billing cycle must be monthly or annual' });
    }

    const plan = await plansService.getPlanById(planId);
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      return res.status(500).json({ error: 'Stripe is not configured' });
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2026-03-25.dahlia' });
    const priceId = billingCycle === 'monthly'
      ? plan.stripe.priceMonthlyId
      : plan.stripe.priceAnnualId;

    if (!priceId) {
      return res.status(400).json({ error: 'Stripe price ID not configured for this plan' });
    }

    const origin = req.headers.origin || process.env.APP_URL || 'http://localhost:5173';
    const successUrl = process.env.STRIPE_SUCCESS_URL || `${origin}/?checkoutSuccess=true&plan=${planId}`;
    const cancelUrl = process.env.STRIPE_CANCEL_URL || `${origin}/?checkoutCanceled=true`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: req.user.email,
      metadata: {
        userId: req.user.id,
        userEmail: req.user.email,
        planId,
        billingCycle,
      },
    });

    res.json({ success: true, sessionUrl: session.url, sessionId: session.id });
  } catch (error) {
    console.error('[Plans] Error creating Stripe checkout session:', error);
    next(error);
  }
});

// Stripe webhook endpoint to confirm payment and update plan automatically
router.post('/stripe/webhook', async (req, res) => {
  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!stripeSecretKey || !webhookSecret) {
      console.error('[Stripe Webhook] Missing Stripe secrets');
      return res.status(500).json({ error: 'Stripe is not configured' });
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2026-03-25.dahlia' });
    const signature = req.headers['stripe-signature'] as string | undefined;
    const rawBody = (req as any).rawBody;

    if (!signature || !rawBody) {
      return res.status(400).json({ error: 'Invalid Stripe webhook request' });
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err: any) {
      console.error('[Stripe Webhook] Signature verification failed:', err.message);
      return res.status(400).json({ error: 'Stripe webhook verification failed' });
    }

    console.log('[Stripe Webhook] Event received:', event.type);

    // ── checkout.session.completed → initial plan purchase ──
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as any;
      let userId: string | null = session.metadata?.userId || null;
      const planId = (session.metadata?.planId?.toLowerCase?.() || session.metadata?.planId) as string | null;
      const billingCycle = session.metadata?.billingCycle || 'monthly';
      const amountTotal = session.amount_total ? session.amount_total / 100 : null;
      const currency = session.currency?.toUpperCase() || 'USD';
      const stripeCustomerId = session.customer as string | null;
      const stripeSubscriptionId = session.subscription as string | null;

      // ── Fallback: resolve userId by email or stripe_customer_id ──
      if (!userId) {
        const customerEmail = session.customer_email ||
          session.metadata?.userEmail ||
          (session.customer_details?.email as string | undefined);
        if (customerEmail) {
          try {
            const r = await query('SELECT id FROM users WHERE email = $1 LIMIT 1', [customerEmail.toLowerCase().trim()]);
            if (r.rows[0]) userId = r.rows[0].id;
            console.log(`[Stripe Webhook] Resolved userId by email fallback: ${userId}`);
          } catch (e) { console.warn('[Stripe Webhook] Email fallback lookup failed:', e); }
        }
        if (!userId && stripeCustomerId) {
          try {
            const r = await query('SELECT id FROM users WHERE stripe_customer_id = $1 LIMIT 1', [stripeCustomerId]);
            if (r.rows[0]) userId = r.rows[0].id;
            console.log(`[Stripe Webhook] Resolved userId by stripe_customer_id fallback: ${userId}`);
          } catch (e) { console.warn('[Stripe Webhook] Customer ID fallback lookup failed:', e); }
        }
      }

      if (userId && planId) {
        // Fetch plan limits
        let planLimits: any = null;
        try {
          const planData = await plansService.getPlanById(planId);
          if (planData?.limits) planLimits = planData.limits;
        } catch (e) { /* ignore */ }
        if (!planLimits) {
          const fallback: Record<string, any> = {
            free: { leads: 100, messages: 100, massMessages: 200 },
            business: { leads: 1000, messages: 500, massMessages: 1000 },
            enterprise: { leads: -1, messages: -1, massMessages: -1 },
          };
          planLimits = fallback[planId] || fallback.free;
        }
        // Retrieve card info from the subscription's payment method
        let cardBrand: string | null = null;
        let cardLast4: string | null = null;
        // Default expiry fallback — will be overwritten by Stripe's current_period_end below
        let expiresAt: Date = billingCycle === 'annual'
          ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        if (stripeSubscriptionId) {
          try {
            const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
              expand: ['default_payment_method'],
            });
            const pm = sub.default_payment_method as any;
            if (pm?.card) {
              cardBrand = pm.card.brand || null;
              cardLast4 = pm.card.last4 || null;
            }
            // Use Stripe's exact period end as the source of truth for expiry
            const subAny = sub as any;
            const periodEnd: number | undefined = subAny.current_period_end ?? subAny.currentPeriodEnd;
            if (periodEnd) {
              expiresAt = new Date(periodEnd * 1000);
            }
          } catch (err) {
            console.warn('[Stripe Webhook] Could not retrieve payment method card info:', err);
          }
        }

        // expiresAt is set above from Stripe if available, fallback only if sub fetch fails

        await query(
          `UPDATE users
           SET plan = $1, subscription_plan = $1,
               plan_limits = $2,
               plan_activated_at = NOW(),
               plan_expires_at = $3,
               subscription_status = 'active',
               stripe_customer_id = COALESCE($4, stripe_customer_id),
               stripe_subscription_id = COALESCE($5, stripe_subscription_id),
               updated_at = NOW()
           WHERE id = $6`,
          [planId, JSON.stringify(planLimits), expiresAt, stripeCustomerId, stripeSubscriptionId, userId]
        );

        // Idempotency: only insert if no completed record exists for this subscription
        // (prevents duplicate when both /sync-subscription and webhook run for the same checkout)
        const chkExisting = await query(
          `SELECT id FROM payment_history
           WHERE stripe_subscription_id = $1 AND status = 'completed' AND user_id = $2 LIMIT 1`,
          [stripeSubscriptionId, userId]
        );
        if (!chkExisting.rows.length) {
          await query(
            `INSERT INTO payment_history
               (user_id, plan_id, amount, currency, billing_cycle, payment_method, payment_provider,
                card_brand, card_last4, stripe_subscription_id, status, provider_transaction_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'completed', $11)`,
            [userId, planId, amountTotal, currency, billingCycle, 'card', 'stripe',
             cardBrand, cardLast4, stripeSubscriptionId, session.id]
          );
          console.log(`[Stripe Webhook] Payment history recorded for checkout session ${session.id}`);
        } else {
          console.log(`[Stripe Webhook] Payment history already exists for subscription ${stripeSubscriptionId} - skipping duplicate insert`);
        }

        await notificationsService.createNotification(
          userId,
          'plan_upgraded',
          'Plano Atualizado',
          `Seu plano foi atualizado para ${planId} com sucesso.`,
          'zap',
          { planId }
        );

        // 🔔 Notify admins of payment
        void notificationsService.sendAdminNotification(
          'paymentNotifications',
          'admin_payment_received',
          'Pagamento Recebido',
          `Pagamento de ${currency} ${amountTotal?.toFixed(2) ?? '0.00'} recebido para o plano ${planId} (${billingCycle}).`,
          'credit-card',
          { userId, planId, billingCycle, amount: amountTotal, currency, cardBrand, cardLast4 }
        );

        // 🔔 Notify admins of upgrade
        void notificationsService.sendAdminNotification(
          'upgradeNotifications',
          'admin_plan_upgrade',
          'Upgrade via Stripe',
          `Usuário ID ${userId} fez upgrade para ${planId} (${billingCycle}) via Stripe.`,
          'trending-up',
          { userId, planId, billingCycle }
        );

        console.log(`[Stripe Webhook] User ${userId} upgraded to ${planId} (${billingCycle}) card: ${cardBrand} ****${cardLast4}`);
        clearPlanEnforcementCache(userId);
      } else {
        console.warn('[Stripe Webhook] Missing metadata for checkout.session.completed');
      }
    }

    // ── invoice.payment_succeeded → subscription auto-renewal ──
    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as any;
      // Only process subscription renewals, not initial checkout (handled above)
      if (invoice.billing_reason === 'subscription_cycle' && invoice.subscription && invoice.customer) {
        try {
          const stripeSubscriptionId = invoice.subscription as string;
          const stripeCustomerId = invoice.customer as string;
          const amountPaid = invoice.amount_paid ? invoice.amount_paid / 100 : null;
          const currency = invoice.currency?.toUpperCase() || 'USD';

          // Find user by stripe_customer_id
          const userResult = await query(
            `SELECT id, plan FROM users WHERE stripe_customer_id = $1 LIMIT 1`,
            [stripeCustomerId]
          );
          if (!userResult.rows.length) {
            console.warn(`[Stripe Webhook] No user found for customer ${stripeCustomerId}`);
          } else {
            const user = userResult.rows[0];

            // Get card info from subscription
            let cardBrand: string | null = null;
            let cardLast4: string | null = null;
            let billingCycle = 'monthly';
            let expiresAt: Date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            try {
              const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
                expand: ['default_payment_method', 'items.data.price'],
              });
              const pm = sub.default_payment_method as any;
              if (pm?.card) { cardBrand = pm.card.brand; cardLast4 = pm.card.last4; }
              // Determine billing cycle from interval
              const interval = (sub.items?.data?.[0]?.price as any)?.recurring?.interval;
              if (interval === 'year') billingCycle = 'annual';
              // Use Stripe's exact period end as the source of truth
              const subAny = sub as any;
              const periodEnd: number | undefined = subAny.current_period_end ?? subAny.currentPeriodEnd;
              if (periodEnd) {
                expiresAt = new Date(periodEnd * 1000);
              } else {
                expiresAt = billingCycle === 'annual'
                  ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
                  : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
              }
            } catch (err) {
              console.warn('[Stripe Webhook] Could not get subscription details on renewal:', err);
            }

            await query(
              `UPDATE users
               SET plan_expires_at = $1, subscription_status = 'active', updated_at = NOW()
               WHERE id = $2`,
              [expiresAt, user.id]
            );

            // Idempotency: only insert if this specific invoice hasn't been recorded yet
            const renewalExisting = await query(
              `SELECT id FROM payment_history WHERE provider_transaction_id = $1 LIMIT 1`,
              [invoice.id]
            );
            if (!renewalExisting.rows.length) {
              await query(
                `INSERT INTO payment_history
                   (user_id, plan_id, amount, currency, billing_cycle, payment_method, payment_provider,
                    card_brand, card_last4, stripe_subscription_id, status, provider_transaction_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'completed', $11)`,
                [user.id, user.plan, amountPaid, currency, billingCycle, 'card', 'stripe',
                 cardBrand, cardLast4, stripeSubscriptionId, invoice.id]
              );
              console.log(`[Stripe Webhook] Renewal payment history recorded for invoice ${invoice.id}`);
            } else {
              console.log(`[Stripe Webhook] Renewal payment history already exists for invoice ${invoice.id} - skipping duplicate`);
            }

            console.log(`[Stripe Webhook] Renewal for user ${user.id} plan=${user.plan} expires=${expiresAt.toISOString()}`);
            clearPlanEnforcementCache(user.id);
          }
        } catch (renewErr) {
          console.error('[Stripe Webhook] Error processing renewal:', renewErr);
        }
      }
    }

    // ── customer.subscription.deleted → cancelled via portal or admin ──
    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as any;
      const stripeCustomerId = sub.customer as string;
      try {
        const userResult = await query(
          `SELECT id, email, name, plan FROM users WHERE stripe_customer_id = $1 LIMIT 1`,
          [stripeCustomerId]
        );
        if (!userResult.rows.length) {
          console.warn(`[Stripe Webhook] No user found for deleted subscription customer ${stripeCustomerId}`);
        } else {
          const user = userResult.rows[0];
          if (user.plan !== 'free') {
            await query(
              `UPDATE users
               SET plan = 'free', subscription_plan = 'free',
                   subscription_status = 'cancelled',
                   stripe_subscription_id = NULL,
                   plan_expires_at = NULL,
                   plan_activated_at = NULL,
                   updated_at = NOW()
               WHERE id = $1`,
              [user.id]
            );
            await notificationsService.createNotification(
              user.id,
              'plan_upgraded',
              'Plano Cancelado',
              'Sua assinatura foi cancelada. Você foi movido para o plano gratuito.',
              'zap',
              { previousPlan: user.plan }
            );
            void notificationsService.sendAdminNotification(
              'upgradeNotifications',
              'admin_plan_upgrade',
              'Plano Cancelado via Portal',
              `${user.name || user.email} cancelou o plano ${user.plan.toUpperCase()} via portal Stripe.`,
              'trending-up',
              { userId: user.id, email: user.email, plan: user.plan }
            );
            console.log(`[Stripe Webhook] Subscription deleted for user ${user.id}, downgraded to free`);
            clearPlanEnforcementCache(user.id);
          }
        }
      } catch (err) {
        console.error('[Stripe Webhook] Error processing subscription.deleted:', err);
      }
    }

    // ── customer.subscription.updated → plan changed or renewed via portal ──
    if (event.type === 'customer.subscription.updated') {
      const sub = event.data.object as any;
      const stripeCustomerId = sub.customer as string;
      const subStatus = sub.status as string;
      try {
        const userResult = await query(
          `SELECT id, plan FROM users WHERE stripe_customer_id = $1 LIMIT 1`,
          [stripeCustomerId]
        );
        if (userResult.rows.length) {
          const user = userResult.rows[0];
          if (subStatus === 'canceled') {
            await query(
              `UPDATE users
               SET plan = 'free', subscription_plan = 'free',
                   subscription_status = 'cancelled',
                   stripe_subscription_id = NULL,
                   plan_expires_at = NULL,
                   plan_activated_at = NULL,
                   updated_at = NOW()
               WHERE id = $1`,
              [user.id]
            );
          } else if (subStatus === 'active' || subStatus === 'trialing') {
            const subAny = sub as any;
            const periodEnd: number | undefined = subAny.current_period_end ?? subAny.currentPeriodEnd;
            if (periodEnd) {
              const expiresAt = new Date(periodEnd * 1000);
              await query(
                `UPDATE users
                 SET subscription_status = 'active', plan_expires_at = $1, updated_at = NOW()
                 WHERE id = $2`,
                [expiresAt, user.id]
              );
            }
          }
          console.log(`[Stripe Webhook] Subscription updated for user ${user.id}, status=${subStatus}`);
        }
      } catch (err) {
        console.error('[Stripe Webhook] Error processing subscription.updated:', err);
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('[Stripe Webhook] Error handling webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Sync plan from active Stripe subscription — called after checkout redirect as safety net
// Works independently of webhook: queries Stripe directly for the user's active subscription
router.post('/sync-active-subscription', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      return res.status(400).json({ synced: false, reason: 'Stripe not configured' });
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2026-03-25.dahlia' });

    // Get current user row to find stripe identifiers
    const userResult = await query(
      'SELECT id, email, plan, stripe_customer_id, stripe_subscription_id FROM users WHERE id = $1',
      [req.user.id]
    );
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    let stripeCustomerId: string | null = user.stripe_customer_id || null;

    // Look up Stripe customer by email if we don't have an ID yet
    if (!stripeCustomerId) {
      try {
        const customers = await stripe.customers.list({ email: user.email, limit: 1 });
        if (customers.data.length > 0) {
          stripeCustomerId = customers.data[0].id;
          await query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [stripeCustomerId, user.id]);
        }
      } catch (e) {
        console.warn('[Sync] Customer lookup by email failed:', e);
      }
    }

    if (!stripeCustomerId) {
      return res.json({ synced: false, reason: 'No Stripe customer found for this account' });
    }

    // Get all active/trialing subscriptions for this customer
    const subscriptions = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: 'active',
      limit: 5,
      expand: ['data.items.data.price', 'data.default_payment_method'],
    });

    if (!subscriptions.data.length) {
      return res.json({ synced: false, reason: 'No active Stripe subscriptions found' });
    }

    const sub = subscriptions.data[0];
    const priceId = sub.items.data[0]?.price?.id;
    if (!priceId) {
      return res.json({ synced: false, reason: 'Could not determine price from subscription' });
    }

    // Resolve planId from Stripe price ID using DB-configured plans
    const allPlans = await plansService.getAllPlans();
    let resolvedPlanId: string | null = null;
    let billingCycle: 'monthly' | 'annual' = 'monthly';
    for (const plan of allPlans) {
      if (plan.stripe?.priceMonthlyId === priceId) { resolvedPlanId = plan.id; billingCycle = 'monthly'; break; }
      if (plan.stripe?.priceAnnualId === priceId) { resolvedPlanId = plan.id; billingCycle = 'annual'; break; }
    }

    if (!resolvedPlanId) {
      // Fallback: match by product ID
      const productId = (sub.items.data[0]?.price as any)?.product as string | undefined;
      for (const plan of allPlans) {
        if (plan.stripe?.productId === productId) { resolvedPlanId = plan.id; break; }
      }
    }

    if (!resolvedPlanId) {
      return res.json({ synced: false, reason: `Could not map price ${priceId} to a plan` });
    }

    // Get plan limits
    let planLimits: any = null;
    try {
      const planData = await plansService.getPlanById(resolvedPlanId);
      if (planData?.limits) planLimits = planData.limits;
    } catch (e) { /* ignore */ }
    if (!planLimits) {
      const fallback: Record<string, any> = {
        free: { leads: 100, messages: 100, massMessages: 200 },
        business: { leads: 1000, messages: 500, massMessages: 1000 },
        enterprise: { leads: -1, messages: -1, massMessages: -1 },
      };
      planLimits = fallback[resolvedPlanId] || fallback.free;
    }

    // Get card info
    const pm = sub.default_payment_method as any;
    const cardBrand: string | null = pm?.card?.brand || null;
    const cardLast4: string | null = pm?.card?.last4 || null;

    // Calculate expiry from Stripe's current period end
    // The Stripe SDK 2026-03-25.dahlia uses 'billing_cycle_anchor' style — cast to any for compat
    const subAny = sub as any;
    const periodEnd: number | undefined = subAny.current_period_end ?? subAny.currentPeriodEnd;
    const expiresAt = periodEnd
      ? new Date(periodEnd * 1000)
      : billingCycle === 'annual'
        ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await query(
      `UPDATE users
       SET plan = $1, subscription_plan = $1,
           plan_limits = $2,
           plan_activated_at = COALESCE(plan_activated_at, NOW()),
           plan_expires_at = $3,
           subscription_status = 'active',
           stripe_customer_id = $4,
           stripe_subscription_id = $5,
           updated_at = NOW()
       WHERE id = $6`,
      [resolvedPlanId, JSON.stringify(planLimits), expiresAt, stripeCustomerId, sub.id, user.id]
    );

    // Record in payment history only if not already recorded (idempotent by subscription ID)
    const existing = await query(
      'SELECT id FROM payment_history WHERE stripe_subscription_id = $1 AND status = $2 LIMIT 1',
      [sub.id, 'completed']
    );
    if (!existing.rows.length) {
      const latestInvoice = await stripe.invoices.list({ subscription: sub.id, limit: 1 });
      const invoice = latestInvoice.data[0];
      if (invoice) {
        const amountPaid = invoice.amount_paid ? invoice.amount_paid / 100 : null;
        const currency = invoice.currency?.toUpperCase() || 'USD';
        await query(
          `INSERT INTO payment_history
             (user_id, plan_id, amount, currency, billing_cycle, payment_method, payment_provider,
              card_brand, card_last4, stripe_subscription_id, status, provider_transaction_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'completed', $11)
           ON CONFLICT (provider_transaction_id) DO NOTHING`,
          [user.id, resolvedPlanId, amountPaid, currency, billingCycle, 'card', 'stripe',
           cardBrand, cardLast4, sub.id, invoice.id]
        );
      }
    }

    console.log(`[Sync] User ${user.id} synced to plan=${resolvedPlanId} via Stripe subscription ${sub.id}`);

    return res.json({
      synced: true,
      plan: resolvedPlanId,
      billingCycle,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error('[Plans] Error syncing subscription:', error);
    next(error);
  }
});

// Cancel plan and optionally issue same-day refund via Stripe
router.post('/cancel', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    // Fetch current user data including Stripe fields
    const userResult = await query(
      `SELECT id, email, name, plan, subscription_plan, subscription_status,
              stripe_customer_id, stripe_subscription_id, plan_activated_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!user.plan || user.plan === 'free') {
      return res.status(400).json({ error: 'Você já está no plano gratuito.' });
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    let refundIssued = false;
    let refundAmount: number | null = null;
    let refundCurrency = 'USD';

    // Check if plan was activated today (same calendar day) — eligible for refund
    const isEligibleForRefund = (() => {
      if (!user.plan_activated_at) return false;
      const activatedAt = new Date(user.plan_activated_at);
      const now = new Date();
      return (
        activatedAt.getUTCFullYear() === now.getUTCFullYear() &&
        activatedAt.getUTCMonth() === now.getUTCMonth() &&
        activatedAt.getUTCDate() === now.getUTCDate()
      );
    })();

    // Cancel Stripe subscription and optionally refund
    if (stripeSecretKey && user.stripe_subscription_id) {
      const stripe = new Stripe(stripeSecretKey, { apiVersion: '2026-03-25.dahlia' });

      // If eligible for same-day refund, get payment intent from latest invoice
      if (isEligibleForRefund) {
        try {
          const sub = await stripe.subscriptions.retrieve(user.stripe_subscription_id, {
            expand: ['latest_invoice.payment_intent'],
          });

          const invoice = sub.latest_invoice as any;
          const paymentIntent = invoice?.payment_intent as any;

          if (paymentIntent?.id && paymentIntent?.status === 'succeeded') {
            const refund = await stripe.refunds.create({
              payment_intent: paymentIntent.id,
              reason: 'requested_by_customer',
            });
            refundIssued = true;
            refundAmount = refund.amount ? refund.amount / 100 : null;
            refundCurrency = (refund.currency || 'usd').toUpperCase();
            console.log(`[Plans Cancel] Refund issued: ${refundCurrency} ${refundAmount} for user ${user.id}`);
          }
        } catch (refundErr: any) {
          // Non-blocking — log but continue with cancellation
          console.warn('[Plans Cancel] Refund attempt failed:', refundErr?.message);
        }
      }

      // Cancel the Stripe subscription immediately
      try {
        await stripe.subscriptions.cancel(user.stripe_subscription_id);
        console.log(`[Plans Cancel] Stripe subscription ${user.stripe_subscription_id} cancelled for user ${user.id}`);
      } catch (cancelErr: any) {
        console.warn('[Plans Cancel] Stripe subscription cancel failed:', cancelErr?.message);
      }
    }

    // Downgrade user to free in database
    await query(
      `UPDATE users
       SET plan = 'free', subscription_plan = 'free',
           subscription_status = 'cancelled',
           stripe_subscription_id = NULL,
           plan_expires_at = NULL,
           plan_activated_at = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [user.id]
    );

    // Record cancellation (and refund if applicable) in payment history
    if (refundIssued && refundAmount !== null) {
      await query(
        `INSERT INTO payment_history
           (user_id, plan_id, amount, currency, billing_cycle, payment_method,
            payment_provider, status, provider_transaction_id)
         VALUES ($1, $2, $3, $4, 'monthly', 'card', 'stripe', 'refunded', $5)`,
        [user.id, user.plan, -refundAmount, refundCurrency, `refund-${Date.now()}`]
      );
    }

    // Notify the user
    await notificationsService.createNotification(
      user.id,
      'plan_upgraded',
      refundIssued ? 'Plano Cancelado com Reembolso' : 'Plano Cancelado',
      refundIssued
        ? `Seu plano foi cancelado e um reembolso de ${refundCurrency} ${refundAmount?.toFixed(2)} foi solicitado.`
        : 'Seu plano foi cancelado. Você voltou ao plano gratuito.',
      'zap',
      { planId: user.plan, refundIssued, refundAmount }
    );

    // Notify admins
    void notificationsService.sendAdminNotification(
      'upgradeNotifications',
      'admin_plan_upgrade',
      'Plano Cancelado',
      `${user.name || user.email} cancelou o plano ${user.plan.toUpperCase()}${refundIssued ? ` — reembolso de ${refundCurrency} ${refundAmount?.toFixed(2)} emitido` : ''}.`,
      'trending-up',
      { userId: user.id, email: user.email, plan: user.plan, refundIssued, refundAmount }
    );

    return res.json({
      success: true,
      refundIssued,
      refundAmount,
      refundCurrency,
      message: refundIssued
        ? `Plano cancelado. Reembolso de ${refundCurrency} ${refundAmount?.toFixed(2)} solicitado ao Stripe.`
        : 'Plano cancelado. Você foi movido para o plano gratuito.',
    });
  } catch (error) {
    console.error('[Plans] Error cancelling plan:', error);
    next(error);
  }
});

// Create a Stripe Customer Portal session
router.post('/portal-session', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      return res.status(503).json({ error: 'Stripe not configured' });
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2026-03-25.dahlia' });

    const userResult = await query(
      'SELECT id, email, stripe_customer_id FROM users WHERE id = $1',
      [req.user.id]
    );
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    let stripeCustomerId: string | null = user.stripe_customer_id || null;

    // Look up by email if no customer ID stored
    if (!stripeCustomerId) {
      try {
        const customers = await stripe.customers.list({ email: user.email, limit: 1 });
        if (customers.data.length > 0) {
          stripeCustomerId = customers.data[0].id;
          await query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [stripeCustomerId, user.id]);
        }
      } catch (e) {
        console.warn('[Portal] Customer lookup by email failed:', e);
      }
    }

    if (!stripeCustomerId) {
      return res.status(400).json({ error: 'Nenhuma conta Stripe encontrada. Faça um pagamento primeiro.' });
    }

    const appUrl = process.env.APP_URL || (req.headers.origin as string) || 'https://app.leadsflowapi.com';
    const returnUrl = `${appUrl}/dashboard/plan`;

    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl,
    });

    return res.json({ url: session.url });
  } catch (error) {
    console.error('[Plans] Error creating portal session:', error);
    next(error);
  }
});

export default router;
