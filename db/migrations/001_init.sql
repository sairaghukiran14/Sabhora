-- Pitch Panchayat, first Postgres schema. Applied by `npm run db:migrate` (in web/).
-- Never edit a migration that has been applied: add 002_*.sql instead.
--
-- public.*   owned by the web app (accounts, sessions, runs, credits)
-- engine.*   owned by the FastAPI engine (saved debates)
--
-- Times in public.* are milliseconds since 1970 (BIGINT), matching what the app passes around.

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  tier          TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'deep')),
  role          TEXT NOT NULL DEFAULT '',
  company       TEXT NOT NULL DEFAULT '',
  city          TEXT NOT NULL DEFAULT '',
  bio           TEXT NOT NULL DEFAULT '',
  prefs         JSONB NOT NULL DEFAULT '{}',
  created_at    BIGINT NOT NULL
);

CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  user_agent  TEXT NOT NULL DEFAULT '',
  expires_at  BIGINT NOT NULL,
  created_at  BIGINT NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE password_resets (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  BIGINT NOT NULL,
  used        BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX password_resets_user ON password_resets(user_id);

CREATE TABLE runs (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode        TEXT NOT NULL CHECK (mode IN ('sharks', 'janta', 'roast')),
  title       TEXT NOT NULL,
  input       JSONB NOT NULL,
  panel_size  INTEGER,
  status      TEXT NOT NULL CHECK (status IN ('running', 'done', 'failed')),
  score       DOUBLE PRECISION,
  result      JSONB NOT NULL DEFAULT '[]', -- the run's event list once it finishes
  cost        INTEGER NOT NULL CHECK (cost >= 0),
  share_id    TEXT NOT NULL UNIQUE,
  is_public   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  BIGINT NOT NULL,
  backend_id  TEXT,                        -- the engine's debate id
  metric      TEXT,                        -- Janta headline number
  error       TEXT,
  demo        BOOLEAN NOT NULL DEFAULT FALSE -- produced by the offline placeholder provider
);
CREATE INDEX runs_user ON runs(user_id, created_at DESC);
CREATE INDEX runs_running ON runs(user_id) WHERE status = 'running';

-- Append-only: a balance is always SUM(delta). The unique key stops a double charge or refund.
CREATE TABLE credit_ledger (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta           INTEGER NOT NULL,
  kind            TEXT NOT NULL,
  run_id          TEXT, -- no foreign key: the money history outlives a deleted run
  note            TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT UNIQUE,
  created_at      BIGINT NOT NULL
);
CREATE INDEX ledger_user ON credit_ledger(user_id, created_at DESC);

CREATE TABLE byok_keys (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider    TEXT NOT NULL,
  ciphertext  TEXT NOT NULL,
  last4       TEXT NOT NULL,
  created_at  BIGINT NOT NULL,
  UNIQUE (user_id, provider)
);

-- Engine copies of deleted runs that still need erasing.
CREATE TABLE engine_deletions (
  backend_id TEXT PRIMARY KEY
);

CREATE SCHEMA engine;

CREATE TABLE engine.debates (
  id         TEXT PRIMARY KEY CHECK (id ~ '^[a-f0-9]{12}$'),
  mode       TEXT NOT NULL,
  snapshot   JSONB NOT NULL, -- {id, mode, request, events, finished}
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX debates_created ON engine.debates(created_at DESC);
