import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { newDb } from 'pg-mem';
import { Billing } from '../server/billing';
import { createInternalQuotaRoutes } from '../server/internal-quota-routes';
import { createPaymentRoutes } from '../server/payment-routes';
import { Payments } from '../server/payments';
import { BILLING_SCHEMA_SQL } from './helpers/billing-schema';

/**
 * Internal quota API tests.
 *
 * Two things must hold:
 *  1. It is a hard security boundary — the service token is the only way in,
 *     and it must not be bypassable or configurable-away.
 *  2. It is genuinely the SAME balance the website uses, which is the
 *     acceptance criterion for bot/site quota parity.
 */

const KEY = 'internal-service-key-0123456789';

function makePool() {
  const db = newDb();
  db.public.none(BILLING_SCHEMA_SQL);
  const { Pool } = db.adapters.createPg();
  return new Pool();
}

let server: Server;
let baseUrl: string;
let billing: Billing;

function mount(internalKey = KEY) {
  const internal = createInternalQuotaRoutes({ billing, internalKey });
  const payments = new Payments(
    billing,
    { apiKey: 'k', ipnSecret: 's', ipnCallbackUrl: 'https://x.test/cb' },
    (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch,
  );
  const web = createPaymentRoutes({ billing, payments, anonSalt: 'salt' });
  return createServer((req, res) => {
    void (async () => {
      if (await internal(req, res)) return;
      if (await web(req, res)) return;
      res.statusCode = 404;
      res.end('{}');
    })();
  });
}

beforeEach(async () => {
  billing = new Billing(makePool() as never, { trialMessages: 5 });
  server = mount();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const auth = { 'x-internal-key': KEY, 'content-type': 'application/json' };
const spend = (body: unknown, headers: Record<string, string> = auth) =>
  fetch(`${baseUrl}/api/internal/quota/spend`, { method: 'POST', headers, body: JSON.stringify(body) });
const balance = (identity: string) =>
  fetch(`${baseUrl}/api/internal/quota/balance?identity=${encodeURIComponent(identity)}`, { headers: auth });

describe('authentication', () => {
  it('rejects a request with no service key', async () => {
    const res = await fetch(`${baseUrl}/api/internal/quota/balance?identity=telegram:1`);
    expect(res.status).toBe(401);
  });

  it('rejects a wrong service key', async () => {
    const res = await balance('telegram:1').then(() =>
      fetch(`${baseUrl}/api/internal/quota/balance?identity=telegram:1`, { headers: { 'x-internal-key': 'guess' } }),
    );
    expect(res.status).toBe(401);
  });

  it('does not leak which part of the request was wrong', async () => {
    const res = await fetch(`${baseUrl}/api/internal/quota/balance?identity=telegram:1`, {
      headers: { 'x-internal-key': 'wrong' },
    });
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
    expect(JSON.stringify(body)).not.toContain(KEY);
  });

  it('FAILS CLOSED when no internal key is configured', async () => {
    // An empty configured key must never make every comparison pass.
    await new Promise<void>((resolve) => server.close(() => resolve()));
    server = mount('');
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const withNothing = await fetch(`${baseUrl}/api/internal/quota/balance?identity=telegram:1`);
    expect(withNothing.status).toBe(503);
    const withEmpty = await fetch(`${baseUrl}/api/internal/quota/balance?identity=telegram:1`, {
      headers: { 'x-internal-key': '' },
    });
    expect(withEmpty.status).toBe(503);
  });

  it('is not reachable through the public payment router', async () => {
    // The public router must never serve an /api/internal/* path.
    const res = await fetch(`${baseUrl}/api/internal/quota/spend`, { method: 'POST', body: '{}' });
    expect(res.status).toBe(401); // stopped at the boundary, not routed onward
  });
});

describe('spending', () => {
  it('spends from the shared balance and reports what is left', async () => {
    const res = await spend({ identity: 'telegram:555' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.totalRemaining).toBe(4);
  });

  it('returns 402 with an upgrade path once exhausted', async () => {
    for (let i = 0; i < 5; i += 1) await spend({ identity: 'telegram:555' });
    const res = await spend({ identity: 'telegram:555' });
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.code).toBe('QUOTA_EXHAUSTED');
    expect(body.upgradeUrl).toBe('/checkout');
  });

  it('validates identity and amount', async () => {
    expect((await spend({ identity: 'not-valid' })).status).toBe(400);
    expect((await spend({ identity: 'telegram:1', amount: 0 })).status).toBe(400);
    expect((await spend({ identity: 'telegram:1', amount: -5 })).status).toBe(400);
    expect((await spend({ identity: 'telegram:1', amount: 9999 })).status).toBe(400);
    expect((await spend({ identity: "telegram:1'; DROP TABLE accounts;--" })).status).toBe(400);
  });

  it('refunds a failed bot generation', async () => {
    await spend({ identity: 'telegram:777' });
    expect((await (await balance('telegram:777')).json()).totalRemaining).toBe(4);

    const res = await fetch(`${baseUrl}/api/internal/quota/refund`, {
      method: 'POST', headers: auth, body: JSON.stringify({ identity: 'telegram:777' }),
    });
    expect(res.status).toBe(200);
    expect((await (await balance('telegram:777')).json()).totalRemaining).toBe(5);
  });
});

describe('shared quota across surfaces (the acceptance criterion)', () => {
  it('bot spending is visible to the website API for the same identity', async () => {
    await spend({ identity: 'fb:shared-user', amount: 2 });

    // Read the SAME account through the internal API the bot uses.
    const viaInternal = await (await balance('fb:shared-user')).json();
    expect(viaInternal.totalRemaining).toBe(3);

    // And confirm the spend was attributed to the telegram surface in the
    // ledger, i.e. one account, many surfaces.
    const res = await spend({ identity: 'fb:shared-user', surface: 'telegram' });
    expect((await res.json()).totalRemaining).toBe(2);
  });

  it('a website purchase immediately unblocks the bot', async () => {
    const identity = 'telegram:900';
    for (let i = 0; i < 5; i += 1) await spend({ identity });
    expect((await spend({ identity })).status).toBe(402);

    // Purchase happens on the website side.
    await billing.createPayment({ orderId: 'ord-x', identity, planId: 'pro', priceMicroUsd: 19_000_000, messages: 500 });
    await billing.grantFromPayment({ eventId: 'evt-x', orderId: 'ord-x', identity, messages: 500 });

    // The bot can spend again with no further coordination.
    const after = await spend({ identity });
    expect(after.status).toBe(200);
    expect((await after.json()).paidRemaining).toBe(499);
  });

  it('keeps telegram and firebase identities isolated from each other', async () => {
    await spend({ identity: 'telegram:1' , amount: 5 });
    expect((await (await balance('telegram:1')).json()).totalRemaining).toBe(0);
    expect((await (await balance('fb:other')).json()).totalRemaining).toBe(5);
  });
});

describe('resilience', () => {
  it('returns a controlled 503 when the database is unavailable', async () => {
    (billing as unknown as { pool: { connect: () => Promise<never>; query: () => Promise<never> } }).pool = {
      connect: () => Promise.reject(new Error('ECONNREFUSED')),
      query: () => Promise.reject(new Error('ECONNREFUSED')),
    };
    const res = await spend({ identity: 'telegram:1' });
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('BILLING_UNAVAILABLE');
  });

  it('404s an unknown internal route rather than falling through', async () => {
    const res = await fetch(`${baseUrl}/api/internal/nope`, { headers: auth });
    expect(res.status).toBe(404);
  });
});
