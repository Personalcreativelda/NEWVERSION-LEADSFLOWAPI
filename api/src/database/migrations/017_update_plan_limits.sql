-- Migration 017: Update plan limits to new structure
-- Free:       leads=100, messages=100, massMessages=50
-- Business:   leads=2000, messages=1000, massMessages=5000
-- Enterprise: leads=-1, messages=-1, massMessages=-1

-- Update users on free plan
UPDATE users
SET plan_limits = '{"leads":100,"messages":100,"massMessages":50}'::jsonb,
    updated_at = NOW()
WHERE (plan = 'free' OR plan IS NULL)
  AND (plan_limits IS NULL OR plan_limits->>'massMessages' != '50');

-- Update users on business plan
UPDATE users
SET plan_limits = '{"leads":2000,"messages":1000,"massMessages":5000}'::jsonb,
    updated_at = NOW()
WHERE plan = 'business'
  AND (plan_limits IS NULL OR plan_limits->>'leads' NOT IN ('2000'));

-- Update users on enterprise plan
UPDATE users
SET plan_limits = '{"leads":-1,"messages":-1,"massMessages":-1}'::jsonb,
    updated_at = NOW()
WHERE plan = 'enterprise'
  AND (plan_limits IS NULL OR plan_limits->>'leads' != '-1');

-- Update plans table if it exists
UPDATE plans
SET limits = '{"leads":100,"messages":100,"massMessages":50}'::jsonb,
    features = '["Até 100 leads","100 mensagens individuais/mês","50 campanhas em massa/mês","1 canal conectado","Painel básico de métricas","Suporte por email (48h)"]'::jsonb,
    price_monthly = 0,
    price_annual = 0,
    updated_at = NOW()
WHERE id = 'free';

UPDATE plans
SET limits = '{"leads":2000,"messages":1000,"massMessages":5000}'::jsonb,
    features = '["Até 2.000 leads","1.000 mensagens individuais/mês","5.000 campanhas em massa/mês","Até 5 canais conectados","Assistentes de IA (marketplace + 3 custom)","1 agente de voz","Painel completo e personalizável","Relatórios em tempo real","Todas as integrações","API de acesso e HTTP endpoint","Suporte prioritário (4h)"]'::jsonb,
    price_monthly = 97,
    price_annual = 79,
    updated_at = NOW()
WHERE id = 'business';

UPDATE plans
SET limits = '{"leads":-1,"messages":-1,"massMessages":-1}'::jsonb,
    features = '["Leads ilimitados","Mensagens individuais ilimitadas","Campanhas em massa ilimitadas","Canais ilimitados","Tudo do Business, mais:","Agentes de voz ilimitados","Gerente de conta dedicado","SLA garantido 99.9%","Suporte prioritário 24/7","Onboarding personalizado"]'::jsonb,
    price_monthly = 197,
    price_annual = 159,
    updated_at = NOW()
WHERE id = 'enterprise';
