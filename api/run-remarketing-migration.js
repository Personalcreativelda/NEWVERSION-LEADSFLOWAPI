/**
 * run-remarketing-migration.js
 * Executa as migrations 019 (remarketing_flows) e 020 (lead_ai_scores)
 * Uso: node run-remarketing-migration.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '..', '..', '..', '..', '..', '.env') });

// Fallback: tenta carregar .env do próprio diretório api/ ou raiz do projeto
const path = require('path');
const fs   = require('fs');

// Detecta onde está o .env
const envPaths = [
  path.join(__dirname, '..', '.env'),
  path.join(__dirname, '..', '..', '.env'),
  path.join(__dirname, '.env'),
];
for (const p of envPaths) {
  if (fs.existsSync(p)) {
    require('dotenv').config({ path: p });
    console.log(`[env] Carregando: ${p}`);
    break;
  }
}

const { Client } = require('pg');

const client = new Client({
  host:     process.env.PG_HOST     || 'localhost',
  port:     parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'postgres',
  user:     process.env.PG_USER     || 'postgres',
  password: process.env.PG_PASSWORD || '',
  ssl:      process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 15000,
});

const MIGRATION_019 = `
-- ============================================================
-- 019: REMARKETING FLOWS
-- ============================================================
CREATE TABLE IF NOT EXISTS remarketing_flows (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  description   TEXT         NOT NULL DEFAULT '',
  status        VARCHAR(20)  NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('active', 'paused', 'draft')),
  trigger_type  VARCHAR(50)  NOT NULL
                  CHECK (trigger_type IN ('funnel_stage', 'tag', 'inactivity', 'purchase', 'lead_score')),
  trigger_label VARCHAR(255) NOT NULL DEFAULT '',
  steps         JSONB        NOT NULL DEFAULT '[]',
  enrolled_leads INTEGER     NOT NULL DEFAULT 0,
  conversions   INTEGER      NOT NULL DEFAULT 0,
  template_id   VARCHAR(100),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_remarketing_flows_user_id ON remarketing_flows(user_id);
CREATE INDEX IF NOT EXISTS idx_remarketing_flows_status  ON remarketing_flows(status);

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
`;

const MIGRATION_020 = `
-- ============================================================
-- 020: AI LEAD SCORES
-- ============================================================
CREATE TABLE IF NOT EXISTS lead_ai_scores (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id                UUID REFERENCES leads(id) ON DELETE CASCADE,
  user_id                UUID REFERENCES users(id) ON DELETE CASCADE,
  engagement_score       INTEGER DEFAULT 0 CHECK (engagement_score BETWEEN 0 AND 100),
  conversion_probability INTEGER DEFAULT 0 CHECK (conversion_probability BETWEEN 0 AND 100),
  intent                 VARCHAR(20) DEFAULT 'unknown' CHECK (intent IN ('buy', 'ignore', 'delay', 'unknown')),
  risk_level             VARCHAR(10) DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high')),
  next_best_action       TEXT,
  recommended_channel    VARCHAR(20) DEFAULT 'whatsapp',
  best_contact_time      VARCHAR(50),
  ai_notes               TEXT,
  last_analyzed_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at             TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at             TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(lead_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_ai_scores_user_id    ON lead_ai_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_lead_ai_scores_engagement  ON lead_ai_scores(user_id, engagement_score DESC);
CREATE INDEX IF NOT EXISTS idx_lead_ai_scores_risk        ON lead_ai_scores(user_id, risk_level);

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
`;

async function run() {
  console.log('\n========================================');
  console.log('  Remarketing Migrations Runner');
  console.log('========================================');
  console.log(`Host:     ${process.env.PG_HOST}:${process.env.PG_PORT}`);
  console.log(`Database: ${process.env.PG_DATABASE}`);
  console.log(`User:     ${process.env.PG_USER}`);
  console.log('');

  try {
    await client.connect();
    console.log('[✓] Conectado ao banco de dados!\n');

    // Migration 019
    console.log('[...] Executando migration 019 — remarketing_flows...');
    await client.query(MIGRATION_019);
    console.log('[✓] Migration 019 concluída — tabela remarketing_flows OK\n');

    // Migration 020
    console.log('[...] Executando migration 020 — lead_ai_scores...');
    await client.query(MIGRATION_020);
    console.log('[✓] Migration 020 concluída — tabela lead_ai_scores OK\n');

    // Verify
    const check = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('remarketing_flows', 'lead_ai_scores')
      ORDER BY table_name
    `);
    console.log('Tabelas criadas/verificadas:');
    check.rows.forEach(r => console.log(`  - ${r.table_name}`));

    console.log('\n========================================');
    console.log('  Migrations executadas com sucesso!');
    console.log('========================================\n');
  } catch (err) {
    console.error('\n[ERRO]', err.message);
    if (err.code === 'ECONNREFUSED') {
      console.error('Não foi possível conectar ao banco. Verifique host/porta.');
    } else if (err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') {
      console.error('Timeout/DNS. O banco pode não estar acessível desta rede.');
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
