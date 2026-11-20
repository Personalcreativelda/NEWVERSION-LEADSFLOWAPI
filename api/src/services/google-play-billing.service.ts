import { createHmac } from 'crypto';
import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import { query } from '../database/connection';
import { notificationsService } from './notifications.service';
import {
  getSubscriptionOwner,
  recomputeEffectiveEntitlement,
  upsertBillingSubscription,
} from './billing-entitlement.service';

const ANDROID_PUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const DEFAULT_PACKAGE_NAME = 'com.leadsflowapi.app';

export type BillingCycle = 'monthly' | 'annual';

export interface GooglePlayCatalogItem {
  planId: 'business' | 'enterprise';
  billingCycle: BillingCycle;
  productId: string;
  basePlanId: string;
}

interface GooglePlayLineItem {
  productId?: string;
  expiryTime?: string;
  latestSuccessfulOrderId?: string;
  offerDetails?: {
    basePlanId?: string;
    offerId?: string;
    offerTags?: string[];
  };
  autoRenewingPlan?: { autoRenewEnabled?: boolean };
  prepaidPlan?: { allowExtendAfterTime?: string };
}

interface GooglePlaySubscriptionPurchaseV2 {
  kind?: string;
  regionCode?: string;
  startTime?: string;
  subscriptionState?: string;
  latestOrderId?: string;
  linkedPurchaseToken?: string;
  acknowledgementState?: string;
  externalAccountIdentifiers?: {
    obfuscatedExternalAccountId?: string;
    obfuscatedExternalProfileId?: string;
  };
  lineItems?: GooglePlayLineItem[];
  testPurchase?: Record<string, never>;
}

let googleAuth: GoogleAuth | null = null;

function env(name: string, fallback: string): string {
  return (process.env[name] || fallback).trim();
}

export function getGooglePlayCatalog(): GooglePlayCatalogItem[] {
  const businessProduct = env('GOOGLE_PLAY_BUSINESS_PRODUCT_ID', 'leadsflow_business');
  const enterpriseProduct = env('GOOGLE_PLAY_ENTERPRISE_PRODUCT_ID', 'leadsflow_enterprise');
  return [
    {
      planId: 'business',
      billingCycle: 'monthly',
      productId: businessProduct,
      basePlanId: env('GOOGLE_PLAY_BUSINESS_MONTHLY_BASE_PLAN_ID', 'monthly'),
    },
    {
      planId: 'business',
      billingCycle: 'annual',
      productId: businessProduct,
      basePlanId: env('GOOGLE_PLAY_BUSINESS_ANNUAL_BASE_PLAN_ID', 'annual'),
    },
    {
      planId: 'enterprise',
      billingCycle: 'monthly',
      productId: enterpriseProduct,
      basePlanId: env('GOOGLE_PLAY_ENTERPRISE_MONTHLY_BASE_PLAN_ID', 'monthly'),
    },
    {
      planId: 'enterprise',
      billingCycle: 'annual',
      productId: enterpriseProduct,
      basePlanId: env('GOOGLE_PLAY_ENTERPRISE_ANNUAL_BASE_PLAN_ID', 'annual'),
    },
  ];
}

export function getGooglePlayPackageName() {
  return env('GOOGLE_PLAY_PACKAGE_NAME', DEFAULT_PACKAGE_NAME);
}

function parseServiceAccount(): Record<string, any> | undefined {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON?.trim();
  if (raw) {
    const jsonText = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const credentials = JSON.parse(jsonText);
    if (credentials.private_key) credentials.private_key = String(credentials.private_key).replace(/\\n/g, '\n');
    return credentials;
  }

  const clientEmail = process.env.GOOGLE_PLAY_CLIENT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_PLAY_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
  if (clientEmail && privateKey) {
    return {
      type: 'service_account',
      project_id: process.env.GOOGLE_PLAY_PROJECT_ID?.trim(),
      client_email: clientEmail,
      private_key: privateKey,
    };
  }
  return undefined;
}

export function isGooglePlayConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON?.trim() ||
    (process.env.GOOGLE_PLAY_CLIENT_EMAIL?.trim() && process.env.GOOGLE_PLAY_PRIVATE_KEY?.trim()) ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim(),
  );
}

function getGoogleAuth(): GoogleAuth {
  if (!googleAuth) {
    googleAuth = new GoogleAuth({
      credentials: parseServiceAccount(),
      scopes: [ANDROID_PUBLISHER_SCOPE],
    });
  }
  return googleAuth;
}

export function googlePlayAccountId(userId: string): string {
  const secret = process.env.GOOGLE_PLAY_ACCOUNT_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('GOOGLE_PLAY_ACCOUNT_SECRET/JWT_SECRET não configurado');
  return createHmac('sha256', secret).update(`leadsflow-google-play:${userId}`).digest('hex');
}

function normalizeState(subscriptionState?: string): string {
  switch (subscriptionState) {
    case 'SUBSCRIPTION_STATE_ACTIVE': return 'active';
    case 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD': return 'grace_period';
    case 'SUBSCRIPTION_STATE_CANCELED': return 'cancelled';
    case 'SUBSCRIPTION_STATE_PENDING': return 'pending';
    case 'SUBSCRIPTION_STATE_ON_HOLD': return 'on_hold';
    case 'SUBSCRIPTION_STATE_PAUSED': return 'paused';
    case 'SUBSCRIPTION_STATE_EXPIRED': return 'expired';
    case 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED': return 'cancelled';
    default: return 'unknown';
  }
}

function lineItemExpiry(item: GooglePlayLineItem): number {
  const value = item.expiryTime ? new Date(item.expiryTime).getTime() : 0;
  return Number.isFinite(value) ? value : 0;
}

function resolveCatalogItem(data: GooglePlaySubscriptionPurchaseV2, expectedProductId?: string) {
  const catalog = getGooglePlayCatalog();
  const candidates = (data.lineItems || [])
    .filter((item) => !expectedProductId || item.productId === expectedProductId)
    .sort((a, b) => lineItemExpiry(b) - lineItemExpiry(a));

  for (const lineItem of candidates) {
    const basePlanId = lineItem.offerDetails?.basePlanId;
    const exact = catalog.find((item) =>
      item.productId === lineItem.productId && item.basePlanId === basePlanId,
    );
    if (exact) return { catalogItem: exact, lineItem };

    // Contas antigas podem não devolver basePlanId. Só aceitamos quando o produto tem
    // uma única configuração, para nunca adivinhar o ciclo cobrado.
    const productMatches = catalog.filter((item) => item.productId === lineItem.productId);
    if (!basePlanId && productMatches.length === 1) {
      return { catalogItem: productMatches[0], lineItem };
    }
  }
  const error: any = new Error('O produto Google Play não está associado a um plano LeadsFlow.');
  error.status = 400;
  error.code = 'GOOGLE_PLAY_PRODUCT_NOT_MAPPED';
  throw error;
}

async function fetchSubscription(purchaseToken: string): Promise<GooglePlaySubscriptionPurchaseV2> {
  if (!isGooglePlayConfigured()) {
    const error: any = new Error('Google Play Billing não está configurado.');
    error.status = 503;
    error.code = 'GOOGLE_PLAY_NOT_CONFIGURED';
    throw error;
  }
  const client = await getGoogleAuth().getClient();
  const packageName = encodeURIComponent(getGooglePlayPackageName());
  const token = encodeURIComponent(purchaseToken);
  const response = await client.request<GooglePlaySubscriptionPurchaseV2>({
    url: `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptionsv2/tokens/${token}`,
    method: 'GET',
  });
  return response.data;
}

async function acknowledgeSubscription(productId: string, purchaseToken: string) {
  const client = await getGoogleAuth().getClient();
  const packageName = encodeURIComponent(getGooglePlayPackageName());
  const subscriptionId = encodeURIComponent(productId);
  const token = encodeURIComponent(purchaseToken);
  await client.request({
    url: `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptions/${subscriptionId}/tokens/${token}:acknowledge`,
    method: 'POST',
    data: {},
  });
}

export async function verifyGooglePlaySubscription(options: {
  userId: string;
  purchaseToken: string;
  expectedProductId?: string;
}) {
  const purchaseToken = options.purchaseToken?.trim();
  if (!purchaseToken || purchaseToken.length > 4096 || /[\r\n]/.test(purchaseToken)) {
    const error: any = new Error('Token de compra inválido.');
    error.status = 400;
    error.code = 'INVALID_PURCHASE_TOKEN';
    throw error;
  }

  const existingOwner = await getSubscriptionOwner('google_play', purchaseToken);
  if (existingOwner && existingOwner !== options.userId) {
    const error: any = new Error('Esta compra já está associada a outra conta.');
    error.status = 409;
    error.code = 'PURCHASE_ALREADY_LINKED';
    throw error;
  }

  const data = await fetchSubscription(purchaseToken);
  const externalAccountId = data.externalAccountIdentifiers?.obfuscatedExternalAccountId;
  const expectedAccountId = googlePlayAccountId(options.userId);
  if (externalAccountId !== expectedAccountId && (!existingOwner || Boolean(externalAccountId))) {
    const error: any = new Error('A compra pertence a outra conta LeadsFlow.');
    error.status = 409;
    error.code = 'PURCHASE_ACCOUNT_MISMATCH';
    throw error;
  }

  const { catalogItem, lineItem } = resolveCatalogItem(data, options.expectedProductId);
  const status = normalizeState(data.subscriptionState);
  const expiresAt = lineItem.expiryTime ? new Date(lineItem.expiryTime) : null;
  const entitlementStates = ['active', 'grace_period', 'cancelled'];
  const isEntitled = entitlementStates.includes(status) && Boolean(expiresAt && expiresAt.getTime() > Date.now());

  let acknowledged = data.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED';
  if (isEntitled && !acknowledged) {
    await acknowledgeSubscription(catalogItem.productId, purchaseToken);
    acknowledged = true;
  }

  await upsertBillingSubscription({
    userId: options.userId,
    provider: 'google_play',
    providerReference: purchaseToken,
    linkedProviderReference: data.linkedPurchaseToken || null,
    productId: catalogItem.productId,
    basePlanId: catalogItem.basePlanId,
    planId: catalogItem.planId,
    billingCycle: catalogItem.billingCycle,
    status,
    currentPeriodStart: data.startTime || null,
    currentPeriodEnd: expiresAt,
    autoRenew: lineItem.autoRenewingPlan?.autoRenewEnabled ?? false,
    acknowledged,
    metadata: {
      latestOrderId: lineItem.latestSuccessfulOrderId || data.latestOrderId || null,
      regionCode: data.regionCode || null,
      testPurchase: Boolean(data.testPurchase),
      offerId: lineItem.offerDetails?.offerId || null,
    },
  });

  const effective = await recomputeEffectiveEntitlement(
    options.userId,
    undefined,
    status === 'cancelled' ? 'cancelled' : 'expired',
  );

  const orderId = lineItem.latestSuccessfulOrderId || data.latestOrderId;
  const transactionId = `google_play:${orderId || purchaseToken}`;
  const history = await query(
    `INSERT INTO payment_history
       (user_id, plan_id, amount, currency, billing_cycle, payment_method,
        payment_provider, status, provider_transaction_id)
     VALUES ($1, $2, NULL, 'USD', $3, 'google_play', 'google_play', $4, $5)
     ON CONFLICT (provider_transaction_id) WHERE provider_transaction_id IS NOT NULL DO NOTHING
     RETURNING id`,
    [
      options.userId,
      catalogItem.planId,
      catalogItem.billingCycle,
      isEntitled ? 'completed' : status,
      transactionId,
    ],
  );

  if (history.rows.length && isEntitled) {
    void notificationsService.createNotification(
      options.userId,
      'plan_upgraded',
      'Pagamento confirmado',
      `O plano ${catalogItem.planId.toUpperCase()} está ativo pela Google Play.`,
      'zap',
      { planId: catalogItem.planId, provider: 'google_play' },
    ).catch(() => {});
  }

  return {
    verified: true,
    entitled: isEntitled,
    plan: effective.planId,
    purchasedPlan: catalogItem.planId,
    billingCycle: catalogItem.billingCycle,
    status,
    expiresAt: expiresAt?.toISOString() || null,
    acknowledged,
  };
}

export async function verifyGooglePubSubToken(authorization?: string) {
  const token = String(authorization || '').replace(/^Bearer\s+/i, '').trim();
  const audience = process.env.GOOGLE_PLAY_PUBSUB_AUDIENCE?.trim();
  const expectedEmail = process.env.GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT_EMAIL?.trim();
  if (!token || !audience || !expectedEmail) return false;
  const ticket = await new OAuth2Client().verifyIdToken({ idToken: token, audience });
  const payload = ticket.getPayload();
  return Boolean(payload?.email_verified && payload.email === expectedEmail);
}

export interface GooglePlayRtdnMessage {
  packageName?: string;
  subscriptionNotification?: {
    notificationType?: number;
    purchaseToken?: string;
    subscriptionId?: string;
  };
  testNotification?: { version?: string };
}

export async function processGooglePlayRtdn(message: GooglePlayRtdnMessage) {
  if (message.packageName && message.packageName !== getGooglePlayPackageName()) {
    const error: any = new Error('Pacote Google Play inválido.');
    error.status = 400;
    throw error;
  }
  if (message.testNotification) return { test: true, synced: false };

  const purchaseToken = message.subscriptionNotification?.purchaseToken;
  if (!purchaseToken) return { ignored: true, synced: false };
  const userId = await getSubscriptionOwner('google_play', purchaseToken);
  if (!userId) {
    // A primeira associação é sempre feita pelo pedido autenticado da app.
    console.warn('[Google Play RTDN] Compra ainda não associada a uma conta.');
    return { ignored: true, synced: false };
  }
  const result = await verifyGooglePlaySubscription({ userId, purchaseToken });
  return { synced: true, result };
}
