import { Context } from 'npm:hono';
import * as kv from './kv_store.tsx';
import { createClient } from 'npm:@supabase/supabase-js';

// Initialize Supabase client
const getSupabaseClient = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    throw new Error('Missing Supabase credentials');
  }

  return createClient(supabaseUrl, supabaseKey);
};

// Helper function to create notification for admin
async function createAdminNotification(type: string, message: string, metadata: any = {}) {
  try {
    // Get admin user
    const supabase = getSupabaseClient();
    const { data: adminAuthData } = await supabase.auth.admin.listUsers();
    const adminUser = adminAuthData?.users?.find(u => u.email === 'admin@leadflow.com');
    
    if (!adminUser) {
      console.log('Admin user not found, skipping notification');
      return;
    }

    // Check if admin has this notification type enabled
    const settings = await kv.get(`admin:notification-settings`) || {
      upgradeNotifications: true,
      newUserNotifications: false,
      paymentNotifications: true,
    };

    // Check if notification should be sent
    if (type === 'upgrade' && !settings.upgradeNotifications) {
      console.log('Upgrade notifications disabled for admin');
      return;
    }
    if (type === 'payment' && !settings.paymentNotifications) {
      console.log('Payment notifications disabled for admin');
      return;
    }

    const notificationId = crypto.randomUUID();
    const notification = {
      id: notificationId,
      type,
      message,
      metadata,
      read: false,
      timestamp: new Date().toISOString(),
    };

    await kv.set(`notification:${adminUser.id}:${notificationId}`, notification);
    console.log(`Admin notification created: ${type} - ${message}`);
  } catch (error) {
    console.error('Error creating admin notification:', error);
  }
}

// PayPal API Configuration
const PAYPAL_CLIENT_ID = 'AWQp1JNIjYw8VB83PzPbeykqrY5ziYF6PL4XI4GaNx2DnFNHMINuB-bzCRyZDfH7FWRO8n_OFo6PkINW';
const PAYPAL_CLIENT_SECRET = 'EOiVFlTJ50Gc0GslCvQt_4Ijwj1w0Q4rot6fHgYUIl1T2ULv_xHp8MkOUnymRZ7gfUis5bLbOdTLCwDq';
const PAYPAL_API_BASE = 'https://api-m.paypal.com'; // Production
// const PAYPAL_API_BASE = 'https://api-m.sandbox.paypal.com'; // Sandbox for testing

// Plan mapping
const PLAN_MAPPING: Record<string, { planId: string; billing: 'monthly' | 'annual' }> = {
  'P-3UR05380F52891801NEO6Q4Y': { planId: 'business', billing: 'monthly' },
  'P-78R18369EM9497529NEO64NQ': { planId: 'business', billing: 'annual' },
  'P-7HX4714980059964MNEO6XHQ': { planId: 'enterprise', billing: 'monthly' },
  'P-1T973744K0727241DNEO652I': { planId: 'enterprise', billing: 'annual' },
};

interface PayPalAccessTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface PayPalSubscriptionDetails {
  id: string;
  plan_id: string;
  status: string;
  subscriber: {
    email_address?: string;
  };
}

/**
 * Get PayPal access token
 */
async function getPayPalAccessToken(): Promise<string> {
  const auth = btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`);

  const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('PayPal access token error:', error);
    throw new Error('Failed to get PayPal access token');
  }

  const data: PayPalAccessTokenResponse = await response.json();
  return data.access_token;
}

/**
 * Get subscription details from PayPal
 */
async function getSubscriptionDetails(subscriptionId: string, accessToken: string): Promise<PayPalSubscriptionDetails> {
  const response = await fetch(`${PAYPAL_API_BASE}/v1/billing/subscriptions/${subscriptionId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('PayPal subscription details error:', error);
    throw new Error('Failed to get subscription details');
  }

  return await response.json();
}

/**
 * Activate subscription endpoint
 */
export async function activateSubscription(c: Context) {
  try {
    const { subscriptionId, planId, billingPeriod } = await c.req.json();

    if (!subscriptionId) {
      return c.json({ success: false, error: 'Subscription ID is required' }, 400);
    }

    console.log('Activating PayPal subscription:', { subscriptionId, planId, billingPeriod });

    // Get access token
    const accessToken = await getPayPalAccessToken();

    // Get subscription details
    const subscription = await getSubscriptionDetails(subscriptionId, accessToken);

    console.log('PayPal subscription details:', subscription);

    // Verify subscription is active
    if (subscription.status !== 'ACTIVE') {
      console.error('Subscription not active:', subscription.status);
      return c.json({
        success: false,
        error: `Subscription status is ${subscription.status}, expected ACTIVE`,
      }, 400);
    }

    // Map PayPal plan ID to our internal plan
    const planMapping = PLAN_MAPPING[subscription.plan_id];
    if (!planMapping) {
      console.error('Unknown PayPal plan ID:', subscription.plan_id);
      return c.json({
        success: false,
        error: 'Invalid PayPal plan ID',
      }, 400);
    }

    // Get authenticated user
    const user = c.get('user');
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    // Get user profile
    const userProfile = await kv.get(`user:${user.id}`);
    if (!userProfile) {
      return c.json({ success: false, error: 'User profile not found' }, 404);
    }

    // Plan limits configuration
    const planLimits: Record<string, any> = {
      free: {
        leads: 100,
        messages: 100,
        massMessages: 200,
        campaigns: 3,
      },
      business: {
        leads: 500,
        messages: 500,
        massMessages: 1000,
        campaigns: 50,
      },
      enterprise: {
        leads: -1, // unlimited
        messages: -1,
        massMessages: -1,
        campaigns: -1,
      },
    };

    // Update user plan
    const updatedProfile = {
      ...userProfile,
      plan: planMapping.planId,
      limits: planLimits[planMapping.planId] || planLimits.free,
      paypalSubscriptionId: subscription.id,
      paypalPlanId: subscription.plan_id,
      billingPeriod: planMapping.billing,
      subscriptionStatus: subscription.status,
      updatedAt: new Date().toISOString(),
    };

    await kv.set(`user:${user.id}`, updatedProfile);

    // Store subscription in KV
    const subscriptionData = {
      subscriptionId: subscription.id,
      paypalPlanId: subscription.plan_id,
      planId: planMapping.planId,
      billingPeriod: planMapping.billing,
      status: subscription.status,
      email: subscription.subscriber.email_address,
      userId: user.id,
      createdAt: new Date().toISOString(),
    };

    await kv.set(`paypal_subscription:${subscription.id}`, subscriptionData);

    console.log('PayPal subscription activated successfully for user:', user.id);

    // Create admin notification with detailed information
    const planName = planMapping.planId.charAt(0).toUpperCase() + planMapping.planId.slice(1);
    const billingText = planMapping.billing === 'monthly' ? 'Mensal' : 'Anual';
    const userName = userProfile.name || userProfile.email || 'Usuário';
    
    await createAdminNotification(
      'upgrade', 
      `🎉 ${userName} fez upgrade para o plano ${planName} (${billingText})`,
      {
        userId: user.id,
        userEmail: userProfile.email,
        userName: userProfile.name,
        fromPlan: userProfile.plan || 'free',
        toPlan: planMapping.planId,
        billingPeriod: planMapping.billing,
        subscriptionId: subscription.id,
      }
    );

    const lastPayment = (subscription as any)?.billing_info?.last_payment;
    try {
      await createAdminNotification(
        'payment',
        lastPayment?.amount?.value
          ? `💰 Pagamento confirmado de ${userName} no valor de ${lastPayment.amount.value} ${lastPayment.amount.currency_code || ''}`
          : `💰 Pagamento confirmado para ${userName}`,
        {
          userId: user.id,
          userEmail: userProfile.email,
          userName: userProfile.name,
          amount: lastPayment?.amount?.value ?? null,
          currency: lastPayment?.amount?.currency_code ?? null,
          subscriptionId: subscription.id,
          paymentTime: lastPayment?.time ?? null,
        },
      );
    } catch (paymentNotificationError) {
      console.error('Error adding admin payment notification:', paymentNotificationError);
    }

    return c.json({
      success: true,
      user: updatedProfile,
      subscription: subscriptionData,
      message: 'Subscription activated successfully',
    });

  } catch (error: any) {
    console.error('Error activating PayPal subscription:', error);
    return c.json({
      success: false,
      error: error.message || 'Failed to activate subscription',
    }, 500);
  }
}

/**
 * PayPal webhook handler
 */
export async function handleWebhook(c: Context) {
  try {
    const webhookEvent = await c.req.json();
    
    console.log('PayPal webhook received:', webhookEvent.event_type);

    // Handle different webhook events
    switch (webhookEvent.event_type) {
      case 'BILLING.SUBSCRIPTION.ACTIVATED':
        console.log('Subscription activated:', webhookEvent.resource.id);
        // Update subscription status in database
        break;

      case 'BILLING.SUBSCRIPTION.CANCELLED':
        console.log('Subscription cancelled:', webhookEvent.resource.id);
        // Update subscription status and downgrade user
        break;

      case 'BILLING.SUBSCRIPTION.EXPIRED':
        console.log('Subscription expired:', webhookEvent.resource.id);
        // Downgrade user to free plan
        break;

      case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
        console.log('Payment failed:', webhookEvent.resource.id);
        // Notify user about payment failure
        break;

      case 'BILLING.SUBSCRIPTION.UPDATED':
        console.log('Subscription updated:', webhookEvent.resource.id);
        // Update subscription details
        break;

      default:
        console.log('Unhandled webhook event:', webhookEvent.event_type);
    }

    return c.json({ success: true });

  } catch (error: any) {
    console.error('Error handling PayPal webhook:', error);
    return c.json({
      success: false,
      error: error.message || 'Failed to process webhook',
    }, 500);
  }
}
