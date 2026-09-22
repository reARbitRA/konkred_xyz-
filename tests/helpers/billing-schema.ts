/**
 * DDL for the billing tables, shared by the billing and payment test suites.
 *
 * Kept in one place so both suites exercise an identical schema, and so it
 * stays visibly in sync with src/db/billing-schema.ts (the Drizzle definition
 * used to generate real migrations).
 */
export const BILLING_SCHEMA_SQL = `
  CREATE TABLE accounts (
    id SERIAL PRIMARY KEY,
    identity TEXT NOT NULL UNIQUE,
    plan TEXT NOT NULL DEFAULT 'free',
    trial_granted INTEGER NOT NULL DEFAULT 0,
    trial_used INTEGER NOT NULL DEFAULT 0,
    paid_balance INTEGER NOT NULL DEFAULT 0,
    daily_used INTEGER NOT NULL DEFAULT 0,
    daily_reset_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE usage_ledger (
    id SERIAL PRIMARY KEY,
    identity TEXT NOT NULL,
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL,
    surface TEXT NOT NULL DEFAULT 'system',
    reference TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    price_micro_usd BIGINT NOT NULL,
    messages INTEGER NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true
  );
  CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    order_id TEXT NOT NULL UNIQUE,
    identity TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    price_micro_usd BIGINT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'usdttrc20',
    status TEXT NOT NULL DEFAULT 'pending',
    provider_payment_id TEXT,
    messages INTEGER NOT NULL,
    granted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE webhook_events (
    id SERIAL PRIMARY KEY,
    event_id TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL DEFAULT 'nowpayments',
    order_id TEXT,
    status TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;
