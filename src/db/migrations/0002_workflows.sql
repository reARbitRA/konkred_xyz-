-- ─────────────────────────────────────────────────────────────────────────────
-- KONKRED workflow runner schema (migration 0002)
--
-- Apply after 0001_billing.sql and BEFORE deploying the workflow runner:
--
--   psql "$DATABASE_URL" -f src/db/migrations/0002_workflows.sql
--
-- Idempotent: every statement uses IF NOT EXISTS, so re-running is safe.
-- The application also creates these tables lazily on first use
-- (server/workflow-store.ts → ensureSchema), so a deployment that forgets this
-- step degrades to a slower first request rather than an outage. Running the
-- migration explicitly is still preferred: it keeps DDL out of the request path.
--
-- Invariants enforced by the database, not by application code:
--   * workflow_runs (identity, idempotency_key) is UNIQUE → one logical
--     generation produces exactly one charged result, even when two instances
--     race. The identity is part of the key, so a guessed key can never read
--     another caller's output or be pointed at another caller's balance.
--   * demo_runs is append-only and counted in SQL → the anonymous demo ceiling
--     survives cold starts and cannot be bypassed by spreading requests across
--     serverless instances (the same reason invoice throttling is counted here).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workflow_runs (
  id              SERIAL PRIMARY KEY,
  identity        TEXT NOT NULL,                  -- fb:|telegram:|api:|anon: (server-derived)
  slug            TEXT NOT NULL,                  -- product-manifest slug
  idempotency_key TEXT NOT NULL,                  -- '<slug>:<client key>', scoped server-side
  credits         INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL,                  -- 'ok' only; failures are never stored as replayable
  result          TEXT,                           -- serialised run payload returned on replay
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (identity, idempotency_key)
);
CREATE INDEX IF NOT EXISTS workflow_runs_identity_idx ON workflow_runs (identity);
CREATE INDEX IF NOT EXISTS workflow_runs_created_idx  ON workflow_runs (created_at);

CREATE TABLE IF NOT EXISTS demo_runs (
  id         SERIAL PRIMARY KEY,
  ip_hash    TEXT NOT NULL,                       -- sha256(salt:demo:ip), never the raw address
  slug       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS demo_runs_ip_idx      ON demo_runs (ip_hash);
CREATE INDEX IF NOT EXISTS demo_runs_created_idx ON demo_runs (created_at);
