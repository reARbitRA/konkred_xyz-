import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startHarness, type Harness } from './helpers/workflow-harness.ts';
import { ENTRIES, SUITES, WORKFLOWS } from '../content/catalogue/portfolio.ts';
import { PRODUCTS } from '../catalog/products.ts';

/**
 * Read-only catalogue routes.
 *
 * The contract being defended: all 36 items are reachable from data, both
 * canonical and legacy slugs resolve, the 21 metadata-only suites are honestly
 * reported as not runnable, and NOTHING on this surface can return HTML.
 */
let h: Harness;

beforeAll(async () => { h = await startHarness(); });
afterAll(async () => { await h.close(); });

describe('GET /api/workflows', () => {
  it('lists all 36 catalogue items as JSON', async () => {
    const res = await h.get('/api/workflows');
    expect(res.status).toBe(200);
    expect(res.contentType).toContain('application/json');
    expect(res.json.ok).toBe(true);
    expect(res.json.data.items).toHaveLength(36);
    expect(res.json.data.total).toBe(36);
    expect(ENTRIES).toHaveLength(36);
  });

  it('returns the required per-item fields for every one of the 36', async () => {
    const { data } = (await h.get('/api/workflows')).json;
    for (const item of data.items) {
      expect(typeof item.slug).toBe('string');
      expect(typeof item.name).toBe('string');
      expect(typeof item.category).toBe('string');
      expect(typeof item.status).toBe('string');
      expect(typeof item.humanApprovalRequired).toBe('boolean');
      expect(typeof item.demoAvailable).toBe('boolean');
      expect(typeof item.runnable).toBe('boolean');
      expect(typeof item.runnableForAnon).toBe('boolean');
      // risk is null only for metadata-only suites
      if (item.type === 'WORKFLOW') expect(['low', 'medium', 'high']).toContain(item.risk);
      else expect(item.risk).toBeNull();
    }
  });

  it('reports the 21 suites as metadata-only and not runnable, with a reason', async () => {
    const { data } = (await h.get('/api/workflows?type=SUITE')).json;
    expect(data.items).toHaveLength(21);
    expect(SUITES).toHaveLength(21);
    for (const item of data.items) {
      expect(item.runnable).toBe(false);
      expect(item.runnableForAnon).toBe(false);
      expect(item.taskType).toBeNull();
      expect(item.creditsPerRun).toBeNull();
      expect(item.notRunnableReason).toContain('no prompt');
    }
  });

  it('reports the 15 workflows with executable metadata', async () => {
    const { data } = (await h.get('/api/workflows?type=WORKFLOW')).json;
    expect(data.items).toHaveLength(15);
    expect(WORKFLOWS).toHaveLength(15);
    for (const item of data.items) {
      expect(item.productSlug).toBeTruthy();
      expect(item.taskType).toBeTruthy();
      expect(item.creditsPerRun).toBeGreaterThanOrEqual(2);
      expect(item.privacy).toBe('private');
    }
  });

  it('filters by category', async () => {
    const res = await h.get('/api/workflows?category=' + encodeURIComponent('Legal & Contracts'));
    expect(res.status).toBe(200);
    expect(res.json.data.items.length).toBeGreaterThan(0);
    for (const item of res.json.data.items) expect(item.category).toBe('Legal & Contracts');
  });

  it('an empty filter returns everything rather than nothing', async () => {
    const res = await h.get('/api/workflows?category=&q=');
    expect(res.json.data.items).toHaveLength(36);
  });

  it('a category that matches nothing returns an empty list, not a 404', async () => {
    const res = await h.get('/api/workflows?category=NoSuchCategory');
    expect(res.status).toBe(200);
    expect(res.json.ok).toBe(true);
    expect(res.json.data.items).toEqual([]);
    expect(res.json.data.count).toBe(0);
  });

  it('a search that matches nothing returns an empty list, not a 404', async () => {
    const res = await h.get('/api/workflows?q=zzzzzzzznotathing');
    expect(res.status).toBe(200);
    expect(res.json.data.items).toEqual([]);
  });

  it('searches by free text', async () => {
    const res = await h.get('/api/workflows?q=contract');
    expect(res.json.data.items.length).toBeGreaterThan(0);
    expect(res.json.data.items.some((i: any) => i.slug === 'contract-review')).toBe(true);
  });
});

describe('GET /api/workflows/:slug', () => {
  it('resolves every one of the 36 canonical slugs', async () => {
    for (const entry of ENTRIES) {
      const res = await h.get(`/api/workflows/${entry.slug}`);
      expect(res.status, entry.slug).toBe(200);
      expect(res.json.ok).toBe(true);
      expect(res.json.data.slug).toBe(entry.slug);
    }
  });

  it('resolves every legacy product slug to the same item', async () => {
    for (const product of PRODUCTS) {
      const res = await h.get(`/api/workflows/${product.slug}`);
      expect(res.status, product.slug).toBe(200);
      expect(res.json.data.productSlug).toBe(product.slug);
    }
  });

  it('returns both schemas for a workflow', async () => {
    const res = await h.get('/api/workflows/contract-review');
    expect(res.json.data.product.inputSchema).toBeTruthy();
    expect(res.json.data.product.outputSchema).toBeTruthy();
    expect(res.json.data.product.inputSchema.properties.contractText.minLength).toBe(200);
  });

  it('returns product: null for a metadata-only suite', async () => {
    const res = await h.get(`/api/workflows/${SUITES[0].slug}`);
    expect(res.status).toBe(200);
    expect(res.json.data.product).toBeNull();
    expect(res.json.data.runnable).toBe(false);
  });

  it('an unknown slug is 404 PRODUCT_NOT_FOUND, in JSON', async () => {
    const res = await h.get('/api/workflows/no-such-thing-at-all');
    expect(res.status).toBe(404);
    expect(res.contentType).toContain('application/json');
    expect(res.json.ok).toBe(false);
    expect(res.json.error.code).toBe('PRODUCT_NOT_FOUND');
  });

  it('never reports humanApprovalRequired as false, for any item', async () => {
    for (const entry of ENTRIES.filter((e) => e.type === 'WORKFLOW')) {
      const res = await h.get(`/api/workflows/${entry.slug}`);
      expect(res.json.data.humanApprovalRequired, entry.slug).toBe(true);
      expect(res.json.data.product.humanApprovalRequired, entry.slug).toBe(true);
    }
  });
});

describe('the catalogue surface never returns HTML', () => {
  const paths = [
    '/api/workflows',
    '/api/workflows/contract-review',
    '/api/workflows/does-not-exist',
    '/api/workflows/%2e%2e%2f%2e%2e%2fetc%2fpasswd',
    '/api/workflows/<script>alert(1)</script>',
  ];
  for (const path of paths) {
    it(`GET ${path}`, async () => {
      const res = await h.get(path);
      expect(res.contentType).toContain('application/json');
      expect(res.text.trimStart().startsWith('<')).toBe(false);
      expect(JSON.parse(res.text)).toBeTruthy();
    });
  }

  it('a wrong verb on /run answers JSON 405, not HTML', async () => {
    const res = await h.get('/api/workflows/contract-review/run');
    expect(res.contentType).toContain('application/json');
    expect(res.json.ok).toBe(false);
    expect(res.json.error.code).toBe('METHOD_NOT_ALLOWED');
  });

  it('a malformed JSON body still yields JSON', async () => {
    const res = await fetch(`${h.baseUrl}/api/workflows/contract-review/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    const text = await res.text();
    expect(res.headers.get('content-type') || '').toContain('json');
    expect(text.trimStart().startsWith('<')).toBe(false);
  });
});
