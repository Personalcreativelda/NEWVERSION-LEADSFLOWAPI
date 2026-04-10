import { Router } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import { query } from '../database/connection';
import { plansService } from '../services/plans.service';
import { notificationsService } from '../services/notifications.service';
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

    const { planId } = req.body;

    if (!planId) {
      return res.status(400).json({ error: 'Plan ID is required' });
    }

    // Validate plan exists in database
    const planExists = await plansService.validatePlanId(planId);
    if (!planExists) {
      return res.status(400).json({ error: 'Invalid plan ID' });
    }

    // Update user's plan in database
    const result = await query(
      `UPDATE users
       SET plan = $1, subscription_plan = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, email, name, avatar_url, plan, subscription_plan`,
      [planId, req.user.id]
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`[Plans] User ${user.email} upgraded to plan: ${planId}`);

    // Create notification
    await notificationsService.createNotification(
      req.user.id,
      'plan_upgraded',
      'Plano Atualizado',
      `Você atualizou seu plano para ${user.plan.toUpperCase()}`,
      'zap',
      { planId, planName: user.plan }
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
      metadata: {
        userId: req.user.id,
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
      const userId = session.metadata?.userId;
      const planId = session.metadata?.planId;
      const billingCycle = session.metadata?.billingCycle || 'monthly';
      const amountTotal = session.amount_total ? session.amount_total / 100 : null;
      const currency = session.currency?.toUpperCase() || 'USD';
      const stripeCustomerId = session.customer as string | null;
      const stripeSubscriptionId = session.subscription as string | null;

      if (userId && planId) {
        // Retrieve card info from the subscription's payment method
        let cardBrand: string | null = null;
        let cardLast4: string | null = null;
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
          } catch (err) {
            console.warn('[Stripe Webhook] Could not retrieve payment method card info:', err);
          }
        }

        const expiresAt = billingCycle === 'annual'
          ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        await query(
          `UPDATE users
           SET plan = $1, subscription_plan = $1,
               plan_activated_at = NOW(),
               plan_expires_at = $2,
               subscription_status = 'active',
               stripe_customer_id = COALESCE($3, stripe_customer_id),
               stripe_subscription_id = COALESCE($4, stripe_subscription_id),
               updated_at = NOW()
           WHERE id = $5`,
          [planId, expiresAt, stripeCustomerId, stripeSubscriptionId, userId]
        );

        await query(
          `INSERT INTO payment_history
             (user_id, plan_id, amount, currency, billing_cycle, payment_method, payment_provider,
              card_brand, card_last4, stripe_subscription_id, status, provider_transaction_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'completed', $11)`,
          [userId, planId, amountTotal, currency, billingCycle, 'card', 'stripe',
           cardBrand, cardLast4, stripeSubscriptionId, session.id]
        );

        await notificationsService.createNotification(
          userId,
          'plan_upgraded',
          'Plano Atualizado',
          `Seu plano foi atualizado para ${planId} com sucesso.`,
          'zap',
          { planId }
        );

        console.log(`[Stripe Webhook] User ${userId} upgraded to ${planId} (${billingCycle}) card: ${cardBrand} ****${cardLast4}`);
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
            try {
              const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
                expand: ['default_payment_method', 'items.data.price'],
              });
              const pm = sub.default_payment_method as any;
              if (pm?.card) { cardBrand = pm.card.brand; cardLast4 = pm.card.last4; }
              // Determine billing cycle from interval
              const interval = (sub.items?.data?.[0]?.price as any)?.recurring?.interval;
              if (interval === 'year') billingCycle = 'annual';
            } catch (err) {
              console.warn('[Stripe Webhook] Could not get subscription details on renewal:', err);
            }

            const expiresAt = billingCycle === 'annual'
              ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
              : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

            await query(
              `UPDATE users
               SET plan_expires_at = $1, subscription_status = 'active', updated_at = NOW()
               WHERE id = $2`,
              [expiresAt, user.id]
            );

            await query(
              `INSERT INTO payment_history
                 (user_id, plan_id, amount, currency, billing_cycle, payment_method, payment_provider,
                  card_brand, card_last4, stripe_subscription_id, status, provider_transaction_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'completed', $11)`,
              [user.id, user.plan, amountPaid, currency, billingCycle, 'card', 'stripe',
               cardBrand, cardLast4, stripeSubscriptionId, invoice.id]
            );

            console.log(`[Stripe Webhook] Renewal for user ${user.id} plan=${user.plan} expires=${expiresAt.toISOString()}`);
          }
        } catch (renewErr) {
          console.error('[Stripe Webhook] Error processing renewal:', renewErr);
        }
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('[Stripe Webhook] Error handling webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;
