import { describe, it, expect, beforeEach } from 'vitest';
import { newDb } from 'pg-mem';
import { Billing, assertIdentity, anonymousIdentity, IdentityError } from '../server/billing';
import { BILLING_SCHEMA_SQL } from './helpers/billing-schema';

/**
 * Billing engine tests.
 *
 * These run against pg-mem — a real in-process PostgreSQL implementation — not
 * a hand-written mock, so transactions, UNIQUE constraints and SQL semantics
 * are genuinely exercised. Everything the revenue path depends on is asserted
 * here: trial limits, 402 on exhaustion, idempotent grants, and the shared
 * balance between the website and the Telegram bot.
 */

function makePool() {
  const db = newDb();
  db.public.none(BILLING_SCHEMA_SQL);
  const { Pool } = db.adapters.createPg();
  return new Pool();
}

let billing: Billing;
let pool: ReturnType<typeof makePool>;

beforeEach(() => {
  pool = makePool();
  billing = new Billing(pool as never, { trialMessages: 10 });
});

describe('identity', () => {
  it('accepts only canonical, server-generated identities', () => {
    expect(assertIdentity('fb:abc123')).toBe('fb:abc123');
    expect(assertIdentity('telegram:98765')).toBe('telegram:98765');
    expect(assertIdentity('api:key_01')).toBe('api:key_01');
  });

  it('rejects forged or malformed identities (quota-bypass defence)', () => {
    for (const bad of ['', 'abc', 'root', 'fb:', 'sql:drop', "fb:a'; DROP TABLE accounts;--", 'fb:' + 'x'.repeat(200)]) {
      expect(() => assertIdentity(bad)).toThrow(IdentityError);
    }
  });

  it('derives anonymous identities by salted hash, never raw IP', async () => {
    const id = await anonymousIdentity('203.0.113.9', 'server-salt');
    expect(id).toMatch(/^anon:[a-f0-9]{32}$/);
    expect(id).not.toContain('203.0.113.9');
    // Stable for the same input, different across salts (rotatable).
    expect(await anonymousIdentity('203.0.113.9', 'server-salt')).toBe(id);
    expect(await anonymousIdentity('203.0.113.9', 'other-salt')).not.toBe(id);
  });
});

describe('free trial', () => {
  it('seeds a 10-message trial on first sight', async () => {
    const balance = await billing.ensureAccount('anon:abc');
    expect(balance.trialRemaining).toBe(10);
    expect(balance.totalRemaining).toBe(10);
    expect(balance.plan).toBe('free');
  });

  it('spends the trial down to exactly zero', async () => {
    for (let i = 0; i < 10; i += 1) {
      const result = await billing.spend('anon:abc', 1, 'web');
      expect(result.ok).toBe(true);
    }
    expect((await billing.getBalance('anon:abc')).totalRemaining).toBe(0);
  });

  it('returns HTTP 402 once the trial is exhausted', async () => {
    for (let i = 0; i < 10; i += 1) await billing.spend('anon:abc');
    const result = await billing.spend('anon:abc');
    expect(result.ok).toBe(false);
    expect(result.status).toBe(402);
    expect(result.code).toBe('QUOTA_EXHAUSTED');
  });

  it('never lets a spend drive the balance negative', async () => {
    const result = await billing.spend('anon:abc', 25);
    expect(result.ok).toBe(false);
    expect((await billing.getBalance('anon:abc')).totalRemaining).toBe(10);
  });

  it('writes an auditable ledger row for every spend', async () => {
    await billing.spend('fb:u1', 2, 'telegram', 'req-1');
    const rows = await pool.query(`SELECT * FROM usage_ledger WHERE identity = 'fb:u1'`);
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].delta).toBe(-2);
    expect(rows.rows[0].surface).toBe('telegram');
  });
});

describe('payment grants', () => {
  async function order(orderId: string, identity = 'fb:buyer', messages = 500) {
    await billing.createPayment({ orderId, identity, planId: 'pro', priceMicroUsd: 10_000_000, messages });
  }

  it('credits the purchased allowance once a payment is confirmed', async () => {
    await order('ord-1');
    const result = await billing.grantFromPayment({ eventId: 'evt-1', orderId: 'ord-1', identity: 'fb:buyer', messages: 500 });
    expect(result.granted).toBe(true);
    expect(result.balance?.paidRemaining).toBe(500);
    expect(result.balance?.totalRemaining).toBe(510); // 500 paid + 10 trial
  });

  it('IS IDEMPOTENT: a replayed webhook never grants twice', async () => {
    await order('ord-2');
    const first = await billing.grantFromPayment({ eventId: 'evt-2', orderId: 'ord-2', identity: 'fb:buyer', messages: 500 });
    const replay = await billing.grantFromPayment({ eventId: 'evt-2', orderId: 'ord-2', identity: 'fb:buyer', messages: 500 });

    expect(first.granted).toBe(true);
    expect(replay.granted).toBe(false);
    expect(replay.reason).toBe('duplicate_event');
    // The decisive assertion: the balance did NOT double.
    expect((await billing.getBalance('fb:buyer')).paidRemaining).toBe(500);
  });

  it('survives a storm of concurrent duplicate deliveries', async () => {
    await order('ord-3');
    const deliveries = Array.from({ length: 8 }, () =>
      billing.grantFromPayment({ eventId: 'evt-3', orderId: 'ord-3', identity: 'fb:buyer', messages: 500 }),
    );
    const results = await Promise.all(deliveries);
    expect(results.filter((r) => r.granted)).toHaveLength(1);
    expect((await billing.getBalance('fb:buyer')).paidRemaining).toBe(500);
  });

  it('refuses to grant for an order we never created', async () => {
    const result = await billing.grantFromPayment({ eventId: 'evt-x', orderId: 'not-ours', identity: 'fb:buyer', messages: 500 });
    expect(result.granted).toBe(false);
    expect(result.reason).toBe('unknown_order');
    expect((await billing.getBalance('fb:buyer')).paidRemaining).toBe(0);
  });

  it('refuses a second distinct event for an already granted order', async () => {
    await order('ord-4');
    await billing.grantFromPayment({ eventId: 'evt-4a', orderId: 'ord-4', identity: 'fb:buyer', messages: 500 });
    const second = await billing.grantFromPayment({ eventId: 'evt-4b', orderId: 'ord-4', identity: 'fb:buyer', messages: 500 });
    expect(second.granted).toBe(false);
    expect(second.reason).toBe('already_granted');
    expect((await billing.getBalance('fb:buyer')).paidRemaining).toBe(500);
  });

  it('marks the payment confirmed and stamps granted_at exactly once', async () => {
    await order('ord-5');
    await billing.grantFromPayment({ eventId: 'evt-5', orderId: 'ord-5', identity: 'fb:buyer', messages: 500 });
    const payment = await billing.getPayment('ord-5');
    expect(payment?.status).toBe('confirmed');
    expect(payment?.granted_at).toBeTruthy();
  });
});

describe('spend ordering and paywall lifecycle', () => {
  it('drains the free trial before paid balance', async () => {
    await billing.createPayment({ orderId: 'ord-6', identity: 'fb:mix', planId: 'pro', priceMicroUsd: 10_000_000, messages: 100 });
    await billing.grantFromPayment({ eventId: 'evt-6', orderId: 'ord-6', identity: 'fb:mix', messages: 100 });

    await billing.spend('fb:mix', 10); // exactly the trial
    const balance = await billing.getBalance('fb:mix');
    expect(balance.trialRemaining).toBe(0);
    expect(balance.paidRemaining).toBe(100); // untouched
  });

  it('completes the full journey: trial → paywall → purchase → service resumes', async () => {
    const id = 'fb:journey';
    for (let i = 0; i < 10; i += 1) expect((await billing.spend(id)).ok).toBe(true);

    const blocked = await billing.spend(id);
    expect(blocked.status).toBe(402);

    await billing.createPayment({ orderId: 'ord-7', identity: id, planId: 'pro', priceMicroUsd: 10_000_000, messages: 500 });
    await billing.grantFromPayment({ eventId: 'evt-7', orderId: 'ord-7', identity: id, messages: 500 });

    const resumed = await billing.spend(id);
    expect(resumed.ok).toBe(true);
    expect(resumed.balance.paidRemaining).toBe(499);
  });
});

describe('shared quota across surfaces', () => {
  it('website and Telegram bot read and write the SAME balance', async () => {
    const id = 'telegram:12345';
    await billing.spend(id, 3, 'telegram');
    await billing.spend(id, 2, 'web');
    // One identity, one balance — the acceptance criterion for bot/site parity.
    expect((await billing.getBalance(id)).totalRemaining).toBe(5);

    const surfaces = await pool.query(`SELECT surface FROM usage_ledger WHERE identity = $1 ORDER BY id`, [id]);
    expect(surfaces.rows.map((r: { surface: string }) => r.surface)).toEqual(['telegram', 'web']);
  });

  it('keeps separate identities fully isolated', async () => {
    await billing.spend('fb:alice', 10);
    expect((await billing.getBalance('fb:alice')).totalRemaining).toBe(0);
    expect((await billing.getBalance('fb:bob')).totalRemaining).toBe(10);
  });
});

describe('daily free mode', () => {
  it('grants a daily allowance on top of the trial when enabled', async () => {
    const daily = new Billing(pool as never, { trialMessages: 10, dailyFreeMessages: 10, dailyMode: true });
    const balance = await daily.ensureAccount('fb:daily');
    expect(balance.dailyRemaining).toBe(10);
    expect(balance.totalRemaining).toBe(20);
  });

  it('consumes the expiring daily allowance before the trial', async () => {
    const daily = new Billing(pool as never, { trialMessages: 10, dailyFreeMessages: 10, dailyMode: true });
    await daily.spend('fb:daily2', 4);
    const balance = await daily.getBalance('fb:daily2');
    expect(balance.dailyRemaining).toBe(6);
    expect(balance.trialRemaining).toBe(10); // preserved
  });
});

describe('concurrency safety', () => {
  it('cannot be raced into overspending the last message', async () => {
    const id = 'fb:race';
    await billing.spend(id, 9); // 1 left
    const attempts = await Promise.all(Array.from({ length: 6 }, () => billing.spend(id, 1)));
    // Exactly one may succeed; the rest must be paywalled.
    expect(attempts.filter((r) => r.ok)).toHaveLength(1);
    expect((await billing.getBalance(id)).totalRemaining).toBe(0);
  });
});
