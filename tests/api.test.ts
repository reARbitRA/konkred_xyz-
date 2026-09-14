import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../server.ts';
import type { Express } from 'express';
import type { Server } from 'node:http';

/**
 * API smoke tests against the real Express app (server-side).
 * Covers health, the canonical DemoResponse contract, demo gating without a
 * key, suite demo rejection, and unknown-slug 404.
 */
let app: Express;
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  app = await createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const DEMO_STATUSES = ['COMPLETE', 'NEEDS_INPUT', 'BLOCKED', 'INCOMPLETE_SOURCE_SET', 'NEEDS_EXTERNAL_VALIDATOR', 'ERROR'];

async function postDemo(body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${baseUrl}/api/demo/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe('API', () => {
  it('GET /api/health returns ok', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('POST /api/demo/run with unknown slug returns 404 ERROR DemoResponse', async () => {
    const { status, json } = await postDemo({ slug: 'no-such-product', input: {} });
    expect(status).toBe(404);
    expect(json.status).toBe('ERROR');
    expect(json.actionsExecuted).toEqual([]);
  });

  it('POST /api/demo/run (canonical slug) honours the DemoResponse contract', async () => {
    const { status, json } = await postDemo({ slug: 'contract-review', input: { contractText: 'x'.repeat(250) } });
    expect(status).toBe(200);
    expect(DEMO_STATUSES).toContain(json.status);
    expect(typeof json.productId).toBe('string');
    expect(typeof json.runId).toBe('string');
    expect(Array.isArray(json.sourceRefs)).toBe(true);
    expect(json.validation).toMatchObject({ schema: expect.any(String), provenance: expect.any(String), safety: expect.any(String) });
    expect(Array.isArray(json.limitations)).toBe(true);
    expect(json.actionsExecuted).toEqual([]);
  });

  it('POST /api/demo/run returns NEEDS_EXTERNAL_VALIDATOR when no AI key/flag configured', async () => {
    const { status, json } = await postDemo({ slug: 'contract-review', input: { contractText: 'x'.repeat(250) } });
    expect(status).toBe(200);
    if (!process.env.GEMINI_API_KEY && !process.env.API_KEY) {
      expect(json.status).toBe('NEEDS_EXTERNAL_VALIDATOR');
      expect(json.productId).toBe('KONKRED-LEG-CON-CANON-0001-v2.0');
    }
  });

  it('legacy slugs still resolve on the demo endpoint', async () => {
    const { status, json } = await postDemo({ slug: 'contract-review-copilot', input: { contractText: 'x'.repeat(250) } });
    expect(status).toBe(200);
    expect(json.productId).toBe('KONKRED-LEG-CON-CANON-0001-v2.0');
  });

  it('suite slugs never fake a demo — NEEDS_EXTERNAL_VALIDATOR with no result', async () => {
    const { status, json } = await postDemo({ slug: 'customer-support-control', input: {} });
    expect(status).toBe(200);
    expect(json.status).toBe('NEEDS_EXTERNAL_VALIDATOR');
    expect(json.result).toBeUndefined();
    expect(json.validation).toMatchObject({ schema: 'NOT_RUN' });
  });

  it('missing input returns NEEDS_INPUT with schema NOT_RUN', async () => {
    const { status, json } = await postDemo({ slug: 'contract-review', input: {} });
    expect(status).toBe(200);
    expect(json.status).toBe('NEEDS_INPUT');
    expect(json.validation).toMatchObject({ schema: 'NOT_RUN' });
  });

  it('fullKONK health endpoint responds (server-side route preserved)', async () => {
    const res = await fetch(`${baseUrl}/api/fullkonk/health`);
    expect(res.status).toBe(200);
  });

  it('legacy (local dev) fullKONK providers route returns the registry shape', async () => {
    const res = await fetch(`${baseUrl}/api/fullkonk/providers`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.providers)).toBe(true);
    expect(typeof body.configured).toBe('boolean');
  });

  it('GitHub export without a browser token is a safe 503 when the server has no token', async () => {
    if (process.env.GITHUB_TOKEN) return; // CI/dev with a server token skips this guard
    const res = await fetch(`${baseUrl}/api/fullkonk/github/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner: 'octocat', repo: 'r', files: [{ path: 'a.ts', content: 'x' }] }),
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/not configured/);
    // Never hint that a token should be sent from the browser.
    expect(JSON.stringify(body)).not.toMatch(/gh[pousr]_/);
  });
});
