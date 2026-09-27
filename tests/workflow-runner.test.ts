import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startHarness, gatewaySpy, replyWith, minimalValidOutput, type Harness } from './helpers/workflow-harness.ts';
import { getProductBySlug } from '../catalog/products.ts';
import { extractJsonObject, planInput, splitString, splitArray, estimateTokens } from '../server/workflow-run.ts';

/**
 * The runner, written as attacks on the money and the safety claims:
 *
 *   - can a caller run something they have not paid for?
 *   - can a caller be charged twice for one generation?
 *   - can a caller be charged for OUR failure?
 *   - can the model turn off humanApprovalRequired?
 *   - can an anonymous caller reach a non-public product?
 *   - can anonymous demo traffic drain the provider pool?
 *   - can any of it return HTML?
 */

const CONTRACT = 'x'.repeat(400);
const contractProduct = getProductBySlug('contract-review-copilot')!;
const VALID_CONTRACT_OUTPUT = minimalValidOutput(contractProduct.outputSchema as Record<string, any>);

let h: Harness;
afterEach(async () => { if (h) await h.close(); });

async function harnessReturning(output: unknown, options: Parameters<typeof startHarness>[0] = {}) {
  const gateway = gatewaySpy(replyWith(JSON.stringify(output)));
  h = await startHarness({ ...options, gateway });
  return { h, gateway };
}

describe('step 1–2: resolution and the status gate', () => {
  it('an unknown slug is 404 PRODUCT_NOT_FOUND', async () => {
    await harnessReturning(VALID_CONTRACT_OUTPUT);
    const res = await h.post('/api/workflows/not-a-product/run', { input: {} });
    expect(res.status).toBe(404);
    expect(res.json.error.code).toBe('PRODUCT_NOT_FOUND');
  });

  it('ENTERPRISE_INTEGRATION is not self-serve: 403 CONTACT_REQUIRED', async () => {
    const { gateway } = await harnessReturning(VALID_CONTRACT_OUTPUT);
    const res = await h.post('/api/workflows/ma-diligence/run', { input: { documents: [], playbook: [] } }, {
      authorization: 'Bearer valid-enterprise-user',
    });
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe('CONTACT_REQUIRED');
    expect(res.json.error.contactRoute).toBe('/contact');
    // The gate must fire BEFORE any inference is attempted.
    expect(gateway.requests).toHaveLength(0);
  });

  it('a STANDARD_KIT product refuses an anonymous caller with 401', async () => {
    const { gateway } = await harnessReturning(VALID_CONTRACT_OUTPUT);
    const res = await h.post('/api/workflows/reconciliation/run', {
      input: { bankTransactions: [{ date: '2026-01-01', amount: 1, reference: 'a' }], ledgerEntries: [] },
    });
    expect(res.status).toBe(401);
    expect(res.json.error.code).toBe('AUTH_REQUIRED');
    expect(gateway.requests).toHaveLength(0);
  });

  it('the same STANDARD_KIT product runs for an authenticated caller', async () => {
    const product = getProductBySlug('reconciliation-copilot')!;
    await harnessReturning(minimalValidOutput(product.outputSchema as Record<string, any>));
    const res = await h.post('/api/workflows/reconciliation/run', {
      input: { bankTransactions: [{ date: '2026-01-01', amount: 1, reference: 'a' }], ledgerEntries: [] },
    }, { authorization: 'Bearer valid-alice' });
    expect(res.status).toBe(200);
    expect(res.json.data.status).toBe('COMPLETE');
  });
});

describe('step 3: input validation happens before any charge', () => {
  it('rejects a missing required field with 400 INVALID_INPUT', async () => {
    const { gateway } = await harnessReturning(VALID_CONTRACT_OUTPUT);
    const res = await h.post('/api/workflows/contract-review/run', { input: {} });
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe('INVALID_INPUT');
    expect(res.json.error.details).toContain('Missing required input: contractText');
    expect(gateway.requests).toHaveLength(0);
  });

  it('enforces the schema minLength constraint', async () => {
    await harnessReturning(VALID_CONTRACT_OUTPUT);
    const res = await h.post('/api/workflows/contract-review/run', { input: { contractText: 'too short' } });
    expect(res.status).toBe(400);
    expect(res.json.error.details.join(' ')).toContain('at least 200 characters');
  });

  it('costs nothing: the balance is untouched after an invalid input', async () => {
    await harnessReturning(VALID_CONTRACT_OUTPUT, { trialMessages: 10 });
    const before = await h.billing.getBalance('anon:' + 'a'.repeat(32));
    await h.post('/api/workflows/contract-review/run', { input: {} });
    // No account was even created for the caller, so the ledger is empty.
    const spends = await (h.billing as any).pool?.query?.('SELECT * FROM usage_ledger');
    expect(spends?.rowCount ?? 0).toBe(0);
    expect(before.totalRemaining).toBe(10);
  });
});

describe('step 6: metering reserves before the gateway is called', () => {
  it('charges creditsPerRun, not one message', async () => {
    await harnessReturning(VALID_CONTRACT_OUTPUT, { trialMessages: 100 });
    const res = await h.post('/api/workflows/contract-review/run', { input: { contractText: CONTRACT } });
    expect(res.status).toBe(200);
    expect(contractProduct.creditsPerRun).toBe(4);
    expect(res.json.data.credits).toEqual({ perRun: 4, charged: 4, metered: true });
    const balance = await h.billing.getBalance(res.json.data.provenance ? await identityOf(h) : '');
    expect(balance.totalRemaining).toBe(96);
  });

  it('402 QUOTA_EXHAUSTED with an upgradeUrl once the balance cannot cover the run', async () => {
    const { gateway } = await harnessReturning(VALID_CONTRACT_OUTPUT, { trialMessages: 3 });
    const res = await h.post('/api/workflows/contract-review/run', { input: { contractText: CONTRACT } });
    expect(res.status).toBe(402);
    expect(res.json.error.code).toBe('QUOTA_EXHAUSTED');
    expect(res.json.error.upgradeUrl).toBe('/checkout');
    expect(res.json.error.creditsRequired).toBe(4);
    // Reserved BEFORE the call: a broke caller never reaches a provider.
    expect(gateway.requests).toHaveLength(0);
  });

  it('the paywall cannot be bypassed by retrying', async () => {
    await harnessReturning(VALID_CONTRACT_OUTPUT, { trialMessages: 3 });
    for (let i = 0; i < 3; i += 1) {
      const res = await h.post('/api/workflows/contract-review/run', { input: { contractText: CONTRACT } });
      expect(res.status).toBe(402);
    }
  });
});

describe('step 12: refund on every failure path in steps 3–9', () => {
  async function balanceAfter(reply: Parameters<typeof gatewaySpy>[0]) {
    const gateway = gatewaySpy(reply);
    h = await startHarness({ gateway, trialMessages: 20 });
    const res = await h.post('/api/workflows/contract-review/run', { input: { contractText: CONTRACT } });
    const identity = await identityOf(h);
    const balance = await h.billing.getBalance(identity);
    return { res, balance };
  }

  it('refunds when the gateway is unreachable (503 UPSTREAM_UNAVAILABLE)', async () => {
    const { res, balance } = await balanceAfter({ ok: false, status: 503, code: 'GATEWAY_UNREACHABLE' });
    expect(res.status).toBe(503);
    expect(res.json.error.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(res.json.error.creditsCharged).toBe(0);
    expect(balance.totalRemaining).toBe(20);
  });

  it('refunds when the model output cannot be parsed (502 MODEL_OUTPUT_UNPARSEABLE)', async () => {
    const { res, balance } = await balanceAfter(replyWith('I am afraid I cannot do that, Dave.'));
    expect(res.status).toBe(502);
    expect(res.json.error.code).toBe('MODEL_OUTPUT_UNPARSEABLE');
    expect(balance.totalRemaining).toBe(20);
  });

  it('refunds when the output violates the schema (502 OUTPUT_SCHEMA_VIOLATION)', async () => {
    const { res, balance } = await balanceAfter(replyWith(JSON.stringify({ summary: 'ok' })));
    expect(res.status).toBe(502);
    expect(res.json.error.code).toBe('OUTPUT_SCHEMA_VIOLATION');
    expect(res.json.error.details.join(' ')).toContain('clauseFindings');
    expect(balance.totalRemaining).toBe(20);
  });

  it('the refund is recorded in the ledger, not silently applied', async () => {
    await balanceAfter({ ok: false, status: 503, code: 'GATEWAY_UNREACHABLE' });
    const identity = await identityOf(h);
    const rows = await (h.billing as any).pool.query(
      `SELECT reason, delta FROM usage_ledger WHERE identity = $1 ORDER BY id`, [identity],
    );
    expect(rows.rows.map((r: any) => r.reason)).toEqual(['spend', 'refund']);
    expect(rows.rows.map((r: any) => Number(r.delta))).toEqual([-4, 4]);
  });
});

describe('step 5: idempotent replay returns the prior result at zero cost', () => {
  it('a replayed key returns the identical result and charges nothing more', async () => {
    const { gateway } = await harnessReturning(VALID_CONTRACT_OUTPUT, { trialMessages: 50 });
    const key = 'idem-key-abcdef123456';
    const first = await h.post('/api/workflows/contract-review/run', { input: { contractText: CONTRACT } }, { 'x-idempotency-key': key });
    const second = await h.post('/api/workflows/contract-review/run', { input: { contractText: CONTRACT } }, { 'x-idempotency-key': key });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.json.data.replay).toBe(true);
    expect(second.json.data.runId).toBe(first.json.data.runId);
    expect(second.json.data.output).toEqual(first.json.data.output);
    expect(second.json.data.credits.charged).toBe(0);

    // Exactly one upstream call and exactly one charge.
    expect(gateway.requests).toHaveLength(1);
    const balance = await h.billing.getBalance(await identityOf(h));
    expect(balance.totalRemaining).toBe(46);
  });

  it('a different key is a different generation and is charged', async () => {
    const { gateway } = await harnessReturning(VALID_CONTRACT_OUTPUT, { trialMessages: 50 });
    await h.post('/api/workflows/contract-review/run', { input: { contractText: CONTRACT } }, { 'x-idempotency-key': 'key-one-aaaaaaaa' });
    await h.post('/api/workflows/contract-review/run', { input: { contractText: CONTRACT } }, { 'x-idempotency-key': 'key-two-bbbbbbbb' });
    expect(gateway.requests).toHaveLength(2);
    const balance = await h.billing.getBalance(await identityOf(h));
    expect(balance.totalRemaining).toBe(42);
  });

  it('a key belonging to another identity is never honoured', async () => {
    const { gateway } = await harnessReturning(VALID_CONTRACT_OUTPUT, { trialMessages: 50 });
    const key = 'shared-key-123456789';
    await h.post('/api/workflows/contract-review/run', { input: { contractText: CONTRACT } }, {
      'x-idempotency-key': key, authorization: 'Bearer valid-alice',
    });
    const mallory = await h.post('/api/workflows/contract-review/run', { input: { contractText: CONTRACT } }, {
      'x-idempotency-key': key, authorization: 'Bearer valid-mallory',
    });
    // Mallory gets her OWN run, charged to her own balance — never Alice's result.
    expect(mallory.json.data.replay).toBe(false);
    expect(gateway.requests).toHaveLength(2);
    expect((await h.billing.getBalance('fb:alice')).totalRemaining).toBe(46);
    expect((await h.billing.getBalance('fb:mallory')).totalRemaining).toBe(46);
  });

  it('the key is scoped per slug: the same key on another product is a new run', async () => {
    const seo = getProductBySlug('seo-content-opportunity-planner')!;
    const gateway = gatewaySpy((n) =>
      replyWith(JSON.stringify(n === 1 ? VALID_CONTRACT_OUTPUT : minimalValidOutput(seo.outputSchema as Record<string, any>))),
    );
    h = await startHarness({ gateway, trialMessages: 50 });
    const key = 'cross-slug-key-000001';
    await h.post('/api/workflows/contract-review/run', { input: { contractText: CONTRACT } }, { 'x-idempotency-key': key });
    const other = await h.post('/api/workflows/seo-planner/run', { input: { keywords: [{ keyword: 'a', volume: 1, difficulty: 2 }] } }, { 'x-idempotency-key': key });
    expect(other.status).toBe(200);
    expect(other.json.data.replay).toBe(false);
    expect(gateway.requests).toHaveLength(2);
  });

  it('a failed run is not stored, so a retry with the same key really retries', async () => {
    const gateway = gatewaySpy((n) => (n === 1 ? { ok: false, status: 503, code: 'X' } : replyWith(JSON.stringify(VALID_CONTRACT_OUTPUT))));
    h = await startHarness({ gateway, trialMessages: 50 });
    const key = 'retry-key-aaaaaaaaaa';
    const first = await h.post('/api/workflows/contract-review/run', { input: { contractText: CONTRACT } }, { 'x-idempotency-key': key });
    expect(first.status).toBe(503);
    const second = await h.post('/api/workflows/contract-review/run', { input: { contractText: CONTRACT } }, { 'x-idempotency-key': key });
    expect(second.status).toBe(200);
    expect(second.json.data.replay).toBe(false);
  });
});

describe('step 10: humanApprovalRequired is forced server-side', () => {
  it('is true even when the model explicitly returns false', async () => {
    await harnessReturning({ ...VALID_CONTRACT_OUTPUT, humanApprovalRequired: false }, { trialMessages: 50 });
    const res = await h.post('/api/workflows/contract-review/run', { input: { contractText: CONTRACT } });
    expect(res.status).toBe(200);
    expect(res.json.data.output.humanApprovalRequired).toBe(true);
    expect(res.json.data.humanApprovalRequired).toBe(true);
  });

  it('is true even when the model omits the field entirely', async () => {
    const withoutFlag = { ...VALID_CONTRACT_OUTPUT };
    delete (withoutFlag as Record<string, unknown>).humanApprovalRequired;
    await harnessReturning(withoutFlag, { trialMessages: 50 });
    const res = await h.post('/api/workflows/contract-review/run', { input: { contractText: CONTRACT } });
    expect(res.status).toBe(200);
    expect(res.json.data.output.humanApprovalRequired).toBe(true);
  });
});

describe('step 7: what is actually sent to the gateway', () => {
  it('sends taskType, the product prompt, privacy private and the product budget', async () => {
    const { gateway } = await harnessReturning(VALID_CONTRACT_OUTPUT, { trialMessages: 50 });
    await h.post('/api/workflows/contract-review/run', { input: { contractText: CONTRACT } });
    const sent = gateway.requests[0].request;
    expect(sent.taskType).toBe(contractProduct.taskType);
    expect(sent.systemPrompt).toBe(contractProduct.prompt);
    expect(sent.privacy).toBe('private');
    expect(sent.maxTokens).toBe(contractProduct.maxOutputTokens);
    expect(sent.messages).toHaveLength(1);
    expect(sent.messages[0].role).toBe('user');
    expect(sent.messages[0].content).toContain(CONTRACT.slice(0, 50));
  });

  it('every product is sent with privacy private', async () => {
    const { PRODUCTS } = await import('../catalog/products.ts');
    for (const p of PRODUCTS) expect(p.privacy, p.slug).toBe('private');
  });
});

describe('step 8: JSON extraction and the single repair attempt', () => {
  it('tolerates a fenced code block', async () => {
    const gateway = gatewaySpy(replyWith('```json\n' + JSON.stringify(VALID_CONTRACT_OUTPUT) + '\n```'));
    h = await startHarness({ gateway, trialMessages: 50 });
    const res = await h.post('/api/workflows/contract-review/run', { input: { contractText: CONTRACT } });
    expect(res.status).toBe(200);
  });

  it('tolerates leading prose', async () => {
    const gateway = gatewaySpy(replyWith('Certainly! Here is the review:\n\n' + JSON.stringify(VALID_CONTRACT_OUTPUT)));
    h = await startHarness({ gateway, trialMessages: 50 });
    const res = await h.post('/api/workflows/contract-review/run', { input: { contractText: CONTRACT } });
    expect(res.status).toBe(200);
  });

  it('makes exactly one repair attempt, then succeeds', async () => {
    const gateway = gatewaySpy((n) => replyWith(n === 1 ? 'no json here' : JSON.stringify(VALID_CONTRACT_OUTPUT)));
    h = await startHarness({ gateway, trialMessages: 50 });
    const res = await h.post('/api/workflows/contract-review/run', { input: { contractText: CONTRACT } });
    expect(res.status).toBe(200);
    expect(gateway.requests).toHaveLength(2);
    expect(res.json.data.provenance.repaired).toBe(true);
  });

  it('gives up after ONE repair attempt — it does not loop on our budget', async () => {
    const gateway = gatewaySpy(replyWith('still not json'));
    h = await startHarness({ gateway, trialMessages: 50 });
    const res = await h.post('/api/workflows/contract-review/run', { input: { contractText: CONTRACT } });
    expect(res.status).toBe(502);
    expect(gateway.requests).toHaveLength(2);
  });
});

describe('POST /api/workflows/:slug/demo', () => {
  it('runs the shipped fixture and stamps demo: true with the honest caveat', async () => {
    await harnessReturning(VALID_CONTRACT_OUTPUT);
    const res = await h.post('/api/workflows/contract-review/demo');
    expect(res.status).toBe(200);
    expect(res.json.data.demo).toBe(true);
    expect(res.json.data.humanApprovalRequired).toBe(true);
    expect(res.json.data.notice).toContain('NOT_FOR_PRODUCTION_DECISION');
    expect(res.json.data.notice).toContain('synthetic-public');
    expect(res.json.data.fixture.source).toBe('synthetic-public');
    expect(res.json.data.credits.charged).toBe(0);
  });

  it('refuses a product that is not PUBLIC_DEMO', async () => {
    const { gateway } = await harnessReturning(VALID_CONTRACT_OUTPUT);
    const res = await h.post('/api/workflows/reconciliation/demo');
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe('DEMO_NOT_AVAILABLE');
    expect(gateway.requests).toHaveLength(0);
  });

  it('enforces a per-IP hourly limit', async () => {
    const { gateway } = await harnessReturning(VALID_CONTRACT_OUTPUT, { demoIpMax: 2 });
    expect((await h.post('/api/workflows/contract-review/demo')).status).toBe(200);
    expect((await h.post('/api/workflows/contract-review/demo')).status).toBe(200);
    const third = await h.post('/api/workflows/contract-review/demo');
    expect(third.status).toBe(429);
    expect(third.json.error.code).toBe('DEMO_RATE_LIMIT');
    expect(gateway.requests).toHaveLength(2);
  });

  it('enforces a global 24h ceiling that no single IP can evade', async () => {
    const { gateway } = await harnessReturning(VALID_CONTRACT_OUTPUT, { demoIpMax: 99, demoGlobalMax: 3 });
    for (let i = 0; i < 3; i += 1) {
      const res = await h.post('/api/workflows/contract-review/demo', undefined, { 'x-forwarded-for': `203.0.113.${i}` });
      expect(res.status).toBe(200);
    }
    const blocked = await h.post('/api/workflows/contract-review/demo', undefined, { 'x-forwarded-for': '198.51.100.9' });
    expect(blocked.status).toBe(429);
    expect(blocked.json.error.code).toBe('DEMO_DAILY_LIMIT');
    expect(gateway.requests).toHaveLength(3);
  });

  it('a failing run still consumes the allowance, so failures cannot be farmed', async () => {
    const gateway = gatewaySpy({ ok: false, status: 503, code: 'X' });
    h = await startHarness({ gateway, demoIpMax: 1 });
    expect((await h.post('/api/workflows/contract-review/demo')).status).toBe(503);
    expect((await h.post('/api/workflows/contract-review/demo')).status).toBe(429);
  });

  it('fails CLOSED with no database: the abuse ceiling cannot be enforced', async () => {
    const gateway = gatewaySpy(replyWith(JSON.stringify(VALID_CONTRACT_OUTPUT)));
    h = await startHarness({ gateway, withDatabase: false });
    const res = await h.post('/api/workflows/contract-review/demo');
    expect(res.status).toBe(503);
    expect(res.json.error.code).toBe('DEMO_UNAVAILABLE');
    expect(gateway.requests).toHaveLength(0);
    // This must be the DELIBERATE refusal, not an incidental crash that
    // happens to produce the same code: a missing ledger is a configuration
    // fact, so retrying cannot help, and the message must say why.
    expect(res.json.error.retryable).toBe(false);
    expect(res.json.error.message).toContain('not configured');
  });
});

describe('configuration failures are controlled JSON, not crashes', () => {
  it('no gateway configured: 503 GATEWAY_NOT_CONFIGURED and nothing reserved', async () => {
    h = await startHarness({ withGateway: false, trialMessages: 50 });
    const res = await h.post('/api/workflows/contract-review/run', { input: { contractText: CONTRACT } });
    expect(res.status).toBe(503);
    expect(res.json.error.code).toBe('GATEWAY_NOT_CONFIGURED');
    // Nothing was reserved: no account row was even created for the caller.
    const rows = await (h.billing as any).pool.query('SELECT * FROM usage_ledger');
    expect(rows.rowCount).toBe(0);
  });
});

describe('errors never leak internals', () => {
  it('an upstream error code is never echoed to the caller', async () => {
    const gateway = gatewaySpy({ ok: false, status: 502, code: 'PROVIDER_KEY_sk-live-abcdef-REVOKED' });
    h = await startHarness({ gateway, trialMessages: 50 });
    const res = await h.post('/api/workflows/contract-review/run', { input: { contractText: CONTRACT } });
    expect(res.text).not.toContain('sk-live');
    expect(res.text).not.toContain('PROVIDER_KEY');
    expect(res.json.error.code).toBe('UPSTREAM_UNAVAILABLE');
  });

  it('no response carries a stack trace or a filesystem path', async () => {
    const gateway = gatewaySpy(replyWith('garbage'));
    h = await startHarness({ gateway, trialMessages: 50 });
    const res = await h.post('/api/workflows/contract-review/run', { input: { contractText: CONTRACT } });
    expect(res.text).not.toMatch(/\/home\/|\bat \w+ \(|node_modules/);
  });
});

// ── pure helpers ────────────────────────────────────────────────────────────
describe('extractJsonObject', () => {
  it('parses a bare object', () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
  });
  it('parses a fenced object', () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it('parses an object after prose', () => {
    expect(extractJsonObject('Sure thing.\n{"a":1}\nHope that helps!')).toEqual({ a: 1 });
  });
  it('is not fooled by a closing brace inside a string literal', () => {
    expect(extractJsonObject('prefix {"quote":"a } b","n":2} suffix')).toEqual({ quote: 'a } b', n: 2 });
  });
  it('is not fooled by an escaped quote', () => {
    expect(extractJsonObject('{"q":"he said \\"} \\" then left","n":3}')).toEqual({ q: 'he said "} " then left', n: 3 });
  });
  it('returns null for an array, prose, or empty input', () => {
    expect(extractJsonObject('[1,2,3]')).toBeNull();
    expect(extractJsonObject('no json')).toBeNull();
    expect(extractJsonObject('')).toBeNull();
  });
});

describe('chunking never loses input', () => {
  it('splitString pieces reconstruct the original exactly', () => {
    const text = Array.from({ length: 500 }, (_, i) => `paragraph ${i} of the contract text`).join('\n\n');
    const pieces = splitString(text, 1000);
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.join('')).toBe(text);
  });

  it('splitArray partitions without loss or duplication', () => {
    const items = Array.from({ length: 200 }, (_, i) => ({ id: i, content: 'y'.repeat(50) }));
    const groups = splitArray(items, 1000);
    expect(groups.length).toBeGreaterThan(1);
    expect(groups.flat()).toEqual(items);
  });

  it('planInput leaves a small payload as one chunk', () => {
    const plan = planInput(contractProduct, { contractText: CONTRACT });
    expect(plan.chunked).toBe(false);
    expect(plan.chunks).toHaveLength(1);
  });

  it('planInput splits an oversized payload on its largest field', () => {
    const big = { contractText: 'z'.repeat(400_000), jurisdiction: 'England' };
    const plan = planInput(contractProduct, big, 20_000);
    expect(plan.chunked).toBe(true);
    expect(plan.splitField).toBe('contractText');
    expect(plan.chunks.length).toBeGreaterThan(1);
    // Every chunk keeps the non-split context.
    for (const chunk of plan.chunks) expect(chunk).toContain('England');
    // And nothing was dropped.
    const rejoined = plan.chunks.map((c) => JSON.parse(c).contractText).join('');
    expect(rejoined).toBe(big.contractText);
  });

  it('a chunked run makes one call per chunk plus one synthesis call', async () => {
    const gateway = gatewaySpy(replyWith(JSON.stringify(VALID_CONTRACT_OUTPUT)));
    h = await startHarness({ gateway, trialMessages: 200, chunkThresholdTokens: 2_000 });
    const res = await h.post('/api/workflows/contract-review/run', { input: { contractText: 'w'.repeat(40_000) } });
    expect(res.status).toBe(200);
    expect(res.json.data.provenance.chunked).toBe(true);
    expect(gateway.requests.length).toBe(res.json.data.provenance.chunkCount + 1);
  });

  it('input above the product maximum is refused, never truncated', async () => {
    await harnessReturning(VALID_CONTRACT_OUTPUT, { trialMessages: 200 });
    const res = await h.post('/api/workflows/executive-flash/run', {
      input: { items: Array.from({ length: 4000 }, (_, i) => ({ id: String(i), category: 'c', metric: 'm', value: 'v', note: 'n'.repeat(40) })) },
    }, { authorization: 'Bearer valid-bob' });
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe('INPUT_TOO_LARGE');
    expect(res.json.error.message).toContain('nothing is truncated for you');
  });
});

describe('estimateTokens', () => {
  it('is the same 4-chars-per-token rule the gateway budgets with', () => {
    expect(estimateTokens('x'.repeat(4000))).toBe(1000);
    expect(estimateTokens('')).toBe(0);
  });
});

/** The anon identity the harness derives for a request with no forwarded IP. */
async function identityOf(harness: Harness): Promise<string> {
  const rows = await (harness.billing as any).pool.query('SELECT identity FROM accounts ORDER BY id LIMIT 1');
  return rows.rows[0]?.identity ?? '';
}
