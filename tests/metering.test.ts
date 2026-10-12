import { describe, it, expect, beforeEach } from 'vitest';
import { newDb } from 'pg-mem';
import { Billing } from '../server/billing';
import { Meter, paywallBody } from '../server/metering';
import { BILLING_SCHEMA_SQL } from './helpers/billing-schema';
import type { IncomingMessage } from 'node:http';

/**
 * Metering tests.
 *
 * The commercial risk runs both ways, so both directions are asserted:
 * a user must not get unlimited free generations, AND a user must not be
 * charged twice for one generation or charged at all for our failures.
 */

function makePool() {
  const db = newDb();
  db.public.none(BILLING_SCHEMA_SQL);
  const { Pool } = db.adapters.createPg();
  return new Pool();
}

/** Minimal IncomingMessage stand-in carrying just what identify() reads. */
function request(headers: Record<string, string> = {}, ip = '198.51.100.5'): IncomingMessage {
  return { headers, socket: { remoteAddress: ip } } as unknown as IncomingMessage;
}

let billing: Billing;
let meter: Meter;
let pool: ReturnType<typeof makePool>;

beforeEach(() => {
  pool = makePool();
  billing = new Billing(pool as never, { trialMessages: 3 });
  meter = new Meter({
    billing,
    anonSalt: 'salt',
    verifyIdToken: async (token) => (token === 'good' ? 'user-1' : null),
  });
});

describe('identity resolution', () => {
  it('uses the verified Firebase uid when a valid token is present', async () => {
    const decision = await meter.reserve(request({ authorization: 'Bearer good' }));
    expect(decision.identity).toBe('fb:user-1');
  });

  it('falls back to a hashed anonymous identity, never the raw IP', async () => {
    const decision = await meter.reserve(request({}, '203.0.113.44'));
    expect(decision.identity).toMatch(/^anon:[a-f0-9]{32}$/);
    expect(decision.identity).not.toContain('203.0.113.44');
  });

  it('ignores a forged identity header', async () => {
    // Exhaust a victim, then try to spend as them via a header.
    await billing.spend('fb:victim', 3);
    const decision = await meter.reserve(request({ 'x-end-user': 'fb:victim' }));
    expect(decision.identity).not.toBe('fb:victim');
    expect(decision.allowed).toBe(true); // got its own fresh trial
  });

  it('gives different IPs independent trials (but the same IP one trial)', async () => {
    for (let i = 0; i < 3; i += 1) expect((await meter.reserve(request({}, '1.1.1.1'))).allowed).toBe(true);
    expect((await meter.reserve(request({}, '1.1.1.1'))).allowed).toBe(false);
    expect((await meter.reserve(request({}, '2.2.2.2'))).allowed).toBe(true);
  });
});

describe('quota enforcement', () => {
  it('allows exactly the trial allowance, then refuses', async () => {
    const req = request({ authorization: 'Bearer good' });
    for (let i = 0; i < 3; i += 1) expect((await meter.reserve(req)).allowed).toBe(true);

    const blocked = await meter.reserve(req);
    expect(blocked.allowed).toBe(false);
    expect(blocked.balance.totalRemaining).toBe(0);
  });

  it('produces a paywall body pointing at a working upgrade URL', async () => {
    const req = request({ authorization: 'Bearer good' });
    for (let i = 0; i < 3; i += 1) await meter.reserve(req);
    const blocked = await meter.reserve(req);

    const body = paywallBody(blocked.balance);
    expect(body.code).toBe('QUOTA_EXHAUSTED');
    expect(body.upgradeUrl).toBe('/checkout');
    expect(String(body.error)).toMatch(/سهمیه/);
  });

  it('lets a purchase restore service immediately', async () => {
    const req = request({ authorization: 'Bearer good' });
    for (let i = 0; i < 3; i += 1) await meter.reserve(req);
    expect((await meter.reserve(req)).allowed).toBe(false);

    await billing.createPayment({ orderId: 'o1', identity: 'fb:user-1', planId: 'pro', priceMicroUsd: 19_000_000, messages: 50 });
    await billing.grantFromPayment({ eventId: 'e1', orderId: 'o1', identity: 'fb:user-1', messages: 50 });

    expect((await meter.reserve(req)).allowed).toBe(true);
  });
});

describe('no double charging', () => {
  it('charges once when a stream reconnects with the same idempotency key', async () => {
    const req = request({ authorization: 'Bearer good' });
    const first = await meter.reserve(req, 'web', 'gen-abc');
    const retry = await meter.reserve(req, 'web', 'gen-abc');

    expect(first.allowed).toBe(true);
    expect(retry.allowed).toBe(true);
    expect(retry.deduplicated).toBe(true);
    // Only one message consumed despite two reserve() calls.
    expect((await billing.getBalance('fb:user-1')).totalRemaining).toBe(2);
  });

  it('charges separately for genuinely different generations', async () => {
    const req = request({ authorization: 'Bearer good' });
    await meter.reserve(req, 'web', 'gen-1');
    await meter.reserve(req, 'web', 'gen-2');
    expect((await billing.getBalance('fb:user-1')).totalRemaining).toBe(1);
  });

  it('cannot be used to charge a different account', async () => {
    // Same idempotency key, two identities: the key is scoped per identity, so
    // it must not let one user's retry consume or mask another's quota.
    await meter.reserve(request({ authorization: 'Bearer good' }), 'web', 'shared-key');
    await meter.reserve(request({}, '9.9.9.9'), 'web', 'shared-key');
    expect((await billing.getBalance('fb:user-1')).totalRemaining).toBe(2);
  });

  it('refunds when the generation failed, leaving the user whole', async () => {
    const req = request({ authorization: 'Bearer good' });
    const decision = await meter.reserve(req, 'web', 'gen-fail');
    expect((await billing.getBalance('fb:user-1')).totalRemaining).toBe(2);

    await decision.refund?.();
    expect((await billing.getBalance('fb:user-1')).totalRemaining).toBe(3);
  });

  it('records refunds distinguishably in the ledger', async () => {
    const decision = await meter.reserve(request({ authorization: 'Bearer good' }), 'web', 'g');
    await decision.refund?.();
    const rows = await pool.query(`SELECT reason, delta FROM usage_ledger WHERE identity = 'fb:user-1' ORDER BY id`);
    expect(rows.rows.map((r: { reason: string }) => r.reason)).toEqual(['spend', 'refund']);
  });

  it('allows a fresh charge after a refund (retry really retries)', async () => {
    const req = request({ authorization: 'Bearer good' });
    const first = await meter.reserve(req, 'web', 'gen-x');
    await first.refund?.();
    const second = await meter.reserve(req, 'web', 'gen-x');
    expect(second.deduplicated).toBeFalsy();
    expect((await billing.getBalance('fb:user-1')).totalRemaining).toBe(2);
  });
});
