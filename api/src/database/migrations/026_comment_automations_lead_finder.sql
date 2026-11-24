-- Comentário → mensagem privada (Instagram e Facebook)
-- Uma regra por canal: quem comenta (com uma das palavras, ou qualquer comentário) recebe a
-- mensagem privada, opcionalmente uma resposta pública, e entra como lead.
CREATE TABLE IF NOT EXISTS comment_automations (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id   UUID         NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  name         VARCHAR(120) NOT NULL DEFAULT '',
  enabled      BOOLEAN      NOT NULL DEFAULT TRUE,
  keywords     TEXT[]       NOT NULL DEFAULT '{}',
  post_ids     TEXT[]       NOT NULL DEFAULT '{}',
  dm_message   TEXT         NOT NULL,
  public_reply TEXT,
  tag          VARCHAR(60),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comment_automations_user    ON comment_automations(user_id);
CREATE INDEX IF NOT EXISTS idx_comment_automations_channel ON comment_automations(channel_id) WHERE enabled;

-- Cada comentário só recebe uma resposta privada (regra da Meta); o UNIQUE evita repetir
-- quando a Meta reenvia o mesmo evento.
CREATE TABLE IF NOT EXISTS comment_replies (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id     VARCHAR(100) NOT NULL UNIQUE,
  automation_id  UUID         REFERENCES comment_automations(id) ON DELETE SET NULL,
  user_id        UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id     UUID         REFERENCES channels(id) ON DELETE CASCADE,
  platform       VARCHAR(20)  NOT NULL,
  commenter_id   VARCHAR(100),
  commenter_name VARCHAR(255),
  comment_text   TEXT,
  lead_id        UUID         REFERENCES leads(id) ON DELETE SET NULL,
  status         VARCHAR(20)  NOT NULL DEFAULT 'pending',
  error          TEXT,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comment_replies_user ON comment_replies(user_id, created_at DESC);

-- Encontrar leads (Google Maps): cada pesquisa conta para o limite mensal do plano
CREATE TABLE IF NOT EXISTS lead_searches (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query      TEXT        NOT NULL,
  location   TEXT,
  results    INT         NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lead_searches_user ON lead_searches(user_id, created_at DESC);
