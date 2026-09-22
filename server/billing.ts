/**
 * Billing / quota engine (server-only).
 *
 * Every rule the product depends on for revenue lives here, expressed as plain
 * SQL against the pool so it can be exercised against a real engine in tests:
 *
 *   - identity normalisation (never trust the browser)
 *   - trial + daily free allowances
 *   - spending, with HTTP 402 once exhausted
 *   - idempotent payment grants (a replayed webhook grants nothing)
 *   - a single balance shared by the website and the Telegram bot
 *
 * Concurrency: spend and grant both run inside a transaction and take a row
 * lock (`SELECT ... FOR UPDATE`) on the account, so two simultaneous requests
 * cannot both pass the "is there quota left?" check and overspend.
 */
import type { Pool, PoolClient } from 'pg';

export const TRIAL_MESSAGES_DEFAULT = 10;
export const DAILY_FREE_MESSAGES_DEFAULT = 10;

export type Surface = 'web' | 'telegram' | 'api' | 'system';

export interface BillingOptions {
  trialMessages?: number;
  dailyFreeMessages?: number;
  /** Enables the "10 per day for verified free users" mode. */
  dailyMode?: boolean;
  now?: () => Date;
}

export interface Balance {
  identity: string;
  plan: string;
  trialRemaining: number;
  paidRemaining: number;
  dailyRemaining: number | null;
  /** Total messages the caller may still send right now. */
  totalRemaining: number;
}

export interface SpendResult {
  ok: boolean;
  /** Present when ok === false: the HTTP status the caller should return. */
  status?: 402;
  code?: 'QUOTA_EXHAUSTED';
  balance: Balance;
}

/** Thrown for malformed identities so they can never reach SQL. */
export class IdentityError extends Error {}

const IDENTITY_RE = /^(fb|telegram|api|anon):[A-Za-z0-9_.:-]{1,128}$/;

/**
 * Validate a canonical identity.
 *
 * SECURITY: identities are always derived server-side — from a verified
 * Firebase token, the Telegram update, a registered API key, or a hashed
 * IP/device fallback. A client-supplied `x-end-user` header must never reach
 * this function unvalidated, otherwise a caller could impersonate another
 * account (or mint unlimited anonymous ones) to bypass quota.
 */
export function assertIdentity(identity: string): string {
  if (typeof identity !== 'string' || !IDENTITY_RE.test(identity)) {
    throw new IdentityError('Invalid identity.');
  }
  return identity;
}

/** Build an anonymous identity from an IP/device fingerprint (never raw PII). */
export async function anonymousIdentity(seed: string, salt: string): Promise<string> {
  const { createHash } = await import('node:crypto');
  const digest = createHash('sha256').update(`${salt}:${seed}`).digest('hex').slice(0, 32);
  return `anon:${digest}`;
}

function startOfNextUtcDay(now: Date): Date {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next;
}

export class Billing {
  private readonly trialMessages: number;
  private readonly dailyFreeMessages: number;
  private readonly dailyMode: boolean;
  private readonly now: () => Date;

  constructor(private readonly pool: Pool, options: BillingOptions = {}) {
    this.trialMessages = options.trialMessages ?? TRIAL_MESSAGES_DEFAULT;
    this.dailyFreeMessages = options.dailyFreeMessages ?? DAILY_FREE_MESSAGES_DEFAULT;
    this.dailyMode = options.dailyMode ?? false;
    this.now = options.now ?? (() => new Date());
  }

  /** Create the account on first sight, seeding the trial allowance. */
  async ensureAccount(identity: string): Promise<Balance> {
    assertIdentity(identity);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const row = await this.lockAccount(client, identity);
      await client.query('COMMIT');
      return this.toBalance(row);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async getBalance(identity: string): Promise<Balance> {
    return this.ensureAccount(identity);
  }

  /**
   * Consume `amount` messages.
   *
   * Trial allowance is drained before paid balance so that buying a plan never
   * silently absorbs usage the user was entitled to for free. Returns a 402
   * signal instead of throwing, because exhaustion is an expected state that
   * the UI turns into a paywall.
   */
  async spend(identity: string, amount = 1, surface: Surface = 'web', reference?: string): Promise<SpendResult> {
    assertIdentity(identity);
    if (!Number.isInteger(amount) || amount < 1) throw new Error('amount must be a positive integer');

    // Retry the compare-and-set a bounded number of times. Each attempt re-reads
    // the account, so a loser in a concurrent race re-evaluates against the new
    // balance and is correctly paywalled if the quota has since run out.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = await this.trySpend(identity, amount, surface, reference);
      if (result) return result;
    }
    // Sustained contention: refuse rather than risk an incorrect charge.
    return { ok: false, status: 402, code: 'QUOTA_EXHAUSTED', balance: await this.getBalance(identity) };
  }

  private async trySpend(identity: string, amount: number, surface: Surface, reference?: string): Promise<SpendResult | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const row = await this.lockAccount(client, identity);
      const balance = this.toBalance(row);

      if (balance.totalRemaining < amount) {
        await client.query('COMMIT');
        return { ok: false, status: 402, code: 'QUOTA_EXHAUSTED', balance };
      }

      let left = amount;
      let trialUsed = row.trial_used;
      let paidBalance = row.paid_balance;
      let dailyUsed = row.daily_used;

      // Daily free allowance first (it expires anyway), then trial, then paid.
      if (this.dailyMode && balance.dailyRemaining !== null) {
        const take = Math.min(left, balance.dailyRemaining);
        dailyUsed += take;
        left -= take;
      }
      const trialTake = Math.min(left, Math.max(0, row.trial_granted - trialUsed));
      trialUsed += trialTake;
      left -= trialTake;
      paidBalance -= left; // guarded by the totalRemaining check above

      // Compare-and-set: the UPDATE only applies if the counters still hold the
      // values this decision was based on. Combined with the row lock above
      // this is belt-and-braces — the lock serialises writers on PostgreSQL,
      // and the CAS guard means that even under a weaker isolation level (or a
      // engine that ignores FOR UPDATE) a lost update degrades into "no rows
      // affected" and a retry, never into overspending.
      const applied = await client.query(
        `UPDATE accounts
            SET trial_used = $2, paid_balance = $3, daily_used = $4,
                daily_reset_at = $5, updated_at = now()
          WHERE identity = $1
            AND trial_used = $6 AND paid_balance = $7 AND daily_used = $8`,
        [identity, trialUsed, paidBalance, dailyUsed, row.daily_reset_at, row.trial_used, row.paid_balance, row.daily_used],
      );
      if (applied.rowCount === 0) {
        // Someone else spent concurrently. Abandon this attempt and signal the
        // caller's retry loop rather than writing a balance computed from stale
        // state (which is how double-spends happen).
        await client.query('ROLLBACK').catch(() => undefined);
        return null;
      }
      await client.query(
        `INSERT INTO usage_ledger (identity, delta, reason, surface, reference)
         VALUES ($1, $2, 'spend', $3, $4)`,
        [identity, -amount, surface, reference ?? null],
      );
      await client.query('COMMIT');

      const updated = await this.readAccount(identity);
      return { ok: true, balance: this.toBalance(updated) };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Credit a purchased allowance exactly once.
   *
   * `eventId` is the idempotency key. The INSERT into `webhook_events` happens
   * first: if it violates the UNIQUE constraint the delivery is a replay and we
   * return `{granted:false}` having changed nothing. This is what makes
   * "the same payment event must never grant quota twice" true even under
   * concurrent duplicate deliveries, because the database — not application
   * code — arbitrates the race.
   */
  async grantFromPayment(params: {
    eventId: string;
    orderId: string;
    identity: string;
    messages: number;
    provider?: string;
    status?: string;
  }): Promise<{ granted: boolean; reason?: string; balance?: Balance }> {
    const { eventId, orderId, identity, messages } = params;
    assertIdentity(identity);
    if (!Number.isInteger(messages) || messages < 1) throw new Error('messages must be a positive integer');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      try {
        await client.query(
          `INSERT INTO webhook_events (event_id, provider, order_id, status)
           VALUES ($1, $2, $3, $4)`,
          [eventId, params.provider ?? 'nowpayments', orderId, params.status ?? 'finished'],
        );
      } catch (error) {
        // Unique violation → this exact event was already processed.
        await client.query('ROLLBACK').catch(() => undefined);
        if (isUniqueViolation(error)) {
          return { granted: false, reason: 'duplicate_event', balance: await this.getBalance(identity) };
        }
        throw error;
      }

      // Only credit a payment we ourselves created and have not yet granted.
      const payment = await client.query(
        `SELECT id, status, granted_at, plan_id, identity FROM payments WHERE order_id = $1 FOR UPDATE`,
        [orderId],
      );
      if (payment.rowCount === 0) {
        await client.query('ROLLBACK').catch(() => undefined);
        return { granted: false, reason: 'unknown_order' };
      }
      if (payment.rows[0].granted_at) {
        await client.query('ROLLBACK').catch(() => undefined);
        return { granted: false, reason: 'already_granted', balance: await this.getBalance(identity) };
      }
      // The order must belong to the identity being credited, so a webhook can
      // never be used to top up somebody else's account.
      if (payment.rows[0].identity !== identity) {
        await client.query('ROLLBACK').catch(() => undefined);
        return { granted: false, reason: 'identity_mismatch' };
      }

      await this.lockAccount(client, identity);
      // Credit the allowance and move the account onto the purchased plan.
      // (The previous COALESCE/NULLIF form was both unsupported by some engines
      // and logically inert — it could never actually upgrade a 'free' plan.)
      await client.query(
        `UPDATE accounts SET paid_balance = paid_balance + $2, plan = $3, updated_at = now()
          WHERE identity = $1`,
        [identity, messages, String(payment.rows[0].plan_id)],
      );
      await client.query(
        `UPDATE payments SET status = 'confirmed', granted_at = now(), updated_at = now() WHERE order_id = $1`,
        [orderId],
      );
      await client.query(
        `INSERT INTO usage_ledger (identity, delta, reason, surface, reference)
         VALUES ($1, $2, 'purchase', 'system', $3)`,
        [identity, messages, orderId],
      );
      await client.query('COMMIT');
      return { granted: true, balance: await this.getBalance(identity) };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /** Record a payment intent before redirecting the user to the provider. */
  async createPayment(params: {
    orderId: string;
    identity: string;
    planId: string;
    priceMicroUsd: number;
    messages: number;
    currency?: string;
  }): Promise<void> {
    assertIdentity(params.identity);
    await this.pool.query(
      `INSERT INTO payments (order_id, identity, plan_id, price_micro_usd, messages, currency, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
      [params.orderId, params.identity, params.planId, params.priceMicroUsd, params.messages, params.currency ?? 'usdttrc20'],
    );
  }

  async getPayment(orderId: string): Promise<Record<string, unknown> | null> {
    const result = await this.pool.query(`SELECT * FROM payments WHERE order_id = $1`, [orderId]);
    return result.rowCount ? (result.rows[0] as Record<string, unknown>) : null;
  }

  // ── internals ─────────────────────────────────────────────────────────────

  /** Lock (creating if needed) the account row, applying any daily reset. */
  private async lockAccount(client: PoolClient, identity: string): Promise<AccountRow> {
    await client.query(
      `INSERT INTO accounts (identity, plan, trial_granted, trial_used, paid_balance, daily_used, daily_reset_at)
       VALUES ($1, 'free', $2, 0, 0, 0, $3)
       ON CONFLICT (identity) DO NOTHING`,
      [identity, this.trialMessages, startOfNextUtcDay(this.now())],
    );
    const result = await client.query(`SELECT * FROM accounts WHERE identity = $1 FOR UPDATE`, [identity]);
    const row = result.rows[0] as AccountRow;

    // Roll the daily window forward if it has expired.
    const resetAt = row.daily_reset_at ? new Date(row.daily_reset_at) : null;
    if (this.dailyMode && (!resetAt || resetAt.getTime() <= this.now().getTime())) {
      const next = startOfNextUtcDay(this.now());
      await client.query(`UPDATE accounts SET daily_used = 0, daily_reset_at = $2 WHERE identity = $1`, [identity, next]);
      row.daily_used = 0;
      row.daily_reset_at = next.toISOString();
    }
    return row;
  }

  private async readAccount(identity: string): Promise<AccountRow> {
    const result = await this.pool.query(`SELECT * FROM accounts WHERE identity = $1`, [identity]);
    return result.rows[0] as AccountRow;
  }

  private toBalance(row: AccountRow): Balance {
    const trialRemaining = Math.max(0, Number(row.trial_granted) - Number(row.trial_used));
    const paidRemaining = Math.max(0, Number(row.paid_balance));
    const dailyRemaining = this.dailyMode ? Math.max(0, this.dailyFreeMessages - Number(row.daily_used)) : null;
    return {
      identity: row.identity,
      plan: row.plan,
      trialRemaining,
      paidRemaining,
      dailyRemaining,
      totalRemaining: trialRemaining + paidRemaining + (dailyRemaining ?? 0),
    };
  }
}

interface AccountRow {
  identity: string;
  plan: string;
  trial_granted: number;
  trial_used: number;
  paid_balance: number;
  daily_used: number;
  daily_reset_at: string | null;
}

function isUniqueViolation(error: unknown): boolean {
  // 23505 = unique_violation (PostgreSQL); pg-mem reports the same class.
  const code = (error as { code?: string })?.code;
  if (code === '23505') return true;
  return /unique|duplicate/i.test((error as Error)?.message || '');
}
