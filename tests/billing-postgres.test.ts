import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { Billing } from '../server/billing';
import { Payments, PLANS, sortObjectDeep } from '../server/payments';
import { createHmac } from 'node:crypto';
import { BILLING_SCHEMA_SQL } from './helpers/billing-schema';

/**
 * The same billing guarantees, verified against a REAL PostgreSQL server.
 *
 * pg-mem is convenient but it is an emulation: it does not enforce
 * `SELECT ... FOR UPDATE`, and its SQL dialect coverage is partial. Money
 * correctness must not rest on an emulator, so this suite runs the critical
 * paths — concurrent spending and duplicate payment webhooks — against real
 * Postgres, where row locks and UNIQUE constraints behave as in production.
 *
 * Skipped automatically unless TEST_DATABASE_URL is set, so CI without a
 * database still passes (see docs: start one with `pgserver`).
 */
const DSN = process.env.TEST_DATABASE_URL;
const describeIfPg = DSN ? describe : describe.skip;

let pool: Pool;
let billing: Billing;

describeIfPg('billing against real PostgreSQL', () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: DSN, max: 10 });
    await pool.query('DROP TABLE IF EXISTS webhook_events, payments, usage_ledger, plans, accounts CASCADE');
    await pool.query(BILLING_SCHEMA_SQL);
    billing = new Billing(pool, { trialMessages: 10 });
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
  });

  it('enforces the trial limit and then returns 402', async () => {
    const id = 'fb:pg-trial';
    for (let i = 0; i < 10; i += 1) expect((await billing.spend(id)).ok).toBe(true);
    const blocked = await billing.spend(id);
    expect(blocked.status).toBe(402);
  });

  it('SERIALISES concurrent spends under real row locks (no overspend)', async () => {
    const id = 'fb:pg-race';
    await billing.spend(id, 9); // exactly 1 message left

    // 10 genuinely concurrent requests race for the final message. With real
    // FOR UPDATE semantics exactly one may win.
    const results = await Promise.all(Array.from({ length: 10 }, () => billing.spend(id, 1)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await billing.getBalance(id)).totalRemaining).toBe(0);
  });

  it('never double-grants a replayed webhook under real UNIQUE constraints', async () => {
    const id = 'fb:pg-buyer';
    await billing.createPayment({
      orderId: 'pg-ord-1', identity: id, planId: 'pro',
      priceMicroUsd: PLANS.pro.priceMicroUsd, messages: PLANS.pro.messages,
    });

    const deliveries = Array.from({ length: 10 }, () =>
      billing.grantFromPayment({ eventId: 'pg-evt-1', orderId: 'pg-ord-1', identity: id, messages: PLANS.pro.messages }),
    );
    const results = await Promise.all(deliveries);

    expect(results.filter((r) => r.granted)).toHaveLength(1);
    expect((await billing.getBalance(id)).paidRemaining).toBe(PLANS.pro.messages);
  });

  it('keeps the ledger consistent with the balance', async () => {
    const id = 'fb:pg-ledger';
    await billing.spend(id, 3);
    await billing.spend(id, 2);
    const ledger = await pool.query(`SELECT COALESCE(SUM(delta),0) AS total FROM usage_ledger WHERE identity = $1`, [id]);
    expect(Number(ledger.rows[0].total)).toBe(-5);
    expect((await billing.getBalance(id)).totalRemaining).toBe(5);
  });

  it('runs the full purchase journey end to end', async () => {
    const id = 'fb:pg-journey';
    for (let i = 0; i < 10; i += 1) await billing.spend(id);
    expect((await billing.spend(id)).status).toBe(402);

    const payments = new Payments(
      billing,
      { apiKey: 'k', ipnSecret: 'ipn-secret', ipnCallbackUrl: 'https://example.test/cb' },
      (async () => new Response(JSON.stringify({ id: 'inv', invoice_url: 'https://pay.test/inv' }), { status: 200 })) as unknown as typeof fetch,
    );
    const invoice = await payments.createInvoice(id, 'pro');

    const body = {
      payment_id: 5150, payment_status: 'finished', order_id: invoice.orderId,
      price_amount: 19, pay_amount: 19, actually_paid: 19, pay_currency: 'usdttrc20',
      fee: { currency: 'usdttrc20', serviceFee: 0 },
    };
    const signature = createHmac('sha512', 'ipn-secret').update(JSON.stringify(sortObjectDeep(body))).digest('hex');

    expect((await payments.handleWebhook(body, signature)).code).toBe('GRANTED');
    // A duplicate delivery must change nothing.
    await payments.handleWebhook(body, signature);

    const after = await billing.getBalance(id);
    expect(after.paidRemaining).toBe(PLANS.pro.messages);
    expect((await billing.spend(id)).ok).toBe(true);
  });
});
