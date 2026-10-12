/**
 * Billing, identity and metering schema — the SOURCE OF TRUTH.
 *
 * Design rules (from the product brief, enforced by tests/billing.test.ts):
 *
 *  1. PostgreSQL is authoritative for accounts, plans, payments, usage and
 *     grants. Redis may front this for rate limiting, but quota must survive a
 *     process restart, so nothing here may live only in memory.
 *  2. One identity model spans every surface. `accounts.identity` is the
 *     canonical key: `fb:<uid>`, `telegram:<id>`, `api:<keyId>`, `anon:<hash>`.
 *     The website and the Telegram bot therefore read and write the SAME row
 *     and always agree on the remaining balance.
 *  3. Payment webhooks are idempotent. `webhook_events.event_id` is UNIQUE, so
 *     a replayed NowPayments callback can never grant quota twice — the second
 *     INSERT violates the constraint and the grant is skipped.
 *  4. Money and allowances are integers. Amounts are stored in micro-USD
 *     (1_000_000 = $1) to avoid floating-point drift entirely.
 */
import { pgTable, serial, text, boolean, timestamp, integer, bigint, uniqueIndex, index } from 'drizzle-orm/pg-core';

/** Canonical identity prefixes. Anything else is rejected before it reaches SQL. */
export const IDENTITY_PREFIXES = ['fb', 'telegram', 'api', 'anon'] as const;
export type IdentityPrefix = (typeof IDENTITY_PREFIXES)[number];

/**
 * One row per billable actor, keyed by canonical identity.
 *
 * `trialGranted`/`trialUsed` cover the anonymous and free tiers; `paidBalance`
 * holds purchased messages. Spending always drains the trial first so a paid
 * grant is never silently consumed by free usage.
 */
export const accounts = pgTable('accounts', {
  id: serial('id').primaryKey(),
  /** e.g. "fb:abc123", "telegram:98765" — server-generated, never client input. */
  identity: text('identity').notNull(),
  plan: text('plan').default('free').notNull(),
  trialGranted: integer('trial_granted').default(0).notNull(),
  trialUsed: integer('trial_used').default(0).notNull(),
  /** Remaining purchased messages. Decremented on spend, incremented on grant. */
  paidBalance: integer('paid_balance').default(0).notNull(),
  /** Rolling daily counter for the "10 messages per day" free mode. */
  dailyUsed: integer('daily_used').default(0).notNull(),
  dailyResetAt: timestamp('daily_reset_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  identityUnique: uniqueIndex('accounts_identity_unique').on(table.identity),
}));

/**
 * Append-only ledger of every allowance change.
 *
 * Nothing mutates `accounts` without writing a row here, so any balance can be
 * re-derived and disputed charges can be audited. `reason` is one of
 * 'trial' | 'purchase' | 'refund' | 'spend' | 'admin'.
 */
export const usageLedger = pgTable('usage_ledger', {
  id: serial('id').primaryKey(),
  identity: text('identity').notNull(),
  /** Negative for consumption, positive for grants. */
  delta: integer('delta').notNull(),
  reason: text('reason').notNull(),
  /** Surface that caused the change: 'web' | 'telegram' | 'api' | 'system'. */
  surface: text('surface').default('system').notNull(),
  /** Correlates a ledger row with the payment or request that caused it. */
  reference: text('reference'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  identityIdx: index('usage_ledger_identity_idx').on(table.identity),
}));

/** Purchasable plans. Kept in SQL so prices are not hard-coded in the client. */
export const plans = pgTable('plans', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** Micro-USD: $10.00 → 10_000_000. Integer maths only. */
  priceMicroUsd: bigint('price_micro_usd', { mode: 'number' }).notNull(),
  messages: integer('messages').notNull(),
  active: boolean('active').default(true).notNull(),
});

/**
 * A payment intent. Created BEFORE the user is sent to NowPayments so the
 * webhook can be matched back to a known order that we ourselves issued —
 * an unknown order_id is rejected rather than trusted.
 */
export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  /** Our order id; echoed by NowPayments and verified on the way back. */
  orderId: text('order_id').notNull(),
  identity: text('identity').notNull(),
  planId: text('plan_id').notNull(),
  /** Expected amount; the webhook must match it before any grant. */
  priceMicroUsd: bigint('price_micro_usd', { mode: 'number' }).notNull(),
  currency: text('currency').default('usdttrc20').notNull(),
  /** 'pending' | 'confirmed' | 'failed' | 'expired' | 'refunded'. */
  status: text('status').default('pending').notNull(),
  /** NowPayments' own id, recorded once known. */
  providerPaymentId: text('provider_payment_id'),
  messages: integer('messages').notNull(),
  /** Set exactly once, when the allowance is actually credited. */
  grantedAt: timestamp('granted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  orderUnique: uniqueIndex('payments_order_id_unique').on(table.orderId),
  identityIdx: index('payments_identity_idx').on(table.identity),
}));

/**
 * Idempotency guard for provider callbacks.
 *
 * The UNIQUE constraint on `event_id` is the mechanism that makes replay safe:
 * the grant path inserts here FIRST and only credits the account if the insert
 * succeeded. A duplicate delivery loses the race and grants nothing.
 */
export const webhookEvents = pgTable('webhook_events', {
  id: serial('id').primaryKey(),
  /** Stable id derived from the provider payload (payment id + status). */
  eventId: text('event_id').notNull(),
  provider: text('provider').default('nowpayments').notNull(),
  orderId: text('order_id'),
  status: text('status'),
  receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  eventUnique: uniqueIndex('webhook_events_event_id_unique').on(table.eventId),
}));
