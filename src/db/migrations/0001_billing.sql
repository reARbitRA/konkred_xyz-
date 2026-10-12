-- ─────────────────────────────────────────────────────────────────────────────
-- KONKRED billing schema (migration 0001)
--
-- Apply once against the production database BEFORE deploying the billing
-- code, e.g.:
--
--   psql "$DATABASE_URL" -f src/db/migrations/0001_billing.sql
--
-- Idempotent: every statement uses IF NOT EXISTS, so re-running is safe.
--
-- Invariants this schema enforces at the database level (not in application
-- code, so they hold even under concurrency and process restarts):
--   * accounts.identity is UNIQUE  → one balance per actor, shared by the
--     website and the Telegram bot.
--   * payments.order_id is UNIQUE  → one payment intent per order.
--   * webhook_events.event_id is UNIQUE → a replayed provider callback cannot
--     grant quota twice; the duplicate INSERT simply fails.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS accounts (
  id             SERIAL PRIMARY KEY,
  -- Canonical identity: 'fb:<uid>' | 'telegram:<id>' | 'api:<keyId>' | 'anon:<hash>'
  identity       TEXT NOT NULL UNIQUE,
  plan           TEXT NOT NULL DEFAULT 'free',
  trial_granted  INTEGER NOT NULL DEFAULT 0,
  trial_used     INTEGER NOT NULL DEFAULT 0,
  paid_balance   INTEGER NOT NULL DEFAULT 0,
  daily_used     INTEGER NOT NULL DEFAULT 0,
  daily_reset_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Append-only audit of every allowance change, so any balance can be
-- re-derived and any disputed charge investigated.
CREATE TABLE IF NOT EXISTS usage_ledger (
  id         SERIAL PRIMARY KEY,
  identity   TEXT NOT NULL,
  delta      INTEGER NOT NULL,                     -- negative = spend
  reason     TEXT NOT NULL,                        -- trial|purchase|refund|spend|admin
  surface    TEXT NOT NULL DEFAULT 'system',       -- web|telegram|api|system
  reference  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS usage_ledger_identity_idx ON usage_ledger (identity);
CREATE INDEX IF NOT EXISTS usage_ledger_created_idx  ON usage_ledger (created_at);

CREATE TABLE IF NOT EXISTS plans (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  price_micro_usd BIGINT NOT NULL,                 -- integer money: $1 = 1000000
  messages        INTEGER NOT NULL,
  active          BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS payments (
  id                  SERIAL PRIMARY KEY,
  order_id            TEXT NOT NULL UNIQUE,        -- our id, echoed by the provider
  identity            TEXT NOT NULL,
  plan_id             TEXT NOT NULL,
  price_micro_usd     BIGINT NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'usdttrc20',
  status              TEXT NOT NULL DEFAULT 'pending',
  provider_payment_id TEXT,
  messages            INTEGER NOT NULL,
  granted_at          TIMESTAMPTZ,                 -- set exactly once
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_identity_idx ON payments (identity);
CREATE INDEX IF NOT EXISTS payments_status_idx   ON payments (status);

-- The idempotency guard. The UNIQUE constraint — not application logic — is
-- what makes duplicate provider deliveries safe.
CREATE TABLE IF NOT EXISTS webhook_events (
  id          SERIAL PRIMARY KEY,
  event_id    TEXT NOT NULL UNIQUE,
  provider    TEXT NOT NULL DEFAULT 'nowpayments',
  order_id    TEXT,
  status      TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the catalogue (safe to re-run; prices stay editable in SQL).
INSERT INTO plans (id, name, price_micro_usd, messages, active) VALUES
  ('starter', 'Starter',  5000000,  100, true),
  ('pro',     'Pro',     19000000,  500, true),
  ('agency',  'Agency',  49000000, 2000, true)
ON CONFLICT (id) DO NOTHING;
