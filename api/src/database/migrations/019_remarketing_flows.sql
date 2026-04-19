-- Migration 019: Remarketing Flows
-- Creates the remarketing_flows table for storing automation flow definitions.
-- Steps are stored as JSONB inside the flow row (no separate table needed
-- since they are always fetched together and not queried individually).

CREATE TABLE IF NOT EXISTS remarketing_flows (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  description   TEXT        NOT NULL DEFAULT '',
  status        VARCHAR(20) NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('active', 'paused', 'draft')),
  trigger_type  VARCHAR(50) NOT NULL
                  CHECK (trigger_type IN ('funnel_stage', 'tag', 'inactivity', 'purchase', 'lead_score')),
  trigger_label VARCHAR(255) NOT NULL DEFAULT '',
  steps         JSONB       NOT NULL DEFAULT '[]',
  enrolled_leads INTEGER    NOT NULL DEFAULT 0,
  conversions   INTEGER     NOT NULL DEFAULT 0,
  template_id   VARCHAR(100),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_remarketing_flows_user_id ON remarketing_flows(user_id);
CREATE INDEX IF NOT EXISTS idx_remarketing_flows_status  ON remarketing_flows(status);

-- Auto-update updated_at on any row change
CREATE OR REPLACE FUNCTION update_remarketing_flows_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_remarketing_flows_updated_at ON remarketing_flows;
CREATE TRIGGER trg_remarketing_flows_updated_at
  BEFORE UPDATE ON remarketing_flows
  FOR EACH ROW EXECUTE FUNCTION update_remarketing_flows_updated_at();
