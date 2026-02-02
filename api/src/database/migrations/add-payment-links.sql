-- Migration: Add payment links to plans table
-- Date: 2026-02-02

-- Add payment_link columns if not exist
DO $$ BEGIN
  ALTER TABLE plans ADD COLUMN payment_link_monthly VARCHAR(500);
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE plans ADD COLUMN payment_link_annual VARCHAR(500);
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- Update existing plans with PayPal payment links
UPDATE plans SET 
  payment_link_monthly = 'https://www.paypal.com/ncp/payment/MJFXSMAZY9VPS',
  payment_link_annual = 'https://www.paypal.com/ncp/payment/ADJF2GY82HDCW'
WHERE id = 'business';

UPDATE plans SET 
  payment_link_monthly = 'https://www.paypal.com/ncp/payment/6XX4G2TKPCA6Y',
  payment_link_annual = 'https://www.paypal.com/ncp/payment/ESX4B2DFC6AZL'
WHERE id = 'enterprise';

-- Free plan doesn't need payment links
UPDATE plans SET 
  payment_link_monthly = NULL,
  payment_link_annual = NULL
WHERE id = 'free';

-- Verify updates
SELECT id, name, payment_link_monthly, payment_link_annual FROM plans;
