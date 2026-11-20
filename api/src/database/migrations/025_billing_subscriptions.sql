-- Subscrições separadas por fornecedor. `users.plan` continua a ser a cópia efetiva
-- usada pelo resto da aplicação, mas deixa de ser a fonte única de verdade.
CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(40) NOT NULL,
  provider_reference TEXT NOT NULL,
  linked_provider_reference TEXT,
  product_id VARCHAR(160),
  base_plan_id VARCHAR(160),
  plan_id VARCHAR(50) NOT NULL REFERENCES plans(id),
  billing_cycle VARCHAR(20),
  status VARCHAR(40) NOT NULL,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  auto_renew BOOLEAN,
  acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_reference)
);

CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_user
  ON billing_subscriptions (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_active
  ON billing_subscriptions (user_id, status, current_period_end);

-- As subscrições Stripe antigas passam a ter uma origem explícita. A inserção é
-- idempotente e não altera o plano atual durante o deploy.
INSERT INTO billing_subscriptions (
  user_id, provider, provider_reference, plan_id, status,
  current_period_start, current_period_end, auto_renew, acknowledged,
  last_verified_at
)
SELECT
  id,
  'stripe',
  stripe_subscription_id,
  COALESCE(NULLIF(subscription_plan, ''), plan),
  CASE
    WHEN subscription_status IN ('active', 'trialing') THEN subscription_status
    WHEN plan_expires_at IS NOT NULL AND plan_expires_at > NOW() THEN 'cancelled'
    ELSE COALESCE(NULLIF(subscription_status, ''), 'expired')
  END,
  plan_activated_at,
  plan_expires_at,
  subscription_status IN ('active', 'trialing'),
  TRUE,
  NOW()
FROM users
WHERE stripe_subscription_id IS NOT NULL
  AND COALESCE(NULLIF(subscription_plan, ''), plan) <> 'free'
ON CONFLICT (provider, provider_reference) DO NOTHING;
