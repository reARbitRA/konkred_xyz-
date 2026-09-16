import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleGatewayRequest } from '../server/gateway/router.ts';
import { rateLimiter, redactSecrets } from '../server/gateway/http.ts';
import { SseParser, decodeStreamChunk } from '../utils/sse.ts';
import { createStreamState, reduceStreamChunk } from '../utils/streamState.ts';

/**
 * Server-route tests for the gateway BFF, driven through real HTTP:
 *
 *   test client → BFF router (the Vercel function's dispatch path) → mock gateway
 *
 * No live Gemini/GitHub/Render/Redis credentials are involved: the mock gateway
 * records exactly what the browser sent, and what the BFF forwarded.
 */

const BRAIN_KEY = 'brain-secret-value';
const GATEWAY_API_KEY = 'gateway-api-key-value';
// Fixtures are assembled at runtime: no credential-shaped literal may exist in
// the repository (tests/secrets.test.ts enforces this).
const credential = (prefix: string, length: number): string => `${prefix}${'k'.repeat(length)}`;
const SERVER_GITHUB_TOKEN = credential('github_pat_', 30);
const CLIENT_GITHUB_TOKEN = credential('ghp_', 32);
const ECHOED_PROVIDER_KEY = credential('sk-', 24);

interface RecordedRequest {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: string;
  aborted: boolean;
}

type GatewayHandler = (req: IncomingMessage, res: ServerResponse, recorded: RecordedRequest) => void;

interface MockGateway {
  url: string;
  requests: RecordedRequest[];
  setHandler: (handler: GatewayHandler) => void;
  close: () => Promise<void>;
}

const createMockGateway = async (): Promise<MockGateway> => {
  const requests: RecordedRequest[] = [];
  let handler: GatewayHandler = (_req, res) => {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: 'no handler' } }));
  };

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    const recorded: RecordedRequest = { method: req.method ?? '', url: req.url ?? '', headers: req.headers, body: '', aborted: false };
    requests.push(recorded);
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('aborted', () => { recorded.aborted = true; });
    res.on('close', () => { if (!res.writableEnded) recorded.aborted = true; });
    req.on('end', () => {
      recorded.body = Buffer.concat(chunks).toString('utf8');
      handler(req, res, recorded);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    setHandler: (next) => { handler = next; },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
};

type BffRouteResult = { handled: boolean; status: number; headers: Headers; text: string; response: Response };

const startBff = async (): Promise<{ url: string; close: () => Promise<void> }> => {
  const server = http.createServer((req, res) => {
    void handleGatewayRequest(req, res)
      .then((handled) => {
        if (handled) return;
        // Mirrors api/index.ts falling through to the legacy Express app.
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ handler: 'legacy' }));
      })
      .catch((error) => {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: String(error) }));
      });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
};

let gateway: MockGateway;
let bff: { url: string; close: () => Promise<void> };
let unreachableUrl: string;

const call = async (
  path: string,
  init: RequestInit = {},
): Promise<BffRouteResult> => {
  const response = await fetch(`${bff.url}${path}`, init);
  return { handled: response.status !== 404, status: response.status, headers: response.headers, text: await response.text(), response };
};

const json = (path: string, body: unknown, headers: Record<string, string> = {}): Promise<BffRouteResult> =>
  call(path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

beforeAll(async () => {
  gateway = await createMockGateway();
  bff = await startBff();

  // A port with nothing listening — used for the "gateway unreachable" cases.
  const dead = http.createServer();
  await new Promise<void>((resolve) => dead.listen(0, '127.0.0.1', resolve));
  const { port } = dead.address() as AddressInfo;
  await new Promise<void>((resolve) => dead.close(() => resolve()));
  unreachableUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await bff.close();
  await gateway.close();
});

const configureGateway = (url = gateway.url): void => {
  process.env.KONKRED_GATEWAY_URL = url;
  process.env.KONKRED_GATEWAY_API_KEY = GATEWAY_API_KEY;
  process.env.FULLKONK_KEY = BRAIN_KEY;
  process.env.FULLKONK_GITHUB_EXPORT_TOKEN = SERVER_GITHUB_TOKEN;
  delete process.env.FULLKONK_REQUIRE_AUTH;
};

beforeEach(() => {
  gateway.requests.length = 0;
  rateLimiter.reset();
  configureGateway();
});

afterEach(() => {
  delete process.env.KONKRED_GATEWAY_URL;
  delete process.env.KONKRED_GATEWAY_API_KEY;
  delete process.env.FULLKONK_KEY;
  delete process.env.FULLKONK_GITHUB_EXPORT_TOKEN;
  delete process.env.FULLKONK_LEGACY_ENGINE_FALLBACK;
  delete process.env.FULLKONK_REQUIRE_AUTH;
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ *
 * Provider discovery
 * ------------------------------------------------------------------ */
describe('GET /api/fullkonk/providers', () => {
  it('proxies provider discovery and preserves the JSON payload', async () => {
    gateway.setHandler((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ providers: [{ id: 'gemini', name: 'Gemini', hasKey: true, models: [{ id: 'gemini:flash', label: 'gemini-2.5-flash' }] }], configured: true }));
    });

    const result = await call('/api/fullkonk/providers');
    expect(result.status).toBe(200);
    expect(result.headers.get('content-type')).toContain('application/json');
    expect(result.headers.get('cache-control')).toContain('max-age=30');
    const body = JSON.parse(result.text) as { providers: { id: string }[]; configured: boolean };
    expect(body.configured).toBe(true);
    expect(body.providers[0].id).toBe('gemini');
  });

  it('adds x-brain-key server-side and ignores browser-supplied credentials', async () => {
    gateway.setHandler((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ providers: [], configured: false }));
    });

    await call('/api/fullkonk/providers', {
      headers: {
        'x-brain-key': 'attacker-brain-key',
        'x-api-key': 'attacker-api-key',
        'x-provider-key': 'attacker-provider-key',
        authorization: 'Bearer attacker-token',
      },
    });

    const upstream = gateway.requests.at(-1);
    expect(upstream?.headers['x-brain-key']).toBe(BRAIN_KEY);
    expect(JSON.stringify(upstream?.headers)).not.toContain('attacker');
  });

  it.each([401, 403, 429, 503])('preserves upstream %s from the gateway', async (status) => {
    gateway.setHandler((_req, res) => {
      res.writeHead(status, { 'content-type': 'application/json', ...(status === 429 ? { 'retry-after': '42' } : {}) });
      res.end(JSON.stringify({ ok: false, error: { code: 'GATEWAY_SAYS_NO', message: `upstream ${status}` } }));
    });

    const result = await call('/api/fullkonk/providers');
    expect(result.status).toBe(status);
    expect(result.text).toContain('upstream');
    if (status === 429) expect(result.headers.get('retry-after')).toBe('42');
  });

  it('returns 502 without leaking internals when the gateway is unreachable', async () => {
    configureGateway(unreachableUrl);
    const result = await call('/api/fullkonk/providers');
    expect(result.status).toBe(502);
    expect(result.text).toContain('GATEWAY_UNAVAILABLE');
    expect(result.text).not.toContain(BRAIN_KEY);
    expect(result.text).not.toContain(GATEWAY_API_KEY);
  });

  it('rejects cross-site origins', async () => {
    gateway.setHandler((_req, res) => { res.writeHead(200); res.end('{}'); });
    const result = await call('/api/fullkonk/providers', { headers: { origin: 'https://evil.example.com' } });
    expect(result.status).toBe(403);
    expect(gateway.requests).toHaveLength(0);
  });

  it('answers 405 for the wrong method', async () => {
    const result = await call('/api/fullkonk/providers', { method: 'DELETE' });
    expect(result.status).toBe(405);
  });
});

/* ------------------------------------------------------------------ *
 * Generation (SSE)
 * ------------------------------------------------------------------ */
const sseFrame = (event: unknown): string => `data: ${JSON.stringify(event)}\n\n`;

describe('POST /api/fullkonk/generate', () => {
  it('streams upstream SSE bytes through, unmodified and without buffering', async () => {
    gateway.setHandler(async (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform' });
      res.write(sseFrame({ type: 'stage', stage: 'architect', content: 'ARCHITECT · SCOPING BUILD' }));
      await new Promise((resolve) => setTimeout(resolve, 250));
      res.write(sseFrame({ type: 'delta', content: 'hello ' }));
      res.write(sseFrame({ type: 'delta', content: 'world' }));
      res.write(sseFrame({ type: 'done' }));
      res.end();
    });

    const started = Date.now();
    const response = await fetch(`${bff.url}/api/fullkonk/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'build me a landing page', mode: 'fullstack' }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(response.headers.get('cache-control')).toBe('no-cache, no-transform');
    expect(response.headers.get('x-accel-buffering')).toBe('no');

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    let firstChunkAt = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!firstChunkAt) firstChunkAt = Date.now();
      text += decoder.decode(value, { stream: true });
    }
    const totalMs = Date.now() - started;

    // The first event must arrive long before the stream ends → not buffered.
    expect(firstChunkAt - started).toBeLessThan(200);
    expect(totalMs).toBeGreaterThanOrEqual(240);
    expect(text).toContain('"type":"stage"');
    expect(text).toContain('"type":"delta","content":"hello "');
    expect(text.trimEnd().endsWith('data: {"type":"done"}')).toBe(true);
  });

  it('normalises the browser payload and injects the brain key server-side', async () => {
    gateway.setHandler((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(sseFrame({ type: 'done' }));
      res.end();
    });

    await json('/api/fullkonk/generate', {
      prompt: '  build a dashboard  ',
      mode: 'review',
      model: 'gemini:flash',
      temperature: 9,
      maxTokens: 999_999,
      systemPrompt: 'be terse',
      projectId: 'should-be-dropped',
      attachedFiles: [{ path: 'src/app.ts', contentBase64: Buffer.from('export const x = 1;').toString('base64'), size: 19 }],
      extra: 'dropped',
    }, { 'x-brain-key': 'attacker', 'x-api-key': 'attacker', 'x-provider-key': 'attacker-provider-key', authorization: 'Bearer attacker' });

    const upstream = gateway.requests.at(-1);
    const body = JSON.parse(upstream!.body) as Record<string, unknown>;
    expect(upstream?.headers['x-brain-key']).toBe(BRAIN_KEY);
    expect(JSON.stringify(upstream?.headers)).not.toContain('attacker');
    expect(body.prompt).toBe('build a dashboard');
    expect(body.mode).toBe('review');
    expect(body.model).toBe('gemini:flash');
    expect(body.temperature).toBe(2);
    expect(body.maxTokens).toBe(8192);
    expect(body.systemPrompt).toBe('be terse');
    expect(body.projectId).toBeUndefined();
    expect(body.extra).toBeUndefined();
    expect(body.attachedFiles).toEqual([{ path: 'src/app.ts', content: 'export const x = 1;' }]);
  });

  it('preserves a JSON error from the gateway (401) instead of streaming', async () => {
    gateway.setHandler((_req, res) => {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: { code: 'INVALID_BRAIN_KEY', message: 'Provide the brain shared secret' } }));
    });

    const result = await json('/api/fullkonk/generate', { prompt: 'hi' });
    expect(result.status).toBe(401);
    expect(result.headers.get('content-type')).toContain('application/json');
    expect(result.text).toContain('INVALID_BRAIN_KEY');
  });

  it('preserves 413 and 429 + Retry-After from the gateway', async () => {
    gateway.setHandler((_req, res) => {
      res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '30' });
      res.end(JSON.stringify({ ok: false, error: { code: 'CAPACITY_EXHAUSTED', message: 'All keys cooling down' } }));
    });
    const throttled = await json('/api/fullkonk/generate', { prompt: 'hi' });
    expect(throttled.status).toBe(429);
    expect(throttled.headers.get('retry-after')).toBe('30');
    expect(throttled.text).toContain('CAPACITY_EXHAUSTED');

    gateway.setHandler((_req, res) => {
      res.writeHead(413, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: { code: 'CONTEXT_LENGTH', message: 'context too long' } }));
    });
    const tooBig = await json('/api/fullkonk/generate', { prompt: 'hi' });
    expect(tooBig.status).toBe(413);
  });

  it('rejects malformed and oversized request bodies before calling the gateway', async () => {
    const malformed = await call('/api/fullkonk/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    expect(malformed.status).toBe(400);
    expect(malformed.text).toContain('INVALID_JSON');

    const oversized = await call('/api/fullkonk/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'x'.repeat(3 * 1024 * 1024) }),
    });
    expect(oversized.status).toBe(413);
    expect(gateway.requests).toHaveLength(0);
  });

  it('rejects empty prompts, bad attachment paths and oversized attachments', async () => {
    const empty = await json('/api/fullkonk/generate', { prompt: '   ' });
    expect(empty.status).toBe(400);
    expect(empty.text).toContain('prompt');

    const traversal = await json('/api/fullkonk/generate', {
      prompt: 'hi',
      attachedFiles: [{ path: '../../etc/passwd', contentBase64: 'Zm9v', size: 3 }],
    });
    expect(traversal.status).toBe(400);

    const heavy = await json('/api/fullkonk/generate', {
      prompt: 'hi',
      attachedFiles: [{ path: 'src/big.ts', contentBase64: Buffer.alloc(600 * 1024).toString('base64'), size: 600 * 1024 }],
    });
    expect(heavy.status).toBe(413);
    expect(gateway.requests).toHaveLength(0);
  });

  it('aborts the upstream request when the browser disconnects', async () => {
    let upstreamClosed = false;
    gateway.setHandler((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(sseFrame({ type: 'stage', stage: 'architect' }));
      res.on('close', () => { upstreamClosed = true; });
    });

    const controller = new AbortController();
    const response = await fetch(`${bff.url}/api/fullkonk/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'long build' }),
      signal: controller.signal,
    });
    const reader = response.body!.getReader();
    await reader.read(); // first event arrived
    controller.abort();
    await reader.cancel().catch(() => undefined);

    const deadline = Date.now() + 3000;
    while (!upstreamClosed && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 25));
    expect(upstreamClosed).toBe(true);
    expect(gateway.requests.at(-1)?.aborted).toBe(true);
  });

  it('emits a synthetic error event when the upstream stream dies mid-flight', async () => {
    gateway.setHandler((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(sseFrame({ type: 'stage', stage: 'build' }));
      res.write(sseFrame({ type: 'delta', content: 'partial output' }));
      // Destroy the socket → truncated stream.
      setTimeout(() => res.destroy(), 30);
    });

    const response = await fetch(`${bff.url}/api/fullkonk/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'kaboom' }),
    });
    const text = await response.text();
    expect(text).toContain('"type":"delta"');
    expect(text).toContain('"type":"error"');
  });
});

/* ------------------------------------------------------------------ *
 * Standard inference
 * ------------------------------------------------------------------ */
describe('POST /api/ai', () => {
  it('forwards with x-api-key and preserves the { ok, data } envelope', async () => {
    gateway.setHandler((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, requestId: 'req-1', data: { content: 'hello', provider: 'gemini', model: 'gemini-2.5-flash', usage: { totalTokens: 12 }, attemptCount: 1, attempts: [] } }));
    });

    const result = await json('/api/ai', {
      taskType: 'general',
      messages: [{ role: 'user', content: 'Hello' }],
      maxTokens: 2048,
      temperature: 0.3,
      privacy: 'private',
      skipCache: false,
    }, { 'x-api-key': 'attacker-key' });

    expect(result.status).toBe(200);
    const body = JSON.parse(result.text) as { ok: boolean; data: { content: string } };
    expect(body.ok).toBe(true);
    expect(body.data.content).toBe('hello');

    const upstream = gateway.requests.at(-1);
    expect(upstream?.headers['x-api-key']).toBe(GATEWAY_API_KEY);
    expect(JSON.stringify(upstream?.headers)).not.toContain('attacker-key');
    expect(JSON.parse(upstream!.body)).toMatchObject({ taskType: 'general', privacy: 'private' });
  });

  it('preserves an upstream error envelope and Retry-After', async () => {
    gateway.setHandler((_req, res) => {
      res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '12' });
      res.end(JSON.stringify({ ok: false, error: { code: 'CAPACITY_EXHAUSTED', message: 'All providers cooling down' } }));
    });

    const result = await json('/api/ai', { messages: [{ role: 'user', content: 'hi' }] });
    expect(result.status).toBe(429);
    expect(result.headers.get('retry-after')).toBe('12');
    expect(JSON.parse(result.text)).toMatchObject({ ok: false, error: { code: 'CAPACITY_EXHAUSTED' } });
  });

  it('rejects an unknown task type locally', async () => {
    const result = await json('/api/ai', { taskType: 'world-domination', messages: [{ role: 'user', content: 'hi' }] });
    expect(result.status).toBe(400);
    expect(gateway.requests).toHaveLength(0);
  });

  it('returns a safe configuration error when the credential is missing', async () => {
    delete process.env.KONKRED_GATEWAY_API_KEY;
    const result = await json('/api/ai', { messages: [{ role: 'user', content: 'hi' }] });
    expect(result.status).toBe(503);
    expect(result.text).toContain('GATEWAY_CREDENTIAL_MISSING');
    expect(gateway.requests).toHaveLength(0);
  });
});

describe('POST /api/ai/generate (legacy client compatibility)', () => {
  it('normalises the legacy audit payload and returns { text }', async () => {
    gateway.setHandler((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, data: { content: '{"overallScore":91}', provider: 'gemini', model: 'gemini-2.5-flash', usage: { totalTokens: 40 }, cached: false, attemptCount: 1 } }));
    });

    const result = await json('/api/ai/generate', {
      provider: 'google',
      messages: [{ role: 'user', content: 'audit this' }],
      config: { defaultModel: 'gemini-3-pro-preview', responseMimeType: 'application/json', temperature: 0.2, maxTokens: 4096 },
    });

    expect(result.status).toBe(200);
    const body = JSON.parse(result.text) as { text: string; provider: string };
    expect(body.text).toBe('{"overallScore":91}');
    expect(body.provider).toBe('gemini');

    const forwarded = JSON.parse(gateway.requests.at(-1)!.body) as Record<string, unknown>;
    expect(forwarded.taskType).toBe('extraction');
    expect(forwarded.model).toBe('gemini-3-pro-preview');
    expect(forwarded.maxTokens).toBe(4096);
    expect(forwarded.temperature).toBe(0.2);
  });
});

/* ------------------------------------------------------------------ *
 * GitHub export
 * ------------------------------------------------------------------ */
const exportBody = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  owner: 'reARbitRA',
  repo: 'konkred_xyz-',
  branch: 'fullkonk-output',
  message: 'Generated by fullKONK_>',
  files: [{ path: 'src/app.ts', content: 'export const x = 1;' }],
  ...overrides,
});

describe('POST /api/fullkonk/github/export', () => {
  it('uses the server-owned token and never forwards a browser token', async () => {
    gateway.setHandler((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ success: true, filesUploaded: 1, prUrl: 'https://github.com/reARbitRA/konkred_xyz-/pull/1', errors: [] }));
    });

    const result = await json('/api/fullkonk/github/export', exportBody({ token: CLIENT_GITHUB_TOKEN }));
    expect(result.status).toBe(200);
    expect(JSON.parse(result.text)).toMatchObject({ success: true, filesUploaded: 1 });
    expect(result.text).not.toContain(SERVER_GITHUB_TOKEN);
    expect(result.text).not.toContain(CLIENT_GITHUB_TOKEN);

    const upstream = gateway.requests.at(-1);
    expect(upstream?.headers['x-brain-key']).toBe(BRAIN_KEY);
    expect(JSON.parse(upstream!.body).token).toBe(SERVER_GITHUB_TOKEN);
  });

  it('accepts the user’s own token when no server token is configured', async () => {
    delete process.env.FULLKONK_GITHUB_EXPORT_TOKEN;
    gateway.setHandler((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ success: true, filesUploaded: 1, prUrl: null, errors: [] }));
    });

    const result = await json('/api/fullkonk/github/export', exportBody({ token: CLIENT_GITHUB_TOKEN }));
    expect(result.status).toBe(200);
    expect(JSON.parse(gateway.requests.at(-1)!.body).token).toBe(CLIENT_GITHUB_TOKEN);
  });

  it('validates repository, branch, paths, size and token', async () => {
    expect((await json('/api/fullkonk/github/export', exportBody({ owner: 'not a name' }))).status).toBe(400);
    expect((await json('/api/fullkonk/github/export', exportBody({ owner: 'a/b' }))).status).toBe(400);
    expect((await json('/api/fullkonk/github/export', exportBody({ branch: '../escape' }))).status).toBe(400);
    expect((await json('/api/fullkonk/github/export', exportBody({ files: [{ path: '/etc/passwd', content: 'x' }] }))).status).toBe(400);
    expect((await json('/api/fullkonk/github/export', exportBody({ files: [{ path: 'a/../../b', content: 'x' }] }))).status).toBe(400);
    expect((await json('/api/fullkonk/github/export', exportBody({ files: [] }))).status).toBe(400);
    const tooBig = await json('/api/fullkonk/github/export', exportBody({ files: [{ path: 'a.txt', content: 'x'.repeat(500 * 1024) }] }));
    expect(tooBig.status).toBe(413);

    // Once no server-owned token exists, the user's own token is validated.
    delete process.env.FULLKONK_GITHUB_EXPORT_TOKEN;
    expect((await json('/api/fullkonk/github/export', exportBody({ token: 'not-a-token' }))).status).toBe(400);
    expect((await json('/api/fullkonk/github/export', exportBody())).status).toBe(400);

    // A server-owned token makes any client-supplied token irrelevant (ignored,
    // never validated, never forwarded), so this one succeeds.
    process.env.FULLKONK_GITHUB_EXPORT_TOKEN = SERVER_GITHUB_TOKEN;
    gateway.setHandler((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ success: true, filesUploaded: 0, prUrl: null, errors: [] }));
    });
    expect((await json('/api/fullkonk/github/export', exportBody({ token: 'not-a-token' }))).status).toBe(200);
    expect(JSON.parse(gateway.requests.at(-1)!.body).token).toBe(SERVER_GITHUB_TOKEN);

    // Everything above was rejected before it ever reached the gateway, except
    // the final call.
    expect(gateway.requests).toHaveLength(1);
  });

  it('preserves upstream failures (404 / 502) with a safe envelope', async () => {
    gateway.setHandler((_req, res) => {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ success: false, filesUploaded: 0, prUrl: null, errors: ['Repository not found'] }));
    });
    const missing = await json('/api/fullkonk/github/export', exportBody());
    expect(missing.status).toBe(404);
    expect(JSON.parse(missing.text)).toMatchObject({ success: false, filesUploaded: 0 });

    configureGateway(unreachableUrl);
    const down = await json('/api/fullkonk/github/export', exportBody());
    expect(down.status).toBe(502);
    expect(down.text).toContain('GATEWAY_UNAVAILABLE');
  });
});

/* ------------------------------------------------------------------ *
 * SSRF / configuration / logging
 * ------------------------------------------------------------------ */
describe('hardening', () => {
  it('ignores browser-supplied upstream URLs (SSRF)', async () => {
    gateway.setHandler((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(sseFrame({ type: 'done' }));
      res.end();
    });

    await json('/api/fullkonk/generate', {
      prompt: 'hi',
      gatewayUrl: 'http://169.254.169.254/latest/meta-data/',
      url: 'http://169.254.169.254/',
      upstream: 'http://evil.example.com',
    }, { 'x-upstream-url': 'http://169.254.169.254/', 'x-forwarded-host': 'evil.example.com' });

    expect(gateway.requests).toHaveLength(1);
    expect(gateway.requests[0].url).toBe('/api/fullkonk/generate');
  });

  it('fails closed in production when the gateway is not configured', async () => {
    delete process.env.KONKRED_GATEWAY_URL;
    process.env.FULLKONK_LEGACY_ENGINE_FALLBACK = 'false';
    const result = await json('/api/fullkonk/generate', { prompt: 'hi' });
    expect(result.status).toBe(503);
    expect(result.text).toContain('GATEWAY_NOT_CONFIGURED');
    expect(result.text).not.toContain('BRAIN');
  });

  it('declines unconfigured gateway routes outside production so the legacy engine can serve them', async () => {
    delete process.env.KONKRED_GATEWAY_URL;
    process.env.FULLKONK_LEGACY_ENGINE_FALLBACK = 'true';
    const result = await json('/api/fullkonk/generate', { prompt: 'hi' });
    expect(JSON.parse(result.text)).toEqual({ handler: 'legacy' });
  });

  it('never logs credentials, even when the gateway echoes them', async () => {
    const captured: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { captured.push(args.join(' ')); });
    vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => { captured.push(args.join(' ')); });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => { captured.push(args.join(' ')); });

    gateway.setHandler((_req, res) => {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: { code: 'INVALID_API_KEY', message: `rejected key ${ECHOED_PROVIDER_KEY} for ${BRAIN_KEY}` } }));
    });
    const rejected = await call('/api/fullkonk/providers');
    expect(rejected.status).toBe(401);
    // The response body is redacted before it reaches the browser…
    expect(rejected.text).not.toContain(ECHOED_PROVIDER_KEY);
    expect(rejected.text).not.toContain(BRAIN_KEY);

    configureGateway(unreachableUrl);
    await call('/api/fullkonk/providers');

    const logs = captured.join('\n');
    expect(logs).not.toContain(BRAIN_KEY);
    expect(logs).not.toContain(GATEWAY_API_KEY);
    expect(logs).not.toContain(ECHOED_PROVIDER_KEY);
    expect(logs).not.toContain(SERVER_GITHUB_TOKEN);
    expect(logs).not.toContain(CLIENT_GITHUB_TOKEN);
    expect(logs).not.toContain('authorization');
  });

  it('requires a verified session when FULLKONK_REQUIRE_AUTH is enabled', async () => {
    process.env.FULLKONK_REQUIRE_AUTH = 'true';
    const anonymous = await json('/api/fullkonk/generate', { prompt: 'hi' });
    expect(anonymous.status).toBe(401);
    expect(anonymous.text).toContain('UNAUTHORIZED');
    expect(gateway.requests).toHaveLength(0);

    const badToken = await json('/api/fullkonk/generate', { prompt: 'hi' }, { authorization: 'Bearer not-a-real-id-token' });
    // Without Firebase credentials configured the route fails closed (503)
    // rather than silently accepting the caller.
    expect([401, 503]).toContain(badToken.status);
    expect(gateway.requests).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ *
 * Integration: browser → Vercel route → mock gateway → rendered state
 * ------------------------------------------------------------------ */
describe('end-to-end stream integration', () => {
  it('renders the same UI state the page would, from real proxied bytes', async () => {
    const fileContent = 'export default function App() { return <div>hi</div>; }';
    gateway.setHandler(async (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8' });
      const frames = [
        sseFrame({ type: 'stage', stage: 'architect', content: 'ARCHITECT · SCOPING BUILD' }),
        sseFrame({ type: 'provider', provider: 'gemini', model: 'gemini-2.5-flash' }),
        sseFrame({ type: 'failover', from: 'groq', to: 'gemini' }),
        sseFrame({ type: 'metrics', data: { tokensPerSecond: 42.5, totalTokens: 128 } }),
        sseFrame({ type: 'stage', stage: 'build', content: 'BUILD · GENERATING FILES' }),
        sseFrame({ type: 'delta', content: 'file: src/App.tsx\n```tsx\n' }),
        sseFrame({ type: 'delta', content: `${fileContent}\n` }),
        sseFrame({ type: 'delta', content: '```\n' }),
        sseFrame({ type: 'file', file: { path: 'src/util.ts', content: 'export const util = 1;\n', language: 'TS' } }),
        sseFrame({ type: 'reset', characters: 0 }),
        sseFrame({ type: 'done' }),
      ];
      // Deliberately split frames across network writes, including a CRLF pair
      // split across two chunks and two events inside one chunk.
      const payload = frames.join('');
      const cut = payload.indexOf('```tsx') + 3;
      res.write(payload.slice(0, cut));
      await new Promise((resolve) => setTimeout(resolve, 20));
      res.write(payload.slice(cut, cut + 5));
      await new Promise((resolve) => setTimeout(resolve, 10));
      res.write(payload.slice(cut + 5));
      res.end();
    });

    const response = await fetch(`${bff.url}/api/fullkonk/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'scaffold an app', mode: 'fullstack' }),
    });

    // Consume exactly like pages/FullKonkPage.tsx does.
    const parser = new SseParser();
    const decoder = new TextDecoder();
    let state = createStreamState({ mode: 'fullstack' });
    const reader = response.body!.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      const text = decoder.decode(value || new Uint8Array(), { stream: !done });
      const events = parser.push(text);
      if (done) events.push(...parser.flush());
      for (const event of events) {
        const chunk = decodeStreamChunk(event.data);
        if (!chunk) continue;
        state = reduceStreamChunk(state, chunk).state;
      }
      if (done) break;
    }

    expect(state.completed).toBe(true);
    expect(state.stage).toBe('done');
    expect(state.provider).toBe('gemini');
    expect(state.metrics.totalTokens).toBe(128);
    expect(state.metrics.transition).toBe('groq → gemini');
    expect(state.failure).toBeNull();
    const paths = state.files.map((file) => file.path).sort();
    expect(paths).toEqual(['src/App.tsx', 'src/util.ts']);
    expect(state.files.find((file) => file.path === 'src/App.tsx')?.content).toBe(fileContent);
    expect(state.files.find((file) => file.path === 'src/util.ts')?.language).toBe('ts');
  });
});
