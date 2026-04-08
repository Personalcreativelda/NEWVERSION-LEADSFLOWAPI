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

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as any;
      const userId = session.metadata?.userId;
      const planId = session.metadata?.planId;

      if (userId && planId) {
        await query(
          `UPDATE users
           SET plan = $1, subscription_plan = $1, updated_at = NOW()
           WHERE id = $2`,
          [planId, userId]
        );

        await notificationsService.createNotification(
          userId,
          'plan_upgraded',
          'Plano Atualizado',
          `Seu plano foi atualizado para ${planId} com sucesso.`,
          'zap',
          { planId }
        );

        console.log(`[Stripe Webhook] User ${userId} upgraded to ${planId}`);
      } else {
        console.warn('[Stripe Webhook] Missing metadata for checkout.session.completed');
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('[Stripe Webhook] Error handling webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;
