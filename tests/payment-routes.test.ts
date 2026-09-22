import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHmac } from 'node:crypto';
import { newDb } from 'pg-mem';
import { Billing } from '../server/billing';
import { Payments, PLANS, sortObjectDeep } from '../server/payments';
import { createPaymentRoutes } from '../server/payment-routes';
import { BILLING_SCHEMA_SQL } from './helpers/billing-schema';

/**
 * HTTP-level tests for the quota and payment endpoints, over real TCP.
 *
 * These assert the properties a paying customer and an attacker both care
 * about: identity cannot be forged from the browser, quota is per-identity,
 * secrets never appear in responses, and every failure is a controlled status.
 */

const IPN_SECRET = 'ipn-secret-value';
let server: Server;
let baseUrl: string;
let billing: Billing;
let pool: ReturnType<typeof makePool>;

function makePool() {
  const db = newDb();
  db.public.none(BILLING_SCHEMA_SQL);
  const { Pool } = db.adapters.createPg();
  return new Pool();
}

function sign(payload: unknown): string {
  return createHmac('sha512', IPN_SECRET).update(JSON.stringify(sortObjectDeep(payload))).digest('hex');
}

beforeEach(async () => {
  pool = makePool();
  billing = new Billing(pool as never, { trialMessages: 10 });
  const fakeFetch = (async () =>
    new Response(JSON.stringify({ id: 'inv_1', invoice_url: 'https://nowpayments.io/payment/inv_1' }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;

  const payments = new Payments(
    billing,
    { apiKey: 'np-api-key-secret', ipnSecret: IPN_SECRET, ipnCallbackUrl: 'https://www.konkred.xyz/api/payments/nowpayments/webhook' },
    fakeFetch,
  );

  const routes = createPaymentRoutes({
    billing,
    payments,
    anonSalt: 'test-salt',
    // Accepts only the literal token "good-token" for uid "user1".
    verifyIdToken: async (token) => (token === 'good-token' ? 'user1' : null),
  });

  server = createServer((req, res) => {
    void routes(req, res).then((handled) => {
      if (!handled) { res.statusCode = 404; res.end('{}'); }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const get = (path: string, headers: Record<string, string> = {}) => fetch(`${baseUrl}${path}`, { headers });
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

describe('GET /api/payments/plans', () => {
  it('serves the catalogue with an explicit network warning', async () => {
    const res = await get('/api/payments/plans');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plans).toHaveLength(Object.keys(PLANS).length);
    expect(body.plans[0].network).toBe('TRON (TRC20)');
    expect(body.networkWarning).toContain('شبکه');
  });

  it('exposes no secret material', async () => {
    const raw = await (await get('/api/payments/plans')).text();
    expect(raw).not.toContain('np-api-key-secret');
    expect(raw).not.toContain(IPN_SECRET);
  });
});

describe('GET /api/quota', () => {
  it('gives an anonymous caller the free trial', async () => {
    const body = await (await get('/api/quota')).json();
    expect(body.authenticated).toBe(false);
    expect(body.totalRemaining).toBe(10);
    expect(body.exhausted).toBe(false);
  });

  it('binds quota to the verified Firebase uid when a token is supplied', async () => {
    const body = await (await get('/api/quota', { authorization: 'Bearer good-token' })).json();
    expect(body.authenticated).toBe(true);
  });

  it('IGNORES a forged identity header (quota-bypass defence)', async () => {
    await billing.spend('fb:victim', 10); // victim is exhausted
    const body = await (await get('/api/quota', { 'x-end-user': 'fb:victim' })).json();
    // The header was ignored: this caller got their own anonymous trial.
    expect(body.authenticated).toBe(false);
    expect(body.totalRemaining).toBe(10);
  });

  it('treats an invalid bearer token as anonymous, not as an error', async () => {
    const res = await get('/api/quota', { authorization: 'Bearer forged-token' });
    expect(res.status).toBe(200);
    expect((await res.json()).authenticated).toBe(false);
  });

  it('never returns a raw IP address', async () => {
    const raw = await (await get('/api/quota', { 'x-forwarded-for': '203.0.113.9' })).text();
    expect(raw).not.toContain('203.0.113.9');
  });
});

describe('POST /api/payments/create', () => {
  it('returns a browser-safe invoice', async () => {
    const res = await post('/api/payments/create', { planId: 'pro' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.invoiceUrl).toContain('https://');
    expect(body.orderId).toMatch(/^knk_/);
    expect(body.network).toBe('TRON (TRC20)');
    expect(body.warning).toContain('شبکه');
  });

  it('leaks neither the provider API key nor the IPN secret', async () => {
    const raw = await (await post('/api/payments/create', { planId: 'pro' })).text();
    expect(raw).not.toContain('np-api-key-secret');
    expect(raw).not.toContain(IPN_SECRET);
  });

  it('rejects an unknown plan and a malformed body', async () => {
    expect((await post('/api/payments/create', { planId: 'not-a-plan' })).status).toBe(400);
    const bad = await fetch(`${baseUrl}/api/payments/create`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops',
    });
    expect(bad.status).toBe(400);
  });

  it('rejects an oversized body rather than buffering it', async () => {
    const res = await fetch(`${baseUrl}/api/payments/create`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ planId: 'pro', pad: 'x'.repeat(20_000) }),
    });
    expect(res.status).toBe(413);
  });

  it('rejects GET on a POST-only route', async () => {
    const res = await get('/api/payments/create');
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });
});

describe('POST /api/payments/nowpayments/webhook', () => {
  async function createOrder(headers: Record<string, string> = {}) {
    return (await (await post('/api/payments/create', { planId: 'pro' }, headers)).json()).orderId as string;
  }

  function ipn(orderId: string, over: Record<string, unknown> = {}) {
    return {
      payment_id: 987654321, payment_status: 'finished', order_id: orderId,
      price_amount: 19, price_currency: 'usd', pay_amount: 19, actually_paid: 19,
      pay_currency: 'usdttrc20', fee: { currency: 'usdttrc20', depositFee: 0.1, serviceFee: 0 },
      ...over,
    };
  }

  it('grants quota on a correctly signed callback', async () => {
    const orderId = await createOrder();
    const body = ipn(orderId);
    const res = await post('/api/payments/nowpayments/webhook', body, { 'x-nowpayments-sig': sign(body) });
    expect(res.status).toBe(200);
    expect((await res.json()).code).toBe('GRANTED');
  });

  it('rejects an unsigned callback with 401', async () => {
    const orderId = await createOrder();
    const res = await post('/api/payments/nowpayments/webhook', ipn(orderId));
    expect(res.status).toBe(401);
  });

  it('is idempotent over HTTP: five deliveries grant once', async () => {
    const orderId = await createOrder();
    const body = ipn(orderId);
    const signature = sign(body);
    const codes: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      codes.push((await (await post('/api/payments/nowpayments/webhook', body, { 'x-nowpayments-sig': signature })).json()).code);
    }
    expect(codes.filter((c) => c === 'GRANTED')).toHaveLength(1);
  });

  it('does not echo account state back to the provider', async () => {
    const orderId = await createOrder();
    const body = ipn(orderId);
    const raw = await (await post('/api/payments/nowpayments/webhook', body, { 'x-nowpayments-sig': sign(body) })).text();
    expect(raw).not.toContain('paidRemaining');
    expect(raw).not.toContain('identity');
  });
});

describe('GET /api/payments/status', () => {
  it('returns the order for its owner', async () => {
    const orderId = (await (await post('/api/payments/create', { planId: 'pro' })).json()).orderId;
    const body = await (await get(`/api/payments/status?orderId=${orderId}`)).json();
    expect(body.orderId).toBe(orderId);
    expect(body.status).toBe('pending');
    expect(body.granted).toBe(false);
  });

  it('hides another identity\'s order behind a 404 (no order-id probing)', async () => {
    const orderId = (await (await post('/api/payments/create', { planId: 'pro' }, { authorization: 'Bearer good-token' })).json()).orderId;
    // A different (anonymous) caller must not be able to read it.
    const res = await get(`/api/payments/status?orderId=${orderId}`);
    expect(res.status).toBe(404);
  });

  it('requires an orderId', async () => {
    expect((await get('/api/payments/status')).status).toBe(400);
  });
});

describe('resilience', () => {
  it('returns a controlled 503 when the database is unavailable', async () => {
    // Simulate a dead database: every connection attempt fails, as it would
    // during a Postgres outage or when credentials are wrong.
    (billing as unknown as { pool: { connect: () => Promise<never>; query: () => Promise<never> } }).pool = {
      connect: () => Promise.reject(new Error('ECONNREFUSED 10.0.0.1:5432')),
      query: () => Promise.reject(new Error('ECONNREFUSED 10.0.0.1:5432')),
    };
    const res = await get('/api/quota');
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('BILLING_UNAVAILABLE');
    expect(body.retryable).toBe(true);
    // The user-facing message must be Persian and free of internals.
    expect(body.error).toContain('پرداخت');
    expect(JSON.stringify(body)).not.toMatch(/pg-mem|ECONNREFUSED|stack/i);
  });

  it('falls through unrelated paths so other routing still applies', async () => {
    expect((await get('/api/something-else')).status).toBe(404);
  });
});
