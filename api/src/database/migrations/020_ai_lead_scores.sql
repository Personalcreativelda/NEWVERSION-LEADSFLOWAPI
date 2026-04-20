-- Migration 020: AI Lead Scores & Recommendations
-- Stores AI-computed engagement scores, conversion probabilities, and action recommendations

CREATE TABLE IF NOT EXISTS lead_ai_scores (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id               UUID REFERENCES leads(id) ON DELETE CASCADE,
  user_id               UUID REFERENCES users(id) ON DELETE CASCADE,
  engagement_score      INTEGER DEFAULT 0 CHECK (engagement_score BETWEEN 0 AND 100),
  conversion_probability INTEGER DEFAULT 0 CHECK (conversion_probability BETWEEN 0 AND 100),
  intent                VARCHAR(20) DEFAULT 'unknown' CHECK (intent IN ('buy', 'ignore', 'delay', 'unknown')),
  risk_level            VARCHAR(10) DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high')),
  next_best_action      TEXT,
  recommended_channel   VARCHAR(20) DEFAULT 'whatsapp',
  best_contact_time     VARCHAR(50),
  ai_notes              TEXT,
  last_analyzed_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(lead_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_ai_scores_user_id ON lead_ai_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_lead_ai_scores_engagement ON lead_ai_scores(user_id, engagement_score DESC);
CREATE INDEX IF NOT EXISTS idx_lead_ai_scores_risk ON lead_ai_scores(user_id, risk_level);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_lead_ai_scores_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lead_ai_scores_updated_at ON lead_ai_scores;
CREATE TRIGGER trg_lead_ai_scores_updated_at
  BEFORE UPDATE ON lead_ai_scores
  FOR EACH ROW EXECUTE FUNCTION update_lead_ai_scores_updated_at();
