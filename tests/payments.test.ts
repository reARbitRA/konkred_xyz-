import { describe, it, expect, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { newDb } from 'pg-mem';
import { Billing } from '../server/billing';
import { Payments, PLANS, sortObjectDeep, verifyIpnSignature, TRON_USDT_ADDRESS_DEFAULT } from '../server/payments';
import { BILLING_SCHEMA_SQL } from './helpers/billing-schema';

/**
 * Payment security tests.
 *
 * The threat model is explicit: an attacker who can POST to the public webhook
 * endpoint must not be able to mint quota — by forging a signature, replaying a
 * real callback, underpaying, or pointing a valid event at someone else's
 * account.
 */

const IPN_SECRET = 'ipn-secret-value-for-tests';

function sign(payload: unknown, secret = IPN_SECRET): string {
  return createHmac('sha512', secret).update(JSON.stringify(sortObjectDeep(payload))).digest('hex');
}

function makePool() {
  const db = newDb();
  db.public.none(BILLING_SCHEMA_SQL);
  const { Pool } = db.adapters.createPg();
  return new Pool();
}

let billing: Billing;
let payments: Payments;
let pool: ReturnType<typeof makePool>;
let invoiceCalls: Array<{ url: string; body: Record<string, unknown> }>;

beforeEach(() => {
  pool = makePool();
  billing = new Billing(pool as never, { trialMessages: 10 });
  invoiceCalls = [];
  const fakeFetch = (async (url: string, init?: RequestInit) => {
    invoiceCalls.push({ url: String(url), body: JSON.parse(String(init?.body || '{}')) });
    return new Response(JSON.stringify({ id: 'inv_1', invoice_url: 'https://nowpayments.io/payment/inv_1' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  payments = new Payments(
    billing,
    { apiKey: 'np-api-key', ipnSecret: IPN_SECRET, ipnCallbackUrl: 'https://www.konkred.xyz/api/payments/nowpayments/webhook' },
    fakeFetch,
  );
});

/** A realistic NowPayments IPN body, including the nested `fee` object. */
function ipnBody(over: Record<string, unknown> = {}) {
  return {
    payment_id: 123456789,
    invoice_id: 'inv_1',
    payment_status: 'finished',
    pay_address: TRON_USDT_ADDRESS_DEFAULT,
    price_amount: 19,
    price_currency: 'usd',
    pay_amount: 19,
    actually_paid: 19,
    pay_currency: 'usdttrc20',
    order_id: 'ord-1',
    outcome_amount: 18.9,
    outcome_currency: 'usdttrc20',
    fee: { currency: 'usdttrc20', depositFee: 0.1, withdrawalFee: 0, serviceFee: 0 },
    ...over,
  };
}

async function seedOrder(orderId = 'ord-1', identity = 'fb:buyer', planId = 'pro') {
  const plan = PLANS[planId];
  await billing.createPayment({
    orderId, identity, planId: plan.id, priceMicroUsd: plan.priceMicroUsd, messages: plan.messages,
  });
}

describe('signature verification', () => {
  it('sorts nested objects recursively (the classic integration bug)', () => {
    const sorted = sortObjectDeep({ b: 1, a: { z: 1, y: 2 } }) as Record<string, unknown>;
    expect(Object.keys(sorted)).toEqual(['a', 'b']);
    expect(Object.keys(sorted.a as object)).toEqual(['y', 'z']);
  });

  it('accepts a correctly signed payload', () => {
    const body = ipnBody();
    expect(verifyIpnSignature(body, sign(body), IPN_SECRET)).toBe(true);
  });

  it('rejects a forged signature, a wrong secret, and a missing header', () => {
    const body = ipnBody();
    expect(verifyIpnSignature(body, 'deadbeef', IPN_SECRET)).toBe(false);
    expect(verifyIpnSignature(body, sign(body, 'attacker-secret'), IPN_SECRET)).toBe(false);
    expect(verifyIpnSignature(body, undefined, IPN_SECRET)).toBe(false);
    expect(verifyIpnSignature(body, '', IPN_SECRET)).toBe(false);
  });

  it('rejects a payload tampered with after signing', () => {
    const body = ipnBody();
    const signature = sign(body);
    const tampered = { ...body, price_amount: 1 }; // attacker lowers the price
    expect(verifyIpnSignature(tampered, signature, IPN_SECRET)).toBe(false);
  });

  it('is not fooled by key reordering (signature is order-independent)', () => {
    const body = ipnBody();
    const reordered = Object.fromEntries(Object.entries(body).reverse());
    expect(verifyIpnSignature(reordered, sign(body), IPN_SECRET)).toBe(true);
  });
});

describe('invoice creation', () => {
  it('records the order locally BEFORE returning an invoice', async () => {
    const invoice = await payments.createInvoice('fb:buyer', 'pro');
    const stored = await billing.getPayment(invoice.orderId);
    expect(stored).toBeTruthy();
    expect(stored?.status).toBe('pending');
    expect(Number(stored?.messages)).toBe(PLANS.pro.messages);
  });

  it('returns only browser-safe fields (no API key, no IPN secret)', async () => {
    const invoice = await payments.createInvoice('fb:buyer', 'pro');
    const serialised = JSON.stringify(invoice);
    expect(serialised).not.toContain('np-api-key');
    expect(serialised).not.toContain(IPN_SECRET);
    expect(invoice.invoiceUrl).toContain('https://');
    expect(invoice.network).toBe('TRON (TRC20)');
  });

  it('sends the IPN callback URL and our own order id to the provider', async () => {
    const invoice = await payments.createInvoice('fb:buyer', 'starter');
    expect(invoiceCalls[0].body.ipn_callback_url).toBe('https://www.konkred.xyz/api/payments/nowpayments/webhook');
    expect(invoiceCalls[0].body.order_id).toBe(invoice.orderId);
    expect(invoiceCalls[0].body.price_amount).toBe(5);
  });

  it('rejects an unknown plan', async () => {
    await expect(payments.createInvoice('fb:buyer', 'free-forever')).rejects.toThrow('UNKNOWN_PLAN');
  });
});

describe('webhook → quota grant', () => {
  it('grants the plan allowance on a signed, finished payment', async () => {
    await seedOrder();
    const body = ipnBody();
    const result = await payments.handleWebhook(body, sign(body));
    expect(result.status).toBe(200);
    expect(result.code).toBe('GRANTED');
    expect((await billing.getBalance('fb:buyer')).paidRemaining).toBe(PLANS.pro.messages);
  });

  it('REJECTS an unsigned callback without touching the balance', async () => {
    await seedOrder();
    const result = await payments.handleWebhook(ipnBody(), undefined);
    expect(result.status).toBe(401);
    expect(result.code).toBe('INVALID_SIGNATURE');
    expect((await billing.getBalance('fb:buyer')).paidRemaining).toBe(0);
  });

  it('REJECTS a forged callback (the core attack)', async () => {
    await seedOrder();
    const body = ipnBody();
    const result = await payments.handleWebhook(body, sign(body, 'attacker-guess'));
    expect(result.status).toBe(401);
    expect((await billing.getBalance('fb:buyer')).paidRemaining).toBe(0);
  });

  it('IS REPLAY-SAFE: the same event delivered 5 times grants once', async () => {
    await seedOrder();
    const body = ipnBody();
    const signature = sign(body);
    const results = [];
    for (let i = 0; i < 5; i += 1) results.push(await payments.handleWebhook(body, signature));

    expect(results.filter((r) => r.code === 'GRANTED')).toHaveLength(1);
    // Every retry still answers 2xx so the provider stops retrying.
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect((await billing.getBalance('fb:buyer')).paidRemaining).toBe(PLANS.pro.messages);
  });

  it('is replay-safe under concurrent duplicate delivery', async () => {
    await seedOrder();
    const body = ipnBody();
    const signature = sign(body);
    const results = await Promise.all(Array.from({ length: 6 }, () => payments.handleWebhook(body, signature)));
    expect(results.filter((r) => r.granted)).toHaveLength(1);
    expect((await billing.getBalance('fb:buyer')).paidRemaining).toBe(PLANS.pro.messages);
  });

  it('refuses an order the server never created', async () => {
    const body = ipnBody({ order_id: 'ord-not-ours' });
    const result = await payments.handleWebhook(body, sign(body));
    expect(result.status).toBe(404);
    expect(result.code).toBe('UNKNOWN_ORDER');
  });

  it('does not grant on pending states, then grants once finished', async () => {
    await seedOrder();
    for (const status of ['waiting', 'confirming', 'sending']) {
      const body = ipnBody({ payment_status: status });
      const result = await payments.handleWebhook(body, sign(body));
      expect(result.code).toBe('ACKNOWLEDGED_PENDING');
    }
    expect((await billing.getBalance('fb:buyer')).paidRemaining).toBe(0);

    const done = ipnBody({ payment_status: 'finished' });
    expect((await payments.handleWebhook(done, sign(done))).code).toBe('GRANTED');
    expect((await billing.getBalance('fb:buyer')).paidRemaining).toBe(PLANS.pro.messages);
  });

  it('never grants on failed, expired or refunded payments', async () => {
    await seedOrder();
    for (const status of ['failed', 'expired', 'refunded']) {
      const body = ipnBody({ payment_status: status });
      const result = await payments.handleWebhook(body, sign(body));
      expect(result.status).toBe(200);
      expect(result.granted).toBeFalsy();
    }
    expect((await billing.getBalance('fb:buyer')).paidRemaining).toBe(0);
  });

  it('rejects an underpayment instead of unlocking the full plan', async () => {
    await seedOrder();
    const body = ipnBody({ price_amount: 1, actually_paid: 1, pay_amount: 19 });
    const result = await payments.handleWebhook(body, sign(body));
    expect(result.code).toBe('UNDERPAID');
    expect((await billing.getBalance('fb:buyer')).paidRemaining).toBe(0);
  });

  it('credits the buyer who owns the order, never the attacker', async () => {
    await seedOrder('ord-victim', 'fb:victim');
    const body = ipnBody({ order_id: 'ord-victim' });
    await payments.handleWebhook(body, sign(body));
    // The grant follows the stored order's identity, not anything in the body.
    expect((await billing.getBalance('fb:victim')).paidRemaining).toBe(PLANS.pro.messages);
    expect((await billing.getBalance('fb:attacker')).paidRemaining).toBe(0);
  });

  it('a purchase clears the paywall end to end', async () => {
    const id = 'fb:paywall';
    for (let i = 0; i < 10; i += 1) await billing.spend(id);
    expect((await billing.spend(id)).status).toBe(402);

    await seedOrder('ord-pw', id);
    const body = ipnBody({ order_id: 'ord-pw' });
    await payments.handleWebhook(body, sign(body));

    const after = await billing.spend(id);
    expect(after.ok).toBe(true);
  });
});

describe('configuration safety', () => {
  it('refuses to process webhooks when payments are not configured', async () => {
    const unconfigured = new Payments(billing, { apiKey: '', ipnSecret: '', ipnCallbackUrl: '' });
    const result = await unconfigured.handleWebhook(ipnBody(), 'anything');
    expect(result.status).toBe(503);
    expect(result.code).toBe('PAYMENTS_NOT_CONFIGURED');
  });
});
